/**
 * Comprehensive test suite for MCP error handling system
 * Covers all error classes, Neo4j error detection, and error conversion utilities
 */

import { describe, it, expect } from 'vitest';
import {
  MCPError,
  MCPValidationError,
  MCPDatabaseError,
  MCPServiceError,
  MCPResourceNotFoundError,
  MCPOperationError,
  detectNeo4jError,
  isMCPError,
  toMCPError,
} from '../../../../src/infrastructure/errors/mcp-errors';
import { MCPErrorCodes } from '../../../../src/infrastructure/errors/error-codes';

describe('MCP Error System', () => {
  describe('MCPValidationError', () => {
    it('should create validation error with default code', () => {
      const error = new MCPValidationError('Invalid input');
      
      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe(MCPErrorCodes.VALIDATION_FAILED);
      expect(error.name).toBe('MCPValidationError');
      expect(error.data).toBeUndefined();
    });

    it('should create validation error with custom code and data', () => {
      const data = { field: 'email', value: 'invalid-email' };
      const error = new MCPValidationError(
        'Email validation failed',
        MCPErrorCodes.INVALID_ID_FORMAT,
        data
      );
      
      expect(error.message).toBe('Email validation failed');
      expect(error.code).toBe(MCPErrorCodes.INVALID_ID_FORMAT);
      expect(error.data).toEqual(data);
    });

    it('should convert to JSON-RPC format', () => {
      const error = new MCPValidationError('Test error', MCPErrorCodes.VALIDATION_FAILED);
      const jsonRpc = error.toJsonRpc();
      
      expect(jsonRpc).toEqual({
        code: MCPErrorCodes.VALIDATION_FAILED,
        message: 'Test error'
      });
    });

    it('should include data in JSON-RPC format when present', () => {
      const data = { details: 'additional info' };
      const error = new MCPValidationError('Test error', MCPErrorCodes.VALIDATION_FAILED, data);
      const jsonRpc = error.toJsonRpc();
      
      expect(jsonRpc).toEqual({
        code: MCPErrorCodes.VALIDATION_FAILED,
        message: 'Test error',
        data
      });
    });
  });

  describe('MCPDatabaseError', () => {
    it('should create database error with default code', () => {
      const error = new MCPDatabaseError('Connection failed');
      
      expect(error.message).toBe('Connection failed');
      expect(error.code).toBe(MCPErrorCodes.DATABASE_OPERATION_FAILED);
      expect(error.name).toBe('MCPDatabaseError');
    });

    it('should create database error with custom code', () => {
      const error = new MCPDatabaseError(
        'Database not found',
        MCPErrorCodes.DATABASE_NOT_FOUND
      );
      
      expect(error.code).toBe(MCPErrorCodes.DATABASE_NOT_FOUND);
    });
  });

  describe('MCPServiceError', () => {
    it('should create service error with default code', () => {
      const error = new MCPServiceError('Service unavailable');
      
      expect(error.message).toBe('Service unavailable');
      expect(error.code).toBe(MCPErrorCodes.SERVICE_UNAVAILABLE);
      expect(error.name).toBe('MCPServiceError');
    });

    it('should create service error with custom code', () => {
      const error = new MCPServiceError(
        'GDS plugin missing',
        MCPErrorCodes.GDS_PLUGIN_MISSING
      );
      
      expect(error.code).toBe(MCPErrorCodes.GDS_PLUGIN_MISSING);
    });
  });

  describe('MCPResourceNotFoundError', () => {
    it('should create resource not found error with formatted message', () => {
      const error = new MCPResourceNotFoundError('Memory', 'test-id-123');
      
      expect(error.message).toBe('Memory not found: test-id-123');
      expect(error.code).toBe(MCPErrorCodes.MEMORY_NOT_FOUND);
      expect(error.data).toEqual({
        resourceType: 'Memory',
        resourceId: 'test-id-123'
      });
    });

    it('should create resource not found error with custom code', () => {
      const error = new MCPResourceNotFoundError(
        'Database',
        'test-db',
        MCPErrorCodes.DATABASE_NOT_FOUND
      );
      
      expect(error.code).toBe(MCPErrorCodes.DATABASE_NOT_FOUND);
    });
  });

  describe('MCPOperationError', () => {
    it('should create operation error with default code', () => {
      const error = new MCPOperationError('Operation timeout');
      
      expect(error.message).toBe('Operation timeout');
      expect(error.code).toBe(MCPErrorCodes.OPERATION_TIMEOUT);
      expect(error.name).toBe('MCPOperationError');
    });

    it('should create operation error with custom code and data', () => {
      const data = { timeout: 5000, operation: 'search' };
      const error = new MCPOperationError(
        'Search timeout',
        MCPErrorCodes.OPERATION_TIMEOUT,
        data
      );
      
      expect(error.code).toBe(MCPErrorCodes.OPERATION_TIMEOUT);
      expect(error.data).toEqual(data);
    });
  });

  describe('detectNeo4jError', () => {
    it('should return null for non-Error objects', () => {
      const result = detectNeo4jError('string error');
      expect(result).toBeNull();
    });

    it('should return null for generic errors', () => {
      const error = new Error('Generic error message');
      const result = detectNeo4jError(error);
      expect(result).toBeNull();
    });

    it('should detect constraint validation errors', () => {
      const error = new Error(
        "ConstraintValidationFailed: Node(123) already exists with label `Memory` and property `id` = 'dZ$test123456789abc'"
      );
      
      const result = detectNeo4jError(error);
      
      expect(result).toBeInstanceOf(MCPDatabaseError);
      expect(result?.message).toBe('Duplicate ID constraint violation: dZ$test123456789abc');
      expect(result?.code).toBe(MCPErrorCodes.DUPLICATE_ID);
      expect(result?.data).toEqual({ duplicateId: 'dZ$test123456789abc' });
    });

    it('should detect service unavailable errors', () => {
      const error = new Error('ServiceUnavailable: Database connection lost');
      
      const result = detectNeo4jError(error);
      
      expect(result).toBeInstanceOf(MCPDatabaseError);
      expect(result?.message).toBe('Database service unavailable');
      expect(result?.code).toBe(MCPErrorCodes.DATABASE_UNAVAILABLE);
    });

    it('should detect connection refused errors', () => {
      const error = new Error('Connection refused: Could not connect to database');
      
      const result = detectNeo4jError(error);
      
      expect(result).toBeInstanceOf(MCPDatabaseError);
      expect(result?.message).toBe('Database service unavailable');
    });

    it('should detect database not found errors', () => {
      const error = new Error("Database does not exist");
      
      const result = detectNeo4jError(error);
      
      expect(result).toBeInstanceOf(MCPDatabaseError);
      expect(result?.message).toBe('Database not found: unknown');
      expect(result?.code).toBe(MCPErrorCodes.DATABASE_NOT_FOUND);
      expect(result?.data).toEqual({ database: 'unknown' });
    });

    it('should detect GDS function errors', () => {
      const error = new Error("Unknown function 'gds.similarity.cosine'");
      
      const result = detectNeo4jError(error);
      
      expect(result).toBeInstanceOf(MCPServiceError);
      expect(result?.message).toBe('Neo4j Graph Data Science (GDS) plugin is required but not installed');
      expect(result?.code).toBe(MCPErrorCodes.GDS_PLUGIN_MISSING);
      expect(result?.data).toEqual({
        function: 'gds.similarity.cosine',
        installUrl: 'https://dozerdb.org/',
        verifyCommand: 'RETURN gds.similarity.cosine([1,2,3], [2,3,4])'
      });
    });

    it('should detect non-GDS unknown function errors', () => {
      const error = new Error("Unknown function 'custom.function'");
      
      const result = detectNeo4jError(error);
      
      expect(result).toBeNull();
    });

    it('should handle constraint error without ID match', () => {
      const error = new Error("ConstraintValidationFailed: Generic constraint violation");
      
      const result = detectNeo4jError(error);
      
      expect(result).toBeInstanceOf(MCPDatabaseError);
      expect(result?.message).toBe('Duplicate ID constraint violation: unknown');
      expect(result?.data).toEqual({ duplicateId: 'unknown' });
    });

    it('should handle database error without name match', () => {
      const error = new Error("Database does not exist");
      
      const result = detectNeo4jError(error);
      
      expect(result).toBeInstanceOf(MCPDatabaseError);
      expect(result?.message).toBe('Database not found: unknown');
      expect(result?.data).toEqual({ database: 'unknown' });
    });
  });

  describe('isMCPError', () => {
    it('should return true for MCP error instances', () => {
      const error = new MCPValidationError('test');
      expect(isMCPError(error)).toBe(true);
    });

    it('should return true for all MCP error subclasses', () => {
      const errors = [
        new MCPValidationError('test'),
        new MCPDatabaseError('test'),
        new MCPServiceError('test'),
        new MCPResourceNotFoundError('Memory', 'test-id'),
        new MCPOperationError('test')
      ];
      
      errors.forEach(error => {
        expect(isMCPError(error)).toBe(true);
      });
    });

    it('should return false for non-MCP errors', () => {
      expect(isMCPError(new Error('generic error'))).toBe(false);
      expect(isMCPError('string')).toBe(false);
      expect(isMCPError(null)).toBe(false);
      expect(isMCPError(undefined)).toBe(false);
      expect(isMCPError({})).toBe(false);
    });
  });

  describe('toMCPError', () => {
    it('should return same error if already MCP error', () => {
      const originalError = new MCPValidationError('test');
      const result = toMCPError(originalError);
      
      expect(result).toBe(originalError);
    });

    it('should convert Neo4j errors to appropriate MCP errors', () => {
      const neo4jError = new Error("ServiceUnavailable: Connection lost");
      const result = toMCPError(neo4jError);
      
      expect(result).toBeInstanceOf(MCPDatabaseError);
      expect(result.message).toBe('Database service unavailable');
    });

    it('should convert generic Error to MCPOperationError', () => {
      const genericError = new Error('Something went wrong');
      const result = toMCPError(genericError);
      
      expect(result).toBeInstanceOf(MCPOperationError);
      expect(result.message).toBe('Something went wrong');
      expect(result.code).toBe(MCPErrorCodes.INTERNAL_ERROR);
      expect(result.data).toEqual({ originalError: 'Error' });
    });

    it('should convert string to MCPOperationError', () => {
      const stringError = 'String error message';
      const result = toMCPError(stringError);
      
      expect(result).toBeInstanceOf(MCPOperationError);
      expect(result.message).toBe('String error message');
      expect(result.code).toBe(MCPErrorCodes.INTERNAL_ERROR);
      expect(result.data).toEqual({ originalError: 'String error message' });
    });

    it('should convert null/undefined to MCPOperationError', () => {
      const nullResult = toMCPError(null);
      const undefinedResult = toMCPError(undefined);
      
      expect(nullResult).toBeInstanceOf(MCPOperationError);
      expect(nullResult.message).toBe('null');
      
      expect(undefinedResult).toBeInstanceOf(MCPOperationError);
      expect(undefinedResult.message).toBe('undefined');
    });

    it('should convert objects to MCPOperationError', () => {
      const objectError = { type: 'custom', message: 'Custom error' };
      const result = toMCPError(objectError);
      
      expect(result).toBeInstanceOf(MCPOperationError);
      expect(result.message).toBe('[object Object]');
      expect(result.data).toEqual({ originalError: objectError });
    });
  });

  describe('Error inheritance and instanceof checks', () => {
    it('should maintain proper inheritance hierarchy', () => {
      const errors = [
        new MCPValidationError('test'),
        new MCPDatabaseError('test'),
        new MCPServiceError('test'),
        new MCPResourceNotFoundError('Memory', 'test-id'),
        new MCPOperationError('test')
      ];
      
      errors.forEach(error => {
        expect(error).toBeInstanceOf(MCPError);
        expect(error).toBeInstanceOf(Error);
      });
    });

    it('should have correct constructor names', () => {
      const errors = [
        { error: new MCPValidationError('test'), name: 'MCPValidationError' },
        { error: new MCPDatabaseError('test'), name: 'MCPDatabaseError' },
        { error: new MCPServiceError('test'), name: 'MCPServiceError' },
        { error: new MCPResourceNotFoundError('Memory', 'test-id'), name: 'MCPResourceNotFoundError' },
        { error: new MCPOperationError('test'), name: 'MCPOperationError' }
      ];
      
      errors.forEach(({ error, name }) => {
        expect(error.name).toBe(name);
        expect(error.constructor.name).toBe(name);
      });
    });
  });

  describe('JSON-RPC conversion edge cases', () => {
    it('should not include data field when data is undefined', () => {
      const error = new MCPValidationError('test');
      const jsonRpc = error.toJsonRpc();
      
      expect(jsonRpc).not.toHaveProperty('data');
      expect(Object.keys(jsonRpc)).toEqual(['code', 'message']);
    });

    it('should include data field when data is null', () => {
      const error = new MCPValidationError('test', MCPErrorCodes.VALIDATION_FAILED, null);
      const jsonRpc = error.toJsonRpc();
      
      expect(jsonRpc).toHaveProperty('data', null);
    });

    it('should include data field when data is false', () => {
      const error = new MCPValidationError('test', MCPErrorCodes.VALIDATION_FAILED, false);
      const jsonRpc = error.toJsonRpc();
      
      expect(jsonRpc).toHaveProperty('data', false);
    });

    it('should include data field when data is empty object', () => {
      const error = new MCPValidationError('test', MCPErrorCodes.VALIDATION_FAILED, {});
      const jsonRpc = error.toJsonRpc();
      
      expect(jsonRpc).toHaveProperty('data', {});
    });
  });
});
