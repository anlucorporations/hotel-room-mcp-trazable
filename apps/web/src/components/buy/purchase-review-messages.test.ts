import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guardián §35 (mitad UI) — **el paso «Revisar» distingue «noche ya vendida» de «fallo de red»**.
 *
 * El mensaje histórico «No pudimos verificar el precio on-chain. Comprueba tu conexión…» se servía
 * también cuando la cadena respondía con salud que la noche estaba VENDIDA (índice desfasado): el
 * huésped revisaba su wifi ante un problema de inventario. La corrección añade al hook una lectura
 * auxiliar `soldOnce` (solo primaria) y dos ramas nuevas en catálogo y asistente. No se renderiza
 * React en este entorno (Node), así que los invariantes se fijan sobre el código real —mismo estilo
 * que `paused-guardian.test.ts`— y cada prohibición apunta a la cadena exacta que debe existir.
 */
/** Raíz `src/` del paquete web, desde este fichero (`src/components/buy/`). */
const SRC = new URL("../../", import.meta.url);
const read = (relativeFromSrc: string): string =>
  readFileSync(fileURLToPath(new URL(relativeFromSrc, SRC)), "utf8");

describe("usePurchaseReview expende soldOnceState (§35)", () => {
  const hook = read("components/buy/usePurchaseReview.ts");

  it("lee `soldOnce` on-chain como lectura auxiliar, solo para primaria", () => {
    expect(hook).toContain('functionName: "soldOnce"');
    // Habilitada SOLO si hay tokenId y NO es reventa (la autoridad de reventa es `listingOf`).
    expect(hook).toMatch(/enabled: callTokenId !== undefined && !isResale/);
  });

  it("publica el estado en tres valores sin colapsar «no se pudo leer»", () => {
    expect(hook).toMatch(/export type SoldOnceState = "unknown" \| "checking" \| "sold" \| "free"/);
    expect(hook).toMatch(/readonly soldOnceState: SoldOnceState/);
    // Reventa → "unknown" explícito.
    expect(hook).toMatch(/const soldOnceState: SoldOnceState = isResale\s*\?\s*"unknown"/);
  });
});

describe("BuyButton muestra la verdad según soldOnceState (§35)", () => {
  const button = read("components/buy/BuyButton.tsx");

  it("en verifyFailed, sustituye el mensaje de red por «noche vendida» si la cadena lo confirmó", () => {
    expect(button).toMatch(
      /review\.soldOnceState === "sold" \? t\("nightAlreadySold"\) : t\("verifyFailed"\)/,
    );
  });

  it("ofrece elegir otra noche (enlace al catálogo) cuando está vendida", () => {
    expect(button).toContain('data-testid="review-pick-another"');
    expect(button).toMatch(/href="\/catalogo"/);
    expect(button).toContain('t("pickAnotherNight")');
  });

  it("avisa de la noche vendida AUNQUE la verificación de precio haya cerrado (rama nueva)", () => {
    expect(button).toContain('data-testid="review-night-sold"');
    expect(button).toMatch(
      /!review\.verifyFailed && review\.soldOnceState === "sold" &&/,
    );
  });

  it("conserva el botón de reintento para el fallo de lectura puro", () => {
    expect(button).toContain('data-testid="review-verify-retry"');
  });
});

describe("PurchaseHandoff aplica la misma distinción (§35)", () => {
  const handoff = read("components/assistant/PurchaseHandoff.tsx");

  it("distingue «noche vendida» del fallo de verificación", () => {
    expect(handoff).toMatch(
      /review\.soldOnceState === "sold" \? t\("handoff\.nightAlreadySold"\) : t\("handoff\.verifyFailed"\)/,
    );
    expect(handoff).toContain('data-testid="handoff-night-sold"');
  });

  it("oculta el reintento cuando la cadena ya respondió que está vendida", () => {
    expect(handoff).toMatch(/review\.soldOnceState !== "sold" && \(\s*<button[\s\S]{0,240}handoff-verify-retry/);
  });
});

describe("i18n: las claves nuevas existen en ES/EN/RU no vacías (§35)", () => {
  const keys = ["buy.nightAlreadySold", "buy.pickAnotherNight", "assistant.handoff.nightAlreadySold"];
  for (const locale of ["es", "en", "ru"]) {
    const catalog = JSON.parse(
      readFileSync(fileURLToPath(new URL(`../../../messages/${locale}.json`, import.meta.url)), "utf8"),
    ) as Record<string, Record<string, unknown>>;
    for (const key of keys) {
      it(`${locale}: ${key}`, () => {
        const parts = key.split(".");
        const [ns] = parts;
        if (ns === undefined) throw new Error(`clave i18n mal formada: ${key}`);
        let value: unknown = catalog[ns];
        for (const part of parts.slice(1)) {
          value = (value as Record<string, unknown> | undefined)?.[part];
        }
        expect(typeof value).toBe("string");
        expect((value as string).trim().length).toBeGreaterThan(0);
      });
    }
  }
});
