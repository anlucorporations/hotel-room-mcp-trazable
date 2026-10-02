import { createRequire } from "node:module";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { verifyWcagAA } from "./contrast";
import {
  DECLARED_TEXT_ON_BACKGROUND,
  NEUTRAL_HEX,
  PALETTE,
} from "./palette";
import {
  blendOver,
  extractClassAttributes,
  isNonTextUtility,
  parseColorUtilities,
  tokenHex,
  type ColorUtility,
} from "./color-usage";

/**
 * Accesibilidad verificada SOBRE LA PALETA REAL (D-11, hallazgo H-21 de la auditoría).
 *
 * La auditoría detectó que la «certificación WCAG 2.1 AA» se medía contra colores
 * (`#047857`, `#DC2626`…) que no existen en el preset del proyecto, y que los tests de semántica
 * comprobaban objetos literales escritos dentro del propio test (tautologías). Aquí se corrige de
 * raíz:
 *
 *   1. La paleta medida se compara con el preset REAL de Tailwind (`preset.cjs`): si divergen, el
 *      test falla. No se puede volver a certificar un color que no existe.
 *   2. Se LEEN los `className` de `src/**` y se comprueba que ningún token de color es inventado y
 *      que los pares texto/fondo que realmente aparecen juntos cumplen el ratio AA (4.5:1).
 *   3. Los invariantes «semánticos» pasan a comprobarse sobre los ficheros reales (skip-link y su
 *      destino, `lang` del documento, un `h1` por ruta, iconos SVG ocultos a lectores, y las
 *      gráficas con alternativa textual y tabla de datos).
 */

const SRC_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** Todos los ficheros fuente de la web (sin tests: se mide el producto, no las pruebas). */
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

const rel = (file: string): string => relative(SRC_ROOT, file).replace(/\\/g, "/");

/** Preset real de Tailwind (CommonJS de build) tal y como lo consume la aplicación. */
function realPreset(): {
  theme: { extend: { colors: Record<string, string>; fontSize: Record<string, unknown> } };
} {
  const require = createRequire(import.meta.url);
  return require("../../../../../packages/config/tailwind/preset.cjs") as {
    theme: { extend: { colors: Record<string, string>; fontSize: Record<string, unknown> } };
  };
}

function realPresetColors(): Record<string, string> {
  return realPreset().theme.extend.colors;
}

describe("Accesibilidad · la paleta medida ES la paleta real (H-21)", () => {
  it("`PALETTE` (la que mide este test y pintan las gráficas) coincide con el preset de Tailwind", () => {
    expect(PALETTE).toEqual(realPresetColors());
  });

  it("cada combinación declarada de texto sobre fondo cumple WCAG 2.1 AA (4.5:1)", () => {
    const failures = DECLARED_TEXT_ON_BACKGROUND.map((combo) => {
      const fg = tokenHex(combo.foreground);
      const bg = tokenHex(combo.background);
      const { ratio, passes } = verifyWcagAA(fg!, bg!, false);
      return { ...combo, ratio, passes };
    }).filter((result) => !result.passes);

    expect(
      failures.map((f) => `${f.where}: ${f.foreground} sobre ${f.background} = ${f.ratio}:1`),
    ).toEqual([]);
  });

  it("los colores de las series de las gráficas se distinguen del fondo de la tarjeta", () => {
    // Las series de las gráficas son `azure` (primaria) y `coral-text` (reventa), declaradas en
    // `ChartLegend.SERIES_COLORS` a partir de la paleta real; el guardián de abajo comprueba ese
    // enlace en el código. Aquí se mide que cada relleno se distinga del fondo blanco de la
    // tarjeta (WCAG 1.4.11, 3:1 para elementos no textuales).
    for (const token of ["azure", "coral-text"] as const) {
      const { ratio } = verifyWcagAA(PALETTE[token], PALETTE.shell, true);
      expect(ratio, `${token} sobre shell`).toBeGreaterThanOrEqual(3);
    }
    // Los rótulos de los ejes son texto normal y se leen sobre el mismo fondo blanco.
    const { ratio: axisRatio } = verifyWcagAA(PALETTE["ink-soft"], PALETTE.shell, false);
    expect(axisRatio).toBeGreaterThanOrEqual(4.5);
  });
});

