import { useState } from "react";
import { formatNumber } from "~~/utils/format";
import GenericModal from "~~/components/ui/GenericModal";

export interface BuyInConfig {
  seat: number;
  bbAmount: number;
  bbMin: number;
  bbMax: number;
  bigBlind: number;
}

interface BuyInModalProps {
  config: BuyInConfig;
  onConfirm: (amount: number) => void;
  onCancel: () => void;
}

export default function BuyInModal({ config, onConfirm, onCancel }: BuyInModalProps) {
  const [bbAmount, setBbAmount] = useState(config.bbAmount);

  const minCoins = Math.round(config.bbMin * config.bigBlind);
  const maxCoins = Math.round(config.bbMax * config.bigBlind);
  const coinAmount = Math.round(bbAmount * config.bigBlind);
  const step = Math.max(1, Math.round(config.bigBlind));

  const clampCoinsToBB = (coins: number) =>
    Math.min(config.bbMax, Math.max(config.bbMin, Math.round(coins / config.bigBlind)));

  return (
    <GenericModal 
      modalId="buyin-modal" 
      open={true} 
      onClose={onCancel}
      className="bg-black text-white border border-white/10"
    >
      <div className="space-y-4 text-sm text-white/80">
        <div className="text-[11px] uppercase tracking-[0.4em] text-white/50">Buy In</div>
        
        <div className="space-y-1">
          <p className="text-white font-medium">Select Amount</p>
          <p className="text-xs text-white/50 uppercase tracking-wide">
            Blinds: {config.bigBlind / 2}/{config.bigBlind}
          </p>
        </div>

        <div className="rule" aria-hidden="true" />

        <div className="space-y-6">
          <div className="flex justify-between text-xs text-white/60 font-mono">
            <span>Min: {formatNumber(minCoins)}</span>
            <span>Max: {formatNumber(maxCoins)}</span>
          </div>

          <input
            type="range"
            min={config.bbMin}
            max={config.bbMax}
            step={1}
            value={bbAmount}
            onChange={(e) => setBbAmount(Number(e.target.value))}
            className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[var(--brand-accent)]"
          />

          <div className="flex items-center gap-3">
            <span className="text-white/80 min-w-[110px]">Coins</span>
            <input
              type="number"
              className="w-28 rounded border border-white/10 bg-black px-3 py-1 text-right text-white font-mono"
              min={minCoins}
              max={maxCoins}
              step={step}
              value={coinAmount}
              onChange={(e) => setBbAmount(clampCoinsToBB(Number(e.target.value)))}
            />
          </div>

          <div className="flex items-center justify-between bg-white/5 p-3 rounded border border-white/5">
            <span className="text-xs text-white/50 uppercase tracking-wider">Total:</span>
            <span className="text-lg font-mono font-bold text-[var(--brand-accent)]">
              {formatNumber(coinAmount)}
            </span>
          </div>

          <div className="flex justify-end gap-2 text-xs pt-2">
            <button className="tbtn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button
              className="tbtn"
              onClick={() => onConfirm(coinAmount)}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </GenericModal>
  );
}
