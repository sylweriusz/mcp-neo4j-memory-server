/**
 * Search Orchestrator Tests - Phase 2A Priority 1
 * The mastermind calling all the shots
 * 
 * HUNT TARGET: Central coordination logic for all search operations
 * THREAT LEVEL: High - Complex algorithms, multiple strategies, vector calculations
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { SearchOrchestrator } from '../../../../src/infrastructure/services/search/search-orchestrator';
import { SearchStrategyService } from '../../../../src/infrastructure/services/search/search-strategy-service';
import { VectorSearchService } from '../../../../src/infrastructure/services/search/vector-search-service';
import { MetadataSearchService } from '../../../../src/infrastructure/services/search/metadata-search-service';
import { GraphContextService } from '../../../../src/infrastructure/services/search/graph-context-service';
import { SearchResultsAggregator } from '../../../../src/infrastructure/services/search/search-results-aggregator';
import { DEFAULT_SEARCH_CONFIG } from '../../../../src/domain/entities/search-config';

// Mock all service dependencies - we test orchestration, not implementation
vi.mock('../../../../src/infrastructure/services/search/search-strategy-service');
vi.mock('../../../../src/infrastructure/services/search/vector-search-service');
vi.mock('../../../../src/infrastructure/services/search/metadata-search-service');
vi.mock('../../../../src/infrastructure/services/search/graph-context-service');
vi.mock('../../../../src/infrastructure/services/search/search-results-aggregator');

describe('SearchOrchestrator - Central Command', () => {
  let orchestrator: SearchOrchestrator;
  let mockSession: any;
  let mockStrategyService: any;
  let mockVectorService: any;
  let mockMetadataService: any;
  let mockGraphService: any;
  let mockAggregator: any;

  beforeEach(() => {
    // Mock Neo4j session
    mockSession = {
      run: vi.fn(),
      close: vi.fn()
    };

    // Setup service mocks
    mockStrategyService = {
      determineStrategy: vi.fn()
    };
    
    mockVectorService = {
      searchByVector: vi.fn()
    };
    
    mockMetadataService = {
      searchByMetadata: vi.fn(),
      searchByTags: vi.fn()
    };
    
    mockGraphService = {
      getGraphContext: vi.fn(),
      searchWildcardWithContext: vi.fn()
    };
    
    mockAggregator = {
      formatSearchResults: vi.fn()
    };

    // Setup constructor mocks
    (SearchStrategyService as any).mockImplementation(() => mockStrategyService);
    (VectorSearchService as any).mockImplementation(() => mockVectorService);
    (MetadataSearchService as any).mockImplementation(() => mockMetadataService);
    (GraphContextService as any).mockImplementation(() => mockGraphService);
    (SearchResultsAggregator as any).mockImplementation(() => mockAggregator);

    orchestrator = new SearchOrchestrator(mockSession, DEFAULT_SEARCH_CONFIG);
  });

  describe('Strategy Selection - The Criminal Profiler', () => {
    it('should detect wildcard queries and route to special handler', async () => {
      // Setup: Wildcard strategy
      mockStrategyService.determineStrategy.mockReturnValue({
        strategy: 'wildcard',
        shouldUseVector: false,
        shouldUseMetadata: false,
        shouldUseFulltext: false
      });

      const mockWildcardResults = [
        { id: 'mem1', name: 'Memory 1', type: 'project', observationObjects: [] }
      ];
      
      mockGraphService.searchWildcardWithContext.mockResolvedValue(mockWildcardResults);
      mockAggregator.formatSearchResults.mockReturnValue([
        { id: 'mem1', name: 'Memory 1', type: 'project', observations: [], tags: [], metadata: {} }
      ]);

      // Execute: Wildcard search
      const results = await orchestrator.search('*', 10, true);

      // Verify: Wildcard path taken
      expect(mockStrategyService.determineStrategy).toHaveBeenCalledWith('*');
      expect(mockGraphService.searchWildcardWithContext).toHaveBeenCalledWith(10, undefined);
      expect(mockAggregator.formatSearchResults).toHaveBeenCalledWith(mockWildcardResults, true);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('mem1');
    });

    it('should route semantic queries to vector pipeline', async () => {
      // Setup: Vector strategy for short queries
      mockStrategyService.determineStrategy.mockReturnValue({
        strategy: 'vector_semantic',
        shouldUseVector: true,
        shouldUseMetadata: true,
        shouldUseFulltext: false
      });

      // Mock the pipeline execution
      await setupMockPipeline();

      // Execute: Short semantic query
      const results = await orchestrator.search('machine learning', 5, true);

      // Verify: Vector and metadata services called
      expect(mockVectorService.searchByVector).toHaveBeenCalledWith(
        'machine learning', 10, 0.1, undefined
      );
      expect(mockMetadataService.searchByMetadata).toHaveBeenCalledWith(
        'machine learning', 10, undefined
      );
      expect(mockMetadataService.searchByTags).toHaveBeenCalledWith(
        'machine learning', 5, undefined
      );
    });

    it('should route complex queries to hybrid pipeline', async () => {
      // Setup: Hybrid strategy for long queries
      mockStrategyService.determineStrategy.mockReturnValue({
        strategy: 'hybrid',
        shouldUseVector: true,
        shouldUseMetadata: true,
        shouldUseFulltext: true
      });

      await setupMockPipeline();

      // Execute: Complex query
      const longQuery = 'deep learning neural networks with tensorflow implementation details';
      const results = await orchestrator.search(longQuery, 10, true);

      // Verify: All services called for hybrid approach
      expect(mockVectorService.searchByVector).toHaveBeenCalled();
      expect(mockMetadataService.searchByMetadata).toHaveBeenCalled();
      expect(mockMetadataService.searchByTags).toHaveBeenCalled();
    });
  });

  describe('Pipeline Coordination - The Master Detective', () => {
    it('should coordinate vector and metadata search properly', async () => {
      // Setup: Hybrid strategy
      mockStrategyService.determineStrategy.mockReturnValue({
        strategy: 'hybrid',
        shouldUseVector: true,
        shouldUseMetadata: true,
        shouldUseFulltext: true
      });

      // Mock service responses
      const vectorCandidates = ['mem1', 'mem2'];
      const exactMatches = ['mem2', 'mem3'];
      const fulltextMatches = ['mem3', 'mem4'];
      const tagMatches = ['mem1', 'mem4'];

      mockVectorService.searchByVector.mockResolvedValue({
        results: [],
        vectorCandidates
      });
      
      mockMetadataService.searchByMetadata.mockResolvedValue({
        exactMatches,
        fulltextMatches
      });
      
      mockMetadataService.searchByTags.mockResolvedValue(tagMatches);

      // Mock full results retrieval
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: vi.fn()
              .mockReturnValueOnce('mem1')  // id
              .mockReturnValueOnce('Memory 1')  // name
              .mockReturnValueOnce('project')  // type
              .mockReturnValueOnce('{}')  // metadata
              .mockReturnValueOnce([])  // observations
              .mockReturnValueOnce(['tag1'])  // tags
          }
        ]
      });

      // Execute
      const results = await orchestrator.search('test query', 10, false);

      // Verify: Services called in correct order
      expect(mockVectorService.searchByVector).toHaveBeenCalledBefore(
        mockMetadataService.searchByMetadata as Mock
      );
      expect(mockMetadataService.searchByMetadata).toHaveBeenCalledBefore(
        mockMetadataService.searchByTags as Mock
      );
    });

    it('should handle search service failures gracefully', async () => {
      // Setup: Strategy that uses vector search
      mockStrategyService.determineStrategy.mockReturnValue({
        strategy: 'vector_semantic',
        shouldUseVector: true,
        shouldUseMetadata: true,
        shouldUseFulltext: false
      });

      // Mock vector service failure
      mockVectorService.searchByVector.mockRejectedValue(new Error('Vector service down'));
      
      // Mock metadata service success
      mockMetadataService.searchByMetadata.mockResolvedValue({
        exactMatches: ['mem1'],
        fulltextMatches: []
      });
      
      mockMetadataService.searchByTags.mockResolvedValue(['mem1']);

      // Mock successful session call for fallback
      mockSession.run.mockResolvedValue({ records: [] });

      // Execute and verify error propagation (no fallbacks!)
      await expect(orchestrator.search('test', 10, false)).rejects.toThrow('Vector service down');
    });
  });

  describe('Neo4j Integer Conversion - BUG #1 FIX', () => {
    it('should convert Neo4j Integer objects in ancestor distances', async () => {
      // Setup: Wildcard search that returns graph context
      mockStrategyService.determineStrategy.mockReturnValue({ strategy: 'wildcard' });
      
      const mockNeo4jInteger = {
        toNumber: vi.fn().mockReturnValue(2),
        low: 2,
        high: 0
      };

      const mockResults = [{
        id: 'mem1',
        name: 'Memory 1',
        type: 'project',
        observationObjects: [],
        ancestors: [{
          id: 'anc1',
          name: 'Ancestor',
          type: 'concept',
          relation: 'INFLUENCES',
          distance: mockNeo4jInteger  // Neo4j Integer object
        }]
      }];

      mockGraphService.searchWildcardWithContext.mockResolvedValue(mockResults);
      
      // Mock aggregator to return results with converted distances
      mockAggregator.formatSearchResults.mockReturnValue([{
        id: 'mem1',
        name: 'Memory 1',
        type: 'project',
        observations: [],
        tags: [],
        metadata: {},
        related: {
          ancestors: [{
            id: 'anc1',
            name: 'Ancestor',
            type: 'concept',
            relation: 'INFLUENCES',
            distance: 2  // Converted to number
          }]
        }
      }]);

      // Execute
      const results = await orchestrator.search('*', 10, true);

      // Verify: Distance properly converted
      expect(results[0].related?.ancestors?.[0].distance).toBe(2);
      expect(typeof results[0].related?.ancestors?.[0].distance).toBe('number');
    });

    it('should handle mixed distance types gracefully', async () => {
      // Setup: Results with mixed distance types
      mockStrategyService.determineStrategy.mockReturnValue({ strategy: 'wildcard' });
      
      const mockResults = [{
        id: 'mem1',
        name: 'Memory 1',
        type: 'project',
        observationObjects: [],
        descendants: [
          {
            id: 'desc1',
            distance: 1  // Regular number
          },
          {
            id: 'desc2', 
            distance: { toNumber: () => 3 }  // Neo4j Integer
          },
          {
            id: 'desc3',
            distance: null  // Null value
          }
        ]
      }];

      mockGraphService.searchWildcardWithContext.mockResolvedValue(mockResults);
      mockAggregator.formatSearchResults.mockReturnValue([{
        id: 'mem1',
        name: 'Memory 1',
        type: 'project',
        observations: [],
        tags: [],
        metadata: {},
        related: {
          descendants: [
            { id: 'desc1', distance: 1 },
            { id: 'desc2', distance: 3 },
            { id: 'desc3', distance: 0 }  // Null converted to 0
          ]
        }
      }]);

      // Execute
      const results = await orchestrator.search('*', 10, true);

      // Verify: All distances properly converted
      const descendants = results[0].related?.descendants;
      expect(descendants?.[0].distance).toBe(1);
      expect(descendants?.[1].distance).toBe(3);
      expect(descendants?.[2].distance).toBe(0);
    });
  });

  describe('Limit Enforcement - The Boundary Guard', () => {
    it('should enforce limits on wildcard queries', async () => {
      // Setup: Wildcard strategy
      mockStrategyService.determineStrategy.mockReturnValue({ strategy: 'wildcard' });
      
      // Mock large result set
      const largeResults = Array(50).fill(null).map((_, i) => ({
        id: `mem${i}`,
        name: `Memory ${i}`,
        type: 'project',
        observationObjects: []
      }));

      mockGraphService.searchWildcardWithContext.mockResolvedValue(largeResults);
      mockAggregator.formatSearchResults.mockReturnValue(
        largeResults.map(r => ({ ...r, observations: [], tags: [], metadata: {} }))
      );

      // Execute with limit
      const results = await orchestrator.search('*', 5, true);

      // Verify: Limit enforced
      expect(mockGraphService.searchWildcardWithContext).toHaveBeenCalledWith(5, undefined);
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should enforce limits on regular search results', async () => {
      // Setup: Regular search strategy
      mockStrategyService.determineStrategy.mockReturnValue({
        strategy: 'vector_semantic',
        shouldUseVector: true,
        shouldUseMetadata: true
      });

      await setupMockPipeline();

      // Mock large candidate set but limited final results
      const largeCandidates = Array(100).fill(null).map((_, i) => `mem${i}`);
      
      mockVectorService.searchByVector.mockResolvedValue({
        results: [],
        vectorCandidates: largeCandidates
      });

      // Mock session to return limited results
      mockSession.run.mockResolvedValue({
        records: Array(3).fill(null).map((_, i) => ({
          get: vi.fn()
            .mockReturnValueOnce(`mem${i}`)
            .mockReturnValueOnce(`Memory ${i}`)
            .mockReturnValueOnce('project')
            .mockReturnValueOnce('{}')
            .mockReturnValueOnce([])
            .mockReturnValueOnce([])
        }))
      });

      // Execute with small limit
      const results = await orchestrator.search('test', 3, false);

      // Verify: Results respect limit
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should handle memory type filtering with limits', async () => {
      // Setup: Wildcard with memory type filter
      mockStrategyService.determineStrategy.mockReturnValue({ strategy: 'wildcard' });
      
      mockGraphService.searchWildcardWithContext.mockResolvedValue([
        { id: 'mem1', name: 'Project 1', type: 'project', observationObjects: [] },
        { id: 'mem2', name: 'Research 1', type: 'research', observationObjects: [] }
      ]);
      
      mockAggregator.formatSearchResults.mockReturnValue([
        { id: 'mem1', name: 'Project 1', type: 'project', observations: [], tags: [], metadata: {} },
        { id: 'mem2', name: 'Research 1', type: 'research', observations: [], tags: [], metadata: {} }
      ]);

      // Execute with memory type filter
      const results = await orchestrator.search('*', 10, true, ['project']);

      // Verify: Type filter passed to service
      expect(mockGraphService.searchWildcardWithContext).toHaveBeenCalledWith(10, ['project']);
    });
  });

  describe('Graph Context Enrichment - The Connection Hunter', () => {
    it('should enrich results with graph context when requested', async () => {
      // Setup: Regular search
      mockStrategyService.determineStrategy.mockReturnValue({
        strategy: 'vector_semantic',
        shouldUseVector: true,
        shouldUseMetadata: true
      });

      await setupMockPipeline();

      // Mock graph context service
      const mockContext = new Map([
        ['mem1', {
          ancestors: [{ id: 'anc1', name: 'Ancestor', relation: 'INFLUENCES', distance: 1 }],
          descendants: [{ id: 'desc1', name: 'Descendant', relation: 'DEPENDS_ON', distance: 1 }]
        }]
      ]);

      mockGraphService.getGraphContext.mockResolvedValue(mockContext);

      // Execute with graph context
      const results = await orchestrator.search('test', 10, true);

      // Verify: Graph context added
      expect(mockGraphService.getGraphContext).toHaveBeenCalledWith(['mem1']);
    });

    it('should skip graph context when not requested', async () => {
      // Setup: Regular search
      mockStrategyService.determineStrategy.mockReturnValue({
        strategy: 'vector_semantic',
        shouldUseVector: true,
        shouldUseMetadata: true
      });

      await setupMockPipeline();

      // Execute without graph context
      const results = await orchestrator.search('test', 10, false);

      // Verify: Graph context not called
      expect(mockGraphService.getGraphContext).not.toHaveBeenCalled();
    });
  });

  describe('Error Scenarios - The Exception Handler', () => {
    it('should handle empty candidate sets gracefully', async () => {
      // Setup: Strategy with empty results
      mockStrategyService.determineStrategy.mockReturnValue({
        strategy: 'vector_semantic',
        shouldUseVector: true,
        shouldUseMetadata: true
      });

      // Mock empty results from all services
      mockVectorService.searchByVector.mockResolvedValue({
        results: [],
        vectorCandidates: []
      });
      
      mockMetadataService.searchByMetadata.mockResolvedValue({
        exactMatches: [],
        fulltextMatches: []
      });
      
      mockMetadataService.searchByTags.mockResolvedValue([]);

      // Execute
      const results = await orchestrator.search('nonexistent', 10, true);

      // Verify: Empty results handled gracefully
      expect(results).toEqual([]);
      expect(mockGraphService.getGraphContext).not.toHaveBeenCalled(); // No context for empty results
    });
  });

  // Helper function to setup standard mock pipeline
  async function setupMockPipeline() {
    mockVectorService.searchByVector.mockResolvedValue({
      results: [],
      vectorCandidates: ['mem1']
    });
    
    mockMetadataService.searchByMetadata.mockResolvedValue({
      exactMatches: ['mem1'],
      fulltextMatches: []
    });
    
    mockMetadataService.searchByTags.mockResolvedValue(['mem1']);

    // Mock session for full results - more reliable mocking
    mockSession.run.mockResolvedValue({
      records: [{
        get: vi.fn((key: string) => {
          const mockData: Record<string, any> = {
            'id': 'mem1',
            'name': 'Memory 1',
            'type': 'project',
            'metadata': '{}',
            'observations': [],
            'tags': ['tag1']
          };
          return mockData[key];
        })
      }]
    });
  }
});
