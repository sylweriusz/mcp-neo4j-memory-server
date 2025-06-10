/**
 * Memory Domain Entity Interface
 * Single responsibility: Memory data structure and validation
 * THE SINGLE SOURCE OF TRUTH for Memory types
 */

export interface MemoryObservation {
  id?: string;
  content: string;
  createdAt: string;
}

export interface RelatedMemory {
  id: string;
  name: string;
  type: string;
  relation: string;
  distance: number;
  strength?: number;
  source?: string;
  createdAt?: string;
}

export interface Memory {
  readonly id: string;
  readonly name: string;
  readonly memoryType: string;
  readonly metadata: Record<string, any>;
  readonly createdAt: Date | string;
  modifiedAt: Date | string;
  lastAccessed: Date | string;
  observations?: MemoryObservation[];
  related?: {
    ancestors?: RelatedMemory[];
    descendants?: RelatedMemory[];
  };
}

/**
 * Memory input interface for creation (without ID)
 */
export interface MemoryInput {
  name: string;
  memoryType: string;
  metadata?: Record<string, any>;
  observations?: string[];
  createdAt?: string;
  modifiedAt?: string;
  lastAccessed?: string;
}

/**
 * Memory response interface for MCP responses (clean, no embeddings)
 */
export interface MemoryResponse {
  id: string;
  name: string;
  memoryType: string;
  metadata?: Record<string, any>;
  createdAt?: string;
  modifiedAt?: string;
  lastAccessed?: string;
  observations: MemoryObservation[];
  related?: {
    ancestors?: RelatedMemory[];
    descendants?: RelatedMemory[];
  };
}

/**
 * Memory validation utility functions
 * Single responsibility: Domain business rules
 */
export class MemoryValidator {
  static validate(memory: Partial<Memory>): void {
    if (!memory.id || memory.id.length !== 18) {
      throw new Error('Memory ID must be exactly 18 characters');
    }
    
    if (!memory.name || memory.name.trim().length === 0) {
      throw new Error('Memory name is required');
    }
    
    if (!memory.memoryType || memory.memoryType.trim().length === 0) {
      throw new Error('Memory type is required');
    }
  }

  static markAsAccessed(memory: Memory): Memory {
    return {
      ...memory,
      lastAccessed: new Date()
    };
  }

  static withUpdatedMetadata(memory: Memory, newMetadata: Record<string, any>): Memory {
    return {
      ...memory,
      metadata: { ...memory.metadata, ...newMetadata },
      modifiedAt: new Date()
    };
  }
}
