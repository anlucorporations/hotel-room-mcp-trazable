/**
 * Plan de inyección de datos para redes **no locales** (Besu de Codecrypto).
 *
 * Contexto (2026-10-15): `scripts/inject-data.ts` nació para un **Anvil** local con el pool
 * determinista de 10 cuentas. En una red real esas claves son públicas y su saldo está
 * comprometido, así que la topología tiene que salir del **entorno** (gestor de secretos) y, si
 * solo hay una cuenta con fondos (el desplegador), el guion debe poder operar con ella.
 *
 * Este módulo es **puro e isomorfo** (solo `viem` y las constantes del proyecto): resuelve la
 * topología de cuentas, los overrides de gas de Besu y los casos en los que no se puede simular
 * mercado (cuentas repetidas). La parte con efectos vive en el guion.
 */
import type { Hex } from "viem";

/** Un puesto de la topología: quién es y de dónde sale su clave. */
export interface InjectionAccountSlot {
  readonly slot: number;
  readonly label: string;
  readonly privateKey: Hex;
  /** `env` = clave propia del entorno; `owner-fallback` = se reutiliza la del propietario. */
  readonly origin: "env" | "owner-fallback";
}

/** Variables de entorno aceptadas (todas opcionales salvo la del propietario). */
export interface InjectionEnv {
  readonly DEPLOYER_PRIVATE_KEY?: string;
  readonly OWNER_PRIVATE_KEY?: string;
  readonly ADMIN_PRIVATE_KEY?: string;
  readonly BURNER_PRIVATE_KEY?: string;
  readonly RECEPTION_PRIVATE_KEY?: string;
  /** Claves de huésped separadas por comas (1–6). */
  readonly GUEST_PRIVATE_KEYS?: string;
  /** Tope de gas por transacción en redes remotas (Besu: la estimación tiene una incidencia). */
  readonly BESU_GAS_LIMIT?: string;
  /** Precio de gas explícito en redes remotas (Besu exige ≥ 1000 wei con `baseFee = 0`). */
  readonly BESU_GAS_PRICE_WEI?: string;
}

/** Presupuesto de gas por transacción en redes remotas si no se indica otro. */
export const DEFAULT_REMOTE_GAS_LIMIT = 500_000n;

const PRIVATE_KEY_RE = /^0x[0-9a-fA-F]{64}$/;

const LABELS: readonly string[] = [
  "desplegador y tesoreria (sin rol on-chain tras el handover)",
  "administrador con wallet: DEFAULT_ADMIN + MINTER + PAUSER + TREASURER",
  "hot-wallet de quema (BURNER_ROLE)",
  "hot-wallet de recepcion (RECEPTION_ROLE)",
  "huesped simulado #4",
  "huesped simulado #5",
  "huesped simulado #6",
  "huesped simulado #7",
  "huesped simulado #8",
  "huesped simulado #9",
];

/** Etiquetas de la topología (las comparten el plan remoto y el pool local de Anvil). */
export const INJECTION_ACCOUNT_LABELS: readonly string[] = LABELS;

class InjectionPlanError extends Error {}

function requireKey(name: string, raw: string | undefined): Hex {
  if (!raw) throw new InjectionPlanError(`falta ${name} en el entorno (red no local)`);
  const value = raw.trim();
  if (!PRIVATE_KEY_RE.test(value)) {
    throw new InjectionPlanError(`${name} no es una clave privada hexadecimal de 32 bytes`);
  }
  return value as Hex;
}

function optionalKey(name: string, raw: string | undefined): Hex | null {
  if (!raw || raw.trim() === "") return null;
  const value = raw.trim();
  if (!PRIVATE_KEY_RE.test(value)) {
    throw new InjectionPlanError(`${name} no es una clave privada hexadecimal de 32 bytes`);
  }
  return value as Hex;
}

/** Claves de huésped declaradas en `GUEST_PRIVATE_KEYS` (comas y espacios). */
export function parseGuestKeys(raw: string | undefined): readonly Hex[] {
  if (!raw || raw.trim() === "") return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map((part, index) => optionalKey(`GUEST_PRIVATE_KEYS[${index}]`, part)!);
}

