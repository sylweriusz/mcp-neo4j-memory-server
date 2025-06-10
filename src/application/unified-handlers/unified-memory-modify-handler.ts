/**
 * Unified Memory Modify Handler
 * Single responsibility: Delegate to appropriate handlers based on modify operation
 * THE IMPLEMENTOR'S RULE: Route operations to existing handlers - no reinventing the wheel
 */

import { 
  McpMemoryHandler, 
  McpObservationHandler, 
  McpRelationHandler
} from '../mcp-handlers';
import { DIContainer } from '../../container/di-container';
import { RelationRepository } from '../../infrastructure/repositories/memory/relation-repository';
import { 
  MCPError, 
  MCPValidationError, 
  MCPDatabaseError, 
  MCPOperationError,
  MCPErrorCodes
} from '../../infrastructure/errors';

export type ModifyOperation = 
  | "update" | "delete" | "batch-delete"
  | "add-observations" | "delete-observations"
  | "create-relations" | "update-relations" | "delete-relations";

export interface ModifyChanges {
  name?: string;
  memoryType?: string;
  metadata?: Record<string, any>;
}

export interface ObservationChange {
  memoryId: string;
  contents: string[];
}

export interface RelationChange {
  from: string;
  to: string;
  type: string;
  strength?: number;
  source?: "agent" | "user" | "system";
}

export interface MemoryModifyRequest {
  operation: ModifyOperation;
  target?: string;
  targets?: string[];
  changes?: ModifyChanges;
  observations?: ObservationChange[];
  relations?: RelationChange[];
  options?: {
    cascadeDelete?: boolean;
    validateObservationIds?: boolean;
    createIfNotExists?: boolean;
  };
}

export interface MemoryModifyResponse {
  success: boolean;
  results: Array<{
    id: string;
    status: "updated" | "deleted" | "success" | "failed";
    error?: string;
  }>;
  summary: {
    requested: number;
    succeeded: number;
    failed: number;
  };
  _meta: {
    database: string;
    operation: ModifyOperation;
    timestamp: string;
  };
}

export class UnifiedMemoryModifyHandler {
  private memoryHandler: McpMemoryHandler;
  private observationHandler: McpObservationHandler;
  private relationHandler: McpRelationHandler;

  constructor(
    memoryHandler: McpMemoryHandler,
    observationHandler: McpObservationHandler,
    relationHandler: McpRelationHandler
  ) {
    this.memoryHandler = memoryHandler;
    this.observationHandler = observationHandler;
    this.relationHandler = relationHandler;
  }

  async handleMemoryModify(request: MemoryModifyRequest): Promise<MemoryModifyResponse> {
    try {
      this.validateModifyRequest(request);
      
      let result: any;
      
      switch (request.operation) {
        case 'update':
          result = await this.handleUpdate(request);
          break;
        case 'delete':
          result = await this.handleDelete(request);
          break;
        case 'batch-delete':
          result = await this.handleBatchDelete(request);
          break;
        case 'add-observations':
          result = await this.handleAddObservations(request);
          break;
        case 'delete-observations':
          result = await this.handleDeleteObservations(request);
          break;
        case 'create-relations':
          result = await this.handleCreateRelations(request);
          break;
        case 'update-relations':
          result = await this.handleUpdateRelations(request);
          break;
        case 'delete-relations':
          result = await this.handleDeleteRelations(request);
          break;
        default:
          throw new MCPValidationError(
            `Unknown operation: ${request.operation}`,
            MCPErrorCodes.VALIDATION_FAILED,
            { operation: request.operation }
          );
      }
      
      return this.formatResponse(result, request.operation);
      
    } catch (error) {
      // Re-throw typed errors
      if (error instanceof MCPValidationError || 
          error instanceof MCPDatabaseError || 
          error instanceof MCPOperationError) {
        throw error;
      }
      
      // Convert generic errors to typed errors
      return this.buildErrorResponse(error, request.operation);
    }
  }

