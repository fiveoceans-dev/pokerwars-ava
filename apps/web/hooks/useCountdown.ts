/**
 * Reusable Client-Side Countdown Hook
 * 
 * Calculates countdown display locally from server-provided timestamps.
 * This approach scales to millions of tables without server-side intervals.
 */

import { useState, useEffect } from 'react';

export type CountdownType = 
  | "game_start" 
  | "action" 
  | "street_deal" 
  | "new_hand" 
  | "reconnect";

export interface CountdownData {
  startTime: number;
  duration: number;
  type: CountdownType;
  metadata?: any;
}

/**
 * Hook for client-side countdown display
 * 
 * @param startTime Server timestamp when countdown began (null = no countdown)
 * @param duration Total countdown duration in milliseconds
 * @returns Current seconds remaining (null when countdown not active/complete)
 */
export function useCountdown(
  startTime: number | null,
  duration: number | null
): number | null {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    // No countdown active
    if (!startTime || !duration) {
      setTimeLeft(null);
      return;
    }

    const updateTimer = () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, duration - elapsed);
      const seconds = Math.ceil(remaining / 1000);
      
      if (seconds <= 0) {
        setTimeLeft(null);
      } else {
        setTimeLeft(seconds);
      }
    };

    // Initial calculation
    updateTimer();
    
    // Update frequently for smooth countdown (10fps is plenty for seconds display)
    const interval = setInterval(updateTimer, 100);
    
    return () => clearInterval(interval);
  }, [startTime, duration]);

  return timeLeft;
}

/**
 * Hook for multiple countdowns with priority display
 * Returns the highest priority countdown that's active
 */
export function useCountdownWithPriority(
  countdowns: Map<CountdownType, CountdownData>
): {
  timeLeft: number | null;
  activeType: CountdownType | null;
  metadata?: any;
} {
  const [result, setResult] = useState<{
    timeLeft: number | null;
    activeType: CountdownType | null;
    metadata?: any;
  }>({
    timeLeft: null,
    activeType: null
  });

  // Priority order (highest to lowest)
  const priorityOrder: CountdownType[] = [
    "action",        // Player action timer (highest priority)
    "reconnect",     // Reconnection grace period
    "game_start",    // Game starting countdown
    "street_deal",   // Street dealing delay
    "new_hand"       // New hand delay (lowest priority)
  ];

  useEffect(() => {
    if (countdowns.size === 0) {
      setResult({ timeLeft: null, activeType: null });
      return;
    }

    const updateTimer = () => {
      let bestCountdown: { type: CountdownType; data: CountdownData; timeLeft: number } | null = null;

      // Find highest priority active countdown
      for (const type of priorityOrder) {
        const countdown = countdowns.get(type);
        if (!countdown) continue;

        const elapsed = Date.now() - countdown.startTime;
        const remaining = Math.max(0, countdown.duration - elapsed);
        const seconds = Math.ceil(remaining / 1000);

        if (seconds > 0) {
          bestCountdown = { type, data: countdown, timeLeft: seconds };
          break; // Found highest priority, stop looking
        }
      }

      if (bestCountdown) {
        setResult({
          timeLeft: bestCountdown.timeLeft,
          activeType: bestCountdown.type,
          metadata: bestCountdown.data.metadata
        });
      } else {
        setResult({ timeLeft: null, activeType: null });
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);
    
    return () => clearInterval(interval);
  }, [countdowns]);

  return result;
}

/**
 * Hook for specific countdown type
 * Convenience wrapper for single countdown monitoring
 */
export function useSpecificCountdown(
  countdowns: Map<CountdownType, CountdownData>,
  type: CountdownType
): number | null {
  const countdown = countdowns.get(type);
  return useCountdown(
    countdown?.startTime || null,
    countdown?.duration || null
  );
}