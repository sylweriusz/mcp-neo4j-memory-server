/**
 * Unified Memory Store Handler
 * Single responsibility: Orchestrate memory creation + relation creation in one operation
 * THE IMPLEMENTOR'S RULE: Build exactly what's specified - memory store with immediate relations
 * FIXED: Proper transactional safety with single transaction scope
 */

import { McpMemoryHandler, McpRelationHandler } from '../mcp-handlers';
import { 
  LocalIdResolver
} from './services';
import { generateCompactId } from '../../id_generator';
import { DIContainer } from '../../container/di-container';
import { getLimitsConfig } from '../../config';
import { 
  MCPValidationError, 
  MCPDatabaseError, 
  MCPOperationError,
  MCPErrorCodes,
  detectNeo4jError 
} from '../../infrastructure/errors';

export interface MemoryDefinition {
  name: string;
  memoryType: string;
  localId?: string;
  observations: string[];
  metadata?: Record<string, any>;
}

export interface RelationDefinition {
  from: string;
  to: string;
  type: string;
  strength?: number;
  source?: "agent" | "user" | "system";
}

export interface StoreOptions {
  validateReferences?: boolean;
  allowDuplicateRelations?: boolean;
  transactional?: boolean;
  maxMemories?: number;
  maxRelations?: number;
}

export interface MemoryStoreRequest {
  memories: MemoryDefinition[];
  relations?: RelationDefinition[];
  options?: StoreOptions;
}

export interface ConnectionResult {
  from: string;
  to: string;
  type: string;
  strength: number;
  source: string;
}

export interface MemoryStoreResponse {
  success: boolean;
  created: string[];
  connected: ConnectionResult[];
  localIdMap?: Record<string, string>;
  errors?: string[];
  warnings?: string[];
  limits: {
    memoriesLimit: number;
    relationsLimit: number;
  };
  _meta: {
    database: string;
    operation: "store";
    timestamp: string;
  };
}

export class UnifiedMemoryStoreHandler {
  private memoryHandler: McpMemoryHandler;
  private relationHandler: McpRelationHandler;
  private localIdResolver: LocalIdResolver;

  constructor(memoryHandler: McpMemoryHandler, relationHandler: McpRelationHandler) {
    this.memoryHandler = memoryHandler;
    this.relationHandler = relationHandler;
    this.localIdResolver = new LocalIdResolver();
  }

  async handleMemoryStore(request: MemoryStoreRequest): Promise<MemoryStoreResponse> {
    const options = this.applyDefaultOptions(request.options);
    
    // ZERO-FALLBACK FIX: Use proper transactional scope
    if (options.transactional) {
      return this.handleTransactionalStore(request, options);
    } else {
      // Non-transactional mode (legacy compatibility)
      return this.handleNonTransactionalStore(request, options);
    }
  }

  /**
   * TRANSACTIONAL STORE - Single transaction for entire operation
   * Zero-fallback: All or nothing
   */
  private async handleTransactionalStore(
    request: MemoryStoreRequest, 
    options: Required<StoreOptions>
  ): Promise<MemoryStoreResponse> {
    const container = DIContainer.getInstance();
    const sessionFactory = container.getSessionFactory();
    const session = sessionFactory.createSession();
    const tx = session.beginTransaction();
    
    try {
      // Step 1: Validate request
      this.validateStoreRequest(request, options);
      
      // Step 2: Create memories in transaction
      const createdMemories = await this.createMemoriesInTransaction(
        tx, 
        request.memories
      );
      
      // Step 3: Build localId → realId mapping
      const localIdMapping = this.localIdResolver.buildMapping(
        request.memories.map((mem, index) => ({
          localId: mem.localId,
          id: createdMemories[index]
        }))
      );
      
      // Step 4: Create relations in same transaction
      const connectionResults = await this.createRelationsInTransaction(
        tx,
        request.relations || [], 
        localIdMapping
      );
      
      // Step 5: Commit transaction
      await tx.commit();
      
      // Step 6: Build successful response
      return this.buildSuccessResponse(
        createdMemories,
        connectionResults,
        localIdMapping,
        options
      );
      
    } catch (error) {
      // ZERO-FALLBACK: Rollback everything on any error
      await tx.rollback();
      
      // Detect and throw specific Neo4j errors
      const neo4jError = detectNeo4jError(error);
      if (neo4jError) {
        return this.buildErrorResponse(neo4jError, options);
      }
      
      return this.buildErrorResponse(error, options);
    } finally {
      await session.close();
    }
  }

