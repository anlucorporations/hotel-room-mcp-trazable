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
import { CONFIRMATIONS_N, RPC_TIMEOUT_MS } from "@hotel/shared";
import { hotelNightsAbi } from "@hotel/shared/abi";

/**
 * Relayer de **publicación con minteo on-chain** (2026-10-21, D-85).
 *
 * Es la pieza que habla con `HotelNights` cuando se publica una habitación desde el back-office
 * (flujo unitario y masivo). Sustituye a la wallet del navegador para que la publicación masiva
 * pueda completarse sin depender de que el operador tenga una wallet conectada.
 *
 * La hot wallet necesita **dos roles** on-chain:
 *   - `DEFAULT_ADMIN_ROLE` → `registerRoom` (registro dinámico, D-3/D-10) y `publishRoom` (anclaje
 *     de la huella de la ficha, D-2/D-18);
 *   - `MINTER_ROLE` → `mint` de la primera noche de la ventana (D-4/D-11).
 *
 * Decisiones:
 *   - **Besu usa gas legado** (`baseFee = 0`, exige `gasPrice >= 1000 wei`) y su `eth_estimateGas`
 *     puede revertir por reglas de fecha; se envía con `gasPrice` y `gas` fijos y se espera recibo.
 *   - Cada método devuelve el `txHash` real: el processor lo persiste para que la publicación quede
 *     anclada y la noche quede en `nfts` con su transacción verificable.
 *   - **Idempotencia**: `isRoomRegistered` y `hasNight` permiten reanudar sin duplicar si una
 *     ejecución anterior dejó parte del trabajo hecho (registro o publicación ya emitidos).
 */

/** Resultado del minteo de una noche. */
export interface MintedNight {
  readonly tokenId: string;
  readonly txHash: `0x${string}`;
  /** Dueño on-chain tras el minteo (tesorería del hotel, ADR-16). */
  readonly owner: string;
}

/**
 * Puerto de cadena que usa el processor (permite probar la lógica sin RPC).
 *
 * `null` en `registerRoom` significa «la habitación ya estaba registrada».
 */
export interface PublishMinter {
  isRoomRegistered(roomNumber: number): Promise<boolean>;
  registerRoom(roomNumber: number, roomType: string): Promise<`0x${string}`>;
  publishRoom(roomNumber: number, contentHash: `0x${string}`): Promise<`0x${string}`>;
  /** ¿La noche ya existe? (`ownerOf` no revierte). */
  hasNight(tokenId: string): Promise<boolean>;
  ownerOf(tokenId: string): Promise<string | null>;
  mintNight(input: {
    roomNumber: number;
    dateYYYYMMDD: number;
    priceWei: bigint;
    metadataURI: string;
  }): Promise<MintedNight>;
}

/** Implementación con viem de {@link PublishMinter}. */
export class ViemPublishMinter implements PublishMinter {
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient;
  private readonly account: PrivateKeyAccount;
  private readonly chain: Chain;
  private readonly contractAddress: `0x${string}`;
  private readonly confirmations: number;
  private readonly timeoutMs: number;
  private readonly gasPriceWei: bigint;
  private readonly gasLimit: bigint;

  constructor(options: {
    readonly rpcUrl: string;
    readonly contractAddress: `0x${string}`;
    readonly chain: Chain;
    /** Hot wallet con DEFAULT_ADMIN_ROLE + MINTER_ROLE. */
    readonly privateKey: `0x${string}`;
    readonly confirmations?: number;
    readonly timeoutMs?: number;
    readonly gasPriceWei?: bigint;
    readonly gasLimit?: bigint;
  }) {
    this.timeoutMs = options.timeoutMs ?? RPC_TIMEOUT_MS;
    this.confirmations = options.confirmations ?? CONFIRMATIONS_N;
    this.chain = options.chain;
    this.contractAddress = options.contractAddress;
    this.account = privateKeyToAccount(options.privateKey);
    this.gasPriceWei = options.gasPriceWei ?? 1_000n;
    this.gasLimit = options.gasLimit ?? 500_000n;
    const transport = http(options.rpcUrl, { timeout: this.timeoutMs });
    this.publicClient = createPublicClient({ chain: options.chain, transport });
    this.walletClient = createWalletClient({ account: this.account, chain: options.chain, transport });
  }

