/**
 * Enhanced Tag Management Module v2.0
 * Based on 07f57051 with improvements:
 * - Built-in universal stopwords for multilingual support
 * - compromise.js for POS tagging and noun extraction  
 * - Enhanced technical term detection
 * - Preserved semantic deduplication with embeddings
 * - Universal stopwords (no language detection needed)
 */

import { Session } from 'neo4j-driver';
import { calculateEmbedding, calculateSimilarity } from './embeddings.js';
import nlp from 'compromise';

// Built-in stopwords for major languages (manually selected most common words)
const UNIVERSAL_STOPWORDS = {
  en: ["'ll","'tis","'twas","'ve","10","39","a","a's","able","ableabout","about","above","abroad","abst","accordance","according","accordingly","across","act","actually","ad","added","adj","adopted","ae","af","affected","affecting","affects","after","afterwards","ag","again","against","ago","ah","ahead","ai","ain't","aint","al","all","allow","allows","almost","alone","along","alongside","already","also","although","always","am","amid","amidst","among","amongst","amoungst","amount","an","and","announce","another","any","anybody","anyhow","anymore","anyone","anything","anyway","anyways","anywhere","ao","apart","apparently","appear","appreciate","appropriate","approximately","aq","ar","are","area","areas","aren","aren't","arent","arise","around","arpa","as","aside","ask","asked","asking","asks","associated","at","au","auth","available","aw","away","awfully","az","b","ba","back","backed","backing","backs","backward","backwards","bb","bd","be","became","because","become","becomes","becoming","been","before","beforehand","began","begin","beginning","beginnings","begins","behind","being","beings","believe","below","beside","besides","best","better","between","beyond","bf","bg","bh","bi","big","bill","billion","biol","bj","bm","bn","bo","both","bottom","br","brief","briefly","bs","bt","but","buy","bv","bw","by","bz","c","c'mon","c's","ca","call","came","can","can't","cannot","cant","caption","case","cases","cause","causes","cc","cd","certain","certainly","cf","cg","ch","changes","ci","ck","cl","clear","clearly","click","cm","cmon","cn","co","co.","com","come","comes","computer","con","concerning","consequently","consider","considering","contain","containing","contains","copy","corresponding","could","could've","couldn","couldn't","couldnt","course","cr","cry","cs","cu","currently","cv","cx","cy","cz","d","dare","daren't","darent","date","de","dear","definitely","describe","described","despite","detail","did","didn","didn't","didnt","differ","different","differently","directly","dj","dk","dm","do","does","doesn","doesn't","doesnt","doing","don","don't","done","dont","doubtful","down","downed","downing","downs","downwards","due","during","dz","e","each","early","ec","ed","edu","ee","effect","eg","eh","eight","eighty","either","eleven","else","elsewhere","empty","end","ended","ending","ends","enough","entirely","er","es","especially","et","et-al","etc","even","evenly","ever","evermore","every","everybody","everyone","everything","everywhere","ex","exactly","example","except","f","face","faces","fact","facts","fairly","far","farther","felt","few","fewer","ff","fi","fifteen","fifth","fifty","fify","fill","find","finds","fire","first","five","fix","fj","fk","fm","fo","followed","following","follows","for","forever","former","formerly","forth","forty","forward","found","four","fr","free","from","front","full","fully","further","furthered","furthering","furthermore","furthers","fx","g","ga","gave","gb","gd","ge","general","generally","get","gets","getting","gf","gg","gh","gi","give","given","gives","giving","gl","gm","gmt","gn","go","goes","going","gone","good","goods","got","gotten","gov","gp","gq","gr","great","greater","greatest","greetings","group","grouped","grouping","groups","gs","gt","gu","gw","gy","h","had","hadn't","hadnt","half","happens","hardly","has","hasn","hasn't","hasnt","have","haven","haven't","havent","having","he","he'd","he'll","he's","hed","hell","hello","help","hence","her","here","here's","hereafter","hereby","herein","heres","hereupon","hers","herself","herse”","hes","hi","hid","high","higher","highest","him","himself","himse”","his","hither","hk","hm","hn","home","homepage","hopefully","how","how'd","how'll","how's","howbeit","however","hr","ht","htm","html","http","hu","hundred","i","i'd","i'll","i'm","i've","i.e.","id","ie","if","ignored","ii","il","ill","im","immediate","immediately","importance","important","in","inasmuch","inc","inc.","indeed","index","indicate","indicated","indicates","information","inner","inside","insofar","instead","int","interest","interested","interesting","interests","into","invention","inward","io","iq","ir","is","isn","isn't","isnt","it","it'd","it'll","it's","itd","itll","its","itself","itse”","ive","j","je","jm","jo","join","jp","just","k","ke","keep","keeps","kept","keys","kg","kh","ki","kind","km","kn","knew","know","known","knows","kp","kr","kw","ky","kz","l","la","large","largely","last","lately","later","latest","latter","latterly","lb","lc","least","length","less","lest","let","let's","lets","li","like","liked","likely","likewise","line","little","lk","ll","long","longer","longest","look","looking","looks","low","lower","lr","ls","lt","ltd","lu","lv","ly","m","ma","made","mainly","make","makes","making","man","many","may","maybe","mayn't","maynt","mc","md","me","mean","means","meantime","meanwhile","member","members","men","merely","mg","mh","microsoft","might","might've","mightn't","mightnt","mil","mill","million","mine","minus","miss","mk","ml","mm","mn","mo","more","moreover","most","mostly","move","mp","mq","mr","mrs","ms","msie","mt","mu","much","mug","must","must've","mustn't","mustnt","mv","mw","mx","my","myself","myse”","mz","n","na","name","namely","nay","nc","nd","ne","near","nearly","necessarily","necessary","need","needed","needing","needn't","neednt","needs","neither","net","netscape","never","neverf","neverless","nevertheless","new","newer","newest","next","nf","ng","ni","nine","ninety","nl","no","no-one","nobody","non","none","nonetheless","noone","nor","normally","nos","not","noted","nothing","notwithstanding","novel","now","nowhere","np","nr","nu","null","number","numbers","nz","o","obtain","obtained","obviously","of","off","often","oh","ok","okay","old","older","oldest","om","omitted","on","once","one","one's","ones","only","onto","open","opened","opening","opens","opposite","or","ord","order","ordered","ordering","orders","org","other","others","otherwise","ought","oughtn't","oughtnt","our","ours","ourselves","out","outside","over","overall","owing","own","p","pa","page","pages","part","parted","particular","particularly","parting","parts","past","pe","per","perhaps","pf","pg","ph","pk","pl","place","placed","places","please","plus","pm","pmid","pn","point","pointed","pointing","points","poorly","possible","possibly","potentially","pp","pr","predominantly","present","presented","presenting","presents","presumably","previously","primarily","probably","problem","problems","promptly","proud","provided","provides","pt","put","puts","pw","py","q","qa","que","quickly","quite","qv","r","ran","rather","rd","re","readily","really","reasonably","recent","recently","ref","refs","regarding","regardless","regards","related","relatively","research","reserved","respectively","resulted","resulting","results","right","ring","ro","room","rooms","round","ru","run","rw","s","sa","said","same","saw","say","saying","says","sb","sc","sd","se","sec","second","secondly","seconds","section","see","seeing","seem","seemed","seeming","seems","seen","sees","self","selves","sensible","sent","serious","seriously","seven","seventy","several","sg","sh","shall","shan't","shant","she","she'd","she'll","she's","shed","shell","shes","should","should've","shouldn","shouldn't","shouldnt","show","showed","showing","shown","showns","shows","si","side","sides","significant","significantly","similar","similarly","since","sincere","site","six","sixty","sj","sk","sl","slightly","sm","small","smaller","smallest","sn","so","some","somebody","someday","somehow","someone","somethan","something","sometime","sometimes","somewhat","somewhere","soon","sorry","specifically","specified","specify","specifying","sr","st","state","states","still","stop","strongly","su","sub","substantially","successfully","such","sufficiently","suggest","sup","sure","sv","sy","system","sz","t","t's","take","taken","taking","tc","td","tell","ten","tends","test","text","tf","tg","th","than","thank","thanks","thanx","that","that'll","that's","that've","thatll","thats","thatve","the","their","theirs","them","themselves","then","thence","there","there'd","there'll","there're","there's","there've","thereafter","thereby","thered","therefore","therein","therell","thereof","therere","theres","thereto","thereupon","thereve","these","they","they'd","they'll","they're","they've","theyd","theyll","theyre","theyve","thick","thin","thing","things","think","thinks","third","thirty","this","thorough","thoroughly","those","thou","though","thoughh","thought","thoughts","thousand","three","throug","through","throughout","thru","thus","til","till","tip","tis","tj","tk","tm","tn","to","today","together","too","took","top","toward","towards","tp","tr","tried","tries","trillion","truly","try","trying","ts","tt","turn","turned","turning","turns","tv","tw","twas","twelve","twenty","twice","two","tz","u","ua","ug","uk","um","un","under","underneath","undoing","unfortunately","unless","unlike","unlikely","until","unto","up","upon","ups","upwards","us","use","used","useful","usefully","usefulness","uses","using","usually","uucp","uy","uz","v","va","value","various","vc","ve","versus","very","vg","vi","via","viz","vn","vol","vols","vs","vu","w","want","wanted","wanting","wants","was","wasn","wasn't","wasnt","way","ways","we","we'd","we'll","we're","we've","web","webpage","website","wed","welcome","well","wells","went","were","weren","weren't","werent","weve","wf","what","what'd","what'll","what's","what've","whatever","whatll","whats","whatve","when","when'd","when'll","when's","whence","whenever","where","where'd","where'll","where's","whereafter","whereas","whereby","wherein","wheres","whereupon","wherever","whether","which","whichever","while","whilst","whim","whither","who","who'd","who'll","who's","whod","whoever","whole","wholl","whom","whomever","whos","whose","why","why'd","why'll","why's","widely","width","will","willing","wish","with","within","without","won","won't","wonder","wont","words","work","worked","working","works","world","would","would've","wouldn","wouldn't","wouldnt","ws","www","x","y","ye","year","years","yes","yet","you","you'd","you'll","you're","you've","youd","youll","young","younger","youngest","your","youre","yours","yourself","yourselves","youve","yt","yu","z","za","zero","zm","zr"],
  pl: ["a","aby","ach","acz","aczkolwiek","aj","albo","ale","ależ","ani","aż","bardziej","bardzo","bez","bo","bowiem","by","byli","bym","bynajmniej","być","był","była","było","były","będzie","będą","cali","cała","cały","chce","choć","ci","ciebie","cię","co","cokolwiek","coraz","coś","czasami","czasem","czemu","czy","czyli","często","daleko","dla","dlaczego","dlatego","do","dobrze","dokąd","dość","dr","dużo","dwa","dwaj","dwie","dwoje","dzisiaj","dziś","gdy","gdyby","gdyż","gdzie","gdziekolwiek","gdzieś","go","godz","hab","i","ich","ii","iii","ile","im","inna","inne","inny","innych","inż","iv","ix","iż","ja","jak","jakaś","jakby","jaki","jakichś","jakie","jakiś","jakiż","jakkolwiek","jako","jakoś","je","jeden","jedna","jednak","jednakże","jedno","jednym","jedynie","jego","jej","jemu","jest","jestem","jeszcze","jeśli","jeżeli","już","ją","każdy","kiedy","kierunku","kilka","kilku","kimś","kto","ktokolwiek","ktoś","która","które","którego","której","który","których","którym","którzy","ku","lat","lecz","lub","ma","mają","mam","mamy","mało","mgr","mi","miał","mimo","między","mnie","mną","mogą","moi","moim","moja","moje","może","możliwe","można","mu","musi","my","mój","na","nad","nam","nami","nas","nasi","nasz","nasza","nasze","naszego","naszych","natomiast","natychmiast","nawet","nic","nich","nie","niech","niego","niej","niemu","nigdy","nim","nimi","nią","niż","no","nowe","np","nr","o","o.o.","obok","od","ok","około","on","ona","one","oni","ono","oraz","oto","owszem","pan","pana","pani","pl","po","pod","podczas","pomimo","ponad","ponieważ","powinien","powinna","powinni","powinno","poza","prawie","prof","przecież","przed","przede","przedtem","przez","przy","raz","razie","roku","również","sam","sama","się","skąd","sobie","sobą","sposób","swoje","są","ta","tak","taka","taki","takich","takie","także","tam","te","tego","tej","tel","temu","ten","teraz","też","to","tobie","tobą","toteż","totobą","trzeba","tu","tutaj","twoi","twoim","twoja","twoje","twym","twój","ty","tych","tylko","tym","tys","tzw","tę","u","ul","vi","vii","viii","vol","w","wam","wami","was","wasi","wasz","wasza","wasze","we","według","wie","wiele","wielu","więc","więcej","wszyscy","wszystkich","wszystkie","wszystkim","wszystko","wtedy","www","wy","właśnie","wśród","xi","xii","xiii","xiv","xv","z","za","zapewne","zawsze","zaś","ze","zeznowu","znowu","znów","został","zł","żaden","żadna","żadne","żadnych","że","żeby"],
  de: ["der", "die", "und", "in", "den", "von", "zu", "das", "mit", "sich", "des", "auf", "für", "ist", "im", "dem", "nicht", "ein", "eine", "als", "auch", "es", "an", "werden", "aus", "er", "hat", "dass", "sie", "nach", "wird", "bei", "einer", "um", "am", "sind", "noch", "wie", "einem", "über", "einen", "so", "zum", "war", "haben", "nur", "oder", "aber", "vor", "zur", "bis", "mehr", "durch", "man", "sein", "wurde", "sei", "in", "wenn", "auch", "alle", "wie", "was", "bei", "kann", "seine", "hier", "wo", "sehr", "wir", "ihr", "sie", "uns", "ihnen", "diese", "dieser", "dieses"],
  fr: ["de", "le", "et", "à", "un", "se", "il", "être", "et", "en", "avoir", "que", "pour", "dans", "ce", "son", "une", "sur", "avec", "ne", "se", "pas", "tout", "plus", "pouvoir", "par", "je", "du", "son", "au", "comme", "dire", "mais", "un", "mon", "te", "vous", "du", "lui", "nous", "comme", "mais", "son", "tout", "aussi", "leur", "bien", "où", "fait", "si", "dont", "chaque", "très", "dans", "cette", "ces", "sans", "sous", "après", "même", "entre", "contre", "pendant", "alors", "comment", "quand", "pourquoi"],
  es: ["el", "de", "que", "y", "a", "en", "un", "es", "se", "no", "te", "lo", "le", "da", "su", "por", "son", "con", "para", "como", "del", "está", "una", "su", "al", "qué", "esa", "el", "la", "ser", "que", "de", "pero", "ya", "que", "sus", "cuando", "muy", "sin", "sobre", "también", "me", "hasta", "donde", "quien", "desde", "porque", "este", "nada", "tiempo", "cada", "ellos", "todo", "esto", "tan", "vez", "más", "ante", "bien", "aquí", "algo", "otros", "otro", "ahora"],
  it: ["di", "a", "da", "in", "con", "su", "per", "tra", "fra", "il", "lo", "la", "le", "gli", "un", "una", "uno", "del", "dello", "della", "dell", "dei", "degli", "delle", "al", "allo", "alla", "all", "ai", "agli", "alle", "dal", "dallo", "dalla", "dall", "dai", "dagli", "dalle", "nel", "nello", "nella", "nell", "nei", "negli", "nelle", "sul", "sullo", "sulla", "sull", "sui", "sugli", "sulle", "col", "coi", "è", "e", "non", "che", "ma", "anche", "se", "come", "o", "sono", "stato", "questo", "quella", "quello", "questi", "queste", "più", "molto", "tutto", "tutti", "ogni"]
};

