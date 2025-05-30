/**
 * Delete Memory Use Case Tests
 * Single responsibility: Test memory deletion business logic
 * THE IMPLEMENTOR'S RULE: Test what matters, not what's obvious
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeleteMemoryUseCase } from '../../../src/application/use-cases/delete-memory';
import { Memory } from '../../../src/domain/entities/memory';

describe('DeleteMemoryUseCase', () => {
  let deleteUseCase: DeleteMemoryUseCase;
  let mockMemoryRepository: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Mock repository
    mockMemoryRepository = {
      findById: vi.fn(),
      delete: vi.fn()
    };

    deleteUseCase = new DeleteMemoryUseCase(mockMemoryRepository);
  });

  describe('execute (single deletion)', () => {
    it('should delete an existing memory', async () => {
      // Arrange
      const memoryId = 'Bm>test12345678901';
      const existingMemory = new Memory(
        memoryId,
        'Test Memory',
        'test'
      );
      
      mockMemoryRepository.findById.mockResolvedValue(existingMemory);
      mockMemoryRepository.delete.mockResolvedValue(true);

      // Act
      const result = await deleteUseCase.execute(memoryId);

      // Assert
      expect(mockMemoryRepository.findById).toHaveBeenCalledWith(memoryId);
      expect(mockMemoryRepository.delete).toHaveBeenCalledWith(memoryId);
      expect(result).toBe(true);
    });

    it('should throw an error when memory does not exist', async () => {
      // Arrange
      const memoryId = 'Bm>nonexistent12345';
      mockMemoryRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(deleteUseCase.execute(memoryId))
        .rejects.toThrow(`Memory with id ${memoryId} not found`);
      
      expect(mockMemoryRepository.findById).toHaveBeenCalledWith(memoryId);
      expect(mockMemoryRepository.delete).not.toHaveBeenCalled();
    });

    it('should propagate repository errors', async () => {
      // Arrange
      const memoryId = 'Bm>test12345678901';
      const existingMemory = new Memory(
        memoryId,
        'Test Memory',
        'test'
      );
      
      mockMemoryRepository.findById.mockResolvedValue(existingMemory);
      mockMemoryRepository.delete.mockRejectedValue(new Error('Database connection failed'));

      // Act & Assert
      await expect(deleteUseCase.execute(memoryId))
        .rejects.toThrow('Database connection failed');
      
      expect(mockMemoryRepository.findById).toHaveBeenCalledWith(memoryId);
      expect(mockMemoryRepository.delete).toHaveBeenCalledWith(memoryId);
    });
  });

  describe('executeMany (batch deletion)', () => {
    it('should delete multiple existing memories', async () => {
      // Arrange
      const memoryIds = ['Bm>test12345678901', 'Bm>test23456789012'];
      
      // Mock repository to return memories for both IDs
      mockMemoryRepository.findById.mockImplementation((id) => {
        return Promise.resolve(new Memory(id, `Memory ${id}`, 'test'));
      });
      mockMemoryRepository.delete.mockResolvedValue(true);

      // Act
      const result = await deleteUseCase.executeMany(memoryIds);

      // Assert
      expect(mockMemoryRepository.findById).toHaveBeenCalledTimes(2);
      expect(mockMemoryRepository.delete).toHaveBeenCalledTimes(2);
      expect(result.deleted).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle partial success when some memories do not exist', async () => {
      // Arrange
      const memoryIds = ['Bm>test12345678901', 'Bm>nonexistent1234567'];
      
      // Mock repository to return a memory for the first ID but null for the second
      mockMemoryRepository.findById.mockImplementation((id) => {
        if (id === 'Bm>test12345678901') {
          return Promise.resolve(new Memory(id, `Memory ${id}`, 'test'));
        }
        return Promise.resolve(null);
      });
      mockMemoryRepository.delete.mockResolvedValue(true);

      // Act
      const result = await deleteUseCase.executeMany(memoryIds);

      // Assert
      expect(mockMemoryRepository.findById).toHaveBeenCalledTimes(2);
      expect(mockMemoryRepository.delete).toHaveBeenCalledTimes(1);
      expect(result.deleted).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Bm>nonexistent123456');
      expect(result.errors[0]).toContain('not found');
    });

    it('should handle partial success when some deletions fail', async () => {
      // Arrange - Both IDs exactly 18 characters
      const memoryIds = ['Bm>test12345678901', 'Bm>erro12345678901']; // Both exactly 18 chars
      
      // Mock repository with detailed logging
      let findByIdCallCount = 0;
      let deleteCallCount = 0;
      
      mockMemoryRepository.findById.mockImplementation((id) => {
        findByIdCallCount++;
        return Promise.resolve(new Memory(id, `Memory ${id}`, 'test'));
      });
      
      mockMemoryRepository.delete.mockImplementation(async (id) => {
        deleteCallCount++;
        if (id === 'Bm>test12345678901') {
          return true;
        }
        throw new Error('Database error');
      });

      // Act
      const result = await deleteUseCase.executeMany(memoryIds);

      // Assert - Both operations should be attempted even if one fails
      expect(findByIdCallCount).toBe(2);
      expect(deleteCallCount).toBe(2); // Manual tracking confirms both deletes attempted
      expect(result.deleted).toBe(1); // Only one succeeded
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Bm>erro12345678901');
      expect(result.errors[0]).toContain('Database error');
    });

    it('should return empty result for empty input array', async () => {
      // Arrange
      const memoryIds: string[] = [];

      // Act
      const result = await deleteUseCase.executeMany(memoryIds);

      // Assert
      expect(mockMemoryRepository.findById).not.toHaveBeenCalled();
      expect(mockMemoryRepository.delete).not.toHaveBeenCalled();
      expect(result.deleted).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });
});
