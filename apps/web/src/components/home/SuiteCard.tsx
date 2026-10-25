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
    <li className="group flex flex-col">
      <div className="relative aspect-[4/5] overflow-hidden rounded-brand-sm bg-mist-2">
        {suite.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={contentImageUrl(suite.cover.fileName)}
            alt={alt}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 ease-brand group-hover:scale-[1.03]"
          />
        ) : null}
        <p className="absolute left-3 top-3 rounded-pill bg-shell/95 px-3 py-1.5 text-micro font-bold uppercase tracking-[0.12em] text-ink">
          {t("suites.roomLabel", { number: suite.roomNumber })}
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-3 pt-4">
        <div>
          <p className="text-micro font-bold uppercase tracking-[0.14em] text-coral-text">
            {roomType(suite.roomType)}
          </p>
          <h3 className="mt-1 font-display text-h3 font-semibold leading-tight">
            <Link href={`/habitaciones/${suite.roomNumber}`} className="transition-colors hover:text-azure">
              {t("suites.roomLabel", { number: suite.roomNumber })}
            </Link>
          </h3>
          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-small text-ink-soft">
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
          {description && <p className="mt-2 max-w-prose text-body-sm text-ink-soft">{description}</p>}
        </div>

        <div className="mt-auto pt-2">
          <Link
            href="/catalogo"
            className="inline-flex min-h-touch items-center border-b border-line-strong pb-0.5 text-small font-semibold text-azure transition-colors hover:text-azure-deep"
          >
            {t("suites.cta")}
            <span aria-hidden="true" className="ml-1">→</span>
          </Link>
        </div>
      </div>
    </li>
  );
}
