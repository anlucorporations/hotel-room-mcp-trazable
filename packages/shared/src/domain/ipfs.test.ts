import { describe, expect, it } from "vitest";
import {
  DEV_FALLBACK_GATEWAY,
  IMAGE_CIDS,
  buildNightMetadata,
  ipfsGatewayUrl,
  ipfsUri,
} from "./ipfs";

const CID = "bafkreialyiktnrmy3kvdjebdndkc4tynjw63ghx4pw7mg2hznz3jema2qy";

describe("ipfsUri", () => {
  it("construye un URI ipfs:// canónico", () => {
    expect(ipfsUri(CID)).toBe(`ipfs://${CID}`);
  });
});

describe("ipfsGatewayUrl (MINOR#31 / UX#31 — gateway configurable)", () => {
  it("usa el gateway/CDN propio cuando se le pasa (ADR-12: host/CDN)", () => {
    const gateway = "https://cdn.hotel.example/ipfs/";
    expect(ipfsGatewayUrl(CID, gateway)).toBe(`${gateway}${CID}`);
  });

  it("mantiene la firma compatible: sin gateway recurre al fallback de desarrollo", () => {
    // Compatibilidad hacia atrás: el segundo parámetro sigue siendo opcional.
    expect(ipfsGatewayUrl(CID)).toBe(`${DEV_FALLBACK_GATEWAY}${CID}`);
  });

  it("el fallback de desarrollo está marcado como ipfs.io (solo dev, no producción)", () => {
    expect(DEV_FALLBACK_GATEWAY).toBe("https://ipfs.io/ipfs/");
  });
});

describe("buildNightMetadata", () => {
  it("referencia la imagen por ipfs:// (no por gateway)", () => {
    const metadata = buildNightMetadata({
      room: 102,
      dateYYYYMMDD: 20_260_615,
      roomType: "simple",
    });
    expect(metadata.image).toBe(ipfsUri(IMAGE_CIDS.simple));
  });
});
