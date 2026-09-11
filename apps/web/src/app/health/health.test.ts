import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getLive } from "./live/route";
import { GET as getReady } from "./ready/route";
import * as shared from "@hotel/shared";

vi.mock("@hotel/shared", async () => {
  const actual = await vi.importActual<any>("@hotel/shared");
  return {
    ...actual,
    checkLiveness: vi.fn().mockResolvedValue({ status: "ALIVE" }),
    checkReadiness: vi.fn(),
  };
});

describe("Health Endpoints (US-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /health/live debe responder 200 OK con status ALIVE", async () => {
    const res = await getLive();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ status: "ALIVE" });
  });

  it("GET /health/ready debe responder 200 OK si todas las dependencias están UP", async () => {
    vi.mocked(shared.checkReadiness).mockResolvedValueOnce({
      status: "READY",
      dependencies: {
        postgres: "UP",
        redis: "UP",
        polygonRPC: "UP",
      },
    });

    const res = await getReady();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("READY");
    expect(data.dependencies.postgres).toBe("UP");
  });

  it("GET /health/ready debe responder 503 Service Unavailable si alguna dependencia está DOWN", async () => {
    vi.mocked(shared.checkReadiness).mockResolvedValueOnce({
      status: "DEGRADED",
      dependencies: {
        postgres: "DOWN",
        redis: "UP",
        polygonRPC: "UP",
      },
      details: { postgres: "Conexión rechazada" },
    });

    const res = await getReady();
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.status).toBe("DEGRADED");
    expect(data.dependencies.postgres).toBe("DOWN");
  });
});
