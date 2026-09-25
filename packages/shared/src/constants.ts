/**
 * Constantes y umbrales del sistema (ADR-01/17, valores del spike de Besu).
 *
 * Fuente única para todo el monorepo. Los valores monetarios y de gas se expresan en
 * `wei` como `bigint`; los tiempos en la unidad indicada por el sufijo del nombre.
 */

// ── Red Besu / Anvil (ADR-01, ADR-17) ──────────────────────────────────
export const CHAIN_ID = 81234 as const;
export const NETWORK_NAME = "Codecrypto Besu" as const;
export const CURRENCY_SYMBOL = "ETH" as const;
export const CURRENCY_DECIMALS = 18 as const;

export const BESU_RPC_URL = "https://besu1.proyectos.codecrypto.academy" as const;
export const BESU_RPC_URL_FALLBACK =
  "https://besu2.proyectos.codecrypto.academy" as const;
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

// ── Royalty (D-06) ───────────────────────────────────────────────────────────
// El royalty es INMUTABLE y se deriva del tipo de habitación en el contrato:
// 5 % para simple y doble (habitaciones 101-130) y 10 % para suite (201-220). NO existe
// ningún parámetro gobernable, así que estas constantes solo reflejan el contrato para la
// UI y las pruebas; el cambio de valores se hace en `HotelNights._royaltyBpsOf`.
export const ROYALTY_BPS_STANDARD = 500 as const; // 5 %: simple y doble
export const ROYALTY_BPS_SUITE = 1000 as const; // 10 %: suite
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
