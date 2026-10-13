import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Address } from "viem";
import { encodeTokenId, verifyPurchaseTx } from "@hotel/shared";
import type { ChainReader, MintRecord, NightSignals } from "../chain/chain-reader";
import { ToolError } from "./errors";
import {
  buildPurchaseTx,
  checkAvailability,
  getOwnedNights,
  listAvailableNights,
  prepareStayTx,
  searchHotelManuals,
  type ToolConfig,
} from "./tools";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address;
const CONFIG: ToolConfig = { contractAddress: CONTRACT, chainId: 81234 };

// Habitaciones del maestro: 102 simple, 116 doble, 203 suite.
const T_DISPONIBLE = encodeTokenId(102, 20260615); // simple, en ventana
const T_DOBLE = encodeTokenId(116, 20260620); // doble, en ventana
const T_LISTADA = encodeTokenId(203, 20260625); // suite, vendida y relistada
const T_FUERA = encodeTokenId(102, 20270101); // fuera de la ventana de 90 días
const T_EXPIRADA = encodeTokenId(110, 20260101); // pasada
const T_INEXISTENTE = encodeTokenId(199, 20260615);

const PRICE = 50_000_000_000_000_000n; // 0,05 ETH
const RESALE = 300_000_000_000_000_000n; // 0,30 ETH

const mint = (tokenId: bigint, room: number, date: number, price = PRICE): MintRecord => ({
  tokenId,
  room,
  dateYYYYMMDD: date,
  priceWei: price,
});

const NO_NIGHT: NightSignals = {
  exists: false,
  soldOnce: false,
  expired: false,
  listed: false,
  primaryPriceWei: 0n,
  listingPriceWei: 0n,
};
const disponible = (price = PRICE): NightSignals => ({ ...NO_NIGHT, exists: true, primaryPriceWei: price });
const listada = (price = RESALE): NightSignals => ({
  ...NO_NIGHT,
  exists: true,
  soldOnce: true,
  listed: true,
  listingPriceWei: price,
  primaryPriceWei: PRICE,
});
const expirada = (): NightSignals => ({ ...NO_NIGHT, exists: true, expired: true });

class FakeChainReader implements ChainReader {
  constructor(
    private readonly data: {
      mints?: MintRecord[];
      sold?: Set<string>;
      listed?: bigint[];
      purchased?: Map<string, bigint[]>;
      signals?: Map<string, NightSignals>;
      owners?: Map<string, string>;
    },
  ) {}
  getHeadBlock = async (): Promise<bigint> => 1000n;
  getMintRecords = async (): Promise<MintRecord[]> => this.data.mints ?? [];
  getSoldTokenIds = async (): Promise<Set<string>> => this.data.sold ?? new Set();
  getListedTokenIds = async (): Promise<bigint[]> => this.data.listed ?? [];
  getPurchasedTokenIds = async (w: Address): Promise<bigint[]> =>
    this.data.purchased?.get(w.toLowerCase()) ?? [];
  getNightSignals = async (id: bigint): Promise<NightSignals> =>
    this.data.signals?.get(id.toString()) ?? NO_NIGHT;
  isOwnedBy = async (id: bigint, w: Address): Promise<boolean> =>
    (this.data.owners?.get(id.toString()) ?? "") === w.toLowerCase();
}

