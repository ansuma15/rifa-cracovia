import { describe, expect, it } from "vitest";
import { ALL_IDS, applyChange, BoardDataError, countByStatus, searchBoard, toBoardMap } from "./board";
import type { BoardNumber, NumberId } from "./types";

const T0 = "2026-10-11T10:00:00Z";

function rows(overrides: Partial<Record<NumberId, Partial<BoardNumber>>> = {}): BoardNumber[] {
  return ALL_IDS.map((id) => ({
    id,
    status: "available",
    public_name: null,
    updated_at: T0,
    ...overrides[id],
  }));
}

describe("identificadores", () => {
  it("son exactamente 100, de '00' a '99', siempre texto de dos dígitos", () => {
    expect(ALL_IDS).toHaveLength(100);
    expect(ALL_IDS[0]).toBe("00");
    expect(ALL_IDS[7]).toBe("07");
    expect(ALL_IDS[99]).toBe("99");
    expect(new Set(ALL_IDS).size).toBe(100);
    expect(ALL_IDS.every((id) => typeof id === "string" && /^\d{2}$/.test(id))).toBe(true);
  });
});

describe("toBoardMap", () => {
  it("acepta la respuesta completa del servidor", () => {
    const map = toBoardMap(rows());
    expect(map.size).toBe(100);
    expect(map.get("00")?.status).toBe("available");
  });

  it("rechaza un tablero incompleto en lugar de inventar números disponibles", () => {
    expect(() => toBoardMap(rows().slice(1))).toThrow(BoardDataError);
  });

  it("rechaza ids numéricos (el 00 no puede convertirse en 0)", () => {
    const bad = rows().map((r) => (r.id === "00" ? { ...r, id: 0 } : r));
    expect(() => toBoardMap(bad)).toThrow(BoardDataError);
  });

  it("rechaza estados desconocidos", () => {
    const bad = rows().map((r) => (r.id === "05" ? { ...r, status: "free" } : r));
    expect(() => toBoardMap(bad)).toThrow(BoardDataError);
  });
});

describe("applyChange (Realtime)", () => {
  it("aplica un cambio más reciente", () => {
    const map = toBoardMap(rows());
    const next = applyChange(map, {
      id: "25",
      status: "reserved",
      public_name: "Ana",
      updated_at: "2026-10-11T10:05:00Z",
    });
    expect(next.get("25")?.public_name).toBe("Ana");
    expect(map.get("25")?.status).toBe("available"); // inmutable
  });

  it("ignora un evento atrasado que llegó fuera de orden", () => {
    const map = toBoardMap(rows({ "25": { status: "paid", public_name: "Ana", updated_at: "2026-10-11T11:00:00Z" } }));
    const next = applyChange(map, { id: "25", status: "reserved", public_name: "Ana", updated_at: "2026-10-11T10:30:00Z" });
    expect(next.get("25")?.status).toBe("paid");
  });

  it("ignora cargas con forma inválida", () => {
    const map = toBoardMap(rows());
    expect(applyChange(map, { id: 25, status: "paid" })).toBe(map);
  });
});

describe("búsqueda", () => {
  const map = toBoardMap(
    rows({
      "07": { status: "paid", public_name: "José" },
      "25": { status: "reserved", public_name: "Ana María" },
      "61": { status: "paid", public_name: "Mariana" },
    }),
  );

  it("encuentra por número con o sin cero inicial", () => {
    expect(searchBoard(map, "7")).toEqual(["07"]);
    expect(searchBoard(map, "07")).toEqual(["07"]);
    expect(searchBoard(map, "2")).toEqual(["02"]);
  });

  it("encuentra por nombre sin importar acentos ni mayúsculas", () => {
    expect(searchBoard(map, "jose")).toEqual(["07"]);
    expect(searchBoard(map, "MARIA")).toEqual(["25", "61"]); // "Mariana" también contiene "maria"
    expect(searchBoard(map, "ana MARÍA")).toEqual(["25"]);
    expect(searchBoard(map, "mari")).toEqual(["25", "61"]);
  });

  it("no busca con una sola letra ni con texto vacío", () => {
    expect(searchBoard(map, "a")).toEqual([]);
    expect(searchBoard(map, "  ")).toEqual([]);
  });

  it("cuenta por estado", () => {
    expect(countByStatus(map)).toEqual({ available: 97, reserved: 1, paid: 2 });
  });
});
