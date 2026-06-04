import Database from "better-sqlite3";
import type { CheckpointStore } from "./types";

/**
 * Implementación de {@link CheckpointStore} sobre better-sqlite3 (T1.4).
 *
 * Modo WAL para lecturas concurrentes y durabilidad razonable. La dirección de contrato se
 * normaliza a minúsculas (clave canónica). El fichero es configurable: en tests se usa un
 * fichero temporal o `:memory:`.
 *
 * SRP: esta clase sólo persiste estado; el cálculo de idempotencia (la clave) y el flujo de
 * negocio viven en el `SaleProcessor`.
 */
export class SqliteCheckpointStore implements CheckpointStore {
  private readonly db: Database.Database;
  private readonly selectBlock: Database.Statement<[string]>;
  private readonly upsertBlock: Database.Statement<[string, number]>;
  private readonly selectProcessed: Database.Statement<[string]>;
  private readonly insertProcessed: Database.Statement<[string]>;

  constructor(filePath: string) {
    this.db = new Database(filePath);
    // `:memory:` no soporta WAL; sólo lo activamos para ficheros en disco.
    if (filePath !== ":memory:") {
      this.db.pragma("journal_mode = WAL");
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoint (
        contract_address TEXT PRIMARY KEY,
        last_block INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS processed (
        idempotency_key TEXT PRIMARY KEY
      );
    `);

    this.selectBlock = this.db.prepare(
      "SELECT last_block FROM checkpoint WHERE contract_address = ?",
    );
    this.upsertBlock = this.db.prepare(
      `INSERT INTO checkpoint (contract_address, last_block) VALUES (?, ?)
       ON CONFLICT(contract_address) DO UPDATE SET last_block = excluded.last_block`,
    );
    this.selectProcessed = this.db.prepare(
      "SELECT 1 FROM processed WHERE idempotency_key = ?",
    );
    this.insertProcessed = this.db.prepare(
      "INSERT OR IGNORE INTO processed (idempotency_key) VALUES (?)",
    );
  }

  getLastBlock(contractAddress: string): number | null {
    const row = this.selectBlock.get(normalize(contractAddress)) as
      | { last_block: number }
      | undefined;
    return row?.last_block ?? null;
  }

  setLastBlock(contractAddress: string, block: number): void {
    this.upsertBlock.run(normalize(contractAddress), block);
  }

  isProcessed(idempotencyKey: string): boolean {
    return this.selectProcessed.get(idempotencyKey) !== undefined;
  }

  markProcessed(idempotencyKey: string): void {
    this.insertProcessed.run(idempotencyKey);
  }

  close(): void {
    this.db.close();
  }
}

const normalize = (address: string): string => address.toLowerCase();
