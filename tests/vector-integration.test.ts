/**
 * Vector integration tests
 * Testing production hooks in isolation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Session } from 'neo4j-driver';
import { 
  afterMemoryCreate, 
  afterMemoryUpdate, 
  afterObservationChange,
  afterDatabaseSelect,
  enhancedSearch 
} from '../src/vector/integration';
import { processMemoryVectors, initializeVectorSupport } from '../src/vector/database';
import { EnhancedUnifiedSearch } from '../src/search/enhanced-unified-search';

// Mock external dependencies
vi.mock('../src/vector/database');
vi.mock('../src/search/enhanced-unified-search');

describe('Vector Integration Hooks', () => {
  let session: Session;

  beforeEach(() => {
    session = {
      run: vi.fn()
    } as any;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('afterMemoryCreate', () => {
    it('should process vectors for valid memory', async () => {
      const memory = { id: 'test-id', name: 'Test Memory' };
      
      await afterMemoryCreate(session, memory);
      
      expect(processMemoryVectors).toHaveBeenCalledWith(
        session, 
        'test-id', 
        'Test Memory'
      );
    });

    it('should skip processing for invalid memory', async () => {
      await afterMemoryCreate(session, null as any);
      await afterMemoryCreate(session, { id: '', name: 'test' });
      await afterMemoryCreate(session, { id: 'test', name: '' });
      
      expect(processMemoryVectors).not.toHaveBeenCalled();
    });
  });

  describe('afterMemoryUpdate', () => {
    it('should process vectors when name changes', async () => {
      const memory = { id: 'test-id', name: 'New Name' };
      const oldName = 'Old Name';
      
      await afterMemoryUpdate(session, memory, oldName);
      
      expect(processMemoryVectors).toHaveBeenCalledWith(
        session, 
        'test-id', 
        'New Name'
      );
    });

    it('should skip processing when name unchanged', async () => {
      const memory = { id: 'test-id', name: 'Same Name' };
      const oldName = 'Same Name';
      
      await afterMemoryUpdate(session, memory, oldName);
      
      expect(processMemoryVectors).not.toHaveBeenCalled();
    });

    it('should skip processing for invalid memory', async () => {
      await afterMemoryUpdate(session, null as any, 'old');
      await afterMemoryUpdate(session, { id: '', name: 'test' }, 'old');
      
      expect(processMemoryVectors).not.toHaveBeenCalled();
    });
  });

  describe('afterObservationChange', () => {
    it('should process vectors after fetching memory name', async () => {
      const mockResult = {
        records: [{
          get: vi.fn().mockReturnValue('Memory Name')
        }]
      };
      session.run = vi.fn().mockResolvedValue(mockResult);
      
      await afterObservationChange(session, 'memory-id', ['observation1']);
      
      expect(session.run).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (m:Memory {id: $memoryId})'),
        { memoryId: 'memory-id' }
      );
      expect(processMemoryVectors).toHaveBeenCalledWith(
        session, 
        'memory-id', 
        'Memory Name',
        ['observation1']
      );
    });

    it('should skip processing when memory not found', async () => {
      const mockResult = { records: [] };
      session.run = vi.fn().mockResolvedValue(mockResult);
      
      await afterObservationChange(session, 'missing-id', ['observation1']);
      
      expect(processMemoryVectors).not.toHaveBeenCalled();
    });
  });

  describe('afterDatabaseSelect', () => {
    it('should initialize vector support', async () => {
      await afterDatabaseSelect(session);
      
      expect(initializeVectorSupport).toHaveBeenCalledWith(session);
    });
  });

  describe('enhancedSearch', () => {
    let mockSearchInstance: any;

    beforeEach(() => {
      mockSearchInstance = {
        search: vi.fn().mockResolvedValue(['result1', 'result2'])
      };
      (EnhancedUnifiedSearch as any).mockImplementation(() => mockSearchInstance);
    });

    it('should perform enhanced search with default limit', async () => {
      const results = await enhancedSearch(session, 'test query');
      
      expect(EnhancedUnifiedSearch).toHaveBeenCalledWith(session);
      expect(mockSearchInstance.search).toHaveBeenCalledWith('test query', 10, false);
      expect(results).toEqual(['result1', 'result2']);
    });

    it('should perform enhanced search with custom limit', async () => {
      const results = await enhancedSearch(session, 'test query', 5);
      
      expect(mockSearchInstance.search).toHaveBeenCalledWith('test query', 5, false);
      expect(results).toEqual(['result1', 'result2']);
    });

    it('should return empty array for empty query', async () => {
      const results1 = await enhancedSearch(session, '');
      const results2 = await enhancedSearch(session, '   ');
      
      expect(results1).toEqual([]);
      expect(results2).toEqual([]);
      expect(mockSearchInstance.search).not.toHaveBeenCalled();
    });

    it('should return empty array for null/undefined query', async () => {
      const results1 = await enhancedSearch(session, null as any);
      const results2 = await enhancedSearch(session, undefined as any);
      
      expect(results1).toEqual([]);
      expect(results2).toEqual([]);
      expect(mockSearchInstance.search).not.toHaveBeenCalled();
    });
  });
});
