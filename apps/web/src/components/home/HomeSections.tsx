import "server-only";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ActivityRecord, HotelImageRecord, HotelOfferRecord, ReviewRecord } from "@hotel/shared";
import { contentImageUrl } from "@/lib/hotel-images";
import type { HomeContent } from "@/lib/home-content";

/**
 * Home one-page de la suite pública (F6 · D-66…D-71, D-76).
 *
 * Secciones: marca y categoría, servicios, estilos, planes informativos, actividades, experiencia
 * con galería, reseñas con nota media y contacto con mapa. Las secciones que dependen de datos se
 * pintan solo si hay contenido (degradación elegante); el resto es texto de marca.
 *
 * El mapa es un `<iframe>` de OpenStreetMap con `loading="lazy"` y `title` accesible: no bloquea el
 * LCP (D-67) y la CSP lo permite explícitamente (`frame-src`).
 */

const SERVICES = ["wifi", "breakfast", "pool", "spa", "parking", "beach"] as const;
const STYLES = ["simple", "double", "suite"] as const;

/** Texto localizado con respaldo al español (D-6). */
function pick(locale: string, es: string | null, en: string | null, ru: string | null): string {
  if (locale.startsWith("en")) return en ?? es ?? "";
  if (locale.startsWith("ru")) return ru ?? es ?? "";
  return es ?? "";
}

function roomTypeKey(code: string): "simple" | "doble" | "suite" {
  if (code === "DOBLE") return "doble";
  if (code === "SUITE") return "suite";
  return "simple";
}

const MAP_EMBED =
  "https://www.openstreetmap.org/export/embed.html?bbox=-0.4920%2C38.3345%2C-0.4700%2C38.3560&layer=mapnik&marker=38.3452%2C-0.4810";

