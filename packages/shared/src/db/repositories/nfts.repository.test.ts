import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type { Pool } from "pg";
import { NFTsRepository, type NFTRecord, type ListingRecord, type SaleEventRecord } from "./nfts.repository";

describe("NFTsRepository (US-04, US-07b)", () => {
  let repository: NFTsRepository;
  // Doble parcial del pool: solo se ejercita `query`, por eso el mock se declara como intersección.
  let mockPool: Pool & { query: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = {
      query: vi.fn(),
    } as Pool & { query: Mock };
    repository = new NFTsRepository(mockPool);
  });

  describe("upsertNFT", () => {
    it("debe insertar o actualizar un NFT correctamente", async () => {
      const nft: NFTRecord = {
        tokenId: "10120260901",
        roomNumber: 101,
        roomType: "SIMPLE",
        checkInDate: "2026-09-01",
        basePriceWei: "100000000000000000",
        status: "AVAILABLE",
        currentOwner: "0x1111111111111111111111111111111111111111",
        txHashMint: "0xabcdef1234567890",
      };

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            token_id: nft.tokenId,
            room_number: nft.roomNumber,
            room_type: nft.roomType,
            check_in_date: nft.checkInDate,
            base_price_wei: nft.basePriceWei,
            status: nft.status,
            current_owner: nft.currentOwner,
            check_in_secret_enc: null,
            tx_hash_mint: nft.txHashMint,
            minted_at: new Date(),
            checked_in_at: null,
            burned_at: null,
          },
        ],
      });

      const res = await repository.upsertNFT(nft);
      expect(mockPool.query).toHaveBeenCalledTimes(1);
      expect(res.tokenId).toBe(nft.tokenId);
      expect(res.roomNumber).toBe(101);
      expect(res.status).toBe("AVAILABLE");
    });
  });

  describe("queryCatalog", () => {
    it("debe construir la consulta con filtros combinados y paginación", async () => {
      // Mock de conteo
      mockPool.query.mockResolvedValueOnce({
        rows: [{ total: 1 }],
      });
      // Mock de items
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            token_id: "20120260901",
            room_number: 201,
            room_type: "SUITE",
            check_in_date: "2026-09-01",
            base_price_wei: "200000000000000000",
            status: "AVAILABLE",
            current_owner: "0x2222222222222222222222222222222222222222",
            check_in_secret_enc: null,
            tx_hash_mint: "0xmint2",
            minted_at: new Date(),
          },
        ],
      });

      const catalog = await repository.queryCatalog({
        status: "AVAILABLE",
        roomType: "SUITE",
        dateFrom: "2026-09-01",
        dateTo: "2026-09-02",
        page: 1,
        limit: 10,
      });

      expect(catalog.total).toBe(1);
      expect(catalog.items).toHaveLength(1);
      expect(catalog.items[0].roomType).toBe("SUITE");
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });
  });

  describe("createListing y cancelListing", () => {
    it("debe registrar un listing y permitir su cancelación", async () => {
      const listing: ListingRecord = {
        tokenId: "10120260901",
        seller: "0x1111111111111111111111111111111111111111",
        priceInWei: "150000000000000000",
        active: true,
        txHashList: "0xlist1",
      };

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: "listing-1",
            token_id: listing.tokenId,
            seller: listing.seller,
            price_in_wei: listing.priceInWei,
            active: true,
            tx_hash_list: listing.txHashList,
            listed_at: new Date(),
          },
        ],
      });

      const created = await repository.createListing(listing);
      expect(created.id).toBe("listing-1");
      expect(created.priceInWei).toBe(listing.priceInWei);

      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await repository.cancelListing(listing.tokenId);
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });
  });

  describe("recordSaleEvent", () => {
    it("debe registrar un evento de venta", async () => {
      const sale: SaleEventRecord = {
        tokenId: "10120260901",
        seller: "0x1111111111111111111111111111111111111111",
        buyer: "0x3333333333333333333333333333333333333333",
        priceInWei: "150000000000000000",
        royaltyAmountWei: "7500000000000000",
        isSecondary: true,
        txHash: "0xsale1",
        blockNumber: 123456,
      };

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: "sale-1",
            token_id: sale.tokenId,
            seller: sale.seller,
            buyer: sale.buyer,
            price_in_wei: sale.priceInWei,
            royalty_amount_wei: sale.royaltyAmountWei,
            is_secondary: true,
            tx_hash: sale.txHash,
            block_number: 123456,
            block_timestamp: new Date(),
          },
        ],
      });

      const recorded = await repository.recordSaleEvent(sale);
      expect(recorded.id).toBe("sale-1");
      expect(recorded.isSecondary).toBe(true);
      expect(recorded.blockNumber).toBe(123456);
    });
  });
});
