import { useState } from "react";
import { formatNumber } from "~~/utils/format";

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
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] bg-[#15171e] p-6 rounded-2xl border border-white/10 shadow-2xl w-80 text-white animate-in zoom-in duration-200">
      <h3 className="text-xl font-bold mb-1">Buy In</h3>
      <p className="text-xs text-gray-400 mb-6 uppercase tracking-wide">
        Blinds: {config.bigBlind / 2}/{config.bigBlind}
      </p>

      <div className="space-y-6">
        <div className="flex justify-between text-sm text-gray-300 font-mono">
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
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />

        <div className="flex items-center gap-2">
          <input
            type="number"
            className="w-full rounded bg-black border border-white/10 px-3 py-2 font-mono text-right"
            min={minCoins}
            max={maxCoins}
            step={step}
            value={coinAmount}
            onChange={(e) => setBbAmount(clampCoinsToBB(Number(e.target.value)))}
          />
          <span className="text-white/60 text-sm">Coins</span>
        </div>

        <div className="flex items-center justify-between bg-black/30 p-3 rounded-lg border border-white/5">
          <span className="text-sm text-gray-400">Total:</span>
          <span className="text-xl font-mono font-bold text-blue-400">
            {formatNumber(coinAmount)}
          </span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-lg transition-colors uppercase tracking-wide text-sm border border-white/10"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(coinAmount)}
            className="flex-[2] py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors uppercase tracking-wide text-sm"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
