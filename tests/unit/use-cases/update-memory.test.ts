/**
 * Update Memory Use Case Tests - Interface Compatible
 * Architectural Decision: Updated tests to work with Memory interface pattern
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateMemoryUseCase } from '../../../src/application/use-cases/update-memory';
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

describe('UpdateMemoryUseCase', () => {
  let updateMemoryUseCase: UpdateMemoryUseCase;
  let mockMemoryRepository: vi.Mocked<MemoryRepository>;

  beforeEach(() => {
    mockMemoryRepository = {
      findById: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      findByIds: vi.fn(),
      findByType: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
      findWithFilters: vi.fn(),
      addObservations: vi.fn(),
      deleteObservations: vi.fn(),
      createRelation: vi.fn(),
      createEnhancedRelation: vi.fn(),
      deleteRelation: vi.fn()
    };
    updateMemoryUseCase = new UpdateMemoryUseCase(mockMemoryRepository);
  });

  describe('execute', () => {
    it('should update an existing memory with new name', async () => {
      // Arrange
      const memoryId = 'Bm>test12345678901';
      const existingMemory = createTestMemory({ 
        id: memoryId,
        name: 'Old Name',
        modifiedAt: new Date('2025-01-01T00:00:00Z')
      });
      const updatedMemory = { 
        ...existingMemory, 
        name: 'New Name',
        modifiedAt: new Date('2025-01-01T01:00:00Z')
      };

      mockMemoryRepository.findById.mockResolvedValue(existingMemory);
      mockMemoryRepository.update.mockResolvedValue(updatedMemory);

      // Act
      const result = await updateMemoryUseCase.execute({
        id: memoryId,
        name: 'New Name'
      });

      // Assert
      expect(mockMemoryRepository.findById).toHaveBeenCalledWith(memoryId);
      expect(mockMemoryRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: memoryId,
          name: 'New Name',
          modifiedAt: expect.any(Date)
        })
      );
      expect(result).toEqual(updatedMemory);
    });

    it('should update memory type and metadata', async () => {
      // Arrange
      const memoryId = 'Bm>test12345678901';
      const existingMemory = createTestMemory({ 
        id: memoryId,
        memoryType: 'old-type',
        metadata: { oldKey: 'oldValue' }
      });
      const updatedMemory = { 
        ...existingMemory, 
        memoryType: 'new-type',
        metadata: { newKey: 'newValue' },
        modifiedAt: new Date()
      };

      mockMemoryRepository.findById.mockResolvedValue(existingMemory);
      mockMemoryRepository.update.mockResolvedValue(updatedMemory);

      // Act
      const result = await updateMemoryUseCase.execute({
        id: memoryId,
        memoryType: 'new-type',
        metadata: { newKey: 'newValue' }
      });

      // Assert
      expect(mockMemoryRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          memoryType: 'new-type',
          metadata: { newKey: 'newValue' },
          modifiedAt: expect.any(Date)
        })
      );
      expect(result).toEqual(updatedMemory);
    });

    it('should update modifiedAt timestamp automatically', async () => {
      // Arrange
      const memoryId = 'Bm>test12345678901';
      const oldDate = new Date('2025-01-01T00:00:00Z');
      const existingMemory = createTestMemory({ 
        id: memoryId,
        modifiedAt: oldDate
      });
      const updatedMemory = { 
        ...existingMemory,
        modifiedAt: new Date()
      };

      mockMemoryRepository.findById.mockResolvedValue(existingMemory);
      mockMemoryRepository.update.mockResolvedValue(updatedMemory);

      // Act
      await updateMemoryUseCase.execute({
        id: memoryId,
        name: 'Updated Name'
      });

      // Assert
      const updateCall = mockMemoryRepository.update.mock.calls[0][0];
      expect(updateCall.modifiedAt).not.toEqual(oldDate);
      expect(updateCall.modifiedAt).toBeInstanceOf(Date);
    });

    it('should throw an error when memory does not exist', async () => {
      // Arrange
      const memoryId = 'Bm>nonexistent12345';
      mockMemoryRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(updateMemoryUseCase.execute({
        id: memoryId,
        name: 'New Name'
      })).rejects.toThrow(`Memory with id ${memoryId} not found`);
    });

    it('should preserve existing properties when not specified in update', async () => {
      // Arrange
      const memoryId = 'Bm>test12345678901';
      const existingMemory = createTestMemory({ 
        id: memoryId,
        name: 'Original Name',
        memoryType: 'original-type',
        metadata: { originalKey: 'originalValue' }
      });
      const updatedMemory = { 
        ...existingMemory,
        name: 'Updated Name',
        modifiedAt: new Date()
      };

      mockMemoryRepository.findById.mockResolvedValue(existingMemory);
      mockMemoryRepository.update.mockResolvedValue(updatedMemory);

      // Act
      await updateMemoryUseCase.execute({
        id: memoryId,
        name: 'Updated Name'
        // Note: not updating memoryType or metadata
      });

      // Assert
      const updateCall = mockMemoryRepository.update.mock.calls[0][0];
      expect(updateCall.memoryType).toBe('original-type');
      expect(updateCall.metadata).toEqual({ originalKey: 'originalValue' });
    });

    it('should propagate repository errors', async () => {
      // Arrange
      const memoryId = 'Bm>test12345678901';
      const existingMemory = createTestMemory({ id: memoryId });
      
      mockMemoryRepository.findById.mockResolvedValue(existingMemory);
      mockMemoryRepository.update.mockRejectedValue(new Error('Database connection failed'));

      // Act & Assert
      await expect(updateMemoryUseCase.execute({
        id: memoryId,
        name: 'New Name'
      })).rejects.toThrow('Database connection failed');
    });

    it('should handle empty update requests', async () => {
      // Arrange
      const memoryId = 'Bm>test12345678901';
      const existingMemory = createTestMemory({ id: memoryId });
      const updatedMemory = { 
        ...existingMemory,
        modifiedAt: new Date()
      };

      mockMemoryRepository.findById.mockResolvedValue(existingMemory);
      mockMemoryRepository.update.mockResolvedValue(updatedMemory);

      // Act
      await updateMemoryUseCase.execute({ id: memoryId });

      // Assert
      const updateCall = mockMemoryRepository.update.mock.calls[0][0];
      expect(updateCall.name).toBe(existingMemory.name);
      expect(updateCall.memoryType).toBe(existingMemory.memoryType);
      expect(updateCall.metadata).toEqual(existingMemory.metadata);
      expect(updateCall.modifiedAt).toBeInstanceOf(Date);
    });
  });
});
