/**
 * Environment Configuration Management
 * Single source of truth for all environment variables
 * Note: dotenv.config() is called in main index.ts before any imports
 */

export interface EnvironmentConfig {
  neo4j: {
    uri: string;
    username: string;
    password: string;
    database: string;
  };
  logging: {
    level: string;
  };
  vector: {
    modelName: string;
    dimensions: number;
  };
}

/**
 * Validates and returns environment configuration
 * Fails fast if required environment variables are missing
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  // Debug environment variables at runtime

  const requiredVars = [
    'NEO4J_URI',
    'NEO4J_USERNAME', 
    'NEO4J_PASSWORD'
    // NEO4J_DATABASE is optional - defaults to 'neo4j' if not provided
  ];

  // Validate required environment variables
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      throw new Error(`Required environment variable ${varName} is not set`);
    }
  }

  return {
    neo4j: {
      uri: process.env.NEO4J_URI!,
      username: process.env.NEO4J_USERNAME!,
      password: process.env.NEO4J_PASSWORD!,
      database: process.env.NEO4J_DATABASE || 'neo4j', // Default to 'neo4j' if not provided
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info',
    },
    vector: {
      modelName: process.env.VECTOR_MODEL || 'sentence-transformers/multilingual-e5-base', // 'sentence-transformers/all-MiniLM-L6-v2',
      dimensions: parseInt(process.env.VECTOR_DIMENSIONS || '768', 10),
    },
  };
}

/**
 * Get Neo4j configuration specifically
 * Used by database components
 */
export function getNeo4jConfig() {
  const config = getEnvironmentConfig();
  return config.neo4j;
}

/**
 * Get Vector configuration specifically  
 * Used by vector processing components
 */
export function getVectorConfig() {
  const config = getEnvironmentConfig();
  return config.vector;
}
