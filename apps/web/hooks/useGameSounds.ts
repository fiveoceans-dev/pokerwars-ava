import { useCallback, useRef } from "react";
import { useSoundStore } from "../stores/useSoundStore";

/**
 * Professional Sound Effect Manager
 * Handles sound loading, pooling, and event-based triggering.
 */

export type SoundEffect = 
  | "CARD_DEAL" 
  | "CHIP_BET" 
  | "CHIP_ALLIN" 
  | "POT_WIN";

const SOUND_MAP: Record<SoundEffect, string> = {
  CARD_DEAL: "/sounds/shuffling-cards.mp3",
  CHIP_BET: "/sounds/poker-chip-drop.mp3",
  CHIP_ALLIN: "/sounds/allin-push-poker-chips.mp3",
  POT_WIN: "/sounds/handfull-of-poker-chips-drop.mp3",
};

export function useGameSounds() {
  const { volume, isMuted } = useSoundStore();
  
  // Audio element cache to prevent repeated loading and allow overlapping sounds
  const audioCache = useRef<Record<string, HTMLAudioElement[]>>({});

  const playSound = useCallback((effect: SoundEffect) => {
    if (isMuted || typeof window === "undefined") return;

    const src = SOUND_MAP[effect];
    if (!src) return;

    // Get or create pool for this sound
    if (!audioCache.current[src]) {
      audioCache.current[src] = [];
    }

    const pool = audioCache.current[src];
    
    // Find an available audio element or create a new one
    let audio = pool.find(a => a.ended || a.paused && a.currentTime === 0);
    
    if (!audio) {
      audio = new Audio(src);
      pool.push(audio);
    }

    audio.volume = volume;
    audio.currentTime = 0;
    
    // play() returns a promise, handling browser auto-play policies
    audio.play().catch(err => {
      // Browsers often block audio until first user interaction
      console.warn(`🔊 [SoundManager] Playback blocked for ${effect}:`, err.message);
    });
  }, [volume, isMuted]);

  return { playSound };
}
