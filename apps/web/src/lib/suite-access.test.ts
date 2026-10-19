import { describe, expect, it } from "vitest";
import { suiteLinksForRoles } from "./suite-access";

/** D-76/D-77: el menú de Usuario ofrece a cada tipo de usuario solo sus suites. */
describe("accesos a suites por rol (D-76/D-77)", () => {
  it("sin sesión no ofrece ninguna suite", () => {
    expect(suiteLinksForRoles([], false)).toEqual([]);
  });

  it("el owner entra a las cinco suites, en orden", () => {
    const keys = suiteLinksForRoles(["DEFAULT_ADMIN_ROLE"], true).map((link) => link.key);
    expect(keys).toEqual(["admin", "reception", "housekeeping", "maintenance", "keepers"]);
  });

  it("recepción solo entra a Front Office", () => {
    expect(suiteLinksForRoles(["RECEPTION_ROLE"]).map((link) => link.key)).toEqual(["reception"]);
  });

  it("housekeeping (D-C40) y mantenimiento entran a su ruta", () => {
    // `/housekeeping` redirige de forma permanente a la suite vNext: el enlace va al destino final.
    expect(suiteLinksForRoles(["HOUSEKEEPING"]).map((link) => link.key)).toEqual(["keepers"]);
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

  it("los roles vNext de mantenimiento (F4) y de ama de llaves (F6) entran a su suite", () => {
    expect(suiteLinksForRoles(["HEAD_MAINTENANCE"]).map((link) => link.key)).toEqual(["maintenance"]);
    expect(suiteLinksForRoles(["MAINTENANCE_TECH"]).map((link) => link.key)).toEqual(["maintenance"]);
    expect(suiteLinksForRoles(["HEAD_KEEPER"]).map((link) => link.key)).toEqual(["keepers"]);
    expect(suiteLinksForRoles(["HOUSEKEEPER"]).map((link) => link.key)).toEqual(["keepers"]);
  });

  it("D-C40: el rol heredado y los vNext entran a /ama-de-llaves", () => {
    expect(suiteLinksForRoles(["HEAD_KEEPER"])[0]?.href).toBe("/ama-de-llaves");
    // `/housekeeping` redirige de forma permanente a `/ama-de-llaves`: el enlace va al destino final.
    expect(suiteLinksForRoles(["HOUSEKEEPING"]).map((link) => link.key)).toEqual(["keepers"]);
    expect(suiteLinksForRoles(["HOUSEKEEPING"])[0]?.href).toBe("/ama-de-llaves");
  });
});
