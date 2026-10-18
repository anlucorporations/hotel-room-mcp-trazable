/**
 * Relayer de anclaje a `HotelOperations` (vNext · F3 · T3.3).
 *
 * Es la única pieza que habla con la cadena para anclar una firma ya emitida por un jefe. Reproduce
 * el modelo de F2 (`packages/contracts/scripts/e2e/f2-operations.ts`): la **hot wallet del worker es
 * `msg.sender`** (paga gas) y **no tiene ningún rol**; la autoridad viaja en la firma EIP-712 y el
 * contrato recupera al firmante. Un relayer comprometido no puede fabricar acciones.
 *
 * Decisiones de diseño:
 *
 *   - **`entityId` derivado, nunca el UUID.** El identificador on-chain es
 *     `keccak256(actionType ‖ uuidToBytes16(entity_id))` (`documento_tecnico.md` §4.2.1), exactamente
 *     el mismo valor que la app firmó. Se recalcula con el helper compartido `entityIdOf` para que el
 *     worker no tenga una segunda implementación del encoding (una divergencia invalidaría la firma).
 *   - **`AREA_LOG` y `DAMAGE_CHARGE` no son anclables.** El contrato no declara función para ellos
 *     (D-C27, DT-AUD-16): se lanza `UnanchorableActionError` **sin enviar ninguna transacción**.
 *   - **`deadline` obligatorio.** No se firma ni se envía sin caducidad: sin `deadline` la ventana
 *     anti-replay es infinita y el contrato no tendría nada que comprobar.
 *   - **`isMined` con recibo `reverted` ⇒ `false`.** Un recibo revertido NO acredita la acción: la
 *     transacción revirtió y el `consumedNonce[signer][nonce]` del contrato se deshizo con ella. Por
 *     eso `isMined` responde "no minada" y el outbox reintenta el envío; devolver `true` marcaría
 *     `MINED` una acción que jamás se emitió (pérdida silenciosa de integridad). El nonce de
 *     *transacción* de la hot wallet sí se consumió, pero el reenvío usa uno nuevo y solo el nonce
 *     EIP-712 (que no se consumió al revertir) importa para el anti-replay. Se documenta y prueba en
 *     `anchor-relayer.test.ts`.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { CONFIRMATIONS_N, RPC_TIMEOUT_MS, entityIdOf } from "@hotel/shared";
import { hotelOperationsAbi } from "@hotel/shared/abi";

/** Fila de `on_chain_signatures` con lo mínimo que el relayer necesita para anclar. */
export interface AnchorableSignature {
  readonly id: string;
  /** Vocabulario de `on_chain_signatures.entity_type`. */
  readonly entityType: string;
  /** UUID off-chain (`on_chain_signatures.entity_id`); se deriva on-chain, no viaja en claro. */
  readonly entityId: string;
  /** = `payloadHash` firmado (`0x` + 64 hex). */
  readonly contentHash: string;
  /** Nonce EIP-712 de la firma (`0x` + 64 hex). `null` = fila mal formada: el relayer no la envía. */
  readonly nonce: string | null;
  readonly deadline: Date | null;
  readonly signature: string | null;
  readonly txHash: string | null;
  readonly signerAddress: string;
}

export interface AnchorRelayer {
  /** Envía la operación firmada al contrato y espera recibo; devuelve el txHash. */
  anchor(signature: AnchorableSignature): Promise<{ txHash: `0x${string}` }>;
  /** ¿Esa tx ya está minada? (recuperación tras reinicio: NO reenviar si ya está) */
  isMined(txHash: `0x${string}`): Promise<boolean>;
}

/**
 * La acción no tiene función de relay en `HotelOperations` (`AREA_LOG`, `DAMAGE_CHARGE`) o su
 * `entity_type` no pertenece al vocabulario. Es un fallo **terminal**: reintentarlo no lo arregla.
 */
export class UnanchorableActionError extends Error {
  readonly code = "UNANCHORABLE_ACTION" as const;

  constructor(entityType: string, detail?: string) {
    super(
      detail ?? `la acción ${entityType} no tiene función de relay en HotelOperations`,
    );
    this.name = "UnanchorableActionError";
  }
}

/**
 * Mapeo `entity_type` → función del contrato. El contrato declara las cinco funciones con los mismos
 * cinco parámetros `(bytes32 entityId, bytes32 payloadHash, bytes32 nonce, uint256 deadline, bytes
 * signature)`, así que el envío se unifica en una sola llamada.
 */
const ACTION_FUNCTIONS = {
  ROOM_BLOCK: "roomBlocked",
  ROOM_UNBLOCK: "roomUnblocked",
  PREVENTIVE_TASK: "preventiveTaskVerified",
  INSPECTION: "inspectionCertified",
  CONFIG: "configChanged",
} as const;

type AnchorableEntityType = keyof typeof ACTION_FUNCTIONS;
type AnchorFunctionName = (typeof ACTION_FUNCTIONS)[AnchorableEntityType];

/** Tipos reservados sin función de relay (D-C27, DT-AUD-16): no se envían, se marcan fallidos. */
const RESERVED_WITHOUT_FUNCTION: ReadonlySet<string> = new Set([
  "AREA_LOG",
  "DAMAGE_CHARGE",
]);

