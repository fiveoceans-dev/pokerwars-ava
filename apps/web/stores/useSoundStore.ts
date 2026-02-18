import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SoundState {
  volume: number;
  isMuted: boolean;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
}

export const useSoundStore = create<SoundState>()(
  persist(
    (set) => ({
      volume: 0.5,
      isMuted: false,
      setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
      toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
    }),
    {
      name: "pokerwars-sound-settings",
    }
  )
);