/**
 * Topología para una red **no local**: el propietario sale del entorno y los demás puestos caen a
 * su clave si no se declaran. Es el modo que funciona donde solo el desplegador tiene fondos:
 * permite registrar habitaciones y mintear noches aunque no haya cuentas de huésped.
 */
export function resolveRemoteInjectionAccounts(env: InjectionEnv): readonly InjectionAccountSlot[] {
  const owner = requireKey(
    "DEPLOYER_PRIVATE_KEY (o OWNER_PRIVATE_KEY)",
    env.DEPLOYER_PRIVATE_KEY ?? env.OWNER_PRIVATE_KEY,
  );

  const declared: readonly (Hex | null)[] = [
    owner,
    optionalKey("ADMIN_PRIVATE_KEY", env.ADMIN_PRIVATE_KEY),
    optionalKey("BURNER_PRIVATE_KEY", env.BURNER_PRIVATE_KEY),
    optionalKey("RECEPTION_PRIVATE_KEY", env.RECEPTION_PRIVATE_KEY),
  ];
  const guests = parseGuestKeys(env.GUEST_PRIVATE_KEYS);

  return Array.from({ length: 10 }, (_, slot): InjectionAccountSlot => {
    const label = LABELS[slot] ?? `puesto ${slot}`;
    const guestKey = slot >= 4 ? guests[slot - 4] : undefined;
    const key = declared[slot] ?? guestKey ?? owner;
    return {
      slot,
      label,
      privateKey: key,
      origin: key === owner && slot !== 0 ? "owner-fallback" : "env",
    };
  });
}

/** ¿Hay puestos que comparten clave? (Sin cuentas distintas no se puede simular compra/reventa.) */
export function hasDuplicateAccounts(slots: readonly InjectionAccountSlot[]): boolean {
  const seen = new Set<string>();
  for (const slot of slots) {
    const key = slot.privateKey.toLowerCase();
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

/** Puestos de huésped con clave **propia** (los únicos que pueden simular compra y reventa). */
export function distinctGuestSlots(
  slots: readonly InjectionAccountSlot[],
): readonly InjectionAccountSlot[] {
  const seen = new Set<string>();
  const out: InjectionAccountSlot[] = [];
  for (const slot of slots) {
    if (slot.slot < 4 || slot.origin !== "env") continue;
    const key = slot.privateKey.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(slot);
  }
  return out;
}

/** Overrides de transacción: en local se deja estimar (Anvil); en Besu, legacy y explícitos. */
export interface InjectionGasOverrides {
  readonly gasPrice?: bigint;
  readonly gas?: bigint;
}

/**
 * Besu tiene `baseFee = 0` y exige `gasPrice >= 1000 wei`, y su `eth_estimateGas` revierte con
 * `PastDate` en `mint()` aunque la transacción se mine (incidencia BESU-ESTIMATE-PASTDATE,
 * reportada a Codecrypto). Por eso en redes no locales se envían **legacy con gas y precio
 * explícitos**; en Anvil se deja la estimación automática.
 */
export function injectionGasOverrides(
  isLocalRpc: boolean,
  env: InjectionEnv = {},
  minGasPriceWei: bigint = 1000n,
): InjectionGasOverrides {
  if (isLocalRpc) return {};
  const price = env.BESU_GAS_PRICE_WEI ? BigInt(env.BESU_GAS_PRICE_WEI) : minGasPriceWei;
  const limit = env.BESU_GAS_LIMIT ? BigInt(env.BESU_GAS_LIMIT) : DEFAULT_REMOTE_GAS_LIMIT;
  if (price < minGasPriceWei) {
    throw new InjectionPlanError(
      `BESU_GAS_PRICE_WEI=${price} es inferior al mínimo de la red (${minGasPriceWei} wei)`,
    );
  }
  if (limit <= 0n) throw new InjectionPlanError("BESU_GAS_LIMIT debe ser mayor que 0");
  return { gasPrice: price, gas: limit };
}
