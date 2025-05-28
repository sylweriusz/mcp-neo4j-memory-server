/**
 * Stopword Management Service
 * Single responsibility: multilingual stopword filtering
 */
import { getCombinedStopwords } from './data/index';

export class StopwordService {
  private cachedStopwords: Set<string> | null = null;
  private readonly defaultLanguages = [
    // Tier 1: Major Languages (1B+ speakers)
    'zh', 'en', 'hi', 'es', 'ar', 'pt', 'ru',
    
    // Tier 2: Regional Powers (100M+ speakers) 
    'bn', 'ja', 'de', 'fr', 'it', 'pl',
    
    // Tier 3: Strategic Languages (50M+ speakers)
    'vi', 'ko', 'mr', 'tr', 'ur', 'gu', 
    'uk', 'fa', 'th', 'nl', 'sw',
    
    // Tier 4: Tech Hubs & Regional
    'sv', 'da', 'no', 'fi', 'he', 'cs', 'hu', 'id'
  ];

  constructor() {
    // Initialize stopwords immediately to avoid race conditions
    this.initializeStopwords();
  }

  getStopwords(): Set<string> {
    if (this.cachedStopwords) {
      return this.cachedStopwords;
    }

    try {
      this.cachedStopwords = getCombinedStopwords(this.defaultLanguages);
      return this.cachedStopwords;
    } catch (error) {
      console.error('Failed to load multilingual stopwords:', error);
      throw error;
    }
  }

  filterStopwords(words: string[]): string[] {
    const stopWords = this.getStopwords();
    
    return words.filter(word => {
      const cleanWord = word.toLowerCase().trim();
      return cleanWord.length > 2 &&
             !stopWords.has(cleanWord) &&
             !this.isPureNumber(cleanWord) &&
             !this.isPunctuation(cleanWord) &&
             !this.isGerund(cleanWord) &&
             cleanWord !== 'and'; // Explicit filter for stubborn stop words
    });
  }

  private initializeStopwords(): void {
    try {
      this.cachedStopwords = getCombinedStopwords(this.defaultLanguages);
    } catch (error) {
      console.error('Failed to load multilingual stopwords:', error);
    }
  }

  private isPureNumber(word: string): boolean {
    return /^\d+$/.test(word);
  }

  private isPunctuation(word: string): boolean {
    return /^[.-]+$/.test(word);
  }

  private isGerund(word: string): boolean {
    return /^.+ing$/.test(word);
  }
}
