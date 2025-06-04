/**
 * Protocol Bridge
 * Translates between HTTP and JSON-RPC for MCP
 * Zero-fallback: protocol errors fail fast with proper status codes
 */

import { Request, Response } from "express";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { HTTPRequestContext } from "./types.js";

export class ProtocolBridge {
  
  /**
   * Analyze HTTP request context for MCP protocol handling
   */
  analyzeRequest(req: Request): HTTPRequestContext {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const isInitialize = req.method === 'POST' && isInitializeRequest(req.body);
    const method = req.method as 'GET' | 'POST' | 'DELETE';

    return {
      sessionId,
      isInitialize,
      method
    };
  }

  /**
   * Set proper HTTP headers for MCP responses
   */
  setMCPHeaders(res: Response, sessionId?: string): void {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id, Last-Event-ID');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');

    if (sessionId) {
      res.setHeader('Mcp-Session-Id', sessionId);
    }
  }

  /**
   * Send JSON-RPC error response with proper HTTP status
   */
  sendError(res: Response, statusCode: number, message: string, id?: string | number): void {
    this.setMCPHeaders(res);
    res.status(statusCode).json({
      jsonrpc: "2.0",
      id: id || null,
      error: {
        code: this.mapHttpToJsonRpcError(statusCode),
        message,
        data: { httpStatusCode: statusCode }
      }
    });
  }

  /**
   * Send successful JSON-RPC response
   */
  sendSuccess(res: Response, result: any, id?: string | number, sessionId?: string): void {
    this.setMCPHeaders(res, sessionId);
    res.status(200).json({
      jsonrpc: "2.0",
      id: id || null,
      result
    });
  }

  /**
   * Validate JSON-RPC message structure
   */
  validateJsonRpc(body: any): { valid: boolean; id?: string | number; error?: string } {
    if (!body || typeof body !== 'object') {
      return { valid: false, error: 'Invalid JSON structure' };
    }

    if (body.jsonrpc !== '2.0') {
      return { valid: false, id: body.id, error: 'Invalid JSON-RPC version' };
    }

    if (!body.method && !body.result && !body.error) {
      return { valid: false, id: body.id, error: 'Invalid JSON-RPC message type' };
    }

    return { valid: true, id: body.id };
  }

  /**
   * Map HTTP status codes to JSON-RPC error codes
   */
  private mapHttpToJsonRpcError(httpStatus: number): number {
    switch (httpStatus) {
      case 400: return -32600; // Invalid Request
      case 404: return -32601; // Method not found
      case 405: return -32601; // Method not found
      case 422: return -32602; // Invalid params
      case 500: return -32603; // Internal error
      default: return -32000;  // Server error
    }
  }

  /**
   * Handle CORS preflight requests
   */
  handleCorsPrelight(req: Request, res: Response): void {
    this.setMCPHeaders(res);
    res.status(200).send();
  }
}
