/**
 * HTTP Transport Types
 * Minimal type definitions for streamable HTTP transport
 */

export interface HTTPServerConfig {
  port: number;
  endpoint: string;
  enableSessions: boolean;
  corsOrigin: string;
}

export interface SessionInfo {
  sessionId: string;
  transport: any; // StreamableHTTPServerTransport
  createdAt: Date;
  lastAccessed: Date;
}

export interface HTTPRequestContext {
  sessionId?: string;
  isInitialize: boolean;
  method: 'GET' | 'POST' | 'DELETE';
}
