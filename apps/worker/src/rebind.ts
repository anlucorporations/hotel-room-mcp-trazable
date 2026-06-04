/**
 * Rebind del checkpoint del worker ante un redeploy (T0.3, DISEÑO §14).
 *
 * El contrato es inmutable (ADR-22): un cambio = redeploy con nueva dirección y
 * `deploymentBlock`. Cuando la dirección cambia respecto al checkpoint guardado, se
 * reinicia el checkpoint al nuevo `deploymentBlock` para reprocesar desde el inicio del
 * nuevo contrato y se descartan los agregados del anterior. La idempotencia del worker
 * (`idempotency-key = keccak(txHash, logIndex)`, T1.4) evita avisos duplicados.
 *
 * Función pura: la persistencia (SQLite) y el recálculo de agregados se conectan en T1.4.
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