  /**
   * Create memories within transaction
   */
  private async createMemoriesInTransaction(
    tx: any, 
    memories: MemoryDefinition[]
  ): Promise<string[]> {
    const createdIds: string[] = [];
    
    for (const memory of memories) {
      const memoryId = generateCompactId();
      
      // Create memory node
      const createMemoryQuery = `
        CREATE (m:Memory {
          id: $id,
          name: $name,
          memoryType: $memoryType,
          metadata: $metadata,
          createdAt: $createdAt,
          modifiedAt: $modifiedAt,
          lastAccessed: $lastAccessed
        })
        RETURN m.id as id
      `;
      
      const timestamp = new Date().toISOString();
      await tx.run(createMemoryQuery, {
        id: memoryId,
        name: memory.name,
        memoryType: memory.memoryType,
        metadata: JSON.stringify(memory.metadata || {}),
        createdAt: timestamp,
        modifiedAt: timestamp,
        lastAccessed: timestamp
      });
      
      // Create observations
      for (const observation of memory.observations) {
        const obsId = generateCompactId();
        const createObsQuery = `
          MATCH (m:Memory {id: $memoryId})
          CREATE (o:Observation {
            id: $obsId,
            content: $content,
            createdAt: $timestamp
          })
          CREATE (m)-[:HAS_OBSERVATION]->(o)
        `;
        
        await tx.run(createObsQuery, {
          memoryId,
          obsId,
          content: observation,
          timestamp: new Date().toISOString()
        });
      }
      
      createdIds.push(memoryId);
    }
    
    return createdIds;
  }

  /**
   * Create relations within transaction
   */
  private async createRelationsInTransaction(
    tx: any,
    relations: RelationDefinition[],
    localIdMapping: Map<string, string>
  ): Promise<ConnectionResult[]> {
    const connectionResults: ConnectionResult[] = [];
    
    for (const relation of relations) {
      const fromId = this.resolveId(relation.from, localIdMapping);
      const toId = this.resolveId(relation.to, localIdMapping);
      
      const createRelationQuery = `
        MATCH (from:Memory {id: $fromId}), (to:Memory {id: $toId})
        CREATE (from)-[:RELATES_TO {
          relationType: $relationType,
          strength: $strength,
          source: $source,
          createdAt: $createdAt
        }]->(to)
        RETURN from.id as fromId, to.id as toId
      `;
      
      const result = await tx.run(createRelationQuery, {
        fromId,
        toId,
        relationType: relation.type,
        strength: relation.strength || 0.5,
        source: relation.source || 'agent',
        createdAt: new Date().toISOString()
      });
      
      if (result.records.length === 0) {
        throw new MCPDatabaseError(
          `Failed to create relation: ${fromId} → ${toId} (${relation.type}). ` +
          `One or both memories do not exist.`,
          MCPErrorCodes.MEMORY_NOT_FOUND,
          { fromId, toId, relationType: relation.type }
        );
      }
      
      connectionResults.push({
        from: fromId,
        to: toId,
        type: relation.type,
        strength: relation.strength || 0.5,
        source: relation.source || 'agent'
      });
    }
    
    return connectionResults;
  }

  /**
   * NON-TRANSACTIONAL STORE - Legacy mode
   */
  private async handleNonTransactionalStore(
    request: MemoryStoreRequest, 
    options: Required<StoreOptions>
  ): Promise<MemoryStoreResponse> {
    try {
      // Step 1: Validate request
      this.validateStoreRequest(request, options);
      
      // Step 2: Create memories first
      const createdMemories = await this.createMemories(request.memories);
      
      // Step 3: Build localId → realId mapping
      const localIdMapping = this.localIdResolver.buildMapping(
        request.memories.map((mem, index) => ({
          localId: mem.localId,
          id: createdMemories[index]
        }))
      );
      
      // Step 4: Create relations using resolved IDs
      const connectionResults = await this.createRelations(
        request.relations || [], 
        localIdMapping
      );
      
      // Step 5: Build successful response
      return this.buildSuccessResponse(
        createdMemories,
        connectionResults,
        localIdMapping,
        options
      );
      
    } catch (error) {
      // Non-transactional: return error but don't rollback
      return this.buildErrorResponse(error, options);
    }
  }

