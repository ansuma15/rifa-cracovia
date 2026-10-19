"""
Pruebas de la base de datos. Cada prueba recibe una base nueva con TODAS las
migraciones aplicadas y, cuando modifica datos, termina verificando las
invariantes globales (check_invariants).

Desde la migración 8 el registro no pide código: pide nombre y teléfono, y lo
protegen el límite por teléfono y el límite por conexión.
"""

from __future__ import annotations

import threading
import uuid

import psycopg
import pytest

from conftest import MIGRATIONS, Client, _url_for, build_db, check_invariants, drop_db


def row_for(admin: Client, number: str) -> dict:
    cur = admin.conn.execute("select * from public.admin_list_numbers() where number_id = %s", (number,))
    cols = [d.name for d in cur.description]
    return dict(zip(cols, cur.fetchone()))


# ---------------------------------------------------------------------------
# Tablero
# ---------------------------------------------------------------------------

def test_exactly_100_two_digit_numbers(public, superuser):
    ids = [r[0] for r in public.all("select id from public.raffle_numbers order by id")]
    assert ids == [f"{i:02d}" for i in range(100)]
    assert ids[0] == "00" and ids[7] == "07"
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
# Registro sin código
# ---------------------------------------------------------------------------

def test_anyone_can_reserve_with_name_and_phone(public, superuser):
    r = public.claim("25", "  Ana   María ", "55 1234 5678")
    assert r["ok"] is True and r["status"] == "reserved" and r["number"] == "25"
    assert r["first_name"] == "Ana María"
    assert r["expires_at"] is not None  # la reserva dura 72 horas

    board = public.one("select row_to_json(r) from public.raffle_numbers r where id = '25'")
    assert board["status"] == "reserved" and board["public_name"] == "Ana María"

    # El mismo número ya no está disponible para nadie más.
    assert public.claim("25", "Pedro") == {"ok": False, "error": "number_unavailable"}
    check_invariants(superuser)


@pytest.mark.parametrize("phone", [None, "", "   "])
def test_phone_is_required(public, superuser, phone):
    assert public.claim("26", "Ana", phone) == {"ok": False, "error": "phone_required"}
    assert public.one("select status from public.raffle_numbers where id = '26'") == "available"


@pytest.mark.parametrize("number,name", [
    ("5", "Ana"),                     # un dígito
    ("100", "Ana"),
    ("25", ""),                       # nombre vacío
    ("25", "Ana123"),                 # dígitos en el nombre
    ("25", "https://spam.example"),
    ("25", "A" * 41),                 # demasiado largo
    (None, "Ana"),
])
def test_invalid_input_rejected(public, number, name):
    assert public.claim(number, name) == {"ok": False, "error": "invalid_input"}


@pytest.mark.parametrize("name", ["José", "María José", "O'Connor", "Zoë", "Ñoño", "J. Carlos", "Ana-Sofía"])
def test_accented_names_accepted(public, name):
    assert public.claim("40", name)["ok"] is True


@pytest.mark.parametrize("email,phone", [
    ("sin-arroba", "5512345678"),
    ("a@b", "5512345678"),
    ("a" * 120 + "@mail.com", "5512345678"),
    (None, "123"),             # muy corto
    (None, "55-1234-ABCD"),    # letras
    (None, "1" * 16),          # demasiado largo
])
def test_invalid_contact_rejected(public, superuser, email, phone):
    assert public.claim("86", "Ana", phone, email) == {"ok": False, "error": "invalid_contact"}
    assert public.one("select status from public.raffle_numbers where id = '86'") == "available"


