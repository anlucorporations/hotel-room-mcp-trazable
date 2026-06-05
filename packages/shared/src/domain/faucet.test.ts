import { describe, expect, it } from "vitest";
import { encodeErrorResult } from "viem";
import { faucetAbi } from "../abi/faucet";
import {
  cooldownRemainingSeconds,
  decodeCooldownAvailableAt,
  deriveFaucetAvailability,
  formatCooldown,
  type FaucetSnapshot,
} from "./faucet";

const snapshot = (overrides: Partial<FaucetSnapshot> = {}): FaucetSnapshot => ({
  availableAt: 0,
  isLow: false,
  isEmpty: false,
  ...overrides,
});

describe("deriveFaucetAvailability (CU-PR-01)", () => {
  it("está lista si nunca se dispensó (availableAt 0)", () => {
    expect(deriveFaucetAvailability(snapshot(), 1_000)).toEqual({ kind: "ready" });
  });

  it("está lista si el cooldown ya pasó", () => {
    expect(deriveFaucetAvailability(snapshot({ availableAt: 900 }), 1_000)).toEqual({
      kind: "ready",
    });
  });

  it("bloquea con cooldown activo y expone el epoch de disponibilidad", () => {
    expect(deriveFaucetAvailability(snapshot({ availableAt: 1_500 }), 1_000)).toEqual({
      kind: "cooldown",
      availableAt: 1_500,
    });
  });

  it("«empty» tiene prioridad sobre el cooldown (no hay saldo que dispensar)", () => {
    const out = deriveFaucetAvailability(snapshot({ availableAt: 1_500, isEmpty: true }), 1_000);
    expect(out).toEqual({ kind: "empty" });
  });
});

describe("cooldownRemainingSeconds", () => {
  it("devuelve los segundos restantes", () => {
    expect(cooldownRemainingSeconds(1_500, 1_000)).toBe(500);
  });

  it("nunca es negativo (ya disponible)", () => {
    expect(cooldownRemainingSeconds(900, 1_000)).toBe(0);
  });
});

describe("formatCooldown", () => {
  it("formatea mm:ss por debajo de una hora", () => {
    expect(formatCooldown(65)).toBe("01:05");
  });

  it("formatea hh:mm:ss a partir de una hora", () => {
    expect(formatCooldown(3_725)).toBe("01:02:05");
  });

  it("trunca fracciones y nunca baja de 00:00", () => {
    expect(formatCooldown(0.9)).toBe("00:00");
    expect(formatCooldown(-10)).toBe("00:00");
  });
});

describe("decodeCooldownAvailableAt", () => {
  /** Construye un error tipo viem con el `data` del revert en algún nivel de `cause`. */
  function revertError(data: `0x${string}`): unknown {
    return { shortMessage: "reverted", cause: { cause: { data } } };
  }

  it("extrae availableAt del revert FaucetCooldownActive", () => {
    const data = encodeErrorResult({
      abi: faucetAbi,
      errorName: "FaucetCooldownActive",
      args: ["0x1111111111111111111111111111111111111111", 1_780_000_000n],
    });
    expect(decodeCooldownAvailableAt(revertError(data))).toBe(1_780_000_000);
  });

  it("devuelve null para otros reverts del faucet", () => {
    const data = encodeErrorResult({ abi: faucetAbi, errorName: "FaucetInsufficientBalance" });
    expect(decodeCooldownAvailableAt(revertError(data))).toBeNull();
  });

  it("devuelve null si el error no trae data decodificable", () => {
    expect(decodeCooldownAvailableAt(new Error("boom"))).toBeNull();
    expect(decodeCooldownAvailableAt({ cause: { data: "0xdeadbeef" } })).toBeNull();
  });
});
