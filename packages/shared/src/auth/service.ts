import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { generateSecret, generateURI, verifySync } from "otplib";
import { requireSecret } from "../env/index";
import {
  blockJWT,
  checkRateLimit,
  isJWTBlocked,
  recordFailedAttempt,
  resetFailedAttempts,
} from "../redis/client";
import { SessionsRepository } from "../db/repositories/sessions.repository";
import {
  UsersRepository,
  type AdminUserRecord,
  type AdminUserRole,
} from "../db/repositories/users.repository";
import { decryptTotpSecret, encryptCheckInSecret, encryptTotpSecret } from "./crypto";

/** Roles que gobiernan el back-office (D-04). */
export type AuthRole = AdminUserRole;

/**
 * Secreto de firma del JWT (HS256).
 *
 * Se resuelve en el PRIMER USO, no al importar el módulo: el build de Next evalúa los módulos
 * sin entorno de runtime, y un `throw` a nivel de módulo rompería `next build`. Con
 * `requireSecret` la aplicación falla en cerrado en cuanto intenta firmar o verificar un token
 * sin `JWT_SECRET` configurado (CWE-798); ya no existe el literal por defecto del repositorio.
 */
function jwtSecret(): Uint8Array {
  return new TextEncoder().encode(requireSecret("JWT_SECRET"));
}

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Ventana de bloqueo por intentos fallidos: 5 intentos / 15 minutos (D-04). */
export const RATE_LIMIT_MAX_ATTEMPTS = 5;
export const RATE_LIMIT_WINDOW_SECONDS = 900;

export interface TokenPayload {
  sub: string;
  role: AuthRole;
  jti: string;
}

export interface LoginResult {
  challengeRequired: boolean;
  sessionToken?: string;
  username?: string;
  role?: AuthRole;
  error?: "INVALID_CREDENTIALS" | "ACCOUNT_LOCKED" | "RATE_LIMITED";
  remainingAttempts?: number;
  retryAfterSeconds?: number;
}

export interface VerifyResult {
  accessToken?: string;
  refreshToken?: string;
  role?: AuthRole;
  error?: string;
  recoveryRemaining?: number;
}

/** Resultado de aprovisionar (alta o rotación) un operador. */
export interface ProvisionedUser {
  username: string;
  role: AuthRole;
  secret: string;
  uri: string;
  recoveryCodes: string[];
}

/**
 * Servicio canónico de autenticación (D-04): contraseña + TOTP obligatorio + JWT con rotación
 * de refresh y blocklist en Redis.
 *
 * Todo el estado de identidad vive en PostgreSQL (`admin_users` vía `UsersRepository`) y en
 * Redis (blocklist y rate limiting). NO hay usuarios, contraseñas ni semillas en memoria ni en
 * el código: `SYSTEM_USERS` y el mapa `USER_TOTP_SECRETS` de los endpoints se eliminaron.
 */
export class AuthService {
  constructor(
    private sessionsRepo: SessionsRepository = new SessionsRepository(),
    private usersRepo: UsersRepository = new UsersRepository(),
  ) {}

  // ── Credenciales ────────────────────────────────────────────────────────────────────────

  /** Hashea una contraseña con bcrypt (10 rondas). */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  /** Compara una contraseña en claro con su hash bcrypt. */
  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /** Busca el operador por nombre de usuario. */
  async findUser(username: string): Promise<AdminUserRecord | null> {
    return this.usersRepo.findByUsername(username);
  }

  // ── TOTP ────────────────────────────────────────────────────────────────────────────────

  /** Genera una semilla TOTP RFC 6238 (base32). */
  generateTOTPSecret(): string {
    return generateSecret();
  }

  /** Genera la URI `otpauth://` para el alta en Google Authenticator / Authy. */
  generateTOTPUri(username: string, secret: string, issuer = "HotelMarinaDelSol"): string {
    return generateURI({ issuer, label: username, secret });
  }

  /** Valida un código TOTP de 6 dígitos contra la semilla EN CLARO. */
  verifyTOTP(code: string, secret: string): boolean {
    try {
      return verifySync({ token: code, secret }).valid;
    } catch {
      // Semilla malformada o código con formato inválido: la respuesta es "no válido",
      // nunca una excepción que revele detalles del secreto.
      return false;
    }
  }

  /** Cifra la semilla TOTP con AES-256-GCM (`AES_SECRET_KEY`) antes de persistirla. */
  encryptTotpSecret(secret: string): string {
    return encryptTotpSecret(secret);
  }

