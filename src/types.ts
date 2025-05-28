import { z } from "zod";

/**
 * Enhanced search-related types for unified search system
 */
export interface EnhancedSearchOptions {
  limit?: number;
  includeGraphContext?: boolean;
  memoryTypes?: string[];
  threshold?: number;
}

export interface SearchMetadata {
  total: number;
  queryTime: number;
  message: string;
}

export interface EnhancedSearchResponse {
  memories: EnhancedSearchResult[];
  _meta: SearchMetadata;
}

export interface EnhancedSearchResult {
  id: string;
  name: string;
  type: string;
  observations: Array<{id?: string, content: string, createdAt: string}>;
  tags: string[];
  metadata: Record<string, any>;
  related?: {
    ancestors?: RelatedMemory[];
    descendants?: RelatedMemory[];
  };
  score?: number;
}

export interface RelatedMemory {
  id: string;
  name: string;
  type: string;
  relation: string;
  distance: number;
  // Enhanced relationship metadata (GDD v2.1.1+)
  strength?: number;      // 0.0-1.0
  context?: string[];     // Domain contexts
  source?: string;        // "agent" | "user" | "system"
  createdAt?: string;     // ISO timestamp
}

/**
 * The primary nodes in the knowledge graph - INPUT schema (ID will be auto-generated)
 */
export const MemoryObject = z.object({
  name: z.string().describe("The name of the memory"),
  memoryType: z.string().describe("The type of the memory"),
  metadata: z.record(z.any()).optional().describe("Flexible structured data (JSON)"),
  createdAt: z.string().optional().describe("ISO timestamp when memory was created"),
  modifiedAt: z.string().optional().describe("ISO timestamp when memory was last modified"),
  lastAccessed: z.string().optional().describe("ISO timestamp when memory was last accessed"),
  nameEmbedding: z.array(z.number()).optional().describe("Vector embedding of memory name for semantic search"),
  tags: z.array(z.string()).optional().describe("Array of tags associated with the memory"),
  observations: z
    .array(z.string())
    .describe("An array of observation contents associated with the memory"),
});

/**
 * Full Memory type with ID added internally after creation
 */
export type Memory = z.infer<typeof MemoryObject> & {
  id: string; // ID is generated internally and added after creation
  metadata?: Record<string, any>; // Flexible structured data
  related?: { // Graph context from relationships
    ancestors?: RelatedMemory[];
    descendants?: RelatedMemory[];
  };
};

/**
 * Memory response type for MCP - excludes nameEmbedding to keep response clean
 */
export type MemoryResponse = {
  id: string;
  name: string;
  memoryType: string;
  metadata?: Record<string, any>;
  createdAt?: string;
  modifiedAt?: string;
  lastAccessed?: string;
  tags?: string[];
  observations: Array<{id?: string, content: string, createdAt: string}>;
  related?: { // Graph context from relationships
    ancestors?: RelatedMemory[];
    descendants?: RelatedMemory[];
  };
};

/**
 * Memory input type (without ID for creation)
 */
export type MemoryInput = z.infer<typeof MemoryObject>;

/**
 * Relations define directed connections between memories.
 *
 * They are always stored in active voice and describe how memories interact or relate to each other
 */
export const RelationObject = z.object({
  fromId: z.string().describe("The id of the memory where the relation starts"),
  toId: z.string().describe("The id of the memory where the relation ends"),
  relationType: z.string().describe("The type of the relation"),
});
export type Relation = {
  fromId: string;
  toId: string;
  relationType: string;
};

/**
 * Observations are discrete pieces of information about a memory
 * 
 * For batch operations, we use ObservationBatch. For internal model, we use ObservationNode.
 */
export const ObservationObject = z.object({
  memoryId: z
    .string()
    .describe("The ID of the memory to add the observations to"),
  contents: z
    .array(z.string())
    .describe("An array of observation contents to add"),
});
export type Observation = z.infer<typeof ObservationObject>;

/**
 * Internal observation node model with metadata
 */
export type ObservationNode = {
  id?: string;           // 18-char BASE85-based identifier (migrated from 17-char BASE91)
  content: string;       // Observation text
  createdAt?: string;    // ISO timestamp
  source?: string;       // Origin of observation
  confidence?: number;   // Trust level (0.0-1.0)
  embedding?: number[];  // Vector embedding for semantic search
};

/**
 * The knowledge graph is the primary data structure for storing information in the system
 * Updated to support enhanced search results
 */
export type KnowledgeGraph = {
  memories: MemoryResponse[];  // Use MemoryResponse for MCP responses
  relations: Relation[];
  _meta?: {
    isLightweight?: boolean;
    queryTime?: number;
    message?: string;
    [key: string]: any;
  };
};

/**
 * Alternative memory-focused interface for KnowledgeGraph
 * Now supports enhanced search results
 */
export type MemoryGraph = {
  memories: (MemoryResponse | EnhancedSearchResult)[];  // Support both formats
  relations: Relation[];
  _meta?: {
    isLightweight?: boolean;
    queryTime?: number;
    message?: string;
    [key: string]: any;
  };
};

/**
 * Database information returned when switching databases
 */
export type DatabaseInfo = {
  previousDatabase: string;
  currentDatabase: string;
  created: boolean;
};

/**
 * Database switch request object schema
 */
export const DatabaseSwitchObject = z.object({
  databaseName: z.string().describe("The name of the database to switch to"),
  createIfNotExists: z.boolean().optional().describe("Whether to create the database if it doesn't exist"),
});
export type DatabaseSwitch = z.infer<typeof DatabaseSwitchObject>;


