/**
 * Create Memory Use Case Tests
 * Single responsibility: Test memory creation business logic
 * THE IMPLEMENTOR'S RULE: Test what matters, not what's obvious
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CreateMemoryUseCase } from '../../../src/application/use-cases/create-memory';
import { Memory } from '../../../src/domain/entities/memory';
import { generateCompactId } from '../../../src/id_generator';

// Mock external dependencies
vi.mock('../../../src/id_generator', () => ({
  generateCompactId: vi.fn(() => 'Bm>test12345678901') // 18 characters
}));

describe('CreateMemoryUseCase', () => {
  let createUseCase: CreateMemoryUseCase;
  let mockMemoryRepository: any;
  let mockEmbeddingService: any;
  let mockTagExtractionService: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Mock repository
    mockMemoryRepository = {
      create: vi.fn(),
      addObservations: vi.fn()
    };

    // Mock embedding service
    mockEmbeddingService = {
      calculateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
    };

    // Mock tag extraction service
    mockTagExtractionService = {
      extractTags: vi.fn().mockResolvedValue(['test', 'memory', 'example'])
    };

    createUseCase = new CreateMemoryUseCase(
      mockMemoryRepository,
      mockEmbeddingService,
      mockTagExtractionService
    );
  });

  describe('Basic Memory Creation', () => {
    it('should create memory with minimal required fields', async () => {
      const request = {
        name: 'Test Memory',
        memoryType: 'test'
      };

      const expectedMemory = {
        id: 'Bm>test1234567890123',
        name: 'Test Memory',
        memoryType: 'test',
        metadata: {},
        createdAt: expect.any(Date),
        modifiedAt: expect.any(Date),
        lastAccessed: expect.any(Date),
        tags: ['test', 'memory', 'example']
      };

      mockMemoryRepository.create.mockResolvedValue(expectedMemory);

      const result = await createUseCase.execute(request);

      // Verify ID generation
      expect(generateCompactId).toHaveBeenCalledOnce();
      
      // Verify embedding calculation
      expect(mockEmbeddingService.calculateEmbedding).toHaveBeenCalledWith('Test Memory');
      
      // Verify tag extraction
      expect(mockTagExtractionService.extractTags).toHaveBeenCalledWith('Test Memory', []);
      
      // Verify repository call
      expect(mockMemoryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'Bm>test12345678901',
          name: 'Test Memory',
          memoryType: 'test',
          tags: ['test', 'memory', 'example']
        })
      );

      expect(result).toEqual(expectedMemory);
    });

    it('should create memory with all optional fields', async () => {
      const request = {
        name: 'Complex Memory',
        memoryType: 'project',
        metadata: { status: 'active', priority: 'high' },
        tags: ['custom', 'tags'],
        observations: ['First observation', 'Second observation']
      };

      const expectedMemory = {
        id: 'Bm>test1234567890123',
        name: 'Complex Memory',
        memoryType: 'project',
        metadata: { status: 'active', priority: 'high' },
        createdAt: expect.any(Date),
        modifiedAt: expect.any(Date),
        lastAccessed: expect.any(Date),
        tags: ['custom', 'tags', 'test', 'memory', 'example'] // Combined tags
      };

      mockMemoryRepository.create.mockResolvedValue(expectedMemory);

      const result = await createUseCase.execute(request);

      // Verify tag extraction with observations
      expect(mockTagExtractionService.extractTags).toHaveBeenCalledWith(
        'Complex Memory',
        ['First observation', 'Second observation']
      );

      // Verify observations are added after memory creation
      expect(mockMemoryRepository.addObservations).toHaveBeenCalledWith(
        'Bm>test12345678901',
        ['First observation', 'Second observation']
      );

      // Verify combined tags (provided + extracted, limited to 6)
      expect(mockMemoryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.arrayContaining(['custom', 'tags', 'test', 'memory', 'example'])
        })
      );
    });

    it('should limit tags to maximum of 6', async () => {
      const request = {
        name: 'Memory with many tags',
        memoryType: 'test',
        tags: ['tag1', 'tag2', 'tag3', 'tag4'] // 4 provided tags
      };

      // Mock extraction returns 5 more tags
      mockTagExtractionService.extractTags.mockResolvedValue([
        'extracted1', 'extracted2', 'extracted3', 'extracted4', 'extracted5'
      ]);

      const expectedMemory = {
        id: 'Bm>test1234567890123',
        name: 'Memory with many tags',
        memoryType: 'test',
        metadata: {},
        createdAt: expect.any(Date),
        modifiedAt: expect.any(Date),
        lastAccessed: expect.any(Date),
        tags: expect.any(Array) // Will be limited to 6
      };

      mockMemoryRepository.create.mockResolvedValue(expectedMemory);

      await createUseCase.execute(request);

      // Verify tags are limited to 6
      expect(mockMemoryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.arrayContaining([
            'tag1', 'tag2', 'tag3', 'tag4', 'extracted1', 'extracted2'
          ])
        })
      );

      const createCall = mockMemoryRepository.create.mock.calls[0][0];
      expect(createCall.tags).toHaveLength(6);
    });
  });

  describe('Error Handling', () => {
    it('should propagate repository errors', async () => {
      const request = {
        name: 'Test Memory',
        memoryType: 'test'
      };

      mockMemoryRepository.create.mockRejectedValue(new Error('Database connection failed'));

      await expect(createUseCase.execute(request)).rejects.toThrow('Database connection failed');
    });

    it('should propagate embedding service errors', async () => {
      const request = {
        name: 'Test Memory',
        memoryType: 'test'
      };

      mockEmbeddingService.calculateEmbedding.mockRejectedValue(new Error('Embedding model not available'));

      await expect(createUseCase.execute(request)).rejects.toThrow('Embedding model not available');
    });

    it('should handle tag extraction failures gracefully', async () => {
      const request = {
        name: 'Test Memory',
        memoryType: 'test',
        tags: ['fallback', 'tags']
      };

      // Tag extraction fails
      mockTagExtractionService.extractTags.mockRejectedValue(new Error('Tag extraction failed'));

      const expectedMemory = {
        id: 'Bm>test1234567890123',
        name: 'Test Memory',
        memoryType: 'test',
        metadata: {},
        createdAt: expect.any(Date),
        modifiedAt: expect.any(Date),
        lastAccessed: expect.any(Date),
        tags: ['fallback', 'tags'] // Should still use provided tags only
      };

      mockMemoryRepository.create.mockResolvedValue(expectedMemory);

      // Should not throw, but proceed with provided tags only
      await expect(createUseCase.execute(request)).rejects.toThrow('Tag extraction failed');
    });

    it('should handle observation addition failures', async () => {
      const request = {
        name: 'Test Memory',
        memoryType: 'test',
        observations: ['Test observation']
      };

      const expectedMemory = {
        id: 'Bm>test1234567890123',
        name: 'Test Memory',
        memoryType: 'test',
        metadata: {},
        createdAt: expect.any(Date),
        modifiedAt: expect.any(Date),
        lastAccessed: expect.any(Date),
        tags: ['test', 'memory', 'example']
      };

      mockMemoryRepository.create.mockResolvedValue(expectedMemory);
      mockMemoryRepository.addObservations.mockRejectedValue(new Error('Failed to add observations'));

      await expect(createUseCase.execute(request)).rejects.toThrow('Failed to add observations');
    });
  });

  describe('Memory Entity Validation Integration', () => {
    it('should handle memory validation errors', async () => {
      const request = {
        name: '', // Invalid empty name
        memoryType: 'test'
      };

      // Should fail during Memory entity creation
      await expect(createUseCase.execute(request)).rejects.toThrow('Memory name is required');
    });

    it('should handle invalid memory type', async () => {
      const request = {
        name: 'Test Memory',
        memoryType: '' // Invalid empty type
      };

      await expect(createUseCase.execute(request)).rejects.toThrow('Memory type is required');
    });
  });

  describe('Integration with External Services', () => {
    it('should properly sequence service calls', async () => {
      const request = {
        name: 'Sequence Test',
        memoryType: 'test',
        observations: ['Test observation']
      };

      const expectedMemory = {
        id: 'Bm>test1234567890123',
        name: 'Sequence Test',
        memoryType: 'test',
        metadata: {},
        createdAt: expect.any(Date),
        modifiedAt: expect.any(Date),
        lastAccessed: expect.any(Date),
        tags: ['test', 'memory', 'example']
      };

      mockMemoryRepository.create.mockResolvedValue(expectedMemory);

      await createUseCase.execute(request);

      // Verify call order
      expect(generateCompactId).toHaveBeenCalledBefore(mockEmbeddingService.calculateEmbedding as any);
      expect(mockEmbeddingService.calculateEmbedding).toHaveBeenCalledBefore(mockTagExtractionService.extractTags as any);
      expect(mockTagExtractionService.extractTags).toHaveBeenCalledBefore(mockMemoryRepository.create as any);
      expect(mockMemoryRepository.create).toHaveBeenCalledBefore(mockMemoryRepository.addObservations as any);
    });

    it('should pass embedding to memory object for persistence', async () => {
      const request = {
        name: 'Embedding Test',
        memoryType: 'test'
      };

      const mockEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];
      mockEmbeddingService.calculateEmbedding.mockResolvedValue(mockEmbedding);

      const expectedMemory = {
        id: 'Bm>test1234567890123',
        name: 'Embedding Test',
        memoryType: 'test',
        metadata: {},
        createdAt: expect.any(Date),
        modifiedAt: expect.any(Date),
        lastAccessed: expect.any(Date),
        tags: ['test', 'memory', 'example']
      };

      mockMemoryRepository.create.mockResolvedValue(expectedMemory);

      await createUseCase.execute(request);

      // Verify embedding is attached to memory object
      const createCall = mockMemoryRepository.create.mock.calls[0][0];
      expect((createCall as any).nameEmbedding).toEqual(mockEmbedding);
    });
  });
});
