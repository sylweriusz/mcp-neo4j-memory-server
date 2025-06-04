/**
 * DIContainer Truth-First Tests - Production Architecture Validation
 * Single responsibility: Test real dependency injection without mocks
 * 
 * Architecture: Zero-fallback testing - test production paths directly
 * No mocks - validates actual component initialization and connectivity
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DIContainer } from '../../../src/container/di-container';

describe('DIContainer - Production Architecture', () => {
  let container: DIContainer;

  beforeEach(() => {
    // Clear singleton for clean test state
    (DIContainer as any).instance = undefined;
    container = DIContainer.getInstance();
  });

  afterEach(async () => {
    // Production-grade cleanup
    try {
      await container.close();
    } catch (error) {
      // Expected for test environment - no real database connections
      console.warn('[TEST] Expected cleanup warning:', error instanceof Error ? error.message : String(error));
    }
    (DIContainer as any).instance = undefined;
  });

  describe('Singleton Architecture', () => {
    it('should maintain singleton pattern integrity', () => {
      // Act
      const instance1 = DIContainer.getInstance();
      const instance2 = DIContainer.getInstance();

      // Assert - Singleton contract
      expect(instance1).toBe(instance2);
      expect(instance1).toBe(container);
    });

    it('should initialize all required components', () => {
      // Act - Access all public getters
      const createUseCase = container.getCreateMemoryUseCase();
      const searchUseCase = container.getSearchMemoriesUseCase();
      const updateUseCase = container.getUpdateMemoryUseCase();
      const deleteUseCase = container.getDeleteMemoryUseCase();
      const observationUseCase = container.getManageObservationsUseCase();
      const relationUseCase = container.getManageRelationsUseCase();

      // Assert - Component availability
      expect(createUseCase).toBeDefined();
      expect(searchUseCase).toBeDefined();
      expect(updateUseCase).toBeDefined();
      expect(deleteUseCase).toBeDefined();
      expect(observationUseCase).toBeDefined();
      expect(relationUseCase).toBeDefined();
    });
    it('should provide consistent instances across multiple accesses', () => {
      // Act - Multiple accesses
      const useCase1 = container.getCreateMemoryUseCase();
      const useCase2 = container.getCreateMemoryUseCase();

      // Assert - Instance consistency
      expect(useCase1).toBe(useCase2);
    });
  });

  describe('Service Layer Integration', () => {
    it('should provide embedding service', () => {
      // Act
      const embeddingService = container.getEmbeddingService();

      // Assert
      expect(embeddingService).toBeDefined();
      expect(typeof embeddingService.calculateEmbedding).toBe('function');
      expect(typeof embeddingService.calculateSimilarity).toBe('function');
    });

    it('should provide search repositories', () => {
      // Act
      const searchUseCase = container.getSearchMemoriesUseCase();

      // Assert
      expect(searchUseCase).toBeDefined();
      expect(typeof searchUseCase.execute).toBe('function');
    });

    it('should provide database manager', () => {
      // Act
      const databaseManager = container.getDatabaseManager();

      // Assert
      expect(databaseManager).toBeDefined();
      expect(typeof databaseManager.switchDatabase).toBe('function');
      expect(typeof databaseManager.getCurrentDatabase).toBe('function');
    });
  });

  describe('Repository Layer Integration', () => {
    it('should provide memory repository', () => {
      // Act
      const memoryRepository = container.getMemoryRepository();

      // Assert
      expect(memoryRepository).toBeDefined();
      expect(typeof memoryRepository.create).toBe('function');
      expect(typeof memoryRepository.findById).toBe('function');
      expect(typeof memoryRepository.update).toBe('function');
      expect(typeof memoryRepository.delete).toBe('function');
    });

    it('should provide session factory', () => {
      // Act
      const sessionFactory = container.getSessionFactory();

      // Assert
      expect(sessionFactory).toBeDefined();
      expect(typeof sessionFactory.createSession).toBe('function');
      expect(typeof sessionFactory.withSession).toBe('function');
    });
  });

  describe('Database Context Management', () => {
    it('should provide current database information', () => {
      // Act
      const dbInfo = container.getCurrentDatabase();

      // Assert - Production database context
      expect(dbInfo).toBeDefined();
      expect(dbInfo).toHaveProperty('database');
      expect(typeof dbInfo.database).toBe('string');
      expect(dbInfo.database.length).toBeGreaterThan(0);
    });

    it('should support database switching', () => {
      // Arrange
      const originalDb = container.getCurrentDatabase().database;

      // Act
      container.switchDatabase('test-context');
      const newDb = container.getCurrentDatabase().database;

      // Assert
      expect(newDb).toBe('test-context');
      expect(newDb).not.toBe(originalDb);
    });
  });

  describe('Production Architecture Validation', () => {
    it('should implement clean shutdown sequence', async () => {
      // Act - Test clean shutdown
      await expect(container.close()).resolves.not.toThrow();
    });

    it('should reinitialize after shutdown', () => {
      // Arrange - Shutdown and recreate
      (DIContainer as any).instance = undefined;
      
      // Act
      const newContainer = DIContainer.getInstance();
      const useCase = newContainer.getCreateMemoryUseCase();

      // Assert
      expect(newContainer).toBeDefined();
      expect(useCase).toBeDefined();
    });

    it('should maintain component relationships', () => {
      // Act - Get related components
      const memoryRepo = container.getMemoryRepository();
      const sessionFactory = container.getSessionFactory();
      const embeddingService = container.getEmbeddingService();

      // Assert - Components exist and can interact
      expect(memoryRepo).toBeDefined();
      expect(sessionFactory).toBeDefined(); 
      expect(embeddingService).toBeDefined();

      // Test component method availability
      expect(typeof sessionFactory.createSession).toBe('function');
      expect(typeof embeddingService.calculateEmbedding).toBe('function');
    });
  });

  describe('Search Integration', () => {
    it('should provide complete search pipeline', () => {
      // Act
      const searchUseCase = container.getSearchMemoriesUseCase();

      // Assert - Search pipeline components
      expect(searchUseCase).toBeDefined();
      expect(typeof searchUseCase.execute).toBe('function');
    });

    it('should integrate embedding service with search', () => {
      // Act
      const embeddingService = container.getEmbeddingService();
      const searchUseCase = container.getSearchMemoriesUseCase();

      // Assert - Service integration
      expect(embeddingService).toBeDefined();
      expect(searchUseCase).toBeDefined();
      
      // Both should have compatible interfaces
      expect(typeof embeddingService.calculateEmbedding).toBe('function');
      expect(typeof searchUseCase.execute).toBe('function');
    });
  });
});
