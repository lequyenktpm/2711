export type SupportedTtsLang = 'en' | 'vi' | 'ja' | 'zh' | 'ko' | 'fr' | 'es';

export interface TtsLanguageSpan {
  text: string;
  lang: SupportedTtsLang;
  voice: string;
}

const DEFAULT_EDGE_VOICE_BY_LANG: Record<SupportedTtsLang, string> = {
  en: 'en-US-JennyNeural',
  vi: 'vi-VN-HoaiMyNeural',
  ja: 'ja-JP-NanamiNeural',
  zh: 'zh-CN-XiaoxiaoNeural',
  ko: 'ko-KR-SunHiNeural',
  fr: 'fr-FR-DeniseNeural',
  es: 'es-ES-ElviraNeural',
};

const RE_HAS_KANA = /[\u3040-\u30ff\u31f0-\u31ff\uff65-\uff9f]/;
const RE_HAS_CJK = /[\u4e00-\u9faf\u3400-\u4dbf\u3005\u3006]/;
const RE_HAS_HANGUL = /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/;
const RE_HAS_STRICT_VI_DIACRITIC =
  /[ăđơưảãạằắẳẵặầấẩẫậẻẽẹềếểễệỉĩịỏõọồốổỗộờớởỡợủũụừứửữựỷỹỵĂĐƠƯẢÃẠẰẮẲẴẶẦẤẨẪẬẺẼẸỀẾỂỄỆỈĨỊỎÕỌỒỐỔỖỘỜỚỞỠỢỦŨỤỪỨỬỮỰỶỸỴ]/;
const RE_HAS_SHARED_CIRCUMFLEX_OR_ACCENT = /[àáèéìíòóùúỳýâêôÀÁÈÉÌÍÒÓÙÚỲÝÂÊÔ]/;
const RE_HAS_VI_DIACRITIC = RE_HAS_STRICT_VI_DIACRITIC;
const RE_HAS_STRICT_ES_FR_CHAR = /[ñ¿¡çœæëïîûÿüÑÇŒÆËÏÎÛŸÜ]/;
const RE_HAS_FR_ES_DIACRITIC = /[çœæñ¿¡éèêëàâîïôùûüÿáíóú]/i;
const RE_HAS_SPOKEN_CHAR =
  /[A-Za-z0-9À-ỹ\u0100-\u024F\u1E00-\u1EFF\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9faf\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/;
const RE_HAS_PINYIN_STRICT = /[āǎēěīǐōǒūǔǖǘǚǜĀǍĒĚĪǏŌǑŪǓǕǗǙǛ]/;
const RE_HAS_PINYIN_TONE = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ]/;
const RE_VI_ASCII_SYLLABLE =
  /^(?:ngh|ng|nh|ch|tr|th|ph|kh|gh|gi|qu|[bcdfghklmnpqrstvwxz])?(?:a|e|i|o|u|y|ai|ao|au|ay|eo|eu|ia|ie|iu|oa|oe|oi|oo|ou|ua|ue|ui|uo|uu|uy|yai|yao|yeu|ieu|oai|oay|uay|uoi|uou|uya|uye|uyu)(?:ng|nh|ch|[cmnpt])?$/;
const RE_PROFICIENCY_LEVEL_CODE =
  /^(?:N[1-5]|JLPT|CEFR|HSK[1-9]?|TOPIK[1-6]?|[ABC][12])$/i;
const COMMON_ES_FR_FUNCTION_WORDS = new Set([
  'el',
  'los',
  'las',
  'un',
  'una',
  'unos',
  'unas',
  'del',
  'por',
  'para',
  'pero',
  'porque',
  'como',
  'donde',
  'cuando',
  'este',
  'esta',
  'esto',
  'cada',
  'despues',
  'manana',
  'tambien',
  'siempre',
  'ahora',
  'nunca',
  'todo',
  'toda',
  'muy',
  'mas',
  'algo',
  'sus',
  'les',
  'des',
  'du',
  'une',
  'dans',
  'pour',
  'avec',
  'mais',
  'tres',
  'est',
  'sont',
  'nous',
  'vous',
  'elles',
  'leur',
  'chez',
  'tout',
  'moi',
  'toi',
  'soi',
]);