export async function HomeSections({ content, locale }: { content: HomeContent; locale: string }) {
  const t = await getTranslations("home");
  const roomType = await getTranslations("roomType");

  return (
    <>
      {/* 1 · Marca y categoría (D-70) */}
      <section aria-labelledby="home-hero" className="px-5 pb-8 pt-12 desktop:pt-16">
        <div className="mx-auto w-full max-w-6xl">
          <p className="mb-3.5 text-micro font-bold uppercase tracking-[0.18em] text-terracotta-text">
            {t("eyebrow")}
          </p>
          <h1 id="home-hero" className="max-w-[18ch] font-display text-h1 font-medium">
            {t("titleLead")} <em className="not-italic text-sea">{t("titleHighlight")}</em>
            {t("titleTail")}
          </h1>
          <p className="mt-4 max-w-prose text-body text-ink-soft">{t("subcopy")}</p>
          <p className="mt-3 max-w-prose text-small text-ink-soft">{t("category")}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/catalogo"
              className="inline-flex min-h-touch items-center rounded-pill bg-sea px-5 text-small font-semibold text-shell transition-colors hover:bg-sea-deep"
            >
              {t("ctaCatalog")}
            </Link>
            <Link
              href="#contacto"
              className="inline-flex min-h-touch items-center rounded-pill border border-sea px-5 text-small font-semibold text-sea transition-colors hover:bg-sand-2"
            >
              {t("ctaContact")}
            </Link>
          </div>
        </div>
      </section>

      {/* 2 · Servicios */}
      <section aria-labelledby="home-services" className="border-y border-line/70 bg-sand-2/60 px-5 py-10">
        <div className="mx-auto w-full max-w-6xl">
          <h2 id="home-services" className="font-display text-h2 font-medium">{t("services.title")}</h2>
          <p className="mt-2 max-w-prose text-small text-ink-soft">{t("services.subtitle")}</p>
          <ul className="mt-6 grid gap-4 tablet:grid-cols-3">
            {SERVICES.map((key) => (
              <li key={key} className="rounded-brand border border-line bg-shell p-5">
                <h3 className="font-display text-body font-semibold text-ink">{t(`services.items.${key}.title`)}</h3>
                <p className="mt-1.5 text-small text-ink-soft">{t(`services.items.${key}.body`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 3 · Estilos de habitación */}
      <section aria-labelledby="home-styles" className="px-5 py-10">
        <div className="mx-auto w-full max-w-6xl">
          <h2 id="home-styles" className="font-display text-h2 font-medium">{t("styles.title")}</h2>
          <p className="mt-2 max-w-prose text-small text-ink-soft">{t("styles.subtitle")}</p>
          <ul className="mt-6 grid gap-4 tablet:grid-cols-3">
            {STYLES.map((key) => (
              <li key={key} className="rounded-brand border border-line bg-shell p-5">
                <h3 className="font-display text-body font-semibold text-ink">{roomType(key)}</h3>
                <p className="mt-1.5 text-small text-ink-soft">{t(`styles.items.${key}`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 4 · Planes informativos (D-69) */}
      <section aria-labelledby="home-plans" className="border-y border-line/70 bg-sand-2/60 px-5 py-10">
        <div className="mx-auto w-full max-w-6xl">
          <h2 id="home-plans" className="font-display text-h2 font-medium">{t("plans.title")}</h2>
          <p className="mt-2 max-w-prose text-small text-ink-soft">{t("plans.subtitle")}</p>
          {content.offers.length === 0 ? (
            <p className="mt-6 text-small text-ink-soft">{t("plans.empty")}</p>
          ) : (
            <ul className="mt-6 grid gap-4 tablet:grid-cols-2">
              {content.offers.map((offer: HotelOfferRecord) => (
                <li key={offer.id} className="overflow-hidden rounded-brand border border-line bg-shell">
                  {offer.imageFileName && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={contentImageUrl(offer.imageFileName)}
                      alt=""
                      loading="lazy"
                      className="h-40 w-full object-cover"
                    />
                  )}
                  <div className="p-5">
                    <h3 className="font-display text-body font-semibold text-ink">
                      {pick(locale, offer.titleEs, offer.titleEn, offer.titleRu)}
                    </h3>
                    <p className="mt-1.5 text-small text-ink-soft">
                      {pick(locale, offer.bodyEs, offer.bodyEn, offer.bodyRu)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* 5 · Actividades */}
      <section aria-labelledby="home-activities" className="px-5 py-10">
        <div className="mx-auto w-full max-w-6xl">
          <h2 id="home-activities" className="font-display text-h2 font-medium">{t("activities.title")}</h2>
          <p className="mt-2 max-w-prose text-small text-ink-soft">{t("activities.subtitle")}</p>
          {content.activities.length === 0 ? (
            <p className="mt-6 text-small text-ink-soft">{t("activities.empty")}</p>
          ) : (
            <ul className="mt-6 grid gap-4 tablet:grid-cols-3">
              {content.activities.map((activity: ActivityRecord) => (
                <li key={activity.id} className="rounded-brand border border-line bg-shell p-5">
                  <h3 className="font-display text-body font-semibold text-ink">
                    {pick(locale, activity.nameEs, activity.nameEn, activity.nameRu)}
                  </h3>
                  <p className="mt-1.5 text-small text-ink-soft">
                    {pick(locale, activity.descriptionEs, activity.descriptionEn, activity.descriptionRu)}
                  </p>
                  {activity.priceCents > 0 && (
                    <p className="mt-2 text-small font-semibold text-sea-deep">
                      {t("activities.price", { price: (activity.priceCents / 100).toFixed(2), currency: activity.currency })}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* 6 · Experiencia con galería (D-66, D-70) */}
      <section aria-labelledby="home-experience" className="border-y border-line/70 bg-sand-2/60 px-5 py-10">
        <div className="mx-auto w-full max-w-6xl">
          <h2 id="home-experience" className="font-display text-h2 font-medium">{t("experience.title")}</h2>
          <p className="mt-2 max-w-prose text-small text-ink-soft">{t("experience.subtitle")}</p>
          {content.gallery.length === 0 ? (
            <p className="mt-6 text-small text-ink-soft">{t("experience.empty")}</p>
          ) : (
            <ul className="mt-6 grid grid-cols-2 gap-3 tablet:grid-cols-3">
              {content.gallery.map((image: HotelImageRecord) => (
                <li key={image.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={contentImageUrl(image.fileName)}
                    alt={pick(locale, image.altTextEs, image.altTextEn, image.altTextRu)}
                    loading="lazy"
                    className="h-40 w-full rounded-brand border border-line object-cover"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* 7 · Reseñas (D-68) */}
      <section aria-labelledby="home-reviews" className="px-5 py-10">
        <div className="mx-auto w-full max-w-6xl">
          <h2 id="home-reviews" className="font-display text-h2 font-medium">{t("reviews.title")}</h2>
          <p className="mt-2 max-w-prose text-small text-ink-soft">{t("reviews.subtitle")}</p>
          {content.reviewsSummary.average !== null && (
            <p className="mt-3 font-display text-h3 font-semibold text-sea-deep" data-testid="reviews-average">
              {t("reviews.average", {
                average: content.reviewsSummary.average.toFixed(2),
                count: content.reviewsSummary.count,
              })}
            </p>
          )}
          {content.reviews.length === 0 ? (
            <p className="mt-4 text-small text-ink-soft">{t("reviews.empty")}</p>
          ) : (
            <ul className="mt-6 grid gap-4 tablet:grid-cols-3">
              {content.reviews.map((review: ReviewRecord) => (
                <li key={review.id} className="rounded-brand border border-line bg-shell p-5">
                  <p
                    className="text-body text-sea-deep"
                    aria-label={t("reviews.ratingLabel", { rating: review.rating })}
                  >
                    <span aria-hidden="true">{"★".repeat(review.rating)}</span>
                    <span aria-hidden="true" className="text-ink-soft/40">{"★".repeat(5 - review.rating)}</span>
                  </p>
                  <p className="mt-2 text-small font-medium text-ink-soft">{roomType(roomTypeKey(review.roomType))}</p>
                  {review.comment && <p className="mt-2 text-small text-ink">“{review.comment}”</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* 8 · Contacto y mapa (D-67) */}
      <section id="contacto" aria-labelledby="home-contact" className="border-t border-line/70 bg-sand-2/60 px-5 py-10">
        <div className="mx-auto grid w-full max-w-6xl gap-6 tablet:grid-cols-2">
          <div>
            <h2 id="home-contact" className="font-display text-h2 font-medium">{t("contact.title")}</h2>
            <p className="mt-2 max-w-prose text-small text-ink-soft">{t("contact.subtitle")}</p>
            <address className="mt-4 flex flex-col gap-1 text-small not-italic text-ink">
              <span>{t("contact.address")}</span>
              <a className="text-sea-deep underline" href={`tel:${t("contact.phoneHref")}`}>{t("contact.phone")}</a>
              <a className="text-sea-deep underline" href={`mailto:${t("contact.email")}`}>{t("contact.email")}</a>
            </address>
          </div>
          <div className="overflow-hidden rounded-brand border border-line">
            <iframe
              title={t("contact.mapTitle")}
              src={MAP_EMBED}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-72 w-full"
            />
          </div>
        </div>
      </section>
    </>
  );
}
