"""
Pruebas de los casos críticos de la sección 13 que dependen de la base de datos.
Cada prueba termina verificando las invariantes globales (check_invariants).
"""

from __future__ import annotations

import threading
import uuid

import psycopg
import pytest

from conftest import check_invariants, gen_code


# ---------------------------------------------------------------------------
# Tablero
# ---------------------------------------------------------------------------

def test_exactly_100_two_digit_numbers(public, superuser):
    ids = [r[0] for r in public.all("select id from public.raffle_numbers order by id")]
    assert ids == [f"{i:02d}" for i in range(100)]
    assert ids[0] == "00" and ids[7] == "07"
    assert all(isinstance(i, str) and len(i) == 2 for i in ids)
    with pytest.raises(psycopg.Error):
        superuser.execute("insert into public.raffle_numbers (id) values ('100')")
    with pytest.raises(psycopg.Error):
        superuser.execute("delete from public.raffle_numbers where id = '00'")


def test_public_sees_only_public_columns(public):
    cols = [r[0] for r in public.all("""
        select column_name from information_schema.columns
         where table_schema = 'public' and table_name = 'raffle_numbers' order by ordinal_position""")]
    assert cols == ["id", "status", "public_name", "updated_at"]


@pytest.mark.parametrize("query", [
    "select * from private.authorization_codes",
    "select * from private.participants",
    "select * from private.participations",
    "select * from private.admin_audit_log",
    "select * from private.settings",
])
@pytest.mark.parametrize("role", ["anon", "authenticated"])
def test_private_schema_is_unreachable(make_client, role, query):
    cl = make_client(role, user_id=str(uuid.uuid4()) if role == "authenticated" else None)
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        cl.one(query)


@pytest.mark.parametrize("stmt", [
    "update public.raffle_numbers set status = 'paid', public_name = 'X' where id = '01'",
    "insert into public.raffle_numbers (id) values ('5a')",
    "delete from public.raffle_numbers where id = '01'",
])
def test_public_cannot_write_board(public, stmt):
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        public.one(stmt)


# ---------------------------------------------------------------------------
# Registro con códigos
# ---------------------------------------------------------------------------

def test_valid_code_reserves_number_once(admin, public, superuser):
    code = gen_code(admin, "25")
    assert len(code) == 14 and code[4] == "-" and code[9] == "-"

    r = public.claim("25", "  Ana   María ", code)
    assert r["ok"] is True and r["status"] == "reserved" and r["number"] == "25"
    assert r["first_name"] == "Ana María"
    assert r["expires_at"] is None  # por defecto las reservas no expiran

    board = public.one("select row_to_json(r) from public.raffle_numbers r where id = '25'")
    assert board["status"] == "reserved" and board["public_name"] == "Ana María"

    # Reutilizar el mismo código: el número ya no está disponible.
    assert public.claim("25", "Pedro", code) == {"ok": False, "error": "number_unavailable"}
    check_invariants(superuser)


def test_code_input_is_normalized(admin, public, superuser):
    code = gen_code(admin, "03")
    messy = code.lower().replace("-", " ").replace("0", "o").replace("1", "l")
    assert public.claim("03", "Luis", messy)["ok"] is True
    check_invariants(superuser)


def test_code_for_25_cannot_claim_26(admin, public, superuser):
    code25 = gen_code(admin, "25")
    gen_code(admin, "26")
    assert public.claim("26", "Ana", code25) == {"ok": False, "error": "invalid_code"}
    # El intento fallido no consumió nada.
    assert public.claim("25", "Ana", code25)["ok"] is True
    check_invariants(superuser)


def test_wrong_and_missing_codes_give_same_generic_error(admin, public, superuser):
    gen_code(admin, "10")
    assert public.claim("10", "Ana", "ABCD-EFGH-JKMN") == {"ok": False, "error": "invalid_code"}
    # Número sin código vigente: mismo mensaje, sin revelar nada más.
    assert public.claim("11", "Ana", "ABCD-EFGH-JKMN") == {"ok": False, "error": "invalid_code"}
    status = superuser.execute(
        "select status from private.authorization_codes where number_id = '10'").fetchone()[0]
    assert status == "issued"
    check_invariants(superuser)


