"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { isAddress, type Address } from "viem";
import { useReadContract } from "wagmi";
import { ALL_ROLE_NAMES, ROLES, type RoleName } from "@hotel/shared/domain";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { contractAddress } from "@/config/chain";
import { TxModal } from "@/components/buy/TxModal";
import { AdminCard } from "./AdminPanel";
import { useAdminWrite } from "./useAdminWrite";
import { useAdminTxCopy } from "./adminTxCopy";
import { classifyAdminTxError } from "./adminTxError";

const PRIMARY =
  "min-h-touch rounded-pill bg-azure px-5 font-semibold text-shell transition-colors hover:bg-azure-deep disabled:opacity-60";
const DANGER =
  "min-h-touch rounded-pill bg-coral px-5 font-semibold text-shell transition-colors hover:opacity-90 disabled:opacity-60";
const FIELD = "min-h-touch w-full rounded-brand border border-line-strong bg-shell px-3 text-ink";

const ROLE_LABEL: Readonly<Record<RoleName, string>> = {
  DEFAULT_ADMIN_ROLE: "DEFAULT_ADMIN",
  MINTER_ROLE: "MINTER",
  RECEPTION_ROLE: "RECEPTION",
  PAUSER_ROLE: "PAUSER",
  BURNER_ROLE: "BURNER",
  TREASURER_ROLE: "TREASURER",
};

/** Acción pendiente de confirmación explícita (UX#21): solo las destructivas/engañosas. */
type Pending =
  | { kind: "revoke"; role: RoleName; account: Address }
  | { kind: "transfer"; account: Address };

/**
 * Roles y ownership (CU-16, docs/SRS.md §9, DEFAULT_ADMIN). El control REAL del contrato lo gobierna
 * `DEFAULT_ADMIN_ROLE` (super-admin), no `owner()` (Ownable2Step), que es solo informativo: por
 * eso la UI separa visualmente «Propiedad (informativa)» del super-admin real y guía el handover
 * REAL (grant DEFAULT_ADMIN al nuevo + renounce del antiguo) (UX#25). Las acciones destructivas o
 * engañosas (revoke, transferOwnership) exigen confirmación explícita en el `TxModal` (UX#21) con
 * copy genérica del ciclo de tx (MAJOR#9). El contrato sigue siendo la autoridad.
 */
