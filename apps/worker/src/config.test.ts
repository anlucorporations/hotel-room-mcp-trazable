import { describe, expect, it } from "vitest";
import { EnvironmentValidationError } from "@hotel/shared/env";
import { DEFAULT_ANCHOR_BACKOFF, loadWorkerConfig, parseAnchorBackoff } from "./config";

/** Clave privada sintácticamente válida (32 bytes hex) SIN valor real alguno. */
const FAKE_PRIVATE_KEY = `0x${"ab".repeat(32)}`;

const valid = {
  RPC_URL: "http://127.0.0.1:8545",
  CONTRACT_ADDRESS: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  SMTP_HOST: "smtp.example.com",
  SMTP_USER: "worker@example.com",
  SMTP_PASS: "secreto",
  SMTP_FROM: "avisos@example.com",
  ADMIN_EMAIL: "admin@example.com",
} as const;

describe("worker config", () => {
  it("aplica defaults y valida lo requerido", () => {
    const config = loadWorkerConfig(valid);
    expect(config.WORKER_PORT).toBe(8787);
    expect(config.WORKER_HOST).toBe("0.0.0.0");
    expect(config.CHAIN_ID).toBe(81234);
    expect(config.SMTP_PORT).toBe(587);
    expect(config.POLL_INTERVAL_MS).toBe(4000);
    expect(config.DEPLOYMENT_BLOCK).toBeUndefined();
  });

  it("falla fail-fast si falta RPC_URL", () => {
    const { RPC_URL: _omit, ...withoutRpc } = valid;
    expect(() => loadWorkerConfig(withoutRpc)).toThrow(EnvironmentValidationError);
  });

  it("falla fail-fast si la dirección del contrato es inválida", () => {
    expect(() => loadWorkerConfig({ ...valid, CONTRACT_ADDRESS: "0x123" })).toThrow(
      EnvironmentValidationError,
    );
  });

  it("falla fail-fast si faltan los secretos SMTP", () => {
    const { SMTP_HOST: _omit, ...withoutSmtp } = valid;
    expect(() => loadWorkerConfig(withoutSmtp)).toThrow(EnvironmentValidationError);
  });

  /**
   * Regresión real: la plantilla `.env.example` deja vacías las variables opcionales
   * (`BURN_INTERVAL_MS=`, `BURNER_WALLET_PRIVATE_KEY=`, `DEVOPS_ALERT_EMAIL=`), y con
   * `z.coerce.number().positive().optional()` una cadena vacía NO es «ausente»: `Number("")` es 0 y
   * el worker **no arrancaba con la plantilla del propio repositorio**. Se detectó al reiniciar el
   * worker tras M7 (el `.env` real tenía `BURN_INTERVAL_MS=`).
   */
  it("acepta las variables opcionales VACÍAS (plantilla .env.example) como «no definidas»", () => {
    const config = loadWorkerConfig({
      ...valid,
      DEPLOYMENT_BLOCK: "",
      BURNER_WALLET_PRIVATE_KEY: "",
      BURN_INTERVAL_MS: "",
      DEVOPS_ALERT_EMAIL: "",
    });

    expect(config.DEPLOYMENT_BLOCK).toBeUndefined();
    expect(config.BURNER_WALLET_PRIVATE_KEY).toBeUndefined();
    expect(config.BURN_INTERVAL_MS).toBeUndefined();
    expect(config.DEVOPS_ALERT_EMAIL).toBeUndefined();
  });

  it("sigue rechazando un valor presente pero inválido (vacío ≠ mal escrito)", () => {
    expect(() => loadWorkerConfig({ ...valid, BURN_INTERVAL_MS: "0" })).toThrow(
      EnvironmentValidationError,
    );
    expect(() => loadWorkerConfig({ ...valid, BURNER_WALLET_PRIVATE_KEY: "0x123" })).toThrow(
      EnvironmentValidationError,
    );
  });

  it("lee los valores opcionales cuando están definidos", () => {
    const config = loadWorkerConfig({
      ...valid,
      DEPLOYMENT_BLOCK: "1234",
      BURN_INTERVAL_MS: "60000",
      DEVOPS_ALERT_EMAIL: "devops@example.com",
    });

    expect(config.DEPLOYMENT_BLOCK).toBe(1234);
    expect(config.BURN_INTERVAL_MS).toBe(60_000);
    expect(config.DEVOPS_ALERT_EMAIL).toBe("devops@example.com");
  });
});

