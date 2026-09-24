/**
 * Rebind del checkpoint del worker ante un redeploy (T0.3, ADR-09).
 *
 * El contrato es inmutable (ADR-22): un cambio = redeploy con nueva dirección y
 * `deploymentBlock`. Cuando la dirección cambia respecto al checkpoint guardado, se
 * reinicia el checkpoint al nuevo `deploymentBlock` para reprocesar desde el inicio del
 * nuevo contrato y se descartan los agregados del anterior. La idempotencia del worker
 * (`idempotency-key = keccak(txHash, logIndex)`, T1.4) evita avisos duplicados.
 *
 * Función pura: la persistencia (PostgreSQL, D-09) y el recálculo de agregados se conectan en T1.4.
 */
export interface WorkerCheckpoint {
  readonly contractAddress: string;
  readonly lastProcessedBlock: number;
}

export interface DeploymentRef {
  readonly address: string;
  readonly deploymentBlock: number;
}

export interface RebindResult {
  /** `true` si hubo redeploy (cambió la dirección) y el checkpoint se reinició. */
  readonly changed: boolean;
  readonly checkpoint: WorkerCheckpoint;
}

const sameAddress = (a: string, b: string): boolean =>
  a.toLowerCase() === b.toLowerCase();

export function rebindCheckpoint(
  current: WorkerCheckpoint | null,
  deployment: DeploymentRef,
): RebindResult {
  if (current && sameAddress(current.contractAddress, deployment.address)) {
    return { changed: false, checkpoint: current };
  }
  return {
    changed: true,
    checkpoint: {
      contractAddress: deployment.address.toLowerCase(),
      lastProcessedBlock: deployment.deploymentBlock,
    },
  };
}

/**
 * ¿La cadena quedó **por detrás** del checkpoint persistido? (reinicio/reorg hacia atrás).
 *
 * Caso real, encontrado al verificar M4: reiniciar Anvil conserva la **misma dirección
 * determinista** del contrato (`0x5FbD…aa3`), así que `rebindCheckpoint` no ve ningún redeploy
 * —la dirección no cambió— y el checkpoint de la cadena anterior sobrevive. Si quedó por delante
 * de la cabeza nueva, el catch-up arranca en `checkpoint + 1`, no encuentra bloques nunca y el
 * worker se queda **mudo**: contadores a cero y `lag` negativo, que además no cruzaba ningún
 * umbral de salud (el monitor no alertaba).
 *
 * La regla es pura y conservadora: solo se cumple cuando el bloque persistido supera la cabeza
 * observada, que en una cadena viva es imposible. Reprocesar es seguro porque la idempotencia
 * (`worker_processed_logs`) descarta lo ya contabilizado.
 */
export function isCheckpointAheadOfChain(
  lastProcessedBlock: number,
  headBlock: bigint,
): boolean {
  return BigInt(lastProcessedBlock) > headBlock;
}
