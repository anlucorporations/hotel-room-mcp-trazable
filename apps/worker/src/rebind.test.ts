import { describe, expect, it } from "vitest";
import { isCheckpointAheadOfChain, rebindCheckpoint, type WorkerCheckpoint } from "./rebind";

const OLD = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const NEW = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

describe("rebind del checkpoint (redeploy)", () => {
  it("reinicia el checkpoint al nuevo deploymentBlock cuando cambia la dirección", () => {
    const current: WorkerCheckpoint = { contractAddress: OLD, lastProcessedBlock: 1234 };
    const result = rebindCheckpoint(current, { address: NEW, deploymentBlock: 10 });

    expect(result.changed).toBe(true);
    expect(result.checkpoint.contractAddress).toBe(NEW.toLowerCase());
    expect(result.checkpoint.lastProcessedBlock).toBe(10);
  });

  it("conserva el checkpoint si la dirección no cambia (ignora mayúsculas)", () => {
    const current: WorkerCheckpoint = {
      contractAddress: OLD.toLowerCase(),
      lastProcessedBlock: 1234,
    };
    const result = rebindCheckpoint(current, { address: OLD, deploymentBlock: 1 });

    expect(result.changed).toBe(false);
    expect(result.checkpoint.lastProcessedBlock).toBe(1234);
  });

  it("inicializa desde cero si no había checkpoint previo", () => {
    const result = rebindCheckpoint(null, { address: NEW, deploymentBlock: 7 });
    expect(result.changed).toBe(true);
    expect(result.checkpoint.lastProcessedBlock).toBe(7);
  });
});

/**
 * Reinicio de la cadena con la MISMA dirección (caso real de M4): al reiniciar Anvil el contrato
 * determinista vuelve a la misma dirección, así que el rebind por redeploy no lo detecta y el
 * checkpoint de la cadena anterior queda por delante de la cabeza.
 */
describe("checkpoint por delante de la cadena (reinicio/reorg hacia atrás)", () => {
  it("detecta el checkpoint adelantado (worker mudo: lag negativo)", () => {
    expect(isCheckpointAheadOfChain(1890, 367n)).toBe(true);
  });

  it("no lo detecta cuando el checkpoint está a la par o por detrás", () => {
    expect(isCheckpointAheadOfChain(367, 367n)).toBe(false);
    expect(isCheckpointAheadOfChain(300, 367n)).toBe(false);
    expect(isCheckpointAheadOfChain(0, 0n)).toBe(false);
  });
});
