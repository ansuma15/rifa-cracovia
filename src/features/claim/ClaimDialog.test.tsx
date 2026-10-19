import { describe, expect, it } from "vitest";
import { __test } from "./ClaimDialog";

const { cleanName, NAME_RE, ERROR_TEXT } = __test;

describe("mensajes de error", () => {
  it("el límite por teléfono dice cuántos números se permiten", () => {
    expect(ERROR_TEXT.phone_limit(5)).toContain("5 números apartados sin pagar");
  });
  it("ningún mensaje menciona códigos", () => {
    for (const f of Object.values(ERROR_TEXT)) expect(f(5).toLowerCase()).not.toContain("código");
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
