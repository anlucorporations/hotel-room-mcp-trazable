import { describe, expect, it } from "vitest";
import { InMemoryRateLimiter, DEFAULT_RATE_LIMIT, type RateLimitConfig } from "./rate-limit";

const config: RateLimitConfig = { maxPerMinute: 3, maxPerDay: 5, maxCharsPerMinute: 1_000 };

describe("InMemoryRateLimiter (MAJOR#8)", () => {
  it("admite peticiones bajo el límite por minuto y rechaza la que lo excede con 'per-minute'", () => {
    const rl = new InMemoryRateLimiter(config);
    const t0 = 1_000_000;
    expect(rl.check("ip", 10, t0).allowed).toBe(true);
    expect(rl.check("ip", 10, t0 + 1).allowed).toBe(true);
    expect(rl.check("ip", 10, t0 + 2).allowed).toBe(true);

    const denied = rl.check("ip", 10, t0 + 3);
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe("per-minute");
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("la ventana del minuto se desliza: tras 60 s vuelve a admitir", () => {
    const rl = new InMemoryRateLimiter(config);
    const t0 = 2_000_000;
    rl.check("ip", 10, t0);
    rl.check("ip", 10, t0);
    rl.check("ip", 10, t0);
    expect(rl.check("ip", 10, t0).allowed).toBe(false);

    // Pasado un minuto las tres marcas anteriores caducan.
    expect(rl.check("ip", 10, t0 + 60_001).allowed).toBe(true);
  });

  it("respeta el tope diario por encima del de por minuto", () => {
    const rl = new InMemoryRateLimiter(config);
    let t = 3_000_000;
    // 5 peticiones admitidas, espaciadas para no chocar con el límite por minuto.
    for (let i = 0; i < config.maxPerDay; i++) {
      expect(rl.check("ip", 10, t).allowed).toBe(true);
      t += 60_001;
    }
    const denied = rl.check("ip", 10, t);
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe("daily");
  });

  it("rechaza por presupuesto de caracteres aunque no se supere el número de peticiones", () => {
    const rl = new InMemoryRateLimiter(config);
    const t0 = 4_000_000;
    expect(rl.check("ip", 600, t0).allowed).toBe(true); // 600 de 1000
    const denied = rl.check("ip", 600, t0 + 1); // 1200 > 1000
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe("budget");
  });

  it("el presupuesto de caracteres también se resetea al deslizarse el minuto", () => {
    const rl = new InMemoryRateLimiter(config);
    const t0 = 5_000_000;
    rl.check("ip", 900, t0);
    expect(rl.check("ip", 900, t0 + 1).allowed).toBe(false);
    expect(rl.check("ip", 900, t0 + 60_001).allowed).toBe(true);
  });

  it("aísla las claves entre sí (IP/wallet distintas no comparten cupo)", () => {
    const rl = new InMemoryRateLimiter(config);
    const t0 = 6_000_000;
    rl.check("a", 10, t0);
    rl.check("a", 10, t0);
    rl.check("a", 10, t0);
    expect(rl.check("a", 10, t0).allowed).toBe(false);
    expect(rl.check("b", 10, t0).allowed).toBe(true);
  });

  it("una clave bloqueada no extiende su propia ventana (no cuenta los intentos denegados)", () => {
    const rl = new InMemoryRateLimiter(config);
    const t0 = 7_000_000;
    rl.check("ip", 10, t0);
    rl.check("ip", 10, t0 + 1);
    rl.check("ip", 10, t0 + 2); // 3 admitidas (la primera en t0)
    // Varios intentos denegados a lo largo del minuto no deben empujar la ventana.
    rl.check("ip", 10, t0 + 30_000);
    rl.check("ip", 10, t0 + 59_000);
    // La marca más antigua sigue siendo t0 → a t0+60_001 vuelve a admitir.
    expect(rl.check("ip", 10, t0 + 60_001).allowed).toBe(true);
  });

  it("los límites por defecto son válidos (sanidad de configuración del piloto)", () => {
    expect(DEFAULT_RATE_LIMIT.maxPerMinute).toBeGreaterThan(0);
    expect(DEFAULT_RATE_LIMIT.maxPerDay).toBeGreaterThanOrEqual(DEFAULT_RATE_LIMIT.maxPerMinute);
    expect(DEFAULT_RATE_LIMIT.maxCharsPerMinute).toBeGreaterThan(0);
  });
});
