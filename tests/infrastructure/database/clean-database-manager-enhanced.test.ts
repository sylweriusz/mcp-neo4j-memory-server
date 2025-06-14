/**
 * Database Manager Coverage Tests
 * Target: Increase coverage from 51.61% to 80%+
 * Focus: Database switching, schema validation, error recovery
 * Lines: 95-109, 112-125 in clean-database-manager.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CleanDatabaseManager } from '../../../src/infrastructure/database/clean-database-manager';
import { Neo4jDriverManager } from '../../../src/infrastructure/database/neo4j-driver';
import { SessionFactory } from '../../../src/infrastructure/database/session-factory';
import { IndexManager } from '../../../src/infrastructure/database/index-manager';

// Mock dependencies
vi.mock('../../../src/infrastructure/database/neo4j-driver');
vi.mock('../../../src/infrastructure/database/session-factory');
vi.mock('../../../src/infrastructure/database/index-manager');

describe('CleanDatabaseManager - Enhanced Coverage', () => {
  let databaseManager: CleanDatabaseManager;
  let mockDriverManager: any;
  let mockSessionFactory: any;
  let mockSession: any;
  let mockIndexManager: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup mock session
    mockSession = {
      run: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined)
    };

    // Setup mock driver manager
    mockDriverManager = {
      getCurrentDatabase: vi.fn().mockReturnValue({ database: 'test-db' }),
      switchDatabase: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined)
    };

    // Setup mock session factory
    mockSessionFactory = {
      createSession: vi.fn().mockReturnValue(mockSession),
      createSystemSession: vi.fn().mockReturnValue(mockSession)
    };

    // Setup mock index manager
    mockIndexManager = {
      hasRequiredSchema: vi.fn().mockResolvedValue(true),
      initializeSchema: vi.fn().mockResolvedValue(undefined)
    };

    (Neo4jDriverManager as any).mockImplementation(() => mockDriverManager);
    (SessionFactory as any).mockImplementation(() => mockSessionFactory);
    (IndexManager as any).mockImplementation(() => mockIndexManager);

    databaseManager = new CleanDatabaseManager(mockDriverManager, mockSessionFactory);
  });

  afterEach(async () => {
    await databaseManager.close();
  });

  describe('Database Existence Validation', () => {
    it('should detect existing database correctly', async () => {
      // Mock SHOW DATABASES query returning results
      mockSession.run = vi.fn().mockResolvedValue({
        records: [{ get: vi.fn().mockReturnValue('existing-db') }]
      });

      const result = await databaseManager.switchDatabase('existing-db');

      expect(result.currentDatabase).toBe('existing-db');
      expect(result.created).toBe(false);
      expect(mockSession.run).toHaveBeenCalledWith(
        'SHOW DATABASES YIELD name WHERE name = $name',
        { name: 'existing-db' }
      );
    });

    it('should handle SHOW DATABASES query failure gracefully', async () => {
      // Mock SHOW DATABASES query throwing error (older Neo4j versions)
      mockSession.run = vi.fn().mockRejectedValue(new Error('SHOW DATABASES not supported'));

      // Should assume database exists and continue
      const result = await databaseManager.switchDatabase('assumed-existing');

      expect(result.currentDatabase).toBe('assumed-existing');
    });
  });

  describe('Database Creation Logic', () => {
    it('should create new database when it does not exist', async () => {
      // Mock database doesn't exist
      mockSession.run = vi.fn()
        .mockResolvedValueOnce({ records: [] }) // SHOW DATABASES returns empty
        .mockResolvedValueOnce({}); // CREATE DATABASE succeeds

      const result = await databaseManager.switchDatabase('new-db');

      expect(result.created).toBe(true);
      expect(result.currentDatabase).toBe('new-db');
      expect(mockSession.run).toHaveBeenCalledWith(
        'CREATE DATABASE $name IF NOT EXISTS',
        { name: 'new-db' }
      );
    });

    it('should handle database creation failure gracefully', async () => {
      mockSession.run = vi.fn()
        .mockResolvedValueOnce({ records: [] }) // Database doesn't exist
        .mockRejectedValueOnce(new Error('Permission denied')); // CREATE fails

      // Should continue despite creation failure
      const result = await databaseManager.switchDatabase('failed-create');

      expect(result.currentDatabase).toBe('failed-create');
      expect(result.created).toBe(true); // Still reports created attempt
    });
  });

  describe('Database Name Validation', () => {
    it('should normalize questionable database names', async () => {
      const problematicNames = [
        { input: 'invalid@name', expected: 'invalidname' }, // @ gets removed
        { input: 'invalid name', expected: 'invalid-name' }, // space becomes hyphen
        { input: 'UPPERCASE', expected: 'uppercase' }, // normalized to lowercase
      ];

      for (const { input, expected } of problematicNames) {
        const result = await databaseManager.switchDatabase(input);
        expect(result.currentDatabase).toBe(expected);
        expect(result.previousDatabase).toBe('test-db');
        expect(typeof result.created).toBe('boolean');
      }
    });

    it('should accept valid database names', async () => {
      const validNames = [
        'lowercase',
        'with-hyphens',
        'with_underscores',
        'with.dots',
        'mixed123numbers'
      ];

      // Mock existing databases
      mockSession.run = vi.fn().mockResolvedValue({
        records: [{}] // Database exists
      });

      for (const validName of validNames) {
        await expect(databaseManager.switchDatabase(validName))
          .resolves.not.toThrow();
      }
    });
  });

  describe('Same Database Optimization', () => {
    it('should optimize when switching to same database', async () => {
      mockDriverManager.getCurrentDatabase = vi.fn().mockReturnValue({ 
        database: 'current-db' 
      });
      mockIndexManager.hasRequiredSchema = vi.fn().mockResolvedValue(true);

      const result = await databaseManager.switchDatabase('current-db');

      expect(result.previousDatabase).toBe('current-db');
      expect(result.currentDatabase).toBe('current-db');
      expect(result.created).toBe(false);
    });
  });

  describe('getCurrentDatabase Method', () => {
    it('should return current database from driver manager', () => {
      mockDriverManager.getCurrentDatabase = vi.fn().mockReturnValue({
        database: 'current-test-db'
      });

      const result = databaseManager.getCurrentDatabase();

      expect(result.database).toBe('current-test-db');
      expect(mockDriverManager.getCurrentDatabase).toHaveBeenCalled();
    });
  });
});