// Current model version for cache invalidation
const EMBEDDING_MODEL_VERSION = 'xenova-minilm-l6-v2-v1';

// Types for internal tag processing
interface TermStats {
  term: string;
  tf: number;      // Term frequency in document
  tfidf: number;   // TF-IDF score  
}

interface CandidateTag {
  term: string;
  score: number;
}

/**
 * Get universal stopwords combining multiple languages
 * No language detection needed - covers most common words across languages
 */
function getUniversalStopwords(): Set<string> {
  const commonLanguages = ['en', 'pl', 'de', 'fr', 'es', 'it'];
  const universalStopwords = new Set<string>();
  
  // Combine stopwords from major languages
  commonLanguages.forEach(lang => {
    const langStopwords = UNIVERSAL_STOPWORDS[lang as keyof typeof UNIVERSAL_STOPWORDS] || [];
    langStopwords.forEach(word => universalStopwords.add(word));
  });
  
  // Add common technical/domain-agnostic stopwords
  const technicalStopwords = [
    'etc', 'via', 'using', 'used', 'use', 'new', 'old', 'get', 'set',
    'add', 'create', 'update', 'delete', 'first', 'last', 'next', 'previous',
    'data', 'info', 'item', 'thing', 'way', 'part', 'type', 'kind'
  ];
  
  technicalStopwords.forEach(word => universalStopwords.add(word));
  
  return universalStopwords;
}

