"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAdminSession } from "@/components/admin/useAdminSession";

const SECTIONS = ["HERO", "SERVICES", "EXPERIENCE", "ACTIVITIES", "CONTACT", "OTHER"] as const;
type Section = (typeof SECTIONS)[number];

interface ContentImage {
  id: string;
  section: Section;
  fileName: string;
  position: number;
  isCover: boolean;
  altTextEs: string | null;
}
interface Offer {
  id: string;
  code: string;
  titleEs: string;
  bodyEs: string | null;
  validFrom: string | null;
  validTo: string | null;
  active: boolean;
}

/**
 * Gestión del contenido de la home (F6 · D-73/D-74), solo owner.
 *
 * **Galería**: sube imágenes JPG ≤ 2 MB por sección (portada, alt text) y las retira. **Planes**:
 * escaparates informativos con vigencia, orden y activo (sin precios, D-69). Es lo que alimenta las
 * secciones de planes y experiencia de `/`.
 */
export function ContentAdmin() {
  const t = useTranslations("content");
  const session = useAdminSession();

  const [section, setSection] = useState<Section>("HERO");
  const [images, setImages] = useState<readonly ContentImage[]>([]);
  const [offers, setOffers] = useState<readonly Offer[]>([]);
  const [form, setForm] = useState({ code: "", titleEs: "", bodyEs: "", validFrom: "", validTo: "" });
  const [alts, setAlts] = useState({ es: "", en: "", ru: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (target: Section): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const [imagesRes, offersRes] = await Promise.all([
          session.apiFetch(`/api/admin/content/images?section=${target}`).then((res) => res.json().catch(() => ({}))),
          session.apiFetch("/api/admin/content/offers").then((res) => res.json().catch(() => ({}))),
        ]);
        setImages((imagesRes as { images?: ContentImage[] }).images ?? []);
        setOffers((offersRes as { offers?: Offer[] }).offers ?? []);
      } catch (err) {
        setError(err instanceof Error && err.message ? err.message : t("loadError"));
      } finally {
        setLoading(false);
      }
    },
    [session, t],
  );

  useEffect(() => {
    if (session.sessionUsername) void load(section);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.sessionUsername, section]);

  if (session.isLoading) {
    return <p role="status" aria-live="polite" className="text-ink-soft">{t("loading")}</p>;
  }
  if (!session.sessionUsername || !session.hasRole("DEFAULT_ADMIN_ROLE")) {
    return (
      <p data-testid="content-role-denied" role="alert" className="rounded-brand-lg border border-line bg-sand-2 px-5 py-8 text-ink-soft">
        {t("roleDenied")}
      </p>
    );
  }

  const upload = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const data = new FormData(event.currentTarget);
    data.set("section", section);
    data.set("altTextEs", alts.es);
    data.set("altTextEn", alts.en);
    data.set("altTextRu", alts.ru);
    try {
      const res = await session.apiFetch("/api/admin/content/images", { method: "POST", body: data });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { message?: string }).message || t("uploadError"));
      setNotice(t("uploaded"));
      setAlts({ es: "", en: "", ru: "" });
      event.currentTarget.reset();
      await load(section);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("uploadError"));
    }
  };

  const removeImage = async (id: string): Promise<void> => {
    await session.apiFetch(`/api/admin/content/images/${id}`, { method: "DELETE" });
    await load(section);
  };

  const setCover = async (id: string): Promise<void> => {
    await session.apiFetch(`/api/admin/content/images/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ section }),
    });
    await load(section);
  };

  const createOffer = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const res = await session.apiFetch("/api/admin/content/offers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          titleEs: form.titleEs,
          bodyEs: form.bodyEs,
          validFrom: form.validFrom || null,
          validTo: form.validTo || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { message?: string }).message || t("saveError"));
      setNotice(t("offerCreated", { code: form.code.toUpperCase() }));
      setForm({ code: "", titleEs: "", bodyEs: "", validFrom: "", validTo: "" });
      await load(section);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("saveError"));
    }
  };

  const toggleOffer = async (offer: Offer): Promise<void> => {
    await session.apiFetch(`/api/admin/content/offers/${offer.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !offer.active }),
    });
    await load(section);
  };

  const removeOffer = async (offer: Offer): Promise<void> => {
    await session.apiFetch(`/api/admin/content/offers/${offer.id}`, { method: "DELETE" });
    await load(section);
  };

  return (
    <div className="flex flex-col gap-6">
      {notice && <p role="status" className="text-small text-olive">{notice}</p>}
      {error && (
        <p role="alert" className="rounded-brand-lg border border-terracotta/40 bg-terracotta/10 px-4 py-3 text-small text-ink">
          {error}
        </p>
      )}

      <section aria-labelledby="content-gallery" className="flex flex-col gap-3">
        <h2 id="content-gallery" className="font-display text-h3 font-semibold text-ink">{t("galleryTitle")}</h2>
        <label className="flex items-center gap-2 text-small">
          <span className="font-medium text-ink">{t("section")}</span>
          <select
            value={section}
            onChange={(event) => setSection(event.target.value as Section)}
            data-testid="content-section"
            className="min-h-touch rounded-brand-sm border border-line bg-sand px-3"
          >
            {SECTIONS.map((option) => (
              <option key={option} value={option}>{t(`section_${option}` as "section_HERO")}</option>
            ))}
          </select>
        </label>

        {loading ? (
          <p role="status" className="text-ink-soft">{t("loading")}</p>
        ) : images.length === 0 ? (
          <p className="text-small text-ink-soft">{t("noImages")}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 tablet:grid-cols-4">
            {images.map((image) => (
              <li key={image.id} className="flex flex-col gap-2 rounded-brand border border-line bg-shell p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/content/images/${image.fileName}`} alt={image.altTextEs ?? ""} className="h-28 w-full rounded-brand-sm object-cover" />
                <p className="text-micro text-ink-soft">
                  #{image.position} {image.isCover ? `· ${t("cover")}` : ""}
                </p>
                <div className="flex gap-1">
                  {!image.isCover && (
                    <button type="button" onClick={() => void setCover(image.id)} className="min-h-touch flex-1 rounded-pill border border-line px-2 text-micro font-semibold text-ink-soft">
                      {t("makeCover")}
                    </button>
                  )}
                  <button type="button" onClick={() => void removeImage(image.id)} className="min-h-touch flex-1 rounded-pill border border-terracotta/50 px-2 text-micro font-semibold text-terracotta-text">
                    {t("delete")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={upload} className="flex flex-wrap items-end gap-3 rounded-brand-lg border border-line bg-shell p-4">
          <label className="flex flex-col gap-1 text-small">
            <span className="font-medium text-ink">{t("file")}</span>
            <input type="file" name="file" accept="image/jpeg" required className="text-small" />
          </label>
          <label className="flex flex-col gap-1 text-small">
            <span className="font-medium text-ink">{t("altEs")}</span>
            <input value={alts.es} onChange={(event) => setAlts({ ...alts, es: event.target.value })} className="min-h-touch w-48 rounded-brand-sm border border-line bg-sand px-3" />
          </label>
          <button type="submit" className="min-h-touch rounded-pill bg-sea px-4 text-small font-semibold text-shell">
            {t("upload")}
          </button>
          <p className="w-full text-micro text-ink-soft">{t("imageHint")}</p>
        </form>
      </section>

      <section aria-labelledby="content-offers" className="flex flex-col gap-3">
        <h2 id="content-offers" className="font-display text-h3 font-semibold text-ink">{t("offersTitle")}</h2>
        {offers.length === 0 ? (
          <p className="text-small text-ink-soft">{t("noOffers")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {offers.map((offer) => (
              <li key={offer.id} className="flex flex-wrap items-center gap-2 rounded-brand border border-line bg-shell px-4 py-2 text-small">
                <span className="font-medium text-ink">{offer.code}</span>
                <span className="text-ink">{offer.titleEs}</span>
                <span className="text-micro text-ink-soft">
                  {offer.validFrom ?? "—"} → {offer.validTo ?? "—"}
                </span>
                <button type="button" onClick={() => void toggleOffer(offer)} className={`ml-auto min-h-touch rounded-pill px-3 text-small font-semibold ${offer.active ? "bg-sea text-shell" : "border border-line text-ink-soft"}`}>
                  {offer.active ? t("active") : t("paused")}
                </button>
                <button type="button" onClick={() => void removeOffer(offer)} className="min-h-touch rounded-pill border border-terracotta/50 px-3 text-small font-semibold text-terracotta-text">
                  {t("delete")}
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={createOffer} className="flex flex-wrap items-end gap-3 rounded-brand-lg border border-line bg-shell p-4">
          <label className="flex flex-col gap-1 text-small">
            <span className="font-medium text-ink">{t("offerCode")}</span>
            <input required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} className="min-h-touch w-32 rounded-brand-sm border border-line bg-sand px-3" />
          </label>
          <label className="flex flex-col gap-1 text-small">
            <span className="font-medium text-ink">{t("offerTitle")}</span>
            <input required value={form.titleEs} onChange={(event) => setForm({ ...form, titleEs: event.target.value })} className="min-h-touch w-56 rounded-brand-sm border border-line bg-sand px-3" />
          </label>
          <label className="flex flex-col gap-1 text-small">
            <span className="font-medium text-ink">{t("validFrom")}</span>
            <input type="date" value={form.validFrom} onChange={(event) => setForm({ ...form, validFrom: event.target.value })} className="min-h-touch rounded-brand-sm border border-line bg-sand px-3" />
          </label>
          <label className="flex flex-col gap-1 text-small">
            <span className="font-medium text-ink">{t("validTo")}</span>
            <input type="date" value={form.validTo} onChange={(event) => setForm({ ...form, validTo: event.target.value })} className="min-h-touch rounded-brand-sm border border-line bg-sand px-3" />
          </label>
          <button type="submit" className="min-h-touch rounded-pill bg-sea px-4 text-small font-semibold text-shell">
            {t("createOffer")}
          </button>
        </form>
      </section>
    </div>
  );
}
