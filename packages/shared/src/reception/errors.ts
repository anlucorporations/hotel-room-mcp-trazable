/**
 * Códigos de error estables de las operaciones de recepción del incremento v2 (check-out y cargos).
 *
 * Igual que `CheckInError`, la API traduce por **código**, nunca por el texto (que puede cambiar),
 * y la UI usa el código para elegir el mensaje. Un código desconocido se trata como 400/500.
 */
export type ReceptionErrorCode =
  | "RESERVA_NO_ENCONTRADA"
  | "CODIGO_INVALIDO"
  | "TOKEN_NO_ENCONTRADO"
  | "ESTANCIA_NO_CHECKED_IN"
  | "CARGO_INVALIDO"
  | "HABITACION_NO_ENCONTRADA";

export class ReceptionError extends Error {
  constructor(
    readonly code: ReceptionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ReceptionError";
  }
}
