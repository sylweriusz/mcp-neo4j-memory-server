/**
 * Vector Embeddings Module
 * Handles embedding generation using Xenova transformers
 */

import { pipeline } from '@xenova/transformers';

// Types
export type Vector = number[];

// Cache for embedding model
let embeddingModel: any = null;

/**
 * Initialize and cache the transformer model
 */
export async function getEmbeddingModel() {
  if (!embeddingModel) {
    try {
      // Initialize embedding pipeline with MiniLM model
      const pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      embeddingModel = pipe;
    } catch (error) {
      // Use stderr to avoid interfering with MCP protocol
      console.error('❌ Failed to initialize embedding model:', error);
      throw error;
    }
  }
  return embeddingModel;
}

/**
 * Calculate embedding for text input
 * @param text Input text to embed
 * @returns 384-dimension vector representation
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
    
    const embedding = Array.from(result.data);
    // Add a simple counter to debug (write to stderr)
    if (!globalThis._embeddingCounter) globalThis._embeddingCounter = 0;
    globalThis._embeddingCounter++;
    //console.error(`DEBUG: Embedding #${globalThis._embeddingCounter} calculated for length ${embedding.length}`);
    return embedding;
  } catch (error) {
    console.error('❌ Error calculating embedding:', error);
    throw error;
  }
}

/**
 * Calculate embeddings for multiple texts
 * @param texts Array of text strings
 * @returns Array of vector embeddings
 */
export async function calculateBatchEmbeddings(texts: string[]): Promise<Vector[]> {
  if (!texts || texts.length === 0) {
    return [];
  }
  
  // Filter out empty strings
  const validTexts = texts.filter(t => t && t.trim() !== '');
  if (validTexts.length === 0) {
    return [];
  }
  
  // Calculate embeddings in parallel
  const model = await getEmbeddingModel();
  const results = await Promise.all(
    validTexts.map(text => 
      model(text, {
        pooling: 'mean',
        normalize: true
      })
    )
  );
  
  // Convert typed arrays to regular arrays
  return results.map(result => Array.from(result.data));
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