import { describe, expect, it } from "vitest";
import { operationsDomain } from "./domain";
import { actionTypeHash, entityIdOf } from "./entity-id";
import {
  OPERATIONAL_ACTION_PRIMARY_TYPE,
  OPERATIONAL_ACTION_TYPES,
  buildOperationalMessage,
  deriveActionNonce,
  hashOperationalAction,
  operationalTypedData,
} from "./typed-data";
import type { OperationalActionMessage } from "./types";

/**
 * Vector de regresión EIP-712 (DT-AUD-03, `RepoTecnico/propuesta_vNext/documento_tecnico.md` §4.2.1).
 *
 * Es el test que impide que el encoding se desvíe **en silencio**: si cambia `entityId`/`payloadHash`,
 * el orden de los campos o el dominio, el digest cambia y la firma deja de verificar on-chain. Los
 * valores esperados son literales del documento; no se recalculan aquí para no comparar la
 * implementación consigo misma.
 */
const UUID_ROOM_BLOCK = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const CONTRACT = "0x0000000000000000000000000000000000000a11" as const;
const PAYLOAD_HASH = "0x5031c2aa46e9edd122f1853ee43724012c7e9956883c1f0c32a71c0abd9f9a39" as const;

const domain = operationsDomain(81234, CONTRACT);

const vectorMessage: OperationalActionMessage = {
  actionType: actionTypeHash("ROOM_BLOCK"),
  entityId: entityIdOf("ROOM_BLOCK", UUID_ROOM_BLOCK),
  payloadHash: PAYLOAD_HASH,
  nonce: deriveActionNonce("nonce-1"),
  deadline: 1793000000n,
};

describe("OPERATIONAL_ACTION_TYPES", () => {
  it("declara la firma de tipo exacta del documento", () => {
    expect(OPERATIONAL_ACTION_TYPES.OperationalAction).toEqual([
      { name: "actionType", type: "bytes32" },
      { name: "entityId", type: "bytes32" },
      { name: "payloadHash", type: "bytes32" },
      { name: "nonce", type: "bytes32" },
      { name: "deadline", type: "uint256" },
    ]);
    expect(OPERATIONAL_ACTION_PRIMARY_TYPE).toBe("OperationalAction");
  });
});

describe("deriveActionNonce · vector canónico", () => {
  it("es keccak256 del literal de la semilla", () => {
    expect(deriveActionNonce("nonce-1")).toBe(
      "0x9c6230254ac733f54ec47298f0a5ddaf93dc9efe6e05fb726dcb6faf10ddece2",
    );
  });

  it("es determinista y cambia con la semilla", () => {
    expect(deriveActionNonce("a")).toBe(deriveActionNonce("a"));
    expect(deriveActionNonce("a")).not.toBe(deriveActionNonce("b"));
  });
});

describe("hashOperationalAction · digest EIP-712", () => {
  it("coincide con el digest del documento", () => {
    expect(hashOperationalAction(domain, vectorMessage)).toBe(
      "0x1c5f82f7a032d92187886907597d66a56d47fac05bde6573f97037cced95dac1",
    );
  });

  it("cambia si cambia cualquier campo firmado (deadline incluido)", () => {
    const base = hashOperationalAction(domain, vectorMessage);
    expect(hashOperationalAction(domain, { ...vectorMessage, deadline: 1793000001n })).not.toBe(base);
    expect(hashOperationalAction(domain, { ...vectorMessage, nonce: deriveActionNonce("nonce-2") })).not.toBe(
      base,
    );
    expect(
      hashOperationalAction(domain, { ...vectorMessage, payloadHash: deriveActionNonce("otro") }),
    ).not.toBe(base);
    expect(
      hashOperationalAction(operationsDomain(1, CONTRACT), vectorMessage),
    ).not.toBe(base);
  });

  it("`operationalTypedData` devuelve el TypedData completo con el primaryType correcto", () => {
    expect(operationalTypedData(domain, vectorMessage)).toEqual({
      domain,
      types: OPERATIONAL_ACTION_TYPES,
      primaryType: "OperationalAction",
      message: vectorMessage,
    });
  });
});

describe("buildOperationalMessage", () => {
  it("deriva actionType, entityId y payloadHash desde la entrada amigable", () => {
    const message = buildOperationalMessage({
      actionType: "ROOM_BLOCK",
      entityUuid: UUID_ROOM_BLOCK,
      payload: { reason: "fuga" },
      nonce: deriveActionNonce("nonce-1"),
      deadline: 1793000000n,
    });

    expect(message.actionType).toBe(actionTypeHash("ROOM_BLOCK"));
    expect(message.entityId).toBe(entityIdOf("ROOM_BLOCK", UUID_ROOM_BLOCK));
    expect(message.nonce).toBe(deriveActionNonce("nonce-1"));
    expect(message.deadline).toBe(1793000000n);
    expect(message.payloadHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("propaga el UUID mal formado (no firma un entityId inventado)", () => {
    expect(() =>
      buildOperationalMessage({
        actionType: "ROOM_BLOCK",
        entityUuid: "no-es-un-uuid",
        payload: {},
        nonce: deriveActionNonce("n"),
        deadline: 1n,
      }),
    ).toThrow(/UUID mal formado/);
  });
});
