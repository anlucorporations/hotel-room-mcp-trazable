import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/layout/PublicShell";
import { TestimonialCard } from "@/components/home/TestimonialCard";
import { contentImageUrl } from "@/lib/hotel-images";
import { pick } from "@/lib/home-view";
import { buildCatalogHref, EMPTY_CATALOG_SEARCH } from "@/lib/catalog-search";
import { getPublicReviews, getPublicRoomDetail } from "@/lib/public-content";

export const dynamic = "force-dynamic";

/** Fallbacks de galería (solo si la BD no devuelve fotos de la habitación). */
const FALLBACK_GALLERY = [
  "/images/hero-fallback.jpg",
  "/images/room-fallback-1.jpg",
  "/images/room-fallback-2.jpg",
] as const;

function imageSrc(fileName: string): string {
  return fileName.startsWith("/") ? fileName : contentImageUrl(fileName);
}

export async function generateMetadata({
  params,
}: {
  params: { room: string };
}): Promise<Metadata> {
  const t = await getTranslations("roomDetail");
  const room = await getPublicRoomDetail(Number(params.room));
  if (!room) return { title: t("notFound") };
  return {
    title: t("title", { room: room.roomNumber }),
    description: pick(
      await getLocale(),
      room.descriptionEs,
      room.descriptionEn,
      room.descriptionRu,
    ) || undefined,
    alternates: { canonical: `/habitaciones/${room.roomNumber}` },
  };
}

/**
 * Ficha pública de una habitación (2026-10-23 · fase 2/3 de «Marina Editorial»).
 *
 * Distribución editorial 7/4: galería a sangre, relato y servicios a la izquierda, tarjeta de
 * reserva sticky a la derecha. No inventa precio ni disponibilidad: remite al catálogo, donde se
 * comprueban contra la cadena. La lectura degrada al maestro de habitaciones si la BD no responde.
 */
