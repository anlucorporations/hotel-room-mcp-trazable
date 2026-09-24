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

/**
 * Superficie mínima del SDK de Sentry que este logger utiliza.
 *
 * Se declara aquí (en vez de leer `globalThis` con un `any`) para que el hook de reporte quede
 * tipado sin arrastrar el SDK completo como dependencia del paquete compartido.
 */
interface SentryHook {
  captureException?: (err: unknown, hint?: { extra?: LogContext }) => void;
  captureMessage?: (message: string, hint?: { level?: string; extra?: LogContext }) => void;
}

declare global {
  // `declare global` exige `var` para ampliar la superficie de `globalThis`; no es una variable
  // real, solo describe la propiedad que el runtime añade cuando inicializa Sentry.
  var __SENTRY__: SentryHook | undefined;
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
      // eslint-disable-next-line no-console -- este módulo ES la frontera de logging: es el único sitio que escribe en consola
      console.debug(this.formatMessage("debug", message, context));
    }
  }

  public info(message: string, context?: LogContext): void {
    // eslint-disable-next-line no-console -- este módulo ES la frontera de logging: es el único sitio que escribe en consola
    console.info(this.formatMessage("info", message, context));
  }

  public warn(message: string, context?: LogContext, err?: unknown): void {
    console.warn(this.formatMessage("warn", message, context, err));
  }

  public error(message: string, context?: LogContext, err?: unknown): void {
    console.error(this.formatMessage("error", message, context, err));
    // Sentry hook: si Sentry está inicializado globalmente, capturamos la excepción
    if (typeof globalThis !== "undefined" && globalThis.__SENTRY__) {
      const sentry = globalThis.__SENTRY__;
      try {
        if (err) {
          sentry.captureException?.(err, { extra: context });
        } else {
          sentry.captureMessage?.(message, { level: "error", extra: context });
        }
      } catch {
        // Fallback silencioso si falla el reporte a Sentry
      }
    }
  }
}

export const logger = new Logger();
export const createLogger = (serviceName: string) => new Logger(serviceName);
