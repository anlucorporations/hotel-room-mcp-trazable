"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAccount, useReadContract } from "wagmi";
import { zeroAddress } from "viem";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { ROYALTY_BPS_MAX, ROLES } from "@hotel/shared/domain";
import { contractAddress } from "@/config/chain";
import { TxModal } from "@/components/buy/TxModal";
import { AdminCard } from "./AdminPanel";
import { useAdminWrite } from "./useAdminWrite";
import { useAdminTxCopy } from "./adminTxCopy";
import { classifyAdminTxError } from "./adminTxError";
import {
  ROYALTY_FALLBACK_BPS,
  ROYALTY_ROOM_RANGES,
  ROYALTY_ROOM_TYPES,
  formatRoyaltyBps,
  isValidRoyaltyBps,
  type RoyaltyRoomType,
} from "./royalty-bps";

const PRIMARY =
  "min-h-touch rounded-pill bg-azure px-5 font-semibold text-shell transition-colors hover:bg-azure-deep disabled:opacity-60";

/**
 * Fila de un tipo: lee el royalty vigente on-chain (`royaltyBpsOf`) y cae al valor inicial si el
 * contrato desplegado aún no soporta el getter. Cada fila es su propio componente para poder usar
 * un hook por tipo sin bucles de hooks.
 */
function RoyaltyRateRow({ roomType }: { readonly roomType: RoyaltyRoomType }) {
  const tRoomType = useTranslations("roomType");
  const onChain = useReadContract({
    address: contractAddress,
    abi: hotelNightsAbi,
    functionName: "royaltyBpsOf",
    args: [roomType],
  });

  const bps = onChain.isSuccess ? Number(onChain.data) : ROYALTY_FALLBACK_BPS[roomType];

  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-small text-ink">
        {tRoomType(roomType)} <span className="text-ink-soft">({ROYALTY_ROOM_RANGES[roomType]})</span>
      </dt>
      <dd
        data-testid={`royalty-rate-${roomType}`}
        className="text-small font-semibold text-ink tabular-nums"
      >
        {formatRoyaltyBps(bps)} %
      </dd>
    </div>
  );
}

/**
 * Royalty de reventa (CU-47, RF-08). Desde **C1** (2026-10-13) el porcentaje es **configurable por
 * `ROYALTY_ADMIN`** dentro de 0–2000 bps: el panel muestra el valor vigente de cada tipo, permite
 * fijar uno nuevo y lo firma en la cartera. `royaltyInfo(tokenId, salePrice)` (ERC-2981) sigue
 * siendo la fuente única que aplica la reventa.
 *
 * **Degradación segura**: si el contrato desplegado aún no expone `royaltyBpsOf`/`setRoyaltyBps`
 * (versión D-06 previa al redeploy acordado), el panel enseña los valores iniciales, explica la
 * situación y **oculta el formulario** en vez de ofrecer una transacción que revertiría.
 */
