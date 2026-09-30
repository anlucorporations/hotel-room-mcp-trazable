import type { Pool, QueryResultRow } from "pg";
import { getDbPool } from "../pool";
import type { RoomTypeDb } from "../../domain/room-master";
import { recoveryCodeForToken } from "../../reception/recovery-code";

export interface NFTRecord {
  tokenId: string;
  roomNumber: number;
  roomType: RoomTypeDb;
  checkInDate: string; // YYYY-MM-DD
  basePriceWei: string;
  status: "AVAILABLE" | "CONFIRMING" | "SOLD" | "BURNED" | "CHECKED_IN" | "CHECKED_OUT";
  currentOwner: string;
  checkInSecretEnc?: string | null;
  mintedAt?: Date;
  checkedInAt?: Date | null;
  burnedAt?: Date | null;
  txHashMint: string;
  /**
   * Código de recuperación de reserva (D-32, CU-32): identificador corto y estable que recepción
   * teclea si el QR no está disponible. Se deriva del `tokenId`, nunca de datos personales.
   */
  recoveryCode?: string | null;
  /**
   * ¿La fila procede de una transacción real? Por defecto `true` (las filas las escribe el
   * worker a partir de eventos on-chain). El minteo masivo del back-office, que NO emite
   * transacciones, persiste `false` y esas filas quedan fuera del catálogo.
   */
  onChainAnchored?: boolean;
}

/**
 * Hash centinela para filas sin anclaje on-chain.
 *
 * Antes el minteo persistía `0xmint_<timestamp>_<tokenId>`, un hash INVENTADO que parecía una
 * transacción real y rompía la trazabilidad (RF-01/RF-03). Los hashes ficticios ya no se
 * escriben: una fila no anclada usa este centinela explícito y `on_chain_anchored = FALSE`.
 */
export const UNANCHORED_TX_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

export interface ListingRecord {
  id?: string;
  tokenId: string;
  seller: string;
  priceInWei: string;
  active: boolean;
  listedAt?: Date;
  cancelledAt?: Date | null;
  txHashList: string;
}

export interface SaleEventRecord {
  id?: string;
  tokenId: string;
  seller: string;
  buyer: string;
  priceInWei: string;
  royaltyAmountWei: string;
  isSecondary: boolean;
  txHash: string;
  blockNumber: number;
  blockTimestamp?: Date;
}

export interface CatalogFilters {
  status?: string;
  /** Tipo del maestro: `SIMPLE`, `DOBLE` o `SUITE` (M9: «doble» dejó de perderse al persistir). */
  roomType?: RoomTypeDb;
  dateFrom?: string;
  dateTo?: string;
  priceMinWei?: string;
  priceMaxWei?: string;
  page?: number;
  limit?: number;
}

