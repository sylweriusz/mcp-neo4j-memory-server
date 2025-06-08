/**
 * Unified Configuration Export
 * Single import point for all configuration modules
 */

export { 
  getEnvironmentConfig,
  getNeo4jConfig, 
  getVectorConfig,
  getLimitsConfig,
  type EnvironmentConfig 
} from './environment';
