import { describe, expect, it } from "vitest";
import {
  computeNightState,
  isPurchasable,
  type NightOnChainSignals,
} from "./night-state";

/**
 * Matriz de señales on-chain → estado del NFT-noche (docs/SRS.md §9).
 *
 * Precedencia (fija el contrato, no un detalle de implementación):
 *   1. !exists           → null (la noche no existe todavía)
 *   2. expired           → EXPIRADA  (condición SUPERPUESTA: prevalece sobre listed y soldOnce;
 *                                     el contrato permite `listed ∧ expired` y `soldOnce ∧ expired`)
 *   3. listed            → LISTADA_SECUNDARIO
 *   4. soldOnce          → EN_PODER_CLIENTE
 *   5. (por defecto)     → DISPONIBLE
 */
const signals = (overrides: Partial<NightOnChainSignals>): NightOnChainSignals => ({
  exists: false,
  soldOnce: false,
  expired: false,
  listed: false,
  ...overrides,
});

describe("computeNightState (CASOS §4)", () => {
  it("devuelve null si la noche no existe (precede a cualquier otra señal)", () => {
    expect(computeNightState(signals({ exists: false }))).toBeNull();
    // Aunque vengan otras señales activas, si no existe → null.
    expect(
      computeNightState(signals({ exists: false, listed: true, soldOnce: true, expired: true })),
    ).toBeNull();
  });

  it("{exists} → DISPONIBLE (sin otras señales)", () => {
    expect(computeNightState(signals({ exists: true }))).toBe("DISPONIBLE");
  });

  it("{exists, soldOnce} → EN_PODER_CLIENTE", () => {
    expect(computeNightState(signals({ exists: true, soldOnce: true }))).toBe(
      "EN_PODER_CLIENTE",
    );
  });

  it("{exists, listed} → LISTADA_SECUNDARIO", () => {
    expect(computeNightState(signals({ exists: true, listed: true }))).toBe(
      "LISTADA_SECUNDARIO",
    );
  });

  it("{exists, listed, soldOnce} → LISTADA_SECUNDARIO (listed precede a soldOnce)", () => {
    expect(
      computeNightState(signals({ exists: true, listed: true, soldOnce: true })),
    ).toBe("LISTADA_SECUNDARIO");
  });

  it("{exists, expired} → EXPIRADA", () => {
    expect(computeNightState(signals({ exists: true, expired: true }))).toBe("EXPIRADA");
  });

  // Precedencia clave (MINOR#11): la expiración es una condición SUPERPUESTA que
  // prevalece sobre listed y soldOnce. El contrato permite `listed ∧ expired`.
  it("{exists, listed, expired} → EXPIRADA (expired prevalece sobre listed)", () => {
    expect(
      computeNightState(signals({ exists: true, listed: true, expired: true })),
    ).toBe("EXPIRADA");
  });

  it("{exists, soldOnce, expired} → EXPIRADA (expired prevalece sobre soldOnce)", () => {
    expect(
      computeNightState(signals({ exists: true, soldOnce: true, expired: true })),
    ).toBe("EXPIRADA");
  });

  it("{exists, listed, soldOnce, expired} → EXPIRADA (expired prevalece sobre todas)", () => {
    expect(
      computeNightState(
        signals({ exists: true, listed: true, soldOnce: true, expired: true }),
      ),
    ).toBe("EXPIRADA");
  });
});

describe("isPurchasable (DISPONIBLE primaria o LISTADA secundaria)", () => {
  it("es comprable cuando está DISPONIBLE", () => {
    expect(isPurchasable(signals({ exists: true }))).toBe(true);
  });

  it("es comprable cuando está LISTADA_SECUNDARIO", () => {
    expect(isPurchasable(signals({ exists: true, listed: true }))).toBe(true);
  });

  it("no es comprable si no existe", () => {
    expect(isPurchasable(signals({ exists: false }))).toBe(false);
  });

  it("no es comprable en EN_PODER_CLIENTE", () => {
    expect(isPurchasable(signals({ exists: true, soldOnce: true }))).toBe(false);
  });

  it("no es comprable si está EXPIRADA (aunque estuviera listada)", () => {
    expect(isPurchasable(signals({ exists: true, listed: true, expired: true }))).toBe(false);
  });
});