export interface CatalogResponse {
  items: NFTRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class NFTsRepository {
  constructor(private pool: Pool = getDbPool()) {}

  async upsertNFT(nft: NFTRecord): Promise<NFTRecord> {
    const query = `
      INSERT INTO nfts (
        token_id, room_number, room_type, check_in_date, base_price_wei,
        status, current_owner, check_in_secret_enc, tx_hash_mint, minted_at, on_chain_anchored,
        recovery_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, NOW()), COALESCE($11, TRUE), $12)
      ON CONFLICT (token_id) DO UPDATE SET
        status = EXCLUDED.status,
        current_owner = EXCLUDED.current_owner,
        check_in_secret_enc = COALESCE(EXCLUDED.check_in_secret_enc, nfts.check_in_secret_enc),
        on_chain_anchored = EXCLUDED.on_chain_anchored,
        recovery_code = COALESCE(nfts.recovery_code, EXCLUDED.recovery_code),
        checked_in_at = CASE WHEN EXCLUDED.status = 'CHECKED_IN' THEN NOW() ELSE nfts.checked_in_at END,
        burned_at = CASE WHEN EXCLUDED.status = 'BURNED' THEN NOW() ELSE nfts.burned_at END
      RETURNING *;
    `;
    const values = [
      nft.tokenId,
      nft.roomNumber,
      nft.roomType,
      nft.checkInDate,
      nft.basePriceWei,
      nft.status,
      nft.currentOwner,
      nft.checkInSecretEnc || null,
      nft.txHashMint,
      nft.mintedAt || null,
      nft.onChainAnchored === undefined ? null : nft.onChainAnchored,
      // El código se deriva del token (estable): si la fila ya tiene uno, el ON CONFLICT lo conserva.
      nft.recoveryCode ?? recoveryCodeForToken(nft.tokenId),
    ];
    const res = await this.pool.query(query, values);
    return this.mapRowToNFT(res.rows[0]);
  }

  /**
   * Marca una fila como anclada on-chain tras confirmarse su transacción real.
   * Es la operación que promueve al catálogo una noche minteada por el back-office.
   */
  async markAnchored(tokenId: string, txHashMint: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE nfts SET on_chain_anchored = TRUE, tx_hash_mint = $2
       WHERE token_id = $1
       RETURNING token_id`,
      [tokenId, txHashMint],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /** Noches minteadas sin anclaje on-chain (pendientes de que el worker las ancle). */
  async getUnanchoredNFTs(): Promise<NFTRecord[]> {
    const res = await this.pool.query(
      `SELECT * FROM nfts WHERE on_chain_anchored = FALSE ORDER BY check_in_date ASC, room_number ASC`,
    );
    return res.rows.map((row) => this.mapRowToNFT(row));
  }

  async getNFTById(tokenId: string): Promise<NFTRecord | null> {
    const res = await this.pool.query("SELECT * FROM nfts WHERE token_id = $1", [tokenId]);
    if (res.rows.length === 0) return null;
    return this.mapRowToNFT(res.rows[0]);
  }

  async queryCatalog(filters: CatalogFilters = {}): Promise<CatalogResponse> {
    // Las filas sin anclaje on-chain NO son ofertables: el catálogo es la superficie comercial
    // y no puede mostrar noches cuya transacción de minteo no existe (RF-01, D-04).
    const conditions: string[] = ["on_chain_anchored = TRUE"];
    const values: unknown[] = [];
    let idx = 1;

    if (filters.status) {
      conditions.push(`status = $${idx++}`);
      values.push(filters.status);
    }
    if (filters.roomType) {
      conditions.push(`room_type = $${idx++}`);
      values.push(filters.roomType);
    }
    if (filters.dateFrom) {
      conditions.push(`check_in_date >= $${idx++}`);
      values.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      conditions.push(`check_in_date <= $${idx++}`);
      values.push(filters.dateTo);
    }
    if (filters.priceMinWei) {
      conditions.push(`base_price_wei >= $${idx++}::NUMERIC`);
      values.push(filters.priceMinWei);
    }
    if (filters.priceMaxWei) {
      conditions.push(`base_price_wei <= $${idx++}::NUMERIC`);
      values.push(filters.priceMaxWei);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    // Conteo total
    const countRes = await this.pool.query(
      `SELECT COUNT(*)::INT as total FROM nfts ${whereClause}`,
      values,
    );
    const total = countRes.rows[0].total;

    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const offset = (page - 1) * limit;

    const itemsQuery = `
      SELECT * FROM nfts
      ${whereClause}
      ORDER BY check_in_date ASC, room_number ASC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    const itemsRes = await this.pool.query(itemsQuery, [...values, limit, offset]);

    return {
      items: itemsRes.rows.map(this.mapRowToNFT),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async createListing(listing: ListingRecord): Promise<ListingRecord> {
    const res = await this.pool.query(
      `INSERT INTO listings (token_id, seller, price_in_wei, active, tx_hash_list)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [listing.tokenId, listing.seller, listing.priceInWei, listing.active, listing.txHashList],
    );
    const row = res.rows[0];
    return {
      id: row.id,
      tokenId: row.token_id,
      seller: row.seller,
      priceInWei: row.price_in_wei.toString(),
      active: row.active,
      listedAt: row.listed_at,
      cancelledAt: row.cancelled_at,
      txHashList: row.tx_hash_list,
    };
  }

  async getActiveListingByToken(tokenId: string): Promise<ListingRecord | null> {
    const res = await this.pool.query(
      "SELECT * FROM listings WHERE token_id = $1 AND active = TRUE",
      [tokenId],
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      tokenId: row.token_id,
      seller: row.seller,
      priceInWei: row.price_in_wei.toString(),
      active: row.active,
      listedAt: row.listed_at,
      cancelledAt: row.cancelled_at,
      txHashList: row.tx_hash_list,
    };
  }

  async cancelListing(tokenId: string): Promise<void> {
    await this.pool.query(
      "UPDATE listings SET active = FALSE, cancelled_at = NOW() WHERE token_id = $1 AND active = TRUE",
      [tokenId],
    );
  }

  /**
   * F9 · noches que el **registro de ventas** (eventos on-chain) confirma vendidas en primaria y que,
   * sin embargo, el índice sigue ofreciendo como `AVAILABLE`: las «fantasmas» del §35. La cadena
   * rechaza `buy` sobre ellas (`NightNotAvailable`) y el huésped recibía un mensaje de red.
   *
   * Por qué esta consulta y no una resta de agregados: una noche vendida puede volver al mercado por
   * su dueño con una **reventa activa**; entonces sí es ofertable (por `buyResale`, en su propia
   * vista), así que contarla como fantasma sería un falso positivo. Se excluyen explícitamente los
   * `token_id` con listado activo. Solo ventas **primarias**: una secundaria no cambia la condición
   * de inventario del hotel.
   */
  async listGhostPrimarySales(): Promise<
    Array<{ tokenId: string; roomNumber: number; checkInDate: string }>
  > {
    const res = await this.pool.query(
      `SELECT DISTINCT se.token_id,
              n.room_number,
              to_char(n.check_in_date, 'YYYY-MM-DD') AS check_in_date
         FROM sale_events se
         JOIN nfts n ON n.token_id = se.token_id
        WHERE se.is_secondary = FALSE
          AND n.status = 'AVAILABLE'
          AND NOT EXISTS (
            SELECT 1 FROM listings l WHERE l.token_id = se.token_id AND l.active = TRUE
          )
        ORDER BY se.token_id::NUMERIC ASC`,
    );
    // `room_number` es `INT` y `check_in_date` es `DATE`: el mapeo coincide con `mapRowToNFT`
    // (número y `AAAA-MM-DD`), para que el consumidor no tenga dos formatos de la misma noche.
    return res.rows.map(
      (row: { token_id: string; room_number: number; check_in_date: string }) => ({
        tokenId: row.token_id,
        roomNumber: Number(row.room_number),
        checkInDate: String(row.check_in_date),
      }),
    );
  }

  async recordSaleEvent(sale: SaleEventRecord): Promise<SaleEventRecord> {
    const res = await this.pool.query(
      `INSERT INTO sale_events (
        token_id, seller, buyer, price_in_wei, royalty_amount_wei,
        is_secondary, tx_hash, block_number, block_timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, NOW()))
      RETURNING *`,
      [
        sale.tokenId,
        sale.seller,
        sale.buyer,
        sale.priceInWei,
        sale.royaltyAmountWei,
        sale.isSecondary,
        sale.txHash,
        sale.blockNumber,
        sale.blockTimestamp || null,
      ],
    );
    const row = res.rows[0];
    return {
      id: row.id,
      tokenId: row.token_id,
      seller: row.seller,
      buyer: row.buyer,
      priceInWei: row.price_in_wei.toString(),
      royaltyAmountWei: row.royalty_amount_wei.toString(),
      isSecondary: row.is_secondary,
      txHash: row.tx_hash,
      blockNumber: Number(row.block_number),
      blockTimestamp: row.block_timestamp,
    };
  }

  /**
   * NOTA (M7, D-16): aquí vivía `getSalesHistory()`, la lectura paginada de `sale_events` que
   * servía la tabla `/historico` y su CSV. El histórico público lee ahora del worker
   * (`worker_sale_history`), la misma fuente que el dashboard: era el último camino paralelo que
   * podía hacer que la tabla, el CSV y las cifras del dashboard discrepasen.
   *
   * `sale_events` sigue escribiéndose (vía `recordSaleEvent`) como registro auditable de ventas.
   */

  /**
   * Noches impagas ya caducadas según la fecha indicada.
   *
   * El comparador es `<` y NO `<=`: el contrato considera caducada una noche cuando su fecha es
   * **anterior** al día de la cadena (`_isExpired = tokenId % 1e8 < todayYYYYMMDD`). Con `<=`, la
   * noche del propio día entraba como candidata y la quema la descartaba en la simulación
   * (`NotExpired`), ensuciando los descartes del ciclo.
   */
  async getUnsoldExpiredNFTs(beforeDate: string): Promise<NFTRecord[]> {
    const res = await this.pool.query(
      `SELECT * FROM nfts 
       WHERE status = 'AVAILABLE' AND check_in_date < $1 
       ORDER BY check_in_date ASC, room_number ASC`,
      [beforeDate],
    );
    return res.rows.map(this.mapRowToNFT);
  }

  async updateNFTStatus(
    tokenId: string,
    status: "AVAILABLE" | "CONFIRMING" | "SOLD" | "BURNED" | "CHECKED_IN" | "CHECKED_OUT",
    extra?: { currentOwner?: string; checkInSecretEnc?: string; burnedAt?: Date; checkedInAt?: Date },
  ): Promise<void> {
    const updates: string[] = ["status = $2"];
    const values: unknown[] = [tokenId, status];
    let idx = 3;

    if (extra?.currentOwner) {
      updates.push(`current_owner = $${idx++}`);
      values.push(extra.currentOwner);
    }
    if (extra?.checkInSecretEnc) {
      updates.push(`check_in_secret_enc = $${idx++}`);
      values.push(extra.checkInSecretEnc);
    }
    if (status === "BURNED") {
      updates.push(`burned_at = NOW()`);
    }
    if (status === "CHECKED_IN") {
      updates.push(`checked_in_at = NOW()`);
    }

    await this.pool.query(
      `UPDATE nfts SET ${updates.join(", ")} WHERE token_id = $1`,
      values,
    );
  }

  /**
   * Marca un NFT como CHECKED_IN de forma atómica optimista (US-14).
   */
  async markCheckedIn(tokenId: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE nfts 
       SET status = 'CHECKED_IN', checked_in_at = NOW() 
       WHERE token_id = $1 AND status IN ('SOLD', 'CONFIRMING', 'AVAILABLE')
       RETURNING token_id`,
      [tokenId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Busca un NFT por número de habitación y fecha de check-in (para contingencia asistida).
   */
  async findNFTByRoomAndDate(roomNumber: number, checkInDate: string): Promise<NFTRecord | null> {
    const res = await this.pool.query(
      `SELECT * FROM nfts WHERE room_number = $1 AND check_in_date = $2`,
      [roomNumber, checkInDate],
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToNFT(res.rows[0]);
  }

  /**
   * Noches de una habitación con check-in dentro de un rango `[fromDate, toDate]` (ISO `AAAA-MM-DD`).
   *
   * La usa la ventana global de acuñación (F8 · D-4): con el `token_id` se sabe qué noches ya
   * existen (idempotencia, D-16) y con `status` cuántas siguen libres (`AVAILABLE`) para el aviso de
   * agotamiento (D-17). Solo devuelve lo imprescindible; el detalle de la noche no hace falta aquí.
   */
  async listByRoomInDateRange(
    roomNumber: number,
    fromDate: string,
    toDate: string,
  ): Promise<Array<{ tokenId: string; status: string }>> {
    const res = await this.pool.query(
      `SELECT token_id, status FROM nfts
        WHERE room_number = $1 AND check_in_date BETWEEN $2 AND $3`,
      [roomNumber, fromDate, toDate],
    );
    return res.rows.map((row: { token_id: string; status: string }) => ({
      tokenId: row.token_id,
      status: row.status,
    }));
  }

  /**
   * Registra la auditoría de un check-in asistido por contingencia (SRS §4.2, RD 933/2021).
   */
  async recordContingencyCheckIn(
    tokenId: string,
    data: {
      roomNumber: number;
      checkInDate: string;
      possessionProofType: string;
      possessionProofValue: string;
      reason: string;
    },
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO checkin_contingency_logs 
       (token_id, room_number, check_in_date, possession_proof_type, possession_proof_value, reason, pms_registered)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
      [
        tokenId,
        data.roomNumber,
        data.checkInDate,
        data.possessionProofType,
        data.possessionProofValue,
        data.reason,
      ],
    );
  }

  /**
   * Registra una suscripción Web Push anónima (opt-in LSSI-CE art. 21).
   */
  async addPushSubscription(endpoint: string, p256dh: string, auth: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO push_subscriptions (endpoint, keys_p256dh, keys_auth)
       VALUES ($1, $2, $3)
       ON CONFLICT (endpoint) DO UPDATE 
       SET keys_p256dh = EXCLUDED.keys_p256dh, keys_auth = EXCLUDED.keys_auth`,
      [endpoint, p256dh, auth],
    );
  }

  /**
   * Elimina una suscripción Web Push (opt-out).
   */
  async removePushSubscription(endpoint: string): Promise<void> {
    await this.pool.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
  }

  /**
   * Obtiene todas las suscripciones Web Push activas.
   */
  async getAllPushSubscriptions(): Promise<Array<{ endpoint: string; p256dh: string; auth: string }>> {
    const res = await this.pool.query(
      `SELECT endpoint, keys_p256dh as p256dh, keys_auth as auth FROM push_subscriptions`,
    );
    return res.rows;
  }

  /**
   * NOTA (M7, D-16): aquí vivía `getFinancialMetrics()`, un segundo cálculo de las métricas
   * financieras a partir de `sale_events` + `nfts`. Se retiró porque el dashboard y su exportación
   * CSV leen ahora los agregados del worker (`worker_sale_history`, la MISMA fuente que alimenta
   * el histórico público): dos caminos distintos para la misma cifra solo garantizan que algún día
   * discrepen. `sale_events` sigue siendo el registro auditable de ventas que escribe el listener.
   */

  private mapRowToNFT(row: QueryResultRow): NFTRecord {
    return {
      tokenId: row.token_id,
      roomNumber: row.room_number,
      roomType: row.room_type,
      checkInDate: row.check_in_date instanceof Date ? row.check_in_date.toISOString().slice(0, 10) : String(row.check_in_date),
      basePriceWei: row.base_price_wei.toString(),
      status: row.status,
      currentOwner: row.current_owner,
      checkInSecretEnc: row.check_in_secret_enc,
      mintedAt: row.minted_at,
      checkedInAt: row.checked_in_at,
      burnedAt: row.burned_at,
      txHashMint: row.tx_hash_mint,
      onChainAnchored: row.on_chain_anchored ?? true,
      recoveryCode: row.recovery_code ?? null,
    };
  }
}
