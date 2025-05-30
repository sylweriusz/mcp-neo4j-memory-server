/**
 * Embedding Utility - Backwards Compatibility Wrapper
 * Single responsibility: Bridge legacy callers to smart embedding manager
 */

import { SmartEmbeddingManager } from '../services/smart-embedding-manager';

// Types
export type Vector = number[];

// Global instance for backwards compatibility
let globalEmbeddingManager: SmartEmbeddingManager | null = null;

function getGlobalEmbeddingManager(): SmartEmbeddingManager {
  if (!globalEmbeddingManager) {
    globalEmbeddingManager = new SmartEmbeddingManager();
  }
  return globalEmbeddingManager;
}

/**
 * Calculate embedding for text input
 * @param text Input text to embed
 * @returns Vector representation (dimensions based on configured model)
 */
export async function calculateEmbedding(text: string): Promise<Vector> {
  const manager = getGlobalEmbeddingManager();
  return manager.calculateEmbedding(text);
}

/**
 * Calculate similarity between two vectors
 * @param vec1 First vector
 * @param vec2 Second vector
 * @returns Cosine similarity (0-1)
 */
export function calculateSimilarity(vec1: Vector, vec2: Vector): number {
  const manager = getGlobalEmbeddingManager();
  return manager.calculateSimilarity(vec1, vec2);
}
