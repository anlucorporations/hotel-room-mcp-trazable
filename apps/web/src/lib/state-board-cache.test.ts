import { describe, expect, it } from "vitest";
import { isCacheFresh } from "./state-board-cache";

describe("caché del tablero (A8 · RNF-M-05)", () => {
  const entry = { key: "2026-10-19", value: { at: 1_000 } };

  it("sirve la entrada vigente dentro del TTL y de la misma fecha", () => {
    expect(isCacheFresh(entry, "2026-10-19", 1_500, 1_000)).toBe(true);
    expect(isCacheFresh(entry, "2026-10-19", 2_000, 1_500)).toBe(true);
  });

  it("no sirve entradas caducadas ni de otra fecha o inexistentes", () => {
    expect(isCacheFresh(entry, "2026-10-19", 2_500, 1_000)).toBe(false);
    expect(isCacheFresh(entry, "2026-10-20", 1_500, 1_000)).toBe(false);
    expect(isCacheFresh(null, "2026-10-19", 1_500, 1_000)).toBe(false);
  });
});
