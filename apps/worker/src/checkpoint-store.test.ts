import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteCheckpointStore } from "./checkpoint-store";

const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "worker-store-"));
  dbPath = join(tmpDir, "store.sqlite");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("SqliteCheckpointStore", () => {
  it("checkpoint: null inicial, upsert e idempotencia de la dirección (insensible a mayúsculas)", () => {
    const store = new SqliteCheckpointStore(":memory:");
    expect(store.getLastBlock(CONTRACT)).toBeNull();

    store.setLastBlock(CONTRACT, 100);
    expect(store.getLastBlock(CONTRACT)).toBe(100);

    store.setLastBlock(CONTRACT.toLowerCase(), 200);
    expect(store.getLastBlock(CONTRACT)).toBe(200); // misma fila (dirección normalizada)
    store.close();
  });

  it("processed: marca y consulta idempotentemente", () => {
    const store = new SqliteCheckpointStore(":memory:");
    const key = "0xabc";
    expect(store.isProcessed(key)).toBe(false);
    store.markProcessed(key);
    store.markProcessed(key); // INSERT OR IGNORE: no lanza
    expect(store.isProcessed(key)).toBe(true);
    store.close();
  });

  it("persiste en disco entre instancias (reinicio)", () => {
    const store1 = new SqliteCheckpointStore(dbPath);
    store1.setLastBlock(CONTRACT, 42);
    store1.markProcessed("0xkey");
    store1.close();

    const store2 = new SqliteCheckpointStore(dbPath);
    expect(store2.getLastBlock(CONTRACT)).toBe(42);
    expect(store2.isProcessed("0xkey")).toBe(true);
    store2.close();
  });
});
