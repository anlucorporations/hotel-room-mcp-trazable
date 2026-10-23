import { describe, expect, it } from "vitest";
import { createWorkerHealthState } from "./health";

/**
 * Salud del worker ante un checkpoint **por delante** de la cabeza (reinicio/reorg de la cadena).
 *
 * Caso real encontrado al verificar M4: tras reiniciar Anvil con la misma dirección determinista,
 * el worker reportaba `lastBlock: 1890` con `headBlock: 367` y **`status: "ok"`**. Un lag negativo
 * no cruzaba ningún umbral (`overThreshold` solo mira el lag positivo), así que el pipeline podía
 * estar completamente detenido sin que el monitor alertara.
 */
describe("salud del worker · checkpoint adelantado a la cadena", () => {
  it("un lag negativo (checkpoint adelantado) degrada la salud en vez de reportar ok", () => {
    const health = createWorkerHealthState();

    health.recordCycle(1890, 367);

    expect(health.lag).toBe(-1523);
    expect(health.toReport().status).toBe("down");
  });

  it("un lag de agregados negativo también degrada la salud", () => {
    const health = createWorkerHealthState();

    health.recordCycle(10, 10);
    health.recordAggregateCycle(1890);

    expect(health.aggregateLag).toBe(-1880);
    expect(health.toReport().status).toBe("down");
  });

  it("un desfase de pocos bloques del agregado (otra lectura de cabeza) NO degrada la salud", () => {
    // ADR-34: el ingestor escribe desde el bucle del listener, que lee la cabeza en otro instante
    // que `/health`. Con RPC balanceado son normales 1–4 bloques de desfase; no es un reorg.
    const health = createWorkerHealthState();

    health.recordCycle(1000, 1000);
    health.recordAggregateCycle(1002);

    expect(health.aggregateLag).toBe(-2);
    expect(health.toReport().status).toBe("ok");
  });

  it("un retraso positivo dentro del umbral sigue reportando ok", () => {
    const health = createWorkerHealthState({ lagThreshold: 50 });

    health.recordCycle(360, 367);
    health.recordAggregateCycle(360);

    expect(health.toReport().status).toBe("ok");
  });

  it("un retraso positivo por encima del umbral sigue degradando", () => {
    const health = createWorkerHealthState({ lagThreshold: 50 });

    health.recordCycle(300, 367);

    expect(health.toReport().status).toBe("down");
  });
});

/**
 * Señal de vida de la quema programada en `/health` (hallazgo **H-04** de la auditoría V6).
 *
 * El proceso no tenía señal: un worker desplegado sin la clave del firmante dejaba el planificador
 * apagado con un `logger.warn` que nadie lee, y un día sin quema no se distinguía de un día sin nada
 * que quemar. Ahora `/health` publica si el planificador está habilitado y el último ciclo.
 */
describe("salud del worker · señal de vida de la quema", () => {
  it("sin planificador configurado se reporta `disabled` (el fallo real de producción)", () => {
    const state = createWorkerHealthState();

    const report = state.toReport();

    expect(report.status).toBe("ok");
    expect(report.details?.burn).toEqual({ scheduler: "disabled", lastRun: null });
  });

  it("con el planificador arrancado publica el último ciclo, al día en cada consulta", () => {
    const state = createWorkerHealthState();
    let lastRun: { at: string; dayKey: string; reason: string; burnedTokensCount: number } | null = null;
    state.setBurnHealth(() => ({ scheduler: "enabled", lastRun }));

    expect(state.toReport().details?.burn).toEqual({ scheduler: "enabled", lastRun: null });

    lastRun = {
      at: "2026-10-10T10:00:05.000Z",
      dayKey: "2026-10-10",
      reason: "COMPLETED",
      burnedTokensCount: 3,
    };

    // El proveedor se evalúa en cada informe: un monitor externo ve el ciclo sin reiniciar nada.
    expect(state.toReport().details?.burn).toEqual({ scheduler: "enabled", lastRun });
  });
});

describe("salud del worker · outbox de anclaje (F3)", () => {
  it("sin relayer configurado se reporta `disabled` con contadores a cero", () => {
    const state = createWorkerHealthState();
    expect(state.toReport().details?.anchor).toEqual({
      scheduler: "disabled",
      lastCycle: null,
      stats: { signed: 0, failed: 0, oldestSignedAt: null, maxRetryCount: 0 },
    });
  });

  it("con el relayer arrancado publica el último ciclo y los contadores del outbox, al día", () => {
    const state = createWorkerHealthState();
    let lastCycle: {
      at: string;
      claimed: number;
      mined: number;
      failed: number;
    } | null = null;
    let stats = { signed: 0, failed: 0, oldestSignedAt: null as string | null, maxRetryCount: 0 };
    state.setAnchorHealth(() => ({ scheduler: "enabled", lastCycle, stats }));

    expect(state.toReport().details?.anchor).toEqual({
      scheduler: "enabled",
      lastCycle: null,
      stats: { signed: 0, failed: 0, oldestSignedAt: null, maxRetryCount: 0 },
    });

    lastCycle = { at: "2026-10-12T12:00:00.000Z", claimed: 3, mined: 2, failed: 1 };
    stats = { signed: 5, failed: 1, oldestSignedAt: "2026-10-12T11:30:00.000Z", maxRetryCount: 6 };

    // El monitor lee estos datos del /health para alertar de firmas atascadas (T3.8).
    expect(state.toReport().details?.anchor).toEqual({ scheduler: "enabled", lastCycle, stats });
  });
});
