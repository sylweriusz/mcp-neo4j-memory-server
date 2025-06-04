/**
 * Session Manager
 * Handles session lifecycle for streamable HTTP transport
 * Zero-fallback architecture: sessions work or fail fast
 */

import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SessionInfo } from "./types.js";

export class SessionManager {
  private sessions = new Map<string, SessionInfo>();
  private readonly sessionTimeout = 30 * 60 * 1000; // 30 minutes

  /**
   * Create new session with transport
   */
  createSession(transport: StreamableHTTPServerTransport): string {
    const sessionId = randomUUID();
    const sessionInfo: SessionInfo = {
      sessionId,
      transport,
      createdAt: new Date(),
      lastAccessed: new Date()
    };
    
    this.sessions.set(sessionId, sessionInfo);
    this.scheduleCleanup(sessionId);
    
    return sessionId;
  }

  /**
   * Get existing session transport
   */
  getSession(sessionId: string): StreamableHTTPServerTransport | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    // Update last accessed
    session.lastAccessed = new Date();
    return session.transport;
  }

  /**
   * Explicitly terminate session
   */
  terminateSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Clean transport connection
    try {
      session.transport.close?.();
    } catch (error) {
      // Transport cleanup failed - log but continue
    }

    this.sessions.delete(sessionId);
    return true;
  }

  /**
   * Schedule automatic session cleanup
   */
  private scheduleCleanup(sessionId: string): void {
    setTimeout(() => {
      const session = this.sessions.get(sessionId);
      if (session) {
        const now = new Date();
        const timeSinceLastAccess = now.getTime() - session.lastAccessed.getTime();
        
        if (timeSinceLastAccess >= this.sessionTimeout) {
          this.terminateSession(sessionId);
        } else {
          // Reschedule cleanup
          this.scheduleCleanup(sessionId);
        }
      }
    }, this.sessionTimeout);
  }

  /**
   * Get session count for monitoring
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }
}
