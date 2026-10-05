import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type * as SharedModule from "@hotel/shared";

const { mockRooms } = vi.hoisted(() => ({
  mockRooms: { listCoverImagesByRoomNumbers: vi.fn() },
}));

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedModule>();
  return { ...actual, RoomsRepository: vi.fn(() => mockRooms) };
});

import { GET } from "./route";

const get = (query: string): NextRequest => new NextRequest(`http://localhost/api/public/rooms/covers${query}`);

/**
 * «Mis noches» descubre las noches **on-chain** (solo el número de habitación) y la foto vive en el
 * maestro off-chain: esta ruta resuelve ese salto. El test fija lo que importa: que devuelve la
 * portada de cada número pedido, que deduplica, que no rompe la página si el maestro falla y que no
 * acepta basura como número de habitación.
 */
describe("API pública de portadas por habitación (Mis noches, 2026-10-05)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRooms.listCoverImagesByRoomNumbers.mockResolvedValue(
      new Map([
        [101, { roomNumber: 101, fileName: "101-Doble-2026-10-05-1.jpg", altTextEs: "Hab 101", altTextEn: null, altTextRu: null }],
      ]),
    );
  });

  it("devuelve la URL de la portada de cada habitación pedida", async () => {
    const res = await GET(get("?numbers=101"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { covers: Record<string, { url: string; alt: string | null }> };
    expect(body.covers["101"]?.url).toBe("/api/rooms/images/101-Doble-2026-10-05-1.jpg");
    expect(body.covers["101"]?.alt).toBe("Hab 101");
    expect(mockRooms.listCoverImagesByRoomNumbers).toHaveBeenCalledWith([101]);
  });

  it("deduplica los números y descarta los que no son válidos", async () => {
    await GET(get("?numbers=101,101,abc,-5,0,305"));
    expect(mockRooms.listCoverImagesByRoomNumbers).toHaveBeenCalledWith([101, 305]);
  });

  it("sin números válidos no consulta el maestro", async () => {
    const res = await GET(get("?numbers=abc"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ covers: {} });
    expect(mockRooms.listCoverImagesByRoomNumbers).not.toHaveBeenCalled();
  });

  it("falla en blando: si el maestro falla, la página del huésped no se rompe", async () => {
    mockRooms.listCoverImagesByRoomNumbers.mockRejectedValue(new Error("postgres caído"));
    const res = await GET(get("?numbers=101"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ covers: {} });
  });

  it("las habitaciones sin foto no aparecen (la tarjeta cae a su imagen de tipo)", async () => {
    mockRooms.listCoverImagesByRoomNumbers.mockResolvedValue(new Map());
    const res = await GET(get("?numbers=999"));
    expect((await res.json()).covers).toEqual({});
  });
});
