import type { HealthProvider, HealthReport } from "@hotel/shared/health";

/**
 * Estado de salud del worker (RNF-17). El lag se define como `headBlock - lastBlock`.
 *
 * En FASE 0 el listener de eventos aún no está conectado (T1.4): reporta `ok` con lag
 * desconocido. La transición a `down` por lag/umbral o desconexión se completa con el
 * listener.
 */
export interface WorkerHealthState {
  lastBlock: number | null;
  headBlock: number | null;
}

export function createWorkerHealthState(): WorkerHealthState {
  return { lastBlock: null, headBlock: null };
}

export function workerHealthProvider(state: WorkerHealthState): HealthProvider {
  return (): HealthReport => {
    const lag =
      state.headBlock !== null && state.lastBlock !== null
        ? state.headBlock - state.lastBlock
        : null;
    return {
      status: "ok",
      component: "worker",
      details: { lastBlock: state.lastBlock, headBlock: state.headBlock, lag },
    };
  };
}