describe("Accesibilidad · utilidades de color usadas en el producto", () => {
  const usages = sourceFiles().flatMap((file) =>
    extractClassAttributes(readFileSync(file, "utf8")).flatMap((classes) =>
      parseColorUtilities(classes).map((utility) => ({ file: rel(file), classes, utility })),
    ),
  );

  it("se han leído utilidades de color de verdad (el guardián no está vacío por accidente)", () => {
    expect(usages.length).toBeGreaterThan(100);
  });

  it("ningún componente usa un color que no exista en la paleta (ni emerald-700 ni red-600)", () => {
    const unknown = usages.filter(({ utility }) => utility.unknown);
    expect([...new Set(unknown.map(({ file, utility }) => `${file} :: ${utility.raw}`))]).toEqual([]);
  });

  it("todo par texto/fondo del MISMO elemento cumple 4.5:1 sobre la paleta real", () => {
    const violations: string[] = [];

    for (const { file, classes } of usages) {
      // Un literal con condicional (`?`) o interpolación (`${}`) mezcla RAMAS distintas: emparejar
      // su texto con su fondo daría pares que nunca se pintan juntos (`text-ink-soft` de la rama
      // A con `bg-azure` de la rama B). Esos colores siguen verificados por la regla de combinaciones
      // declaradas, que es la que cubre los estados condicionales.
      if (/[?]|\$\{/.test(classes)) continue;

      // El emparejamiento es **por variante** (2026-09-28). Antes se cruzaba todo texto con todo
      // fondo del mismo literal, y eso denunciaba pares imposibles: `text-azure … hover:bg-azure-deep
      // hover:text-shell` pintaba el texto en arena al pasar el ratón, pero el escáner medía el
      // `text-azure` de reposo contra el fondo del hover (1,41:1). La regla real de CSS es la
      // herencia: en una variante sin color propio se hereda el de reposo, y eso sí se comprueba.
      const byVariant = new Map<string, { fg: ColorUtility[]; bg: ColorUtility[] }>();
      for (const utility of parseColorUtilities(classes)) {
        if (isNonTextUtility(utility)) continue;
        if (utility.role !== "foreground" && utility.role !== "background") continue;
        const key = utility.variants.join(":") || "base";
        const bucket = byVariant.get(key) ?? { fg: [], bg: [] };
        if (utility.role === "foreground") bucket.fg.push(utility);
        else bucket.bg.push(utility);
        byVariant.set(key, bucket);
      }

      const base = byVariant.get("base");
      for (const [variant, bucket] of byVariant) {
        const foregrounds = bucket.fg.length > 0 ? bucket.fg : (base?.fg ?? []);
        const backgrounds = bucket.bg.length > 0 ? bucket.bg : (base?.bg ?? []);
        if (backgrounds.length === 0) continue;

        for (const foreground of foregrounds) {
          const fgHex = tokenHex(foreground.token);
          if (fgHex === null) continue;
          for (const background of backgrounds) {
            const bgHex = tokenHex(background.token);
            if (bgHex === null) continue;
            // El fondo puede llevar opacidad (p. ej. `bg-ink/40`): se compone sobre el lienzo.
            const effectiveBg = blendOver(bgHex, PALETTE.mist, background.opacityPercent);
            const effectiveFg = blendOver(fgHex, effectiveBg, foreground.opacityPercent);
            const { ratio } = verifyWcagAA(effectiveFg, effectiveBg, false);
            if (ratio < 4.5) {
              const where = variant === "base" ? "" : `${variant}: `;
              violations.push(
                `${file} :: ${where}${foreground.raw} sobre ${background.raw} = ${ratio}:1`,
              );
            }
          }
        }
      }
    }

    expect([...new Set(violations)]).toEqual([]);
  });

  it("el escáner ve también los colores de constantes, ternarios y plantillas (M7 · H7)", () => {
    const synthetic = [
      'const DANGER = "rounded-brand bg-mist-2 text-coral-text";',
      "const BUTTON = 'bg-azure text-shell';",
      "const CHIP = `bg-mist text-ink`;",
      '<button className={`flex-1 ${active ? "bg-azure text-shell" : "text-ink-soft"}`} />',
    ].join("\n");

    const classes = extractClassAttributes(synthetic);
    const tokens = classes
      .flatMap((value) => parseColorUtilities(value))
      .map((utility) => utility.raw);

    // Los tres literales de constante (que antes quedaban fuera) y las dos ramas del ternario.
    expect(tokens).toContain("bg-mist-2");
    expect(tokens).toContain("text-coral-text");
    expect(tokens).toContain("bg-azure");
    expect(tokens).toContain("text-shell");
    expect(tokens).toContain("bg-mist");
    expect(tokens).toContain("text-ink");
    expect(tokens).toContain("text-ink-soft");
  });

  it("el escáner no confunde los niveles de la escala tipográfica con colores (Fase C)", () => {
    // `text-caption`, `text-body-lg`… son TAMAÑOS (claves de `fontSize` del preset) y comparten la
    // forma `text-<token>` con los colores. Al añadir niveles nuevos (propuesta de imagen visual,
    // Fase A) el escáner los denunció como «color desconocido» en cuanto un componente los usó: la
    // lista de exclusión se DERIVA del preset real para que un nivel futuro quede cubierto solo.
    const preset = realPreset();
    const levels = Object.keys(preset.theme.extend.fontSize ?? {});
    expect(levels.length).toBeGreaterThan(6);
    const mistaken = levels.flatMap((level) =>
      parseColorUtilities(`text-${level}`)
        .filter((utility) => utility.role === "foreground")
        .map((utility) => utility.raw),
    );
    expect(mistaken).toEqual([]);
  });

  it("ningún color de texto se usa sin una combinación declarada y verificada detrás", () => {
    const declaredFgHexes = new Set(
      DECLARED_TEXT_ON_BACKGROUND.map((combo) => tokenHex(combo.foreground)),
    );
    const uncovered = [
      ...new Set(
        usages
          .filter(({ utility }) => utility.role === "foreground" && !isNonTextUtility(utility))
          .filter(({ utility }) => !declaredFgHexes.has(tokenHex(utility.token)))
          .map(({ file, utility }) => `${file} :: ${utility.raw}`),
      ),
    ];

    expect(uncovered).toEqual([]);
  });

  it("ningún fondo se pinta sin texto declarado encima ni comprobado en el mismo elemento", () => {
    const declaredBgHexes = new Set(
      DECLARED_TEXT_ON_BACKGROUND.map((combo) => tokenHex(combo.background)),
    );
    // Un fondo con texto en el mismo `className` ya se comprobó automáticamente arriba.
    const autoChecked = new Set(
      usages
        .filter(({ utility }) => utility.role === "background")
        .filter(({ classes }) =>
          parseColorUtilities(classes).some(
            (other) => other.role === "foreground" && !isNonTextUtility(other),
          ),
        )
        .map(({ utility }) => tokenHex(utility.token)),
    );

    const uncovered = [
      ...new Set(
        usages
          .filter(({ utility }) => utility.role === "background")
          .filter(({ utility }) => {
            const hex = tokenHex(utility.token);
            return !declaredBgHexes.has(hex) && !autoChecked.has(hex);
          })
          .map(({ file, utility }) => `${file} :: ${utility.raw}`),
      ),
    ];

    expect(uncovered).toEqual([]);
  });
});

describe("Accesibilidad · invariantes reales sobre los ficheros del producto", () => {
  const files = sourceFiles();
  const source = (path: string): string => readFileSync(join(SRC_ROOT, path), "utf8");

  it("el documento declara su idioma y ofrece un enlace de salto con destino existente", () => {
    const layout = source("app/layout.tsx");
    expect(layout).toMatch(/<html[^>]*lang=/);
    expect(layout).toMatch(/href="#main-content"/);
    expect(layout).toContain('id="main-content"');
  });

  it("cada ruta tiene un encabezado de nivel 1 (directo o a través de su shell)", () => {
    const pages = files.filter((file) => /app[\\/].*page\.tsx$/.test(file));
    expect(pages.length).toBeGreaterThan(8);

    const withoutHeading = pages
      .filter((file) => {
        const content = readFileSync(file, "utf8");
        // Las rutas que solo redirigen no pintan interfaz: no pueden tener encabezado.
        if (content.includes("redirect(") && !content.includes("<h1")) return false;
        return !(
          content.includes("<h1") ||
          content.includes("<Hero") ||
          // F6: la home delega la one-page (con su `<h1>`) en el shell `HomeSections`.
          content.includes("<HomeSections") ||
          // 2026-09-28: las páginas de sección de la suite pública delegan en `PageHeader`,
          // que es quien pinta el `<h1>` (se comprueba justo debajo que lo hace de verdad).
          content.includes("<PageHeader") ||
          content.includes("<AdminPanel")
        );
      })
      .map(rel);

    expect(withoutHeading).toEqual([]);

    // La delegación no puede ser hueca: quien recibe el encabezado tiene que pintarlo.
    const pageHeader = source("components/public/PageHeader.tsx");
    expect(pageHeader).toContain("<h1");
  });

  it("ningún SVG queda sin ocultar a lectores de pantalla ni sin nombre accesible", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const match of content.matchAll(/<svg[^>]*>/g)) {
        const tag = match[0];
        const index = match.index ?? 0;
        const context = content.slice(Math.max(0, index - 300), index);
        const selfLabelled = /aria-hidden|aria-label|role=|<title/.test(tag);
        // El patrón del proyecto envuelve el icono decorativo en `<span aria-hidden="true">`.
        const wrapped = /aria-hidden="true"[^>]*>\s*$/.test(context);
        if (!selfLabelled && !wrapped) offenders.push(`${rel(file)} :: ${tag.slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("las gráficas del dashboard llevan nombre accesible, tabla de datos y leyenda en texto", () => {
    const chart = source("components/dashboard/ChartFigure.tsx");
    // Nombre accesible para el dibujo + explicación + alternativa tabular abierta por teclado.
    expect(chart).toContain('role="img"');
    expect(chart).toContain("aria-label={summary}");
    expect(chart).toContain("<figcaption");
    expect(chart).toContain("<details");
    expect(chart).toContain("<table");
    expect(chart).toContain("<caption");

    // Toda gráfica con recharts pasa por `ChartFigure` (no hay gráficas sueltas sin alternativa).
    const chartFiles = files.filter((file) => /components[\\/]dashboard[\\/]/.test(file));
    const withRecharts = chartFiles.filter((file) =>
      readFileSync(file, "utf8").includes('from "recharts"'),
    );
    expect(withRecharts.length).toBeGreaterThanOrEqual(2);
    for (const file of withRecharts) {
      expect(readFileSync(file, "utf8")).toContain("ChartFigure");
    }

    // La leyenda se pinta en HTML (con texto), no solo con color dentro del SVG, y sus colores
    // salen de la paleta real (si alguien los cambiara por literales, este guardián lo caza).
    const legend = source("components/dashboard/ChartLegend.tsx");
    expect(legend).toContain("<ul");
    expect(legend).toContain("aria-hidden");
    expect(legend).toMatch(/primary:\s*PALETTE\.azure\b/);
    expect(legend).toMatch(/secondary:\s*PALETTE\["coral-text"\]/);
  });

  it("las tablas de datos declaran encabezados de columna y de fila", () => {
    for (const path of ["components/dashboard/TopResoldTable.tsx", "components/dashboard/ChartFigure.tsx"]) {
      const content = source(path);
      expect(content, path).toContain('scope="col"');
    }
    expect(source("components/dashboard/TopResoldTable.tsx")).toContain('scope="row"');
  });
});

describe("Accesibilidad · matemática del contraste (WCAG 2.1)", () => {
  it("blanco sobre negro = 21:1 y un color consigo mismo = 1:1", () => {
    expect(verifyWcagAA("#FFFFFF", "#000000").ratio).toBe(21);
    expect(verifyWcagAA("#0F6C9C", "#0F6C9C").ratio).toBe(1);
  });

  it("el umbral de texto grande es 3:1 y el de texto normal 4.5:1", () => {
    expect(verifyWcagAA("#FFFFFF", "#000000", true).minRequired).toBe(3);
    expect(verifyWcagAA("#FFFFFF", "#000000", false).minRequired).toBe(4.5);
  });

  it("los neutros medibles tienen hex declarado (white ≡ shell)", () => {
    expect(NEUTRAL_HEX.white).toBe("#FFFFFF");
    expect(NEUTRAL_HEX.white!.toLowerCase()).toBe(PALETTE.shell.toLowerCase());
  });
});
