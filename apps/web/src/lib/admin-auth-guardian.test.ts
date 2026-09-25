import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guardián del **acceso de lectura** al back-office (M7 · H1).
 *
 * La verificación adversarial de M7 demostró con el build real que `/admin/dashboard` respondía
 * HTTP 200 **sin cookies** con todo el payload de agregados dentro del flujo RSC, mientras
 * `/api/admin/metrics` devolvía 401. La causa: el gate del layout solo miraba si la cookie EXISTÍA y,
 * en el App Router, la página se renderiza igualmente (el layout decide si la pinta o no).
 *
 * Este guardián fija las dos mitades del arreglo, sobre el código real:
 *   1. el layout verifica la VALIDEZ de la sesión (no la presencia de la cookie);
 *   2. cada página que LEE datos comprueba la sesión ANTES de leerlos (defensa en profundidad:
 *      ocultar el árbol no impide que se renderice).
 */
const read = (path: string): string =>
  readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

describe("Guardián de sesión en el render del back-office (M7 · H1)", () => {
  it("el gate del layout comprueba la VALIDEZ de la sesión, no la existencia de la cookie", () => {
    const layout = read("app/admin/layout.tsx");

    expect(layout).toContain("currentAdminSession()");
    expect(layout).not.toMatch(/hasSessionCookie|cookies\(\)\.get\(/);
    expect(layout).toMatch(/if \(!session\.ok\) return <AdminSignInScreen \/>/);
  });

  it("la comprobación de sesión del render usa el guard de las rutas de API (firma + caducidad + blocklist)", () => {
    const helper = read("lib/admin-session.ts");

    expect(helper).toContain("authorize(");
    expect(helper).toContain("cookies()");
    // Falla en cerrado: sin cookies no hay sesión que autorizar.
    expect(helper).toMatch(/cookieHeader\.length === 0/);
  });

  it("la página del dashboard comprueba la sesión ANTES de leer los agregados", () => {
    const page = read("app/admin/dashboard/page.tsx");

    const sessionCheck = page.indexOf("currentAdminSession()");
    const dataRead = page.indexOf("fetchAggregates()");

    expect(sessionCheck).toBeGreaterThan(-1);
    expect(dataRead).toBeGreaterThan(-1);
    expect(sessionCheck).toBeLessThan(dataRead);
    expect(page).toMatch(/if \(!session\.ok\) return <AdminSignInScreen \/>/);
  });

  it("ninguna otra página del back-office lee datos en el servidor (las que lo hagan deben gatear)", () => {
    // Las demás pantallas son componentes de cliente que consumen rutas de API ya protegidas
    // (`requireRole`). Si alguna pasa a leer datos en el servidor, este guardián obliga a decidirlo
    // explícitamente en lugar de dejar la fuga abierta por descuido.
    const pages = [
      "app/admin/caducadas/page.tsx",
      "app/admin/fondos/page.tsx",
      "app/admin/mint/page.tsx",
      "app/admin/pausa/page.tsx",
      "app/admin/roles/page.tsx",
      "app/admin/royalty/page.tsx",
    ];
    for (const page of pages) {
      const source = read(page);
      expect(source, `${page} no debe leer datos en el servidor`).not.toMatch(/await fetch|fetchAggregates|nftsRepo/);
    }
  });
});
