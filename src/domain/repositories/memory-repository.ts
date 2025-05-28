/**
 * Memory Repository Interface
 * Contract for memory persistence operations
 */

import { Memory } from '../entities/memory';

export interface MemoryRepository {
  /**
   * Create a new memory
   */
  create(memory: Memory): Promise<Memory>;

  /**
   * Find memory by ID
   */
  findById(id: string): Promise<Memory | null>;

  /**
   * Find memories by multiple IDs
   */
  findByIds(ids: string[]): Promise<Memory[]>;

  /**
   * Find memories by type
   */
  findByType(memoryType: string): Promise<Memory[]>;

  /**
   * Update existing memory
   */
  update(memory: Memory): Promise<Memory>;

  /**
   * Delete memory by ID
   */
  delete(id: string): Promise<boolean>;

  /**
   * Check if memory exists
   */
  exists(id: string): Promise<boolean>;

  /**
   * Find memories with filters
   */
  findWithFilters(filters: {
    memoryTypes?: string[];
    limit?: number;
    offset?: number;
  }): Promise<Memory[]>;

  /**
   * Add observations to existing memory
   */
  addObservations(memoryId: string, observations: string[]): Promise<void>;

  /**
   * Delete observations from memory
   */
  deleteObservations(memoryId: string, observations: string[]): Promise<void>;

  /**
   * Create relation between memories
   */
  createRelation(fromId: string, toId: string, relationType: string): Promise<void>;

  /**
   * Create enhanced relation with metadata (BUG #3 FIX - GDD v2.1.0+)
   */
  createEnhancedRelation(request: {
    fromId: string;
    toId: string;
    relationType: string;
    strength: number;
    context: string[];
    source: string;
    createdAt: string;
  }): Promise<void>;

  /**
   * Delete relation between memories
   */
  deleteRelation(fromId: string, toId: string, relationType: string): Promise<void>;
}
