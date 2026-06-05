"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { isAddress, type Address } from "viem";
import { useReadContract } from "wagmi";
import { ALL_ROLE_NAMES, ROLES, type RoleName } from "@hotel/shared";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { contractAddress } from "@/config/chain";
import { TxModal } from "@/components/buy/TxModal";
import { classifyTxError } from "@/components/tx/txError";
import { AdminCard } from "./AdminPanel";
import { useAdminWrite } from "./useAdminWrite";

const PRIMARY =
  "min-h-touch rounded-pill bg-sea px-5 font-semibold text-shell transition-colors hover:bg-sea-deep disabled:opacity-60";
const DANGER =
  "min-h-touch rounded-pill bg-terracotta px-5 font-semibold text-shell transition-colors hover:opacity-90 disabled:opacity-60";
const FIELD = "min-h-touch w-full rounded-brand border border-line bg-shell px-3 text-ink";

const ROLE_LABEL: Readonly<Record<RoleName, string>> = {
  DEFAULT_ADMIN_ROLE: "DEFAULT_ADMIN",
  MINTER_ROLE: "MINTER",
  ROYALTY_ADMIN_ROLE: "ROYALTY_ADMIN",
  PAUSER_ROLE: "PAUSER",
  BURNER_ROLE: "BURNER",
  TREASURER_ROLE: "TREASURER",
};

/**
 * Roles y ownership (CU-16, DEFAULT_ADMIN): conceder/revocar un rol a una dirección
 * (`grantRole`/`revokeRole`) y transferir/aceptar ownership en dos pasos (Ownable2Step:
 * `transferOwnership`/`acceptOwnership`). Muestra `owner`/`pendingOwner`. El contrato es la
 * autoridad (revierte `AccessControlUnauthorizedAccount` / aceptación de cuenta no designada).
 */
export function AdminRoles() {
  const t = useTranslations("admin");
  const owner = useReadContract({
    address: contractAddress,
    abi: hotelNightsAbi,
    functionName: "owner",
  });
  const pendingOwner = useReadContract({
    address: contractAddress,
    abi: hotelNightsAbi,
    functionName: "pendingOwner",
  });
  const { send, reset, status, hash, error } = useAdminWrite();

  const [roleName, setRoleName] = useState<RoleName>("MINTER_ROLE");
  const [roleAccount, setRoleAccount] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const busy = status === "signing" || status === "pending";
  const txErrorKind = error ? classifyTxError(error) : null;

  const { refetch: refetchOwner } = owner;
  const { refetch: refetchPendingOwner } = pendingOwner;
  useEffect(() => {
    if (status === "confirmed") {
      void refetchOwner();
      void refetchPendingOwner();
    }
  }, [status, refetchOwner, refetchPendingOwner]);

  function onRole(event: FormEvent, fn: "grantRole" | "revokeRole"): void {
    event.preventDefault();
    setFormError(null);
    if (!isAddress(roleAccount)) return setFormError(t("rolesInvalidAddress"));
    reset();
    send(fn, [ROLES[roleName], roleAccount as Address]);
  }

  function onTransfer(event: FormEvent): void {
    event.preventDefault();
    setFormError(null);
    if (!isAddress(newOwner)) return setFormError(t("rolesInvalidAddress"));
    reset();
    send("transferOwnership", [newOwner as Address]);
  }

  return (
    <div className="flex flex-col gap-6">
      <AdminCard>
        <h2 className="font-display text-h3 font-semibold text-ink">{t("rolesGrantTitle")}</h2>
        <form className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-small font-medium text-ink">
            {t("rolesRole")}
            <select
              data-testid="roles-role"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value as RoleName)}
              className={`${FIELD} appearance-none`}
            >
              {ALL_ROLE_NAMES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-small font-medium text-ink">
            {t("rolesAccount")}
            <input
              data-testid="roles-account"
              type="text"
              value={roleAccount}
              onChange={(e) => setRoleAccount(e.target.value)}
              placeholder="0x…"
              className={`${FIELD} font-mono`}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              data-testid="roles-grant"
              disabled={busy}
              onClick={(e) => onRole(e, "grantRole")}
              className={PRIMARY}
            >
              {t("rolesGrant")}
            </button>
            <button
              type="submit"
              data-testid="roles-revoke"
              disabled={busy}
              onClick={(e) => onRole(e, "revokeRole")}
              className={DANGER}
            >
              {t("rolesRevoke")}
            </button>
          </div>
        </form>
      </AdminCard>

      <AdminCard>
        <h2 className="font-display text-h3 font-semibold text-ink">{t("rolesOwnershipTitle")}</h2>
        <dl className="mt-3 flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-small text-ink-soft">{t("rolesOwner")}</dt>
            <dd data-testid="roles-owner" className="break-all text-small text-ink">
              {owner.isPending ? t("loadingValue") : (owner.data ?? t("readError"))}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-small text-ink-soft">{t("rolesPendingOwner")}</dt>
            <dd data-testid="roles-pending-owner" className="break-all text-small text-ink">
              {pendingOwner.isPending ? t("loadingValue") : (pendingOwner.data ?? t("readError"))}
            </dd>
          </div>
        </dl>

        <form onSubmit={onTransfer} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-small font-medium text-ink">
            {t("rolesNewOwner")}
            <input
              data-testid="roles-new-owner"
              type="text"
              value={newOwner}
              onChange={(e) => setNewOwner(e.target.value)}
              placeholder="0x…"
              className={`${FIELD} font-mono`}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="submit" data-testid="roles-transfer" disabled={busy} className={PRIMARY}>
              {t("rolesTransfer")}
            </button>
            <button
              type="button"
              data-testid="roles-accept"
              disabled={busy}
              onClick={() => {
                reset();
                send("acceptOwnership", []);
              }}
              className={PRIMARY}
            >
              {t("rolesAccept")}
            </button>
          </div>
        </form>
      </AdminCard>

      {formError && (
        <p data-testid="roles-error" role="alert" className="text-terracotta-text">
          {formError}
        </p>
      )}
      {!formError && txErrorKind && (
        <p role="alert" className="text-terracotta-text">
          {t(`txError.${txErrorKind}`)}
        </p>
      )}
      <TxModal phase={status} onClose={reset} hash={hash} />
    </div>
  );
}
