/**
 * Truth-First Search Orchestrator Tests - Part 1
 * Single responsibility: Test truth-first search pipeline integration
 * 
 * THE IMPLEMENTOR'S RULE: Test the exact behavior specified in GDD v2.2.0
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { Session } from 'neo4j-driver';
import { TruthFirstSearchOrchestrator } from '../../../../src/infrastructure/services/search/truth-first-search-orchestrator';
import { QueryType } from '../../../../src/infrastructure/services/search/query-classifier';

// Mock dependencies
vi.mock('../../../../src/infrastructure/services/search/query-classifier');
vi.mock('../../../../src/infrastructure/services/search/exact-search-channel');
vi.mock('../../../../src/infrastructure/services/search/vector-search-channel');
vi.mock('../../../../src/infrastructure/services/search/wildcard-search-service');

describe('TruthFirstSearchOrchestrator - Integration Pipeline', () => {
  let orchestrator: TruthFirstSearchOrchestrator;
  let mockSession: Session;

  beforeEach(() => {
    // Create mock session
    mockSession = {
      run: vi.fn().mockResolvedValue({ records: [] }),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as Session;

    orchestrator = new TruthFirstSearchOrchestrator(mockSession);
  });

  describe('Query Validation', () => {
    it('should reject empty query', async () => {
      await expect(orchestrator.search('')).rejects.toThrow('Search query must be a non-empty string');
    });

    it('should reject non-string query', async () => {
      await expect(orchestrator.search(null as any)).rejects.toThrow('Search query must be a non-empty string');
    });

    it('should reject negative limit', async () => {
      await expect(orchestrator.search('test', -1)).rejects.toThrow('Search limit must be positive');
    });

    it('should reject zero limit', async () => {
      await expect(orchestrator.search('test', 0)).rejects.toThrow('Search limit must be positive');
    });
  });

  describe('Wildcard Search Bypass', () => {
    it('should bypass multi-channel search for wildcard queries', async () => {
      // Mock query classifier to return wildcard type
      const mockQueryClassifier = {
        classify: vi.fn().mockReturnValue({
          type: QueryType.WILDCARD,
          preprocessing: { normalized: '*' }
        })
      };

      // Mock the internal wildcard service
      const mockWildcardService = {
        search: vi.fn().mockResolvedValue([
          {
            id: 'test-id',
            name: 'Test Memory',
            type: 'test',
            observations: [],
            metadata: {},
            score: 1.0
          }
        ])
      };

      // Create orchestrator with mocked dependencies
      (orchestrator as any).queryClassifier = mockQueryClassifier;
      (orchestrator as any).wildcardService = mockWildcardService;

      const results = await orchestrator.search('*', 10);

      expect(mockWildcardService.search).toHaveBeenCalledWith(10, true, undefined);
      expect(results).toHaveLength(1);
      expect(results[0].truthLevel).toBe(1.0); // PERFECT_TRUTH
      expect(results[0].matchReason).toBe('wildcard');
    });
  });

  describe('Multi-Channel Search Pipeline', () => {
    it('should execute exact channel for all query types', async () => {
      // Mock query classifier for non-wildcard query
      const mockQueryClassifier = {
        classify: vi.fn().mockReturnValue({
          type: QueryType.SEMANTIC_SEARCH,
          preprocessing: { normalized: 'test query' }
        })
      };

      const mockExactChannel = {
        search: vi.fn().mockResolvedValue([])
      };
      const mockVectorChannel = {
        search: vi.fn().mockResolvedValue([])
      };

      const mockResultProcessor = {
        combineAndScore: vi.fn().mockReturnValue([])
      };

      (orchestrator as any).queryClassifier = mockQueryClassifier;
      (orchestrator as any).exactChannel = mockExactChannel;
      (orchestrator as any).vectorChannel = mockVectorChannel;
      (orchestrator as any).resultProcessor = mockResultProcessor;
      (orchestrator as any).enrichWithFullMemoryData = vi.fn().mockResolvedValue([]);

      await orchestrator.search('test query', 10);

      expect(mockExactChannel.search).toHaveBeenCalled();
    });

    it('should execute vector channel only for semantic queries', async () => {
      const mockQueryClassifier = {
        classify: vi.fn().mockReturnValue({
          type: QueryType.SEMANTIC_SEARCH,
          preprocessing: { normalized: 'test query' }
        })
      };
      
      const mockExactChannel = {
        search: vi.fn().mockResolvedValue([])
      };
      const mockVectorChannel = {
        search: vi.fn().mockResolvedValue([])
      };

      (orchestrator as any).queryClassifier = mockQueryClassifier;
      (orchestrator as any).exactChannel = mockExactChannel;
      (orchestrator as any).vectorChannel = mockVectorChannel;

      await orchestrator.search('test query', 10);

      expect(mockVectorChannel.search).toHaveBeenCalled();
    });

    it('should skip vector channel for technical identifier queries', async () => {
      const mockQueryClassifier = {
        classify: vi.fn().mockReturnValue({
          type: QueryType.TECHNICAL_IDENTIFIER,
          preprocessing: { normalized: 'uuid-test' }
        })
      };
      
      const mockExactChannel = {
        search: vi.fn().mockResolvedValue([])
      };
      const mockVectorChannel = {
        search: vi.fn().mockResolvedValue([])
      };

      (orchestrator as any).queryClassifier = mockQueryClassifier;
      (orchestrator as any).exactChannel = mockExactChannel;
      (orchestrator as any).vectorChannel = mockVectorChannel;

      await orchestrator.search('uuid-test', 10);

      expect(mockExactChannel.search).toHaveBeenCalled();
      expect(mockVectorChannel.search).not.toHaveBeenCalled();
    });
  });

  describe('Limit Enforcement (GDD 8.1 Compliance)', () => {
    it('should enforce strict limit on results', async () => {
      // Mock query classifier
      const mockQueryClassifier = {
        classify: vi.fn().mockReturnValue({
          type: QueryType.SEMANTIC_SEARCH,
          preprocessing: { normalized: 'test' }
        })
      };

      // Mock result processor to return more results than limit
      const mockResultProcessor = {
        combineAndScore: vi.fn().mockReturnValue([
          { id: '1', score: 0.9 },
          { id: '2', score: 0.8 },
          { id: '3', score: 0.7 },
          { id: '4', score: 0.6 },
          { id: '5', score: 0.5 }
        ])
      };

      (orchestrator as any).queryClassifier = mockQueryClassifier;
      (orchestrator as any).resultProcessor = mockResultProcessor;
      
      // Mock enrichment method
      (orchestrator as any).enrichWithFullMemoryData = vi.fn().mockResolvedValue([
        { id: '1', score: 0.9 },
        { id: '2', score: 0.8 },
        { id: '3', score: 0.7 },
        { id: '4', score: 0.6 },
        { id: '5', score: 0.5 }
      ]);

      const results = await orchestrator.search('test', 3); // Limit to 3

      expect(results).toHaveLength(3);
      expect(results[0].id).toBe('1');
      expect(results[2].id).toBe('3');
    });
  });

  describe('Memory Type Filtering', () => {
    it('should pass memory types to all search channels', async () => {
      // Mock query classifier  
      const mockQueryClassifier = {
        classify: vi.fn().mockReturnValue({
          type: QueryType.SEMANTIC_SEARCH,
          preprocessing: { normalized: 'test' }
        })
      };

      const mockExactChannel = {
        search: vi.fn().mockResolvedValue([])
      };
      const mockVectorChannel = {
        search: vi.fn().mockResolvedValue([])
      };

      const mockResultProcessor = {
        combineAndScore: vi.fn().mockReturnValue([])
      };

      (orchestrator as any).queryClassifier = mockQueryClassifier;
      (orchestrator as any).exactChannel = mockExactChannel;
      (orchestrator as any).vectorChannel = mockVectorChannel;
      (orchestrator as any).resultProcessor = mockResultProcessor;
      (orchestrator as any).enrichWithFullMemoryData = vi.fn().mockResolvedValue([]);

      const memoryTypes = ['project', 'task'];
      await orchestrator.search('test', 10, true, memoryTypes);

      expect(mockExactChannel.search).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number),
        memoryTypes
      );
    });
  });

  describe('Error Handling', () => {
    it('should continue when vector channel fails', async () => {
      const mockQueryClassifier = {
        classify: vi.fn().mockReturnValue({
          type: QueryType.SEMANTIC_SEARCH,
          preprocessing: { normalized: 'test' }
        })
      };

      const mockExactChannel = {
        search: vi.fn().mockResolvedValue([])
      };
      
      const mockVectorChannel = {
        search: vi.fn().mockRejectedValue(new Error('Vector service unavailable'))
      };

      const mockResultProcessor = {
        combineAndScore: vi.fn().mockReturnValue([])
      };

      (orchestrator as any).queryClassifier = mockQueryClassifier;
      (orchestrator as any).exactChannel = mockExactChannel;
      (orchestrator as any).vectorChannel = mockVectorChannel;
      (orchestrator as any).resultProcessor = mockResultProcessor;
      (orchestrator as any).enrichWithFullMemoryData = vi.fn().mockResolvedValue([]);

      // Should not throw error - continues with exact results only
      const results = await orchestrator.search('test', 10);
      
      expect(results).toBeDefined();
      expect(mockExactChannel.search).toHaveBeenCalled();
      expect(mockResultProcessor.combineAndScore).toHaveBeenCalledWith(
        [],
        [],
        expect.any(Object),
        expect.any(Number)
      );
    });
  });
});