// Unaccented lowercase tokens that exist in Vietnamese phrases and do not collide with standard English words.
const UNAMBIGUOUS_VI_ASCII = new Set([
  'khong',
  'duoc',
  'nguoi',
  'tieng',
  'viet',
  'nhung',
  'nhieu',
  'nhien',
  'nhau',
  'nhin',
  'ngay',
  'nghe',
  'nghi',
  'ngoi',
  'trong',
  'truoc',
  'chua',
  'chung',
  'chinh',
  'chuyen',
  'thay',
  'theo',
  'them',
  'thich',
  'thoi',
  'thong',
  'thuong',
  'khac',
  'khi',
  'khoe',
  'biet',
  'buoc',
  'buon',
  'duong',
  'dung',
  'giup',
  'giong',
  'giua',
  'huong',
  'hoac',
  'hieu',
  'hoc',
  'hom',
  'muon',
  'minh',
  'nay',
  'nao',
  'nen',
  'neu',
  'phai',
  'phan',
  'phat',
  'phuong',
  'quyen',
  'rieng',
  'sach',
  'sau',
  'sinh',
  'suy',
  'thanh',
  'thao',
  'thieu',
  'tinh',
  'toan',
  'toi',
  'tong',
  'tuy',
  'viec',
  'vong',
  'vui',
  'xem',
  'xong',
  'xuat',
  'yeu',
  'cua',
  'cho',
  'luon',
  'chac',
  'thuc',
  'dien',
  'dat',
  'giai',
  'xin',
  'chao',
  'vung',
  'phap',
  'ngu',
  'cau',
  'nghia',
  'nhe',
  'nha',
  'luyen',
  'nho',
  'chuan',
  'xac',
  'trinh',
  'cung',
  'deu',
  'sao',
  'chuc',
  'mung',
  'cac',
  'giao',
  'tiep',
  'cach',
  'quang',
  'nuoc',
  'buoi',
  'chieu',
  'sang',
  'trua',
  'khuya',
  'ngon',
  'ngan',
  'thang',
  'tuan',
  'nhanh',
  'cham',
  'muoi',
  'chao',
  'thao',
  'khach',
  'hang',
]);

// Words that overlap with short English/French tokens (to, ty, on, in, do, so, at, go, no, may, can, day, la...)
// Classified as Vietnamese ONLY inside Vietnamese-diacritic / unambiguous-VI clauses or when primary is 'vi'.
const CONTEXTUAL_VI_ASCII = new Set([
  'la',
  'tu',
  'ban',
  'doc',
  'hay',
  'day',
  'sao',
  'the',
  'cam',
  'rat',
  'lam',
  'noi',
  'anh',
  'em',
  'chi',
  'con',
  'co',
  'di',
  've',
  'ra',
  'vao',
  'len',
  'xuong',
  'qua',
  'lai',
  'het',
  'roi',
  'nua',
  'dau',
  'gi',
  'ai',
  'ma',
  'thi',
  'de',
  'voi',
  'va',
  'nhu',
  'tai',
  'vi',
  'to',
  'ty',
  'an',
  'at',
  'do',
  'so',
  'on',
  'in',
  'no',
  'go',
  'may',
  'can',
  'me',
  'cha',
  'ba',
  'hai',
  'bay',
  'tam',
  'chin',
  'xe',
  'ta',
  'ten',
  'tin',
  'van',
  'song',
  'sai',
  'gap',
  'nam',
  'han',
  'tien',
  'dep',
  'cao',
  'lon',
  'tot',
  'o',
  'ben',
  'gan',
  'xa',
  'it',
  'mot',
  'bon',
  'tram',
  'mat',
  'tay',
  'chan',
  'da',
  'lo',
  'mo',
  'nho',
  'ru',
  'su',
  'thu',
  'tu',
  'vu',
  'ke',
  'le',
  'ne',
  're',
  'se',
  'te',
  'ha',
  'ca',
  'ho',
  'bo',
  'cu',
  'du',
  'hu',
  'lu',
  'mu',
  'nu',
  'moi',
  'cong',
  'quan',
  'nham',
  'nhat',
  'trong',
  'dang',
  'bang',
  'tang',
  'mang',
  'sang',
  'nang',
  'lang',
  'hang',
  'vang',
  'cang',
  'rang',
  'thang',
  'khang',
  'phang',
  'trang',
]);

// Unmistakably foreign (non-Vietnamese) consonant clusters, double letters, or short common English tokens
// that would otherwise trick the Vietnamese ASCII syllable phonotactic regex.
const RE_FOREIGN_CLUSTER_OR_DOUBLE =
  /^(?:bl|br|cl|cr|dr|fl|fr|gl|gr|kn|pl|pr|sc|sh|sk|sl|sm|sn|sp|st|sw|tw|wh|wr|chr|str|spr|thr|spl)|(?:bb|cc|dd|ee|ff|gg|kk|ll|mm|nn|pp|qq|rr|ss|tt|vv|ww|xx|zz)|(?:[bdfjklqrsvwxz])$|(?:[^n]g)$|(?:[^cn]h)$/;

