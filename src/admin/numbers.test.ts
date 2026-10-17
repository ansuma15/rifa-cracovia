import { describe, expect, it } from "vitest";
import { codesToCsv, deliveryMessage, parseNumberList } from "./numbers";

describe("parseNumberList", () => {
  it("acepta números sueltos, rangos y distintos separadores", () => {
    expect(parseNumberList("7, 25 31-33\n0")).toEqual({ ok: true, numbers: ["00", "07", "25", "31", "32", "33"] });
  });

  it("quita repetidos y ordena", () => {
    expect(parseNumberList("25,25,07,5-7")).toEqual({ ok: true, numbers: ["05", "06", "07", "25"] });
  });

  it("conserva siempre dos dígitos", () => {
    const r = parseNumberList("0 9 99");
    expect(r.ok && r.numbers).toEqual(["00", "09", "99"]);
  });

  it.each(["100", "abc", "1-", "-5", "7.5"])("rechaza %s", (bad) => {
    expect(parseNumberList(bad).ok).toBe(false);
  });

  it("rechaza rangos al revés y entradas vacías", () => {
    expect(parseNumberList("30-20").ok).toBe(false);
    expect(parseNumberList("  ").ok).toBe(false);
  });
});

describe("entrega de códigos", () => {
  it("el CSV conserva el cero inicial para Excel", () => {
    const csv = codesToCsv([{ number_id: "07", code: "ABCD-EFGH-JKMN" }]);
    expect(csv).toContain('="07",ABCD-EFGH-JKMN');
    expect(csv.startsWith("﻿")).toBe(true);
  });

  it("el mensaje incluye número, código y sitio", () => {
    const m = deliveryMessage("25", "ABCD-EFGH-JKMN", "https://ejemplo.github.io/rifa/");
    expect(m).toContain("*25*");
    expect(m).toContain("ABCD-EFGH-JKMN");
    expect(m).toContain("https://ejemplo.github.io/rifa/");
    expect(m).toContain("72 horas");
    expect(m).toContain("Resérvalo");
  });
});
