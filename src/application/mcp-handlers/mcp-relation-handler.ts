/**
 * MCP Relation Handler
 * Single responsibility: handle relation-related MCP requests
 */
import { DIContainer } from '../../container/di-container';
import { getErrorMessage } from '../../infrastructure/utilities';
import { MCPValidationError, MCPErrorCodes } from '../../infrastructure/errors';

export class McpRelationHandler {
  private container: DIContainer;
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    this.container = DIContainer.getInstance();
  }

  /**
   * ZERO-FALLBACK: Thread-safe database initialization
   * Uses Promise-based singleton pattern to prevent race conditions
   */
  private async ensureDatabaseInitialized(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this.container.initializeDatabase()
        .catch((error) => {
          // Reset promise on failure to allow retry
          this.initializationPromise = null;
          throw error;
        });
    }
    return this.initializationPromise;
  }

  async handleRelationManage(request: {
    operation: 'create' | 'delete';
    relations: Array<{
      fromId: string;
      toId: string;
      relationType: string;
      strength?: number;
      source?: 'agent' | 'user' | 'system';
    }>;
  }): Promise<any> {
    // Input validation - fail fast
    this.validateRelationRequest(request);
    
    await this.ensureDatabaseInitialized();
    const currentDb = this.container.getCurrentDatabase();
    const relationUseCase = this.container.getManageRelationsUseCase();

    const results = [];
    
    for (const relation of request.relations) {
      try {
        if (request.operation === 'create') {
          await relationUseCase.createRelation(relation);
        } else {
          await relationUseCase.deleteRelation(relation);
        }
        
        results.push({ 
          fromId: relation.fromId, 
          toId: relation.toId, 
          relationType: relation.relationType,
          status: request.operation === 'create' ? "created" : "deleted"
        });
      } catch (error) {
        results.push({ 
          fromId: relation.fromId, 
          toId: relation.toId, 
          relationType: relation.relationType,
          status: "failed", 
          error: getErrorMessage(error)
        });
      }
    }

    return {
      success: true,
      results,
      summary: {
        requested: request.relations.length,
        succeeded: results.filter(r => r.status === "created" || r.status === "deleted").length,
        failed: results.filter(r => r.status === "failed").length
      },
      _meta: {
        database: currentDb.database,
        operation: request.operation,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Validate relation management request
   * ZERO-FALLBACK: Invalid requests fail immediately
   */
  private validateRelationRequest(request: {
    operation: 'create' | 'delete';
    relations: Array<{
      fromId: string;
      toId: string;
      relationType: string;
      strength?: number;
      source?: 'agent' | 'user' | 'system';
    }>;
  }): void {
    if (!request.operation) {
      throw new MCPValidationError(
        'Operation is required',
        MCPErrorCodes.VALIDATION_FAILED
      );
    }

    if (!['create', 'delete'].includes(request.operation)) {
      throw new MCPValidationError(
        `Invalid operation: ${request.operation}. Valid operations: create, delete`,
        MCPErrorCodes.VALIDATION_FAILED
      );
    }

    if (!request.relations || !Array.isArray(request.relations) || request.relations.length === 0) {
      throw new MCPValidationError(
        'Relations array is required and cannot be empty',
        MCPErrorCodes.EMPTY_ARRAY
      );
    }

    for (let i = 0; i < request.relations.length; i++) {
      const relation = request.relations[i];
      if (!relation || typeof relation !== 'object') {
        throw new MCPValidationError(
          `Relation at index ${i} must be an object`,
          MCPErrorCodes.VALIDATION_FAILED
        );
      }
      
      // Validate required fields
      if (!relation.fromId || typeof relation.fromId !== 'string' || relation.fromId.trim().length === 0) {
        throw new MCPValidationError(
          `Relation at index ${i} must have a non-empty fromId`,
          MCPErrorCodes.INVALID_ID_FORMAT
        );
      }
      if (relation.fromId.length !== 18) {
        throw new MCPValidationError(
          `Relation at index ${i} has invalid fromId format (expected 18 characters)`,
          MCPErrorCodes.INVALID_MEMORY_ID_LENGTH
        );
      }
      
      if (!relation.toId || typeof relation.toId !== 'string' || relation.toId.trim().length === 0) {
        throw new MCPValidationError(
          `Relation at index ${i} must have a non-empty toId`,
          MCPErrorCodes.INVALID_ID_FORMAT
        );
      }
      if (relation.toId.length !== 18) {
        throw new MCPValidationError(
          `Relation at index ${i} has invalid toId format (expected 18 characters)`,
          MCPErrorCodes.INVALID_MEMORY_ID_LENGTH
        );
      }
      
      if (!relation.relationType || typeof relation.relationType !== 'string' || relation.relationType.trim().length === 0) {
        throw new MCPValidationError(
          `Relation at index ${i} must have a non-empty relationType`,
          MCPErrorCodes.INVALID_TYPE
        );
      }
      
      // Validate optional fields
      if (relation.strength !== undefined) {
        if (typeof relation.strength !== 'number' || relation.strength < 0 || relation.strength > 1) {
          throw new MCPValidationError(
            `Relation at index ${i} has invalid strength (must be a number between 0 and 1)`,
            MCPErrorCodes.INVALID_STRENGTH
          );
        }
      }
      
      if (relation.source !== undefined) {
        if (!['agent', 'user', 'system'].includes(relation.source)) {
          throw new MCPValidationError(
            `Relation at index ${i} has invalid source (must be 'agent', 'user', or 'system')`,
            MCPErrorCodes.VALIDATION_FAILED
          );
        }
      }
      
      // Prevent self-referencing relations
      if (relation.fromId === relation.toId) {
        throw new MCPValidationError(
          `Relation at index ${i} cannot be self-referencing (fromId and toId are the same)`,
          MCPErrorCodes.INVALID_SELF_REFERENCE
        );
      }
    }
  }
}
