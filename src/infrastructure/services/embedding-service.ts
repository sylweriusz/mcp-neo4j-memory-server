/**
 * Vector Embedding Service - Clean Architecture Wrapper
 * Single responsibility: Interface adapter for smart embedding manager
 */

import { SmartEmbeddingManager } from './smart-embedding-manager';

export interface EmbeddingService {
  calculateEmbedding(text: string): Promise<number[]>;
  calculateSimilarity(vector1: number[], vector2: number[]): number;
  getModelDimensions(): Promise<number>;
}

/**
 * Clean implementation that wraps the smart embedding manager
 * Eliminates code duplication and centralizes embedding logic
 */
export class XenovaEmbeddingService implements EmbeddingService {
  private embeddingManager: SmartEmbeddingManager;

  constructor() {
    this.embeddingManager = new SmartEmbeddingManager();
  }

  async calculateEmbedding(text: string): Promise<number[]> {
    return this.embeddingManager.calculateEmbedding(text);
  }

  calculateSimilarity(vector1: number[], vector2: number[]): number {
    return this.embeddingManager.calculateSimilarity(vector1, vector2);
  }

  async getModelDimensions(): Promise<number> {
    return this.embeddingManager.getModelDimensions();
  }

  async preloadModel(): Promise<void> {
    return this.embeddingManager.preloadModel();
  }

  async shutdown(): Promise<void> {
    return this.embeddingManager.shutdown();
  }
}
