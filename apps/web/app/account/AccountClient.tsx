"use client";

import { useEffect, useMemo, useState } from "react";
import { useWallet } from "~~/components/providers/WalletProvider";
import { useBalances } from "~~/hooks/useBalances";
import GenericModal from "~~/components/ui/GenericModal";
import { WalletDisconnectConfirm } from "~~/components/WalletDisconnectConfirm";
import { resolveWebSocketUrl } from "~~/utils/ws-url";

type GameHistoryRow = {
  id: string;
  mode: string;
  table: string;
  result: string;
  prize: string;
  date: string;
};

export default function AccountClient() {
  const { status, address, formatAddress, disconnect } = useWallet();
  const { balances, hydrated, convert } = useBalances();
  const isConnected = status === "connected" && !!address;
  const [storedEmail, setStoredEmail] = useState("");
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [coinAmount, setCoinAmount] = useState("0");
  const [ticketActions, setTicketActions] = useState<Record<"ticket_x" | "ticket_y" | "ticket_z", { buy: string; sell: string }>>({
    ticket_x: { buy: "0", sell: "0" },
    ticket_y: { buy: "0", sell: "0" },
    ticket_z: { buy: "0", sell: "0" },
  });
  const ticketLabelMap: Record<"ticket_x" | "ticket_y" | "ticket_z", string> = {
    ticket_x: "X:",
    ticket_y: "Y:",
    ticket_z: "Z:",
  };
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertDirection, setConvertDirection] = useState<"coinsToTickets" | "ticketsToCoins">("coinsToTickets");
  const [convertTier, setConvertTier] = useState<"ticket_x" | "ticket_y" | "ticket_z">("ticket_x");
  const [convertAmount, setConvertAmount] = useState("1");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const buyRate = 250;  // coins per ticket when buying tickets
  const sellRate = 220; // coins received per ticket when selling tickets
  useEffect(() => {
    if (!address) return;
    const ws = resolveWebSocketUrl();
    if (!ws) return;
    const base = new URL(ws);
    base.protocol = base.protocol === "wss:" ? "https:" : "http:";
    fetch(`${base.origin}/api/user/profile?wallet=${address}`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.user?.email) setStoredEmail(data.user.email);
      })
      .catch(() => {});
  }, [address]);

  const [recentTransactions, setRecentTransactions] = useState<
    Array<{ id: string; type: string; asset: string; amount: string; price: string; time: string }>
  >([]);
  const [transactionPage, setTransactionPage] = useState(0);
  const [sessionPage, setSessionPage] = useState(0);

  const handleSaveEmail = async () => {
    if (!address) return;
    const ws = resolveWebSocketUrl();
    if (!ws) return;
    const base = new URL(ws);
    base.protocol = base.protocol === "wss:" ? "https:" : "http:";
    await fetch(`${base.origin}/api/user/email?wallet=${address}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailDraft.trim() }),
    });
    setStoredEmail(emailDraft.trim());
    setEmailModalOpen(false);
  };

  useEffect(() => {
    if (!address) return;
    const ws = resolveWebSocketUrl();
    if (!ws) return;
    const base = new URL(ws);
    base.protocol = base.protocol === "wss:" ? "https:" : "http:";
    fetch(`${base.origin}/api/user/ledger?wallet=${address}&limit=50`)
      .then((res) => res.json())
      .then((data) => {
        if (!Array.isArray(data?.entries)) return;
        const rows = data.entries.map((entry: any) => {
          const assetMap: Record<string, string> = {
            COINS: "Coins",
            TICKET_X: "Ticket X",
            TICKET_Y: "Ticket Y",
            TICKET_Z: "Ticket Z",
          };
          const sign = entry.type === "PAYOUT" || entry.type === "CLAIM_FREE" || entry.type === "MINT" || entry.type === "CONVERT_BUY" || entry.type === "CONVERT_SELL"
            ? "+"
            : "-";
          return {
            id: entry.id,
            type: entry.type,
            asset: assetMap[entry.asset] ?? entry.asset,
            amount: `${sign}${entry.amount}`,
            price: entry.metadata?.rate ? String(entry.metadata.rate) : "—",
            time: new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          };
        });
        setRecentTransactions(rows);
        setTransactionPage(0);
      })
      .catch(() => {});
  }, [address]);

  const openConvert = (direction: "coinsToTickets" | "ticketsToCoins", tier: "ticket_x" | "ticket_y" | "ticket_z", amount: string) => {
    setConvertDirection(direction);
    setConvertTier(tier);
    setConvertAmount(amount && Number(amount) > 0 ? amount : "1");
    setConvertOpen(true);
  };

  const rate = convertDirection === "coinsToTickets" ? buyRate : sellRate;
  const ticketQty = Math.max(1, Math.floor(Number(convertAmount) || 0));
  const coinQty = ticketQty * rate;

  const performConversion = async () => {
    const amt = Math.max(0, Math.floor(Number(convertAmount) || 0));
    if (amt <= 0) return false;
    const result = await convert(convertDirection, convertTier, amt);
    return result.ok;
  };

  const history = useMemo<GameHistoryRow[]>(() => [], []);

  const pagedTransactions = useMemo(() => {
    const start = transactionPage * 10;
    return recentTransactions.slice(start, start + 10);
  }, [recentTransactions, transactionPage]);

  const pagedSessions = useMemo(() => {
    const start = sessionPage * 10;
    return history.slice(start, start + 10);
  }, [history, sessionPage]);

  if (!isConnected) {
    return (
      <main className="min-h-screen pb-16 pt-10">
        <div className="content-wrap space-y-3">
          <h1 className="text-2xl md:text-3xl">Account</h1>
          <div className="rule" aria-hidden="true" />
          <p className="text-sm text-white/70">
            Connect your wallet to view account telemetry.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-16 pt-10">
      <div className="content-wrap space-y-10">
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h1 className="text-2xl md:text-3xl">Account</h1>
          </div>
          <div className="rule" aria-hidden="true" />
          <div className="space-y-3 text-sm text-white/70">
            <table className="w-full border-separate border-spacing-y-2">
              <tbody>
                <tr className="align-middle">
                  <td className="text-white/70 min-w-[120px]">Wallet</td>
                  <td className="text-white truncate" title={address}>
                    {formatAddress(address)}
                  </td>
                  <td className="text-white/60 min-w-[140px] text-right">Connected</td>
                  <td className="text-right min-w-[100px]">
                    <button className="tbtn text-xs" onClick={() => setConfirmDisconnect(true)}>
                      Disconnect
                    </button>
                  </td>
                </tr>
                <tr className="align-middle">
                  <td className="text-white/70 min-w-[120px]">Email</td>
                  <td className="align-middle">
                    <input
                      type="email"
                      value={emailDraft || storedEmail}
                      onChange={(e) => setEmailDraft(e.target.value)}
                      placeholder="Enter email"
                      className="w-full max-w-[260px] rounded border border-white/10 bg-black px-3 py-2 text-sm text-white"
                    />
                  </td>
                  <td className="text-white/60 min-w-[140px] text-right">
                    {storedEmail ? "Saved" : "Not connected"}
                  </td>
                  <td className="text-right min-w-[100px]">
                    <button
                      className="tbtn text-xs"
                      onClick={() => {
                        setEmailDraft(emailDraft || storedEmail || "");
                        setEmailModalOpen(true);
                      }}
                    >
                      Save
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-xl">Balances</h2>
          </div>
          <div className="rule" aria-hidden="true" />
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <div className="text-[11px] uppercase tracking-[0.4em] text-white/50">Tokens</div>
              <BalanceRow
                label="$POKER"
                balance={hydrated ? balances.coins.toLocaleString() : "—"}
                amount={coinAmount}
                onAmountChange={setCoinAmount}
                onBuy={() => openConvert("ticketsToCoins", "ticket_x", coinAmount)}
                onSell={() => openConvert("coinsToTickets", "ticket_x", coinAmount)}
              />
            </div>
            <div className="space-y-3">
              <div className="text-[11px] uppercase tracking-[0.4em] text-white/50">Tickets</div>
              <div className="space-y-2">
                {(["ticket_x", "ticket_y", "ticket_z"] as const).map((tier) => (
                  <BalanceRow
                    key={tier}
                    label={ticketLabelMap[tier]}
                    balance={hydrated ? balances.tickets[tier].toString() : "—"}
                    amount={ticketActions[tier].buy}
                    onAmountChange={(val) =>
                      setTicketActions((prev) => ({
                        ...prev,
                        [tier]: { ...prev[tier], buy: val, sell: prev[tier].sell },
                      }))
                    }
                    onBuy={() => openConvert("coinsToTickets", tier, ticketActions[tier].buy)}
                    onSell={() => openConvert("ticketsToCoins", tier, ticketActions[tier].sell)}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-xl">Recent transactions</h2>
          </div>
          <div className="rule" aria-hidden="true" />
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-white/10 text-white/60 uppercase text-[11px] tracking-[0.14em]">
                <tr>
                  <th className="py-2 pr-4 text-left">Type</th>
                  <th className="py-2 pr-4 text-left">Asset</th>
                  <th className="py-2 pr-4 text-left">Amount</th>
                  <th className="py-2 pr-4 text-left">Price</th>
                  <th className="py-2 text-left">Time</th>
                </tr>
              </thead>
              <tbody>
                {pagedTransactions.map((row) => (
                  <tr key={row.id} className="border-b border-white/10">
                    <td className="py-2 pr-4 text-xs text-white/90">{row.type}</td>
                    <td className="py-2 pr-4 text-white/90">{row.asset}</td>
                    <td className="py-2 pr-4 text-white/80">{row.amount}</td>
                    <td className="py-2 pr-4 text-white/80">{row.price}</td>
                    <td className="py-2 text-white/60 text-xs">{row.time}</td>
                  </tr>
                ))}
                {pagedTransactions.length === 0 ? (
                  <tr>
                    <td className="py-3 text-sm text-white/60" colSpan={5}>
                      No transactions yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {recentTransactions.length > 10 ? (
            <div className="flex items-center justify-end gap-3 text-xs text-white/70">
              <button
                className="tbtn text-xs"
                onClick={() => setTransactionPage((p) => Math.max(0, p - 1))}
                disabled={transactionPage === 0}
              >
                Prev
              </button>
              <span>
                Page {transactionPage + 1} of {Math.ceil(recentTransactions.length / 10)}
              </span>
              <button
                className="tbtn text-xs"
                onClick={() =>
                  setTransactionPage((p) =>
                    Math.min(p + 1, Math.ceil(recentTransactions.length / 10) - 1),
                  )
                }
                disabled={transactionPage >= Math.ceil(recentTransactions.length / 10) - 1}
              >
                Next
              </button>
            </div>
          ) : null}
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-xl">Recent sessions</h2>
          </div>
          <div className="rule" aria-hidden="true" />
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-white/10 text-white/60 uppercase text-[11px] tracking-[0.14em]">
                <tr>
                  <th className="py-2 pr-4 text-left">Mode</th>
                  <th className="py-2 pr-4 text-left">Table</th>
                  <th className="py-2 pr-4 text-left">Result</th>
                  <th className="py-2 pr-4 text-left">Prize</th>
                  <th className="py-2 text-left">Date</th>
                </tr>
              </thead>
              <tbody>
                {pagedSessions.map((row) => (
                  <tr key={row.id} className="border-b border-white/10">
                    <td className="py-2 pr-4 text-xs text-white/90">{row.mode}</td>
                    <td className="py-2 pr-4 text-white/90">{row.table}</td>
                    <td className="py-2 pr-4 text-white/80">{row.result}</td>
                    <td className="py-2 pr-4 text-white/80">{row.prize}</td>
                    <td className="py-2 text-white/60 text-xs">{row.date}</td>
                  </tr>
                ))}
                {history.length === 0 ? (
                  <tr>
                    <td className="py-3 text-sm text-white/60" colSpan={5}>
                      No sessions yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {history.length > 10 ? (
            <div className="flex items-center justify-end gap-3 text-xs text-white/70">
              <button
                className="tbtn text-xs"
                onClick={() => setSessionPage((p) => Math.max(0, p - 1))}
                disabled={sessionPage === 0}
              >
                Prev
              </button>
              <span>
                Page {sessionPage + 1} of {Math.ceil(history.length / 10)}
              </span>
              <button
                className="tbtn text-xs"
                onClick={() =>
                  setSessionPage((p) => Math.min(p + 1, Math.ceil(history.length / 10) - 1))
                }
                disabled={sessionPage >= Math.ceil(history.length / 10) - 1}
              >
                Next
              </button>
            </div>
          ) : null}
        </section>
      </div>
      {convertOpen ? (
        <GenericModal modalId="convert-modal" open={convertOpen} onClose={() => setConvertOpen(false)}>
            <div className="space-y-3 text-sm text-white/80">
              <div className="text-[11px] uppercase tracking-[0.4em] text-white/50">Convert</div>

              <div className="space-y-2 text-sm">
                {convertDirection === "coinsToTickets" ? (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="text-white/80 min-w-[110px]">Coins</span>
                      <input
                        type="number"
                        min="1"
                        value={coinQty}
                        onChange={(e) => {
                          const next = Math.max(1, Math.floor(Number(e.target.value) / rate) || 1);
                          setConvertAmount(String(next));
                        }}
                        className="w-28 rounded border border-white/10 bg-black px-3 py-1 text-right text-white"
                        placeholder="0"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-white/80 min-w-[110px]">Tickets</span>
                      <input
                        type="number"
                        min="1"
                        value={ticketQty}
                        onChange={(e) => setConvertAmount(String(Math.max(1, Math.floor(Number(e.target.value) || 0))))}
                        className="w-28 rounded border border-white/10 bg-black px-3 py-1 text-right text-white"
                        placeholder="0"
                      />
                      <span className="text-white/70 text-xs uppercase">{convertTier.replace("ticket_", "").toUpperCase()}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="text-white/80 min-w-[110px]">Tickets</span>
                      <input
                        type="number"
                        min="1"
                        value={ticketQty}
                        onChange={(e) => setConvertAmount(String(Math.max(1, Math.floor(Number(e.target.value) || 0))))}
                        className="w-28 rounded border border-white/10 bg-black px-3 py-1 text-right text-white"
                        placeholder="0"
                      />
                      <span className="text-white/70 text-xs uppercase">{convertTier.replace("ticket_", "").toUpperCase()}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-white/80 min-w-[110px]">Coins</span>
                      <input
                        type="number"
                        min="1"
                        value={coinQty}
                        onChange={(e) => {
                          const next = Math.max(1, Math.floor(Number(e.target.value) / rate) || 1);
                          setConvertAmount(String(next));
                        }}
                        className="w-28 rounded border border-white/10 bg-black px-3 py-1 text-right text-white"
                        placeholder="0"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs text-white/60">
                <span>{convertDirection === "coinsToTickets" ? "Rate" : "Return"}:</span>
                <span className="text-white">
                  {convertDirection === "coinsToTickets" ? `${rate} coins → 1 ticket` : `1 ticket → ${rate} coins`}
                </span>
              </div>

              <div className="flex justify-end gap-2 text-xs">
                <button className="tbtn-secondary" onClick={() => setConvertOpen(false)}>
                  Cancel
                </button>
                <button
                  className="tbtn"
                  onClick={async () => {
                    const ok = await performConversion();
                    if (ok) {
                      setConvertOpen(false);
                    }
                  }}
                >
                  Confirm
                </button>
              </div>
            </div>
        </GenericModal>
      ) : null}

      <WalletDisconnectConfirm
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
      />
    </main>
  );
}

function BalanceRow({
  label,
  balance,
  amount,
  onAmountChange,
  onBuy,
  onSell,
}: {
  label: string;
  balance: string;
  amount: string;
  onAmountChange: (next: string) => void;
  onBuy: () => void;
  onSell: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black p-3">
      <div className="flex items-center gap-3 text-sm text-white">
        <span className="min-w-[60px] text-white/70">{label}</span>
        <span className="text-white/90">{balance}</span>
        <input
          type="number"
          min="0"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          className="ml-auto w-28 rounded border border-white/10 bg-black px-3 py-1 text-right text-white"
          placeholder="0"
        />
        <button className="tbtn text-xs" onClick={onBuy}>
          Buy
        </button>
        <button className="tbtn text-xs" onClick={onSell}>
          Sell
        </button>
      </div>
    </div>
  );
}
