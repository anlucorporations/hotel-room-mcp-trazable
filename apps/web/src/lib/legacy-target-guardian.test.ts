import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guardián de D-07: un **único destino** on-chain y **un único camino de firma**.
 *
 * Contexto (hallazgo H-02 de la auditoría V5): la revisión de la compra decodificaba el calldata
 * del contrato canónico `HotelNights` mientras la firma se enviaba al `HotelMarketplace` legacy
 * —otro contrato, otra generación—. La aplicación tenía dos verdades y firmaba la equivocada.
 * Esa generación **ya no existe** en el repositorio (retirada en M9, ADR-02/D-02), pero el
 * guardián se mantiene: el riesgo que cierra no era «el legacy» en concreto, sino un **segundo
 * destino on-chain** invisible para la revisión.
 *
 * La **verificación adversarial de M4** demostró que un guardián limitado a cuatro carpetas y a
 * una comprobación de texto se dejaba burlar de varias formas. Este guardián cierra esas vías y
 * vigila cuatro invariantes sobre TODO `apps/web/src` (solo se excluyen los ficheros de prueba,
 * que usan direcciones ficticias a propósito):
 *
 *   1. Ninguna referencia a la generación legacy (`hotelMarketplaceAbi`, `hotelNftAbi`,
 *      `marketplaceAddress`, `listForSale`, `cancelListing`) en el código de la web: ni viva ni
 *      reintroducida.
 *   2. Toda llamada a `sendTransaction(...)` pasa por `verifiedTxRequest(...)`: no puede aparecer
 *      un segundo camino de firma.
 *   3. Las direcciones `0x…40` literales solo pueden vivir en `config/chain.ts`; en cualquier otro
 *      sitio una dirección hardcodeada sería un segundo destino invisible.
 *   4. `config/chain.ts` expone un único destino de escritura (más el faucet de pruebas).
 */

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, "..");
const REPO_ROOT = resolve(SRC, "..", "..", "..");

const EXTENSIONS = [".ts", ".tsx"];
/** Único fichero donde se permite escribir una dirección literal (configuración de la app). */
const ADDRESS_LITERAL_ALLOWLIST = new Set(["config/chain.ts"]);

/** Identificadores de la generación legacy (D-02). Ninguno puede sobrevivir en la web. */
const LEGACY_IDENTIFIERS: ReadonlyArray<{ readonly name: string; readonly pattern: RegExp }> = [
  { name: "hotelMarketplaceAbi", pattern: /hotelMarketplaceAbi/ },
  { name: "hotelNftAbi", pattern: /hotelNftAbi/ },
  { name: "marketplaceAddress", pattern: /marketplaceAddress/i },
  { name: "NEXT_PUBLIC_MARKETPLACE_ADDRESS", pattern: /NEXT_PUBLIC_MARKETPLACE_ADDRESS/ },
  { name: "listForSale", pattern: /listForSale/ },
  { name: "cancelListing", pattern: /cancelListing/ },
];

/** Todas las fuentes de `apps/web/src` (recursivo), sin los ficheros de prueba. */
function collectSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
      if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
      out.push(full);
    }
  };
  walk(SRC);
  return out;
}

function rel(file: string): string {
  return relative(SRC, file).split("\\").join("/");
}

const SOURCES = collectSourceFiles().map((file) => ({ path: rel(file), content: readFileSync(file, "utf8") }));

describe("guardián de destino único y firma única (D-07)", () => {
  it("ningún módulo de la web referencia la generación legacy de contratos", () => {
    const offenders: string[] = [];

    for (const { path, content } of SOURCES) {
      for (const { name, pattern } of LEGACY_IDENTIFIERS) {
        if (pattern.test(content)) offenders.push(`${path} → ${name}`);
      }
    }

    expect(
      offenders,
      `D-07 exige un único destino on-chain (HotelNights). Estas referencias son de la ` +
        `generación legacy HotelNFT/HotelMarketplace, retirada del repositorio en M9:\n  ` +
        offenders.join("\n  "),
    ).toEqual([]);
  });

  it("toda firma de transacción pasa por el objeto verificado (no hay segundo camino)", () => {
    const offenders: string[] = [];

    for (const { path, content } of SOURCES) {
      const calls = content.match(/sendTransaction\(/g) ?? [];
      if (calls.length === 0) continue;
      const verifiedCalls = content.match(/sendTransaction\(verifiedTxRequest\(/g) ?? [];
      if (calls.length !== verifiedCalls.length) offenders.push(`${path} (${calls.length} llamadas)`);
    }

    expect(
      offenders,
      `Toda firma debe enviar el objeto verificado contra el contrato canónico ` +
        `(\`sendTransaction(verifiedTxRequest(tx, contractAddress))\`). Ficheros con alguna ` +
        `llamada fuera de ese camino:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("solo `config/chain.ts` contiene direcciones literales (ningún segundo destino oculto)", () => {
    const offenders: string[] = [];

    for (const { path, content } of SOURCES) {
      if (ADDRESS_LITERAL_ALLOWLIST.has(path)) continue;
      const matches = content.match(/0x[0-9a-fA-F]{40}/g) ?? [];
      if (matches.length > 0) offenders.push(`${path} → ${matches.join(", ")}`);
    }

    expect(
      offenders,
      `Una dirección literal fuera de la configuración es un destino alternativo invisible para ` +
        `la revisión: usa \`contractAddress\`/\`faucetAddress\` de \`@/config/chain\`.\n  ` +
        offenders.join("\n  "),
    ).toEqual([]);
  });

  it("`config/chain.ts` solo expone el contrato canónico (y el faucet de pruebas)", () => {
    const chainTs = readFileSync(join(SRC, "config", "chain.ts"), "utf8");
    const exported = [...chainTs.matchAll(/export const (\w*[Aa]ddress\w*)/g)].map((m) => m[1]);

    // Un segundo destino de compra/escritura es exactamente el fallo que D-07 cierra.
    expect(new Set(exported)).toEqual(new Set(["contractAddress", "faucetAddress"]));
  });

  it("la firma de la compra envía el objeto verificado contra el contrato canónico", () => {
    const hook = readFileSync(join(SRC, "components", "buy", "useBuyNight.ts"), "utf8");

    expect(hook).toMatch(/sendTransaction\(verifiedTxRequest\(tx, contractAddress\)\)/);
    // Ni re-codificación por ABI/args ni destino propio: eso reabriría la grieta H-02.
    expect(hook).not.toMatch(/abi:|args:|functionName:/);
  });

  it("reventa y cobro escriben contra el contrato canónico", () => {
    for (const file of ["useListNight.ts", "useClaim.ts"]) {
      const source = readFileSync(join(SRC, "components", "my-nights", file), "utf8");
      expect(source, `${file} debe importar el contrato canónico`).toMatch(
        /import \{ contractAddress \} from "@\/config\/chain"/,
      );
      expect(source, `${file} debe usar el ABI canónico`).toMatch(
        /import \{ hotelNightsAbi \} from "@hotel\/shared\/abi"/,
      );
    }
  });

  it("la app no declara el marketplace legacy en su configuración de entorno", () => {
    const envExample = readFileSync(resolve(REPO_ROOT, ".env.example"), "utf8");
    const declared = envExample.match(/^NEXT_PUBLIC_MARKETPLACE_ADDRESS=/m);

    // En `.env.example` solo puede aparecer comentada (documentando su retirada, D-07).
    expect(declared, "NEXT_PUBLIC_MARKETPLACE_ADDRESS no debe declararse activa").toBeNull();
  });
});