/**
 * Calculate TF-IDF for terms in a document
 * For single document, simplified to term frequency
 */
function calculateTFIDF(terms: string[]): TermStats[] {
  if (terms.length === 0) return [];
  
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

/**
 * Extract nouns using compromise.js POS tagging
 */
function extractNounsAdvanced(text: string): string[] {
  try {
    const doc = nlp(text);
    
    // 1. Extract compound nouns (machine learning, neural network)
    const nouns = doc.nouns().out('array')
      .filter(noun => noun.length > 2)
      .map(noun => noun.toLowerCase())
      .map(noun => noun.replace(/\.$/, '')); // Remove trailing periods
    
    // 2. Extract proper nouns (Einstein, PostgreSQL, Docker)
    const properNouns = doc.people().out('array')
      .concat(doc.places().out('array'))
      .concat(doc.organizations().out('array'))
      .filter(noun => noun.length > 2)
      .map(noun => noun.toLowerCase());
    
    // 3. Extract technical terms (capitalized words)
    const technicalTerms = doc.terms().out('array')
      .filter(term => {
        // Keep terms that start with capital and aren't at sentence start
        const trimmed = term.trim();
        return /^[A-Z][a-zA-Z]*$/.test(trimmed) && trimmed.length > 2;
      })
      .map(term => term.toLowerCase());
    
    return [...new Set([...nouns, ...properNouns, ...technicalTerms])];
  } catch (error) {
    console.error('❌ Error in compromise.js noun extraction:', error);
    // Fallback to regex-based extraction
    return extractNounPhrasesRegex(text);
  }
}

/**
 * Fallback regex-based noun phrase extraction
 * Used if compromise.js fails
 */
function extractNounPhrasesRegex(text: string): string[] {
  const patterns = [
    // English patterns
    /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g,          // Proper noun phrases
    /\b[a-z]+ing\s+[a-z]+\b/g,                  // gerund + noun
    /\b[a-z]+\s+[a-z]+tion\b/g,                 // noun + -tion
    /\b[a-z]+\s+[a-z]+ment\b/g,                 // noun + -ment
    
    // Polish patterns with diacritics
    /\b[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+\b/g,
    /\b[a-ząćęłńóśźż]+\s+[a-ząćęłńóśźż]+anie\b/g,    // noun + -anie
    /\b[a-ząćęłńóśźż]+\s+[a-ząćęłńóśźż]+ość\b/g,     // noun + -ość
  ];
  
  const phrases: string[] = [];
  patterns.forEach(pattern => {
    const matches = text.match(pattern) || [];
    phrases.push(...matches.map(match => match.toLowerCase()));
  });
  
  return phrases.filter(phrase => phrase.length > 4);
}

/**
 * Extract keywords with enhanced technical term detection
 * Uses universal stopwords (no language detection needed)
 */
function extractKeywordsAdvanced(text: string): string[] {
  // 1. Get universal stopwords (combined from multiple languages)
  const stopWords = getUniversalStopwords();
  
  // 2. Enhanced tokenization preserving technical terms
  const words = text.toLowerCase()
    .replace(/[^\w\sąćęłńóśźż.-]/g, ' ')  // Keep dots and hyphens for technical terms
    .split(/\s+/)
    .filter(word => 
      word.length > 2 && 
      !stopWords.has(word) &&
      !/^\d+$/.test(word)
    );
  
  // 3. Technical terms detection
  const technicalPatterns = [
    /\b[A-Z][a-zA-Z]+(?:\.[a-zA-Z]+)+\b/g,  // React.js, Node.js, vue.js
    /\b[a-zA-Z]+-[a-zA-Z]+\b/g,             // machine-learning, real-time
    /\b[A-Z]{2,}\b/g,                       // API, HTTP, SQL, GPU
  ];
  
  const technicalTerms: string[] = [];
  technicalPatterns.forEach(pattern => {
    const matches = text.match(pattern) || [];
    technicalTerms.push(...matches.map(term => term.toLowerCase()));
  });
  
  return [...new Set([...words, ...technicalTerms])];
}

/**
 * Get embeddings for multiple tags with database cache
 * (Preserved from original implementation)
 */
async function getTagEmbeddings(
  session: Session,
  tagNames: string[]
): Promise<Map<string, number[]>> {
  if (tagNames.length === 0) {
    return new Map();
  }

  const embeddingMap = new Map<string, number[]>();
  
  try {
    // Step 1: Get all cached embeddings in a single query
    const result = await session.run(
      `MATCH (t:Tag)
       WHERE t.name IN $tagNames 
         AND t.embedding IS NOT NULL
         AND t.embeddingVersion = $version
       RETURN t.name AS name, t.embedding AS embedding`,
      { tagNames, version: EMBEDDING_MODEL_VERSION }
    );

    // Collect cached embeddings
    const cachedTags = new Set<string>();
    for (const record of result.records) {
      const name = record.get('name');
      const embedding = record.get('embedding');
      if (embedding && Array.isArray(embedding)) {
        embeddingMap.set(name, embedding);
        cachedTags.add(name);
      }
    }

    // Step 2: Calculate embeddings for missing tags
    const missingTags = tagNames.filter(name => !cachedTags.has(name));
    
    if (missingTags.length > 0) {
      // Calculate embeddings in parallel
      const newEmbeddings = await Promise.all(
        missingTags.map(async (tagName) => ({
          name: tagName,
          embedding: await calculateEmbedding(tagName)
        }))
      );

      // Step 3: Store new embeddings (single transaction)
      if (newEmbeddings.length > 0) {
        const tx = session.beginTransaction();
        try {
          for (const { name, embedding } of newEmbeddings) {
            embeddingMap.set(name, embedding);
            
            await tx.run(
              `MERGE (t:Tag {name: $tagName})
               SET t.embedding = $embedding,
                   t.embeddingVersion = $version,
                   t.calculatedAt = datetime()`,
              { 
                tagName: name, 
                embedding,
                version: EMBEDDING_MODEL_VERSION
              }
            );
          }
          await tx.commit();
        } catch (error) {
          await tx.rollback();
          throw error;
        }
      }
    }

    return embeddingMap;
  } catch (error) {
    console.error('❌ Error getting tag embeddings:', error);
    throw error;
  }
}

/**
 * Semantic deduplication using database-cached embeddings
 * (Preserved from original implementation)
 */
async function semanticDeduplicationWithCache(
  session: Session,
  candidates: string[], 
  threshold: number = 0.75
): Promise<string[]> {
  if (candidates.length <= 1) return candidates;
  
  try {
    // PHASE 1: Remove exact substring duplicates
    const filteredCandidates = [];
    
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
        filteredCandidates.push(candidate);
      }
    }
    
    // PHASE 2: Get all embeddings at once for semantic similarity
    const embeddingMap = await getTagEmbeddings(session, filteredCandidates);
    
    // PHASE 3: Semantic deduplication on remaining candidates
    const final: string[] = [];
    
    for (const candidate of filteredCandidates) {
      const candidateEmbedding = embeddingMap.get(candidate);
      
      if (!candidateEmbedding) {
        continue; // Skip if embedding couldn't be calculated
      }
      
      let isDuplicate = false;
      
      // Check similarity with already selected terms
      for (const selected of final) {
        const selectedEmbedding = embeddingMap.get(selected);
        
        if (selectedEmbedding) {
          const similarity = calculateSimilarity(
            candidateEmbedding, 
            selectedEmbedding
          );
          
          if (similarity > threshold) {
            // Keep the longer/more specific term
            if (candidate.length > selected.length) {
              // Replace selected with candidate
              const index = final.indexOf(selected);
              final[index] = candidate;
            }
            isDuplicate = true;
            break;
          }
        }
      }
      
      if (!isDuplicate) {
        final.push(candidate);
      }
    }
    
    return final;
  } catch (error) {
    console.error('❌ Error in cached semantic deduplication:', error);
    // Fallback to simple deduplication
    return [...new Set(candidates)];
  }
}