def test_contact_is_private(admin, public, superuser):
    assert public.claim("81", "Ana", "5511112222")["ok"] is True  # sin correo
    assert public.claim("82", "Beto", "+52 (55) 1234-5678", "  Beto@Mail.COM ")["ok"] is True
    rows = {x[0]: x[1:] for x in admin.all("select number_id, email, phone from public.admin_list_numbers()")}
    assert rows["81"] == (None, "5511112222")
    assert rows["82"] == ("beto@mail.com", "+525512345678")
    # Nada de esto es visible para el público ni queda en el historial.
    board = public.one("select json_agg(r)::text from public.raffle_numbers r")
    assert "beto@mail.com" not in board and "1234" not in board and "1111" not in board
    log = superuser.execute("select string_agg(details::text, '|') from private.admin_audit_log").fetchone()[0]
    assert "beto@mail.com" not in log and "1234" not in log and "1111" not in log
    check_invariants(superuser)


def test_old_site_sending_a_code_still_works(public, superuser):
    """Durante el despliegue, una versión anterior del sitio aún envía p_code:
    se ignora y el registro funciona igual."""
    r = public.one("select public.claim_number(p_number => '20', p_first_name => 'Ana', "
                   "p_code => 'ABCD-EFGH-JKMN', p_email => null, p_phone => '5512345678')")
    assert r["ok"] is True
    check_invariants(superuser)


def test_concurrent_claims_are_serialized_deterministically(make_client, superuser):
    """A bloquea el número dentro de una transacción abierta; B debe esperar
    y, cuando A confirma, B recibe number_unavailable."""
    a = make_client("anon", autocommit=False, ip="198.51.100.1")
    b = make_client("anon", autocommit=True, ip="198.51.100.2")

    assert a.claim("42", "Ana", "5500000001")["ok"] is True  # transacción aún abierta

    result = {}
    t = threading.Thread(target=lambda: result.setdefault("b", b.claim("42", "Beto", "5500000002")))
    t.start()
    t.join(timeout=1.0)
    assert t.is_alive(), "B debería estar bloqueado esperando el lock del número"

    a.conn.commit()
    t.join(timeout=5)
    assert result["b"] == {"ok": False, "error": "number_unavailable"}
    check_invariants(superuser)


def test_concurrent_claims_race(make_client, superuser):
    """20 personas intentan el mismo número a la vez: exactamente una gana."""
    clients = [make_client("anon", ip=f"192.0.2.{i}") for i in range(20)]
    barrier = threading.Barrier(len(clients))
    results = []
    lock = threading.Lock()

    def worker(cl, i):
        barrier.wait()
        r = cl.claim("77", f"Persona {chr(65 + i)}", f"55000001{i:02d}")
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


def test_registrations_closed(admin, public):
    admin.one("select public.admin_update_settings('{\"registrations_open\": false}')")
    assert public.claim("12", "Ana") == {"ok": False, "error": "raffle_closed"}


# ---------------------------------------------------------------------------
# Límite por teléfono
# ---------------------------------------------------------------------------

def test_phone_limit_is_5_unpaid_numbers(make_client, superuser):
    # Cada número desde una conexión distinta: aquí solo se prueba el límite por teléfono.
    for i, n in enumerate(["01", "02", "03", "04", "05"]):
        assert make_client("anon", ip=f"198.51.100.{i}").claim(n, "Ana", "5512345678")["ok"] is True
    # El mismo teléfono escrito de otras formas sigue siendo la misma persona.
    for i, same in enumerate(["+52 55 1234 5678", "5215512345678", "(55) 1234-5678"]):
        r = make_client("anon", ip=f"198.51.101.{i}").claim("06", "Ana", same)
        assert r == {"ok": False, "error": "phone_limit", "limit": 5}
    # Otro teléfono no queda afectado.
    assert make_client("anon", ip="198.51.102.1").claim("06", "Luis", "5587654321")["ok"] is True
    check_invariants(superuser)


