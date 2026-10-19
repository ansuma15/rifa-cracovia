import { describe, expect, it } from "vitest";
import { payment } from "../content";
import { contactErrors, waNumberFor, whatsappLink, formatClabe, holdHours, isValidClabe, normalizePhone, receiptLink, youtubeId } from "./format";

describe("CLABE", () => {
  it("la CLABE publicada tiene 18 dígitos y dígito verificador correcto", () => {
    expect(isValidClabe(payment.clabe)).toBe(true);
  });
  it("detecta un dígito equivocado", () => {
    expect(isValidClabe("646990404078801467")).toBe(false);
    expect(isValidClabe("64699040407880146")).toBe(false);
  });
  it("se muestra en grupos de 4", () => {
    expect(formatClabe("646990404078801466")).toBe("6469 9040 4078 8014 66");
  });
});

describe("YouTube", () => {
  it.each([
    ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3", "dQw4w9WgXcQ"],
    ["https://youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("extrae el id de %s", (url, id) => {
    expect(youtubeId(url)).toBe(id);
  });
  it("ignora enlaces que no son de YouTube", () => {
    expect(youtubeId("https://vimeo.com/123")).toBeNull();
    expect(youtubeId(null)).toBeNull();
  });
});

describe("contacto (mismas reglas que el servidor)", () => {
  it("en el panel, vacío es válido", () => {
    expect(contactErrors("", "")).toEqual({});
  });
  it("en el registro público el teléfono es obligatorio y el correo no", () => {
    expect(contactErrors("", "", { phoneRequired: true }).phone).toBeDefined();
    expect(contactErrors("", "   ", { phoneRequired: true }).phone).toBeDefined();
    expect(contactErrors("", "55 1234 5678", { phoneRequired: true })).toEqual({});
  });
  it("acepta formatos comunes de teléfono", () => {
    expect(contactErrors("", "55 1234 5678")).toEqual({});
    expect(contactErrors("", "+52 (55) 1234-5678")).toEqual({});
    expect(normalizePhone("+52 (55) 1234-5678")).toBe("+525512345678");
  });
  it("rechaza correos y teléfonos mal escritos", () => {
    expect(contactErrors("ana@", "").email).toBeDefined();
    expect(contactErrors("", "123").phone).toBeDefined();
    expect(contactErrors("", "55-12AB").phone).toBeDefined();
  });
});

describe("plazo y comprobante", () => {
  it("72 h por defecto, null si la reserva no vence", () => {
    expect(holdHours(null)).toBe(72);
    expect(holdHours({ registrations_open: true, price_per_number: 700, currency: "MXN", reservation_hours: 72 })).toBe(72);
    expect(holdHours({ registrations_open: true, price_per_number: 700, currency: "MXN", reservation_hours: null })).toBeNull();
  });
  it("el enlace de WhatsApp lleva el número y nombre, no se genera sin teléfono válido", () => {
    const link = receiptLink("525512345678", "25", "Ana");
    expect(link).toMatch(/^https:\/\/wa\.me\/525512345678\?text=/);
    expect(decodeURIComponent(link!)).toContain("Número: 25. Nombre: Ana.");
    expect(receiptLink(null)).toBeNull();
    expect(receiptLink("55-1234")).toBeNull();
  });
  it("arma enlaces de WhatsApp con mensaje y rechaza números inválidos", () => {
    expect(whatsappLink("525512345678", "Hola 25")).toBe("https://wa.me/525512345678?text=Hola%2025");
    expect(whatsappLink("+52 55 1234 5678", "x")).toMatch(/^https:\/\/wa\.me\/525512345678\?/);
    expect(whatsappLink(null, "x")).toBeNull();
    expect(whatsappLink("123", "x")).toBeNull();
  });
  it("teléfono de 10 dígitos se toma como México", () => {
    expect(waNumberFor("55 1234 5678")).toBe("525512345678");
    expect(waNumberFor("+525512345678")).toBe("525512345678");
    expect(waNumberFor("+1 415 555 0100")).toBe("14155550100");
    expect(waNumberFor(null)).toBeNull();
  });
});
