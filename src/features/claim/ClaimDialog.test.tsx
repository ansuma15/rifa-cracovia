import { describe, expect, it } from "vitest";
import { __test } from "./ClaimDialog";

const { normalizeCode, formatCodeInput, cleanName, NAME_RE } = __test;

describe("código de autorización (lado cliente)", () => {
  it("normaliza igual que el servidor: guiones, espacios, minúsculas, O→0, I/L→1", () => {
    expect(normalizeCode("k7qf-m2xr-9wtb")).toBe("K7QFM2XR9WTB");
    expect(normalizeCode("ABCD EFGH OIL1")).toBe("ABCDEFGH0111");
  });

  it("agrupa de 4 en 4 mientras se escribe y no pasa de 12 caracteres", () => {
    expect(formatCodeInput("abcdefgh")).toBe("ABCD-EFGH");
    expect(formatCodeInput("abcdefghjkmnpq")).toBe("ABCD-EFGH-JKMN");
    expect(formatCodeInput("ABCD-")).toBe("ABCD");
  });
});

describe("nombre de pila (lado cliente)", () => {
  it.each(["José", "María José", "O'Connor", "Zoë", "Ñoño", "J. Carlos", "Ana-Sofía"])("acepta %s", (n) => {
    expect(NAME_RE.test(cleanName(n))).toBe(true);
  });

  it.each(["Ana123", "https://spam.example", "", "@ana"])("rechaza %s", (n) => {
    expect(NAME_RE.test(cleanName(n))).toBe(false);
  });

  it("colapsa espacios como el servidor", () => {
    expect(cleanName("  Ana   María ")).toBe("Ana María");
  });
});