def test_paid_cancelled_and_expired_free_a_slot(admin, make_client, superuser):
    phone = "5599990000"
    ip = iter(f"203.0.113.{i}" for i in range(50, 90))
    for n in ["10", "11", "12", "13", "14"]:
        assert make_client("anon", ip=next(ip)).claim(n, "Eva", phone)["ok"] is True
    assert make_client("anon", ip=next(ip)).claim("15", "Eva", phone)["error"] == "phone_limit"

    admin.one("select public.admin_mark_paid('10')")             # pagado: ya no cuenta
    assert make_client("anon", ip=next(ip)).claim("15", "Eva", phone)["ok"] is True

    admin.one("select public.admin_cancel_participation('11', 'Se arrepintió')")
    assert make_client("anon", ip=next(ip)).claim("16", "Eva", phone)["ok"] is True

    superuser.execute("update private.participations set expires_at = now() - interval '1 minute' "
                      "where number_id = '12' and status = 'reserved'")
    # Aunque el job aún no lo libere, una reserva vencida ya no cuenta.
    assert make_client("anon", ip=next(ip)).claim("17", "Eva", phone)["ok"] is True
    assert make_client("anon", ip=next(ip)).claim("18", "Eva", phone)["error"] == "phone_limit"
    check_invariants(superuser)


def test_phone_limit_is_configurable(admin, make_client, public):
    cfg = admin.one("select public.admin_update_settings('{\"max_active_per_phone\": 2}')")
    assert cfg["max_per_phone"] == 2
    assert public.one("select public.get_public_config()")["max_per_phone"] == 2
    ip = iter(f"203.0.113.{i}" for i in range(100, 140))
    for n in ["20", "21"]:
        assert make_client("anon", ip=next(ip)).claim(n, "Ana", "5512340000")["ok"] is True
    assert make_client("anon", ip=next(ip)).claim("22", "Ana", "5512340000") == \
        {"ok": False, "error": "phone_limit", "limit": 2}

    admin.one("select public.admin_update_settings('{\"max_active_per_phone\": 7}')")
    assert make_client("anon", ip=next(ip)).claim("22", "Ana", "5512340000")["ok"] is True

    for bad in ("0", "101"):
        with pytest.raises(psycopg.errors.CheckViolation):
            admin.one("select public.admin_update_settings(%s)", (f'{{"max_active_per_phone": {bad}}}',))


