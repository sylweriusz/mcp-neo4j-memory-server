# Stopwords Extraction Report

Generated on: 2025-05-22T18:20:37.089Z
Source: Professional extraction from multilingual dictionary sources

## Summary Statistics
- **Total Languages**: 52
- **Total Words**: 20,469
- **Average Words per Language**: 394

## Language Breakdown
- **English (en)**: 1,298 words
- **Breton (br)**: 1,203 words
- **Greek (el)**: 847 words
- **Finnish (fi)**: 847 words
- **Persian (fa)**: 799 words
- **Chinese (zh)**: 794 words
- **Hungarian (hu)**: 789 words
- **Indonesian (id)**: 758 words
- **Spanish (es)**: 732 words
- **French (fr)**: 691 words
- **Korean (ko)**: 679 words
- **Vietnamese (vi)**: 645 words
- **Italian (it)**: 632 words
- **German (de)**: 620 words
- **Portuguese (pt)**: 560 words
- **Russian (ru)**: 559 words
- **Urdu (ur)**: 517 words
- **Turkish (tr)**: 504 words
- **Arabic (ar)**: 480 words
- **Slovenian (sl)**: 446 words
- **Romanian (ro)**: 434 words
- **Czech (cs)**: 423 words
- **Slovak (sk)**: 418 words
- **Swedish (sv)**: 418 words
- **Dutch (nl)**: 413 words
- **Bengali (bn)**: 398 words
- **Polish (pl)**: 329 words
- **Catalan (ca)**: 278 words
- **Bulgarian (bg)**: 259 words
- **Hindi (hi)**: 225 words
- **Gujarati (gu)**: 224 words
- **Norwegian (no)**: 221 words
- **Hebrew (he)**: 194 words
- **Croatian (hr)**: 179 words
- **Esperanto (eo)**: 173 words
- **Danish (da)**: 170 words
- **Latvian (lv)**: 161 words
- **Galician (gl)**: 160 words
- **Japanese (ja)**: 134 words
- **Thai (th)**: 116 words
- **Irish (ga)**: 109 words
- **Marathi (mr)**: 99 words
- **Basque (eu)**: 98 words
- **Swahili (sw)**: 74 words
- **Ukrainian (uk)**: 73 words
- **Yoruba (yo)**: 60 words
- **Latin (la)**: 49 words
- **Armenian (hy)**: 45 words
- **Hausa (ha)**: 39 words
- **Estonian (et)**: 35 words
- **Southern Sotho (st)**: 31 words
- **Somali (so)**: 30 words

## Files Generated
- `stopwords-en.ts` - English stopwords
- `stopwords-br.ts` - Breton stopwords
- `stopwords-el.ts` - Greek stopwords
- `stopwords-fi.ts` - Finnish stopwords
- `stopwords-fa.ts` - Persian stopwords
- `stopwords-zh.ts` - Chinese stopwords
- `stopwords-hu.ts` - Hungarian stopwords
- `stopwords-id.ts` - Indonesian stopwords
- `stopwords-es.ts` - Spanish stopwords
- `stopwords-fr.ts` - French stopwords
- `stopwords-ko.ts` - Korean stopwords
- `stopwords-vi.ts` - Vietnamese stopwords
- `stopwords-it.ts` - Italian stopwords
- `stopwords-de.ts` - German stopwords
- `stopwords-pt.ts` - Portuguese stopwords
- `stopwords-ru.ts` - Russian stopwords
- `stopwords-ur.ts` - Urdu stopwords
- `stopwords-tr.ts` - Turkish stopwords
- `stopwords-ar.ts` - Arabic stopwords
- `stopwords-sl.ts` - Slovenian stopwords
- `stopwords-ro.ts` - Romanian stopwords
- `stopwords-cs.ts` - Czech stopwords
- `stopwords-sk.ts` - Slovak stopwords
- `stopwords-sv.ts` - Swedish stopwords
- `stopwords-nl.ts` - Dutch stopwords
- `stopwords-bn.ts` - Bengali stopwords
- `stopwords-pl.ts` - Polish stopwords
- `stopwords-ca.ts` - Catalan stopwords
- `stopwords-bg.ts` - Bulgarian stopwords
- `stopwords-hi.ts` - Hindi stopwords
- `stopwords-gu.ts` - Gujarati stopwords
- `stopwords-no.ts` - Norwegian stopwords
- `stopwords-he.ts` - Hebrew stopwords
- `stopwords-hr.ts` - Croatian stopwords
- `stopwords-eo.ts` - Esperanto stopwords
- `stopwords-da.ts` - Danish stopwords
- `stopwords-lv.ts` - Latvian stopwords
- `stopwords-gl.ts` - Galician stopwords
- `stopwords-ja.ts` - Japanese stopwords
- `stopwords-th.ts` - Thai stopwords
- `stopwords-ga.ts` - Irish stopwords
- `stopwords-mr.ts` - Marathi stopwords
- `stopwords-eu.ts` - Basque stopwords
- `stopwords-sw.ts` - Swahili stopwords
- `stopwords-uk.ts` - Ukrainian stopwords
- `stopwords-yo.ts` - Yoruba stopwords
- `stopwords-la.ts` - Latin stopwords
- `stopwords-hy.ts` - Armenian stopwords
- `stopwords-ha.ts` - Hausa stopwords
- `stopwords-et.ts` - Estonian stopwords
- `stopwords-st.ts` - Southern Sotho stopwords
- `stopwords-so.ts` - Somali stopwords
- `index.ts` - Barrel exports and utilities

## Usage Example
```typescript
import { getCombinedStopwords } from './src/data';

// Get combined stopwords for multiple languages
const stopwords = await getCombinedStopwords(['en', 'pl', 'de', 'fr']);

// Or import specific language
import { stopwords as englishStopwords } from './src/data/stopwords-en';
```
