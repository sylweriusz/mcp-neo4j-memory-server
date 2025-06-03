/**
 * Exact Search Channel - Truth-First Architecture  
 * Single responsibility: Case-insensitive exact matching
 * Performance target: <100ms (GDD v2.3.1)
 * GDD v2.3.1: FIXED to use actual FULLTEXT indexes instead of bypassing them
 */

import { Session } from 'neo4j-driver';
import neo4j from 'neo4j-driver';

export interface ExactMatchCandidate {
  id: string;
  name: string;
  metadata: Record<string, any>;
  matchTypes: {
    exactMetadata: boolean;
    exactName: boolean;
    exactContent: boolean;
  };
}

export class ExactSearchChannel {
  constructor(private session: Session) {}

  /**
   * Execute exact match search with PROPER FULLTEXT INDEX USAGE
   * GDD v2.3.1: Fixed to use actual FULLTEXT indexes instead of bypassing them
   * Performance target: <100ms (now achievable with proper indexing)
   */
  async search(
    normalizedQuery: string,
    limit: number,
    memoryTypes?: string[]
  ): Promise<ExactMatchCandidate[]> {
    // Strategy: Use FULLTEXT for content, exact matching for structured data
    
    // Step 1: Get FULLTEXT candidates for metadata and observations
    const fulltextCandidates = await this.searchFulltext(normalizedQuery, limit, memoryTypes);
    
    // Step 2: Get exact name matches (case-insensitive)  
    const nameMatches = await this.searchExactName(normalizedQuery, limit, memoryTypes);
    
    // Step 3: Combine and deduplicate - memory type filtering already applied at Cypher level
    const candidateMap = new Map<string, ExactMatchCandidate>();
    
    // Add name matches first (highest priority)
    for (const candidate of nameMatches) {
      candidateMap.set(candidate.id, candidate);
    }
    
    // Add fulltext matches (merge match types if already exists)
    for (const candidate of fulltextCandidates) {
      if (candidateMap.has(candidate.id)) {
        const existing = candidateMap.get(candidate.id)!;
        existing.matchTypes.exactMetadata = existing.matchTypes.exactMetadata || candidate.matchTypes.exactMetadata;
        existing.matchTypes.exactContent = existing.matchTypes.exactContent || candidate.matchTypes.exactContent;
      } else {
        candidateMap.set(candidate.id, candidate);
      }
    }
    
    // Get results - no post-filtering needed, Cypher handles it
    const results = Array.from(candidateMap.values());
    
    // Sort by match priority: name > metadata > content
    results.sort((a, b) => {
      const scoreA = (a.matchTypes.exactName ? 3 : 0) + 
                    (a.matchTypes.exactMetadata ? 2 : 0) + 
                    (a.matchTypes.exactContent ? 1 : 0);
      const scoreB = (b.matchTypes.exactName ? 3 : 0) + 
                    (b.matchTypes.exactMetadata ? 2 : 0) + 
                    (b.matchTypes.exactContent ? 1 : 0);
      return scoreB - scoreA;
    });
    
    return results.slice(0, limit);
  }

