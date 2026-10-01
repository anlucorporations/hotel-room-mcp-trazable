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

  describe("listGhostPrimarySales (F9 · catálogo ↔ eventos)", () => {
    it("debe preguntar por ventas primarias con índice AVAILABLE y sin reventa activa", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await repository.listGhostPrimarySales();

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      const sql = String((mockPool.query.mock.calls[0] as unknown[])[0]);
      // Las tres condiciones son la definición de «fantasma»; si alguna se pierde, vuelven las
      // noches invendibles del §35 o se ocultan reventas legítimas.
      expect(sql).toContain("se.is_secondary = FALSE");
      expect(sql).toContain("n.status = 'AVAILABLE'");
      expect(sql).toContain("l.active = TRUE");
      expect(sql).toContain("NOT EXISTS");
    });

    it("debe mapear fila a la forma del catálogo (tokenId, habitación numérica, fecha ISO)", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { token_id: "10820261103", room_number: 108, check_in_date: "2026-11-03" },
          { token_id: "10120261015", room_number: 101, check_in_date: "2026-10-15" },
        ],
      });

      const ghosts = await repository.listGhostPrimarySales();

      expect(ghosts).toEqual([
        { tokenId: "10820261103", roomNumber: 108, checkInDate: "2026-11-03" },
        { tokenId: "10120261015", roomNumber: 101, checkInDate: "2026-10-15" },
      ]);
      // `room_number` es INT en la BD: se normaliza a número para coincidir con `mapRowToNFT`.
      expect(typeof ghosts[0]!.roomNumber).toBe("number");
    });

    /**
     * **Regresión del defecto de la release `v15`.** La consulta se escribió como
     * `SELECT DISTINCT … ORDER BY se.token_id::NUMERIC`, y PostgreSQL la rechaza:
     * «for SELECT DISTINCT, ORDER BY expressions must appear in select list». El error no se veía en
     * estas pruebas porque el pool está mockeado (**un mock no valida SQL**): en producción, la
     * excepción hacía que `fetchCatalog` cayera al respaldo por RPC en cada petición y la capa F9
     * quedaba inerte. La forma `GROUP BY` deduplica igual y admite expresiones en el `ORDER BY`.
     *
     * Se reproduce aquí la regla, no el texto: **si hay `DISTINCT`, el `ORDER BY` no puede usar una
     * expresión** (cast incluido) fuera de la lista de selección. La validación de sintaxis real se
     * hizo contra un motor PostgreSQL (PGlite) y quedó registrada en `estado_proyecto.md` §37.
     */
    it("NO usa `SELECT DISTINCT` con `ORDER BY` de expresión (SQL inválido en PostgreSQL)", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await repository.listGhostPrimarySales();

      const sql = String((mockPool.query.mock.calls[0] as unknown[])[0]);
      const orderBy = /ORDER BY\s+([^\n]+)/i.exec(sql)?.[1]?.trim() ?? "";

      // La deduplicación se hace con GROUP BY (admite ORDER BY por expresión).
      expect(sql).toMatch(/GROUP BY\s+se\.token_id/i);
      // Y no se vuelve a la forma que rompió producción.
      expect(sql).not.toMatch(/SELECT\s+DISTINCT/i);
      // El orden sigue siendo determinista (numérico, no alfabético).
      expect(orderBy).toMatch(/se\.token_id::NUMERIC/i);
    });
  });
});
