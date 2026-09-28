import { getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/layout/PublicShell";
import { ReserveFlow } from "@/components/reserve/ReserveFlow";
import { parseBookingQuery } from "@/lib/booking";

export const dynamic = "force-dynamic";

/**
 * Reserva desde la suite pública (F6 · D-65, D-72 · Fase C.2).
 *
 * La wallet se conecta al inicio del flujo; la noche se retiene, el anticipo se paga por
 * transferencia y la liquidación se concilia al 100 %.
 *
 * La búsqueda de la **barra de reserva** llega por URL (`?from=…&to=…&guests=…`): se lee aquí, en el
 * servidor, con `parseBookingQuery` —que descarta lo inválido en vez de corregirlo a ciegas— y se
 * pasa al flujo como valores iniciales. Así el enlace es compartible y el botón «atrás» no pierde la
 * selección.
 */
export default async function ReservePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("reserve");
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    query.set(key, Array.isArray(value) ? (value[0] ?? "") : value);
  }
  const initial = parseBookingQuery(query);

  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-10">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-h1 font-medium">{t("title")}</h1>
          <p className="max-w-prose text-body text-ink-soft">{t("tagline")}</p>
        </header>
        <ReserveFlow initial={initial} />
      </div>
    </PublicShell>
  );
}
