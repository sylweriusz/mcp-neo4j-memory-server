/**
 * Embedding Utility
 * Single responsibility: vector embedding operations for clean architecture
 */

import { pipeline } from '@xenova/transformers';
import { getVectorConfig } from '../../config';

// Types
export type Vector = number[];

// Cache for embedding model
let embeddingModel: any = null;

/**
 * Initialize and cache the transformer model
 * Uses configuration-specified model instead of hardcoded values
 */
async function getEmbeddingModel() {
  if (!embeddingModel) {
    try {
      const vectorConfig = getVectorConfig();
      console.error(`[EMBEDDING] Initializing model: ${vectorConfig.modelName}`);
      
      // Use configured model name, with Xenova prefix for transformers.js compatibility
      const modelName = vectorConfig.modelName.startsWith('Xenova/') 
        ? vectorConfig.modelName 
        : `Xenova/${vectorConfig.modelName.replace('sentence-transformers/', '')}`;
        
      const pipe = await pipeline('feature-extraction', modelName);
      embeddingModel = pipe;
      console.error(`[EMBEDDING] ✅ Model initialized successfully: ${modelName}`);
    } catch (error) {
      console.error('❌ Failed to initialize embedding model:', error);
      throw error;
    }
  }
  return embeddingModel;
}

/**
 * Calculate embedding for text input
 * @param text Input text to embed
 * @returns Vector representation (dimensions based on configured model)
 */
export async function calculateEmbedding(text: string): Promise<Vector> {
  if (!text || text.trim() === '') {
    throw new Error('Cannot calculate embedding for empty text');
  }

  try {
    const model = await getEmbeddingModel();
    
    // Generate embedding from model
    const result = await model(text, {
      pooling: 'mean',
      normalize: true
    });
    
    return Array.from(result.data);
  } catch (error) {
    console.error('❌ Error calculating embedding:', error);
    throw error;
  }
}

/**
 * Calculate similarity between two vectors
 * @param vec1 First vector
 * @param vec2 Second vector
 * @returns Cosine similarity (0-1)
 */
export function calculateSimilarity(vec1: Vector, vec2: Vector): number {
  // Safety checks
  if (!vec1 || !vec2 || !Array.isArray(vec1) || !Array.isArray(vec2)) {
    return 0;
  }
  
  // Ensure same length
  if (vec1.length !== vec2.length) {
    return 0;
  }
  
  try {
    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      if (typeof vec1[i] !== 'number' || typeof vec2[i] !== 'number') {
        continue;
      }
      dotProduct += vec1[i] * vec2[i];
      mag1 += vec1[i] * vec1[i];
      mag2 += vec2[i] * vec2[i];
    }
    
    mag1 = Math.sqrt(mag1);
    mag2 = Math.sqrt(mag2);
    
    if (mag1 === 0 || mag2 === 0) {
      return 0;
    }
    
    return dotProduct / (mag1 * mag2);
  } catch (error) {
    console.error("Error calculating similarity:", error);
    return 0;
  }
}