const COMMON_FOREIGN_SHORT_ENGLISH = new Set([
  'the',
  'and',
  'for',
  'are',
  'but',
  'not',
  'you',
  'your',
  'all',
  'any',
  'her',
  'his',
  'him',
  'she',
  'one',
  'two',
  'out',
  'off',
  'who',
  'why',
  'how',
  'now',
  'new',
  'old',
  'way',
  'see',
  'saw',
  'say',
  'use',
  'put',
  'get',
  'got',
  'let',
  'set',
  'cut',
  'run',
  'ran',
  'fun',
  'sun',
  'cat',
  'hat',
  'hot',
  'hit',
  'sit',
  'fit',
  'bit',
  'yet',
  'yes',
  'man',
  'men',
  'ten',
  'red',
  'bed',
  'big',
  'bad',
  'sad',
  'mad',
  'did',
  'has',
  'had',
  'was',
  'were',
  'this',
  'that',
  'with',
  'from',
  'they',
  'them',
  'will',
  'have',
  'what',
  'when',
  'time',
  'very',
  'good',
  'well',
  'make',
  'take',
  'come',
  'look',
  'want',
  'give',
  'work',
  'call',
  'need',
  'feel',
  'mean',
  'keep',
  'tell',
  'ask',
  'try',
  'love',
  'like',
  'know',
  'here',
  'more',
  'much',
  'some',
  'many',
]);

function stripLatinAccentsToAscii(rawWord: string): string {
  return rawWord
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/^'+|'+$/g, '');
}

function isPlausibleVietnameseBase(rawWord: string): boolean {
  if (RE_HAS_STRICT_ES_FR_CHAR.test(rawWord)) return false;
  const ascii = stripLatinAccentsToAscii(rawWord);
  if (!ascii || ascii.length > 7) return false;
  if (/[fjwz]/.test(ascii)) return false;
  if (RE_FOREIGN_CLUSTER_OR_DOUBLE.test(ascii)) return false;
  if (
    /(?:ed|ing|tion|sion|ment|ness|able|ible|ous|ful|less|ly|er|est|sh|th|ck|st|nt|nd|nk|mp|ct|pt|ft|ld|as|es|is|os|us|s)$/.test(
      ascii,
    )
  ) {
    return false;
  }
  return RE_VI_ASCII_SYLLABLE.test(ascii);
}

export function isLikelyVietnameseAsciiSyllable(rawWord: string): boolean {
  const lower = rawWord.toLowerCase().replace(/^'+|'+$/g, '');
  if (!lower || lower.length > 7) return false;
  if (/[fjwz]/.test(lower)) return false;
  if (UNAMBIGUOUS_VI_ASCII.has(lower)) return true;
  if (COMMON_FOREIGN_SHORT_ENGLISH.has(lower)) return false;
  if (RE_FOREIGN_CLUSTER_OR_DOUBLE.test(lower)) return false;
  if (CONTEXTUAL_VI_ASCII.has(lower)) return true;
  // Common English suffixes / endings never found in Vietnamese single syllables:
  if (/(?:ed|ing|tion|sion|ment|ness|able|ible|ly|er|est|sh|th|ck|st|nt|nd|nk|mp|ct|pt|ft|ld)$/.test(lower)) {
    return false;
  }
  return RE_VI_ASCII_SYLLABLE.test(lower);
}

