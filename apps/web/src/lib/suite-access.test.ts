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

  it("los roles vNext de mantenimiento (F4) entran a su suite; los de ama de llaves aún no", () => {
    // F4 ya entregó la suite: el jefe (`HEAD_MAINTENANCE`) y el técnico (`MAINTENANCE_TECH`) tienen
    // su entrada. Las suites de ama de llaves (`HEAD_KEEPER`/`HOUSEKEEPER`) llegan en F6; hasta
    // entonces no se les ofrece ningún enlace para no darles un 403 en su primera llamada.
    expect(suiteLinksForRoles(["HEAD_MAINTENANCE"]).map((link) => link.key)).toEqual(["maintenance"]);
    expect(suiteLinksForRoles(["MAINTENANCE_TECH"]).map((link) => link.key)).toEqual(["maintenance"]);
    for (const role of ["HEAD_KEEPER", "HOUSEKEEPER"]) {
      expect(suiteLinksForRoles([role]), `${role} no debería tener suite todavía`).toEqual([]);
    }
  });
});
