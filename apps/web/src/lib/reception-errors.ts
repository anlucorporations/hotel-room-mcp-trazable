import "server-only";
import { NextResponse } from "next/server";
import { ReceptionError, type ReceptionErrorCode } from "@hotel/shared";

/**
 * Traducción de los errores de dominio de recepción a HTTP (incremento v2).
 *
 * Se mapea por **código** estable, no por el texto del mensaje: el texto puede cambiar sin romper
 * el contrato con la UI. Un error desconocido es 500 (nunca se disfraza de error del usuario).
 */
const HTTP_BY_CODE: Record<ReceptionErrorCode, number> = {
  RESERVA_NO_ENCONTRADA: 404,
  CODIGO_INVALIDO: 400,
  TOKEN_NO_ENCONTRADO: 404,
  ESTANCIA_NO_CHECKED_IN: 409,
  CARGO_INVALIDO: 400,
};

export function receptionErrorResponse(scope: string, error: unknown): NextResponse {
  if (error instanceof ReceptionError) {
    console.error(`[API /api/reception/${scope}] ${error.code}:`, error.message);
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: HTTP_BY_CODE[error.code] ?? 400 },
    );
  }

  console.error(`[API /api/reception/${scope}] Error inesperado:`, error);
  return NextResponse.json(
    {
      error: "INTERNAL_SERVER_ERROR",
      message: error instanceof Error ? error.message : "Error al procesar la operación de recepción",
    },
    { status: 500 },
  );
}
