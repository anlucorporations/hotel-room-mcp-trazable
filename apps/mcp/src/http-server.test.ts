import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { connect } from "node:net";
import type { Address } from "viem";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { encodeTokenId } from "@hotel/shared";
import { createMcpHttpServer } from "./http-server";
import { mcpHealthProvider } from "./health";
import type { ChainReader, MintRecord, NightSignals } from "./chain/chain-reader";

const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address;
const TOKEN = encodeTokenId(102, 20260615);
const ABSENT: NightSignals = { exists: false, soldOnce: false, expired: false, listed: false, primaryPriceWei: 0n, listingPriceWei: 0n };

class FakeReader implements ChainReader {
  getHeadBlock = async (): Promise<bigint> => 1n;
  getMintRecords = async (): Promise<MintRecord[]> => [];
  getSoldTokenIds = async (): Promise<Set<string>> => new Set();
  getListedTokenIds = async (): Promise<bigint[]> => [];
  getPurchasedTokenIds = async (): Promise<bigint[]> => [];
  getNightSignals = async (id: bigint): Promise<NightSignals> =>
    id === TOKEN
      ? { exists: true, soldOnce: false, expired: false, listed: false, primaryPriceWei: 50_000_000_000_000_000n, listingPriceWei: 0n }
      : ABSENT;
  isOwnedBy = async (): Promise<boolean> => false;
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)),
  );
}

const startServer = (reader: ChainReader, onError?: (error: unknown) => void): Server =>
  createMcpHttpServer({
    host: "127.0.0.1",
    port: 0,
    healthProvider: mcpHealthProvider(reader),
    deps: { reader, config: { contractAddress: CONTRACT, chainId: 31337 } },
    onError,
  });

/**
 * Envía un POST /mcp crudo cuyo `Content-Length` promete más bytes de los que entrega y luego
 * destruye el socket: provoca un error/abort del stream de la petición en el server (BLOCKER#2).
 */
function postAbortedBody(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1", () => {
      socket.write(
        "POST /mcp HTTP/1.1\r\n" +
          "Host: 127.0.0.1\r\n" +
          "Content-Type: application/json\r\n" +
          "Content-Length: 1000\r\n" +
          "\r\n" +
          '{"jsonrpc":', // cuerpo incompleto: faltan los 1000 bytes prometidos
      );
      // Cierra a la fuerza la conexión: el server verá ECONNRESET/aborted al leer el cuerpo.
      socket.destroy();
      resolve();
    });
    socket.on("error", () => resolve()); // un reset visto por el cliente también es válido
    socket.setTimeout(2000, () => {
      socket.destroy();
      reject(new Error("timeout enviando el cuerpo abortado"));
    });
  });
}

describe("MCP HTTP server (transporte Streamable + /health)", () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    server = startServer(new FakeReader());
    port = await listen(server);
  });
  afterAll(() => {
    server.close();
  });

  it("GET /health responde 200 ok cuando el RPC responde", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", component: "mcp" });
  });

  it("POST /mcp con JSON inválido responde 400", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ esto no es json",
    });
    expect(res.status).toBe(400);
  });

  // BLOCKER#2: un cuerpo que aborta/yerra no debe lanzar ni dejar una promesa rechazada sin
  // controlar (tumbaba/inestabilizaba el server). Debe registrarse vía `onError` y el server seguir vivo.
  it("POST /mcp con cuerpo abortado: no lanza, registra onError y el server sigue vivo", async () => {
    const onError = vi.fn();
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const srv = startServer(new FakeReader(), onError);
    const srvPort = await listen(srv);
    try {
      await postAbortedBody(srvPort);
      // Da margen al server a procesar el abort y a que aflore cualquier rechazo no controlado.
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(unhandled).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledTimes(1);
      // El server sigue atendiendo: /health responde con normalidad tras el abort.
      const health = await fetch(`http://127.0.0.1:${srvPort}/health`);
      expect(health.status).toBe(200);
    } finally {
      process.off("unhandledRejection", unhandled);
      srv.close();
    }
  });

  it("expone las 5 herramientas y ejecuta checkAvailability por el transporte MCP", async () => {
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual([
        "buildPurchaseTx",
        "checkAvailability",
        "getOwnedNights",
        "listAvailableNights",
        "searchHotelManuals",
      ]);
      const result = await client.callTool({
        name: "checkAvailability",
        arguments: { room: 102, date: 20260615 },
      });
      const content = result.content as Array<{ type: string; text: string }>;
      expect(JSON.parse(content[0]!.text)).toMatchObject({ exists: true, available: true });
    } finally {
      await client.close();
    }
  });

  it("GET /health responde 503 si el RPC no responde", async () => {
    const downReader = new FakeReader();
    downReader.getHeadBlock = (): Promise<bigint> => Promise.reject(new Error("rpc down"));
    const down = startServer(downReader);
    const downPort = await listen(down);
    try {
      const res = await fetch(`http://127.0.0.1:${downPort}/health`);
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ status: "down", error: "COMPONENT_DOWN" });
    } finally {
      down.close();
    }
  });
});
