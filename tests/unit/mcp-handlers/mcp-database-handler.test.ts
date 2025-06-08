/**
 * MCP Database Handler Tests - Production Integration
 * Single responsibility: Test database switching operations
 * 
 * Test Coverage Target: 90%+ (Critical MCP functionality)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpDatabaseHandler } from '../../../src/application/mcp-handlers/mcp-database-handler';
import { DIContainer } from '../../../src/container/di-container';

// Mock DIContainer to avoid database dependencies
vi.mock('../../../src/container/di-container');

describe('McpDatabaseHandler - Database Operations', () => {
  let handler: McpDatabaseHandler;
  let mockContainer: vi.Mocked<DIContainer>;
  let mockDatabaseManager: any;

  beforeEach(() => {
    mockDatabaseManager = {
      switchDatabase: vi.fn()
    };

    mockContainer = {
      getDatabaseManager: vi.fn().mockReturnValue(mockDatabaseManager)
    } as any;

    (DIContainer.getInstance as any).mockReturnValue(mockContainer);
    
    handler = new McpDatabaseHandler();
  });

  describe('handleDatabaseSwitch', () => {
    it('should successfully switch to existing database', async () => {
      // Arrange
      const databaseName = 'test-database';
      const expectedResult = {
        previousDatabase: 'neo4j',
        currentDatabase: 'test-database',
        created: false
      };

      mockDatabaseManager.switchDatabase.mockResolvedValue(expectedResult);

      // Act
      const result = await handler.handleDatabaseSwitch(databaseName);

      // Assert
      expect(mockContainer.getDatabaseManager).toHaveBeenCalled();
      expect(mockDatabaseManager.switchDatabase).toHaveBeenCalledWith(databaseName, true);
      expect(result).toEqual(expectedResult);
    });

    it('should create new database when it does not exist', async () => {
      // Arrange
      const databaseName = 'new-project-db';
      const expectedResult = {
        previousDatabase: 'neo4j',
        currentDatabase: 'new-project-db',
        created: true
      };

      mockDatabaseManager.switchDatabase.mockResolvedValue(expectedResult);

      // Act
      const result = await handler.handleDatabaseSwitch(databaseName);

      // Assert
      expect(mockDatabaseManager.switchDatabase).toHaveBeenCalledWith(databaseName, true);
      expect(result.created).toBe(true);
      expect(result.currentDatabase).toBe(databaseName);
    });

    it('should handle database switching errors gracefully', async () => {
      // Arrange
      const databaseName = 'invalid-db-name';
      const errorMessage = 'Invalid database name: contains special characters';
      
      mockDatabaseManager.switchDatabase.mockRejectedValue(new Error(errorMessage));

      // Act & Assert
      await expect(handler.handleDatabaseSwitch(databaseName))
        .rejects
        .toThrow('Failed to switch database: Error: Invalid database name: contains special characters');
    });

    it('should handle network timeout errors', async () => {
      // Arrange
      const databaseName = 'timeout-db';
      mockDatabaseManager.switchDatabase.mockRejectedValue(new Error('Connection timeout'));

      // Act & Assert
      await expect(handler.handleDatabaseSwitch(databaseName))
        .rejects
        .toThrow('Failed to switch database: Error: Connection timeout');
    });

    it('should handle permission errors', async () => {
      // Arrange
      const databaseName = 'restricted-db';
      mockDatabaseManager.switchDatabase.mockRejectedValue(new Error('Access denied'));

      // Act & Assert
      await expect(handler.handleDatabaseSwitch(databaseName))
        .rejects
        .toThrow('Failed to switch database: Error: Access denied');
    });

    it('should handle empty database name', async () => {
      // Arrange
      const databaseName = '';
      mockDatabaseManager.switchDatabase.mockRejectedValue(new Error('Database name cannot be empty'));

      // Act & Assert
      await expect(handler.handleDatabaseSwitch(databaseName))
        .rejects
        .toThrow('Failed to switch database: Error: Database name cannot be empty');
    });
  });
});
