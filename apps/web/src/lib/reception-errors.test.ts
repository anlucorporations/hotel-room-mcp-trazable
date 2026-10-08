import { describe, expect, it, vi } from "vitest";
import { ReceptionError } from "@hotel/shared";
import { receptionErrorResponse } from "./reception-errors";

/**
 * Traducción de errores de recepción a HTTP. Los códigos de dominio se mapean a su estado; lo que no
 * se reconoce es **500**, nunca un error disfrazado de culpa del usuario.
 */
describe("receptionErrorResponse", () => {
  it("mapea un error de dominio conocido a su código HTTP", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = receptionErrorResponse("checkin", new ReceptionError("CODIGO_INVALIDO", "código malo"));

    expect(response.status).toBe(400);
  });

  it("un error inesperado es 500 con el mensaje del Error", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = receptionErrorResponse("checkout", new Error("explotó"));

    expect(response.status).toBe(500);
  });

  it("si lo lanzado no es un Error, usa un mensaje genérico", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = receptionErrorResponse("checkout", "texto suelto");

    expect(response.status).toBe(500);
  });
});
