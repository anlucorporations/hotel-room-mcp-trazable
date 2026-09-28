import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";
import type { BurnLock, MintWindowOverview, MintWindowRoomStatus } from "@hotel/shared";
import {
  MINT_WINDOW_ALERT_KEY_PREFIX,
  RedisMintWindowAlertState,
  startMintWindowScheduler,
  type MintWindowAlertState,
} from "./mint-window-scheduler";

/** Pruebas del aviso de agotamiento de la ventana de acuñación (F8 · D-17). */

function roomStatus(overrides: Partial<MintWindowRoomStatus> = {}): MintWindowRoomStatus {
  return {
    roomId: "room-101",
    roomNumber: 101,
    roomType: "SIMPLE",
    basePriceWei: "100000000000000000",
    missing: 0,
    freeNights: 2,
    low: true,
    ...overrides,
  };
}

function overviewOf(rooms: MintWindowRoomStatus[]): MintWindowOverview {
  return {
    windowDays: 30,
    threshold: 7,
    totals: {
      rooms: rooms.length,
      missing: rooms.reduce((total, room) => total + room.missing, 0),
      low: rooms.filter((room) => room.low).length,
    },
    rooms,
  };
}

function makeLock(): BurnLock & { acquired: string[]; released: string[] } {
  const acquired: string[] = [];
  const released: string[] = [];
  return {
    acquired,
    released,
    acquire: vi.fn(async (key: string) => {
      acquired.push(key);
      return "token";
    }),
    release: vi.fn(async (key: string) => {
      released.push(key);
      return true;
    }),
  } as unknown as BurnLock & { acquired: string[]; released: string[] };
}

/** Estado de avisos en memoria: mismo contrato que el de Redis (`SET NX` + borrado). */
function makeAlerts(): MintWindowAlertState & { alerted: Set<number>; rearmed: number[] } {
  const alerted = new Set<number>();
  const rearmed: number[] = [];
  return {
    alerted,
    rearmed,
    claim: vi.fn(async (roomNumber: number) => {
      if (alerted.has(roomNumber)) return false;
      alerted.add(roomNumber);
      return true;
    }),
    rearm: vi.fn(async (roomNumber: number) => {
      alerted.delete(roomNumber);
      rearmed.push(roomNumber);
    }),
  } as unknown as MintWindowAlertState & { alerted: Set<number>; rearmed: number[] };
}

const logger = { debug: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn() } as unknown as Logger;
const signal = new AbortController().signal;

