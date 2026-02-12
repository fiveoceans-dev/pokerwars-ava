"use client";

import { useEffect, useMemo, useState } from "react";
import { GovernanceRole } from "~~/game-engine";
import { useGameStore } from "~~/hooks/useGameStore";
import { resolveWebSocketUrl } from "~~/utils/ws-url";
import { getAuthToken } from "~~/utils/auth";
import { shortAddress } from "~~/utils/address";

interface GameTemplate {
  id: string;
  name: string;
  gameType: string;
  type: string;
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
  defaultBuyIn: number;
  currency: string;
  schedule?: string;
}

interface GameConfig {
  actionTimeoutSeconds: number;
  gameStartCountdownSeconds: number;
  minPlayersToStart: number;
  maxPlayersPerTable: number;
  streetDealDelaySeconds: number;
  newHandDelaySeconds: number;
}

type RoleAssignment = {
  wallet: string;
  role: GovernanceRole;
  createdAt: string;
};

type BalancePoolView = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  asset: string;
  accountId: string;
  account: {
    coins: string;
    ticket_x: string;
    ticket_y: string;
    ticket_z: string;
  };
  updatedAt: string;
};

const roleOptions: { value: GovernanceRole; label: string }[] = [
  { value: "director", label: "Director" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Administrator" },
  { value: "promoter", label: "Promoter" },
];

const roleMapping: Record<GovernanceRole, string> = {
  director: "DIRECTOR",
  manager: "MANAGER",
  admin: "ADMIN",
  promoter: "PROMOTER",
};

const formatLargeNumber = (value: string) =>
  value.replace(/\B(?=(\d{3})+(?!\d))/g, ",") || "0";

const toLabel = (role: string) => role.charAt(0).toUpperCase() + role.slice(1);

export default function GovernanceClient() {
  const { governanceRoles } = useGameStore();
  const hasGovernanceAccess = governanceRoles.length > 0;

  const [templates, setTemplates] = useState<GameTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  const [config, setConfig] = useState<GameConfig | null>(null);
  const [configDraft, setConfigDraft] = useState<GameConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configMessage, setConfigMessage] = useState<string | null>(null);

  const [roles, setRoles] = useState<RoleAssignment[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [roleWallet, setRoleWallet] = useState("");
  const [roleType, setRoleType] = useState<GovernanceRole>("director");
  const [roleMessage, setRoleMessage] = useState<string | null>(null);
  const [poolData, setPoolData] = useState<BalancePoolView[]>([]);
  const [poolsLoading, setPoolsLoading] = useState(false);
  const [poolsError, setPoolsError] = useState<string | null>(null);

  const apiOrigin = useMemo(() => {
    try {
      const wsUrl = resolveWebSocketUrl();
      if (!wsUrl) return null;
      const url = new URL(wsUrl);
      url.protocol = url.protocol === "wss:" ? "https:" : "http:";
      return url.origin;
    } catch {
      return null;
    }
  }, []);

  const fetchHeaders = () => {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  };

  const fetchTemplates = async () => {
    if (!apiOrigin) return;
    setTemplatesLoading(true);
    try {
      const res = await fetch(`${apiOrigin}/api/templates`);
      if (!res.ok) {
        throw new Error("Unable to load templates");
      }
      const data = await res.json();
      setTemplates(data.templates || []);
      setTemplatesError(null);
    } catch (err) {
      console.error(err);
      setTemplatesError("Failed to load templates");
    } finally {
      setTemplatesLoading(false);
    }
  };

  const fetchGameConfig = async () => {
    if (!apiOrigin || !hasGovernanceAccess) return;
    setConfigLoading(true);
    try {
      const res = await fetch(`${apiOrigin}/api/admin/game-config`, {
        headers: fetchHeaders(),
      });
      if (!res.ok) {
        throw new Error("Unable to load game configuration");
      }
      const data = await res.json();
      setConfig(data.config);
      setConfigDraft(data.config);
      setConfigMessage(null);
    } catch (err) {
      console.error(err);
      setConfigMessage("Unable to load configuration");
    } finally {
      setConfigLoading(false);
    }
  };

  const fetchRoles = async () => {
    if (!apiOrigin || !hasGovernanceAccess) return;
    setRolesLoading(true);
    try {
      const res = await fetch(`${apiOrigin}/api/admin/roles`, {
        headers: fetchHeaders(),
      });
      if (!res.ok) {
        throw new Error("Unable to load governance roles");
      }
      const data = await res.json();
      setRoles(data.roles || []);
      setRolesError(null);
    } catch (err) {
      console.error(err);
      setRolesError("Failed to load governance roles");
    } finally {
      setRolesLoading(false);
    }
  };

  const fetchPools = async () => {
    if (!apiOrigin || !hasGovernanceAccess) return;
    setPoolsLoading(true);
    try {
      const res = await fetch(`${apiOrigin}/api/admin/balance-pools`, {
        headers: fetchHeaders(),
      });
      if (!res.ok) {
        throw new Error("Unable to load balances");
      }
      const data = await res.json();
      setPoolData(data.pools || []);
      setPoolsError(null);
    } catch (err) {
      console.error(err);
      setPoolsError("Failed to load pool balances");
    } finally {
      setPoolsLoading(false);
    }
  };

  const handleConfigSave = async () => {
    if (!apiOrigin || !hasGovernanceAccess || !configDraft) return;
    setConfigSaving(true);
    try {
      const res = await fetch(`${apiOrigin}/api/admin/game-config`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...fetchHeaders(),
        },
        body: JSON.stringify(configDraft),
      });
      if (!res.ok) {
        throw new Error("Failed to save configuration");
      }
      const data = await res.json();
      setConfig(data.config);
      setConfigDraft(data.config);
      setConfigMessage("Configuration saved");
    } catch (err) {
      console.error(err);
      setConfigMessage("Unable to save config");
    } finally {
      setConfigSaving(false);
    }
  };

  const handleRoleAssign = async () => {
    if (!apiOrigin || !hasGovernanceAccess || !roleWallet.trim()) return;
    setRoleMessage(null);
    try {
      const res = await fetch(`${apiOrigin}/api/admin/roles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...fetchHeaders(),
        },
      body: JSON.stringify({ wallet: roleWallet, role: roleMapping[roleType] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to assign role");
      }
      setRoleWallet("");
      setRoleMessage("Role granted");
      await fetchRoles();
    } catch (err) {
      setRoleMessage(err instanceof Error ? err.message : "Unable to assign role");
    }
  };

  useEffect(() => {
    void fetchTemplates();
  }, [apiOrigin]);

  useEffect(() => {
    if (!hasGovernanceAccess) {
      setConfig(null);
      setConfigDraft(null);
      setRoles([]);
      setPoolData([]);
      return;
    }
    void fetchGameConfig();
    void fetchRoles();
    void fetchPools();
  }, [hasGovernanceAccess, apiOrigin]);

  return (
    <main className="min-h-screen pb-16 pt-10">
      <div className="content-wrap space-y-10">
        <section className="rounded-2xl border border-white/5 bg-gradient-to-br from-black/60 to-white/5 p-6 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-white/60">-</p>
              <h1 className="text-3xl font-semibold">Governance</h1>
            </div>
            <div className="text-right">
              <p className="text-sm text-white/60">-</p>
              <p className="text-lg font-mono text-amber-400"></p>
            </div>
          </div>
          <p className="mt-4 text-sm text-white/60">
            Governance (directors, managers,
            promoters, and admins)
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
              <p className="text-xs uppercase tracking-widest text-white/50">Action Timeout</p>
              <p className="text-2xl font-mono text-white">{config?.actionTimeoutSeconds ?? "—"}s</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
              <p className="text-xs uppercase tracking-widest text-white/50">Players to Start</p>
              <p className="text-2xl font-mono text-white">{config?.minPlayersToStart ?? "—"}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
              <p className="text-xs uppercase tracking-widest text-white/50">Tables Max Seats</p>
              <p className="text-2xl font-mono text-white">{config?.maxPlayersPerTable ?? "—"}</p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-white/5 bg-black/60 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Game Configuration</h2>
            <div className="text-xs uppercase tracking-widest text-white/40">Edit values stored in DB</div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {(
              [
                { label: "Action Timeout (s)", field: "actionTimeoutSeconds" },
                { label: "Start Countdown (s)", field: "gameStartCountdownSeconds" },
                { label: "Min Players to Start", field: "minPlayersToStart" },
                { label: "Max Players per Table", field: "maxPlayersPerTable" },
                { label: "Street Deal Delay (s)", field: "streetDealDelaySeconds" },
                { label: "New Hand Delay (s)", field: "newHandDelaySeconds" },
              ] as const
            ).map(({ label, field }) => (
              <label key={field} className="flex flex-col gap-1 text-xs text-white/60">
                <span>{label}</span>
                <input
                  type="number"
                  value={(configDraft as any)?.[field] ?? ""}
                  onChange={(event) =>
                    setConfigDraft((prev) =>
                      prev
                        ? { ...prev, [field]: Math.max(1, Number(event.target.value) || 1) }
                        : null,
                    )
                  }
                  disabled={!hasGovernanceAccess || configLoading}
                  className="rounded border border-white/10 bg-black px-3 py-2 text-sm text-white shadow-inner"
                />
              </label>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={handleConfigSave}
              disabled={!hasGovernanceAccess || configSaving || configLoading || !configDraft}
              className="tbtn text-xs disabled:opacity-50"
            >
              {configSaving ? "Saving..." : "Save Config"}
            </button>
            {configMessage && (
              <p className="text-xs text-white/60">{configMessage}</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-white/5 bg-black/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Game Templates</h2>
              <p className="text-sm text-white/60">Live templates are sourced directly from the database.</p>
            </div>
            <button
              onClick={() => {
                void fetchTemplates();
              }}
              className="tbtn text-xs text-white/60 disabled:opacity-50"
              disabled={!apiOrigin}
            >
              Refresh
            </button>
          </div>
          <div className="mt-4 overflow-x-auto rounded-lg border border-white/5">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-white/60 uppercase text-[10px] tracking-widest">
                <tr>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-left">Blinds</th>
                  <th className="px-4 py-2 text-left">Buy-in</th>
                  <th className="px-4 py-2 text-left">Currency</th>
                  <th className="px-4 py-2 text-left">Schedule</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {templatesLoading ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-white/50 italic">Loading...</td>
                  </tr>
                ) : templatesError ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-rose-400">{templatesError}</td>
                  </tr>
                ) : templates.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-white/60">No templates yet.</td>
                  </tr>
                ) : (
                  templates.map((template) => (
                    <tr key={template.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 font-semibold text-white">{template.name}</td>
                      <td className="px-4 py-3 text-white/70">{template.type.toUpperCase()}</td>
                      <td className="px-4 py-3 text-white/70">{template.smallBlind}/{template.bigBlind}</td>
                      <td className="px-4 py-3 text-white/70">{template.minBuyIn} - {template.maxBuyIn}</td>
                      <td className="px-4 py-3 text-white/70">{template.currency}</td>
                      <td className="px-4 py-3 text-white/70">{template.schedule || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-white/5 bg-black/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Roles & Access</h2>
              <p className="text-sm text-white/60">Assign new governance wallets and inspect the current crew.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Wallet (0x...)"
                value={roleWallet}
                onChange={(event) => setRoleWallet(event.target.value)}
                className="w-full max-w-[220px] rounded border border-white/10 bg-black px-3 py-2 text-xs text-white"
              />
              <select
                className="rounded border border-white/10 bg-black px-3 py-2 text-xs text-white"
                value={roleType}
                onChange={(event) => setRoleType(event.target.value as GovernanceRole)}
              >
                {roleOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <button
                onClick={handleRoleAssign}
                disabled={!hasGovernanceAccess}
                className="tbtn text-xs disabled:opacity-50"
              >
                Add Role
              </button>
            </div>
          </div>
          {roleMessage && <p className="mt-3 text-xs text-white/60">{roleMessage}</p>}
          <div className="mt-4 overflow-x-auto rounded-lg border border-white/5">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-white/60 uppercase text-[10px] tracking-widest">
                <tr>
                  <th className="px-4 py-2 text-left">Wallet</th>
                  <th className="px-4 py-2 text-left">Role</th>
                  <th className="px-4 py-2 text-left">Granted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rolesLoading ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-white/50 italic">Loading roles...</td>
                  </tr>
                ) : rolesError ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-rose-400">{rolesError}</td>
                  </tr>
                ) : roles.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-white/60">No active assignments</td>
                  </tr>
                ) : (
                  roles.map((assignment) => (
                    <tr key={`${assignment.wallet}-${assignment.role}`} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 font-mono text-white/60">{shortAddress(assignment.wallet)}</td>
                      <td className="px-4 py-3 text-white/70">{toLabel(assignment.role)}</td>
                      <td className="px-4 py-3 text-white/50">{new Date(assignment.createdAt).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-white/5 bg-black/60 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Treasury & Balance Pools</h2>
              <p className="text-sm text-white/60">Track coins, tickets, and promo bank balances.</p>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto rounded-lg border border-white/5">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-white/60 uppercase text-[10px] tracking-widest">
                <tr>
                  <th className="px-4 py-2 text-left">Pool</th>
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-left">Asset</th>
                  <th className="px-4 py-2 text-right">Coins</th>
                  <th className="px-4 py-2 text-right">Tickets (X/Y/Z)</th>
                  <th className="px-4 py-2 text-right">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {poolsLoading ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-white/50 italic">Loading balances...</td>
                  </tr>
                ) : poolsError ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-rose-400">{poolsError}</td>
                  </tr>
                ) : poolData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-white/60">No pools configured</td>
                  </tr>
                ) : (
                  poolData.map((pool) => (
                    <tr key={pool.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-white font-medium">{pool.name}</td>
                      <td className="px-4 py-3 text-white/70">{pool.type}</td>
                      <td className="px-4 py-3 text-white/70">{pool.asset}</td>
                      <td className="px-4 py-3 text-right text-white/70">{formatLargeNumber(pool.account.coins)}</td>
                      <td className="px-4 py-3 text-right text-white/60">{formatLargeNumber(pool.account.ticket_x)} / {formatLargeNumber(pool.account.ticket_y)} / {formatLargeNumber(pool.account.ticket_z)}</td>
                      <td className="px-4 py-3 text-right text-xs text-white/50">{new Date(pool.updatedAt).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-white/5 bg-black/60 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Operations Hooks</h2>
              <p className="text-sm text-white/60">Hot-reload templates, coordinate treasury tops-ups, and keep DAO rules synchronized.</p>
            </div>
            <button
              onClick={async () => {
                if (!apiOrigin || !hasGovernanceAccess) return;
                try {
                  const res = await fetch(`${apiOrigin}/api/admin/sync`, {
                    method: "POST",
                    headers: fetchHeaders(),
                  });
                  if (!res.ok) throw new Error("Sync failed");
                  const data = await res.json();
                  setConfigMessage(`Templates refreshed (v${data.version})`);
                  await fetchTemplates();
                } catch (err) {
                  console.error(err);
                }
              }}
              className="tbtn text-xs disabled:opacity-50"
              disabled={!hasGovernanceAccess}
            >
              Hot Reload Templates
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
