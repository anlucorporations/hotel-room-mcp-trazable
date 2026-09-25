"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { parseEther } from "viem";
import { NightImage } from "@/components/NightImage";
import { TxModal } from "@/components/buy/TxModal";
import { formatEth, formatNightDate, TYPE_LABEL } from "@/lib/format";
import { resaleErrorMessage } from "./resaleErrorMessage";
import { TicketView } from "./TicketView";
import { useListNight } from "./useListNight";
import type { OwnedNight } from "./useMyNights";

const PRIMARY_BTN =
  "min-h-touch w-full rounded-brand bg-sea px-4 py-2 font-semibold text-shell transition-colors hover:bg-sea-deep disabled:opacity-60";
const GHOST_BTN =
  "min-h-touch w-full rounded-brand border border-line px-4 py-2 font-semibold text-ink disabled:opacity-60";

/** Tarjeta de una noche poseída: listar para reventa o cancelar el listado (CU-06, docs/SRS.md §9). */
export function MyNightCard({
  night,
  onConfirmed,
}: {
  night: OwnedNight;
  onConfirmed: () => void;
}) {
  const t = useTranslations("myNights");
  const { list, unlist, reset, status, hash, error } = useListNight();
  const [priceEth, setPriceEth] = useState("");
  const [priceError, setPriceError] = useState(false);
  // Mostrar el formulario de precio: siempre en una noche sin listar, o cuando el usuario
  // pulsa «Cambiar precio» en una ya listada.
  const [editingPrice, setEditingPrice] = useState(false);

  const busy = status === "signing" || status === "pending";
  const isListed = night.listingPriceWei !== null;
  const showPriceForm = !isListed || editingPrice;
  // Feedback diferenciado al fallar list/unlist: errores REVERT del contrato (NotOwner,
  // InvalidPrice, NightExpired, NotListed) → mensaje claro; en su defecto, rechazo de firma
  // o fallo genérico (`classifyTxError`). Un rechazo deja `status` en idle (sin hash); un
  // revert mantiene el error tras minar.
  const txErrorKey = error ? resaleErrorMessage(error) : null;

  // Tras confirmarse la tx, refresca los datos (re-lee listingOf/ownerOf).
  useEffect(() => {
    if (status === "confirmed") {
      setEditingPrice(false); // tras confirmar el cambio de precio, vuelve a las acciones.
      onConfirmed();
    }
  }, [status, onConfirmed]);

  const alt = t("imageAlt", {
    type: TYPE_LABEL[night.type],
    room: night.room,
    date: formatNightDate(night.dateYYYYMMDD),
  });

  function onList(event: FormEvent): void {
    event.preventDefault();
    const value = Number(priceEth);
    if (!(value > 0)) {
      setPriceError(true);
      return;
    }
    setPriceError(false);
    reset(); // descarta el error de un intento anterior antes de reintentar.
    // El contrato actualiza el `Listing` y reemite `Listed` también para una noche ya listada.
    list(night.tokenId, parseEther(priceEth));
  }

  function onUnlist(): void {
    reset();
    unlist(night.tokenId);
  }

  function openPriceForm(): void {
    setPriceError(false);
    setPriceEth(""); // arranca vacío; la validación exige > 0 antes de reenviar.
    setEditingPrice(true);
  }

  function cancelPriceForm(): void {
    setEditingPrice(false);
    setPriceError(false);
  }

  return (
    <article
      data-testid={`my-night-${night.tokenId}`}
      className="flex flex-col overflow-hidden rounded-brand-lg border border-line bg-shell"
    >
      <NightImage type={night.type} alt={alt} />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-ink">{t("room", { room: night.room })}</h3>
          <span className="rounded-pill bg-sand-2 px-2 py-0.5 text-micro font-semibold text-ink-soft">
            {TYPE_LABEL[night.type]}
          </span>
        </div>
        <p className="text-small text-ink-soft">{formatNightDate(night.dateYYYYMMDD)}</p>

        {isListed ? (
          <span className="text-micro font-semibold text-terracotta-text">{t("listedBadge")}</span>
        ) : (
          <span className="text-micro font-semibold text-sea-deep">{t("ownedBadge")}</span>
        )}

        {/* Resguardo de check-in (RF-07): solo tiene sentido en una noche no consumida ni revendida. */}
        <TicketView night={night} />

        <div className="mt-auto flex flex-col gap-2 pt-2">
          {isListed && (
            <p className="text-small font-semibold text-ink">
              {t("listedPrice", { price: formatEth(night.listingPriceWei ?? "0") })}
            </p>
          )}

          {showPriceForm ? (
            // Mismo input/validación que el listado inicial; en una noche ya listada
            // «Cambiar precio» reutiliza el formulario y vuelve a llamar a `list`.
            <form onSubmit={onList} className="flex flex-col gap-2">
              <label className="flex flex-col text-small text-ink">
                {t("priceLabel")}
                <input
                  data-testid={`list-price-${night.tokenId}`}
                  type="number"
                  step="0.001"
                  min="0"
                  value={priceEth}
                  onChange={(e) => setPriceEth(e.target.value)}
                  aria-invalid={priceError}
                  className="mt-1 min-h-touch rounded-brand border border-line px-3 text-ink"
                />
              </label>
              {priceError && (
                <p data-testid={`list-error-${night.tokenId}`} role="alert" className="text-small text-terracotta-text">
                  {t("invalidPrice")}
                </p>
              )}
              <button
                type="submit"
                data-testid={`list-${night.tokenId}`}
                disabled={busy}
                aria-busy={busy}
                className={PRIMARY_BTN}
              >
                {busy ? t("processing") : isListed ? t("saveNewPrice") : t("list")}
              </button>
              {isListed && (
                <button
                  type="button"
                  data-testid={`cancel-relist-${night.tokenId}`}
                  disabled={busy}
                  onClick={cancelPriceForm}
                  className={GHOST_BTN}
                >
                  {t("cancelEdit")}
                </button>
              )}
            </form>
          ) : (
            <>
              <button
                type="button"
                data-testid={`relist-${night.tokenId}`}
                disabled={busy}
                aria-busy={busy}
                onClick={openPriceForm}
                className={PRIMARY_BTN}
              >
                {t("changePrice")}
              </button>
              <button
                type="button"
                data-testid={`unlist-${night.tokenId}`}
                disabled={busy}
                aria-busy={busy}
                onClick={onUnlist}
                className={GHOST_BTN}
              >
                {busy ? t("processing") : t("unlist")}
              </button>
            </>
          )}

          {txErrorKey && (
            <p
              data-testid={`list-tx-error-${night.tokenId}`}
              role="alert"
              className="text-small text-terracotta-text"
            >
              {t(txErrorKey)}
            </p>
          )}
        </div>
      </div>

      <TxModal phase={status} onClose={reset} hash={hash} />
    </article>
  );
}
