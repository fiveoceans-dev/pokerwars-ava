"use client";

import { useEffect, useMemo, useState } from "react";
import { useWallet } from "~~/components/providers/WalletProvider";
import { useBalances } from "~~/hooks/useBalances";
import GenericModal from "~~/components/ui/GenericModal";
import { resolveWebSocketUrl } from "~~/utils/ws-url";

type GameHistoryRow = {
  id: string;
  mode: string;
  table: string;
  result: string;
  prize: string;
  date: string;
};

export default function AccountPage() {
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
  const buyRate = 250;  // coins per ticket when buying tickets
  const sellRate = 220; // coins received per ticket when selling tickets
  useEffect(() => {
    if (!address) return;
    const ws = resolveWebSocketUrl();
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
  const handleSaveEmail = async () => {
    if (!address) return;
    const ws = resolveWebSocketUrl();
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
    const base = new URL(ws);
    base.protocol = base.protocol === "wss:" ? "https:" : "http:";
    fetch(`${base.origin}/api/user/ledger?wallet=${address}&limit=5`)
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

  const history = useMemo<GameHistoryRow[]>(
    () => [
      {
        id: "1",
        mode: "MTT",
        table: "Prime Time MTT",
        result: "18th",
        prize: "2,400 chips",
        date: "Jan 12, 20:30",
      },
      {
        id: "2",
        mode: "S&G",
        table: "6-max Turbo",
        result: "1st",
        prize: "1,000 chips",
        date: "Jan 10, 19:10",
      },
      {
        id: "3",
        mode: "Cash",
        table: "Mid Stakes 1/2",
        result: "+320",
        prize: "chips",
        date: "Jan 08, 22:02",
      },
    ],
    [],
  );

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
            <span className="text-[11px] uppercase tracking-[0.4em] text-white/50">
              Profile
            </span>
          </div>
          <div className="rule" aria-hidden="true" />
          <div className="space-y-3 text-sm text-white/70">
            <div className="text-[11px] uppercase tracking-[0.4em] text-white/50">WALLET</div>
            <div className="grid grid-cols-[1.5fr_1fr_auto] items-center gap-2">
              <span className="text-white">{formatAddress(address)}</span>
              <span className="text-white/60">Connected</span>
              <button className="tbtn text-xs" onClick={() => disconnect()}>
                Disconnect
              </button>
              <span className="text-[11px] uppercase tracking-[0.4em] text-white/50 col-span-3">
                EMAIL
              </span>
              <span className="text-white">{storedEmail || "Not set"}</span>
              <span className="text-white/60">{storedEmail ? "Saved locally" : "Add your email"}</span>
              <button
                className="tbtn text-xs"
                onClick={() => {
                  setEmailDraft(storedEmail || "");
                  setEmailModalOpen(true);
                }}
              >
                {storedEmail ? "Edit" : "Add"}
              </button>
            </div>
          </div>
        </div>

        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-xl">Balances</h2>
            <span className="text-[11px] uppercase tracking-[0.4em] text-white/50">
              Wallet
            </span>
          </div>
          <div className="rule" aria-hidden="true" />
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <div className="text-[11px] uppercase tracking-[0.4em] text-white/50">Coins</div>
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
                        [tier]: { buy: val, sell: val },
                      }))
                    }
                    onBuy={() => openConvert("coinsToTickets", tier, ticketActions[tier].buy)}
                    onSell={() => openConvert("ticketsToCoins", tier, ticketActions[tier].sell)}
                    compact
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-xl">Recent transactions</h2>
            <span className="text-[11px] uppercase tracking-[0.4em] text-white/50">
              Latest
            </span>
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
                {recentTransactions.map((row) => (
                  <tr key={row.id} className="border-b border-white/10">
                    <td className="py-2 pr-4 text-xs text-white/90">{row.type}</td>
                    <td className="py-2 pr-4 text-white/90">{row.asset}</td>
                    <td className="py-2 pr-4 text-white/80">{row.amount}</td>
                    <td className="py-2 pr-4 text-white/80">{row.price}</td>
                    <td className="py-2 text-white/60 text-xs">{row.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-xl">Recent sessions</h2>
            <span className="text-[11px] uppercase tracking-[0.4em] text-white/50">
              Last 3
            </span>
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
                {history.map((row) => (
                  <tr key={row.id} className="border-b border-white/10">
                    <td className="py-2 pr-4 text-xs text-white/90">{row.mode}</td>
                    <td className="py-2 pr-4 text-white/90">{row.table}</td>
                    <td className="py-2 pr-4 text-white/80">{row.result}</td>
                    <td className="py-2 pr-4 text-white/80">{row.prize}</td>
                    <td className="py-2 text-white/60 text-xs">{row.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {convertOpen ? (
        <GenericModal modalId="convert-modal" open={convertOpen} onClose={() => setConvertOpen(false)}>
            <div className="space-y-3 text-sm text-white/80">
              <div className="text-[11px] uppercase tracking-[0.4em] text-white/50">Convert</div>

              {convertDirection === "coinsToTickets" ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-white">Coins: $POKER -{coinQty}</span>
                    <div className="inputline flex-1">
                      <span className="prompt">&gt;</span>
                      <input
                        type="number"
                        min="1"
                        value={coinQty}
                        onChange={(e) => {
                          const next = Math.max(1, Math.floor(Number(e.target.value) / rate) || 1);
                          setConvertAmount(String(next));
                        }}
                        className="bg-transparent text-white w-full"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-white">Ticket: {convertTier.replace("ticket_", "").toUpperCase()}</span>
                    <div className="inputline flex-1">
                      <span className="prompt">&gt;</span>
                      <input
                        type="number"
                        min="1"
                        value={ticketQty}
                        onChange={(e) => setConvertAmount(e.target.value)}
                        className="bg-transparent text-white w-full"
                        placeholder="Quantity"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-white">Ticket: {convertTier.replace("ticket_", "").toUpperCase()}</span>
                    <div className="inputline flex-1">
                      <span className="prompt">&gt;</span>
                      <input
                        type="number"
                        min="1"
                        value={ticketQty}
                        onChange={(e) => setConvertAmount(e.target.value)}
                        className="bg-transparent text-white w-full"
                        placeholder="Quantity"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-white">Coins: $POKER +{coinQty}</span>
                    <div className="inputline flex-1">
                      <span className="prompt">&gt;</span>
                      <input
                        type="number"
                        min="1"
                        value={coinQty}
                        onChange={(e) => {
                          const next = Math.max(1, Math.floor(Number(e.target.value) / rate) || 1);
                          setConvertAmount(String(next));
                        }}
                        className="bg-transparent text-white w-full"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="text-xs text-white/60">
                Rate: 1 ticket = {rate} coins | Direction:{" "}
                {convertDirection === "coinsToTickets" ? "Coins → Tickets" : "Tickets → Coins"}
              </div>

            <div className="flex justify-end gap-3 text-xs">
              <button className="tbtn" onClick={() => setConvertOpen(false)}>
                Cancel
              </button>
              <button
                className="tbtn"
                onClick={async () => {
                  const ok = await performConversion();
                  if (ok) setConvertOpen(false);
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </GenericModal>
      ) : null}
      {emailModalOpen ? (
        <GenericModal modalId="email-modal" open={emailModalOpen} onClose={() => setEmailModalOpen(false)}>
          <div className="space-y-3 text-sm text-white/80">
            <div className="text-[11px] uppercase tracking-[0.4em] text-white/50">Edit Email</div>
            <div className="inputline">
              <span className="prompt">&gt;</span>
              <input
                type="email"
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                className="bg-transparent text-white w-full"
                placeholder="name@domain.com"
              />
            </div>
            <div className="flex justify-end gap-3 text-xs">
              <button className="tbtn" onClick={() => setEmailModalOpen(false)}>
                Cancel
              </button>
              <button className="tbtn" onClick={handleSaveEmail}>
                Save
              </button>
            </div>
          </div>
        </GenericModal>
      ) : null}
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
  compact = false,
}: {
  label: string;
  balance: string;
  amount: string;
  onAmountChange: (val: string) => void;
  onBuy: () => void;
  onSell: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-4 border-b border-white/10 py-2 ${
        compact ? "text-sm" : "text-base"
      } text-white/80`}
    >
      <span className="text-sm text-white">{label}</span>
      <span className="text-sm text-white">{balance}</span>
      <div className="inputline justify-self-end">
        <span className="prompt">&gt;</span>
        <input
          type="number"
          min="0"
          step="1"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          className="w-24 bg-transparent text-xs text-white outline-none appearance-auto"
          placeholder="0"
        />
      </div>
      <button type="button" className="tbtn text-xs" onClick={onBuy}>
        Buy
      </button>
      <button type="button" className="tbtn text-xs" onClick={onSell}>
        Sell
      </button>
    </div>
  );
}
