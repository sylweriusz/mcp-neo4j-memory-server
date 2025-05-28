/**
 * Vector Embedding Service - Clean Architecture Wrapper
 * Single responsibility: Interface adapter for embedding utility
 */

import { calculateEmbedding, calculateSimilarity } from '../utilities';

export interface EmbeddingService {
  calculateEmbedding(text: string): Promise<number[]>;
  calculateSimilarity(vector1: number[], vector2: number[]): number;
}

/**
 * Clean implementation that wraps the embedding utility
 * Eliminates code duplication and centralizes embedding logic
 */
export class XenovaEmbeddingService implements EmbeddingService {
  async calculateEmbedding(text: string): Promise<number[]> {
    return calculateEmbedding(text);
  }

  calculateSimilarity(vector1: number[], vector2: number[]): number {
    return calculateSimilarity(vector1, vector2);
  }
}