describe("listAvailableNights (TC-MCP-008)", () => {
  const reader = new FakeChainReader({
    mints: [
      mint(T_DISPONIBLE, 102, 20260615),
      mint(T_DOBLE, 116, 20260620, 80_000_000_000_000_000n),
      mint(T_LISTADA, 203, 20260625, 150_000_000_000_000_000n),
      mint(T_FUERA, 102, 20270101),
    ],
    sold: new Set([T_LISTADA.toString()]),
    listed: [T_LISTADA],
    signals: new Map([[T_LISTADA.toString(), listada()]]),
  });

  it("devuelve DISPONIBLE + LISTADA en ventana y excluye vendidas/fuera de ventana", async () => {
    const nights = await listAvailableNights(reader, {});
    const ids = nights.map((n) => n.tokenId);
    expect(ids).toContain(T_DISPONIBLE.toString());
    expect(ids).toContain(T_DOBLE.toString());
    expect(ids).toContain(T_LISTADA.toString()); // re-aparece como reventa
    expect(ids).not.toContain(T_FUERA.toString()); // fuera de ventana
    const listadaNight = nights.find((n) => n.tokenId === T_LISTADA.toString());
    expect(listadaNight).toMatchObject({ saleType: "SECONDARY", priceWei: RESALE.toString() });
    expect(nights.map((n) => n.dateYYYYMMDD)).toEqual([...nights.map((n) => n.dateYYYYMMDD)].sort((a, b) => a - b));
  });

  it("respeta el filtro de tipo (alternativas del mismo tipo)", async () => {
    const simples = await listAvailableNights(reader, { type: "simple" });
    expect(simples).toHaveLength(1);
    expect(simples[0]!.tokenId).toBe(T_DISPONIBLE.toString());
  });

  it("respeta una ventana de fechas explícita", async () => {
    const nights = await listAvailableNights(reader, { window: { from: 20260616, to: 20260626 } });
    const ids = nights.map((n) => n.tokenId);
    expect(ids).not.toContain(T_DISPONIBLE.toString()); // 20260615 queda por debajo
    expect(ids).toContain(T_DOBLE.toString());
    expect(ids).toContain(T_LISTADA.toString());
  });

  it("excluye fechas pasadas aunque se pida un `from` anterior (no lista EXPIRADA)", async () => {
    const pastToken = encodeTokenId(101, 20200101);
    const pastReader = new FakeChainReader({ mints: [mint(pastToken, 101, 20200101)] });
    const nights = await listAvailableNights(pastReader, { window: { from: 20200101, to: 20991231 } });
    expect(nights.map((n) => n.tokenId)).not.toContain(pastToken.toString());
  });
});

describe("checkAvailability (TC-MCP-001/007)", () => {
  const reader = new FakeChainReader({
    signals: new Map([
      [T_DISPONIBLE.toString(), disponible()],
      [T_LISTADA.toString(), listada()],
      [T_EXPIRADA.toString(), expirada()],
    ]),
    mints: [mint(T_DISPONIBLE, 102, 20260615)],
  });

  it("noche DISPONIBLE: exists+available con precio primario", async () => {
    expect(await checkAvailability(reader, { room: 102, date: 20260615 })).toEqual({
      exists: true,
      available: true,
      tokenId: T_DISPONIBLE.toString(),
      priceWei: PRICE.toString(),
      saleType: "PRIMARY",
    });
  });

  it("noche LISTADA: available con precio de reventa", async () => {
    const r = await checkAvailability(reader, { room: 203, date: 20260625 });
    expect(r).toMatchObject({ exists: true, available: true, saleType: "SECONDARY", priceWei: RESALE.toString() });
  });

  it("noche expirada: existe pero no comprable", async () => {
    expect(await checkAvailability(reader, { room: 110, date: 20260101 })).toEqual({
      exists: true,
      available: false,
      tokenId: T_EXPIRADA.toString(),
    });
  });

  it("noche inexistente: exists=false y hay ≥1 alternativa del tipo (TC-MCP-007)", async () => {
    const r = await checkAvailability(reader, { room: 199, date: 20260615 });
    expect(r).toEqual({ exists: false, available: false });
    const alternativas = await listAvailableNights(reader, { type: "simple" });
    expect(alternativas.length).toBeGreaterThanOrEqual(1);
  });

  it("fecha de calendario inválida: exists=false sin romper", async () => {
    expect(await checkAvailability(reader, { room: 102, date: 20260230 })).toEqual({
      exists: false,
      available: false,
    });
  });
});

