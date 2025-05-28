import { Session } from 'neo4j-driver';
import { calculateEmbedding, calculateSimilarity, Vector } from '../../utilities';

interface TagEmbedding {
  tag: string;
  embedding: number[];
}

/**
 * Semantic Tag Deduplication Service
 * Single responsibility: remove duplicate tags using vector similarity
 */
export class TagDeduplicationService {
  private readonly embeddingModelVersion = 'xenova-minilm-l6-v2-v1';

  constructor(private session?: Session) {}

  async deduplicateTags(
    candidates: string[], 
    threshold: number = 0.75
  ): Promise<string[]> {
    if (candidates.length <= 1) return candidates;

    try {
      // Phase 1: Remove exact substring duplicates
      const filteredCandidates = this.removeSubstringDuplicates(candidates);
      
      // Phase 2: Semantic deduplication using embeddings
      if (this.session) {
        return this.semanticDeduplicationWithCache(filteredCandidates, threshold);
      } else {
        return this.semanticDeduplicationDirect(filteredCandidates, threshold);
      }
    } catch (error) {
      console.error('Tag deduplication failed:', error);
      return [...new Set(candidates)]; // Fallback to simple deduplication
    }
  }

  private removeSubstringDuplicates(candidates: string[]): string[] {
    const filtered = [];

    for (const candidate of candidates) {
      const candidateWords = candidate.split(/\s+/);
      let isSubstring = false;

      // Check if this candidate is a substring of any other candidate
      for (const other of candidates) {
        if (candidate !== other && other.includes(candidate)) {
          // If it's a single word and contained in a multi-word phrase, skip it
          if (candidateWords.length === 1 && other.split(/\s+/).length > 1) {
            isSubstring = true;
            break;
          }
        }
      }

      if (!isSubstring) {
        filtered.push(candidate);
      }
    }

    return filtered;
  }

  private async semanticDeduplicationWithCache(
    candidates: string[], 
    threshold: number
  ): Promise<string[]> {
    if (!this.session) {
      throw new Error('Session required for cached deduplication');
    }

    // Get cached embeddings from database
    const embeddingMap = await this.getTagEmbeddings(candidates);
    
    // Calculate embeddings for missing tags
    const missingTags = candidates.filter(tag => !embeddingMap.has(tag));
    if (missingTags.length > 0) {
      await this.cacheTagEmbeddings(missingTags);
      // Refresh embedding map
      const newEmbeddings = await this.getTagEmbeddings(missingTags);
      for (const [tag, embedding] of newEmbeddings) {
        embeddingMap.set(tag, embedding);
      }
    }

    // Perform semantic deduplication
    return this.performSemanticDeduplication(candidates, embeddingMap, threshold);
  }

  private async semanticDeduplicationDirect(
    candidates: string[], 
    threshold: number
  ): Promise<string[]> {
    // Calculate embeddings on the fly
    const tagEmbeddings: TagEmbedding[] = [];
    
    for (const tag of candidates) {
      try {
        const embedding = await calculateEmbedding(tag);
        tagEmbeddings.push({ tag, embedding });
      } catch (error) {
        console.warn(`Failed to calculate embedding for tag: ${tag}`);
      }
    }

    const embeddingMap = new Map(
      tagEmbeddings.map(te => [te.tag, te.embedding])
    );

    return this.performSemanticDeduplication(candidates, embeddingMap, threshold);
  }

  private performSemanticDeduplication(
    candidates: string[],
    embeddingMap: Map<string, number[]>,
    threshold: number
  ): string[] {
    const selected: string[] = [];
    const used = new Set<string>();

    for (const candidate of candidates) {
      if (used.has(candidate)) continue;

      const candidateEmbedding = embeddingMap.get(candidate);
      if (!candidateEmbedding) continue;

      let isDuplicate = false;

      for (const selectedTag of selected) {
        const selectedEmbedding = embeddingMap.get(selectedTag);
        if (!selectedEmbedding) continue;

        const similarity = calculateSimilarity(candidateEmbedding, selectedEmbedding);
        if (similarity > threshold) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        selected.push(candidate);
        used.add(candidate);
      }
    }

    return selected;
  }

  private async getTagEmbeddings(tags: string[]): Promise<Map<string, number[]>> {
    if (!this.session) {
      throw new Error('Session required for cached embeddings');
    }

    const result = await this.session.run(
      `MATCH (te:TagEmbedding)
       WHERE te.tag IN $tags AND te.modelVersion = $modelVersion
       RETURN te.tag as tag, te.embedding as embedding`,
      { tags, modelVersion: this.embeddingModelVersion }
    );

    const embeddingMap = new Map<string, number[]>();
    for (const record of result.records) {
      embeddingMap.set(record.get('tag'), record.get('embedding'));
    }

    return embeddingMap;
  }

  private async cacheTagEmbeddings(tags: string[]): Promise<void> {
    if (!this.session) {
      throw new Error('Session required for caching embeddings');
    }

    const tx = this.session.beginTransaction();
    try {
      for (const tag of tags) {
        const embedding = await calculateEmbedding(tag);
        await tx.run(
          `MERGE (te:TagEmbedding {tag: $tag, modelVersion: $modelVersion})
           SET te.embedding = $embedding, te.updatedAt = datetime()`,
          { tag, embedding, modelVersion: this.embeddingModelVersion }
        );
      }
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }
}
