import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { generateSecret, generateURI, verifySync } from "otplib";
import { blockJWT, checkRateLimit, isJWTBlocked, recordFailedAttempt, resetFailedAttempts } from "../redis/client";
import { SessionsRepository } from "../db/repositories/sessions.repository";

// Secreto para firma JWT (HMAC-SHA256 por defecto, compatible con claves de entorno)
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "hotel_marina_del_sol_jwt_super_secret_key_2026_at_least_32_chars",
);

export interface TokenPayload {
  sub: string;
  role: "DEFAULT_ADMIN_ROLE" | "RECEPTION_ROLE";
  jti: string;
}

export interface LoginResult {
  challengeRequired: boolean;
  sessionToken?: string;
  error?: string;
}

export interface VerifyResult {
  accessToken?: string;
  refreshToken?: string;
  role?: "DEFAULT_ADMIN_ROLE" | "RECEPTION_ROLE";
  error?: string;
  recoveryRemaining?: number;
}

export class AuthService {
  constructor(private sessionsRepo: SessionsRepository = new SessionsRepository()) {}

  /**
   * Hashea una contraseña usando bcrypt con 10 rondas de salt.
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  /**
   * Compara una contraseña en texto plano contra su hash bcrypt.
   */
  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Genera un secreto TOTP RFC 6238.
   */
  generateTOTPSecret(): string {
    return generateSecret();
  }

  /**
   * Genera la URI otpauth:// para escanear en Google Authenticator / Authy.
   */
  generateTOTPUri(username: string, secret: string, issuer = "HotelMarinaDelSol"): string {
    return generateURI({ issuer, label: username, secret });
  }

  /**
   * Valida un código TOTP de 6 dígitos contra el secreto.
   */
  verifyTOTP(code: string, secret: string): boolean {
    const res = verifySync({ token: code, secret });
    return res.valid;
  }


  /**
   * Genera 8 códigos de rescate alfanuméricos de un solo uso.
   */
  generateRecoveryCodes(count = 8): { plainCodes: string[]; hashedCodes: Promise<string[]> } {
    const plainCodes: string[] = [];
    for (let i = 0; i < count; i++) {
      const code = crypto.randomBytes(5).toString("hex").toUpperCase(); // 10 caracteres
      plainCodes.push(code);
    }
    const hashedCodes = Promise.all(plainCodes.map((c) => bcrypt.hash(c, 10)));
    return { plainCodes, hashedCodes };
  }

  /**
   * Genera un token temporal para el reto de MFA tras login exitoso (validez: 10 minutos).
   */
  async createChallengeToken(username: string, role: "DEFAULT_ADMIN_ROLE" | "RECEPTION_ROLE"): Promise<string> {
    return new SignJWT({ sub: username, role, type: "mfa_challenge" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(JWT_SECRET);
  }

  /**
   * Verifica un token de reto MFA.
   */
  async verifyChallengeToken(token: string): Promise<{ username: string; role: "DEFAULT_ADMIN_ROLE" | "RECEPTION_ROLE" }> {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.type !== "mfa_challenge" || !payload.sub) {
      throw new Error("Token de desafío MFA inválido");
    }
    return {
      username: payload.sub,
      role: payload.role as "DEFAULT_ADMIN_ROLE" | "RECEPTION_ROLE",
    };
  }

  /**
   * Emite un Access Token (JWT de 15 minutos) y un Refresh Token opaco con RTR (7 días).
   */
  async issueTokens(
    username: string,
    role: "DEFAULT_ADMIN_ROLE" | "RECEPTION_ROLE",
    ipAddress = "127.0.0.1",
    userAgent = "unknown",
  ): Promise<{ accessToken: string; refreshToken: string; jti: string }> {
    const jti = crypto.randomUUID();

    // Access Token (15 min)
    const accessToken = await new SignJWT({ sub: username, role, jti })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(JWT_SECRET);

    // Refresh Token opaco (64 caracteres hex)
    const refreshToken = crypto.randomBytes(32).toString("hex");
    const refreshTokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 días

    await this.sessionsRepo.createSession(username, role, refreshTokenHash, ipAddress, userAgent, expiresAt);

    return { accessToken, refreshToken, jti };
  }

  /**
   * Valida un Access Token verificando firma, expiración y blocklist de Redis.
   */
  async verifyAccessToken(token: string): Promise<TokenPayload> {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const jti = payload.jti as string;

    if (!jti) {
      throw new Error("Token sin identificador JTI");
    }

    const blocked = await isJWTBlocked(jti);
    if (blocked) {
      throw new Error("Token revocado (blocklist)");
    }

    return {
      sub: payload.sub as string,
      role: payload.role as "DEFAULT_ADMIN_ROLE" | "RECEPTION_ROLE",
      jti,
    };
  }

  /**
   * Ejecuta Refresh Token Rotation (RTR): revoca el refresh token actual y emite un nuevo par.
   */
  async rotateRefreshToken(
    oldRefreshToken: string,
    ipAddress = "127.0.0.1",
    userAgent = "unknown",
  ): Promise<{ accessToken: string; refreshToken: string; role: "DEFAULT_ADMIN_ROLE" | "RECEPTION_ROLE" }> {
    const oldHash = crypto.createHash("sha256").update(oldRefreshToken).digest("hex");
    const session = await this.sessionsRepo.getSessionByHash(oldHash);

    if (!session) {
      throw new Error("Sesión inválida o expirada");
    }

    // Revoca inmediatamente el token anterior
    await this.sessionsRepo.revokeSession(session.id);

    // Emite nuevo par de tokens
    const tokens = await this.issueTokens(session.username, session.role, ipAddress, userAgent);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      role: session.role,
    };
  }

  /**
   * Cierra sesión: revoca la sesión en base de datos y agrega el Access Token a la blocklist.
   */
  async logout(accessToken: string, refreshToken?: string): Promise<void> {
    try {
      const { payload } = await jwtVerify(accessToken, JWT_SECRET);
      const jti = payload.jti as string;
      const exp = payload.exp as number;
      const now = Math.floor(Date.now() / 1000);
      const remainingSeconds = exp - now;

      if (jti && remainingSeconds > 0) {
        await blockJWT(jti, remainingSeconds);
      }
    } catch {
      // Ignorar error si el token ya expiró
    }

    if (refreshToken) {
      const hash = crypto.createHash("sha256").update(refreshToken).digest("hex");
      await this.sessionsRepo.revokeSessionByHash(hash);
    }
  }

  /**
   * Verifica el rate limiter para intentos fallidos de autenticación (ID_V-10).
   */
  async checkRateLimit(key: string): Promise<{ limited: boolean; remainingAttempts: number; retryAfterSeconds: number }> {
    return checkRateLimit(key, 5, 900);
  }

  /**
   * Registra un fallo de autenticación incrementando el contador.
   */
  async recordAuthFailure(key: string): Promise<number> {
    return recordFailedAttempt(key, 900);
  }

  /**
   * Restablece los fallos ante éxito.
   */
  async recordAuthSuccess(key: string): Promise<void> {
    await resetFailedAttempts(key);
  }
}
