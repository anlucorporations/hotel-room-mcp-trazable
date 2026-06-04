import { describe, expect, it } from "vitest";
import { EnvironmentValidationError } from "@hotel/shared/env";
import { loadMcpConfig } from "./config";
import { createMcpServer } from "./server";

const valid = {
  RPC_URL: "http://127.0.0.1:8545",
  CONTRACT_ADDRESS: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
} as const;

describe("mcp config", () => {
  it("aplica defaults y valida lo requerido", () => {
    const config = loadMcpConfig(valid);
    expect(config.MCP_PORT).toBe(8788);
    expect(config.CHAIN_ID).toBe(81234);
  });

  it("falla fail-fast si falta la configuración requerida", () => {
    expect(() => loadMcpConfig({})).toThrow(EnvironmentValidationError);
  });
});

describe("mcp server factory", () => {
  it("crea un MCP server (sin herramientas en FASE 0)", () => {
    expect(createMcpServer()).toBeDefined();
  });
});
