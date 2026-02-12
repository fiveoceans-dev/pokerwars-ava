"use client";

import { useState } from "react";
import { 
  Modal, 
  ModalLabel, 
  ModalContent 
} from "./ui/Modal";
import { useTournamentStream } from "../hooks/useTournamentStream";
import { useWallet } from "./providers/WalletProvider";
import { formatNumber } from "../utils/format";

type Payout = {
  playerId: string;
  amount: number;
  currency: "chips" | "tickets";
  position: number;
};

export default function TournamentWinModal() {
  const { address } = useWallet();
  const [winData, setWinData] = useState<Payout | null>(null);

  useTournamentStream((event) => {
    if (event.type === "TOURNAMENT_PAYOUTS" && address) {
      const myPayout = event.payouts.find(
        (p: Payout) => p.playerId.toLowerCase() === address.toLowerCase() && p.amount > 0
      );
      if (myPayout) {
        setWinData(myPayout);
      }
    }
  });

  if (!winData) return null;

  return (
    <Modal
      modalId="tournament-win-modal"
      open={!!winData}
      onClose={() => setWinData(null)}
      className="border border-amber-500/50 shadow-[0_0_50px_rgba(245,158,11,0.3)]"
    >
      <ModalContent className="items-center text-center py-4">
        <ModalLabel className="text-amber-500/70">Tournament Result</ModalLabel>

        <div className="text-6xl animate-bounce mb-2">🏆</div>
        
        <div className="space-y-2">
          <h2 className="text-3xl font-black italic uppercase tracking-wider text-transparent bg-clip-text bg-gradient-to-b from-amber-200 to-amber-500 mb-0">
            Congratulations!
          </h2>
          <p className="text-lg text-white/90">
            You finished <span className="font-bold text-amber-400">#{winData.position}</span>
          </p>
        </div>

        <div className="bg-white/5 rounded-xl p-6 w-full border border-white/10 my-4">
          <div className="text-sm text-white/60 uppercase tracking-widest mb-1">Prize Won</div>
          <div className="text-2xl font-mono font-bold text-emerald-400">
            {formatNumber(winData.amount)} {winData.currency === "tickets" ? "Tickets" : "Coins"}
          </div>
        </div>

        <button 
          onClick={() => setWinData(null)}
          className="px-8 py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-full transition-all transform hover:scale-105"
        >
          Collect Winnings
        </button>
      </ModalContent>
    </Modal>
  );
}
