/**
 * Memory Domain Entity Tests
 * Single responsibility: Verify Memory entity validation and behavior
 */
import { describe, it, expect } from 'vitest';
import { Memory } from '../../src/domain/entities/memory';

describe('Memory Entity', () => {
  const validMemoryData = {
    id: 'Bm>test12345678901',
    name: 'Test Memory',
    memoryType: 'project',
    metadata: { status: 'active' },
    createdAt: new Date(),
    modifiedAt: new Date(),
    lastAccessed: new Date(),
    tags: ['test', 'memory']
  };

  describe('constructor validation', () => {
    it('should create valid memory with all fields', () => {
      const memory = new Memory(
        validMemoryData.id,
        validMemoryData.name,
        validMemoryData.memoryType,
        validMemoryData.metadata,
        validMemoryData.createdAt,
        validMemoryData.modifiedAt,
        validMemoryData.lastAccessed,
        validMemoryData.tags
      );

      expect(memory.id).toBe(validMemoryData.id);
      expect(memory.name).toBe(validMemoryData.name);
      expect(memory.memoryType).toBe(validMemoryData.memoryType);
      expect(memory.tags).toEqual(validMemoryData.tags);
    });

    it('should reject invalid ID length', () => {
      expect(() => {
        new Memory(
          'short', // Invalid ID length
          validMemoryData.name,
          validMemoryData.memoryType
        );
      }).toThrow('Memory ID must be exactly 18 characters');
    });

    it('should reject empty name', () => {
      expect(() => {
        new Memory(
          validMemoryData.id,
          '', // Empty name
          validMemoryData.memoryType
        );
      }).toThrow('Memory name is required');
    });

    it('should reject empty memory type', () => {
      expect(() => {
        new Memory(
          validMemoryData.id,
          validMemoryData.name,
          '' // Empty type
        );
      }).toThrow('Memory type is required');
    });

    it('should reject too many tags', () => {
      expect(() => {
        new Memory(
          validMemoryData.id,
          validMemoryData.name,
          validMemoryData.memoryType,
          {},
          new Date(),
          new Date(),
          new Date(),
          ['tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6', 'tag7'] // 7 tags
        );
      }).toThrow('Memory cannot have more than 6 tags');
    });
  });

  describe('business methods', () => {
    it('should mark memory as accessed', async () => {
      const memory = new Memory(
        validMemoryData.id,
        validMemoryData.name,
        validMemoryData.memoryType
      );
      
      const before = memory.lastAccessed;
      // Add small delay to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 5));
      const accessed = memory.markAsAccessed();
      
      expect(accessed.lastAccessed.getTime()).toBeGreaterThan(before.getTime());
      expect(accessed.id).toBe(memory.id);
    });

    it('should update metadata while preserving other fields', async () => {
      const memory = new Memory(
        validMemoryData.id,
        validMemoryData.name,
        validMemoryData.memoryType,
        { original: 'value' }
      );
      
      // Add small delay to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 5));
      const updated = memory.withUpdatedMetadata({ new: 'data' });
      
      expect(updated.metadata).toEqual({ original: 'value', new: 'data' });
      expect(updated.id).toBe(memory.id);
      expect(updated.modifiedAt.getTime()).toBeGreaterThan(memory.modifiedAt.getTime());
    });
  });
});
