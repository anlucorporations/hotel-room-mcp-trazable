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
