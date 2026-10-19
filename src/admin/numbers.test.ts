import { describe, expect, it } from "vitest";
import { contactLink, contactMessage, toLocalInput } from "./numbers";

describe("mensaje para contactar a quien apartó", () => {
  it("incluye número, nombre, plazo, precio y CLABE agrupada", () => {
    const m = contactMessage({ number: "25", name: "Ana", expiresAt: "2026-10-21T18:00:00Z", price: "$700" });
    expect(m).toContain("Hola, Ana");
    expect(m).toContain("*25*");
    expect(m).toContain("de $700");
    expect(m).toContain("6469 9040 4078 8014 66");
    expect(m).toContain("comprobante");
    expect(m.toLowerCase()).not.toContain("código");
  });

  it("sin plazo ni nombre sigue siendo un mensaje correcto", () => {
    const m = contactMessage({ number: "07", name: null, expiresAt: null, price: null });
    expect(m.startsWith("¡Hola! Soy")).toBe(true);
    expect(m).toContain("*07*");
  });

  it("el enlace usa el teléfono del participante, con 52 si son 10 dígitos", () => {
    expect(contactLink("55 1234 5678", "Hola")).toBe("https://wa.me/525512345678?text=Hola");
    expect(contactLink("+52 55 1234 5678", "Hola")).toBe("https://wa.me/525512345678?text=Hola");
    expect(contactLink(null, "Hola")).toBeNull();
  });
});

describe("fecha para el campo de fecha y hora", () => {
  it("usa la hora local con el formato que pide el navegador", () => {
    const iso = new Date(2026, 9, 20, 18, 5).toISOString();
    expect(toLocalInput(iso)).toBe("2026-10-20T18:05");
  });
  it("sin vencimiento propone uno a futuro", () => {
    expect(Date.parse(toLocalInput(null))).toBeGreaterThan(Date.now());
  });
});
