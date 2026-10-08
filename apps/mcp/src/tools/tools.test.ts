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
