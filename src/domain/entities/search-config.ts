/**
 * Search configuration domain entity
 * Single responsibility: search behavior configuration
 */
export interface SearchScoreWeights {
  vector: number;
  metadataExact: number;
  metadataFulltext: number;
  tags: number;
}

export interface SearchConfig {
  weights: SearchScoreWeights;
  threshold: number;
  maxGraphDepth: number;
  maxRelatedItems: number;
}

export const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  weights: {
    vector: 0.5,
    metadataExact: 0.25,
    metadataFulltext: 0.15,
    tags: 0.1
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
  // Enhanced relationship metadata (GDD v2.1.1+)
  strength?: number;      // 0.0-1.0
  context?: string[];     // Domain contexts
  source?: string;        // "agent" | "user" | "system"
  createdAt?: string;     // ISO timestamp
}

export interface EnhancedSearchResult {
  id: string;
  name: string;
  type: string;
  observations: Array<{content: string, createdAt: string}>;
  tags: string[];
  metadata: Record<string, any>;
  related?: {
    ancestors?: RelatedMemory[];
    descendants?: RelatedMemory[];
  };
  score?: number;
}
