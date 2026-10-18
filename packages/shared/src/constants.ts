/**
 * Constantes y umbrales del sistema (ADR-01/17, valores del spike de Besu).
 *
 * Fuente única para todo el monorepo. Los valores monetarios y de gas se expresan en
 * `wei` como `bigint`; los tiempos en la unidad indicada por el sufijo del nombre.
 */

// ── Red Besu / Anvil (ADR-01, ADR-17) ──────────────────────────────────
// La red del proyecto es **Besu** (testnet de Codecrypto, chainId 81234). Anvil solo se usa como
// espejo local de desarrollo/CI, arrancado con `--chain-id 81234` para que el código no dependa
// de la red: se distingue por la URL del RPC (localhost ⇒ Anvil dev).
export const CHAIN_ID = 81234 as const;
export const NETWORK_NAME = "Codecrypto Besu" as const;
export const CURRENCY_SYMBOL = "ETH" as const;
export const CURRENCY_DECIMALS = 18 as const;

/** RPC vigente de la red de prueba Besu de Codecrypto (C3, 2026-10-13). */
export const BESU_RPC_URL = "https://besu.alumnos.codecrypto.academy" as const;
/** RPC anterior del laboratorio, conservado como referencia histórica. */
export const BESU_RPC_URL_LEGACY = "https://besu1.proyectos.codecrypto.academy" as const;
export const BESU_RPC_URL_FALLBACK = BESU_RPC_URL_LEGACY;
/** RPC local de Anvil para desarrollo/CI (se arranca con `--chain-id 81234`). */
export const ANVIL_RPC_URL = "http://127.0.0.1:8545" as const;

export const EVM_VERSION = "cancun" as const;
export const MIN_GAS_PRICE_WEI = 1000n;

/**
 * Modo de fees. Con `baseFee = 0` la auto-estimación EIP-1559 falla (spike §9): se debe
 * usar EIP-1559 con fees explícitos o legacy con `gasPrice = MIN_GAS_PRICE_WEI`.
 */
export const FEE_MODE = "eip1559-explicit" as const;

// ── Worker / lectura de eventos (ADR-09, ADR-10) ────────────────────
/** QBFT: finalidad inmediata ⇒ 1 confirmación basta (spike). */
export const CONFIRMATIONS_N = 1 as const;
/** Máximo de bloques por consulta `getLogs` (spike). */
export const GETLOGS_MAX_RANGE = 5000 as const;

// ── Royalty (RF-08 · C1, 2026-10-13) ─────────────────────────────────────────
// El royalty se fija POR TIPO de habitación y lo gobierna `ROYALTY_ADMIN_ROLE` dentro de
// 0–`ROYALTY_BPS_MAX`. Los valores siguientes son los INICIALES del contrato (los de D-06:
// 5 % simple/doble, 10 % suite); el valor vigente se lee on-chain con `royaltyBpsOf`/`royaltyInfo`.
export const ROYALTY_BPS_STANDARD = 500 as const; // 5 %: simple y doble (inicial)
export const ROYALTY_BPS_SUITE = 1000 as const; // 10 %: suite (inicial)
/** Tope duro del royalty configurable (20 %), espejo de `HotelNights.ROYALTY_BPS_MAX`. */
export const ROYALTY_BPS_MAX = 2000 as const;
export const BPS_DENOMINATOR = 10_000 as const;

// ── Inventario / burn (CU-13, docs/SRS.md §9) ────────────────────────────────────────────────
export const BURN_BATCH_MAX = 50 as const;

// ── Catálogo y rendimiento (Decisión 23, RNF-02/11) ──────────────────────────
export const CATALOG_WINDOW_DAYS = 90 as const;
export const RPC_TIMEOUT_MS = 5000 as const;
export const RENDER_TARGET_MS = 1000 as const; // P75
export const LCP_TARGET_MS = 2500 as const; // P75, 4G, catálogo 50×90

// ── Sesión back-office (CU-01) ───────────────────────────────────────────────
export const SESSION_NONCE_TTL_SECONDS = 300 as const;

// ── Asistente IA (CU-08) — indicador nightly, no gate ─────────────────────────
export const LLM_OOD_REJECT_RATE = 0.96 as const; // ≥ 48/50

// ── Faucet (solo entorno de pruebas, RF-21 / CU-PR-01) ───────────────────────
export const FAUCET_COOLDOWN_SECONDS = 86_400 as const; // 1 dispensación / 24 h
/**
 * Valores monetarios provisionales de desarrollo. El precio máximo real de una noche se
 * fija con el hotel (ADR-19); de él se deriva `FAUCET_AMOUNT_WEI`.
 */
