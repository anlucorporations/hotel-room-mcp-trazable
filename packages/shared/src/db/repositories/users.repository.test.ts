import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type { Pool } from "pg";
import { UsersRepository } from "./users.repository";

describe("UsersRepository (D-04)", () => {
  let repository: UsersRepository;
  // Doble parcial del pool: solo se ejercita `query`.
  let mockPool: Pool & { query: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = { query: vi.fn() } as Pool & { query: Mock };
    repository = new UsersRepository(mockPool);
  });

  describe("findByUsername", () => {
    it("devuelve null si el operador no existe", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      expect(await repository.findByUsername("nadie@hotel.es")).toBeNull();
    });

    it("mapea la fila de admin_users y NUNCA expone la semilla en claro", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: "user-1",
            username: "admin@hotel.es",
            password_hash: "$2a$10$hashbcrypt",
            totp_secret_enc: "iv:tag:cipher",
            role: "DEFAULT_ADMIN_ROLE",
            active: true,
            failed_attempts: 0,
            locked_until: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      const user = await repository.findByUsername("admin@hotel.es");
      expect(user?.username).toBe("admin@hotel.es");
      expect(user?.role).toBe("DEFAULT_ADMIN_ROLE");
      expect(user?.active).toBe(true);
      // El repositorio solo conoce el CRIPTOGRAMA: no hay ningún campo con la semilla en claro.
      expect(user?.totpSecretEnc).toBe("iv:tag:cipher");
      expect(Object.keys(user ?? {})).not.toContain("totpSecret");
    });
  });

  describe("upsert", () => {
    it("crea o actualiza el operador y reinicia el bloqueo", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: "user-1",
            username: "recepcion@hotel.es",
            password_hash: "hash",
            totp_secret_enc: "iv:tag:cipher",
            role: "RECEPTION_ROLE",
            active: true,
            failed_attempts: 0,
            locked_until: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      const user = await repository.upsert({
        username: "recepcion@hotel.es",
        passwordHash: "hash",
        totpSecretEnc: "iv:tag:cipher",
        role: "RECEPTION_ROLE",
      });

      expect(user.role).toBe("RECEPTION_ROLE");
      const [sql, values] = mockPool.query.mock.calls[0]!;
      expect(sql).toContain("ON CONFLICT (username) DO UPDATE");
      // Un aprovisionamiento legítimo no puede dejar al operador bloqueado.
      expect(sql).toContain("locked_until = NULL");
      expect(sql).toContain("failed_attempts = 0");
      expect(values[0]).toBe("recepcion@hotel.es");
    });
  });

  describe("intentos fallidos y bloqueo temporal", () => {
    it("registra el intento de forma atómica en una sola sentencia", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ failed_attempts: 2, locked_until: null }],
      });

      const result = await repository.registerFailedAttempt("admin@hotel.es");
      expect(result.failedAttempts).toBe(2);
      expect(result.lockedUntil).toBeNull();
      expect(mockPool.query).toHaveBeenCalledTimes(1);

      const [sql, values] = mockPool.query.mock.calls[0]!;
      expect(sql).toContain("UPDATE admin_users");
      expect(sql).toContain("failed_attempts + 1");
      expect(values).toEqual(["admin@hotel.es", 5, 900]);
    });

    it("fija locked_until al alcanzar el máximo de intentos (5 / 15 min, D-04)", async () => {
      const lockedUntil = new Date(Date.now() + 900_000);
      mockPool.query.mockResolvedValueOnce({
        rows: [{ failed_attempts: 0, locked_until: lockedUntil }],
      });

      const result = await repository.registerFailedAttempt("admin@hotel.es");
      expect(result.lockedUntil).toBe(lockedUntil);
      expect(repository.isLocked({ lockedUntil: result.lockedUntil })).toBe(true);
    });

    it("considera desbloqueada la cuenta cuando el bloqueo ya expiró", () => {
      expect(repository.isLocked({ lockedUntil: null })).toBe(false);
      expect(repository.isLocked({ lockedUntil: new Date(Date.now() - 1000) })).toBe(false);
      expect(repository.isLocked({ lockedUntil: new Date(Date.now() + 1000) })).toBe(true);
    });

    it("resetFailedAttempts limpia contador y bloqueo (login correcto)", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await repository.resetFailedAttempts("admin@hotel.es");

      const [sql, values] = mockPool.query.mock.calls[0]!;
      expect(sql).toContain("failed_attempts = 0");
      expect(sql).toContain("locked_until = NULL");
      expect(values).toEqual(["admin@hotel.es"]);
    });
  });

  describe("rotación de credenciales", () => {
    it("updateTotpSecretEnc persiste el criptograma nuevo", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await repository.updateTotpSecretEnc("admin@hotel.es", "nuevo:tag:cipher");

      const [sql, values] = mockPool.query.mock.calls[0]!;
      expect(sql).toContain("totp_secret_enc = $2");
      expect(values).toEqual(["admin@hotel.es", "nuevo:tag:cipher"]);
    });

    it("setActive desactiva al operador", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await repository.setActive("admin@hotel.es", false);
      expect(mockPool.query.mock.calls[0]![1]).toEqual(["admin@hotel.es", false]);
    });
  });

  describe("códigos de rescate (mfa_recovery_codes)", () => {
    it("replaceRecoveryCodes borra los anteriores e inserta los nuevos", async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      await repository.replaceRecoveryCodes("admin@hotel.es", ["h1", "h2", "h3"]);

      expect(mockPool.query).toHaveBeenCalledTimes(4); // 1 delete + 3 insert
      expect(mockPool.query.mock.calls[0]![0]).toContain("DELETE FROM mfa_recovery_codes");
      expect(mockPool.query.mock.calls[0]![1]).toEqual(["admin@hotel.es"]);
      expect(mockPool.query.mock.calls[1]![0]).toContain("INSERT INTO mfa_recovery_codes");
      expect(mockPool.query.mock.calls[3]![1]).toEqual(["admin@hotel.es", "h3"]);
    });

    it("cuenta solo los códigos sin usar", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: 5 }] });
      expect(await repository.countRemainingRecoveryCodes("admin@hotel.es")).toBe(5);
      expect(mockPool.query.mock.calls[0]![0]).toContain("used = FALSE");
    });

    it("consume un código de rescate de UN SOLO USO", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: "code-1", code_hash: "hash-de-ABCDEF" }],
      });
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: "code-1" }], rowCount: 1 });

      const compareFn = vi.fn().mockResolvedValue(true);
      const consumed = await repository.consumeRecoveryCode("admin@hotel.es", "ABCDEF1234", compareFn);

      expect(consumed).toBe(true);
      expect(compareFn).toHaveBeenCalledWith("ABCDEF1234", "hash-de-ABCDEF");

      const [updateSql, updateValues] = mockPool.query.mock.calls[1]!;
      expect(updateSql).toContain("used = FALSE");
      expect(updateValues).toEqual(["code-1"]);
    });

    it("no consume nada si el código no coincide con ningún hash", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: "code-1", code_hash: "hash-de-ABCDEF" }],
      });

      const consumed = await repository.consumeRecoveryCode(
        "admin@hotel.es",
        "CODIGO-INCORRECTO",
        vi.fn().mockResolvedValue(false),
      );

      expect(consumed).toBe(false);
      expect(mockPool.query).toHaveBeenCalledTimes(1); // solo la lectura
    });

    it("devuelve false si otra petición consumió el código antes (carrera)", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: "code-1", code_hash: "hash-de-ABCDEF" }],
      });
      // El UPDATE condicional no afecta a ninguna fila: el código ya estaba usado.
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const consumed = await repository.consumeRecoveryCode(
        "admin@hotel.es",
        "ABCDEF1234",
        vi.fn().mockResolvedValue(true),
      );

      expect(consumed).toBe(false);
    });

    it("invalidateRecoveryCodes marca todos como usados", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await repository.invalidateRecoveryCodes("admin@hotel.es");
      expect(mockPool.query.mock.calls[0]![0]).toContain("SET used = TRUE");
    });
  });
});
