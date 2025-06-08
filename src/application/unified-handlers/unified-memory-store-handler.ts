/**
 * Unified Memory Store Handler
 * Single responsibility: Orchestrate memory creation + relation creation in one operation
 * THE IMPLEMENTOR'S RULE: Build exactly what's specified - memory store with immediate relations
 */

import { McpMemoryHandler, McpRelationHandler } from '../mcp-handlers';
import { 
  LocalIdResolver, 
  LocalIdMapping,
  type ContextLevel 
} from './services';
import { generateCompactId } from '../../id_generator';
import { DIContainer } from '../../container/di-container';
import { getLimitsConfig } from '../../config';

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
      // Transactional failure - return error response
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
      throw new Error(`Memory creation failed: ${result.results.map((r: any) => r.error).filter(Boolean).join('; ')}`);
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
      throw new Error(`Local ID resolution failed: ${error instanceof Error ? error.message : String(error)}`);
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
      throw new Error(`Relation creation failed: ${errors.join('; ')}`);
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
      throw new Error('memories array cannot be empty');
    }
    
    if (request.memories.length > options.maxMemories!) {
      throw new Error(`Too many memories: ${request.memories.length} > ${options.maxMemories}`);
    }

    // Validate relation count
    if (request.relations && request.relations.length > options.maxRelations!) {
      throw new Error(`Too many relations: ${request.relations.length} > ${options.maxRelations}`);
    }

    // Validate local IDs
    this.localIdResolver.validateLocalIds(request.memories);

    // Validate individual memories
    for (const memory of request.memories) {
      if (!memory.name?.trim()) {
        throw new Error('Memory name cannot be empty');
      }
      if (!memory.memoryType?.trim()) {
        throw new Error('Memory type cannot be empty');
      }
      if (!memory.observations || memory.observations.length === 0) {
        throw new Error(`Memory "${memory.name}" must have at least one observation`);
      }
    }

    // Validate relations
    if (request.relations) {
      for (const relation of request.relations) {
        if (!relation.from?.trim() || !relation.to?.trim()) {
          throw new Error('Relation from/to IDs cannot be empty');
        }
        if (!relation.type?.trim()) {
          throw new Error('Relation type cannot be empty');
        }
        if (relation.strength !== undefined && (relation.strength < 0 || relation.strength > 1)) {
          throw new Error(`Relation strength must be between 0.0 and 1.0, got: ${relation.strength}`);
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