  /**
   * Create all memories using existing McpMemoryHandler
   */
  private async createMemories(memories: MemoryDefinition[]): Promise<string[]> {
    const memoryRequests = memories.map(mem => ({
      name: mem.name,
      memoryType: mem.memoryType,
      metadata: mem.metadata || {},
      observations: mem.observations || []
    }));

    const result = await this.memoryHandler.handleMemoryManage({
      operation: 'create',
      memories: memoryRequests
    });

    // Extract created IDs - zero-fallback architecture demands success
    if (!result.success) {
      throw new MCPOperationError(
        `Memory creation failed: ${result.results.map((r: any) => r.error).filter(Boolean).join('; ')}`,
        MCPErrorCodes.DATABASE_OPERATION_FAILED,
        { errors: result.results.filter((r: any) => r.error) }
      );
    }

    return result.results
      .filter((r: any) => r.status === 'created')
      .map((r: any) => r.id);
  }

  /**
   * Create relations using existing McpRelationHandler with resolved IDs
   */
  private async createRelations(
    relations: RelationDefinition[],
    localIdMapping: Map<string, string>
  ): Promise<ConnectionResult[]> {
    if (relations.length === 0) {
      return [];
    }

    // Resolve localIds to realIds - fail fast on errors
    let resolvedRelations: any[];
    try {
      resolvedRelations = relations.map(rel => ({
        fromId: this.resolveId(rel.from, localIdMapping),
        toId: this.resolveId(rel.to, localIdMapping),
        relationType: rel.type,
        strength: rel.strength || 0.5,
        source: rel.source || 'agent'
      }));
    } catch (error) {
      throw new MCPValidationError(
        `Local ID resolution failed: ${error instanceof Error ? error.message : String(error)}`,
        MCPErrorCodes.INVALID_LOCAL_ID,
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }

    const result = await this.relationHandler.handleRelationManage({
      operation: 'create',
      relations: resolvedRelations
    });

    // ZERO-FALLBACK: Report failed relations immediately
    const failedRelations = result.results.filter((r: any) => r.status === 'failed');
    if (failedRelations.length > 0) {
      const errors = failedRelations.map((r: any) => 
        `${r.fromId} → ${r.toId} (${r.relationType}): ${r.error || 'Unknown error'}`
      );
      throw new MCPOperationError(
        `Relation creation failed: ${errors.join('; ')}`,
        MCPErrorCodes.DATABASE_OPERATION_FAILED,
        { failedRelations }
      );
    }

    // Convert to ConnectionResult format
    return result.results
      .filter((r: any) => r.status === 'created')
      .map((r: any) => ({
        from: r.fromId,
        to: r.toId,
        type: r.relationType,
        strength: resolvedRelations.find(rel => 
          rel.fromId === r.fromId && rel.toId === r.toId && rel.relationType === r.relationType
        )?.strength || 0.5,
        source: resolvedRelations.find(rel => 
          rel.fromId === r.fromId && rel.toId === r.toId && rel.relationType === r.relationType
        )?.source || 'agent'
      }));
  }

  /**
   * Resolve ID - either localId to realId mapping or existing memory ID
   */
  private resolveId(id: string, localIdMapping: Map<string, string>): string {
    const realId = localIdMapping.get(id);
    return realId || id; // If not a localId, assume it's an existing memory ID
  }

  /**
   * Validate store request against limits and rules
   */
  private validateStoreRequest(request: MemoryStoreRequest, options: StoreOptions): void {
    // Validate memory count
    if (request.memories.length === 0) {
      throw new MCPValidationError(
        'memories array cannot be empty',
        MCPErrorCodes.EMPTY_ARRAY
      );
    }
    
    if (request.memories.length > options.maxMemories!) {
      throw new MCPValidationError(
        `Too many memories: ${request.memories.length} > ${options.maxMemories}`,
        MCPErrorCodes.INVALID_MEMORY_COUNT,
        { requested: request.memories.length, limit: options.maxMemories }
      );
    }

    // Validate relation count
    if (request.relations && request.relations.length > options.maxRelations!) {
      throw new MCPValidationError(
        `Too many relations: ${request.relations.length} > ${options.maxRelations}`,
        MCPErrorCodes.INVALID_RELATION_COUNT,
        { requested: request.relations.length, limit: options.maxRelations }
      );
    }

    // Validate local IDs
    this.localIdResolver.validateLocalIds(request.memories);

    // Validate individual memories
    for (const memory of request.memories) {
      if (!memory.name?.trim()) {
        throw new MCPValidationError(
          'Memory name cannot be empty',
          MCPErrorCodes.INVALID_NAME
        );
      }
      if (!memory.memoryType?.trim()) {
        throw new MCPValidationError(
          'Memory type cannot be empty',
          MCPErrorCodes.INVALID_TYPE
        );
      }
      if (!memory.observations || memory.observations.length === 0) {
        throw new MCPValidationError(
          `Memory "${memory.name}" must have at least one observation`,
          MCPErrorCodes.EMPTY_ARRAY,
          { memoryName: memory.name }
        );
      }
    }

    // Validate relations
    if (request.relations) {
      for (const relation of request.relations) {
        if (!relation.from?.trim() || !relation.to?.trim()) {
          throw new MCPValidationError(
            'Relation from/to IDs cannot be empty',
            MCPErrorCodes.VALIDATION_FAILED,
            { from: relation.from, to: relation.to }
          );
        }
        if (!relation.type?.trim()) {
          throw new MCPValidationError(
            'Relation type cannot be empty',
            MCPErrorCodes.INVALID_TYPE
          );
        }
        if (relation.strength !== undefined && (relation.strength < 0 || relation.strength > 1)) {
          throw new MCPValidationError(
            `Relation strength must be between 0.0 and 1.0, got: ${relation.strength}`,
            MCPErrorCodes.INVALID_STRENGTH,
            { providedStrength: relation.strength }
          );
        }
      }
    }
  }

  /**
   * Apply default options with configurable limits
   */
  private applyDefaultOptions(options?: StoreOptions): Required<StoreOptions> {
    const limits = getLimitsConfig();
    
    return {
      validateReferences: options?.validateReferences ?? true,
      allowDuplicateRelations: options?.allowDuplicateRelations ?? false,
      transactional: options?.transactional ?? true,
      maxMemories: options?.maxMemories ?? limits.maxMemoriesPerOperation,
      maxRelations: options?.maxRelations ?? limits.maxRelationsPerOperation
    };
  }

  /**
   * Build successful response
   */
  private buildSuccessResponse(
    createdIds: string[],
    connections: ConnectionResult[],
    localIdMapping: Map<string, string>,
    options: Required<StoreOptions>
  ): MemoryStoreResponse {
    const currentDb = DIContainer.getInstance().getCurrentDatabase();
    
    return {
      success: true,
      created: createdIds,
      connected: connections,
      localIdMap: this.localIdResolver.mappingToResponse(localIdMapping),
      limits: {
        memoriesLimit: options.maxMemories,
        relationsLimit: options.maxRelations
      },
      _meta: {
        database: currentDb.database,
        operation: "store",
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Build error response
   */
  private buildErrorResponse(error: unknown, options: Required<StoreOptions>): MemoryStoreResponse {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const currentDb = DIContainer.getInstance().getCurrentDatabase();
    
    return {
      success: false,
      created: [],
      connected: [],
      errors: [errorMessage],
      limits: {
        memoriesLimit: options.maxMemories,
        relationsLimit: options.maxRelations
      },
      _meta: {
        database: currentDb.database,
        operation: "store",
        timestamp: new Date().toISOString()
      }
    };
  }
}
