/**
 * Context Level Processor Tests
 * Single responsibility: Test response detail control based on context level
 * GDD v3.0: Tests for context level filtering system
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextLevelProcessor, type MemoryResult } from '../../../../src/application/unified-handlers/services/context-level-processor';

describe('ContextLevelProcessor - Production Coverage', () => {
  let processor: ContextLevelProcessor;
  let fullMemoryResult: MemoryResult;

  beforeEach(() => {
    processor = new ContextLevelProcessor();
    
    // Create complete memory result for testing
    fullMemoryResult = {
      id: 'memory-123',
      name: 'Test Memory',
      memoryType: 'test',
      score: 0.85,
      observations: [
        { 
          id: 'obs-1', 
          content: 'First observation',
          createdAt: '2024-01-01T10:00:00Z'
        },
        { 
          id: 'obs-2', 
          content: 'Second observation',
          createdAt: '2024-01-01T11:00:00Z'
        }
      ],
      metadata: { 
        category: 'important',
        tags: ['test', 'memory']
      },
      createdAt: '2024-01-01T09:00:00Z',
      modifiedAt: '2024-01-01T12:00:00Z',
      lastAccessed: '2024-01-01T13:00:00Z',
      related: {
        ancestors: [
          {
            id: 'parent-1',
            name: 'Parent Memory',
            type: 'parent',
            relation: 'CONTAINS',
            distance: 1
          }
        ],
        descendants: [
          {
            id: 'child-1',
            name: 'Child Memory',
            type: 'child',
            relation: 'EXTENDS',
            distance: 1
          }
        ]
      }
    };
  });

  describe('Context Level Validation', () => {
    it('should validate valid context levels', () => {
      // Act & Assert
      expect(() => processor.validateContextLevel('minimal')).not.toThrow();
      expect(() => processor.validateContextLevel('full')).not.toThrow();
      expect(() => processor.validateContextLevel('relations-only')).not.toThrow();
    });

    it('should reject invalid context levels', () => {
      // Act & Assert
      expect(() => processor.validateContextLevel('invalid'))
        .toThrow('Invalid context level: invalid. Valid options: minimal, full, relations-only');
    });

    it('should return validated context level', () => {
      // Act
      const result = processor.validateContextLevel('minimal');

      // Assert
      expect(result).toBe('minimal');
    });
  });

  describe('Minimal Context Level', () => {
    it('should strip all fields except core identifiers', () => {
      // Act
      const result = processor.applyContextLevel([fullMemoryResult], 'minimal');

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'memory-123',
        name: 'Test Memory',
        memoryType: 'test',
        score: 0.85
      });
      
      // Verify stripped fields
      expect(result[0]).not.toHaveProperty('observations');
      expect(result[0]).not.toHaveProperty('metadata');
      expect(result[0]).not.toHaveProperty('createdAt');
      expect(result[0]).not.toHaveProperty('modifiedAt');
      expect(result[0]).not.toHaveProperty('lastAccessed');
      expect(result[0]).not.toHaveProperty('related');
    });

    it('should handle memory without score', () => {
      // Arrange
      const memoryWithoutScore = { ...fullMemoryResult };
      delete memoryWithoutScore.score;

      // Act
      const result = processor.applyContextLevel([memoryWithoutScore], 'minimal');

      // Assert
      expect(result[0]).toEqual({
        id: 'memory-123',
        name: 'Test Memory',
        memoryType: 'test'
      });
      expect(result[0]).not.toHaveProperty('score');
    });
  });

  describe('Full Context Level', () => {
    it('should return complete memory data unchanged', () => {
      // Act
      const result = processor.applyContextLevel([fullMemoryResult], 'full');

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(fullMemoryResult);
    });

    it('should be the default context level', () => {
      // Act - not specifying context level should default to 'full'
      const result = processor.applyContextLevel([fullMemoryResult]);

      // Assert
      expect(result[0]).toEqual(fullMemoryResult);
    });
  });
});
