/**
 * Search configuration domain entity
 * Single responsibility: search behavior configuration
 */

export interface VectorSupport {
  gds: boolean;
  inMemory: boolean;
}

export interface SearchScoreWeights {
  vector: number;
  metadataExact: number;
  metadataFulltext: number;
}

export interface SearchConfig {
  weights: SearchScoreWeights;
  threshold: number;
  maxGraphDepth: number;
  maxRelatedItems: number;
}

export const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  weights: {
    vector: 0.55,
    metadataExact: 0.28,
    metadataFulltext: 0.17
  },
  threshold: 0.1,
  maxGraphDepth: 2,
  maxRelatedItems: 3
};

export interface RelatedMemory {
  id: string;
  name: string;
  type: string;
  relation: string;
  distance: number;
  // Enhanced relationship metadata (simplified without context complexity)
  strength?: number;      // 0.0-1.0
  source?: string;        // "agent" | "user" | "system"
  createdAt?: string;     // ISO timestamp
}

export interface EnhancedSearchResult {
  id: string;
  name: string;
  type: string;
  observations: Array<{content: string, createdAt: string}>;
  metadata: Record<string, any>;
  createdAt?: string;      // GDD Section 7.3 requirement
  modifiedAt?: string;     // GDD Section 7.3 requirement  
  lastAccessed?: string;   // GDD Section 7.3 requirement
  related?: {
    ancestors?: RelatedMemory[];
    descendants?: RelatedMemory[];
  };
  score?: number;
}
