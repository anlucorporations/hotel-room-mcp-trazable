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
export * from "./domain/room-registry";
export * from "./domain/token-id";
export * from "./domain/night-state";
export * from "./domain/aggregates";
export * from "./domain/purchase-tx";
export * from "./domain/ipfs";
export * from "./domain/faucet";
export * from "./domain/maintenance";
export * from "./deployments/schema";
export * from "./logger";

// Módulos backend de persistencia, auth, redis, tasas y health checks
export * from "./env/index";
export * from "./db/pool";
export * from "./db/migrator";
export * from "./db/repositories/activities.repository";
export * from "./db/repositories/content.repository";
export * from "./db/repositories/housekeeping.repository";
export * from "./db/repositories/maintenance.repository";
export * from "./db/repositories/nfts.repository";
export * from "./db/repositories/reservations.repository";
export * from "./db/repositories/reviews.repository";
export * from "./db/repositories/rooms.repository";
export * from "./db/repositories/settings.repository";
export * from "./db/repositories/sessions.repository";
export * from "./db/repositories/users.repository";
export * from "./db/repositories/reception.repository";
export * from "./redis/client";
export * from "./auth/crypto";
export * from "./auth/service";
export * from "./rates/exchange-service";
export * from "./health/service";
export * from "./queue/notifications";
export * from "./burner/service";
export * from "./events/listener";
export * from "./passes/jws";
export * from "./reception/service";
export * from "./reception/recovery-code";
export * from "./reception/day-board";
export * from "./reception/checkout-vocabulary";
export * from "./reception/errors";
export * from "./push/service";
export * from "./push/web-push";
export * from "./backup/service";
export * from "./fiat-onramp/service";
export * from "./pms/adapter";
// Retención de datos (M9 · ADR-24): purga de sesiones caducadas, códigos huérfanos y correos viejos.
export * from "./maintenance/retention";
