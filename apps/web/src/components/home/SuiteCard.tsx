import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { contentImageUrl } from "@/lib/hotel-images";
import { pick, type HomeSuite } from "@/lib/home-view";

/**
 * Tarjeta **horizontal** de habitación (propuesta de imagen visual §3.7 · Fase C).
 *
 * Foto a la izquierda en tablet y arriba en móvil, con los datos que el cliente necesita para
 * decidir (tipo, capacidad, camas, metros) y una única llamada a la acción al catálogo, donde vive
 * el precio real por noche. **No muestra precio**: la tarifa se publica solo donde se puede
 * comprobar contra la cadena (`/catalogo` y `/reservar`), no se inventa en la home.
 *
 * Sin foto se pinta la tarjeta completa con una banda arena: la información nunca depende de la
 * imagen.
 */
export async function SuiteCard({ suite, locale }: { suite: HomeSuite; locale: string }) {
  const t = await getTranslations("home");
  const roomType = await getTranslations("roomType");

  const description = pick(locale, suite.descriptionEs, suite.descriptionEn, suite.descriptionRu);
  const alt = suite.cover === null ? "" : pick(locale, suite.cover.altEs, suite.cover.altEn, suite.cover.altRu);

  return (
    <li className="overflow-hidden rounded-brand border border-line bg-shell">
      <div className="grid gap-0 tablet:grid-cols-[minmax(0,20rem)_1fr]">
        {suite.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={contentImageUrl(suite.cover.fileName)}
            alt={alt}
            loading="lazy"
            className="h-48 w-full object-cover tablet:h-full"
          />
        ) : (
          <div aria-hidden="true" className="h-24 w-full bg-sand-2 tablet:h-full" />
        )}

        <div className="flex flex-col justify-between gap-4 p-5">
          <div>
            <p className="text-micro font-semibold uppercase tracking-[0.14em] text-terracotta-text">
              {t("suites.roomLabel", { number: suite.roomNumber })}
            </p>
            <h3 className="mt-1 font-display text-h3 font-medium text-ink">{roomType(suite.roomType)}</h3>
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-small text-ink-soft">
              <div className="flex gap-1.5">
                <dt className="font-medium text-ink">{t("suites.capacityLabel")}</dt>
                <dd>{t("suites.capacity", { count: suite.capacity })}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="font-medium text-ink">{t("suites.bedsLabel")}</dt>
                <dd>{suite.beds}</dd>
              </div>
              {suite.sizeM2 !== null && (
                <div className="flex gap-1.5">
                  <dt className="font-medium text-ink">{t("suites.sizeLabel")}</dt>
                  <dd>{t("suites.size", { size: suite.sizeM2 })}</dd>
                </div>
              )}
            </dl>
            {description && <p className="mt-3 max-w-prose text-small text-ink-soft">{description}</p>}
          </div>

          <div>
            <Link
              href="/catalogo"
              className="inline-flex min-h-touch items-center rounded-pill bg-sea px-5 text-small font-semibold text-shell transition-colors hover:bg-sea-deep"
            >
              {t("suites.cta")}
            </Link>
          </div>
        </div>
      </div>
    </li>
  );
}
