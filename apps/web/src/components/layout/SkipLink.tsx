/**
 * Enlace «saltar al contenido» reutilizable por los shells (MINOR#35).
 *
 * Oculto visualmente hasta recibir foco; entonces aparece anclado arriba a la
 * izquierda para que el teclado salte directamente al `<main>` (accesibilidad).
 */
export function SkipLink({ target, label }: { target: string; label: string }) {
  return (
    <a
      href={target}
      className="sr-only z-50 rounded-br-brand-sm bg-sea px-4 py-3 font-semibold text-shell focus:not-sr-only focus:absolute focus:left-0 focus:top-0"
    >
      {label}
    </a>
  );
}
