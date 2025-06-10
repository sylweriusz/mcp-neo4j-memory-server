/**
 * Relation Repository Enhanced Tests
 * THE IMPLEMENTOR'S RULE: Test what's implemented, test it thoroughly
 * 
 * Coverage Target: 95%+ 
 * Focus: Enhanced relation operations, comprehensive error handling, edge cases
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { Session } from 'neo4j-driver';
import { RelationRepository, EnhancedRelationRequest } from '../../../src/infrastructure/repositories/memory/relation-repository';
import { MCPDatabaseError, MCPValidationError, MCPErrorCodes } from '../../../src/infrastructure/errors';

describe('RelationRepository - Enhanced Coverage', () => {
  let repository: RelationRepository;
  let mockSession: Session;

  beforeEach(() => {
    repository = new RelationRepository();
    mockSession = {
      run: vi.fn()
    } as any;
  });

  describe('createEnhancedRelation - Advanced Scenarios', () => {
    test('should create enhanced relation with minimal metadata', async () => {
      // Mock successful creation
      mockSession.run = vi.fn().mockResolvedValue({ 
        records: [{ get: () => ({ id: 'from-memory' }) }] 
      });
      
      const request: EnhancedRelationRequest = {
        fromId: 'mem-001',
        toId: 'mem-002',
        relationType: 'INFLUENCES',
        strength: 0.5,
        source: 'agent',
        createdAt: '2025-06-10T05:30:00Z'
      };

      await repository.createEnhancedRelation(mockSession, request);

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (from)-[:RELATES_TO {'),
        request
      );
    });

    test('should create enhanced relation with maximum strength', async () => {
      mockSession.run = vi.fn().mockResolvedValue({ 
        records: [{ get: () => ({ id: 'from-memory' }) }] 
      });
      
      const request: EnhancedRelationRequest = {
        fromId: 'mem-001',
        toId: 'mem-002',
        relationType: 'DEPENDS_ON',
        strength: 1.0,
        source: 'user',
        createdAt: '2025-06-10T05:30:00Z'
      };

      await repository.createEnhancedRelation(mockSession, request);

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ strength: 1.0, source: 'user' })
      );
    });

    test('should handle constraint violation errors (duplicate relations)', async () => {
      // Mock constraint violation error
      const constraintError = new Error('ConstraintValidationFailed: Duplicate relation');
      mockSession.run = vi.fn().mockRejectedValue(constraintError);
      
      const request: EnhancedRelationRequest = {
        fromId: 'mem-001',
        toId: 'mem-002',
        relationType: 'INFLUENCES',
        strength: 0.8,
        source: 'agent',
        createdAt: '2025-06-10T05:30:00Z'
      };

      await expect(repository.createEnhancedRelation(mockSession, request))
        .rejects.toThrow(MCPValidationError);
      
      await expect(repository.createEnhancedRelation(mockSession, request))
        .rejects.toThrow('Relation already exists between mem-001 and mem-002');
    });

    test('should handle missing memory nodes', async () => {
      // Mock empty result (no memories found)
      mockSession.run = vi.fn().mockResolvedValue({ records: [] });
      
      const request: EnhancedRelationRequest = {
        fromId: 'nonexistent-1',
        toId: 'nonexistent-2',
        relationType: 'INFLUENCES',
        strength: 0.5,
        source: 'agent',
        createdAt: '2025-06-10T05:30:00Z'
      };

      await expect(repository.createEnhancedRelation(mockSession, request))
        .rejects.toThrow(MCPDatabaseError);
      
      await expect(repository.createEnhancedRelation(mockSession, request))
        .rejects.toThrow('Failed to create enhanced relation: one or both memories do not exist');
    });

    test('should handle service unavailable errors', async () => {
      // Mock service unavailable error
      const serviceError = new Error('ServiceUnavailable: Database down');
      mockSession.run = vi.fn().mockRejectedValue(serviceError);
      
      const request: EnhancedRelationRequest = {
        fromId: 'mem-001',
        toId: 'mem-002',
        relationType: 'INFLUENCES',
        strength: 0.5,
        source: 'agent',
        createdAt: '2025-06-10T05:30:00Z'
      };

      await expect(repository.createEnhancedRelation(mockSession, request))
        .rejects.toThrow(MCPDatabaseError);
      
      await expect(repository.createEnhancedRelation(mockSession, request))
        .rejects.toThrow('Database service unavailable');
    });
  });

  describe('updateEnhancedRelation - Update Operations', () => {
    test('should update existing relation successfully', async () => {
      // Mock successful update
      mockSession.run = vi.fn().mockResolvedValue({ 
        records: [{ get: () => true }] 
      });
      
      const request: EnhancedRelationRequest = {
        fromId: 'mem-001',
        toId: 'mem-002',
        relationType: 'INFLUENCES',
        strength: 0.9,
        source: 'user',
        createdAt: '2025-06-10T05:30:00Z' // This should be ignored in update
      };

      const result = await repository.updateEnhancedRelation(mockSession, request);

      expect(result).toBe(true);
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('SET r.strength = $strength'),
        expect.objectContaining({
          fromId: 'mem-001',
          toId: 'mem-002',
          relationType: 'INFLUENCES',
          strength: 0.9,
          source: 'user'
        })
      );
    });

    test('should handle non-existent relation during update', async () => {
      // Mock no relation found
      mockSession.run = vi.fn().mockResolvedValue({ 
        records: [{ get: () => false }] 
      });
      
      const request: EnhancedRelationRequest = {
        fromId: 'mem-001',
        toId: 'mem-002',
        relationType: 'NONEXISTENT',
        strength: 0.5,
        source: 'agent',
        createdAt: '2025-06-10T05:30:00Z'
      };

      await expect(repository.updateEnhancedRelation(mockSession, request))
        .rejects.toThrow(MCPDatabaseError);
      
      await expect(repository.updateEnhancedRelation(mockSession, request))
        .rejects.toThrow('Relation not found: mem-001 → mem-002 (NONEXISTENT)');
    });

    test('should handle missing result records during update', async () => {
      // Mock empty records array
      mockSession.run = vi.fn().mockResolvedValue({ records: [] });
      
      const request: EnhancedRelationRequest = {
        fromId: 'mem-001',
        toId: 'mem-002',
        relationType: 'INFLUENCES',
        strength: 0.7,
        source: 'system',
        createdAt: '2025-06-10T05:30:00Z'
      };

      await expect(repository.updateEnhancedRelation(mockSession, request))
        .rejects.toThrow(MCPDatabaseError);
    });

    test('should handle service unavailable during update', async () => {
      // Mock service unavailable
      const serviceError = new Error('ServiceUnavailable: Connection lost');
      mockSession.run = vi.fn().mockRejectedValue(serviceError);
      
      const request: EnhancedRelationRequest = {
        fromId: 'mem-001',
        toId: 'mem-002',
        relationType: 'INFLUENCES',
        strength: 0.8,
        source: 'agent',
        createdAt: '2025-06-10T05:30:00Z'
      };

      await expect(repository.updateEnhancedRelation(mockSession, request))
        .rejects.toThrow(MCPDatabaseError);
      
      await expect(repository.updateEnhancedRelation(mockSession, request))
        .rejects.toThrow('Database service unavailable');
    });

    test('should handle generic database errors during update', async () => {
      // Mock generic database error
      const dbError = new Error('Unknown database error');
      mockSession.run = vi.fn().mockRejectedValue(dbError);
      
      const request: EnhancedRelationRequest = {
        fromId: 'mem-001',
        toId: 'mem-002',
        relationType: 'INFLUENCES',
        strength: 0.6,
        source: 'agent',
        createdAt: '2025-06-10T05:30:00Z'
      };

      await expect(repository.updateEnhancedRelation(mockSession, request))
        .rejects.toThrow(MCPDatabaseError);
      
      await expect(repository.updateEnhancedRelation(mockSession, request))
        .rejects.toThrow('Failed to update relation: Unknown database error');
    });
  });

  describe('deleteRelation - Enhanced Deletion Coverage', () => {
    test('should successfully delete existing relation', async () => {
      // Mock successful deletion
      mockSession.run = vi.fn().mockResolvedValue({ 
        records: [{ get: () => true }] 
      });
      
      await repository.deleteRelation(mockSession, 'mem-001', 'mem-002', 'INFLUENCES');

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('DELETE r'),
        {
          fromId: 'mem-001',
          toId: 'mem-002',
          relationType: 'INFLUENCES'
        }
      );
    });

    test('should handle non-existent relation deletion', async () => {
      // Mock no relation found
      mockSession.run = vi.fn().mockResolvedValue({ 
        records: [{ get: () => false }] 
      });
      
      await expect(repository.deleteRelation(mockSession, 'mem-001', 'mem-002', 'NONEXISTENT'))
        .rejects.toThrow(MCPDatabaseError);
      
      await expect(repository.deleteRelation(mockSession, 'mem-001', 'mem-002', 'NONEXISTENT'))
        .rejects.toThrow('Relation not found: mem-001 → mem-002 (NONEXISTENT)');
    });

    test('should handle empty records during deletion', async () => {
      // Mock empty records array
      mockSession.run = vi.fn().mockResolvedValue({ records: [] });
      
      await expect(repository.deleteRelation(mockSession, 'mem-001', 'mem-002', 'INFLUENCES'))
        .rejects.toThrow(MCPDatabaseError);
    });

    test('should handle service unavailable during deletion', async () => {
      // Mock service unavailable
      const serviceError = new Error('ServiceUnavailable: Database offline');
      mockSession.run = vi.fn().mockRejectedValue(serviceError);
      
      await expect(repository.deleteRelation(mockSession, 'mem-001', 'mem-002', 'INFLUENCES'))
        .rejects.toThrow(MCPDatabaseError);
      
      await expect(repository.deleteRelation(mockSession, 'mem-001', 'mem-002', 'INFLUENCES'))
        .rejects.toThrow('Database service unavailable');
    });

    test('should handle generic database errors during deletion', async () => {
      // Mock generic database error
      const dbError = new Error('Transaction rollback');
      mockSession.run = vi.fn().mockRejectedValue(dbError);
      
      await expect(repository.deleteRelation(mockSession, 'mem-001', 'mem-002', 'INFLUENCES'))
        .rejects.toThrow(MCPDatabaseError);
      
      await expect(repository.deleteRelation(mockSession, 'mem-001', 'mem-002', 'INFLUENCES'))
        .rejects.toThrow('Failed to delete relation: Transaction rollback');
    });
  });

  describe('createRelation - Legacy Support Coverage', () => {
    test('should create simple relation successfully', async () => {
      // Mock successful creation
      mockSession.run = vi.fn().mockResolvedValue({ 
        records: [{ get: () => ({ id: 'from-memory' }) }] 
      });
      
      await repository.createRelation(mockSession, 'mem-001', 'mem-002', 'DEPENDS_ON');

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (from)-[:RELATES_TO {relationType: $relationType}]->(to)'),
        {
          fromId: 'mem-001',
          toId: 'mem-002',
          relationType: 'DEPENDS_ON'
        }
      );
    });

    test('should handle missing memories in simple creation', async () => {
      // Mock empty result
      mockSession.run = vi.fn().mockResolvedValue({ records: [] });
      
      await expect(repository.createRelation(mockSession, 'missing-1', 'missing-2', 'INFLUENCES'))
        .rejects.toThrow(MCPDatabaseError);
      
      await expect(repository.createRelation(mockSession, 'missing-1', 'missing-2', 'INFLUENCES'))
        .rejects.toThrow('Failed to create relation: one or both memories do not exist');
    });

    test('should handle service unavailable in simple creation', async () => {
      // Mock service error
      const serviceError = new Error('ServiceUnavailable: No connection');
      mockSession.run = vi.fn().mockRejectedValue(serviceError);
      
      await expect(repository.createRelation(mockSession, 'mem-001', 'mem-002', 'INFLUENCES'))
        .rejects.toThrow(MCPDatabaseError);
      
      await expect(repository.createRelation(mockSession, 'mem-001', 'mem-002', 'INFLUENCES'))
        .rejects.toThrow('Database service unavailable');
    });

    test('should handle generic errors in simple creation', async () => {
      // Mock generic error
      const genericError = new Error('Query timeout');
      mockSession.run = vi.fn().mockRejectedValue(genericError);
      
      await expect(repository.createRelation(mockSession, 'mem-001', 'mem-002', 'INFLUENCES'))
        .rejects.toThrow(MCPDatabaseError);
      
      await expect(repository.createRelation(mockSession, 'mem-001', 'mem-002', 'INFLUENCES'))
        .rejects.toThrow('Failed to create relation: Query timeout');
    });

    test('should re-throw existing MCP errors in simple creation', async () => {
      // Mock existing MCP error
      const mcpError = new MCPDatabaseError('Custom MCP error', MCPErrorCodes.DATABASE_OPERATION_FAILED);
      mockSession.run = vi.fn().mockRejectedValue(mcpError);
      
      await expect(repository.createRelation(mockSession, 'mem-001', 'mem-002', 'INFLUENCES'))
        .rejects.toThrow('Custom MCP error');
      
      await expect(repository.createRelation(mockSession, 'mem-001', 'mem-002', 'INFLUENCES'))
        .rejects.toThrow(MCPDatabaseError);
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    test('should handle extreme strength values in enhanced relations', async () => {
      mockSession.run = vi.fn().mockResolvedValue({ 
        records: [{ get: () => ({ id: 'from-memory' }) }] 
      });
      
      // Test minimum strength
      const minRequest: EnhancedRelationRequest = {
        fromId: 'mem-001',
        toId: 'mem-002',
        relationType: 'WEAK_INFLUENCE',
        strength: 0.0,
        source: 'system',
        createdAt: '2025-06-10T05:30:00Z'
      };

      await repository.createEnhancedRelation(mockSession, minRequest);
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ strength: 0.0 })
      );

      // Test maximum strength
      const maxRequest: EnhancedRelationRequest = {
        fromId: 'mem-003',
        toId: 'mem-004',
        relationType: 'STRONG_INFLUENCE',
        strength: 1.0,
        source: 'agent',
        createdAt: '2025-06-10T05:30:00Z'
      };

      await repository.createEnhancedRelation(mockSession, maxRequest);
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ strength: 1.0 })
      );
    });

    test('should handle various relation types correctly', async () => {
      mockSession.run = vi.fn().mockResolvedValue({ 
        records: [{ get: () => ({ id: 'from-memory' }) }] 
      });
      
      const relationTypes = [
        'INFLUENCES', 'DEPENDS_ON', 'EXTENDS', 'IMPLEMENTS', 
        'CONTAINS', 'RELATES_TO', 'SUPPORTS', 'COMPLEMENTS',
        'CONFLICTS_WITH', 'BUILDS_ON'
      ];

      for (const relationType of relationTypes) {
        await repository.createRelation(mockSession, 'mem-001', 'mem-002', relationType);
        
        expect(mockSession.run).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ relationType })
        );
      }
    });

    test('should handle various source types in enhanced relations', async () => {
      mockSession.run = vi.fn().mockResolvedValue({ 
        records: [{ get: () => ({ id: 'from-memory' }) }] 
      });
      
      const sources = ['agent', 'user', 'system'];

      for (const source of sources) {
        const request: EnhancedRelationRequest = {
          fromId: 'mem-001',
          toId: 'mem-002',
          relationType: 'INFLUENCES',
          strength: 0.5,
          source,
          createdAt: '2025-06-10T05:30:00Z'
        };

        await repository.createEnhancedRelation(mockSession, request);
        expect(mockSession.run).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ source })
        );
      }
    });

    test('should handle null/undefined return values gracefully', async () => {
      // Mock session with null/undefined returns
      mockSession.run = vi.fn().mockResolvedValue({ 
        records: [{ get: () => null }] 
      });
      
      // Test deletion with null return
      await expect(repository.deleteRelation(mockSession, 'mem-001', 'mem-002', 'INFLUENCES'))
        .rejects.toThrow(MCPDatabaseError);

      // Test update with null return
      const request: EnhancedRelationRequest = {
        fromId: 'mem-001',
        toId: 'mem-002',
        relationType: 'INFLUENCES',
        strength: 0.5,
        source: 'agent',
        createdAt: '2025-06-10T05:30:00Z'
      };

      await expect(repository.updateEnhancedRelation(mockSession, request))
        .rejects.toThrow(MCPDatabaseError);
    });

    test('should handle non-Error exceptions correctly', async () => {
      // Mock non-Error exception
      mockSession.run = vi.fn().mockRejectedValue('String error');
      
      await expect(repository.createRelation(mockSession, 'mem-001', 'mem-002', 'INFLUENCES'))
        .rejects.toThrow('Failed to create relation: String error');

      const request: EnhancedRelationRequest = {
        fromId: 'mem-001',
        toId: 'mem-002',
        relationType: 'INFLUENCES',
        strength: 0.5,
        source: 'agent',
        createdAt: '2025-06-10T05:30:00Z'
      };

      await expect(repository.createEnhancedRelation(mockSession, request))
        .rejects.toThrow('Failed to create enhanced relation: String error');

      await expect(repository.updateEnhancedRelation(mockSession, request))
        .rejects.toThrow('Failed to update relation: String error');

      await expect(repository.deleteRelation(mockSession, 'mem-001', 'mem-002', 'INFLUENCES'))
        .rejects.toThrow('Failed to delete relation: String error');
    });
  });
});