function functionForEntityType(entityType: string): AnchorFunctionName {
  if (Object.prototype.hasOwnProperty.call(ACTION_FUNCTIONS, entityType)) {
    return ACTION_FUNCTIONS[entityType as AnchorableEntityType];
  }
  if (RESERVED_WITHOUT_FUNCTION.has(entityType)) {
    throw new UnanchorableActionError(
      entityType,
      `la acción reservada ${entityType} no tiene función en HotelOperations (D-C27/DT-AUD-16); no se envía tx`,
    );
  }
  throw new UnanchorableActionError(
    entityType,
    `entity_type desconocido ${entityType}: no hay función de relay en HotelOperations`,
  );
}

export class ViemAnchorRelayer implements AnchorRelayer {
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient;
  private readonly account: PrivateKeyAccount;
  private readonly chain: Chain;
  private readonly contractAddress: `0x${string}`;
  private readonly confirmations: number;
  private readonly timeoutMs: number;

  constructor(options: {
    readonly rpcUrl: string;
    readonly contractAddress: `0x${string}`;
    readonly chain: Chain; // anvilChain/besuChain (de @hotel/shared)
    readonly privateKey: `0x${string}`; // hot wallet del relayer, SIN roles en HotelOperations
    readonly confirmations?: number; // por defecto 1 (CONFIRMATIONS_N)
    readonly timeoutMs?: number; // por defecto 5000 (RPC_TIMEOUT_MS)
  }) {
    this.timeoutMs = options.timeoutMs ?? RPC_TIMEOUT_MS;
    this.confirmations = options.confirmations ?? CONFIRMATIONS_N;
    this.chain = options.chain;
    this.contractAddress = options.contractAddress;
    this.account = privateKeyToAccount(options.privateKey);
    const transport = http(options.rpcUrl, { timeout: this.timeoutMs });
    this.publicClient = createPublicClient({ chain: options.chain, transport });
    this.walletClient = createWalletClient({
      account: this.account,
      chain: options.chain,
      transport,
    });
  }

  /**
   * Acota una llamada RPC al `timeoutMs` configurado aunque el transporte no lo respete (el nodo
   * puede aceptar la conexión y no responder): sin este techo, un RPC colgado bloquearía el lote.
   */
  private async withDeadline<T>(label: string, promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error(`${label}: timeout tras ${this.timeoutMs} ms`)),
            this.timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async anchor(signature: AnchorableSignature): Promise<{ txHash: `0x${string}` }> {
    const functionName = functionForEntityType(signature.entityType);

    if (signature.deadline === null) {
      throw new Error(
        `anchor: la firma ${signature.id} (${signature.entityType}) no tiene deadline; no se firma sin caducidad`,
      );
    }
    if (signature.signature === null || signature.signature.length === 0) {
      throw new Error(
        `anchor: la firma ${signature.id} (${signature.entityType}) no tiene signature; no se envía tx`,
      );
    }
    if (signature.nonce === null || signature.nonce.length === 0) {
      throw new Error(
        `anchor: la firma ${signature.id} (${signature.entityType}) no tiene nonce; el contrato no puede consumirlo`,
      );
    }

    // El UUID off-chain NO viaja: se deriva el mismo `entityId` que la app firmó (§4.2.1).
    const entityId = entityIdOf(
      signature.entityType as AnchorableEntityType,
      signature.entityId,
    );
    const payloadHash = signature.contentHash as Hex;
    const nonce = signature.nonce as Hex;
    const deadline = BigInt(Math.floor(signature.deadline.getTime() / 1000));

    const txHash = await this.withDeadline(
      "writeContract",
      this.walletClient.writeContract({
        address: this.contractAddress,
        abi: hotelOperationsAbi,
        functionName,
        args: [entityId, payloadHash, nonce, deadline, signature.signature as Hex],
        account: this.account,
        chain: this.chain,
      }),
    );

    const receipt = await this.withDeadline(
      "waitForTransactionReceipt",
      this.publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: this.confirmations,
      }),
    );
    if (receipt.status !== "success") {
      throw new Error(
        `anchor: la tx ${txHash} de ${signature.id} (${signature.entityType}) revirtió; no se ancla`,
      );
    }

    return { txHash };
  }

  async isMined(txHash: `0x${string}`): Promise<boolean> {
    let receipt: { status: "success" | "reverted" } | null;
    try {
      receipt = await this.withDeadline(
        "getTransactionReceipt",
        this.publicClient.getTransactionReceipt({ hash: txHash }),
      );
    } catch (error) {
      // "No existe recibo" = la tx no está minada (todavía). Se distingue por nombre para no
      // confundirlo con un timeout/error de RPC, que sí debe propagarse para contar como error.
      if (error instanceof Error && error.name === "TransactionReceiptNotFoundError") {
        return false;
      }
      throw error;
    }
    // `success` ⇒ anclada. `reverted` ⇒ NO anclada: la acción nunca se emitió y el nonce EIP-712
    // no quedó consumido (ver cabecera); el outbox reintentará el envío.
    return receipt.status === "success";
  }
}