export function AdminRoles() {
  const t = useTranslations("admin");
  const txCopy = useAdminTxCopy();
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
  // Errores SEPARADOS por formulario (MINOR#36): el de roles no debe aparecer junto al de ownership.
  const [roleError, setRoleError] = useState<string | null>(null);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const busy = status === "signing" || status === "pending";
  const txErrorKind = error ? classifyAdminTxError(error) : null;
  const roleErrorId = "roles-role-error";
  const ownerErrorId = "roles-owner-error";

  const { refetch: refetchOwner } = owner;
  const { refetch: refetchPendingOwner } = pendingOwner;
  useEffect(() => {
    if (status === "confirmed") {
      void refetchOwner();
      void refetchPendingOwner();
    }
  }, [status, refetchOwner, refetchPendingOwner]);

  const phase = pending && status === "idle" ? "review" : status;

  function closeModal(): void {
    setPending(null);
    reset();
  }

  // Conceder no es destructivo: se firma directo. Revocar sí → confirmación (UX#21).
  function onGrant(event: FormEvent): void {
    event.preventDefault();
    setRoleError(null);
    if (!isAddress(roleAccount)) return setRoleError(t("rolesInvalidAddress"));
    reset();
    send("grantRole", [ROLES[roleName], roleAccount as Address]);
  }

  function onRevoke(event: FormEvent): void {
    event.preventDefault();
    setRoleError(null);
    if (!isAddress(roleAccount)) return setRoleError(t("rolesInvalidAddress"));
    setPending({ kind: "revoke", role: roleName, account: roleAccount as Address });
  }

  function onTransfer(event: FormEvent): void {
    event.preventDefault();
    setOwnerError(null);
    if (!isAddress(newOwner)) return setOwnerError(t("rolesInvalidAddress"));
    setPending({ kind: "transfer", account: newOwner as Address });
  }

  function confirm(): void {
    if (!pending) return;
    reset();
    if (pending.kind === "revoke") {
      send("revokeRole", [ROLES[pending.role], pending.account]);
    } else {
      send("transferOwnership", [pending.account]);
    }
  }

  const confirmText = !pending
    ? ""
    : pending.kind === "revoke"
      ? t("rolesRevokeConfirm", { role: ROLE_LABEL[pending.role], account: pending.account })
      : t("rolesTransferConfirm", { account: pending.account });

  return (
    <div className="flex flex-col gap-6">
      {/* Super-admin REAL: el control on-chain (UX#25). */}
      <AdminCard>
        <h2 className="font-display text-h3 font-semibold text-ink">{t("rolesAdminTitle")}</h2>
        <p className="mt-2 text-small text-ink-soft">{t("rolesAdminNote")}</p>
      </AdminCard>

      <AdminCard>
        <h2 className="font-display text-h3 font-semibold text-ink">{t("rolesGrantTitle")}</h2>
        <form className="mt-4 flex flex-col gap-3">
          <label htmlFor="roles-role" className="flex flex-col gap-1 text-small font-medium text-ink">
            {t("rolesRole")}
            <select
              id="roles-role"
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
          <label
            htmlFor="roles-account"
            className="flex flex-col gap-1 text-small font-medium text-ink"
          >
            {t("rolesAccount")}
            <input
              id="roles-account"
              data-testid="roles-account"
              type="text"
              value={roleAccount}
              onChange={(e) => setRoleAccount(e.target.value)}
              placeholder="0x…"
              aria-invalid={Boolean(roleError) || undefined}
              aria-describedby={roleError ? roleErrorId : undefined}
              className={`${FIELD} font-mono`}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              data-testid="roles-grant"
              disabled={busy}
              onClick={onGrant}
              className={PRIMARY}
            >
              {t("rolesGrant")}
            </button>
            <button
              type="submit"
              data-testid="roles-revoke"
              disabled={busy}
              onClick={onRevoke}
              className={DANGER}
            >
              {t("rolesRevoke")}
            </button>
          </div>
          {roleError && (
            <p id={roleErrorId} data-testid="roles-error" role="alert" className="text-coral-text">
              {roleError}
            </p>
          )}
        </form>
      </AdminCard>

      {/* Handover REAL del control: grant DEFAULT_ADMIN + renounce del antiguo (UX#25). */}
      <AdminCard>
        <h2 className="font-display text-h3 font-semibold text-ink">{t("rolesHandoverTitle")}</h2>
        <p className="mt-2 text-small text-ink-soft">{t("rolesAdminNote")}</p>
      </AdminCard>

      <AdminCard>
        <h2 className="font-display text-h3 font-semibold text-ink">{t("rolesOwnerInfoTitle")}</h2>
        <p className="mt-2 text-small text-ink-soft">{t("rolesOwnerInfoNote")}</p>
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
          <label
            htmlFor="roles-new-owner"
            className="flex flex-col gap-1 text-small font-medium text-ink"
          >
            {t("rolesNewOwner")}
            <input
              id="roles-new-owner"
              data-testid="roles-new-owner"
              type="text"
              value={newOwner}
              onChange={(e) => setNewOwner(e.target.value)}
              placeholder="0x…"
              aria-invalid={Boolean(ownerError) || undefined}
              aria-describedby={ownerError ? ownerErrorId : undefined}
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
          {ownerError && (
            <p
              id={ownerErrorId}
              data-testid="roles-owner-error"
              role="alert"
              className="text-coral-text"
            >
              {ownerError}
            </p>
          )}
        </form>
      </AdminCard>

      {txErrorKind && (
        <p role="alert" className="text-coral-text">
          {t(`txError.${txErrorKind}`)}
        </p>
      )}

      <TxModal
        phase={phase}
        onClose={closeModal}
        hash={hash}
        copy={txCopy}
        reviewBody={
          <p data-testid="roles-confirm" className="text-small text-ink">
            {confirmText}
          </p>
        }
        reviewActions={
          <>
            <button
              type="button"
              data-testid="roles-confirm-action"
              onClick={confirm}
              className={pending?.kind === "revoke" ? DANGER : PRIMARY}
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
    </div>
  );
}
