import { NextRequest, NextResponse } from "next/server";
import { NFTsRepository } from "@hotel/shared";

export const dynamic = "force-dynamic";

const nftsRepo = new NFTsRepository();

interface RouteParams {
  params: Promise<{
    tokenId: string;
  }>;
}

export async function GET(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { tokenId } = await params;

    if (!tokenId) {
      return NextResponse.json({ error: "BAD_REQUEST", message: "Token ID requerido" }, { status: 400 });
    }

    const nft = await nftsRepo.getNFTById(tokenId);

    if (!nft) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: `NFT con token ID ${tokenId} no encontrado` },
        { status: 404 },
      );
    }

    // Estándar ERC-721 Metadata
    const metadata = {
      name: `Habitación ${nft.roomNumber} - ${nft.checkInDate}`,
      description: `Noche de hotel para el ${nft.checkInDate} en la habitación ${nft.roomNumber} (${nft.roomType}) de Hotel Marina del Sol.`,
      image: `https://hotel.marinadelsol.es/images/rooms/${nft.roomNumber}.jpg`,
      external_url: `https://hotel.marinadelsol.es/room/${nft.tokenId}`,
      attributes: [
        {
          trait_type: "Habitación",
          value: nft.roomNumber,
        },
        {
          trait_type: "Tipo",
          value: nft.roomType,
        },
        {
          trait_type: "Fecha Check-in",
          value: nft.checkInDate,
        },
        {
          trait_type: "Estado",
          value: nft.status,
        },
        {
          trait_type: "Precio Base (Wei)",
          value: nft.basePriceWei,
        },
      ],
    };

    return NextResponse.json(metadata, { status: 200 });
  } catch (error: any) {
    console.error(`[API /api/nfts/:tokenId/metadata] Error:`, error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: error?.message || "Error al obtener metadatos" },
      { status: 500 },
    );
  }
}
