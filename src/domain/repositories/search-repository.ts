/**
 * Search Repository Interface
 * Contract for search operations across all entities
 */

import { Memory } from '../entities/memory';

export interface SearchRequest {
  query: string;
  memoryTypes?: string[];
  limit?: number;
  threshold?: number;
  includeGraphContext?: boolean;
}

export interface SearchResult {
  memory: Memory;
  score: number;
  matchType: 'vector' | 'metadata';
}

export interface SearchRepository {
  /**
   * Unified search - the only method needed
   * Handles all search types: exact, semantic, wildcard
   */
  search(request: SearchRequest): Promise<SearchResult[]>;
}
