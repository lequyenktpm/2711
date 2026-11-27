export const TAB_OUTPUT_SUBFOLDERS = {
  studio: 'Studio 9-16',
  reels: 'English Reels',
  merge: 'Edu Merge',
  karaoke: 'Edu Karaoke',
  reading: 'Reading Along',
  batch: 'Batch',
} as const;

const SOURCE_TAB_TO_SUBFOLDER: Record<string, string> = {
  'Studio 9:16': TAB_OUTPUT_SUBFOLDERS.studio,
  'Studio Video 9:16': TAB_OUTPUT_SUBFOLDERS.studio,
  'English Reels': TAB_OUTPUT_SUBFOLDERS.reels,
  'English Reels Studio': TAB_OUTPUT_SUBFOLDERS.reels,
  'Edu Merge': TAB_OUTPUT_SUBFOLDERS.merge,
  'Edu Karaoke': TAB_OUTPUT_SUBFOLDERS.karaoke,
  'Reading Along': TAB_OUTPUT_SUBFOLDERS.reading,
  Batch: TAB_OUTPUT_SUBFOLDERS.batch,
  'Batch Queue': TAB_OUTPUT_SUBFOLDERS.batch,
};

/**
 * Resolves the safe subfolder inside the project parent `output/` directory.
 * Ensures every tab writes into its own clean subfolder inside parent `output/`
 * (and prevents duplicate `output/output/...` nesting).
 */
