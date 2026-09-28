import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guardián de **paridad de los catálogos i18n** (ES/EN/RU).
 *
 * El producto declara paridad de los tres idiomas (D-6, docs/SRS.md §7) y hasta ahora esa paridad se
 * comprobaba **a mano** con un guion suelto en cada incremento: nada impedía que una clave nueva
 * entrara solo en español y el inglés/ruso cayeran al respaldo silenciosamente. Este guardián la
 * convierte en un invariante de la suite.
 *
 * Comprueba tres cosas:
 *   1. La **misma estructura de claves** en los tres idiomas (ni huérfanas ni ausentes).
 *   2. Que ninguna traducción esté **vacía** (una clave presente pero en blanco es una regresión).
 *   3. Que los **marcadores de interpolación** de cada clave coincidan entre idiomas: un `{count}` que
 *      solo existe en español renderiza literal en inglés.
 */

const MESSAGES = ["es", "en", "ru"] as const;

type Catalog = Record<string, unknown>;

const load = (locale: (typeof MESSAGES)[number]): Catalog =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`../../messages/${locale}.json`, import.meta.url)), "utf8"),
  ) as Catalog;

/** Aplana el catálogo a `clave.con.puntos` → valor. */
function flatten(value: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (value === null || typeof value !== "object") {
    out.set(prefix, String(value));
    return out;
  }
  for (const [key, child] of Object.entries(value as Catalog)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    for (const [childKey, childValue] of flatten(child, path)) out.set(childKey, childValue);
  }
  return out;
}

const catalogs = Object.fromEntries(MESSAGES.map((locale) => [locale, flatten(load(locale))])) as Record<
  (typeof MESSAGES)[number],
  Map<string, string>
>;

/** Marcadores `{nombre}` de una cadena, ordenados (ignora los de plural ICU anidados). */
function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\s*([a-zA-Z0-9_]+)\s*[,}]/g)].map((match) => match[1]!).sort();
}

describe("i18n · paridad ES/EN/RU", () => {
  it("el catálogo no está vacío y tiene claves de verdad", () => {
    for (const locale of MESSAGES) {
      expect(catalogs[locale].size, locale).toBeGreaterThan(500);
    }
  });

  it("los tres idiomas declaran exactamente las mismas claves", () => {
    const reference = [...catalogs.es.keys()].sort();
    for (const locale of MESSAGES) {
      const keys = [...catalogs[locale].keys()].sort();
      expect(keys, `claves ausentes en ${locale}`).toEqual(reference);
    }
  });

  it("ninguna traducción queda en blanco", () => {
    const empty: string[] = [];
    for (const locale of MESSAGES) {
      for (const [key, value] of catalogs[locale]) {
        if (value.trim() === "") empty.push(`${locale}:${key}`);
      }
    }
    expect(empty).toEqual([]);
  });

  it("los marcadores de interpolación coinciden entre idiomas", () => {
    const mismatch: string[] = [];
    for (const [key, referenceValue] of catalogs.es) {
      const expected = placeholders(referenceValue).join(",");
      for (const locale of ["en", "ru"] as const) {
        const value = catalogs[locale].get(key);
        if (value === undefined) continue;
        const actual = placeholders(value).join(",");
        if (actual !== expected) mismatch.push(`${key} (${locale}): esperado [${expected}], real [${actual}]`);
      }
    }
    expect(mismatch).toEqual([]);
  });
});
