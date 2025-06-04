/**
 * Relation Repository Production Tests
 * THE IMPLEMENTOR'S RULE: Cover what needs covering, nothing more
 * 
 * Target: 31.25% → 85% coverage
 * Missing: Enhanced relation creation, deletion, error handling
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { Session } from 'neo4j-driver';
import { RelationRepository, EnhancedRelationRequest } from '../../../src/infrastructure/repositories/memory/relation-repository';

describe('RelationRepository - Production Coverage', () => {
  let repository: RelationRepository;
  let mockSession: Session;

  beforeEach(() => {
    mockSession = {
      run: vi.fn().mockResolvedValue({ records: [] })
    } as any;
    repository = new RelationRepository();
  });

  describe('createRelation - Basic Operations', () => {
    test('should create simple relation', async () => {
      await repository.createRelation(mockSession, 'from-id', 'to-id', 'INFLUENCES');

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (from)-[:RELATES_TO {relationType: $relationType}]->(to)'),
        {
          fromId: 'from-id',
          toId: 'to-id',
          relationType: 'INFLUENCES'
        }
      );
    });
  });

  describe('createEnhancedRelation - Enhanced Metadata', () => {
    test('should create enhanced relation with full metadata', async () => {
      const request: EnhancedRelationRequest = {
        fromId: 'memory-1',
        toId: 'memory-2',
        relationType: 'DEPENDS_ON',
        strength: 0.9,
        source: 'agent',
        createdAt: '2025-01-15T10:00:00Z'
      };

      await repository.createEnhancedRelation(mockSession, request);

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (from)-[:RELATES_TO {'),
        request
      );
    });

    test('should handle edge case strength values', async () => {
      const minStrengthRequest: EnhancedRelationRequest = {
        fromId: 'memory-1',
        toId: 'memory-2',
        relationType: 'SUGGESTS',
        strength: 0.1,
        source: 'system',
        createdAt: '2025-01-15T10:00:00Z'
      };

      await repository.createEnhancedRelation(mockSession, minStrengthRequest);

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ strength: 0.1 })
      );
    });
  });

  describe('deleteRelation - Cleanup Operations', () => {
    test('should delete relation by type', async () => {
      await repository.deleteRelation(mockSession, 'from-id', 'to-id', 'INFLUENCES');

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('DELETE r'),
        {
          fromId: 'from-id',
          toId: 'to-id',
          relationType: 'INFLUENCES'
        }
      );
    });

    test('should handle deletion of non-existent relations gracefully', async () => {
      // Mock session returns empty result (no relations found)
      mockSession.run = vi.fn().mockResolvedValue({ records: [] });

      await expect(
        repository.deleteRelation(mockSession, 'non-existent', 'also-non-existent', 'MISSING')
      ).resolves.not.toThrow();
    });
  });

  describe('Error Handling', () => {
    test('should propagate database errors during creation', async () => {
      const dbError = new Error('Database connection lost');
      mockSession.run = vi.fn().mockRejectedValue(dbError);

      await expect(
        repository.createRelation(mockSession, 'from-id', 'to-id', 'INFLUENCES')
      ).rejects.toThrow('Database connection lost');
    });

    test('should propagate database errors during enhanced creation', async () => {
      const dbError = new Error('Constraint violation');
      mockSession.run = vi.fn().mockRejectedValue(dbError);

      const request: EnhancedRelationRequest = {
        fromId: 'memory-1',
        toId: 'memory-2',
        relationType: 'DEPENDS_ON',
        strength: 0.8,
        source: 'agent',
        createdAt: '2025-01-15T10:00:00Z'
      };

      await expect(
        repository.createEnhancedRelation(mockSession, request)
      ).rejects.toThrow('Constraint violation');
    });

    test('should propagate database errors during deletion', async () => {
      const dbError = new Error('Transaction failed');
      mockSession.run = vi.fn().mockRejectedValue(dbError);

      await expect(
        repository.deleteRelation(mockSession, 'from-id', 'to-id', 'INFLUENCES')
      ).rejects.toThrow('Transaction failed');
    });
  });

  describe('Relation Type Validation', () => {
    test('should handle various relation types', async () => {
      const relationTypes = ['INFLUENCES', 'DEPENDS_ON', 'COMPLEMENTS', 'REQUIRES', 'SUGGESTS'];

      for (const relationType of relationTypes) {
        await repository.createRelation(mockSession, 'from-id', 'to-id', relationType);
        
        expect(mockSession.run).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ relationType })
        );
      }
    });
  });
});
