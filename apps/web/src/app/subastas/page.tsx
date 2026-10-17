import { getTranslations } from "next-intl/server";
import { AuctionCard } from "@/components/auctions/AuctionCard";
import { DegradedState } from "@/components/DegradedState";
import { PublicShell } from "@/components/layout/PublicShell";
import { openAuctions } from "@/lib/auction-view";
import { fetchAuctions } from "@/lib/auctions";

// Lectura on-chain en cada request: el estado de una subasta cambia con el reloj (ADR-09).
export const dynamic = "force-dynamic";

/**
 * Subastas públicas (C2 · RF-13).
 *
 * El hotel subasta noches **premium** (suite) con precio de reserva, incremento mínimo y
 * anti-sniping; los clientes pujan y el ganador se lleva la noche al liquidar. La vista se lee
 * **solo del contrato** (decisión B6): escaneo de `AuctionCreated` + `auctionOf`, sin índice off-chain.
 * Si la subasta no está desplegada en el entorno se dice (`notConfigured`) y si el RPC no responde
 * se degrada, sin inventar datos.
 */
export default async function AuctionsPage() {
  const t = await getTranslations("auctions");
  const { configured, degraded, items } = await fetchAuctions();
  const live = openAuctions(items);
  const history = items.filter((item) => !live.includes(item));

  return (
    <PublicShell>
      <section className="mx-auto w-full max-w-6xl px-4 py-10">
        <h1 className="font-display text-display text-ink">{t("title")}</h1>
        <p className="mt-2 max-w-[70ch] text-ink-soft">{t("intro")}</p>

        {!configured ? (
          <p
            data-testid="auctions-not-configured"
            role="status"
            className="mt-8 rounded-brand-lg border border-dashed border-line bg-mist-2 px-5 py-12 text-center text-ink-soft"
          >
            {t("notConfigured")}
          </p>
        ) : degraded ? (
          <div className="mt-8">
            <DegradedState message={t("degraded")} retryLabel={t("retry")} />
          </div>
        ) : items.length === 0 ? (
          <div
            data-testid="auctions-empty"
            className="mt-8 rounded-brand-lg border border-dashed border-line bg-mist-2 px-5 py-12 text-center"
          >
            <p className="text-ink">{t("empty")}</p>
            <p className="mt-2 text-small text-ink-soft">{t("emptyHint")}</p>
          </div>
        ) : (
          <>
            <h2 className="mt-10 font-display text-h3 text-ink">{t("liveTitle")}</h2>
            {live.length === 0 ? (
              <p data-testid="auctions-no-live" className="mt-3 text-ink-soft">
                {t("noLive")}
              </p>
            ) : (
              <div
                data-testid="auctions-live"
                className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
              >
                {live.map((item) => (
                  <AuctionCard key={item.tokenId} item={item} />
                ))}
              </div>
            )}

            {history.length > 0 && (
              <section className="mt-12">
                <h2 className="font-display text-h3 text-ink">{t("history")}</h2>
                <div
                  data-testid="auctions-history"
                  className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
                >
                  {history.map((item) => (
                    <AuctionCard key={item.tokenId} item={item} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </section>
    </PublicShell>
  );
}
