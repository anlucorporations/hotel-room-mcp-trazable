import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type { PublicClient, WalletClient } from "viem";
import {
  CheckInError,
  ReceptionService,
  type CheckInLock,
  type ReceptionConfig,
  type TicketUseStore,
} from "./service";
import { createTicketJWS } from "../passes/jws";
import type { NFTsRepository } from "../db/repositories/nfts.repository";
import type { NotificationQueueService } from "../queue/notifications";

/**
 * Check-in de recepción (US-14, D-05, D-13).
 *
 * Lo que estas pruebas defienden, y que el estado auditado no cumplía:
 *   1. el check-in **se ancla on-chain** o no ocurre (antes se instanciaba sin clientes y se
 *      devolvía éxito con `onChainTxDispatched: false`, sin marcar nada en la cadena);
 *   2. el resguardo es **de un solo uso**: el mismo QR dos veces → el segundo rechazado;
 *   3. el ancla usa el contrato **canónico** (`HotelNights`), no la generación legacy;
 *   4. la contingencia **no admite PII** (nada de DNI ni nombre por el mostrador).
 */

/** Consumo de un solo uso en memoria (mismo contrato que el de Redis en producción). */
class InMemoryTicketUseStore implements TicketUseStore {
  readonly used = new Set<string>();
  consumeCalls = 0;
  releaseCalls = 0;

  async consume(jti: string): Promise<boolean> {
    this.consumeCalls += 1;
    if (this.used.has(jti)) return false;
    this.used.add(jti);
    return true;
  }

  async release(jti: string): Promise<void> {
    this.releaseCalls += 1;
    this.used.delete(jti);
  }
}

/** Cerrojo por noche en memoria (mismo contrato que el de Redis en producción). */
class InMemoryCheckInLock implements CheckInLock {
  private readonly held = new Map<string, string>();
  acquireCalls = 0;

  async acquire(tokenId: string): Promise<string | null> {
    this.acquireCalls += 1;
    if (this.held.has(tokenId)) return null;
    const value = `lock-${this.acquireCalls}`;
    this.held.set(tokenId, value);
    return value;
  }

  async release(tokenId: string, lockValue: string): Promise<void> {
    if (this.held.get(tokenId) === lockValue) this.held.delete(tokenId);
  }
}

const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const OTHER = "0x1111111111111111111111111111111111111111";
const RECEPTION = "0x90F79bf6EB2c4f870365E785982E1F101E93b906";

function ticket(overrides: Partial<Record<string, unknown>> = {}) {
  return createTicketJWS({
    tokenId: "10120260720",
    roomNumber: 101,
    checkInDate: "2026-07-20",
    roomType: "SIMPLE",
    guestWallet: OWNER,
    issuedAt: Math.floor(Date.now() / 1000),
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  });
}

function nftRecord(overrides: Record<string, unknown> = {}) {
  return {
    tokenId: "10120260720",
    roomNumber: 101,
    roomType: "SIMPLE",
    checkInDate: "2026-07-20",
    status: "SOLD",
    currentOwner: OWNER,
    ...overrides,
  };
}

/** Dobles parciales: solo los métodos que ejercita esta suite. */
type MockNftsRepo = NFTsRepository & {
  getNFTById: Mock;
  markCheckedIn: Mock;
  findNFTByRoomAndDate: Mock;
  recordContingencyCheckIn: Mock;
};
type MockQueue = NotificationQueueService & { enqueueNotification: Mock };
type MockPublicClient = PublicClient & {
  getBalance: Mock;
  simulateContract: Mock;
  readContract: Mock;
};
/** `viem` tipa `account` como un `Account` real: el doble se afirma una vez al construirlo. */
type MockWalletClient = WalletClient & { writeContract: Mock };

