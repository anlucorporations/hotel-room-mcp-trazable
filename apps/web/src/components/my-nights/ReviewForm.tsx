"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useReviewSubmission } from "./useReviewSubmission";

/**
 * Formulario para **reseñar una noche consumida** (F6 · D-59/D-58).
 *
 * Pide nota y comentario, firma la autorización con la wallet del titular y envía la reseña, que
 * queda **pendiente de moderación** (no se publica hasta que el administrador la apruebe).
 */
export function ReviewForm({ tokenId }: { tokenId: string }) {
  const t = useTranslations("reviews");
  const { status, error, submit, reset } = useReviewSubmission(tokenId);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  if (status === "done") {
    return <p role="status" className="mt-2 text-small text-olive">{t("submitted")}</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 min-h-touch rounded-pill border border-sea px-4 text-small font-semibold text-sea"
      >
        {t("formOpen")}
      </button>
    );
  }

  const busy = status === "signing" || status === "sending";

  return (
    <form
      className="mt-3 flex flex-col gap-2 rounded-brand border border-line bg-sand-2 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(rating, comment.trim());
      }}
    >
      <p className="text-small font-medium text-ink">{t("formTitle")}</p>
      <label className="flex items-center gap-2 text-small">
        <span className="text-ink">{t("ratingField")}</span>
        <select
          value={rating}
          onChange={(event) => setRating(Number(event.target.value))}
          className="min-h-touch rounded-brand-sm border border-line-strong bg-shell px-3"
        >
          {[5, 4, 3, 2, 1].map((value) => (
            <option key={value} value={value}>
              {"★".repeat(value)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-small">
        <span className="text-ink">{t("commentField")}</span>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder={t("commentPlaceholder")}
          rows={3}
          maxLength={1000}
          className="rounded-brand-sm border border-line-strong bg-shell px-3 py-2"
        />
      </label>
      {error && (
        <p role="alert" className="text-small text-terracotta-text">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="min-h-touch rounded-pill bg-sea px-4 text-small font-semibold text-shell disabled:opacity-50"
        >
          {busy ? t("submitting") : t("submit")}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="min-h-touch rounded-pill border border-line px-4 text-small font-semibold text-ink-soft"
        >
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