@pytest.mark.parametrize("number,name,code", [
    ("5", "Ana", "ABCD-EFGH-JKMN"),            # un dígito
    ("100", "Ana", "ABCD-EFGH-JKMN"),
    ("25", "", "ABCD-EFGH-JKMN"),               # nombre vacío
    ("25", "Ana123", "ABCD-EFGH-JKMN"),         # dígitos en el nombre
    ("25", "https://spam.example", "ABCD-EFGH-JKMN"),
    ("25", "A" * 41, "ABCD-EFGH-JKMN"),          # demasiado largo
    ("25", "Ana", "ABC"),                       # código corto
    (None, "Ana", "ABCD-EFGH-JKMN"),
])
def test_invalid_input_rejected(public, number, name, code):
    assert public.claim(number, name, code) == {"ok": False, "error": "invalid_input"}


@pytest.mark.parametrize("name", ["José", "María José", "O'Connor", "Zoë", "Ñoño", "J. Carlos", "Ana-Sofía"])
def test_accented_names_accepted(admin, public, name):
    code = gen_code(admin, "40")
    assert public.claim("40", name, code)["ok"] is True


def test_concurrent_claims_are_serialized_deterministically(admin, make_client, superuser):
    """A bloquea el número dentro de una transacción abierta; B debe esperar
    y, cuando A confirma, B recibe number_unavailable."""
    code = gen_code(admin, "42")
    a = make_client("anon", autocommit=False, ip="198.51.100.1")
    b = make_client("anon", autocommit=True, ip="198.51.100.2")

    assert a.claim("42", "Ana", code)["ok"] is True  # transacción aún abierta

    result = {}
    t = threading.Thread(target=lambda: result.setdefault("b", b.claim("42", "Beto", code)))
    t.start()
    t.join(timeout=1.0)
    assert t.is_alive(), "B debería estar bloqueado esperando el lock del número"

    a.conn.commit()
    t.join(timeout=5)
    assert result["b"] == {"ok": False, "error": "number_unavailable"}
    check_invariants(superuser)