export function AdminRoyalty() {
  const t = useTranslations("admin");
  const txCopy = useAdminTxCopy();
  const { address } = useAccount();

  // Sonda de capacidades: si `royaltyBpsOf` responde, el contrato desplegado lleva C1.
  const probe = useReadContract({
    address: contractAddress,
    abi: hotelNightsAbi,
    functionName: "royaltyBpsOf",
    args: ["simple"],
  });
  const legacy = probe.isError;

  // Gating de UX por rol: la autoridad real es el contrato (revertiría sin el rol).
  const roleCheck = useReadContract({
    address: contractAddress,
    abi: hotelNightsAbi,
    functionName: "hasRole",
    args: [ROLES.ROYALTY_ADMIN_ROLE, address ?? zeroAddress],
    query: { enabled: address !== undefined && !legacy },
  });
  const canEdit = !legacy && roleCheck.data === true;

  const { send, reset, status, hash, error } = useAdminWrite();
  const [roomType, setRoomType] = useState<RoyaltyRoomType>("suite");
  const [bpsInput, setBpsInput] = useState("");
  const [pending, setPending] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const busy = status === "signing" || status === "pending";
  const invalid = bpsInput.trim() !== "" && !isValidRoyaltyBps(bpsInput);
  const txErrorKind = error ? classifyAdminTxError(error) : null;

  useEffect(() => {
    if (status === "confirmed") {
      setPending(false);
      setBpsInput("");
      setRefreshKey((value) => value + 1); // remonta las filas → releen el valor vigente
    }
  }, [status]);

  function closeModal(): void {
    setPending(false);
    reset();
  }

  function confirm(): void {
    if (!pending || !isValidRoyaltyBps(bpsInput)) return;
    send("setRoyaltyBps", [roomType, BigInt(bpsInput.trim())]);
  }

  // Fase del modal: `review` mientras hay un cambio pendiente de confirmar; si no, el estado real.
  const phase = pending && status === "idle" ? "review" : status;

  return (
    <AdminCard>
      <p data-testid="royalty-current" className="text-ink">
        {legacy ? t("royaltyLegacyNotice") : t("royaltyEditableIntro")}
      </p>

      <h2 className="mt-5 font-display text-h3 font-semibold text-ink">
        {t("royaltyRatesTitle")}
      </h2>
      <dl data-testid="royalty-rates" key={refreshKey} className="mt-3 flex flex-col gap-2">
        {ROYALTY_ROOM_TYPES.map((type) => (
          <RoyaltyRateRow key={type} roomType={type} />
        ))}
      </dl>

      {!legacy && (
        <fieldset className="mt-5 flex flex-col gap-3" disabled={!canEdit || busy}>
          <legend className="font-display text-h3 font-semibold text-ink">
            {t("royaltyEditTitle")}
          </legend>

          <label className="flex flex-col gap-1 text-small">
            <span className="font-medium text-ink">{t("royaltyTypeLabel")}</span>
            <select
              data-testid="royalty-type"
              value={roomType}
              onChange={(event) => setRoomType(event.target.value as RoyaltyRoomType)}
              className="min-h-touch rounded-brand-sm border border-line-strong bg-mist px-3"
            >
              {ROYALTY_ROOM_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-small">
            <span className="font-medium text-ink">
              {t("royaltyBpsLabel", { max: formatRoyaltyBps(ROYALTY_BPS_MAX) })}
            </span>
            <input
              data-testid="royalty-bps"
              type="number"
              min={0}
              max={ROYALTY_BPS_MAX}
              step={1}
              inputMode="numeric"
              value={bpsInput}
              onChange={(event) => setBpsInput(event.target.value)}
              placeholder={t("royaltyBpsPlaceholder")}
              className="min-h-touch rounded-brand-sm border border-line-strong bg-mist px-3"
            />
          </label>
          <p className="text-small text-ink-soft">{t("royaltyBpsHelp")}</p>

          {invalid && (
            <p data-testid="royalty-invalid" role="alert" className="text-small text-coral-text">
              {t("royaltyInvalid", { max: formatRoyaltyBps(ROYALTY_BPS_MAX) })}
            </p>
          )}

          {!roleCheck.isPending && !canEdit && (
            <p data-testid="royalty-no-role" className="text-small text-ink-soft">
              {t("royaltyNoRole")}
            </p>
          )}

          <button
            type="button"
            data-testid="royalty-apply"
            disabled={!canEdit || busy || bpsInput.trim() === "" || invalid}
            onClick={() => setPending(true)}
            className={`${PRIMARY} self-start`}
          >
            {t("royaltyApply")}
          </button>
        </fieldset>
      )}

      {txErrorKind && (
        <p data-testid="royalty-tx-error" role="alert" className="mt-3 text-coral-text">
          {t(`txError.${txErrorKind}`)}
        </p>
      )}

      <p className="mt-4 text-small text-ink-soft">{t("royaltySourceNote")}</p>

      <TxModal
        phase={phase}
        onClose={closeModal}
        hash={hash}
        copy={txCopy}
        reviewBody={
          <p data-testid="royalty-confirm" className="text-small text-ink">
            {t("royaltyConfirmBody", {
              type: roomType,
              percent: formatRoyaltyBps(Number(bpsInput) || 0),
            })}
          </p>
        }
        reviewActions={
          <>
            <button
              type="button"
              data-testid="royalty-confirm-action"
              onClick={confirm}
              className={PRIMARY}
            >
              {t("confirm")}
            </button>
            <button
              type="button"
              onClick={closeModal}
              className="min-h-touch w-full rounded-brand border border-line px-4 py-2 font-semibold text-ink"
            >
              {t("cancel")}
            </button>
          </>
        }
      />
    </AdminCard>
  );
}
