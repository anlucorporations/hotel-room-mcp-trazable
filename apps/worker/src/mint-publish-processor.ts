import type { Logger } from "pino";
import {
  UNANCHORED_TX_HASH,
  addDaysYYYYMMDD,
  buildNightMetadata,
  encodeTokenId,
  splitYYYYMMDD,
  todayYYYYMMDDUtc,
  type NightType,
} from "@hotel/shared";
import type {
  NFTsRepository,
  RoomMintJobRecord,
  RoomMintJobsRepository,
  RoomsRepository,
} from "@hotel/shared";
import { assertContentHash, type PublishMinter } from "./mint-publish-relayer";

/**
 * Procesador del outbox de **publicación con minteo on-chain** (2026-10-21, D-85).
 *
 * Por cada job `PENDING` de `room_mint_jobs`, en este orden:
 *
 *   1. revalida la ficha (no archivada, descripción ES, al menos una foto);
 *   2. registra la habitación en el contrato si falta (`registerRoom`, DEFAULT_ADMIN);
 *   3. ancla la huella de la ficha (`publishRoom`, DEFAULT_ADMIN);
 *   4. mintea la **primera noche** de la ventana (`mint`, MINTER), si no existe ya;
 *   5. **solo entonces** escribe la publicación off-chain y marca la habitación `PUBLISHED`.
 *
 * Si cualquier paso falla, el job queda `FAILED` con el motivo y la habitación **sigue en DRAFT**:
 * el responsable decidió (2026-10-21) que no se publique nada que no esté minteado on-chain.
 * Reintentar es volver a pulsar publicar; `registerRoom`/`publishRoom`/`mint` son idempotentes.
 */

export interface MintPublishProcessorOptions {
  readonly jobs: RoomMintJobsRepository;
  readonly rooms: RoomsRepository;
  readonly nfts: NFTsRepository;
  readonly minter: PublishMinter;
  readonly logger: Logger;
  /** Reloj inyectable para las pruebas (por defecto, `new Date()`). */
  readonly now?: () => Date;
}

/** Resultado de un ciclo: sin trabajo, completado o fallido. */
export type ProcessOutcome = "idle" | "done" | "failed";

/** Fecha ISO `AAAA-MM-DD` de un `AAAAMMDD`. */
function isoDate(yyyymmdd: number): string {
  const { year, month, day } = splitYYYYMMDD(yyyymmdd);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export class MintPublishProcessor {
  private readonly now: () => Date;

  constructor(private readonly options: MintPublishProcessorOptions) {
    this.now = options.now ?? (() => new Date());
  }

  /** Reclama y procesa un job. Devuelve `idle` si no había ninguno pendiente. */
  async runOnce(): Promise<ProcessOutcome> {
    const { jobs, logger } = this.options;
    const job = await jobs.claimNext();
    if (!job) return "idle";

    try {
      await this.process(job);
      return "done";
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.error({ roomId: job.roomId, jobId: job.id, error: reason }, "publicación con minteo: job FAILED");
      await jobs.fail(job.id, reason);
      return "failed";
    }
  }

  private async process(job: RoomMintJobRecord): Promise<void> {
    const { jobs, rooms, nfts, minter, logger } = this.options;
    const room = await rooms.findById(job.roomId);
    if (!room) throw new Error("la habitación del job no existe");
    if (room.archivedAt !== null) throw new Error("la habitación está archivada");

    // Revalidación de mínimos (defensa en profundidad: la API ya los exige al encolar).
    if (!room.descriptionEs || room.descriptionEs.trim().length === 0) {
      throw new Error("la ficha no tiene descripción en español (D-6/D-21)");
    }
    const images = await rooms.listImages(room.id);
    if (images.length === 0) throw new Error("la ficha no tiene ninguna foto (D-20)");
    if (!room.baseRateWei) throw new Error("la ficha no tiene tarifa base");

    const roomTypeDb = room.roomType.toLowerCase();
    const roomTypeNight = roomTypeDb as NightType;

    // 1) Registro dinámico (D-3/D-10): idempotente.
    const alreadyRegistered = await minter.isRoomRegistered(room.roomNumber);
    const registerTxHash = alreadyRegistered
      ? null
      : await minter.registerRoom(room.roomNumber, roomTypeDb);
    if (!alreadyRegistered) {
      logger.info({ roomNumber: room.roomNumber, txHash: registerTxHash }, "habitación registrada on-chain");
    }

    // 2) Anclaje de la huella de la ficha (D-2/D-18).
    const publishTxHash = await minter.publishRoom(room.roomNumber, assertContentHash(job.contentHash));

    // 3) Primera noche de la ventana global (D-4/D-11): mañana UTC.
    const dateYYYYMMDD = addDaysYYYYMMDD(todayYYYYMMDDUtc(this.now()), 1);
    const tokenId = encodeTokenId(room.roomNumber, dateYYYYMMDD).toString();
    let mintTxHash: string | null = null;
    let owner: string | null = null;
    if (await minter.hasNight(tokenId)) {
      // Idempotencia: si un intento anterior ya la minteó, no se repite.
      owner = await minter.ownerOf(tokenId);
    } else {
      const metadata = buildNightMetadata({
        room: room.roomNumber,
        dateYYYYMMDD,
        roomType: roomTypeNight,
      });
      const metadataURI = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(metadata))}`;
      const minted = await minter.mintNight({
        roomNumber: room.roomNumber,
        dateYYYYMMDD,
        priceWei: BigInt(room.baseRateWei),
        metadataURI,
      });
      mintTxHash = minted.txHash;
      owner = minted.owner;
      logger.info(
        { roomNumber: room.roomNumber, tokenId: minted.tokenId, txHash: minted.txHash },
        "primera noche minteada on-chain",
      );
    }

    // 4) Solo ahora se consolida la publicación off-chain (decisión «revertir si falla el minteo»).
    const publication = await rooms.recordPublication({
      roomId: room.id,
      contentHash: job.contentHash,
      txHash: publishTxHash,
      signature: job.signature,
      signerAddress: job.signerAddress,
      publishedBy: job.publishedBy,
    });
    const published = await rooms.setPublicationStatus(
      room.id,
      "PUBLISHED",
      job.publishedBy,
      "Publicada con minteo on-chain de la primera noche (D-85)",
    );
    if (!published) throw new Error("no se pudo marcar la habitación como PUBLISHED");

    // 5) Índice de la noche minteada. Si ya existía on-chain pero no en la BD (reintento tras un
    // fallo entre cadena y base), se deja PENDIENTE de anclaje y el listener la reconciliará.
    const existing = await nfts.findNFTByRoomAndDate(room.roomNumber, isoDate(dateYYYYMMDD));
    if (!existing) {
      await nfts.upsertNFT({
        tokenId,
        roomNumber: room.roomNumber,
        roomType: room.roomType,
        checkInDate: isoDate(dateYYYYMMDD),
        basePriceWei: room.baseRateWei,
        status: "AVAILABLE",
        currentOwner: owner ?? "",
        txHashMint: mintTxHash ?? UNANCHORED_TX_HASH,
        onChainAnchored: mintTxHash !== null,
        mintedAt: this.now(),
      });
    }

    await jobs.complete(job.id, {
      registerTxHash,
      publishTxHash,
      mintTxHash,
      tokenId,
    });
    logger.info(
      {
        roomNumber: room.roomNumber,
        publicationId: publication.id,
        registerTxHash,
        publishTxHash,
        mintTxHash,
      },
      "publicación completada: ficha anclada y primera noche minteada",
    );
  }
}
