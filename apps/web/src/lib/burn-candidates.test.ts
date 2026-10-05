import { describe, expect, it } from "vitest";
import { selectBurnCandidates } from "./burn-candidates";

/**
 * Guardián de la selección de candidatas a quema (CU-13).
 *
 * Defecto real del 2026-10-05: el panel de caducadas ofrecía noches **ya quemadas** y
 * `burnExpired` revertía con `ERC721NonexistentToken` (0x7e273289) al intentar quemarlas — con la
 * billetera del owner, que sí tiene `BURNER_ROLE`. La causa: `isExpired` en el contrato **solo mira
 * la fecha** del token, no si sigue existiendo.
 */
const mint = (tokenId: bigint, dateYYYYMMDD: bigint) => ({ tokenId, dateYYYYMMDD });

describe("selectBurnCandidates", () => {
  it("descarta las noches ya quemadas (el fallo que rompía la quema)", () => {
    const quemada = 10120260928n; // fecha pasada + ya quemada → `isExpired` sigue diciendo true
    const candidates = selectBurnCandidates([mint(quemada, 20260928n)], new Set(), new Set([quemada.toString()]));
    expect([...candidates.keys()]).toEqual([]);
  });

  it("descarta las vendidas alguna vez (son de clientes: AlreadySold)", () => {
    const vendida = 10120261027n;
    const candidates = selectBurnCandidates([mint(vendida, 20261027n)], new Set([vendida.toString()]), new Set());
    expect(candidates.size).toBe(0);
  });

  it("conserva las minteadas, no vendidas y no quemadas, con su fecha", () => {
    const candidates = selectBurnCandidates(
      [mint(10120261005n, 20261005n), mint(10220261006n, 20261006n)],
      new Set(["10220261006"]),
      new Set(),
    );
    expect([...candidates.entries()]).toEqual([["10120261005", 20261005]]);
  });

  it("no duplica si un token aparece en varios eventos", () => {
    const candidates = selectBurnCandidates([mint(1n, 20261005n), mint(1n, 20261005n)], new Set(), new Set());
    expect(candidates.size).toBe(1);
  });

  it("sin eventos devuelve un mapa vacío", () => {
    expect(selectBurnCandidates([], new Set(), new Set()).size).toBe(0);
  });
});
