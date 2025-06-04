/**
 * Session Management Production Tests  
 * THE IMPLEMENTOR'S RULE: Session management isn't glamorous, but it keeps the lights on
 * 
 * Target: Cover session.ts (0% → 85%)
 * Focus: Lifecycle, cleanup, timeout handling
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionManager } from '../../../src/http/session';

// Mock the StreamableHTTPServerTransport
const mockTransport = {
  close: vi.fn(),
  handleRequest: vi.fn()
};

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: vi.fn().mockImplementation(() => mockTransport)
}));

describe('SessionManager - Production Coverage', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Session Creation', () => {
    test('should create session with UUID', () => {
      const sessionId = sessionManager.createSession(mockTransport as any);
      
      expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    test('should store session transport', () => {
      const sessionId = sessionManager.createSession(mockTransport as any);
      const retrievedTransport = sessionManager.getSession(sessionId);
      
      expect(retrievedTransport).toBe(mockTransport);
    });

    test('should increment active session count', () => {
      expect(sessionManager.getActiveSessionCount()).toBe(0);
      
      sessionManager.createSession(mockTransport as any);
      expect(sessionManager.getActiveSessionCount()).toBe(1);
      
      sessionManager.createSession(mockTransport as any);
      expect(sessionManager.getActiveSessionCount()).toBe(2);
    });
  });

  describe('Session Retrieval', () => {
    test('should return null for non-existent session', () => {
      const transport = sessionManager.getSession('non-existent-session');
      expect(transport).toBeNull();
    });

    test('should update lastAccessed when retrieving session', () => {
      const sessionId = sessionManager.createSession(mockTransport as any);
      
      // Advance time
      vi.advanceTimersByTime(5000);
      
      const transport = sessionManager.getSession(sessionId);
      expect(transport).toBe(mockTransport);
      
      // Session should still be accessible after timeout advance
      vi.advanceTimersByTime(25 * 60 * 1000); // 25 minutes (less than 30 min timeout)
      const transportAfter = sessionManager.getSession(sessionId);
      expect(transportAfter).toBe(mockTransport);
    });
  });

  describe('Session Termination', () => {
    test('should terminate existing session successfully', () => {
      const sessionId = sessionManager.createSession(mockTransport as any);
      
      const result = sessionManager.terminateSession(sessionId);
      
      expect(result).toBe(true);
      expect(mockTransport.close).toHaveBeenCalled();
      expect(sessionManager.getActiveSessionCount()).toBe(0);
    });

    test('should return false for non-existent session termination', () => {
      const result = sessionManager.terminateSession('non-existent-session');
      
      expect(result).toBe(false);
      expect(mockTransport.close).not.toHaveBeenCalled();
    });

    test('should handle transport cleanup errors gracefully', () => {
      const faultyTransport = {
        close: vi.fn().mockImplementation(() => {
          throw new Error('Transport cleanup failed');
        }),
        handleRequest: vi.fn()
      };

      const sessionId = sessionManager.createSession(faultyTransport as any);
      
      // Should not throw despite transport cleanup error
      expect(() => sessionManager.terminateSession(sessionId)).not.toThrow();
      expect(sessionManager.getActiveSessionCount()).toBe(0);
    });
  });

  describe('Automatic Session Cleanup', () => {
    test('should auto-cleanup sessions after timeout', () => {
      const sessionId = sessionManager.createSession(mockTransport as any);
      expect(sessionManager.getActiveSessionCount()).toBe(1);
      
      // Advance time beyond 30-minute timeout
      vi.advanceTimersByTime(31 * 60 * 1000);
      
      expect(sessionManager.getActiveSessionCount()).toBe(0);
      expect(sessionManager.getSession(sessionId)).toBeNull();
    });

    test('should not cleanup recently accessed sessions', () => {
      const sessionId = sessionManager.createSession(mockTransport as any);
      
      // Access session multiple times within timeout window
      vi.advanceTimersByTime(15 * 60 * 1000); // 15 minutes
      sessionManager.getSession(sessionId);
      
      vi.advanceTimersByTime(15 * 60 * 1000); // Another 15 minutes (30 total)
      sessionManager.getSession(sessionId);
      
      vi.advanceTimersByTime(20 * 60 * 1000); // 20 more minutes (50 total, but last access was 20 min ago)
      
      expect(sessionManager.getActiveSessionCount()).toBe(1); // Still active
    });
  });
});
