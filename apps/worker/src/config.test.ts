import { describe, expect, it } from "vitest";
import { EnvironmentValidationError } from "@hotel/shared/env";
import { loadWorkerConfig } from "./config";

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
