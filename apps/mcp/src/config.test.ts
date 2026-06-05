import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import { EnvironmentValidationError } from "@hotel/shared/env";
import { loadMcpConfig } from "./config";
import { createMcpServer } from "./server";
import type { ChainReader } from "./chain/chain-reader";

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
  const reader = {} as ChainReader; // las herramientas no se invocan al construir el server.
  const config = { contractAddress: valid.CONTRACT_ADDRESS as Address, chainId: 81234 };

  it("crea un MCP server con las herramientas registradas", () => {
    expect(createMcpServer({ reader, config })).toBeDefined();
  });
});
