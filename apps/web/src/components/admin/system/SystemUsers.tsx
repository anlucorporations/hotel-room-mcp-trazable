"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAdminContext } from "@/components/admin/AdminLayout";

interface SystemUser {
  readonly username: string;
  readonly role: "DEFAULT_ADMIN_ROLE" | "RECEPTION_ROLE";
  readonly active: boolean;
  readonly failedAttempts: number;
  readonly lockedUntil: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface ProvisionResult {
  readonly username: string;
  readonly role: string;
  readonly password: string;
  readonly secret: string;
  readonly uri: string;
  readonly recoveryCodes: readonly string[];
}

const FIELD =
  "min-h-touch w-full rounded-brand border border-line bg-shell px-3 text-ink outline-none focus:border-sea";
const ACTION =
  "min-h-touch rounded-pill bg-sea px-5 font-semibold text-shell transition-colors hover:bg-sea-deep disabled:opacity-60";
const GHOST =
  "min-h-touch rounded-pill border border-line px-4 font-semibold text-ink transition-colors hover:bg-sand-2 disabled:opacity-60";

/**
 * Sistemas → Usuarios (RF-42, CU-42).
 *
 * Lista los operadores, permite crear/rotar credenciales (contraseña + TOTP + códigos de rescate,
 * mostrados **una sola vez**) y activar/desactivar. La autorización real la impone la API
 * (`DEFAULT_ADMIN_ROLE`); esta pantalla solo la refleja.
 */
export function SystemUsers() {
  const t = useTranslations("system");
  const { apiFetch, sessionUsername } = useAdminContext();

  const [users, setUsers] = useState<readonly SystemUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provisioned, setProvisioned] = useState<ProvisionResult | null>(null);
  const [copied, setCopied] = useState(false);

  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"DEFAULT_ADMIN_ROLE" | "RECEPTION_ROLE">("RECEPTION_ROLE");
  const [password, setPassword] = useState("");

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/admin/system/users");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t("loadError"));
      setUsers(data.users ?? []);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [apiFetch, t]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setProvisioned(null);
    setCopied(false);
    try {
      const res = await apiFetch("/api/admin/system/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), role, password: password || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || t("createError"));
      setProvisioned(data);
      setUsername("");
      setPassword("");
      await load();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("createError"));
    }
  }

  async function toggleActive(user: SystemUser): Promise<void> {
    setError(null);
    try {
      const res = await apiFetch("/api/admin/system/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user.username, active: !user.active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || t("updateError"));
      await load();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("updateError"));
    }
  }

  async function copyCredentials(): Promise<void> {
    if (!provisioned) return;
    const text = [
      `${t("usernameLabel")}: ${provisioned.username}`,
      `${t("roleLabel")}: ${provisioned.role}`,
      `${t("passwordLabel")}: ${provisioned.password}`,
      `${t("secretLabel")}: ${provisioned.secret}`,
      `${t("uriLabel")}: ${provisioned.uri}`,
      `${t("recoveryLabel")}: ${provisioned.recoveryCodes.join(" ")}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p role="alert" data-testid="system-users-error" className="rounded-brand border border-terracotta-text/40 bg-sand-2 px-4 py-3 text-small text-terracotta-text">
          {error}
        </p>
      )}

      <section aria-labelledby="system-users-list" className="rounded-brand border border-line bg-shell p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="system-users-list" className="font-display text-h3 font-semibold">
            {t("listTitle")}
          </h2>
          <button type="button" onClick={() => void load()} disabled={loading} className={GHOST}>
            {loading ? t("loading") : t("refresh")}
          </button>
        </div>

        {users.length === 0 ? (
          <p data-testid="system-users-empty" className="mt-3 text-small text-ink-soft">
            {t("listEmpty")}
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table data-testid="system-users-table" className="w-full border-collapse text-small">
              <caption className="sr-only">{t("listTitle")}</caption>
              <thead>
                <tr className="border-b border-line text-left text-ink-soft">
                  <th scope="col" className="px-2 py-2">{t("colUser")}</th>
                  <th scope="col" className="px-2 py-2">{t("colRole")}</th>
                  <th scope="col" className="px-2 py-2">{t("colState")}</th>
                  <th scope="col" className="px-2 py-2">{t("colLock")}</th>
                  <th scope="col" className="px-2 py-2">{t("colUpdated")}</th>
                  <th scope="col" className="px-2 py-2">{t("colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isSelf = user.username === sessionUsername;
                  return (
                    <tr key={user.username} className="border-b border-line/60">
                      <td className="px-2 py-2 font-mono text-micro">
                        {user.username}
                        {isSelf && <span className="ml-2 rounded-pill bg-sand-2 px-2 py-0.5 text-micro">{t("selfBadge")}</span>}
                      </td>
                      <td className="px-2 py-2">{user.role === "DEFAULT_ADMIN_ROLE" ? t("roleAdmin") : t("roleReception")}</td>
                      <td className="px-2 py-2">{user.active ? t("stateActive") : t("stateInactive")}</td>
                      <td className="px-2 py-2">
                        {user.lockedUntil ? t("locked") : user.failedAttempts > 0 ? t("failedAttempts", { count: user.failedAttempts }) : "—"}
                      </td>
                      <td className="px-2 py-2 text-micro text-ink-soft">{String(user.updatedAt).slice(0, 10)}</td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          data-testid={`toggle-${user.username}`}
                          onClick={() => void toggleActive(user)}
                          disabled={isSelf}
                          title={isSelf ? t("selfProtected") : undefined}
                          className={GHOST}
                        >
                          {user.active ? t("deactivate") : t("activate")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <form onSubmit={submit} className="rounded-brand border border-line bg-shell p-5">
        <h2 className="font-display text-h3 font-semibold">{t("createTitle")}</h2>
        <p className="mt-1 text-small text-ink-soft">{t("createHint")}</p>

        <div className="mt-4 grid gap-3 tablet:grid-cols-3">
          <label className="flex flex-col gap-1 text-small text-ink">
            {t("usernameLabel")}
            <input
              data-testid="system-user-username"
              type="email"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className={FIELD}
              placeholder="operador@hotel.es"
            />
          </label>
          <label className="flex flex-col gap-1 text-small text-ink">
            {t("roleLabel")}
            <select data-testid="system-user-role" value={role} onChange={(event) => setRole(event.target.value as typeof role)} className={FIELD}>
              <option value="RECEPTION_ROLE">{t("roleReception")}</option>
              <option value="DEFAULT_ADMIN_ROLE">{t("roleAdmin")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-small text-ink">
            {t("passwordLabel")}
            <input
              data-testid="system-user-password"
              type="text"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={FIELD}
              placeholder={t("passwordHint")}
            />
          </label>
        </div>

        <button type="submit" data-testid="system-user-submit" className={`mt-4 ${ACTION}`}>
          {t("createSubmit")}
        </button>
      </form>

      {provisioned && (
        <section data-testid="system-user-credentials" role="status" className="rounded-brand border border-olive bg-sand-2 p-5">
          <h2 className="font-display text-h3 font-semibold">{t("credentialsTitle")}</h2>
          <p className="mt-1 text-small text-ink-soft">{t("credentialsHint")}</p>
          <dl className="mt-3 grid gap-2 text-small">
            <div><dt className="text-ink-soft">{t("usernameLabel")}</dt><dd className="font-mono">{provisioned.username}</dd></div>
            <div><dt className="text-ink-soft">{t("passwordLabel")}</dt><dd className="font-mono">{provisioned.password}</dd></div>
            <div><dt className="text-ink-soft">{t("secretLabel")}</dt><dd className="font-mono break-all">{provisioned.secret}</dd></div>
            <div><dt className="text-ink-soft">{t("uriLabel")}</dt><dd className="font-mono break-all">{provisioned.uri}</dd></div>
            <div><dt className="text-ink-soft">{t("recoveryLabel")}</dt><dd className="font-mono break-all">{provisioned.recoveryCodes.join(" ")}</dd></div>
          </dl>
          <button type="button" onClick={() => void copyCredentials()} data-testid="system-user-copy" className={`mt-4 ${GHOST}`}>
            {copied ? t("copied") : t("copy")}
          </button>
        </section>
      )}
    </div>
  );
}