export function resolveTabOutputSubfolder(
  sourceTab?: string,
  requestedSavePath?: string,
): string {
  const cleanRequested = String(requestedSavePath || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/^output(?:\/|$)/i, '')
    .replace(/^\/+|\/+$/g, '');

  const safeSegments = cleanRequested
    .split('/')
    .map((seg) => seg.trim().replace(/[<>:"|?*\x00-\x1f]/g, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((seg) => Boolean(seg) && seg !== '.' && seg !== '..');

  if (safeSegments.length > 0) {
    return safeSegments.join('/');
  }

  const mapped = sourceTab ? SOURCE_TAB_TO_SUBFOLDER[sourceTab.trim()] : undefined;
  return mapped || 'General';
}

/**
 * Produces a clean, meaningful file stem from a lesson/video title.
 * Strictly avoids underscores (`_`), appended dates, timestamps, random hashes,
 * and resolution tags (`_720p`, etc.) while keeping meaningful numbers like "Quiz 5s".
 */
export function cleanOutputTitleStem(raw: string, fallback = 'KineticSub Video'): string {
  let text = String(raw || '').trim();

  // Strip common media/subtitle/archive extensions (including chained ones like .mp4.part)
  text = text.replace(/\.(mp4|webm|mov|mkv|mp3|wav|m4a|srt|vtt|ass|zip|json|txt)$/i, '').trim();

  // Strip noisy filesystem characters cleanly without leaving awkward spaces inside 【...】 / [...]
  // Preserve '|' separator so filenames can show `<Level> | <Topic>` cleanly
  text = text
    .replace(/[?!？]+(?=\s*[】\]\)])/g, '')
    .replace(/[\\/:*?"<>\x00-\x1f]/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\s*&\s*/g, ' and ')
    .replace(/\s*[|｜]\s*/g, ' | ')
    .replace(/(?:\s*\|\s*){2,}/g, ' | ')
    .replace(/([【\[\(])\s+/g, '$1')
    .replace(/\s+([】\]\)])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  // Iteratively strip trailing machine-generated suffixes:
  // - ISO / compact dates (2026-11-24, 20261124, 24-11-2026)
  // - Epoch timestamps (>= 8 digits)
  // - Old exported tags like "reels abc12", "reading mix", "audio", "720p", "1080p", "merged"
  let prev = '';
  while (text !== prev) {
    prev = text;
    text = text
      .replace(/[\s\-]+(?:20\d{2}[-./]?\d{1,2}[-./]?\d{1,2}|\d{1,2}[-./]\d{1,2}[-./]20\d{2})$/i, '')
      .replace(/[\s\-]+\d{7,}$/, '')
      .replace(/[\s\-]+(?:540p|720p|1080p|1440p|2160p)$/i, '')
      .replace(/[\s\-]+(?:reels|reading\s+mix|bgm|mp4|mp3|wav|srt|vtt|zip|webm)$/i, '')
      .replace(/[\s\-]+([a-z0-9]{4,8})$/i, (m, token: string) => {
        // Only strip alphanumeric hash tokens (containing both digits & letters, 4..8 chars)
        return /[a-z]/i.test(token) && /\d/.test(token) && token.length >= 4 && token.length <= 8 ? '' : m;
      })
      .trim();
  }

  // Strip leading YYYY-MM-DD / numeric date prefixes if present
  text = text.replace(/^(?:20\d{2}[-./]?\d{1,2}[-./]?\d{1,2})[\s\-]+/, '').trim();

  // Collapse repeated hyphens/spaces (keeping intra-word hyphens like Check-in) and trim outer punctuation
  text = text
    .replace(/\s+-\s+/g, ' - ')
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\-\s|]+|[.\-\s|]+$/g, '')
    .trim();

  if (!text) {
    return fallback;
  }

  if (text.length > 136) {
    const sliced = text.slice(0, 136);
    const lastSpace = sliced.lastIndexOf(' ');
    text = (lastSpace > 54 ? sliced.slice(0, lastSpace) : sliced).replace(/[.\-\s|]+$/g, '').trim();
  }

  return text || fallback;
}

const RE_EXPLICIT_LEVEL_TOKEN = /\b(?:CEFR\s*)?([ABC][12](?:\s*(?:→|->|-)\s*[ABC][12])?)\b|\b(?:JLPT\s*)?(N[1-5](?:\s*(?:→|->|-)\s*N[1-5])?)\b|\b(HSK\s*[1-6](?:\s*(?:→|->|-)\s*[1-6])?)\b|\b(TOPIK\s*[1-6](?:\s*(?:→|->|-)\s*[1-6])?)\b/i;

type NamingLang = 'en' | 'ja' | 'zh' | 'ko' | 'fr' | 'es';

const AUDIENCE_LABELS_BY_LANG: Record<NamingLang, Record<string, string>> = {
  en: {
    A1: 'For Beginners (ENGLISH A1)',
    A2: 'For Elementary Learners (ENGLISH A2)',
    B1: 'For Intermediate Learners (ENGLISH B1)',
    B2: 'For Upper-Intermediate (ENGLISH B2)',
    C1: 'For Advanced Learners (ENGLISH C1)',
    C2: 'For Mastery Learners (ENGLISH C2)',
    'A1-C2': 'Beginner to Advanced (ENGLISH A1-C2)',
  },
  es: {
    A1: 'Para principiantes (ESPAÑOL A1)',
    A2: 'Para nivel básico (ESPAÑOL A2)',
    B1: 'Para nivel intermedio (ESPAÑOL B1)',
    B2: 'Para nivel intermedio-alto (ESPAÑOL B2)',
    C1: 'Para nivel avanzado (ESPAÑOL C1)',
    C2: 'Para nivel dominio (ESPAÑOL C2)',
    'A1-C2': 'De principiante a avanzado (ESPAÑOL A1-C2)',
  },
  fr: {
    A1: 'Pour grands débutants (FRANÇAIS A1)',
    A2: 'Pour niveau élémentaire (FRANÇAIS A2)',
    B1: 'Pour niveau intermédiaire (FRANÇAIS B1)',
    B2: 'Pour niveau avancé-intermédiaire (FRANÇAIS B2)',
    C1: 'Pour niveau avancé (FRANÇAIS C1)',
    C2: 'Pour niveau maîtrise (FRANÇAIS C2)',
    'A1-C2': 'De débutant à avancé (FRANÇAIS A1-C2)',
  },
  ja: {
    N5: '初級・入門者向け (日本語 N5)',
    N4: '初中級者向け (日本語 N4)',
    N3: '中級者向け (日本語 N3)',
    N2: '中上級者向け (日本語 N2)',
    N1: '上級者向け (日本語 N1)',
    'N5-N1': '初級から上級まで (日本語 N5-N1)',
  },
  zh: {
    'HSK 1': '适合零基础入门者 (中文 HSK 1)',
    'HSK 2': '适合初级学习者 (中文 HSK 2)',
    'HSK 3': '适合中级学习者 (中文 HSK 3)',
    'HSK 4': '适合中高级学习者 (中文 HSK 4)',
    'HSK 5': '适合高级学习者 (中文 HSK 5)',
    'HSK 6': '适合精通级学习者 (中文 HSK 6)',
    'HSK 1-6': '适合入门到高级 (中文 HSK 1-6)',
  },
  ko: {
    'TOPIK 1': '입문자·초급용 (한국어 TOPIK 1)',
    'TOPIK 2': '기초·초급자용 (한국어 TOPIK 2)',
    'TOPIK 3': '중급 학습자용 (한국어 TOPIK 3)',
    'TOPIK 4': '중상급 학습자용 (한국어 TOPIK 4)',
    'TOPIK 5': '고급 학습자용 (한국어 TOPIK 5)',
    'TOPIK 6': '최상급 학습자용 (한국어 TOPIK 6)',
    'TOPIK 1-6': '입문부터 고급까지 (한국어 TOPIK 1-6)',
  },
};

const GENERIC_LEVEL_PREFIX_BY_LANG: Record<NamingLang, string> = {
  en: 'For Learners',
  es: 'Para nivel',
  fr: 'Pour niveau',
  ja: '学習者向け',
  zh: '适合学习者',
  ko: '학습자용',
};

function resolveNamingLang(learningLanguage?: string, levelCode?: string, textHint?: string): NamingLang {
  const norm = String(learningLanguage || '').trim().toLowerCase();
  if (norm.startsWith('ja') || norm.includes('nhật') || norm.includes('japanese')) return 'ja';
  if (norm.startsWith('zh') || norm.includes('trung') || norm.includes('chinese')) return 'zh';
  if (norm.startsWith('ko') || norm.includes('hàn') || norm.includes('korean')) return 'ko';
  if (norm.startsWith('es') || norm.includes('tây ban nha') || norm.includes('spanish') || norm.includes('español')) return 'es';
  if (norm.startsWith('fr') || norm.includes('pháp') || norm.includes('french') || norm.includes('français')) return 'fr';
  if (norm.startsWith('en') || norm.includes('anh') || norm.includes('english')) return 'en';

  const lvl = String(levelCode || '').toUpperCase();
  if (/^N[1-5]/.test(lvl)) return 'ja';
  if (/^HSK/.test(lvl)) return 'zh';
  if (/^TOPIK/.test(lvl)) return 'ko';

  const sample = String(textHint || '').trim();
  if (/[\u3040-\u30ff]/.test(sample)) return 'ja';
  if (/[\uac00-\ud7af]/.test(sample)) return 'ko';
  if (/[\u4e00-\u9faf]/.test(sample)) return 'zh';
  if (/[ñ¿¡]/i.test(sample) || /\b(?:para|todo|con|una|pero|entre|empezó|terminó|mañana|gracias|español|pequeño|reencuentro|bicicleta|favor)\b/i.test(sample)) {
    return 'es';
  }
  if (/[çœæàâèêëîïôùû]/i.test(sample) || /\b(?:bonjour|merci|pour|avec|pourquoi|français|toujours|matin|comment)\b/i.test(sample)) {
    return 'fr';
  }
  return 'en';
}

export function normalizeCompactLevelLabel(rawLevel?: string): string {
  const clean = String(rawLevel || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const m = clean.match(RE_EXPLICIT_LEVEL_TOKEN);
  if (m) {
    const token = (m[1] || m[2] || m[3] || m[4] || '')
      .toUpperCase()
      .replace(/\s*(?:→|->)\s*/g, '-')
      .replace(/\s*-\s*/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
    return token;
  }
  return clean.slice(0, 24);
}

/**
 * Formats a level code into a clear audience-facing label in the target learning language
 * explaining who the lesson is for (e.g. `es` + `A2` -> `Para nivel básico (ESPAÑOL A2)`).
 */
export function formatAudienceLevelLabel(
  rawLevel?: string,
  learningLanguage?: string,
  textHint?: string,
): string {
  const clean = String(rawLevel || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const compact = normalizeCompactLevelLabel(clean);
  const lang = resolveNamingLang(learningLanguage, compact, textHint || clean);
  if (
    /^(?:for\s+|from\s+|para\s+|de\s+principiante|pour\s+|du\s+niveau|cho\s+người|dành\s+cho|适合|初級|初中級|中級|中上級|上級|입문|기초|중급|중상급|고급|최상급)/i.test(
      clean,
    )
  ) {
    if (clean.length <= 46) return clean;
    if (compact && AUDIENCE_LABELS_BY_LANG[lang]?.[compact]) {
      return AUDIENCE_LABELS_BY_LANG[lang][compact];
    }
    return clean.slice(0, 46).trim();
  }
  const map = AUDIENCE_LABELS_BY_LANG[lang];
  if (compact && map?.[compact]) {
    return map[compact];
  }
  return `${GENERIC_LEVEL_PREFIX_BY_LANG[lang]} (${compact || clean})`.slice(0, 46).trim();
}

export function extractLevelFromText(raw?: string): string {
  const text = String(raw || '').trim();
  if (!text) return '';
  const m = text.match(RE_EXPLICIT_LEVEL_TOKEN);
  if (!m) return '';
  return normalizeCompactLevelLabel(m[0]);
}

const RE_AUDIENCE_PREFIX = /^(?:for\s+(?:beginners?|elementary|intermediate|upper-intermediate|advanced|mastery|learners?)|from\s+beginner|para\s+(?:principiantes|nivel)|de\s+principiante|pour\s+(?:grands?\s+débutants?|niveau)|de\s+débutant|du\s+niveau|cho\s+người|dành\s+cho|cho\s+trình\s+độ|适合|(?:初級|初中級|中級|中上級|上級)|(?:입문|기초|중급|중상급|고급|최상급))/i;

function extractTrailingAudienceSegment(raw: string): string {
  const normalized = cleanOutputTitleStem(raw, '');
  if (!normalized.includes('|')) return '';
  const parts = normalized.split('|').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return '';
  const tail = parts[parts.length - 1];
  if (RE_AUDIENCE_PREFIX.test(tail)) {
    return tail;
  }
  if (
    /^(?:for\s+|from\s+|para\s+|pour\s+|de\s+|du\s+)/i.test(tail) &&
    Boolean(extractLevelFromText(tail))
  ) {
    return tail;
  }
  return '';
}

function concisePipeTopicPart(raw: string, maxLen = 84): string {
  let clean = cleanOutputTitleStem(raw, '')
    .replace(/^【(?:Phản xạ|Quick Speak|Bạn có biết[^】]*)?\s*(?:[ABC][12]|N[1-5]|HSK\s*[1-6]|TOPIK\s*[1-6])?】\s*/i, '')
    .replace(/\s*【(?:ENGLISH|ESPAÑOL|FRANÇAIS|日本語|中文|한국어)?\s*(?:[ABC][12](?:\s*-\s*[ABC][12])?|N[1-5](?:\s*-\s*N[1-5])?|HSK\s*[1-6](?:\s*-\s*[1-6])?|TOPIK\s*[1-6](?:\s*-\s*[1-6])?)】\s*$/i, '')
    .replace(/^(?:(?:CEFR|JLPT)\s*)?(?:[ABC][12](?:\s*-\s*[ABC][12])?|N[1-5](?:\s*-\s*N[1-5])?|HSK\s*[1-6](?:\s*-\s*[1-6])?|TOPIK\s*[1-6](?:\s*-\s*[1-6])?)\s*[-:|·•]\s*/i, '')
    .replace(/\s*\|\s*(?:for\s+|from\s+beginner|para\s+|de\s+principiante|pour\s+|de\s+débutant|du\s+niveau|cho\s+người|dành\s+cho|cho\s+trình\s+độ|适合|初級|初中級|中級|中上級|上級|입문|기초|중급|중상급|고급|최상급)[^|]+$/i, '')
    .replace(/\s*\|\s*(?:(?:CEFR|JLPT)\s*)?(?:[ABC][12](?:\s*-\s*[ABC][12])?|N[1-5](?:\s*-\s*N[1-5])?|HSK\s*[1-6](?:\s*-\s*[1-6])?|TOPIK\s*[1-6](?:\s*-\s*[1-6])?)$/i, '')
    .trim();
  if (!clean) return '';
  if (clean.length > maxLen) {
    const sliced = clean.slice(0, maxLen);
    const lastSpace = sliced.lastIndexOf(' ');
    clean = (lastSpace > 28 ? sliced.slice(0, lastSpace) : sliced).replace(/[.\-\s|]+$/g, '').trim();
  }
  return clean;
}

/**
 * Formats generated filenames with intriguing lesson title FIRST and target-language audience level AFTER:
 * e.g. `Todo empezó con un pequeño favor… y terminó en un reencuentro inesperado | Para nivel básico (ESPAÑOL A2)`,
 * `01 | Ordering Coffee | For Intermediate Learners (ENGLISH B1)`.
 */
export function buildLeveledOutputStem(opts: {
  title?: string;
  level?: string;
  topic?: string;
  learningLanguage?: string;
  prefix?: string;
  fallback?: string;
}): string {
  const fallback = opts.fallback || 'KineticSub Video';
  const rawTitle = String(opts.title || '').trim();
  const rawTopic = String(opts.topic || '').trim();
  const prefix = String(opts.prefix || '').trim();

  const titleAudienceSuffix = extractTrailingAudienceSegment(rawTitle);
  const explicitLevel = normalizeCompactLevelLabel(opts.level);
  const inferredLevel = extractLevelFromText(rawTitle) || extractLevelFromText(rawTopic);
  const resolvedLevelCode = explicitLevel || inferredLevel;
  const effectiveLang = resolveNamingLang(
    opts.learningLanguage,
    resolvedLevelCode,
    `${rawTitle} ${rawTopic}`,
  );
  const keepCustomTitleAudience =
    Boolean(titleAudienceSuffix) &&
    (!explicitLevel || extractLevelFromText(titleAudienceSuffix) === explicitLevel) &&
    !/^(?:cho\s+người|dành\s+cho|cho\s+trình\s+độ)/i.test(titleAudienceSuffix);
  const audienceLabel = keepCustomTitleAudience
    ? titleAudienceSuffix
    : formatAudienceLevelLabel(resolvedLevelCode, effectiveLang, `${rawTitle} ${rawTopic}`);

  const cleanTitle = cleanOutputTitleStem(rawTitle, '');
  const cleanTopic = concisePipeTopicPart(rawTopic, 54);
  const conciseTitle = concisePipeTopicPart(rawTitle, 84);

  const parts: string[] = [];
  if (prefix) parts.push(cleanOutputTitleStem(prefix, prefix));

  const coreSubject = conciseTitle || cleanTopic || cleanTitle;
  if (coreSubject) {
    if (
      cleanTopic &&
      conciseTitle &&
      !conciseTitle.toLowerCase().includes(cleanTopic.toLowerCase()) &&
      !cleanTopic.toLowerCase().includes(conciseTitle.toLowerCase()) &&
      conciseTitle.length < 18
    ) {
      parts.push(cleanTopic);
      parts.push(conciseTitle);
    } else {
      parts.push(coreSubject);
    }
  }

  if (audienceLabel) parts.push(audienceLabel);

  const combined = parts.filter(Boolean).join(' | ');
  if (!combined) return cleanOutputTitleStem(rawTitle || rawTopic, fallback);
  return cleanOutputTitleStem(combined, fallback);
}

/**
 * Windows NTFS forbids ASCII `|` (`0x7C`) in disk filenames and Chromium/Edge replaces it with `_`.
 * Maps `|` -> fullwidth `｜` (`U+FF5C`) strictly on Windows disk/download boundaries so files
 * save cleanly without losing the visual `Level ｜ Topic` separator.
 */
export function toPlatformSafeDiskFileName(
  fileName: string,
  forceWindows?: boolean,
): string {
  const clean = String(fileName || 'output').trim() || 'output';
  const isWin =
    typeof forceWindows === 'boolean'
      ? forceWindows
      : typeof process !== 'undefined' && typeof process.platform === 'string'
        ? process.platform === 'win32'
        : typeof navigator !== 'undefined' && /Win/i.test(navigator.platform || navigator.userAgent || '');
  if (!isWin) return clean;
  return clean.replace(/\|/g, '｜');
}

export function cleanDownloadFileName(
  rawTitle: string,
  extension: string,
  fallback = 'KineticSub Video',
): string {
  const cleanExt = extension.replace(/^\.+/, '').toLowerCase() || 'mp4';
  const stem = cleanOutputTitleStem(rawTitle, fallback);
  return `${stem}.${cleanExt}`;
}

