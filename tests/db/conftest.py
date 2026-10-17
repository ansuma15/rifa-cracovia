"""
Infraestructura de pruebas de la base de datos.

Estrategia:
  1. Se crea UNA base plantilla con el stub de Supabase + todas las migraciones.
  2. Cada prueba recibe una copia limpia (CREATE DATABASE ... TEMPLATE), que
     tarda milisegundos. Así las pruebas son independientes entre sí.
  3. Las llamadas se hacen con los mismos roles que usa Supabase (anon,
     authenticated) y con los mismos GUC que fija PostgREST
     (request.jwt.claims, request.headers). Si una prueba pasa aquí, está
     ejercitando las mismas reglas de permisos y RLS que en producción.

Variable de entorno: DATABASE_URL apuntando a un superusuario, p. ej.
  postgresql://postgres@localhost:5432/postgres
"""

from __future__ import annotations

import json
import os
import uuid
from pathlib import Path

import psycopg
import pytest
from psycopg import sql

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
STUB = Path(__file__).with_name("supabase_stub.sql")

BASE_URL = os.environ.get("DATABASE_URL", "postgresql://postgres@localhost:5432/postgres")
TEMPLATE = "rifa_template"


def _url_for(dbname: str) -> str:
    return psycopg.conninfo.make_conninfo(BASE_URL, dbname=dbname)


def _admin_conn():
    return psycopg.connect(BASE_URL, autocommit=True)


@pytest.fixture(scope="session")
def template_db():
    with _admin_conn() as c:
        c.execute(sql.SQL("drop database if exists {} with (force)").format(sql.Identifier(TEMPLATE)))
        c.execute(sql.SQL("create database {}").format(sql.Identifier(TEMPLATE)))
    with psycopg.connect(_url_for(TEMPLATE), autocommit=True) as c:
        c.execute(STUB.read_text())
        for m in MIGRATIONS:
            c.execute(m.read_text())
    yield TEMPLATE
    with _admin_conn() as c:
        c.execute(sql.SQL("drop database if exists {} with (force)").format(sql.Identifier(TEMPLATE)))


@pytest.fixture
def db(template_db):
    """Nombre de una base nueva, copia exacta de la plantilla."""
    name = f"rifa_t_{uuid.uuid4().hex[:10]}"
    with _admin_conn() as c:
        c.execute(sql.SQL("create database {} template {}").format(sql.Identifier(name), sql.Identifier(template_db)))
    yield name
    with _admin_conn() as c:
        c.execute(sql.SQL("drop database if exists {} with (force)").format(sql.Identifier(name)))


class Client:
    """Una conexión que se comporta como una petición de PostgREST."""

    def __init__(self, dbname: str, role: str, user_id: str | None = None,
                 email: str | None = None, ip: str | None = "203.0.113.10",
                 autocommit: bool = True):
        self.conn = psycopg.connect(_url_for(dbname), autocommit=autocommit)
        claims = {"role": role}
        if user_id:
            claims["sub"] = user_id
        if email:
            claims["email"] = email
        headers = {"x-forwarded-for": ip} if ip else {}
        with self.conn.cursor() as cur:
            cur.execute("select set_config('request.jwt.claims', %s, false)", (json.dumps(claims),))
            cur.execute("select set_config('request.headers', %s, false)", (json.dumps(headers),))
            cur.execute(sql.SQL("set role {}").format(sql.Identifier(role)))
        if not autocommit:
            self.conn.commit()

    def one(self, query: str, params=None):
        with self.conn.cursor() as cur:
            cur.execute(query, params)
            row = cur.fetchone()
            return row[0] if row and len(row) == 1 else row

    def all(self, query: str, params=None):
        with self.conn.cursor() as cur:
            cur.execute(query, params)
            return cur.fetchall()

    def claim(self, number: str, name: str, code: str, email: str | None = None,
              phone: str | None = None) -> dict:
        if email is None and phone is None:
            # Llamada con 3 argumentos: así lo hace una versión anterior del sitio.
            return self.one("select public.claim_number(%s, %s, %s)", (number, name, code))
        return self.one("select public.claim_number(%s, %s, %s, %s, %s)", (number, name, code, email, phone))

    def close(self):
        self.conn.close()


@pytest.fixture
def superuser(db):
    c = psycopg.connect(_url_for(db), autocommit=True)
    yield c
    c.close()


@pytest.fixture
def make_client(db):
    clients: list[Client] = []

    def factory(role: str = "anon", **kw) -> Client:
        cl = Client(db, role, **kw)
        clients.append(cl)
        return cl

    yield factory
    for cl in clients:
        try:
            cl.close()
        except Exception:
            pass


@pytest.fixture
def admin(superuser, make_client):
    uid = str(uuid.uuid4())
    superuser.execute("insert into auth.users (id, email) values (%s, %s)", (uid, "job@example.com"))
    superuser.execute("insert into private.admin_users (user_id) values (%s)", (uid,))
    return make_client("authenticated", user_id=uid, email="job@example.com")


@pytest.fixture
def public(make_client):
    return make_client("anon")


def gen_code(admin: Client, number: str) -> str:
    rows = admin.all("select number_id, code from public.admin_generate_codes(%s)", ([number],))
    assert len(rows) == 1 and rows[0][0] == number
    return rows[0][1]


def check_invariants(superuser) -> None:
    """Propiedades que deben cumplirse SIEMPRE, pase lo que pase."""
    rows = superuser.execute("""
        select rn.id, rn.status, rn.public_name, p.status, pa.first_name
          from public.raffle_numbers rn
          left join private.participations p on p.number_id = rn.id and p.status in ('reserved','paid')
          left join private.participants pa on pa.id = p.participant_id
    """).fetchall()
    assert len(rows) == 100
    for num, st, pub_name, p_status, p_name in rows:
        assert st == (p_status or "available"), f"tablero desincronizado en {num}"
        assert pub_name == p_name, f"nombre público desincronizado en {num}"

    # Todo código consumido tiene exactamente una participación y viceversa.
    bad = superuser.execute("""
        select c.id from private.authorization_codes c
          left join private.participations p on p.code_id = c.id
         where (c.status = 'consumed') <> (p.id is not null)
    """).fetchall()
    assert bad == [], "códigos consumidos sin participación o participaciones sin código consumido"

    # Una participación siempre usa un código de SU número.
    bad = superuser.execute("""
        select p.id from private.participations p
          join private.authorization_codes c on c.id = p.code_id
         where c.number_id <> p.number_id
    """).fetchall()
    assert bad == []
