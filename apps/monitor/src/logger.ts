import { pino, type Logger } from "pino";

/** Logger estructurado (RNF-17). Nivel configurable por `LOG_LEVEL` (default `info`). */
export function createLogger(component: string): Logger {
  return pino({
    level: process.env.LOG_LEVEL ?? "info",
    base: { component },
  });
}
