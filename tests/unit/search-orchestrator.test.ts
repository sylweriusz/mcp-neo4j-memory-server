/**
 * Search Orchestrator Tests - Enhanced GDD Compliance
 * Single responsibility: Verify search orchestration logic with critical GDD requirements
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchOrchestrator } from '../../src/infrastructure/services/search/search-orchestrator';
import { SearchStrategyService } from '../../src/infrastructure/services/search/search-strategy-service';
import { VectorSearchService } from '../../src/infrastructure/services/search/vector-search-service';
import { MetadataSearchService } from '../../src/infrastructure/services/search/metadata-search-service';
import { GraphContextService } from '../../src/infrastructure/services/search/graph-context-service';
import { SearchResultsAggregator } from '../../src/infrastructure/services/search/search-results-aggregator';
import { DEFAULT_SEARCH_CONFIG } from '../../src/domain/entities/search-config';

// Mock all dependencies
vi.mock('../../src/infrastructure/services/search/search-strategy-service');
vi.mock('../../src/infrastructure/services/search/vector-search-service');
vi.mock('../../src/infrastructure/services/search/metadata-search-service');
vi.mock('../../src/infrastructure/services/search/graph-context-service');
vi.mock('../../src/infrastructure/services/search/search-results-aggregator');

// Shared test variables - accessible to all test blocks
let searchOrchestrator: SearchOrchestrator;
let mockSession: any;
let mockStrategyService: any;
let mockVectorService: any;
let mockMetadataService: any;
let mockGraphService: any;
let mockAggregator: any;

describe('SearchOrchestrator', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Create mock session
    mockSession = {
      run: vi.fn().mockResolvedValue({
        records: [
          {
            get: (key: string) => {
              const data: any = {
                id: 'Bm>test123456789012',
                name: 'Test Memory',
                type: 'test',
                metadata: '{"key":"value"}',
                observations: [{ id: 'Bm>obs123456789012', content: 'Test observation', createdAt: '2025-05-30T00:00:00.000Z' }],
                tags: ['tag1', 'tag2']
              };
              return data[key];
            }
          }
        ]
      })
    };
    
    // Setup constructor mocks
    (SearchStrategyService as any).mockImplementation(() => {
      mockStrategyService = {
        determineStrategy: vi.fn().mockReturnValue({
          strategy: 'combined',
          shouldUseVector: true,
          shouldUseMetadata: true
        })
      };
      return mockStrategyService;
    });
    
    (VectorSearchService as any).mockImplementation(() => {
      mockVectorService = {
        searchByVector: vi.fn().mockResolvedValue({
          vectorCandidates: ['Bm>test123456789012']
        })
      };
      return mockVectorService;
    });
    
    (MetadataSearchService as any).mockImplementation(() => {
      mockMetadataService = {
        searchByMetadata: vi.fn().mockResolvedValue({
          exactMatches: ['Bm>test123456789012'],
          fulltextMatches: []
        }),
        searchByTags: vi.fn().mockResolvedValue(['Bm>test123456789012'])
      };
      return mockMetadataService;
    });
    
    (GraphContextService as any).mockImplementation(() => {
      mockGraphService = {
        searchWildcardWithContext: vi.fn().mockResolvedValue([
          {
            id: 'Bm>test123456789012',
            name: 'Test Memory',
            type: 'test',
            metadata: { key: 'value' },
            observations: [{ content: 'Test observation', createdAt: '2025-05-30T00:00:00.000Z' }],
            tags: ['tag1', 'tag2']
          }
        ]),
        getGraphContext: vi.fn().mockResolvedValue(new Map([
          ['Bm>test123456789012', {
            ancestors: [
              { id: 'Bm>parent12345678901', name: 'Parent', type: 'test', relation: 'RELATES_TO', distance: 1 }
            ],
            descendants: [
              { id: 'Bm>child12345678901', name: 'Child', type: 'test', relation: 'RELATES_TO', distance: 1 }
            ]
          }]
        ]))
      };
      return mockGraphService;
    });
    
    (SearchResultsAggregator as any).mockImplementation(() => {
      mockAggregator = {
        formatSearchResults: vi.fn().mockImplementation((results) => results)
      };
      return mockAggregator;
    });
    
    // Create search orchestrator
    searchOrchestrator = new SearchOrchestrator(mockSession, DEFAULT_SEARCH_CONFIG);
  });

  describe('Basic Search Operations', () => {
    it('should handle wildcard search', async () => {
      // Arrange
      mockStrategyService.determineStrategy.mockReturnValue({
        strategy: 'wildcard',
        shouldUseVector: false,
        shouldUseMetadata: false
      });
      
      // Act
      const results = await searchOrchestrator.search('*', 10, true);
      
      // Assert
      expect(mockStrategyService.determineStrategy).toHaveBeenCalledWith('*');
      expect(mockGraphService.searchWildcardWithContext).toHaveBeenCalledWith(10, undefined);
      expect(mockAggregator.formatSearchResults).toHaveBeenCalled();
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('Bm>test123456789012');
    });
    
    it('should execute regular search pipeline', async () => {
      // Arrange
      const query = 'test query';
      
      // Act
      const results = await searchOrchestrator.search(query, 10, true);
      
      // Assert
      expect(mockStrategyService.determineStrategy).toHaveBeenCalledWith(query);
      expect(mockVectorService.searchByVector).toHaveBeenCalledWith(query, 20, DEFAULT_SEARCH_CONFIG.threshold, undefined);
      expect(mockMetadataService.searchByMetadata).toHaveBeenCalledWith(query, 20, undefined);
      expect(mockMetadataService.searchByTags).toHaveBeenCalledWith(query, 10, undefined);
      expect(mockSession.run).toHaveBeenCalled();
      expect(mockGraphService.getGraphContext).toHaveBeenCalled();
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('Bm>test123456789012');
    });

    it('should respect custom threshold', async () => {
      // Arrange
      const query = 'test query';
      const customThreshold = 0.75;
      
      // Act
      await searchOrchestrator.search(query, 10, true, undefined, customThreshold);
      
      // Assert
      expect(mockVectorService.searchByVector).toHaveBeenCalledWith(query, 20, customThreshold, undefined);
    });

    it('should handle empty search results', async () => {
      // Arrange
      mockVectorService.searchByVector.mockResolvedValue({ vectorCandidates: [] });
      mockMetadataService.searchByMetadata.mockResolvedValue({ exactMatches: [], fulltextMatches: [] });
      mockMetadataService.searchByTags.mockResolvedValue([]);
      
      // Act
      const results = await searchOrchestrator.search('no results', 10, true);
      
      // Assert
      expect(results).toHaveLength(0);
      expect(mockSession.run).not.toHaveBeenCalled();
    });

    it('should handle errors in search pipeline', async () => {
      // Arrange
      mockVectorService.searchByVector.mockRejectedValue(new Error('Vector search failed'));
      
      // Act & Assert
      await expect(searchOrchestrator.search('error test', 10, true))
        .rejects.toThrow('Vector search failed');
    });
  });


  describe('GDD Compliance Requirements', () => {
    describe('Limit Enforcement - GDD 8.1 Critical', () => {
      it('should enforce limit for wildcard queries specifically', async () => {
        // GDD 8.1: MUST respect limit parameter for ALL query types including wildcard
        mockStrategyService.determineStrategy.mockReturnValue({
          strategy: 'wildcard',
          shouldUseVector: false,
          shouldUseMetadata: false
        });

        const largeMockResults = Array.from({ length: 50 }, (_, i) => ({
          id: `Bm>test12345678900${i}`,
          name: `Memory ${i}`,
          type: 'test',
          observations: [],
          tags: [],
          metadata: {}
        }));

        mockGraphService.searchWildcardWithContext.mockResolvedValue(largeMockResults);
        mockAggregator.formatSearchResults.mockReturnValue(largeMockResults);

        const results = await searchOrchestrator.search('*', 10, true);

        // Critical: Verify limit was passed to wildcard search
        expect(mockGraphService.searchWildcardWithContext).toHaveBeenCalledWith(10, undefined);
        
        // Verify final results respect limit
        expect(results.length).toBeLessThanOrEqual(10);
      });

      it('should enforce limit for regular search with large candidate sets', async () => {
        const requestedLimit = 5;
        
        // Mock large candidate sets from multiple sources
        mockVectorService.searchByVector.mockResolvedValue({
          vectorCandidates: Array.from({ length: 20 }, (_, i) => `Bm>vector${i.toString().padStart(11, '0')}`)
        });
        
        mockMetadataService.searchByMetadata.mockResolvedValue({
          exactMatches: Array.from({ length: 15 }, (_, i) => `Bm>exact${i.toString().padStart(12, '0')}`),
          fulltextMatches: Array.from({ length: 10 }, (_, i) => `Bm>full${i.toString().padStart(13, '0')}`)
        });

        mockMetadataService.searchByTags.mockResolvedValue(
          Array.from({ length: 8 }, (_, i) => `Bm>tag${i.toString().padStart(14, '0')}`)
        );

        // Mock session returning large result set with proper structure
        const largeMockRecords = Array.from({ length: 30 }, (_, i) => ({
          get: (key: string) => {
            const recordData: any = {
              id: `Bm>result${i.toString().padStart(10, '0')}`,
              name: `Memory ${i}`,
              type: 'test',
              metadata: '{}',
              observations: [],
              tags: ['test']
            };
            return recordData[key];
          }
        }));

        mockSession.run.mockResolvedValue({
          records: largeMockRecords
        });

        const results = await searchOrchestrator.search('test query', requestedLimit, false);

        // Critical: Final results MUST NOT exceed requested limit
        expect(results.length).toBeLessThanOrEqual(requestedLimit);
      });
    });

    describe('Relationship Type Accuracy - GDD 8.2', () => {
      it('should preserve actual relationship types not generic RELATES_TO', async () => {
        // GDD 8.2: Graph context MUST accurately reflect actual relationship type
        
        // Mock graph context with specific relationship types
        const mockGraphContext = new Map([
          ['Bm>test123456789012', {
            ancestors: [{
              id: 'Bm>ancestor12345678',
              name: 'Parent Memory',
              type: 'process',
              relation: 'INFLUENCES', // Must be actual relationship type, not generic 'RELATES_TO'
              distance: 1,
              strength: 0.8,
              context: ['programming', 'architecture'],
              source: 'agent',
              createdAt: '2025-01-01T09:00:00Z'
            }],
            descendants: [{
              id: 'Bm>descendant123456',
              name: 'Child Memory',
              type: 'implementation',
              relation: 'DEPENDS_ON', // Must be actual relationship type
              distance: 1,
              strength: 0.9,
              context: ['programming'],
              source: 'user',
              createdAt: '2025-01-01T11:00:00Z'
            }]
          }]
        ]);

        mockGraphService.getGraphContext.mockResolvedValue(mockGraphContext);

        const results = await searchOrchestrator.search('test', 10, true);

        // Verify accurate relationship types in results
        expect(results[0].related).toBeDefined();
        expect(results[0].related!.ancestors![0].relation).toBe('INFLUENCES');
        expect(results[0].related!.descendants![0].relation).toBe('DEPENDS_ON');
        
        // Verify enhanced metadata is preserved
        expect(results[0].related!.ancestors![0].strength).toBe(0.8);
        expect(results[0].related!.ancestors![0].context).toEqual(['programming', 'architecture']);
        expect(results[0].related!.ancestors![0].source).toBe('agent');
      });
    });

    describe('Memory Type Filtering - GDD 8.5', () => {
      it('should pass memory types to all search components consistently', async () => {
        // GDD 8.5: Memory type filtering MUST be available through memoryTypes parameter
        const memoryTypes = ['project', 'research', 'security'];
        
        await searchOrchestrator.search('test', 10, true, memoryTypes);

        // Verify memory types passed to all search methods consistently
        expect(mockVectorService.searchByVector).toHaveBeenCalledWith(
          'test', 20, DEFAULT_SEARCH_CONFIG.threshold, memoryTypes
        );
        expect(mockMetadataService.searchByMetadata).toHaveBeenCalledWith(
          'test', 20, memoryTypes
        );
        expect(mockMetadataService.searchByTags).toHaveBeenCalledWith(
          'test', 10, memoryTypes
        );
      });
    });

    describe('Neo4j Integer Conversion', () => {
      it('should convert Neo4j integers in related memories', async () => {
        // Mock Neo4j Integer objects properly
        mockGraphService.getGraphContext.mockResolvedValue(new Map([
          ['Bm>test123456789012', {
            ancestors: [{
              id: 'Bm>parent12345678901',
              name: 'Parent',
              type: 'test',
              relation: 'RELATES_TO',
              // Mock Neo4j integer object
              distance: {
                low: 1,
                high: 0,
                toNumber: () => 1
              }
            }],
            descendants: [{
              id: 'Bm>child12345678901',
              name: 'Child',
              type: 'test',
              relation: 'RELATES_TO',
              // Mock Neo4j integer object
              distance: {
                low: 1,
                high: 0,
                toNumber: () => 1
              }
            }]
          }]
        ]));
        
        const results = await searchOrchestrator.search('test query', 10, true);
        
        // Assert proper conversion to regular numbers
        expect(results[0].related?.ancestors?.[0].distance).toBe(1);
        expect(results[0].related?.descendants?.[0].distance).toBe(1);
        expect(typeof results[0].related?.ancestors?.[0].distance).toBe('number');
        expect(typeof results[0].related?.descendants?.[0].distance).toBe('number');
      });
    });
  });
});
