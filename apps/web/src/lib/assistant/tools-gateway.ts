import type { ToolDescriptor } from "./types";

/**
 * Puerto de acceso a las herramientas del MCP (DIP). El orquestador descubre y ejecuta
 * herramientas a través de esta abstracción; el adaptador real habla con el MCP por HTTP
 * (transporte Streamable, ADR-11). Solo read-only + preparación: el MCP nunca firma.
 */
export interface ToolGateway {
  /** Lista las herramientas disponibles (con su JSON Schema) para ofrecérselas al LLM. */
  listTools(): Promise<ToolDescriptor[]>;
  /** Ejecuta una herramienta; devuelve su resultado ya parseado. Lanza si la tool falla. */
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}
