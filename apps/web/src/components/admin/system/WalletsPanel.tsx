"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const BUTTON =
  "min-h-touch rounded-pill border border-line px-3 text-micro font-semibold text-ink transition-colors hover:bg-mist-2 disabled:opacity-60";
const FIELD =
  "min-h-touch rounded-brand-sm border border-line-strong bg-shell px-3 text-small text-ink";

interface WalletDto {
  readonly username: string;
  readonly role: string;
  readonly walletAddress: string;
  readonly isActive: boolean;
  readonly revokedAt: string | null;
  readonly onChainRoleActive: boolean | null;
}

interface BackupDto {
  readonly role: string;
  readonly backup: string | null;
}

/**
 * Wallets de jefe y roles on-chain (F9 · T9.1/T9.2, CU-V-35/38).
 *
 * La asignación y la baja exigen el **txHash** de la operación on-chain: el back-office solo marca en
 * BD después de comprobar el recibo y el estado real del rol (RNF-M-15). El respaldo `OWNER_BACKUP`
 * se muestra con su dirección on-chain.
 */
export function WalletsPanel() {
  const t = useTranslations("admin");
  const [wallets, setWallets] = useState<readonly WalletDto[]>([]);
  const [backups, setBackups] = useState<readonly BackupDto[]>([]);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("HEAD_MAINTENANCE");
  const [walletAddress, setWalletAddress] = useState("");
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch("/api/admin/system/wallets", { credentials: "same-origin" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
      setWallets((data?.wallets ?? []) as WalletDto[]);
      setBackups((data?.backups ?? []) as BackupDto[]);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("wallets.error"));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function assign(): Promise<void> {
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/system/wallets", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, role, walletAddress, txHash }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
      setMessage(t("wallets.assigned"));
      setUsername("");
      setWalletAddress("");
      setTxHash("");
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("wallets.error"));
    }
  }

  async function revoke(target: string): Promise<void> {
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/system/wallets", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: target, txHash }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
      setMessage(t("wallets.revoked"));
      setTxHash("");
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("wallets.error"));
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-brand border border-line px-4 py-3" data-testid="wallets-panel">
      <h2 className="text-h4 font-semibold text-ink">{t("wallets.title")}</h2>
      <p className="text-small text-ink-soft">{t("wallets.hint")}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-small text-ink">
          {t("wallets.username")}
          <input className={FIELD} value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-small text-ink">
          {t("wallets.role")}
          <select className={FIELD} value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="HEAD_MAINTENANCE">HEAD_MAINTENANCE</option>
            <option value="HEAD_KEEPER">HEAD_KEEPER</option>
            <option value="OWNER_BACKUP">OWNER_BACKUP</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-small text-ink">
          {t("wallets.address")}
          <input className={FIELD} value={walletAddress} onChange={(event) => setWalletAddress(event.target.value)} placeholder="0x…" />
        </label>
        <label className="flex flex-col gap-1 text-small text-ink">
          {t("wallets.txHash")}
          <input className={FIELD} value={txHash} onChange={(event) => setTxHash(event.target.value)} placeholder="0x…" />
        </label>
        <button
          type="button"
          className={BUTTON}
          disabled={!username || !walletAddress || !txHash}
          onClick={() => void assign()}
        >
          {t("wallets.assign")}
        </button>
      </div>
      {error !== null && <p role="alert" className="text-small text-error">{error}</p>}
      {message !== null && <p role="status" className="text-small text-success">{message}</p>}
      <ul className="flex flex-col divide-y divide-line text-small text-ink">
        {wallets.map((wallet) => (
          <li key={`${wallet.username}-${wallet.role}`} className="flex flex-wrap items-center gap-2 py-2" data-testid="wallet-row">
            <span className="min-w-0 flex-1">
              {wallet.username} · {wallet.role} · {wallet.walletAddress.slice(0, 10)}… ·{" "}
              {wallet.isActive ? t("wallets.active") : t("wallets.revokedState")}
              {wallet.onChainRoleActive === true ? ` · ${t("wallets.roleOnChain")}` : ""}
            </span>
            {wallet.isActive && (
              <button type="button" className={BUTTON} disabled={!txHash} onClick={() => void revoke(wallet.username)}>
                {t("wallets.revoke")}
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="text-micro text-ink-soft">
        {t("wallets.backups", {
          value: backups.map((backup) => `${backup.role}: ${backup.backup ?? "—"}`).join(" · "),
        })}
      </p>
    </section>
  );
}
