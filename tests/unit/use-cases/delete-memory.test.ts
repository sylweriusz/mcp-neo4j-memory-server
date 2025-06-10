/**
 * Updated Delete Memory Use Case Tests - Interface Compatible
 * Architectural Decision: Updated tests to work with Memory interface pattern
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteMemoryUseCase } from '../../../src/application/use-cases/delete-memory';
import { type Memory } from '../../../src/domain/entities/memory';
import { type MemoryRepository } from '../../../src/domain/repositories/memory-repository';
import { generateCompactId } from '../../../src/id_generator';

// Helper to create valid memory objects matching interface
const createTestMemory = (overrides: Partial<Memory> = {}): Memory => ({
  id: generateCompactId(),
  name: 'Test Memory',
  memoryType: 'project',
  metadata: {},
  createdAt: new Date('2025-01-01T00:00:00Z'),
  modifiedAt: new Date('2025-01-01T00:00:00Z'),
  lastAccessed: new Date('2025-01-01T00:00:00Z'),
  ...overrides
});

describe('DeleteMemoryUseCase', () => {
  let deleteMemoryUseCase: DeleteMemoryUseCase;
  let mockMemoryRepository: vi.Mocked<MemoryRepository>;

  beforeEach(() => {
    mockMemoryRepository = {
      findById: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
      findByIds: vi.fn(),
      findByType: vi.fn(),
      update: vi.fn(),
      exists: vi.fn(),
      findWithFilters: vi.fn(),
      addObservations: vi.fn(),
      deleteObservations: vi.fn(),
      createRelation: vi.fn(),
      createEnhancedRelation: vi.fn(),
      deleteRelation: vi.fn()
    };
    deleteMemoryUseCase = new DeleteMemoryUseCase(mockMemoryRepository);
  });

  describe('execute (single deletion)', () => {
    it('should delete an existing memory', async () => {
      // Arrange
      const memoryId = 'Bm>test12345678901';
      const existingMemory = createTestMemory({ id: memoryId });

      mockMemoryRepository.findById.mockResolvedValue(existingMemory);
      mockMemoryRepository.delete.mockResolvedValue(true);

      // Act
      const result = await deleteMemoryUseCase.execute(memoryId);

      // Assert
      expect(mockMemoryRepository.findById).toHaveBeenCalledWith(memoryId);
      expect(mockMemoryRepository.delete).toHaveBeenCalledWith(memoryId);
      expect(result).toBe(true);
    });

    it('should throw an error when memory does not exist', async () => {
      // Arrange
      const memoryId = 'Bm$nonexistent0001';
      mockMemoryRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(deleteMemoryUseCase.execute(memoryId))
        .rejects
        .toThrow(`Memory not found: ${memoryId}`);
    });

    it('should propagate repository errors', async () => {
      // Arrange
      const memoryId = 'Bm>test12345678901';
      const existingMemory = createTestMemory({ id: memoryId });
      
      mockMemoryRepository.findById.mockResolvedValue(existingMemory);
      mockMemoryRepository.delete.mockRejectedValue(new Error('Database connection failed'));

      // Act & Assert
      await expect(deleteMemoryUseCase.execute(memoryId))
        .rejects
        .toThrow('Database connection failed');
    });
  });

  describe('executeMany (batch deletion)', () => {
    it('should delete multiple existing memories', async () => {
      // Arrange
      const memoryIds = ['Bm>test1234567890a', 'Bm>test1234567890b'];
      const memories = memoryIds.map(id => createTestMemory({ id }));

      mockMemoryRepository.findById
        .mockResolvedValueOnce(memories[0])
        .mockResolvedValueOnce(memories[1]);
      mockMemoryRepository.delete
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true);

      // Act
      const result = await deleteMemoryUseCase.executeMany(memoryIds);

      // Assert
      expect(mockMemoryRepository.findById).toHaveBeenCalledTimes(2);
      expect(mockMemoryRepository.delete).toHaveBeenCalledTimes(2);
      expect(result.deleted).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle partial success when some memories do not exist', async () => {
      // Arrange
      const memoryIds = ['Bm>existing1234567', 'Bm$nonexistent0001'];
      const existingMemory = createTestMemory({ id: memoryIds[0] });

      mockMemoryRepository.findById
        .mockResolvedValueOnce(existingMemory)
        .mockResolvedValueOnce(null); // Second memory doesn't exist
      mockMemoryRepository.delete.mockResolvedValueOnce(true);

      // Act
      const result = await deleteMemoryUseCase.executeMany(memoryIds);

      // Assert
      expect(mockMemoryRepository.findById).toHaveBeenCalledTimes(2);
      expect(mockMemoryRepository.delete).toHaveBeenCalledTimes(1);
      expect(result.deleted).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Memory not found: Bm$nonexistent0001');
    });

    it('should handle partial success when some deletions fail', async () => {
      // Arrange
      const memoryIds = ['Bm>success123456789', 'Bm>failure123456789'];
      const memories = memoryIds.map(id => createTestMemory({ id }));

      mockMemoryRepository.findById
        .mockResolvedValueOnce(memories[0])
        .mockResolvedValueOnce(memories[1]);
      mockMemoryRepository.delete
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('Database error'));

      // Act
      const result = await deleteMemoryUseCase.executeMany(memoryIds);

      // Assert
      expect(mockMemoryRepository.findById).toHaveBeenCalledTimes(2);
      expect(mockMemoryRepository.delete).toHaveBeenCalledTimes(2);
      expect(result.deleted).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Database error');
    });

    it('should return empty result for empty input array', async () => {
      // Act
      const result = await deleteMemoryUseCase.executeMany([]);

      // Assert
      expect(result.deleted).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(mockMemoryRepository.findById).not.toHaveBeenCalled();
      expect(mockMemoryRepository.delete).not.toHaveBeenCalled();
    });
  });
});
