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
});