describe("getOwnedNights (TC-MCP-002)", () => {
  const WALLET = "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as Address;

  it("lista solo las noches cuya propiedad confirma ownerOf", async () => {
    const reader = new FakeChainReader({
      purchased: new Map([[WALLET.toLowerCase(), [T_DISPONIBLE, T_LISTADA]]]),
      owners: new Map([
        [T_DISPONIBLE.toString(), WALLET.toLowerCase()],
        [T_LISTADA.toString(), "0xother"], // revendida → ya no es suya
      ]),
    });
    const owned = await getOwnedNights(reader, { wallet: WALLET });
    expect(owned).toEqual([
      { tokenId: T_DISPONIBLE.toString(), room: 102, dateYYYYMMDD: 20260615, type: "simple" },
    ]);
  });
});

describe("buildPurchaseTx (TC-MCP-003/004)", () => {
  const reader = new FakeChainReader({
    signals: new Map([
      [T_DISPONIBLE.toString(), disponible()],
      [T_LISTADA.toString(), listada()],
      [T_EXPIRADA.toString(), expirada()],
    ]),
  });

  it("DISPONIBLE: tx buy verificable (to/value/chainId/selector), sin firma (TC-MCP-003)", async () => {
    const tx = await buildPurchaseTx(reader, CONFIG, { tokenId: T_DISPONIBLE.toString() });
    expect(tx).not.toHaveProperty("rawTx");
    expect(
      verifyPurchaseTx({
        tx,
        expectedTokenId: T_DISPONIBLE,
        expectedPriceWei: PRICE,
        expectedContract: CONTRACT,
        expectedChainId: 81234,
      }),
    ).toEqual({ ok: true, reasons: [] });
  });

  it("LISTADA: tx buyResale con el precio de reventa on-chain", async () => {
    const tx = await buildPurchaseTx(reader, CONFIG, { tokenId: T_LISTADA.toString() });
    expect(tx.value).toBe(RESALE.toString());
    expect(
      verifyPurchaseTx({
        tx,
        expectedTokenId: T_LISTADA,
        expectedPriceWei: RESALE,
        expectedContract: CONTRACT,
        expectedChainId: 81234,
      }).ok,
    ).toBe(true);
  });

  it("rechaza una noche no comprable (TC-MCP-004)", async () => {
    await expect(buildPurchaseTx(reader, CONFIG, { tokenId: T_EXPIRADA.toString() })).rejects.toBeInstanceOf(
      ToolError,
    );
  });

  it("rechaza una noche inexistente", async () => {
    await expect(
      buildPurchaseTx(reader, CONFIG, { tokenId: T_INEXISTENTE.toString() }),
    ).rejects.toMatchObject({ code: "NIGHT_NOT_FOUND" });
  });

  it("rechaza un tokenId no numérico con INVALID_INPUT", async () => {
    await expect(buildPurchaseTx(reader, CONFIG, { tokenId: "no-numerico" })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });
});

describe("searchHotelManuals (TC-MCP-009, H2)", () => {
  it("devuelve fragmentos con su fuente y su sección para poder citarla", () => {
    const hits = searchHotelManuals({ query: "cómo compro una noche" });

    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      expect(hit.doc).toBeTruthy();
      expect(hit.section).toBeTruthy();
      expect(hit.source).toMatch(/\.md$/);
      expect(hit.excerpt.length).toBeGreaterThan(0);
    }
  });

  it("por defecto solo devuelve contenido visible para el huésped", () => {
    // Consulta que solo está cubierta por el manual de recepción: con la audiencia por defecto no
    // puede aparecer.
    const hits = searchHotelManuals({ query: "pantalla de recepción y sus mensajes" });
    expect(hits.every((hit) => hit.doc !== "recepcion")).toBe(true);
  });

  it("respeta el límite pedido", () => {
    expect(searchHotelManuals({ query: "noche", limit: 1 }).length).toBeLessThanOrEqual(1);
  });
});

