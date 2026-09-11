import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionsRepository } from "./sessions.repository";

describe("SessionsRepository (US-05)", () => {
  let repository: SessionsRepository;
  let mockPool: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = {
      query: vi.fn(),
    };
    repository = new SessionsRepository(mockPool);
  });

  describe("createSession y getSessionByHash", () => {
    it("debe crear una sesión y recuperarla por hash si está activa", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: "session-uuid-1" }],
      });

      const sessionId = await repository.createSession(
        "carlos_admin",
        "DEFAULT_ADMIN_ROLE",
        "hash_refresh_token_123",
        "192.168.1.1",
        "Mozilla/5.0",
        new Date(Date.now() + 600000),
      );

      expect(sessionId).toBe("session-uuid-1");

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: "session-uuid-1",
            username: "carlos_admin",
            role: "DEFAULT_ADMIN_ROLE",
            refresh_token_hash: "hash_refresh_token_123",
            ip_address: "192.168.1.1",
            user_agent: "Mozilla/5.0",
            revoked: false,
            expires_at: new Date(Date.now() + 600000),
            created_at: new Date(),
          },
        ],
      });

      const session = await repository.getSessionByHash("hash_refresh_token_123");
      expect(session).toBeDefined();
      expect(session?.username).toBe("carlos_admin");
      expect(session?.role).toBe("DEFAULT_ADMIN_ROLE");
      expect(session?.revoked).toBe(false);
    });
  });

  describe("MFA Recovery Codes", () => {
    it("debe guardar códigos de rescate y contabilizarlos", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // delete
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // insert 1
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // insert 2

      await repository.saveRecoveryCodes("carlos_admin", ["hash1", "hash2"]);
      expect(mockPool.query).toHaveBeenCalledTimes(3);

      mockPool.query.mockResolvedValueOnce({
        rows: [{ count: 2 }],
      });
      const count = await repository.getRemainingRecoveryCodesCount("carlos_admin");
      expect(count).toBe(2);
    });

    it("debe consumir un código de rescate si el hash coincide", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: "code-id-1", code_hash: "hashed_code_abc" }],
      });
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // update used = true

      const compareFn = vi.fn().mockResolvedValue(true);
      const consumed = await repository.consumeRecoveryCode("carlos_admin", "PLAIN_CODE", compareFn);

      expect(consumed).toBe(true);
      expect(compareFn).toHaveBeenCalledWith("PLAIN_CODE", "hashed_code_abc");
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });
  });
});