  // Memory operations
  private async handleUpdate(request: MemoryModifyRequest): Promise<any> {
    if (!request.target || !request.changes) {
      throw new MCPValidationError(
        'target and changes are required for update operation',
        MCPErrorCodes.VALIDATION_FAILED,
        { hasTarget: !!request.target, hasChanges: !!request.changes }
      );
    }
    
    return await this.memoryHandler.handleMemoryManage({
      operation: 'update',
      updates: [{ id: request.target, ...request.changes }]
    });
  }

  private async handleDelete(request: MemoryModifyRequest): Promise<any> {
    if (!request.target) {
      throw new MCPValidationError(
        'target is required for delete operation',
        MCPErrorCodes.INVALID_REQUEST_PARAMS
      );
    }
    
    return await this.memoryHandler.handleMemoryManage({
      operation: 'delete',
      identifiers: [request.target]
    });
  }

  private async handleBatchDelete(request: MemoryModifyRequest): Promise<any> {
    if (!request.targets || request.targets.length === 0) {
      throw new MCPValidationError(
        'targets array is required for batch-delete operation',
        MCPErrorCodes.INVALID_REQUEST_PARAMS
      );
    }
    
    return await this.memoryHandler.handleMemoryManage({
      operation: 'delete',
      identifiers: request.targets
    });
  }

  // Observation operations
  private async handleAddObservations(request: MemoryModifyRequest): Promise<any> {
    if (!request.observations || request.observations.length === 0) {
      throw new MCPValidationError(
        'observations array is required for add-observations operation',
        MCPErrorCodes.INVALID_REQUEST_PARAMS
      );
    }
    
    return await this.observationHandler.handleObservationManage({
      operation: 'add',
      observations: request.observations
    });
  }

  private async handleDeleteObservations(request: MemoryModifyRequest): Promise<any> {
    if (!request.observations || request.observations.length === 0) {
      throw new MCPValidationError(
        'observations array is required for delete-observations operation',
        MCPErrorCodes.INVALID_REQUEST_PARAMS
      );
    }
    
    return await this.observationHandler.handleObservationManage({
      operation: 'delete',
      observations: request.observations
    });
  }

  // Relation operations
  private async handleCreateRelations(request: MemoryModifyRequest): Promise<any> {
    if (!request.relations || request.relations.length === 0) {
      throw new MCPValidationError(
        'relations array is required for create-relations operation',
        MCPErrorCodes.INVALID_REQUEST_PARAMS
      );
    }
    
    return await this.relationHandler.handleRelationManage({
      operation: 'create',
      relations: request.relations.map(rel => ({
        fromId: rel.from,
        toId: rel.to,
        relationType: rel.type,
        strength: rel.strength,
        source: rel.source
      }))
    });
  }

  private async handleUpdateRelations(request: MemoryModifyRequest): Promise<any> {
    if (!request.relations || request.relations.length === 0) {
      throw new MCPValidationError(
        'relations array is required for update-relations operation',
        MCPErrorCodes.INVALID_REQUEST_PARAMS
      );
    }
    
    // Direct session access pattern from existing handlers
    const container = DIContainer.getInstance();
    const sessionFactory = container.getSessionFactory();
    
    const relationRepo = new RelationRepository();
    
    const results = [];
    
    for (const relation of request.relations) {
      const session = sessionFactory.createSession();
      try {
        const updateRequest = {
          fromId: relation.from,
          toId: relation.to,
          relationType: relation.type,
          strength: relation.strength || 0.5,
          source: relation.source || 'agent',
          createdAt: new Date().toISOString()
        };
        
        const updated = await relationRepo.updateEnhancedRelation(session, updateRequest);
        
        if (!updated) {
          throw new MCPOperationError(
            `Relation not found: ${relation.from} → ${relation.to} (${relation.type})`,
            MCPErrorCodes.RESOURCE_NOT_FOUND
          );
        }
        
        results.push({
          fromId: relation.from,
          toId: relation.to,
          relationType: relation.type,
          status: "updated"
        });
      } catch (error) {
        if (error instanceof MCPError) {
          throw error;
        }
        throw new MCPDatabaseError(
          `Failed to update relation: ${error instanceof Error ? error.message : String(error)}`,
          MCPErrorCodes.DATABASE_OPERATION_FAILED
        );
      } finally {
        await session.close();
      }
    }
    
    const currentDb = DIContainer.getInstance().getCurrentDatabase();
    
    return {
      success: true,
      results,
      summary: {
        requested: request.relations.length,
        succeeded: results.filter(r => r.status === "updated").length,
        failed: results.filter(r => r.status === "failed").length,
        not_found: results.filter(r => r.status === "not_found").length
      },
      _meta: {
        database: currentDb.database,
        operation: "update-relations",
        timestamp: new Date().toISOString()
      }
    };
  }