describe("worker config · outbox de anclaje (T3.4)", () => {
  it("aplica los defaults del ciclo de anclaje sin variables en el entorno", () => {
    const config = loadWorkerConfig(valid);

    // Sin contrato ni clave de relayer: el anclaje queda desactivado, el worker arranca igual.
    expect(config.HOTEL_OPERATIONS_CONTRACT_ADDRESS).toBeUndefined();
    expect(config.HOTEL_OPERATIONS_DEPLOYMENT_BLOCK).toBeUndefined();
    expect(config.ANCHOR_RELAYER_PRIVATE_KEY).toBeUndefined();
    expect(config.ENABLE_OPERATIONAL_SIGNATURES).toBe(false);

    expect(config.OPERATIONAL_SIGNATURE_QUEUE).toBe("operational-signatures");
    expect(config.OPERATIONAL_SIGNATURE_RETRY_MS).toBe(30_000);
    expect(config.OPERATIONAL_SIGNATURE_MAX_RETRIES).toBe(8);
    expect(config.OPERATIONAL_SIGNATURE_TTL_HOURS).toBe(24);
    expect(config.ANCHOR_BACKOFF).toEqual([30, 60, 120, 300, 600]);
    expect(config.RPC_TIMEOUT_MS).toBe(5_000);
    expect(config.PENDING_ALERT_MIN).toBe(10);
    expect(config.RETRY_ALERT_COUNT).toBe(5);
  });

  it("lee las variables del ciclo cuando están definidas", () => {
    const config = loadWorkerConfig({
      ...valid,
      HOTEL_OPERATIONS_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000a11",
      HOTEL_OPERATIONS_DEPLOYMENT_BLOCK: "123456",
      ANCHOR_RELAYER_PRIVATE_KEY: FAKE_PRIVATE_KEY,
      ENABLE_OPERATIONAL_SIGNATURES: "1",
      OPERATIONAL_SIGNATURE_QUEUE: "otra-cola",
      OPERATIONAL_SIGNATURE_RETRY_MS: "15000",
      OPERATIONAL_SIGNATURE_MAX_RETRIES: "3",
      OPERATIONAL_SIGNATURE_TTL_HOURS: "6",
      ANCHOR_BACKOFF: "10, 20,30",
      RPC_TIMEOUT_MS: "2500",
      PENDING_ALERT_MIN: "20",
      RETRY_ALERT_COUNT: "9",
    });

    expect(config.HOTEL_OPERATIONS_CONTRACT_ADDRESS).toBe("0x0000000000000000000000000000000000000a11");
    expect(config.HOTEL_OPERATIONS_DEPLOYMENT_BLOCK).toBe(123_456);
    expect(config.ANCHOR_RELAYER_PRIVATE_KEY).toBe(FAKE_PRIVATE_KEY);
    expect(config.ENABLE_OPERATIONAL_SIGNATURES).toBe(true);
    expect(config.OPERATIONAL_SIGNATURE_QUEUE).toBe("otra-cola");
    expect(config.OPERATIONAL_SIGNATURE_RETRY_MS).toBe(15_000);
    expect(config.OPERATIONAL_SIGNATURE_MAX_RETRIES).toBe(3);
    expect(config.OPERATIONAL_SIGNATURE_TTL_HOURS).toBe(6);
    expect(config.ANCHOR_BACKOFF).toEqual([10, 20, 30]);
    expect(config.RPC_TIMEOUT_MS).toBe(2_500);
    expect(config.PENDING_ALERT_MIN).toBe(20);
    expect(config.RETRY_ALERT_COUNT).toBe(9);
  });

  it("trata ANCHOR_RELAYER_PRIVATE_KEY vacía como «no definida»", () => {
    const config = loadWorkerConfig({ ...valid, ANCHOR_RELAYER_PRIVATE_KEY: "" });
    expect(config.ANCHOR_RELAYER_PRIVATE_KEY).toBeUndefined();
  });

  it("rechaza una ANCHOR_RELAYER_PRIVATE_KEY mal formada", () => {
    expect(() => loadWorkerConfig({ ...valid, ANCHOR_RELAYER_PRIVATE_KEY: "0x123" })).toThrow(
      EnvironmentValidationError,
    );
  });

  it("rechaza un HOTEL_OPERATIONS_CONTRACT_ADDRESS mal formado y acepta la plantilla vacía", () => {
    expect(() =>
      loadWorkerConfig({ ...valid, HOTEL_OPERATIONS_CONTRACT_ADDRESS: "0x123" }),
    ).toThrow(EnvironmentValidationError);
    expect(
      loadWorkerConfig({ ...valid, HOTEL_OPERATIONS_CONTRACT_ADDRESS: "" })
        .HOTEL_OPERATIONS_CONTRACT_ADDRESS,
    ).toBeUndefined();
  });

  it("ANCHOR_BACKOFF vacío cae al default y un valor inválido falla fail-fast", () => {
    expect(loadWorkerConfig({ ...valid, ANCHOR_BACKOFF: "" }).ANCHOR_BACKOFF).toEqual([
      30, 60, 120, 300, 600,
    ]);
    expect(loadWorkerConfig({ ...valid, ANCHOR_BACKOFF: "   " }).ANCHOR_BACKOFF).toEqual([
      30, 60, 120, 300, 600,
    ]);
    expect(() => loadWorkerConfig({ ...valid, ANCHOR_BACKOFF: "30,0" })).toThrow(
      EnvironmentValidationError,
    );
    expect(() => loadWorkerConfig({ ...valid, ANCHOR_BACKOFF: "30,1.5" })).toThrow(
      EnvironmentValidationError,
    );
  });
});

describe("parseAnchorBackoff", () => {
  it("parsea la lista de segundos tolerando espacios", () => {
    expect(parseAnchorBackoff("30,60,120,300,600")).toEqual([30, 60, 120, 300, 600]);
    expect(parseAnchorBackoff(" 30 , 60 ,120 ")).toEqual([30, 60, 120]);
    expect(parseAnchorBackoff("15")).toEqual([15]);
  });

  it("usa el default con cadena vacía o sólo espacios", () => {
    expect(DEFAULT_ANCHOR_BACKOFF).toBe("30,60,120,300,600");
    expect(parseAnchorBackoff("")).toEqual([30, 60, 120, 300, 600]);
    expect(parseAnchorBackoff("   ")).toEqual([30, 60, 120, 300, 600]);
  });

  it("lanza con valores no enteros, negativos o cero", () => {
    expect(() => parseAnchorBackoff("30,0")).toThrow(/positivos/i);
    expect(() => parseAnchorBackoff("30,-5")).toThrow(/inválido/i);
    expect(() => parseAnchorBackoff("30,1.5")).toThrow(/inválido/i);
    expect(() => parseAnchorBackoff("30,abc")).toThrow(/inválido/i);
    // Coma final: elemento vacío, no un entero.
    expect(() => parseAnchorBackoff("30,")).toThrow(/inválido/i);
  });
});
