import "server-only";

import { NextResponse } from "next/server";
import { MaintenanceError } from "@hotel/shared";
import { OperationsSignatureError } from "./signatures";

/**
 * Traducción de errores del flujo de firmas de mantenimiento a respuestas HTTP estables
 * (F4 · T4.4/T4.5). Vive fuera de `route.ts` porque un módulo de ruta de Next solo debe exportar
 * los verbos HTTP y su configuración.
 */
export function signatureErrorResponse(error: unknown, context: string): NextResponse {
  if (error instanceof OperationsSignatureError) {
    const status =
      error.code === "OPERATIONS_NOT_CONFIGURED"
        ? 503
        : error.code === "SIGNATURE_NOT_FOUND"
          ? 404
          : error.code === "SIGNATURE_WALLET_NOT_ASSIGNED"
            ? 403
            : error.code === "SIGNATURE_SIGNER_MISMATCH"
              ? 422
              : 409;
    return NextResponse.json({ error: error.code, message: error.message }, { status });
  }
  console.error(`${context}:`, error);
  return NextResponse.json(
    { error: "INTERNAL_SERVER_ERROR", message: "No se pudo preparar la firma." },
    { status: 500 },
  );
}

/** Errores de las rutas de bloqueo/desbloqueo (firma + repositorio de mantenimiento). */
export function blockErrorResponse(error: unknown, context: string): NextResponse {
  if (error instanceof OperationsSignatureError) {
    const status =
      error.code === "OPERATIONS_NOT_CONFIGURED"
        ? 503
        : error.code === "SIGNATURE_NOT_FOUND"
          ? 404
          : error.code === "SIGNATURE_SIGNER_MISMATCH"
            ? 422
            : 409;
    return NextResponse.json({ error: error.code, message: error.message }, { status });
  }
  if (error instanceof MaintenanceError) {
    const status = error.code === "ROOM_NOT_FOUND" || error.code === "INCIDENT_NOT_FOUND" ? 404 : 409;
    return NextResponse.json({ error: error.code, message: error.message }, { status });
  }
  console.error(`${context}:`, error);
  return NextResponse.json(
    { error: "INTERNAL_SERVER_ERROR", message: "No se pudo aplicar el bloqueo." },
    { status: 500 },
  );
}
