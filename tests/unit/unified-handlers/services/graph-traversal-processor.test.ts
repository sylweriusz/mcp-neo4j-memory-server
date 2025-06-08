/**
 * Graph Traversal Processor Tests
 * Coverage for graph traversal functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphTraversalProcessor } from '../../../../src/application/unified-handlers/services/graph-traversal-processor';

// Mock config
vi.mock('../../../../src/config');
import { getLimitsConfig } from '../../../../src/config';

describe('GraphTraversalProcessor - Production Coverage', () => {
  let processor: GraphTraversalProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock limits config
    vi.mocked(getLimitsConfig).mockReturnValue({
      maxMemoriesPerOperation: 50,
      maxRelationsPerOperation: 200,
      maxTraversalDepth: 5
    });

    processor = new GraphTraversalProcessor();
  });

  describe('Traversal Query Construction', () => {
    it('should build outbound traversal query', () => {
      // Arrange
      const options = {
        traverseFrom: 'test-memory-id',
        maxDepth: 2,
        traverseDirection: 'outbound' as const
      };

      // Act
      const result = processor.processTraversal(options);

      // Assert
      expect(result.cypher).toContain('(start)-[r:RELATES_TO*1..2]->(end:Memory)');
      expect(result.cypher).toContain('start:Memory {id: $startId}');
      expect(result.params.startId).toBe('test-memory-id');
      expect(result.params.maxDepth).toBe(2);
    });

    it('should build inbound traversal query', () => {
      // Arrange
      const options = {
        traverseFrom: 'test-memory-id',
        maxDepth: 3,
        traverseDirection: 'inbound' as const
      };

      // Act
      const result = processor.processTraversal(options);

      // Assert
      expect(result.cypher).toContain('(start:Memory)-[r:RELATES_TO*1..3]->(target)');
      expect(result.cypher).toContain('target:Memory {id: $startId}');
      expect(result.params.startId).toBe('test-memory-id');
      expect(result.params.maxDepth).toBe(3);
    });

    it('should build bidirectional traversal query', () => {
      // Arrange
      const options = {
        traverseFrom: 'test-memory-id',
        maxDepth: 1,
        traverseDirection: 'both' as const
      };

      // Act
      const result = processor.processTraversal(options);

      // Assert
      expect(result.cypher).toContain('(center)-[r:RELATES_TO*1..1]-(connected:Memory)');
      expect(result.cypher).toContain('center:Memory {id: $startId}');
      expect(result.params.startId).toBe('test-memory-id');
      expect(result.params.maxDepth).toBe(1);
    });

    it('should default to bidirectional when no direction specified', () => {
      // Arrange
      const options = {
        traverseFrom: 'test-memory-id'
      };

      // Act
      const result = processor.processTraversal(options);

      // Assert
      expect(result.cypher).toContain('(center)-[r:RELATES_TO*1..2]-(connected:Memory)');
      expect(result.params.maxDepth).toBe(2); // Default depth
    });

    it('should include relation type filtering when specified', () => {
      // Arrange
      const options = {
        traverseFrom: 'test-memory-id',
        traverseRelations: ['INFLUENCES', 'DEPENDS_ON'],
        traverseDirection: 'outbound' as const
      };

      // Act
      const result = processor.processTraversal(options);

      // Assert
      expect(result.cypher).toContain('ALL(rel IN relationships(path) WHERE rel.relationType IN $relationTypes)');
      expect(result.params.relationTypes).toEqual(['INFLUENCES', 'DEPENDS_ON']);
    });

    it('should enforce maximum depth limits', () => {
      // Arrange
      const options = {
        traverseFrom: 'test-memory-id',
        maxDepth: 10 // Exceeds limit
      };

      // Act & Assert
      expect(() => processor.processTraversal(options))
        .toThrow('maxDepth must be between 1 and 5');
    });
  });

  describe('Result Processing', () => {
    it('should process traversal results with Neo4j integer conversion', () => {
      // Arrange
      const mockResults = [
        {
          id: 'memory-1',
          name: 'Test Memory 1',
          type: 'concept',
          distance: { toNumber: () => 2 }, // Mock Neo4j Integer
          relation: 'INFLUENCES',
          strength: 0.8,
          source: 'agent',
          createdAt: '2025-01-01T00:00:00Z'
        },
        {
          id: 'memory-2',
          name: 'Test Memory 2',
          type: 'implementation',
          distance: 1, // Regular number
          relation: 'DEPENDS_ON',
          strength: 0.6,
          source: 'user'
        }
      ];

      // Act
      const results = processor.processTraversalResults(mockResults);

      // Assert
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        id: 'memory-1',
        name: 'Test Memory 1',
        type: 'concept',
        distance: 2, // Converted from Neo4j Integer
        relation: 'INFLUENCES',
        strength: 0.8,
        source: 'agent',
        createdAt: '2025-01-01T00:00:00Z'
      });
      expect(results[1].distance).toBe(1); // Regular number preserved
    });

    it('should handle missing or null values gracefully', () => {
      // Arrange
      const mockResults = [
        {
          id: 'memory-1',
          name: 'Test Memory',
          type: 'concept',
          distance: null,
          relation: 'RELATES_TO'
        }
      ];

      // Act
      const results = processor.processTraversalResults(mockResults);

      // Assert
      expect(results[0].distance).toBe(0); // Default for null/invalid
    });
  });

  describe('Validation', () => {
    it('should validate required traverseFrom parameter', () => {
      // Arrange
      const invalidOptions = {
        maxDepth: 2
        // Missing traverseFrom
      } as any;

      // Act & Assert
      expect(() => processor.processTraversal(invalidOptions))
        .toThrow('traverseFrom memory ID is required for graph traversal');
    });

    it('should validate maxDepth range', () => {
      // Arrange
      const invalidOptions = {
        traverseFrom: 'test-id',
        maxDepth: 0 // Below minimum
      };

      // Act & Assert
      expect(() => processor.processTraversal(invalidOptions))
        .toThrow('maxDepth must be between 1 and 5');
    });

    it('should validate traverseDirection options', () => {
      // Arrange
      const invalidOptions = {
        traverseFrom: 'test-id',
        traverseDirection: 'invalid' as any
      };

      // Act & Assert
      expect(() => processor.processTraversal(invalidOptions))
        .toThrow('Invalid traversal direction: invalid');
    });

    it('should validate empty traverseRelations array', () => {
      // Arrange
      const invalidOptions = {
        traverseFrom: 'test-id',
        traverseRelations: [] // Empty array
      };

      // Act & Assert
      expect(() => processor.processTraversal(invalidOptions))
        .toThrow('traverseRelations array cannot be empty if provided');
    });
  });

  describe('Helper Methods', () => {
    it('should provide supported directions documentation', () => {
      // Act
      const directions = processor.getSupportedDirections();

      // Assert
      expect(directions).toEqual([
        'outbound: What this memory influences',
        'inbound: What influences this memory',
        'both: All connected memories (default)'
      ]);
    });
  });
});
