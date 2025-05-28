/**
 * Language-Aware Tag Extraction Service
 * Clean Architecture Implementation - Fixed Polish Language Support
 * Single responsibility: Extract meaningful tags with proper language handling
 */

import nlp from 'compromise';
import { getCombinedStopwords } from './tags/data/index';

export interface TagExtractionService {
  extractTags(memoryName: string, observations?: string[]): Promise<string[]>;
}

interface TagCandidate {
  term: string;
  frequency: number;
  sources: string[];
  confidence: number;
  type: 'noun' | 'compound' | 'technical' | 'proper';
}

export class CompromiseTagExtractionService implements TagExtractionService {
  private readonly maxTags = 6;
  private readonly minTagLength = 2;
  private readonly multilingualStopwords: Set<string>;

  constructor() {
    const languages = ['en', 'pl', 'de', 'fr', 'es', 'it', 'zh', 'ja', 'ru', 'ar'];
    this.multilingualStopwords = getCombinedStopwords(languages);
  }

  async extractTags(memoryName: string, observations: string[] = []): Promise<string[]> {
    console.error(`[TAG EXTRACTION] Processing memory: "${memoryName}"`);
    console.error(`[TAG EXTRACTION] Observations count: ${observations.length}`);
    
    // Detect language to choose appropriate processing
    const language = this.detectLanguage(memoryName, observations);
    console.error(`[TAG EXTRACTION] Detected language: ${language}`);
    
    // Prepare content with proper weighting
    const allContent = this.prepareContent(memoryName, observations);
    console.error(`[TAG EXTRACTION] Total content length: ${allContent.length} chars`);
    
    // Extract candidates using language-appropriate methods
    const candidates = language === 'polish' 
      ? this.extractPolishCandidates(allContent, memoryName, observations)
      : this.extractEnglishCandidates(allContent, memoryName, observations);
    
    // Score and rank candidates
    const rankedCandidates = this.scoreAndRankCandidates(candidates);
    
    // Select final tags with semantic deduplication
    const finalTags = this.selectFinalTags(rankedCandidates);
    
    console.error(`[TAG EXTRACTION] Final tags: [${finalTags.join(', ')}]`);
    return finalTags;
  }
