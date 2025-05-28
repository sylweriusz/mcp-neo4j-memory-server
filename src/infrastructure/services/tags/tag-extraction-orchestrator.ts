/**
 * Tag Extraction Orchestrator
 * Single responsibility: coordinate tag extraction pipeline
 */
import { Session } from 'neo4j-driver';
import { StopwordService } from './stopword-service';
import { NounExtractionService } from './noun-extraction-service';
import { TechnicalTermDetector } from './technical-term-detector';
import { TagDeduplicationService } from './tag-deduplication-service';

interface CandidateTag {
  term: string;
  score: number;
}

interface TermStats {
  term: string;
  tf: number;
  tfidf: number;
}

export class TagExtractionOrchestrator {
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

  async extractTags(text: string): Promise<string[]> {
    if (!text || text.trim() === '') {
      return [];
    }

    try {
      // 1. Extract keywords using stopword filtering
      const keywords = await this.extractKeywords(text);
      
      // 2. Extract nouns using POS tagging
      const nouns = this.nounService.extractNouns(text);
      
      // 3. Extract technical terms
      const technicalTerms = this.technicalDetector.extractTechnicalTerms(text);
      
      // 4. Calculate TF-IDF scores for keywords
      const keywordStats = this.calculateTFIDF(keywords);
      
      // 5. Combine all candidates with scores
      const candidates: CandidateTag[] = [
        // Keywords with TF-IDF scores
        ...keywordStats.map(stat => ({
          term: stat.term,
          score: stat.tfidf
        })),
        // Nouns with boost (often more meaningful)
        ...nouns.map(noun => ({
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
        .slice(0, 12) // More candidates for deduplication
        .map(c => c.term);

      // 7. Semantic deduplication
      const deduplicatedTags = await this.deduplicationService.deduplicateTags(
        topCandidates,
        0.75
      );

      // 8. Return top 6 quality tags
      return deduplicatedTags.slice(0, 6);

    } catch (error) {
      console.error('Tag extraction failed:', error);
      return [];
    }
  }

  async extractTagsForMemory(
    memoryName: string,
    observations: Array<{content: string} | string>,
    existingTags: string[] = []
  ): Promise<string[]> {
    try {
      // Extract tags from memory name (60% weight)
      const nameTags = await this.extractTags(memoryName);
      
      // Extract tags from observations (40% weight)
      const observationText = Array.isArray(observations)
        ? observations.map(obs => typeof obs === 'string' ? obs : obs.content).join(' ')
        : observations.join(' ');
      
      const observationTags = observationText.trim()
        ? await this.extractTags(observationText)
        : [];

      // Combine and weight tags
      const weightedCandidates = [
        ...nameTags.map(tag => ({ tag, weight: 1.5 })),      // Name priority
        ...observationTags.map(tag => ({ tag, weight: 1.0 })) // Observation support
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
        0.75
      );

      return finalTags.slice(0, 6);
    } catch (error) {
      console.error('Memory tag extraction failed:', error);
      return existingTags.slice(0, 6);
    }
  }

  private async extractKeywords(text: string): Promise<string[]> {
    // Simple keyword extraction by splitting and filtering
    const words = text
      .toLowerCase()
      .split(/\s+/)
      .map(word => word.replace(/[^\w-]/g, ''))
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
    return /^.+ing$/.test(term);
  }
}
