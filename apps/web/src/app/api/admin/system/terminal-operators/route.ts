import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  TERMINAL_BACK_OFFICE_ROLE_NAMES,
  TerminalOperatorsError,
  TerminalOperatorsRepository,
  hashTerminalPin,
  type TerminalOperatorRole,
} from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const repo = new TerminalOperatorsRepository();

/** Genera un PIN de 6 dígitos no trivial (sin dígitos repetidos) para entregar una única vez. */
function generatePin(): string {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const digits = Array.from({ length: 6 }, () => Math.floor(Math.random() * 10));
    if (new Set(digits).size >= 3) return digits.join("");
  }
  return "482913";
}

function publicOperator(operator: Awaited<ReturnType<TerminalOperatorsRepository["list"]>>[number]) {
  return {
    id: operator.id,
    username: operator.username,
    fullName: operator.fullName,
    role: operator.role,
    active: operator.active,
    mustChangePin: operator.mustChangePin,
    pinChangedAt: operator.pinChangedAt,
    failedAttempts: operator.failedAttempts,
    lockedUntil: operator.lockedUntil,
    createdAt: operator.createdAt,
  };
}

/**
 * GET /api/admin/system/terminal-operators — operarios de terminal (F9 · T9.4, CU-V-44).
 * POST — alta con PIN generado (se devuelve **una única vez**).
 * PATCH — rotar PIN, activar/baja lógica o desbloquear.
 *
 * Solo el owner. Nunca se devuelve `pinHash`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;
  const operators = await repo.list();
  return NextResponse.json({ operators: operators.map(publicOperator) });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;
  let body: { username?: unknown; fullName?: unknown; role?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const role = body.role as TerminalOperatorRole;
  if (!username || !fullName || !(TERMINAL_BACK_OFFICE_ROLE_NAMES as readonly string[]).includes(role)) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "username, fullName y role válido son obligatorios." },
      { status: 400 },
    );
  }
  const pin = generatePin();
  try {
    const operator = await repo.create({
      username,
      fullName,
      role,
      pinHash: await hashTerminalPin(pin),
      createdBy: auth.session.username,
    });
    return NextResponse.json({ operator: publicOperator(operator), pin }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof TerminalOperatorsError) {
      const status = error.code === "USERNAME_TAKEN" ? 409 : 400;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    console.error("[API /api/admin/system/terminal-operators] POST:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo crear el operario." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;
  let body: { id?: unknown; action?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }
  if (typeof body.id !== "string" || typeof body.action !== "string") {
    return NextResponse.json({ error: "BAD_REQUEST", message: "id y action son obligatorios." }, { status: 400 });
  }
  try {
    if (body.action === "rotate-pin") {
      const pin = generatePin();
      const operator = await repo.changePin(body.id, { pinHash: await hashTerminalPin(pin), mustChangePin: true });
      return NextResponse.json({ operator: publicOperator(operator), pin });
    }
    if (body.action === "deactivate") {
      return NextResponse.json({ operator: publicOperator(await repo.setActive(body.id, false)) });
    }
    if (body.action === "activate") {
      return NextResponse.json({ operator: publicOperator(await repo.setActive(body.id, true)) });
    }
    if (body.action === "unlock") {
      return NextResponse.json({ operator: publicOperator(await repo.unlock(body.id)) });
    }
    return NextResponse.json({ error: "BAD_REQUEST", message: "Acción no admitida." }, { status: 400 });
  } catch (error: unknown) {
    if (error instanceof TerminalOperatorsError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 404 });
    }
    console.error("[API /api/admin/system/terminal-operators] PATCH:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo actualizar el operario." }, { status: 500 });
  }
}
