import "server-only";
import { getTranslations } from "next-intl/server";
import type { ActivityRecord, HotelImageRecord, HotelOfferRecord } from "@hotel/shared";
import { contentImageUrl } from "@/lib/hotel-images";
import { pick, type HomeReview } from "@/lib/home-view";
import type { HomeContent } from "@/lib/home-content";
import { BookingBar } from "@/components/booking/BookingBar";
import { ExperienceCard } from "./ExperienceCard";
import { Hero } from "./Hero";
import { SuiteCard } from "./SuiteCard";
import { TestimonialCard } from "./TestimonialCard";

/**
 * Home one-page de la suite pública (F6 · D-66…D-71, D-76 · Fase C de la imagen visual).
 *
 * Secciones: **hero editorial con velo marino**, servicios, alojamiento con tarjetas reales,
 * planes informativos, actividades, experiencia con galería, reseñas con nota media y contacto con
 * mapa. Las secciones que dependen de datos se pintan solo si hay contenido (degradación elegante);
 * el resto es texto de marca. El **catálogo** (con precios verificables contra la cadena) vive en
 * `/catalogo`.
 *
 * El mapa es un `<iframe>` de OpenStreetMap con `loading="lazy"` y `title` accesible: no bloquea el
 * LCP (D-67) y la CSP lo permite explícitamente (`frame-src`).
 */

const SERVICES = ["wifi", "breakfast", "pool", "spa", "parking", "beach"] as const;
/** Estilos de respaldo cuando aún no hay fichas publicadas: clave i18n del texto y tipo del dominio. */
const STYLES = [
  { key: "simple", type: "simple" },
  { key: "double", type: "doble" },
  { key: "suite", type: "suite" },
] as const;

const MAP_EMBED =
  "https://www.openstreetmap.org/export/embed.html?bbox=-0.4920%2C38.3345%2C-0.4700%2C38.3560&layer=mapnik&marker=38.3452%2C-0.4810";

export async function HomeSections({ content, locale }: { content: HomeContent; locale: string }) {
  const t = await getTranslations("home");
  const roomType = await getTranslations("roomType");

  return (
    <>
      {/* 1 · Hero editorial con velo marino (Fase C) */}
      <Hero image={content.hero} locale={locale} />

      {/* 1b · Barra de reserva flotante: se solapa con el borde inferior del hero (Fase C.2) */}
      <section aria-label={t("booking.title")} className="relative z-10 mx-auto -mt-8 w-full max-w-6xl px-5 tablet:-mt-10">
        <h2 className="sr-only">{t("booking.title")}</h2>
        <BookingBar />
        <p className="mt-2 text-caption text-ink-soft">{t("booking.helper")}</p>
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

      {/* 3 · Alojamiento: tarjetas reales de habitación (Fase C); sin fichas publicadas, texto de marca */}
      <section aria-labelledby="home-styles" className="px-5 py-10">
        <div className="mx-auto w-full max-w-6xl">
          <h2 id="home-styles" className="font-display text-h2 font-medium">{t("styles.title")}</h2>
          <p className="mt-2 max-w-prose text-small text-ink-soft">{t("styles.subtitle")}</p>
          {content.suites.length === 0 ? (
            <ul className="mt-6 grid gap-4 tablet:grid-cols-3">
              {STYLES.map(({ key, type }) => (
                <li key={key} className="rounded-brand border border-line bg-shell p-5">
                  <h3 className="font-display text-body font-semibold text-ink">{roomType(type)}</h3>
                  <p className="mt-1.5 text-small text-ink-soft">{t(`styles.items.${key}`)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="mt-6 flex flex-col gap-5">
              {content.suites.map((suite) => (
                <SuiteCard key={suite.id} suite={suite} locale={locale} />
              ))}
            </ul>
          )}
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
                <ExperienceCard
                  key={image.id}
                  locale={locale}
                  image={{
                    fileName: image.fileName,
                    altEs: image.altTextEs,
                    altEn: image.altTextEn,
                    altRu: image.altTextRu,
                  }}
                />
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
              {content.reviews.map((review: HomeReview) => (
                <TestimonialCard key={review.id} review={review} />
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
