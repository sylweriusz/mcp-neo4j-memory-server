/**
 * Updated Memory Entity Tests - Interface Based
 * Architectural Decision: Tests now use interface patterns instead of constructor classes
 * Aligns with current codebase where Memory is interface, not class
 */

import { describe, it, expect } from 'vitest';
import { MemoryValidator, type Memory } from '../../src/domain/entities/memory';
import { generateCompactId } from '../../src/id_generator';

describe('Memory Entity - Interface Validation', () => {
  const validMemoryData: Memory = {
    id: generateCompactId(),
    name: 'Test Memory',
    memoryType: 'project',
    metadata: { category: 'test', version: '1.0' },
    createdAt: new Date(),
    modifiedAt: new Date(),
    lastAccessed: new Date()
  };

  describe('MemoryValidator validation', () => {
    it('should validate memory with all required fields', () => {
      expect(() => MemoryValidator.validate(validMemoryData)).not.toThrow();
    });

    it('should validate memory with minimal required fields', () => {
      const minimalMemory: Partial<Memory> = {
        id: validMemoryData.id,
        name: validMemoryData.name,
        memoryType: validMemoryData.memoryType
      };
      
      expect(() => MemoryValidator.validate(minimalMemory)).not.toThrow();
    });

    it('should reject invalid ID length', () => {
      const invalidMemory: Partial<Memory> = {
        id: 'invalid-short-id',
        name: validMemoryData.name,
        memoryType: validMemoryData.memoryType
      };
      
      expect(() => MemoryValidator.validate(invalidMemory))
        .toThrow('Memory ID must be exactly 18 characters');
    });

    it('should reject empty name', () => {
      const invalidMemory: Partial<Memory> = {
        id: validMemoryData.id,
        name: '',
        memoryType: validMemoryData.memoryType
      };
      
      expect(() => MemoryValidator.validate(invalidMemory))
        .toThrow('Memory name is required');
    });

    it('should reject empty memory type', () => {
      const invalidMemory: Partial<Memory> = {
        id: validMemoryData.id,
        name: validMemoryData.name,
        memoryType: ''
      };
      
      expect(() => MemoryValidator.validate(invalidMemory))
        .toThrow('Memory type is required');
    });
  });

  describe('MemoryValidator business methods', () => {
    it('should mark memory as accessed', () => {
      const originalTime = new Date('2025-01-01T00:00:00Z');
      const memory: Memory = {
        ...validMemoryData,
        lastAccessed: originalTime
      };
      
      const accessedMemory = MemoryValidator.markAsAccessed(memory);
      
      expect(accessedMemory.lastAccessed).not.toEqual(originalTime);
      expect(accessedMemory.lastAccessed).toBeInstanceOf(Date);
      expect(accessedMemory.id).toBe(memory.id);
      expect(accessedMemory.name).toBe(memory.name);
    });

    it('should update metadata while preserving other fields', () => {
      const originalMetadata = { category: 'old', version: '1.0' };
      const newMetadata = { category: 'new', status: 'active' };
      
      const memory: Memory = {
        ...validMemoryData,
        metadata: originalMetadata
      };
      
      const updatedMemory = MemoryValidator.withUpdatedMetadata(memory, newMetadata);
      
      expect(updatedMemory.metadata).toEqual({ 
        category: 'new', 
        version: '1.0', 
        status: 'active' 
      });
      expect(updatedMemory.id).toBe(memory.id);
      expect(updatedMemory.name).toBe(memory.name);
      expect(updatedMemory.modifiedAt).not.toEqual(memory.modifiedAt);
    });
  });

  describe('Memory interface structure compliance', () => {
    it('should support optional observations array', () => {
      const memoryWithObs: Memory = {
        ...validMemoryData,
        observations: [
          { id: 'obs1', content: 'Test observation', createdAt: '2025-01-01T00:00:00Z' }
        ]
      };
      
      expect(memoryWithObs.observations).toHaveLength(1);
      expect(memoryWithObs.observations![0].content).toBe('Test observation');
    });

    it('should support optional related memories', () => {
      const memoryWithRelated: Memory = {
        ...validMemoryData,
        related: {
          ancestors: [
            { id: 'ancestor1', name: 'Parent', type: 'project', relation: 'CONTAINS', distance: 1 }
          ],
          descendants: [
            { id: 'child1', name: 'Child', type: 'task', relation: 'BELONGS_TO', distance: 1 }
          ]
        }
      };
      
      expect(memoryWithRelated.related!.ancestors).toHaveLength(1);
      expect(memoryWithRelated.related!.descendants).toHaveLength(1);
    });
  });
});
