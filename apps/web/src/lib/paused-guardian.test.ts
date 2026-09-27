import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guardián de la deuda de M7: **ninguna vista de compra ofrece una operación que la cadena va a
 * revertir por pausa**.
 *
 * La verificación adversarial de M4 lo anotó así: «ninguna vista filtra `whenNotPaused`: con el
 * contrato en pausa se ofrecen compras que revierten con `EnforcedPause`». El contrato lleva
 * `whenNotPaused` en `buy` y `buyResale` (y en `mint`/`markCheckedIn`/`burnExpired`), así que las
 * dos vistas de compra leen `paused()` y retiran sus botones cuando esté en pausa.
 *
 * ALCANCE (precisado tras la verificación de M7 · H4): las vistas de COMPRA son las que se protegen
 * aquí. Recepción y el back-office de minteo son pantallas de personal y siguen mostrando el revert
 * como mensaje de error —corregido para que se diagnostique como pausa y no como avería de
 * anclaje—; llevarlas a leer `paused()` en el cliente queda anotado como deuda de M8.
 *
 * Los invariantes se comprueban sobre el código real (no se renderiza React en el entorno de
 * pruebas de la web, que es Node).
 */
const read = (path: string): string =>
  readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

describe("Guardián de pausa del contrato (M7)", () => {
  it("existe una lectura on-chain de `paused()` sobre el contrato canónico", () => {
    const nights = read("lib/nights.ts");
    expect(nights).toContain("export async function fetchContractPaused");
    expect(nights).toContain('functionName: "paused"');
    expect(nights).toContain("contractAddress");
  });

  it("el catálogo primario lee la pausa y la pasa a la vista", () => {
    // F6 · D-31: el catálogo se trasladó de `/` a `/catalogo` al convertirse `/` en la home.
    const page = read("app/catalogo/page.tsx");
    expect(page).toContain("fetchContractPaused(");
    expect(page).toMatch(/<CatalogClient[^>]*paused=\{paused\}/);
  });

  it("la vista de reventa lee la pausa y la pasa a la vista", () => {
    const page = read("app/reventa/page.tsx");
    expect(page).toContain("fetchContractPaused(");
    expect(page).toMatch(/<ResaleMarketClient[^>]*paused=\{paused\}/);
  });

  it("en pausa, el botón de compra se retira de la tarjeta (no se ofrece lo que revertiría)", () => {
    const card = read("components/NightCard.tsx");
    expect(card).toMatch(/paused\?: boolean/);
    // El botón de compra vive en la rama «no pausado» de la condición.
    expect(card).toMatch(/\{paused \?[\s\S]{0,700}?<BuyButton/);
  });

  it("las dos vistas propagan el estado de pausa a las tarjetas", () => {
    expect(read("components/CatalogClient.tsx")).toMatch(/paused=\{paused === true\}/);
    expect(read("components/resale/ResaleMarketClient.tsx")).toMatch(/paused=\{paused === true\}/);
  });

  it("el aviso distingue «en pausa» de «no se pudo comprobar»", () => {
    const banner = read("components/ContractPausedBanner.tsx");
    expect(banner).toContain('data-testid={isPaused ? "contract-paused" : "contract-paused-unknown"}');
    expect(banner).toContain("unknownTitle");
  });

  /**
   * H9 de la verificación de M7: si la lectura de `paused()` fuera dentro del MISMO `Promise.all`
   * que la del catálogo, un fallo de `paused()` dejaría `nights = null` y la vista entera caería a
   * estado degradado, dejando la rama «no se pudo comprobar» inalcanzable. Las dos lecturas se
   * resuelven por separado (`allSettled`).
   */
  it("las vistas resuelven la pausa y los datos por separado (la rama «desconocida» es alcanzable)", () => {
    for (const page of ["app/catalogo/page.tsx", "app/reventa/page.tsx"]) {
      const source = read(page);
      expect(source, page).toContain("Promise.allSettled(");
      expect(source, page).toMatch(/pausedResult\.status === "fulfilled"/);
    }
  });

  /**
   * H4 de la verificación: la pausa también afecta a `markCheckedIn`, y el revert se reportaba como
   * `ANCLAJE_FALLIDO` (502, «RPC o wallet»), que mandaba a recepción a buscar el problema donde no
   * estaba. Ahora se diagnostica como lo que es.
   */
  it("el revert de pausa en el check-in se diagnostica como pausa, no como anclaje roto", () => {
    const service = readFileSync(
      fileURLToPath(new URL("../../../../packages/shared/src/reception/service.ts", import.meta.url)),
      "utf8",
    );
    expect(service).toContain('revert === "EnforcedPause"');
    expect(service).toContain("CONTRATO_EN_PAUSA");

    const route = read("app/api/reception/checkin/route.ts");
    expect(route).toContain("CONTRATO_EN_PAUSA: 503");
  });

  /**
   * H5 de la verificación: la pantalla de fondos bloqueaba `withdraw` con la premisa falsa de que es
   * `whenNotPaused`. El contrato NO lo pausa (`onlyRole(TREASURER_ROLE) nonReentrant`) y su propio
   * test lo declara permitido en pausa como vía de remediación.
   */
  it("la retirada de fondos no se bloquea por pausa (el contrato la permite)", () => {
    const funds = read("components/admin/AdminFunds.tsx");

    expect(funds).toContain("disabled={busy || nothingToWithdraw}");
    expect(funds).not.toContain("|| isPaused");
    expect(funds).toContain("fundsPausedWithdrawAllowed");
  });

  /**
   * H4 de la verificación de M7 (cerrado en M8): las pantallas de PERSONAL también leen `paused()`.
   * `AdminMint` (minteo) y `/recepcion` (check-in) mostraban el revert de pausa como error de RPC o
   * de anclaje; ahora avisan y retiran sus botones, igual que las vistas de compra.
   */
  it("las pantallas de personal (minteo y recepción) también respetan la pausa", () => {
    const mint = read("components/admin/AdminMint.tsx");
    expect(mint).toContain('functionName: "paused"');
    expect(mint).toContain("disabled={busy || isPaused}");
    expect(mint).toContain('data-testid="mint-paused"');

    // El check-in vive ahora en `CheckInPanel` (incremento v2): la página delega en él.
    const reception = read("components/reception/CheckInPanel.tsx");
    expect(reception).toContain('functionName: "paused"');
    expect(reception).toContain("disabled={loading || !ticketJws.trim() || isPaused}");
    expect(reception).toContain("disabled={loading || isPaused");
    expect(reception).toContain('data-testid="reception-paused"');
  });
});
