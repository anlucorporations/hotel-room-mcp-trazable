import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guardián de **claves i18n referenciadas por el código**.
 *
 * Nace de un defecto **real** encontrado al ejecutar el escaneo axe del rediseño «Brisa Marina»
 * (2026-10): `app/contacto/page.tsx` pedía `home("travelers.title")` / `home("travelers.body")`,
 * pero esas claves **solo existen** en el namespace `contact`. El servidor lo avisaba por consola
 * (`MISSING_MESSAGE`) y la página pintaba el literal `home.travelers.title` al huésped.
 *
 * Por qué no lo cubrían los guardianes existentes: `i18n-parity.test.ts` comprueba que los tres
 * catálogos tengan **la misma estructura**, y una clave que falta en los TRES idiomas es
 * perfectamente «paritaria» — por eso nadie la echaba de menos. Este guardián cierra el hueco por
 * el otro lado: lo que el código **pide** tiene que existir.
 *
 * Cómo resuelve las claves (estático, sin ejecutar la app):
 *   1. Localiza los enlaces `const X = await getTranslations("ns")` / `useTranslations("ns")`.
 *   2. Comprueba cada llamada `X("clave")` del mismo fichero contra el catálogo español.
 *   3. Exige además que la clave exista en EN y RU (la paridad formal la vigila el otro guardián,
 *      pero aquí se comprueba en la misma pasada que la clave usada está en los tres).
 *
 * Límites declarados (no se certifican): las claves **dinámicas** (`X(\`a.${x}\`)`) y las que usan
 * un traductor sin namespace explícito (`getTranslations()` dentro de un layout con namespace
 * heredado) no se pueden resolver estáticamente y quedan fuera; se cuentan y se informan para que
 * el hueco sea visible y no silencioso.
 */

const SRC_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const MESSAGES = ["es", "en", "ru"] as const;

type Catalog = Record<string, unknown>;

const load = (locale: (typeof MESSAGES)[number]): Catalog =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`../../messages/${locale}.json`, import.meta.url)), "utf8"),
  ) as Catalog;

/** Aplana el catálogo a `clave.con.puntos` (mismo criterio que `i18n-parity.test.ts`). */
function flatten(value: unknown, prefix = ""): Set<string> {
  const out = new Set<string>();
  if (value === null || typeof value !== "object") return out;
  for (const [key, child] of Object.entries(value as Catalog)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    out.add(path);
    for (const nested of flatten(child, path)) out.add(nested);
  }
  return out;
}

const catalogs = Object.fromEntries(
  MESSAGES.map((locale) => [locale, flatten(load(locale))]),
) as Record<(typeof MESSAGES)[number], Set<string>>;

const rel = (file: string): string => relative(SRC_ROOT, file).replace(/\\/g, "/");

function sourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(full) && !/\.test\.tsx?$/.test(full)) files.push(full);
    }
  };
  walk(SRC_ROOT);
  return files.sort();
}

/** Enlaces `const X = (await )?getTranslations|useTranslations("ns")` de un fichero. */
function translatorsOf(source: string): Map<string, string> {
  const found = new Map<string, string>();
  const pattern =
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:getTranslations|useTranslations)\(\s*"([^"]+)"\s*\)/g;
  for (const match of source.matchAll(pattern)) found.set(match[1]!, match[2]!);
  return found;
}

interface Reference {
  readonly file: string;
  readonly namespace: string;
  readonly key: string;
}

const references: Reference[] = [];
let dynamicKeys = 0;
let inheritedNamespace = 0;

for (const file of sourceFiles()) {
  const source = readFileSync(file, "utf8");
  const translators = translatorsOf(source);
  if (translators.size === 0) {
    if (/getTranslations\(\s*\)|useTranslations\(\s*\)/.test(source)) inheritedNamespace += 1;
    continue;
  }
  for (const [binding, namespace] of translators) {
    const call = new RegExp(`\\b${binding}\\(\\s*"([^"]+)"`, "g");
    for (const match of source.matchAll(call)) {
      references.push({ file: rel(file), namespace, key: match[1]! });
    }
    dynamicKeys += [...source.matchAll(new RegExp(`\\b${binding}\\(\\s*\``, "g"))].length;
  }
}

describe("i18n · claves referenciadas por el código", () => {
  it("el guardián ve referencias de verdad (varias páginas piden claves)", () => {
    expect(references.length).toBeGreaterThan(50);
    expect(new Set(references.map((reference) => reference.file)).size).toBeGreaterThan(10);
  });

  it("toda clave pedida existe en el catálogo español", () => {
    const missing = references
      .filter(({ namespace, key }) => !catalogs.es.has(`${namespace}.${key}`))
      .map(({ file, namespace, key }) => `${file} :: ${namespace}.${key}`);

    expect([...new Set(missing)]).toEqual([]);
  });

  it("toda clave pedida existe también en EN y RU (paridad de lo realmente usado)", () => {
    const missing = references
      .flatMap(({ file, namespace, key }) =>
        (["en", "ru"] as const)
          .filter((locale) => !catalogs[locale].has(`${namespace}.${key}`))
          .map((locale) => `${file} :: [${locale}] ${namespace}.${key}`),
      );

    expect([...new Set(missing)]).toEqual([]);
  });

  it("las claves dinámicas quedan declaradas como límite (no se certifican)", () => {
    // No se exige cero: hay llamadas legítimas con plantilla (`t(\`role.${state}\`)`). El test fija
    // que el hueco es **conocido y acotado** (49 medidas el 2026-10); si crece sin control, salta y
    // obliga a revisar por qué en lugar de dejar que se ensanche en silencio.
    expect(dynamicKeys).toBeGreaterThan(0);
    expect(dynamicKeys).toBeLessThanOrEqual(60);
  });
});
