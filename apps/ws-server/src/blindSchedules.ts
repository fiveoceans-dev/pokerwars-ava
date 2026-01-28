// Default blind schedules for S&G (STT) and MTT.
// Durations are in seconds; ante optional.

export type BlindLevel = {
  level: number;
  sb: number;
  bb: number;
  ante?: number;
  durationSeconds: number;
};

export const STT_SCHEDULE: BlindLevel[] = [
  { level: 1, sb: 10, bb: 20, durationSeconds: 300 },
  { level: 2, sb: 15, bb: 30, durationSeconds: 300 },
  { level: 3, sb: 25, bb: 50, durationSeconds: 300 },
  { level: 4, sb: 50, bb: 100, durationSeconds: 300 },
  { level: 5, sb: 75, bb: 150, durationSeconds: 300 },
  { level: 6, sb: 100, bb: 200, durationSeconds: 300 },
  { level: 7, sb: 150, bb: 300, durationSeconds: 300 },
  { level: 8, sb: 200, bb: 400, durationSeconds: 300 },
  { level: 9, sb: 300, bb: 600, durationSeconds: 300 },
];

export const MTT_SCHEDULE: BlindLevel[] = [
  { level: 1, sb: 25, bb: 50, ante: 0, durationSeconds: 600 },
  { level: 2, sb: 50, bb: 100, ante: 0, durationSeconds: 600 },
  { level: 3, sb: 75, bb: 150, ante: 0, durationSeconds: 600 },
  { level: 4, sb: 100, bb: 200, ante: 0, durationSeconds: 600 },
  { level: 5, sb: 150, bb: 300, ante: 25, durationSeconds: 600 },
  { level: 6, sb: 200, bb: 400, ante: 50, durationSeconds: 600 },
  { level: 7, sb: 300, bb: 600, ante: 75, durationSeconds: 600 },
  { level: 8, sb: 400, bb: 800, ante: 100, durationSeconds: 600 },
  { level: 9, sb: 600, bb: 1200, ante: 200, durationSeconds: 600 },
  { level: 10, sb: 800, bb: 1600, ante: 300, durationSeconds: 600 },
];

export const BLIND_SCHEDULES: Record<string, BlindLevel[]> = {
  "default-stt": STT_SCHEDULE,
  "default-mtt": MTT_SCHEDULE,
};

export function getFirstLevel(id: string | undefined): BlindLevel | undefined {
  if (!id) return undefined;
  const sched = BLIND_SCHEDULES[id];
  return sched?.[0];
}
