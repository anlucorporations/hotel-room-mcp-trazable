import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type { Pool } from "pg";
import { ReviewsRepository } from "./reviews.repository";

/** Pruebas del repositorio de reseñas (F6 · D-27, D-28, D-58, D-59). */

const reviewRow = (o: Record<string, unknown> = {}) => ({
  id: "rev-1",
  room_type: "DOBLE",
  rating: 5,
  comment: "Vistas increíbles",
  status: "APPROVED",
  created_at: new Date("2026-09-20T00:00:00Z"),
  moderated_by: "admin@hotel.es",
  moderated_at: new Date("2026-09-21T00:00:00Z"),
  ...o,
});

describe("ReviewsRepository (F6)", () => {
  let repository: ReviewsRepository;
  let pool: Pool & { query: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    pool = { query: vi.fn() } as unknown as Pool & { query: Mock };
    repository = new ReviewsRepository(pool);
  });

  it("solo publica reseñas APPROVED y no expone token ni habitación", async () => {
    pool.query.mockResolvedValueOnce({ rows: [reviewRow()], rowCount: 1 });
    const reviews = await repository.listApproved(6);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.roomType).toBe("DOBLE");
    expect(Object.keys(reviews[0]!)).not.toContain("tokenId");
    const [sql, values] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(String(sql)).toContain("status = 'APPROVED'");
    expect(values).toEqual([6]);
  });

  it("calcula la nota media y el número de reseñas aprobadas", async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ average: "4.33", count: 12 }], rowCount: 1 });
    expect(await repository.summary()).toEqual({ average: 4.33, count: 12 });
  });

  it("sin reseñas la media es null y el número 0", async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ average: null, count: 0 }], rowCount: 1 });
    expect(await repository.summary()).toEqual({ average: null, count: 0 });
  });

  it("lista por estado para la moderación (D-58)", async () => {
    pool.query.mockResolvedValueOnce({ rows: [reviewRow({ status: "PENDING" })], rowCount: 1 });
    const pending = await repository.listByStatus("PENDING");
    expect(pending[0]?.status).toBe("PENDING");
  });
});
