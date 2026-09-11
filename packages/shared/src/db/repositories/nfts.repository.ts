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
