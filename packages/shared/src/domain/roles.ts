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

/**
 * Roles de **operador de back-office** que viven en la base de datos (D-04, D-56).
 *
 * A diferencia de `RoleName` (roles del contrato), estos no existen on-chain. Se declaran aquí, en el
 * subpath isomorfo `@hotel/shared/domain`, para que los componentes de cliente puedan tipar sin
 * arrastrar el barril raíz (que reexporta módulos de servidor). Es la **fuente única**: el enum zod de
 * `env`, la validación del alta de operadores y el acceso a las suites se derivan de esta lista.
 *
 * Vocabulario (vNext · F1 · T1.5, alineado con `RepoTecnico/propuesta_vNext/diccionario_datos.md` §2 y
 * con el comentario de `admin_users.role` en `base_datos.sql`):
 *
 *   - `DEFAULT_ADMIN_ROLE` — el dueño del hotel.
 *   - `RECEPTION_ROLE` — recepción.
 *   - **`HEAD_MAINTENANCE`** — jefe de mantenimiento. **Con wallet**: es quien firma on-chain.
 *   - **`HEAD_KEEPER`** — ama de llaves. **Con wallet**: firma la inspección (opcional, D-C23).
 *   - **`MAINTENANCE_TECH`** — técnico a cargo del jefe. **Sin wallet**: usa el terminal con PIN.
 *   - **`HOUSEKEEPER`** — camarera a cargo del ama de llaves. **Sin wallet**: terminal con PIN.
 *   - `HOUSEKEEPING` y `MAINTENANCE` — **heredados** (D3): se conservan para no romper las cuentas
 *     existentes mientras se re-crean con los roles nuevos.
 *
 * **Nota de alcance (F1)**: las rutas de las suites de personal todavía exigen los roles heredados
 * (`/api/housekeeping/*`, `/api/mantenimiento/*`). Migrarlas a los roles nuevos es trabajo de **F4** y
 * **F6**, cuando se construyen esas suites con su matriz de permisos; hasta entonces los roles nuevos
 * pueden crearse y entrar, pero su suite aún no está habilitada.
 */
export const BACK_OFFICE_ROLE_NAMES = [
  "DEFAULT_ADMIN_ROLE",
  "RECEPTION_ROLE",
  "HEAD_MAINTENANCE",
  "HEAD_KEEPER",
  "MAINTENANCE_TECH",
  "HOUSEKEEPER",
  "HOUSEKEEPING",
  "MAINTENANCE",
] as const;

export type BackOfficeRoleName = (typeof BACK_OFFICE_ROLE_NAMES)[number];

/**
 * Roles de back-office **con wallet propia**: los únicos que pueden tener fila en `operator_wallets`.
 *
 * El CHECK de `operator_wallets.role` admite además `OWNER_BACKUP`, que **no** es un rol de
 * back-office: es la wallet de respaldo del Owner para emergencias (D-C13), registrada en la misma
 * tabla sin dar acceso al back-office.
 */
export const WALLET_BACK_OFFICE_ROLE_NAMES = ["HEAD_MAINTENANCE", "HEAD_KEEPER"] as const;

/**
 * Roles de **terminal fijo** (D-C17/D-C42): operan con PIN y **sin wallet**, así que nunca firman
 * on-chain. Se declaran aparte para que la UI y los guardianes distingan a los operarios de los jefes.
 */
export const TERMINAL_BACK_OFFICE_ROLE_NAMES = ["MAINTENANCE_TECH", "HOUSEKEEPER"] as const;

/** Roles **heredados** que se conservan por compatibilidad (D3) mientras se re-crean los usuarios. */
export const LEGACY_BACK_OFFICE_ROLE_NAMES = ["HOUSEKEEPING", "MAINTENANCE"] as const;
