import { logger } from "@hyper-poker/engine/utils/logger";
import { BLIND_SCHEDULES } from "./blindSchedules";
import type { TournamentState } from "./tournamentManager";
import type { WebSocketFSMBridge } from "./pokerWebSocketServer";

export class LevelTimer {
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private bridge: WebSocketFSMBridge,
    private onLevelUp: (tournamentId: string, levelIndex: number) => void,
  ) {}

  start(tournament: TournamentState) {
    if (!tournament.blindScheduleId) return;
    const schedule = BLIND_SCHEDULES[tournament.blindScheduleId];
    if (!schedule || !schedule.length) return;
    const nextLevel = tournament.currentLevel ? tournament.currentLevel + 1 : 1;
    const level = schedule.find((l) => l.level === nextLevel);
    if (!level) return;

    const ms = level.durationSeconds * 1000;
    this.clear(tournament.id);
    const timer = setTimeout(() => {
      this.onLevelUp(tournament.id, nextLevel);
      this.start({ ...tournament, currentLevel: nextLevel });
    }, ms);
    this.timers.set(tournament.id, timer);
    logger.info(`⏳ Started level timer for ${tournament.id} -> level ${nextLevel} (${level.durationSeconds}s)`);
  }

  clear(tournamentId: string) {
    const t = this.timers.get(tournamentId);
    if (t) clearTimeout(t);
    this.timers.delete(tournamentId);
  }
}
