"use client";

import { useState } from "react";
import HandReplayer from "../../components/HandReplayer";
import hand1 from "../../data/recordings/hand-1.json";
import hand2 from "../../data/recordings/hand-2.json";
import hand3 from "../../data/recordings/hand-3.json";

const recordings = [hand1, hand2, hand3];

export default function DemoPage() {
  const [currentHandIdx, setCurrentHandIdx] = useState(0);

  return (
    <main className="min-h-screen bg-[#0a0b0e] flex flex-col pt-16">
      {/* Header Info */}
      <div className="content-wrap py-6 flex flex-col md:flex-row md:items-center justify-between gap-4">

        
        <div className="flex gap-2 items-center">
          <span className="text-xs text-white/40 uppercase font-bold mr-2">Scenarios:</span>
          {recordings.map((hand, idx) => (
            <button
              key={hand.id}
              onClick={() => setCurrentHandIdx(idx)}
              className={`px-3 py-1.5 rounded text-xs transition-all ${
                currentHandIdx === idx 
                  ? "bg-[var(--brand-accent)] text-black font-bold shadow-[0_0_15px_rgba(251,191,36,0.3)]" 
                  : "bg-white/5 text-white/60 hover:bg-white/10"
              }`}
            >
              {hand.name}
            </button>
          ))}
        </div>
      </div>

      {/* Main Replayer Area */}
      <div className="flex-1 w-full border-t border-white/5 bg-black/20">
        <HandReplayer 
          key={recordings[currentHandIdx].id} // Force re-mount on hand change
          handData={recordings[currentHandIdx]} 
        />
      </div>
    </main>
  );
}
