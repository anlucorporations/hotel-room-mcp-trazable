import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type { Pool } from "pg";
import {
  MINT_WINDOW_DAYS_KEY,
  NO_SHOW_HOUR_KEY,
  RESERVATION_DEPOSIT_PERCENT_KEY,
  SettingsRepository,
} from "./settings.repository";

describe("SettingsRepository (D-11, D-37, D-42)", () => {
  let repository: SettingsRepository;
  let mockPool: Pool & { query: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = { query: vi.fn() } as Pool & { query: Mock };
    repository = new SettingsRepository(mockPool);
  });

  it("devuelve el valor de un ajuste existente", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ value: "90" }] });
    expect(await repository.get(MINT_WINDOW_DAYS_KEY)).toBe("90");
  });

  it("devuelve null si el ajuste no existe", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    expect(await repository.get(NO_SHOW_HOUR_KEY)).toBeNull();
  });

  it("getNumber usa el respaldo cuando falta o no es numérico", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    expect(await repository.getNumber(RESERVATION_DEPOSIT_PERCENT_KEY, 30)).toBe(30);

    mockPool.query.mockResolvedValueOnce({ rows: [{ value: "no-numero" }] });
    expect(await repository.getNumber(RESERVATION_DEPOSIT_PERCENT_KEY, 30)).toBe(30);

    mockPool.query.mockResolvedValueOnce({ rows: [{ value: "50" }] });
    expect(await repository.getNumber(RESERVATION_DEPOSIT_PERCENT_KEY, 30)).toBe(50);
  });

  it("fija un ajuste con upsert idempotente", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    await repository.set(NO_SHOW_HOUR_KEY, "18", "admin@hotel.es");
    const sql = String(mockPool.query.mock.calls[0][0]);
    expect(sql).toContain("ON CONFLICT (key) DO UPDATE");
    expect(mockPool.query.mock.calls[0][1]).toEqual([NO_SHOW_HOUR_KEY, "18", "admin@hotel.es"]);
  });
});
