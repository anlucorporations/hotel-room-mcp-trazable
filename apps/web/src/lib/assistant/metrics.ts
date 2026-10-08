import { estimateCostUsd } from "./pricing";
import type { RedactionKind } from "./pii-sanitizer";
import type { LlmUsage } from "./types";

/**
 * Telemetría del asistente (RNF-22, RNF-24, RNF-25).
 *
 * Registra **una línea por petición** con lo que hace falta para auditar el coste y la latencia
 * —modelo, tokens, coste estimado, llamadas y tiempo— y **nunca** el contenido de la conversación ni
 * la PII (RNF-26). Los recuentos de enmascarado entran como categorías, no como datos.
 */

/** Consumo vacío, para los dobles de test y para cuando el proveedor no informa. */
export const EMPTY_USAGE: LlmUsage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };

export function addUsage(a: LlmUsage, b: LlmUsage): LlmUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
  };
}

export interface AssistantMetrics {
  readonly provider: string;
  readonly model: string;
  readonly latencyMs: number;
  /** Llamadas al modelo (una por ronda de herramientas, más el cierre). */
  readonly llmCalls: number;
  readonly toolCalls: number;
  readonly usage: LlmUsage;
  readonly costUsd: number;
  readonly redactions: readonly RedactionKind[];
  /** Turnos descartados por el presupuesto de entrada. */
  readonly droppedTurns: number;
}

/** Línea de log estructurada, sin PII. Es lo que se consulta en Cloud Run para auditar el gasto. */
export function metricsLogLine(metrics: AssistantMetrics): string {
  return JSON.stringify({ event: "assistant_request", ...metrics });
}

export interface BudgetDecision {
  /** `false` solo en modo duro, cuando el gasto acumulado supera el techo. */
  readonly allowed: boolean;
  readonly spentUsd: number;
  readonly budgetUsd: number;
  readonly exceeded: boolean;
}

/**
 * Acumulador de gasto del mes en curso, **en memoria del proceso**.
 *
 * Límite conocido y aceptado: es un piloto de instancia única (igual que el limitador de peticiones),
 * así que el contador se pierde al reciclar la instancia y no suma entre instancias. Sirve como
 * **aviso temprano**; el número que manda es la facturación de GCP, y para eso el presupuesto de GCP
 * con alerta es la red de seguridad real.
 */
export class MonthlyBudget {
  private month = "";
  private spentUsd = 0;

  constructor(
    private readonly budgetUsd: number,
    private readonly mode: "soft" | "hard" = "soft",
    private readonly now: () => Date = () => new Date(),
  ) {}

  private currentMonth(): string {
    const now = this.now();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  /** Suma el coste de una petición y decide si se permite seguir (solo en modo duro). */
  record(costUsd: number): BudgetDecision {
    const month = this.currentMonth();
    if (month !== this.month) {
      this.month = month;
      this.spentUsd = 0;
    }
    const exceededBefore = this.spentUsd >= this.budgetUsd;
    this.spentUsd = Number((this.spentUsd + costUsd).toFixed(6));
    const exceeded = this.spentUsd >= this.budgetUsd;
    return {
      allowed: !(this.mode === "hard" && exceededBefore),
      spentUsd: this.spentUsd,
      budgetUsd: this.budgetUsd,
      exceeded,
    };
  }

  /** Gasto acumulado del mes (sin registrar nada). */
  spent(): number {
    return this.currentMonth() === this.month ? this.spentUsd : 0;
  }
}

export interface BudgetConfig {
  readonly budgetUsd: number;
  readonly mode: "soft" | "hard";
}

export interface BudgetEnv {
  /** Permite pasar `process.env` directamente (su índice encaja con esta firma). */
  readonly [key: string]: string | undefined;
  readonly ASSISTANT_MONTHLY_BUDGET_USD?: string;
  readonly ASSISTANT_BUDGET_MODE?: string;
}

/** Configuración del presupuesto desde el entorno, con valores conservadores por defecto. */
export function budgetConfig(env: BudgetEnv): BudgetConfig {
  const parsed = Number.parseFloat(env.ASSISTANT_MONTHLY_BUDGET_USD ?? "");
  return {
    budgetUsd: Number.isFinite(parsed) && parsed > 0 ? parsed : 5,
    mode: env.ASSISTANT_BUDGET_MODE === "hard" ? "hard" : "soft",
  };
}

/** Coste estimado de una petición a partir de su consumo. Atajo para no importar dos módulos. */
export { estimateCostUsd };
