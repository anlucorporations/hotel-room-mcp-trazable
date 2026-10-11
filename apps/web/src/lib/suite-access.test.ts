import { describe, expect, it } from "vitest";
import { suiteLinksForRoles } from "./suite-access";

/** D-76/D-77: el menú de Usuario ofrece a cada tipo de usuario solo sus suites. */
describe("accesos a suites por rol (D-76/D-77)", () => {
  it("sin sesión no ofrece ninguna suite", () => {
    expect(suiteLinksForRoles([], false)).toEqual([]);
  });

  it("el owner entra a las cuatro suites, en orden", () => {
    const keys = suiteLinksForRoles(["DEFAULT_ADMIN_ROLE"], true).map((link) => link.key);
    expect(keys).toEqual(["admin", "reception", "housekeeping", "maintenance"]);
  });

  it("recepción solo entra a Front Office", () => {
    expect(suiteLinksForRoles(["RECEPTION_ROLE"]).map((link) => link.key)).toEqual(["reception"]);
  });

  it("housekeeping y mantenimiento entran a su propia ruta", () => {
    expect(suiteLinksForRoles(["HOUSEKEEPING"]).map((link) => link.key)).toEqual(["housekeeping"]);
    expect(suiteLinksForRoles(["MAINTENANCE"]).map((link) => link.key)).toEqual(["maintenance"]);
  });

  it("los roles de back-office sin suite propia entran por Administración", () => {
    expect(suiteLinksForRoles(["MINTER_ROLE"]).map((link) => link.key)).toEqual(["admin"]);
    expect(suiteLinksForRoles(["BURNER_ROLE", "PAUSER_ROLE"]).map((link) => link.key)).toEqual(["admin"]);
  });

  it("las rutas apuntan a la entrada de cada suite", () => {
    const byKey = new Map(suiteLinksForRoles(["DEFAULT_ADMIN_ROLE"], true).map((l) => [l.key, l.href]));
    expect(byKey.get("admin")).toBe("/admin");
    expect(byKey.get("reception")).toBe("/recepcion");
    expect(byKey.get("housekeeping")).toBe("/housekeeping");
    expect(byKey.get("maintenance")).toBe("/mantenimiento");
  });

  it("los roles nuevos de la vNext todavía NO tienen suite (decisión explícita, no un olvido)", () => {
    // F1 (T1.5) añade el vocabulario `HEAD_MAINTENANCE`, `HEAD_KEEPER`, `MAINTENANCE_TECH` y
    // `HOUSEKEEPER`. Sus suites (`/ama-de-llaves` y la nueva `/mantenimiento` con la matriz de
    // permisos del plan) llegan en **F6** y **F4**; hasta entonces no se les ofrece ningún enlace:
    // enseñarles la suite heredada les daría un 403 en su primera llamada. Esta prueba es el
    // recordatorio: cuando F4/F6 entregan las suites, hay que cambiarla a propósito.
    for (const role of ["HEAD_MAINTENANCE", "HEAD_KEEPER", "MAINTENANCE_TECH", "HOUSEKEEPER"]) {
      expect(suiteLinksForRoles([role]), `${role} no debería tener suite todavía`).toEqual([]);
    }
  });
});
