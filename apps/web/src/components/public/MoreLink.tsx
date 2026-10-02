import Link from "next/link";

/**
 * Enlace «Ver más» de un resumen de la home hacia la **página de su sección** (petición del
 * responsable, 2026-09-28): la home resume y cada sección se amplía en su propia página.
 *
 * Lleva texto visible (no un icono suelto) y el nombre de la sección en el `aria-label` para que el
 * enlace tenga sentido fuera de contexto cuando un lector de pantalla recorre los enlaces.
 */
export function MoreLink({
  href,
  label,
  section,
}: {
  href: string;
  /** Texto visible («Ver más»). */
  label: string;
  /** Nombre de la sección, para el nombre accesible. */
  section: string;
}) {
  return (
    <p className="mt-5">
      <Link
        href={href}
        aria-label={`${label}: ${section}`}
        className="inline-flex min-h-touch items-center gap-1 rounded-pill border border-azure px-4 text-small font-semibold text-azure transition-colors hover:bg-azure-deep hover:text-shell"
      >
        {label}
        <span aria-hidden="true">→</span>
      </Link>
    </p>
  );
}