  /**
   * Verifica un código TOTP contra la semilla cifrada almacenada del operador.
   * Devuelve `false` (sin lanzar) si el criptograma no se puede descifrar.
   */
  verifyUserTotp(user: Pick<AdminUserRecord, "totpSecretEnc">, code: string): boolean {
    try {
      return this.verifyTOTP(code, decryptTotpSecret(user.totpSecretEnc));
    } catch {
      return false;
    }
  }

  /** Cifra el secreto de check-in del NFT con `CHECKIN_SECRET_KEY`. */
  encryptCheckInSecret(rawSecret: string): string {
    return encryptCheckInSecret(rawSecret);
  }

  /**
   * Genera códigos de rescate alfanuméricos de UN SOLO USO junto con sus hashes bcrypt.
   * Se devuelven en claro una única vez, al aprovisionar o al rotar el MFA.
   */
  generateRecoveryCodes(count = 8): { plainCodes: string[]; hashedCodes: Promise<string[]> } {
    const plainCodes: string[] = [];
    for (let i = 0; i < count; i++) {
      plainCodes.push(crypto.randomBytes(5).toString("hex").toUpperCase()); // 10 caracteres
    }
    const hashedCodes = Promise.all(plainCodes.map((c) => bcrypt.hash(c, 10)));
    return { plainCodes, hashedCodes };
  }

  // ── Tokens ──────────────────────────────────────────────────────────────────────────────

  /** Token temporal (10 min) que acredita que la contraseña ya se validó (reto MFA). */
  async createChallengeToken(username: string, role: AuthRole): Promise<string> {
    return new SignJWT({ sub: username, role, type: "mfa_challenge" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(jwtSecret());
  }

  /** Verifica un token de reto MFA. */
  async verifyChallengeToken(token: string): Promise<{ username: string; role: AuthRole }> {
    const { payload } = await jwtVerify(token, jwtSecret());
    if (payload.type !== "mfa_challenge" || !payload.sub) {
      throw new Error("Token de desafío MFA inválido");
    }
    return { username: payload.sub, role: payload.role as AuthRole };
  }

  /** Emite un Access Token (15 min) y un Refresh Token opaco (7 días) con RTR. */
  async issueTokens(
    username: string,
    role: AuthRole,
    ipAddress = "127.0.0.1",
    userAgent = "unknown",
  ): Promise<{ accessToken: string; refreshToken: string; jti: string }> {
    const jti = crypto.randomUUID();

    const accessToken = await new SignJWT({ sub: username, role, jti })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(jwtSecret());

    const refreshToken = crypto.randomBytes(32).toString("hex");
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

    await this.sessionsRepo.createSession(username, role, refreshTokenHash, ipAddress, userAgent, expiresAt);

    return { accessToken, refreshToken, jti };
  }

  /** Hash del refresh token (nunca se almacena el token en claro). */
  hashRefreshToken(refreshToken: string): string {
    return crypto.createHash("sha256").update(refreshToken).digest("hex");
  }

  /** Vigencia del access token en segundos (para el `maxAge` de la cookie). */
  accessTokenTtlSeconds(): number {
    return ACCESS_TOKEN_TTL_SECONDS;
  }

  /** Vigencia del refresh token en segundos (para el `maxAge` de la cookie). */
  refreshTokenTtlSeconds(): number {
    return REFRESH_TOKEN_TTL_SECONDS;
  }

  /**
   * Valida un Access Token: firma, expiración y blocklist de Redis (logout/revocación).
   */
  async verifyAccessToken(token: string): Promise<TokenPayload> {
    const { payload } = await jwtVerify(token, jwtSecret());
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
      role: payload.role as AuthRole,
      jti,
    };
  }

  /** Tiempo restante de vigencia de un access token (para el TTL de la blocklist). */
  remainingTokenSeconds(exp: number, now = Math.floor(Date.now() / 1000)): number {
    return exp - now;
  }

  /**
   * Refresh Token Rotation (RTR): revoca el refresh usado y emite un par nuevo.
   * Un refresh ya consumido no vuelve a servir (la sesión queda revocada en `admin_sessions`).
   */
  async rotateRefreshToken(
    oldRefreshToken: string,
    ipAddress = "127.0.0.1",
    userAgent = "unknown",
  ): Promise<{ accessToken: string; refreshToken: string; role: AuthRole }> {
    const oldHash = this.hashRefreshToken(oldRefreshToken);
    const session = await this.sessionsRepo.getSessionByHash(oldHash);

    if (!session) {
      throw new Error("Sesión inválida o expirada");
    }

    // Revoca inmediatamente el token anterior (un uso posterior fallará).
    await this.sessionsRepo.revokeSession(session.id);

    // Revalida que el operador sigue activo y sin bloqueo: una cuenta desactivada no renueva.
    const user = await this.usersRepo.findByUsername(session.username);
    if (!user || !user.active || this.usersRepo.isLocked(user)) {
      throw new Error("Operador inactivo o bloqueado");
    }

    const tokens = await this.issueTokens(session.username, session.role, ipAddress, userAgent);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      role: session.role,
    };
  }

