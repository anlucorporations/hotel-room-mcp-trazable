import { describe, expect, it } from "vitest";
import { loadMonitorConfig, type MonitorConfig } from "./config";
import { MonitorCore } from "./monitor-core";
import {
  FakeAlerter,
  FakeHealthProbe,
  healthy,
  http503,
  networkError,
  silentLogger,
  statusDown,
  withLag,
} from "./test-fakes";

const WORKER_URL = "http://127.0.0.1:8787/health";
const MCP_URL = "http://127.0.0.1:8788/health";

function makeConfig(overrides: Partial<Record<string, string>> = {}): MonitorConfig {
  return loadMonitorConfig({
    MONITOR_TARGETS: `worker=${WORKER_URL},mcp=${MCP_URL}`,
    POLL_INTERVAL_MS: "15000",
    LAG_THRESHOLD: "50",
    FAILURE_THRESHOLD: "3",
    SMTP_HOST: "smtp.example.com",
    SMTP_USER: "monitor@example.com",
    SMTP_PASS: "secreto",
    SMTP_FROM: "avisos@example.com",
    ALERT_EMAIL: "admin@example.com",
    ...overrides,
  });
}

interface Harness {
  readonly core: MonitorCore;
  readonly probe: FakeHealthProbe;
  readonly alerter: FakeAlerter;
}

function makeHarness(config: MonitorConfig = makeConfig()): Harness {
  const probe = new FakeHealthProbe(healthy());
  const alerter = new FakeAlerter();
  const core = new MonitorCore({ probe, alerter, config, logger: silentLogger() });
  return { core, probe, alerter };
}

async function runCycles(core: MonitorCore, n: number): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    await core.runCycle();
  }
}

describe("MonitorCore (TC-NF-020)", () => {
  it("componente sano durante muchos ciclos → 0 alertas", async () => {
    const { core, alerter } = makeHarness();
    await runCycles(core, 10);
    expect(alerter.sent).toHaveLength(0);
  });

  it("HTTP 503 durante FAILURE_THRESHOLD ciclos → exactamente 1 alerta (COMPONENT_DOWN)", async () => {
    const { core, probe, alerter } = makeHarness();
    probe.setResult(WORKER_URL, http503());

    await runCycles(core, 3);

    expect(alerter.sent).toHaveLength(1);
    expect(alerter.sent[0]?.subject).toContain("worker");
    expect(alerter.sent[0]?.subject).toContain("COMPONENT_DOWN");
  });

  it("no alerta antes de alcanzar el umbral", async () => {
    const { core, probe, alerter } = makeHarness();
    probe.setResult(WORKER_URL, http503());

    await runCycles(core, 2);

    expect(alerter.sent).toHaveLength(0);
  });

  it("no spamea: sigue caído tras la alerta → no reenvía", async () => {
    const { core, probe, alerter } = makeHarness();
    probe.setResult(WORKER_URL, http503());

    await runCycles(core, 8);

    expect(alerter.sent).toHaveLength(1);
  });

  it("status:down (HTTP 200 con body down) cuenta como fallo", async () => {
    const { core, probe, alerter } = makeHarness();
    probe.setResult(WORKER_URL, statusDown());

    await runCycles(core, 3);

    expect(alerter.sent).toHaveLength(1);
    expect(alerter.sent[0]?.subject).toContain("COMPONENT_DOWN");
  });

  it("error de red (sin respuesta) cuenta como fallo", async () => {
    const { core, probe, alerter } = makeHarness();
    probe.setResult(WORKER_URL, networkError());

    await runCycles(core, 3);

    expect(alerter.sent).toHaveLength(1);
    expect(alerter.sent[0]?.body).toContain("sin respuesta");
  });

  it("lag > umbral → alerta por LAG", async () => {
    const { core, probe, alerter } = makeHarness();
    probe.setResult(WORKER_URL, withLag(51));

    await runCycles(core, 3);

    expect(alerter.sent).toHaveLength(1);
    expect(alerter.sent[0]?.subject).toContain("LAG");
    expect(alerter.sent[0]?.body).toContain("lag=51");
  });

  it("lag justo en el umbral no alerta", async () => {
    const { core, probe, alerter } = makeHarness();
    probe.setResult(WORKER_URL, withLag(50));

    await runCycles(core, 5);

    expect(alerter.sent).toHaveLength(0);
  });

  it("recuperación tras alerta: resetea y permite nueva alerta si vuelve a caer", async () => {
    const { core, probe, alerter } = makeHarness();

    // Cae y alerta.
    probe.setResult(WORKER_URL, http503());
    await runCycles(core, 3);
    expect(alerter.sent).toHaveLength(1);

    // Se recupera → aviso de recuperación (opcional, implementado).
    probe.setResult(WORKER_URL, healthy());
    await core.runCycle();
    expect(alerter.sent).toHaveLength(2);
    expect(alerter.sent[1]?.subject).toContain("RECUPERADO");

    // Vuelve a caer → nueva alerta (el contador se reseteó).
    probe.setResult(WORKER_URL, http503());
    await runCycles(core, 3);
    expect(alerter.sent).toHaveLength(3);
    expect(alerter.sent[2]?.subject).toContain("COMPONENT_DOWN");
  });

  it("un fallo aislado entre ciclos sanos no acumula hacia el umbral", async () => {
    const { core, probe, alerter } = makeHarness();

    probe.setResult(WORKER_URL, http503());
    await core.runCycle(); // fallo 1
    probe.setResult(WORKER_URL, healthy());
    await core.runCycle(); // reset
    probe.setResult(WORKER_URL, http503());
    await runCycles(core, 2); // fallos 1,2 (no 3)

    expect(alerter.sent).toHaveLength(0);
  });

  it("evalúa todos los targets de forma independiente", async () => {
    const { core, probe, alerter } = makeHarness();
    probe.setResult(WORKER_URL, http503());
    probe.setResult(MCP_URL, healthy());

    await runCycles(core, 3);

    expect(alerter.sent).toHaveLength(1);
    expect(alerter.sent[0]?.subject).toContain("worker");
  });

  it("start() ejecuta ciclos hasta que el AbortSignal aborta", async () => {
    const config = makeConfig();
    const { core, probe, alerter } = makeHarness(config);
    probe.setResult(WORKER_URL, http503());

    const controller = new AbortController();
    let cycles = 0;
    // sleep inyectado: aborta tras dejar que se ejecuten los ciclos suficientes para alertar.
    const sleep = async (): Promise<void> => {
      cycles += 1;
      if (cycles >= 3) controller.abort();
    };

    await core.start(controller.signal, { sleep });

    expect(cycles).toBeGreaterThanOrEqual(3);
    expect(alerter.sent).toHaveLength(1);
  });
});
