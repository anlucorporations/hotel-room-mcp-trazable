import type { HealthProvider, HealthReport } from "@hotel/shared/health";

/** Provider de salud del MCP (RNF-17). */
export function mcpHealthProvider(): HealthProvider {
  return (): HealthReport => ({ status: "ok", component: "mcp" });
}