  /**
   * Cierra sesión: revoca el refresh en base de datos y añade el access token a la blocklist de
   * Redis. Si el token ya expiró se ignora el error (nada que bloquear) pero la revocación del
   * refresh SÍ se ejecuta: es la que impide renovar la sesión.
   *
   * Solo se ignoran los errores DEL TOKEN. Antes había un `catch` que envolvía también la llamada
   * a Redis: una caída de Redis quedaba silenciada y el logout respondía éxito sin haber revocado
   * el access token, que seguía sirviendo hasta su expiración. Ese fallo ahora se propaga (la ruta
   * responde 500) y, pase lo que pase, la revocación del refresh se intenta igualmente.
   */
  async logout(accessToken: string, refreshToken?: string): Promise<void> {
    let payload: JWTPayload | null = null;
    try {
      const verified = await jwtVerify(accessToken, jwtSecret());
      payload = verified.payload;
    } catch {
      // Token ausente, malformado o ya expirado: no hay nada que bloquear.
      payload = null;
    }

    const revokeRefresh = refreshToken
      ? this.sessionsRepo.revokeSessionByHash(this.hashRefreshToken(refreshToken))
      : undefined;

    const jti = typeof payload?.jti === "string" ? payload.jti : undefined;
    const remainingSeconds =
      typeof payload?.exp === "number" ? this.remainingTokenSeconds(payload.exp) : 0;
    const blockAccess = jti && remainingSeconds > 0 ? blockJWT(jti, remainingSeconds) : undefined;

    // Ambas revocaciones se intentan SIEMPRE (una caída de Redis no debe impedir revocar el
    // refresh en base de datos) y, si alguna falla, el error se propaga al llamante.
    const results = await Promise.allSettled([blockAccess, revokeRefresh]);
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }

  // ── Aprovisionamiento ───────────────────────────────────────────────────────────────────

  /**
   * Crea o actualiza un operador con contraseña y semilla TOTP NUEVAS.
   *
   * Devuelve la semilla y los códigos de rescate EN CLARO una única vez: no se pueden volver a
   * recuperar de la base (solo se guarda el criptograma y los hashes bcrypt). El llamante
   * (script de aprovisionamiento o `/api/auth/mfa/setup`) es responsable de entregarlos.
   */
  async provisionUser(params: {
    username: string;
    password: string;
    role: AuthRole;
    active?: boolean;
    recoveryCodeCount?: number;
  }): Promise<ProvisionedUser> {
    const secret = this.generateTOTPSecret();
    const passwordHash = await this.hashPassword(params.password);
    const { plainCodes, hashedCodes } = this.generateRecoveryCodes(params.recoveryCodeCount ?? 8);
    const resolvedHashes = await hashedCodes;

    await this.usersRepo.upsert({
      username: params.username,
      passwordHash,
      totpSecretEnc: this.encryptTotpSecret(secret),
      role: params.role,
      active: params.active ?? true,
    });

    await this.usersRepo.replaceRecoveryCodes(params.username, resolvedHashes);

    return {
      username: params.username,
      role: params.role,
      secret,
      uri: this.generateTOTPUri(params.username, secret),
      recoveryCodes: plainCodes,
    };
  }

