/**
 * Embedding Service Tests
 * Single responsibility: Verify embedding service functionality
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { XenovaEmbeddingService } from '../../src/infrastructure/services/embedding-service';

// Mock the SmartEmbeddingManager
vi.mock('../../src/infrastructure/services/smart-embedding-manager', () => ({
  SmartEmbeddingManager: vi.fn().mockImplementation(() => ({
    calculateEmbedding: vi.fn(),
    calculateSimilarity: vi.fn(),
    getModelDimensions: vi.fn()
  }))
}));

// Import the mocked class
import { SmartEmbeddingManager } from '../../src/infrastructure/services/smart-embedding-manager';

describe('XenovaEmbeddingService', () => {
  let embeddingService: XenovaEmbeddingService;
  let mockEmbeddingManager: any;
  
  beforeEach(() => {
    vi.clearAllMocks();
    embeddingService = new XenovaEmbeddingService();
    mockEmbeddingManager = (embeddingService as any).embeddingManager;
  });
  
  describe('calculateEmbedding', () => {
    it('should call the underlying manager with the provided text', async () => {
      // Arrange
      const text = 'Test text for embedding';
      const mockEmbedding = [0.1, 0.2, 0.3, 0.4];
      mockEmbeddingManager.calculateEmbedding.mockResolvedValue(mockEmbedding);
      
      // Act
      const result = await embeddingService.calculateEmbedding(text);
      
      // Assert
      expect(mockEmbeddingManager.calculateEmbedding).toHaveBeenCalledWith(text);
      expect(result).toEqual(mockEmbedding);
    });
    
    it('should propagate errors from the underlying manager', async () => {
      // Arrange
      const text = 'Test text for embedding';
      const error = new Error('Embedding calculation failed');
      mockEmbeddingManager.calculateEmbedding.mockRejectedValue(error);
      
      // Act & Assert
      await expect(embeddingService.calculateEmbedding(text)).rejects.toThrow(error);
      expect(mockEmbeddingManager.calculateEmbedding).toHaveBeenCalledWith(text);
    });
  });
  
  describe('calculateSimilarity', () => {
    it('should call the underlying manager with the provided vectors', () => {
      // Arrange
      const vector1 = [0.1, 0.2, 0.3];
      const vector2 = [0.4, 0.5, 0.6];
      const expectedSimilarity = 0.974;
      mockEmbeddingManager.calculateSimilarity.mockReturnValue(expectedSimilarity);
      
      // Act
      const result = embeddingService.calculateSimilarity(vector1, vector2);
      
      // Assert
      expect(mockEmbeddingManager.calculateSimilarity).toHaveBeenCalledWith(vector1, vector2);
      expect(result).toBe(expectedSimilarity);
    });
    
    it('should handle edge cases by delegating to the underlying manager', () => {
      // Arrange
      const vector1 = [0.1, 0.2, 0.3];
      const vector2 = [0.4, 0.5]; // Different length
      mockEmbeddingManager.calculateSimilarity.mockReturnValue(0);
      
      // Act
      const result = embeddingService.calculateSimilarity(vector1, vector2);
      
      // Assert
      expect(mockEmbeddingManager.calculateSimilarity).toHaveBeenCalledWith(vector1, vector2);
      expect(result).toBe(0);
    });
  });
  
  describe('integration with manager', () => {
    it('should provide a clean interface to the embedding functionality', async () => {
      // Arrange
      const text = 'Test text for embedding';
      const mockEmbedding = [0.1, 0.2, 0.3, 0.4];
      const vector1 = [0.1, 0.2, 0.3];
      const vector2 = [0.4, 0.5, 0.6];
      const expectedSimilarity = 0.974;
      
      mockEmbeddingManager.calculateEmbedding.mockResolvedValue(mockEmbedding);
      mockEmbeddingManager.calculateSimilarity.mockReturnValue(expectedSimilarity);
      
      // Act
      const embedding = await embeddingService.calculateEmbedding(text);
      const similarity = embeddingService.calculateSimilarity(vector1, vector2);
      
      // Assert
      expect(embedding).toEqual(mockEmbedding);
      expect(similarity).toBe(expectedSimilarity);
      expect(mockEmbeddingManager.calculateEmbedding).toHaveBeenCalledWith(text);
      expect(mockEmbeddingManager.calculateSimilarity).toHaveBeenCalledWith(vector1, vector2);
    });
  });
});
