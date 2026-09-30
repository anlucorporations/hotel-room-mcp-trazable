/**
 * Integridad catálogo ↔ cadena (F9). Dominio **puro**: sin BD, sin RPC, sin reloj.
 *
 * Por qué existe: la consolidación del índice (`NFTSold → nfts.status='SOLD'`, en el listener) y los
 * contadores del dashboard (`sale → worker_aggregate_counters.sold_count`) son **dos caminos
 * independientes** que leen los mismos eventos. Cuando el primero falla y el segundo no —exactamente
 * lo que pasó en producción antes de `v14`, §35— el catálogo ofrece como `AVAILABLE` noches que la
 * cadena ya vendió. El huésped pulsa Reservar y recibe «No pudimos verificar el precio on-chain»: un
 * mensaje de red para un problema de inventario.
 *
 * Qué NO se puede hacer, y por qué este módulo es **por noche** y no global: comparar totales
 * (`minted − sold` contra `available`) no funciona. Una noche vendida y después listada en reventa
 * sigue siendo inventario ofertable, así que el total «correcto» depende del historial de reventas y
 * cualquier resta sobre agregados produce falsos positivos. La única comparación válida es por
 * `tokenId`: el índice dice `AVAILABLE` y el registro de ventas dice que esa noche cambió de dueño.
 */

/** Estado de una noche según CADA fuente independiente. */
export type NightSourceState = "available" | "sold" | "unknown";

/** Las dos vistas de una misma noche: `index` = `nfts.status`; `events` = `sale_events`. */
export interface NightSources {
  readonly index: NightSourceState;
  readonly events: NightSourceState;
}

/** Veredicto por noche. Cuatro estados, sin colapsar «no sé» en «está bien». */
export type NightIntegrity = "ok" | "ghost" | "deficit" | "indeterminate";

/**
 * Clasifica una noche contrastando sus dos fuentes.
 *
 * Solo `"ghost"` es comercialmente peligroso: ofrecer lo que la cadena va a revertir. Un `"deficit"`
 * (el índice oculta una noche que los eventos dicen libre) es conservador —molesta, pero no vende lo
 * invendible— y no se corrige automáticamente. Ante `"unknown"` en cualquiera de las dos fuentes el
 * resultado es `"indeterminate"`: un pico de red o un evento todavía no consolidado **no** deben
 * ocultar inventario sano (misma disciplina que `classifySoldOnce`).
 */
export function classifyNightIntegrity(sources: NightSources): NightIntegrity {
  if (sources.index === "unknown" || sources.events === "unknown") return "indeterminate";
  if (sources.index === "available" && sources.events === "sold") return "ghost";
  if (sources.index === "sold" && sources.events === "available") return "deficit";
  return "ok";
}

/** ¿La noche debe salir del catálogo? Únicamente la confirmada como fantasma. */
export function shouldHideNight(sources: NightSources): boolean {
  return classifyNightIntegrity(sources) === "ghost";
}

/** Muestra de una noche con sus dos fuentes. */
export interface IntegritySample<TId extends string = string> {
  readonly tokenId: TId;
  readonly sources: NightSources;
}

/** Recuento del contraste entre índice y eventos. */
export interface IntegrityReport<TId extends string = string> {
  /** Noches que el índice ofrece y los eventos confirman vendidas: hay que retirarlas. */
  readonly ghosts: readonly TId[];
  /** Noches que el índice oculta y los eventos dejan libres: informe, no autocorrección. */
  readonly deficits: readonly TId[];
  /** Muestras donde alguna fuente no respondió. */
  readonly indeterminate: number;
  readonly checked: number;
  /** El índice contradice a los eventos en alguna noche concreta. */
  readonly drifted: boolean;
}

/**
 * Resume una tanda de muestras. Las listas salen deduplicadas y ordenadas para que logs, alertas y
 * pruebas sean deterministas con el mismo input.
 */
export function summarizeNightIntegrity<TId extends string = string>(
  samples: readonly IntegritySample<TId>[],
): IntegrityReport<TId> {
  const ghosts: TId[] = [];
  const deficits: TId[] = [];
  let indeterminate = 0;

  for (const sample of samples) {
    switch (classifyNightIntegrity(sample.sources)) {
      case "ghost":
        ghosts.push(sample.tokenId);
        break;
      case "deficit":
        deficits.push(sample.tokenId);
        break;
      case "indeterminate":
        indeterminate += 1;
        break;
      case "ok":
        break;
    }
  }

  return {
    ghosts: [...new Set(ghosts)].sort(),
    deficits: [...new Set(deficits)].sort(),
    indeterminate,
    checked: samples.length,
    drifted: ghosts.length > 0,
  };
}
