/**
 * `@hotel/shared` — fuente única del monorepo.
 *
 * Exporta la parte **isomórfica** (constantes, tipos, dominio, red, esquema de despliegue).
 * Los módulos que dependen de Node se exponen en subpaths separados (ISP):
 *   - `@hotel/shared/env`         — secret manager (process.env)
 *   - `@hotel/shared/deployments` — lector del registro de despliegues (fs)
 */
export * from "./constants";
export * from "./network";
export * from "./domain/types";
export * from "./domain/roles";
export * from "./domain/room-master";
export * from "./domain/token-id";
export * from "./domain/night-state";
export * from "./domain/aggregates";
export * from "./domain/purchase-tx";
export * from "./domain/ipfs";
export * from "./domain/faucet";
export * from "./deployments/schema";
