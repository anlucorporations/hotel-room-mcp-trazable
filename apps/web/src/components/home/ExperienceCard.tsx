import { getTranslations } from "next-intl/server";
import { contentImageUrl } from "@/lib/hotel-images";
import { pick, type HomeImage } from "@/lib/home-view";

/**
 * Tarjeta de **experiencia** (galería de la home · propuesta de imagen visual §3.7 · Fase C).
 *
 * La imagen es la protagonista; el texto alternativo de la BD se pinta además como **pie visible**,
 * de modo que la foto aporta información también a quien ve la pantalla. Cuando el pie está presente
 * la imagen se marca decorativa (`alt=""`) para no leer dos veces lo mismo.
 *
 * Sin texto alternativo, la imagen conserva un nombre genérico localizado para no quedar sin nombre
 * accesible.
 */
export async function ExperienceCard({ image, locale }: { image: HomeImage; locale: string }) {
  const t = await getTranslations("home");
  const caption = pick(locale, image.altEs, image.altEn, image.altRu);

  return (
    <li className="overflow-hidden rounded-brand border border-line bg-shell">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={contentImageUrl(image.fileName)}
        alt={caption === "" ? t("experience.imageAlt") : ""}
        loading="lazy"
        className="h-48 w-full object-cover"
      />
      {caption !== "" && (
        <p className="px-4 py-3 text-caption text-ink-soft">{caption}</p>
      )}
    </li>
  );
}
