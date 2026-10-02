"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAdminSession } from "@/components/admin/useAdminSession";

interface Review {
  id: string;
  roomType: string;
  rating: number;
  comment: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  moderationNotes: string | null;
}

const STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

/**
 * Moderación de reseñas (F6 · D-58) en Administración. Solo owner.
 *
 * Las reseñas nacen `PENDING` y **no se publican hasta aprobarlas**. Aquí el responsable las aprueba
 * o rechaza dejando un **motivo**, que queda registrado con su usuario y la fecha.
 */
export function ReviewsModeration() {
  const t = useTranslations("reviews");
  const session = useAdminSession();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("PENDING");
  const [reviews, setReviews] = useState<readonly Review[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    async (target: string): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const res = await session.apiFetch(`/api/admin/reviews?status=${encodeURIComponent(target)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { message?: string }).message || t("loadError"));
        setReviews((data as { reviews?: Review[] }).reviews ?? []);
      } catch (err) {
        setError(err instanceof Error && err.message ? err.message : t("loadError"));
      } finally {
        setLoading(false);
      }
    },
    [session, t],
  );

  useEffect(() => {
    if (session.sessionUsername) void load(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.sessionUsername, status]);

  if (session.isLoading) {
    return (
      <p role="status" aria-live="polite" className="text-ink-soft">
        {t("loading")}
      </p>
    );
  }
  if (!session.sessionUsername || !session.hasRole("DEFAULT_ADMIN_ROLE")) {
    return (
      <p data-testid="reviews-role-denied" role="alert" className="rounded-brand-lg border border-line bg-mist-2 px-5 py-8 text-ink-soft">
        {t("roleDenied")}
      </p>
    );
  }

  const moderate = async (review: Review, action: "approve" | "reject"): Promise<void> => {
    setError(null);
    setNotice(null);
    try {
      const res = await session.apiFetch(`/api/admin/reviews/${review.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason: reasons[review.id] ?? null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message || t("actionError"));
      setNotice(action === "approve" ? t("approved") : t("rejected"));
      setReasons((current) => ({ ...current, [review.id]: "" }));
      await load(status);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("actionError"));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-small">
        <span className="font-medium text-ink">{t("filterStatus")}</span>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as (typeof STATUSES)[number])}
          data-testid="reviews-status"
          className="min-h-touch rounded-brand-sm border border-line-strong bg-mist px-3"
        >
          {STATUSES.map((option) => (
            <option key={option} value={option}>
              {t(`status.${option}`)}
            </option>
          ))}
        </select>
      </label>

      {notice && <p role="status" className="text-small text-success">{notice}</p>}
      {error && (
        <p role="alert" className="rounded-brand-lg border border-error/40 bg-error-bg px-4 py-3 text-small text-ink">
          {error}
        </p>
      )}

      {loading ? (
        <p role="status" className="text-ink-soft">{t("loading")}</p>
      ) : reviews.length === 0 ? (
        <p className="text-small text-ink-soft">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {reviews.map((review) => (
            <li key={review.id} className="flex flex-col gap-3 rounded-brand-lg border border-line bg-shell p-4 shadow-card">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-body text-azure-deep" aria-label={t("ratingLabel", { rating: review.rating })}>
                  <span aria-hidden="true">{"★".repeat(review.rating)}</span>
                  <span aria-hidden="true" className="text-ink-soft/40">{"★".repeat(5 - review.rating)}</span>
                </span>
                <span className="text-small text-ink-soft">{review.roomType}</span>
              </div>
              {review.comment && <p className="text-small text-ink">“{review.comment}”</p>}
              {review.moderationNotes && (
                <p className="text-micro text-ink-soft">{t("reasonLabel")}: {review.moderationNotes}</p>
              )}
              {review.status === "PENDING" && (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-small">
                    <span className="font-medium text-ink">{t("reason")}</span>
                    <input
                      type="text"
                      value={reasons[review.id] ?? ""}
                      onChange={(event) => setReasons((current) => ({ ...current, [review.id]: event.target.value }))}
                      placeholder={t("reasonPlaceholder")}
                      className="min-h-touch rounded-brand-sm border border-line-strong bg-mist px-3"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void moderate(review, "approve")}
                    className="min-h-touch rounded-pill bg-fern px-4 text-small font-semibold text-shell"
                  >
                    {t("approve")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void moderate(review, "reject")}
                    className="min-h-touch rounded-pill border border-line px-4 text-small font-semibold text-ink-soft"
                  >
                    {t("reject")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
