import type { ReactNode } from "react";

/**
 * Cabecera de una **página de sección** de la suite pública (petición del responsable, 2026-09-28).
 *
 * Unifica lo que antes era el arranque de cada sección de la home: *eyebrow* en terracota, título en
 * serif y entradilla, con el mismo ancho de contenido y el mismo `<h1>` por ruta (invariante de
 * accesibilidad vigilado por `a11y.test.ts`).
 */
export function PageHeader({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  children?: ReactNode;
}) {
  return (
    <header className="mx-auto w-full max-w-7xl px-5 pb-6 pt-16 tablet:px-8 tablet:pt-24">
      <p className="mb-3 text-micro font-bold uppercase tracking-[0.18em] text-coral-text">
        {eyebrow}
      </p>
      <h1 className="max-w-[20ch] text-balance font-display text-h1 font-semibold tracking-tight">{title}</h1>
      {lead && <p className="mt-5 max-w-prose text-body-lg text-ink-soft">{lead}</p>}
      {children}
    </header>
  );
}

/**
 * Bloque de sección de una página pública: ancho y ritmo comunes, con título enlazable por ancla.
 */
export function PageSection({
  id,
  title,
  subtitle,
  children,
  tone = "plain",
}: {
  id: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  tone?: "plain" | "band";
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={
        tone === "band"
          ? "border-y border-line/70 bg-mist-2/60 px-5 py-16 tablet:px-8 tablet:py-24"
          : "px-5 py-16 tablet:px-8 tablet:py-24"
      }
    >
      <div className="mx-auto w-full max-w-7xl">
        <h2 id={`${id}-title`} className="max-w-[22ch] text-balance font-display text-h2 font-semibold tracking-tight">
          {title}
        </h2>
        {subtitle && <p className="mt-3 max-w-prose text-body text-ink-soft">{subtitle}</p>}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}
