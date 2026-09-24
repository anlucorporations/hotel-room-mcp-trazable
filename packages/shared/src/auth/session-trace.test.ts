import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  hashSessionTrace,
  isHashedSessionTrace,
  SESSION_TRACE_DISCARDED,
  SESSION_TRACE_PREFIX,
} from "./crypto";

/**
 * Traza de sesión pseudonimizada (ADR-24 · decisión de M9).
 *
 * Lo que estas pruebas fijan, y por qué importa:
 *   1. **Determinismo**: la misma IP tiene que dar la misma traza; si no, la traza no sirve para
 *      reconocer repeticiones y el dato guardado sería ruido.
 *   2. **Irreversibilidad con clave**: el valor almacenado se calcula con HMAC y una clave del
 *      entorno. Con otro secreto, la misma IP da OTRA traza: nadie puede revertirla por fuerza bruta
 *      (el espacio de IPv4 son ~4.300 millones de valores, se recorre entero en minutos con un hash
 *      sin clave).
 *   3. **Fallo en cerrado**: si no hay `SESSION_TRACE_SECRET` ni `AES_SECRET_KEY`, se lanza en vez de
 *      guardar una traza sin clave que parecería protegida.
 */
describe("traza de sesión pseudonimizada (ADR-24)", () => {
  const ORIGINAL = { ...process.env };

  beforeEach(() => {
    process.env.SESSION_TRACE_SECRET = "secreto-dedicado-de-prueba-para-la-traza";
    process.env.AES_SECRET_KEY = "0".repeat(64);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it("es determinista y normaliza mayúsculas y espacios", () => {
    const base = hashSessionTrace("192.168.1.10");
    expect(base).toBe(hashSessionTrace("  192.168.1.10  "));
    expect(base).toMatch(new RegExp(`^${SESSION_TRACE_PREFIX}[0-9a-f]{64}$`));
    // El *user agent* se normaliza igual: `Mozilla/5.0` y `mozilla/5.0` son el mismo acceso.
    expect(hashSessionTrace("Mozilla/5.0")).toBe(hashSessionTrace("mozilla/5.0"));
  });

  it("no guarda nada cuando no hay nada que guardar", () => {
    expect(hashSessionTrace(null)).toBeNull();
    expect(hashSessionTrace(undefined)).toBeNull();
    expect(hashSessionTrace("")).toBeNull();
    expect(hashSessionTrace("   ")).toBeNull();
  });

  it("no es reversible sin la clave: otro secreto produce otra traza", () => {
    const withDedicated = hashSessionTrace("203.0.113.7");
    process.env.SESSION_TRACE_SECRET = "otro-secreto-completamente-distinto";
    const withOther = hashSessionTrace("203.0.113.7");

    expect(withOther).not.toBe(withDedicated);
    // Y ninguna de las dos contiene la IP en claro, ni siquiera parcialmente.
    expect(withDedicated).not.toContain("203.0.113.7");
    expect(withOther).not.toContain("203.0.113.7");
  });

  it("usa AES_SECRET_KEY como respaldo y NO un valor por defecto", () => {
    delete process.env.SESSION_TRACE_SECRET;
    const withFallback = hashSessionTrace("198.51.100.4");
    expect(withFallback).toMatch(new RegExp(`^${SESSION_TRACE_PREFIX}[0-9a-f]{64}$`));

    // Sin ninguna de las dos claves, falla en cerrado: no hay traza «sin proteger».
    delete process.env.AES_SECRET_KEY;
    expect(() => hashSessionTrace("198.51.100.4")).toThrow();
  });

  it("distingue lo pseudonimizado de lo que no lo está", () => {
    expect(isHashedSessionTrace(hashSessionTrace("10.0.0.1"))).toBe(true);
    expect(isHashedSessionTrace(SESSION_TRACE_DISCARDED)).toBe(true);
    // Una fila antigua (IP en claro) no pasa por pseudonimizada: es lo que el guardián usa para
    // exigir la migración de las filas previas.
    expect(isHashedSessionTrace("192.168.1.1")).toBe(false);
    expect(isHashedSessionTrace(null)).toBe(false);
  });
});
