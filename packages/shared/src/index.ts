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
export * from "./domain/mint-window";
export * from "./domain/token-id";
export * from "./domain/night-state";
export * from "./domain/aggregates";
export * from "./domain/index-integrity";
export * from "./domain/purchase-tx";
export * from "./domain/ipfs";
export * from "./domain/faucet";
export * from "./domain/maintenance";
// Vocabulario canónico de estados y tipos de entidad (vNext · F1 · T1.6).
export * from "./domain/operations-state";
// Regla única de habitación vendible en el canal público (2026-10-18): la comparten catálogo,
// reserva pública y recepción para no ofrecer noches de habitaciones no administradas.
export * from "./domain/room-sellability";
// Reconciliación habitaciones (2026-10-18): plan de siembra, auditoría rooms↔cadena y purga del
// índice heredado. La usa el script `reconcile-rooms.ts` (job de Cloud Run).
export * from "./domain/room-reconciliation";
// Cargos por daños (F7): estados/plazos de notificación, resolución y retención de evidencias.
export * from "./domain/damage-charges";
// Suite Ama de llaves (F6): reglas puras de inspección (firma opcional por flag), efectos sobre la
// habitación/asignación y tablero de los cinco estados canónicos + marca de mantenimiento.
export * from "./domain/housekeeping";
// Motor EIP-712 de operaciones (vNext · F2 · T2.6/T2.9): isomorfo (solo `viem`), para que la app y el
// worker firmen/verifiquen exactamente el mensaje que valida el contrato.
export * from "./operations/index";
export * from "./deployments/schema";
export * from "./logger";

// Módulos backend de persistencia, auth, redis, tasas y health checks
export * from "./env/index";
export * from "./db/pool";
export * from "./db/migrator";
export * from "./db/repositories/activities.repository";
export * from "./db/repositories/audit.repository";
export * from "./db/repositories/content.repository";
export * from "./db/repositories/housekeeping.repository";
export * from "./db/repositories/damage-charges.repository";
export * from "./db/repositories/maintenance.repository";
export * from "./db/repositories/nfts.repository";
export * from "./db/repositories/operations.repository";
export * from "./db/repositories/reservations.repository";
export * from "./db/repositories/reviews.repository";
export * from "./db/repositories/rooms.repository";
export * from "./db/repositories/terminal-operators.repository";
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
// Cola aceleradora del outbox de anclaje (vNext · F3 · T3.6): solo DESPIERTA al worker relayer;
// la verdad es la tabla `on_chain_signatures`. Módulo de servidor: NO se expone en `browser.ts`.
export * from "./queue/operational-signatures";
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
export * from "./maintenance/audit-export";
// Ventana global de acuñación (F8 · D-4/D-11/D-16/D-17): resumen por habitación que comparten el
// barrido global del back-office y el aviso de agotamiento del worker.
export * from "./maintenance/mint-window-watch";

// Mensajes de firma/autorización que muestra la wallet (ADR-30): catálogo, formateadores
// deterministas y estructura EIP-712 legible. Lo usan el cliente (firma) y el servidor (verifica).
export * from "./domain/wallet-messages";

export * from "./auth/terminal-pin";
export * from "./auth/terminal-pin-hash";
