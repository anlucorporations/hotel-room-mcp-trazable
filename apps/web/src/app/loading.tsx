/**
 * Esqueleto de carga inicial de la home (UX#11): pinta de inmediato una cabecera editorial
 * y un grid de tarjetas «fantasma» mientras el servidor resuelve el catálogo por RPC, mejorando
 * la percepción de velocidad. Sin estado, sin `useTranslations` (es Server Component) y con
 * `aria-hidden`/sr-only para no contaminar a lectores de pantalla. Respeta `motion-safe`.
 */
const SKELETON_CARDS = 6;

function CardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-brand-lg border border-line bg-shell shadow-card">
      <div className="aspect-[4/3] w-full bg-mist-2 motion-safe:animate-pulse" />
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="h-5 w-28 rounded-brand-sm bg-mist-2 motion-safe:animate-pulse" />
          <div className="h-3 w-12 rounded-brand-sm bg-mist-2 motion-safe:animate-pulse" />
        </div>
        <div className="h-3.5 w-40 rounded-brand-sm bg-mist-2 motion-safe:animate-pulse" />
        <div className="mt-2 h-6 w-24 rounded-brand-sm bg-mist-2 motion-safe:animate-pulse" />
        <div className="mt-2 h-11 w-full rounded-pill bg-mist-2 motion-safe:animate-pulse" />
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando el catálogo de noches…</span>

      <section aria-hidden="true" className="px-5 pb-7 pt-12 desktop:pb-8 desktop:pt-16">
        <div className="mx-auto w-full max-w-6xl">
          <div className="mb-3.5 h-3 w-56 rounded-brand-sm bg-mist-2 motion-safe:animate-pulse" />
          <div className="h-12 max-w-[16ch] rounded-brand bg-mist-2 motion-safe:animate-pulse" />
          <div className="mt-4 h-4 max-w-prose rounded-brand-sm bg-mist-2 motion-safe:animate-pulse" />
        </div>
      </section>

      <div aria-hidden="true" className="border-b border-line bg-mist/90 py-4">
        <div className="mx-auto flex w-full max-w-6xl gap-2.5 px-5">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-11 w-24 flex-none rounded-pill bg-mist-2 motion-safe:animate-pulse"
            />
          ))}
        </div>
      </div>

      <div aria-hidden="true" className="mx-auto w-full max-w-6xl px-5 py-8">
        <div className="grid grid-cols-1 gap-6 tablet:grid-cols-2 tablet:gap-7 desktop:grid-cols-3">
          {Array.from({ length: SKELETON_CARDS }).map((_, index) => (
            <CardSkeleton key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