/**
 * Enhanced tag extraction with compromise.js POS tagging
 * Uses universal stopwords, no language detection needed
 */
export async function extractTags(text: string, session?: Session): Promise<string[]> {
  if (!text || text.trim() === '') {
    return [];
  }
  
  try {
    // 1. Extract keywords using universal stopwords (no language detection)
    const keywords = extractKeywordsAdvanced(text);
    
    // 2. Extract nouns using compromise.js (with regex fallback)
    const nouns = extractNounsAdvanced(text);
    
    // 3. TF-IDF scoring for keywords
    const keywordStats = calculateTFIDF(keywords);
    
    // 4. Combine keywords and nouns with scores
    const candidates: CandidateTag[] = [
      // Keywords with TF-IDF scores
      ...keywordStats.map(stat => ({
        term: stat.term,
        score: stat.tfidf
      })),
      // Nouns with boost (as they're often more meaningful)
      ...nouns.map(noun => ({
        term: noun,
        score: 1.5 // Boost for compound nouns and proper nouns
      }))
    ];
    
    // 5. Sort by score and take top candidates
    const topCandidates = candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)  // More candidates for deduplication
      .map(c => c.term);
    
    // 6. Semantic deduplication using cached embeddings
    let deduplicatedTags: string[];
    if (session) {
      deduplicatedTags = await semanticDeduplicationWithCache(session, topCandidates, 0.75);
    } else {
      // Simple deduplication fallback
      deduplicatedTags = [...new Set(topCandidates)];
    }
    
    // 7. Return top 3-5 quality tags
    return deduplicatedTags.slice(0, 5);
    
  } catch (error) {
    console.error('❌ Error extracting tags:', error);
    return [];
  }
}