describe("ReceptionService (US-14 · D-05)", () => {
  let mockNftsRepo: MockNftsRepo;
  let mockQueue: MockQueue;
  let mockPublicClient: MockPublicClient;
  let mockWalletClient: MockWalletClient;
  let ticketUse: InMemoryTicketUseStore;
  let checkInLock: InMemoryCheckInLock;
  let service: ReceptionService;

  function buildService(
    overrides: { wallet?: MockWalletClient | null; config?: Partial<ReceptionConfig> } = {},
  ) {
    mockNftsRepo = {
      getNFTById: vi.fn().mockImplementation(async (tokenId: string) => {
        if (tokenId === "10120260720") return nftRecord();
        if (tokenId === "20220260720") return nftRecord({ tokenId: "20220260720", roomNumber: 202 });
        // Noche ya consumida y noche revendida: `tokenId` NUMÉRICO (el resguardo solo identifica
        // noches reales; los rótulos de texto se rechazan como resguardo inválido).
        if (tokenId === "10220260720") {
          return nftRecord({ tokenId: "10220260720", roomNumber: 102, status: "CHECKED_IN" });
        }
        if (tokenId === "10320260720") {
          return nftRecord({ tokenId: "10320260720", roomNumber: 103, currentOwner: OTHER });
        }
        return null;
      }),
      markCheckedIn: vi.fn().mockResolvedValue(true),
      findNFTByRoomAndDate: vi.fn().mockImplementation(async (room: number) => {
        if (room === 101) return nftRecord();
        return null;
      }),
      recordContingencyCheckIn: vi.fn().mockResolvedValue(undefined),
    } as MockNftsRepo;

    mockQueue = { enqueueNotification: vi.fn().mockResolvedValue("alert_id_123") } as MockQueue;
    mockPublicClient = {
      getBalance: vi.fn().mockResolvedValue(10_000_000_000_000_000_000n), // 10 nativo
      // Simulación previa al envío: es la que detecta los reverts (AlreadyCheckedIn, NightNotSold)
      // antes de difundir una transacción firmada que revertiría.
      simulateContract: vi.fn().mockResolvedValue({ request: {} }),
      // Titularidad on-chain (M7 · H3): por defecto la cadena dice lo MISMO que el índice, y cada
      // prueba que quiera simular desincronización lo sobreescribe.
      readContract: vi.fn().mockImplementation(async (call: { functionName?: string; args?: unknown[] }) => {
        if (call.functionName !== "ownerOf") throw new Error(`lectura no esperada: ${call.functionName}`);
        const record = await mockNftsRepo.getNFTById(String(call.args?.[0]));
        if (record === null) {
          throw Object.assign(new Error("execution reverted"), {
            data: { errorName: "ERC721NonexistentToken" },
          });
        }
        return record.currentOwner;
      }),
    } as MockPublicClient;
    mockWalletClient =
      overrides.wallet !== undefined
        ? // `wallet: null` es un caso de prueba explícito (servicio sin hot-wallet): el doble se
          // declara no nulo para poder espiar `writeContract` en el resto de la suite.
          (overrides.wallet as MockWalletClient)
        : ({
            account: { address: RECEPTION },
            chain: { id: 81234 },
            writeContract: vi.fn().mockResolvedValue("0xanchorcheckinhash"),
          } as unknown as MockWalletClient);
    ticketUse = new InMemoryTicketUseStore();
    checkInLock = new InMemoryCheckInLock();

    service = new ReceptionService(
      mockNftsRepo,
      mockQueue,
      mockPublicClient,
      mockWalletClient,
      {
        nftContractAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        receptionWalletAddress: RECEPTION,
        minBalanceNative: 5,
        devopsEmail: "devops@marinadelsol.es",
        ...overrides.config,
      },
      ticketUse,
      checkInLock,
    );
    return service;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    buildService();
  });

  describe("check-in por resguardo (QR/JWS)", () => {
    it("ancla on-chain y marca la base, devolviendo el hash del ancla", async () => {
      const result = await service.processTicketCheckIn(await ticket());

      expect(result.status).toBe("CHECKED_IN");
      expect(result.tokenId).toBe("10120260720");
      expect(result.roomNumber).toBe(101);
      expect(result.onChainAnchor).toBe("BROADCAST");
      expect(result.onChainTxHash).toBe("0xanchorcheckinhash");

      // El ancla se firma contra el contrato CANÓNICO y con el ABI canónico.
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
          functionName: "markCheckedIn",
          args: [10120260720n],
        }),
      );
      expect(mockNftsRepo.markCheckedIn).toHaveBeenCalledWith("10120260720");
    });

    it("el MISMO resguardo dos veces: el segundo check-in se rechaza (uso único)", async () => {
      const same = await ticket();

      await service.processTicketCheckIn(same);
      await expect(service.processTicketCheckIn(same)).rejects.toMatchObject({
        code: "TICKET_YA_USADO",
      });

      // Solo se ancló una vez: el segundo intento ni siquiera llega a la cadena.
      expect(mockWalletClient.writeContract).toHaveBeenCalledTimes(1);
      expect(mockNftsRepo.markCheckedIn).toHaveBeenCalledTimes(1);
    });

    it("reutilizar un resguardo con `jti` ya consumido se rechaza aunque el token siga libre", async () => {
      const first = await ticket({ jti: "jti-fijo" });
      const replay = await ticket({ jti: "jti-fijo" });

      await service.processTicketCheckIn(first);
      await expect(service.processTicketCheckIn(replay)).rejects.toMatchObject({
        code: "TICKET_YA_USADO",
      });
    });

    it("rechaza si la habitación ya realizó check-in", async () => {
      await expect(
        service.processTicketCheckIn(await ticket({ tokenId: "10220260720", roomNumber: 102 })),
      ).rejects.toMatchObject({ code: "YA_CONSUMIDA" });
    });

    it("rechaza un resguardo emitido a un propietario anterior (noche revendida)", async () => {
      await expect(
        service.processTicketCheckIn(await ticket({ tokenId: "10320260720", roomNumber: 103 })),
      ).rejects.toMatchObject({ code: "TITULARIDAD_CAMBIADA" });
    });

    it("rechaza un resguardo cuyo identificador de noche no es un entero (resguardo inválido)", async () => {
      await expect(
        service.processTicketCheckIn(await ticket({ tokenId: "resold" })),
      ).rejects.toMatchObject({ code: "TICKET_INVALIDO" });
      expect(mockWalletClient.writeContract).not.toHaveBeenCalled();
    });

    /**
     * M7 · H3: la autoridad de la titularidad en el CANJE es la cadena. El índice puede ir
     * retrasado (poll de 4 s, sin cota si el listener se atasca) y el contrato no comprueba
     * propiedad en `markCheckedIn`, así que un pase del dueño anterior canjearía una noche ya
     * revendida si se creyera al índice.
     */
    it("con el ÍNDICE retrasado manda la cadena: el pase del dueño anterior no canjea", async () => {
      const resold = nftRecord({ tokenId: "10320260720", roomNumber: 103, currentOwner: OWNER });
      mockNftsRepo.getNFTById.mockImplementation(async (tokenId: string) =>
        tokenId === "10320260720" ? resold : null,
      );
      // La cadena dice que el dueño actual es OTHER (el pase va a nombre de OWNER).
      mockPublicClient.readContract.mockResolvedValue(OTHER);

      await expect(
        service.processTicketCheckIn(
          await ticket({ tokenId: "10320260720", roomNumber: 103, guestWallet: OWNER }),
        ),
      ).rejects.toMatchObject({ code: "TITULARIDAD_CAMBIADA" });
      expect(mockWalletClient.writeContract).not.toHaveBeenCalled();

      // Y al revés: índice retrasado (dice OTHER) pero la cadena dice que la dueña es OWNER ⇒ se
      // permite el canje y se registra el desajuste del índice.
      const stale = nftRecord({ tokenId: "10320260720", roomNumber: 103, currentOwner: OTHER });
      mockNftsRepo.getNFTById.mockImplementation(async (tokenId: string) =>
        tokenId === "10320260720" ? stale : null,
      );
      mockPublicClient.readContract.mockResolvedValue(OWNER);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

      const result = await service.processTicketCheckIn(
        await ticket({ tokenId: "10320260720", roomNumber: 103, guestWallet: OWNER }),
      );

      expect(result.status).toBe("CHECKED_IN");
      expect(warn.mock.calls.flat().join(" ")).toContain("INDEX_OUT_OF_SYNC");
      warn.mockRestore();
    });

    it("si la cadena no se puede consultar, el canje no se autoriza (TITULARIDAD_NO_VERIFICABLE)", async () => {
      mockPublicClient.readContract.mockRejectedValue(new Error("connect ECONNREFUSED"));

      await expect(
        service.processTicketCheckIn(await ticket({ jti: "jti-sin-rpc" })),
      ).rejects.toMatchObject({ code: "TITULARIDAD_NO_VERIFICABLE" });
      expect(mockWalletClient.writeContract).not.toHaveBeenCalled();
      // El pase no se le gasta al huésped: se libera para reintentar.
      expect(ticketUse.releaseCalls).toBe(1);
    });

    it("si la cadena dice que la noche no existe (quemada), se rechaza con TOKEN_QUEMADO", async () => {
      mockPublicClient.readContract.mockRejectedValue(
        Object.assign(new Error("execution reverted"), {
          data: { errorName: "ERC721NonexistentToken" },
        }),
      );

      await expect(service.processTicketCheckIn(await ticket())).rejects.toMatchObject({
        code: "TOKEN_QUEMADO",
      });
    });

    it("con el contrato en pausa el fallo se diagnostica como pausa, no como anclaje roto", async () => {
      mockPublicClient.simulateContract.mockRejectedValue(
        Object.assign(new Error("execution reverted"), { data: { errorName: "EnforcedPause" } }),
      );

      const error = await service.processTicketCheckIn(await ticket()).catch((e: unknown) => e);
      expect(error).toMatchObject({ code: "CONTRATO_EN_PAUSA" });
      expect((error as Error).message).toContain("pausa");
    });

    it("sin wallet configurada el check-in FALLA y no marca la base (ancla obligatoria)", async () => {
      buildService({ wallet: null });

      await expect(service.processTicketCheckIn(await ticket())).rejects.toMatchObject({
        code: "ANCLAJE_NO_CONFIGURADO",
      });
      expect(mockNftsRepo.markCheckedIn).not.toHaveBeenCalled();
    });

    it("si el ancla falla por RPC, el resguardo del huésped se libera para reintentar", async () => {
      mockPublicClient.simulateContract.mockRejectedValue(new Error("RPC timeout"));

      await expect(service.processTicketCheckIn(await ticket({ jti: "jti-retry" }))).rejects.toMatchObject(
        { code: "ANCLAJE_FALLIDO" },
      );
      expect(mockNftsRepo.markCheckedIn).not.toHaveBeenCalled();
      expect(ticketUse.releaseCalls).toBe(1);

      // El reintento con el mismo resguardo vuelve a funcionar (no se le gastó el pase).
      mockPublicClient.simulateContract.mockResolvedValue({ request: {} });
      const result = await service.processTicketCheckIn(await ticket({ jti: "jti-retry" }));
      expect(result.status).toBe("CHECKED_IN");
    });

    it("si la cadena dice AlreadyCheckedIn, reconcilia la base y responde YA_CONSUMIDA", async () => {
      const revert = Object.assign(new Error("execution reverted"), {
        data: { errorName: "AlreadyCheckedIn" },
      });
      mockPublicClient.simulateContract.mockRejectedValue(revert);

      await expect(service.processTicketCheckIn(await ticket())).rejects.toMatchObject({
        code: "YA_CONSUMIDA",
      });
      expect(mockNftsRepo.markCheckedIn).toHaveBeenCalledWith("10120260720");
      // No se llegó a difundir ninguna transacción, y el pase sí estaba gastado: no se libera.
      expect(mockWalletClient.writeContract).not.toHaveBeenCalled();
      expect(ticketUse.releaseCalls).toBe(0);
    });

    it("mapea NightNotSold (noche sin venta primaria, D-18) a un error claro", async () => {
      mockPublicClient.simulateContract.mockRejectedValue(
        Object.assign(new Error("reverted"), { data: { errorName: "NightNotSold" } }),
      );

      await expect(service.processTicketCheckIn(await ticket())).rejects.toMatchObject({
        code: "NOCHE_NO_VENDIDA",
      });
    });

    it("simula antes de difundir: un revert no llega a firmarse", async () => {
      mockPublicClient.simulateContract.mockRejectedValue(
        Object.assign(new Error("reverted"), { data: { errorName: "NightNotSold" } }),
      );

      await service.processTicketCheckIn(await ticket()).catch(() => undefined);

      expect(mockPublicClient.simulateContract).toHaveBeenCalled();
      expect(mockWalletClient.writeContract).not.toHaveBeenCalled();
    });

    it("serializa los anclajes: dos check-ins concurrentes no se solapan en la hot-wallet", async () => {
      const order: string[] = [];
      let inFlight = 0;
      mockWalletClient.writeContract.mockImplementation(async (args: { args: [bigint] }) => {
        inFlight += 1;
        expect(inFlight).toBe(1); // nunca dos anclajes a la vez (nonces secuenciales)
        order.push(`start-${args.args[0]}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push(`end-${args.args[0]}`);
        inFlight -= 1;
        return `0xanchor-${args.args[0]}`;
      });

      // Dos noches DISTINTAS (el cerrojo por noche es de cada token): lo que se prueba aquí es que
      // los dos anclajes de la MISMA hot-wallet no se pisan.
      await Promise.all([
        service.processTicketCheckIn(await ticket({ jti: "jti-a" })),
        service.processTicketCheckIn(
          await ticket({ jti: "jti-b", tokenId: "20220260720", roomNumber: 202 }),
        ),
      ]);

      expect(order).toHaveLength(4);
      expect(order[0]).toMatch(/^start-/);
      expect(order[1]).toBe(order[0]!.replace("start", "end"));
    });

    it("si otro puesto tiene el cerrojo de esa noche, el check-in devuelve CHECKIN_EN_PROCESO y no gasta el pase", async () => {
      const held = await checkInLock.acquire("10120260720");
      expect(held).not.toBeNull();

      const jws = await ticket({ jti: "jti-lock" });
      await expect(service.processTicketCheckIn(jws)).rejects.toMatchObject({
        code: "CHECKIN_EN_PROCESO",
      });
      expect(mockWalletClient.writeContract).not.toHaveBeenCalled();
      expect(mockNftsRepo.markCheckedIn).not.toHaveBeenCalled();

      // Al liberarse el cerrojo, el MISMO resguardo sirve: no se le gastó el pase al huésped.
      await checkInLock.release("10120260720", held!);
      const result = await service.processTicketCheckIn(jws);
      expect(result.status).toBe("CHECKED_IN");
    });

    it("la contingencia también respeta el cerrojo por noche", async () => {
      const held = await checkInLock.acquire("10120260720");
      expect(held).not.toBeNull();

      await expect(
        service.processContingencyCheckIn({
          roomNumber: 101,
          checkInDate: "2026-07-20",
          possessionProofType: "WALLET_ADDRESS",
          possessionProofValue: OWNER,
          reason: "SIN_DISPOSITIVO",
        }),
      ).rejects.toMatchObject({ code: "CHECKIN_EN_PROCESO" });
      expect(mockNftsRepo.recordContingencyCheckIn).not.toHaveBeenCalled();
    });

    it("emite alerta a DevOps si el saldo de la hot-wallet es bajo", async () => {
      mockPublicClient.getBalance.mockResolvedValue(3_000_000_000_000_000_000n); // 3 (< 5)

      await service.processTicketCheckIn(await ticket());

      expect(mockQueue.enqueueNotification).toHaveBeenCalledWith(
        "DEVOPS_ALERT",
        "devops@marinadelsol.es",
        expect.objectContaining({
          subject: expect.stringContaining("saldo bajo"),
          currentBalanceNative: 3,
        }),
      );
    });
  });

  describe("protocolo de contingencia (sin PII, D-13)", () => {
    it("acepta una dirección de wallet como prueba de posesión y ancla on-chain", async () => {
      const result = await service.processContingencyCheckIn({
        roomNumber: 101,
        checkInDate: "2026-07-20",
        possessionProofType: "WALLET_ADDRESS",
        possessionProofValue: OWNER,
        reason: "SIN_DISPOSITIVO",
      });

      expect(result.status).toBe("CHECKED_IN");
      expect(result.onChainTxHash).toBe("0xanchorcheckinhash");
      expect(mockNftsRepo.recordContingencyCheckIn).toHaveBeenCalledWith(
        "10120260720",
        expect.objectContaining({
          possessionProofType: "WALLET_ADDRESS",
          possessionProofValue: OWNER,
        }),
      );
    });

    it("acepta un hash de transacción y un código de resguardo del hotel", async () => {
      for (const [type, value] of [
        ["TX_HASH", `0x${"ab".repeat(32)}`],
        ["VOUCHER_CODE", "MDS-A1B2C3D4"],
      ] as const) {
        buildService();
        const result = await service.processContingencyCheckIn({
          roomNumber: 101,
          checkInDate: "2026-07-20",
          possessionProofType: type,
          possessionProofValue: value,
          reason: "SIN_DISPOSITIVO",
        });
        expect(result.status).toBe("CHECKED_IN");
      }
    });

    it("RECHAZA un DNI como prueba de posesión (no se admiten datos personales)", async () => {
      await expect(
        service.processContingencyCheckIn({
          roomNumber: 101,
          checkInDate: "2026-07-20",
          possessionProofType: "VOUCHER_CODE",
          possessionProofValue: "12345678Z",
          reason: "RESGUARDO_IMPRESO",
        }),
      ).rejects.toMatchObject({ code: "PRUEBA_POSESION_CON_PII" });
      expect(mockNftsRepo.markCheckedIn).not.toHaveBeenCalled();
    });

    it("RECHAZA el documento aunque se teclee con separadores o en minúsculas", async () => {
      // Un DNI con guion o espacios esquivaba la detección y se guardaba como «código de resguardo».
      for (const disguised of ["12345678-Z", "12345678 Z", "123.456.78z", "x1234567-l", "abc123456"]) {
        buildService();
        await expect(
          service.processContingencyCheckIn({
            roomNumber: 101,
            checkInDate: "2026-07-20",
            possessionProofType: "VOUCHER_CODE",
            possessionProofValue: disguised,
            reason: "SIN_DISPOSITIVO",
          }),
          `debe rechazar ${disguised}`,
        ).rejects.toMatchObject({ code: "PRUEBA_POSESION_CON_PII" });
      }
    });

    it("RECHAZA texto libre que no sea una prueba válida (p. ej. un nombre)", async () => {
      await expect(
        service.processContingencyCheckIn({
          roomNumber: 101,
          checkInDate: "2026-07-20",
          possessionProofType: "VOUCHER_CODE",
          possessionProofValue: "Juan Pérez García",
          reason: "SIN_DISPOSITIVO",
        }),
      ).rejects.toMatchObject({ code: "PRUEBA_POSESION_INVALIDA" });
    });

    it("RECHAZA como código de resguardo un nombre, un teléfono o un DNI sin letra (hallazgo de la verificación)", async () => {
      // El patrón laxo anterior (`[A-Za-z0-9-]{6,32}`) aceptaba y PERSISTÍA estos valores.
      for (const disguised of [
        "JuanPerezGarcia",
        "JUAN-PEREZ-GARCIA",
        "JUANPEREZ12345678Z",
        "12345678",
        "600123456",
      ]) {
        buildService();
        await expect(
          service.processContingencyCheckIn({
            roomNumber: 101,
            checkInDate: "2026-07-20",
            possessionProofType: "VOUCHER_CODE",
            possessionProofValue: disguised,
            reason: "SIN_DISPOSITIVO",
          }),
          `debe rechazar ${disguised}`,
        ).rejects.toBeInstanceOf(CheckInError);
      }
    });

    it("RECHAZA un motivo de contingencia de texto libre (vocabulario cerrado)", async () => {
      await expect(
        service.processContingencyCheckIn({
          roomNumber: 101,
          checkInDate: "2026-07-20",
          possessionProofType: "WALLET_ADDRESS",
          possessionProofValue: OWNER,
          reason: "DNI del huésped 12345678Z" as never,
        }),
      ).rejects.toMatchObject({ code: "MOTIVO_INVALIDO" });
      expect(mockNftsRepo.recordContingencyCheckIn).not.toHaveBeenCalled();
      expect(mockWalletClient.writeContract).not.toHaveBeenCalled();
    });

    it("rechaza una prueba vacía o con formato incorrecto para su tipo", async () => {
      await expect(
        service.processContingencyCheckIn({
          roomNumber: 101,
          checkInDate: "2026-07-20",
          possessionProofType: "WALLET_ADDRESS",
          possessionProofValue: "",
          reason: "SIN_DISPOSITIVO",
        }),
      ).rejects.toBeInstanceOf(CheckInError);

      await expect(
        service.processContingencyCheckIn({
          roomNumber: 101,
          checkInDate: "2026-07-20",
          possessionProofType: "TX_HASH",
          possessionProofValue: "0xabc",
          reason: "SIN_DISPOSITIVO",
        }),
      ).rejects.toMatchObject({ code: "PRUEBA_POSESION_INVALIDA" });
    });

    it("devuelve 404 de dominio si no hay reserva para habitación/fecha", async () => {
      await expect(
        service.processContingencyCheckIn({
          roomNumber: 999,
          checkInDate: "2026-07-20",
          possessionProofType: "WALLET_ADDRESS",
          possessionProofValue: OWNER,
          reason: "SIN_DISPOSITIVO",
        }),
      ).rejects.toMatchObject({ code: "RESERVA_NO_ENCONTRADA" });
    });
  });
});
