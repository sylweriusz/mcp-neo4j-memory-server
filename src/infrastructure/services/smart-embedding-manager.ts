/**
 * Smart Embedding Manager - Clean Architecture Implementation
 * Single responsibility: Model lifecycle management with lazy loading
 * Features: Auto-dimensions, idle timeout, preload option
 */

import { pipeline } from '@xenova/transformers';
import { getVectorConfig } from '../../config';
import { MCPServiceError, MCPValidationError, MCPErrorCodes } from '../errors';

export interface EmbeddingManager {
  calculateEmbedding(text: string): Promise<number[]>;
  getModelDimensions(): Promise<number>;
  preloadModel(): Promise<void>;
  calculateSimilarity(vector1: number[], vector2: number[]): number;
}

export class SmartEmbeddingManager implements EmbeddingManager {
  private model: any = null;
  private lastUsed: number = 0;
  private modelDimensions: number = 0;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private loadingPromise: Promise<void> | null = null;
  private config = getVectorConfig();

  constructor() {
    // Model loading happens only on first use or explicit preload
  }

  async preloadModel(): Promise<void> {
    await this.ensureModel();
  }

  async calculateEmbedding(text: string): Promise<number[]> {
    if (!text || text.trim() === '') {
      throw new MCPValidationError(
        'Cannot calculate embedding for empty text',
        MCPErrorCodes.VALIDATION_FAILED
      );
    }

    const model = await this.ensureModel();
    this.resetIdleTimer();
    
    try {
      const result = await model(text, {
        pooling: 'mean',
        normalize: true
      });
      
      return Array.from(result.data);
    } catch (error) {
      // Zero-fallback: Fail with proper error, no console output
      throw new MCPServiceError(
        `Embedding calculation failed: ${error instanceof Error ? error.message : String(error)}`,
        MCPErrorCodes.EMBEDDING_SERVICE_ERROR,
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async getModelDimensions(): Promise<number> {
    if (this.modelDimensions === 0) {
      await this.ensureModel();
    }
    return this.modelDimensions;
  }

  calculateSimilarity(vector1: number[], vector2: number[]): number {
    // Safety checks
    if (!vector1 || !vector2 || !Array.isArray(vector1) || !Array.isArray(vector2)) {
      return 0;
    }
    
    // Ensure same length
    if (vector1.length !== vector2.length) {
      return 0;
    }
    
    try {
      let dotProduct = 0;
      let mag1 = 0;
      let mag2 = 0;
      
      for (let i = 0; i < vector1.length; i++) {
        if (typeof vector1[i] !== 'number' || typeof vector2[i] !== 'number') {
          continue;
        }
        dotProduct += vector1[i] * vector2[i];
        mag1 += vector1[i] * vector1[i];
        mag2 += vector2[i] * vector2[i];
      }
      
      mag1 = Math.sqrt(mag1);
      mag2 = Math.sqrt(mag2);
      
      if (mag1 === 0 || mag2 === 0) {
        return 0;
      }
      
      return dotProduct / (mag1 * mag2);
    } catch (error) {
      throw new MCPServiceError(
        `Similarity calculation failed: ${error instanceof Error ? error.message : String(error)}`,
        MCPErrorCodes.EMBEDDING_SERVICE_ERROR,
        { operation: 'calculateSimilarity' }
      );
    }
  }

  private async ensureModel(): Promise<any> {
    if (this.model) {
      this.lastUsed = Date.now();
      return this.model;
    }

    if (this.loadingPromise) {
      await this.loadingPromise;
      return this.model;
    }

    this.loadingPromise = this.loadModel();
    await this.loadingPromise;
    this.loadingPromise = null;

    return this.model;
  }

  private async loadModel(): Promise<void> {
    try {
      // Determine model name for Xenova transformers
      const modelName = this.config.modelName.startsWith('Xenova/') 
        ? this.config.modelName 
        : `Xenova/${this.config.modelName.replace('sentence-transformers/', '')}`;
      
      this.model = await pipeline('feature-extraction', modelName);
      
      // Auto-detect dimensions if not specified
      if (this.config.dimensions === 'auto') {
        const testEmbedding = await this.model('test');
        this.modelDimensions = testEmbedding.data.length;
      } else {
        this.modelDimensions = this.config.dimensions as number;
      }
      
      this.lastUsed = Date.now();
    } catch (error) {
      // Zero-fallback: Fail immediately, no console output
      this.model = null;
      this.modelDimensions = 0;
      this.loadingPromise = null;
      throw new MCPServiceError(
        `Failed to load embedding model: ${error instanceof Error ? error.message : String(error)}`,
        MCPErrorCodes.EMBEDDING_SERVICE_ERROR,
        { 
          model: this.config.modelName,
          originalError: error instanceof Error ? error.message : String(error)
        }
      );
    }
  }

  private resetIdleTimer(): void {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
    }
    
    this.cleanupTimer = setTimeout(() => {
      if (Date.now() - this.lastUsed >= this.config.idleTimeout) {
        this.model = null;
        this.modelDimensions = 0;
        this.cleanupTimer = null;
      }
    }, this.config.idleTimeout);
  }

  /**
   * Clean shutdown - clear timers and free resources
   */
  async shutdown(): Promise<void> {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.model = null;
    this.modelDimensions = 0;
  }
}
