import { randomBytes } from "crypto";
import type { WebSocket } from "ws";
import type { GovernanceRole } from "@hyper-poker/engine";

export interface Session {
  /** Unique identifier for this websocket connection */
  sessionId: string;
  socket: WebSocket;
  /** Persistent user identifier (wallet address) if attached */
  userId?: string;
  roomId?: string;
  /** Seat number (0-8) if player is seated at a table */
  seat?: number;
  /** Player's chip count */
  chips?: number;
  /** Player's nickname for display */
  nickname?: string;
  /** Whether player is currently in an active hand */
  inActiveHand?: boolean;
  timeout?: NodeJS.Timeout;
  roles?: GovernanceRole[];
}

/** Generate a blockchain-style address */
export function createAddress(): string {
  return "0x" + randomBytes(20).toString("hex");
}

/** Simple in-memory session registry */
export class SessionManager {
  private sessions = new Map<WebSocket, Session>();
  private bySessionId = new Map<string, Session>();
  private byUserId = new Map<string, Session>();
  constructor(private disconnectGraceMs = 5000) {}
  
  get getDisconnectGraceMs() {
    return this.disconnectGraceMs;
  }
  create(ws: WebSocket): Session {
    const sessionId = createAddress();
    const session: Session = { sessionId, socket: ws };
    this.sessions.set(ws, session);
    this.bySessionId.set(sessionId, session);
    return session;
  }

  get(ws: WebSocket): Session | undefined {
    return this.sessions.get(ws);
  }

  getByUserId(id: string): Session | undefined {
    return this.byUserId.get(id);
  }

  getBySessionId(id: string): Session | undefined {
    return this.bySessionId.get(id);
  }

  /** Prevent multiple logins with the same id */
  attach(ws: WebSocket, userId: string): Session | undefined {
    const existing = this.byUserId.get(userId);
    if (existing && existing.socket !== ws) return undefined;
    let session = this.sessions.get(ws);
    if (!session) {
      session = { sessionId: createAddress(), socket: ws };
      this.sessions.set(ws, session);
      this.bySessionId.set(session.sessionId, session);
    }
    // Preserve existing roomId when attaching userId
    session.userId = userId;
    this.byUserId.set(userId, session);
    return session;
  }

  handleDisconnect(session: Session, onDisconnect: (session: Session) => void) {
    this.clearTimer(session);
    onDisconnect(session);
    if (!session.timeout) {
      session.timeout = setTimeout(() => {
        this.expire(session);
      }, this.disconnectGraceMs);
    }
  }

  handleReconnect(session: Session) {
    this.clearTimer(session);
  }

  expire(session: Session) {
    this.sessions.delete(session.socket);
    this.bySessionId.delete(session.sessionId);
    if (session.userId) {
      this.byUserId.delete(session.userId);
    }
  }

  replaceSocket(session: Session, ws: WebSocket) {
    this.sessions.delete(session.socket);
    session.socket = ws;
    this.sessions.set(ws, session);
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Update user binding for existing session
   * Maintains consistency of byUserId mapping
   */
  updateBinding(session: Session, userId: string): boolean {
    const normalizedUserId = userId.toLowerCase().trim();
    
    // Check if userId is already bound to a different session
    const existingSession = this.byUserId.get(normalizedUserId);
    if (existingSession && existingSession !== session) {
      console.warn(`⚠️ [SessionManager] UserId ${normalizedUserId} already bound to different session`);
      return false;
    }

    // Remove old userId binding if session had one
    if (session.userId && session.userId !== normalizedUserId) {
      this.byUserId.delete(session.userId);
      console.log(`🔄 [SessionManager] Removed old binding: ${session.userId}`);
    }

    // Set new binding
    session.userId = normalizedUserId;
    this.byUserId.set(normalizedUserId, session);
    
    console.log(`✅ [SessionManager] Updated binding: session ${session.sessionId} -> userId ${normalizedUserId}`);
    return true;
  }

  /** Restore a session from persisted data */
  restore(
    data: { sessionId: string; userId?: string; roomId?: string; seat?: number; chips?: number; nickname?: string; inActiveHand?: boolean; roles?: GovernanceRole[] },
    ws: WebSocket,
  ): Session {
    const session: Session = {
      sessionId: data.sessionId,
      userId: data.userId,
      roomId: data.roomId,
      seat: data.seat,
      chips: data.chips,
      nickname: data.nickname,
      inActiveHand: data.inActiveHand,
      socket: ws,
      roles: data.roles,
    };
    this.sessions.set(ws, session);
    this.bySessionId.set(session.sessionId, session);
    if (session.userId) {
      this.byUserId.set(session.userId, session);
    }
    return session;
  }

  private clearTimer(session: Session) {
    if (session.timeout) {
      clearTimeout(session.timeout);
      session.timeout = undefined;
    }
  }
}