def test_phone_limit_holds_under_concurrency(make_client, superuser):
    """10 solicitudes simultáneas del mismo teléfono a números distintos:
    exactamente 5 entran, aunque lleguen al mismo tiempo."""
    clients = [make_client("anon", ip=f"192.0.2.{100 + i}") for i in range(10)]
    barrier = threading.Barrier(len(clients))
    results, lock = [], threading.Lock()

    def worker(cl, i):
        barrier.wait()
        r = cl.claim(f"{30 + i}", "Ana", "5544443333")
        with lock:
            results.append(r)

    threads = [threading.Thread(target=worker, args=(c, i)) for i, c in enumerate(clients)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sum(1 for r in results if r["ok"]) == 5
    assert all(r["error"] == "phone_limit" for r in results if not r["ok"])
    check_invariants(superuser)


# ---------------------------------------------------------------------------
# Límite por conexión
# ---------------------------------------------------------------------------

def test_rate_limit_8_reservations_per_hour_per_connection(make_client, superuser):
    me = make_client("anon", ip="203.0.113.7")
    for i in range(8):
        assert me.claim(f"{50 + i}", "Ana")["ok"] is True  # teléfonos distintos
    assert me.claim("58", "Ana") == {"ok": False, "error": "rate_limited"}
    # Otra conexión no queda afectada.
    assert make_client("anon", ip="203.0.113.8").claim("58", "Luis")["ok"] is True
    check_invariants(superuser)


def test_rate_limit_stops_bursts(public, make_client):
    public.claim("60", "Ana")
    bot = make_client("anon", ip="203.0.113.66")
    for _ in range(40):
        assert bot.claim("60", "Bot")["error"] == "number_unavailable"
    assert bot.claim("61", "Bot") == {"ok": False, "error": "rate_limited"}


# ---------------------------------------------------------------------------
# Pagos, cancelación y liberación
# ---------------------------------------------------------------------------

def test_reservation_is_not_payment(admin, public, superuser):
    admin.one("select public.admin_update_settings('{\"price_per_number\": 500}')")
    public.claim("30", "Ana")
    stats = admin.one("select public.admin_get_stats()")
    assert stats["reserved"] == 1 and stats["paid"] == 0 and stats["unverified"] == 1
    assert float(stats["confirmed_revenue"]) == 0

    admin.one("select public.admin_mark_paid('30', null, 'Transferencia')")
    stats = admin.one("select public.admin_get_stats()")
    assert stats["reserved"] == 0 and stats["paid"] == 1
    assert float(stats["confirmed_revenue"]) == 500
    assert public.one("select status from public.raffle_numbers where id = '30'") == "paid"
    # Confirmar el pago también lo marca como verificado.
    assert row_for(admin, "30")["verified"] is True
    check_invariants(superuser)


def test_initial_config(public):
    cfg = public.one("select public.get_public_config()")
    assert float(cfg["price_per_number"]) == 700 and cfg["currency"] == "MXN"
    assert float(cfg["reservation_hours"]) == 72
    assert cfg["max_per_phone"] == 5


def test_mark_paid_defaults_to_configured_price(admin, public):
    public.claim("32", "Ana")
    admin.one("select public.admin_mark_paid('32')")
    assert float(admin.one("select public.admin_get_stats()")["confirmed_revenue"]) == 700


def test_mark_paid_requires_amount_when_no_price(admin, public):
    admin.one("select public.admin_update_settings('{\"price_per_number\": null}')")
    public.claim("31", "Ana")
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        admin.one("select public.admin_mark_paid('31')")
    admin.one("select public.admin_mark_paid('31', 450)")


def test_released_number_can_be_reserved_again(admin, public, superuser):
    assert public.claim("60", "Ana")["ok"] is True
    admin.one("select public.admin_cancel_participation('60', 'Reserva falsa')")
    assert public.one("select status from public.raffle_numbers where id = '60'") == "available"
    assert public.claim("60", "Beto")["ok"] is True
    check_invariants(superuser)


def test_cancel_paid_participation_and_revenue(admin, public, superuser):
    public.claim("61", "Ana")
    admin.one("select public.admin_mark_paid('61', 500)")
    admin.one("select public.admin_cancel_participation('61', 'Devolución acordada')")
    stats = admin.one("select public.admin_get_stats()")
    assert stats["paid"] == 0 and float(stats["confirmed_revenue"]) == 0
    check_invariants(superuser)


def test_cancel_requires_reason(admin, public):
    public.claim("62", "Ana")
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        admin.one("select public.admin_cancel_participation('62', '  ')")


def test_history_is_immutable(admin, public, superuser):
    public.claim("63", "Ana")
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
    public.claim("64", "Ana")
    admin.one("select public.admin_mark_paid('64', 500)")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        superuser.execute("update private.participations set amount_paid = 1 where number_id = '64'")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        superuser.execute("update private.participations set status = 'reserved', paid_at = null, "
                          "amount_paid = null where number_id = '64'")


def test_participation_code_cannot_be_attached_later(public, superuser):
    """El guardián detecta cambios de code_id también cuando era nulo."""
    public.claim("65", "Ana")
    code_id = superuser.execute(
        "insert into private.authorization_codes (number_id, code_hash) values ('65', 'x') returning id"
    ).fetchone()[0]
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        superuser.execute("update private.participations set code_id = %s where number_id = '65'", (code_id,))


# ---------------------------------------------------------------------------
# Expiración de reservas
# ---------------------------------------------------------------------------

def _force_expire(superuser, number):
    superuser.execute("update private.participations set expires_at = now() - interval '1 minute' "
                      "where number_id = %s and status = 'reserved'", (number,))


def test_scheduled_expiry_releases_number(admin, public, superuser):
    public.claim("70", "Ana")
    _force_expire(superuser, "70")
    assert superuser.execute("select private.expire_reservations()").fetchone()[0] == 1
    assert public.one("select status from public.raffle_numbers where id = '70'") == "available"
    actions = [r[0] for r in admin.all("select action from public.admin_list_audit(10)")]
    assert "reservation_expired" in actions
    assert public.claim("70", "Beto")["ok"] is True
    check_invariants(superuser)


def test_lazy_expiry_inside_claim(public, superuser):
    public.claim("71", "Ana")
    _force_expire(superuser, "71")
    # El job no ha corrido, pero un registro sobre el número lo libera al instante.
    assert public.claim("71", "Beto")["ok"] is True
    assert public.one("select public_name from public.raffle_numbers where id = '71'") == "Beto"
    check_invariants(superuser)


def test_reservation_lasts_72_hours(public, superuser):
    r = public.claim("73", "Ana")
    hours = superuser.execute(
        "select extract(epoch from (expires_at - reserved_at)) / 3600 from private.participations "
        "where number_id = '73'").fetchone()[0]
    assert round(float(hours)) == 72 and r["expires_at"] is not None
    assert superuser.execute("select private.expire_reservations()").fetchone()[0] == 0
    assert public.one("select status from public.raffle_numbers where id = '73'") == "reserved"
    check_invariants(superuser)


def test_reservations_can_be_set_to_never_expire(admin, public):
    admin.one("select public.admin_update_settings('{\"reservation_hours\": null}')")
    r = public.claim("75", "Ana")
    assert r["expires_at"] is None
    assert public.one("select public.get_public_config()")["reservation_hours"] is None


def test_paid_never_expires(admin, public, superuser):
    public.claim("72", "Ana")
    admin.one("select public.admin_mark_paid('72', 500)")
    superuser.execute("select private.expire_reservations()")
    assert public.one("select status from public.raffle_numbers where id = '72'") == "paid"


# ---------------------------------------------------------------------------
# Extender el plazo (casos especiales)
# ---------------------------------------------------------------------------

def _hours_left(superuser, number) -> float:
    return float(superuser.execute(
        "select extract(epoch from (expires_at - now())) / 3600 from private.participations "
        "where number_id = %s and status = 'reserved'", (number,)).fetchone()[0])


@pytest.mark.parametrize("hours", [24, 48, 72])
def test_extend_by_preset_hours(admin, public, superuser, hours):
    public.claim("40", "Ana")
    admin.one("select public.admin_extend_reservation('40', %s)", (hours,))
    assert round(_hours_left(superuser, "40")) == 72 + hours
    log = admin.all("select action, number_id, details from public.admin_list_audit(5)")
    ext = [d for a, n, d in log if a == "reservation_extended" and n == "40"]
    assert ext and float(ext[0]["hours"]) == hours
    check_invariants(superuser)


def test_extend_until_exact_date(admin, public, superuser):
    public.claim("41", "Ana")
    new = admin.one("select public.admin_extend_reservation('41', null, now() + interval '10 days')")
    assert new is not None
    assert round(_hours_left(superuser, "41")) == 240
    # Una fecha exacta también puede ACORTAR el plazo (p. ej. "paga antes del sorteo").
    admin.one("select public.admin_extend_reservation('41', null, now() + interval '1 day')")
    assert round(_hours_left(superuser, "41")) == 24


def test_extended_reservation_is_not_released(admin, public, superuser):
    public.claim("42", "Ana")
    superuser.execute("update private.participations set expires_at = now() + interval '1 hour' "
                      "where number_id = '42'")
    admin.one("select public.admin_extend_reservation('42', 24)")
    assert superuser.execute("select private.expire_reservations()").fetchone()[0] == 0
    assert public.one("select status from public.raffle_numbers where id = '42'") == "reserved"


def test_extend_rescues_overdue_reservation_before_job(admin, public, superuser):
    public.claim("43", "Ana")
    _force_expire(superuser, "43")
    admin.one("select public.admin_extend_reservation('43', 24)")   # cuenta desde ahora
    assert round(_hours_left(superuser, "43")) == 24
    assert superuser.execute("select private.expire_reservations()").fetchone()[0] == 0


@pytest.mark.parametrize("args", [
    "null, null",                                   # ninguna opción
    "24, now() + interval '2 days'",                # ambas
    "0, null", "-5, null", "1441, null",            # horas fuera de rango
    "null, now() - interval '1 hour'",              # fecha pasada
    "null, now() + interval '400 days'",            # demasiado lejos
])
def test_extend_validation(admin, public, args):
    public.claim("44", "Ana")
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        admin.one(f"select public.admin_extend_reservation('44', {args})")


def test_cannot_extend_paid_or_free_number(admin, public):
    public.claim("45", "Ana")
    admin.one("select public.admin_mark_paid('45')")
    with pytest.raises(psycopg.errors.NoDataFound):
        admin.one("select public.admin_extend_reservation('45', 24)")
    with pytest.raises(psycopg.errors.NoDataFound):
        admin.one("select public.admin_extend_reservation('46', 24)")


# ---------------------------------------------------------------------------
# Verificado y vista del panel
# ---------------------------------------------------------------------------

def test_verified_flag_is_private_and_toggles(admin, public, superuser):
    public.claim("47", "Ana", "5512121212")
    assert row_for(admin, "47")["verified"] is False
    admin.one("select public.admin_set_verified('47', true)")
    assert row_for(admin, "47")["verified"] is True
    assert admin.one("select public.admin_get_stats()")["unverified"] == 0
    admin.one("select public.admin_set_verified('47', false)")
    assert row_for(admin, "47")["verified"] is False
    # El tablero público no cambia.
    board = public.one("select row_to_json(r) from public.raffle_numbers r where id = '47'")
    assert set(board) == {"id", "status", "public_name", "updated_at"}
    with pytest.raises(psycopg.errors.NoDataFound):
        admin.one("select public.admin_set_verified('48', true)")
    check_invariants(superuser)


def test_admin_sees_how_many_numbers_a_phone_holds(admin, make_client):
    for i, n in enumerate(["50", "51", "52"]):
        make_client("anon", ip=f"198.51.103.{i}").claim(n, "Ana", "5533332222")
    make_client("anon", ip="198.51.103.9").claim("53", "Luis", "5533331111")
    assert row_for(admin, "50")["phone_active"] == 3
    assert row_for(admin, "53")["phone_active"] == 1
    assert row_for(admin, "54")["phone_active"] is None


def test_stats_count_reservations_expiring_soon(admin, public, superuser):
    public.claim("55", "Ana")
    public.claim("56", "Luis")
    superuser.execute("update private.participations set expires_at = now() + interval '3 hours' "
                      "where number_id = '55'")
    stats = admin.one("select public.admin_get_stats()")
    assert stats["expiring_24h"] == 1 and stats["unverified"] == 2
    assert "codes_issued" not in stats


# ---------------------------------------------------------------------------
# Panel de administración: permisos
# ---------------------------------------------------------------------------

ADMIN_CALLS = [
    "select public.admin_list_numbers()",
    "select public.admin_get_stats()",
    "select public.admin_list_audit()",
    "select public.admin_mark_paid('01', 1)",
    "select public.admin_cancel_participation('01', 'x')",
    "select public.admin_update_settings('{}')",
    "select public.admin_update_participant('01', 'Ana')",
    "select public.admin_extend_reservation('01', 24)",
    "select public.admin_set_verified('01', true)",
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
    assert anon_ok == {"get_public_config()", "claim_number(text,text,text,text,text)"}
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


def test_code_functions_are_gone(superuser):
    names = {r[0] for r in superuser.execute(
        "select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
        "where n.nspname = 'public'").fetchall()}
    assert not names & {"admin_generate_codes", "admin_revoke_code",
                        "admin_mark_code_delivered", "admin_list_codes"}


def test_admin_renames_participant_and_board_updates(admin, public, superuser):
    public.claim("80", "Anna", "5500001111")
    admin.one("select public.admin_update_participant('80', 'Ana', 'Ana@Correo.com', '55 1234 5678', 'Prima')")
    assert public.one("select public_name from public.raffle_numbers where id = '80'") == "Ana"
    row = row_for(admin, "80")
    assert (row["first_name"], row["email"], row["phone"], row["notes"]) == \
        ("Ana", "ana@correo.com", "5512345678", "Prima")
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        admin.one("select public.admin_update_participant('80', 'Ana', 'no-es-correo', null, null)")
    board = public.one("select row_to_json(r)::text from public.raffle_numbers r where id = '80'")
    assert "1234" not in board
    check_invariants(superuser)


def test_audit_log_records_actor(admin, public):
    public.claim("90", "Ana")
    admin.one("select public.admin_extend_reservation('90', 24)")
    admin.one("select public.admin_mark_paid('90', 500)")
    log = admin.all("select actor_label, action, number_id from public.admin_list_audit(10)")
    assert ("public", "number_claimed", "90") in log
    assert ("job@example.com", "reservation_extended", "90") in log
    assert ("job@example.com", "payment_confirmed", "90") in log


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


# ---------------------------------------------------------------------------
# Actualizar un proyecto que ya tenía reservas con código
# ---------------------------------------------------------------------------

def test_upgrade_from_migration_7_keeps_existing_reservations():
    """Simula el proyecto real: base con migraciones 1–7, una reserva hecha con
    código y otro código pendiente. Al aplicar la 8 (dos veces), la reserva
    sigue igual, el código pendiente se retira y el registro nuevo funciona."""
    name = f"rifa_up_{uuid.uuid4().hex[:8]}"
    old, new = [m for m in MIGRATIONS if "000800" not in m.name], \
               [m for m in MIGRATIONS if "000800" in m.name]
    assert len(new) == 1
    build_db(name, old)
    try:
        su = psycopg.connect(_url_for(name), autocommit=True)
        uid = str(uuid.uuid4())
        su.execute("insert into auth.users (id, email) values (%s, 'job@example.com')", (uid,))
        su.execute("insert into private.admin_users (user_id) values (%s)", (uid,))
        adm = Client(name, "authenticated", user_id=uid, email="job@example.com")
        pub = Client(name, "anon")
        codes = dict(adm.all("select number_id, code from public.admin_generate_codes(array['10','11'])"))
        assert pub.one("select public.claim_number(%s, %s, %s)", ("10", "Ana", codes["10"]))["ok"] is True

        for _ in range(2):  # re-ejecutable
            su.execute(new[0].read_text())

        assert pub.one("select status from public.raffle_numbers where id = '10'") == "reserved"
        assert su.execute("select code_id is not null from private.participations "
                          "where number_id = '10'").fetchone()[0] is True
        assert su.execute("select status from private.authorization_codes where number_id = '11'"
                          ).fetchone()[0] == "revoked"
        retired = su.execute("select count(*) from private.admin_audit_log where action = 'codes_retired'"
                             ).fetchone()[0]
        assert retired == 1

        pub2 = Client(name, "anon")
        assert pub2.claim("11", "Luis", "5512345678")["ok"] is True
        assert adm.one("select public.admin_extend_reservation('10', 24)") is not None
        check_invariants(su)
        for c in (adm, pub, pub2):
            c.close()
        su.close()
    finally:
        drop_db(name)
