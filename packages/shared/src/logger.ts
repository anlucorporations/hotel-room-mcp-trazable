/**
 * Módulo de Observabilidad y Logging Estructurado (JSON)
 * Hotel Marina del Sol — Soporte para GCP Cloud Logging y Sentry
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  service?: string;
  requestId?: string;
  blockNumber?: number | bigint;
  txHash?: string;
  tokenId?: string;
  [key: string]: unknown;
}

export interface StructuredLogMessage {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class Logger {
  private serviceName: string;

  constructor(serviceName = "hotel-platform") {
    this.serviceName = serviceName;
  }

  private formatMessage(
    level: LogLevel,
    message: string,
    context?: LogContext,
    err?: unknown
  ): string {
    const logObj: StructuredLogMessage = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: {
        service: this.serviceName,
        ...context,
      },
    };

    if (err instanceof Error) {
      logObj.error = {
        name: err.name,
        message: err.message,
        stack: err.stack,
      };
    } else if (err) {
      logObj.error = {
        name: "UnknownError",
        message: String(err),
      };
    }

    return JSON.stringify(logObj);
  }

  public debug(message: string, context?: LogContext): void {
    if (process.env.LOG_LEVEL === "debug") {
      console.debug(this.formatMessage("debug", message, context));
    }
  }

  public info(message: string, context?: LogContext): void {
    console.info(this.formatMessage("info", message, context));
  }

  public warn(message: string, context?: LogContext, err?: unknown): void {
    console.warn(this.formatMessage("warn", message, context, err));
  }

  public error(message: string, context?: LogContext, err?: unknown): void {
    console.error(this.formatMessage("error", message, context, err));
    // Sentry hook: si Sentry está inicializado globalmente, capturamos la excepción
    if (typeof globalThis !== "undefined" && (globalThis as any).__SENTRY__) {
      try {
        if (err) {
          (globalThis as any).__SENTRY__.captureException?.(err, { extra: context });
        } else {
          (globalThis as any).__SENTRY__.captureMessage?.(message, { level: "error", extra: context });
        }
      } catch {
        // Fallback silencioso si falla el reporte a Sentry
      }
    }
  }
}

export const logger = new Logger();
export const createLogger = (serviceName: string) => new Logger(serviceName);
