import { useState } from "react";
import { formatNumber } from "~~/utils/format";
import { 
  Modal, 
  ModalLabel, 
  ModalHeader, 
  ModalRule, 
  ModalFooter, 
  ModalContent 
} from "~~/components/ui/Modal";

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
    <Modal 
      modalId="buyin-modal" 
      open={true} 
      onClose={onCancel}
    >
      <ModalContent>
        <ModalLabel>Buy In</ModalLabel>
        
        <ModalHeader 
          title="Select Amount" 
          subtitle={`Blinds: ${config.bigBlind / 2}/${config.bigBlind}`}
        />

        <ModalRule />

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

          <ModalFooter>
            <button className="tbtn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button
              className="tbtn"
              onClick={() => onConfirm(coinAmount)}
            >
              Confirm
            </button>
          </ModalFooter>
        </div>
      </ModalContent>
    </Modal>
  );
}
