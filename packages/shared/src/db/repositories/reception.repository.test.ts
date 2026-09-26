import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type { Pool, PoolClient } from "pg";
import { ReceptionRepository } from "./reception.repository";
import { ReceptionError } from "../../reception/errors";

/**
 * Repositorio de recepción (incremento v2). Se prueba con un doble parcial del pool —igual que el
 * resto de repositorios— para fijar el contrato: validación de cargos, idempotencia del check-out y
 * solo-check-out-de-estancia-con-entrada.
 */
describe("ReceptionRepository (incremento v2)", () => {
  let repository: ReceptionRepository;
  let mockPool: Pool & { query: Mock; connect: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = {
      query: vi.fn(),
      connect: vi.fn(),
    } as unknown as Pool & { query: Mock; connect: Mock };
    repository = new ReceptionRepository(mockPool);
  });

  describe("findByRecoveryCode", () => {
    it("devuelve null si no hay fila", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await repository.findByRecoveryCode("MDS-AAAAAAAA")).toBeNull();
    });

    it("mapea la reserva", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            token_id: "10120260901",
            room_number: 101,
            room_type: "SIMPLE",
            check_in_date: "2026-09-01",
            status: "SOLD",
            current_owner: "0x1111111111111111111111111111111111111111",
            recovery_code: "MDS-AB12CD34",
            checked_in_at: null,
          },
        ],
        rowCount: 1,
      });

      const reservation = await repository.findByRecoveryCode("MDS-AB12CD34");
      expect(reservation?.tokenId).toBe("10120260901");
      expect(reservation?.roomNumber).toBe(101);
      expect(reservation?.status).toBe("SOLD");
    });
  });

  describe("createCharge", () => {
    it("rechaza un concepto vacío", async () => {
      await expect(
        repository.createCharge({ tokenId: "t1", concept: "   ", amountCents: 100, createdBy: "recepcion" }),
      ).rejects.toMatchObject({ code: "CARGO_INVALIDO" });
    });

    it("rechaza un importe no positivo", async () => {
      await expect(
        repository.createCharge({ tokenId: "t1", concept: "Minibar", amountCents: 0, createdBy: "recepcion" }),
      ).rejects.toMatchObject({ code: "CARGO_INVALIDO" });
    });

    it("rechaza un token inexistente", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(
        repository.createCharge({ tokenId: "t1", concept: "Minibar", amountCents: 100, createdBy: "recepcion" }),
      ).rejects.toBeInstanceOf(ReceptionError);
    });

    it("inserta el cargo y lo mapea", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ token_id: "t1" }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "c1",
              token_id: "t1",
              concept: "Minibar",
              amount_cents: "1250",
              currency: "EUR",
              status: "PENDING",
              created_by: "recepcion",
              created_at: new Date(),
              cancelled_by: null,
              cancelled_at: null,
              cancel_reason: null,
            },
          ],
          rowCount: 1,
        });

      const charge = await repository.createCharge({
        tokenId: "t1",
        concept: "Minibar",
        amountCents: 1250,
        createdBy: "recepcion",
      });
      expect(charge.amountCents).toBe(1250);
      expect(charge.status).toBe("PENDING");
    });
  });

  describe("cancelCharges", () => {
    it("no consulta la base si no hay ids", async () => {
      expect(await repository.cancelCharges("t1", [], "recepcion")).toBe(0);
      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });

  describe("createCheckout", () => {
    /** Cliente falso que resuelve por fragmento de SQL: hace el test legible y estable. */
    function fakeClient(): { client: PoolClient; statements: string[] } {
      const statements: string[] = [];
      const client = {
        query: vi.fn(async (sql: string) => {
          statements.push(sql);
          if (sql.includes("FOR UPDATE")) {
            return { rows: [{ token_id: "t1", room_number: 101, check_in_date: "2026-09-01", status: state.nftStatus }], rowCount: 1 };
          }
          if (sql.includes("FROM stay_checkouts")) {
            return state.existingCheckout ? { rows: [state.existingCheckout], rowCount: 1 } : { rows: [], rowCount: 0 };
          }
          if (sql.includes("INSERT INTO stay_checkouts")) {
            return {
              rows: [
                {
                  id: "co1",
                  token_id: "t1",
                  room_number: 101,
                  check_in_date: "2026-09-01",
                  room_condition: "OK",
                  notes: null,
                  charges_cancelled: 0,
                  processed_by: "recepcion",
                  created_at: new Date(),
                },
              ],
              rowCount: 1,
            };
          }
          if (sql.includes("UPDATE additional_charges")) {
            return { rows: [], rowCount: state.pendingCharges };
          }
          if (sql.includes("FROM checkout_incidents")) {
            return { rows: [], rowCount: 0 };
          }
          return { rows: [], rowCount: 0 };
        }),
        release: vi.fn(),
      } as unknown as PoolClient;

      const state = { nftStatus: "CHECKED_IN", existingCheckout: null as null | Record<string, unknown>, pendingCharges: 2 };
      return { client, statements };
    }

    it("registra el check-out de una estancia con entrada y cancela cargos", async () => {
      const { client } = fakeClient();
      mockPool.connect.mockResolvedValue(client);

      const { checkout, created } = await repository.createCheckout({
        tokenId: "t1",
        roomCondition: "OK",
        incidents: [],
        cancelChargeIds: ["c1", "c2"],
        processedBy: "recepcion",
      });

      expect(created).toBe(true);
      expect(checkout.id).toBe("co1");
      expect(checkout.chargesCancelled).toBe(2);
    });

    it("es idempotente: si ya hay check-out devuelve el existente", async () => {
      const { client } = fakeClient();
      (client.query as Mock).mockImplementation(async (sql: string) => {
        if (sql.includes("FOR UPDATE")) {
          return { rows: [{ token_id: "t1", room_number: 101, check_in_date: "2026-09-01", status: "CHECKED_OUT" }], rowCount: 1 };
        }
        if (sql.includes("FROM stay_checkouts")) {
          return {
            rows: [
              {
                id: "co-existing",
                token_id: "t1",
                room_number: 101,
                check_in_date: "2026-09-01",
                room_condition: "OK",
                notes: null,
                charges_cancelled: 0,
                processed_by: "recepcion",
                created_at: new Date(),
              },
            ],
            rowCount: 1,
          };
        }
        if (sql.includes("FROM checkout_incidents")) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 };
      });
      mockPool.connect.mockResolvedValue(client);

      const { checkout, created } = await repository.createCheckout({
        tokenId: "t1",
        roomCondition: "OK",
        incidents: [],
        cancelChargeIds: [],
        processedBy: "recepcion",
      });

      expect(created).toBe(false);
      expect(checkout.id).toBe("co-existing");
    });

    it("rechaza el check-out de una noche sin entrada", async () => {
      const { client } = fakeClient();
      (client.query as Mock).mockImplementation(async (sql: string) => {
        if (sql.includes("FOR UPDATE")) {
          return { rows: [{ token_id: "t1", room_number: 101, check_in_date: "2026-09-01", status: "SOLD" }], rowCount: 1 };
        }
        if (sql.includes("FROM stay_checkouts")) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 };
      });
      mockPool.connect.mockResolvedValue(client);

      await expect(
        repository.createCheckout({
          tokenId: "t1",
          roomCondition: "OK",
          incidents: [],
          cancelChargeIds: [],
          processedBy: "recepcion",
        }),
      ).rejects.toMatchObject({ code: "ESTANCIA_NO_CHECKED_IN" });
    });
  });
});