describe("startMintWindowScheduler (F8 · D-17)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("avisa de las habitaciones en agotamiento y rearma las que ya no lo están", async () => {
    const lock = makeLock();
    const alerts = makeAlerts();
    const notify = vi.fn(async () => undefined);
    const scheduler = startMintWindowScheduler({
      logger,
      signal,
      lock,
      alerts,
      skipInitialRun: true,
      notify,
      overview: async () =>
        overviewOf([
          roomStatus({ roomNumber: 101, freeNights: 2, low: true }),
          roomStatus({ roomNumber: 116, freeNights: 12, low: false }),
        ]),
    });

    expect(await scheduler.runOnce()).toBe(1);
    expect(notify).toHaveBeenCalledTimes(1);
    const [notifiedRooms] = notify.mock.calls[0] as unknown as [MintWindowRoomStatus[]];
    expect(notifiedRooms.map((room) => room.roomNumber)).toEqual([101]);
    expect(alerts.rearmed).toEqual([116]);
    // El cerrojo de pasada se libera siempre: la memoria del episodio es la marca por habitación.
    expect(lock.released).toEqual(lock.acquired);
    scheduler.stop();
  });

  it("no repite el correo mientras la habitación siga en agotamiento", async () => {
    const lock = makeLock();
    const alerts = makeAlerts();
    const notify = vi.fn(async () => undefined);
    const scheduler = startMintWindowScheduler({
      logger,
      signal,
      lock,
      alerts,
      skipInitialRun: true,
      notify,
      overview: async () => overviewOf([roomStatus()]),
    });

    expect(await scheduler.runOnce()).toBe(1);
    expect(await scheduler.runOnce()).toBe(0);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(alerts.alerted.has(101)).toBe(true);
    scheduler.stop();
  });

  it("al recuperarse vuelve a rearmar y avisa de nuevo en un episodio posterior", async () => {
    const lock = makeLock();
    const alerts = makeAlerts();
    const notify = vi.fn(async () => undefined);
    let status = overviewOf([roomStatus({ low: true, freeNights: 1 })]);
    const scheduler = startMintWindowScheduler({
      logger,
      signal,
      lock,
      alerts,
      skipInitialRun: true,
      notify,
      overview: async () => status,
    });

    expect(await scheduler.runOnce()).toBe(1);
    // Se amplía la ventana: deja de haber agotamiento y el aviso se rearma.
    status = overviewOf([roomStatus({ low: false, freeNights: 20, missing: 0 })]);
    expect(await scheduler.runOnce()).toBe(0);
    expect(alerts.rearmed).toContain(101);
    // Y vuelve a caer: es un episodio nuevo y se avisa otra vez.
    status = overviewOf([roomStatus({ low: true, freeNights: 1 })]);
    expect(await scheduler.runOnce()).toBe(1);
    expect(notify).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it("si el encolado falla, rearma lo reclamado para reintentarlo", async () => {
    const lock = makeLock();
    const alerts = makeAlerts();
    const notify = vi
      .fn<[], Promise<void>>()
      .mockRejectedValueOnce(new Error("SMTP caído"))
      .mockResolvedValueOnce(undefined);
    const scheduler = startMintWindowScheduler({
      logger,
      signal,
      lock,
      alerts,
      skipInitialRun: true,
      notify,
      overview: async () => overviewOf([roomStatus()]),
    });

    expect(await scheduler.runOnce()).toBeNull();
    expect(alerts.alerted.has(101)).toBe(false);
    // El reintento sí avisa.
    expect(await scheduler.runOnce()).toBe(1);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(lock.released).toEqual(lock.acquired);
    scheduler.stop();
  });

  it("si otra instancia está en la pasada, no calcula nada", async () => {
    const lock = { acquire: vi.fn(async () => null), release: vi.fn(async () => true) } as unknown as BurnLock;
    const overview = vi.fn(async () => overviewOf([roomStatus()]));
    const notify = vi.fn(async () => undefined);
    const scheduler = startMintWindowScheduler({
      logger,
      signal,
      lock,
      skipInitialRun: true,
      notify,
      overview,
    });

    expect(await scheduler.runOnce()).toBeNull();
    expect(overview).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it("si el cerrojo de pasada falla (Redis caído), no tumba el worker ni avisa a medias", async () => {
    const lock = {
      acquire: vi.fn(async () => {
        throw new Error("Redis caído");
      }),
      release: vi.fn(async () => true),
    } as unknown as BurnLock;
    const overview = vi.fn(async () => overviewOf([roomStatus()]));
    const notify = vi.fn(async () => undefined);
    const scheduler = startMintWindowScheduler({
      logger,
      signal,
      lock,
      alerts: makeAlerts(),
      skipInitialRun: true,
      notify,
      overview,
    });

    await expect(scheduler.runOnce()).resolves.toBeNull();
    expect(overview).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(lock.release).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it("sin agotamientos no envía correo y libera el cerrojo", async () => {
    const lock = makeLock();
    const notify = vi.fn(async () => undefined);
    const scheduler = startMintWindowScheduler({
      logger,
      signal,
      lock,
      alerts: makeAlerts(),
      skipInitialRun: true,
      notify,
      overview: async () => overviewOf([roomStatus({ low: false, freeNights: 30 })]),
    });

    expect(await scheduler.runOnce()).toBe(0);
    expect(notify).not.toHaveBeenCalled();
    expect(lock.released).toEqual(lock.acquired);
    scheduler.stop();
  });

  it("respeta la hora local del hotel para lanzar la pasada", async () => {
    const lock = makeLock();
    const notify = vi.fn(async () => undefined);
    // 06:00 UTC = 08:00 en Madrid (horario de verano): toca; a las 05:00 UTC (07:00) no.
    const early = startMintWindowScheduler({
      logger,
      signal,
      lock: makeLock(),
      alerts: makeAlerts(),
      notify,
      now: () => new Date("2026-07-01T05:00:00Z"),
      overview: async () => overviewOf([roomStatus()]),
    });
    expect(notify).not.toHaveBeenCalled();
    early.stop();

    const onTime = startMintWindowScheduler({
      logger,
      signal,
      lock,
      alerts: makeAlerts(),
      notify,
      now: () => new Date("2026-07-01T06:00:00Z"),
      overview: async () => overviewOf([roomStatus()]),
    });
    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    onTime.stop();
  });
});

describe("RedisMintWindowAlertState", () => {
  it("usa una clave por habitación con marca SET NX y borrado al rearmar", async () => {
    const set = vi.fn(async () => "OK" as const);
    const del = vi.fn(async () => 1);
    const state = new RedisMintWindowAlertState(7, () => ({ set, del }));

    await expect(state.claim(101)).resolves.toBe(true);
    expect(set).toHaveBeenCalledWith(
      `${MINT_WINDOW_ALERT_KEY_PREFIX}101`,
      expect.any(String),
      "EX",
      7 * 86_400,
      "NX",
    );

    // Con la marca ya puesta, Redis devuelve `null` y el aviso NO se repite.
    set.mockResolvedValueOnce(null);
    await expect(state.claim(101)).resolves.toBe(false);

    await state.rearm(101);
    expect(del).toHaveBeenCalledWith(`${MINT_WINDOW_ALERT_KEY_PREFIX}101`);
  });
});
