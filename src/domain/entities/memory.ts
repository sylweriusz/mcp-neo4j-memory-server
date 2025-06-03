/**
 * Memory Domain Entity Interface
 * Single responsibility: Memory data structure and validation
 */

export interface MemoryObservation {
  id?: string;
  content: string;
  createdAt: string;
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
    ancestors?: any[];
    descendants?: any[];
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
