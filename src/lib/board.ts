// Lógica pura del tablero: sin React ni red, para poder probarla aislada.
import type { BoardNumber, NumberId, PublicStatus } from "./types";

/** "00" … "99", en orden. Se usa para VALIDAR, nunca para inventar estados. */
export const ALL_IDS: readonly NumberId[] = Array.from(
  { length: 100 },
  (_, i) => String(i).padStart(2, "0") as NumberId,
);

const STATUSES: readonly PublicStatus[] = ["available", "reserved", "paid"];

export function isNumberId(value: unknown): value is NumberId {
  return typeof value === "string" && /^[0-9]{2}$/.test(value);
}

function isBoardNumber(row: unknown): row is BoardNumber {
  if (typeof row !== "object" || row === null) return false;
  const r = row as Record<string, unknown>;
  return (
    isNumberId(r.id) &&
    STATUSES.includes(r.status as PublicStatus) &&
    (r.public_name === null || typeof r.public_name === "string") &&
    typeof r.updated_at === "string"
  );
}

export class BoardDataError extends Error {}

/**
 * Convierte la respuesta del servidor en un Map y comprueba que estén
 * exactamente los 100 números. Si falta alguno NO se rellena como
 * "disponible": se lanza un error, porque mostrar disponible un número
 * que podría estar ocupado sería engañoso.
 */
export function toBoardMap(rows: unknown): Map<NumberId, BoardNumber> {
  if (!Array.isArray(rows)) throw new BoardDataError("Respuesta inesperada del servidor.");
  const map = new Map<NumberId, BoardNumber>();
  for (const row of rows) {
    if (!isBoardNumber(row)) throw new BoardDataError("Un número llegó con datos inválidos.");
    map.set(row.id, row);
  }
  const missing = ALL_IDS.filter((id) => !map.has(id));
  if (missing.length > 0 || map.size !== 100) {
    throw new BoardDataError(`El tablero llegó incompleto (${map.size}/100).`);
  }
  return map;
}

/**
 * Aplica un cambio recibido por Realtime. Si el cambio es más viejo que lo
 * que ya tenemos (llegó fuera de orden), se ignora.
 */
export function applyChange(
  current: Map<NumberId, BoardNumber>,
  incoming: unknown,
): Map<NumberId, BoardNumber> {
  if (!isBoardNumber(incoming)) return current;
  const prev = current.get(incoming.id);
  if (prev && Date.parse(prev.updated_at) > Date.parse(incoming.updated_at)) return current;
  const next = new Map(current);
  next.set(incoming.id, incoming);
  return next;
}

export interface BoardCounts {
  available: number;
  reserved: number;
  paid: number;
}

export function countByStatus(board: Map<NumberId, BoardNumber>): BoardCounts {
  const counts: BoardCounts = { available: 0, reserved: 0, paid: 0 };
  for (const n of board.values()) counts[n.status] += 1;
  return counts;
}

/** Minúsculas y sin acentos: "José" y "jose" coinciden. */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

/**
 * Búsqueda por número o por nombre.
 * - "7" o "07" → el número 07.
 * - "2" → no busca prefijos (sería ambiguo con 20–29): solo el 02.
 * - texto → nombres que contienen el texto, sin importar acentos.
 */
export function searchBoard(
  board: Map<NumberId, BoardNumber>,
  query: string,
): NumberId[] {
  const q = query.trim();
  if (q === "") return [];
  if (/^[0-9]{1,2}$/.test(q)) {
    const id = q.padStart(2, "0") as NumberId;
    return board.has(id) ? [id] : [];
  }
  const needle = fold(q);
  if (needle.length < 2) return [];
  return [...board.values()]
    .filter((n) => n.public_name !== null && fold(n.public_name).includes(needle))
    .map((n) => n.id);
}

/** Etiqueta pública de cada estado. "paid" se presenta como "Ocupado". */
export const STATUS_LABEL: Record<PublicStatus, string> = {
  available: "Disponible",
  reserved: "Reservado",
  paid: "Ocupado",
};
