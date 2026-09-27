import { getLocale } from "next-intl/server";
import { HomeSections } from "@/components/home/HomeSections";
import { PublicShell } from "@/components/layout/PublicShell";
import { getHomeContent } from "@/lib/home-content";

// La home lee contenido de la BD en cada request (planes, galería, actividades y reseñas).
export const dynamic = "force-dynamic";

/**
 * Home de la **suite pública** (F6 · D-31, D-66…D-71, D-76): la raíz `/` del proyecto.
 *
 * One-page con marca y categoría, servicios, estilos, planes informativos, actividades, experiencia
 * con galería, reseñas con nota media y contacto con mapa. El **catálogo** vive en `/catalogo`.
 *
 * Toda la lectura de datos es tolerante a fallo (`getHomeContent` resuelve cada fuente por
 * separado): si la base no responde, la home sigue sirviendo la parte de marca.
 */
export default async function HomePage() {
  const locale = await getLocale();
  const content = await getHomeContent();

  return (
    <PublicShell>
      <HomeSections content={content} locale={locale} />
    </PublicShell>
  );
}