  /** Dirección de la hot wallet (para salud/logs; nunca la clave). */
  get address(): string {
    return this.account.address;
  }

  /** Acota una llamada RPC aunque el transporte no respete el timeout. */
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

  /** Envía la transacción con gas legado y espera recibo exitoso. */
  private async send(hashPromise: Promise<`0x${string}`>, label: string): Promise<`0x${string}`> {
    const txHash = await this.withDeadline(`${label}: envía`, hashPromise);
    const receipt = await this.withDeadline(
      `${label}: recibo`,
      this.publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: this.confirmations }),
    );
    if (receipt.status !== "success") {
      throw new Error(`${label}: la tx ${txHash} revirtió`);
    }
    return txHash;
  }

  async isRoomRegistered(roomNumber: number): Promise<boolean> {
    return this.withDeadline(
      "isRoomRegistered",
      this.publicClient.readContract({
        address: this.contractAddress,
        abi: hotelNightsAbi,
        functionName: "isRoomRegistered",
        args: [BigInt(roomNumber)],
      }) as Promise<boolean>,
    );
  }

  async registerRoom(roomNumber: number, roomType: string): Promise<`0x${string}`> {
    return this.send(
      this.walletClient.writeContract({
        address: this.contractAddress,
        abi: hotelNightsAbi,
        functionName: "registerRoom",
        args: [BigInt(roomNumber), roomType],
        account: this.account,
        chain: this.chain,
        gasPrice: this.gasPriceWei,
        gas: this.gasLimit,
      }),
      `registerRoom(${roomNumber})`,
    );
  }

  async publishRoom(roomNumber: number, contentHash: `0x${string}`): Promise<`0x${string}`> {
    return this.send(
      this.walletClient.writeContract({
        address: this.contractAddress,
        abi: hotelNightsAbi,
        functionName: "publishRoom",
        args: [BigInt(roomNumber), contentHash],
        account: this.account,
        chain: this.chain,
        gasPrice: this.gasPriceWei,
        gas: this.gasLimit,
      }),
      `publishRoom(${roomNumber})`,
    );
  }

  async hasNight(tokenId: string): Promise<boolean> {
    try {
      await this.withDeadline(
        "ownerOf",
        this.publicClient.readContract({
          address: this.contractAddress,
          abi: hotelNightsAbi,
          functionName: "ownerOf",
          args: [BigInt(tokenId)],
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async ownerOf(tokenId: string): Promise<string | null> {
    try {
      return (await this.withDeadline(
        "ownerOf",
        this.publicClient.readContract({
          address: this.contractAddress,
          abi: hotelNightsAbi,
          functionName: "ownerOf",
          args: [BigInt(tokenId)],
        }),
      )) as string;
    } catch {
      return null;
    }
  }

  async mintNight(input: {
    roomNumber: number;
    dateYYYYMMDD: number;
    priceWei: bigint;
    metadataURI: string;
  }): Promise<MintedNight> {
    const tokenId = (BigInt(input.roomNumber) * 100_000_000n + BigInt(input.dateYYYYMMDD)).toString();
    const txHash = await this.send(
      this.walletClient.writeContract({
        address: this.contractAddress,
        abi: hotelNightsAbi,
        functionName: "mint",
        args: [BigInt(input.roomNumber), BigInt(input.dateYYYYMMDD), input.priceWei, input.metadataURI],
        account: this.account,
        chain: this.chain,
        gasPrice: this.gasPriceWei,
        gas: this.gasLimit,
      }),
      `mint(${input.roomNumber}, ${input.dateYYYYMMDD})`,
    );
    const owner = await this.ownerOf(tokenId);
    if (!owner) throw new Error(`mint: la noche ${tokenId} no aparece on-chain tras el minteo`);
    return { tokenId, txHash, owner };
  }
}

/** Huella `0x` + 64 hex, o error explícito (evita `as` silenciosos). */
export function assertContentHash(value: string): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`contentHash inválido: "${value}"`);
  }
  return value as Hex;
}