describe("prepareStayTx (TC-MCP-010) · reserva en rango de fechas", () => {
  const D1 = 20260615;
  const D2 = 20260616;
  const D3 = 20260617;
  const D4 = 20260618; // salida: la noche de salida NO se compra

  const t102 = (date: number): bigint => encodeTokenId(102, date);
  const t116 = (date: number): bigint => encodeTokenId(116, date);
  const DOBLE_PRICE = 80_000_000_000_000_000n;

  /** Estancia completa en la 102 (simple); en la 116 (doble) falta la tercera noche. */
  const stayReader = new FakeChainReader({
    mints: [
      mint(t102(D1), 102, D1),
      mint(t102(D2), 102, D2),
      mint(t102(D3), 102, D3),
      mint(t116(D1), 116, D1, DOBLE_PRICE),
      mint(t116(D2), 116, D2, DOBLE_PRICE),
    ],
    signals: new Map<string, NightSignals>([
      [t102(D1).toString(), disponible()],
      [t102(D2).toString(), disponible()],
      [t102(D3).toString(), disponible()],
      [t116(D1).toString(), disponible(DOBLE_PRICE)],
      [t116(D2).toString(), disponible(DOBLE_PRICE)],
    ]),
  });

  it("devuelve una tx sin firmar por noche, en la misma habitación, y el importe total", async () => {
    const plan = await prepareStayTx(stayReader, CONFIG, { room: 102, checkIn: D1, checkOut: D4 });

    expect(plan.room).toBe(102);
    expect(plan.checkIn).toBe(D1);
    expect(plan.checkOut).toBe(D4);
    expect(plan.nights.map((n) => n.dateYYYYMMDD)).toEqual([D1, D2, D3]);
    expect(plan.nights.map((n) => n.tokenId)).toEqual([
      t102(D1).toString(),
      t102(D2).toString(),
      t102(D3).toString(),
    ]);
    expect(plan.totalPriceWei).toBe((PRICE * 3n).toString());

    for (const night of plan.nights) {
      const check = verifyPurchaseTx({
        tx: night.tx,
        expectedTokenId: BigInt(night.tokenId),
        expectedPriceWei: PRICE,
        expectedContract: CONTRACT,
        expectedChainId: CONFIG.chainId,
      });
      expect(check.ok).toBe(true);
    }
  });

  it("checkOut es la fecha de salida: esa noche no entra en la estancia", async () => {
    const plan = await prepareStayTx(stayReader, CONFIG, { room: 102, checkIn: D1, checkOut: D3 });
    expect(plan.nights.map((n) => n.dateYYYYMMDD)).toEqual([D1, D2]);
  });

  it("es todo o nada: una noche no comprable no produce un plan parcial", async () => {
    await expect(
      prepareStayTx(stayReader, CONFIG, { room: 116, checkIn: D1, checkOut: D4 }),
    ).rejects.toMatchObject({ code: "STAY_NOT_AVAILABLE" });
  });

  it("sin habitación fija elige la primera con la estancia completa y respeta el tipo", async () => {
    const cualquiera = await prepareStayTx(stayReader, CONFIG, { checkIn: D1, checkOut: D4 });
    expect(cualquiera.room).toBe(102); // la 116 no completa las tres noches

    const doble = await prepareStayTx(stayReader, CONFIG, { type: "doble", checkIn: D1, checkOut: D3 });
    expect(doble.room).toBe(116);
    expect(doble.nights).toHaveLength(2);
    expect(doble.totalPriceWei).toBe((DOBLE_PRICE * 2n).toString());
  });

  it("rechaza una entrada ya pasada", async () => {
    await expect(
      prepareStayTx(stayReader, CONFIG, { room: 102, checkIn: 20260530, checkOut: 20260602 }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("rechaza una salida que no es posterior a la entrada y una fecha inexistente", async () => {
    await expect(
      prepareStayTx(stayReader, CONFIG, { room: 102, checkIn: D2, checkOut: D2 }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      prepareStayTx(stayReader, CONFIG, { room: 102, checkIn: 20260230, checkOut: 20260302 }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("acota la estancia a 14 noches", async () => {
    await expect(
      prepareStayTx(stayReader, CONFIG, { room: 102, checkIn: D1, checkOut: 20260701 }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});