export const MAX_PRICE_NIGHT_WEI = 10n * 10n ** 18n; // 10 ETH (dev)
export const FAUCET_AMOUNT_WEI = 3n * MAX_PRICE_NIGHT_WEI; // 30 ETH (dev)
export const FAUCET_LOW_THRESHOLD_WEI = 5n * FAUCET_AMOUNT_WEI; // alerta saldo bajo (dev)

// ── Zona horaria y calendario (Decisión 3, ADR-08) ───────────────────────────
export const TZ_REF = "Europe/Madrid" as const;

// ── UI / accesibilidad (RNF-01) ──────────────────────────────────────────────
// NOTA: estos valores deben coincidir con el preset de Tailwind
// (`@hotel/config/tailwind/preset`). Un test guardián (constants.test.ts) verifica que no
// divergan, ya que el preset es CommonJS (capa de build) y no puede importar este módulo ESM.
/** Breakpoints: móvil <768 / tablet 768–1024 / desktop >1024. */
export const BREAKPOINT_TABLET_PX = 768 as const;
export const BREAKPOINT_DESKTOP_PX = 1024 as const;
/** Área táctil mínima (WCAG 2.1 AA, RNF-01/20). */
export const TOUCH_TARGET_MIN_PX = 44 as const;

// ── Observabilidad (RNF-17) ──────────────────────────────────────────────────
/** Fallos consecutivos de `/health` antes de marcar `COMPONENT_DOWN` / responder 503. */
export const HEALTH_FAILURE_THRESHOLD = 3 as const;

// ── Subastas (C2 · RF-13) ────────────────────────────────────────────────────
// Espejo de las constantes de `NightAuction.sol`: la UI valida y muestra la cuenta atrás con los
// mismos números que aplica el contrato. Los valores on-chain quedan fijados por `NightAuction.t.sol`
// y estos por `domain/auction.test.ts`; si uno cambia, la otra prueba debe cambiar igual.
/** Duración mínima y máxima de una subasta (1 hora / 14 días). */
export const AUCTION_MIN_DURATION_SECONDS = 3_600 as const;
export const AUCTION_MAX_DURATION_SECONDS = 1_209_600 as const;
/** Anti-sniping: una puja dentro de los últimos 5 minutos desplaza el cierre. */
export const AUCTION_ANTI_SNIPE_WINDOW_SECONDS = 300 as const;
/** Incremento mínimo sobre la mejor puja: 5 % con un suelo absoluto de 0,001. */
export const AUCTION_MIN_BID_INCREMENT_BPS = 500 as const;
export const AUCTION_MIN_BID_INCREMENT_WEI = 1_000_000_000_000_000n;
/** Denominador de los *basis points* usado en las reglas de puja. */
export const AUCTION_BPS_DENOMINATOR = 10_000 as const;

// ── HotelOperations (F2 · D-C16, D-C39, DT-AUD-01/02) ────────────────────────
// El contrato auxiliar inmutable se despliega aparte de `HotelNights`; estas constantes son el punto
// de encuentro entre lo que firma el motor EIP-712 de `@hotel/shared` y lo que verifica el contrato.
// Cualquier divergencia en el dominio o en la firma de tipos invalidaría las firmas.
/** Nombre del dominio EIP-712; debe coincidir con `EIP712("HotelOperations", …)` del contrato. */
export const HOTEL_OPERATIONS_DOMAIN_NAME = "HotelOperations" as const;
/** Versión del dominio EIP-712 (segundo argumento del constructor del contrato). */
export const HOTEL_OPERATIONS_DOMAIN_VERSION = "1" as const;
/**
 * Acciones con función de relay en el contrato (`keccak256` del literal). `DAMAGE_CHARGE` existe en
 * el vocabulario de firmas pero **no** tiene función: por decisión D-C27 no se emite en producción.
 */
export const HOTEL_OPERATIONS_ACTION_TYPES = [
  "ROOM_BLOCK",
  "ROOM_UNBLOCK",
  "PREVENTIVE_TASK",
  "INSPECTION",
  "AREA_LOG",
  "CONFIG",
] as const;
export type HotelOperationsActionType = (typeof HOTEL_OPERATIONS_ACTION_TYPES)[number];
/** Nombre por defecto de la cola que despierta al relayer (`OPERATIONAL_SIGNATURE_QUEUE`). */
export const OPERATIONAL_SIGNATURE_QUEUE = "operational-signatures" as const;
