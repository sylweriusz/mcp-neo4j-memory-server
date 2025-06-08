/**
 * Local ID Resolver Tests
 * Single responsibility: Test local ID resolution for batch operations
 * GDD v3.0: Tests for local ID mapping system
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LocalIdResolver } from '../../../../src/application/unified-handlers/services/local-id-resolver';

describe('LocalIdResolver - Production Coverage', () => {
  let resolver: LocalIdResolver;

  beforeEach(() => {
    resolver = new LocalIdResolver();
  });

  describe('Local ID Validation', () => {
    it('should validate unique local IDs within request', () => {
      // Arrange
      const memories = [
        { localId: 'frontend', name: 'Frontend App' },
        { localId: 'backend', name: 'Backend API' }
      ];

      // Act & Assert - should not throw
      expect(() => resolver.validateLocalIds(memories)).not.toThrow();
    });

    it('should detect duplicate local IDs within request', () => {
      // Arrange
      const memories = [
        { localId: 'component', name: 'Component A' },
        { localId: 'component', name: 'Component B' } // Duplicate
      ];

      // Act & Assert
      expect(() => resolver.validateLocalIds(memories))
        .toThrow('Duplicate localId "component" in request');
    });

    it('should reject local IDs that look like real memory IDs', () => {
      // Arrange - 18-character string that looks like BASE85 ID
      const memories = [
        { localId: 'dZ$1/D-Ljt*!I?R)_-', name: 'Memory' } // Looks like real ID
      ];

      // Act & Assert
      expect(() => resolver.validateLocalIds(memories))
        .toThrow('Local ID cannot look like real memory ID');
    });

    it('should allow valid local IDs', () => {
      // Arrange
      const memories = [
        { localId: 'frontend-app', name: 'Frontend' },
        { localId: 'backend-api', name: 'Backend' },
        { localId: 'database', name: 'Database' }
      ];

      // Act & Assert
      expect(() => resolver.validateLocalIds(memories)).not.toThrow();
    });

    it('should handle memories without local IDs', () => {
      // Arrange
      const memories = [
        { name: 'Memory without localId' },
        { localId: 'withLocalId', name: 'Memory with localId' }
      ];

      // Act & Assert
      expect(() => resolver.validateLocalIds(memories)).not.toThrow();
    });
  });

  describe('Mapping Creation', () => {
    it('should build localId to realId mapping', () => {
      // Arrange
      const memories = [
        { localId: 'frontend', id: 'real-id-123' },
        { localId: 'backend', id: 'real-id-456' },
        { id: 'real-id-789' } // No localId - should be ignored
      ];

      // Act
      const mapping = resolver.buildMapping(memories);

      // Assert
      expect(mapping.size).toBe(2);
      expect(mapping.get('frontend')).toBe('real-id-123');
      expect(mapping.get('backend')).toBe('real-id-456');
      expect(mapping.has('real-id-789')).toBe(false);
    });

    it('should handle empty memories array', () => {
      // Act
      const mapping = resolver.buildMapping([]);

      // Assert
      expect(mapping.size).toBe(0);
    });

    it('should convert mapping to response format', () => {
      // Arrange
      const mapping = new Map([
        ['frontend', 'real-id-123'],
        ['backend', 'real-id-456']
      ]);

      // Act
      const response = resolver.mappingToResponse(mapping);

      // Assert
      expect(response).toEqual({
        frontend: 'real-id-123',
        backend: 'real-id-456'
      });
    });
  });

  describe('Memory Request Resolution', () => {
    it('should resolve relations with local IDs to real IDs', () => {
      // Arrange
      const relations = [
        { from: 'frontend', to: 'backend', type: 'COMMUNICATES_WITH' },
        { from: 'backend', to: '9876543210ABCDEFGH', type: 'USES' } // 18-char memory ID
      ];

      const localIdMap = new Map([
        ['frontend', 'real-id-123'],
        ['backend', 'real-id-456']
      ]);

      // Act
      const resolved = resolver.resolveMemoryRequest(relations, localIdMap);

      // Assert
      expect(resolved.resolved).toEqual([
        { from: 'real-id-123', to: 'real-id-456', type: 'COMMUNICATES_WITH' },
        { from: 'real-id-456', to: '9876543210ABCDEFGH', type: 'USES' }
      ]);
      expect(resolved.mapping).toBe(localIdMap);
    });

    it('should handle mixed local IDs and existing memory IDs', () => {
      // Arrange - Use memory IDs that look like real 18-char BASE85 IDs
      const relations = [
        { from: 'newMemory', to: '0123456789ABCDEFGH', type: 'EXTENDS' }, // 18-char real ID
        { from: '9876543210ZYXWVUTS', to: 'newMemory', type: 'CONTAINS' }  // 18-char real ID
      ];

      const localIdMap = new Map([
        ['newMemory', 'real-id-789']
      ]);

      // Act
      const resolved = resolver.resolveMemoryRequest(relations, localIdMap);

      // Assert
      expect(resolved.resolved).toEqual([
        { from: 'real-id-789', to: '0123456789ABCDEFGH', type: 'EXTENDS' },
        { from: '9876543210ZYXWVUTS', to: 'real-id-789', type: 'CONTAINS' }
      ]);
    });

    it('should throw error for undefined relation IDs', () => {
      // Arrange
      const relations = [
        { from: undefined, to: 'backend', type: 'TEST' }
      ];

      const localIdMap = new Map();

      // Act & Assert
      expect(() => resolver.resolveMemoryRequest(relations, localIdMap))
        .toThrow('ID cannot be undefined in relation');
    });

    it('should throw error for unresolved local IDs', () => {
      // Arrange
      const relations = [
        { from: 'unknownLocalId', to: 'backend', type: 'TEST' }
      ];

      const localIdMap = new Map([
        ['backend', 'real-id-456']
      ]);

      // Act & Assert
      expect(() => resolver.resolveMemoryRequest(relations, localIdMap))
        .toThrow('LocalId "unknownLocalId" not found');
    });

    it('should provide helpful error message for cross-operation local ID usage', () => {
      // Arrange
      const relations = [
        { from: 'previousOperationLocalId', to: 'backend', type: 'TEST' }
      ];

      const localIdMap = new Map([
        ['backend', 'real-id-456']
      ]);

      // Act & Assert
      expect(() => resolver.resolveMemoryRequest(relations, localIdMap))
        .toThrow('LocalIds only work within the same operation');
    });
  });

  describe('Real ID Detection', () => {
    it('should correctly identify real memory IDs', () => {
      // Arrange - Test with actual 18-character BASE85 pattern
      const realIds = [
        '0123456789ABCDEFGH', // 18 chars, alphanumeric
        '9876543210ZYXWVUTS', // 18 chars, alphanumeric
        'ABCDEFGH0123456789'  // 18 chars, alphanumeric
      ];

      // Act & Assert
      realIds.forEach(id => {
        const relations = [{ from: id, to: 'backend', type: 'TEST' }];
        const localIdMap = new Map([['backend', 'real-id-456']]);
        
        // Should not throw - should be treated as existing memory ID
        expect(() => resolver.resolveMemoryRequest(relations, localIdMap))
          .not.toThrow();
      });
    });

    it('should correctly identify local IDs vs real IDs', () => {
      // Arrange
      const localIds = [
        'frontend', // Too short
        'this-is-a-very-long-local-id-that-exceeds-18-chars', // Too long
        'frontend-component-x', // 19 chars, not 18
        'test123' // Short and simple
      ];

      // These should be treated as local IDs and cause errors when not in mapping
      localIds.forEach(id => {
        const relations = [{ from: id, to: 'backend', type: 'TEST' }];
        const localIdMap = new Map([['backend', 'real-id-456']]);
        
        // Should throw error for unresolved local ID
        expect(() => resolver.resolveMemoryRequest(relations, localIdMap))
          .toThrow('LocalId');
      });
    });
  });
});
