import { describe, expect, it } from "vitest";
import { decodeFunctionData, encodeFunctionData, toFunctionSelector } from "viem";
import { buildPurchaseTxData, verifyPurchaseTx } from "@hotel/shared/domain";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { verifiedTxRequest } from "./verifiedTxRequest";

/**
 * Test **byte a byte** del calldata (D-07): la revisión construye el calldata, lo re-verifica
 * contra el precio on-chain y la firma envía ESE MISMO objeto. No se recalcula nada entre
 * revisar y firmar, así que no puede haber divergencia entre lo que el usuario aprueba y lo que
 * llega a la cadena — que es exactamente lo que ocurría antes (se revisaba `HotelNights` y se
 * firmaba el marketplace legacy).
 *
 * Hallazgo de la verificación adversarial de M4 que este fichero cubre explícitamente: el
 * `buy(uint256)` de la generación legacy tenía **el mismo selector** que el canónico, así que su
 * calldata era byte a byte idéntico al válido (se comprueba abajo con esa firma escrita a mano).
 * Lo que separa ambos destinos es **la dirección**, y por eso el firmante la valida: sin esa
 * comprobación, el "byte a byte" no distinguiría el contrato equivocado.
 *
 * La generación legacy `HotelNFT`/`HotelMarketplace` **ya no existe** en el repositorio (M9): el
 * calldata legacy se reconstruye aquí desde su firma, sin importar ningún ABI retirado.
 */

/** `buy(uint256)` tal y como lo declaraba el marketplace legacy: la firma, no su ABI retirado. */
const LEGACY_BUY_SIGNATURE = [
  {
    type: "function",
    name: "buy",
    stateMutability: "payable",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [],
  },
] as const;

const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const OTHER = "0x1111111111111111111111111111111111111111";
const CHAIN_ID = 81234;
const TOKEN = 10220260615n;
const PRICE = 50_000_000_000_000_000n; // 0,05 ETH

function build(saleType: "PRIMARY" | "SECONDARY") {
  return buildPurchaseTxData({
    tokenId: TOKEN,
    priceWei: PRICE,
    saleType,
    contractAddress: CONTRACT,
    chainId: CHAIN_ID,
  });
}

describe("verifiedTxRequest (D-07)", () => {
  it("PRIMARY envía byte a byte el calldata revisado, con el selector de buy(uint256)", () => {
    const tx = build("PRIMARY");
    const request = verifiedTxRequest(tx, CONTRACT);

    expect(request.data).toBe(tx.data); // identidad byte a byte, sin recodificar
    expect(request.to).toBe(tx.to);
    expect(request.value).toBe(PRICE);
    expect(request.data.startsWith(toFunctionSelector("buy(uint256)"))).toBe(true);
    // El mismo calldata que produciría una codificación independiente del ABI canónico.
    expect(request.data).toBe(
      encodeFunctionData({ abi: hotelNightsAbi, functionName: "buy", args: [TOKEN] }),
    );
  });

  it("SECONDARY envía byte a byte el calldata revisado, con el selector de buyResale(uint256)", () => {
    const tx = build("SECONDARY");
    const request = verifiedTxRequest(tx, CONTRACT);

    expect(request.data).toBe(tx.data);
    expect(request.value).toBe(PRICE);
    expect(request.data.startsWith(toFunctionSelector("buyResale(uint256)"))).toBe(true);
    expect(decodeFunctionData({ abi: hotelNightsAbi, data: request.data })).toEqual({
      functionName: "buyResale",
      args: [TOKEN],
    });
  });

  it("lo que se firma decodifica al tokenId exacto que se le mostró al usuario", () => {
    const request = verifiedTxRequest(build("PRIMARY"), CONTRACT);
    const decoded = decodeFunctionData({ abi: hotelNightsAbi, data: request.data });

    expect(decoded.functionName).toBe("buy");
    expect(decoded.args).toEqual([TOKEN]);
  });

  it("el objeto firmado es el mismo que la re-verificación aprobó (revisar == firmar)", () => {
    const tx = build("SECONDARY");
    const verification = verifyPurchaseTx({
      tx,
      expectedTokenId: TOKEN,
      expectedPriceWei: PRICE,
      expectedContract: CONTRACT,
      expectedChainId: CHAIN_ID,
    });
    expect(verification).toEqual({ ok: true, reasons: [] });

    // Y solo se firma el objeto verificado: mismo `data`, mismo `to`, mismo `value`.
    const request = verifiedTxRequest(tx, CONTRACT);
    expect({ to: request.to, data: request.data, value: request.value.toString() }).toEqual({
      to: tx.to,
      data: tx.data,
      value: tx.value,
    });
  });

  it("falla en cerrado si el calldata no es una compra (nunca se firma otra cosa)", () => {
    const claim = encodeFunctionData({ abi: hotelNightsAbi, functionName: "claim" });

    expect(() =>
      verifiedTxRequest({ to: CONTRACT, data: claim, value: "0", chainId: CHAIN_ID }, CONTRACT),
    ).toThrow();
  });

  it("no acepta un value no numérico (falla en cerrado en vez de enviar 0)", () => {
    const tx = { ...build("PRIMARY"), value: "0,05 ETH" };

    expect(() => verifiedTxRequest(tx, CONTRACT)).toThrow();
  });

  /**
   * El discriminador entre destinos es la DIRECCIÓN: el calldata legacy de `buy(uint256)` es
   * idéntico al canónico, así que un `to` equivocado pasaría cualquier comprobación de bytes.
   */
  it("rechaza un destino que no sea el contrato canónico, aunque el calldata sea válido", () => {
    const tx = build("PRIMARY");

    expect(() => verifiedTxRequest({ ...tx, to: OTHER }, CONTRACT)).toThrow();
    // Y también si el contrato esperado es otro (p. ej. el destino de la generación legacy).
    expect(() => verifiedTxRequest(tx, OTHER)).toThrow();
  });

  it("documenta el hallazgo: el calldata legacy de buy(uint256) es idéntico byte a byte", () => {
    const canonical = build("PRIMARY").data;
    const legacy = encodeFunctionData({
      abi: LEGACY_BUY_SIGNATURE,
      functionName: "buy",
      args: [TOKEN],
    });

    // Mismo selector `buy(uint256)` ⇒ mismos bytes: por eso el test byte a byte NO basta para
    // distinguir generaciones y el destino se valida en `verifiedTxRequest`.
    expect(legacy).toBe(canonical);
    expect(() => verifiedTxRequest({ ...build("PRIMARY"), data: legacy }, CONTRACT)).not.toThrow();
  });
});
