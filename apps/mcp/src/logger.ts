import { pino, type Logger } from "pino";

/** Logger estructurado del MCP (RNF-17). */
export function createLogger(component: string): Logger {
  return pino({
    level: process.env.LOG_LEVEL ?? "info",
    base: { component },
  });
}
