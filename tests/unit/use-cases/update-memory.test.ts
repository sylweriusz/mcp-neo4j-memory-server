/**
 * Update Memory Use Case Tests
 * Single responsibility: Test memory update business logic
 * THE IMPLEMENTOR'S RULE: Test what matters, not what's obvious
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UpdateMemoryUseCase, UpdateMemoryRequest } from '../../../src/application/use-cases/update-memory';
import { Memory } from '../../../src/domain/entities/memory';

describe('UpdateMemoryUseCase', () => {
  let updateUseCase: UpdateMemoryUseCase;
  let mockMemoryRepository: any;
  let originalDateNow: () => number;

  // Mock date for consistent testing
  const mockDate = new Date('2025-05-30T00:00:00.000Z');
  const oldDate = new Date('2025-05-29T00:00:00.000Z');
  
  beforeEach(() => {
    // Save original Date.now and mock it
    originalDateNow = Date.now;
    Date.now = vi.fn(() => mockDate.getTime());
    
    // Reset mocks
    vi.clearAllMocks();
    
    // Mock repository
    mockMemoryRepository = {
      findById: vi.fn(),
      update: vi.fn()
    };

    updateUseCase = new UpdateMemoryUseCase(mockMemoryRepository);
  });

  afterEach(() => {
    // Restore original Date.now
    Date.now = originalDateNow;
  });

  describe('execute', () => {
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
        oldDate,
        ['original', 'tags']
      );
      
      const updateRequest: UpdateMemoryRequest = {
        id: memoryId,
        name: 'Updated Name',
        memoryType: 'updated-type',
        metadata: { updated: 'value' },
        tags: ['updated', 'tags']
      };
      
      const expectedUpdatedMemory = new Memory(
        memoryId,
        'Updated Name',
        'updated-type',
        { updated: 'value' },
        oldDate,
        mockDate,
        oldDate,
        ['updated', 'tags']
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
        tags: ['updated', 'tags'],
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
        oldDate,
        ['original', 'tags']
      );
      
      const updateRequest: UpdateMemoryRequest = {
        id: memoryId,
        name: 'Updated Name',
        // Only updating name, leaving other fields unchanged
      };
      
      const expectedUpdatedMemory = new Memory(
        memoryId,
        'Updated Name',
        'original-type',
        { original: 'value' },
        oldDate,
        mockDate,
        oldDate,
        ['original', 'tags']
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
        memoryType: 'original-type', // Unchanged
        metadata: { original: 'value' }, // Unchanged
        tags: ['original', 'tags'], // Unchanged
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
        { 
          original: 'value',
          preserved: 'field'
        },
        oldDate,
        oldDate,
        oldDate,
        ['original', 'tags']
      );
      
      const updateRequest: UpdateMemoryRequest = {
        id: memoryId,
        metadata: { 
          updated: 'value',
          // Note: this completely replaces the metadata object
        }
      };
      
      const expectedUpdatedMemory = new Memory(
        memoryId,
        'Original Name',
        'original-type',
        { updated: 'value' },
        oldDate,
        mockDate,
        oldDate,
        ['original', 'tags']
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
        tags: ['original', 'tags'],
        createdAt: oldDate,
        lastAccessed: oldDate,
        modifiedAt: expect.any(String)
      });
      expect(result).toEqual(expectedUpdatedMemory);
      expect(result.metadata).not.toHaveProperty('preserved');
    });

    it('should throw an error when memory does not exist', async () => {
      // Arrange
      const memoryId = 'Bm>nonexistent12345';
      const updateRequest: UpdateMemoryRequest = {
        id: memoryId,
        name: 'Updated Name'
      };
      
      mockMemoryRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(updateUseCase.execute(updateRequest))
        .rejects.toThrow(`Memory with id ${memoryId} not found`);
      
      expect(mockMemoryRepository.findById).toHaveBeenCalledWith(memoryId);
      expect(mockMemoryRepository.update).not.toHaveBeenCalled();
    });

    it('should update the modifiedAt timestamp', async () => {
      // Arrange
      const memoryId = 'Bm>test12345678901';
      const existingMemory = new Memory(
        memoryId,
        'Original Name',
        'original-type',
        {},
        oldDate,
        oldDate,
        oldDate
      );
      
      const updateRequest: UpdateMemoryRequest = {
        id: memoryId,
        name: 'Updated Name'
      };
      
      mockMemoryRepository.findById.mockResolvedValue(existingMemory);
      mockMemoryRepository.update.mockImplementation(memory => Promise.resolve(memory));

      // Act
      const result = await updateUseCase.execute(updateRequest);

      // Assert
      expect(result.modifiedAt).not.toEqual(existingMemory.modifiedAt);
      expect(new Date(result.modifiedAt).getTime()).toBeGreaterThan(new Date(existingMemory.modifiedAt).getTime());
    });

    it('should propagate repository errors', async () => {
      // Arrange
      const memoryId = 'Bm>test12345678901';
      const existingMemory = new Memory(
        memoryId,
        'Original Name',
        'original-type',
        {},
        oldDate,
        oldDate,
        oldDate
      );
      
      const updateRequest: UpdateMemoryRequest = {
        id: memoryId,
        name: 'Updated Name'
      };
      
      mockMemoryRepository.findById.mockResolvedValue(existingMemory);
      mockMemoryRepository.update.mockRejectedValue(new Error('Database connection failed'));

      // Act & Assert
      await expect(updateUseCase.execute(updateRequest))
        .rejects.toThrow('Database connection failed');
      
      expect(mockMemoryRepository.findById).toHaveBeenCalledWith(memoryId);
      expect(mockMemoryRepository.update).toHaveBeenCalled();
    });
  });
});