  /**
   * Search using FULLTEXT indexes (metadata and observations)
   * THE FIX: Actually use the indexes we created instead of bypassing them
   * GDD COMPLIANCE: Memory type filtering at Cypher level
   * SAURON EYE FIX: Query sanitization to prevent Lucene ParseException
   */
  private async searchFulltext(
    query: string,
    limit: number,
    memoryTypes?: string[]
  ): Promise<ExactMatchCandidate[]> {
    const candidates: ExactMatchCandidate[] = [];
    
    // SAURON EYE FIX: Sanitize query for Lucene to prevent ParseException
    const sanitizedQuery = this.sanitizeLuceneQuery(query);
    
    try {
      // Build memory type filter for FULLTEXT queries
      let memoryTypeJoin = '';
      if (memoryTypes && memoryTypes.length > 0) {
        memoryTypeJoin = 'WHERE node.memoryType IN $memoryTypes';
      }

      // Search memory metadata using FULLTEXT index with type filtering
      const metadataQuery = `
        CALL db.index.fulltext.queryNodes('memory_metadata_idx', $query)
        YIELD node, score
        ${memoryTypeJoin}
        RETURN node.id as id, 
               node.name as name, 
               node.metadata as metadata,
               score
        LIMIT $limit
      `;
      
      const metadataResult = await this.session.run(metadataQuery, { 
        query: sanitizedQuery, 
        limit: neo4j.int(limit),
        memoryTypes
      });
      
      for (const record of metadataResult.records) {
        candidates.push({
          id: record.get('id'),
          name: record.get('name'),
          metadata: this.parseMetadata(record.get('metadata')),
          matchTypes: {
            exactMetadata: true,
            exactName: false,
            exactContent: false
          }
        });
      }
      
      // Search observation content using FULLTEXT index with type filtering
      const contentQuery = `
        CALL db.index.fulltext.queryNodes('observation_content_idx', $query)
        YIELD node, score
        MATCH (m:Memory)-[:HAS_OBSERVATION]->(node)
        ${memoryTypes && memoryTypes.length > 0 ? 'WHERE m.memoryType IN $memoryTypes' : ''}
        RETURN DISTINCT m.id as id,
                        m.name as name,
                        m.metadata as metadata,
                        score
        LIMIT $limit
      `;
      
      const contentResult = await this.session.run(contentQuery, { 
        query: sanitizedQuery, 
        limit: neo4j.int(limit),
        memoryTypes
      });
      
      for (const record of contentResult.records) {
        const id = record.get('id');
        const existing = candidates.find(c => c.id === id);
        
        if (existing) {
          existing.matchTypes.exactContent = true;
        } else {
          candidates.push({
            id,
            name: record.get('name'),
            metadata: this.parseMetadata(record.get('metadata')),
            matchTypes: {
              exactMetadata: false,
              exactName: false,
              exactContent: true
            }
          });
        }
      }
      
    } catch (error) {
      console.error('[ExactSearchChannel] FULLTEXT index failure - check Neo4j configuration:', error);
      throw new Error(`FULLTEXT search requires proper index configuration. Check that memory_metadata_idx and observation_content_idx indexes exist. Original error: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return candidates;
  }

  /**
   * Search for exact name matches (case-insensitive)
   * Uses regular index, not FULLTEXT (better for exact matching)
   * GDD COMPLIANCE: Memory type filtering at Cypher level
   */
  private async searchExactName(
    normalizedQuery: string,
    limit: number,
    memoryTypes?: string[]
  ): Promise<ExactMatchCandidate[]> {
    let whereClause = 'WHERE toLower(m.name) CONTAINS $query';
    
    if (memoryTypes && memoryTypes.length > 0) {
      whereClause += ' AND m.memoryType IN $memoryTypes';
    }
    
    const cypher = `
      MATCH (m:Memory)
      ${whereClause}
      RETURN m.id as id,
             m.name as name,
             m.metadata as metadata,
             toLower(m.name) = $query as exactNameMatch
      ORDER BY exactNameMatch DESC, m.name
      LIMIT $limit
    `;
    
    const result = await this.session.run(cypher, {
      query: normalizedQuery,
      memoryTypes,
      limit: neo4j.int(limit)
    });

    return result.records.map(record => ({
      id: record.get('id'),
      name: record.get('name'),
      metadata: this.parseMetadata(record.get('metadata')),
      matchTypes: {
        exactMetadata: false,
        exactName: true,
        exactContent: false
      }
    }));
  }

  /**
   * Sanitize query for Lucene FULLTEXT search to prevent ParseException
   * SAURON EYE FIX: Escape special characters that break Lucene parser
   * 
   * Lucene special characters: + - && || ! ( ) { } [ ] ^ " ~ * ? : \
   * These need to be escaped with backslash to be treated as literal characters
   */
  private sanitizeLuceneQuery(query: string): string {
    if (!query || typeof query !== 'string') {
      return '';
    }
    
    // Escape Lucene special characters that cause ParseException
    // Note: We escape these to search for them as literal characters
    return query.replace(/[+\-&|!(){}[\]^"~*?:\\]/g, '\\$&');
  }

  private parseMetadata(metadata: string | null): Record<string, any> {
    if (!metadata) return {};
    try {
      return JSON.parse(metadata);
    } catch {
      return {};
    }
  }
}
