/** Error de dominio de una herramienta (código estable para la UI/orquestador y los tests). */
export class ToolError extends Error {
  constructor(
    readonly code: "NIGHT_NOT_FOUND" | "NIGHT_NOT_PURCHASABLE" | "INVALID_INPUT",
    message: string,
  ) {
    super(message);
    this.name = "ToolError";
  }
}
