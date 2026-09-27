import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  MINT_WINDOW_DAYS_KEY,
  NO_SHOW_HOUR_KEY,
  RESERVATION_DEPOSIT_PERCENT_KEY,
  RESERVATION_HOLD_HOURS_KEY,
  SettingsRepository,
} from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const settingsRepo = new SettingsRepository();

/** Claves que el back-office puede leer y fijar, con su respaldo (D-11/D-37/D-42). */
const SETTINGS: ReadonlyArray<{ key: string; fallback: number; min: number; max: number }> = [
  { key: MINT_WINDOW_DAYS_KEY, fallback: 90, min: 1, max: 365 },
  { key: RESERVATION_DEPOSIT_PERCENT_KEY, fallback: 30, min: 0, max: 100 },
  { key: RESERVATION_HOLD_HOURS_KEY, fallback: 24, min: 1, max: 720 },
  { key: NO_SHOW_HOUR_KEY, fallback: 18, min: 0, max: 23 },
];

/** GET /api/admin/settings — ajustes vigentes y su respaldo (solo owner). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  try {
    const settings: Record<string, number> = {};
    for (const { key, fallback } of SETTINGS) {
      settings[key] = await settingsRepo.getNumber(key, fallback);
    }
    return NextResponse.json({ settings });
  } catch (error: unknown) {
    console.error("[API /api/admin/settings] GET:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudieron leer los ajustes." },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/admin/settings — fija uno o varios ajustes (solo owner).
 *
 * Valida cada clave contra su rango; una clave desconocida o un valor fuera de rango se rechaza sin
 * escribir nada. Devuelve los ajustes resultantes.
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Se espera un objeto JSON." }, { status: 400 });
  }

  const updates: Array<{ key: string; value: number }> = [];
  for (const { key, min, max } of SETTINGS) {
    if (!(key in body)) continue;
    const value = Number(body[key]);
    if (!Number.isInteger(value) || value < min || value > max) {
      return NextResponse.json(
        { error: "INVALID_SETTING", message: `${key} debe ser un entero entre ${min} y ${max}.` },
        { status: 400 },
      );
    }
    updates.push({ key, value });
  }
  if (updates.length === 0) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "No hay ajustes que actualizar." }, { status: 400 });
  }

  try {
    for (const { key, value } of updates) {
      await settingsRepo.set(key, String(value), auth.session.username);
    }
    const settings: Record<string, number> = {};
    for (const { key, fallback } of SETTINGS) {
      settings[key] = await settingsRepo.getNumber(key, fallback);
    }
    return NextResponse.json({ settings });
  } catch (error: unknown) {
    console.error("[API /api/admin/settings] PUT:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudieron guardar los ajustes." },
      { status: 500 },
    );
  }
}