/**
 * Legacy semantic deduplication (fallback when no session provided)
 * Calculates embeddings on the fly
 */
async function semanticDeduplication(
  candidates: string[], 
  threshold: number = 0.75
): Promise<string[]> {
  if (candidates.length <= 1) return candidates;
  
  try {
    // PHASE 1: Remove exact substring duplicates
    const filteredCandidates = [];
    
    for (const candidate of candidates) {
      const candidateWords = candidate.split(/\s+/);
      let isSubstring = false;
      
      for (const other of candidates) {
        if (candidate !== other && other.includes(candidate)) {
          if (candidateWords.length === 1 && other.split(/\s+/).length > 1) {
            isSubstring = true;
            break;
          }
        }
      }
      
      if (!isSubstring) {
        filteredCandidates.push(candidate);
      }
    }
    
    // PHASE 2: Calculate embeddings for filtered candidates  
    const candidatesWithEmbeddings = await Promise.all(
      filteredCandidates.map(async candidate => ({
        term: candidate,
        embedding: await calculateEmbedding(candidate)
      }))
    );
    
    // PHASE 3: Semantic deduplication
    const final: string[] = [];
    
    for (const candidate of candidatesWithEmbeddings) {
      let isDuplicate = false;
      
      // Check similarity with already selected terms
      for (const selected of final) {
        const selectedEmbedding = candidatesWithEmbeddings
          .find(c => c.term === selected)?.embedding;
        
        if (selectedEmbedding) {
          const similarity = calculateSimilarity(
            candidate.embedding, 
            selectedEmbedding
          );
          
          if (similarity > threshold) {
            // Keep the longer/more specific term
            if (candidate.term.length > selected.length) {
              const index = final.indexOf(selected);
              final[index] = candidate.term;
            }
            isDuplicate = true;
            break;
          }
        }
      }
      
      if (!isDuplicate) {
        final.push(candidate.term);
      }
    }
    
    return final;
  } catch (error) {
    console.error('❌ Error in semantic deduplication:', error);
    // Fallback with substring filtering
    const filtered = [];
    for (const candidate of candidates) {
      const candidateWords = candidate.split(/\s+/);
      let isSubstring = false;
      
      for (const other of candidates) {
        if (candidate !== other && other.includes(candidate)) {
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
    return Array.from(new Set(filtered));
  }
}

/**
 * Update memory tags based on name and observations
 * (Preserved from original implementation)
 */
export async function updateMemoryTags(
  session: Session,
  memoryId: string, 
  memoryName: string,
  observations: string[] | Array<{content: string, createdAt: string}> = []
): Promise<void> {
  try {
    // Get existing tags for this memory to maintain consistency
    const existingTagsResult = await session.run(
      `MATCH (m:Memory {id: $memoryId})-[:HAS_TAG]->(t:Tag)
       RETURN collect(t.name) AS existingTags`,
      { memoryId }
    );
    
    const existingTags = existingTagsResult.records[0]?.get('existingTags') || [];
    
    // Extract new tags from memory name only (not from observations to avoid semantic explosion)
    const nameTags = await extractTags(memoryName, session);
    
    // Combine existing tags with new name tags
    const candidateTags = [...existingTags, ...nameTags];
    
    // Semantic deduplication to merge similar concepts
    const finalTags = await semanticDeduplicationWithCache(session, candidateTags, 0.75);
    
    // Only update if there's a meaningful change  
    if (finalTags.length > 0) {
      // Update tags in database
      await session.run(
        `MATCH (m:Memory {id: $memoryId})
         SET m.tags = $tags
         WITH m
         
         // Clear existing tag relationships
         OPTIONAL MATCH (m)-[r:HAS_TAG]->()
         DELETE r
         
         WITH m
         
         // Create tag nodes and relationships
         UNWIND $tags as tagName
         MERGE (t:Tag {name: tagName})
         MERGE (m)-[:HAS_TAG]->(t)`,
        { memoryId, tags: finalTags }
      );
    }
  } catch (error) {
    console.error(`❌ Error updating tags for memory ${memoryId}:`, error);
    throw error;
  }
}

/**
 * Get all tags with usage count
 */
export async function getAllTags(session: Session): Promise<{name: string, count: number}[]> {
  const result = await session.run(
    `MATCH (t:Tag)<-[:HAS_TAG]-(m:Memory)
     RETURN t.name AS name, count(m) AS count
     ORDER BY count DESC`
  );
  
  return result.records.map(record => ({
    name: record.get('name'),
    count: record.get('count').toNumber()
  }));
}

/**
 * Get tags for specific memory
 */
export async function getMemoryTags(session: Session, memoryId: string): Promise<string[]> {
  const result = await session.run(
    `MATCH (m:Memory {id: $memoryId})-[:HAS_TAG]->(t:Tag)
     RETURN t.name AS tagName`,
    { memoryId }
  );
  
  return result.records.map(record => record.get('tagName'));
}

/**
 * Clear invalid tag embeddings (for model upgrades)
 */
export async function clearInvalidTagEmbeddings(
  session: Session,
  version: string = EMBEDDING_MODEL_VERSION
): Promise<number> {
  const result = await session.run(
    `MATCH (t:Tag)
     WHERE t.embeddingVersion IS NULL 
        OR t.embeddingVersion <> $version
     SET t.embedding = null,
         t.embeddingVersion = null,
         t.calculatedAt = null
     RETURN count(t) AS cleared`,
    { version }
  );
  
  const cleared = result.records[0]?.get('cleared')?.toNumber() || 0;
  //console.log(`🧹 Cleared ${cleared} invalid tag embeddings`);
  return cleared;
}

/**
 * Get cache statistics
 */
export async function getTagEmbeddingStats(session: Session): Promise<{
  totalTags: number;
  cachedEmbeddings: number;
  cacheHitRate: number;
}> {
  const result = await session.run(
    `MATCH (t:Tag)
     RETURN count(t) AS totalTags,
            sum(CASE WHEN t.embedding IS NOT NULL 
                     AND t.embeddingVersion = $version 
                     THEN 1 ELSE 0 END) AS cachedEmbeddings`,
    { version: EMBEDDING_MODEL_VERSION }
  );
  
  const totalTags = result.records[0]?.get('totalTags')?.toNumber() || 0;
  const cachedEmbeddings = result.records[0]?.get('cachedEmbeddings')?.toNumber() || 0;
  const cacheHitRate = totalTags > 0 ? (cachedEmbeddings / totalTags) * 100 : 0;
  
  return {
    totalTags,
    cachedEmbeddings,
    cacheHitRate: Math.round(cacheHitRate * 100) / 100
  };
}