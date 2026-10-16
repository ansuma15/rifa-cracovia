import type { NumberId } from "../lib/types";

export type ParseResult = { ok: true; numbers: NumberId[] } | { ok: false; error: string };

/**
 * Interpreta lo que escribe el administrador para elegir números:
 *   "7, 25, 31-35"  →  07, 25, 31, 32, 33, 34, 35
 * Acepta comas, espacios o saltos de línea; rangos con guion; un dígito o dos.
 * Devuelve los números ordenados y sin repetir, siempre como texto de 2 dígitos.
 */
export function parseNumberList(input: string): ParseResult {
  const tokens = input.split(/[\s,;]+/).filter(Boolean);
  if (tokens.length === 0) return { ok: false, error: "Escribe al menos un número." };

  const set = new Set<number>();
  for (const t of tokens) {
    const range = t.match(/^(\d{1,2})-(\d{1,2})$/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (a > b) return { ok: false, error: `El rango "${t}" está al revés.` };
      for (let i = a; i <= b; i++) set.add(i);
      continue;
    }
    if (/^\d{1,2}$/.test(t)) {
      set.add(Number(t));
      continue;
    }
    return { ok: false, error: `"${t}" no es un número del 00 al 99.` };
  }
  const numbers = [...set].sort((x, y) => x - y).map((n) => String(n).padStart(2, "0") as NumberId);
  return { ok: true, numbers };
}

/** Mensaje listo para mandar por WhatsApp junto con el código. */
export function deliveryMessage(number: NumberId, code: string, siteUrl: string): string {
  return (
    `¡Gracias por participar en mi rifa! 🎟️\n` +
    `Tu número es el *${number}* y tu código es: *${code}*\n` +
    `Regístralo aquí: ${siteUrl}\n` +
    `(El código solo sirve para el ${number} y una sola vez.)`
  );
}

/**
 * CSV para guardar los códigos recién generados. El número se escribe como
 * ="07" para que Excel no le quite el cero inicial.
 */
export function codesToCsv(rows: { number_id: NumberId; code: string }[]): string {
  const lines = rows.map((r) => `="${r.number_id}",${r.code}`);
  return `﻿numero,codigo\n${lines.join("\n")}\n`;
}
