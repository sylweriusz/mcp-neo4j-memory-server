/**
 * Tag Extraction Service - Clean Architecture Implementation
 * Unicode-aware, multilingual support with temporal drift
 * Single responsibility: Extract meaningful tags from memory content
 */

import { Session } from 'neo4j-driver';
import { StopwordService } from './tags/stopword-service';
import { NounExtractionService } from './tags/noun-extraction-service';
import { TechnicalTermDetector } from './tags/technical-term-detector';
import { TagDeduplicationService } from './tags/tag-deduplication-service';

export interface TagExtractionService {
  extractTags(memoryName: string, observations?: string[]): Promise<string[]>;
  extractTagsForMemory(
    memoryName: string,
    observations: Array<{content: string} | string>,
    existingTags?: string[],
    isAddingNewObservations?: boolean
  ): Promise<string[]>;
}

interface CandidateTag {
  term: string;
  score: number;
}

interface TermStats {
  term: string;
  tf: number;
  tfidf: number;
}

export class CompromiseTagExtractionService implements TagExtractionService {
  private stopwordService: StopwordService;
  private nounService: NounExtractionService;
  private technicalDetector: TechnicalTermDetector;
  private deduplicationService: TagDeduplicationService;

  constructor(session?: Session) {
    this.stopwordService = new StopwordService();
    this.nounService = new NounExtractionService();
    this.technicalDetector = new TechnicalTermDetector();
    this.deduplicationService = new TagDeduplicationService(session);
  }

  async extractTags(memoryName: string, observations: string[] = []): Promise<string[]> {
    // Delegate to the full implementation
    return this.extractTagsForMemory(memoryName, observations);
  }

  async extractTagsForMemory(
    memoryName: string,
    observations: Array<{content: string} | string>,
    existingTags: string[] = [],
    isAddingNewObservations: boolean = false
  ): Promise<string[]> {
    try {
      // Extract tags from memory name (60% weight)
      const nameTags = await this.extractTagsFromText(memoryName);
      
      // Extract tags from observations (40% weight)
      const observationText = Array.isArray(observations)
        ? observations.map(obs => typeof obs === 'string' ? obs : obs.content).join(' ')
        : observations.join(' ');
      
      const observationTags = observationText.trim()
        ? await this.extractTagsFromText(observationText)
        : [];

      // Combine and weight tags - with temporal drift for new observations
      const weightedCandidates = [
        ...nameTags.map(tag => ({ tag, weight: 1.5 })),      // Name priority
        ...observationTags.map(tag => ({ 
          tag, 
          weight: isAddingNewObservations ? 1.1 : 1.0  // 10% boost for new observations
        }))
      ];

      // Create candidate list including existing tags
      const candidateNames = [
        ...existingTags,
        ...weightedCandidates
          .sort((a, b) => b.weight - a.weight)
          .map(c => c.tag)
      ];

      // Final semantic deduplication and selection
      const finalTags = await this.deduplicationService.deduplicateTags(
        candidateNames,
        0.85  // Higher threshold - only remove very similar terms
      );

      console.error(`[TAG EXTRACTION] extractTagsForMemory returning: [${finalTags.slice(0, 6).join(', ')}]`);
      return finalTags.slice(0, 6);
    } catch (error) {
      console.error('Memory tag extraction failed:', error);
      return existingTags.slice(0, 6);
    }
  }

  private async extractTagsFromText(text: string): Promise<string[]> {
    if (!text || text.trim() === '') {
      return [];
    }

    console.error(`[TAG EXTRACTION] Processing text: "${text}"`);

    try {
      // 1. Extract keywords using stopword filtering
      const keywords = await this.extractKeywords(text);
      console.error(`[TAG EXTRACTION] Keywords: [${keywords.join(', ')}]`);
      
      // 2. Extract nouns using POS tagging
      const nouns = this.nounService.extractNouns(text);
      console.error(`[TAG EXTRACTION] Nouns: [${nouns.join(', ')}]`);
      
      // 3. Extract technical terms
      const technicalTerms = this.technicalDetector.extractTechnicalTerms(text);
      console.error(`[TAG EXTRACTION] Technical terms: [${technicalTerms.join(', ')}]`);
      
      // 4. Calculate TF-IDF scores for keywords
      const keywordStats = this.calculateTFIDF(keywords);
      
      // 5. Combine all candidates with scores
      const candidates: CandidateTag[] = [
        // Keywords with TF-IDF scores
        ...keywordStats.map(stat => ({
          term: stat.term,
          score: stat.tfidf
        })),
        // Nouns with boost (often more meaningful) - but only if they're not the whole text
        ...nouns
          .filter(noun => noun.split(' ').length <= 3) // Filter out overly long noun phrases
          .map(noun => ({
            term: noun,
            score: 1.5
          })),
        // Technical terms with highest priority
        ...technicalTerms.map(term => ({
          term: term,
          score: 2.0
        }))
      ];

      // 6. Sort by score and take top candidates
      const topCandidates = candidates
        .filter(c => !this.isGerund(c.term)) // Filter gerunds
        .sort((a, b) => b.score - a.score)
        .slice(0, 15) // Increased from 12 for better selection
        .map(c => c.term);

      // Remove exact duplicates before deduplication
      const uniqueCandidates = [...new Set(topCandidates)];
      console.error(`[TAG EXTRACTION] Unique candidates: [${uniqueCandidates.join(', ')}]`);

      console.error(`[TAG EXTRACTION] Top candidates: [${topCandidates.join(', ')}]`);

      // 7. Semantic deduplication
      const deduplicatedTags = await this.deduplicationService.deduplicateTags(
        uniqueCandidates,
        0.85  // Much higher threshold - only remove very similar terms
      );

      // 8. Return top 6 quality tags
      const finalTags = deduplicatedTags.slice(0, 6);
      console.error(`[TAG EXTRACTION] Final tags: [${finalTags.join(', ')}]`);
      
      return finalTags;

    } catch (error) {
      console.error('Tag extraction failed:', error);
      return [];
    }
  }

  private async extractKeywords(text: string): Promise<string[]> {
    // Unicode-aware keyword extraction
    const words = text
      .toLowerCase()
      .split(/\s+/)
      .map(word => word.replace(/[^\p{L}\p{N}_-]/gu, ''))  // Unicode-aware cleaning
      .filter(word => word.length > 2);

    return this.stopwordService.filterStopwords(words);
  }

  private calculateTFIDF(terms: string[]): TermStats[] {
    const termCounts = new Map<string, number>();
    
    terms.forEach(term => {
      termCounts.set(term, (termCounts.get(term) || 0) + 1);
    });

    return Array.from(termCounts.entries()).map(([term, count]) => ({
      term,
      tf: count / terms.length,
      tfidf: count / terms.length // Simplified for single document
    }));
  }

  private isGerund(term: string): boolean {
    return /^.+ing$/.test(term) && !['string', 'ring', 'king', 'thing'].includes(term);
  }
}