function classifyLatinAsciiToken(
  rawWord: string,
  primary: SupportedTtsLang,
  secondary: SupportedTtsLang,
): 'def-vi' | 'def-foreign' | 'ambiguous' {
  const lower = rawWord.toLowerCase().replace(/^'+|'+$/g, '');
  if (!lower) return 'ambiguous';
  if (RE_PROFICIENCY_LEVEL_CODE.test(rawWord)) {
    return primary === 'vi' || secondary === 'vi' ? 'def-vi' : 'ambiguous';
  }
  const isAllCapsAcronym = rawWord.length >= 2 && /^[A-Z0-9]{2,}$/.test(rawWord);
  if (isAllCapsAcronym) return 'def-foreign';
  if (UNAMBIGUOUS_VI_ASCII.has(lower)) return 'def-vi';
  if (lower.length > 7 || /[fjwz]/.test(lower)) return 'def-foreign';
  if (COMMON_FOREIGN_SHORT_ENGLISH.has(lower)) return 'def-foreign';
  if (RE_FOREIGN_CLUSTER_OR_DOUBLE.test(lower)) return 'def-foreign';
  if (
    /(?:ed|ing|tion|sion|ment|ness|able|ible|ous|ful|less|ly|er|est|sh|th|ck|st|nt|nd|nk|mp|ct|pt|ft|ld|ze|se|ve|ge|ce|ke|ne|pe|fe)$/.test(
      lower,
    )
  ) {
    return 'def-foreign';
  }
  if (RE_HAS_FR_ES_DIACRITIC.test(rawWord) && (primary === 'fr' || primary === 'es' || secondary === 'fr' || secondary === 'es')) {
    return 'def-foreign';
  }
  const ascii = stripLatinAccentsToAscii(rawWord);
  if (UNAMBIGUOUS_VI_ASCII.has(ascii)) return 'def-vi';
  if (CONTEXTUAL_VI_ASCII.has(lower) || CONTEXTUAL_VI_ASCII.has(ascii) || RE_VI_ASCII_SYLLABLE.test(ascii)) {
    return 'ambiguous';
  }
  return 'def-foreign';
}

export function normalizeTtsLangCode(raw?: string): SupportedTtsLang {
  const low = String(raw || '').trim().toLowerCase();
  if (!low) return 'en';
  if (low.startsWith('vi') || low.includes('viet')) return 'vi';
  if (low.startsWith('ja') || low === 'jp' || low.includes('japan') || low.includes('nhật') || low.includes('日本')) {
    return 'ja';
  }
  if (low.startsWith('zh') || low.includes('chin') || low.includes('trung') || low.includes('中文')) return 'zh';
  if (low.startsWith('ko') || low.includes('kor') || low.includes('hàn') || low.includes('한국')) return 'ko';
  if (low.startsWith('fr') || low.includes('fren') || low.includes('pháp') || low.includes('fran')) return 'fr';
  if (low.startsWith('es') || low.includes('span') || low.includes('tây ban nha') || low.includes('espa')) return 'es';
  return 'en';
}

const LOCALE_BY_TTS_LANG: Record<SupportedTtsLang, string> = {
  en: 'en-US',
  vi: 'vi-VN',
  ja: 'ja-JP',
  zh: 'zh-CN',
  ko: 'ko-KR',
  fr: 'fr-FR',
  es: 'es-ES',
};

export function isMultilingualVoiceId(voiceId?: string): boolean {
  const v = String(voiceId || '').trim();
  return /MultilingualNeural$/i.test(v);
}

export function getLocaleForTtsLang(lang: SupportedTtsLang): string {
  return LOCALE_BY_TTS_LANG[lang] || 'en-US';
}

export function detectVoiceLangCode(voiceId?: string): SupportedTtsLang | null {
  const v = String(voiceId || '').trim();
  if (!v) return null;
  const low = v.toLowerCase();
  if (low.startsWith('vi-') || low === 'vi') return 'vi';
  if (low.startsWith('ja-') || low === 'ja' || low === 'mizuki' || low === 'takumi') return 'ja';
  if (low.startsWith('zh-') || low.startsWith('zh')) return 'zh';
  if (low.startsWith('ko-') || low === 'ko') return 'ko';
  if (low.startsWith('fr-') || low === 'fr') return 'fr';
  if (low.startsWith('es-') || low === 'es') return 'es';
  if (low.startsWith('en-') || low === 'en' || low === 'joanna' || low === 'matthew' || low === 'amy' || low === 'brian') {
    return 'en';
  }
  return null;
}

export function pickVoiceForLangCode(langCode: SupportedTtsLang, requestedVoice?: string): string {
  const req = String(requestedVoice || '').trim();
  if (req) {
    if (isMultilingualVoiceId(req)) {
      return req;
    }
    const reqLang = detectVoiceLangCode(req);
    if (reqLang === langCode) {
      return req;
    }
    const looksRegional = reqLang !== null || req.includes('Neural') || /^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(req);
    if (!looksRegional) {
      return req;
    }
  }
  return DEFAULT_EDGE_VOICE_BY_LANG[langCode] || DEFAULT_EDGE_VOICE_BY_LANG.en;
}

export function pickLearningDefaultVoice(learningLang: string): string {
  return DEFAULT_EDGE_VOICE_BY_LANG[normalizeTtsLangCode(learningLang)] || 'en-US-JennyNeural';
}

