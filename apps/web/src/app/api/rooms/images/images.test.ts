import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));

import { readFile } from "node:fs/promises";
import { GET } from "./[file]/route";

const params = (file: string) => ({ params: Promise.resolve({ file }) });

describe("GET /api/rooms/images/[file] (F1 · D-5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ROOM_IMAGES_DIR = "/tmp/room-images-test";
  });

  it("rechaza un nombre que no cumple el patrón canónico", async () => {
    const res = await GET(new NextRequest("http://localhost/api/rooms/images/x"), params("../../etc/passwd"));
    expect(res.status).toBe(400);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("devuelve 404 si el fichero no existe", async () => {
    vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT"));
    const res = await GET(new NextRequest("http://localhost/api/rooms/images/x"), params("101-Doble-2026-09-26-1.jpg"));
    expect(res.status).toBe(404);
  });

  it("sirve la imagen con tipo JPEG y caché inmutable", async () => {
    vi.mocked(readFile).mockResolvedValueOnce(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    const res = await GET(new NextRequest("http://localhost/api/rooms/images/x"), params("101-Doble-2026-09-26-1.jpg"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Cache-Control")).toContain("immutable");
  });
});