def test_concurrent_claims_race(admin, make_client, superuser):
    """20 hilos intentan el mismo número a la vez: exactamente uno gana."""
    code = gen_code(admin, "77")
    clients = [make_client("anon", ip=f"192.0.2.{i}") for i in range(20)]
    barrier = threading.Barrier(len(clients))
    results = []
    lock = threading.Lock()

    def worker(cl, i):
        barrier.wait()
        r = cl.claim("77", f"Persona {chr(65 + i)}", code)
        with lock:
            results.append(r)

    threads = [threading.Thread(target=worker, args=(c, i)) for i, c in enumerate(clients)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sum(1 for r in results if r["ok"]) == 1
    assert all(r == {"ok": False, "error": "number_unavailable"} for r in results if not r["ok"])
    n = superuser.execute("select count(*) from private.participations where number_id = '77'").fetchone()[0]
    assert n == 1
    check_invariants(superuser)


def test_rate_limit_after_repeated_wrong_codes(admin, make_client):
    gen_code(admin, "50")
    attacker = make_client("anon", ip="203.0.113.99")
    for _ in range(8):
        assert attacker.claim("50", "X", "AAAA-AAAA-AAAA")["error"] == "invalid_code"
    assert attacker.claim("50", "X", "AAAA-AAAA-AAAA")["error"] == "rate_limited"
    # Otro cliente no queda afectado.
    other = make_client("anon", ip="203.0.113.100")
    assert other.claim("50", "X", "AAAA-AAAA-AAAA")["error"] == "invalid_code"


def test_registrations_closed(admin, public):
    code = gen_code(admin, "12")
    admin.one("select public.admin_update_settings('{\"registrations_open\": false}')")
    assert public.claim("12", "Ana", code) == {"ok": False, "error": "raffle_closed"}


# ---------------------------------------------------------------------------
# Pagos, cancelación y liberación
# ---------------------------------------------------------------------------

def test_reservation_is_not_payment(admin, public, superuser):
    admin.one("select public.admin_update_settings('{\"price_per_number\": 500}')")
    public.claim("30", "Ana", gen_code(admin, "30"))
    stats = admin.one("select public.admin_get_stats()")
    assert stats["reserved"] == 1 and stats["paid"] == 0
    assert float(stats["confirmed_revenue"]) == 0

    admin.one("select public.admin_mark_paid('30', null, 'Transferencia')")
    stats = admin.one("select public.admin_get_stats()")
    assert stats["reserved"] == 0 and stats["paid"] == 1
    assert float(stats["confirmed_revenue"]) == 500
    assert public.one("select status from public.raffle_numbers where id = '30'") == "paid"
    check_invariants(superuser)


def test_initial_config_is_700_mxn_without_expiry(public):
    cfg = public.one("select public.get_public_config()")
    assert float(cfg["price_per_number"]) == 700 and cfg["currency"] == "MXN"
    assert cfg["reservation_hours"] is None


def test_mark_paid_defaults_to_configured_price(admin, public):
    public.claim("32", "Ana", gen_code(admin, "32"))
    admin.one("select public.admin_mark_paid('32')")
    assert float(admin.one("select public.admin_get_stats()")["confirmed_revenue"]) == 700


def test_mark_paid_requires_amount_when_no_price(admin, public):
    admin.one("select public.admin_update_settings('{\"price_per_number\": null}')")
    public.claim("31", "Ana", gen_code(admin, "31"))
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        admin.one("select public.admin_mark_paid('31')")
    admin.one("select public.admin_mark_paid('31', 450)")


def test_release_never_reactivates_consumed_code(admin, public, superuser):
    code = gen_code(admin, "60")
    assert public.claim("60", "Ana", code)["ok"] is True
    admin.one("select public.admin_cancel_participation('60', 'No pagó')")

    assert public.one("select status from public.raffle_numbers where id = '60'") == "available"
    assert public.claim("60", "Ana", code) == {"ok": False, "error": "invalid_code"}
    st = superuser.execute(
        "select status from private.authorization_codes where number_id = '60'").fetchone()[0]
    assert st == "consumed"

    # Ni siquiera un superusuario puede "revivir" el código.
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        superuser.execute("update private.authorization_codes set status = 'issued', consumed_at = null "
                          "where number_id = '60'")

    # Reasignar exige un código nuevo.
    new_code = gen_code(admin, "60")
    assert new_code != code
    assert public.claim("60", "Beto", new_code)["ok"] is True
    check_invariants(superuser)


def test_cancel_paid_participation_and_revenue(admin, public, superuser):
    public.claim("61", "Ana", gen_code(admin, "61"))
    admin.one("select public.admin_mark_paid('61', 500)")
    admin.one("select public.admin_cancel_participation('61', 'Devolución acordada')")
    stats = admin.one("select public.admin_get_stats()")
    assert stats["paid"] == 0 and float(stats["confirmed_revenue"]) == 0
    check_invariants(superuser)


def test_cancel_requires_reason(admin, public):
    public.claim("62", "Ana", gen_code(admin, "62"))
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        admin.one("select public.admin_cancel_participation('62', '  ')")


def test_history_is_immutable(admin, public, superuser):
    public.claim("63", "Ana", gen_code(admin, "63"))
    admin.one("select public.admin_cancel_participation('63', 'x')")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        superuser.execute("update private.participations set status = 'reserved', ended_at = null "
                          "where number_id = '63'")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        superuser.execute("delete from private.participations where number_id = '63'")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        superuser.execute("delete from private.admin_audit_log")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        superuser.execute("truncate private.admin_audit_log")


def test_confirmed_payment_cannot_be_rewritten(admin, public, superuser):
    public.claim("64", "Ana", gen_code(admin, "64"))
    admin.one("select public.admin_mark_paid('64', 500)")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        superuser.execute("update private.participations set amount_paid = 1 where number_id = '64'")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        superuser.execute("update private.participations set status = 'reserved', paid_at = null, "
                          "amount_paid = null where number_id = '64'")


# ---------------------------------------------------------------------------
# Expiración de reservas
# ---------------------------------------------------------------------------

def _force_expire(superuser, number):
    superuser.execute("update private.participations set expires_at = now() - interval '1 minute' "
                      "where number_id = %s and status = 'reserved'", (number,))


def test_scheduled_expiry_releases_without_reactivating(admin, public, superuser):
    code = gen_code(admin, "70")
    public.claim("70", "Ana", code)
    _force_expire(superuser, "70")
    assert superuser.execute("select private.expire_reservations()").fetchone()[0] == 1
    assert public.one("select status from public.raffle_numbers where id = '70'") == "available"
    assert public.claim("70", "Ana", code) == {"ok": False, "error": "invalid_code"}
    actions = [r[0] for r in admin.all("select action from public.admin_list_audit(10)")]
    assert "reservation_expired" in actions
    check_invariants(superuser)


def test_lazy_expiry_inside_claim(admin, public, superuser):
    public.claim("71", "Ana", gen_code(admin, "71"))
    _force_expire(superuser, "71")
    # El job no ha corrido; aún así no se puede generar código (número reservado)...
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        gen_code(admin, "71")
    # ...pero un registro sobre él dispara la expiración perezosa.
    assert public.claim("71", "Beto", "AAAA-AAAA-AAAA") == {"ok": False, "error": "invalid_code"}
    assert public.one("select status from public.raffle_numbers where id = '71'") == "available"
    assert public.claim("71", "Beto", gen_code(admin, "71"))["ok"] is True
    check_invariants(superuser)


def test_default_reservations_never_expire(admin, public, superuser):
    public.claim("73", "Ana", gen_code(admin, "73"))
    assert superuser.execute("select private.expire_reservations()").fetchone()[0] == 0
    assert public.one("select status from public.raffle_numbers where id = '73'") == "reserved"
    assert public.one("select public.get_public_config()")["reservation_hours"] is None


def test_optional_ttl_sets_expiry(admin, public):
    admin.one("select public.admin_update_settings('{\"reservation_hours\": 24}')")
    r = public.claim("74", "Ana", gen_code(admin, "74"))
    assert r["ok"] is True and r["expires_at"] is not None


def test_paid_never_expires(admin, public, superuser):
    public.claim("72", "Ana", gen_code(admin, "72"))
    admin.one("select public.admin_mark_paid('72', 500)")
    superuser.execute("select private.expire_reservations()")
    assert public.one("select status from public.raffle_numbers where id = '72'") == "paid"


# ---------------------------------------------------------------------------
# Panel de administración
# ---------------------------------------------------------------------------

ADMIN_CALLS = [
    "select public.admin_generate_codes(array['01'])",
    "select public.admin_list_codes()",
    "select public.admin_list_numbers()",
    "select public.admin_get_stats()",
    "select public.admin_list_audit()",
    "select public.admin_mark_paid('01', 1)",
    "select public.admin_cancel_participation('01', 'x')",
    "select public.admin_update_settings('{}')",
]


def test_function_grants_are_minimal(superuser):
    """Capa de permisos, independiente del chequeo is_admin interno.
    También detecta funciones nuevas que olviden revocar el EXECUTE por defecto."""
    rows = superuser.execute("""
        select p.oid::regprocedure::text,
               has_function_privilege('anon', p.oid, 'execute'),
               has_function_privilege('authenticated', p.oid, 'execute')
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public', 'private')""").fetchall()
    anon_ok = {r[0] for r in rows if r[1]}
    auth_ok = {r[0] for r in rows if r[2]}
    assert anon_ok == {"get_public_config()", "claim_number(text,text,text)"}
    assert all(f.startswith(("admin_", "is_admin", "get_public_config", "claim_number")) for f in auth_ok)
    assert not any(f.startswith("private.") for f in auth_ok)


@pytest.mark.parametrize("call", ADMIN_CALLS)
def test_anon_cannot_execute_admin_functions(public, call):
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        public.one(call)


@pytest.mark.parametrize("call", ADMIN_CALLS)
def test_logged_in_non_admin_is_forbidden(make_client, superuser, call):
    uid = str(uuid.uuid4())
    superuser.execute("insert into auth.users (id, email) values (%s, 'intruso@example.com')", (uid,))
    intruder = make_client("authenticated", user_id=uid, email="intruso@example.com")
    assert intruder.one("select public.is_admin()") is False
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        intruder.one(call)


def test_admin_code_lifecycle_and_no_secret_leak(admin, public, superuser):
    rows = admin.all("select number_id, code, code_id from public.admin_generate_codes(array['01','02','03'])")
    assert [r[0] for r in rows] == ["01", "02", "03"]
    codes = {r[0]: (r[1], r[2]) for r in rows}
    assert len({c for c, _ in codes.values()}) == 3

    # Nada persistido contiene el código en claro.
    dump = superuser.execute("""
        select string_agg(t::text, '|') from (
          select row_to_json(c)::text as t from private.authorization_codes c
          union all select row_to_json(l)::text from private.admin_audit_log l) x""").fetchone()[0]
    for plain, _ in codes.values():
        assert plain not in dump and plain.replace("-", "") not in dump

    # El listado no expone hashes.
    cols = [d.name for d in admin.conn.execute("select * from public.admin_list_codes()").description]
    assert "code_hash" not in cols and "code" not in cols

    # No se puede tener dos códigos vigentes para el mismo número.
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        admin.all("select * from public.admin_generate_codes(array['01'])")

    admin.one("select public.admin_mark_code_delivered(%s, 'Entregado en persona')", (codes["01"][1],))
    admin.one("select public.admin_revoke_code(%s, 'Se perdió')", (codes["02"][1],))
    assert public.claim("02", "Ana", codes["02"][0]) == {"ok": False, "error": "invalid_code"}

    # Revocado no se puede revocar de nuevo ni "entregar".
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        admin.one("select public.admin_revoke_code(%s)", (codes["02"][1],))

    # Tras revocar, se puede emitir uno nuevo para el 02.
    gen_code(admin, "02")

    # Consumido no se puede revocar.
    public.claim("03", "Ana", codes["03"][0])
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        admin.one("select public.admin_revoke_code(%s)", (codes["03"][1],))

    stats = admin.one("select public.admin_get_stats()")
    assert stats["codes_issued"] == 2 and stats["codes_undelivered"] == 1
    check_invariants(superuser)


def test_generate_batch_is_atomic(admin, public, superuser):
    public.claim("05", "Ana", gen_code(admin, "05"))
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        admin.all("select * from public.admin_generate_codes(array['04','05','06'])")
    n = superuser.execute("select count(*) from private.authorization_codes "
                          "where number_id in ('04','06')").fetchone()[0]
    assert n == 0


def test_generate_all_available(admin, public):
    public.claim("00", "Ana", gen_code(admin, "00"))
    rows = admin.all("select number_id from public.admin_generate_codes(null)")
    assert len(rows) == 99 and "00" not in [r[0] for r in rows]


def test_admin_renames_participant_and_board_updates(admin, public, superuser):
    public.claim("80", "Anna", gen_code(admin, "80"))
    admin.one("select public.admin_update_participant('80', 'Ana', '55 1234 5678', 'Prima')")
    assert public.one("select public_name from public.raffle_numbers where id = '80'") == "Ana"
    row = [r for r in admin.all("select number_id, first_name, contact from public.admin_list_numbers()")
           if r[0] == "80"][0]
    assert row == ("80", "Ana", "55 1234 5678")
    # El contacto jamás llega al tablero público.
    board = public.one("select row_to_json(r)::text from public.raffle_numbers r where id = '80'")
    assert "1234" not in board
    check_invariants(superuser)


def test_audit_log_records_actor(admin, public):
    public.claim("90", "Ana", gen_code(admin, "90"))
    admin.one("select public.admin_mark_paid('90', 500)")
    log = admin.all("select actor_label, action, number_id from public.admin_list_audit(10)")
    assert ("job@example.com", "payment_confirmed", "90") in log
    assert ("public", "number_claimed", "90") in log
    assert ("job@example.com", "code_generated", "90") in log


def test_public_config(public, admin):
    admin.one("select public.admin_update_settings('{\"price_per_number\": 500, \"reservation_hours\": 24}')")
    cfg = public.one("select public.get_public_config()")
    assert cfg["registrations_open"] is True
    assert float(cfg["price_per_number"]) == 500 and float(cfg["reservation_hours"]) == 24
    admin.one("select public.admin_update_settings('{\"reservation_hours\": null}')")
    assert public.one("select public.get_public_config()")["reservation_hours"] is None


def test_realtime_publication_includes_board(superuser):
    rows = superuser.execute("select schemaname, tablename from pg_publication_tables "
                             "where pubname = 'supabase_realtime'").fetchall()
    assert rows == [("public", "raffle_numbers")]
