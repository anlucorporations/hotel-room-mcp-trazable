"use client";

import { useState } from "react";
import { useConfig } from "wagmi";
import { readContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { buildNightMetadata, toNightType } from "@hotel/shared/domain";
import { contractAddress } from "@/config/chain";

/**
 * Acuñado de la **ventana global** de una habitación (F8 · D-4/D-11/D-16/D-17).
 *
 * La ruta `GET /api/admin/rooms/[id]/mint-window` devuelve las noches que faltan; este hook las
 * firma en secuencia con la wallet del administrador (MINTER; la web nunca firma por el usuario,
 * ADR-11). Es **idempotente y reanudable**: antes de cada `mint` comprueba `ownerOf` y salta las que
 * ya existen; si se interrumpe, volver a ejecutarlo continúa donde quedó.
 */

export interface MintWindowNightDto {
  dateYYYYMMDD: number;
  tokenId: string;
  priceWei: string | null;
}

export interface MintWindowStatusDto {
  windowDays: number;
  missing: number;
  freeNights: number;
  low: boolean;
}

export interface MintWindowDto {
  roomId: string;
  roomNumber: number;
  roomType: string;
  windowDays: number;
  basePriceWei: string | null;
  canMint: boolean;
  nights: MintWindowNightDto[];
  status: MintWindowStatusDto;
}

export interface UseMintWindowResult {
  run: (roomId: string) => Promise<{ minted: number; skipped: number; status: MintWindowStatusDto }>;
  running: boolean;
  done: number;
  total: number;
  error: string | null;
  lastHash: `0x${string}` | undefined;
  reset: () => void;
}

export function useMintWindow(): UseMintWindowResult {
  const config = useConfig();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastHash, setLastHash] = useState<`0x${string}` | undefined>(undefined);

  function reset(): void {
    setDone(0);
    setTotal(0);
    setError(null);
    setLastHash(undefined);
  }

  async function run(roomId: string): Promise<{ minted: number; skipped: number; status: MintWindowStatusDto }> {
    setRunning(true);
    setError(null);
    setDone(0);
    setTotal(0);
    setLastHash(undefined);
    try {
      const res = await fetch(`/api/admin/rooms/${roomId}/mint-window`);
      const data = (await res.json().catch(() => ({}))) as Partial<MintWindowDto> & { message?: string };
      if (!res.ok) throw new Error(data.message ?? "No se pudo leer la ventana de acuñación.");
      if (!data.canMint || !data.basePriceWei) {
        throw new Error("La habitación debe estar PUBLICADA y tener tarifa base para acuñar la ventana.");
      }
      const roomType = toNightType(data.roomType ?? "") ?? "simple";
      const nights = data.nights ?? [];
      setTotal(nights.length);

      let minted = 0;
      let skipped = 0;
      for (const night of nights) {
        const exists = await readContract(config, {
          address: contractAddress,
          abi: hotelNightsAbi,
          functionName: "ownerOf",
          args: [BigInt(night.tokenId)],
        })
          .then(() => true)
          .catch(() => false);
        if (exists) {
          skipped += 1;
          setDone((value) => value + 1);
          continue;
        }

        const metadata = buildNightMetadata({
          room: data.roomNumber as number,
          dateYYYYMMDD: night.dateYYYYMMDD,
          roomType,
        });
        const metadataURI = `data:application/json;charset=utf-8,${encodeURIComponent(
          JSON.stringify(metadata),
        )}`;
        const hash = await writeContract(config, {
          address: contractAddress,
          abi: hotelNightsAbi,
          functionName: "mint",
          args: [BigInt(data.roomNumber as number), BigInt(night.dateYYYYMMDD), BigInt(data.basePriceWei), metadataURI],
        });
        await waitForTransactionReceipt(config, { hash });
        setLastHash(hash);
        minted += 1;
        setDone((value) => value + 1);
      }

      return {
        minted,
        skipped,
        status:
          data.status ??
          { windowDays: data.windowDays ?? 0, missing: 0, freeNights: 0, low: false },
      };
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Fallo al acuñar la ventana.");
      throw cause;
    } finally {
      setRunning(false);
    }
  }

  return { run, running, done, total, error, lastHash, reset };
}
