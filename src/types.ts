import { z } from "zod";
import { Memory, MemoryInput, MemoryResponse, MemoryObservation, RelatedMemory } from "./domain/entities/memory";

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
  metadata: Record<string, any>;
  createdAt?: string;      // GDD Section 7.3 requirement
  modifiedAt?: string;     // GDD Section 7.3 requirement  
  lastAccessed?: string;   // GDD Section 7.3 requirement
  related?: {
    ancestors?: RelatedMemory[];
    descendants?: RelatedMemory[];
  };
  score?: number;
}

// Re-export domain types for backward compatibility
export type { Memory, MemoryInput, MemoryResponse, MemoryObservation, RelatedMemory };

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
  observations: z
    .array(z.string())
    .describe("An array of observation contents associated with the memory"),
});

/**
 * Relations define directed connections between memories.
 *
 * They are always stored in active voice and describe how memories interact or relate to each other
 */
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
export type Observation = {
  memoryId: string;
  contents: string[];
};

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
 * Database switch request object  
 */
export type DatabaseSwitch = {
  databaseName: string;
  createIfNotExists?: boolean;
};


