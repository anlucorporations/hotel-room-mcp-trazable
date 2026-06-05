import { describe, expect, it } from "vitest";
import { EnvironmentValidationError } from "@hotel/shared/env";
import { loadMonitorConfig } from "./config";

const valid = {
  MONITOR_TARGETS:
    "worker=http://127.0.0.1:8787/health,mcp=http://127.0.0.1:8788/health",
  SMTP_HOST: "smtp.example.com",
  SMTP_USER: "monitor@example.com",
  SMTP_PASS: "secreto",
  SMTP_FROM: "avisos@example.com",
  ALERT_EMAIL: "admin@example.com",
} as const;

describe("monitor config", () => {
  it("aplica defaults y valida lo requerido", () => {
    const config = loadMonitorConfig(valid);
    expect(config.POLL_INTERVAL_MS).toBe(15_000);
    expect(config.LAG_THRESHOLD).toBe(50);
    expect(config.FAILURE_THRESHOLD).toBe(3);
    expect(config.SMTP_PORT).toBe(587);
  });

  it("parsea MONITOR_TARGETS (varios targets) a { name, url }[]", () => {
    const config = loadMonitorConfig(valid);
    expect(config.MONITOR_TARGETS).toEqual([
      { name: "worker", url: "http://127.0.0.1:8787/health" },
      { name: "mcp", url: "http://127.0.0.1:8788/health" },
    ]);
  });

  it("tolera espacios y comas sobrantes en MONITOR_TARGETS", () => {
    const config = loadMonitorConfig({
      ...valid,
      MONITOR_TARGETS:
        " worker = http://127.0.0.1:8787/health , , mcp=http://127.0.0.1:8788/health ,",
    });
    expect(config.MONITOR_TARGETS).toEqual([
      { name: "worker", url: "http://127.0.0.1:8787/health" },
      { name: "mcp", url: "http://127.0.0.1:8788/health" },
    ]);
  });

  it("falla fail-fast si un target no tiene el formato nombre=url", () => {
    expect(() =>
      loadMonitorConfig({ ...valid, MONITOR_TARGETS: "worker-sin-igual" }),
    ).toThrow(EnvironmentValidationError);
  });

  it("falla fail-fast si la URL de un target es inválida", () => {
    expect(() =>
      loadMonitorConfig({ ...valid, MONITOR_TARGETS: "worker=no-es-url" }),
    ).toThrow(EnvironmentValidationError);
  });

  it("falla fail-fast si MONITOR_TARGETS está vacío", () => {
    expect(() => loadMonitorConfig({ ...valid, MONITOR_TARGETS: "" })).toThrow(
      EnvironmentValidationError,
    );
  });

  it("falla fail-fast si faltan los secretos SMTP", () => {
    const { SMTP_HOST: _omit, ...withoutSmtp } = valid;
    expect(() => loadMonitorConfig(withoutSmtp)).toThrow(EnvironmentValidationError);
  });

  it("falla fail-fast si ALERT_EMAIL no es un email", () => {
    expect(() => loadMonitorConfig({ ...valid, ALERT_EMAIL: "no-email" })).toThrow(
      EnvironmentValidationError,
    );
  });
});
