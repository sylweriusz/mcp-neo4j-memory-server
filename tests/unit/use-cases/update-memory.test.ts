/**
 * Update Memory Use Case Tests
 * Single responsibility: Test memory updating business logic
 * CURRENT REALITY: No tag system - Memory only has core fields
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UpdateMemoryUseCase } from '../../../src/application/use-cases/update-memory';
import { Memory } from '../../../src/domain/entities/memory';

describe('UpdateMemoryUseCase', () => {
  let updateUseCase: UpdateMemoryUseCase;
  let mockMemoryRepository: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Mock repository
    mockMemoryRepository = {
      findById: vi.fn(),
      update: vi.fn()
    };

    updateUseCase = new UpdateMemoryUseCase(mockMemoryRepository);
  });

  describe('execute', () => {
    const oldDate = new Date('2025-05-29T00:00:00.000Z');

    it('should update a memory with all fields', async () => {
      // Arrange
      const memoryId = 'Bm>test12345678901';
      const existingMemory = new Memory(
        memoryId,
        'Original Name',
        'original-type',
        { original: 'value' },
        oldDate,
        oldDate,
        oldDate
      );

      const updateRequest = {
        id: memoryId,
        name: 'Updated Name',
        memoryType: 'updated-type',
        metadata: { updated: 'value' }
      };

      const expectedUpdatedMemory = new Memory(
        memoryId,
        'Updated Name',
        'updated-type',
        { updated: 'value' },
        oldDate,
        new Date(), // modifiedAt will be updated
        oldDate
      );

      mockMemoryRepository.findById.mockResolvedValue(existingMemory);
      mockMemoryRepository.update.mockResolvedValue(expectedUpdatedMemory);

      // Act
      const result = await updateUseCase.execute(updateRequest);

      // Assert
      expect(mockMemoryRepository.findById).toHaveBeenCalledWith(memoryId);
      expect(mockMemoryRepository.update).toHaveBeenCalledWith({
        id: memoryId,
        name: 'Updated Name',
        memoryType: 'updated-type',
        metadata: { updated: 'value' },
        createdAt: oldDate,
        lastAccessed: oldDate,
        modifiedAt: expect.any(String) // It's a string in the real implementation
      });
      expect(result).toEqual(expectedUpdatedMemory);
    });

    it('should update a memory with only some fields', async () => {
      // Arrange
      const memoryId = 'Bm>test12345678901';
      const existingMemory = new Memory(
        memoryId,
        'Original Name',
        'original-type',
        { original: 'value' },
        oldDate,
        oldDate,
        oldDate
      );

      const updateRequest = {
        id: memoryId,
        name: 'Updated Name'
      };

      const expectedUpdatedMemory = new Memory(
        memoryId,
        'Updated Name',
        'original-type',
        { original: 'value' },
        oldDate,
        new Date(),
        oldDate
      );

      mockMemoryRepository.findById.mockResolvedValue(existingMemory);
      mockMemoryRepository.update.mockResolvedValue(expectedUpdatedMemory);

      // Act
      const result = await updateUseCase.execute(updateRequest);

      // Assert
      expect(mockMemoryRepository.findById).toHaveBeenCalledWith(memoryId);
      expect(mockMemoryRepository.update).toHaveBeenCalledWith({
        id: memoryId,
        name: 'Updated Name',
        memoryType: 'original-type',
        metadata: { original: 'value' },
        createdAt: oldDate,
        lastAccessed: oldDate,
        modifiedAt: expect.any(String)
      });
      expect(result).toEqual(expectedUpdatedMemory);
    });

    it('should update metadata while preserving existing fields', async () => {
      // Arrange
      const memoryId = 'Bm>test12345678901';
      const existingMemory = new Memory(
        memoryId,
        'Original Name',
        'original-type',
        { existing: 'data' },
        oldDate,
        oldDate,
        oldDate
      );

      const updateRequest = {
        id: memoryId,
        metadata: { updated: 'value' }
      };

      const expectedUpdatedMemory = new Memory(
        memoryId,
        'Original Name',
        'original-type',
        { updated: 'value' },
        oldDate,
        new Date(),
        oldDate
      );

      mockMemoryRepository.findById.mockResolvedValue(existingMemory);
      mockMemoryRepository.update.mockResolvedValue(expectedUpdatedMemory);

      // Act
      const result = await updateUseCase.execute(updateRequest);

      // Assert
      expect(mockMemoryRepository.findById).toHaveBeenCalledWith(memoryId);
      expect(mockMemoryRepository.update).toHaveBeenCalledWith({
        id: memoryId,
        name: 'Original Name',
        memoryType: 'original-type',
        metadata: { updated: 'value' },
        createdAt: oldDate,
        lastAccessed: oldDate,
        modifiedAt: expect.any(String)
      });
      expect(result).toEqual(expectedUpdatedMemory);
    });

    it('should throw an error when memory does not exist', async () => {
      // Arrange
      const memoryId = 'Bm>nonexistent01234';
      const updateRequest = {
        id: memoryId,
        name: 'Updated Name'
      };

      mockMemoryRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(updateUseCase.execute(updateRequest)).rejects.toThrow(
        `Memory with id ${memoryId} not found`
      );
      expect(mockMemoryRepository.update).not.toHaveBeenCalled();
    });

    it('should update the modifiedAt timestamp', async () => {
      // Arrange
      const memoryId = 'Bm>test12345678901';
      const existingMemory = new Memory(
        memoryId,
        'Test Memory',
        'test',
        {},
        oldDate,
        oldDate,
        oldDate
      );

      const updateRequest = {
        id: memoryId,
        name: 'Updated Name'
      };

      mockMemoryRepository.findById.mockResolvedValue(existingMemory);
      mockMemoryRepository.update.mockImplementation((memory) => memory);

      // Act
      await updateUseCase.execute(updateRequest);

      // Assert
      const updateCall = mockMemoryRepository.update.mock.calls[0][0];
      const modifiedAt = new Date(updateCall.modifiedAt);
      expect(modifiedAt.getTime()).toBeGreaterThan(oldDate.getTime());
    });

    it('should propagate repository errors', async () => {
      // Arrange
      const memoryId = 'Bm>test12345678901';
      const existingMemory = new Memory(
        memoryId,
        'Test Memory',
        'test'
      );

      const updateRequest = {
        id: memoryId,
        name: 'Updated Name'
      };

      mockMemoryRepository.findById.mockResolvedValue(existingMemory);
      mockMemoryRepository.update.mockRejectedValue(new Error('Database connection failed'));

      // Act & Assert
      await expect(updateUseCase.execute(updateRequest)).rejects.toThrow('Database connection failed');
    });
  });
});
