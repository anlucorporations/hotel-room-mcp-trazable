import { describe, expect, it } from "vitest";
import { walletMenuItems } from "./wallet-menu-items";

/**
 * RF-40 / CU-40: el menú muestra Usuarios y Roles solo al owner; Seguridad y Salir a cualquier
 * operador; y en público solo acciones de wallet + acceso al back-office.
 */
describe("Entradas del menú de wallet/usuario (RF-40)", () => {
  const base = { hasSession: false, isOwner: false, isConnected: false, isWrongNetwork: false };

  it("en público ofrece conectar y el acceso al back-office", () => {
    const actions = walletMenuItems(base).map((item) => item.action);
    expect(actions).toEqual(["connect", "admin"]);
  });

  it("en público con wallet conectada ofrece desconectar", () => {
    const actions = walletMenuItems({ ...base, isConnected: true }).map((i) => i.action);
    expect(actions).toEqual(["disconnect", "admin"]);
  });

  it("en público con red incorrecta ofrece cambiar de red", () => {
    const actions = walletMenuItems({ ...base, isConnected: true, isWrongNetwork: true }).map(
      (i) => i.action,
    );
    expect(actions).toEqual(["switchNetwork", "admin"]);
  });

  it("recepción ve Seguridad y Salir, y el acceso a Front Office", () => {
    const actions = walletMenuItems({ ...base, hasSession: true, roles: ["RECEPTION_ROLE"] }).map((i) => i.action);
    expect(actions).toEqual(["connect", "suiteReception", "security", "signOut"]);
    expect(actions).not.toContain("users");
    expect(actions).not.toContain("roles");
    expect(actions).not.toContain("suiteAdmin");
  });

  it("housekeeping y mantenimiento ven su propia suite (D-77)", () => {
    expect(
      walletMenuItems({ ...base, hasSession: true, roles: ["HOUSEKEEPING"] }).map((i) => i.action),
    ).toEqual(["connect", "suiteHousekeeping", "security", "signOut"]);
    expect(
      walletMenuItems({ ...base, hasSession: true, roles: ["MAINTENANCE"] }).map((i) => i.action),
    ).toEqual(["connect", "suiteMaintenance", "security", "signOut"]);
  });

  it("el owner ve las cuatro suites, Usuarios y Roles además de Seguridad y Salir", () => {
    const actions = walletMenuItems({ ...base, hasSession: true, isOwner: true, roles: ["DEFAULT_ADMIN_ROLE"] }).map(
      (i) => i.action,
    );
    expect(actions).toEqual([
      "connect",
      "suiteAdmin",
      "suiteReception",
      "suiteHousekeeping",
      "suiteMaintenance",
      "security",
      "users",
      "roles",
      "signOut",
    ]);
  });

  it("las entradas de navegación llevan su ruta", () => {
    const items = walletMenuItems({ ...base, hasSession: true, isOwner: true, roles: ["DEFAULT_ADMIN_ROLE"] });
    const byAction = new Map(items.map((item) => [item.action, item.href]));
    expect(byAction.get("suiteAdmin")).toBe("/admin");
    expect(byAction.get("suiteReception")).toBe("/recepcion");
    expect(byAction.get("suiteHousekeeping")).toBe("/housekeeping");
    expect(byAction.get("suiteMaintenance")).toBe("/mantenimiento");
    expect(byAction.get("security")).toBe("/admin/seguridad");
    expect(byAction.get("users")).toBe("/admin/sistemas/usuarios");
    expect(byAction.get("roles")).toBe("/admin/roles");
  });
});
