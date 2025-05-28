/**
 * Force Bundle - Explicit References for Bundler
 * This file forces the bundler to include ALL stopword files
 */

// Import ALL stopwords explicitly to force bundling
import ar from './stopwords-ar';
import bg from './stopwords-bg';
import bn from './stopwords-bn';
import br from './stopwords-br';
import ca from './stopwords-ca';
import cs from './stopwords-cs';
import da from './stopwords-da';
import de from './stopwords-de';
import el from './stopwords-el';
import en from './stopwords-en';
import eo from './stopwords-eo';
import es from './stopwords-es';
import et from './stopwords-et';
import eu from './stopwords-eu';
import fa from './stopwords-fa';
import fi from './stopwords-fi';
import fr from './stopwords-fr';
import ga from './stopwords-ga';
import gl from './stopwords-gl';
import gu from './stopwords-gu';
import ha from './stopwords-ha';
import he from './stopwords-he';
import hi from './stopwords-hi';
import hr from './stopwords-hr';
import hu from './stopwords-hu';
import hy from './stopwords-hy';
import id from './stopwords-id';
import it from './stopwords-it';
import ja from './stopwords-ja';
import ko from './stopwords-ko';
import la from './stopwords-la';
import lv from './stopwords-lv';
import mr from './stopwords-mr';
import nl from './stopwords-nl';
import no from './stopwords-no';
import pl from './stopwords-pl';
import pt from './stopwords-pt';
import ro from './stopwords-ro';
import ru from './stopwords-ru';
import sk from './stopwords-sk';
import sl from './stopwords-sl';
import so from './stopwords-so';
import st from './stopwords-st';
import sv from './stopwords-sv';
import sw from './stopwords-sw';
import th from './stopwords-th';
import tr from './stopwords-tr';
import uk from './stopwords-uk';
import ur from './stopwords-ur';
import vi from './stopwords-vi';
import yo from './stopwords-yo';
import zh from './stopwords-zh';

/**
 * Static map that forces bundler to see all stopwords
 */
export const STOPWORDS_MAP = {
  ar, bg, bn, br, ca, cs, da, de, el, en, eo, es, et, eu, fa, fi, fr, ga, gl, gu,
  ha, he, hi, hr, hu, hy, id, it, ja, ko, la, lv, mr, nl, no, pl, pt, ro, ru, sk,
  sl, so, st, sv, sw, th, tr, uk, ur, vi, yo, zh
} as const;

/**
 * Get stopwords for specific language - direct map access
 */
export function getStopwords(languageCode: string): string[] {
  const stopwords = STOPWORDS_MAP[languageCode as keyof typeof STOPWORDS_MAP];
  if (!stopwords) {
    throw new Error(`Unsupported language code: ${languageCode}`);
  }
  return stopwords;
}

/**
 * Get combined stopwords for multiple languages
 */
export function getCombinedStopwords(languageCodes: string[]): Set<string> {
  const combined = new Set<string>();
  
  for (const code of languageCodes) {
    try {
      const stopwords = getStopwords(code);
      stopwords.forEach(word => combined.add(word.toLowerCase()));
    } catch (error) {
      console.warn(`Warning: Could not load stopwords for language '${code}'`);
    }
  }
  
  return combined;
}
