import { keccak256, stringToBytes, type Hex } from "viem";

/**
 * Identificadores de los roles de AccessControl (ADR-06, docs/PRD.md §4 (RF-18a, docs/SRS.md §9)).
 *
 * Cada id coincide con el del contrato (`keccak256("<ROLE>")`), de modo que esta tabla es
 * la fuente única usada por el deploy, los tests y el back-office. `DEFAULT_ADMIN_ROLE` es
 * el `bytes32(0)` que define OpenZeppelin. `RECEPTION_ROLE` habilita el check-in (D-05) y
 * NO existe rol de royalty: con D-06 el royalty es inmutable y se deriva del tipo de
 * habitación, así que ningún rol puede alterarlo.
 */
export const DEFAULT_ADMIN_ROLE: Hex = `0x${"00".repeat(32)}`;

/** Roles operativos (además de `DEFAULT_ADMIN_ROLE`). */
export const OPERATIONAL_ROLE_NAMES = [
  "MINTER_ROLE",
  "RECEPTION_ROLE",
  "PAUSER_ROLE",
  "BURNER_ROLE",
  "TREASURER_ROLE",
] as const;

export type OperationalRoleName = (typeof OPERATIONAL_ROLE_NAMES)[number];
export type RoleName = OperationalRoleName | "DEFAULT_ADMIN_ROLE";

const computeRoleId = (name: OperationalRoleName): Hex =>
  keccak256(stringToBytes(name));

/** Mapa nombre→id de los 6 roles del contrato. */
export const ROLES: Readonly<Record<RoleName, Hex>> = Object.freeze({
  DEFAULT_ADMIN_ROLE,
  MINTER_ROLE: computeRoleId("MINTER_ROLE"),
  RECEPTION_ROLE: computeRoleId("RECEPTION_ROLE"),
  PAUSER_ROLE: computeRoleId("PAUSER_ROLE"),
  BURNER_ROLE: computeRoleId("BURNER_ROLE"),
  TREASURER_ROLE: computeRoleId("TREASURER_ROLE"),
});

/** Los 6 roles, en orden, para iterar en deploy/tests. */
export const ALL_ROLE_NAMES: readonly RoleName[] = [
  "DEFAULT_ADMIN_ROLE",
  ...OPERATIONAL_ROLE_NAMES,
];
