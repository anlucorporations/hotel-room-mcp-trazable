import { describe, expect, it } from "vitest";
import { z } from "zod";
import { EnvironmentValidationError, env, loadEnv } from "./index";

const schema = z.object({
  RPC_URL: env.httpUrl,
  CONTRACT_ADDRESS: env.ethAddress,
  PORT: env.port,
});

describe("secret manager (loadEnv)", () => {
  it("valida y coacciona un entorno correcto", () => {
    const config = loadEnv(schema, {
      RPC_URL: "http://127.0.0.1:8545",
      CONTRACT_ADDRESS: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
      PORT: "3000",
    });
    expect(config.PORT).toBe(3000);
    expect(config.RPC_URL).toBe("http://127.0.0.1:8545");
  });

  it("falla fail-fast y agrega todos los problemas", () => {
    let error: unknown;
    try {
      loadEnv(schema, { PORT: "no-es-un-puerto" });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(EnvironmentValidationError);
    const validationError = error as EnvironmentValidationError;
    expect(validationError.issues.length).toBeGreaterThanOrEqual(3);
    expect(validationError.message).toContain("RPC_URL");
    expect(validationError.message).toContain("CONTRACT_ADDRESS");
  });

  it("rechaza una dirección Ethereum mal formada", () => {
    expect(() =>
      loadEnv(z.object({ ADDR: env.ethAddress }), { ADDR: "0x123" }),
    ).toThrow(EnvironmentValidationError);
  });
});

describe("env.httpUrl (MINOR#10 — sólo esquemas http/https)", () => {
  const urlSchema = z.object({ URL: env.httpUrl });
  const parse = (URL: string) => loadEnv(urlSchema, { URL }).URL;

  it.each([
    "http://127.0.0.1:8545",
    "https://rpc.example.com",
    "https://rpc.example.com:8545/path",
    "HTTP://localhost:8788/mcp",
  ])("acepta URL http/https válida (%s)", (url) => {
    expect(parse(url)).toBe(url);
  });

  it.each([
    "ftp://archivo.example.com/datos",
    "redis://localhost:6379",
    "javascript:alert(1)",
    "ws://127.0.0.1:8545",
    "wss://rpc.example.com",
    "file:///etc/passwd",
    "no-es-una-url",
  ])("rechaza esquemas no-http (%s)", (url) => {
    expect(() => parse(url)).toThrow(EnvironmentValidationError);
  });
});
