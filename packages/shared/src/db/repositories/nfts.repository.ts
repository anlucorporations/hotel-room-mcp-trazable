import type { Pool } from "pg";
import { getDbPool } from "../pool";

export interface NFTRecord {
  tokenId: string;
  roomNumber: number;
  roomType: "SIMPLE" | "SUITE";
  checkInDate: string; // YYYY-MM-DD
  basePriceWei: string;
  status: "AVAILABLE" | "CONFIRMING" | "SOLD" | "BURNED" | "CHECKED_IN";
  currentOwner: string;
  checkInSecretEnc?: string | null;
  mintedAt?: Date;
  checkedInAt?: Date | null;
  burnedAt?: Date | null;
  txHashMint: string;
}

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
  roomType?: "SIMPLE" | "SUITE";
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
        status, current_owner, check_in_secret_enc, tx_hash_mint, minted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, NOW()))
      ON CONFLICT (token_id) DO UPDATE SET
        status = EXCLUDED.status,
        current_owner = EXCLUDED.current_owner,
        check_in_secret_enc = COALESCE(EXCLUDED.check_in_secret_enc, nfts.check_in_secret_enc),
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
    ];
    const res = await this.pool.query(query, values);
    return this.mapRowToNFT(res.rows[0]);
  }

  async getNFTById(tokenId: string): Promise<NFTRecord | null> {
    const res = await this.pool.query("SELECT * FROM nfts WHERE token_id = $1", [tokenId]);
    if (res.rows.length === 0) return null;
    return this.mapRowToNFT(res.rows[0]);
  }

  async queryCatalog(filters: CatalogFilters = {}): Promise<CatalogResponse> {
    const conditions: string[] = [];
    const values: any[] = [];
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

  async getSalesHistory(limit = 20, offset = 0): Promise<{ items: SaleEventRecord[]; total: number }> {
    const countRes = await this.pool.query("SELECT COUNT(*)::INT as total FROM sale_events");
    const total = countRes.rows[0].total;

    const res = await this.pool.query(
      `SELECT * FROM sale_events 
       ORDER BY block_timestamp DESC, block_number DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    const items = res.rows.map((row) => ({
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
    }));

    return { items, total };
  }

  async getUnsoldExpiredNFTs(beforeDate: string): Promise<NFTRecord[]> {
    const res = await this.pool.query(
      `SELECT * FROM nfts 
       WHERE status = 'AVAILABLE' AND check_in_date <= $1 
       ORDER BY check_in_date ASC, room_number ASC`,
      [beforeDate],
    );
    return res.rows.map(this.mapRowToNFT);
  }

  async updateNFTStatus(
    tokenId: string,
    status: "AVAILABLE" | "CONFIRMING" | "SOLD" | "BURNED" | "CHECKED_IN",
    extra?: { currentOwner?: string; checkInSecretEnc?: string; burnedAt?: Date; checkedInAt?: Date },
  ): Promise<void> {
    const updates: string[] = ["status = $2"];
    const values: any[] = [tokenId, status];
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
   * Obtiene las 7 métricas comerciales y financieras del hotel calculadas on-chain/off-chain (US-16).
   */
  async getFinancialMetrics(): Promise<{
    primaryVolumeWei: string;
    secondaryVolumeWei: string;
    accumulatedRoyaltiesWei: string;
    soldCount: number;
    mintedCount: number;
    burnedCount: number;
    commercialOccupancyPercent: number;
  }> {
    const [salesRes, nftsCountRes] = await Promise.all([
      this.pool.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN is_secondary = FALSE THEN price_in_wei ELSE 0 END), 0) as primary_volume,
          COALESCE(SUM(CASE WHEN is_secondary = TRUE THEN price_in_wei ELSE 0 END), 0) as secondary_volume,
          COALESCE(SUM(royalty_amount_wei), 0) as royalties,
          COUNT(CASE WHEN is_secondary = FALSE THEN 1 END) as primary_sales_count
        FROM sale_events
      `),
      this.pool.query(`
        SELECT 
          COUNT(*) as minted_count,
          COUNT(CASE WHEN status = 'BURNED' THEN 1 END) as burned_count,
          COUNT(CASE WHEN status IN ('SOLD', 'CHECKED_IN') THEN 1 END) as sold_count
        FROM nfts
      `),
    ]);

    const sales = salesRes.rows[0];
    const nfts = nftsCountRes.rows[0];

    const mintedCount = parseInt(nfts.minted_count, 10) || 0;
    const soldCount = parseInt(nfts.sold_count, 10) || 0;
    const burnedCount = parseInt(nfts.burned_count, 10) || 0;
    const commercialOccupancyPercent = mintedCount > 0 ? (soldCount / mintedCount) * 100 : 0;

    return {
      primaryVolumeWei: sales.primary_volume.toString(),
      secondaryVolumeWei: sales.secondary_volume.toString(),
      accumulatedRoyaltiesWei: sales.royalties.toString(),
      soldCount,
      mintedCount,
      burnedCount,
      commercialOccupancyPercent: Number(commercialOccupancyPercent.toFixed(2)),
    };
  }

  private mapRowToNFT(row: any): NFTRecord {
    return {
      tokenId: row.token_id,
      roomNumber: row.room_number,
      roomType: row.room_type,
      checkInDate: row.check_in_date instanceof Date ? row.check_in_date.toISOString().split("T")[0] : String(row.check_in_date),
      basePriceWei: row.base_price_wei.toString(),
      status: row.status,
      currentOwner: row.current_owner,
      checkInSecretEnc: row.check_in_secret_enc,
      mintedAt: row.minted_at,
      checkedInAt: row.checked_in_at,
      burnedAt: row.burned_at,
      txHashMint: row.tx_hash_mint,
    };
  }
}
