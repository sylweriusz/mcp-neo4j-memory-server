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
  matchType: 'vector' | 'metadata' | 'fulltext' | 'tag';
}

export interface SearchRepository {
  /**
   * Perform enhanced unified search
   */
  search(request: SearchRequest): Promise<SearchResult[]>;

  /**
   * Vector similarity search only
   */
  vectorSearch(embedding: number[], threshold: number, limit: number): Promise<SearchResult[]>;

  /**
   * Metadata exact match search
   */
  metadataSearch(metadata: Record<string, any>, limit: number): Promise<SearchResult[]>;

  /**
   * Fulltext search in content
   */
  fulltextSearch(query: string, limit: number): Promise<SearchResult[]>;

  /**
   * Tag-based search
   */
  tagSearch(tags: string[], limit: number): Promise<SearchResult[]>;
}
