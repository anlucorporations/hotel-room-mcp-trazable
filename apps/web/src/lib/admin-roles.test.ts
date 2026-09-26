import { describe, expect, it } from "vitest";
import type { RoleName } from "@hotel/shared/domain";
import { roleSatisfies, sessionAllows } from "./admin-roles";

/**
 * D-30 / CU-30: el owner (`DEFAULT_ADMIN_ROLE`) debe habilitar TODOS los paneles; los demás roles,
 * solo los suyos. La autoridad real sigue siendo el contrato, pero este gating no puede volver a
 * dejar al owner fuera de su propio back-office.
 */
describe("Política de gating de roles del back-office (D-30)", () => {
  const OPERATIONAL: readonly RoleName[] = [
    "MINTER_ROLE",
    "RECEPTION_ROLE",
    "PAUSER_ROLE",
    "BURNER_ROLE",
    "TREASURER_ROLE",
  ];

  it("el owner satisface cualquier rol requerido", () => {
    for (const required of OPERATIONAL) {
      expect(roleSatisfies(["DEFAULT_ADMIN_ROLE"], required), required).toBe(true);
    }
  });

  it("un rol operativo solo se satisface a sí mismo", () => {
    expect(roleSatisfies(["MINTER_ROLE"], "MINTER_ROLE")).toBe(true);
    expect(roleSatisfies(["MINTER_ROLE"], "PAUSER_ROLE")).toBe(false);
    expect(roleSatisfies(["TREASURER_ROLE"], "BURNER_ROLE")).toBe(false);
  });

  it("recepción NUNCA se eleva a los paneles de administración", () => {
    expect(roleSatisfies(["RECEPTION_ROLE"], "DEFAULT_ADMIN_ROLE")).toBe(false);
    expect(roleSatisfies(["RECEPTION_ROLE"], "MINTER_ROLE")).toBe(false);
    expect(roleSatisfies(["RECEPTION_ROLE"], "TREASURER_ROLE")).toBe(false);
  });

  it("sin roles no se satisface nada", () => {
    expect(roleSatisfies([], "MINTER_ROLE")).toBe(false);
    expect(roleSatisfies([], "DEFAULT_ADMIN_ROLE")).toBe(false);
  });

  it("un requisito nulo (panel de visor) lo satisface cualquier sesión", () => {
    expect(sessionAllows([], null)).toBe(true);
    expect(sessionAllows(["RECEPTION_ROLE"], null)).toBe(true);
    expect(sessionAllows(["DEFAULT_ADMIN_ROLE"], null)).toBe(true);
  });

  it("un requisito concreto sigue filtrando a las sesiones sin ese rol", () => {
    expect(sessionAllows(["RECEPTION_ROLE"], "MINTER_ROLE")).toBe(false);
    expect(sessionAllows(["DEFAULT_ADMIN_ROLE"], "MINTER_ROLE")).toBe(true);
  });
});
