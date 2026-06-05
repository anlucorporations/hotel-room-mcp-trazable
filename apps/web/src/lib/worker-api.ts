import "server-only";
import {
  RPC_TIMEOUT_MS,
  type DashboardAggregates,
  type SaleHistoryEntry,
} from "@hotel/shared";

/**
 * Cliente de los agregados precomputados por el worker (ADR-09, §7): histórico y dashboard
 * leen del worker, no por RPC directo. Lecturas sin caché y con timeout (CU-09/11 degradado).
 */
const WORKER_BASE_URL = process.env.WORKER_BASE_URL ?? "http://127.0.0.1:8787";

async function getJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const response = await fetch(`${WORKER_BASE_URL}${path}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`worker ${path} → ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function fetchAggregates(): Promise<DashboardAggregates> {
  return getJson<DashboardAggregates>("/aggregates");
}

export function fetchHistory(): Promise<SaleHistoryEntry[]> {
  return getJson<SaleHistoryEntry[]>("/history");
}
