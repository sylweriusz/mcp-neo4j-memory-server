/**
 * Context Level Processor
 * Single responsibility: Control response detail based on context level
 * THE IMPLEMENTOR'S RULE: Strip exactly what's not needed for each context level
 */

export type ContextLevel = "minimal" | "full" | "relations-only";

export interface MemoryResult {
  id: string;
  name: string;
  memoryType: string;
  score?: number;
  observations?: Array<{id?: string, content: string, createdAt: string}>;
  metadata?: Record<string, any>;
  createdAt?: string;
  modifiedAt?: string;
  lastAccessed?: string;
  related?: {
    ancestors?: any[];
    descendants?: any[];
  };
}

export class ContextLevelProcessor {
  
  /**
   * Apply context level filtering to memory results
   * Zero-fallback: Each level strips exactly what it should
   */
  applyContextLevel(results: MemoryResult[], contextLevel: ContextLevel = "full"): MemoryResult[] {
    switch (contextLevel) {
      case "minimal":
        return this.applyMinimalContext(results);
      case "relations-only":
        return this.applyRelationsOnlyContext(results);
      case "full":
      default:
        return results; // Return everything for full context
    }
  }

  /**
   * Minimal context: Only id, name, memoryType, score
   * Used for lists and quick references
   */
  private applyMinimalContext(results: MemoryResult[]): MemoryResult[] {
    return results.map(result => ({
      id: result.id,
      name: result.name,
      memoryType: result.memoryType,
      ...(result.score !== undefined && { score: result.score })
    }));
  }

  /**
   * Relations-only context: Only id, name, memoryType, and related context
   * Used for graph analysis
   */
  private applyRelationsOnlyContext(results: MemoryResult[]): MemoryResult[] {
    return results.map(result => ({
      id: result.id,
      name: result.name,
      memoryType: result.memoryType,
      ...(result.score !== undefined && { score: result.score }),
      ...(result.related && { related: result.related })
    }));
  }

  /**
   * Validate context level parameter
   */
  validateContextLevel(contextLevel: string): ContextLevel {
    const validLevels: ContextLevel[] = ["minimal", "full", "relations-only"];
    
    if (!validLevels.includes(contextLevel as ContextLevel)) {
      throw new Error(`Invalid context level: ${contextLevel}. Valid options: ${validLevels.join(', ')}`);
    }
    
    return contextLevel as ContextLevel;
  }

  /**
   * Get context level description for user guidance
   */
  getContextLevelDescription(contextLevel: ContextLevel): string {
    switch (contextLevel) {
      case "minimal":
        return "Only id, name, memoryType, score (for lists and quick references)";
      case "full":
        return "Complete memory data with observations and graph context (default)";
      case "relations-only":
        return "Only id, name, memoryType, and related context (graph analysis)";
    }
  }
}
