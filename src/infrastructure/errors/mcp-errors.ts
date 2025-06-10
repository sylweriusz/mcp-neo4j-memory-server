/**
 * MCP Error Classes - Structured error handling for MCP protocol
 * 
 * THE IMPLEMENTOR'S RULE: No fallbacks, no wrapping - expose real problems
 * MCP SDK will automatically convert these to JSON-RPC 2.0 format
 */

import { MCPErrorCodes, MCPErrorCode } from './error-codes';

/**
 * Base MCP Error class
 * All MCP errors should extend this class
 */
export abstract class MCPError extends Error {
  public readonly code: MCPErrorCode;
  public readonly data?: unknown;

  constructor(message: string, code: MCPErrorCode, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
    this.name = this.constructor.name;
  }

  /**
   * Convert to JSON-RPC 2.0 error format
   */
  toJsonRpc(): { code: number; message: string; data?: unknown } {
    return {
      code: this.code,
      message: this.message,
      ...(this.data !== undefined && { data: this.data }),
    };
  }
}

/**
 * Validation Error - Invalid input parameters
 * Maps to JSON-RPC error code -32602 (Invalid params)
 */
export class MCPValidationError extends MCPError {
  constructor(
    message: string,
    code: MCPErrorCode = MCPErrorCodes.VALIDATION_FAILED,
    data?: unknown
  ) {
    super(message, code, data);
  }
}

/**
 * Database Error - Database operations failed
 * Maps to JSON-RPC error code -32603 (Internal error)
 */
export class MCPDatabaseError extends MCPError {
  constructor(
    message: string,
    code: MCPErrorCode = MCPErrorCodes.DATABASE_OPERATION_FAILED,
    data?: unknown
  ) {
    super(message, code, data);
  }
}

/**
 * Service Error - External service issues
 * Maps to JSON-RPC error code -32603 (Internal error)
 */
export class MCPServiceError extends MCPError {
  constructor(
    message: string,
    code: MCPErrorCode = MCPErrorCodes.SERVICE_UNAVAILABLE,
    data?: unknown
  ) {
    super(message, code, data);
  }
}

/**
 * Resource Not Found Error
 * Maps to JSON-RPC error code -32602 (Invalid params)
 */
export class MCPResourceNotFoundError extends MCPError {
  constructor(
    resourceType: string,
    resourceId: string,
    code: MCPErrorCode = MCPErrorCodes.MEMORY_NOT_FOUND
  ) {
    super(`${resourceType} not found: ${resourceId}`, code, {
      resourceType,
      resourceId,
    });
  }
}

/**
 * Operation Error - Operation-specific failures
 * Maps to JSON-RPC error code -32603 (Internal error)
 */
export class MCPOperationError extends MCPError {
  constructor(
    message: string,
    code: MCPErrorCode = MCPErrorCodes.OPERATION_TIMEOUT,
    data?: unknown
  ) {
    super(message, code, data);
  }
}

/**
 * Helper function to detect Neo4j-specific errors
 */
export function detectNeo4jError(error: unknown): MCPError | null {
  if (!(error instanceof Error)) return null;

  const message = error.message;

  // Constraint violations
  if (message.includes('ConstraintValidationFailed')) {
    const idMatch = message.match(/Node\(\d+\) already exists with label `\w+` and property `id` = '([^']+)'/);
    const id = idMatch ? idMatch[1] : 'unknown';
    return new MCPDatabaseError(
      `Duplicate ID constraint violation: ${id}`,
      MCPErrorCodes.DUPLICATE_ID,
      { duplicateId: id }
    );
  }

  // Service unavailable
  if (message.includes('ServiceUnavailable') || message.includes('Connection refused')) {
    return new MCPDatabaseError(
      'Database service unavailable',
      MCPErrorCodes.DATABASE_UNAVAILABLE,
      { originalError: message }
    );
  }

  // Database not found
  if (message.includes('Database does not exist')) {
    const dbMatch = message.match(/Database '([^']+)' does not exist/);
    const dbName = dbMatch ? dbMatch[1] : 'unknown';
    return new MCPDatabaseError(
      `Database not found: ${dbName}`,
      MCPErrorCodes.DATABASE_NOT_FOUND,
      { database: dbName }
    );
  }

  // Unknown function (missing plugins)
  if (message.includes('Unknown function')) {
    const funcMatch = message.match(/Unknown function '([^']+)'/);
    const funcName = funcMatch ? funcMatch[1] : 'unknown';
    
    if (funcName.includes('gds.')) {
      return new MCPServiceError(
        'Neo4j Graph Data Science (GDS) plugin is required but not installed',
        MCPErrorCodes.GDS_PLUGIN_MISSING,
        {
          function: funcName,
          installUrl: 'https://dozerdb.org/',
          verifyCommand: 'RETURN gds.similarity.cosine([1,2,3], [2,3,4])'
        }
      );
    }
  }

  return null;
}

/**
 * Type guard to check if error is an MCP error
 */
export function isMCPError(error: unknown): error is MCPError {
  return error instanceof MCPError;
}

/**
 * Convert any error to MCP error
 * Used as last resort when specific error type cannot be determined
 */
export function toMCPError(error: unknown): MCPError {
  if (error instanceof MCPError) {
    return error;
  }

  // Try to detect Neo4j-specific errors
  const neo4jError = detectNeo4jError(error);
  if (neo4jError) {
    return neo4jError;
  }

  // Generic error handling
  if (error instanceof Error) {
    return new MCPOperationError(
      error.message,
      MCPErrorCodes.INTERNAL_ERROR,
      { originalError: error.name }
    );
  }

  return new MCPOperationError(
    String(error),
    MCPErrorCodes.INTERNAL_ERROR,
    { originalError: error }
  );
}
