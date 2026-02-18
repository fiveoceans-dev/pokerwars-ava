"use client";

import React, { useState, useEffect } from "react";
import Lottie from "lottie-react";

// In a real Next.js app, we would typically fetch the list of files
// or import them statically if known.
// For this internal tool, we'll list the ones we created.
const animationFiles = [
  { name: "Yellow Chip", path: "yellow-chip.json" },
  { name: "Red Chip", path: "red-chip.json" },
  { name: "Blue Chip", path: "blue-chip.json" },
  { name: "Orange Chip", path: "orange-chip.json" },
  { name: "Green Chip", path: "green-chip.json" },
  { name: "Purple Chip", path: "purple-chip.json" },
  { name: "Single Poker Chip", path: "single-chip.json" },
  { name: "Poker Chip Shuffle", path: "poker-chip-shuffle.json" },
  { name: "Poker Chip Flip", path: "poker-chip-flip.json" },
  { name: "Winner Celebration", path: "winner-celebration.json" },
  { name: "Card Flip", path: "card-flip.json" },
  { name: "Loading Chips", path: "loading-chips.json" },
];

const LottiePlayer = Lottie as any;

export default function AnimationsGalleryPage() {
  const [animations, setAnimations] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAll = async () => {
      const data: Record<string, any> = {};
      for (const file of animationFiles) {
        try {
          const response = await fetch(`/animations/${file.path}`);
          data[file.path] = await response.json();
        } catch (err) {
          console.error(`Failed to load ${file.path}`, err);
        }
      }
      setAnimations(data);
      setLoading(false);
    };
    loadAll();
  }, []);

  return (
    <main className="min-h-screen bg-[#0a0b0e] pt-24 pb-16">
      <div className="content-wrap space-y-10">
        <div className="border-b border-white/5 pb-6">
          <h1 className="text-3xl font-bold text-white tracking-tight">Animation Gallery</h1>
          <p className="text-sm text-white/50 mt-2">Internal tool for reviewing Lottie animation assets.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-white/40 animate-pulse font-mono text-sm uppercase tracking-widest">Loading Assets...</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {animationFiles.map((file) => (
              <div 
                key={file.path} 
                className="group relative bg-[#161922] rounded-2xl border border-white/5 overflow-hidden hover:border-white/20 transition-all duration-300 shadow-xl"
              >
                {/* Preview Area */}
                <div className="aspect-square flex items-center justify-center p-8 bg-black/40">
                  {animations[file.path] ? (
                    <div className="w-full h-full max-w-[200px] max-h-[200px]">
                      <LottiePlayer 
                        animationData={animations[file.path]} 
                        loop={true}
                        className="w-full h-full"
                      />
                    </div>
                  ) : (
                    <div className="text-rose-500 text-xs font-mono italic">Failed to render</div>
                  )}
                </div>

                {/* Info Bar */}
                <div className="p-4 bg-[#1a1d26]">
                  <h3 className="text-sm font-bold text-white mb-1">{file.name}</h3>
                  <div className="flex items-center justify-between">
                    <code className="text-[10px] text-white/30 bg-black/30 px-2 py-0.5 rounded uppercase tracking-tighter">
                      {file.path}
                    </code>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
