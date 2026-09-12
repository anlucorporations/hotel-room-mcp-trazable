import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as getWalletPass } from "./[tokenId]/route";

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hotel/shared")>();
  return {
    ...actual,
    NFTsRepository: vi.fn().mockImplementation(() => ({
      getNFTById: vi.fn().mockImplementation(async (tokenId: string) => {
        if (tokenId === "10120260720") {
          return {
            tokenId: "10120260720",
            roomNumber: 101,
            roomType: "SIMPLE",
            checkInDate: "2026-07-20",
            checkOutDate: "2026-07-21",
            basePriceWei: "50000000000000000",
            status: "SOLD",
            currentOwner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            txHashMint: "0xminttx",
          };
        }
        return null;
      }),
    })),
  };
});

describe("Digital Wallet Passes Endpoint (US-12)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("debe generar estructura de pase Apple Wallet (PassKit) por defecto", async () => {
    const req = new NextRequest("http://localhost:3000/api/wallet/pass/10120260720?type=apple");
    const res = await getWalletPass(req, {
      params: Promise.resolve({ tokenId: "10120260720" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.type).toBe("apple");
    expect(data.passData).toBeDefined();
    expect(data.passData.eventTicket.primaryFields[0].value).toBe("101");
    expect(data.passData.barcodes[0].message).toContain("/checkin#ticket=");
    expect(data.downloadUrl).toContain("download=true");
  });

  it("debe devolver binario .pkpass cuando download=true", async () => {
    const req = new NextRequest("http://localhost:3000/api/wallet/pass/10120260720?type=apple&download=true");
    const res = await getWalletPass(req, {
      params: Promise.resolve({ tokenId: "10120260720" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/vnd.apple.pkpass");
    expect(res.headers.get("Content-Disposition")).toContain("hotel_reserva_101.pkpass");
  });

  it("debe generar objeto y Save URL de Google Wallet cuando type=google", async () => {
    const req = new NextRequest("http://localhost:3000/api/wallet/pass/10120260720?type=google");
    const res = await getWalletPass(req, {
      params: Promise.resolve({ tokenId: "10120260720" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.type).toBe("google");
    expect(data.saveUrl).toContain("pay.google.com/gp/v/save/hotel_10120260720");
    expect(data.passObject.barcode.value).toContain("/checkin#ticket=");
    expect(data.passObject.state).toBe("ACTIVE");
  });

  it("debe devolver 404 si el token no existe", async () => {
    const req = new NextRequest("http://localhost:3000/api/wallet/pass/99999999");
    const res = await getWalletPass(req, {
      params: Promise.resolve({ tokenId: "99999999" }),
    });

    expect(res.status).toBe(404);
  });
});