export default async function PublicRoomPage({ params }: { params: { room: string } }) {
  const roomNumber = Number(params.room);
  if (!Number.isInteger(roomNumber) || roomNumber <= 0) notFound();
  const room = await getPublicRoomDetail(roomNumber);
  if (!room) notFound();

  const locale = await getLocale();
  const t = await getTranslations("roomDetail");
  const tRoom = await getTranslations("roomType");
  const typeLabel = tRoom(room.roomType);
  const description =
    pick(locale, room.descriptionEs, room.descriptionEn, room.descriptionRu) ||
    t("aboutFallback", { type: typeLabel.toLowerCase() });

  const gallery =
    room.images.length > 0
      ? room.images.map((image) => ({
          src: imageSrc(image.fileName),
          alt: pick(locale, image.altEs, image.altEn, image.altRu),
        }))
      : FALLBACK_GALLERY.map((src) => ({ src, alt: "" }));

  const viewLabel =
    room.viewKind === "SEA"
      ? t("meta.viewSEA")
      : room.viewKind === "GARDEN"
        ? t("meta.viewGARDEN")
        : room.viewKind === "INTERIOR"
          ? t("meta.viewINTERIOR")
          : null;

  const { reviews } = await getPublicReviews(60);
  const roomReviews = reviews.filter((review) => review.roomType === room.roomType).slice(0, 3);

  const catalogHref = buildCatalogHref({
    ...EMPTY_CATALOG_SEARCH,
    room: String(room.roomNumber),
  });
  const typeCatalogHref = buildCatalogHref({
    ...EMPTY_CATALOG_SEARCH,
    type: room.roomType,
  });

  return (
    <PublicShell>
      <article className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-12 tablet:px-8 tablet:py-20">
        <nav aria-label={t("breadcrumbRooms")} className="flex flex-wrap items-center gap-2 text-caption text-ink-soft">
          <Link href="/" className="hover:text-ink">{t("breadcrumbHome")}</Link>
          <span aria-hidden="true">/</span>
          <Link href="/habitaciones" className="hover:text-ink">{t("breadcrumbRooms")}</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page" className="text-ink">{t("title", { room: room.roomNumber })}</span>
        </nav>

        {/* Galería editorial: principal 16/10 + dos laterales. */}
        <div className="grid gap-3 tablet:grid-cols-[2fr_1fr]">
          <figure className="relative aspect-[16/10] overflow-hidden rounded-brand-md bg-mist-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={gallery[0]!.src}
              alt={gallery[0]!.alt}
              fetchPriority="high"
              className="h-full w-full object-cover"
            />
          </figure>
          {gallery.length > 1 && (
            <div className="grid gap-3">
              {gallery.slice(1, 3).map((image, index) => (
                <figure key={`${image.src}-${index}`} className="relative aspect-[4/3] overflow-hidden rounded-brand-md bg-mist-2 tablet:aspect-auto">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.src} alt={image.alt} loading="lazy" className="h-full w-full object-cover" />
                </figure>
              ))}
            </div>
          )}
        </div>

        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-micro font-bold uppercase tracking-[0.18em] text-coral-text">{t("eyebrow")} · {typeLabel}</p>
            <h1 className="mt-2 font-display text-h1 font-semibold tracking-tight">
              {t("title", { room: room.roomNumber })}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-small text-ink-soft">
              <span>{t("meta.capacity", { count: room.capacity })}</span>
              <span>{t("meta.beds", { count: room.beds })}</span>
              {room.sizeM2 !== null && <span>{t("meta.size", { size: room.sizeM2 })}</span>}
              {viewLabel && <span>{viewLabel}</span>}
              {room.hasBalcony && <span>{t("meta.balcony")}</span>}
              {room.isAccessible && <span>{t("meta.accessible")}</span>}
            </div>
          </div>
          <span className="rounded-pill bg-amber px-4 py-2 text-micro font-bold uppercase tracking-[0.12em] text-shell">
            {typeLabel}
          </span>
        </header>

        <div className="grid gap-12 tablet:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] tablet:items-start">
          <div className="flex flex-col gap-10">
            <section>
              <h2 className="font-display text-h2 font-semibold tracking-tight">{t("aboutTitle")}</h2>
              <p className="mt-4 max-w-prose text-body-lg leading-relaxed text-ink-soft">{description}</p>
            </section>

            <section>
              <h2 className="font-display text-h2 font-semibold tracking-tight">{t("servicesTitle")}</h2>
              <ul className="mt-5 grid gap-3 border-t border-line pt-5 text-body-sm text-ink-soft tablet:grid-cols-2">
                {(["breakfast", "wifi", "terrace", "concierge"] as const).map((key) => (
                  <li key={key} className="flex items-center gap-2">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-azure" />
                    {t(`services.${key}`)}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="font-display text-h2 font-semibold tracking-tight">{t("policiesTitle")}</h2>
              <ul className="mt-5 flex flex-col gap-3 border-t border-line pt-5 text-body-sm text-ink-soft">
                {(["entry", "exit", "cancellation", "pets", "payment"] as const).map((key) => (
                  <li key={key}>{t(`policies.${key}`)}</li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="font-display text-h2 font-semibold tracking-tight">{t("reviewsTitle")}</h2>
              {roomReviews.length === 0 ? (
                <p className="mt-4 text-body text-ink-soft">{t("reviewsEmpty")}</p>
              ) : (
                <ul className="mt-6 grid gap-8 border-t border-line pt-6 tablet:grid-cols-3">
                  {roomReviews.map((review) => (
                    <TestimonialCard key={review.id} review={review} />
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="flex h-fit flex-col gap-4 rounded-brand-md border border-line bg-shell p-6 shadow-card tablet:sticky tablet:top-24">
            <p className="text-micro font-bold uppercase tracking-[0.16em] text-coral-text">{t("eyebrow")}</p>
            <h2 className="font-display text-h2 font-semibold leading-tight">{t("bookingTitle")}</h2>
            <p className="text-body-sm leading-relaxed text-ink-soft">{t("bookingBody")}</p>
            <Link
              href={catalogHref}
              className="inline-flex min-h-touch items-center justify-center rounded-pill bg-azure px-5 text-small font-semibold text-shell transition-colors hover:bg-azure-deep"
            >
              {t("ctaCatalog")}
            </Link>
            <Link
              href={typeCatalogHref}
              className="inline-flex min-h-touch items-center justify-center rounded-pill border border-line-strong px-5 text-small font-semibold text-ink transition-colors hover:border-azure hover:text-azure"
            >
              {t("ctaType", { type: typeLabel.toLowerCase() })}
            </Link>
            <p className="border-t border-line pt-4 text-caption leading-relaxed text-ink-soft">{t("trust")}</p>
            <Link href="/habitaciones" className="text-small font-semibold text-azure underline underline-offset-4">
              {t("back")}
            </Link>
          </aside>
        </div>
      </article>
    </PublicShell>
  );
}
