import { describe, expect, it } from "vitest";
import {
  DEFAULT_REMOTE_GAS_LIMIT,
  distinctGuestSlots,
  hasDuplicateAccounts,
  injectionGasOverrides,
  parseGuestKeys,
  resolveRemoteInjectionAccounts,
} from "./injection-plan";

const OWNER = `0x${"11".repeat(32)}`;
const ADMIN = `0x${"22".repeat(32)}`;
const BURNER = `0x${"33".repeat(32)}`;
const RECEPTION = `0x${"44".repeat(32)}`;
const GUEST_A = `0x${"aa".repeat(32)}`;
const GUEST_B = `0x${"bb".repeat(32)}`;

describe("plan de inyección · redes no locales (Besu)", () => {
  it("con solo la clave del propietario, los 10 puestos caen a su cuenta", () => {
    const slots = resolveRemoteInjectionAccounts({ DEPLOYER_PRIVATE_KEY: OWNER });

    expect(slots).toHaveLength(10);
    expect(slots.every((slot) => slot.privateKey === OWNER)).toBe(true);
    expect(slots[0]!.origin).toBe("env");
    expect(slots.slice(1).every((slot) => slot.origin === "owner-fallback")).toBe(true);
    expect(slots[4]!.label).toContain("huesped simulado #4");
    expect(hasDuplicateAccounts(slots)).toBe(true);
    expect(distinctGuestSlots(slots)).toHaveLength(0);
  });

  it("acepta la topología completa por entorno y rellena solo lo que falta", () => {
    const slots = resolveRemoteInjectionAccounts({
      DEPLOYER_PRIVATE_KEY: OWNER,
      ADMIN_PRIVATE_KEY: ADMIN,
      BURNER_PRIVATE_KEY: BURNER,
      RECEPTION_PRIVATE_KEY: RECEPTION,
      GUEST_PRIVATE_KEYS: `${GUEST_A}, ${GUEST_B}`,
    });

    expect(slots.map((slot) => slot.privateKey)).toEqual([
      OWNER,
      ADMIN,
      BURNER,
      RECEPTION,
      GUEST_A,
      GUEST_B,
      OWNER, // huéspedes 6–9 sin clave propia
      OWNER,
      OWNER,
      OWNER,
    ]);
    expect(slots[0]!.origin).toBe("env");
    expect(slots[1]!.origin).toBe("env");
    expect(slots[6]!.origin).toBe("owner-fallback");
    expect(hasDuplicateAccounts(slots)).toBe(true);
    expect(distinctGuestSlots(slots).map((slot) => slot.slot)).toEqual([4, 5]);
  });

  it("sin clave de propietario falla con un mensaje accionable", () => {
    expect(() => resolveRemoteInjectionAccounts({})).toThrow(/DEPLOYER_PRIVATE_KEY/);
    expect(() => resolveRemoteInjectionAccounts({ OWNER_PRIVATE_KEY: "0x1234" })).toThrow(
      /clave privada hexadecimal/,
    );
  });

  it("OWNER_PRIVATE_KEY vale como alias de DEPLOYER_PRIVATE_KEY", () => {
    const slots = resolveRemoteInjectionAccounts({ OWNER_PRIVATE_KEY: OWNER });
    expect(slots.every((slot) => slot.privateKey === OWNER)).toBe(true);
  });

  it("rechaza claves de huésped mal formadas", () => {
    expect(() => parseGuestKeys("0xno-es-clave")).toThrow(/GUEST_PRIVATE_KEYS\[0\]/);
    expect(parseGuestKeys("")).toEqual([]);
    expect(parseGuestKeys(undefined)).toEqual([]);
  });
});

describe("plan de inyección · gas", () => {
  it("en local (Anvil) se deja estimar", () => {
    expect(injectionGasOverrides(true)).toEqual({});
    expect(injectionGasOverrides(true, { BESU_GAS_LIMIT: "999999" })).toEqual({});
  });

  it("en Besu envía legacy con precio y gas explícitos", () => {
    expect(injectionGasOverrides(false)).toEqual({
      gasPrice: 1000n,
      gas: DEFAULT_REMOTE_GAS_LIMIT,
    });
    expect(
      injectionGasOverrides(false, { BESU_GAS_PRICE_WEI: "2000", BESU_GAS_LIMIT: "400000" }),
    ).toEqual({ gasPrice: 2000n, gas: 400000n });
  });

  it("no permite bajar del mínimo de gas de la red ni un gas 0", () => {
    expect(() => injectionGasOverrides(false, { BESU_GAS_PRICE_WEI: "999" }, 1000n)).toThrow(
      /inferior al mínimo/,
    );
    expect(() => injectionGasOverrides(false, { BESU_GAS_LIMIT: "0" })).toThrow(/mayor que 0/);
  });
});
