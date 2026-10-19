import { getTranslations } from "next-intl/server";
import { RoomsRepository } from "@hotel/shared";
import { RoomPublicationPanel } from "@/components/reception/RoomPublicationPanel";

export const dynamic = "force-dynamic";

/** Ventas: publicar/despublicar la venta manualmente tras inspección o mantenimiento (F10 · T10.2). */
export default async function ReceptionRoomsPage() {
  const t = await getTranslations("reception");
  const rooms = await new RoomsRepository().listRooms().catch(() => []);
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("publication.pageTitle")}</h1>
        <p className="text-body text-ink-soft">{t("publication.pageTagline")}</p>
      </header>
      <RoomPublicationPanel
        rooms={rooms.map((room) => ({
          id: room.id,
          roomNumber: room.roomNumber,
          roomType: room.roomType,
          publicationStatus: room.publicationStatus,
        }))}
      />
    </>
  );
}
