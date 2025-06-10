/**
 * Dependency Injection Container - Clean Architecture Complete
 * Single responsibility: Wire up all dependencies with clean database management
 */

import { Neo4jDriverManager, SessionFactory, IndexManager, CleanDatabaseManager } from '../infrastructure/database';
import { CompositeMemoryRepository } from '../infrastructure/repositories/memory';
import { Neo4jSearchRepository } from '../infrastructure/repositories/neo4j-search-repository';
import { CreateMemoryUseCase } from '../application/use-cases/create-memory';
import { SearchMemoriesUseCase } from '../application/use-cases/search-memories';
import { UpdateMemoryUseCase } from '../application/use-cases/update-memory';
import { DeleteMemoryUseCase } from '../application/use-cases/delete-memory';
import { ManageObservationsUseCase } from '../application/use-cases/manage-observations';
import { ManageRelationsUseCase } from '../application/use-cases/manage-relations';
import { XenovaEmbeddingService } from '../infrastructure/services/embedding-service';
import { getVectorConfig } from '../config';

// Configuration constants
const MODEL_INITIALIZATION_DELAY = 100; // ms - delay for non-blocking model loading

export class DIContainer {
  private static instance: DIContainer;
  
  // Infrastructure
  private driverManager!: Neo4jDriverManager;
  private sessionFactory!: SessionFactory;
  private indexManager!: IndexManager;
  private databaseManager!: CleanDatabaseManager;
  
  // Services
  private embeddingService!: XenovaEmbeddingService;
  
  // Repositories
  private memoryRepository!: CompositeMemoryRepository;
  private searchRepository!: Neo4jSearchRepository;
  
  // Use Cases
  private createMemoryUseCase!: CreateMemoryUseCase;
  private searchMemoriesUseCase!: SearchMemoriesUseCase;
  private updateMemoryUseCase!: UpdateMemoryUseCase;
  private deleteMemoryUseCase!: DeleteMemoryUseCase;
  private manageObservationsUseCase!: ManageObservationsUseCase;
  private manageRelationsUseCase!: ManageRelationsUseCase;

  // Session tracking for cleanup
  private activeSessions: any[] = [];

  private constructor() {
    this.initializeInfrastructure();
    this.initializeServices();
    this.initializeRepositories();
    this.initializeUseCases();
  }

  static getInstance(): DIContainer {
    if (!DIContainer.instance) {
      DIContainer.instance = new DIContainer();
    }
    return DIContainer.instance;
  }

  private initializeInfrastructure(): void {
    this.driverManager = new Neo4jDriverManager();
    this.sessionFactory = new SessionFactory(this.driverManager);
    this.databaseManager = new CleanDatabaseManager(this.driverManager, this.sessionFactory);
  }

  private initializeServices(): void {
    this.embeddingService = new XenovaEmbeddingService();
    
    // Note: Search orchestrator removed - SimplifiedSearchService used directly in repositories
  }

  private initializeRepositories(): void {
    this.memoryRepository = new CompositeMemoryRepository(this.sessionFactory);
    this.searchRepository = new Neo4jSearchRepository(this.sessionFactory);
  }

  private initializeUseCases(): void {
    this.createMemoryUseCase = new CreateMemoryUseCase(
      this.memoryRepository, 
      this.embeddingService
    );
    this.searchMemoriesUseCase = new SearchMemoriesUseCase(this.searchRepository);
    this.updateMemoryUseCase = new UpdateMemoryUseCase(this.memoryRepository);
    this.deleteMemoryUseCase = new DeleteMemoryUseCase(this.memoryRepository);
    this.manageObservationsUseCase = new ManageObservationsUseCase(
      this.memoryRepository
    );
    this.manageRelationsUseCase = new ManageRelationsUseCase(this.memoryRepository);
  }

  // Public getters for use cases
  getCreateMemoryUseCase(): CreateMemoryUseCase {
    return this.createMemoryUseCase;
  }

  getSearchMemoriesUseCase(): SearchMemoriesUseCase {
    return this.searchMemoriesUseCase;
  }

  getUpdateMemoryUseCase(): UpdateMemoryUseCase {
    return this.updateMemoryUseCase;
  }

  getDeleteMemoryUseCase(): DeleteMemoryUseCase {
    return this.deleteMemoryUseCase;
  }

  getManageObservationsUseCase(): ManageObservationsUseCase {
    return this.manageObservationsUseCase;
  }

  getManageRelationsUseCase(): ManageRelationsUseCase {
    return this.manageRelationsUseCase;
  }

  // Public getters for services
  getEmbeddingService(): XenovaEmbeddingService {
    return this.embeddingService;
  }

  getDatabaseManager(): CleanDatabaseManager {
    return this.databaseManager;
  }

  getMemoryRepository(): CompositeMemoryRepository {
    return this.memoryRepository;
  }

  getSessionFactory(): SessionFactory {
    return this.sessionFactory;
  }

  getCurrentDatabase(): { database: string } {
    return this.driverManager.getCurrentDatabase();
  }

  switchDatabase(database: string): void {
    this.driverManager.switchDatabase(database);
  }

  async initializeDatabase(): Promise<void> {
    // Vector indexes will be created when model becomes available
    const session = this.sessionFactory.createSession();
    
    try {
      // Fast schema initialization - no model dependencies
      this.indexManager = new IndexManager(session, undefined);
      
      const hasSchema = await this.indexManager.hasRequiredSchema();
      if (!hasSchema) {
        await this.indexManager.initializeSchema();
      }
      
      // Background model loading - non-blocking
      this.initializeModelInBackground();
      
    } finally {
      await session.close();
    }
  }

  /**
   * Background model initialization - does not block tool registration
   */
  private initializeModelInBackground(): void {
    // Non-blocking background loading with proper preload handling
    setTimeout(async () => {
      try {
        const config = getVectorConfig();
        if (config.preload) {
          await this.embeddingService.preloadModel();
        }
        
        // Create vector indexes once model is loaded
        const session = this.sessionFactory.createSession();
        try {
          const dimensions = await this.embeddingService.getModelDimensions();
          const vectorIndexManager = new IndexManager(session, dimensions);
          await vectorIndexManager.ensureVectorIndexes();
        } finally {
          await session.close();
        }
      } catch (error) {
        // Silent failure - vector search will work when model loads on demand
      }
    }, MODEL_INITIALIZATION_DELAY);
  }

  async close(): Promise<void> {
    // Clean shutdown sequence
    
    // Close active sessions first
    for (const session of this.activeSessions) {
      try {
        await session.close();
      } catch (error) {
        // Session cleanup error - ignore during shutdown
      }
    }
    this.activeSessions = [];
    
    // Shutdown embedding service
    if (this.embeddingService && typeof this.embeddingService.shutdown === 'function') {
      await this.embeddingService.shutdown();
    }
    
    // Close driver last
    await this.driverManager.close();
  }
}
