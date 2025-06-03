/**
 * Smart Embedding Manager - Clean Architecture Implementation
 * Single responsibility: Model lifecycle management with lazy loading
 * Features: Auto-dimensions, idle timeout, preload option
 */

import { pipeline } from '@xenova/transformers';
import { getVectorConfig } from '../../config';

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
    if (this.config.preload) {
      // Silent background loading
      this.preloadModel().catch(error => {
        // Silent failure - preload is optional optimization
      });
    }
  }

  async preloadModel(): Promise<void> {
    await this.ensureModel();
  }

  async calculateEmbedding(text: string): Promise<number[]> {
    if (!text || text.trim() === '') {
      throw new Error('Cannot calculate embedding for empty text');
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
      console.error('Error calculating embedding:', error);
      throw error;
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
      return 0;
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
      console.error('Failed to load embedding model:', error);
      this.model = null;
      this.modelDimensions = 0;
      this.loadingPromise = null;
      throw error;
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