  /**
   * Autentica usuario + contraseña y devuelve el reto MFA.
   *
   * Comprobaciones, en este orden (D-04):
   *   1. rate limiting por IP+usuario en Redis (5 intentos / 15 min);
   *   2. existencia, actividad y bloqueo temporal del operador;
   *   3. contraseña con bcrypt.
   * Cualquier fallo de credenciales devuelve el MISMO mensaje (no se distingue usuario
   * inexistente de contraseña incorrecta) y registra el intento fallido.
   */
  async loginWithPassword(params: {
    username: string;
    password: string;
    ipAddress?: string;
  }): Promise<LoginResult> {
    const username = params.username.trim();
    const ip = params.ipAddress ?? "127.0.0.1";
    const rateLimitKey = `${ip}:${username.toLowerCase()}`;

    const rateLimit = await this.checkRateLimit(rateLimitKey);
    if (rateLimit.limited) {
      return {
        challengeRequired: false,
        error: "RATE_LIMITED",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      };
    }

    const user = await this.usersRepo.findByUsername(username);
    const passwordOk = user ? await this.comparePassword(params.password, user.passwordHash) : false;

    if (!user || !user.active) {
      const attempts = await this.recordAuthFailure(rateLimitKey);
      return {
        challengeRequired: false,
        error: "INVALID_CREDENTIALS",
        remainingAttempts: Math.max(0, RATE_LIMIT_MAX_ATTEMPTS - attempts),
      };
    }

    if (this.usersRepo.isLocked(user)) {
      return { challengeRequired: false, error: "ACCOUNT_LOCKED" };
    }

    if (!passwordOk) {
      const attempt = await this.usersRepo.registerFailedAttempt(username);
      const attempts = await this.recordAuthFailure(rateLimitKey);
      if (this.usersRepo.isLocked({ lockedUntil: attempt.lockedUntil })) {
        return { challengeRequired: false, error: "ACCOUNT_LOCKED" };
      }
      return {
        challengeRequired: false,
        error: "INVALID_CREDENTIALS",
        remainingAttempts: Math.max(0, RATE_LIMIT_MAX_ATTEMPTS - Math.max(attempts, 1)),
      };
    }

    await this.recordAuthSuccess(rateLimitKey);
    await this.usersRepo.resetFailedAttempts(username);

    return {
      challengeRequired: true,
      sessionToken: await this.createChallengeToken(username, user.role),
      username,
      role: user.role,
    };
  }

  /**
   * Verifica el segundo factor (TOTP o código de rescate) contra el operador persistido y, si
   * es correcto, emite el par de tokens. Aplica el mismo rate limiting que el primer factor.
   */
  async verifyMfa(params: {
    username: string;
    totpCode?: string;
    recoveryCode?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<VerifyResult> {
    const rateLimitKey = `${params.ipAddress ?? "127.0.0.1"}:mfa:${params.username}`;

    const rateLimit = await this.checkRateLimit(rateLimitKey);
    if (rateLimit.limited) {
      return { error: "RATE_LIMITED" };
    }

    const user = await this.usersRepo.findByUsername(params.username);
    if (!user || !user.active) {
      await this.recordAuthFailure(rateLimitKey);
      return { error: "INVALID_MFA" };
    }
    if (this.usersRepo.isLocked(user)) {
      return { error: "ACCOUNT_LOCKED" };
    }

    let valid = false;
    if (params.totpCode) {
      valid = this.verifyUserTotp(user, params.totpCode);
    }
    if (!valid && params.recoveryCode) {
      valid = await this.usersRepo.consumeRecoveryCode(
        user.username,
        params.recoveryCode,
        (plain, hash) => this.comparePassword(plain, hash),
      );
    }

    if (!valid) {
      const attempt = await this.usersRepo.registerFailedAttempt(user.username);
      await this.recordAuthFailure(rateLimitKey);
      if (this.usersRepo.isLocked({ lockedUntil: attempt.lockedUntil })) {
        return { error: "ACCOUNT_LOCKED" };
      }
      return { error: "INVALID_MFA" };
    }

    await this.recordAuthSuccess(rateLimitKey);
    await this.usersRepo.resetFailedAttempts(user.username);

    const tokens = await this.issueTokens(
      user.username,
      user.role,
      params.ipAddress,
      params.userAgent,
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      role: user.role,
      recoveryRemaining: await this.usersRepo.countRemainingRecoveryCodes(user.username),
    };
  }

  // ── Rate limiting (ID_V-10, D-04) ───────────────────────────────────────────────────────

  /** Consulta el rate limiter de intentos fallidos (5 intentos / 15 min). */
  async checkRateLimit(
    key: string,
  ): Promise<{ limited: boolean; remainingAttempts: number; retryAfterSeconds: number }> {
    return checkRateLimit(key, RATE_LIMIT_MAX_ATTEMPTS, RATE_LIMIT_WINDOW_SECONDS);
  }

  /** Registra un fallo de autenticación. */
  async recordAuthFailure(key: string): Promise<number> {
    return recordFailedAttempt(key, RATE_LIMIT_WINDOW_SECONDS);
  }

  /** Restablece los fallos tras un éxito. */
  async recordAuthSuccess(key: string): Promise<void> {
    await resetFailedAttempts(key);
  }
}
