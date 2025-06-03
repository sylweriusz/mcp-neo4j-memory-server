/**
 * Dependency Injection Container - Clean Architecture Complete
 * Single responsibility: Wire up all dependencies with clean database management
 * GDD v2.1.3: Enhanced with session injection for memory operations
 */

import { Neo4jDriverManager, SessionFactory, IndexManager, CleanDatabaseManager } from '../infrastructure/database';
import { Neo4jMemoryRepository } from '../infrastructure/repositories/neo4j-memory-repository';
import { Neo4jSearchRepository } from '../infrastructure/repositories/neo4j-search-repository';
import { CreateMemoryUseCase } from '../application/use-cases/create-memory';
import { SearchMemoriesUseCase } from '../application/use-cases/search-memories';
import { UpdateMemoryUseCase } from '../application/use-cases/update-memory';
import { DeleteMemoryUseCase } from '../application/use-cases/delete-memory';
import { ManageObservationsUseCase } from '../application/use-cases/manage-observations';
import { ManageRelationsUseCase } from '../application/use-cases/manage-relations';
import { XenovaEmbeddingService } from '../infrastructure/services/embedding-service';
import { TruthFirstSearchOrchestrator } from '../infrastructure/services/search';

export class DIContainer {
  private static instance: DIContainer;
  
  // Infrastructure
  private driverManager!: Neo4jDriverManager;
  private sessionFactory!: SessionFactory;
  private indexManager!: IndexManager;
  private databaseManager!: CleanDatabaseManager;
  
  // Services
  private embeddingService!: XenovaEmbeddingService;
  private searchOrchestrator!: TruthFirstSearchOrchestrator;
  
  // Repositories
  private memoryRepository!: Neo4jMemoryRepository;
  private searchRepository!: Neo4jSearchRepository;
  
  // Use Cases
  private createMemoryUseCase!: CreateMemoryUseCase;
  private searchMemoriesUseCase!: SearchMemoriesUseCase;
  private updateMemoryUseCase!: UpdateMemoryUseCase;
  private deleteMemoryUseCase!: DeleteMemoryUseCase;
  private manageObservationsUseCase!: ManageObservationsUseCase;
  private manageRelationsUseCase!: ManageRelationsUseCase;

  // Session tracking for cleanup (GDD v2.0.13)
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
    
    // Initialize search orchestrator with clean session
    const searchSession = this.sessionFactory.createSession();
    this.activeSessions.push(searchSession);
    this.searchOrchestrator = new TruthFirstSearchOrchestrator(searchSession);
  }

  private initializeRepositories(): void {
    this.memoryRepository = new Neo4jMemoryRepository(this.sessionFactory);
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

  getSearchOrchestrator(): TruthFirstSearchOrchestrator {
    return this.searchOrchestrator;
  }

  getDatabaseManager(): CleanDatabaseManager {
    return this.databaseManager;
  }

  getMemoryRepository(): Neo4jMemoryRepository {
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
    const session = this.sessionFactory.createSession();
    this.indexManager = new IndexManager(session);
    
    try {
      // Pre-download embedding model to ensure it's available
      await this.embeddingService.preloadModel();
      
      const hasSchema = await this.indexManager.hasRequiredSchema();
      if (!hasSchema) {
        await this.indexManager.initializeSchema();
      }
    } finally {
      await session.close();
    }
  }

  async close(): Promise<void> {
    // Clean shutdown sequence (GDD v2.0.13: Cleanup active sessions)
    
    // Close active sessions first
    for (const session of this.activeSessions) {
      try {
        await session.close();
      } catch (error) {
        console.warn("[DIContainer] Session cleanup error:", error);
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
