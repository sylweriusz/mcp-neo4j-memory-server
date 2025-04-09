import {
  KnowledgeGraphManagerInterface,
  Entity,
  Relation,
  Observation,
  KnowledgeGraph,
} from "./types";
import { Logger, ConsoleLogger } from "./logger";
import neo4j, { Driver, Session, Record, QueryResult } from "neo4j-driver";
import Fuse from "fuse.js";
import { extractError } from "./utils";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

/**
 * An implementation of the KnowledgeGraphManagerInterface that uses Neo4j and Fuse.js
 */
export class Neo4jKnowledgeGraphManager
  implements KnowledgeGraphManagerInterface
{
  private driver: Driver;
  private fuse: Fuse<Entity>;
  private initialized: boolean = false;
  private database: string;
  private logger: Logger;

  /**
   * Constructor
   * @param neo4jConfigProvider Function to get Neo4j connection settings
   * @param logger Optional logger instance
   */
  constructor(
    neo4jConfigProvider: () => {
      uri: string;
      username: string;
      password: string;
      database: string;
    },
    logger?: Logger
  ) {
    const config = neo4jConfigProvider();
    this.database = config.database;
    this.logger = logger || new ConsoleLogger();

    // Neo4j driver initialization
    this.driver = neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.username, config.password)
    );

    // Initialize Fuse.js for fuzzy searching
    this.fuse = new Fuse<Entity>([], {
      keys: ["name", "entityType", "observations"],
      includeScore: true,
      threshold: 0.4, // Search strictness (closer to 0 means more strict)
    });
  }

  /**
   * Get a new session
   * @private
   */
  private getSession(): Session {
    return this.driver.session({ database: this.database });
  }

  /**
   * Initialize the database
   * @private
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const session = this.getSession();

      try {
        // Create constraints and indexes for better performance
        await session.run(`
          CREATE CONSTRAINT IF NOT EXISTS FOR (e:Entity) REQUIRE e.name IS UNIQUE
        `);

        // Build Fuse.js index
        const entities = await this.getAllEntities();
        this.fuse.setCollection(entities);

        this.initialized = true;
        this.logger.info("Neo4j database initialized successfully");
      } catch (error) {
        this.logger.error("Failed to initialize database", extractError(error));
      } finally {
        await session.close();
      }
    } catch (error) {
      this.logger.error("Failed to connect to Neo4j", extractError(error));
    }
  }

  /**
   * Get all entities from the database
   * @private
   */
  private async getAllEntities(): Promise<Entity[]> {
    const session = this.getSession();
    try {
      // Retrieve entities and their observations
      const result = await session.run(`
        MATCH (e:Entity)
        OPTIONAL MATCH (e)-[:HAS_OBSERVATION]->(o:Observation)
        RETURN e.name AS name, e.entityType AS entityType, collect(o.content) AS observations
      `);

      // Convert Neo4j records to Entity objects
      const entities: Entity[] = result.records.map((record: Record) => {
        const name = record.get("name");
        const entityType = record.get("entityType");
        const observations = record.get("observations").filter(Boolean); // Remove null values

        return {
          name,
          entityType,
          observations,
        };
      });

      return entities;
    } catch (error) {
      this.logger.error("Error getting all entities", extractError(error));
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * Create entities
   * @param entities Array of entities to create
   * @returns Array of created entities
   */
  async createEntities(entities: Entity[]): Promise<Entity[]> {
    if (!this.initialized) await this.initialize();

    if (entities.length === 0) return [];

    const session = this.getSession();
    const createdEntities: Entity[] = [];

    try {
      // Begin transaction
      const tx = session.beginTransaction();

      try {
        // Get existing entity names
        const existingNamesResult = await tx.run(`
          MATCH (e:Entity)
          RETURN e.name AS name
        `);
        const existingNames = new Set(
          existingNamesResult.records.map((record) => record.get("name"))
        );

        // Filter new entities
        const newEntities = entities.filter(
          (entity) => !existingNames.has(entity.name)
        );

        // Process each new entity
        for (const entity of newEntities) {
          // Create entity node
          await tx.run(
            `
            CREATE (e:Entity {name: $name, entityType: $entityType})
            RETURN e
            `,
            { name: entity.name, entityType: entity.entityType }
          );

          // Create observation nodes and relationships
          for (const observation of entity.observations) {
            await tx.run(
              `
              MATCH (e:Entity {name: $entityName})
              CREATE (o:Observation {content: $content})
              CREATE (e)-[:HAS_OBSERVATION]->(o)
              `,
              { entityName: entity.name, content: observation }
            );
          }

          createdEntities.push(entity);
        }

        // Commit transaction
        await tx.commit();
      } catch (error) {
        await tx.rollback();
        throw error;
      }

      // Update Fuse.js index
      const allEntities = await this.getAllEntities();
      this.fuse.setCollection(allEntities);

      return createdEntities;
    } catch (error) {
      this.logger.error("Error creating entities", extractError(error));
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Create relations
   * @param relations Array of relations to create
   * @returns Array of created relations
   */
  async createRelations(relations: Relation[]): Promise<Relation[]> {
    if (!this.initialized) await this.initialize();

    if (relations.length === 0) return [];

    const session = this.getSession();
    const createdRelations: Relation[] = [];

    try {
      // Begin transaction
      const tx = session.beginTransaction();

      try {
        // Get all entity names
        const entityNamesResult = await tx.run(`
          MATCH (e:Entity)
          RETURN e.name AS name
        `);
        const entityNames = new Set(
          entityNamesResult.records.map((record) => record.get("name"))
        );

        // Filter valid relations (both from and to entities must exist)
        const validRelations = relations.filter(
          (relation) =>
            entityNames.has(relation.from) && entityNames.has(relation.to)
        );

        // Check for existing relations to avoid duplicates
        for (const relation of validRelations) {
          const existingRelationResult = await tx.run(
            `
            MATCH (from:Entity {name: $fromName})-[r:RELATES_TO {relationType: $relationType}]->(to:Entity {name: $toName})
            RETURN count(r) AS count
            `,
            {
              fromName: relation.from,
              toName: relation.to,
              relationType: relation.relationType,
            }
          );

          const count = existingRelationResult.records[0].get("count").toNumber();

          // Only create if relation doesn't exist
          if (count === 0) {
            await tx.run(
              `
              MATCH (from:Entity {name: $fromName})
              MATCH (to:Entity {name: $toName})
              CREATE (from)-[:RELATES_TO {relationType: $relationType}]->(to)
              `,
              {
                fromName: relation.from,
                toName: relation.to,
                relationType: relation.relationType,
              }
            );
            createdRelations.push(relation);
          }
        }

        // Commit transaction
        await tx.commit();
      } catch (error) {
        await tx.rollback();
        throw error;
      }

      return createdRelations;
    } catch (error) {
      this.logger.error("Error creating relations", extractError(error));
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Add observations to entities
   * @param observations Array of observations to add
   * @returns Array of added observations
   */
  async addObservations(
    observations: Array<Observation>
  ): Promise<Observation[]> {
    if (!this.initialized) await this.initialize();

    if (observations.length === 0) return [];

    const session = this.getSession();
    const addedObservations: Observation[] = [];

    try {
      // Begin transaction
      const tx = session.beginTransaction();

      try {
        // Process each observation set
        for (const observation of observations) {
          // Check if entity exists
          const entityResult = await tx.run(
            `
            MATCH (e:Entity {name: $entityName})
            RETURN e
            `,
            { entityName: observation.entityName }
          );

          // Skip if entity doesn't exist
          if (entityResult.records.length === 0) continue;

          // Get existing observations for this entity
          const existingObsResult = await tx.run(
            `
            MATCH (e:Entity {name: $entityName})-[:HAS_OBSERVATION]->(o:Observation)
            RETURN o.content AS content
            `,
            { entityName: observation.entityName }
          );
          const existingObservations = new Set(
            existingObsResult.records.map((record) => record.get("content"))
          );

          // Filter new observations
          const newContents = observation.contents.filter(
            (content) => !existingObservations.has(content)
          );

          // Add new observations
          if (newContents.length > 0) {
            for (const content of newContents) {
              await tx.run(
                `
                MATCH (e:Entity {name: $entityName})
                CREATE (o:Observation {content: $content})
                CREATE (e)-[:HAS_OBSERVATION]->(o)
                `,
                { entityName: observation.entityName, content }
              );
            }

            addedObservations.push({
              entityName: observation.entityName,
              contents: newContents,
            });
          }
        }

        // Commit transaction
        await tx.commit();
      } catch (error) {
        await tx.rollback();
        throw error;
      }

      // Update Fuse.js index
      const allEntities = await this.getAllEntities();
      this.fuse.setCollection(allEntities);

      return addedObservations;
    } catch (error) {
      this.logger.error("Error adding observations", extractError(error));
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Delete entities
   * @param entityNames Array of entity names to delete
   */
  async deleteEntities(entityNames: string[]): Promise<void> {
    if (!this.initialized) await this.initialize();

    if (entityNames.length === 0) return;

    const session = this.getSession();

    try {
      // Begin transaction
      const tx = session.beginTransaction();

      try {
        // Delete entities and their relationships (Neo4j cascade)
        for (const entityName of entityNames) {
          // Delete observations
          await tx.run(
            `
            MATCH (e:Entity {name: $entityName})-[:HAS_OBSERVATION]->(o:Observation)
            DETACH DELETE o
            `,
            { entityName }
          );

          // Delete relations
          await tx.run(
            `
            MATCH (e:Entity {name: $entityName})-[r:RELATES_TO]-()
            DELETE r
            `,
            { entityName }
          );

          await tx.run(
            `
            MATCH ()-[r:RELATES_TO]->(e:Entity {name: $entityName})
            DELETE r
            `,
            { entityName }
          );

          // Delete entity
          await tx.run(
            `
            MATCH (e:Entity {name: $entityName})
            DELETE e
            `,
            { entityName }
          );
        }

        // Commit transaction
        await tx.commit();
      } catch (error) {
        await tx.rollback();
        throw error;
      }

      // Update Fuse.js index
      const allEntities = await this.getAllEntities();
      this.fuse.setCollection(allEntities);
    } catch (error) {
      this.logger.error("Error deleting entities", extractError(error));
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Delete observations from entities
   * @param deletions Array of observations to delete
   */
  async deleteObservations(deletions: Array<Observation>): Promise<void> {
    if (!this.initialized) await this.initialize();

    if (deletions.length === 0) return;

    const session = this.getSession();

    try {
      // Begin transaction
      const tx = session.beginTransaction();

      try {
        // Process each deletion
        for (const deletion of deletions) {
          if (deletion.contents.length > 0) {
            for (const content of deletion.contents) {
              await tx.run(
                `
                MATCH (e:Entity {name: $entityName})-[:HAS_OBSERVATION]->(o:Observation {content: $content})
                DETACH DELETE o
                `,
                { entityName: deletion.entityName, content }
              );
            }
          }
        }

        // Commit transaction
        await tx.commit();
      } catch (error) {
        await tx.rollback();
        throw error;
      }

      // Update Fuse.js index
      const allEntities = await this.getAllEntities();
      this.fuse.setCollection(allEntities);
    } catch (error) {
      this.logger.error("Error deleting observations", extractError(error));
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Delete relations
   * @param relations Array of relations to delete
   */
  async deleteRelations(relations: Relation[]): Promise<void> {
    if (!this.initialized) await this.initialize();

    if (relations.length === 0) return;

    const session = this.getSession();

    try {
      // Begin transaction
      const tx = session.beginTransaction();

      try {
        // Delete each relation
        for (const relation of relations) {
          await tx.run(
            `
            MATCH (from:Entity {name: $fromName})-[r:RELATES_TO {relationType: $relationType}]->(to:Entity {name: $toName})
            DELETE r
            `,
            {
              fromName: relation.from,
              toName: relation.to,
              relationType: relation.relationType,
            }
          );
        }

        // Commit transaction
        await tx.commit();
      } catch (error) {
        await tx.rollback();
        throw error;
      }
    } catch (error) {
      this.logger.error("Error deleting relations", extractError(error));
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Search for entities
   * @param query Search query
   * @returns Knowledge graph with matching entities and their relations
   */
  async searchNodes(query: string): Promise<KnowledgeGraph> {
    if (!this.initialized) await this.initialize();

    if (!query || query.trim() === "") {
      return { entities: [], relations: [] };
    }

    // Get all entities for fuzzy search
    const allEntities = await this.getAllEntities();

    // Update Fuse.js collection
    this.fuse.setCollection(allEntities);

    // Execute search
    const results = this.fuse.search(query);

    // Extract entities from search results (remove duplicates)
    const uniqueEntities = new Map<string, Entity>();
    for (const result of results) {
      if (!uniqueEntities.has(result.item.name)) {
        uniqueEntities.set(result.item.name, result.item);
      }
    }

    const entities = Array.from(uniqueEntities.values());
    const entityNames = entities.map((entity) => entity.name);

    if (entityNames.length === 0) {
      return { entities: [], relations: [] };
    }

    const session = this.getSession();
    try {
      // Create a parameter with all entity names
      const params = { names: entityNames };

      // Get related relations
      const relationsResult = await session.run(
        `
        MATCH (from:Entity)-[r:RELATES_TO]->(to:Entity)
        WHERE from.name IN $names OR to.name IN $names
        RETURN from.name AS fromName, to.name AS toName, r.relationType AS relationType
        `,
        params
      );

      // Convert results to an array of Relation objects
      const relations = relationsResult.records.map((record) => {
        return {
          from: record.get("fromName"),
          to: record.get("toName"),
          relationType: record.get("relationType"),
        };
      });

      return {
        entities,
        relations,
      };
    } catch (error) {
      this.logger.error("Error searching nodes", extractError(error));
      return { entities: [], relations: [] };
    } finally {
      await session.close();
    }
  }

  /**
   * Read the entire knowledge graph
   * @returns The complete knowledge graph
   */
  async readGraph(): Promise<KnowledgeGraph> {
    if (!this.initialized) await this.initialize();

    // Get all entities
    const entities = await this.getAllEntities();

    const session = this.getSession();
    try {
      // Get all relations
      const relationsResult = await session.run(
        `
        MATCH (from:Entity)-[r:RELATES_TO]->(to:Entity)
        RETURN from.name AS fromName, to.name AS toName, r.relationType AS relationType
        `
      );

      // Convert results to an array of Relation objects
      const relations = relationsResult.records.map((record) => {
        return {
          from: record.get("fromName"),
          to: record.get("toName"),
          relationType: record.get("relationType"),
        };
      });

      return {
        entities,
        relations,
      };
    } catch (error) {
      this.logger.error("Error reading graph", extractError(error));
      return { entities: [], relations: [] };
    } finally {
      await session.close();
    }
  }

  /**
   * Get entities by name
   * @param names Array of entity names
   * @returns Knowledge graph with matching entities and their relations
   */
  async openNodes(names: string[]): Promise<KnowledgeGraph> {
    if (!this.initialized) await this.initialize();

    if (names.length === 0) {
      return { entities: [], relations: [] };
    }

    const session = this.getSession();
    try {
      // Retrieve entities and their observations
      const entitiesResult = await session.run(
        `
        MATCH (e:Entity)
        WHERE e.name IN $names
        OPTIONAL MATCH (e)-[:HAS_OBSERVATION]->(o:Observation)
        RETURN e.name AS name, e.entityType AS entityType, collect(o.content) AS observations
        `,
        { names }
      );

      // Convert Neo4j records to Entity objects
      const entities: Entity[] = entitiesResult.records.map((record) => {
        const name = record.get("name");
        const entityType = record.get("entityType");
        const observations = record.get("observations").filter(Boolean);

        return {
          name,
          entityType,
          observations,
        };
      });

      // Get related relations
      const relationsResult = await session.run(
        `
        MATCH (from:Entity)-[r:RELATES_TO]->(to:Entity)
        WHERE from.name IN $names OR to.name IN $names
        RETURN from.name AS fromName, to.name AS toName, r.relationType AS relationType
        `,
        { names }
      );

      // Convert results to an array of Relation objects
      const relations = relationsResult.records.map((record) => {
        return {
          from: record.get("fromName"),
          to: record.get("toName"),
          relationType: record.get("relationType"),
        };
      });

      return {
        entities,
        relations,
      };
    } catch (error) {
      this.logger.error("Error opening nodes", extractError(error));
      return { entities: [], relations: [] };
    } finally {
      await session.close();
    }
  }

  /**
   * Close the connection to Neo4j
   */
  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
    }
  }
}
