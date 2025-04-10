import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseManager } from '../src/database_manager';
import { Neo4jKnowledgeGraphManager } from '../src/manager';
import { NullLogger } from '../src/logger';

// Silence console error in tests
console.error = vi.fn();

// Mock Neo4jKnowledgeGraphManager
vi.mock('../src/manager', () => {
  const mockRecords = [{ get: (key: string) => key === 'name' ? 'testdb' : null }];
  
  const mockSystemSession = {
    run: vi.fn().mockResolvedValue({
      records: mockRecords
    }),
    close: vi.fn().mockResolvedValue({}),
  };
  
  return {
    Neo4jKnowledgeGraphManager: vi.fn().mockImplementation(() => {
      return {
        createEntities: vi.fn().mockResolvedValue([]),
        getSystemSession: vi.fn().mockReturnValue(mockSystemSession),
        database: 'neo4j',
        initialized: true,
        neo4jConfig: {
          uri: 'bolt://localhost:7687',
          database: 'neo4j',
        },
      };
    }),
  };
});

describe('DatabaseManager', () => {
  let databaseManager: DatabaseManager;
  let knowledgeGraphManager: Neo4jKnowledgeGraphManager;

  beforeEach(() => {
    const logger = new NullLogger();
    knowledgeGraphManager = new Neo4jKnowledgeGraphManager(
      () => ({
        uri: 'bolt://localhost:7687',
        username: 'neo4j',
        password: 'password',
        database: 'neo4j',
      }),
      logger
    );
    databaseManager = new DatabaseManager(knowledgeGraphManager);
  });

  describe('getCurrentDatabase', () => {
    it('should return current database info', () => {
      const result = databaseManager.getCurrentDatabase();
      expect(result).toEqual({
        database: 'neo4j',
        uri: 'bolt://localhost:7687',
      });
    });
  });

  describe('listDatabases', () => {
    it('should return list of databases', async () => {
      const result = await databaseManager.listDatabases();
      expect(result).toEqual(['testdb']);
    });
  });

  describe('switchDatabase', () => {
    it('should switch to existing database', async () => {
      const result = await databaseManager.switchDatabase('testdb');
      expect(result).toEqual({
        previousDatabase: 'neo4j',
        currentDatabase: 'testdb',
        created: false,
      });
    });

    it('should throw error if database name is empty', async () => {
      await expect(databaseManager.switchDatabase('')).rejects.toThrow('Database name cannot be empty');
    });

    it('should create and switch to new database if createIfNotExists is true', async () => {
      // Mock for non-existing DB
      const getSystemSessionSpy = vi.spyOn(databaseManager as any, 'getSystemSession');
      
      const emptyRecordsSession = {
        run: vi.fn().mockResolvedValue({ records: [] }),
        close: vi.fn().mockResolvedValue({}),
      };
      
      const createDbSession = {
        run: vi.fn().mockResolvedValue({}),
        close: vi.fn().mockResolvedValue({}),
      };
      
      // First call - check if DB exists (return empty records)
      getSystemSessionSpy.mockReturnValueOnce(emptyRecordsSession);
      
      // Second call - create database
      getSystemSessionSpy.mockReturnValueOnce(createDbSession);
      
      const result = await databaseManager.switchDatabase('newdb', true);
      expect(result).toEqual({
        previousDatabase: 'neo4j',
        currentDatabase: 'newdb',
        created: true,
      });
      
      expect(emptyRecordsSession.run).toHaveBeenCalledWith(
        expect.stringContaining('SHOW DATABASES WHERE name ='),
        expect.any(Object)
      );
      
      expect(createDbSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE DATABASE'),
        expect.any(Object)
      );
    });

    it('should throw error if database does not exist and createIfNotExists is false', async () => {
      // Mock for non-existing DB
      const getSystemSessionSpy = vi.spyOn(databaseManager as any, 'getSystemSession');
      
      getSystemSessionSpy.mockReturnValueOnce({
        run: vi.fn().mockResolvedValue({ records: [] }),
        close: vi.fn().mockResolvedValue({}),
      });

      await expect(databaseManager.switchDatabase('nonexistent')).rejects.toThrow("Database 'nonexistent' does not exist");
    });
  });
});
