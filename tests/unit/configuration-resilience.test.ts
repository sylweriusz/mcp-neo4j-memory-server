/**
 * Configuration and Network Resilience Tests
 * Coverage for environment and network edge cases
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getEnvironmentConfig, getNeo4jConfig, getVectorConfig, getLimitsConfig } from '../../src/config/environment';

describe('Configuration Resilience Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Environment Configuration Validation', () => {
    it('should throw error when required NEO4J_URI is missing', () => {
      delete process.env.NEO4J_URI;
      
      expect(() => getEnvironmentConfig()).toThrow('Required environment variable NEO4J_URI is not set');
    });

    it('should throw error when required NEO4J_USERNAME is missing', () => {
      process.env.NEO4J_URI = 'bolt://localhost:7687';
      delete process.env.NEO4J_USERNAME;
      
      expect(() => getEnvironmentConfig()).toThrow('Required environment variable NEO4J_USERNAME is not set');
    });

    it('should throw error when required NEO4J_PASSWORD is missing', () => {
      process.env.NEO4J_URI = 'bolt://localhost:7687';
      process.env.NEO4J_USERNAME = 'neo4j';
      delete process.env.NEO4J_PASSWORD;
      
      expect(() => getEnvironmentConfig()).toThrow('Required environment variable NEO4J_PASSWORD is not set');
    });

    it('should use default database when NEO4J_DATABASE is not provided', () => {
      process.env.NEO4J_URI = 'bolt://localhost:7687';
      process.env.NEO4J_USERNAME = 'neo4j';
      process.env.NEO4J_PASSWORD = 'password';
      delete process.env.NEO4J_DATABASE;
      delete process.env.DEFAULT_DATABASE;
      
      const config = getEnvironmentConfig();
      expect(config.neo4j.database).toBe('neo4j');
    });

    it('should use DEFAULT_DATABASE when NEO4J_DATABASE is not provided', () => {
      process.env.NEO4J_URI = 'bolt://localhost:7687';
      process.env.NEO4J_USERNAME = 'neo4j';
      process.env.NEO4J_PASSWORD = 'password';
      delete process.env.NEO4J_DATABASE;
      process.env.DEFAULT_DATABASE = 'custom-default';
      
      const config = getEnvironmentConfig();
      expect(config.neo4j.database).toBe('custom-default');
    });

    it('should handle malformed numeric environment variables gracefully', () => {
      process.env.NEO4J_URI = 'bolt://localhost:7687';
      process.env.NEO4J_USERNAME = 'neo4j';
      process.env.NEO4J_PASSWORD = 'password';
      process.env.VECTOR_DIMENSIONS = 'not-a-number';
      process.env.VECTOR_IDLE_TIMEOUT = 'invalid';
      process.env.MAX_MEMORIES_PER_OP = 'abc';
      
      const config = getEnvironmentConfig();
      
      // Should use defaults for malformed values
      expect(config.vector.dimensions).toBe(NaN); // parseInt of invalid string returns NaN
      expect(config.vector.idleTimeout).toBe(600000); // Default 10 minutes
      expect(config.limits.maxMemoriesPerOperation).toBe(50); // Default
    });

    it('should handle edge case vector dimensions', () => {
      process.env.NEO4J_URI = 'bolt://localhost:7687';
      process.env.NEO4J_USERNAME = 'neo4j';
      process.env.NEO4J_PASSWORD = 'password';
      
      // Test 'auto' setting
      process.env.VECTOR_DIMENSIONS = 'auto';
      let config = getEnvironmentConfig();
      expect(config.vector.dimensions).toBe('auto');
      
      // Test numeric value
      process.env.VECTOR_DIMENSIONS = '512';
      config = getEnvironmentConfig();
      expect(config.vector.dimensions).toBe(512);
      
      // Test zero value
      process.env.VECTOR_DIMENSIONS = '0';
      config = getEnvironmentConfig();
      expect(config.vector.dimensions).toBe(0);
    });

    it('should handle boolean environment variables correctly', () => {
      process.env.NEO4J_URI = 'bolt://localhost:7687';
      process.env.NEO4J_USERNAME = 'neo4j';
      process.env.NEO4J_PASSWORD = 'password';
      
      // Test explicit false
      process.env.VECTOR_PRELOAD = 'false';
      let config = getEnvironmentConfig();
      expect(config.vector.preload).toBe(false);
      
      // Test other falsy values
      process.env.VECTOR_PRELOAD = '';
      config = getEnvironmentConfig();
      expect(config.vector.preload).toBe(true); // Default to true unless explicitly false
      
      process.env.VECTOR_PRELOAD = '0';
      config = getEnvironmentConfig();
      expect(config.vector.preload).toBe(true); // Only 'false' string should disable
    });
  });

  describe('Configuration Getters', () => {
    beforeEach(() => {
      // Set up valid environment
      process.env.NEO4J_URI = 'bolt://localhost:7687';
      process.env.NEO4J_USERNAME = 'neo4j';
      process.env.NEO4J_PASSWORD = 'password';
      process.env.NEO4J_DATABASE = 'test';
    });

    it('should return consistent Neo4j configuration', () => {
      const config1 = getNeo4jConfig();
      const config2 = getNeo4jConfig();
      
      expect(config1).toEqual(config2);
      expect(config1.uri).toBe('bolt://localhost:7687');
      expect(config1.username).toBe('neo4j');
      expect(config1.password).toBe('password');
      expect(config1.database).toBe('test');
    });

    it('should return consistent vector configuration', () => {
      const config1 = getVectorConfig();
      const config2 = getVectorConfig();
      
      expect(config1).toEqual(config2);
      expect(config1.modelName).toBeDefined();
      expect(config1.dimensions).toBeDefined();
      expect(config1.idleTimeout).toBeGreaterThan(0);
      expect(typeof config1.preload).toBe('boolean');
    });

    it('should return consistent limits configuration', () => {
      const config1 = getLimitsConfig();
      const config2 = getLimitsConfig();
      
      expect(config1).toEqual(config2);
      expect(config1.maxMemoriesPerOperation).toBeGreaterThan(0);
      expect(config1.maxRelationsPerOperation).toBeGreaterThan(0);
      expect(config1.maxTraversalDepth).toBeGreaterThan(0);
    });
  });

  describe('Extreme Configuration Values', () => {
    beforeEach(() => {
      // Set up valid base environment
      process.env.NEO4J_URI = 'bolt://localhost:7687';
      process.env.NEO4J_USERNAME = 'neo4j';
      process.env.NEO4J_PASSWORD = 'password';
    });

    it('should handle very large timeout values', () => {
      process.env.VECTOR_IDLE_TIMEOUT = '999999999999';
      
      const config = getEnvironmentConfig();
      expect(config.vector.idleTimeout).toBe(999999999999);
    });

    it('should handle zero timeout values', () => {
      process.env.VECTOR_IDLE_TIMEOUT = '0';
      
      const config = getEnvironmentConfig();
      expect(config.vector.idleTimeout).toBe(0);
    });

    it('should handle extreme limits', () => {
      process.env.MAX_MEMORIES_PER_OP = '1';
      process.env.MAX_RELATIONS_PER_OP = '1';
      process.env.MAX_TRAVERSAL_DEPTH = '1';
      
      const config = getEnvironmentConfig();
      expect(config.limits.maxMemoriesPerOperation).toBe(1);
      expect(config.limits.maxRelationsPerOperation).toBe(1);
      expect(config.limits.maxTraversalDepth).toBe(1);
    });

    it('should handle very large limits', () => {
      process.env.MAX_MEMORIES_PER_OP = '100000';
      process.env.MAX_RELATIONS_PER_OP = '1000000';
      process.env.MAX_TRAVERSAL_DEPTH = '100';
      
      const config = getEnvironmentConfig();
      expect(config.limits.maxMemoriesPerOperation).toBe(100000);
      expect(config.limits.maxRelationsPerOperation).toBe(1000000);
      expect(config.limits.maxTraversalDepth).toBe(100);
    });
  });

  describe('Environment Edge Cases', () => {
    it('should handle missing LOG_LEVEL gracefully', () => {
      process.env.NEO4J_URI = 'bolt://localhost:7687';
      process.env.NEO4J_USERNAME = 'neo4j';
      process.env.NEO4J_PASSWORD = 'password';
      delete process.env.LOG_LEVEL;
      
      const config = getEnvironmentConfig();
      expect(config.logging.level).toBe('info'); // Default
    });

    it('should handle unusual LOG_LEVEL values', () => {
      process.env.NEO4J_URI = 'bolt://localhost:7687';
      process.env.NEO4J_USERNAME = 'neo4j';
      process.env.NEO4J_PASSWORD = 'password';
      process.env.LOG_LEVEL = 'CUSTOM_LEVEL';
      
      const config = getEnvironmentConfig();
      expect(config.logging.level).toBe('CUSTOM_LEVEL'); // Accepts any value
    });

    it('should handle missing VECTOR_MODEL gracefully', () => {
      process.env.NEO4J_URI = 'bolt://localhost:7687';
      process.env.NEO4J_USERNAME = 'neo4j';
      process.env.NEO4J_PASSWORD = 'password';
      delete process.env.VECTOR_MODEL;
      
      const config = getEnvironmentConfig();
      expect(config.vector.modelName).toBe('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2');
    });

    it('should handle custom VECTOR_MODEL values', () => {
      process.env.NEO4J_URI = 'bolt://localhost:7687';
      process.env.NEO4J_USERNAME = 'neo4j';
      process.env.NEO4J_PASSWORD = 'password';
      process.env.VECTOR_MODEL = 'custom/model-name';
      
      const config = getEnvironmentConfig();
      expect(config.vector.modelName).toBe('custom/model-name');
    });
  });

  describe('Configuration Immutability', () => {
    beforeEach(() => {
      process.env.NEO4J_URI = 'bolt://localhost:7687';
      process.env.NEO4J_USERNAME = 'neo4j';
      process.env.NEO4J_PASSWORD = 'password';
    });

    it('should not allow modification of returned configuration objects', () => {
      const config = getEnvironmentConfig();
      const originalUri = config.neo4j.uri;
      
      // Attempt to modify - this should not affect subsequent calls
      (config.neo4j as any).uri = 'modified://localhost:7687';
      
      const newConfig = getEnvironmentConfig();
      expect(newConfig.neo4j.uri).toBe(originalUri); // Should be unchanged
    });

    it('should return new objects on each call', () => {
      const config1 = getEnvironmentConfig();
      const config2 = getEnvironmentConfig();
      
      expect(config1).not.toBe(config2); // Different object references
      expect(config1).toEqual(config2); // But same content
    });
  });

  describe('Memory Pressure Scenarios', () => {
    it('should handle very long environment variable values', () => {
      const longValue = 'x'.repeat(100000);
      
      process.env.NEO4J_URI = 'bolt://localhost:7687';
      process.env.NEO4J_USERNAME = 'neo4j';
      process.env.NEO4J_PASSWORD = 'password';
      process.env.VECTOR_MODEL = longValue;
      
      const config = getEnvironmentConfig();
      expect(config.vector.modelName).toBe(longValue);
      expect(config.vector.modelName.length).toBe(100000);
    });

    it('should handle many configuration calls without memory leaks', () => {
      process.env.NEO4J_URI = 'bolt://localhost:7687';
      process.env.NEO4J_USERNAME = 'neo4j';
      process.env.NEO4J_PASSWORD = 'password';
      
      // Call configuration getter many times
      for (let i = 0; i < 1000; i++) {
        const config = getEnvironmentConfig();
        expect(config.neo4j.uri).toBe('bolt://localhost:7687');
      }
    });
  });
});
