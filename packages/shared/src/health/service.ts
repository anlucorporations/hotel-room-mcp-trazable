import type { Pool } from "pg";
import type { Redis } from "ioredis";
import { getDbPool } from "../db/pool";
import { getRedisClient } from "../redis/client";

export interface HealthCheckResult {
  status: "READY" | "DEGRADED";
  dependencies: {
    postgres: "UP" | "DOWN";
    redis: "UP" | "DOWN";
    polygonRPC: "UP" | "DOWN";
  };
  details?: Record<string, string>;
}

export async function checkLiveness(): Promise<{ status: "ALIVE" }> {
  return { status: "ALIVE" };
}

export async function checkReadiness(
  rpcUrl?: string,
  customPool?: Pool,
  customRedis?: Redis,
): Promise<HealthCheckResult> {
  const pool = customPool || getDbPool();
  const redis = customRedis || getRedisClient();
  const rpc = rpcUrl || process.env.RPC_URL || "http://127.0.0.1:8545";

  let postgresStatus: "UP" | "DOWN" = "DOWN";
  let redisStatus: "UP" | "DOWN" = "DOWN";
  let rpcStatus: "UP" | "DOWN" = "DOWN";
  const details: Record<string, string> = {};

  // 1. PostgreSQL check
  try {
    await pool.query("SELECT 1");
    postgresStatus = "UP";
  } catch (err: any) {
    details.postgres = err?.message || "Conexión a PostgreSQL fallida";
  }

  // 2. Redis check
  try {
    const pong = await redis.ping();
    if (pong === "PONG") {
      redisStatus = "UP";
    } else {
      details.redis = "Respuesta Redis inesperada";
    }
  } catch (err: any) {
    details.redis = err?.message || "Conexión a Redis fallida";
  }

  // 3. Polygon RPC check
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_blockNumber",
        params: [],
        id: 1,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (res.ok) {
      const data = (await res.json()) as any;
      if (data?.result) {
        rpcStatus = "UP";
      } else {

        details.polygonRPC = "RPC respondió sin número de bloque";
      }
    } else {
      details.polygonRPC = `RPC HTTP ${res.status}`;
    }
  } catch (err: any) {
    details.polygonRPC = err?.message || "Conexión a RPC fallida";
  }

  const isReady = postgresStatus === "UP" && redisStatus === "UP" && rpcStatus === "UP";

  return {
    status: isReady ? "READY" : "DEGRADED",
    dependencies: {
      postgres: postgresStatus,
      redis: redisStatus,
      polygonRPC: rpcStatus,
    },
    ...(Object.keys(details).length > 0 ? { details } : {}),
  };
}
