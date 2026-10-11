import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  AuthService,
  BACK_OFFICE_ROLE_NAMES,
  SessionsRepository,
  UsersRepository,
  type AdminUserRecord,
  type AdminUserRole,
} from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const usersRepo = new UsersRepository();
const sessionsRepo = new SessionsRepository();
const authService = new AuthService();

const ROLES: readonly AdminUserRole[] = BACK_OFFICE_ROLE_NAMES;

/** Vista pública de un operador: NUNCA incluye `passwordHash` ni `totpSecretEnc` (RNF-41). */
function publicUser(user: AdminUserRecord) {
  return {
    username: user.username,
    role: user.role,
    active: user.active,
    failedAttempts: user.failedAttempts,
    lockedUntil: user.lockedUntil,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * GET /api/admin/system/users
 *
 * Lista los operadores de la plataforma (RF-42, CU-42). **Solo owner** (`DEFAULT_ADMIN_ROLE`).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  try {
    const users = await usersRepo.listAll();
    return NextResponse.json({ users: users.map(publicUser) });
  } catch (error: unknown) {
    console.error("[API /api/admin/system/users] GET:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudieron listar los usuarios." },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/system/users
 *
 * Crea o **rota** las credenciales de un operador (RF-42): contraseña (generada si no se aporta),
 * semilla TOTP y códigos de rescate se devuelven **una única vez**. Body:
 * `{ username, role, password? }`. Solo owner.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json().catch(() => null)) as {
      username?: unknown;
      role?: unknown;
      password?: unknown;
    } | null;

    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const role = body?.role;

    if (username.length === 0 || username.length > 100 || !username.includes("@")) {
      return NextResponse.json(
        { error: "USUARIO_INVALIDO", message: "El usuario debe ser un correo válido." },
        { status: 400 },
      );
    }
    if (typeof role !== "string" || !ROLES.includes(role as AdminUserRole)) {
      return NextResponse.json(
        { error: "ROL_INVALIDO", message: `Rol no válido (admitidos: ${ROLES.join(", ")}).` },
        { status: 400 },
      );
    }
    if (typeof body?.password === "string" && body.password.length > 0 && body.password.length < 12) {
      return NextResponse.json(
        { error: "PASSWORD_INVALIDA", message: "La contraseña debe tener al menos 12 caracteres." },
        { status: 400 },
      );
    }

    const password =
      typeof body?.password === "string" && body.password.length >= 12
        ? body.password
        : crypto.randomBytes(18).toString("base64url");

    const provisioned = await authService.provisionUser({
      username,
      password,
      role: role as AdminUserRole,
    });

    return NextResponse.json(
      {
        status: "PROVISIONED",
        username: provisioned.username,
        role: provisioned.role,
        // Credenciales en claro: se muestran UNA sola vez (RNF-41).
        password,
        secret: provisioned.secret,
        uri: provisioned.uri,
        recoveryCodes: provisioned.recoveryCodes,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("[API /api/admin/system/users] POST:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo aprovisionar el usuario." },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/admin/system/users
 *
 * Activa o desactiva un operador (RF-42). Body `{ username, active }`. Al desactivar se revocan
 * sus sesiones de refresco. Un owner **no puede desactivarse a sí mismo** (evita quedarse fuera de
 * la plataforma sin otro administrador). Solo owner.
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json().catch(() => null)) as {
      username?: unknown;
      active?: unknown;
    } | null;

    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const active = body?.active;

    if (username.length === 0 || typeof active !== "boolean") {
      return NextResponse.json(
        { error: "SOLICITUD_INVALIDA", message: "Se requieren username y active (booleano)." },
        { status: 400 },
      );
    }
    if (!active && username === auth.session.username) {
      return NextResponse.json(
        { error: "AUTO_DESACTIVACION", message: "No puedes desactivar tu propia cuenta." },
        { status: 400 },
      );
    }

    const existing = await usersRepo.findByUsername(username);
    if (!existing) {
      return NextResponse.json(
        { error: "USUARIO_NO_ENCONTRADO", message: "El usuario no existe." },
        { status: 404 },
      );
    }

    await usersRepo.setActive(username, active);
    if (!active) await sessionsRepo.revokeAllUserSessions(username);

    return NextResponse.json({ username, active });
  } catch (error: unknown) {
    console.error("[API /api/admin/system/users] PATCH:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo actualizar el usuario." },
      { status: 500 },
    );
  }
}