  private async handleDeleteRelations(request: MemoryModifyRequest): Promise<any> {
    if (!request.relations || request.relations.length === 0) {
      throw new MCPValidationError(
        'relations array is required for delete-relations operation',
        MCPErrorCodes.INVALID_REQUEST_PARAMS
      );
    }
    
    return await this.relationHandler.handleRelationManage({
      operation: 'delete',
      relations: request.relations.map(rel => ({
        fromId: rel.from,
        toId: rel.to,
        relationType: rel.type
      }))
    });
  }

  // Response formatting
  private formatResponse(result: any, operation: ModifyOperation): MemoryModifyResponse {
    const currentDb = DIContainer.getInstance().getCurrentDatabase();
    
    return {
      success: result.success || true,
      results: result.results || [],
      summary: result.summary || {
        requested: 1,
        succeeded: result.success ? 1 : 0,
        failed: result.success ? 0 : 1
      },
      _meta: {
        database: currentDb.database,
        operation,
        timestamp: new Date().toISOString()
      }
    };
  }

  private buildErrorResponse(error: unknown, operation: ModifyOperation): MemoryModifyResponse {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const currentDb = DIContainer.getInstance().getCurrentDatabase();
    
    return {
      success: false,
      results: [{
        id: "error",
        status: "failed",
        error: errorMessage
      }],
      summary: {
        requested: 1,
        succeeded: 0,
        failed: 1
      },
      _meta: {
        database: currentDb.database,
        operation,
        timestamp: new Date().toISOString()
      }
    };
  }

  // Validation
  private validateModifyRequest(request: MemoryModifyRequest): void {
    if (!request.operation) {
      throw new MCPValidationError(
        'operation is required', 
        MCPErrorCodes.INVALID_REQUEST_PARAMS
      );
    }

    // Operation-specific validation
    const needsTarget = ['update', 'delete'];
    const needsTargets = ['batch-delete'];
    const needsObservations = ['add-observations', 'delete-observations'];
    const needsRelations = ['create-relations', 'update-relations', 'delete-relations'];

    if (needsTarget.includes(request.operation) && !request.target) {
      throw new MCPValidationError(
        `${request.operation} operation requires target parameter`,
        MCPErrorCodes.INVALID_REQUEST_PARAMS
      );
    }

    if (needsTargets.includes(request.operation) && (!request.targets || request.targets.length === 0)) {
      throw new MCPValidationError(
        `${request.operation} operation requires targets array`,
        MCPErrorCodes.INVALID_REQUEST_PARAMS
      );
    }

    if (needsObservations.includes(request.operation) && (!request.observations || request.observations.length === 0)) {
      throw new MCPValidationError(
        `${request.operation} operation requires observations array`,
        MCPErrorCodes.INVALID_REQUEST_PARAMS
      );
    }

    if (needsRelations.includes(request.operation) && (!request.relations || request.relations.length === 0)) {
      throw new MCPValidationError(
        `${request.operation} operation requires relations array`,
        MCPErrorCodes.INVALID_REQUEST_PARAMS
      );
    }
  }
}