export function pickExplanationDefaultVoice(targetExplainLang: string): string {
  const code = normalizeTtsLangCode(targetExplainLang);
  return DEFAULT_EDGE_VOICE_BY_LANG[code] || 'vi-VN-HoaiMyNeural';
}

interface RawPiece {
  raw: string;
  kind: 'word' | 'cjk' | 'hangul' | 'num' | 'punct';
  langHint: SupportedTtsLang | null;
  clauseIdx: number;
}

export function splitMixedLanguageTtsSpans(
  text: string,
  opts: {
    primaryLang?: string;
    secondaryLang?: string;
    primaryVoice?: string;
    secondaryVoice?: string;
    autoSplit?: boolean;
    singleVoiceMultilingual?: boolean;
  } = {},
): TtsLanguageSpan[] {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const primary = normalizeTtsLangCode(opts.primaryLang || detectVoiceLangCode(opts.primaryVoice) || 'en');
  const secondary = normalizeTtsLangCode(
    opts.secondaryLang ||
      detectVoiceLangCode(opts.secondaryVoice) ||
      (primary === 'vi' ? 'en' : 'vi'),
  );

  const primaryIsMultilingual = isMultilingualVoiceId(opts.primaryVoice);
  const secondaryIsMultilingual = isMultilingualVoiceId(opts.secondaryVoice);
  const useSingleUnifiedVoice =
    Boolean(opts.singleVoiceMultilingual) || primaryIsMultilingual;
  const unifiedVoiceId = useSingleUnifiedVoice
    ? (primaryIsMultilingual
        ? opts.primaryVoice!
        : secondaryIsMultilingual
          ? opts.secondaryVoice!
          : opts.primaryVoice || 'en-US-AvaMultilingualNeural')
    : null;

  // Enforce a single consistent Vietnamese voice across all 'vi' spans in the same request
  const consistentViVoice =
    (primary === 'vi' && opts.primaryVoice && detectVoiceLangCode(opts.primaryVoice) === 'vi'
      ? opts.primaryVoice
      : undefined) ||
    (opts.secondaryVoice && detectVoiceLangCode(opts.secondaryVoice) === 'vi'
      ? opts.secondaryVoice
      : undefined) ||
    (opts.primaryVoice && detectVoiceLangCode(opts.primaryVoice) === 'vi'
      ? opts.primaryVoice
      : undefined) ||
    DEFAULT_EDGE_VOICE_BY_LANG.vi;

  const voiceForLang = (lang: SupportedTtsLang): string => {
    if (unifiedVoiceId) {
      return unifiedVoiceId;
    }
    if (lang === 'vi') {
      return consistentViVoice;
    }
    if (lang === primary && opts.primaryVoice) {
      return pickVoiceForLangCode(lang, opts.primaryVoice);
    }
    if (lang === secondary && opts.secondaryVoice) {
      return pickVoiceForLangCode(lang, opts.secondaryVoice);
    }
    return pickVoiceForLangCode(lang);
  };

  if (opts.autoSplit === false) {
    return [{ text: clean, lang: primary, voice: voiceForLang(primary) }];
  }

  // Strip parenthesized Pinyin (containing tone marks like nǐ hǎo / xǐ shǒu jiān) when speaking Mandarin
  const spokenPrepared =
    primary === 'zh' || secondary === 'zh' || RE_HAS_CJK.test(clean)
      ? clean
          .replace(/\s*\([^)]*[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ][^)]*\)/g, '')
          .replace(/\s+/g, ' ')
          .trim() || clean
      : clean;

  // Compute sentence/clause Vietnamese predominance per clause so "Every day. Nghĩa là mỗi ngày."
  // keeps "Every day." as English while "Después toma un café." stays Spanish (not mistaken for Vietnamese!).
  const clauseStrings = spokenPrepared.split(/(?<=[.!?\n。！？]+)/);
  const clauseHasViContext: boolean[] = clauseStrings.map((cl) => {
    if (RE_HAS_STRICT_VI_DIACRITIC.test(cl)) return true;
    const rawWords = cl.match(/[A-Za-zÀ-ỹñÑçÇœÆ]+/g) || [];
    const words = rawWords.map((w) => stripLatinAccentsToAscii(w)).filter(Boolean);
    if (words.length === 0) return false;
    const unambigCount = words.filter((w) => UNAMBIGUOUS_VI_ASCII.has(w)).length;
    if (unambigCount >= 2 || (unambigCount >= 1 && words.length <= 5)) return true;
    if (primary === 'vi' && secondary === 'vi') return true;

    // Shared circumflex/acute accents (à, á, è, é, ì, í, ò, ó, ù, ú, â, ê, ô, ý):
    // Only consider Vietnamese context if there are NO Spanish/French markers or function words,
    // target primary is not French/Spanish, and the accented word is phonotactically valid Vietnamese.
    if (
      RE_HAS_SHARED_CIRCUMFLEX_OR_ACCENT.test(cl) &&
      !RE_HAS_STRICT_ES_FR_CHAR.test(cl) &&
      primary !== 'fr' &&
      primary !== 'es'
    ) {
      const hasEsFrFuncWord = words.some((w) => COMMON_ES_FR_FUNCTION_WORDS.has(w));
      const hasPlausibleViAccentedWord = rawWords.some(
        (rw) => RE_HAS_SHARED_CIRCUMFLEX_OR_ACCENT.test(rw) && isPlausibleVietnameseBase(rw),
      );
      const foreignVerbOrNounRatio =
        words.filter((w) => w.length > 7 || !isPlausibleVietnameseBase(w)).length / words.length;
      if (!hasEsFrFuncWord && hasPlausibleViAccentedWord && foreignVerbOrNounRatio < 0.4) {
        return true;
      }
    }
    return false;
  });

  // Tokenize into script-homogeneous pieces + separators with clause index tracking
  // Allow trailing digits inside Latin tokens (e.g. N1..N5, HSK4, B1) so level tags aren't split into letter + number
  const regex =
    /([\u3040-\u30ff\u31f0-\u31ff\uff65-\uff9f\u3400-\u4dbf\u4e00-\u9faf\u3005\u3006ー々]+)|([\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]+)|([A-Za-zÀ-ỹñÑçÇœÆüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ][A-Za-zÀ-ỹñÑçÇœÆüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ0-9'’-]*)|(\d+(?:[.,:/-]\d+)*%?)|(\s+|[^\sA-Za-zÀ-ỹñÑçÇœÆüÜ0-9\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9faf\uac00-\ud7af]+)/g;

  const pieces: Array<RawPiece & { asciiClass?: 'def-vi' | 'def-foreign' | 'ambiguous' }> = [];
  let match: RegExpExecArray | null;
  const textContainsViDiacritics = RE_HAS_STRICT_VI_DIACRITIC.test(spokenPrepared);
  const textContainsKana = RE_HAS_KANA.test(spokenPrepared);
  const textContainsCjk = RE_HAS_CJK.test(spokenPrepared);
  const primaryIsNonLatin = primary === 'zh' || primary === 'ja' || primary === 'ko';
  const secondaryIsVi = secondary === 'vi' || primary === 'vi';
  const foreignLatinLang: SupportedTtsLang =
    primary === 'fr' || primary === 'es' || primary === 'en'
      ? primary
      : secondary === 'fr' || secondary === 'es' || secondary === 'en'
        ? secondary
        : 'en';

  // Map each character index in spokenPrepared to its clause index
  const charToClause: number[] = new Array(spokenPrepared.length).fill(0);
  let scanPos = 0;
  for (let ci = 0; ci < clauseStrings.length; ci++) {
    const len = clauseStrings[ci].length;
    for (let k = 0; k < len && scanPos + k < spokenPrepared.length; k++) {
      charToClause[scanPos + k] = ci;
    }
    scanPos += len;
  }

  while ((match = regex.exec(spokenPrepared)) !== null) {
    const raw = match[0];
    const clauseIdx = charToClause[match.index] ?? 0;
    const inViClause = clauseHasViContext[clauseIdx] ?? false;

    if (match[1]) {
      const lang: SupportedTtsLang =
        RE_HAS_KANA.test(raw) || primary === 'ja' || secondary === 'ja' || textContainsKana
          ? 'ja'
          : 'zh';
      pieces.push({ raw, kind: 'cjk', langHint: lang, clauseIdx });
    } else if (match[2]) {
      pieces.push({ raw, kind: 'hangul', langHint: 'ko', clauseIdx });
    } else if (match[3]) {
      let langHint: SupportedTtsLang | null = null;
      let asciiClass: 'def-vi' | 'def-foreign' | 'ambiguous' | undefined;
      if (RE_HAS_VI_DIACRITIC.test(raw)) {
        langHint = 'vi';
        asciiClass = 'def-vi';
      } else if (RE_HAS_STRICT_ES_FR_CHAR.test(raw)) {
        langHint =
          primary === 'fr' || primary === 'es'
            ? primary
            : secondary === 'fr' || secondary === 'es'
              ? secondary
              : foreignLatinLang;
        asciiClass = 'def-foreign';
      } else if (
        RE_HAS_PINYIN_STRICT.test(raw) ||
        (RE_HAS_PINYIN_TONE.test(raw) &&
          (primary === 'zh' || secondary === 'zh' || textContainsCjk) &&
          primary !== 'fr' &&
          primary !== 'es')
      ) {
        // Inside a Vietnamese explanation clause (e.g. "Dùng Bù hǎo yì si khi..."),
        // keep Pinyin with the Vietnamese voice rather than jarring mid-sentence English!
        langHint = inViClause || primary === 'vi' ? 'vi' : primary === 'zh' || secondary === 'zh' ? 'zh' : 'en';
      } else if (RE_HAS_SHARED_CIRCUMFLEX_OR_ACCENT.test(raw) || RE_HAS_FR_ES_DIACRITIC.test(raw)) {
        const canTreatSharedAccentAsVi =
          !RE_HAS_STRICT_ES_FR_CHAR.test(spokenPrepared) &&
          primary !== 'fr' &&
          primary !== 'es' &&
          (inViClause || (primary === 'vi' && secondary === 'vi')) &&
          isPlausibleVietnameseBase(raw);
        if (canTreatSharedAccentAsVi) {
          langHint = 'vi';
          asciiClass = 'def-vi';
        } else {
          langHint =
            primary === 'fr' || primary === 'es'
              ? primary
              : secondary === 'fr' || secondary === 'es'
                ? secondary
                : foreignLatinLang;
          asciiClass = 'def-foreign';
        }
      } else {
        asciiClass = classifyLatinAsciiToken(raw, primary, secondary);
        const lower = raw.toLowerCase();
        const isLevelCode = RE_PROFICIENCY_LEVEL_CODE.test(raw);
        const isAllCapsAcronym = !isLevelCode && raw.length >= 2 && /^[A-Z0-9]{2,}$/.test(raw);
        const hasEnFrEsTarget =
          primary === 'en' ||
          secondary === 'en' ||
          primary === 'fr' ||
          secondary === 'fr' ||
          primary === 'es' ||
          secondary === 'es';
        if (isLevelCode && (inViClause || primary === 'vi' || textContainsViDiacritics)) {
          langHint = 'vi';
          asciiClass = 'def-vi';
        } else if (asciiClass === 'def-vi') {
          langHint = 'vi';
        } else if (asciiClass === 'def-foreign') {
          if (
            !hasEnFrEsTarget &&
            inViClause &&
            secondaryIsVi &&
            raw.length <= 4 &&
            /^[A-Z0-9]{1,4}$/.test(raw)
          ) {
            langHint = 'vi';
            asciiClass = 'def-vi';
          } else {
            langHint = foreignLatinLang;
          }
        } else if (
          (inViClause || primary === 'vi' || (textContainsViDiacritics && secondaryIsVi)) &&
          !isAllCapsAcronym &&
          ((primary === 'vi' && secondary === 'vi') ||
            (inViClause && (CONTEXTUAL_VI_ASCII.has(lower) || isLikelyVietnameseAsciiSyllable(lower))) ||
            ((primaryIsNonLatin || primary === 'vi') &&
              textContainsViDiacritics &&
              CONTEXTUAL_VI_ASCII.has(lower)))
        ) {
          langHint = 'vi';
        } else {
          langHint = foreignLatinLang;
        }
      }
      pieces.push({ raw, kind: 'word', langHint, clauseIdx, asciiClass });
    } else if (match[4]) {
      pieces.push({ raw, kind: 'num', langHint: null, clauseIdx });
    } else {
      pieces.push({ raw, kind: 'punct', langHint: null, clauseIdx });
    }
  }

  if (pieces.length === 0) {
    return [{ text: spokenPrepared, lang: primary, voice: voiceForLang(primary) }];
  }

  // Neighbor foreign-phrase propagation:
  // If an ambiguous ASCII token ("at", "me", "on", "in", "to", "do", "no", "go", "so", "day", "may", "can")
  // sits right next to a definitely-foreign word ("look", "watch", "put", "good", "morning", ...) within the
  // same phrase (only spaces/hyphens/apostrophes between them), treat the whole foreign run as foreignLatinLang.
  const canBridgeRun = (p: RawPiece) =>
    p.kind === 'punct' && /^[\s'"“”‘’\-]+$/.test(p.raw);
  const wordIndices: number[] = [];
  for (let i = 0; i < pieces.length; i++) {
    if (pieces[i].kind === 'word') wordIndices.push(i);
  }
  const hasStrongGapBetween = (aIdx: number, bIdx: number): boolean => {
    if (pieces[aIdx].clauseIdx !== pieces[bIdx].clauseIdx) return true;
    for (let k = aIdx + 1; k < bIdx; k++) {
      if (!canBridgeRun(pieces[k])) return true;
    }
    return false;
  };
  // Forward pass
  for (let w = 1; w < wordIndices.length; w++) {
    const prevIdx = wordIndices[w - 1];
    const currIdx = wordIndices[w];
    const prevP = pieces[prevIdx];
    const currP = pieces[currIdx];
    if (
      !hasStrongGapBetween(prevIdx, currIdx) &&
      currP.asciiClass === 'ambiguous' &&
      prevP.langHint === foreignLatinLang &&
      prevP.asciiClass === 'def-foreign'
    ) {
      currP.langHint = foreignLatinLang;
      currP.asciiClass = 'def-foreign';
    }
  }
  // Backward pass
  for (let w = wordIndices.length - 2; w >= 0; w--) {
    const currIdx = wordIndices[w];
    const nextIdx = wordIndices[w + 1];
    const currP = pieces[currIdx];
    const nextP = pieces[nextIdx];
    if (
      !hasStrongGapBetween(currIdx, nextIdx) &&
      currP.asciiClass === 'ambiguous' &&
      nextP.langHint === foreignLatinLang &&
      nextP.asciiClass === 'def-foreign'
    ) {
      currP.langHint = foreignLatinLang;
      currP.asciiClass = 'def-foreign';
    }
  }

  // Resolve numbers & punctuation by inheriting nearest spoken neighbor (prefer left for trailing punct, right for leading punct)
  const resolvedLangs: Array<SupportedTtsLang | null> = pieces.map((p) => p.langHint);

  let lastKnown: SupportedTtsLang | null = null;
  for (let i = 0; i < pieces.length; i++) {
    if (resolvedLangs[i]) {
      lastKnown = resolvedLangs[i];
    } else if (pieces[i].kind === 'num' || pieces[i].kind === 'punct') {
      if (lastKnown) {
        resolvedLangs[i] = lastKnown;
      }
    }
  }

  let nextKnown: SupportedTtsLang | null = primary;
  for (let i = pieces.length - 1; i >= 0; i--) {
    if (resolvedLangs[i]) {
      nextKnown = resolvedLangs[i];
    } else {
      resolvedLangs[i] = nextKnown;
    }
  }

  // Merge contiguous pieces with same language
  const merged: Array<{ text: string; lang: SupportedTtsLang }> = [];
  for (let i = 0; i < pieces.length; i++) {
    const lang = resolvedLangs[i] || primary;
    const raw = pieces[i].raw;
    const last = merged[merged.length - 1];
    if (last && last.lang === lang) {
      last.text += raw;
    } else {
      merged.push({ text: raw, lang });
    }
  }

  // Clean up whitespace & discard pure punctuation-only fragments (merging into adjacent spoken span)
  const spokenSpans: Array<{ text: string; lang: SupportedTtsLang }> = [];
  for (const item of merged) {
    const trimmed = item.text.trim();
    if (!trimmed) continue;
    if (!RE_HAS_SPOKEN_CHAR.test(trimmed)) {
      if (spokenSpans.length > 0) {
        spokenSpans[spokenSpans.length - 1].text = `${spokenSpans[spokenSpans.length - 1].text}${trimmed}`;
      }
      continue;
    }
    const prev = spokenSpans[spokenSpans.length - 1];
    if (prev && prev.lang === item.lang) {
      prev.text = `${prev.text} ${trimmed}`.replace(/\s+/g, ' ').trim();
    } else {
      spokenSpans.push({ text: trimmed, lang: item.lang });
    }
  }

  if (spokenSpans.length === 0) {
    return [{ text: clean, lang: primary, voice: voiceForLang(primary) }];
  }

  return spokenSpans.map((span) => ({
    text: span.text,
    lang: span.lang,
    voice: voiceForLang(span.lang),
  }));
}

/**
 * Cleans dangling quote/bracket wrappers at language-split boundaries so TTS voices
 * do not insert unnatural sentence pauses between embedded foreign phrases and native text.
 */
export function sanitizeSpanTextForSpeech(rawText: string): string {
  const cleaned = String(rawText || '')
    .replace(/^[\s「『（【《〈"“”‘’]+/, '')
    .replace(/[\s「『（【《〈」』）】》〉"“”‘’]+$/, '')
    .replace(/[「『」』]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || String(rawText || '').trim();
}
