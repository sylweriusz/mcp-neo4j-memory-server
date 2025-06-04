/**
 * IndexManager Simplified Tests
 * Focus on current implementation, not legacy features
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IndexManager } from '../../../src/infrastructure/database/index-manager';

describe('IndexManager - Simplified Tests', () => {
  let indexManager: IndexManager;
  let mockSession: any;

  beforeEach(() => {
    mockSession = {
      run: vi.fn()
    };
    
    // Create with valid dimensions to test vector indexes
    indexManager = new IndexManager(mockSession, 384);
  });

  describe('Database Validation', () => {
    it('should succeed when database name is available', async () => {
      // Mock db.info() to return valid database name
      mockSession.run.mockResolvedValueOnce({ 
        records: [{ get: () => 'test-database' }] 
      });
      mockSession.run.mockResolvedValue({ records: [] });

      await expect(indexManager.ensureConstraints()).resolves.not.toThrow();
    });

    it('should fail when database name cannot be determined', async () => {
      // Mock db.info() to return null
      mockSession.run.mockResolvedValueOnce({ 
        records: [{ get: () => null }] 
      });

      await expect(indexManager.ensureConstraints())
        .rejects.toThrow('MENTAT VIOLATION: Database name could not be determined');
    });

    it('should detect system database and fail', async () => {
      // Mock db.info() to return system database
      mockSession.run.mockResolvedValueOnce({ 
        records: [{ get: () => 'system' }] 
      });

      await expect(indexManager.ensureConstraints())
        .rejects.toThrow('MENTAT VIOLATION: Cannot create constraints on system database');
    });
  });

  describe('Schema Validation', () => {
    it('should correctly detect existing schema', async () => {
      // Mock SHOW CONSTRAINTS queries to return existing constraints
      mockSession.run
        .mockResolvedValueOnce({ records: [{}] }) // memory constraint exists
        .mockResolvedValueOnce({ records: [{}] }) // observation constraint exists  
        .mockResolvedValueOnce({ records: [{}] }) // memory_type index exists
        .mockResolvedValueOnce({ records: [{}] }); // memory_created index exists

      const hasSchema = await indexManager.hasRequiredSchema();
      expect(hasSchema).toBe(true);
    });

    it('should detect missing schema', async () => {
      // Mock queries to return empty results
      mockSession.run.mockResolvedValue({ records: [] });

      const hasSchema = await indexManager.hasRequiredSchema();
      expect(hasSchema).toBe(false);
    });
  });

  describe('Full Schema Initialization', () => {
    it('should initialize complete schema successfully', async () => {
      // Mock database validation to always succeed - each method calls validateUserDatabase
      const dbInfoResponse = { 
        records: [{ 
          get: (field: string) => field === 'name' ? 'test-database' : undefined 
        }] 
      };
      
      // Mock db.info() to return valid database for all validation calls
      mockSession.run.mockImplementation((query: string) => {
        if (query.includes('db.info()')) {
          return Promise.resolve(dbInfoResponse);
        }
        // All other operations (constraints, indexes) succeed
        return Promise.resolve({ records: [] });
      });

      await expect(indexManager.initializeSchema()).resolves.not.toThrow();
      
      // Should call db.info multiple times, then various schema operations
      expect(mockSession.run).toHaveBeenCalled();
    });
  });
});
