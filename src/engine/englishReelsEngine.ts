import { buildSceneGenerationPrompt, PromptVideoStyle } from './aiPromptBuilder';
import type { VectorPrimitive } from './customComponentTypes';
import { normalizeCustomComponent } from './customComponentStore';
import { resolveProjectOverlaps } from './layoutSolver';
import type { ExportAspectRatioId } from './mp4Config';
import { formatAudienceLevelLabel } from './outputNaming';
import {
  cleanReadingWorksheetInput,
  isWorksheetScaffoldingLine,
} from './readingPromptBuilder';
import {
  FlexibleSceneDocument,
  parseScenePlanJson,
  scenePlanToProject,
} from './scenePlanAdapter';
import { interpolateWordTimings, stripTimestampsFromScript } from './transcriptParser';
import {
  BackgroundImageConfig,
  CanvasThemeId,
  CartoonActionSegment,
  CartoonAnimationDefinition,
  CartoonAnimationParams,
  CartoonExpressionMood,
  DurationReportMeta,
  IllustrationPropData,
  IllustrationSceneIcon,
  IllustrationVariant,
  isDarkCanvasTheme,
  LayoutCompositionId,
  LessonProject,
  parseDurationReportMeta,
  SentenceCardProps,
  SubtitleDisplayConfig,
  TitleOverlayLayout,
  TranscriptCue,
  WatermarkOutroConfig,
} from './types';
import {
  getCartoonAnimationsPromptBlock,
  resolveCartoonAnimationForSignal,
} from './cartoonAnimationDb';
import {
  getCatalogSummaryForPrompt,
  isKnownIllustrationVariant,
  resolveContextualVisualForCue,
} from './vectorComponentDb';

export type ReelCardType = 'intro' | 'transition' | 'vocab' | 'translation' | 'quiz' | 'outro';
export type ReelMode = 'auto' | 'reading' | 'quiz' | 'vocab';
export type ReelCreationMode = 'source' | 'creator' | 'translation';
export type LearningLanguageId = 'en' | 'ja' | 'zh' | 'ko' | 'fr' | 'es';
export type CreatorFormatCategory =
  | 'auto'
  | 'vocab'
  | 'phrases'
  | 'phrasal_verbs'
  | 'mistakes'
  | 'grammar'
  | 'comparisons'
  | 'real_life'
  | 'shadowing_solo'
  | 'shadowing_dialogue'
  | 'podcast_solo'
  | 'podcast_duo'
  | 'trending_social'
  | 'workplace_tech'
  | 'news_storytelling';

export const CREATOR_FORMAT_OPTIONS: Array<{
  id: CreatorFormatCategory;
  label: string;
}> = [
  { id: 'auto', label: 'Tự động luân phiên (Khuyên dùng)' },
  { id: 'vocab', label: 'A. Vocabulary Lists (Từ vựng nâng cấp)' },
  { id: 'phrases', label: 'B. Natural Phrases (Cụm tự nhiên bản xứ)' },
  { id: 'phrasal_verbs', label: 'C. Phrasal Verbs (Cụm động từ / Mẫu câu)' },
  { id: 'mistakes', label: 'D. Common Mistakes (Lỗi sai thường gặp)' },
  { id: 'grammar', label: 'E. Grammar in Context (Ngữ pháp ngữ cảnh)' },
  { id: 'comparisons', label: 'F. Vocabulary Comparisons (So sánh từ)' },
  { id: 'real_life', label: 'G. Real-life Conversations (Giao tiếp đời sống)' },
  { id: 'shadowing_solo', label: 'H. Shadowing 1 người (Solo Shadowing / Nhại ngữ điệu)' },
  { id: 'shadowing_dialogue', label: 'I. Shadowing nhiều người (Hội thoại 2–3 người)' },
  { id: 'podcast_solo', label: 'J. Podcast 1 người (Solo Deep-Dive / Kể chuyện)' },
  { id: 'podcast_duo', label: 'K. Podcast 2 người (Talkshow 2 Host tung hứng)' },
  { id: 'trending_social', label: 'L. Chủ đề Hot & Trend hiện nay (MXH / Gen Z / Viral)' },
  { id: 'workplace_tech', label: 'M. Công sở, Phỏng vấn & AI / Tech (Kỷ nguyên mới)' },
  { id: 'news_storytelling', label: 'N. Tin tức nóng, Tâm lý & Đời sống thực tế' },
];

export interface LearningLanguageOption {
  id: LearningLanguageId;
  label: string;
  nativeName: string;
  systemName: string;
  defaultLevel: string;
  defaultVoice: string;
  voiceLang: string;
}

export const LEARNING_LANGUAGE_OPTIONS: LearningLanguageOption[] = [
  {
    id: 'en',
    label: 'Tiếng Anh (English)',
    nativeName: 'English',
    systemName: 'CEFR (A1 → C2)',
    defaultLevel: 'B1',
    defaultVoice: 'en-US-JennyNeural',
    voiceLang: 'en-US',
  },
  {
    id: 'ja',
    label: 'Tiếng Nhật (日本語)',
    nativeName: '日本語 (Japanese)',
    systemName: 'JLPT (N5 → N1)',
    defaultLevel: 'N5',
    defaultVoice: 'ja-JP-NanamiNeural',
    voiceLang: 'ja-JP',
  },
  {
    id: 'zh',
    label: 'Tiếng Trung (中文)',
    nativeName: '中文 (Chinese)',
    systemName: 'HSK (1 → 6)',
    defaultLevel: 'HSK 1',
    defaultVoice: 'zh-CN-XiaoxiaoNeural',
    voiceLang: 'zh-CN',
  },
  {
    id: 'ko',
    label: 'Tiếng Hàn (한국어)',
    nativeName: '한국어 (Korean)',
    systemName: 'TOPIK (1 → 6)',
    defaultLevel: 'TOPIK 1',
    defaultVoice: 'ko-KR-SunHiNeural',
    voiceLang: 'ko-KR',
  },
  {
    id: 'fr',
    label: 'Tiếng Pháp (Français)',
    nativeName: 'Français (French)',
    systemName: 'CEFR (A1 → C2)',
    defaultLevel: 'A2',
    defaultVoice: 'fr-FR-DeniseNeural',
    voiceLang: 'fr-FR',
  },
  {
    id: 'es',
    label: 'Tiếng Tây Ban Nha (Español)',
    nativeName: 'Español (Spanish)',
    systemName: 'CEFR (A1 → C2)',
    defaultLevel: 'A2',
    defaultVoice: 'es-ES-ElviraNeural',
    voiceLang: 'es-ES',
  },
];

export interface LanguageLevelOption {
  id: string;
  label: string;
  description: string;
}

export function getLevelsForLearningLanguage(lang: LearningLanguageId): LanguageLevelOption[] {
  if (lang === 'ja') {
    return [
      { id: 'N5', label: 'N5 (Sơ cấp · Nhập môn)', description: 'JLPT N5: Hiragana/Katakana, ~100 Kanji cơ bản, mẫu câu です/ます hàng ngày' },
      { id: 'N4', label: 'N4 (Sơ trung cấp)', description: 'JLPT N4: Giao tiếp hàng ngày tự nhiên, thể て/た/ない, cụm động từ thông dụng' },
      { id: 'N3', label: 'N3 (Trung cấp)', description: 'JLPT N3: Đọc hiểu tình huống thực tế, sắc thái lịch sự vs thân mật' },
      { id: 'N2', label: 'N2 (Trung cao cấp)', description: 'JLPT N2: Diễn đạt trang trọng, công sở, cụm từ nối học thuật & tin tức' },
      { id: 'N1', label: 'N1 (Cao cấp)', description: 'JLPT N1: Từ vựng sắc thái tinh tế, thành ngữ Hán tự & văn phong bản xứ nâng cao' },
      { id: 'N5→N1', label: 'N5 → N1 (Tăng dần Dễ → Khó)', description: 'Sắp xếp lộ trình từ cơ bản N5 nâng cấp dần đến cao cấp N1' },
    ];
  }
  if (lang === 'zh') {
    return [
      { id: 'HSK 1', label: 'HSK 1 (Sơ cấp 1)', description: 'HSK 1: Giao tiếp cơ bản, Pinyin & câu ngắn hàng ngày' },
      { id: 'HSK 2', label: 'HSK 2 (Sơ cấp 2)', description: 'HSK 2: Sinh hoạt hàng ngày, hỏi đường, mua sắm' },
      { id: 'HSK 3', label: 'HSK 3 (Trung cấp 1)', description: 'HSK 3: Diễn đạt ý kiến, công việc & học tập' },
      { id: 'HSK 4', label: 'HSK 4 (Trung cấp 2)', description: 'HSK 4: Tranh luận mượt mà, thành ngữ 4 chữ phổ biến' },
      { id: 'HSK 5', label: 'HSK 5 (Cao cấp 1)', description: 'HSK 5: Đọc báo, diễn đạt tinh tế như người bản xứ' },
      { id: 'HSK 6', label: 'HSK 6 (Cao cấp 2)', description: 'HSK 6: Thành ngữ & văn phong chuyên sâu' },
      { id: 'HSK 1→6', label: 'HSK 1 → 6 (Dễ → Khó)', description: 'Tăng dần độ khó từ HSK 1 lên HSK 6' },
    ];
  }
  if (lang === 'ko') {
    return [
      { id: 'TOPIK 1', label: 'TOPIK 1 (Sơ cấp 1)', description: 'TOPIK 1: Hangul, kính ngữ cơ bản & hội thoại ngắn' },
      { id: 'TOPIK 2', label: 'TOPIK 2 (Sơ cấp 2)', description: 'TOPIK 2: Giao tiếp đời sống hàng ngày tự nhiên' },
      { id: 'TOPIK 3', label: 'TOPIK 3 (Trung cấp 1)', description: 'TOPIK 3: Kính ngữ công sở & biểu đạt cảm xúc' },
      { id: 'TOPIK 4', label: 'TOPIK 4 (Trung cấp 2)', description: 'TOPIK 4: Cụm từ tự nhiên & cấu trúc ngữ pháp trung cấp' },
      { id: 'TOPIK 5', label: 'TOPIK 5 (Cao cấp 1)', description: 'TOPIK 5: Diễn đạt học thuật & tin tức' },
      { id: 'TOPIK 6', label: 'TOPIK 6 (Cao cấp 2)', description: 'TOPIK 6: Thành ngữ & sắc thái bản xứ cao cấp' },
      { id: 'TOPIK 1→6', label: 'TOPIK 1 → 6 (Dễ → Khó)', description: 'Tăng dần độ khó từ TOPIK 1 lên TOPIK 6' },
    ];
  }
  return [
    { id: 'A1', label: 'A1 (Sơ cấp · Beginner)', description: 'CEFR A1: Từ vựng nền tảng, câu ngắn dễ nhớ hàng ngày' },
    { id: 'A2', label: 'A2 (Cơ bản · Elementary)', description: 'CEFR A2: Giao tiếp đời sống quen thuộc, cụm từ thiết yếu' },
    { id: 'B1', label: 'B1 (Trung cấp · Intermediate)', description: 'CEFR B1: Cụm động từ thực tế, thay thế từ cũ kỹ bằng cách nói tự nhiên' },
    { id: 'B2', label: 'B2 (Trung cao cấp · Upper-Int)', description: 'CEFR B2: Từ vựng nâng cấp sắc bén cho công sở, thuyết trình & hội thoại' },
    { id: 'C1', label: 'C1 (Cao cấp · Advanced)', description: 'CEFR C1: Idioms tinh tế, sắc thái chính xác & diễn đạt chuyên nghiệp' },
    { id: 'C2', label: 'C2 (Thành thạo · Mastery)', description: 'CEFR C2: Ngôn ngữ giàu hình ảnh, sắc thái bản xứ bậc cao' },
    { id: 'A1→C2', label: 'A1 → C2 (Tăng dần Dễ → Khó)', description: 'Lộ trình đi từ câu đơn giản A1 nâng cấp dần lên C2' },
  ];
}

export function recommendCreatorItemCount(
  durationMinutes: number,
  includeExplanationSpeech = false,
): number {
  const safeMin = Math.max(0.5, Math.min(30, Number(durationMinutes) || 1));
  const itemsPerMin = includeExplanationSpeech ? 2.8 : 4.5;
  const raw = Math.round(safeMin * itemsPerMin);
  return Math.max(4, Math.min(60, raw));
}

export function recommendTranslationItemCount(
  durationMinutes: number,
  thinkSec = 4,
  repeatCount = 2,
): number {
  const safeMin = Math.max(0.5, Math.min(30, Number(durationMinutes) || 1));
  const safeThink = Math.max(1, Math.min(15, Number(thinkSec) || 4));
  const safeRepeat = Math.max(1, Math.min(5, Number(repeatCount) || 2));
  // Prompt (~2.5s) + Think (safeThink) + Repeats (safeRepeat * ~2.6s) + Tip (~3.2s)
  const avgSecPerCard = 2.5 + safeThink + safeRepeat * 2.6 + 3.2;
  const totalSecBudget = safeMin * 60 - 6; // reserve ~6s for intro + outro
  const raw = Math.round(totalSecBudget / Math.max(6, avgSecPerCard));
  return Math.max(3, Math.min(60, raw));
}

export interface ReelCardVisualConfig {
  variant?: IllustrationVariant;
  title?: string;
  subtitle?: string;
  labels?: string[];
  value?: number;
  formula?: string;
  highlightWord?: string;
  sceneIcon?: IllustrationSceneIcon;
  speechText?: string;
  reactionText?: string;
  checklist?: Array<{ text: string; highlight?: string; ok?: boolean }>;
  upgrades?: Array<{ prompt: string; upgrade: string; badgeColor?: string }>;
  boxes?: Array<{ title: string; subtitle?: string; icon: 'dot' | 'surface' | 'cube' | 'check' | 'cross' | 'letter'; accent?: string }>;
  nodes?: Array<{ label: string; sublabel?: string; color?: string; sceneIcon?: IllustrationSceneIcon }>;
  customPrimitives?: VectorPrimitive[];
}

export interface ReelCard {
  id: string;
  type: ReelCardType;
  badge: string;
  indexLabel?: string;
  kicker?: string;
  speaker?: string;
  speakerGender?: 'male' | 'female';
  speakerRole?: string;
  title: string;
  content: string;
  sourcePrompt?: string;
  example?: string;
  phonetic?: string;
  translation?: string;
  explanationSpeech?: string;
  learningLang?: LearningLanguageId;
  vocabNotes?: string;
  grammarNote?: string;
  contextExcerpt?: string;
  ttsText: string;
  ttsAnswerText?: string;
  thinkSec?: number;
  repeatCount?: number;
  options?: string[];
  answerIndex?: number;
  explanation?: string;
  durationSec?: number;
  cartoonAction?: string;
  cartoonMood?: CartoonExpressionMood;
  cartoonAnimationSpec?: Partial<CartoonAnimationParams>;
  visual?: ReelCardVisualConfig;
}

export interface ReelCardTimingMeta {
  totalSec: number;
  questionSec?: number;
  thinkSec?: number;
  answerSec?: number;
  repeatDurationsSec?: number[];
  repeatPauseSec?: number;
  nuanceSec?: number;
}

export interface ReelExtractedExercise {
  id: string;
  title: string;
  mode: Exclude<ReelMode, 'auto'>;
  rawText: string;
}

export interface ReelDirectoryLink {
  title: string;
  url: string;
}

export interface ReelScrapeResult {
  url: string;
  title: string;
  isDirectoryPage: boolean;
  links: ReelDirectoryLink[];
  rawText: string;
  exercises: ReelExtractedExercise[];
  detectedMode: Exclude<ReelMode, 'auto'>;
}

export interface ParsedEnglishReelsResponse {
  title: string;
  mode: Exclude<ReelMode, 'auto'>;
  level?: string;
  creatorSubMode?: string;
  compositionId?: LayoutCompositionId;
  learningLang?: LearningLanguageId;
  thinkSec?: number;
  repeatCount?: number;
  isTranslationMode?: boolean;
  cards: ReelCard[];
  cartoonAnimations?: Partial<CartoonAnimationDefinition>[];
  sceneJson?: FlexibleSceneDocument | null;
  durationReport?: DurationReportMeta;
}

export function inferLearningLangFromCards(
  cards: ReelCard[],
  explicitLang?: string,
): LearningLanguageId {
  const norm = String(explicitLang || '').trim().toLowerCase();
  if (norm === 'en' || norm === 'ja' || norm === 'zh' || norm === 'ko' || norm === 'fr' || norm === 'es') {
    return norm;
  }
  const perCardExplicit = cards.find(
    (c) =>
      c.learningLang &&
      (c.learningLang === 'en' ||
        c.learningLang === 'ja' ||
        c.learningLang === 'zh' ||
        c.learningLang === 'ko' ||
        c.learningLang === 'fr' ||
        c.learningLang === 'es'),
  )?.learningLang;
  if (perCardExplicit) return perCardExplicit;

  const targetSample = cards
    .filter((c) => c.type === 'vocab' || c.type === 'quiz' || c.type === 'translation')
    .map((c) => `${c.title || ''} ${c.content || ''} ${c.ttsText || ''}`)
    .join(' ')
    .trim();
  const sample = targetSample || cards.map((c) => `${c.title || ''} ${c.ttsText || ''}`).join(' ');

  if (/[\u3040-\u30ff\u31f0-\u31ff]/.test(sample)) return 'ja';
  if (/[\u4e00-\u9faf\u3400-\u4dbf]/.test(sample)) return 'zh';
  if (/[\uac00-\ud7af\u1100-\u11ff]/.test(sample)) return 'ko';
  if (
    /[çœæëïîûùàéèêô]/i.test(sample) &&
    /\b(?:s'il vous plaît|bonjour|merci|au revoir|c'est|je voudrais|vous|nous|avec|pourquoi|très|aujourd'hui|est-ce)\b/i.test(
      sample,
    )
  ) {
    return 'fr';
  }
  if (
    /\b(?:s'il vous plaît|bonjour|merci|au revoir|c'est|je voudrais|aujourd'hui|bonsoir)\b|[çœæ]/i.test(
      sample,
    )
  ) {
    return 'fr';
  }
  if (
    /[¿¡ñ]|\b(?:por favor|muchas gracias|buenos días|buenas tardes|perdón|mañana|después|también|porque|cuando|hola|gracias|quiero|puedo|tengo|están|todos)\b/i.test(
      sample,
    )
  ) {
    return 'es';
  }
  return 'en';
}

function makeCardId(index: number): string {
  return `reel-card-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 5)}`;
}

export function detectReelMode(text: string): Exclude<ReelMode, 'auto'> {
  const lower = text.toLowerCase();
  const hasQuizSignals =
    /\btrue\s*\/\s*false\b|\btrue or false\b|\bmultiple choice\b|\bcomprehension\b/i.test(lower) ||
    /(^|\n)\s*(?:q?\d+[.)]|\([a-d]\)|[a-d][.)])\s+/i.test(text);
  if (hasQuizSignals) return 'quiz';

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const vocabLineCount = lines.filter((l) =>
    /^[\w\s'-]{1,34}\s*(?:\/[^/]+\/\s*)?(?:[-–—:=]|→)\s*.+/.test(l),
  ).length;
  if (vocabLineCount >= 2 || (lines.length >= 3 && vocabLineCount >= lines.length * 0.45)) {
    return 'vocab';
  }
  return 'reading';
}

export function splitMultipleExercisesFromText(text: string): ReelExtractedExercise[] {
  const cleaned = text.replace(/\r\n/g, '\n').trim();
  if (!cleaned) return [];

  const headingRe =
    /(?=^(?:#{1,3}\s+|(?:Task|Exercise|Part|Reading|Quiz|Vocabulary|Activity|Lesson)\s*\d+[:.\-–\s]))/gim;
  const rawParts = cleaned
    .split(headingRe)
    .map((s) => s.trim())
    .filter((s) => {
      if (s.length < 30) return false;
      const bodyCheck = cleanReadingWorksheetInput(s);
      return bodyCheck.lines.length >= 1 && bodyCheck.bodyText.length >= 25;
    });

  if (rawParts.length <= 1) {
    const cleanedDoc = cleanReadingWorksheetInput(cleaned);
    return [
      {
        id: 'ex-1',
        title: cleanedDoc.title || 'Bài học chính',
        mode: detectReelMode(cleanedDoc.bodyText || cleaned),
        rawText: cleanedDoc.bodyText || cleaned,
      },
    ];
  }

  return rawParts.slice(0, 10).map((part, idx) => {
    const cleanedPart = cleanReadingWorksheetInput(part);
    return {
      id: `ex-${idx + 1}`,
      title: cleanedPart.title || `Bài tập ${idx + 1}`,
      mode: detectReelMode(cleanedPart.bodyText || part),
      rawText: cleanedPart.bodyText || part,
    };
  });
}

export function estimateCardSpeechDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Number(Math.max(2.2, Math.min(18, words / 2.4 + 0.65)).toFixed(2));
}

function isMetadataNoiseLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (isWorksheetScaffoldingLine(t)) return true;
  if (
    /^(?:true\s*\/\s*false(?:\s+quiz)?|multiple\s*choice|comprehension(?:\s+quiz)?|vocabulary(?:\s+list)?|reading(?:\s+passage)?|answer\s*key)\s*:?$/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/^(?:Answer|Key|Đáp án|Click here|Share|Read more|Subscribe)\b/i.test(t) && t.length < 45) {
    return true;
  }
  return false;
}

export interface ReelLocaleStrings {
  code: 'vi' | 'en' | 'ja' | 'zh' | 'ko' | 'fr' | 'es' | 'learning' | 'none';
  targetLanguageLabel: string;
  stageStepsQuiz: [string, string, string, string];
  stageStepsSimple: [string, string, string];
  roadmapLabel: string;
  introBadgeQuiz: string;
  introBadgeVocab: string;
  introBadgeDefault: string;
  introGoalPrefix: string;
  introRoadmapLine: string;
  introVisualSubtitle: string;
  readingBadgePrefix: string;
  vocabBadgePrefix: string;
  sentenceTitlePrefix: string;
  outroBadge: string;
  outroTitle: string;
  outroContentPrefix: string;
  outroTranslation: string;
  outroLabels: [string, string, string];
  quizAskTag: string;
  thinkCountdown: (sec: number) => string;
  chooseAnswerTitle: (sec: number) => string;
  chooseAnswerSubtitle: string;
  correctAnswerPill: (letter: string, opt: string) => string;
  correctAnswerCardTitle: (letter: string, opt: string) => string;
  correctBadge: string;
  correctStamp: string;
  correctOptionSublabel: string;
  contextPassageTitle: string;
  contextPassageUrl: string;
  listenChooseSubtext: string;
  defaultExplanation: (letter: string, opt: string) => string;
  lessonOverviewFormula: string;
  vocabPrefix: string;
  grammarPrefix: string;
  promptExampleBadge: string;
  promptExampleIntroContent: string;
  promptExampleTranslation: string;
  promptExampleVocabTranslation: string;
  promptExampleContextTitle: string;
  promptExampleExplanation: string;
  promptExampleOutroContent: string;
  promptExampleOutroTranslation: string;
  promptExampleOutroLabels: [string, string, string];
  promptExampleStickyLabels: [string, string];
}

export function getReelLocaleStrings(
  targetLang?: string,
  learningLang?: LearningLanguageId,
): ReelLocaleStrings {
  const rawNorm = (targetLang || 'Tiếng Việt').trim().toLowerCase();
  const isLearningSelf =
    rawNorm === 'learning' ||
    rawNorm === 'self' ||
    rawNorm === 'target' ||
    rawNorm.includes('ngôn ngữ muốn học') ||
    rawNorm.includes('ngôn ngữ đang học');

  if (isLearningSelf && !learningLang) {
    return {
      code: 'learning',
      targetLanguageLabel:
        'chính ngôn ngữ muốn học của bài (tự nhận diện learningLang từ nội dung nguồn và giải thích hoàn toàn bằng đúng ngôn ngữ đó, KHÔNG dịch sang tiếng Việt)',
      stageStepsQuiz: ['1. Intro', '2. Lesson', '3. Quiz 5s', '4. Recap'],
      stageStepsSimple: ['1. Intro', '2. Lesson', '3. Recap'],
      roadmapLabel: 'Lesson Flow',
      introBadgeQuiz: 'QUIZ LESSON',
      introBadgeVocab: 'VOCAB LESSON',
      introBadgeDefault: "TODAY'S LESSON",
      introGoalPrefix: "Today's Focus:",
      introRoadmapLine: 'Plan: 1. Intro · 2. Core Lesson · 3. Recap',
      introVisualSubtitle: 'Intro · Core Expressions · Deep Explanation · Recap',
      readingBadgePrefix: 'LESSON',
      vocabBadgePrefix: 'KEY ITEM',
      sentenceTitlePrefix: 'Point',
      outroBadge: 'RECAP',
      outroTitle: 'Lesson Recap',
      outroContentPrefix: 'Completed:',
      outroTranslation: 'Review these key expressions and practice speaking aloud every day!',
      outroLabels: ['Listen', 'Understand', 'Speak Daily'],
      quizAskTag: 'QUESTION',
      thinkCountdown: (sec) => `⏱️ THINK: ${sec} SEC`,
      chooseAnswerTitle: (sec) => `CHOOSE IN ${sec}s`,
      chooseAnswerSubtitle: 'Pick the best option before time runs out!',
      correctAnswerPill: (letter, opt) => `✓ CORRECT: ${letter}. ${opt}`,
      correctAnswerCardTitle: (letter, opt) => `Correct Answer: ${letter}. ${opt}`,
      correctBadge: 'CORRECT',
      correctStamp: 'CORRECT!',
      correctOptionSublabel: 'Correct Answer',
      contextPassageTitle: 'REFERENCE PASSAGE',
      contextPassageUrl: 'https://english.practice/passage-check',
      listenChooseSubtext: 'Listen carefully and choose the best option!',
      defaultExplanation: (letter, opt) => `The correct answer is ${letter}. ${opt}.`,
      lessonOverviewFormula: "TODAY'S GOAL",
      vocabPrefix: 'Key Words:',
      grammarPrefix: 'Grammar:',
      promptExampleBadge: '<Badge bằng đúng learningLang>',
      promptExampleIntroContent: '<Mục tiêu bài học viết bằng đúng learningLang>',
      promptExampleTranslation: '<Tóm tắt lộ trình viết bằng đúng learningLang>',
      promptExampleVocabTranslation: '<Giải nghĩa & ngữ cảnh hoàn toàn bằng đúng learningLang>',
      promptExampleContextTitle: '<Tiêu đề đoạn văn đối chiếu bằng đúng learningLang>',
      promptExampleExplanation: '<Giải thích đáp án hoàn toàn bằng đúng learningLang>',
      promptExampleOutroContent: '<Lời tổng kết viết bằng đúng learningLang>',
      promptExampleOutroTranslation: '<Lời nhắc luyện tập hàng ngày bằng đúng learningLang>',
      promptExampleOutroLabels: ['Key Point 1', 'Key Point 2', 'Speak Daily'],
      promptExampleStickyLabels: ['Keyword nuance', 'Natural usage tip'],
    };
  }

  const norm = isLearningSelf && learningLang ? learningLang : rawNorm;

  if (norm === '日本語' || norm === 'japanese' || norm === 'ja' || norm === 'tiếng nhật') {
    return {
      code: 'ja',
      targetLanguageLabel: '日本語 (Japanese)',
      stageStepsQuiz: ['1. 導入', '2. 読解', '3. クイズ', '4. まとめ'],
      stageStepsSimple: ['1. 導入', '2. 学習', '3. まとめ'],
      roadmapLabel: '構成',
      introBadgeQuiz: 'クイズレッスン',
      introBadgeVocab: '語彙レッスン',
      introBadgeDefault: '今日のレッスン',
      introGoalPrefix: '今日のテーマ:',
      introRoadmapLine: '流れ: 1. 導入 · 2. 読解と語彙 · 3. クイズ＆まとめ',
      introVisualSubtitle: '導入 · 読解＆単語 · クイズ · まとめ',
      readingBadgePrefix: 'リーディング',
      vocabBadgePrefix: '単語',
      sentenceTitlePrefix: '文',
      outroBadge: 'まとめ',
      outroTitle: 'レッスン振り返り',
      outroContentPrefix: '学習完了:',
      outroTranslation: '新しい単語と文法を毎日声に出して復習しましょう！',
      outroLabels: ['導入', '読解・単語', 'まとめ'],
      quizAskTag: '問題',
      thinkCountdown: (sec) => `⏱️ 考える時間: ${sec}秒`,
      chooseAnswerTitle: (sec) => `あと${sec}秒で選択`,
      chooseAnswerSubtitle: '時間内に正しい答えを選びましょう！',
      correctAnswerPill: (letter, opt) => `✓ 正解: ${letter}. ${opt}`,
      correctAnswerCardTitle: (letter, opt) => `正解: ${letter}. ${opt}`,
      correctBadge: '正解',
      correctStamp: '正解!',
      correctOptionSublabel: '正解',
      contextPassageTitle: '参照パッセージ',
      contextPassageUrl: 'https://english.practice/passage-check',
      listenChooseSubtext: '音声を聞いて正しい答えを選びましょう！',
      defaultExplanation: (letter, opt) => `正解は ${letter}. ${opt} です。`,
      lessonOverviewFormula: '今日の目標',
      vocabPrefix: '重要語彙:',
      grammarPrefix: '文法:',
      promptExampleBadge: '今日のレッスン',
      promptExampleIntroContent: '今日の学習: サバイバル読解 & be going to の使い方',
      promptExampleTranslation: '構成: 1. 導入 → 2. 読解と重要語彙 → 3. クイズ5秒',
      promptExampleVocabTranslation: '語彙: exciting (ワクワクする) · programme (番組)\\n文法: 現在形（番組内容の説明）',
      promptExampleContextTitle: '参照パッセージ',
      promptExampleExplanation: '本文に live in the mountains for ten days と書かれています。',
      promptExampleOutroContent: '重要語彙と be going to を声に出して復習しよう！',
      promptExampleOutroTranslation: '毎日音読して定着させましょう！',
      promptExampleOutroLabels: ['exciting / prize', 'be going to + V', 'クイズ完了'],
      promptExampleStickyLabels: ['exciting = ワクワクする', 'programme = 番組'],
    };
  }
  if (norm === '中文' || norm === 'chinese' || norm === 'zh' || norm === 'zh-cn' || norm === 'tiếng trung') {
    return {
      code: 'zh',
      targetLanguageLabel: '中文 (Simplified Chinese)',
      stageStepsQuiz: ['1. 导入', '2. 精讲', '3. 测验 5秒', '4. 总结'],
      stageStepsSimple: ['1. 导入', '2. 学习', '3. 总结'],
      roadmapLabel: '课程结构',
      introBadgeQuiz: '互动测验课',
      introBadgeVocab: '词汇表达课',
      introBadgeDefault: '今日课程',
      introGoalPrefix: '今日主题：',
      introRoadmapLine: '流程：1. 导入 · 2. 核心表达精讲 · 3. 测验与总结',
      introVisualSubtitle: '导入 · 核心表达 · 深度解析 · 总结',
      readingBadgePrefix: '精读',
      vocabBadgePrefix: '核心表达',
      sentenceTitlePrefix: '例句',
      outroBadge: '总结',
      outroTitle: '课程总结',
      outroContentPrefix: '已完成学习：',
      outroTranslation: '每天大声跟读今天学到的地道表达吧！',
      outroLabels: ['听力输入', '表达解析', '开口跟读'],
      quizAskTag: '提问',
      thinkCountdown: (sec) => `⏱️ 思考时间：${sec}秒`,
      chooseAnswerTitle: (sec) => `请在 ${sec}秒 内选择`,
      chooseAnswerSubtitle: '倒计时结束前选出最自然的表达！',
      correctAnswerPill: (letter, opt) => `✓ 正确答案：${letter}. ${opt}`,
      correctAnswerCardTitle: (letter, opt) => `正确答案：${letter}. ${opt}`,
      correctBadge: '正确',
      correctStamp: '正确！',
      correctOptionSublabel: '正确答案',
      contextPassageTitle: '参考短文',
      contextPassageUrl: 'https://english.practice/passage-check',
      listenChooseSubtext: '仔细听并选出最合适的选项！',
      defaultExplanation: (letter, opt) => `正确答案是 ${letter}. ${opt}。`,
      lessonOverviewFormula: '今日目标',
      vocabPrefix: '重点词汇：',
      grammarPrefix: '语法要点：',
      promptExampleBadge: '今日课程',
      promptExampleIntroContent: '今日学习：用更地道的中文表达日常需求与礼貌用语',
      promptExampleTranslation: '流程：1. 导入 → 2. 核心表达与语境辨析 → 3. 课后总结',
      promptExampleVocabTranslation: '重点表达：不好意思（礼貌开场白）· 语境：请陌生人帮忙或道歉时使用',
      promptExampleContextTitle: '参考语境',
      promptExampleExplanation: '这个表达比直接提问更温和礼貌。',
      promptExampleOutroContent: '保存这节课，每天大声练习！',
      promptExampleOutroTranslation: '收藏并大声跟读，立刻提升口语自然度！',
      promptExampleOutroLabels: ['礼貌开场', '地道语感', '每日跟读'],
      promptExampleStickyLabels: ['不好意思 = 礼貌开场', '比生硬直问更自然'],
    };
  }
  if (norm === '한국어' || norm === 'korean' || norm === 'ko' || norm === 'ko-kr' || norm === 'tiếng hàn') {
    return {
      code: 'ko',
      targetLanguageLabel: '한국어 (Korean)',
      stageStepsQuiz: ['1. 도입', '2. 핵심 학습', '3. 퀴즈 5초', '4. 정리'],
      stageStepsSimple: ['1. 도입', '2. 핵심 학습', '3. 정리'],
      roadmapLabel: '학습 흐름',
      introBadgeQuiz: '퀴즈 레슨',
      introBadgeVocab: '표현 레슨',
      introBadgeDefault: '오늘의 레슨',
      introGoalPrefix: '오늘의 주제:',
      introRoadmapLine: '순서: 1. 도입 · 2. 핵심 표현 설명 · 3. 퀴즈 및 정리',
      introVisualSubtitle: '도입 · 핵심 표현 · 상세 설명 · 정리',
      readingBadgePrefix: '읽기',
      vocabBadgePrefix: '핵심 표현',
      sentenceTitlePrefix: '문장',
      outroBadge: '정리',
      outroTitle: '학습 정리',
      outroContentPrefix: '학습 완료:',
      outroTranslation: '오늘 배운 자연스러운 표현을 매일 큰 소리로 연습해 보세요!',
      outroLabels: ['듣기', '표현 이해', '따라 말하기'],
      quizAskTag: '문제',
      thinkCountdown: (sec) => `⏱️ 생각 시간: ${sec}초`,
      chooseAnswerTitle: (sec) => `${sec}초 안에 선택`,
      chooseAnswerSubtitle: '시간 안에 가장 자연스러운 답을 골라 보세요!',
      correctAnswerPill: (letter, opt) => `✓ 정답: ${letter}. ${opt}`,
      correctAnswerCardTitle: (letter, opt) => `정답: ${letter}. ${opt}`,
      correctBadge: '정답',
      correctStamp: '정답!',
      correctOptionSublabel: '정답',
      contextPassageTitle: '참고 지문',
      contextPassageUrl: 'https://english.practice/passage-check',
      listenChooseSubtext: '잘 듣고 가장 알맞은 보기를 고르세요!',
      defaultExplanation: (letter, opt) => `정답은 ${letter}. ${opt}입니다.`,
      lessonOverviewFormula: '오늘의 목표',
      vocabPrefix: '핵심 어휘:',
      grammarPrefix: '문법 포인트:',
      promptExampleBadge: '오늘의 레슨',
      promptExampleIntroContent: '오늘의 주제: 식당과 카페에서 쓰는 자연스러운 한국어 표현',
      promptExampleTranslation: '흐름: 1. 도입 → 2. 핵심 표현과 상황 설명 → 3. 마무리',
      promptExampleVocabTranslation: '핵심 표현: 잠시만요 (정중히 부를 때) · 상황: 직원을 부르거나 양해를 구할 때 사용',
      promptExampleContextTitle: '참고 문맥',
      promptExampleExplanation: '상황에 맞는 정중한 표현을 사용하면 훨씬 자연스럽게 들립니다.',
      promptExampleOutroContent: '오늘 배운 표현을 저장하고 매일 연습해 보세요!',
      promptExampleOutroTranslation: '매일 큰 소리로 따라 읽으면 말하기가 훨씬 자연스러워집니다!',
      promptExampleOutroLabels: ['핵심 표현', '자연스러운 어감', '매일 복습'],
      promptExampleStickyLabels: ['잠시만요 = 정중한 호칭', '실제 대화에 바로 활용'],
    };
  }
  if (norm === 'français' || norm === 'french' || norm === 'fr' || norm === 'tiếng pháp') {
    return {
      code: 'fr',
      targetLanguageLabel: 'Français (French)',
      stageStepsQuiz: ['1. Intro', '2. Leçon', '3. Quiz 5s', '4. Bilan'],
      stageStepsSimple: ['1. Intro', '2. Leçon', '3. Bilan'],
      roadmapLabel: 'Plan du cours',
      introBadgeQuiz: 'LEÇON QUIZ',
      introBadgeVocab: 'VOCABULAIRE',
      introBadgeDefault: 'LEÇON DU JOUR',
      introGoalPrefix: 'Objectif :',
      introRoadmapLine: 'Plan : 1. Intro · 2. Expressions clés · 3. Bilan',
      introVisualSubtitle: 'Intro · Expressions clés · Nuances · Bilan',
      readingBadgePrefix: 'LECTURE',
      vocabBadgePrefix: 'EXPRESSION',
      sentenceTitlePrefix: 'Phrase',
      outroBadge: 'BILAN',
      outroTitle: 'Bilan de la leçon',
      outroContentPrefix: 'Leçon terminée :',
      outroTranslation: 'Révisez ces expressions et prononcez-les à voix haute chaque jour !',
      outroLabels: ['Écouter', 'Comprendre', 'Pratiquer'],
      quizAskTag: 'QUESTION',
      thinkCountdown: (sec) => `⏱️ RÉFLEXION : ${sec}s`,
      chooseAnswerTitle: (sec) => `CHOISISSEZ EN ${sec}s`,
      chooseAnswerSubtitle: 'Trouvez la réponse la plus naturelle avant la fin du chrono !',
      correctAnswerPill: (letter, opt) => `✓ RÉPONSE : ${letter}. ${opt}`,
      correctAnswerCardTitle: (letter, opt) => `Bonne réponse : ${letter}. ${opt}`,
      correctBadge: 'CORRECT',
      correctStamp: 'BRAVO !',
      correctOptionSublabel: 'Bonne réponse',
      contextPassageTitle: 'TEXTE DE RÉFÉRENCE',
      contextPassageUrl: 'https://english.practice/passage-check',
      listenChooseSubtext: 'Écoutez bien et choisissez la bonne option !',
      defaultExplanation: (letter, opt) => `La bonne réponse est ${letter}. ${opt}.`,
      lessonOverviewFormula: 'OBJECTIF DU JOUR',
      vocabPrefix: 'Mots clés :',
      grammarPrefix: 'Grammaire :',
      promptExampleBadge: 'LEÇON DU JOUR',
      promptExampleIntroContent: 'Expressions naturelles en français au quotidien',
      promptExampleTranslation: 'Plan : 1. Intro → 2. Nuances & exemples → 3. Bilan',
      promptExampleVocabTranslation: 'Nuance : expression polie utilisée dans la vie courante.',
      promptExampleContextTitle: 'CONTEXTE',
      promptExampleExplanation: 'Cette formulation sonne beaucoup plus naturelle à l’oral.',
      promptExampleOutroContent: 'Enregistrez cette leçon pour la revoir demain !',
      promptExampleOutroTranslation: 'Pratiquez à voix haute chaque jour pour progresser vite !',
      promptExampleOutroLabels: ['Expressions', 'Nuances', 'Pratique orale'],
      promptExampleStickyLabels: ['Tournure polie', 'Usage quotidien'],
    };
  }
  if (norm === 'español' || norm === 'spanish' || norm === 'es' || norm === 'tiếng tây ban nha') {
    return {
      code: 'es',
      targetLanguageLabel: 'Español (Spanish)',
      stageStepsQuiz: ['1. Intro', '2. Lección', '3. Quiz 5s', '4. Resumen'],
      stageStepsSimple: ['1. Intro', '2. Lección', '3. Resumen'],
      roadmapLabel: 'Estructura',
      introBadgeQuiz: 'LECCIÓN QUIZ',
      introBadgeVocab: 'VOCABULARIO',
      introBadgeDefault: 'LECCIÓN DE HOY',
      introGoalPrefix: 'Objetivo:',
      introRoadmapLine: 'Plan: 1. Intro · 2. Expresiones clave · 3. Resumen',
      introVisualSubtitle: 'Intro · Expresiones clave · Matices · Resumen',
      readingBadgePrefix: 'LECTURA',
      vocabBadgePrefix: 'EXPRESIÓN',
      sentenceTitlePrefix: 'Frase',
      outroBadge: 'RESUMEN',
      outroTitle: 'Resumen de la lección',
      outroContentPrefix: 'Lección completada:',
      outroTranslation: '¡Repasa estas expresiones y dilas en voz alta cada día!',
      outroLabels: ['Escuchar', 'Entender', 'Hablar'],
      quizAskTag: 'PREGUNTA',
      thinkCountdown: (sec) => `⏱️ PIENSA: ${sec}s`,
      chooseAnswerTitle: (sec) => `ELIGE EN ${sec}s`,
      chooseAnswerSubtitle: '¡Elige la expresión más natural antes de que acabe el tiempo!',
      correctAnswerPill: (letter, opt) => `✓ CORRECTO: ${letter}. ${opt}`,
      correctAnswerCardTitle: (letter, opt) => `Respuesta correcta: ${letter}. ${opt}`,
      correctBadge: 'CORRECTO',
      correctStamp: '¡CORRECTO!',
      correctOptionSublabel: 'Respuesta correcta',
      contextPassageTitle: 'TEXTO DE REFERENCIA',
      contextPassageUrl: 'https://english.practice/passage-check',
      listenChooseSubtext: '¡Escucha con atención y elige la mejor opción!',
      defaultExplanation: (letter, opt) => `La respuesta correcta es ${letter}. ${opt}.`,
      lessonOverviewFormula: 'OBJETIVO DE HOY',
      vocabPrefix: 'Palabras clave:',
      grammarPrefix: 'Gramática:',
      promptExampleBadge: 'LECCIÓN DE HOY',
      promptExampleIntroContent: 'Expresiones naturales en español para usar hoy mismo',
      promptExampleTranslation: 'Plan: 1. Intro → 2. Matices y ejemplos → 3. Resumen',
      promptExampleVocabTranslation: 'Matiz: forma natural y educada en conversaciones reales.',
      promptExampleContextTitle: 'CONTEXTO',
      promptExampleExplanation: 'Esta expresión suena mucho más natural al hablar con nativos.',
      promptExampleOutroContent: '¡Guarda esta lección y practica en voz alta!',
      promptExampleOutroTranslation: '¡Repite estas frases cada día para ganar fluidez!',
      promptExampleOutroLabels: ['Vocabulario', 'Matiz natural', 'Práctica diaria'],
      promptExampleStickyLabels: ['Uso cotidiano', 'Suena natural'],
    };
  }
  if (norm === 'english' || norm === 'en' || norm === 'none') {
    const isNone = norm === 'none';
    return {
      code: isNone ? 'none' : 'en',
      targetLanguageLabel: isNone
        ? 'English-only (clear concise English notes, no extra translation)'
        : 'English (clear concise English vocabulary & grammar notes)',
      stageStepsQuiz: ['1. Intro', '2. Read & Vocab', '3. Quiz 5s', '4. Recap'],
      stageStepsSimple: ['1. Intro', '2. Lesson', '3. Recap'],
      roadmapLabel: 'Lesson Flow',
      introBadgeQuiz: 'QUIZ LESSON',
      introBadgeVocab: 'VOCAB LESSON',
      introBadgeDefault: "TODAY'S LESSON",
      introGoalPrefix: "Today's Focus:",
      introRoadmapLine: 'Plan: 1. Intro · 2. Reading & Vocab · 3. Quiz & Recap',
      introVisualSubtitle: 'Intro · Reading & Vocab · Quiz · Recap',
      readingBadgePrefix: 'READING',
      vocabBadgePrefix: 'VOCAB',
      sentenceTitlePrefix: 'Line',
      outroBadge: 'RECAP',
      outroTitle: 'Lesson Recap',
      outroContentPrefix: 'Lesson Complete:',
      outroTranslation: 'Review key vocabulary & read aloud daily for fluency!',
      outroLabels: ['Listen Well', 'Read & Vocab', 'Speak Daily'],
      quizAskTag: 'QUESTION',
      thinkCountdown: (sec) => `⏱️ THINK: ${sec} SEC`,
      chooseAnswerTitle: (sec) => `CHOOSE IN ${sec}s`,
      chooseAnswerSubtitle: 'Pick the best option before time runs out!',
      correctAnswerPill: (letter, opt) => `✓ CORRECT: ${letter}. ${opt}`,
      correctAnswerCardTitle: (letter, opt) => `Correct Answer: ${letter}. ${opt}`,
      correctBadge: 'CORRECT',
      correctStamp: 'CORRECT!',
      correctOptionSublabel: 'Correct Answer',
      contextPassageTitle: 'REFERENCE PASSAGE',
      contextPassageUrl: 'https://english.practice/passage-check',
      listenChooseSubtext: 'Listen carefully and choose the best option!',
      defaultExplanation: (letter, opt) => `The correct answer is ${letter}. ${opt}.`,
      lessonOverviewFormula: "TODAY'S GOAL",
      vocabPrefix: 'Key Words:',
      grammarPrefix: 'Grammar:',
      promptExampleBadge: "TODAY'S LESSON",
      promptExampleIntroContent: "Today's Goal: Outdoor survival story & be going to for plans",
      promptExampleTranslation: 'Plan: 1. Intro → 2. Reading & Key Words → 3. Interactive Quiz',
      promptExampleVocabTranslation: 'Key Words: exciting (thrilling) · programme (TV show)\\nGrammar: Present Simple for describing TV plots',
      promptExampleContextTitle: 'REFERENCE PASSAGE',
      promptExampleExplanation: 'The passage states: live in the mountains for ten days.',
      promptExampleOutroContent: 'Review key vocabulary & practice be going to!',
      promptExampleOutroTranslation: 'Read aloud daily to lock in every new phrase!',
      promptExampleOutroLabels: ['exciting / prize', 'be going to + V', 'Quiz Ready'],
      promptExampleStickyLabels: ['exciting = thrilling', 'programme = TV show'],
    };
  }
  return {
    code: 'vi',
    targetLanguageLabel: targetLang || 'Tiếng Việt',
    stageStepsQuiz: ['1. Mở bài', '2. Đọc & Từ', '3. Quiz 5s', '4. Tổng kết'],
    stageStepsSimple: ['1. Giới thiệu', '2. Bài học', '3. Tổng kết'],
    roadmapLabel: 'Lộ trình',
    introBadgeQuiz: 'BÀI HỌC QUIZ',
    introBadgeVocab: 'BÀI HỌC TỪ VỰNG',
    introBadgeDefault: 'BÀI HỌC HÔM NAY',
    introGoalPrefix: 'Hôm nay học gì?',
    introRoadmapLine: 'Lộ trình: 1. Giới thiệu bài · 2. Đọc & Từ vựng · 3. Quiz & Tổng kết',
    introVisualSubtitle: 'Mở bài · Đọc & Từ · Quiz · Tổng kết',
    readingBadgePrefix: 'BÀI ĐỌC',
    vocabBadgePrefix: 'TỪ VỰNG',
    sentenceTitlePrefix: 'Câu',
    outroBadge: 'TỔNG KẾT',
    outroTitle: 'Tổng kết bài học',
    outroContentPrefix: 'Hoàn thành bài học:',
    outroTranslation: 'Nhớ ôn lại từ mới & cấu trúc ngữ pháp vừa học mỗi ngày nhé!',
    outroLabels: ['Giới thiệu', 'Đọc & Từ vựng', 'Tổng kết'],
    quizAskTag: 'ĐỌC CÂU HỎI',
    thinkCountdown: (sec) => `⏱️ SUY NGHĨ: ${sec} GIÂY`,
    chooseAnswerTitle: (sec) => `CHỌN ĐÁP ÁN TRONG ${sec}s`,
    chooseAnswerSubtitle: 'Hãy tự chọn đáp án trước khi hết giờ!',
    correctAnswerPill: (letter, opt) => `✓ ĐÁP ÁN ĐÚNG: ${letter}. ${opt}`,
    correctAnswerCardTitle: (letter, opt) => `Đáp án đúng: ${letter}. ${opt}`,
    correctBadge: 'ĐÁP ÁN ĐÚNG',
    correctStamp: 'CORRECT!',
    correctOptionSublabel: 'Đáp án đúng',
    contextPassageTitle: 'ĐOẠN VĂN BÀI ĐỌC',
    contextPassageUrl: 'https://english.practice/reading-context',
    listenChooseSubtext: 'Lắng nghe và chọn phương án đúng!',
    defaultExplanation: (letter, opt) => `Đáp án đúng là ${letter}. ${opt}`,
    lessonOverviewFormula: 'MỤC TIÊU BÀI HỌC',
    vocabPrefix: 'Từ khó:',
    grammarPrefix: 'Ngữ pháp:',
    promptExampleBadge: 'BÀI HỌC HÔM NAY',
    promptExampleIntroContent: 'Hôm nay học gì? Đọc hiểu về thử thách sinh tồn & cấu trúc be going to',
    promptExampleTranslation: 'Lộ trình: 1. Giới thiệu → 2. Đọc & Từ khó → 3. Quiz có đoạn văn đối chiếu',
    promptExampleVocabTranslation: 'Từ khó: exciting (thú vị) · programme (chương trình)\\nNgữ pháp: Hiện tại đơn kể nội dung phim/TV',
    promptExampleContextTitle: 'ĐOẠN VĂN ĐỐI CHIẾU',
    promptExampleExplanation: 'Đoạn văn nêu rõ: live in the mountains for ten days.',
    promptExampleOutroContent: 'Review vocabulary & practice be going to!',
    promptExampleOutroTranslation: 'Ôn lại từ khó & luyện đọc to mỗi ngày nhé!',
    promptExampleOutroLabels: ['exciting / prize', 'be going to + V', 'Quiz Ready'],
    promptExampleStickyLabels: ['exciting = thú vị', 'programme = chương trình'],
  };
}

const COMMON_GLOSSARY_MULTI: Array<{ re: RegExp; vi: string; en: string; ja: string }> = [
  { re: /\bcomfort zone\b/i, vi: 'comfort zone (vùng an toàn)', en: 'comfort zone (familiar routine)', ja: 'comfort zone（安心領域）' },
  { re: /\bprogramme\b|\bprogram\b/i, vi: 'programme (chương trình)', en: 'programme (TV show)', ja: 'programme（番組）' },
  { re: /\bexciting\b/i, vi: 'exciting (thú vị)', en: 'exciting (thrilling)', ja: 'exciting（ワクワクする）' },
  { re: /\bmountains?\b/i, vi: 'mountain (ngọn núi)', en: 'mountain (high peak)', ja: 'mountain（山）' },
  { re: /\bdifficult\b/i, vi: 'difficult (khó khăn)', en: 'difficult (hard to do)', ja: 'difficult（難しい）' },
  { re: /\bdangerous\b/i, vi: 'dangerous (nguy hiểm)', en: 'dangerous (unsafe)', ja: 'dangerous（危険な）' },
  { re: /\bcomfortable\b/i, vi: 'comfortable (thoải mái)', en: 'comfortable (cozy)', ja: 'comfortable（快適な）' },
  { re: /\bpossible\b/i, vi: 'possible (có thể)', en: 'possible (achievable)', ja: 'possible（可能な）' },
  { re: /\bprize\b/i, vi: 'prize (giải thưởng)', en: 'prize (reward)', ja: 'prize（賞・賞金）' },
  { re: /\bfinishes?\b/i, vi: 'finish (kết thúc)', en: 'finish (complete)', ja: 'finish（終える）' },
  { re: /\bsteak\b/i, vi: 'steak (bít tết)', en: 'steak (grilled beef)', ja: 'steak（ステーキ）' },
  { re: /\blong hot bath\b/i, vi: 'hot bath (tắm nước nóng)', en: 'hot bath (warm soak)', ja: 'hot bath（熱いお風呂）' },
  { re: /\beveryone\b/i, vi: 'everyone (mọi người)', en: 'everyone (all people)', ja: 'everyone（みんな）' },
  { re: /\busually\b/i, vi: 'usually (thường xuyên)', en: 'usually (most of the time)', ja: 'usually（たいてい）' },
  { re: /\bsometimes\b/i, vi: 'sometimes (đôi khi)', en: 'sometimes (occasionally)', ja: 'sometimes（時々）' },
  { re: /\btomorrow\b/i, vi: 'tomorrow (ngày mai)', en: 'tomorrow (next day)', ja: 'tomorrow（明日）' },
  { re: /\bbreakfast\b/i, vi: 'breakfast (bữa sáng)', en: 'breakfast (morning meal)', ja: 'breakfast（朝食）' },
  { re: /\bquiet\b/i, vi: 'quiet (yên tĩnh)', en: 'quiet (peaceful)', ja: 'quiet（静かな）' },
  { re: /\bcheck in\b/i, vi: 'check in (nhận phòng)', en: 'check in (register at hotel)', ja: 'check in（チェックインする）' },
  { re: /\bpolite\b/i, vi: 'polite (lịch sự)', en: 'polite (courteous)', ja: 'polite（丁寧な）' },
  { re: /\bsafe\b/i, vi: 'safe (an toàn)', en: 'safe (protected)', ja: 'safe（安全な）' },
  { re: /\bwin\b/i, vi: 'win (giành chiến thắng)', en: 'win (come first)', ja: 'win（勝つ）' },
  { re: /\bplans?\b/i, vi: 'plan (kế hoạch)', en: 'plan (future intention)', ja: 'plan（計画）' },
  { re: /\bspend\b/i, vi: 'spend (chi tiêu)', en: 'spend (pay money)', ja: 'spend（使う・費やす）' },
  { re: /\bsave\b/i, vi: 'save (tiết kiệm)', en: 'save (keep money)', ja: 'save（貯金する）' },
  { re: /\btravel\b/i, vi: 'travel (du lịch)', en: 'travel (visit places)', ja: 'travel（旅行する）' },
];

export function extractVocabAndGrammarNote(
  sentence: string,
  targetLang = 'Tiếng Việt',
): { vocabNote?: string; grammarNote?: string } {
  const s = sentence.trim();
  const locale = getReelLocaleStrings(targetLang);
  if (!s || locale.code === 'none') return {};

  const vocabHits: string[] = [];
  for (const item of COMMON_GLOSSARY_MULTI) {
    if (item.re.test(s) && vocabHits.length < 3) {
      vocabHits.push(
        locale.code === 'ja' ? item.ja : locale.code === 'en' ? item.en : item.vi,
      );
    }
  }

  let grammarNote: string | undefined;
  if (/\b(?:am|is|are|'m|'re|'s)\s+going\s+to\b/i.test(s)) {
    grammarNote =
      locale.code === 'ja'
        ? `${locale.grammarPrefix} be going to + V（未来の予定）`
        : locale.code === 'en'
          ? `${locale.grammarPrefix} be going to + V (future plans)`
          : 'Ngữ pháp: be going to + V (dự định tương lai)';
  } else if (/\bneed\s+to\s+[a-z]+/i.test(s)) {
    grammarNote =
      locale.code === 'ja'
        ? `${locale.grammarPrefix} need to + V（〜する必要がある）`
        : locale.code === 'en'
          ? `${locale.grammarPrefix} need to + V (necessity)`
          : 'Ngữ pháp: need to + V (cần phải làm gì)';
  } else if (/\b(?:could|would)\s+(?:i|we|you)\b/i.test(s)) {
    grammarNote =
      locale.code === 'ja'
        ? `${locale.grammarPrefix} Could / Would + S + V（丁寧な依頼）`
        : locale.code === 'en'
          ? `${locale.grammarPrefix} Could / Would + S + V (polite request)`
          : 'Ngữ pháp: Could/Would + S + V (hỏi lịch sự)';
  } else if (/\b(?:is|are|am)\s+[a-z]+ing\b/i.test(s)) {
    grammarNote =
      locale.code === 'ja'
        ? `${locale.grammarPrefix} 現在進行形（be + V-ing）`
        : locale.code === 'en'
          ? `${locale.grammarPrefix} Present Continuous (be + V-ing)`
          : 'Ngữ pháp: Hiện tại tiếp diễn (be + V-ing)';
  } else if (/\b(?:usually|sometimes|every\s+day)\b/i.test(s)) {
    grammarNote =
      locale.code === 'ja'
        ? `${locale.grammarPrefix} 現在形（習慣・頻度副詞）`
        : locale.code === 'en'
          ? `${locale.grammarPrefix} Present Simple (habits & frequency)`
          : 'Ngữ pháp: Hiện tại đơn (thói quen/trạng từ tần suất)';
  } else if (/\bstarts?\s+on\b|\bat\s+\d{1,2}[:.]\d{2}/i.test(s)) {
    grammarNote =
      locale.code === 'ja'
        ? `${locale.grammarPrefix} on + 曜日 · at + 時刻`
        : locale.code === 'en'
          ? `${locale.grammarPrefix} Prepositions: on + day · at + exact time`
          : 'Cụm giới từ: on + thứ · at + giờ cụ thể';
  }

  const vocabNote = vocabHits.length > 0 ? `${locale.vocabPrefix} ${vocabHits.join(' · ')}` : undefined;
  return { vocabNote, grammarNote };
}

function pickConciseQuizExcerpt(
  sentences: string[],
  question: string,
  answerText: string,
  fallbackText: string,
): string | undefined {
  if (sentences.length > 0) {
    const queryWords = new Set(
      `${question} ${answerText}`
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !['the', 'and', 'for', 'are', 'that', 'with', 'this', 'from', 'what', 'when', 'where', 'how', 'why', 'does', 'true', 'false'].includes(w)),
    );
    const scored = sentences.map((s, idx) => {
      const lower = s.toLowerCase();
      let score = 0;
      queryWords.forEach((w) => {
        if (lower.includes(w)) score += 1;
      });
      return { s, idx, score };
    });
    const best = [...scored].sort((a, b) => b.score - a.score || a.idx - b.idx)[0];
    if (best) {
      const chosen = [best.s];
      if (best.s.length < 130 && best.idx + 1 < sentences.length) {
        const nextS = sentences[best.idx + 1];
        if (best.s.length + nextS.length + 1 <= 240) {
          chosen.push(nextS);
        }
      }
      return chosen.join(' ');
    }
  }
  const clean = fallbackText.replace(/\n+/g, ' ').trim();
  if (!clean) return undefined;
  if (clean.length <= 220) return clean;
  const firstTwo = clean.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ').trim();
  return firstTwo.length > 10 ? firstTwo.slice(0, 240) : clean.slice(0, 220);
}

export function sanitizeTtsSpeech(raw: string): string {
  const withoutTimestamps = stripTimestampsFromScript(String(raw || ''));
  const keptLines = withoutTimestamps
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => {
      if (!l) return false;
      if (isMetadataNoiseLine(l)) return false;
      if (/^(?:answer|key|đáp án)\s*[:.]\s*[A-Da-d0-9]{1,2}\s*$/i.test(l)) return false;
      return true;
    });

  let text = keptLines
    .join(' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
    .replace(/\/[^/\s]{2,40}\//g, ' ')
    .replace(/\s*&\s*/g, ' and ')
    .replace(/[`*_~#>]+/g, ' ')
    .replace(
      /(?:^|\s)(?:Q?\d+[.)]|Task\s*\d+[:.]?|Part\s*\d+[:.]?|Exercise\s*\d+[:.]?|Question\s*\d+[:.]?|\([A-Da-d]\)|[A-Da-d][.)])\s+/gi,
      ' ',
    )
    .replace(
      /(?:^|\s)(?:Title|Topic|Badge|Word|Phrase|Example|Answer|Key|Explanation|Note|Đáp án|Giải thích)\s*:\s*/gi,
      ' ',
    )
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return '';
  if (!/[.!?…]$/.test(text)) {
    text = `${text}.`;
  }
  return text;
}

/**
 * Splits a Quiz card cleanly into two spoken TTS parts around the thinking countdown:
 * - questionSpeech: Conversational Quiz lead-in + short pause + question + options + thinking cue
 * - answerSpeech: Reads correct answer + explanation AFTER countdown finishes
 */
export function getQuizCardSpeechParts(
  card: ReelCard,
  quizPosition = 1,
): {
  questionSpeech: string;
  answerSpeech: string;
  thinkSec: number;
} {
  const opts = (card.options || []).filter((o) => o.trim().length > 0);
  const safeAnsIdx = Math.min(card.answerIndex ?? 0, Math.max(0, opts.length - 1));
  const thinkSec =
    card.type === 'quiz'
      ? Math.max(0, Math.min(10, Number(card.thinkSec ?? 5)))
      : 0;

  let questionSpeech = sanitizeTtsSpeech(card.ttsText || card.content || card.title);
  if (
    card.type === 'quiz' &&
    !/^(?:now|here is|let's|quick quiz|question|time for)/i.test(questionSpeech)
  ) {
    const leadIn =
      quizPosition <= 1
        ? "Now let's test your understanding! ... Question one:"
        : `Next question, number ${quizPosition}: ...`;
    questionSpeech = `${leadIn} ${questionSpeech}`;
  }
  if (
    card.type === 'quiz' &&
    opts.length > 0 &&
    !/(?:take\s+(?:five|\d+)\s+seconds|seconds?\s+to\s+think)/i.test(questionSpeech)
  ) {
    const optStr = opts
      .slice(0, 4)
      .map((o, i) => `${String.fromCharCode(65 + i)}, ${o}`)
      .join('. ');
    questionSpeech = sanitizeTtsSpeech(
      `${questionSpeech.replace(/[.!?]+$/, '')}. ... ${optStr}. ${
        thinkSec > 0 ? `Take ${thinkSec} seconds to think.` : ''
      }`,
    );
  }

  let answerSpeech = card.ttsAnswerText ? sanitizeTtsSpeech(card.ttsAnswerText) : '';
  if (card.type === 'quiz' && !answerSpeech && opts.length > 0) {
    const letter = String.fromCharCode(65 + safeAnsIdx);
    const ansLabel = opts[safeAnsIdx];
    const expl = card.explanation ? ` ${card.explanation}` : '';
    answerSpeech = sanitizeTtsSpeech(
      `Time is up! The correct answer is ${letter}, ${ansLabel}.${expl}`,
    );
  }

  return { questionSpeech, answerSpeech, thinkSec };
}

const CREATOR_CARD_ROTATION_VARIANTS: IllustrationVariant[] = [
  'css-magnifying-word',
  'p168-grammar-formula',
  'contrast-pair-cards',
  'p168-situation-cards',
  'phrase-icon-split',
  'p168-slider-compare',
  'css-flashcard-flip',
  'p168-pronunciation-matrix',
  'trio-icon-cards',
  'p168-story-dialogue',
  'bs-badge-cluster',
  'dialogue-upgrade',
  'css-sticky-note',
  'bs-alert-tip',
  'css-grammar-equation',
  'degree-scale',
  'bs-card-header',
];

function pickNonRepeatingVariant(
  preferred: IllustrationVariant,
  prevVariant: IllustrationVariant | null | undefined,
  idx: number,
): IllustrationVariant {
  if (!prevVariant || preferred !== prevVariant) return preferred;
  const candidate = CREATOR_CARD_ROTATION_VARIANTS[(idx + 1) % CREATOR_CARD_ROTATION_VARIANTS.length];
  if (candidate !== prevVariant) return candidate;
  return CREATOR_CARD_ROTATION_VARIANTS[(idx + 2) % CREATOR_CARD_ROTATION_VARIANTS.length];
}

function defaultVisualForCard(
  card: ReelCard,
  idx: number,
  total: number,
  targetLang?: string,
  prevVariant?: IllustrationVariant | null,
): ReelCardVisualConfig {
  const locale = getReelLocaleStrings(targetLang);
  if (card.visual?.variant || card.visual?.customPrimitives?.length) {
    const chosen = card.visual.variant
      ? pickNonRepeatingVariant(card.visual.variant, prevVariant, idx)
      : undefined;
    return {
      ...card.visual,
      variant: chosen ?? card.visual.variant,
    };
  }
  if (card.type === 'intro') {
    return {
      variant: pickNonRepeatingVariant('bs-card-header', prevVariant, idx),
      formula: card.kicker || card.badge || locale.lessonOverviewFormula,
      title: card.title,
      subtitle: card.translation || locale.introVisualSubtitle,
      highlightWord: locale.introBadgeDefault,
      sceneIcon: 'graduation',
    };
  }
  if (card.type === 'outro') {
    return {
      variant: pickNonRepeatingVariant('css-bento-stats', prevVariant, idx),
      title: card.title || locale.outroTitle,
      labels: locale.outroLabels,
      sceneIcon: 'sparkles',
    };
  }
  if (card.type === 'quiz') {
    return {
      variant: pickNonRepeatingVariant(idx % 2 === 1 ? 'p168-step-quiz-formula' : 'bs-accordion-faq', prevVariant, idx),
      title: card.title || `Quiz Challenge #${idx}`,
      subtitle: card.translation || locale.listenChooseSubtext,
      speechText: card.content,
      sceneIcon: 'brain',
    };
  }
  if (card.type === 'translation') {
    const trPool: IllustrationVariant[] = [
      'css-flashcard-flip',
      'p168-grammar-formula',
      'contrast-pair-cards',
      'p168-slider-compare',
      'phrase-icon-split',
      'p168-situation-cards',
      'dialogue-upgrade',
      'css-magnifying-word',
      'css-sticky-note',
      'bs-alert-tip',
    ];
    return {
      variant: pickNonRepeatingVariant(trPool[idx % trPool.length], prevVariant, idx),
      title: card.sourcePrompt || card.translation || card.title,
      subtitle: card.phonetic || card.grammarNote || card.content,
      speechText: card.content,
      highlightWord: card.title,
      sceneIcon: 'chat',
    };
  }

  if (card.speaker?.trim()) {
    const dialoguePool: IllustrationVariant[] = [
      'p168-story-dialogue',
      'css-chat-thread',
      'ear-listen',
      'speech-bubble',
      'avatar-speech',
    ];
    const chosen = pickNonRepeatingVariant(
      dialoguePool[idx % dialoguePool.length],
      prevVariant,
      idx,
    );
    const shortTurnLine = card.content.length > 72 ? `${card.content.slice(0, 69)}…` : card.content;
    const shortMeaning =
      card.translation && card.translation.length > 56
        ? `${card.translation.slice(0, 53)}…`
        : card.translation || 'Natural conversation';
    return {
      variant: chosen,
      title: card.speakerRole ? `${card.speaker} · ${card.speakerRole}` : card.speaker,
      subtitle: shortMeaning,
      reactionText: card.speaker,
      speechText: card.content,
      labels: [
        `${card.speaker}: ${shortTurnLine}`,
        shortMeaning,
      ],
      sceneIcon: chosen === 'ear-listen' || chosen === 'speech-bubble' ? 'mic' : 'chat',
    };
  }

  const combined = `${card.title} ${card.content} ${card.translation || ''}`.toLowerCase();
  const hasContrastCue =
    /\bvs\.?\b|\binstead of\b|\bdon't say\b|\bstop saying\b|->|→|\bwhereas\b|\bcompare\b/i.test(
      combined,
    );
  const hasGrammarCue =
    /\bgrammar\b|\btense\b|\bverb\s*\+|\bpreposition\b|\bstructure\b|\brule\b|\bused to\b|\bformula\b/i.test(
      combined,
    );
  const hasPronCue =
    /(\bed\b|\/t\/|\/d\/|\/ɪd\/|pronunciation|syllable|ending sound)/i.test(combined);
  const hasDegreeCue =
    /\bmore\s+\w+\b|\bpolite\b|\bformal\b|\bstronger\b|\blevel\b|\bbetter\b/i.test(combined);

  if (hasPronCue) {
    return {
      variant: pickNonRepeatingVariant('p168-pronunciation-matrix', prevVariant, idx),
      title: card.title,
      subtitle: [card.phonetic, card.translation].filter(Boolean).join(' · ') || card.content,
      speechText: card.example || card.content,
      sceneIcon: 'mic',
    };
  }

  if (hasContrastCue) {
    const preferred: IllustrationVariant =
      idx % 3 === 0 ? 'p168-slider-compare' : idx % 2 === 0 ? 'contrast-pair-cards' : 'dialogue-upgrade';
    return {
      variant: pickNonRepeatingVariant(preferred, prevVariant, idx),
      title: card.title,
      subtitle: [card.phonetic, card.translation].filter(Boolean).join(' · ') || card.content,
      speechText: card.example || card.content,
      highlightWord: card.title,
      sceneIcon: 'chat',
    };
  }

  if (hasGrammarCue) {
    return {
      variant: pickNonRepeatingVariant(idx % 2 === 0 ? 'p168-grammar-formula' : 'css-grammar-equation', prevVariant, idx),
      title: card.title,
      subtitle: [card.phonetic, card.translation].filter(Boolean).join(' · ') || card.content,
      formula: card.indexLabel || card.badge || 'KEY RULE',
      speechText: card.example || card.content,
      sceneIcon: 'book',
    };
  }

  if (hasDegreeCue && idx % 3 === 1) {
    return {
      variant: pickNonRepeatingVariant('degree-scale', prevVariant, idx),
      title: card.title,
      subtitle: [card.phonetic, card.translation].filter(Boolean).join(' · ') || card.content,
      labels: ['Basic', 'Better', 'Natural'],
      value: 0.85,
      sceneIcon: 'sparkles',
    };
  }

  if (card.phonetic || card.translation || card.example) {
    const ctx = resolveContextualVisualForCue(
      `${card.title} ${card.content} ${card.translation || ''}`,
      card.title,
    );
    if (ctx.matchedRule !== 'fallback' && !ctx.variant.startsWith('bs-') && !ctx.variant.startsWith('css-')) {
      return {
        variant: pickNonRepeatingVariant(ctx.variant, prevVariant, idx),
        title: card.title,
        subtitle: [card.phonetic, card.translation].filter(Boolean).join(' · ') || card.content,
        sceneIcon: ctx.sceneIcon,
        speechText: card.example || card.content,
      };
    }
    const creatorPool: IllustrationVariant[] = [
      'css-magnifying-word',
      'p168-grammar-formula',
      'phrase-icon-split',
      'p168-situation-cards',
      'css-flashcard-flip',
      'p168-slider-compare',
      'bs-badge-cluster',
      'contrast-pair-cards',
      'trio-icon-cards',
      'p168-story-dialogue',
      'css-sticky-note',
      'bs-alert-tip',
    ];
    const picked = pickNonRepeatingVariant(
      creatorPool[idx % creatorPool.length],
      prevVariant,
      idx,
    );
    return {
      variant: picked,
      title: card.title || card.content,
      subtitle: [card.phonetic, card.translation].filter(Boolean).join(' · ') || 'Key Vocabulary',
      speechText: card.example || card.content,
      highlightWord: card.title,
      sceneIcon: ctx.sceneIcon,
    };
  }
  const ctx = resolveContextualVisualForCue(
    `${card.title} ${card.content}`,
    card.title,
  );
  if (ctx.matchedRule !== 'fallback') {
    return {
      variant: pickNonRepeatingVariant(ctx.variant, prevVariant, idx),
      title: card.title,
      subtitle: card.translation || card.content,
      sceneIcon: ctx.sceneIcon,
      speechText: card.content,
      ...ctx.data,
    };
  }
  const rotatingVariants: IllustrationVariant[] = [
    'phrase-icon-split',
    'css-browser-mockup',
    'contrast-pair-cards',
    'bs-toast-notify',
    'css-glass-quote',
    'css-roadmap-steps',
  ];
  return {
    variant: pickNonRepeatingVariant(
      rotatingVariants[idx % rotatingVariants.length],
      prevVariant,
      idx,
    ),
    title: card.title || `Lesson Part ${idx}/${Math.max(1, total - 1)}`,
    subtitle: card.translation || card.content,
    speechText: card.content,
    labels: ['Listen', 'Understand', 'Speak'],
    sceneIcon: 'book',
  };
}

export function buildReelCardsRuleBased(
  rawText: string,
  options?: {
    title?: string;
    mode?: ReelMode;
    targetLang?: string;
    includeQuiz?: boolean;
  },
): { title: string; mode: Exclude<ReelMode, 'auto'>; cards: ReelCard[] } {
  const locale = getReelLocaleStrings(options?.targetLang);
  const normalizedRaw = String(rawText || '').replace(/\r\n/g, '\n').trim();
  const worksheet = cleanReadingWorksheetInput(normalizedRaw, options?.title);
  const cleaned = worksheet.bodyText || normalizedRaw;
  const lines = worksheet.lines.filter((l) => Boolean(l) && !isMetadataNoiseLine(l));
  const mode =
    options?.mode && options.mode !== 'auto' ? options.mode : detectReelMode(cleaned);
  const docTitle = worksheet.title || 'English Practice Reel';
  const spokenTitle = sanitizeTtsSpeech(docTitle).replace(/[.!?]+$/, '');
  const detectedLang = inferLearningLangFromCards(
    [{ id: 'probe', type: 'vocab', badge: '', title: docTitle, content: cleaned, ttsText: cleaned }],
  );
  const allowQuiz = options?.includeQuiz !== false;

  const introSpeech =
    detectedLang === 'zh'
      ? `今天我们来学习：${spokenTitle}。`
      : detectedLang === 'ja'
        ? `今日は「${spokenTitle}」を学びましょう。`
        : detectedLang === 'ko'
          ? `오늘은 ${spokenTitle}에 대해 배워볼게요.`
          : mode === 'quiz'
            ? `Welcome to today's lesson on ${spokenTitle}. First, read the key details, then answer our interactive quiz.`
            : mode === 'vocab'
              ? `Welcome to today's vocabulary lesson on ${spokenTitle}. Today we will learn essential phrases and their meanings.`
              : `Welcome to today's reading lesson on ${spokenTitle}. Follow each sentence, learn key vocabulary and grammar, and practice aloud.`;

  const introExplanation =
    locale.code === 'vi'
      ? `Chào mừng bạn đến với bài học ${docTitle}. Hãy nghe kỹ từng phần và luyện đọc theo nhé.`
      : locale.code === 'ja'
        ? `${docTitle}のレッスンへようこそ。順番に聞いて一緒に練習しましょう。`
        : undefined;

  const cards: ReelCard[] = [
    {
      id: makeCardId(0),
      type: 'intro',
      badge:
        mode === 'quiz'
          ? locale.introBadgeQuiz
          : mode === 'vocab'
            ? locale.introBadgeVocab
            : locale.introBadgeDefault,
      title: docTitle,
      content: `${locale.introGoalPrefix} ${docTitle}`,
      translation: locale.code !== 'none' ? locale.introRoadmapLine : undefined,
      ttsText: introSpeech,
      explanationSpeech: introExplanation,
      learningLang: detectedLang,
      durationSec: estimateCardSpeechDuration(introSpeech),
      visual: {
        variant: 'bs-card-header',
        formula: locale.lessonOverviewFormula,
        title: docTitle,
        subtitle: locale.introVisualSubtitle,
        sceneIcon: 'graduation',
      },
    },
  ];

  // Detect multi-section structure BEFORE stripping worksheet headings so each section keeps
  // its spoken transition lead-in and pairs any section quiz immediately after that section!
  const sectionSplitRe =
    /(?=^(?:#{1,3}\s+(?:Part|Task|Exercise|Lesson|Section|Reading|Article|Passage|Bài|Phần)\s*\d*|(?:Part|Task|Exercise|Lesson|Section|Bài|Phần)\s*\d+[:.\-–\s]))/gim;
  const rawSections = normalizedRaw
    .split(sectionSplitRe)
    .map((s) => s.trim())
    .filter((s) => {
      if (s.length < 20) return false;
      const cw = cleanReadingWorksheetInput(s);
      return cw.bodyText.trim().length >= 20;
    });

  const effectiveSections = rawSections.length >= 2 ? rawSections : [cleaned];
  const isMultiSection = effectiveSections.length >= 2;
  let globalQuizCount = 0;

  const splitSentencesSmart = (chunkText: string): string[] => {
    const cleanReadingLines = chunkText
      .split('\n')
      .map((l) => l.trim())
      .filter((l, idx) => {
        if (!l || isMetadataNoiseLine(l)) return false;
        if (idx === 0 && l.replace(/^#+\s*/, '').trim().toLowerCase() === docTitle.toLowerCase()) {
          return false;
        }
        return !/^(?:Q\d+[.)]|\([A-Da-d]\)|[A-Da-d][.)])\s+/i.test(l);
      })
      .map((l) => l.replace(/^#+\s*/, '').replace(/^\d+[.)]\s*/, '').trim())
      .filter((l) => l.length >= 4);

    const joined = cleanReadingLines.join(' ');
    const hasCjk = /[\u4e00-\u9faf\u3040-\u30ff\uac00-\ud7af]/.test(joined);
    const splitRe = hasCjk ? /(?<=[.!?。！？])\s*/ : /(?<=[.!?])\s+/;
    return joined
      .split(splitRe)
      .map((s) => s.trim())
      .filter((s) => {
        const minLen = hasCjk ? 3 : 8;
        return s.length >= minLen && !isMetadataNoiseLine(s);
      });
  };

  for (let secIdx = 0; secIdx < effectiveSections.length; secIdx++) {
    const rawSec = effectiveSections[secIdx];
    const secWorksheet = isMultiSection
      ? cleanReadingWorksheetInput(rawSec, `Part ${secIdx + 1}`)
      : { title: docTitle, bodyText: cleaned, lines };
    const secBody = secWorksheet.bodyText || rawSec;
    const secLines = secWorksheet.lines.filter((l) => Boolean(l) && !isMetadataNoiseLine(l));
    if (!secBody && secLines.length === 0) continue;

    // Extract readable section label from heading line when multi-section
    const secFirstLine = rawSec.split('\n')[0]?.replace(/^#+\s*/, '').trim() || '';
    const secHeadingLabel =
      secWorksheet.title && secWorksheet.title !== 'Reading Practice'
        ? secWorksheet.title
        : secFirstLine && secFirstLine.length <= 68
          ? secFirstLine
          : `Part ${secIdx + 1}`;

    if (isMultiSection && secIdx > 0) {
      const transitionSpeech =
        detectedLang === 'zh'
          ? `接下来我们进入第${secIdx + 1}部分：${secHeadingLabel}。`
          : `Now let's move on to part ${secIdx + 1}: ${sanitizeTtsSpeech(secHeadingLabel).replace(/[.!?]+$/, '')}.`;
      const transitionExplain =
        locale.code === 'vi'
          ? `Chuyển sang phần ${secIdx + 1}: ${secHeadingLabel}.`
          : locale.code === 'ja'
            ? `次はパート${secIdx + 1}、${secHeadingLabel}に進みましょう。`
            : undefined;
      cards.push({
        id: makeCardId(cards.length),
        type: 'transition',
        badge:
          locale.code === 'vi'
            ? `CHUYỂN PHẦN ${secIdx + 1}`
            : locale.code === 'ja'
              ? `パート ${secIdx + 1}`
              : `PART ${secIdx + 1}`,
        kicker: `PART ${secIdx + 1}`,
        title: secHeadingLabel,
        content:
          locale.code === 'vi'
            ? `Chuyển tiếp sang phần ${secIdx + 1}: ${secHeadingLabel}`
            : `Moving to Part ${secIdx + 1}: ${secHeadingLabel}`,
        translation: transitionExplain,
        ttsText: transitionSpeech,
        explanationSpeech: transitionExplain,
        learningLang: detectedLang,
        durationSec: estimateCardSpeechDuration(transitionSpeech),
        visual: {
          variant: 'css-roadmap-steps',
          title: secHeadingLabel,
          subtitle: locale.code === 'vi' ? `Phần ${secIdx + 1}` : `Part ${secIdx + 1}`,
          sceneIcon: 'sparkles',
        },
      });
    }

    const explicitQuizIdx = secBody.search(
      /(?:^|\n)\s*(?:True\s*\/\s*False(?:\s+Quiz)?|Multiple\s*Choice|Comprehension(?:\s+Quiz)?|Quiz\b|Question\s*1\b|Q\d+[.)])/im,
    );
    const quizSplitIdx =
      explicitQuizIdx >= 0
        ? explicitQuizIdx
        : mode === 'quiz'
          ? secBody.search(/(?:^|\n)\s*Q?\d+[.)]\s+/im)
          : -1;
    const readingChunk =
      quizSplitIdx > 0
        ? secBody.slice(0, quizSplitIdx).trim()
        : mode === 'quiz'
          ? ''
          : secBody;

    let readingSentences: string[] = [];

    if (mode === 'vocab') {
      const vocabLimit = isMultiSection ? 6 : 12;
      let addedVocab = 0;
      for (let i = 0; i < secLines.length && addedVocab < vocabLimit; i++) {
        const line = secLines[i];
        if (line.startsWith('#')) continue;
        const match = line.match(
          /^([^/\-–—:=]+?)(?:\s+(\/[^/]+\/))?\s*(?:[-–—:=]|→)\s*(.+)$/,
        );
        if (match) {
          const word = match[1].replace(/^\d+[.)]\s*/, '').trim();
          const phonetic = match[2]?.trim();
          const meaning = match[3].trim();
          const cleanSpoken = sanitizeTtsSpeech(word);
          if (!cleanSpoken) continue;
          addedVocab += 1;
          cards.push({
            id: makeCardId(cards.length),
            type: 'vocab',
            badge: `${locale.vocabBadgePrefix} #${addedVocab}`,
            title: word,
            content: word,
            phonetic,
            translation: meaning,
            explanationSpeech:
              locale.code === 'vi' && meaning
                ? sanitizeTtsSpeech(`Nghĩa là ${meaning}`)
                : undefined,
            learningLang: detectedLang,
            ttsText: cleanSpoken,
            durationSec: estimateCardSpeechDuration(cleanSpoken),
            visual: {
              variant: 'css-flashcard-flip',
              title: word,
              subtitle: meaning,
              sceneIcon: 'book',
            },
          });
        }
      }
    } else if (readingChunk) {
      const sentences = splitSentencesSmart(readingChunk);
      readingSentences = sentences;
      const sentenceCap = isMultiSection ? 5 : 10;

      for (const s of sentences.slice(0, sentenceCap)) {
        const cleanSpoken = sanitizeTtsSpeech(s);
        if (!cleanSpoken) continue;
        const notes = extractVocabAndGrammarNote(s, options?.targetLang);
        const combinedNote = [notes.vocabNote, notes.grammarNote].filter(Boolean).join('\n') || undefined;
        const ctx = resolveContextualVisualForCue(`${secHeadingLabel} ${s}`, s);
        cards.push({
          id: makeCardId(cards.length),
          type: 'vocab',
          badge: `${locale.readingBadgePrefix} #${cards.length}`,
          title: `${locale.sentenceTitlePrefix} ${cards.length} · ${isMultiSection ? secHeadingLabel : docTitle}`,
          content: s,
          translation: combinedNote,
          grammarNote: notes.grammarNote,
          explanationSpeech:
            locale.code === 'vi' && combinedNote
              ? sanitizeTtsSpeech(combinedNote)
              : undefined,
          learningLang: detectedLang,
          ttsText: cleanSpoken,
          durationSec: estimateCardSpeechDuration(cleanSpoken),
          visual: {
            variant: ctx.matchedRule !== 'fallback' ? ctx.variant : 'css-browser-mockup',
            title: isMultiSection ? secHeadingLabel : docTitle,
            subtitle: notes.vocabNote || notes.grammarNote || s.slice(0, 64),
            speechText: s,
            sceneIcon: ctx.sceneIcon,
            ...ctx.data,
          },
        });
      }
    }

    // Extract Quiz blocks FOR THIS SECTION ONLY (immediately paired right after this section's reading!)
    const hasQuizBlocks = allowQuiz && (quizSplitIdx >= 0 || (mode === 'quiz' && !readingChunk));
    if (hasQuizBlocks) {
      const quizSource = quizSplitIdx >= 0 ? secBody.slice(quizSplitIdx) : secBody;
      const qBlocks = quizSource
        .split(/(?=^(?:Q?\d+[.)]\s+))/gm)
        .map((b) => b.trim())
        .filter(Boolean);

      let sectionQuizCount = 0;
      const maxQuizPerSection = isMultiSection ? 2 : 4;
      for (const block of qBlocks) {
        if (sectionQuizCount >= maxQuizPerSection || globalQuizCount >= 6) break;
        const blockLines = block.split('\n').map((l) => l.trim()).filter(Boolean);
        if (blockLines.length === 0) continue;
        const firstLine = blockLines[0];
        const looksLikeQuizBlock =
          /^Q\d+[.)]\s+/i.test(firstLine) ||
          /\b(?:Answer|Key|Đáp án)[:\s]/i.test(block) ||
          /^(?:\([A-Da-d]\)|[A-Da-d][.)])\s+/m.test(block) ||
          (mode === 'quiz' && /^Q?\d+[.)]\s+/i.test(firstLine));
        if (!looksLikeQuizBlock) continue;

        const question = firstLine.replace(/^Q?\d+[.)]\s*/i, '').trim();
        if (question.length < 4 || isMetadataNoiseLine(question)) continue;

        const opts: string[] = [];
        let answerIndex = 0;
        let explanation = '';
        for (const bl of blockLines.slice(1)) {
          const optMatch = bl.match(/^(?:\(([A-Da-d])\)|([A-Da-d])[.)])\s+(.+)$/);
          if (optMatch) {
            opts.push(optMatch[3].trim());
            continue;
          }
          const ansMatch = bl.match(/^(?:Answer|Key|Đáp án)[:\s]+(.+)$/i);
          if (ansMatch) {
            const val = ansMatch[1].trim();
            const letterIdx = 'abcd'.indexOf(val.charAt(0).toLowerCase());
            if (letterIdx >= 0 && letterIdx < Math.max(2, opts.length || 4)) {
              answerIndex = letterIdx;
            } else if (/^false$/i.test(val)) {
              answerIndex = 1;
            }
            continue;
          }
          if (/^(?:Explanation|Giải thích)[:\s]+/i.test(bl)) {
            explanation = bl.replace(/^(?:Explanation|Giải thích)[:\s]+/i, '').trim();
          }
        }

        if (opts.length === 0 && /true\s*\/\s*false|\(T\/F\)/i.test(block)) {
          opts.push('True', 'False');
        }

        sectionQuizCount += 1;
        globalQuizCount += 1;
        const finalOpts = opts.length > 0 ? opts : ['True', 'False'];
        const safeAnsIdx = Math.min(answerIndex, Math.max(0, finalOpts.length - 1));
        const letter = String.fromCharCode(65 + safeAnsIdx);
        const optSpoken = finalOpts
          .slice(0, 4)
          .map((o, i) => `${String.fromCharCode(65 + i)}, ${o}`)
          .join('. ');
        const wordNumber =
          ['one', 'two', 'three', 'four', 'five', 'six'][globalQuizCount - 1] ||
          String(globalQuizCount);
        const leadIn =
          sectionQuizCount === 1
            ? isMultiSection
              ? `Now let's check ${sanitizeTtsSpeech(secHeadingLabel).replace(/[.!?]+$/, '')}! ... Question ${wordNumber}:`
              : globalQuizCount === 1
                ? "Now let's test your understanding! ... Question one:"
                : `Now let's check the next part! ... Question ${wordNumber}:`
            : `Question ${wordNumber}: ...`;
        const questionSpeech = sanitizeTtsSpeech(
          `${leadIn} ${question} ... ${optSpoken}. Take five seconds to think.`,
        );
        const answerSpeech = sanitizeTtsSpeech(
          `Time is up! The correct answer is ${letter}, ${finalOpts[safeAnsIdx]}.${explanation ? ` ${explanation}` : ''}`,
        );

        const snippetContext = pickConciseQuizExcerpt(
          readingSentences,
          question,
          finalOpts[safeAnsIdx] || '',
          readingChunk,
        );

        cards.push({
          id: makeCardId(cards.length),
          type: 'quiz',
          badge: `QUIZ #${globalQuizCount}`,
          title: `Quiz Question ${globalQuizCount}`,
          content: question,
          contextExcerpt: snippetContext,
          options: finalOpts,
          answerIndex: safeAnsIdx,
          thinkSec: 5,
          explanation: explanation || locale.defaultExplanation(letter, finalOpts[safeAnsIdx]),
          learningLang: detectedLang,
          ttsText: questionSpeech,
          ttsAnswerText: answerSpeech,
          durationSec: Number(
            (estimateCardSpeechDuration(questionSpeech) + 5 + estimateCardSpeechDuration(answerSpeech)).toFixed(2),
          ),
          visual: snippetContext
            ? {
                variant: 'css-browser-mockup',
                title: isMultiSection ? secHeadingLabel : docTitle,
                formula: locale.contextPassageTitle,
                speechText: snippetContext,
                sceneIcon: 'book',
              }
            : {
                variant: 'bs-accordion-faq',
                title: 'QUIZ CHALLENGE (5s)',
                speechText: question,
                sceneIcon: 'brain',
              },
        });
      }
    }
  }

  // Fallback sentences if cards still only has intro
  if (cards.length <= 1) {
    const sentences = splitSentencesSmart(lines.join('\n'));
    for (const s of sentences.slice(0, 10)) {
      const cleanSpoken = sanitizeTtsSpeech(s);
      if (!cleanSpoken) continue;
      const notes = extractVocabAndGrammarNote(s, options?.targetLang);
      const combinedNote = [notes.vocabNote, notes.grammarNote].filter(Boolean).join('\n') || undefined;
      cards.push({
        id: makeCardId(cards.length),
        type: 'vocab',
        badge: `${locale.readingBadgePrefix} #${cards.length}`,
        title: `${locale.sentenceTitlePrefix} ${cards.length} · ${docTitle}`,
        content: s,
        translation: combinedNote,
        grammarNote: notes.grammarNote,
        explanationSpeech:
          locale.code === 'vi' && combinedNote
            ? sanitizeTtsSpeech(combinedNote)
            : undefined,
        learningLang: detectedLang,
        ttsText: cleanSpoken,
        durationSec: estimateCardSpeechDuration(cleanSpoken),
      });
    }
  }

  const outroSpeech =
    detectedLang === 'zh'
      ? `太棒了！今天我们学习了${spokenTitle}。记得每天大声练习。下节课见！`
      : `Great job! Today you practiced ${spokenTitle}. Review the key vocabulary and practice reading aloud every day. See you in the next lesson!`;
  const outroExplanation =
    locale.code !== 'none' ? sanitizeTtsSpeech(locale.outroTranslation) : undefined;
  cards.push({
    id: makeCardId(cards.length),
    type: 'outro',
    badge: locale.outroBadge,
    title: locale.outroTitle,
    content: `${locale.outroContentPrefix} ${docTitle}`,
    translation: locale.code !== 'none' ? locale.outroTranslation : undefined,
    ttsText: outroSpeech,
    explanationSpeech: outroExplanation,
    learningLang: detectedLang,
    durationSec: estimateCardSpeechDuration(outroSpeech),
    visual: {
      variant: 'css-bento-stats',
      title: 'Speak Fluently!',
      labels: locale.outroLabels,
      sceneIcon: 'sparkles',
    },
  });

  // Ensure every card has a lively visual config
  const enrichedCards = cards.map((card, idx) => ({
    ...card,
    visual: defaultVisualForCard(card, idx, cards.length, options?.targetLang),
  }));

  return { title: docTitle, mode, cards: enrichedCards };
}

export const TYPOGRAPHY_MOBILE_READABILITY_PROMPT_BLOCK = `## TYPOGRAPHY & MOBILE READABILITY

**1. Nguyên tắc bắt buộc**
- Tất cả nội dung quan trọng trên visual phải đọc được rõ ràng trên điện thoại ở chế độ toàn màn hình 9:16.
- Không được hiển thị từ vựng, cụm từ chính hoặc thông điệp quan trọng bằng chữ quá nhỏ.
- Không tự động thu nhỏ font để nhét nhiều nội dung vào một component.

**2. Kích thước chữ đề xuất**
| Thành phần | Font size |
| --- | --- |
| Tiêu đề chính | 44–56 |
| Nội dung nổi bật | 36–44 |
| Labels / Callouts | 32–40 |
| Nội dung phụ | 28–32 |
| Chú thích nhỏ | Không dưới 24 |

**3. Quy định riêng cho \`labels\`**
- \`labels\` phải được hiển thị như các nội dung nổi bật (prominent callouts), không phải micro badges.
- Font đậm, độ tương phản cao, khoảng cách đủ rộng.
- Nếu có 3 labels, bố trí thành 3 vùng rõ ràng, không ép cả 3 vào một hàng với chữ nhỏ.
- Có thể xuống dòng tối đa 2 dòng nếu cần.

**4. Quy định cho \`customPrimitives\`**
- Mọi primitive \`text\` phải khai báo \`fontSize\` rõ ràng.
- Text chính nên dùng 36–48.
- Không sử dụng fontSize 16–24 cho từ vựng hoặc thông tin quan trọng.
- Không hy sinh khả năng đọc để trang trí.`;

export function buildEnglishReelsWebAiPrompt(params: {
  sourceText: string;
  sourceUrl?: string;
  title?: string;
  mode: ReelMode;
  targetLang: string;
  learningLanguage?: LearningLanguageId;
  durationMinutes?: number;
  style?: PromptVideoStyle;
  compositionId?: LayoutCompositionId | 'ai-decide';
  includeQuiz?: 'auto' | 'always' | 'none';
}): string {
  const locale = getReelLocaleStrings(params.targetLang, params.learningLanguage);
  const includeQuiz = params.includeQuiz ?? 'auto';
  const durationMinutes =
    typeof params.durationMinutes === 'number' &&
    Number.isFinite(params.durationMinutes) &&
    params.durationMinutes > 0
      ? Math.max(0.5, Math.min(30, Number(params.durationMinutes.toFixed(1))))
      : undefined;
  const durationWordsEstimate = durationMinutes ? Math.round(durationMinutes * 130) : undefined;
  const durationCjkEstimate = durationMinutes ? Math.round(durationMinutes * 185) : undefined;
  const sourceChapters =
    durationMinutes && durationMinutes >= 5
      ? Math.max(3, Math.min(10, Math.round(durationMinutes / 3.5)))
      : undefined;
  const durationDirective = durationMinutes
    ? [
        `- **THỜI LƯỢNG TỐI THIỂU (MỨC SÀN — CHỈ ĐƯỢC DÀI HƠN, KHÔNG ĐƯỢC THẤP HƠN): ${durationMinutes} PHÚT (~${Math.round(durationMinutes * 60)} giây, tối thiểu ~${durationWordsEstimate} từ tiếng Latin / ~${durationCjkEstimate} ký tự CJK tổng cộng trong ttsText + explanationSpeech)**:`,
        `  + **CẤM RÚT NGẮN XUỐNG ~2–3 PHÚT (8–15 THẺ NGẮN)**: Với yêu cầu ${durationMinutes} phút, bạn BẮT BUỘC khai thác toàn bộ độ sâu của nguồn${sourceChapters ? ` (hoặc tổ chức thành **${sourceChapters} phần/chủ điểm nối tiếp**) với đủ khối lượng câu thoại + phân tích sâu để đạt >= ${durationMinutes} phút` : ''}.`,
        '  + **CHẤT LƯỢNG SÂU SẮC — CẤM LAN MAN — CẤM LẶP LẠI**: Không bao giờ kéo dài thời lượng bằng cách lặp lại ý cũ, tâng bốc rỗng, hay nói lan man ngoài trọng tâm! Mỗi thẻ `vocab`/`quiz` phải mang lại **giá trị tri thức mới**: giải thích TẠI SAO nghe tự nhiên (Sound More Natural), đối chiếu lỗi sai người học hay mắc, phân tích sắc thái ngữ cảnh/ngữ pháp & ví dụ hoàn chỉnh trong `explanationSpeech` và `translation`.',
        `  + **TỰ KIỂM TRA & BÁO CÁO LÝ DO NẾU THIẾU (\`durationReport\`)**: Trước khi xuất JSON, tự cộng tổng số từ/ký tự của \`ttsText\` + \`explanationSpeech\` + \`ttsAnswerText\`. Nếu tổng còn thấp hơn mức sàn ${durationMinutes} phút, hãy bổ sung thêm thẻ phân tích/ví dụ đắt giá từ nguồn. Nếu nguồn quá ngắn hoặc do giới hạn độ dài đầu ra nên KHÔNG THỂ đạt đủ ${durationMinutes} phút mà không lan man/bịa thêm ý sáo rỗng, BẮT BUỘC ghi \`"metMinimum": false\` và giải thích rõ lý do vào \`"durationReport.shortfallReason"\`!`,
      ].join('\n')
    : `- **ƯU TIÊN CHIỀU SÂU KIẾN THỨC & CHẤT LƯỢNG GIẢI THÍCH (TIÊU CHÍ BẮT BUỘC)**: Hãy để số lượng mục kiến thức quyết định thời lượng video — tuyệt đối KHÔNG cắt ngắn thành các câu cụt lủn, thiếu chủ vị hay giải thích sơ sài vô nghĩa; cấm lan man hay lặp ý.`;
  const cleanedUserTitle = (params.title || '').trim();
  const isStaleDefaultTitle =
    !cleanedUserTitle ||
    cleanedUserTitle === 'Hotel Check-in & Polite Requests' ||
    cleanedUserTitle === 'Outside the Comfort Zone' ||
    cleanedUserTitle.startsWith('Mẫu bài học:');

  const modeInstruction =
    params.mode === 'auto'
      ? 'Tự động nhận diện dạng bài phù hợp nhất trong 3 dạng: "reading", "quiz", hoặc "vocab" dựa trên nội dung thực tế (CHỈ đưa quiz nếu nguồn thực sự có phần câu hỏi/kiểm tra).'
      : `Bắt buộc xử lý theo dạng bài: "${params.mode}".`;

  const quizPolicyBlock =
    includeQuiz === 'none'
      ? [
          '3. **KHÔNG tự tạo Quiz (`type: "quiz"`)**:',
          '   - Bài giảng này CHỈ tập trung vào đọc hiểu / từ vựng / mẫu câu và giải thích.',
          '   - **TUYỆT ĐỐI KHÔNG** tự ý thêm thẻ `"quiz"` vào cuối video.',
        ]
      : includeQuiz === 'always'
        ? [
            '3. **Thử thách Quiz tương tác (`type: "quiz"`)**:',
            '   - Giữ số câu hỏi vừa phải (**2–3 câu** chất lượng cao, gắn sát nội dung vừa đọc).',
            '   - Nếu nguồn có **nhiều bài / nhiều phần nhỏ**, BẮT BUỘC đặt câu Quiz kiểm tra phần nào **ngay sau phần đó** (Phần 1 → Quiz phần 1 → Lời dẫn chuyển tiếp → Phần 2 → Quiz phần 2). **TUYỆT ĐỐI KHÔNG** đọc dồn hết mấy bài rồi mới đổ đống Quiz ra cuối video!',
            '   - Giữ câu hỏi (`"content"`) và phương án (`"options"`) súc tích, đủ nghĩa; nếu có bài đọc trước đó, trích **1–2 câu bằng chứng trực tiếp** vào `"contextExcerpt"`.',
            '   - Đặt `"thinkSec": 5` cùng lời dẫn mở Quiz tự nhiên trong `"ttsText"` và công bố đáp án trong `"ttsAnswerText"`.',
          ]
        : [
            '3. **Thử thách Quiz tương tác (`type: "quiz"` — CHỈ DÙNG KHI NGUỒN CÓ CÂU HỎI / BÀI TẬP QUIZ)**:',
            '   - **TUYỆT ĐỐI KHÔNG** tự ý gắn thêm thẻ quiz vào cuối video nếu nội dung gốc chỉ là từ vựng, hội thoại, ngữ pháp hoặc bài đọc thuần túy (KHÔNG phải bài cuối lúc nào cũng phải có quiz!).',
            '   - Nếu nguồn có **nhiều phần / nhiều bài nhỏ** kèm câu hỏi tương ứng, phải ghép câu hỏi kiểm tra phần nào **ngay sau phần đó** kèm lời dẫn chuyển tiếp — **TUYỆT ĐỐI KHÔNG** đọc hết mấy bài dài rồi mới đưa quiz dồn ở cuối.',
            '   - Khi có thẻ Quiz: đặt `"thinkSec": 5`, trích 1–2 câu bằng chứng trực tiếp vào `"contextExcerpt"` (nếu là bài đọc), đọc lời dẫn Quiz + phương án + `"Take five seconds to think."` trong `"ttsText"`, và công bố đáp án trong `"ttsAnswerText"`.',
          ];

  const { variantsListText, sceneIconsListText } = getCatalogSummaryForPrompt();

  const cartoonHostDbPrompt =
    params.compositionId === 'cartoon-host'
      ? `${getCartoonAnimationsPromptBlock()}\n  + Trên từng thẻ \`cards[]\`, gắn \`"cartoonAction": "<actionId>"\` và/hoặc \`"cartoonMood"\`, hoặc tự sáng tạo \`"cartoonAnimationSpec"\`!\n  + Nếu muốn định nghĩa thêm hành động hoàn toàn mới để lưu vào Kho Database của app, thêm mảng \`"cartoonAnimations": [{ id, name, mood, gesture, eyeStyle, mouthStyle, fxOverlay, accessory, speed, bounceAmp, headTiltDeg, blushIntensity, badgeEmoji, keywords }]\` ở JSON gốc.`
      : '';

  const exampleTimelinePromptHint =
    params.compositionId === 'cartoon-host'
      ? `Bố cục NHÂN VẬT HOẠT HÌNH LIP-SYNC (@Gimmys — BẮT BUỘC đặt \`"compositionId": "cartoon-host"\` ở JSON gốc): (1) Đặt "title" thật ngắn gọn (~6–10 từ, đúng ngôn ngữ người học, tuyệt đối KHÔNG ghi "(Transcript ...)"), (2) KHÔNG viết lời thừa làm bong bóng thoại vì app đã có phụ đề vàng ở dưới, (3) Trên từng card dùng \`badge\` ("TRÁNH DÙNG" / "NÊN DÙNG" / "MẸO HAY"), \`content\`, \`translation\` ngắn gọn, \`cartoonAction\` / \`cartoonMood\` / \`cartoonAnimationSpec\`, và \`visual.variant\` / \`visual.labels\` đối chiếu đúng-sai để nhân vật Gimmy chỉ tay & biểu cảm đúng ngữ cảnh.${cartoonHostDbPrompt ? `\n${cartoonHostDbPrompt}` : ''}`
      : params.compositionId && params.compositionId !== 'ai-decide'
        ? `Ưu tiên bố cục "${params.compositionId}" (đặt \`"compositionId": "${params.compositionId}"\` ở JSON gốc) nhưng vẫn đảm bảo chuyển cảnh có lời dẫn và giữ đủ ` +
          (includeQuiz === 'none' ? 'các thẻ UI minh họa rõ nét.' : 'thẻ UI minh họa & Quiz 5s (nếu bài có quiz).')
        : 'Chọn component minh họa (`visual.variant` + tùy biến `title`, `subtitle`, `labels`, `value`, `sceneIcon`) khớp từng đoạn bài học.';

  const targetLangConstraint =
    locale.code === 'none'
      ? 'KHÔNG viết tiếng Việt hay bản dịch thừa trong `badge`, `translation`, `explanation`, `visual.subtitle`, `visual.labels` — toàn bộ text hiển thị trên thẻ phải viết bằng chính ngôn ngữ đang học ngắn gọn, rõ nghĩa.'
      : locale.code === 'learning'
        ? 'CHẾ ĐỘ GIẢI THÍCH BẰNG CHÍNH NGÔN NGỮ MUỐN HỌC (MONOLINGUAL IMMERSION): BẮT BUỘC viết toàn bộ `badge`, `translation`, `explanation`, `explanationSpeech`, `visual.subtitle`, `visual.labels` bằng **ĐÚNG NGÔN NGỮ ĐANG HỌC (`learningLang`)** mà bạn tự nhận diện từ `# NỘI DUNG GỐC` (giải thích nghĩa, sắc thái, đối chiếu cách dùng hoàn toàn bằng chính ngôn ngữ đó — TUYỆT ĐỐI KHÔNG dịch sang tiếng Việt hay ngôn ngữ thứ ba!).'
        : `LUẬT SẮT CHỈ DÙNG ĐÚNG 2 NGÔN NGỮ (TUYỆT ĐỐI CẤM LẪN NGÔN NGỮ THỨ 3): Toàn bộ nội dung bài học CHỈ ĐƯỢC PHÉP xuất hiện đúng 2 ngôn ngữ: (1) Ngôn ngữ đang học (\`learningLang\` tự nhận diện từ # NỘI DUNG GỐC) cho câu mẫu/từ vựng/ttsText, và (2) Ngôn ngữ giải thích **${locale.targetLanguageLabel}** cho \`badge\`, \`title\` thẻ, \`translation\`, \`vocabNotes\`, \`grammarNote\`, \`explanation\`, \`explanationSpeech\`, \`visual.subtitle\`, \`visual.labels\`. Nếu \`learningLang\` KHÔNG PHẢI tiếng Anh và \`${locale.targetLanguageLabel}\` KHÔNG PHẢI tiếng Anh thì **TUYỆT ĐỐI CẤM** chèn bất kỳ câu, định nghĩa hay tiêu đề tiếng Anh nào vào bất kỳ trường nào!`;

  const isBilingualMode =
    locale.code !== 'none' &&
    locale.code !== 'learning' &&
    (!params.learningLanguage || locale.code !== params.learningLanguage);

  const exampleIntroExplSpeech =
    locale.code === 'vi'
      ? 'Chào mừng bạn đến với bài học hôm nay về chủ đề <Tên chủ đề / cụm từ chính bằng đúng learningLang> và cách dùng tự nhiên. Bây giờ chúng ta vào nội dung đầu tiên nhé.'
      : locale.code === 'learning'
        ? '<Lời giới thiệu mở đầu + mục tiêu bài học viết 100% bằng đúng learningLang>'
        : `<Welcome intro and lesson overview in ${locale.targetLanguageLabel} keeping target topic/words/grammar in natural learningLang>`;

  const exampleOutroExplSpeech =
    locale.code === 'vi'
      ? 'Tuyệt vời! Bạn vừa hoàn thành bài học về <Chủ đề / mẫu ngữ pháp bằng đúng learningLang>. Hãy lưu lại và luyện đọc to mỗi ngày nhé.'
      : locale.code === 'learning'
        ? '<Lời tổng kết & nhắc ôn tập viết 100% bằng đúng learningLang>'
        : `<Encouraging lesson recap in ${locale.targetLanguageLabel} keeping target topic/grammar in natural learningLang>`;

  return [
    '# VAI TRÒ',
    'Bạn là giáo viên ngôn ngữ bản ngữ & đạo diễn kịch bản video bài giảng dọc 9:16 (TikTok / Reels / Shorts), tương thích chuẩn JSON cố định của English Reels Studio + KineticSub Studio.',
    '',
    '# QUY TẮC ĐẶT TÊN BÀI HỌC & MẠCH CHUYỂN TIẾP (CỰC KỲ QUAN TRỌNG)',
    '- **TÊN BÀI HỌC (`"title"`) PHẢI THẬT HAY, GỢI TÒ MÒ, VÀ PHẦN LEVEL PHẢI TRÙNG NGÔN NGỮ HỌC (`learningLang`)**: Đọc kỹ `# NỘI DUNG GỐC` bên dưới, viết `"title"` (ở JSON gốc và thẻ `intro`) theo cấu trúc **TÊN HOOK CUỐN HÚT TRƯỚC | LEVEL DÀNH CHO AI BẰNG ĐÚNG NGÔN NGỮ HỌC SAU**: **`"<Tiêu đề hook gợi tò mò / nút thắt cảm xúc> | <Level nói rõ dành cho ai bằng đúng learningLang>"`**:',
    '  + **CẤM đặt tên phẳng kiểu tên truyện / sách giáo khoa khô khan** (CẤM kiểu `"La bicicleta roja que esperaba a Mateo"`, `"Hotel Vocabulary"`, `"Lesson 1"`). Phải đặt theo kiểu câu hỏi gợi tò mò hoặc nút thắt cuốn hút như: `"Todo empezó con un pequeño favor… y terminó en un reencuentro inesperado | Para nivel básico (ESPAÑOL A2)"`, `"その誘い方、英語で自然に言える？ | For Intermediate Learners (ENGLISH B1)"`, `"One tiny mistake at the cafe changed everything… | For Elementary Learners (ENGLISH A2)"`, `"たった一言で空気が変わった夜… | 初中級者向け (日本語 N4)"`.',
    '  + **PHẦN LEVEL SAU DẤU `|` BẮT BUỘC TRÙNG VỚI NGÔN NGỮ HỌC (`learningLang`)** — tuyệt đối KHÔNG ghi tiếng Việt kiểu `"Cho người cơ bản (A2)"` khi bài học là tiếng Tây Ban Nha / Anh / Nhật / Trung / Hàn / Pháp!',
    '- **CHUYỂN TIẾP PHẢI CÓ LỜI DẪN NÓI (KHÔNG CHUYỂN TRONG IM LẶNG)**: Khi chuyển từ Mở đầu → Bài 1, từ Phần/Bài 1 → Phần/Bài 2, từ Bài đọc → Quiz, hoặc trước Tổng kết, BẮT BUỘC phải có lời dẫn nói tự nhiên trong `ttsText` / `explanationSpeech` (VD: `"Now let\'s move on to the next part..."`, `"Chuyển sang phần tiếp theo..."`, `"Now let\'s check what we just learned!"`).',
    '',
    '# CẤU TRÚC BÀI GIẢNG BẮT BUỘC (KHÔNG ĐƯỢC CHỈ XUẤT SUBTITLE TRƠN)',
    'Video bài học PHẢI sinh động, có lộ trình rõ ràng:',
    isBilingualMode
      ? `1. **Mở đầu (\`type: "intro"\`) — CHẾ ĐỘ SONG NGỮ CHỈ ĐỌC NGÔN NGỮ GỐC**: Ở chế độ 2 thứ tiếng, phần mở đầu **CHỈ cần \`"explanationSpeech"\` bằng ${locale.targetLanguageLabel} (ngôn ngữ gốc)** và đặt \`"ttsText": ""\` (KHÔNG cần đọc lặp bằng ngôn ngữ học ở intro). Tuy nhiên, **tên chủ đề, từ vựng chính hoặc mẫu ngữ pháp được nhắc tới trong \`explanationSpeech\` vẫn PHẢI viết bằng đúng \`learningLang\` tự nhiên** (VD: \`"Chào mừng bạn đến với bài học về Hotel Check-in và mẫu câu lịch sự Could I have..."\`) để TTS đọc chuẩn tự nhiên. Chọn \`visual.variant: "bs-card-header"\` hoặc \`"css-roadmap-steps"\`.`
      : '1. **Mở đầu (`type: "intro"`)**: Giới thiệu rõ **mục tiêu thực tế & đúng tên bài học** (VD: `"Welcome to today\'s lesson on <Exact Lesson Title>..."`). Chọn `visual.variant: "bs-card-header"` hoặc `"css-roadmap-steps"`.',
    '2. **Nội dung bài đọc / Từ vựng (`type: "vocab"`)**:',
    '   - **CẤM VIẾT CÁCH ĐỌC CẢ CÂU (NO FULL-SENTENCE HIRAGANA / FURIGANA / ROMAJI / PINYIN / IPA)**: Khi viết câu ngoại ngữ (đặc biệt tiếng Nhật), viết câu tự nhiên (漢字 + かな), TUYỆT ĐỐI KHÔNG viết lại cả câu bằng Hiragana, KHÔNG chèn furigana trong ngoặc `漢字(かんじ)` vào câu, KHÔNG nhồi `/IPA/`, Pinyin hay Romaji vào `ttsText` / `content` / `phonetic` (để `"phonetic": ""`).',
    '   - **GIẢI THÍCH TỪ VỰNG KHÓ & NGỮ PHÁP KHÓ THEO TRÌNH ĐỘ (`"vocabNotes"`, `"grammarNote"`, `"explanationSpeech"`)**: Nếu trong câu có **từ vựng khó hoặc ngữ pháp khó so với trình độ (`"level"`)**, BẮT BUỘC ghi rõ: (1) giải thích nghĩa, (2) cách dùng thực tế, (3) chú ý / bẫy dễ nhầm nếu có; **riêng nếu từ vựng khó là chữ Hán / Kanji thì BẮT BUỘC kèm cách đọc Hiragana của riêng từ Kanji khó đó** (VD: `雰囲気（ふんいき）: bầu không khí — ...`), tuyệt đối KHÔNG viết Hiragana cho cả câu!',
    `   - Ở trường \`"translation"\`, \`"vocabNotes"\`, \`"grammarNote"\` và \`"explanationSpeech"\`, giải thích ĐẦY ĐỦ, SÂU SẮC ý nghĩa từ khó, sắc thái ngữ cảnh & cấu trúc ngữ pháp bằng **${locale.targetLanguageLabel}** (tránh câu cụt vô nghĩa; riêng **từ vựng mục tiêu, chủ đề và mẫu ngữ pháp** được nhắc tới trong \`explanationSpeech\` phải viết bằng đúng \`learningLang\` tự nhiên).`,
    '   - Nếu nguồn có nhiều phần nhỏ / nhiều mục kiến thức, tách từng mục trọn vẹn có lời dẫn chuyển phần tự nhiên (không gộp vội hay cắt cụt câu).',
    ...quizPolicyBlock,
    isBilingualMode
      ? `4. **Tổng kết (\`type: "outro"\`) — CHẾ ĐỘ SONG NGỮ CHỈ ĐỌC NGÔN NGỮ GỐC**: Ở chế độ 2 thứ tiếng, phần tổng kết **CHỈ cần \`"explanationSpeech"\` bằng ${locale.targetLanguageLabel} (ngôn ngữ gốc)** và đặt \`"ttsText": ""\` (KHÔNG cần \`ttsText\` bằng ngôn ngữ học ở outro); nhưng nếu nhắc lại chủ đề, từ khóa hay ngữ pháp vừa học thì vẫn viết bằng đúng \`learningLang\` tự nhiên. **NẾU NGUỒN LÀ BÀI ĐỌC, CÂU CHUYỆN HOẶC HỘI THOẠI**: PHẢI tổng kết thật rõ hôm nay vừa đọc/nghe nội dung gì và người học **đã học được những gì** (ý chính, kỹ năng/tình huống thực tế, các từ vựng/ngữ pháp đắt giá vừa gặp). Dùng component \`"css-bento-stats"\` hoặc \`"bs-list-group"\`.`
      : '4. **Tổng kết (`type: "outro"`)**: Bắt buộc có lời đọc `"ttsText"` (và `"explanationSpeech"` nếu có giải thích) **tổng kết rõ nội dung vừa học & những kiến thức/mẫu câu trọng tâm đã rút ra** (đặc biệt khi là bài đọc đoạn văn hoặc hội thoại) qua component `"css-bento-stats"` hoặc `"bs-list-group"`.',
    '',
    TYPOGRAPHY_MOBILE_READABILITY_PROMPT_BLOCK,
    '',
    '# TÙY BIẾN UI COMPONENT & TỰ VẼ SÁNG TẠO (BOOTSTRAP 5 / MODERN CSS + `customPrimitives`)',
    'Trên MỖI thẻ trong `cards`, hãy điền object `"visual"` để chọn & **tùy biến trực tiếp nội dung/nhãn** trên 50+ UI component Bootstrap 5 / Modern CSS / Vector sẵn có trong hệ thống:',
    variantsListText,
    `- Icon hợp lệ cho \`visual.sceneIcon\`: ${sceneIconsListText}`,
    '- **Cách 1 — Tùy biến tham số trên component sẵn có**: Đặt `"variant"` đúng mã ở trên (VD `"bs-card-header"`, `"css-sticky-note"`, `"bs-badge-cluster"`, `"css-magnifying-word"`, `"bs-modal-quiz"`, `"css-flashcard-flip"`, `"css-grammar-equation"`, `"bs-alert-tip"`, `"bs-pricing-tier"`, `"css-bento-stats"`, `"hotel-desk"`, `"shopping-price"`...) kèm `"title"`, `"subtitle"`, `"labels"` (mảng 2–3 cụm callout rõ nghĩa), `"value"` (0..1), `"formula"`, `"highlightWord"`, `"sceneIcon"`.',
    '- **Cách 2 — Tự thiết kế component UI mới hoàn toàn qua `visual.customPrimitives[]`**:',
    '  + Hệ tọa độ quanh tâm `(0, 0)`, vùng an toàn `x: -380..380`, `y: -145..145`.',
    '  + Các hình hỗ trợ: `rect`, `pill`, `circle`, `ellipse`, `line`/`arrow`, `polygon`, `icon`, `text` (mọi `text` BẮT BUỘC có `"fontSize"` >= 24, text chính 36–48).',
    '',
    '# LUẬT KHÔNG ĐỤNG HÀNG (ĐA DẠNG COMPONENT)',
    '- **KHÔNG lặp lại `visual.variant`** trên 2 thẻ liên tiếp trong cùng 1 video.',
    '- Khi thẻ Quiz có `contextExcerpt`, ưu tiên `"variant": "css-browser-mockup"` với `speechText` chứa 1–2 câu bằng chứng trực tiếp.',
    '',
    '# NHIỆM VỤ XỬ LÝ NGUỒN DỮ LIỆU',
    params.sourceUrl ? `- URL nguồn: ${params.sourceUrl}` : '',
    durationDirective,
    !isStaleDefaultTitle
      ? `- Tên bài học gợi ý (đối chiếu lại với nội dung nguồn nếu cần): ${cleanedUserTitle}`
      : '- Chưa có tên bài học cố định — BẮT BUỘC đặt `"title"` phản ánh chính xác 100% nội dung bài trong nguồn bên dưới.',
    '1. Lọc bỏ tiêu đề khung bài tập thừa kiểu menu web hay `"English Reading Exercises for Beginner"` khỏi câu đọc, nhưng giữ chuyển tiếp có lời dẫn nói giữa các phần nội dung thật.',
    `2. ${modeInstruction}`,
    `3. ${targetLangConstraint}`,
    `4. ${exampleTimelinePromptHint}`,
    '',
    '# QUY TẮC VÀNG CHO GIỌNG ĐỌC TTS ("ttsText", "explanationSpeech", "ttsAnswerText", "learningLang")',
    '- **NHẬN DIỆN ĐÚNG NGÔN NGỮ NGUỒN (`"learningLang"`)**: Tự động phát hiện ngôn ngữ đang học trong `# NỘI DUNG GỐC` (`en` = Tiếng Anh, `es` = Tây Ban Nha, `fr` = Pháp, `ja` = Nhật, `zh` = Trung, `ko` = Hàn) và ghi rõ vào `"learningLang"`.',
    '- **PHÂN TÁCH NGÔN NGỮ CHUẨN XÁC CHO DUAL-TTS**:',
    '  + Toàn bộ `"ttsText"` (ở các thẻ `vocab` / `quiz`) và `"ttsAnswerText"` PHẢI viết **100% THUẦN NGÔN NGỮ NGUỒN (`learningLang`)** — nếu nguồn là tiếng Tây Ban Nha / Pháp / Nhật / Trung / Hàn, lời dẫn chuyển phần và công bố đáp án trong `"ttsText"` / `"ttsAnswerText"` CŨNG PHẢI viết bằng đúng ngôn ngữ đó (TUYỆT ĐỐI KHÔNG chèn mẫu câu tiếng Anh kiểu `"Take five seconds to think"` khi bài học không phải tiếng Anh!).',
    ...(isBilingualMode
      ? [
          `  + Khi đọc 2 thứ tiếng, thẻ \`"intro"\` và \`"outro"\` chỉ dùng \`"explanationSpeech"\` bằng **${locale.targetLanguageLabel}** (đặt \`"ttsText": ""\`).`,
          `  + Trong toàn bộ \`"explanationSpeech"\` (kể cả khi chỉ bật đọc ngôn ngữ gốc hay ở \`intro\`/\`outro\`), hãy viết khung câu bằng **${locale.targetLanguageLabel}**, nhưng mọi **TỪ VỰNG mục tiêu, CHỦ ĐỀ bài học và MẪU NGỮ PHÁP** được nhắc tới **PHẢI viết trực tiếp bằng \`learningLang\` tự nhiên** (chữ viết gốc thật — KHÔNG dịch chay sang tiếng Việt, KHÔNG viết Pinyin/Romaji/phiên âm bồi) để hệ thống TTS song ngữ tự tách và đọc phần từ/chủ đề/ngữ pháp đó bằng giọng bản ngữ tự nhiên!`,
        ]
      : [
          `  + Toàn bộ \`"explanationSpeech"\` PHẢI viết **100% thuần ${locale.targetLanguageLabel}** để giọng giải thích đọc chuẩn.`,
        ]),
    '- **HẠN CHẾ TỐI ĐA CHUỖI NGÔN NGỮ GỐC CHỈ CÓ 1 TỪ & CẤM KÝ TỰ ĐƠN LẺ (TRÁNH TTS ĐỌC NHẦM THÀNH CHỮ CÁI)**:',
    '  + Trong `"explanationSpeech"`, `"translation"`, hay nhãn giải thích bằng ngôn ngữ gốc, **TUYỆT ĐỐI HẠN CHẾ sinh chuỗi chỉ có 1 từ đơn lẻ** (kiểu `"Đi"`, `"Tốt"`, `"Sai"`, `"Đúng"`, `"Mệt"`). Luôn viết thành **cụm từ hoàn chỉnh từ 2–4 từ trở lên hoặc cả câu tự nhiên** để TTS không đọc nhầm thành ký tự.',
    '  + **CẤM** viết chữ cái đơn lẻ hoặc ký hiệu viết tắt rời rạc kiểu `"A"`, `"B"`, `"X"`, `"Y"`, `"S"`, `"V"`, `"O"`, `"N"`, `"Adj"`, `"VD"`, `"ĐT"`, `"S + V + O"` trong `ttsText` / `explanationSpeech` / `ttsAnswerText` — hãy viết thành từ/cụm tự nhiên hoàn chỉnh (VD: thay `"S + used to + V"` bằng `"cấu trúc chủ ngữ cộng used to cộng động từ nguyên mẫu"`).',
    '- TUYỆT ĐỐI KHÔNG đưa ký tự `&` (viết thành `and` / `y` / `và`), IPA `/.../`, Pinyin/Romaji, emoji, URL, hay ký hiệu markdown vào `ttsText` / `explanationSpeech` / `ttsAnswerText`.',
    ...(includeQuiz !== 'none'
      ? [
          '- Riêng thẻ `quiz` (nếu bài có quiz): `"ttsText"` đọc câu hỏi + phương án + lời mời suy nghĩ 5 giây bằng **đúng ngôn ngữ `learningLang`** và đặt `"thinkSec": 5`.',
        ]
      : []),
    '',
    `# ĐỊNH DẠNG JSON CỐ ĐỊNH BẮT BUỘC TRẢ VỀ (MINH HỌA SCHEMA — PHẢI THAY BẰNG NỘI DUNG THẬT TỪ NGUỒN VÀ ĐÚNG NGÔN NGỮ "learningLang")`,
    '```json',
    '{',
    '  "title": "<Tiêu đề hook thật hay, gợi tò mò (VD: \'Todo empezó con un pequeño favor… y terminó en un reencuentro inesperado\' hoặc \'その誘い方、英語で自然に言える？\')> | <Đối tượng & Level viết bằng ĐÚNG learningLang (VD: Para nivel básico (ESPAÑOL A2) / For Intermediate Learners (ENGLISH B1))>",',
    '  "level": "<A1|A2|B1|B2|C1|C2|N5|N4|N3|N2|N1|HSK 1..6|TOPIK 1..6>",',
    ...(params.compositionId && params.compositionId !== 'ai-decide'
      ? [`  "compositionId": "${params.compositionId}",`]
      : []),
    '  "learningLang": "<en | ja | zh | ko | fr | es — tự động nhận diện từ nội dung nguồn>",',
    '  "mode": "reading | quiz | vocab",',
    ...(durationMinutes
      ? [
          `  "durationReport": { "targetMinutes": ${durationMinutes}, "estimatedMinutes": ${durationMinutes}, "estimatedCount": ${durationWordsEstimate}, "metMinimum": true, "shortfallReason": "" },`,
        ]
      : []),
    '  "cards": [',
    '    {',
    '      "type": "intro",',
    `      "badge": ${JSON.stringify(locale.promptExampleBadge)},`,
    '      "title": "<Tên bài học khớp với title gốc>",',
    `      "content": ${JSON.stringify(locale.promptExampleIntroContent)},`,
    `      "translation": ${JSON.stringify(locale.promptExampleTranslation)},`,
    ...(isBilingualMode
      ? ['      "ttsText": "",']
      : [
          params.learningLanguage && params.learningLanguage !== 'en'
            ? '      "ttsText": "<Lời chào mở đầu & giới thiệu chủ đề viết 100% bằng đúng learningLang>",'
            : '      "ttsText": "Welcome to today\'s lesson on <Exact Topic>. Let\'s start with the first key expression.",',
        ]),
    ...(locale.code !== 'none'
      ? [`      "explanationSpeech": ${JSON.stringify(exampleIntroExplSpeech)},`]
      : []),
    '      "visual": {',
    ...(params.compositionId === 'cartoon-host'
      ? [
          '        "variant": "contrast-pair-cards",',
          '        "labels": ["<Mẫu tránh dùng>", "<Mẫu tự nhiên hơn>"]',
        ]
      : [
          '        "variant": "bs-card-header",',
          `        "formula": ${JSON.stringify(locale.lessonOverviewFormula)},`,
          '        "title": "<Tên bài học thực tế>",',
          `        "subtitle": ${JSON.stringify(locale.introVisualSubtitle)},`,
          '        "sceneIcon": "graduation"',
        ]),
    '      }',
    ...(params.compositionId === 'cartoon-host'
      ? [
          ',',
          '      "cartoonAction": "wave-hello",',
          '      "cartoonMood": "happy"',
        ]
      : []),
    '    },',
    '    {',
    '      "type": "vocab",',
    `      "badge": ${JSON.stringify(`${locale.readingBadgePrefix} #1`)},`,
    '      "title": "<Tiêu đề ngắn bằng ngôn ngữ giải thích>",',
    '      "content": "<Câu hoặc từ vựng thực tế trích từ nguồn bằng đúng learningLang — KHÔNG viết lại cả câu bằng Hiragana/Furigana>",',
    '      "phonetic": "",',
    `      "vocabNotes": "<Giải thích bằng ${locale.targetLanguageLabel} nếu có từ khó so với level: nghĩa + cách dùng + chú ý (nếu từ khó là Kanji thì kèm Hiragana riêng từ đó, VD: 雰囲気（ふんいき）)>",`,
    `      "grammarNote": "<Giải thích bằng ${locale.targetLanguageLabel} nếu có ngữ pháp khó so với level: công thức + cách dùng + chú ý nếu có>",`,
    `      "translation": ${JSON.stringify(locale.promptExampleVocabTranslation)},`,
    '      "ttsText": "<Câu hoặc từ vựng tự nhiên bằng đúng learningLang để đọc>",',
    ...(params.compositionId === 'cartoon-host'
      ? [
          '      "cartoonAction": "point-up",',
          '      "cartoonMood": "confident",',
          '      "visual": {',
          '        "labels": ["<Ý chính 1>", "<Ý chính 2>"]',
          '      }',
        ]
      : [
          '      "visual": {',
          '        "variant": "css-sticky-note",',
          `        "title": ${JSON.stringify(`${locale.vocabPrefix.replace(/:$/, '')} & ${locale.grammarPrefix.replace(/:$/, '')}`)},`,
          `        "labels": ${JSON.stringify(locale.promptExampleStickyLabels)},`,
          '        "sceneIcon": "book"',
          '      }',
        ]),
    '    },',
    ...(includeQuiz !== 'none'
      ? [
          '    {',
          '      "type": "quiz",',
          '      "badge": "QUIZ #1",',
          '      "title": "<Chỉ thêm card quiz khi nguồn có câu hỏi hoặc bật chế độ Quiz>",',
          '      "contextExcerpt": "<1-2 câu bằng chứng trực tiếp từ bài bằng đúng learningLang>",',
          '      "content": "<Câu hỏi kiểm tra ngay phần vừa học bằng đúng learningLang>",',
          `      "translation": "<Nghĩa ngắn gọn câu hỏi bằng ${locale.targetLanguageLabel}>",`,
          '      "options": ["<Phương án A bằng đúng learningLang>", "<Phương án B bằng đúng learningLang>", "<Phương án C bằng đúng learningLang>"],',
          '      "answerIndex": 1,',
          '      "thinkSec": 5,',
          `      "explanation": ${JSON.stringify(locale.promptExampleExplanation)},`,
          params.learningLanguage && params.learningLanguage !== 'en'
            ? '      "ttsText": "<Lời dẫn quiz + đọc câu hỏi + phương án + lời mời nghĩ 5 giây viết 100% bằng đúng learningLang>",'
            : '      "ttsText": "Now let\'s test what we just read! Question one: ... A, ... B, ... C, ... Take five seconds to think.",',
          params.learningLanguage && params.learningLanguage !== 'en'
            ? '      "ttsAnswerText": "<Lời công bố hết giờ & đáp án đúng viết 100% bằng đúng learningLang>",'
            : '      "ttsAnswerText": "Time is up! The correct answer is B.",',
          ...(params.compositionId === 'cartoon-host'
            ? [
                '      "cartoonAction": "thinking-chin",',
                '      "cartoonMood": "curious"',
              ]
            : [
                '      "visual": {',
                '        "variant": "css-browser-mockup",',
                `        "title": ${JSON.stringify(locale.promptExampleContextTitle)},`,
                '        "speechText": "<Câu bằng chứng trích từ bài>",',
                '        "sceneIcon": "book"',
                '      }',
              ]),
          '    },',
        ]
      : []),
    '    {',
    '      "type": "outro",',
    `      "badge": ${JSON.stringify(locale.outroBadge)},`,
    `      "title": ${JSON.stringify(locale.outroTitle)},`,
    `      "content": ${JSON.stringify(locale.promptExampleOutroContent)},`,
    `      "translation": ${JSON.stringify(locale.promptExampleOutroTranslation)},`,
    ...(isBilingualMode
      ? ['      "ttsText": "",']
      : [
          params.learningLanguage && params.learningLanguage !== 'en'
            ? '      "ttsText": "<Lời tổng kết bài học viết 100% bằng đúng learningLang>",'
            : '      "ttsText": "Great job! Today you practiced <Exact Topic>. Review these expressions every day.",',
        ]),
    ...(locale.code !== 'none'
      ? [`      "explanationSpeech": ${JSON.stringify(exampleOutroExplSpeech)},`]
      : []),
    ...(params.compositionId === 'cartoon-host'
      ? [
          '      "cartoonAction": "clap-jump",',
          '      "cartoonMood": "excited"',
        ]
      : [
          '      "visual": {',
          '        "variant": "css-bento-stats",',
          `        "title": ${JSON.stringify(locale.outroTitle)},`,
          `        "labels": ${JSON.stringify(locale.promptExampleOutroLabels)},`,
          '        "sceneIcon": "sparkles"',
          '      }',
        ]),
    '    }',
    '  ]',
    '}',
    '```',
    '',
    '# NỘI DUNG GỐC CẦN CHUYỂN HÓA',
    '"""',
    (params.sourceText || '').trim().slice(0, 14000),
    '"""',
    '',
    'HÃY XUẤT KẾT QUẢ CUỐI CÙNG THÀNH **1 FILE `.json` HOÀN CHỈNH HỢP LỆ** (chỉ trả về dữ liệu file JSON, không giải thích dài dòng bên ngoài).',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildAiCreatorWebAiPrompt(params: {
  topicHint?: string;
  customInputLines?: string;
  learningLanguage?: LearningLanguageId;
  level?: string;
  durationMinutes?: number;
  audience?: string;
  targetDuration?: string;
  itemCount?: number | 'auto';
  targetLang: string;
  formatPreference?: CreatorFormatCategory;
  compositionId?: LayoutCompositionId | 'ai-decide';
  aspectRatio?: ExportAspectRatioId;
  includeExplanationSpeech?: boolean;
  splitAudioByRole?: boolean;
  includeQuiz?: boolean;
}): string {
  const learningLang: LearningLanguageId = params.learningLanguage || 'en';
  const locale = getReelLocaleStrings(params.targetLang, learningLang);
  const { variantsListText, sceneIconsListText } = getCatalogSummaryForPrompt();
  const langOption =
    LEARNING_LANGUAGE_OPTIONS.find((item) => item.id === learningLang) || LEARNING_LANGUAGE_OPTIONS[0];
  const levelOptions = getLevelsForLearningLanguage(learningLang);
  const chosenLevel =
    params.level?.trim() ||
    (params.audience?.trim() ? params.audience.trim() : levelOptions[0]?.id || langOption.defaultLevel);
  const levelDesc =
    levelOptions.find((l) => l.id === chosenLevel)?.description || `Difficulty level: ${chosenLevel}`;

  const durationMinutes =
    typeof params.durationMinutes === 'number' && Number.isFinite(params.durationMinutes) && params.durationMinutes > 0
      ? Math.max(0.5, Math.min(30, params.durationMinutes))
      : undefined;
  const includeExplanationSpeech = params.includeExplanationSpeech !== false;
  const splitAudioByRole = Boolean(params.splitAudioByRole && includeExplanationSpeech && locale.code !== 'none');
  const isAutoItemCount = params.itemCount === 'auto';
  const defaultCount = durationMinutes
    ? recommendCreatorItemCount(durationMinutes, includeExplanationSpeech)
    : 8;
  const numericCount =
    typeof params.itemCount === 'number' && Number.isFinite(params.itemCount)
      ? Math.max(4, Math.min(60, Math.round(params.itemCount)))
      : Math.max(4, Math.min(60, Math.round(defaultCount)));
  const countPadded = isAutoItemCount ? 'N' : String(numericCount).padStart(2, '0');
  const targetWordsFloor = durationMinutes ? Math.round(durationMinutes * 130) : undefined;
  const targetCjkFloor = durationMinutes ? Math.round(durationMinutes * 185) : undefined;
  const isCjkLearning = learningLang === 'ja' || learningLang === 'zh';
  const durationLabel = durationMinutes
    ? `${durationMinutes} phút (~${Math.round(durationMinutes * 60)} giây, tối thiểu ~${isCjkLearning ? `${targetCjkFloor}+ ký tự ${langOption.nativeName} + lời giải thích` : `${targetWordsFloor}+ từ lời đọc tổng cộng`})`
    : params.targetDuration?.trim() || '30–60s';
  const topicHint = params.topicHint?.trim();
  const aspectLabel =
    params.aspectRatio === '16:9'
      ? '16:9 Landscape Widescreen (1920×1080 — visual left, key card right)'
      : '9:16 Vertical Short (1080×1920 — TikTok / Reels / Shorts)';

  const formatLabels: Record<CreatorFormatCategory, string> = {
    auto: 'Tự chọn dạng cuốn hút nhất trong 14 nhóm A–N bên dưới (KHÔNG mặc định bài đọc comprehension)',
    vocab: 'A. Vocabulary Lists (từ vựng nâng cấp / từ hay dùng để nói tự nhiên, sang hơn)',
    phrases: 'B. Natural Phrases (ngưng nói câu sách giáo khoa, thay bằng cụm tự nhiên của người bản xứ)',
    phrasal_verbs: 'C. Phrasal Verbs / Verb Patterns (cụm động từ & mẫu động từ thực tế kèm ngữ cảnh dễ nhớ)',
    mistakes: "D. Common Mistakes (Don't say X → Say Y instead, sửa lỗi người học hay mắc)",
    grammar: 'E. Grammar in Context (phân biệt cấu trúc dễ nhầm trực quan qua tình huống)',
    comparisons: 'F. Vocabulary Comparisons (đối chiếu 2–3 từ gần nghĩa)',
    real_life: 'G. Real-life Conversations (mẫu câu giao tiếp thực tế tại quán cafe, sân bay, công sở, du lịch)',
    shadowing_solo: 'H. Shadowing 1 người (Solo Shadowing Drill — chuỗi câu nối tiếp giàu nhịp điệu, ngắt nghỉ tự nhiên để người học nói đuổi theo 1 giọng đọc bản xứ)',
    shadowing_dialogue: 'I. Shadowing nhiều người (2–3 Speakers Shadowing Dialogue — hội thoại qua lại giữa 2–3 nhân vật như A/B/C, ghi rõ vai người nói ở `kicker`/`title`/`visual.labels`, còn `speech` là câu thoại thuần tự nhiên để luyện phản xạ & nhại ngữ điệu)',
    podcast_solo: 'J. Podcast 1 người (Solo Storytelling / Deep-Dive Podcast — độc thoại chia sẻ góc nhìn sâu sắc, giọng kể ấm áp, mạch lạc, tự nhiên)',
    podcast_duo: 'K. Podcast 2 người (Two-Host Podcast — talkshow đối thoại tung hứng giữa Host A & Host B: đặt câu hỏi, phản hồi tự nhiên, mở rộng góc nhìn; ghi rõ tên/vai Host ở `kicker`/`title`/`visual.labels`, giữ `speech` thuần lời thoại)',
    trending_social: 'L. Chủ đề Hot & Trend hiện nay (MXH, TikTok/Threads, AI trong đời sống, digital detox, Gen Z/pop culture, cách nói viral hiện đại)',
    workplace_tech: 'M. Công sở, Phỏng vấn & AI / Tech (họp team, remote work, phỏng vấn việc làm, đàm phán khéo, chủ đề công nghệ & AI hiện đại)',
    news_storytelling: 'N. Tin tức nóng, Tâm lý & Đời sống thực tế (câu chuyện thời sự, tâm lý học hành vi, sức khỏe tinh thần, tài chính cá nhân, du lịch trải nghiệm)',
  };
  const chosenFormatInstruction = formatLabels[params.formatPreference ?? 'auto'];

  const formatPref: CreatorFormatCategory = params.formatPreference ?? 'auto';
  const isMultiSpeakerFormat =
    formatPref === 'real_life' ||
    formatPref === 'shadowing_dialogue' ||
    formatPref === 'podcast_duo';
  const isShadowingFormat =
    formatPref === 'shadowing_solo' || formatPref === 'shadowing_dialogue';
  const isPodcastFormat =
    formatPref === 'podcast_solo' || formatPref === 'podcast_duo';
  const isSituationalKnowledgeFormat =
    formatPref === 'trending_social' ||
    formatPref === 'workplace_tech' ||
    formatPref === 'news_storytelling';
  const isConversationalScriptMode =
    isMultiSpeakerFormat || isShadowingFormat || isPodcastFormat || isSituationalKnowledgeFormat;

  const explainLangName =
    locale.code === 'none' ? langOption.nativeName : locale.targetLanguageLabel;
  const isMonolingualExplain = locale.code === 'none' || locale.code === learningLang;
  const isBilingualTwoLang = includeExplanationSpeech && !isMonolingualExplain;
  const introOutroNativeOnly = splitAudioByRole || isBilingualTwoLang;
  const translationRule =
    locale.code === 'none'
      ? `Write short, crisp ${langOption.nativeName} explanations in \`meaning\` and keep \`translation\` concise in ${langOption.nativeName}.`
      : `Write \`meaning\` / \`translation\` / \`vocabNotes\` / \`grammarNote\` / \`visual.subtitle\` / \`visual.labels\` clearly in **${locale.targetLanguageLabel}** tailored for level **${chosenLevel}**.`;

  const compHint =
    params.compositionId === 'cartoon-host'
      ? 'Layout MUST set `"compositionId": "cartoon-host"` at root JSON (**@Gimmys Lip-Sync Cartoon Host**, aspect ' +
        aspectLabel +
        '): Keep root `"title"` short and hooky (~6–10 words in the learner language, never technical labels). Do NOT duplicate subtitles as a top speech bubble—instead pair each card with clear Wrong/Avoid vs Right/Natural contrast labels (`word`, `meaning`, `translation`, `visual.labels`, e.g. `"Avoid"` vs `"Use this instead"`), and optionally set `"cartoonAction"`, `"cartoonMood"`, or custom `"cartoonAnimationSpec"` on each card (plus optional root `"cartoonAnimations": [...]` for brand-new reusable actions) so Gimmy animates & reacts expressively!\n' +
        getCartoonAnimationsPromptBlock()
      : params.compositionId && params.compositionId !== 'ai-decide'
        ? `Set \`"compositionId": "${params.compositionId}"\` when appropriate while still varying individual card visuals.`
        : 'Intelligently rotate visual components across cards.';

  const scriptPurityHint =
    learningLang === 'zh'
      ? 'Put **100% pure Simplified Chinese Hanzi (汉字)** inside `"speech"` and `"example"` (NEVER rewrite the whole sentence in Pinyin, and leave `"phonetic": ""` empty! Put Pinyin ONLY on a specific difficult word inside `"vocabNotes"` if needed).'
      : learningLang === 'ja'
        ? 'Put **100% pure natural Japanese (漢字 + かな)** inside `"speech"` and `"example"` (**NEVER** rewrite the full sentence in Hiragana, **NEVER** insert inline Furigana parentheses like `漢字(かんじ)` inside sentences, and leave `"phonetic": ""` empty!).'
        : learningLang === 'ko'
          ? 'Put **100% pure Korean Hangul (한국어)** inside `"speech"` and `"example"` (NEVER rewrite the full sentence in Romanization, and leave `"phonetic": ""` empty!).'
          : `Put **100% pure ${langOption.nativeName}** inside \`"speech"\` and \`"example"\` (NEVER put full-sentence phonetic/IPA, leave \`"phonetic": ""\` empty!).`;

  const difficultVocabGrammarRule = [
    `- **NO FULL-SENTENCE READING + TARGETED DIFFICULT VOCAB/GRAMMAR RULE (CALIBRATED TO LEVEL ${chosenLevel})**:`,
    `  + **KHÔNG tạo cách đọc của cả câu**: Tuyệt đối KHÔNG viết lại cả câu bằng Hiragana, Furigana, Romaji, Pinyin hay IPA (luôn để \`"phonetic": ""\` rỗng). Câu tiếng Nhật viết tự nhiên bằng Kanji + Kana bình thường.`,
    `  + **GIẢI THÍCH TỪ VỰNG KHÓ & NGỮ PHÁP KHÓ SO VỚI TRÌNH ĐỘ ${chosenLevel}**: Khi trong câu có **từ vựng khó** hoặc **ngữ pháp khó** đối với trình độ **${chosenLevel}**, BẮT BUỘC bổ sung:`,
    `    1) Giải thích nghĩa rõ ràng (\`"vocabNotes"\` / \`"grammarNote"\` / \`"meaning"\` / \`"explanationSpeech"\`)`,
    `    2) Cách dùng thực tế trong giao tiếp (\`cách dùng\`)`,
    `    3) Chú ý / lỗi dễ nhầm nếu có (\`chú ý nếu có\`)`,
    `    4) **Quy tắc Kanji → Hiragana**: Nếu từ vựng khó là chữ Kanji (tiếng Nhật), BẮT BUỘC ghi kèm cách đọc **Hiragana của riêng từ Kanji khó đó** trong \`"vocabNotes"\` / \`"meaning"\` (VD: \`雰囲気（ふんいき）: bầu không khí — cách dùng & chú ý...\`), KHÔNG viết Hiragana cho cả câu!`,
  ].join('\n');

  const bilingualEmbeddedLearningRule = isBilingualTwoLang
    ? [
        `  + **BILINGUAL INTRO / OUTRO RULE (2 LANGUAGES)**: On \`type: "title"\` (intro) and \`type: "outro"\` cards, ONLY the native explanation voice is needed — set \`"speech": ""\` and write the full intro/outro script in \`"explanationSpeech"\` framed in **${explainLangName}** (no duplicate ${langOption.nativeName} \`"speech"\` on intro/outro!).`,
        `  + **NATURAL LEARNING LANGUAGE FOR TARGET TERMS, TOPIC & GRAMMAR (EVEN WHEN ONLY NATIVE AUDIO IS ON)**: Inside \`"explanationSpeech"\` (on \`title\` intro, \`vocab\` cards, and \`outro\`), frame the sentence naturally in **${explainLangName}**, **BUT write every target word/phrase, lesson topic term, and grammar pattern directly in natural ${langOption.nativeName}** (actual native script—NEVER Pinyin/Romaji/phonetic approximation and NEVER translated away into ${explainLangName}!) so our bilingual TTS auto-splitter pronounces target words, topics, and grammar naturally in the **${langOption.nativeName}** voice even if the user disables the learning audio track.`,
      ]
    : [
        `  + \`"explanationSpeech"\` MUST be **100% pure ${explainLangName}** ONLY (1–2 natural spoken sentences explaining meaning, usage tip, or nuance so learners understand just by listening).`,
      ];

  const antiOneWordNativeRule =
    `- **MINIMIZE 1-WORD NATIVE STRINGS & BAN SINGLE-LETTER SYMBOLS IN TTS**: In **${explainLangName}** fields (\`"explanationSpeech"\`, \`"meaning"\`, \`"translation"\`, \`"title"\`, \`"outro"\`), **AVOID generating isolated 1-word native strings** (e.g. \`"Đi"\`, \`"Tốt"\`, \`"Sai"\`, \`"Đúng"\`, \`"Mệt"\`). Always write natural multi-word phrases (at least 2–4+ native words or full sentences) AND **NEVER** put standalone single letters or shorthand abbreviations (\`"A"\`, \`"B"\`, \`"X"\`, \`"Y"\`, \`"S"\`, \`"V"\`, \`"O"\`, \`"N"\`, \`"Adj"\`, \`"VD"\`, \`"S + V + O"\`) inside \`"speech"\` or \`"explanationSpeech"\` so TTS never misreads isolated tokens character-by-character!`;

  const dualTtsRules = splitAudioByRole
    ? [
        `- **CRITICAL ROLE-SEPARATED DUAL-TTS RULE**: Our studio separates audio strictly by card role across **2 TTS VOICES**:`,
        `  + **Target Learning Voice (${langOption.nativeName})** ONLY reads core teaching items (\`type: "vocab"\` — the target word, phrase, grammar pattern, or sample sentence in \`"speech"\`). ${scriptPurityHint}`,
        `  + **Explanation Voice (${explainLangName})** reads ALL framing & explanations: \`type: "title"\` (intro hook), \`"explanationSpeech"\` on every \`"vocab"\` card (meaning, grammar rule, usage tip), and \`type: "outro"\` (closing).`,
        `  + On \`type: "title"\` and \`type: "outro"\` cards, set \`"speech": ""\` and put the full spoken script in \`"explanationSpeech"\` framed in **${explainLangName}**!`,
        ...(isBilingualTwoLang
          ? [
              `  + **NATURAL LEARNING LANGUAGE FOR TARGET TERMS, TOPIC & GRAMMAR**: Even inside \`"explanationSpeech"\` (\`title\`, \`vocab\`, \`outro\`), keep every target word/phrase, lesson topic expression, and grammar structure in natural **${langOption.nativeName}** (actual script, never Romaji/Pinyin or translated away) so bilingual TTS splits and reads them naturally!`,
            ]
          : []),
        antiOneWordNativeRule,
      ]
    : includeExplanationSpeech
      ? [
          `- **CRITICAL DUAL-TTS SEPARATION RULE**: Our studio uses **2 SEPARATE TTS VOICES** (Voice 1: **${langOption.nativeName}** voice, Voice 2: **${explainLangName}** voice).`,
          `  + \`"speech"\` on \`type: "vocab"\` cards MUST be **100% pure ${langOption.nativeName}** ONLY (spoken word/phrase + natural example sentence). ${scriptPurityHint} NEVER mix ${explainLangName} inside \`"speech"\`!`,
          ...bilingualEmbeddedLearningRule,
          antiOneWordNativeRule,
        ]
      : [
          `- \`"speech"\` MUST be **100% pure natural ${langOption.nativeName}** ready for TTS. ${scriptPurityHint}`,
          antiOneWordNativeRule,
        ];

  const exIntroSpeech = introOutroNativeOnly
    ? ''
    : learningLang === 'ja'
      ? '今日は毎日使える大切な日本語を学びましょう。'
      : learningLang === 'zh'
        ? (isAutoItemCount ? '今天我们来学习超实用的地道中文表达。' : `今天我们来学习${numericCount}个超实用的中文表达。`)
        : learningLang === 'ko'
          ? (isAutoItemCount ? '오늘은 매일 쓸 수 있는 핵심 한국어 표현을 배워볼게요.' : `오늘은 매일 쓸 수 있는 핵심 한국어 표현 ${numericCount}가지를 배워볼게요.`)
          : learningLang === 'fr'
            ? (isAutoItemCount ? "Aujourd'hui, découvrons des expressions françaises indispensables." : `Aujourd'hui, découvrons ${numericCount} expressions françaises indispensables.`)
            : learningLang === 'es'
              ? (isAutoItemCount ? 'Hoy vamos a aprender expresiones esenciales en español.' : `Hoy vamos a aprender ${numericCount} expresiones esenciales en español.`)
              : (isAutoItemCount
                  ? `Stop using the same basic words every day. Here are practical upgrades at level ${chosenLevel}.`
                  : `Stop using the same basic words every day. Here are ${numericCount} expressions at level ${chosenLevel}.`);

  const exOutroSpeech = introOutroNativeOnly
    ? ''
    : learningLang === 'ja'
      ? '今日学んだ表現をぜひ使ってみてください。'
      : learningLang === 'zh'
        ? '记得收藏这节课，每天开口练习吧。'
        : learningLang === 'ko'
          ? '오늘 배운 표현을 저장하고 꼭 연습해 보세요.'
          : learningLang === 'fr'
            ? "Enregistrez cette leçon et pratiquez ces expressions dès aujourd'hui."
            : learningLang === 'es'
              ? 'Guarda esta lección y practica estas expresiones hoy mismo.'
              : 'Save this lesson and use two of these expressions today.';

  const explainSample = <T extends string>(viText: T, enText: string, nativeText: string): string => {
    if (locale.code === 'vi') return viText;
    if (locale.code === 'none' || locale.code === 'en') return enText;
    if (isMonolingualExplain) return nativeText;
    return `<${locale.targetLanguageLabel}: ${enText}>`;
  };

  const countDisplayZh = isAutoItemCount ? '精选' : `${numericCount}个`;
  const countDisplayJa = isAutoItemCount ? '厳選' : `${numericCount}つの`;
  const countDisplayKo = isAutoItemCount ? '핵심' : `${numericCount}가지`;
  const countDisplayEn = isAutoItemCount ? 'Essential' : `${numericCount}`;

  const exampleBlocks =
    learningLang === 'zh'
      ? [
          '    {',
          '      "type": "title",',
          `      "kicker": "${chosenLevel} CHINESE LESSON",`,
          `      "title": ${JSON.stringify(isAutoItemCount ? `${chosenLevel}: Mẫu Câu Tiếng Trung Tự Nhiên` : `${chosenLevel}: ${numericCount} Mẫu Câu Tiếng Trung Thực Tế`)},`,
          `      "speech": ${JSON.stringify(exIntroSpeech)},`,
          ...(includeExplanationSpeech
            ? [
                `      "explanationSpeech": ${JSON.stringify(
                  explainSample(
                    `Chào mừng bạn đến với bài học tiếng Trung trình độ ${chosenLevel}, cùng khám phá các mẫu câu giao tiếp như 不好意思 dùng ngay hàng ngày.`,
                    `Welcome to this ${chosenLevel} Mandarin Chinese lesson with high-frequency expressions.`,
                    `欢迎来到 ${chosenLevel} 中文课程，今天我们一起来掌握最实用的日常表达。`,
                  ),
                )},`,
              ]
            : []),
          '      "visual": {',
          '        "variant": "bs-card-header",',
          `        "formula": "${chosenLevel}",`,
          `        "title": ${JSON.stringify(isAutoItemCount ? `${chosenLevel} Practical Chinese` : `${numericCount} Mẫu Câu ${chosenLevel}`)},`,
          `        "subtitle": ${JSON.stringify(locale.introVisualSubtitle)},`,
          '        "sceneIcon": "sparkles"',
          '      }',
          '    },',
          '    {',
          '      "type": "vocab",',
          `      "indexLabel": "01 / ${countPadded}",`,
          '      "word": "不好意思",',
          '      "phonetic": "",',
          '      "vocabNotes": "不好意思 (bù hǎo yì si): ngại quá / xin lỗi nhẹ — dùng mở lời nhờ vả hoặc hỏi đường; chú ý không dùng cho lỗi nghiêm trọng.",',
          '      "grammarNote": "",',
          `      "meaning": ${JSON.stringify(explainSample('Xin lỗi / Ngại quá (lịch sự khi làm phiền hoặc nhờ vả)', 'Excuse me / Sorry to bother you politely', '用来礼貌地打扰别人、问路或轻声道歉'))},`,
          '      "example": "不好意思，请问洗手间在哪里？",',
          '      "speech": "不好意思，请问洗手间在哪里？",',
          ...(includeExplanationSpeech
            ? [
                `      "explanationSpeech": ${JSON.stringify(
                  explainSample(
                    'Khi muốn mở lời nhờ vả hoặc xin lỗi nhẹ nhàng thật lịch sự, bạn hãy dùng cụm 不好意思. Câu ví dụ 不好意思，请问洗手间在哪里？ nghĩa là xin lỗi cho hỏi nhà vệ sinh ở đâu ạ.',
                    'Use 不好意思 before asking a stranger a question or apologizing lightly.',
                    '当你礼貌地向陌生人问路或请求帮忙时，用“不好意思”开头比直接提问自然得多。',
                  ),
                )},`,
              ]
            : []),
          `      "translation": ${JSON.stringify(explainSample('Xin lỗi / Ngại quá (hỏi đường, nhờ vả)', 'Excuse me / Sorry to bother you', '礼貌开场白（问路、求助时使用）'))},`,
          '      "visual": {',
          '        "variant": "css-magnifying-word",',
          '        "title": "不好意思",',
          `        "subtitle": ${JSON.stringify(explainSample('Mở lời lịch sự trong giao tiếp', 'Polite opener in daily Mandarin', '日常礼貌开场白'))},`,
          `        "labels": ${JSON.stringify([explainSample('Mở lời lịch sự', 'Polite opener', '礼貌开场'), explainSample('Tránh dùng cho lỗi nặng', 'Not for serious apologies', '日常高频')])},`,
          '        "highlightWord": "不好意思",',
          '        "sceneIcon": "chat"',
          '      }',
          '    },',
        ]
      : learningLang === 'ja'
        ? [
            '    {',
            '      "type": "title",',
            `      "kicker": "JLPT ${chosenLevel} DAILY LESSON",`,
            `      "title": ${JSON.stringify(isAutoItemCount ? `JLPT ${chosenLevel}: Essential Natural Japanese` : `JLPT ${chosenLevel}: ${numericCount} Essential Expressions`)},`,
            `      "speech": ${JSON.stringify(exIntroSpeech)},`,
            ...(includeExplanationSpeech
              ? [
                  `      "explanationSpeech": ${JSON.stringify(
                    explainSample(
                      `Chào mừng bạn đến với bài học tiếng Nhật trình độ ${chosenLevel}, cùng luyện các mẫu câu tự nhiên dùng ngay trong đời sống.`,
                      `Welcome to this ${chosenLevel} Japanese lesson with practical expressions.`,
                      `JLPT ${chosenLevel} の日常会話でそのまま使える自然な日本語表現を一緒に学びましょう。`,
                    ),
                  )},`,
                ]
              : []),
            '      "visual": {',
            '        "variant": "bs-card-header",',
            `        "formula": "JLPT ${chosenLevel}",`,
            `        "title": ${JSON.stringify(isAutoItemCount ? `JLPT ${chosenLevel} Expressions` : `${numericCount} Mẫu Câu ${chosenLevel}`)},`,
            `        "subtitle": ${JSON.stringify(locale.introVisualSubtitle)},`,
            '        "sceneIcon": "sparkles"',
            '      }',
            '    },',
            '    {',
            '      "type": "vocab",',
            `      "indexLabel": "01 / ${countPadded}",`,
            '      "word": "お水をお願いします",',
            '      "phonetic": "",',
            '      "vocabNotes": "お水（おみず）: nước uống lịch sự — thêm tiền tố お cho trang trọng khi gọi món; chú ý không nói trống không 水をください với người lạ.",',
            '      "grammarNote": "Danh từ + をお願いします: dùng khi gọi món, nhờ vả hoặc yêu cầu dịch vụ lịch sự.",',
            `      "meaning": ${JSON.stringify(explainSample('Làm ơn cho tôi nước uống (lịch sự)', 'Water, please (polite request)', '注文やお願いをするときの丁寧な表現'))},`,
            '      "example": "すみません、お水をお願いします。",',
            '      "speech": "すみません、お水をお願いします。",',
            ...(includeExplanationSpeech
              ? [
                  `      "explanationSpeech": ${JSON.stringify(
                    explainSample(
                      'Cụm お願いします dùng để gọi món hoặc nhờ vả lịch sự trong quán ăn. Từ お水 đọc là おみず, thêm お phía trước giúp câu nói nhã nhặn hơn, tránh nói cộc lốc khi giao tiếp với nhân viên.',
                      'Use お願いします whenever ordering food or asking a favor politely.',
                      'お店で注文するときや誰かにお願いするときに使う便利な丁寧表現です。直接命令するよりずっと自然に聞こえます。',
                    ),
                  )},`,
                ]
              : []),
            `      "translation": ${JSON.stringify(explainSample('Xin lỗi, cho tôi gọi nước nhé (lịch sự)', 'Excuse me, water please', '丁寧な依頼・注文の表現'))},`,
            '      "visual": {',
            '        "variant": "css-magnifying-word",',
            '        "title": "お願いします",',
            `        "subtitle": ${JSON.stringify(explainSample('Gọi món & nhờ vả lịch sự', 'Polite orders & requests', '注文・依頼の定番'))},`,
            `        "labels": ${JSON.stringify([explainSample('お水（おみず）', 'お水（おみず）', '丁寧表現'), explainSample('Lịch sự khi gọi món', 'Polite restaurant order', '日常会話')])},`,
            '        "highlightWord": "お願いします",',
            '        "sceneIcon": "cup"',
            '      }',
            '    },',
          ]
        : learningLang === 'ko'
          ? [
              '    {',
              '      "type": "title",',
              `      "kicker": "${chosenLevel} KOREAN LESSON",`,
              `      "title": ${JSON.stringify(isAutoItemCount ? `${chosenLevel}: Mẫu Câu Tiếng Hàn Tự Nhiên` : `${chosenLevel}: ${numericCount} Mẫu Câu Tiếng Hàn Tự Nhiên`)},`,
              `      "speech": ${JSON.stringify(exIntroSpeech)},`,
              ...(includeExplanationSpeech
                ? [
                    `      "explanationSpeech": ${JSON.stringify(
                      explainSample(
                        `Chào mừng bạn đến với bài học tiếng Hàn trình độ ${chosenLevel} gồm các mẫu câu thực tế như 잠시만요.`,
                        `Welcome to this ${chosenLevel} Korean lesson with essential phrases.`,
                        `${chosenLevel} 수준에서 바로 써먹을 수 있는 자연스러운 한국어 회화 표현을 배워볼게요.`,
                      ),
                    )},`,
                  ]
                : []),
              '      "visual": {',
              '        "variant": "bs-card-header",',
              `        "formula": "${chosenLevel}",`,
              `        "title": ${JSON.stringify(isAutoItemCount ? `${chosenLevel} Korean Focus` : `${numericCount} Mẫu Câu ${chosenLevel}`)},`,
              `        "subtitle": ${JSON.stringify(locale.introVisualSubtitle)},`,
              '        "sceneIcon": "sparkles"',
              '      }',
              '    },',
              '    {',
              '      "type": "vocab",',
              `      "indexLabel": "01 / ${countPadded}",`,
              '      "word": "잠시만요",',
              '      "phonetic": "",',
              '      "vocabNotes": "잠시만요: xin chờ chút / cho tôi gọi nhân viên — lịch sự khi gọi phục vụ hoặc xin nhường đường.",',
              '      "grammarNote": "",',
              `      "meaning": ${JSON.stringify(explainSample('Xin lỗi chờ chút / Cho tôi đi nhờ chút', 'Excuse me / Just a moment', '직원을 부르거나 잠시 양해를 구할 때 쓰는 공손한 말'))},`,
              '      "example": "잠시만요, 메뉴판 좀 주시겠어요?",',
              '      "speech": "잠시만요, 메뉴판 좀 주시겠어요?",',
              ...(includeExplanationSpeech
                ? [
                    `      "explanationSpeech": ${JSON.stringify(
                      explainSample(
                        'Khi gọi nhân viên quán hoặc xin nhường đường, hãy nói 잠시만요 cho thật tự nhiên. Câu ví dụ 잠시만요, 메뉴판 좀 주시겠어요 nghĩa là xin lỗi cho tôi xem thực đơn được không ạ.',
                        'Use 잠시만요 when calling a server or asking someone to wait a moment.',
                        '식당에서 직원을 부르거나 지나갈 때 가볍게 양해를 구할 때 아주 자연스럽게 쓰는 표현입니다.',
                      ),
                    )},`,
                  ]
                : []),
              `      "translation": ${JSON.stringify(explainSample('Xin chờ một chút / Xin phép gọi nhân viên', 'Excuse me / Just a moment', '정중한 호칭 · 양해 표현'))},`,
              '      "visual": {',
              '        "variant": "css-magnifying-word",',
              '        "title": "잠시만요",',
              `        "subtitle": ${JSON.stringify(explainSample('Gọi phục vụ & xin nhường đường', 'Polite opener at cafes', '식당 · 카페 필수 표현'))},`,
              `        "labels": ${JSON.stringify([explainSample('Gọi nhân viên', 'Call server politely', '공손한 호칭'), explainSample('Lịch sự tự nhiên', 'Polite & natural', '실전 회화')])},`,
              '        "highlightWord": "잠시만요",',
              '        "sceneIcon": "chat"',
              '      }',
              '    },',
            ]
          : [
              '    {',
              '      "type": "title",',
              `      "kicker": "LEVEL ${chosenLevel} UPGRADE",`,
              `      "title": "${countDisplayEn} Smart Upgrades to Sound Natural",`,
              `      "speech": ${JSON.stringify(exIntroSpeech)},`,
              ...(includeExplanationSpeech
                ? [
                    `      "explanationSpeech": ${JSON.stringify(
                      explainSample(
                        `Hôm nay chúng ta cùng học các từ vựng và mẫu câu chủ đề Smart Upgrades chuẩn trình độ ${chosenLevel}, dùng được ngay trong giao tiếp.`,
                        `Today we will master natural expressions calibrated for level ${chosenLevel}.`,
                        `Today we will master natural ${langOption.nativeName} expressions calibrated for level ${chosenLevel}.`,
                      ),
                    )},`,
                  ]
                : []),
              '      "visual": {',
              '        "variant": "bs-card-header",',
              `        "formula": "LEVEL ${chosenLevel}",`,
              `        "title": "${countDisplayEn} Smart Upgrades",`,
              `        "subtitle": ${JSON.stringify(locale.introVisualSubtitle)},`,
              '        "sceneIcon": "sparkles"',
              '      }',
              '    },',
              '    {',
              '      "type": "vocab",',
              `      "indexLabel": "01 / ${countPadded}",`,
              '      "word": "articulate",',
              '      "meaning": "able to express ideas clearly and effectively",',
              '      "example": "She is remarkably articulate during team meetings.",',
              '      "speech": "Number one: articulate. She is remarkably articulate during team meetings.",',
              ...(includeExplanationSpeech
                ? [
                    `      "explanationSpeech": ${JSON.stringify(
                      explainSample(
                        'Từ vựng articulate dùng để khen ai đó diễn đạt mạch lạc, rõ ràng và thuyết phục thay cho từ clear thông thường. Ví dụ câu she is remarkably articulate during team meetings nghĩa là cô ấy trình bày rất mạch lạc trong các buổi họp nhóm.',
                        'Articulate describes someone who explains complex thoughts clearly and persuasively, much sharper than simply saying clear.',
                        'Articulate describes someone who explains thoughts clearly and persuasively, sounding much sharper than simply saying clear.',
                      ),
                    )},`,
                  ]
                : []),
              `      "translation": ${JSON.stringify(explainSample('diễn đạt mạch lạc, rõ ràng', 'clear and well-spoken', 'clear and well-spoken in meetings'))},`,
              '      "visual": {',
              '        "variant": "css-magnifying-word",',
              '        "title": "articulate",',
              '        "subtitle": "Clear & persuasive speaker",',
              '        "labels": ["Basic: clear", "Smart: articulate"],',
              '        "highlightWord": "articulate",',
              '        "sceneIcon": "mic"',
              '      }',
              '    },',
            ];

  const dialogueExampleBlocks = (() => {
    const spkA =
      learningLang === 'ja'
        ? { name: 'Ken', gender: 'male', role: 'Trưởng nhóm' }
        : learningLang === 'zh'
          ? { name: 'Minh', gender: 'male', role: 'Kỹ sư AI' }
          : learningLang === 'ko'
            ? { name: 'Minho', gender: 'male', role: 'Host A' }
            : { name: 'Alex', gender: 'male', role: 'Team Lead' };
    const spkB =
      learningLang === 'ja'
        ? { name: 'Yuki', gender: 'female', role: 'Đồng nghiệp' }
        : learningLang === 'zh'
          ? { name: 'Linh', gender: 'female', role: 'Quản lý dự án' }
          : learningLang === 'ko'
            ? { name: 'Jiwon', gender: 'female', role: 'Host B' }
            : { name: 'Maya', gender: 'female', role: 'Product Designer' };

    const sampleTurn1Speech = isMultiSpeakerFormat
      ? learningLang === 'ja'
        ? 'このAIツールを会議に導入したら、議事録の時間かなり減らせそうだよね。'
        : learningLang === 'zh'
          ? '如果我们把这套AI工具用到团队会议里，整理纪要的时间能省下一大半。'
          : learningLang === 'ko'
            ? '이번 회의에 AI 도구를 도입하면 회의록 정리 시간을 훨씬 줄일 수 있을 것 같아요.'
            : learningLang === 'fr'
              ? 'Si on utilise cet outil IA en réunion, on va gagner énormément de temps sur les comptes rendus.'
              : learningLang === 'es'
                ? 'Si usamos esta herramienta de IA en las reuniones, vamos a ahorrar muchísimo tiempo con las actas.'
                : 'If we bring this AI assistant into our sprint reviews, we could cut meeting notes in half.'
      : learningLang === 'ja'
        ? '朝の通勤中にAIニュースを聞くようになってから、会議での提案が一気に通りやすくなりました。'
        : learningLang === 'zh'
          ? '自从我开始在通勤时听科技播客，开会提方案时明显更有底气了。'
          : learningLang === 'ko'
            ? '출근길마다 최신 AI 소식을 듣기 시작한 뒤로 회의에서 의견을 내기가 훨씬 수월해졌어요.'
            : learningLang === 'fr'
              ? 'Depuis que j’écoute des actualités tech le matin, mes propositions passent beaucoup mieux en réunion.'
              : learningLang === 'es'
                ? 'Desde que escucho tendencias tech por la mañana, mis ideas tienen mucha más fuerza en las reuniones.'
                : 'Since I started following real workplace AI workflows every morning, pitching ideas to clients feels effortless.';

    const sampleTurn2Speech = isMultiSpeakerFormat
      ? learningLang === 'ja'
        ? '確かに！ただ、機密データの扱いだけは事前にルールを決めておかないと危険かも。'
        : learningLang === 'zh'
          ? '确实！不过在正式推广之前，我们得先把客户隐私数据的使用规范定下来。'
          : learningLang === 'ko'
            ? '맞아요! 다만 고객 민감 정보는 어디까지 입력할지 기준부터 정해 두는 게 안전하겠어요.'
            : learningLang === 'fr'
              ? 'Carrément ! Mais il faut d’abord fixer une règle claire pour ne jamais exposer de données sensibles.'
              : learningLang === 'es'
                ? '¡Totalmente! Eso sí, primero debemos definir reglas claras para proteger los datos confidenciales.'
                : 'True, though before rolling it out, we need clear guardrails so confidential client data never leaks.'
      : learningLang === 'ja'
        ? '一番大事なのはツールの名前を覚えることではなく、自分の判断軸を持って質問を投げる力です。'
        : learningLang === 'zh'
          ? '真正拉开差距的不是你会多少工具，而是你能不能在关键场合问出对的问题。'
          : learningLang === 'ko'
            ? '진짜 중요한 건 도구 이름만 외우는 게 아니라, 상황에 맞는 정확한 질문을 던지는 감각이에요.'
            : learningLang === 'fr'
              ? 'Le vrai secret, ce n’est pas de connaître tous les outils, mais de savoir poser la bonne question au bon moment.'
              : learningLang === 'es'
                ? 'Lo clave no es memorizar herramientas, sino saber hacer la pregunta correcta en el momento preciso.'
                : 'What actually sets top performers apart is not knowing tool buzzwords—it is framing clear constraints before you ask.';

    const introKicker = isMultiSpeakerFormat
      ? explainSample('HỘI THOẠI THỰC TẾ · ĐA NHÂN VẬT', 'REAL CONVERSATION · MULTI-SPEAKER', `${langOption.nativeName} CONVERSATION`)
      : isPodcastFormat
        ? explainSample('TẬP PODCAST THỰC TẾ', 'SPOKEN PODCAST EPISODE', `${langOption.nativeName} PODCAST`)
        : isShadowingFormat
          ? explainSample('LUYỆN SHADOWING TỰ NHIÊN', 'NATURAL SHADOWING FLOW', `${langOption.nativeName} SHADOWING`)
          : explainSample('TÌNH HUỐNG & GÓC NHÌN THỰC TẾ', 'REAL SITUATION & INSIGHT', `${langOption.nativeName} SITUATION`);

    const defaultSituationTitle = explainSample(
      isMultiSpeakerFormat ? 'Hội thoại ứng xử thực tế' : 'Tình huống giao tiếp thực tế',
      isMultiSpeakerFormat ? 'Real Conversation Episode' : 'Real Situation Episode',
      isMultiSpeakerFormat ? '実戦会話エピソード' : '実戦シチュエーション',
    );

    const visualTitleIntro = isMultiSpeakerFormat
      ? explainSample('Hội thoại 2–3 người nói', '2–3 Speakers Conversation', '複数人のリアル会話')
      : explainSample('Mạch nói tự nhiên', 'Natural Spoken Flow', '自然な会話の流れ');

    return [
      '    {',
      '      "type": "title",',
      `      "kicker": ${JSON.stringify(introKicker)},`,
      `      "title": ${JSON.stringify(topicHint ? `${topicHint} | ${formatAudienceLevelLabel(chosenLevel, learningLang)}` : `${defaultSituationTitle} | ${formatAudienceLevelLabel(chosenLevel, learningLang)}`)},`,
      `      "speech": ${JSON.stringify(exIntroSpeech)},`,
      ...(includeExplanationSpeech
        ? [
            `      "explanationSpeech": ${JSON.stringify(
              explainSample(
                `Chào mừng bạn đến với tình huống thực tế trình độ ${chosenLevel}. Hãy lắng nghe mạch hội thoại/bài nói tự nhiên và chú ý cách ứng xử thực tế nhé!`,
                `Welcome to this natural ${chosenLevel} spoken scenario. Follow the full conversation flow and key situational insights!`,
                `Chào mừng bạn đến với tình huống ${chosenLevel}.`,
              ),
            )},`,
          ]
        : []),
      '      "visual": {',
      '        "variant": "bs-card-header",',
      `        "formula": ${JSON.stringify(`${chosenLevel} · ${explainSample('GIAO TIẾP THỰC TẾ', 'SPOKEN FLOW', '会話フロー')}`)},`,
      `        "title": ${JSON.stringify(visualTitleIntro)},`,
      `        "subtitle": ${JSON.stringify(explainSample('Nghe mạch nói tự nhiên · Tổng kết kiến thức cuối bài', 'Listen to natural flow · Key recap at end', '自然な会話を聞いて最後に要点整理'))},`,
      '        "sceneIcon": "mic"',
      '      }',
      '    },',
      '    {',
      '      "type": "dialogue",',
      `      "indexLabel": "01 / ${countPadded}",`,
      ...(isMultiSpeakerFormat
        ? [
            `      "speaker": ${JSON.stringify(spkA.name)},`,
            `      "speakerGender": ${JSON.stringify(spkA.gender)},`,
            `      "speakerRole": ${JSON.stringify(spkA.role)},`,
          ]
        : [`      "kicker": ${JSON.stringify(explainSample('LƯỢT 01 · MỞ TÌNH HUỐNG', 'TURN 01 · OPENING SITUATION', '場面01 · 導入'))},`]),
      '      "phonetic": "",',
      `      "title": ${JSON.stringify(isMultiSpeakerFormat ? explainSample(`${spkA.name} mở vấn đề`, `${spkA.name} opens the discussion`, `${spkA.name}の発言`) : explainSample('Mở đầu tình huống thực tế', 'Opening the real situation', '状況の導入'))},`,
      `      "content": ${JSON.stringify(sampleTurn1Speech)},`,
      `      "speech": ${JSON.stringify(sampleTurn1Speech)},`,
      `      "translation": ${JSON.stringify(explainSample('Bản dịch tự nhiên của câu nói này sang tiếng Việt.', 'Natural meaning of this spoken line.', 'Natural meaning of this spoken line.'))},`,
      `      "vocabNotes": ${JSON.stringify(learningLang === 'ja' ? explainSample('導入（どうにゅう）: triển khai, áp dụng vào thực tế — dùng trong bối cảnh công việc/hệ thống; chú ý Kanji chữ 導 dễ đọc nhầm.', '導入（どうにゅう）: introduction/deployment of a tool in a workflow.', '導入（どうにゅう）: ツールや仕組みを新しく取り入れること。') : '')},`,
      '      "grammarNote": "",',
      ...(includeExplanationSpeech
        ? [
            `      "explanationSpeech": ${JSON.stringify(
              explainSample(
                'Câu mở đầu tình huống đưa ra đề xuất thực tế một cách tự nhiên trước đồng nghiệp.',
                'This opening turn frames a realistic workplace proposal smoothly.',
                'Opening situational line.',
              ),
            )},`,
          ]
        : []),
      '      "visual": {',
      `        "variant": ${JSON.stringify(isMultiSpeakerFormat ? 'p168-story-dialogue' : 'ear-listen')},`,
      `        "title": ${JSON.stringify(isMultiSpeakerFormat ? spkA.name : explainSample('Luyện nghe & nói đuổi theo', 'Listen & shadow naturally', '聞いてシャドーイング'))},`,
      `        "reactionText": ${JSON.stringify(isMultiSpeakerFormat ? spkA.name : explainSample('Người nói', 'Speaker', '話者'))},`,
      `        "speechText": ${JSON.stringify(sampleTurn1Speech)},`,
      '        "sceneIcon": "mic"',
      '      }',
      '    },',
      '    {',
      '      "type": "dialogue",',
      `      "indexLabel": "02 / ${countPadded}",`,
      ...(isMultiSpeakerFormat
        ? [
            `      "speaker": ${JSON.stringify(spkB.name)},`,
            `      "speakerGender": ${JSON.stringify(spkB.gender)},`,
            `      "speakerRole": ${JSON.stringify(spkB.role)},`,
          ]
        : [`      "kicker": ${JSON.stringify(explainSample('LƯỢT 02 · GÓC NHÌN CHÍNH', 'TURN 02 · KEY INSIGHT', '場面02 · 核心'))},`]),
      '      "phonetic": "",',
      `      "title": ${JSON.stringify(isMultiSpeakerFormat ? explainSample(`${spkB.name} phản hồi & lưu ý thực tế`, `${spkB.name} replies with key insight`, `${spkB.name}の返答`) : explainSample('Triển khai góc nhìn & kinh nghiệm thực tế', 'Practical insight & perspective', '実践的な視点'))},`,
      `      "content": ${JSON.stringify(sampleTurn2Speech)},`,
      `      "speech": ${JSON.stringify(sampleTurn2Speech)},`,
      `      "translation": ${JSON.stringify(explainSample('Bản dịch tự nhiên câu phản hồi / góc nhìn thực chiến.', 'Natural meaning of the reply/insight.', 'Natural meaning of the reply/insight.'))},`,
      '      "vocabNotes": "",',
      `      "grammarNote": ${JSON.stringify(explainSample('(Chỉ ghi nếu có cấu trúc khó so với level: giải thích + cách dùng + chú ý bằng Tiếng Việt)', '(Only fill if there is difficult grammar for this level)', ''))},`,
      ...(includeExplanationSpeech
        ? [
            `      "explanationSpeech": ${JSON.stringify(
              explainSample(
                'Lưu ý thực tế rút ra: khi đồng ý ý tưởng mới nơi công sở, luôn chủ động nêu kèm điều kiện an toàn dữ liệu để thể hiện tư duy chuyên nghiệp.',
                'Practical workplace takeaway: pair enthusiasm with concrete risk awareness.',
                'Practical situational takeaway.',
              ),
            )},`,
          ]
        : []),
      '      "visual": {',
      `        "variant": ${JSON.stringify(isMultiSpeakerFormat ? 'css-chat-thread' : 'css-sticky-note')},`,
      `        "title": ${JSON.stringify(isMultiSpeakerFormat ? `${spkA.name} ↔ ${spkB.name}` : explainSample('Góc nhìn tình huống', 'Key Situational Insight', '場面のポイント'))},`,
      `        "labels": ${JSON.stringify(isMultiSpeakerFormat ? [`${spkA.name}: ${explainSample('Đề xuất giải pháp', 'Proposes idea', '提案')}`, `${spkB.name}: ${explainSample('Nêu lưu ý rủi ro', 'Adds risk guardrail', '注意点')}`] : [explainSample('Tình huống thực tế', 'Real situation', '実践場面'), explainSample('Cách ứng xử tự nhiên', 'Natural response', '自然な対応')])},`,
      '        "sceneIcon": "chat"',
      '      }',
      '    },',
      '    {',
      '      "type": "vocab",',
      `      "badge": ${JSON.stringify(explainSample('TỔNG KẾT BÀI HỌC', 'LESSON SUMMARY', 'まとめ'))},`,
      `      "title": ${JSON.stringify(explainSample('Hôm nay bạn vừa học được gì?', 'What did you learn today?', '今日のまとめ'))},`,
      `      "content": ${JSON.stringify(explainSample('Tóm tắt mạch hội thoại/tình huống + các kỹ năng giao tiếp & từ vựng trọng tâm vừa nắm được.', 'Summary of today’s conversation/scenario and practical takeaways.', '今日の会話の要点と実践表現のまとめ。'))},`,
      `      "speech": ${JSON.stringify(exOutroSpeech || sampleTurn2Speech)},`,
      ...(includeExplanationSpeech
        ? [
            `      "explanationSpeech": ${JSON.stringify(
              explainSample(
                'Tổng kết nội dung vừa nghe: bạn vừa nắm được cách đề xuất áp dụng công cụ mới và phản biện khéo léo về bảo mật dữ liệu trong cuộc họp công sở, cùng các cụm từ tự nhiên đi kèm.',
                'Recap of what we learned today: how to pitch new ideas smoothly, raise practical guardrails politely, and apply the key expressions in real life.',
                'Summary of key takeaways.',
              ),
            )},`,
          ]
        : []),
      `      "translation": ${JSON.stringify(explainSample('Tổng kết nội dung chính & kiến thức ứng dụng thực tế', 'Key content recap & practical application', '要点整理'))},`,
      '      "visual": {',
      '        "variant": "bs-list-group",',
      `        "title": ${JSON.stringify(locale.outroTitle)},`,
      `        "labels": ${JSON.stringify(explainSample('a', 'b', 'c') === 'a' ? ['1. Nội dung chính vừa nghe', '2. Cách xử lý tình huống', '3. Từ/cụm đắt giá cần nhớ'] : locale.outroLabels)},`,
      '        "sceneIcon": "check"',
      '      }',
      '    },',
    ];
  })();

  const selectedExampleBlocks = isConversationalScriptMode ? dialogueExampleBlocks : exampleBlocks;

  const creatorChapters =
    durationMinutes && durationMinutes >= 5
      ? Math.max(3, Math.min(10, Math.round(durationMinutes / 3.5)))
      : undefined;
  const autoMinCards = durationMinutes
    ? Math.max(12, Math.round(durationMinutes * 2.2))
    : 8;
  const autoMaxCards = durationMinutes
    ? Math.max(autoMinCards + 8, Math.round(durationMinutes * 3.2))
    : 14;
  const fixedWordsPerCard =
    durationMinutes && targetWordsFloor && !isAutoItemCount
      ? Math.max(35, Math.round(targetWordsFloor / Math.max(4, numericCount)))
      : 55;
  const fixedCjkPerCard =
    durationMinutes && targetCjkFloor && !isAutoItemCount
      ? Math.max(55, Math.round(targetCjkFloor / Math.max(4, numericCount)))
      : 85;
  const fixedSecPerCard =
    durationMinutes && !isAutoItemCount
      ? Math.max(12, Math.round((durationMinutes * 60) / Math.max(4, numericCount)))
      : 22;

  const durationFloorLine = isAutoItemCount
    ? [
        `- **Minimum Video Duration Floor (CHỈ ĐƯỢC DÀI HƠN, KHÔNG ĐƯỢC THẤP HƠN)**: At least **${durationLabel}** — **AI TỰ QUYẾT ĐỊNH SỐ LƯỢNG MỤC KIẾN THỨC TỐI ƯU** (KHÔNG ép cứng một con số máy móc):`,
        durationMinutes
          ? `  + **QUY MÔ BẮT BUỘC ĐỂ ĐẠT >= ${durationMinutes} PHÚT (CẤM DỪNG SỚM Ở ~2–3 PHÚT)**: Hãy thiết kế lộ trình **${autoMinCards}–${autoMaxCards} ${isConversationalScriptMode ? 'lượt thoại / đoạn nói nối tiếp' : 'mục kiến thức'}**${creatorChapters ? ` chia thành **${creatorChapters} chương/tình huống nối tiếp nhau**` : ''}, mỗi mục khoảng 55–85 từ lời đọc + phân tích sâu (~20–30s/mục) để tổng thời lượng đạt hoặc vượt **${durationMinutes} phút**!`
          : '  + Hãy để **số lượng kiến thức phù hợp chủ đề và chiều sâu phân tích** quyết định thời lượng thực tế của video (TUYỆT ĐỐI KHÔNG rút ngắn thấp hơn sàn thời lượng hay hy sinh chất lượng giải thích).',
      ].join('\n')
    : `- **Minimum Video Duration Floor (CHỈ ĐƯỢC DÀI HƠN, KHÔNG ĐƯỢC THẤP HƠN)**: At least **${durationLabel}** with at least **${numericCount} ${isConversationalScriptMode ? 'turns / segments' : 'core teaching items'}**${durationMinutes ? ` (tức trung bình **~${isCjkLearning ? `${fixedCjkPerCard}+ ký tự` : `${fixedWordsPerCard}+ từ`}/mục** (~${fixedSecPerCard}s/mục) ở \`speech\` + \`explanationSpeech\`${creatorChapters ? `, chia thành **${creatorChapters} nhóm chủ điểm tiến triển**` : ''} để chạm hoặc vượt **${durationMinutes} phút**, TUYỆT ĐỐI KHÔNG dừng ở ~3 phút!)` : ''} — let depth and completeness determine final runtime.`;

  const antiFluffAndAuditBlock = [
    '- **ANTI-RAMBLING, ZERO REPETITION & DEEP-INSIGHT MANDATE (DÀI NHƯNG PHẢI SÂU SẮC, CẤM LAN MAN / LẶP LẠI)**:',
    '  + **NO RAMBLING OR FILLER**: Never pad `speech` or `explanationSpeech` with empty intros or off-topic tangents. Every line MUST push the story/dialogue/teaching point forward.',
    '  + **ZERO REPETITION**: Every single card in `cards[]` MUST advance the conversation/scenario or introduce a genuinely distinct angle — NEVER loop the same cliché sentence.',
    isConversationalScriptMode
      ? '  + **AUTHENTIC FLOW & PRACTICAL SITUATIONAL KNOWLEDGE**: Keep dialogue/speech flowing naturally beat-by-beat; highlight practical cultural/workplace/tech insight in `explanationSpeech` + `translation` and ONLY attach `vocabNotes`/`grammarNote` when a word or grammar point is genuinely difficult for level ' + chosenLevel + ' (with Kanji-only Hiragana!).'
      : '  + **DEPTH PER CARD**: In `explanationSpeech` + `translation` + `visual.labels`, explicitly cover: (1) exact situational register (casual vs polite vs professional), (2) WHY natives prefer this phrasing over literal/textbook mistakes, and (3) a vivid complete dialogue/example.',
    durationMinutes
      ? `  + **SELF-AUDIT & SHORTFALL REASON (\`durationReport\`)**: Before returning JSON, sum ALL words/characters across \`speech\` + \`explanationSpeech\` across ALL cards and verify estimated audio minutes >= ${durationMinutes}. If under ${durationMinutes} min, expand with additional distinct scenes/turns/angles until >= ${durationMinutes} min. If you genuinely cannot reach ${durationMinutes} min cleanly without rambling, repeating, or hitting output limits, you MUST set \`"metMinimum": false\` and explain the concrete reason inside \`"durationReport.shortfallReason"\`!`
      : '  + **SELF-AUDIT**: Verify every card adds non-redundant, insightful value before returning JSON.',
  ].join('\n');

  const coreCardsHeaderLine = isConversationalScriptMode
    ? isAutoItemCount
      ? `2. **Core Conversation / Monologue / Situational Turns (\`type: "dialogue"\` — AI tự chọn số lượt nói \`N\` phù hợp mạch truyện & thời lượng tối thiểu)** — STRICT NON-VOCAB-LIST RULE:`
      : `2. **Core Conversation / Monologue / Situational Turns (\`${numericCount}\` cards, \`type: "dialogue"\`) — STRICT NON-VOCAB-LIST RULE**:`
    : isAutoItemCount
      ? `2. **Core Teaching Cards (\`type: "vocab"\` — AI tự chọn số lượng mục kiến thức \`N\` phù hợp nhất với chủ đề & thời lượng tối thiểu)** — PEDAGOGICAL DEPTH FIRST:`
      : `2. **Core Teaching Cards (\`${numericCount}\` cards, \`type: "vocab"\`) — PEDAGOGICAL DEPTH FIRST**:`;

  const coreCardsIndexLine = isAutoItemCount
    ? `   - Ordered cleanly with \`"indexLabel": "01 / N"\` through \`"N / N"\` (where \`N\` is your chosen total turn/item count).`
    : `   - Ordered cleanly with \`"indexLabel": "01 / ${countPadded}"\` through \`"${countPadded} / ${countPadded}"\`.`;

  const formatSpecificStrictRules = (() => {
    const lines: string[] = [];
    lines.push(
      '- **STRICT FORMAT DISCIPLINE (A–F vs G–N — KHÔNG ĐƯỢC LẪN LỘN KIỂU BÀI)**:',
      '  + **Nhóm A–F (`vocab`, `phrases`, `phrasal_verbs`, `mistakes`, `grammar`, `comparisons`)**: MỚI LÀ dạng học từ vựng / cụm từ / ngữ pháp / sửa lỗi (mỗi card tập trung 1 từ/cụm/cấu trúc + giải thích + ví dụ).',
      '  + **Nhóm G–N (`real_life`, `shadowing_solo`, `shadowing_dialogue`, `podcast_solo`, `podcast_duo`, `trending_social`, `workplace_tech`, `news_storytelling`)**: **TUYỆT ĐỐI KHÔNG ĐƯỢC VIẾT THÀNH DANH SÁCH HỌC TỪ VỰNG / NGỮ PHÁP RỜI RẠC** (`word + meaning`)! Mỗi card PHẢI là **một lượt thoại, một đoạn bài nói nối tiếp, hoặc một bước xử lý tình huống thực tế** (dùng `"type": "dialogue"`, viết câu văn/lời thoại liền mạch tự nhiên theo đúng ngữ cảnh)!',
    );
    if (isMultiSpeakerFormat || formatPref === 'auto') {
      lines.push(
        '  + **MULTI-SPEAKER DIALOGUE / 2–3 NGƯỜI (`G`, `I`, `K` hoặc hội thoại trong `L`/`M`)**: Bắt buộc viết **cuộc hội thoại sống động qua lại giữa 2–3 nhân vật cụ thể** (VD: Ken & Yuki, hoặc Host A / Host B / Khách mời). Trên MỖI card thoại, BẮT BUỘC khai báo `"speaker": "<Tên người nói>"`, `"speakerGender": "male" | "female"`, `"speakerRole": "<Vai trò ngắn gọn>"` để hệ thống TTS của app **tự động đổi giọng Nam / Nữ riêng cho từng nhân vật** và hiển thị tên người đang nói! Giữ `"speech"` 100% là lời thoại thuần túy (KHÔNG viết `"Ken:"` vào đầu `"speech"`).',
      );
    }
    if (isShadowingFormat) {
      lines.push(
        '  + **SHADOWING STRICT RULE (`H`, `I`)**: Tạo chuỗi câu nói tự nhiên liên kết thành 1 mạch chuyện/hội thoại hoàn chỉnh (1 người kể ở `H`, hoặc 2–3 người đối đáp ở `I`) với nhịp ngắt nghỉ, nối âm và ngữ điệu giao tiếp đời thật để người học nhại theo ngay. TUYỆT ĐỐI KHÔNG biến thành thẻ từ vựng `word + meaning`!',
      );
    }
    if (isPodcastFormat) {
      lines.push(
        '  + **PODCAST STRICT RULE (`J`, `K`)**: Xây dựng như một tập Podcast thực sự — mở đầu gợi tò mò, dẫn dắt mạch lập luận / kể chuyện có chiều sâu (`J`: 1 Host chia sẻ tự sự; `K`: 2 Host tung hứng, hỏi xoáy đáp xoay, phản ứng tự nhiên). TUYỆT ĐỐI KHÔNG biến thành danh sách liệt kê từ vựng!',
      );
    }
    if (isSituationalKnowledgeFormat) {
      lines.push(
        '  + **SITUATIONAL KNOWLEDGE STRICT RULE (`L`, `M`, `N` — Công sở, Phỏng vấn, AI/Tech, Trend, Tin tức & Đời sống)**: PHẢI xây dựng thành **tình huống thực tế cụ thể** (cuộc họp xử lý sự cố/AI tại công sở, màn hỏi-đáp phỏng vấn hóc búa, tranh luận xu hướng mới, tình huống tâm lý đời thật) qua lời nói / hội thoại tự nhiên giúp người học **biết cách ứng xử, giải quyết vấn đề và thu nạp kiến thức thực chiến**, chứ không chỉ học từ vựng đơn lẻ!',
      );
    }
    if (isConversationalScriptMode || formatPref === 'auto') {
      lines.push(
        '  + **MANDATORY CONTENT RECAP AT THE END (TỔNG KẾT NỘI DUNG HỌC ĐƯỢC GÌ)**: Với mọi bài hội thoại, bài nói, shadowing, podcast, tình huống hay bài đọc (`G–N`), ngay trước `outro` (hoặc tích hợp rõ trên card `"TỔNG KẾT BÀI HỌC"` + `outro.explanationSpeech`), BẮT BUỘC tổng kết cho người học: **(1) Nội dung/kết quả tình huống chính vừa nghe, (2) Người học rút ra được kiến thức/kỹ năng ứng xử gì, và (3) Các mẫu câu/từ vựng/ngữ pháp đắt giá vừa gặp trong mạch nói** (có Hiragana cho Kanji khó nếu có).',
      );
    }
    return lines;
  })();

  return [
    `# ROLE: AUTONOMOUS ${langOption.nativeName.toUpperCase()} EDUCATIONAL CONTENT DIRECTOR`,
    `You are an expert ${langOption.nativeName} teacher, dialogue scriptwriter, podcast producer, and curriculum designer.`,
    '',
    isConversationalScriptMode
      ? `Your task is to CREATE an authentic, continuous ${langOption.nativeName} conversation / spoken script / situational episode from scratch — NOT a disconnected vocabulary list!`
      : `Your task is to independently CREATE an engaging, save-worthy ${langOption.nativeName} learning video concept from scratch — even when NO source text and NO URL are given.`,
    '',
    '## 1. LEARNING LANGUAGE, LEVEL & DURATION TARGET',
    `- **Target Language Being Taught**: **${langOption.label}**`,
    `- **Proficiency Level (${langOption.systemName})**: **${chosenLevel}** (${levelDesc})`,
    `- **Explanation Language**: **${explainLangName}**${isMonolingualExplain ? ' (Monolingual immersion: write ALL meanings, explanations & `explanationSpeech` purely in this language!)' : ''}`,
    durationFloorLine,
    antiFluffAndAuditBlock,
    `- **Video Frame Aspect**: ${aspectLabel}`,
    topicHint
      ? `- User topic / category direction: "${topicHint}". Craft the sharpest, most practical angle around this topic.`
      : '- User provided NO specific topic. Brainstorm at least 5 practical video ideas internally, pick the single highest-value concept calibrated strictly to level ' +
        chosenLevel +
        ', and output ONLY the final JSON (never output the brainstorming list).',
    ...(params.customInputLines?.trim()
      ? [
          `- **USER SUBTITLE / SCRIPT PROVIDED BELOW**: Edit, polish, correct, and structure these lines into cohesive cards matching the JSON schema:\n"""\n${params.customInputLines.trim().slice(0, 8000)}\n"""`,
        ]
      : []),
    '',
    '## 2. FORMAT & CONTENT DIVERSITY (14 FORMATS A–N)',
    `- **SELECTED FORMAT PREFERENCE**: ${chosenFormatInstruction}`,
    '- NEVER default to a dry reading passage + multiple-choice comprehension worksheet.',
    '- Formats overview: **A–F (Teaching Focus)**: A. Vocabulary Lists · B. Natural Phrases · C. Phrasal Verbs · D. Common Mistakes · E. Grammar in Context · F. Vocabulary Comparisons | **G–N (Dialogue / Spoken / Situational Focus)**: G. Real-life Conversations (2–3 speakers) · H. Shadowing 1 người · I. Shadowing nhiều người (2–3 người) · J. Podcast 1 người · K. Podcast 2 người (2 Host) · L. Chủ đề Hot & Trend hiện nay · M. Công sở / Phỏng vấn / AI & Tech · N. Tin tức nóng & Đời sống thực tế.',
    ...formatSpecificStrictRules,
    '',
    '## 3. VIDEO PACING & STRUCTURE',
    `1. **Hook Card (\`type: "title"\`)**: Scroll-stopping \`kicker\`, **CATCHY root \`title\` formatted as \`"<Tiêu đề hook gợi tò mò cuốn hút> | ${formatAudienceLevelLabel(chosenLevel, learningLang)}"\`** (TITLE FIRST, target-language audience LEVEL AFTER separated by \`|\` — used directly as the saved filename!), ${introOutroNativeOnly ? 'empty `speech: ""` with natural welcoming hook (introducing the exact scenario/topic naturally in ' + langOption.nativeName + ') + transition into turn/item 01 in `explanationSpeech` in ' + explainLangName : 'spoken `speech`' + (includeExplanationSpeech ? ' + `explanationSpeech`' : '')}, and \`visual\`.`,
    coreCardsHeaderLine,
    coreCardsIndexLine,
    isConversationalScriptMode
      ? '   - Keep each turn/beat flowing smoothly from the previous line so it sounds like a REAL continuous conversation, podcast, or shadowing track (avoid abrupt dictionary lecturing mid-dialogue; keep concise practical insights / difficult vocab-grammar notes in `explanationSpeech` / `vocabNotes` / `grammarNote`).'
      : '   - Include natural **spoken transition phrases** inside `explanationSpeech` (or `speech` if single-voice) when advancing to the next section/nuance (e.g. "Next expression...", "Moving on to...") so transitions are NEVER silent!',
    isConversationalScriptMode
      ? `   - **DIFFICULT VOCAB/GRAMMAR ONLY WHEN NEEDED (LEVEL ${chosenLevel}) + SITUATIONAL INSIGHT**: In dialogue/podcast/situational cards, ONLY add \`vocabNotes\` / \`grammarNote\` when a turn actually contains a difficult word or grammar pattern for level **${chosenLevel}** (with explanation, usage, caution if any, and Kanji-only Hiragana). Always clarify situational context & native nuance in \`explanationSpeech\` / \`translation\`.`
      : '   - **EXPLANATION QUALITY & KNOWLEDGE DEPTH ARE MANDATORY (CẤM CÂU CỤT VÔ NGHĨA)**: NEVER sprint through shallow 1-word + 1-truncated-example stubs or meaningless half-sentences! Every card MUST deliver complete, self-contained pedagogical value in `explanationSpeech` + `vocabNotes` + `grammarNote` + `translation` + `visual.labels`: explain **WHY** native speakers find it natural, explicitly contrast **what learners mistakenly say or stiff textbook equivalents**, clarify situational register/nuance, keep target words/topics/grammar written directly in natural ' + langOption.nativeName + ', and use full, natural sentences.',
    '   - If level is a progression (`N5→N1`, `A1→C2`, `HSK 1→6`, `TOPIK 1→6`), progress clearly from elementary (`01`) to advanced (`' + countPadded + '`).',
    params.includeQuiz
      ? `3. **Optional Quick Interactive Check (\`type: "quiz"\`, 1–2 concise cards)**: Place a quick 5-second check right after the key exchange/concept it tests.`
      : `3. **NO Surprise Quiz Cards**: Do NOT append \`type: "quiz"\` cards at the end — stay focused on the main flow.`,
    `4. **Content Recap & Outro (\`type: "outro"\`${isConversationalScriptMode ? ' + preceding Recap Card' : ''})**: ${introOutroNativeOnly ? 'Empty `speech: ""` with clear closing summary in `explanationSpeech` in ' + explainLangName + ' explicitly recapping WHAT the learner just heard/learned (main scenario/topic takeaways, practical situational skills, and standout expressions in natural ' + langOption.nativeName + ')' : 'Clear closing summary in `speech`' + (includeExplanationSpeech ? ' + `explanationSpeech`' : '') + ' recapping what was learned in the lesson'} + summary visual.`,
    '',
    '## 4. LESSON TITLE & VOICEOVER / TTS QUALITY RULES (`title`, `speech`, `explanationSpeech`)',
    topicHint
      ? `- **CATCHY HOOK TITLE + MATCHING-LANGUAGE AUDIENCE LEVEL RULE**: Root \`"title"\` (used as saved filename!) MUST follow \`"<Hook Title> | ${formatAudienceLevelLabel(chosenLevel, learningLang)}"\`. Make the first part super intriguing, emotional or curiosity-driven around "${topicHint}" (NEVER a flat story/textbook name like "La bicicleta roja que esperaba a Mateo" or "Lesson 1" — benchmark vibe: \`"Todo empezó con un pequeño favor… y terminó en un reencuentro inesperado"\`, \`"その誘い方、英語で自然に言える？"\`, \`"Stop saying 'I'm fine' — natives actually say this"\`), followed by \` | ${formatAudienceLevelLabel(chosenLevel, learningLang)}\` matching ${langOption.nativeName}.`
      : `- **CATCHY HOOK TITLE + MATCHING-LANGUAGE AUDIENCE LEVEL RULE**: Root \`"title"\` (used as saved filename!) MUST follow \`"<Hook Title> | ${formatAudienceLevelLabel(chosenLevel, learningLang)}"\`. Make the first part super intriguing, curiosity-driven and natural (NEVER a flat story/textbook title — benchmark vibe: \`"Todo empezó con un pequeño favor… y terminó en un reencuentro inesperado"\`, \`"その誘い方、英語で自然に言える？"\`, \`"One tiny phrase that instantly makes you sound native"\`) summarizing the exact episode/expressions you generated.`,
    ...dualTtsRules,
    difficultVocabGrammarRule,
    '- NEVER put `/IPA/` symbols, `&`, markdown (`**`, `#`), URLs, or emojis inside `speech` or `explanationSpeech`.',
    `- **LUẬT SẮT CHỈ DÙNG ĐÚNG 2 NGÔN NGỮ (STRICT 2-LANGUAGE PURITY — CẤM LẪN NGÔN NGỮ THỨ 3)**: Toàn bộ file JSON **CHỈ ĐƯỢC PHÉP chứa đúng 2 ngôn ngữ**: (1) **${langOption.nativeName}** (cho lời thoại speech, ví dụ, tiêu đề bài học gốc), và (2) **${explainLangName}** (cho toàn bộ title thẻ, badge, translation, vocabNotes, grammarNote, explanation, explanationSpeech, visual.subtitle, visual.labels). **TUYỆT ĐỐI CẤM** viết xen bất kỳ tiêu đề thẻ, bản dịch nghĩa, giải thích từ vựng/ngữ pháp, hay nhãn nút visual bằng ngôn ngữ thứ 3 (nhất là tiếng Anh) khi cả 2 ngôn ngữ đã chọn đều KHÔNG phải tiếng Anh! Kiểm tra lại từng trường trước khi trả kết quả.`,
    `- ${translationRule}`,
    '',
    TYPOGRAPHY_MOBILE_READABILITY_PROMPT_BLOCK,
    '',
    '## 5. COMPONENT VARIETY & ANTI-REPETITION',
    `- ${compHint}`,
    ...(params.compositionId === 'cartoon-host'
      ? [
          '- **CHẾ ĐỘ @Gimmys ĐANG BẬT**: BẮT BUỘC đặt `"compositionId": "cartoon-host"` ở JSON gốc và gắn `"cartoonAction"` + `"cartoonMood"` phù hợp từng card (KHÔNG dùng sai emotion vui lên thẻ cảnh báo/lỗi sai; dùng `worried`/`thinking-chin` cho thẻ lỗi sai và `happy`/`excited`/`clap-jump` cho khen ngợi/tổng kết).',
        ]
      : [
          '- **STRICT ANTI-REPETITION RULE**: NEVER assign the same `visual.variant` to two consecutive cards!' +
            (isMultiSpeakerFormat
              ? ' For 2–3 speaker turns, rotate conversation visuals cleanly (`"podcast-studio"`, `"p168-story-dialogue"`, `"css-chat-thread"`, `"ear-listen"`, `"speech-bubble"`, `"avatar-speech"`).'
              : ''),
          variantsListText,
          `- Valid \`visual.sceneIcon\` names (NEVER invent outside this list): ${sceneIconsListText}`,
        ]),
    '',
    '## 6. STRICT JSON OUTPUT FORMAT (EXPORT A VALID .JSON FILE)',
    '```json',
    '{',
    '  "mode": "vocab | phrases | phrasal_verbs | mistakes | grammar | comparisons | real_life | shadowing_solo | shadowing_dialogue | podcast_solo | podcast_duo | trending_social | workplace_tech | news_storytelling",',
    ...(params.compositionId && params.compositionId !== 'ai-decide'
      ? [`  "compositionId": "${params.compositionId}",`]
      : []),
    `  "learningLang": "${learningLang}",`,
    `  "level": "${chosenLevel}",`,
    ...(durationMinutes
      ? [
          `  "durationReport": { "targetMinutes": ${durationMinutes}, "estimatedMinutes": ${durationMinutes}, "estimatedCount": ${isCjkLearning ? targetCjkFloor : targetWordsFloor}, "metMinimum": true, "shortfallReason": "" },`,
        ]
      : []),
    `  "title": ${JSON.stringify(
      topicHint
        ? `<Tiêu đề hook thật hay, gợi tò mò về "${topicHint}"> | ${formatAudienceLevelLabel(chosenLevel, learningLang)}`
        : `<Tiêu đề hook thật hay, gợi tò mò (VD: 'Todo empezó con un pequeño favor… y terminó en un reencuentro inesperado' / 'その誘い方、英語で自然に言える？')> | ${formatAudienceLevelLabel(chosenLevel, learningLang)}`,
    )},`,
    '  "cards": [',
    ...(params.compositionId === 'cartoon-host'
      ? selectedExampleBlocks.map((ln) =>
          ln
            .replace(/"variant": "bs-card-header",/g, '"variant": "contrast-pair-cards",')
            .replace(/"variant": "css-magnifying-word",/g, '"variant": "cartoon-host", "cartoonAction": "point-up", "cartoonMood": "confident",'),
        )
      : selectedExampleBlocks),
    '    {',
    '      "type": "outro",',
    `      "title": ${JSON.stringify(locale.outroTitle)},`,
    `      "translation": ${JSON.stringify(locale.promptExampleOutroTranslation)},`,
    `      "speech": ${JSON.stringify(exOutroSpeech)},`,
    ...(includeExplanationSpeech
      ? [
          `      "explanationSpeech": ${JSON.stringify(
            explainSample(
              isConversationalScriptMode
                ? 'Tổng kết bài học hôm nay: bạn vừa nắm được toàn bộ diễn biến tình huống, cách phản ứng khéo léo trong thực tế và những mẫu câu trọng tâm để áp dụng ngay!'
                : 'Hãy lưu lại bài học hôm nay và luyện đọc to các mẫu câu vừa học mỗi ngày nhé!',
              isConversationalScriptMode
                ? 'Lesson recap: today you mastered the full scenario flow, practical response strategies, and the key natural expressions to use right away!'
                : 'Save this video and review these expressions again tomorrow!',
              exOutroSpeech || locale.outroTranslation,
            ),
          )},`,
        ]
      : []),
    ...(params.compositionId === 'cartoon-host'
      ? [
          '      "cartoonAction": "clap-jump",',
          '      "cartoonMood": "excited"',
        ]
      : [
          '      "visual": {',
          '        "variant": "css-bento-stats",',
          `        "title": ${JSON.stringify(locale.outroBadge)},`,
          `        "labels": ${JSON.stringify(locale.promptExampleOutroLabels)},`,
          '        "sceneIcon": "sparkles"',
          '      }',
        ]),
    '    }',
    '  ]',
    '}',
    '```',
    '',
    'HÃY XUẤT KẾT QUẢ CUỐI CÙNG THÀNH **1 FILE `.json` HOÀN CHỈNH HỢP LỆ** (chỉ trả về dữ liệu file JSON, không giải thích ngoài JSON).',
  ].join('\n');
}

export interface TranslationChallengeItemSeed {
  sourcePrompt: string;
  targetAnswer: string;
  phonetic?: string;
  vocabNotes?: string;
  grammarNote?: string;
  explanationSpeech?: string;
}

export interface TranslationTargetLocaleStrings {
  stageSteps: [string, string, string, string];
  askPill: (idxLabel: string) => string;
  askTitle: string;
  askSub: (thinkSec: number) => string;
  countdownPill: (remain: number) => string;
  meterTitle: (remain: number) => string;
  meterSub: string;
  promptSub: (reps: number) => string;
  repeatPill: (repIndex: number, total: number) => string;
  tipPill: (total: number) => string;
  sourceLabel: (prompt: string) => string;
  defaultTip: (total: number) => string;
  stamp: (total: number) => string;
  repeatChip: (total: number) => string;
  introBadge: (level: string) => string;
  introKicker: (thinkSec: number, repeatCount: number) => string;
  cardBadge: (num: number) => string;
  outroTitle: string;
  outroLabels: (total: number, thinkSec: number, repeatCount: number) => [string, string, string];
}

export function getTranslationTargetLocale(
  learningLang: LearningLanguageId = 'en',
): TranslationTargetLocaleStrings {
  switch (learningLang) {
    case 'ja':
      return {
        stageSteps: ['1. 元の文', '2. 考える', '3. 正解・反復', '4. まとめ'],
        askPill: (idxLabel) => `${idxLabel} · 日本語に訳そう`,
        askTitle: '日本語で言ってみよう',
        askSub: (thinkSec) => `あと${thinkSec}秒でスタート...`,
        countdownPill: (remain) => `⏱️ 声に出して言おう: あと${remain}秒`,
        meterTitle: (remain) => `今すぐ言おう · ${remain}s`,
        meterSub: '答えが出る前に声に出して訳そう！',
        promptSub: (reps) => `声に出して練習 · タイマー後に${reps}回リピート`,
        repeatPill: (r, total) => `✓ 正解 · リピート ${r}/${total}`,
        tipPill: (total) => `💡 表現のポイント · ×${total}`,
        sourceLabel: (prompt) => `元の文: ${prompt}`,
        defaultTip: (total) => `${total}回声に出して定着させよう！`,
        stamp: (total) => `×${total} リピート`,
        repeatChip: (total) => `リピート ${total}回`,
        introBadge: (level) => `瞬間作文 · ${level}`,
        introKicker: (thinkSec, reps) => `${thinkSec}秒で回答 · ${reps}回リピート`,
        cardBadge: (num) => `問題 #${num}`,
        outroTitle: 'チャレンジ完了！',
        outroLabels: (total, thinkSec, reps) => [`全${total}問`, `考える ${thinkSec}s`, `反復 ${reps}回`],
      };
    case 'zh':
      return {
        stageSteps: ['1. 原句', '2. 思考', '3. 答案与跟读', '4. 总结'],
        askPill: (idxLabel) => `${idxLabel} · 翻译成中文`,
        askTitle: '用中文说出来',
        askSub: (thinkSec) => `准备在${thinkSec}秒内开口...`,
        countdownPill: (remain) => `⏱️ 大声说出来: 还剩${remain}秒`,
        meterTitle: (remain) => `现在开口 · ${remain}s`,
        meterSub: '答案出现前大声说出来！',
        promptSub: (reps) => `轮到你了 · 倒计时后跟读${reps}遍`,
        repeatPill: (r, total) => `✓ 答案 · 跟读 ${r}/${total}`,
        tipPill: (total) => `💡 表达要点 · ×${total}`,
        sourceLabel: (prompt) => `原句: ${prompt}`,
        defaultTip: (total) => `大声跟读${total}遍巩固语感！`,
        stamp: (total) => `×${total} 跟读`,
        repeatChip: (total) => `跟读 ${total}遍`,
        introBadge: (level) => `口语反应 · ${level}`,
        introKicker: (thinkSec, reps) => `${thinkSec}秒思考 · 跟读${reps}遍`,
        cardBadge: (num) => `挑战 #${num}`,
        outroTitle: '挑战完成！',
        outroLabels: (total, thinkSec, reps) => [`${total}句`, `思考 ${thinkSec}s`, `跟读 ${reps}遍`],
      };
    case 'ko':
      return {
        stageSteps: ['1. 원문', '2. 생각하기', '3. 정답 · 반복', '4. 마무리'],
        askPill: (idxLabel) => `${idxLabel} · 한국어로 말해요`,
        askTitle: '한국어로 말해 보세요',
        askSub: (thinkSec) => `${thinkSec}초 안에 말해 보세요...`,
        countdownPill: (remain) => `⏱️ 큰 소리로 말하기: ${remain}초`,
        meterTitle: (remain) => `지금 말하세요 · ${remain}s`,
        meterSub: '정답이 나오기 전에 큰 소리로 말해 보세요!',
        promptSub: (reps) => `내 차례 · 타이머 후 ${reps}번 따라 말하기`,
        repeatPill: (r, total) => `✓ 정답 · 따라 말하기 ${r}/${total}`,
        tipPill: (total) => `💡 핵심 포인트 · ×${total}`,
        sourceLabel: (prompt) => `원문: ${prompt}`,
        defaultTip: (total) => `${total}번 큰 소리로 따라 읽으세요!`,
        stamp: (total) => `×${total} 반복`,
        repeatChip: (total) => `${total}회 반복`,
        introBadge: (level) => `스피킹 훈련 · ${level}`,
        introKicker: (thinkSec, reps) => `${thinkSec}초 생각 · ${reps}회 반복`,
        cardBadge: (num) => `문제 #${num}`,
        outroTitle: '챌린지 완료!',
        outroLabels: (total, thinkSec, reps) => [`${total}문장`, `${thinkSec}s 생각`, `${reps}회 반복`],
      };
    case 'fr':
      return {
        stageSteps: ['1. Phrase', '2. Réfléchir', '3. Réponse · Répéter', '4. Bilan'],
        askPill: (idxLabel) => `${idxLabel} · TRADUISEZ EN FRANÇAIS`,
        askTitle: 'Dites-le en français',
        askSub: (thinkSec) => `Préparez-vous en ${thinkSec} secondes...`,
        countdownPill: (remain) => `⏱️ PARLEZ À VOIX HAUTE : ${remain}S`,
        meterTitle: (remain) => `DITES-LE MAINTENANT · ${remain}s`,
        meterSub: 'Traduisez à voix haute avant la réponse !',
        promptSub: (reps) => `À vous · Répétition ×${reps} après le chrono`,
        repeatPill: (r, total) => `✓ RÉPONSE · RÉPÉTER ${r}/${total}`,
        tipPill: (total) => `💡 ASTUCE CLÉ · ×${total}`,
        sourceLabel: (prompt) => `Source : ${prompt}`,
        defaultTip: (total) => `Répétez ${total} fois à voix haute !`,
        stamp: (total) => `×${total} RÉPÉTER`,
        repeatChip: (total) => `Répéter ${total}×`,
        introBadge: (level) => `RÉFLEXE ORAL · ${level}`,
        introKicker: (thinkSec, reps) => `${thinkSec}s RÉFLEXION · ×${reps} RÉPÉTER`,
        cardBadge: (num) => `DÉFI #${num}`,
        outroTitle: 'Défi terminé !',
        outroLabels: (total, thinkSec, reps) => [`${total} phrases`, `Penser ${thinkSec}s`, `Répéter ${reps}×`],
      };
    case 'es':
      return {
        stageSteps: ['1. Frase', '2. Pensar', '3. Respuesta · Repetir', '4. Cierre'],
        askPill: (idxLabel) => `${idxLabel} · TRADUCE AL ESPAÑOL`,
        askTitle: 'Dilo en español',
        askSub: (thinkSec) => `Prepárate en ${thinkSec} segundos...`,
        countdownPill: (remain) => `⏱️ HABLA EN VOZ ALTA: ${remain}S`,
        meterTitle: (remain) => `DILO AHORA · ${remain}s`,
        meterSub: '¡Traduce en voz alta antes de ver la respuesta!',
        promptSub: (reps) => `Tu turno · Repite ×${reps} al terminar`,
        repeatPill: (r, total) => `✓ RESPUESTA · REPETIR ${r}/${total}`,
        tipPill: (total) => `💡 CLAVE DEL DÍA · ×${total}`,
        sourceLabel: (prompt) => `Original: ${prompt}`,
        defaultTip: (total) => `¡Repite ${total} veces en voz alta!`,
        stamp: (total) => `×${total} REPETIR`,
        repeatChip: (total) => `Repetir ${total}×`,
        introBadge: (level) => `REFLEJO ORAL · ${level}`,
        introKicker: (thinkSec, reps) => `${thinkSec}s PENSAR · ×${reps} REPETIR`,
        cardBadge: (num) => `RETO #${num}`,
        outroTitle: '¡Reto completado!',
        outroLabels: (total, thinkSec, reps) => [`${total} frases`, `Pensar ${thinkSec}s`, `Repetir ${reps}×`],
      };
    case 'en':
    default:
      return {
        stageSteps: ['1. Prompt', '2. Think', '3. Answer & Repeat', '4. Recap'],
        askPill: (idxLabel) => `${idxLabel} · TRANSLATE TO ENGLISH`,
        askTitle: 'Speak in English',
        askSub: (thinkSec) => `Get ready to respond in ${thinkSec}s...`,
        countdownPill: (remain) => `⏱️ SPEAK OUT LOUD: ${remain}S`,
        meterTitle: (remain) => `SAY IT NOW · ${remain}s`,
        meterSub: 'Translate aloud before the answer appears!',
        promptSub: (reps) => `Your turn · Answer repeats ${reps}× after timer`,
        repeatPill: (r, total) => `✓ ANSWER · REPEAT ${r}/${total}`,
        tipPill: (total) => `💡 KEY TAKEAWAY · ×${total}`,
        sourceLabel: (prompt) => `Prompt: ${prompt}`,
        defaultTip: (total) => `Repeat aloud ${total} times to lock it in!`,
        stamp: (total) => `×${total} REPEAT`,
        repeatChip: (total) => `Repeat ${total}×`,
        introBadge: (level) => `QUICK SPEAK · ${level}`,
        introKicker: (thinkSec, reps) => `${thinkSec}s THINK · ×${reps} REPEAT`,
        cardBadge: (num) => `CHALLENGE #${num}`,
        outroTitle: 'Challenge Complete!',
        outroLabels: (total, thinkSec, reps) => [`${total} sentences`, `Think ${thinkSec}s`, `Repeat ${reps}×`],
      };
  }
}

const CURATED_TRANSLATION_DECKS: Record<
  LearningLanguageId,
  {
    catchyHookTitle: (level: string) => string;
    introSubtitle: string;
    items: TranslationChallengeItemSeed[];
  }
> = {
  en: {
    catchyHookTitle: (level) =>
      `【Bật ra ngay ${level}】"Coi chừng cô ấy đấy!" nói tiếng Anh sao?`,
    introSubtitle: 'Listen to prompt · Speak aloud during countdown · Repeat after answer',
    items: [
      {
        sourcePrompt: 'Coi chừng cô ấy đấy!',
        targetAnswer: 'Watch out for her!',
        vocabNotes: 'watch out (coi chừng, đề phòng)',
        grammarNote: 'watch out for + O = đề phòng / cẩn thận với ai',
        explanationSpeech: 'Watch out for her là cách nói tự nhiên khi cảnh báo ai đó coi chừng hoặc giữ khoảng cách.',
      },
      {
        sourcePrompt: 'Tùy bạn quyết định thôi.',
        targetAnswer: "It's entirely up to you.",
        vocabNotes: 'entirely (hoàn toàn) · up to (tùy thuộc)',
        grammarNote: 'be up to + someone = tùy thuộc vào quyết định của ai',
        explanationSpeech: 'Thêm entirely nhấn mạnh ý hoàn toàn tùy bạn quyết định, rất lịch sự và tự nhiên.',
      },
      {
        sourcePrompt: 'Để tôi suy nghĩ thêm qua đêm nay đã.',
        targetAnswer: 'Let me sleep on it.',
        vocabNotes: 'sleep on it (ngủ một đêm suy nghĩ kỹ thêm)',
        grammarNote: 'Let + O + V = để ai đó làm gì',
        explanationSpeech: 'Người bản xứ dùng sleep on it thay vì think more khi chưa muốn chốt ngay.',
      },
      {
        sourcePrompt: 'Tôi đang trên đường tới rồi đây.',
        targetAnswer: "I'm on my way.",
        vocabNotes: 'on my way (đang trên đường tới)',
        grammarNote: "on one's way = đang trên đường di chuyển tới",
        explanationSpeech: 'Mẫu câu cực quen thuộc báo mình sắp tới nơi rồi.',
      },
      {
        sourcePrompt: 'Chuyện đó kể ra thì dài lắm.',
        targetAnswer: "It's a long story.",
        vocabNotes: 'long story (chuyện dài dòng)',
        grammarNote: "It's a long story = chuyện dài dòng lắm (tránh kể chi tiết)",
        explanationSpeech: 'Dùng khi không tiện giải thích hết đầu đuôi câu chuyện ngay lúc đó.',
      },
      {
        sourcePrompt: 'Đừng để bụng chuyện vừa rồi nhé.',
        targetAnswer: 'No hard feelings.',
        vocabNotes: 'hard feelings (ác cảm, giận dỗi để bụng)',
        grammarNote: 'No hard feelings = đừng giận hay để bụng nhé',
        explanationSpeech: 'Cách nói nhẹ nhàng giữ hòa khí sau một góp ý thẳng thắc.',
      },
      {
        sourcePrompt: 'Nghe quen tai thật đấy.',
        targetAnswer: 'That rings a bell.',
        vocabNotes: 'ring a bell (nghe quen quen, gợi nhớ)',
        grammarNote: 'ring a bell = nghe quen quen, gợi nhớ lại',
        explanationSpeech: 'Dùng khi bạn nghe tên ai hoặc việc gì thấy quen mà chưa nhớ rõ ngay.',
      },
      {
        sourcePrompt: 'Tôi hoàn toàn nhất trí với bạn.',
        targetAnswer: "I couldn't agree more.",
        vocabNotes: 'agree (đồng ý) · more (hơn nữa)',
        grammarNote: "couldn't agree more = hoàn toàn đồng ý 100%",
        explanationSpeech: 'Chú ý có chữ not nhưng nghĩa lại là đồng tình tuyệt đối.',
      },
      {
        sourcePrompt: 'Chúc bạn may mắn ở buổi phỏng vấn nhé!',
        targetAnswer: 'Break a leg at the interview!',
        vocabNotes: 'break a leg (chúc may mắn) · interview (phỏng vấn)',
        grammarNote: 'Break a leg = Chúc may mắn (thành ngữ tự nhiên)',
        explanationSpeech: 'Thành ngữ rất hay dùng để chúc bạn bè tỏa sáng trước khi thi hay phỏng vấn.',
      },
      {
        sourcePrompt: 'Cuối cùng mọi chuyện cũng ổn thỏa thôi.',
        targetAnswer: 'Everything will work out in the end.',
        vocabNotes: 'work out (ổn thỏa) · in the end (cuối cùng)',
        grammarNote: 'work out = tiến triển tốt, ổn thỏa',
        explanationSpeech: 'Câu động viên ấm áp và tự nhiên khi ai đó đang lo lắng.',
      },
    ],
  },
  zh: {
    catchyHookTitle: (level) =>
      `【Phản xạ ${level}】"Cẩn thận với cô ấy!" nói sao cho chuẩn?`,
    introSubtitle: '听原句 · 倒计时开口说中文 · 核对地道表达与词汇语法',
    items: [
      {
        sourcePrompt: 'Cẩn thận với cô ấy đấy!',
        targetAnswer: '小心她一点！',
        vocabNotes: '小心 (cẩn thận) · 一点 (một chút)',
        grammarNote: '小心 + 一点 = cẩn thận / coi chừng một chút',
        explanationSpeech: 'Thêm 一点 ở cuối giúp câu nhắc nhở nghe tự nhiên đúng khẩu ngữ bản xứ.',
      },
      {
        sourcePrompt: 'Tùy bạn thôi, sao cũng được.',
        targetAnswer: '随便你吧。',
        vocabNotes: '随便 (tùy ý) · 吧 (trợ từ ngữ khí nhẹ)',
        grammarNote: '随便你 = tùy bạn đấy',
        explanationSpeech: 'Dùng 随便你吧 với bạn bè khi nhường quyền chọn cho đối phương.',
      },
      {
        sourcePrompt: 'Tôi đang trên đường tới rồi.',
        targetAnswer: '我在路上了。',
        vocabNotes: '路 (đường) · 在…上 (đang trên…)',
        grammarNote: '在路上 = đang trên đường',
        explanationSpeech: 'Câu nhắn tin và nghe gọi phổ biến nhất khi hẹn gặp ở Trung Quốc.',
      },
      {
        sourcePrompt: 'Làm phiền bạn giúp tôi một chút nhé.',
        targetAnswer: '麻烦你帮我一下。',
        vocabNotes: '麻烦 (làm phiền) · 帮 (giúp) · 一下 (một chút)',
        grammarNote: '麻烦你 + 一下 = làm phiền bạn giúp chút',
        explanationSpeech: 'Cách mở lời nhờ vả vừa lịch sự vừa thân thiện.',
      },
      {
        sourcePrompt: 'Chuyện này nói ra thì dài lắm.',
        targetAnswer: '这事说来话长。',
        vocabNotes: '这事 (chuyện này) · 说来话长 (nói ra thì dài)',
        grammarNote: '说来话长 = nói ra thì dài dòng lắm',
        explanationSpeech: 'Cụm bốn chữ cực hay khi bạn muốn tóm tắt nhanh một câu chuyện dài.',
      },
      {
        sourcePrompt: 'Để tôi suy nghĩ lại một chút đã.',
        targetAnswer: '让我想一想。',
        vocabNotes: '让 (để, cho) · 想一想 (nghĩ một chút)',
        grammarNote: 'Động từ lặp + 一 = làm gì đó một chút (lịch sự, nhẹ nhàng)',
        explanationSpeech: 'Lặp động từ 想一想 làm giọng điệu mềm mại hơn.',
      },
      {
        sourcePrompt: 'Không sao đâu, đừng khách sáo.',
        targetAnswer: '没关系，别客气。',
        vocabNotes: '没关系 (không sao) · 别客气 (đừng khách sáo)',
        grammarNote: '别 + động từ = đừng…',
        explanationSpeech: 'Phản hồi tự nhiên khi người khác cảm ơn hoặc xin lỗi bạn.',
      },
      {
        sourcePrompt: 'Lâu rồi không gặp, dạo này bạn ổn chứ?',
        targetAnswer: '好久不见，最近怎么样？',
        vocabNotes: '好久不见 (lâu không gặp) · 最近 (dạo này) · 怎么样 (thế nào)',
        grammarNote: '最近怎么样 = dạo này ra sao?',
        explanationSpeech: 'Câu mở đầu kinh điển khi gặp lại bạn cũ.',
      },
    ],
  },
  ja: {
    catchyHookTitle: (level) =>
      `【このペースで言える？】"Coi chừng cô ấy!" 瞬間和作文 (${level})`,
    introSubtitle: '日本語で瞬間英作文トレーニング · 重要語彙と文法ポイント付き',
    items: [
      {
        sourcePrompt: 'Coi chừng cô ấy đấy!',
        targetAnswer: '彼女には気をつけて！',
        vocabNotes: '彼女 (cô ấy) · 気をつけて (hãy cẩn thận)',
        grammarNote: 'には気をつけて = cẩn thận với ai đó nhé',
        explanationSpeech: 'Trợ từ には nhấn mạnh đối tượng cần chú ý hoặc đề phòng.',
      },
      {
        sourcePrompt: 'Tôi xin giao lại cho bạn quyết định.',
        targetAnswer: 'お任せします。',
        vocabNotes: 'お任せ (sự giao phó, tùy chọn)',
        grammarNote: 'お + Danh từ + します = kính ngữ khiêm tốn lịch sự',
        explanationSpeech: 'Rất hay dùng khi gọi món hoặc nhờ đồng nghiệp chọn phương án.',
      },
      {
        sourcePrompt: 'Bây giờ tôi đang trên đường tới.',
        targetAnswer: '今向かっています。',
        vocabNotes: '今 (bây giờ) · 向かう (hướng tới)',
        grammarNote: 'ている = đang thực hiện hành động',
        explanationSpeech: 'Câu báo đang tới rất tự nhiên trong giao tiếp hàng ngày.',
      },
      {
        sourcePrompt: 'Xin lỗi, cho tôi suy nghĩ một chút nhé.',
        targetAnswer: 'ちょっと考えさせてください。',
        vocabNotes: 'ちょっと (một chút) · 考える (suy nghĩ)',
        grammarNote: 'させてください = xin hãy cho phép tôi làm gì',
        explanationSpeech: 'Cách xin thêm thời gian suy nghĩ cực kỳ lịch sự ở Nhật.',
      },
      {
        sourcePrompt: 'Lâu rồi không gặp, anh khỏe không?',
        targetAnswer: 'お久しぶりです、お元気ですか。',
        vocabNotes: '久しぶり (lâu ngày) · 元気 (khỏe mạnh)',
        grammarNote: 'お久しぶりです = lâu rồi mới gặp lại',
        explanationSpeech: 'Mẫu chào hỏi chuẩn mực khi gặp lại người quen.',
      },
      {
        sourcePrompt: 'Không vấn đề gì đâu, cứ yên tâm nhé.',
        targetAnswer: '大丈夫ですよ、安心してください。',
        vocabNotes: '大丈夫 (ổn, không sao) · 安心 (yên tâm)',
        grammarNote: 'てください = xin hãy… (lịch sự)',
        explanationSpeech: 'Giúp trấn an người đối diện rất nhẹ nhàng.',
      },
    ],
  },
  ko: {
    catchyHookTitle: (level) =>
      `【Phản xạ ${level}】"Cẩn thận với cô ấy!" nói sao cho tự nhiên?`,
    introSubtitle: 'Nghe câu gốc · Bật nhanh câu tiếng Hàn trước khi hết giờ đếm ngược',
    items: [
      {
        sourcePrompt: 'Cẩn thận với cô ấy đấy!',
        targetAnswer: '그 여자 조심하세요!',
        phonetic: 'geu yeo-ja jo-sim-ha-se-yo',
        grammarNote: '조심하세요 = hãy cẩn thận với ai đó',
        explanationSpeech: 'Cụm từ 조심하세요 dùng rất phổ biến để nhắc nhở ai đó cẩn thận.',
      },
      {
        sourcePrompt: 'Tôi đang trên đường tới rồi.',
        targetAnswer: '지금 가고 있어요.',
        phonetic: 'ji-geum ga-go i-sseo-yo',
        grammarNote: '-고 있어요 = đang làm gì đó',
        explanationSpeech: 'Câu báo mình đang di chuyển tới ngay bây giờ.',
      },
      {
        sourcePrompt: 'Cho tôi suy nghĩ thêm một chút nhé.',
        targetAnswer: '잠깐만 생각해 볼게요.',
        phonetic: 'jam-kkan-man saeng-gak-hae bol-ge-yo',
        grammarNote: '-아/어 볼게요 = tôi sẽ thử làm gì đó',
        explanationSpeech: 'Giọng điệu mềm mại, lịch sự khi cần thêm thời gian suy nghĩ.',
      },
      {
        sourcePrompt: 'Không sao đâu, đừng lo lắng quá.',
        targetAnswer: '괜찮아요, 걱정하지 마세요.',
        phonetic: 'gwaen-cha-na-yo, geok-jeong-ha-ji ma-se-yo',
        grammarNote: '-지 마세요 = xin đừng làm gì',
        explanationSpeech: 'Mẫu câu an ủi cực kỳ quen thuộc trong đời sống Hàn Quốc.',
      },
      {
        sourcePrompt: 'Lâu lắm rồi mới gặp bạn đấy!',
        targetAnswer: '정말 오랜만이에요!',
        phonetic: 'jeong-mal o-raen-man-i-e-yo',
        grammarNote: '오랜만이에요 = lâu rồi mới gặp',
        explanationSpeech: 'Dùng khi gặp lại bạn bè hoặc đồng nghiệp cũ.',
      },
    ],
  },
  fr: {
    catchyHookTitle: (level) =>
      `【Phản xạ ${level}】"Coi chừng cô ấy!" nói tiếng Pháp sao?`,
    introSubtitle: 'Nghe câu gợi ý · Tự phản xạ nói tiếng Pháp trước khi hiện đáp án',
    items: [
      {
        sourcePrompt: 'Coi chừng cô ấy đấy!',
        targetAnswer: "Méfie-toi d'elle !",
        phonetic: '/me.fi.twa dɛl/',
        grammarNote: 'se méfier de qqn = đề phòng, coi chừng ai đó',
        explanationSpeech: "Cách người Pháp nhắc nhau dè chừng rất tự nhiên trong hội thoại.",
      },
      {
        sourcePrompt: 'Tùy bạn quyết định thôi.',
        targetAnswer: "C'est comme tu veux.",
        phonetic: '/sɛ kɔm ty vø/',
        grammarNote: "C'est comme tu veux = tùy ý bạn thôi",
        explanationSpeech: 'Nhẹ nhàng nhường quyết định cho bạn bè.',
      },
      {
        sourcePrompt: 'Tôi đang trên đường tới rồi.',
        targetAnswer: 'Je suis en route.',
        phonetic: '/ʒə sɥi ɑ̃ ʁut/',
        grammarNote: 'être en route = đang trên đường tới',
        explanationSpeech: 'Câu nhắn quen thuộc khi đang đi tới điểm hẹn.',
      },
      {
        sourcePrompt: 'Để tôi suy nghĩ thêm một chút đã.',
        targetAnswer: 'Laisse-moi y réfléchir.',
        phonetic: '/lɛs mwa i ʁe.fle.ʃiʁ/',
        grammarNote: 'réfléchir à = suy nghĩ kỹ về việc gì',
        explanationSpeech: 'Thay từ y cho vấn đề vừa được nhắc đến.',
      },
      {
        sourcePrompt: 'Không có gì đâu, đừng khách sáo.',
        targetAnswer: "Il n'y a pas de quoi.",
        phonetic: '/il nja pa də kwa/',
        grammarNote: 'Pas de quoi = không có gì đâu',
        explanationSpeech: 'Lời đáp lịch sự và ấm áp khi được cảm ơn.',
      },
    ],
  },
  es: {
    catchyHookTitle: (level) =>
      `【Phản xạ ${level}】"Coi chừng cô ấy!" nói tiếng TBN sao?`,
    introSubtitle: 'Nghe câu gợi ý · Tự nói nhanh tiếng Tây Ban Nha trước khi hết giờ',
    items: [
      {
        sourcePrompt: 'Coi chừng cô ấy đấy!',
        targetAnswer: '¡Ten cuidado con ella!',
        phonetic: '/ten kwiˈða.ðo kon ˈe.ʝa/',
        grammarNote: 'tener cuidado con = cẩn thận / coi chừng với',
        explanationSpeech: 'Cách cảnh báo thân thiện và tự nhiên trong tiếng Tây Ban Nha.',
      },
      {
        sourcePrompt: 'Tùy bạn quyết định đấy.',
        targetAnswer: 'Como tú prefieras.',
        phonetic: '/ˈko.mo tu pɾeˈfje.ɾas/',
        grammarNote: 'como tú prefieras = tùy bạn chọn thôi',
        explanationSpeech: 'Nghe lịch sự và thoải mái trong hội thoại hàng ngày.',
      },
      {
        sourcePrompt: 'Tôi đang trên đường tới ngay.',
        targetAnswer: 'Ya estoy en camino.',
        phonetic: '/ʝa esˈtoj en kaˈmi.no/',
        grammarNote: 'estar en camino = đang trên đường',
        explanationSpeech: 'Câu nhắn phổ biến khi hẹn gặp bạn bè.',
      },
      {
        sourcePrompt: 'Để tôi nghĩ thêm một chút nhé.',
        targetAnswer: 'Déjame pensarlo un poco.',
        phonetic: '/ˈde.xa.me penˈsaɾ.lo un ˈpo.ko/',
        grammarNote: 'pensarlo = nghĩ về điều đó',
        explanationSpeech: 'Kết hợp đếm ngược phản xạ để nhớ cụm déjame + động từ nguyên mẫu.',
      },
      {
        sourcePrompt: 'Lâu rồi không gặp bạn!',
        targetAnswer: '¡Cuánto tiempo sin verte!',
        phonetic: '/ˈkwan.to ˈtjem.po sin ˈbeɾ.te/',
        grammarNote: '¡Cuánto tiempo! = lâu lắm rồi đấy',
        explanationSpeech: 'Lời chào đầy cảm xúc khi gặp lại người quen.',
      },
    ],
  },
};

export function buildTranslationChallengePrompt(params: {
  topicHint?: string;
  customInputLines?: string;
  learningLanguage?: LearningLanguageId;
  level?: string;
  durationMinutes?: number;
  itemCount?: number | 'auto';
  targetLang: string;
  thinkSec?: number;
  repeatCount?: number;
  includeNuanceTip?: boolean;
  compositionId?: LayoutCompositionId | 'ai-decide';
  aspectRatio?: ExportAspectRatioId;
}): string {
  const learningLang: LearningLanguageId = params.learningLanguage || 'en';
  const locale = getReelLocaleStrings(params.targetLang, learningLang);
  const { variantsListText, sceneIconsListText } = getCatalogSummaryForPrompt();
  const langOption =
    LEARNING_LANGUAGE_OPTIONS.find((item) => item.id === learningLang) || LEARNING_LANGUAGE_OPTIONS[0];
  const levelOptions = getLevelsForLearningLanguage(learningLang);
  const chosenLevel = params.level?.trim() || levelOptions[0]?.id || langOption.defaultLevel;
  const levelDesc =
    levelOptions.find((l) => l.id === chosenLevel)?.description || `Difficulty level: ${chosenLevel}`;

  const thinkSec = Math.max(1, Math.min(15, Math.round(params.thinkSec ?? 4)));
  const repeatCount = Math.max(1, Math.min(5, Math.round(params.repeatCount ?? 2)));
  const durationMinutes =
    typeof params.durationMinutes === 'number' && Number.isFinite(params.durationMinutes) && params.durationMinutes > 0
      ? Math.max(0.5, Math.min(30, params.durationMinutes))
      : 2;
  const isAutoItemCount = params.itemCount === 'auto';
  const numericCount = Math.max(
    3,
    Math.min(
      60,
      Math.round(
        typeof params.itemCount === 'number' && Number.isFinite(params.itemCount)
          ? params.itemCount
          : recommendTranslationItemCount(durationMinutes, thinkSec, repeatCount),
      ),
    ),
  );
  const countPadded = isAutoItemCount ? 'N' : String(numericCount).padStart(2, '0');
  const isSameLangExplain = locale.code === learningLang || locale.code === 'learning';
  const explainLangName =
    locale.code === 'none'
      ? 'Tiếng Việt'
      : isSameLangExplain
        ? `${langOption.nativeName} (giải thích / gợi ý bằng chính ngôn ngữ muốn học)`
        : locale.targetLanguageLabel;
  const topicHint = params.topicHint?.trim();
  const customLines = params.customInputLines?.trim();
  const includeNuanceTip = params.includeNuanceTip !== false;
  const aspectLabel =
    params.aspectRatio === '16:9'
      ? '16:9 Landscape Widescreen (1920×1080 — YouTube long-form instant translation drill)'
      : '9:16 Vertical Short (1080×1920 — TikTok / Reels / Shorts)';

  const scriptPurityHint =
    learningLang === 'zh'
      ? 'Put **100% pure Simplified Chinese Hanzi (汉字)** inside `"speech"` and `"answer"` (NO Pinyin inside `"speech"` or full-sentence `"phonetic"`, leave `"phonetic": ""`).'
      : learningLang === 'ja'
        ? 'Put **100% pure natural Japanese (漢字 + かな)** inside `"speech"` and `"answer"`. **NEVER** put full-sentence Hiragana, inline Furigana parentheses like `漢字(かんじ)`, or Romaji on the sentence!'
        : learningLang === 'ko'
          ? 'Put **100% pure Korean Hangul (한국어)** inside `"speech"` and `"answer"` (NO full-sentence Romanization).'
          : `Put **100% pure natural ${langOption.nativeName}** inside \`"speech"\` and \`"answer"\` (NO full-sentence IPA/phonetic).`;

  const exampleSource = isSameLangExplain
    ? learningLang === 'zh'
      ? '提醒朋友小心她一点！'
      : learningLang === 'ja'
        ? '友達に「彼女に気をつけて」と注意したいときは？'
        : learningLang === 'ko'
          ? '친구에게 그녀를 조심하라고 말하고 싶을 때는?'
          : learningLang === 'fr'
            ? 'Préviens ton ami de se méfier d’elle !'
            : learningLang === 'es'
              ? '¡Avisa a tu amigo que tenga cuidado con ella!'
              : 'Tell your friend to be careful around her!'
    : locale.code === 'en'
      ? 'Be careful around her!'
      : 'Coi chừng cô ấy đấy!';
  const exampleTarget =
    learningLang === 'zh'
      ? '小心她一点！'
      : learningLang === 'ja'
        ? '彼女には気をつけて！'
        : learningLang === 'ko'
          ? '그 여자 조심하세요!'
          : learningLang === 'fr'
            ? "Méfie-toi d'elle !"
            : learningLang === 'es'
              ? '¡Ten cuidado con ella!'
              : 'Watch out for her!';
  const exampleVocabNotes = isSameLangExplain
    ? learningLang === 'zh'
      ? '小心 (注意安全、谨慎)'
      : learningLang === 'ja'
        ? '気をつけて (注意を促す定番)'
        : learningLang === 'ko'
          ? '조심하세요 (주의를 당부)'
          : 'watch out for (be alert around someone)'
    : learningLang === 'zh'
      ? '小心 (cẩn thận) · 一点 (một chút)'
      : learningLang === 'ja'
        ? '彼女 (cô ấy) · 気をつけて (hãy cẩn thận)'
        : learningLang === 'ko'
          ? '조심하세요 (hãy cẩn thận)'
          : learningLang === 'fr'
            ? 'se méfier (đề phòng, cảnh giác)'
            : learningLang === 'es'
              ? 'tener cuidado (cẩn thận, coi chừng)'
              : 'watch out (coi chừng, đề phòng)';

  const trLocale = getTranslationTargetLocale(learningLang);
  const viLangName = langOption.label.split(' (')[0].replace(/^Tiếng\s+/, 'tiếng ');
  const avgFixedBaseSec = 2.5 + thinkSec + repeatCount * 2.6;
  const estTotalTargetSec = Math.round(durationMinutes * 60);
  const estAutoCardCount = Math.max(
    4,
    Math.round((estTotalTargetSec - 8) / (avgFixedBaseSec + (includeNuanceTip ? 8 : 0))),
  );
  const perCardNeededSec = Math.max(10, Math.round((estTotalTargetSec - 8) / Math.max(3, numericCount)));
  const perCardNeededExplSec = Math.max(4, Math.round(perCardNeededSec - avgFixedBaseSec));
  const perCardNeededExplWords = Math.max(12, Math.round(perCardNeededExplSec * 2.2));
  const transChapters =
    durationMinutes >= 5 ? Math.max(3, Math.min(10, Math.round(durationMinutes / 3.5))) : undefined;

  const durationFloorLine = isAutoItemCount
    ? [
        `- **Minimum Duration Floor & Knowledge Count (CHỈ ĐƯỢC DÀI HƠN, KHÔNG THẤP HƠN)**: At least **${durationMinutes} phút** (~${estTotalTargetSec} giây+) — **AI TỰ QUYẾT ĐỊNH SỐ LƯỢNG CÂU PHẢN XẠ TỐI ƯU** (không gò bó số lượng cố định):`,
        `  + **KẾ HOẠCH KHỐI LƯỢNG ĐỂ ĐẠT >= ${durationMinutes} PHÚT**: Với cấu hình hiện tại (nghĩ ${thinkSec}s + lặp ${repeatCount} lần${includeNuanceTip ? ' + mẹo sắc thái' : ''}), mỗi thẻ phản xạ kéo dài ~${Math.round(avgFixedBaseSec + (includeNuanceTip ? 8 : 0))} giây → cần khoảng **${estAutoCardCount}+ câu phản xạ**${transChapters ? ` chia làm **${transChapters} tình huống/chủ điểm giao tiếp khác nhau**` : ''} để chạm hoặc vượt **${durationMinutes} phút**! **CẤM** dừng sớm ở 8–15 câu (~3 phút)!`,
      ].join('\n')
    : `- **Minimum Duration Floor & Knowledge Count (CHỈ ĐƯỢC DÀI HƠN, KHÔNG THẤP HƠN)**: At least **${durationMinutes} phút** (~${estTotalTargetSec} giây+) with at least **${numericCount} challenge sentences**${includeNuanceTip ? ` (mỗi thẻ cần đạt ~${perCardNeededSec}s: ngoài ${thinkSec}s nghĩ + ${repeatCount}× lặp, phần \`explanationSpeech\` cần phân tích sắc thái sâu ~${perCardNeededExplWords}–${perCardNeededExplWords + 15} từ / ~${perCardNeededExplSec}s để ${numericCount} câu đạt đủ ${durationMinutes} phút!)` : ''} — let the quantity of knowledge points & explanation depth determine the final video duration (NEVER shorten below ${durationMinutes} phút or cut sentences into meaningless stubs!).`;

  const translationAntiFluffBlock = [
    '- **ANTI-RAMBLING, ANTI-REPETITION & DEEP-INSIGHT RULES (DÀI NHƯNG KHÔNG LAN MAN / LẶP LẠI)**:',
    '  + **NO RAMBLING**: Keep prompts crisp and lifelike; never pad `explanationSpeech` with vague empty praise.',
    '  + **ZERO REPETITION**: Every challenge sentence MUST test a **distinct grammar structure, idiom, pragmatic nuance, or real-life scenario** — NEVER repeat the same sentence frame with trivial noun swaps.',
    '  + **DEEP INSIGHT**: Highlight subtle register differences (casual vs polite vs native idiom), why literal word-by-word translation fails, and real conversational triggers.',
    `- **SELF-AUDIT & SHORTFALL REASON (\`durationReport\`)**: Before returning JSON, compute total estimated runtime \`sum(sourcePrompt + thinkSec + repeatCount * answer + explanationSpeech) / 60\`. If \`< ${durationMinutes} phút\`, add more distinct scenarios/cards first. If still \`< ${durationMinutes} phút\` (e.g., model output-token limit or insufficient source lines provided by user without padding fluff), MUST set \`"metMinimum": false\` and write the exact reason in \`"durationReport.shortfallReason"\`!`,
  ].join('\n');

  const inputModeLine = customLines
    ? isAutoItemCount
      ? `- **USER PROVIDED WORDS / SENTENCES (USE ALL & EXPAND WITH DEEP EXAMPLES AT LEVEL ${chosenLevel})**:\n"""\n${customLines.slice(0, 6000)}\n"""`
      : `- **USER PROVIDED WORDS / SENTENCES (MUST USE & EXPAND TO ${numericCount} ITEMS AT LEVEL ${chosenLevel})**:\n"""\n${customLines.slice(0, 6000)}\n"""`
    : isAutoItemCount
      ? `- **AI CREATIVE MODE**: User left custom lines blank — independently determine the optimal number of **natural, punchy, non-textbook sentences** calibrated to level **${chosenLevel}** so total spoken runtime is at least **${durationMinutes} phút**.`
      : `- **AI CREATIVE MODE**: User left custom lines blank — invent **${numericCount} natural, punchy, non-textbook sentences** strictly calibrated to level **${chosenLevel}**.`;

  const exampleIntroExplSpeech = isSameLangExplain
    ? learningLang === 'ja'
      ? `状況や言い換えを聞いて、${thinkSec}秒以内に自然な日本語で言ってみましょう！`
      : learningLang === 'zh'
        ? `听提示语境，并在${thinkSec}秒倒计时内用最地道的中文大声说出来！`
        : learningLang === 'ko'
          ? `상황 설명을 듣고 ${thinkSec}초 안에 자연스러운 한국어로 바로 말해 보세요!`
          : `Listen to the situation clue and say the most natural ${langOption.nativeName} expression within ${thinkSec} seconds!`
    : locale.code === 'en'
      ? `Challenge yourself to speak natural ${langOption.nativeName} before the ${thinkSec}-second timer runs out!`
      : `Thử thách phản xạ các câu ${viLangName} thực tế. Nghe câu gợi ý và bật ra ngay trong ${thinkSec} giây nhé!`;

  const exampleItemExplSpeech = isSameLangExplain
    ? learningLang === 'ja'
      ? '直訳ではなく、実際の会話で一番よく使われる自然な言い方です。'
      : learningLang === 'zh'
        ? '这是母语者在真实对话中最自然、最地道的说法。'
        : learningLang === 'ko'
          ? '실제 원어민 대화에서 가장 자연스럽게 쓰이는 표현입니다.'
          : 'This is the most concise and natural way native speakers say it in real conversations.'
    : locale.code === 'en'
      ? `Using ${exampleTarget} is the shortest and most natural phrasing in real conversations.`
      : `Cụm ${exampleTarget} là cách nói ngắn gọn và tự nhiên nhất khi giao tiếp ngoài đời.`;

  const exampleOutroExplSpeech = isSameLangExplain
    ? locale.promptExampleOutroTranslation
    : locale.code === 'en'
      ? 'Great job! Save this video and practice speaking aloud every day!'
      : 'Tuyệt vời! Hãy lưu lại video để luyện phản xạ nghe và bật câu mỗi ngày nhé!';

  return [
    `# ROLE: INSTANT TRANSLATION CHALLENGE DIRECTOR (PHẢN XẠ DỊCH CÂU — KIỂU 瞬間英作文)`,
    `You are an elite ${langOption.nativeName} speaking coach creating a high-retention **Instant Sentence Translation Challenge** video (${aspectLabel}), styled like top YouTube quick-translation drills where learners hear a natural ${explainLangName} ${isSameLangExplain ? 'situation/paraphrase prompt' : 'sentence'}, think during a **${thinkSec}-second countdown**, and then hear the natural ${langOption.nativeName} translation repeated **${repeatCount} times**.`,
    '',
    '## 1. CHALLENGE PARAMETERS',
    `- **Target Language to Speak**: **${langOption.label}**`,
    `- **Source / Cue & Explanation Language**: **${explainLangName}**${isSameLangExplain ? ` — Write \`"sourcePrompt"\` as a clear everyday situation / paraphrase clue in **${langOption.nativeName}**, and write \`"vocabNotes"\` & \`"explanationSpeech"\` 100% in **${langOption.nativeName}** (monolingual immersion, NO Vietnamese!).` : ''}`,
    `- **Difficulty Level (${langOption.systemName})**: **${chosenLevel}** (${levelDesc})`,
    durationFloorLine,
    translationAntiFluffBlock,
    `- **Think Countdown Per Sentence**: **${thinkSec} giây** (` + `"thinkSec": ${thinkSec}` + `)`,
    `- **Repeat Spoken Translations**: **${repeatCount} lần** (` + `"repeatCount": ${repeatCount}` + `)`,
    topicHint
      ? `- **Topic / Scenario Focus**: "${topicHint}"`
      : '- **Topic Focus**: User left topic blank — choose a super relatable, daily-life conversational theme that makes viewers think "Ủa câu này nói sao cho tự nhiên nhỉ?".',
    inputModeLine,
    '',
    '## 2. CATCHY YOUTUBE-STYLE HOOK TITLE RULE (CRITICAL!)',
    `- Format root \`"title"\` (used directly as the exported file name!) with **CATCHY HOOK TITLE FIRST, MATCHING-LANGUAGE AUDIENCE LEVEL AFTER**: **\`"<Tiêu đề hook thật hay, gợi tò mò> | ${formatAudienceLevelLabel(chosenLevel, learningLang)}"\`** (benchmark style: \`"その誘い方、英語で自然に言える？ | ${formatAudienceLevelLabel(chosenLevel, learningLang)}"\` or \`"Todo empezó con un pequeño favor… y terminó en un reencuentro inesperado | ${formatAudienceLevelLabel(chosenLevel, learningLang)}"\`).`,
    '- Keep the hook intriguing & conversational with strong curiosity/emotion — NEVER output flat story names or boring textbook titles like "Lesson 1" or "Translation Practice", and keep the audience level label in **' + langOption.nativeName + '**.',
    '',
    '## 3. CARD STRUCTURE, VOCAB GLOSS & TARGET-LANGUAGE CHROME',
    `1. **Hook Intro Card (\`type: "title"\`) — CHẾ ĐỘ NGÔN NGỮ GỐC**: Catchy hook title, \`"kicker"\` & \`"visual"\` labels written in **${langOption.nativeName}** (matching target learning language), \`"speech": ""\` (bắt buộc để trống, không cần đọc ngôn ngữ học ở intro), and energetic 1-sentence hook in \`"explanationSpeech"\` framed in **${explainLangName}** (if mentioning the lesson topic, key term, or grammar pattern, keep those terms written directly in natural **${langOption.nativeName}**!) inviting viewers to say each sentence aloud before the ${thinkSec}-second timer runs out!`,
    isAutoItemCount
      ? `2. **Translation Challenge Cards (\`type: "translation"\` — AI tự chọn tổng số câu \`N\` tối ưu theo chủ đề & thời lượng sàn):**`
      : `2. **${numericCount} Translation Challenge Cards (\`type: "translation"\`)**:`,
    `   - \`"indexLabel": "01 / ${countPadded}"\` through \`"${countPadded} / ${countPadded}"\``,
    `   - \`"sourcePrompt"\`: ${isSameLangExplain ? `Clear paraphrase / everyday situation cue in **${langOption.nativeName}** prompting the learner to produce the natural expression.` : `Natural, idiomatic, complete sentence (NEVER a 1-word stub!) in **${explainLangName}** (NOT stiff word-by-word textbook translation!).`}`,
    `   - \`"answer"\`: Natural spoken target sentence in **${langOption.nativeName}**.`,
    `   - \`"speech"\`: ${scriptPurityHint}`,
    `   - **NO FULL-SENTENCE PHONETIC / HIRAGANA / FURIGANA**: Leave \`"phonetic": ""\` empty! Do NOT write full-sentence Hiragana, inline Furigana, Romaji, Pinyin, or IPA beneath the target sentence.`,
    `   - \`"vocabNotes"\` & \`"grammarNote"\` (CALIBRATED TO LEVEL ${chosenLevel}): Nếu câu có **từ vựng khó** hoặc **ngữ pháp khó** so với trình độ **${chosenLevel}**, BẮT BUỘC ghi rõ giải thích, cách dùng và chú ý nếu có bằng **${explainLangName}**; **riêng nếu từ vựng khó là chữ Kanji thì phải ghi kèm cách đọc Hiragana của riêng từ Kanji khó đó** (VD \`雰囲気（ふんいき）: bầu không khí — cách dùng & chú ý...\`), KHÔNG viết Hiragana cho cả câu! Nếu câu đơn giản vừa tầm level thì giữ tối đa 1 ghi chú ngắn gọn hoặc để rỗng \`""\`.`,
    includeNuanceTip
      ? `   - \`"explanationSpeech"\`: **MANDATORY QUALITY & DEPTH** — Rich, complete spoken nuance tip in **${explainLangName}** (played after the ${repeatCount} repeats) explaining **WHY** native speakers say it this way, how to use it naturally, cautions/mistakes to avoid, and explaining any difficult vocab/grammar for **${chosenLevel}**. Keep target words, topic phrases, and grammar patterns in natural **${langOption.nativeName}**. NEVER write truncated or meaningless filler fragments.`
      : `   - \`"explanationSpeech"\`: "" (keep empty so audio focuses 100% on Prompt -> Countdown -> ${repeatCount}x Repeats; ensure every \`sourcePrompt\` and \`answer\` is a complete, meaningful sentence).`,
    `   - \`"thinkSec": ${thinkSec}\`, \`"repeatCount": ${repeatCount}\``,
    `   - **QUY TẮC TTS SONG NGỮ & CHỐNG ĐỌC NHẦM KÝ TỰ**:`,
    `     + \`"speech"\` chỉ chứa đúng **${langOption.nativeName}** (không trộn tiếng Việt, Romaji/Pinyin hay ký hiệu lạ).`,
    isSameLangExplain
      ? `     + \`"explanationSpeech"\` chỉ chứa đúng **${langOption.nativeName}** tự nhiên.`
      : `     + \`"explanationSpeech"\` (cả ở \`title\` intro, thẻ \`translation\`, và \`outro\`) và \`"sourcePrompt"\` dùng khung câu **${explainLangName}** (ngôn ngữ gốc), **NHƯNG mọi từ vựng mục tiêu, chủ đề bài học và cấu trúc ngữ pháp được nhắc tới PHẢI viết trực tiếp bằng ${langOption.nativeName} tự nhiên** (tuyệt đối KHÔNG viết Romaji/Pinyin/phiên âm bồi và không dịch mất chữ gốc) để TTS song ngữ tách giọng đọc tự nhiên kể cả khi chỉ bật đọc ngôn ngữ gốc.`,
    `     + **HẠN CHẾ TỐI ĐA CHUỖI NGÔN NGỮ GỐC CHỈ 1 TỪ & CẤM KÝ TỰ ĐƠN LẺ**: Tuyệt đối hạn chế sinh \`"sourcePrompt"\`, \`"explanationSpeech"\` hoặc \`"vocabNotes"\` bằng ngôn ngữ gốc chỉ có **1 từ đơn lẻ** (luôn viết thành cụm tự nhiên ≥ 2–4 từ hoặc câu hoàn chỉnh), và **KHÔNG** dùng chữ cái đơn lẻ hay ký hiệu viết tắt rời rạc (\`"A"\`, \`"B"\`, \`"S"\`, \`"V"\`, \`"O"\`, \`"X"\`, \`"Y"\`, \`"VD"\`) trong lời đọc TTS vì rất dễ bị đọc nhầm từng ký tự.`,
    `3. **Recap Outro Card (\`type: "outro"\`) — CHẾ ĐỘ NGÔN NGỮ GỐC**: \`"speech": ""\` (không cần đọc ngôn ngữ học ở outro), encouraging closing in \`"explanationSpeech"\` in **${explainLangName}** (keep any mentioned topic/grammar terms in natural **${langOption.nativeName}**!), and \`visual\` labels written in **${langOption.nativeName}**.`,
    '',
    TYPOGRAPHY_MOBILE_READABILITY_PROMPT_BLOCK,
    '',
    '## 4. VISUAL VARIETY & @GIMMYS COMPLIANCE',
    `- ${
      params.compositionId === 'cartoon-host'
        ? `REQUIRED layout \`"compositionId": "cartoon-host"\` (@Gimmys Cartoon Host): MUST set \`"compositionId": "cartoon-host"\`, and attach matching \`"cartoonAction"\` / \`"cartoonMood"\` / \`"cartoonAnimationSpec"\` per card (NEVER put happy/excited on mistake/avoid scenes!).\n${getCartoonAnimationsPromptBlock()}`
        : params.compositionId && params.compositionId !== 'ai-decide'
          ? `Set \`"compositionId": "${params.compositionId}"\` where helpful.`
          : 'Rotate visual components cleanly across cards (NEVER repeat same variant back-to-back).'
    }`,
    ...(params.compositionId === 'cartoon-host'
      ? []
      : [
          variantsListText,
          `- Valid \`visual.sceneIcon\` values: ${sceneIconsListText}`,
        ]),
    '',
    '## 5. STRICT JSON OUTPUT (EXPORT A COMPLETE .JSON FILE)',
    '```json',
    '{',
    '  "mode": "translation",',
    ...(params.compositionId && params.compositionId !== 'ai-decide'
      ? [`  "compositionId": "${params.compositionId}",`]
      : []),
    `  "learningLang": "${learningLang}",`,
    `  "level": "${chosenLevel}",`,
    `  "thinkSec": ${thinkSec},`,
    `  "repeatCount": ${repeatCount},`,
    `  "durationReport": { "targetMinutes": ${durationMinutes}, "estimatedMinutes": ${durationMinutes}, "estimatedCount": ${isAutoItemCount ? estAutoCardCount : numericCount}, "metMinimum": true, "shortfallReason": "" },`,
    `  "title": ${JSON.stringify(
      isSameLangExplain
        ? `その言い方、${langOption.nativeName}で自然に言える？ | ${formatAudienceLevelLabel(chosenLevel, learningLang)}`
        : `${topicHint ? `<Tiêu đề hook thật hay & gợi tò mò về "${topicHint}">` : `<Tiêu đề hook thật hay & gợi tò mò (VD: "${exampleSource}" nói sao cho tự nhiên?)>`} | ${formatAudienceLevelLabel(chosenLevel, learningLang)}`,
    )},`,
    '  "cards": [',
    '    {',
    '      "type": "title",',
    `      "kicker": ${JSON.stringify(trLocale.introKicker(thinkSec, repeatCount))},`,
    `      "title": ${JSON.stringify(isSameLangExplain ? `【Quick Speak ${chosenLevel}】"${exampleSource}"` : `【Phản xạ ${chosenLevel}】"${exampleSource}" nói sao cho chuẩn?`)},`,
    '      "speech": "",',
    `      "explanationSpeech": ${JSON.stringify(exampleIntroExplSpeech)},`,
    ...(params.compositionId === 'cartoon-host'
      ? [
          '      "cartoonAction": "wave-hello",',
          '      "cartoonMood": "happy"',
        ]
      : [
          `      "visual": { "variant": "bs-card-header", "formula": ${JSON.stringify(trLocale.introKicker(thinkSec, repeatCount))}, "title": ${JSON.stringify(trLocale.askTitle)}, "sceneIcon": "sparkles" }`,
        ]),
    '    },',
    '    {',
    '      "type": "translation",',
    `      "indexLabel": "01 / ${countPadded}",`,
    `      "sourcePrompt": ${JSON.stringify(exampleSource)},`,
    `      "answer": ${JSON.stringify(exampleTarget)},`,
    '      "phonetic": "",',
    `      "speech": ${JSON.stringify(exampleTarget)},`,
    `      "vocabNotes": ${JSON.stringify(exampleVocabNotes)},`,
    '      "grammarNote": "",',
    ...(includeNuanceTip
      ? [`      "explanationSpeech": ${JSON.stringify(exampleItemExplSpeech)},`]
      : ['      "explanationSpeech": "",']),
    `      "thinkSec": ${thinkSec},`,
    `      "repeatCount": ${repeatCount},`,
    ...(params.compositionId === 'cartoon-host'
      ? [
          '      "cartoonAction": "point-up",',
          '      "cartoonMood": "confident"',
        ]
      : [
          `      "visual": { "variant": "css-flashcard-flip", "title": "01 / ${countPadded}", "sceneIcon": "chat" }`,
        ]),
    '    },',
    '    {',
    '      "type": "outro",',
    `      "title": ${JSON.stringify(trLocale.outroTitle)},`,
    '      "speech": "",',
    `      "explanationSpeech": ${JSON.stringify(exampleOutroExplSpeech)},`,
    `      "translation": ${JSON.stringify(locale.promptExampleOutroTranslation)},`,
    ...(params.compositionId === 'cartoon-host'
      ? [
          '      "cartoonAction": "clap-jump",',
          '      "cartoonMood": "excited"',
        ]
      : [
          `      "visual": { "variant": "css-bento-stats", "title": ${JSON.stringify(trLocale.outroTitle)}, "labels": ${JSON.stringify(isAutoItemCount ? trLocale.outroLabels(10, thinkSec, repeatCount).map((l, i) => (i === 0 ? trLocale.askTitle : l)) as [string, string, string] : trLocale.outroLabels(numericCount, thinkSec, repeatCount))}, "sceneIcon": "sparkles" }`,
        ]),
    '    }',
    '  ]',
    '}',
    '```',
    '',
    'HÃY XUẤT KẾT QUẢ CUỐI CÙNG THÀNH **1 FILE `.json` HOÀN CHỈNH HỢP LỆ** (chỉ trả về file JSON, không kèm lời giải thích bên ngoài).',
  ].join('\n');
}

export function buildTranslationCardsFromInput(params: {
  topicHint?: string;
  customInputLines?: string;
  learningLanguage?: LearningLanguageId;
  level?: string;
  itemCount?: number;
  targetLang?: string;
  thinkSec?: number;
  repeatCount?: number;
  includeNuanceTip?: boolean;
}): { title: string; mode: Exclude<ReelMode, 'auto'>; cards: ReelCard[] } {
  const learningLang: LearningLanguageId = params.learningLanguage || 'en';
  const langMeta =
    LEARNING_LANGUAGE_OPTIONS.find((l) => l.id === learningLang) || LEARNING_LANGUAGE_OPTIONS[0];
  const chosenLevel = params.level?.trim() || langMeta.defaultLevel;
  const thinkSec = Math.max(1, Math.min(15, Math.round(params.thinkSec ?? 4)));
  const repeatCount = Math.max(1, Math.min(5, Math.round(params.repeatCount ?? 2)));
  const includeNuanceTip = params.includeNuanceTip !== false;
  const targetLang = params.targetLang || 'Tiếng Việt';
  const locale = getReelLocaleStrings(targetLang, learningLang);
  const trLocale = getTranslationTargetLocale(learningLang);
  const deck = CURATED_TRANSLATION_DECKS[learningLang] || CURATED_TRANSLATION_DECKS.en;

  const rawLines = (params.customInputLines || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '').trim())
    .filter(Boolean);

  let parsedSeeds: TranslationChallengeItemSeed[] = [];
  if (rawLines.length > 0) {
    parsedSeeds = rawLines.map((line, idx) => {
      const splitMatch = line.match(/^(.+?)\s*(?:\||->|→|=|:|—)\s*(.+)$/);
      if (splitMatch) {
        const left = splitMatch[1].trim();
        const right = splitMatch[2].trim();
        const leftIsTarget =
          (learningLang === 'zh' && /[\u4e00-\u9fff]/.test(left)) ||
          (learningLang === 'ja' && /[\u3040-\u30ff]/.test(left)) ||
          (learningLang === 'ko' && /[\uac00-\ud7af]/.test(left)) ||
          (learningLang === 'en' && !/[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i.test(left) && /[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i.test(right));
        return {
          sourcePrompt: leftIsTarget ? right : left,
          targetAnswer: leftIsTarget ? left : right,
          grammarNote: 'Câu luyện phản xạ theo nội dung của bạn',
          explanationSpeech: includeNuanceTip ? 'Hãy đọc to dứt khoát theo ngữ điệu tự nhiên.' : '',
        };
      }
      const fallbackSeed = deck.items[idx % deck.items.length];
      const looksVietnamese = /[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i.test(line);
      if (looksVietnamese) {
        return {
          sourcePrompt: line,
          targetAnswer: `[Dịch câu: ${line}]`,
          grammarNote: 'Chỉnh lại đáp án ngoại ngữ hoặc dùng AI Web/Server để dịch tự động',
          explanationSpeech: includeNuanceTip ? 'Nói to câu dịch của bạn trước khi hết giờ.' : '',
        };
      }
      return {
        sourcePrompt: fallbackSeed.sourcePrompt,
        targetAnswer: line,
        grammarNote: 'Mẫu câu tùy chỉnh của bạn',
        explanationSpeech: includeNuanceTip ? 'Đọc lặp lại rõ ràng để ghi nhớ cấu trúc.' : '',
      };
    });
  } else {
    const requestedCount = Math.max(3, Math.min(20, Math.round(params.itemCount ?? 6)));
    for (let i = 0; i < requestedCount; i++) {
      parsedSeeds.push(deck.items[i % deck.items.length]);
    }
  }

  const totalItems = parsedSeeds.length;
  const paddedTotal = String(totalItems).padStart(2, '0');
  const viLangName = langMeta.label.split(' (')[0].replace(/^Tiếng\s+/, 'tiếng ');
  const firstPromptQuote = parsedSeeds[0]?.sourcePrompt?.replace(/[?!.]+$/, '') || 'Coi chừng cô ấy đấy';
  const topicLabel = params.topicHint?.trim();
  const title =
    rawLines.length > 0 || topicLabel
      ? learningLang === 'ja'
        ? `【このペースで言える？】"${firstPromptQuote}" (${topicLabel || chosenLevel})`
        : `【Phản xạ ${chosenLevel}】"${firstPromptQuote}"${topicLabel ? ` · ${topicLabel}` : ' nói sao cho chuẩn?'}`
      : deck.catchyHookTitle(chosenLevel);

  const cards: ReelCard[] = [
    {
      id: makeCardId(0),
      type: 'intro',
      badge: trLocale.introBadge(chosenLevel),
      kicker: trLocale.introKicker(thinkSec, repeatCount),
      title,
      content: topicLabel
        ? `${trLocale.askTitle} · ${topicLabel}`
        : `${trLocale.askTitle} (${chosenLevel})`,
      translation: deck.introSubtitle,
      ttsText: '',
      explanationSpeech: `Thử thách phản xạ ${totalItems} câu ${viLangName}. Nghe câu tiếng Việt và bật ra ngay trong ${thinkSec} giây nhé!`,
      learningLang,
      durationSec: 4.5,
      visual: {
        variant: 'bs-card-header',
        formula: trLocale.introKicker(thinkSec, repeatCount),
        title: trLocale.askTitle,
        subtitle: deck.introSubtitle,
        sceneIcon: 'sparkles',
      },
    },
  ];

  parsedSeeds.forEach((seed, idx) => {
    const idxStr = `${String(idx + 1).padStart(2, '0')} / ${paddedTotal}`;
    const cleanSpeech = sanitizeTtsSpeech(seed.targetAnswer) || seed.targetAnswer;
    const estCardSec =
      estimateCardSpeechDuration(seed.sourcePrompt) +
      thinkSec +
      repeatCount * (estimateCardSpeechDuration(cleanSpeech) + 0.55) +
      (includeNuanceTip && seed.explanationSpeech ? estimateCardSpeechDuration(seed.explanationSpeech) : 0);

    const card: ReelCard = {
      id: makeCardId(idx + 1),
      type: 'translation',
      badge: trLocale.cardBadge(idx + 1),
      indexLabel: idxStr,
      title: seed.targetAnswer,
      content: seed.targetAnswer,
      sourcePrompt: seed.sourcePrompt,
      translation: seed.sourcePrompt,
      vocabNotes: seed.vocabNotes,
      grammarNote: seed.grammarNote,
      explanationSpeech: includeNuanceTip ? seed.explanationSpeech || '' : '',
      learningLang,
      ttsText: cleanSpeech,
      thinkSec,
      repeatCount,
      durationSec: Number(estCardSec.toFixed(2)),
    };
    const prevVariant = cards[cards.length - 1]?.visual?.variant;
    card.visual = defaultVisualForCard(card, idx + 1, totalItems + 2, targetLang, prevVariant);
    cards.push(card);
  });

  cards.push({
    id: makeCardId(cards.length),
    type: 'outro',
    badge: locale.outroBadge,
    title: trLocale.outroTitle,
    content: trLocale.outroTitle,
    translation: locale.outroTranslation,
    ttsText: '',
    explanationSpeech: `Tuyệt vời! Bạn vừa luyện phản xạ xong ${totalItems} câu. Hãy lưu lại video để luyện bật câu nhanh hơn mỗi ngày nhé!`,
    learningLang,
    durationSec: 4.0,
    visual: {
      variant: 'css-bento-stats',
      title: trLocale.outroTitle,
      labels: trLocale.outroLabels(totalItems, thinkSec, repeatCount),
      sceneIcon: 'sparkles',
    },
  });

  return { title, mode: 'vocab', cards };
}

export const STARTER_SAMPLE_TITLE_PREFIX = '【Thử ngay】';

export function buildStarterLessonForLanguage(
  learningLang: LearningLanguageId,
  targetLang = 'Tiếng Việt',
  level?: string,
): { title: string; mode: ReelMode; cards: ReelCard[] } {
  const locale = getReelLocaleStrings(targetLang, learningLang);
  const langMeta =
    LEARNING_LANGUAGE_OPTIONS.find((l) => l.id === learningLang) || LEARNING_LANGUAGE_OPTIONS[0];
  const chosenLevel = level || langMeta.defaultLevel;

  if (learningLang === 'zh') {
    const title = `${STARTER_SAMPLE_TITLE_PREFIX} Mở lời tiếng Trung cho khéo (${chosenLevel})`;
    const cards: ReelCard[] = [
      {
        id: 'starter-zh-intro',
        type: 'intro',
        badge: `${chosenLevel} TIẾNG TRUNG`,
        kicker: `${chosenLevel} MANDARIN`,
        title,
        content: '4 mẫu câu tiếng Trung dùng ngay hàng ngày',
        translation: locale.code === 'none' ? 'Practical daily Mandarin expressions' : 'Chào mừng bạn đến với bài học tiếng Trung thực tế',
        ttsText: '今天我们来学习四个实用的中文表达。',
        explanationSpeech:
          locale.code === 'none'
            ? 'Today we practice four essential Mandarin expressions.'
            : 'Hôm nay chúng ta cùng học bốn mẫu câu tiếng Trung giao tiếp dùng được ngay hàng ngày.',
        learningLang: 'zh',
        durationSec: 4.2,
        visual: {
          variant: 'bs-card-header',
          formula: chosenLevel,
          title: '4 Mẫu Câu Tiếng Trung',
          subtitle: 'Nghe · Đọc theo · Hiểu ngữ cảnh',
          sceneIcon: 'sparkles',
        },
      },
      {
        id: 'starter-zh-1',
        type: 'vocab',
        badge: '01 / 04',
        indexLabel: '01 / 04',
        title: '不好意思',
        content: '不好意思，请问洗手间在哪里？',
        phonetic: 'bù hǎo yì si · qǐng wèn xǐ shǒu jiān zài nǎ lǐ',
        translation:
          locale.code === 'none'
            ? 'Excuse me, where is the restroom?'
            : 'Xin lỗi, cho hỏi nhà vệ sinh ở đâu ạ?',
        ttsText: '不好意思。不好意思，请问洗手间在哪里？',
        explanationSpeech:
          locale.code === 'none'
            ? 'Use 不好意思 to politely get attention before asking a question.'
            : 'Dùng cụm 不好意思 khi muốn mở lời nhờ vả hoặc hỏi đường một cách lịch sự. Câu ví dụ nghĩa là: Xin lỗi, cho hỏi nhà vệ sinh ở đâu ạ?',
        learningLang: 'zh',
        durationSec: 5.5,
        visual: {
          variant: 'css-magnifying-word',
          title: '不好意思',
          subtitle: 'Mở lời lịch sự · Xin phép nhẹ nhàng',
          labels: ['bù hǎo yì si', 'Hỏi đường & nhờ vả'],
          highlightWord: '不好意思',
          sceneIcon: 'chat',
        },
      },
      {
        id: 'starter-zh-2',
        type: 'vocab',
        badge: '02 / 04',
        indexLabel: '02 / 04',
        title: '麻烦您了',
        content: '麻烦您帮我拿一杯水。',
        phonetic: 'má fan nín bāng wǒ ná yì bēi shuǐ',
        translation:
          locale.code === 'none'
            ? 'Sorry to trouble you, please bring me a glass of water.'
            : 'Làm phiền anh chị lấy giúp tôi một cốc nước.',
        ttsText: '麻烦您了。麻烦您帮我拿一杯水。',
        explanationSpeech:
          locale.code === 'none'
            ? '麻烦您了 expresses warm politeness when asking someone for a favor.'
            : 'Cụm 麻烦您了 có nghĩa là làm phiền bạn rồi, rất hay dùng khi nhờ người khác giúp đỡ lịch sự.',
        learningLang: 'zh',
        durationSec: 5.2,
        visual: {
          variant: 'contrast-pair-cards',
          title: 'Nhờ vả tự nhiên',
          subtitle: 'Tránh ra lệnh trực tiếp',
          labels: ['Cứng: 给我水', 'Lịch sự: 麻烦您了'],
          sceneIcon: 'cup',
        },
      },
      {
        id: 'starter-zh-3',
        type: 'vocab',
        badge: '03 / 04',
        indexLabel: '03 / 04',
        title: '没关系',
        content: '没关系，我们慢慢来。',
        phonetic: 'méi guān xi · wǒ men màn màn lái',
        translation:
          locale.code === 'none'
            ? 'No problem, let us take our time.'
            : 'Không sao đâu, chúng ta cứ từ từ làm.',
        ttsText: '没关系。没关系，我们慢慢来。',
        explanationSpeech:
          locale.code === 'none'
            ? '没关系 means it does not matter or no worries.'
            : 'Cụm 没关系 nghĩa là không sao đâu, dùng để trấn an người đối diện khi họ xin lỗi hoặc vội vàng.',
        learningLang: 'zh',
        durationSec: 4.8,
        visual: {
          variant: 'css-sticky-note',
          title: '没关系',
          subtitle: 'Không sao đâu · Trấn an nhẹ nhàng',
          labels: ['méi guān xi', 'Phản hồi thân thiện'],
          sceneIcon: 'heart',
        },
      },
      {
        id: 'starter-zh-outro',
        type: 'outro',
        badge: 'OUTRO',
        title: 'Lưu lại & Luyện nói ngay',
        content: 'Hãy luyện đọc to 3 mẫu câu này mỗi ngày!',
        translation: locale.promptExampleOutroTranslation,
        ttsText: '记得收藏这节课，每天开口练习吧。',
        explanationSpeech:
          locale.code === 'none'
            ? 'Save this lesson and practice speaking aloud every day!'
            : 'Hãy lưu lại bài học này và luyện đọc to mỗi ngày nhé!',
        learningLang: 'zh',
        durationSec: 3.6,
        visual: {
          variant: 'css-bento-stats',
          title: 'Hoàn thành bài học!',
          labels: locale.promptExampleOutroLabels,
          sceneIcon: 'sparkles',
        },
      },
    ];
    return { title, mode: 'vocab', cards };
  }

  if (learningLang === 'ja') {
    const title = `${STARTER_SAMPLE_TITLE_PREFIX} 【このペースで言える？】Tiếng Nhật (${chosenLevel})`;
    const cards: ReelCard[] = [
      {
        id: 'starter-ja-intro',
        type: 'intro',
        badge: `JLPT ${chosenLevel}`,
        kicker: `JLPT ${chosenLevel}`,
        title,
        content: '3 mẫu câu tiếng Nhật dùng ngay trong quán ăn & công sở',
        translation: locale.introVisualSubtitle,
        ttsText: '今日は毎日使える大切な日本語を学びましょう。',
        explanationSpeech:
          locale.code === 'none'
            ? 'Welcome to this practical Japanese mini lesson.'
            : 'Chào mừng bạn đến với bài học tiếng Nhật thực tế, gồm các mẫu câu giao tiếp dùng ngay hàng ngày.',
        learningLang: 'ja',
        durationSec: 4.2,
        visual: {
          variant: 'bs-card-header',
          formula: chosenLevel,
          title: '3 Mẫu Câu Tiếng Nhật',
          subtitle: 'Nghe chuẩn · Hiểu ngay ngữ cảnh',
          sceneIcon: 'sparkles',
        },
      },
      {
        id: 'starter-ja-1',
        type: 'vocab',
        badge: '01 / 03',
        indexLabel: '01 / 03',
        title: 'お願いします',
        content: 'お水をお願いします。',
        phonetic: 'おねがいします · onegaishimasu',
        translation: locale.code === 'none' ? 'Water, please.' : 'Cho tôi một cốc nước ạ.',
        ttsText: 'お願いします。お水をお願いします。',
        explanationSpeech:
          locale.code === 'none'
            ? 'Use お願いします whenever ordering or making a polite request.'
            : 'Cụm từ お願いします dùng để gọi món hoặc nhờ vả lịch sự trong mọi tình huống.',
        learningLang: 'ja',
        durationSec: 5.0,
        visual: {
          variant: 'css-magnifying-word',
          title: 'お願いします',
          subtitle: 'Gọi món & nhờ vả lịch sự',
          labels: ['onegaishimasu', 'Dùng hàng ngày'],
          highlightWord: 'お願いします',
          sceneIcon: 'cup',
        },
      },
      {
        id: 'starter-ja-2',
        type: 'vocab',
        badge: '02 / 03',
        indexLabel: '02 / 03',
        title: 'すみません',
        content: 'すみません、駅はどこですか。',
        phonetic: 'sumimasen · eki wa doko desu ka',
        translation: locale.code === 'none' ? 'Excuse me, where is the station?' : 'Xin lỗi, nhà ga ở đâu vậy ạ?',
        ttsText: 'すみません。すみません、駅はどこですか。',
        explanationSpeech:
          locale.code === 'none'
            ? 'すみません politely opens a conversation or apologizes lightly.'
            : 'Từ すみません vừa mang nghĩa xin lỗi nhẹ nhàng, vừa dùng để gọi nhân viên hoặc hỏi đường.',
        learningLang: 'ja',
        durationSec: 5.0,
        visual: {
          variant: 'css-sticky-note',
          title: 'すみません',
          subtitle: 'Xin lỗi · Mở lời hỏi đường',
          labels: ['sumimasen', 'Giao tiếp cơ bản'],
          sceneIcon: 'map-pin',
        },
      },
      {
        id: 'starter-ja-outro',
        type: 'outro',
        badge: 'OUTRO',
        title: 'Lưu lại & Luyện nói ngay',
        content: 'Luyện đọc to cùng giọng mẫu mỗi ngày!',
        translation: locale.promptExampleOutroTranslation,
        ttsText: '今日学んだ表現をぜひ使ってみてください。',
        explanationSpeech:
          locale.code === 'none'
            ? 'Save this lesson and review it again tomorrow!'
            : 'Hãy lưu lại bài học này và luyện đọc to mỗi ngày nhé!',
        learningLang: 'ja',
        durationSec: 3.6,
        visual: {
          variant: 'css-bento-stats',
          title: 'Hoàn thành bài học!',
          labels: locale.promptExampleOutroLabels,
          sceneIcon: 'sparkles',
        },
      },
    ];
    return { title, mode: 'vocab', cards };
  }

  if (learningLang === 'ko') {
    const title = `${STARTER_SAMPLE_TITLE_PREFIX} Nói tiếng Hàn như bản xứ (${chosenLevel})`;
    const cards: ReelCard[] = [
      {
        id: 'starter-ko-intro',
        type: 'intro',
        badge: chosenLevel,
        title,
        content: '3 mẫu câu tiếng Hàn giao tiếp tự nhiên',
        translation: locale.introVisualSubtitle,
        ttsText: '오늘은 매일 쓸 수 있는 핵심 한국어 표현을 배워볼게요.',
        explanationSpeech:
          locale.code === 'none'
            ? 'Today we practice essential Korean expressions.'
            : 'Hôm nay chúng ta cùng học những mẫu câu tiếng Hàn dùng ngay trong đời sống.',
        learningLang: 'ko',
        durationSec: 4.0,
        visual: {
          variant: 'bs-card-header',
          formula: chosenLevel,
          title: '3 Mẫu Câu Tiếng Hàn',
          subtitle: 'Phát âm chuẩn · Giải thích dễ hiểu',
          sceneIcon: 'sparkles',
        },
      },
      {
        id: 'starter-ko-1',
        type: 'vocab',
        badge: '01 / 02',
        indexLabel: '01 / 02',
        title: '잠시만요',
        content: '잠시만요, 메뉴판 좀 주시겠어요?',
        phonetic: 'jam-si-man-yo',
        translation: locale.code === 'none' ? 'Excuse me, could I see the menu?' : 'Xin lỗi một chút, cho tôi xem thực đơn được không ạ?',
        ttsText: '잠시만요. 잠시만요, 메뉴판 좀 주시겠어요?',
        explanationSpeech:
          locale.code === 'none'
            ? 'Use 잠시만요 to call a server politely.'
            : 'Cụm từ 잠시만요 dùng để gọi phục vụ hoặc xin chờ một lát cực kỳ tự nhiên.',
        learningLang: 'ko',
        durationSec: 4.8,
        visual: {
          variant: 'css-magnifying-word',
          title: '잠시만요',
          subtitle: 'Gọi nhân viên · Xin chờ chút',
          labels: ['jam-si-man-yo', 'Nhà hàng & Cafe'],
          highlightWord: '잠시만요',
          sceneIcon: 'chat',
        },
      },
      {
        id: 'starter-ko-outro',
        type: 'outro',
        badge: 'OUTRO',
        title: 'Lưu lại & Luyện tập',
        content: 'Hãy luyện nói to mỗi ngày!',
        translation: locale.promptExampleOutroTranslation,
        ttsText: '오늘 배운 표현을 저장하고 꼭 연습해 보세요.',
        explanationSpeech:
          locale.code === 'none'
            ? 'Save this video and practice every day!'
            : 'Hãy lưu lại bài học này và luyện đọc to mỗi ngày nhé!',
        learningLang: 'ko',
        durationSec: 3.5,
        visual: {
          variant: 'css-bento-stats',
          title: 'Hoàn thành!',
          labels: locale.promptExampleOutroLabels,
          sceneIcon: 'sparkles',
        },
      },
    ];
    return { title, mode: 'vocab', cards };
  }

  if (learningLang === 'fr' || learningLang === 'es') {
    const isFr = learningLang === 'fr';
    const title = `${STARTER_SAMPLE_TITLE_PREFIX} Mở lời ${isFr ? 'tiếng Pháp' : 'tiếng TBN'} cực khéo (${chosenLevel})`;
    const cards: ReelCard[] = [
      {
        id: `starter-${learningLang}-intro`,
        type: 'intro',
        badge: chosenLevel,
        title,
        content: isFr ? 'Phrases polies du quotidien' : 'Frases esenciales para cada día',
        translation: locale.introVisualSubtitle,
        ttsText: isFr
          ? "Aujourd'hui, apprenons des expressions françaises naturelles."
          : 'Hoy vamos a aprender expresiones naturales en español.',
        explanationSpeech:
          locale.code === 'none'
            ? 'Let us learn natural everyday phrases.'
            : `Hôm nay chúng ta học mẫu câu giao tiếp ${isFr ? 'tiếng Pháp' : 'tiếng Tây Ban Nha'} tự nhiên.`,
        learningLang,
        durationSec: 4.0,
        visual: {
          variant: 'bs-card-header',
          formula: chosenLevel,
          title: isFr ? 'Tiếng Pháp Thực Tế' : 'Tiếng Tây Ban Nha Thực Tế',
          subtitle: 'Nghe chuẩn · Giải thích rõ',
          sceneIcon: 'sparkles',
        },
      },
      {
        id: `starter-${learningLang}-1`,
        type: 'vocab',
        badge: '01 / 02',
        indexLabel: '01 / 02',
        title: isFr ? "S'il vous plaît" : 'Por favor',
        content: isFr ? "Un café, s'il vous plaît." : 'Un café, por favor.',
        translation: locale.code === 'none' ? 'A coffee, please.' : 'Cho tôi một ly cà phê ạ.',
        ttsText: isFr ? "S'il vous plaît. Un café, s'il vous plaît." : 'Por favor. Un café, por favor.',
        explanationSpeech:
          locale.code === 'none'
            ? 'Always add please when ordering.'
            : 'Mẫu câu lịch sự kinh điển khi gọi đồ uống tại quán.',
        learningLang,
        durationSec: 4.4,
        visual: {
          variant: 'css-magnifying-word',
          title: isFr ? "S'il vous plaît" : 'Por favor',
          subtitle: 'Gọi món lịch sự',
          labels: [isFr ? 'Lịch sự' : 'Tự nhiên', 'Quán cà phê'],
          sceneIcon: 'cup',
        },
      },
      {
        id: `starter-${learningLang}-outro`,
        type: 'outro',
        badge: 'OUTRO',
        title: 'Lưu lại & Luyện nói ngay',
        content: 'Luyện đọc to mỗi ngày!',
        translation: locale.promptExampleOutroTranslation,
        ttsText: isFr ? 'Enregistrez cette leçon pour pratiquer.' : 'Guarda esta lección para practicar.',
        explanationSpeech:
          locale.code === 'none'
            ? 'Save this lesson and practice daily!'
            : 'Hãy lưu lại bài học này và luyện đọc to mỗi ngày nhé!',
        learningLang,
        durationSec: 3.4,
        visual: {
          variant: 'css-bento-stats',
          title: 'Hoàn thành!',
          labels: locale.promptExampleOutroLabels,
          sceneIcon: 'sparkles',
        },
      },
    ];
    return { title, mode: 'vocab', cards };
  }

  // English starter
  const title = `${STARTER_SAMPLE_TITLE_PREFIX} Đừng dùng từ cũ nữa! (${chosenLevel})`;
  const cards: ReelCard[] = [
    {
      id: 'starter-en-intro',
      type: 'intro',
      badge: `LEVEL ${chosenLevel}`,
      kicker: `LEVEL ${chosenLevel} UPGRADE`,
      title,
      content: 'Stop using basic words — speak naturally at work & in daily life',
      translation: locale.introVisualSubtitle,
      ttsText: 'Stop using the same basic words every day. Here are two smart upgrades.',
      explanationSpeech:
        locale.code === 'none'
          ? 'Today we upgrade everyday words for clearer communication.'
          : 'Hôm nay chúng ta nâng cấp cách diễn đạt tiếng Anh tự nhiên và chuyên nghiệp hơn.',
      learningLang: 'en',
      durationSec: 4.5,
      visual: {
        variant: 'bs-card-header',
        formula: chosenLevel,
        title: 'Smart Upgrades',
        subtitle: 'Nghe chuẩn · Nói tự nhiên',
        sceneIcon: 'sparkles',
      },
    },
    {
      id: 'starter-en-1',
      type: 'vocab',
      badge: '01 / 02',
      indexLabel: '01 / 02',
      title: 'articulate',
      content: 'She is remarkably articulate during team meetings.',
      phonetic: '/ɑːrˈtɪk.jə.lət/',
      translation: locale.code === 'none' ? 'able to express ideas clearly' : 'diễn đạt mạch lạc, rõ ràng',
      ttsText: 'Number one: articulate. She is remarkably articulate during team meetings.',
      explanationSpeech:
        locale.code === 'none'
          ? 'Articulate means speaking clearly and persuasively.'
          : 'Từ vựng articulate nghĩa là diễn đạt mạch lạc và thuyết phục. Ví dụ: Cô ấy trình bày rất mạch lạc trong các buổi họp.',
      learningLang: 'en',
      durationSec: 5.2,
      visual: {
        variant: 'css-magnifying-word',
        title: 'articulate',
        subtitle: 'Clear & persuasive speaker',
        labels: ['Basic: clear', 'Smart: articulate'],
        highlightWord: 'articulate',
        sceneIcon: 'mic',
      },
    },
    {
      id: 'starter-en-outro',
      type: 'outro',
      badge: 'OUTRO',
      title: 'Save & Practice Today',
      content: 'Use these words in your next conversation!',
      translation: locale.promptExampleOutroTranslation,
      ttsText: 'Save this lesson and use these expressions today.',
      explanationSpeech:
        locale.code === 'none'
          ? 'Save this video and review it tomorrow!'
          : 'Hãy lưu lại bài học này và luyện đọc to mỗi ngày nhé!',
      learningLang: 'en',
      durationSec: 3.5,
      visual: {
        variant: 'css-bento-stats',
        title: 'Ready to Use!',
        labels: locale.promptExampleOutroLabels,
        sceneIcon: 'sparkles',
      },
    },
  ];
  return { title, mode: 'vocab', cards };
}

function stripJsonCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced && fenced[1]) return fenced[1].trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

function parseCardVisualConfig(rawVisual: unknown): ReelCardVisualConfig | undefined {
  if (!rawVisual || typeof rawVisual !== 'object') return undefined;
  const v = rawVisual as Record<string, unknown>;
  const variant =
    typeof v.variant === 'string' && isKnownIllustrationVariant(v.variant.trim())
      ? (v.variant.trim() as IllustrationVariant)
      : undefined;

  const labels = Array.isArray(v.labels)
    ? v.labels.map((s) => String(s).trim()).filter(Boolean).slice(0, 4)
    : undefined;

  let customPrimitives: VectorPrimitive[] | undefined;
  if (Array.isArray(v.customPrimitives) && v.customPrimitives.length > 0) {
    const normalized = normalizeCustomComponent({
      variant: variant || 'custom-inline',
      label: String(v.title || 'Custom'),
      primitives: v.customPrimitives,
    });
    if (normalized && normalized.primitives.length > 0) {
      customPrimitives = normalized.primitives;
    }
  }

  const out: ReelCardVisualConfig = {
    variant,
    title: typeof v.title === 'string' && v.title.trim() ? v.title.trim() : undefined,
    subtitle: typeof v.subtitle === 'string' && v.subtitle.trim() ? v.subtitle.trim() : undefined,
    labels: labels && labels.length > 0 ? labels : undefined,
    value: typeof v.value === 'number' && Number.isFinite(v.value) ? Math.max(0, Math.min(1, v.value)) : undefined,
    formula: typeof v.formula === 'string' && v.formula.trim() ? v.formula.trim() : undefined,
    highlightWord:
      typeof v.highlightWord === 'string' && v.highlightWord.trim() ? v.highlightWord.trim() : undefined,
    sceneIcon:
      typeof v.sceneIcon === 'string' && v.sceneIcon.trim()
        ? (v.sceneIcon.trim() as IllustrationSceneIcon)
        : undefined,
    speechText: typeof v.speechText === 'string' && v.speechText.trim() ? v.speechText.trim() : undefined,
    reactionText: typeof v.reactionText === 'string' && v.reactionText.trim() ? v.reactionText.trim() : undefined,
    customPrimitives,
  };

  if (
    !out.variant &&
    !out.title &&
    !out.subtitle &&
    !out.labels &&
    out.value === undefined &&
    !out.formula &&
    !out.highlightWord &&
    !out.sceneIcon &&
    !out.speechText &&
    !out.reactionText &&
    !out.customPrimitives
  ) {
    return undefined;
  }
  return out;
}

export function parseEnglishReelsAiJson(
  rawText: string,
  options?: { targetLang?: string },
): ParsedEnglishReelsResponse | null {
  if (!rawText || !rawText.trim()) return null;
  const cleaned = stripJsonCodeFences(rawText);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return null;
  }

  // Case 1: Fixed English Reels or AI Creator / Translation schema (`cards` array)
  if (Array.isArray(parsed.cards) && parsed.cards.length > 0) {
    const rawMode = String(parsed.mode || 'reading').toLowerCase();
    const isTranslationMode =
      rawMode === 'translation' ||
      rawMode === 'instant_translation' ||
      rawMode === 'translate' ||
      parsed.cards.some(
        (rc) =>
          rc &&
          typeof rc === 'object' &&
          ['translation', 'translate', 'challenge'].includes(
            String((rc as Record<string, unknown>).type || '').toLowerCase().trim(),
          ),
      );
    const creatorSubModes = new Set([
      'phrases',
      'phrasal_verbs',
      'grammar',
      'mistakes',
      'comparisons',
      'real_life',
      'shadowing_solo',
      'shadowing_dialogue',
      'podcast_solo',
      'podcast_duo',
      'trending_social',
      'workplace_tech',
      'news_storytelling',
    ]);
    const creatorSubMode = creatorSubModes.has(rawMode) ? rawMode : undefined;
    const mode: Exclude<ReelMode, 'auto'> =
      rawMode === 'quiz'
        ? 'quiz'
        : rawMode === 'vocab' || isTranslationMode || creatorSubModes.has(rawMode)
          ? 'vocab'
          : 'reading';

    const rootThinkSec =
      typeof parsed.thinkSec === 'number' && Number.isFinite(parsed.thinkSec)
        ? Math.max(0, Math.min(15, Math.round(parsed.thinkSec)))
        : undefined;
    const rootRepeatCount =
      typeof parsed.repeatCount === 'number' && Number.isFinite(parsed.repeatCount)
        ? Math.max(1, Math.min(5, Math.round(parsed.repeatCount)))
        : undefined;

    const cards: ReelCard[] = [];
    const rawCards = parsed.cards;
    let quizSeq = 0;

    for (let idx = 0; idx < rawCards.length; idx++) {
      const rawCard = rawCards[idx];
      if (!rawCard || typeof rawCard !== 'object') continue;
      const c = rawCard as Record<string, unknown>;
      const rawType = String(c.type || '').toLowerCase().trim();

      // Merge adjacent `question` + `answer` Creator pair cleanly into 1 interactive 5s quiz card
      const nextRaw =
        rawType === 'question' && idx + 1 < rawCards.length && rawCards[idx + 1] && typeof rawCards[idx + 1] === 'object'
          ? (rawCards[idx + 1] as Record<string, unknown>)
          : null;
      const isMergedQuestionAnswer =
        rawType === 'question' && nextRaw && String(nextRaw.type || '').toLowerCase().trim() === 'answer';

      let type: ReelCardType;
      if (rawType === 'intro' || rawType === 'title' || rawType === 'hook') {
        type = 'intro';
      } else if (rawType === 'transition' || rawType === 'bridge' || rawType === 'section') {
        type = 'transition';
      } else if (rawType === 'translation' || rawType === 'translate' || rawType === 'challenge') {
        type = 'translation';
      } else if (rawType === 'quiz' || rawType === 'question') {
        type = 'quiz';
      } else if (rawType === 'outro' || rawType === 'recap') {
        type = 'outro';
      } else if (
        rawType === 'vocab' ||
        rawType === 'reading' ||
        rawType === 'item' ||
        rawType === 'phrase' ||
        rawType === 'answer' ||
        rawType === 'dialogue' ||
        rawType === 'turn' ||
        rawType === 'line' ||
        rawType === 'speech' ||
        rawType === 'story' ||
        rawType === 'situation' ||
        rawType === 'takeaway' ||
        rawType === 'summary' ||
        rawType === 'recap_card'
      ) {
        type = 'vocab';
      } else {
        type = mode === 'quiz' ? 'quiz' : isTranslationMode ? 'translation' : 'vocab';
      }

      const rawSpeaker =
        typeof c.speaker === 'string' && c.speaker.trim()
          ? c.speaker.trim()
          : typeof c.speakerName === 'string' && c.speakerName.trim()
            ? c.speakerName.trim()
            : '';
      const rawSpeakerGenderStr =
        typeof c.speakerGender === 'string'
          ? c.speakerGender.trim().toLowerCase()
          : typeof c.gender === 'string'
            ? c.gender.trim().toLowerCase()
            : '';
      const speakerGender: 'male' | 'female' | undefined =
        rawSpeakerGenderStr === 'male' || rawSpeakerGenderStr === 'm' || rawSpeakerGenderStr === 'nam'
          ? 'male'
          : rawSpeakerGenderStr === 'female' || rawSpeakerGenderStr === 'f' || rawSpeakerGenderStr === 'nữ' || rawSpeakerGenderStr === 'nu'
            ? 'female'
            : undefined;
      const speakerRole =
        typeof c.speakerRole === 'string' && c.speakerRole.trim()
          ? c.speakerRole.trim()
          : typeof c.role === 'string' &&
              c.role.trim() &&
              !['vocab', 'dialogue', 'example', 'intro', 'outro', 'quiz', 'translation'].includes(
                c.role.trim().toLowerCase(),
              )
            ? c.role.trim()
            : undefined;

      const wordVal = typeof c.word === 'string' && c.word.trim() ? c.word.trim() : '';
      const meaningVal = typeof c.meaning === 'string' && c.meaning.trim() ? c.meaning.trim() : '';
      const exampleVal = typeof c.example === 'string' && c.example.trim() ? c.example.trim() : '';
      const sourcePromptVal =
        typeof c.sourcePrompt === 'string' && c.sourcePrompt.trim()
          ? c.sourcePrompt.trim()
          : typeof c.prompt === 'string' && c.prompt.trim()
            ? c.prompt.trim()
            : typeof c.source === 'string' && c.source.trim()
              ? c.source.trim()
              : '';
      const answerVal =
        typeof c.answer === 'string' && c.answer.trim()
          ? c.answer.trim()
          : typeof c.target === 'string' && c.target.trim()
            ? c.target.trim()
            : '';
      const kickerVal = typeof c.kicker === 'string' && c.kicker.trim() ? c.kicker.trim() : '';
      const indexLabelVal =
        typeof c.indexLabel === 'string' && c.indexLabel.trim() ? c.indexLabel.trim() : '';
      const speechVal = typeof c.speech === 'string' && c.speech.trim() ? c.speech.trim() : '';
      const translationRaw =
        typeof c.translation === 'string' && c.translation.trim() ? c.translation.trim() : '';
      const vocabNotes =
        typeof c.vocabNotes === 'string' && c.vocabNotes.trim()
          ? c.vocabNotes.trim()
          : typeof c.vocab === 'string' && c.vocab.trim()
            ? c.vocab.trim()
            : undefined;
      const grammarNote =
        typeof c.grammarNote === 'string' && c.grammarNote.trim()
          ? c.grammarNote.trim()
          : undefined;

      const rawTitleField = typeof c.title === 'string' && c.title.trim() ? c.title.trim() : '';
      const rawContentField = String(c.content || c.text || '').trim();

      const content =
        type === 'intro'
          ? rawContentField || meaningVal || rawTitleField || String(parsed.title || '').trim()
          : type === 'outro'
            ? rawContentField || speechVal || rawTitleField || 'Save & Practice Today'
            : type === 'translation'
              ? answerVal || rawContentField || exampleVal || speechVal || wordVal || rawTitleField
              : rawContentField || exampleVal || meaningVal || wordVal || rawTitleField;

      const title =
        type === 'intro'
          ? rawTitleField || String(parsed.title || content || 'English Lesson').trim()
          : type === 'translation'
            ? rawTitleField || answerVal || content || `Câu ${idx + 1}`
            : wordVal || rawTitleField || content || `Card ${idx + 1}`;

      if (!content && !title) continue;
      if (isMetadataNoiseLine(content) && !wordVal && type !== 'translation') continue;

      const contextExcerpt =
        typeof c.contextExcerpt === 'string' && c.contextExcerpt.trim()
          ? c.contextExcerpt.trim()
          : undefined;

      const explanationSpeechRaw =
        typeof c.explanationSpeech === 'string' && c.explanationSpeech.trim()
          ? sanitizeTtsSpeech(c.explanationSpeech)
          : typeof c.explainSpeech === 'string' && c.explainSpeech.trim()
            ? sanitizeTtsSpeech(c.explainSpeech)
            : undefined;
      const hasExplicitEmptySpeech =
        (typeof c.ttsText === 'string' && c.ttsText.trim() === '') ||
        (typeof c.speech === 'string' && c.speech.trim() === '');
      const defaultSpokenFromCreator =
        wordVal && exampleVal
          ? `${wordVal}. ${exampleVal}`
          : wordVal && meaningVal
            ? `${wordVal}. ${meaningVal}`
            : content || title;
      const ttsText =
        type === 'translation'
          ? sanitizeTtsSpeech(String(c.ttsText || speechVal || answerVal || content)) ||
            sanitizeTtsSpeech(content || title)
          : (type === 'intro' || type === 'transition' || type === 'outro') &&
              hasExplicitEmptySpeech &&
              explanationSpeechRaw
            ? ''
            : sanitizeTtsSpeech(String(c.ttsText || speechVal || defaultSpokenFromCreator)) ||
              sanitizeTtsSpeech(content || title);

      // Build clean translation/subtext line avoiding duplication
      const translationParts: string[] = [];
      if (meaningVal && meaningVal.toLowerCase() !== content.toLowerCase()) {
        translationParts.push(meaningVal);
      }
      if (
        translationRaw &&
        translationRaw.toLowerCase() !== meaningVal.toLowerCase() &&
        translationRaw.toLowerCase() !== content.toLowerCase()
      ) {
        translationParts.push(translationRaw);
      }
      const resolvedSourcePrompt =
        type === 'translation'
          ? sourcePromptVal || translationRaw || meaningVal || rawTitleField
          : sourcePromptVal || undefined;
      const mergedTranslation =
        type === 'translation'
          ? resolvedSourcePrompt || translationParts.join(' · ') || grammarNote
          : translationParts.join(' · ') || grammarNote || (translationRaw || undefined);

      let optionsArr = Array.isArray(c.options)
        ? c.options.map((o) => String(o).trim()).filter(Boolean)
        : undefined;
      let answerIndex = typeof c.answerIndex === 'number' ? Math.max(0, c.answerIndex) : undefined;
      let explanation =
        typeof c.explanation === 'string' && c.explanation.trim() ? c.explanation.trim() : undefined;
      let rawAnsText =
        typeof c.ttsAnswerText === 'string' && c.ttsAnswerText.trim()
          ? sanitizeTtsSpeech(c.ttsAnswerText)
          : undefined;

      if (isMergedQuestionAnswer && nextRaw) {
        const nextAnsTitle = String(nextRaw.title || nextRaw.word || nextRaw.content || nextRaw.answer || '').trim();
        const nextAnsSpeech = String(nextRaw.speech || nextRaw.ttsText || nextAnsTitle).trim();
        const nextExpl = String(nextRaw.explanation || nextRaw.translation || nextRaw.meaning || '').trim();
        if (!optionsArr?.length && nextAnsTitle) {
          optionsArr = [nextAnsTitle];
          answerIndex = 0;
        }
        if (!explanation && nextExpl) explanation = nextExpl;
        if (!rawAnsText && nextAnsSpeech) rawAnsText = sanitizeTtsSpeech(nextAnsSpeech);
      }

      const thinkSec =
        type === 'quiz'
          ? typeof c.thinkSec === 'number' && Number.isFinite(c.thinkSec)
            ? Math.max(0, Math.min(10, c.thinkSec))
            : isMergedQuestionAnswer
              ? 3
              : 5
          : type === 'translation'
            ? typeof c.thinkSec === 'number' && Number.isFinite(c.thinkSec)
              ? Math.max(0, Math.min(15, Math.round(c.thinkSec)))
              : rootThinkSec ?? 4
            : undefined;

      const repeatCount =
        type === 'translation'
          ? typeof c.repeatCount === 'number' && Number.isFinite(c.repeatCount)
            ? Math.max(1, Math.min(5, Math.round(c.repeatCount)))
            : rootRepeatCount ?? 2
          : undefined;

      const resolvedBadge =
        String(
          indexLabelVal ||
            c.badge ||
            (rawType === 'answer'
              ? 'ANSWER'
              : type === 'translation'
                ? getTranslationTargetLocale(
                    typeof c.learningLang === 'string' && c.learningLang.trim()
                      ? (c.learningLang.trim().toLowerCase() as LearningLanguageId)
                      : typeof parsed.learningLang === 'string' && parsed.learningLang.trim()
                        ? (parsed.learningLang.trim().toLowerCase() as LearningLanguageId)
                        : 'en',
                  ).cardBadge(cards.filter((x) => x.type === 'translation').length + 1)
                : type === 'intro' && kickerVal
                  ? kickerVal
                  : type.toUpperCase()),
        ).trim();

      const topLearningLang =
        typeof parsed.learningLang === 'string' && parsed.learningLang.trim()
          ? (parsed.learningLang.trim().toLowerCase() as LearningLanguageId)
          : undefined;
      const cardLearningLang =
        typeof c.learningLang === 'string' && c.learningLang.trim()
          ? (c.learningLang.trim().toLowerCase() as LearningLanguageId)
          : topLearningLang;

      const cardObj: ReelCard = {
        id: makeCardId(cards.length),
        type,
        badge: resolvedBadge,
        indexLabel: indexLabelVal || undefined,
        kicker: kickerVal || undefined,
        speaker: rawSpeaker || undefined,
        speakerGender,
        speakerRole,
        title,
        content: content || title,
        sourcePrompt: resolvedSourcePrompt,
        example: exampleVal || undefined,
        phonetic: typeof c.phonetic === 'string' && c.phonetic.trim() ? c.phonetic.trim() : undefined,
        translation: mergedTranslation,
        explanationSpeech: explanationSpeechRaw,
        learningLang: cardLearningLang,
        vocabNotes,
        grammarNote,
        contextExcerpt,
        ttsText,
        ttsAnswerText: rawAnsText,
        thinkSec,
        repeatCount,
        options: optionsArr && optionsArr.length > 0 ? optionsArr : undefined,
        answerIndex,
        explanation,
        cartoonAction:
          typeof c.cartoonAction === 'string' && c.cartoonAction.trim()
            ? c.cartoonAction.trim()
            : undefined,
        cartoonMood:
          typeof c.cartoonMood === 'string' && c.cartoonMood.trim()
            ? (c.cartoonMood.trim() as CartoonExpressionMood)
            : undefined,
        cartoonAnimationSpec:
          c.cartoonAnimationSpec && typeof c.cartoonAnimationSpec === 'object'
            ? (c.cartoonAnimationSpec as Partial<CartoonAnimationParams>)
            : undefined,
        visual: parseCardVisualConfig(c.visual),
      };

      if (cardObj.type === 'quiz') quizSeq += 1;
      const quizParts = getQuizCardSpeechParts(cardObj, quizSeq || 1);
      if (cardObj.type === 'quiz' && cardObj.options?.length) {
        cardObj.ttsText = quizParts.questionSpeech || cardObj.ttsText;
        cardObj.ttsAnswerText = quizParts.answerSpeech || cardObj.ttsAnswerText;
        cardObj.durationSec = Number(
          (
            estimateCardSpeechDuration(quizParts.questionSpeech) +
            quizParts.thinkSec +
            (quizParts.answerSpeech ? estimateCardSpeechDuration(quizParts.answerSpeech) : 0)
          ).toFixed(2),
        );
      } else if (cardObj.type === 'translation') {
        const tThink = cardObj.thinkSec ?? 4;
        const tRepeats = cardObj.repeatCount ?? 2;
        const pDur = estimateCardSpeechDuration(cardObj.sourcePrompt || cardObj.translation || cardObj.title);
        const aDur = estimateCardSpeechDuration(cardObj.ttsText || cardObj.content);
        const nDur = cardObj.explanationSpeech ? estimateCardSpeechDuration(cardObj.explanationSpeech) : 0;
        cardObj.durationSec = Number((pDur + tThink + tRepeats * (aDur + 0.55) + nDur).toFixed(2));
      } else {
        cardObj.durationSec = estimateCardSpeechDuration(ttsText || explanationSpeechRaw || content);
      }

      const prevVariant = cards.length > 0 ? cards[cards.length - 1].visual?.variant : null;
      cardObj.visual = defaultVisualForCard(
        cardObj,
        cards.length,
        rawCards.length,
        options?.targetLang,
        prevVariant,
      );
      cards.push(cardObj);

      if (isMergedQuestionAnswer) {
        idx += 1;
      }
    }

    if (cards.length === 0) return null;

    let sceneJson: FlexibleSceneDocument | null = null;
    if (parsed.sceneJson && typeof parsed.sceneJson === 'object') {
      sceneJson = parseScenePlanJson(JSON.stringify(parsed.sceneJson));
    }
    const parsedCompId =
      typeof parsed.compositionId === 'string' && parsed.compositionId.trim()
        ? (parsed.compositionId.trim() as LayoutCompositionId)
        : sceneJson?.compositionId;
    const parsedCartoonAnimations = Array.isArray(parsed.cartoonAnimations)
      ? (parsed.cartoonAnimations as Partial<CartoonAnimationDefinition>[])
      : sceneJson?.cartoonAnimations;

    const parsedLevel =
      typeof parsed.level === 'string' && parsed.level.trim() ? parsed.level.trim() : undefined;

    return {
      title: String(parsed.title || cards[0]?.title || 'English Reels Project').trim(),
      mode,
      level: parsedLevel,
      creatorSubMode,
      compositionId: parsedCompId,
      learningLang: inferLearningLangFromCards(
        cards,
        typeof parsed.learningLang === 'string' ? parsed.learningLang : undefined,
      ),
      thinkSec: rootThinkSec,
      repeatCount: rootRepeatCount,
      isTranslationMode,
      cards,
      cartoonAnimations: parsedCartoonAnimations,
      sceneJson,
      durationReport: parseDurationReportMeta(parsed.durationReport),
    };
  }

  // Case 2: KineticSub direct ScenePlan JSON pasted here
  const scenePlan = parseScenePlanJson(cleaned);
  if (scenePlan && scenePlan.scenes.length > 0) {
    const cards: ReelCard[] = [];
    for (const sc of scenePlan.scenes) {
      for (const el of sc.elements || []) {
        const elType = ('type' in el && el.type) || ('kind' in el && el.kind) || '';
        const elText = el.text || ('content' in el && el.content) || '';
        if (
          elText &&
          (elType === 'sentence_card' ||
            elType === 'sentence-card' ||
            elType === 'text' ||
            elType === 'topic_pill' ||
            elType === 'pill')
        ) {
          cards.push({
            id: makeCardId(cards.length),
            type: cards.length === 0 ? 'intro' : 'vocab',
            badge: String(elType || 'CARD').toUpperCase(),
            title: elText,
            content: elText,
            translation: el.subtext || undefined,
            ttsText: elText,
            durationSec: estimateCardSpeechDuration(elText),
            cartoonAction: sc.cartoonAction || ('cartoonAction' in el ? el.cartoonAction : undefined),
            cartoonMood: sc.cartoonMood || ('cartoonMood' in el ? el.cartoonMood : undefined),
            cartoonAnimationSpec:
              sc.cartoonAnimationSpec || ('cartoonAnimationSpec' in el ? el.cartoonAnimationSpec : undefined),
          });
        }
      }
    }
    if (cards.length > 0) {
      return {
        title: scenePlan.title || 'KineticSub Imported Lesson',
        mode: 'reading',
        compositionId: scenePlan.compositionId,
        learningLang: inferLearningLangFromCards(cards),
        cards,
        cartoonAnimations: scenePlan.cartoonAnimations,
        sceneJson: scenePlan,
        durationReport: scenePlan.durationReport,
      };
    }
  }

  return null;
}

function resolveVisualPayloadForReelCard(
  card: ReelCard,
  idx: number,
  total: number,
  compositionId?: LayoutCompositionId,
  targetLang?: string,
): { variant: IllustrationVariant; data: IllustrationPropData } {
  const fallback = defaultVisualForCard(card, idx, total, targetLang);
  const custom = card.visual;
  const ctxFallback = resolveContextualVisualForCue(
    `${card.title} ${card.content} ${card.translation || ''}`,
    card.title,
  );

  // Respect explicit card custom visual in default 'story-scenes' or 'custom',
  // but when user explicitly picks another Bố cục KineticSub layout, re-compose visibly!
  let chosenVariant: IllustrationVariant =
    custom?.variant || fallback.variant || ctxFallback.variant || 'bs-card-header';

  if (card.type !== 'quiz' && compositionId && compositionId !== 'story-scenes' && compositionId !== 'custom') {
    if (compositionId === 'flow-steps') chosenVariant = 'flow-diagram';
    else if (compositionId === 'gauge-tone') chosenVariant = 'gauge-arc';
    else if (compositionId === 'checklist-cards') chosenVariant = 'checklist-card';
    else if (compositionId === 'dialogue-upgrade') chosenVariant = 'dialogue-upgrade';
    else if (compositionId === 'timeline-track') chosenVariant = 'timeline-track';
    else if (compositionId === 'spatial-contrast') chosenVariant = 'spatial-boxes';
    else if (compositionId === 'avatar-dialogue') chosenVariant = 'avatar-speech';
    else if (compositionId === 'cartoon-host') chosenVariant = 'cartoon-host';
    else if (compositionId === 'clock-spotlight') chosenVariant = 'clock-face';
    else if (compositionId === 'phrase-icon-split') chosenVariant = 'phrase-icon-split';
    else if (compositionId === 'p168-quiz-formula') chosenVariant = 'p168-step-quiz-formula';
    else if (compositionId === 'p168-grammar-formula') chosenVariant = 'p168-grammar-formula';
    else if (compositionId === 'p168-pronunciation') chosenVariant = 'p168-pronunciation-matrix';
    else if (compositionId === 'p168-situations') chosenVariant = 'p168-situation-cards';
    else if (compositionId === 'p168-slider-compare') chosenVariant = 'p168-slider-compare';
  }

  const baseLabels = custom?.labels || fallback.labels;
  const baseTitle = custom?.title || fallback.title || card.title;
  const baseSubtitle =
    custom?.subtitle ||
    fallback.subtitle ||
    [card.phonetic, card.translation].filter(Boolean).join(' · ') ||
    card.content;

  const data: IllustrationPropData = {
    ...ctxFallback.data,
    title: baseTitle,
    subtitle: baseSubtitle,
    labels: baseLabels,
    value: custom?.value ?? fallback.value,
    formula: custom?.formula || fallback.formula,
    speechText: custom?.speechText || fallback.speechText || card.content,
    reactionText: custom?.reactionText || fallback.reactionText || card.speaker || undefined,
    highlightWord: custom?.highlightWord || fallback.highlightWord || card.title,
    sceneIcon: custom?.sceneIcon || fallback.sceneIcon || ctxFallback.sceneIcon,
    ...(custom?.checklist ? { checklist: custom.checklist } : {}),
    ...(custom?.upgrades ? { upgrades: custom.upgrades } : {}),
    ...(custom?.boxes ? { boxes: custom.boxes } : {}),
    ...(custom?.nodes ? { nodes: custom.nodes } : {}),
    customPrimitives: custom?.customPrimitives,
  };

  // Populate structured sub-fields for composition-specific illustration renderers
  if (chosenVariant === 'flow-diagram' && (!data.nodes || data.nodes.length === 0)) {
    const srcLabels = baseLabels && baseLabels.length >= 2 ? baseLabels : [baseTitle, 'Focus', 'Practice'];
    const cols = ['#2563EB', '#16A34A', '#7C3AED'];
    const icons: Array<'chat' | 'check' | 'star'> = ['chat', 'check', 'star'];
    data.nodes = srcLabels.slice(0, 3).map((lbl, i) => ({
      label: lbl,
      icon: icons[i % icons.length],
      color: cols[i % cols.length],
    }));
    data.value = (idx + 1) / Math.max(1, total);
  } else if (chosenVariant === 'checklist-card' && (!data.checklist || data.checklist.length === 0)) {
    const items =
      baseLabels && baseLabels.length > 0
        ? baseLabels.slice(0, 3).map((lbl) => ({ text: lbl, ok: true }))
        : [{ text: card.title, ok: true }, ...(card.translation ? [{ text: card.translation.split('\n')[0], ok: true }] : [])];
    data.checklist = items;
  } else if (chosenVariant === 'dialogue-upgrade' && (!data.upgrades || data.upgrades.length === 0)) {
    data.upgrades = [
      { prompt: card.title, upgrade: (baseLabels && baseLabels[0]) || 'Key Point', badgeColor: '#2563EB' },
      ...(baseLabels && baseLabels[1] ? [{ prompt: baseSubtitle.slice(0, 28), upgrade: baseLabels[1], badgeColor: '#16A34A' }] : []),
    ];
  } else if (chosenVariant === 'spatial-boxes' && (!data.boxes || data.boxes.length === 0)) {
    const srcLabels = baseLabels && baseLabels.length >= 2 ? baseLabels : [card.badge || card.type.toUpperCase(), card.title];
    const icons: Array<'dot' | 'surface' | 'cube'> = ['dot', 'surface', 'cube'];
    const accents = ['#2563EB', '#16A34A', '#7C3AED'];
    data.boxes = srcLabels.slice(0, 3).map((lbl, i) => ({
      title: lbl,
      subtitle: i === 0 ? card.badge : undefined,
      icon: icons[i % icons.length],
      accent: accents[i % accents.length],
    }));
  } else if (chosenVariant === 'phrase-icon-split' && (!data.nodes || data.nodes.length === 0)) {
    const words = card.content.split(/\s+/).filter(Boolean);
    const splitIdx = Math.max(1, words.length - 1);
    data.speechText = words.slice(0, splitIdx).join(' ');
    data.highlightWord = custom?.highlightWord || words[splitIdx] || card.title;
    data.nodes = (baseLabels && baseLabels.length > 0 ? baseLabels : [card.badge || card.title, 'Natural Use']).slice(0, 3).map((lbl, i) => ({
      label: lbl,
      color: i === 0 ? '#64748B' : '#4F46E5',
    }));
  } else if (chosenVariant === 'contrast-pair-cards' && (!data.nodes || data.nodes.length < 2)) {
    const vsSplit = (baseTitle || card.title).split(/\s+(?:vs\.?|→|->|\/)\s+/i).filter(Boolean);
    const leftLbl = (baseLabels && baseLabels[0]) || vsSplit[0] || 'Basic';
    const rightLbl = (baseLabels && baseLabels[1]) || vsSplit[1] || card.title;
    data.labels = [leftLbl, rightLbl];
    data.nodes = [
      { label: leftLbl, sublabel: 'Standard', color: '#64748B' },
      { label: rightLbl, sublabel: 'Smart Upgrade', color: '#2563EB' },
    ];
  } else if (chosenVariant === 'trio-icon-cards' && (!data.nodes || data.nodes.length < 2)) {
    const srcLabels =
      baseLabels && baseLabels.length >= 2
        ? baseLabels.slice(0, 3)
        : [card.title, card.indexLabel || 'Meaning', 'Example'];
    const cols = ['#2563EB', '#059669', '#D97706'];
    const icons: IllustrationSceneIcon[] = ['book', 'sparkles', 'mic'];
    data.nodes = srcLabels.map((lbl, i) => ({
      label: lbl,
      sublabel: i === 0 ? 'Focus' : i === 1 ? 'Nuance' : 'Speak',
      color: cols[i % cols.length],
      sceneIcon: icons[i % icons.length],
    }));
  } else if (chosenVariant === 'p168-step-quiz-formula') {
    data.title = data.title || `Question ${idx + 1}`;
    data.speechText = custom?.speechText || card.content;
    data.labels = baseLabels && baseLabels.length >= 2 ? baseLabels : [card.title, 'Key Form'];
    data.formula = data.formula || `${data.labels[0]}  /  ${data.labels[1] || 'Option B'}`;
  } else if (chosenVariant === 'p168-grammar-formula') {
    data.formula = data.formula || `${card.title} + Pattern`;
    data.speechText = custom?.speechText || card.example || card.content;
    data.labels = baseLabels && baseLabels.length >= 2 ? baseLabels : [card.title, 'Core Structure', 'Natural Example'];
  } else if (chosenVariant === 'p168-pronunciation-matrix' && (!data.nodes || data.nodes.length < 2)) {
    const src = baseLabels && baseLabels.length >= 2 ? baseLabels : ['/t/', '/d/', '/ɪd/'];
    const cols = ['#0EA5E9', '#10B981', '#8B5CF6'];
    data.nodes = src.slice(0, 3).map((lbl, i) => ({
      label: lbl,
      sublabel: i === 0 ? 'Clear' : i === 1 ? 'Voiced' : 'Syllable',
      color: cols[i % cols.length],
    }));
  } else if (chosenVariant === 'p168-situation-cards' && (!data.nodes || data.nodes.length < 2)) {
    const src = baseLabels && baseLabels.length >= 2 ? baseLabels : ['With Friends', 'At Work', 'Softly'];
    const cols = ['#2563EB', '#059669', '#D97706'];
    const icons: IllustrationSceneIcon[] = ['chat', 'briefcase', 'handshake'];
    data.nodes = src.slice(0, 3).map((lbl, i) => ({
      label: lbl,
      sublabel: i === 0 ? 'Casual' : i === 1 ? 'Polite' : 'Gentle',
      color: cols[i % cols.length],
      sceneIcon: icons[i % icons.length],
    }));
  } else if (chosenVariant === 'p168-slider-compare') {
    const vsSplit = (baseTitle || card.title).split(/\s+(?:vs\.?|→|->|\/)\s+/i).filter(Boolean);
    const leftLbl = (baseLabels && baseLabels[0]) || vsSplit[0] || 'Standard';
    const rightLbl = (baseLabels && baseLabels[1]) || vsSplit[1] || card.title;
    data.labels = [leftLbl, rightLbl];
    data.value = typeof data.value === 'number' ? data.value : (idx + 1) / Math.max(1, total);
  } else if (chosenVariant === 'p168-story-dialogue' && (!data.nodes || data.nodes.length < 2)) {
    data.nodes = [
      { label: card.title, color: '#4F46E5' },
      { label: card.translation || 'Natural Context', color: '#059669' },
    ];
  }

  return { variant: chosenVariant, data };
}

export function reelCardsToLessonProject(
  cards: ReelCard[],
  options?: {
    title?: string;
    subtitle?: string;
    theme?: CanvasThemeId;
    compositionId?: LayoutCompositionId;
    aspectRatio?: ExportAspectRatioId;
    targetLang?: string;
    backgroundImage?: BackgroundImageConfig;
    subtitleConfig?: SubtitleDisplayConfig;
    cardDurationsSec?: number[];
    cardTimings?: ReelCardTimingMeta[];
    audioFileName?: string;
    sceneJsonOverride?: FlexibleSceneDocument | null;
    watermark?: WatermarkOutroConfig;
    titleLayout?: TitleOverlayLayout;
    enableLearningAudio?: boolean;
    enableExplanationAudio?: boolean;
  },
): LessonProject {
  const safeCards =
    cards.length > 0 ? cards : buildReelCardsRuleBased('Practice English daily.').cards;
  const cues: TranscriptCue[] = [];
  const allowLearningAudio = options?.enableLearningAudio !== false;
  const allowExplanationAudio = options?.enableExplanationAudio !== false;
  const cardWindows: Array<{
    start: number;
    end: number;
    questionEnd: number;
    thinkStart: number;
    thinkEnd: number;
    answerStart: number;
    thinkSec: number;
    questionCue: TranscriptCue;
    answerCue?: TranscriptCue;
    repeatCount?: number;
    repeatSlots?: Array<{ start: number; end: number; cue: TranscriptCue }>;
    nuanceSlot?: { start: number; end: number; cue: TranscriptCue };
  }> = [];

  let cursor = 0;
  let quizOrderCounter = 0;

  safeCards.forEach((card, idx) => {
    const start = Number(cursor.toFixed(3));
    const timingOverride = options?.cardTimings?.[idx];
    const durOverride = options?.cardDurationsSec?.[idx];

    if (card.type === 'translation') {
      const promptText =
        sanitizeTtsSpeech(card.sourcePrompt || card.translation || card.title) || 'Hãy dịch câu sau.';
      const answerText =
        sanitizeTtsSpeech(card.ttsText || card.content || card.title) || 'Practice speaking aloud.';
      const nuanceText =
        allowExplanationAudio &&
        card.explanationSpeech &&
        card.explanationSpeech.trim().toLowerCase() !== promptText.toLowerCase()
          ? sanitizeTtsSpeech(card.explanationSpeech)
          : '';
      const thinkSec = timingOverride?.thinkSec ?? Math.max(0, Math.min(15, card.thinkSec ?? 4));
      const explicitRepeatCount = timingOverride?.repeatDurationsSec
        ? timingOverride.repeatDurationsSec.length
        : allowLearningAudio
          ? Math.max(1, Math.min(5, card.repeatCount ?? 2))
          : 0;
      const repeatCount = Math.max(0, Math.min(5, explicitRepeatCount));
      const repeatPause = timingOverride?.repeatPauseSec ?? 0.55;

      const pDur =
        timingOverride?.questionSec ??
        (allowExplanationAudio ? estimateCardSpeechDuration(promptText) : 0);
      const defaultRepDur = estimateCardSpeechDuration(answerText);
      const repDurs = Array.from({ length: repeatCount }, (_, r) =>
        timingOverride?.repeatDurationsSec?.[r] ?? defaultRepDur,
      );
      const nuanceDur =
        timingOverride?.nuanceSec ?? (nuanceText ? estimateCardSpeechDuration(nuanceText) : 0);

      const questionEnd = Number((start + pDur).toFixed(3));
      const thinkStart = questionEnd;
      const thinkEnd = Number((thinkStart + thinkSec).toFixed(3));
      const answerStart = thinkEnd;

      const questionCue: TranscriptCue = {
        id: `${card.id || `reel-tr-${idx + 1}`}-q`,
        start,
        end: questionEnd,
        text: promptText,
        words: interpolateWordTimings(promptText, start, questionEnd),
      };
      cues.push(questionCue);

      let repCursor = answerStart;
      const repeatSlots: Array<{ start: number; end: number; cue: TranscriptCue }> = [];
      for (let r = 0; r < repeatCount; r++) {
        const rStart = Number(repCursor.toFixed(3));
        const rEnd = Number((rStart + repDurs[r]).toFixed(3));
        const rCue: TranscriptCue = {
          id: `${card.id || `reel-tr-${idx + 1}`}-r${r}`,
          start: rStart,
          end: rEnd,
          text: answerText,
          words: interpolateWordTimings(answerText, rStart, rEnd),
        };
        cues.push(rCue);
        repeatSlots.push({ start: rStart, end: rEnd, cue: rCue });
        repCursor = rEnd + (r < repeatCount - 1 ? repeatPause : nuanceDur > 0.05 ? 0.25 : 0);
      }

      let nuanceSlot: { start: number; end: number; cue: TranscriptCue } | undefined;
      if (nuanceText && nuanceDur > 0.05) {
        const nStart = Number(repCursor.toFixed(3));
        const nEnd = Number((nStart + nuanceDur).toFixed(3));
        const nCue: TranscriptCue = {
          id: `${card.id || `reel-tr-${idx + 1}`}-n`,
          start: nStart,
          end: nEnd,
          text: nuanceText,
          words: interpolateWordTimings(nuanceText, nStart, nEnd),
        };
        cues.push(nCue);
        nuanceSlot = { start: nStart, end: nEnd, cue: nCue };
        repCursor = nEnd;
      }

      const end = Number(Math.max(answerStart + (repeatCount > 0 ? 0.6 : 1.5), repCursor).toFixed(3));
      cardWindows.push({
        start,
        end,
        questionEnd,
        thinkStart,
        thinkEnd,
        answerStart,
        thinkSec,
        questionCue,
        answerCue: repeatSlots[0]?.cue,
        repeatCount,
        repeatSlots,
        nuanceSlot,
      });
      cursor = end + 0.08;
    } else if (card.type === 'quiz' && card.options && card.options.length > 0) {
      quizOrderCounter += 1;
      const { questionSpeech, answerSpeech, thinkSec: baseThink } = getQuizCardSpeechParts(
        card,
        quizOrderCounter,
      );
      const qSpeech = questionSpeech || sanitizeTtsSpeech(card.content || card.title) || 'Quiz question.';
      const thinkSec = timingOverride?.thinkSec ?? baseThink;

      let qDur =
        timingOverride?.questionSec ??
        (allowLearningAudio ? estimateCardSpeechDuration(qSpeech) : 0);
      let aDur =
        timingOverride?.answerSec ??
        (allowLearningAudio
          ? answerSpeech
            ? estimateCardSpeechDuration(answerSpeech)
            : 2.6
          : 2.4);

      if (!timingOverride && typeof durOverride === 'number' && Number.isFinite(durOverride) && durOverride > 1) {
        // Scale question/answer around exact thinkSec if single total duration supplied
        const remaining = Math.max(2.2, durOverride - Math.min(thinkSec, Math.max(0, durOverride - 2.2)));
        const qShare = qDur / Math.max(0.5, qDur + aDur);
        qDur = Number((remaining * qShare).toFixed(3));
        aDur = Number((remaining - qDur).toFixed(3));
      }

      const questionEnd = Number((start + qDur).toFixed(3));
      const thinkStart = questionEnd;
      const thinkEnd = Number((thinkStart + thinkSec).toFixed(3));
      const answerStart = thinkEnd;
      const end = Number((answerStart + aDur).toFixed(3));

      const questionCue: TranscriptCue = {
        id: `${card.id || `reel-cue-${idx + 1}`}-q`,
        start,
        end: questionEnd,
        text: qSpeech,
        words: interpolateWordTimings(qSpeech, start, questionEnd),
      };
      cues.push(questionCue);

      let answerCue: TranscriptCue | undefined;
      if (answerSpeech) {
        answerCue = {
          id: `${card.id || `reel-cue-${idx + 1}`}-a`,
          start: answerStart,
          end,
          text: answerSpeech,
          words: interpolateWordTimings(answerSpeech, answerStart, end),
        };
        cues.push(answerCue);
      }

      cardWindows.push({
        start,
        end,
        questionEnd,
        thinkStart,
        thinkEnd,
        answerStart,
        thinkSec,
        questionCue,
        answerCue,
      });
      cursor = end + 0.08;
    } else {
      const isNativeOnlyIntroOutro =
        (card.type === 'intro' || card.type === 'transition' || card.type === 'outro') &&
        allowExplanationAudio &&
        !card.ttsText &&
        Boolean(card.explanationSpeech);
      const speech = (
        (isNativeOnlyIntroOutro
          ? card.explanationSpeech || card.ttsText || card.content || card.title
          : card.ttsText || card.content || card.title) || 'Next'
      ).trim();
      const dur =
        timingOverride?.totalSec ??
        (typeof durOverride === 'number' && Number.isFinite(durOverride) && durOverride > 0.25
          ? durOverride
          : card.durationSec && card.durationSec > 0.5
            ? card.durationSec
            : estimateCardSpeechDuration(speech));

      const end = Number((start + dur).toFixed(3));
      const cue: TranscriptCue = {
        id: card.id || `reel-cue-${idx + 1}`,
        start,
        end,
        text: speech,
        words: interpolateWordTimings(speech, start, end),
      };
      cues.push(cue);
      cardWindows.push({
        start,
        end,
        questionEnd: end,
        thinkStart: end,
        thinkEnd: end,
        answerStart: end,
        thinkSec: 0,
        questionCue: cue,
      });
      cursor = end + 0.08;
    }
  });

  const baseTotalDuration = Number(Math.max(3, cursor).toFixed(2));
  const hasActiveOutro = Boolean(
    options?.watermark &&
      options.watermark.outroSeconds > 0 &&
      (options.watermark.outroLine1.trim() || options.watermark.outroLine2.trim()),
  );
  const outroExtraSec = hasActiveOutro ? Math.max(0, Number(options?.watermark?.outroSeconds || 0)) : 0;
  const totalDuration = Number((baseTotalDuration + outroExtraSec).toFixed(2));
  const theme: CanvasThemeId = options?.theme ?? 'pastel-sunrise';
  const isDark = isDarkCanvasTheme(theme);

  const primaryLearningLang =
    (safeCards.find((c) => c.learningLang)?.learningLang as LearningLanguageId) || 'en';
  const locale = getReelLocaleStrings(options?.targetLang, primaryLearningLang);

  if (options?.sceneJsonOverride && (!options.compositionId || options.compositionId === options.sceneJsonOverride.compositionId)) {
    const words = cues.flatMap((c) => c.words);
    const built = scenePlanToProject(words, options.sceneJsonOverride, {
      title: options.title || options.sceneJsonOverride.title || 'English Reels Studio',
      theme,
      compositionId: options.compositionId ?? options.sceneJsonOverride.compositionId,
      audioFileName: options.audioFileName,
      cuesOverride: cues,
    });
    return {
      ...built,
      duration: Number((built.duration + outroExtraSec).toFixed(2)),
      backgroundImage: options?.backgroundImage,
      watermark: options?.watermark,
    };
  }

  const compId = options?.compositionId || 'story-scenes';
  const defaultTrLocale = getTranslationTargetLocale(
    (safeCards.find((c) => c.learningLang)?.learningLang as LearningLanguageId) || 'en',
  );
  const resolvedSubtitleConfig: SubtitleDisplayConfig = {
    position: options?.subtitleConfig?.position || (compId === 'plain' ? 'center' : 'bottom'),
    size: options?.subtitleConfig?.size || (compId === 'plain' ? 'lg' : 'md'),
    boxStyle:
      options?.subtitleConfig?.boxStyle ||
      (compId === 'plain' ? 'clean' : 'card'),
  };
  const karaokeCenterY =
    resolvedSubtitleConfig.position === 'top'
      ? 260
      : resolvedSubtitleConfig.position === 'center'
        ? 960
        : 1585;
  const karaokeVariantForConfig: 'white-card' | 'dark-bar' | 'plain-shadow' =
    resolvedSubtitleConfig.boxStyle === 'clean' || compId === 'plain'
      ? resolvedSubtitleConfig.boxStyle === 'clean'
        ? 'plain-shadow'
        : isDark
          ? 'dark-bar'
          : 'white-card'
      : isDark
        ? 'dark-bar'
        : 'white-card';

  const hasQuiz = safeCards.some((c) => c.type === 'quiz');
  const hasTranslation = safeCards.some((c) => c.type === 'translation');
  const stageSteps: string[] = hasTranslation
    ? defaultTrLocale.stageSteps
    : hasQuiz
      ? locale.stageStepsQuiz
      : locale.stageStepsSimple;

  const compLayoutProfile: Record<
    string,
    {
      showStrip: boolean;
      stripY: number;
      pillY: number;
      illY: number;
      cardY: number;
      pillBg?: string;
      pillColor?: string;
      cardBg?: string;
      cardText?: string;
      emphasisColor?: string;
    }
  > = {
    'story-scenes': { showStrip: true, stripY: 170, pillY: 295, illY: 545, cardY: 975 },
    'flow-steps': {
      showStrip: true,
      stripY: 170,
      pillY: 295,
      illY: 545,
      cardY: 975,
      pillBg: '#E0E7FF',
      pillColor: '#3730A3',
      cardBg: '#EEF2FF',
      cardText: '#1E1B4B',
      emphasisColor: '#4F46E5',
    },
    'gauge-tone': {
      showStrip: false,
      stripY: 170,
      pillY: 205,
      illY: 500,
      cardY: 955,
      pillBg: '#DCFCE7',
      pillColor: '#065F46',
      emphasisColor: '#059669',
    },
    'checklist-cards': {
      showStrip: false,
      stripY: 170,
      pillY: 205,
      illY: 515,
      cardY: 975,
      pillBg: '#F3E8FF',
      pillColor: '#6B21A8',
      emphasisColor: '#7C3AED',
    },
    'dialogue-upgrade': {
      showStrip: false,
      stripY: 170,
      pillY: 205,
      illY: 525,
      cardY: 985,
      pillBg: '#FEF3C7',
      pillColor: '#92400E',
      cardBg: '#FFFBEB',
      cardText: '#451A03',
      emphasisColor: '#D97706',
    },
    'timeline-track': {
      showStrip: true,
      stripY: 170,
      pillY: 295,
      illY: 545,
      cardY: 975,
      pillBg: '#CCFBF1',
      pillColor: '#0F766E',
      cardBg: '#F0FDFA',
      cardText: '#134E4A',
      emphasisColor: '#0D9488',
    },
    'spatial-contrast': {
      showStrip: true,
      stripY: 170,
      pillY: 295,
      illY: 545,
      cardY: 975,
      pillBg: '#1E293B',
      pillColor: '#F8FAFC',
      cardBg: '#FEFCE8',
      cardText: '#1C1917',
      emphasisColor: '#CA8A04',
    },
    'avatar-dialogue': {
      showStrip: false,
      stripY: 170,
      pillY: 205,
      illY: 520,
      cardY: 975,
      pillBg: '#FFE4E6',
      pillColor: '#BE123C',
      cardBg: '#FFF1F2',
      cardText: '#1F2937',
      emphasisColor: '#E11D48',
    },
    'clock-spotlight': {
      showStrip: false,
      stripY: 170,
      pillY: 205,
      illY: 520,
      cardY: 975,
      pillBg: '#FDE68A',
      pillColor: '#78350F',
      cardBg: '#FFFBEB',
      cardText: '#1C1917',
      emphasisColor: '#B45309',
    },
    'phrase-icon-split': {
      showStrip: true,
      stripY: 170,
      pillY: 295,
      illY: 585,
      cardY: 1020,
    },
    'cartoon-host': {
      showStrip: true,
      stripY: 185,
      pillY: 278,
      illY: 1055,
      cardY: 465,
      pillBg: '#FEF08A',
      pillColor: '#713F12',
      cardBg: '#FFFFFF',
      cardText: '#0F172A',
      emphasisColor: '#2563EB',
    },
    'podcast-duo': {
      showStrip: false,
      stripY: 170,
      pillY: 210,
      illY: 515,
      cardY: 1015,
      pillBg: '#312E81',
      pillColor: '#E0E7FF',
      cardBg: '#1E293B',
      cardText: '#F8FAFC',
      emphasisColor: '#FACC15',
    },
    'dialogue-stage': {
      showStrip: false,
      stripY: 170,
      pillY: 210,
      illY: 530,
      cardY: 1020,
      pillBg: '#DBEAFE',
      pillColor: '#1E40AF',
      cardBg: '#FFFFFF',
      cardText: '#0F172A',
      emphasisColor: '#2563EB',
    },
    'full-study-cards': {
      showStrip: false,
      stripY: 170,
      pillY: 195,
      illY: 520,
      cardY: 875,
      pillBg: '#E0E7FF',
      pillColor: '#3730A3',
      cardBg: '#FFFFFF',
      cardText: '#0F172A',
      emphasisColor: '#4F46E5',
    },
  };
  const activeProfile = compLayoutProfile[compId] ?? compLayoutProfile['story-scenes'];

  const elements: LessonProject['elements'] = [];

  if (compId === 'cartoon-host') {
    const cardActionSegments: CartoonActionSegment[] = safeCards.map((card, idx) => {
      const win = cardWindows[idx];
      const badgeTxt = `${card.badge || ''} ${card.title || ''}`.toLowerCase();
      const inferredAction =
        card.cartoonAction ||
        (card.type === 'intro'
          ? 'wave-hello'
          : card.type === 'outro'
            ? 'clap-jump'
            : card.type === 'quiz'
              ? 'thinking-chin'
              : /\b(avoid|wrong|don't|mistake|rude)\b|tránh|sai|cảnh báo/i.test(badgeTxt)
                ? 'warn-avoid'
                : /\b(tip|idea|note|secret|mẹo)\b/i.test(badgeTxt)
                  ? 'approve-tip'
                  : 'point-up');
      const badgeHint: 'check' | 'cross' | 'question' | 'tip' | null =
        /\b(avoid|wrong|don't|mistake|rude)\b|ng|✖|✗|tránh|sai|cảnh báo/i.test(badgeTxt)
          ? 'cross'
          : card.type === 'quiz'
            ? 'question'
            : /\b(tip|idea|note|secret|mẹo)\b/i.test(badgeTxt)
              ? 'tip'
              : /\b(right|correct|natural|answer|native|✔|✓)\b/i.test(badgeTxt)
                ? 'check'
                : null;
      const guarded = resolveCartoonAnimationForSignal({
        spokenText: `${card.title || ''} ${card.content || ''} ${card.translation || ''}`,
        activeBadge: badgeHint,
        actionId: inferredAction,
        explicitMood: card.cartoonMood,
        inlineSpec: card.cartoonAnimationSpec,
      });
      return {
        startTime: Number(win.start.toFixed(3)),
        endTime: Number(win.end.toFixed(3)),
        actionId: guarded.matchedDef?.id || card.cartoonAction || inferredAction,
        mood: guarded.params.mood,
        spec: guarded.params,
      };
    });

    elements.push({
      id: 'reel-cartoon-host-main',
      type: 'illustration-prop',
      label: 'Nhân vật Hoạt Hình Lip-Sync (@Gimmys)',
      startTime: 0,
      endTime: totalDuration,
      enterAnimation: 'none',
      exitAnimation: 'none',
      layout: {
        x: 540,
        y: resolvedSubtitleConfig.position === 'top' ? 1140 : hasQuiz ? 1105 : 1085,
        width: 820,
        scale: hasQuiz ? 0.88 : 0.92,
        zIndex: 12,
      },
      props: {
        kind: 'illustration-prop',
        variant: 'cartoon-host',
        data: {
          title: options?.title || safeCards[0]?.title || 'Language Lesson',
          speechText: safeCards[0]?.content || '',
          cartoonAction: cardActionSegments[0]?.actionId,
          cartoonMood: cardActionSegments[0]?.mood,
          cartoonAnimationSpec: cardActionSegments[0]?.spec,
          cartoonActionSegments: cardActionSegments,
        },
      },
    });
  }

  safeCards.forEach((card, idx) => {
    const win = cardWindows[idx];
    const { start, end } = win;
    const visualSpec = resolveVisualPayloadForReelCard(
      card,
      idx,
      safeCards.length,
      options?.compositionId,
      options?.targetLang,
    );

    const activeStepIdx =
      card.type === 'intro'
        ? 0
        : card.type === 'outro'
          ? stageSteps.length - 1
          : card.type === 'translation'
            ? 1
            : card.type === 'quiz' && hasQuiz
              ? 2
              : 1;
    const isCartoonHost = compId === 'cartoon-host';
    const cardEnterAnim = isCartoonHost ? ('fade-scale' as const) : ('pop-up' as const);
    const stripEnd =
      isCartoonHost && idx < cardWindows.length - 1
        ? cardWindows[idx + 1].start
        : end;
    const stripEnterAnim = isCartoonHost && idx > 0 ? ('none' as const) : ('fade-scale' as const);
    const stripExitAnim =
      isCartoonHost && idx < cardWindows.length - 1 ? ('none' as const) : ('fade-out' as const);

    // ── PLAIN COMPOSITION (NO CARDS/ILLUSTRATIONS — PURE BACKGROUND + SUBTITLES) ──
    if (compId === 'plain') {
      const plainHelperBase = [card.vocabNotes, card.grammarNote, card.translation]
        .filter(Boolean)
        .join(' · ')
        .slice(0, 140);

      if (card.type === 'translation') {
        const sourcePromptText = card.sourcePrompt || card.translation || card.title;
        const trLocale = getTranslationTargetLocale(card.learningLang || 'en');
        const preRevealEnd = Math.max(start + 0.1, win.answerStart);
        elements.push({
          id: `reel-plain-tr-q-${idx}`,
          type: 'karaoke-card',
          label: `Sub Gốc #${idx + 1}`,
          startTime: start,
          endTime: preRevealEnd,
          enterAnimation: 'fade-scale',
          exitAnimation: 'fade-out',
          layout: { x: 540, y: karaokeCenterY, width: 920, scale: 1, zIndex: 35 },
          props: {
            kind: 'karaoke-card',
            cueId: win.questionCue.id,
            words: win.questionCue.words,
            variant: karaokeVariantForConfig,
            activeColor: '#FACC15',
            inactiveColor: 'rgba(226, 232, 240, 0.84)',
            spokenColor: '#FFFFFF',
            helperText: `${card.indexLabel || trLocale.cardBadge(idx + 1)} · ${trLocale.askTitle} (${Math.max(1, Math.round(win.thinkSec))}s)`,
          },
        });
        const repSlots = win.repeatSlots || [];
        const answerHelper =
          [card.vocabNotes, card.grammarNote, trLocale.sourceLabel(sourcePromptText)]
            .filter(Boolean)
            .join(' · ')
            .slice(0, 150) || trLocale.defaultTip(win.repeatCount || 2);
        repSlots.forEach((slot, rIdx) => {
          const slotEnd =
            rIdx < repSlots.length - 1
              ? repSlots[rIdx + 1].start
              : win.nuanceSlot
                ? win.nuanceSlot.start
                : end;
          elements.push({
            id: `reel-plain-tr-r-${idx}-${rIdx}`,
            type: 'karaoke-card',
            label: `Sub Lặp ${rIdx + 1} #${idx + 1}`,
            startTime: slot.start,
            endTime: slotEnd,
            enterAnimation: 'pop-up',
            exitAnimation: 'fade-out',
            layout: { x: 540, y: karaokeCenterY, width: 920, scale: 1, zIndex: 36 },
            props: {
              kind: 'karaoke-card',
              cueId: slot.cue.id,
              words: slot.cue.words,
              variant: karaokeVariantForConfig,
              activeColor: '#4ADE80',
              inactiveColor: 'rgba(226, 232, 240, 0.86)',
              spokenColor: '#FFFFFF',
              helperText: answerHelper,
            },
          });
        });
        if (win.nuanceSlot && end - win.nuanceSlot.start > 0.1) {
          elements.push({
            id: `reel-plain-tr-tip-${idx}`,
            type: 'karaoke-card',
            label: `Sub Mẹo #${idx + 1}`,
            startTime: win.nuanceSlot.start,
            endTime: end,
            enterAnimation: 'fade-scale',
            exitAnimation: 'fade-out',
            layout: { x: 540, y: karaokeCenterY, width: 920, scale: 1, zIndex: 37 },
            props: {
              kind: 'karaoke-card',
              cueId: win.nuanceSlot.cue.id,
              words: win.nuanceSlot.cue.words,
              variant: karaokeVariantForConfig,
              activeColor: '#93C5FD',
              inactiveColor: 'rgba(226, 232, 240, 0.84)',
              spokenColor: '#FFFFFF',
              helperText: `${card.content}${card.vocabNotes ? ` · ${card.vocabNotes}` : ''}`,
            },
          });
        }
        return;
      }

      if (card.type === 'quiz' && card.options && card.options.length > 0) {
        const preRevealEnd = Math.max(win.thinkEnd, win.questionEnd);
        elements.push({
          id: `reel-plain-q-${idx}`,
          type: 'karaoke-card',
          label: `Sub Quiz #${idx + 1}`,
          startTime: start,
          endTime: preRevealEnd,
          enterAnimation: 'fade-scale',
          exitAnimation: 'fade-out',
          layout: { x: 540, y: karaokeCenterY, width: 920, scale: 1, zIndex: 35 },
          props: {
            kind: 'karaoke-card',
            cueId: win.questionCue.id,
            words: win.questionCue.words,
            variant: karaokeVariantForConfig,
            activeColor: '#FACC15',
            inactiveColor: 'rgba(226, 232, 240, 0.84)',
            spokenColor: '#FFFFFF',
            helperText: plainHelperBase || undefined,
          },
        });
        if (win.answerCue && end - win.answerStart > 0.1) {
          elements.push({
            id: `reel-plain-a-${idx}`,
            type: 'karaoke-card',
            label: `Sub Quiz Ans #${idx + 1}`,
            startTime: win.answerStart,
            endTime: end,
            enterAnimation: 'pop-up',
            exitAnimation: 'fade-out',
            layout: { x: 540, y: karaokeCenterY, width: 920, scale: 1, zIndex: 36 },
            props: {
              kind: 'karaoke-card',
              cueId: win.answerCue.id,
              words: win.answerCue.words,
              variant: karaokeVariantForConfig,
              activeColor: '#4ADE80',
              inactiveColor: 'rgba(226, 232, 240, 0.86)',
              spokenColor: '#FFFFFF',
              helperText: card.explanation || plainHelperBase || undefined,
            },
          });
        }
        return;
      }

      elements.push({
        id: `reel-plain-k-${idx}`,
        type: 'karaoke-card',
        label: `Sub #${idx + 1}`,
        startTime: start,
        endTime: end,
        enterAnimation: 'fade-scale',
        exitAnimation: 'fade-out',
        layout: { x: 540, y: karaokeCenterY, width: 920, scale: 1, zIndex: 35 },
        props: {
          kind: 'karaoke-card',
          cueId: win.questionCue.id,
          words: win.questionCue.words,
          variant: karaokeVariantForConfig,
          activeColor: '#FACC15',
          inactiveColor: 'rgba(226, 232, 240, 0.84)',
          spokenColor: '#FFFFFF',
          helperText: plainHelperBase || undefined,
        },
      });
      return;
    }

    // ── TRANSLATION CHALLENGE CARD (PROMPT → THINK COUNTDOWN → REVEAL & REPEAT N×) ──
    if (card.type === 'translation') {
      const sourcePromptText = card.sourcePrompt || card.translation || card.title;
      const trLocale = getTranslationTargetLocale(card.learningLang || 'en');
      const totalRepeats = win.repeatCount || Math.max(1, card.repeatCount ?? 2);

      // Top Roadmap Strip (forced onto 1 crisp horizontal line)
      if (activeProfile.showStrip) {
        elements.push({
          id: `reel-stage-${idx}`,
          type: 'comparison-strip',
          label: `${locale.roadmapLabel} #${idx + 1}`,
          startTime: start,
          endTime: stripEnd,
          enterAnimation: stripEnterAnim,
          exitAnimation: stripExitAnim,
          layout: { x: 540, y: activeProfile.stripY, width: 960, scale: 1, zIndex: 12 },
          props: {
            kind: 'comparison-strip',
            singleRow: true,
            items: trLocale.stageSteps.map((sLbl, sIdx) => ({
              label: sLbl,
              activateAt:
                sIdx === 0
                  ? start
                  : sIdx === 1
                    ? win.thinkStart
                    : sIdx === 2
                      ? win.answerStart
                      : end + 9,
              accentColor: sIdx === 2 ? '#16A34A' : '#D97706',
            })),
          },
        });
      }

      // Phase 1 Pill: Listening to source prompt
      if (win.questionEnd - start > 0.1) {
        elements.push({
          id: `reel-tr-pill-ask-${idx}`,
          type: 'topic-pill',
          label: `Prompt #${idx + 1}`,
          startTime: start,
          endTime: win.questionEnd,
          enterAnimation: cardEnterAnim,
          exitAnimation: 'fade-out',
          layout: { x: 540, y: activeProfile.pillY, width: 700, scale: 1, zIndex: 16 },
          props: {
            kind: 'topic-pill',
            text: trLocale.askPill(card.indexLabel || card.badge || `#${idx}`),
            bgColor: '#FEF3C7',
            textColor: '#92400E',
          },
        });

        if (compId !== 'cartoon-host') {
          elements.push({
            id: `reel-tr-ask-prop-${idx}`,
            type: 'illustration-prop',
            label: `Prompt Visual #${idx + 1}`,
            startTime: start,
            endTime: win.questionEnd,
            enterAnimation: 'fade-scale',
            exitAnimation: 'fade-out',
            layout: { x: 540, y: 505, width: 840, scale: 0.92, zIndex: 9 },
            props: {
              kind: 'illustration-prop',
              variant: 'bs-card-header',
              data: {
                formula: card.indexLabel || `#${idx}`,
                title: trLocale.askTitle,
                subtitle: trLocale.askSub(Math.max(1, Math.round(win.thinkSec))),
                sceneIcon: 'mic',
              },
            },
          });
        }
      }

      // Phase 2 Countdown Pills + Progress Meter (during thinkSec)
      if (win.thinkSec >= 1) {
        const wholeSecs = Math.max(1, Math.round(win.thinkSec));
        const sliceDur = (win.thinkEnd - win.thinkStart) / wholeSecs;
        for (let s = 0; s < wholeSecs; s++) {
          const remain = wholeSecs - s;
          const t0 = Number((win.thinkStart + s * sliceDur).toFixed(3));
          const t1 = Number((win.thinkStart + (s + 1) * sliceDur).toFixed(3));
          if (t1 - t0 <= 0.08) continue;

          elements.push({
            id: `reel-tr-countdown-pill-${idx}-${s}`,
            type: 'topic-pill',
            label: `${remain}s`,
            startTime: t0,
            endTime: t1,
            enterAnimation: isCartoonHost ? 'none' : 'pop-up',
            exitAnimation: isCartoonHost ? 'none' : 'fade-out',
            layout: { x: 540, y: activeProfile.pillY, width: 680, scale: 1, zIndex: 18 },
            props: {
              kind: 'topic-pill',
              text: trLocale.countdownPill(remain),
              bgColor: remain <= 2 ? '#FEE2E2' : '#FEF3C7',
              textColor: remain <= 2 ? '#B91C1C' : '#B45309',
            },
          });

          elements.push({
            id: `reel-tr-q-countdown-meter-${idx}-${s}`,
            type: 'illustration-prop',
            label: `Timer ${remain}s`,
            startTime: t0,
            endTime: t1,
            enterAnimation: isCartoonHost ? 'none' : 'fade-scale',
            exitAnimation: isCartoonHost ? 'none' : 'fade-out',
            layout: {
              x: 540,
              y: compId === 'cartoon-host' ? 660 : 505,
              width: compId === 'cartoon-host' ? 780 : 840,
              scale: compId === 'cartoon-host' ? 0.68 : 0.9,
              zIndex: 10,
            },
            props: {
              kind: 'illustration-prop',
              variant: 'bs-progress-meter',
              data: {
                title: trLocale.meterTitle(remain),
                subtitle: trLocale.meterSub,
                value: Number(((s + 1) / wholeSecs).toFixed(2)),
                sceneIcon: 'clock',
              },
            },
          });
        }
      }

      // Source Prompt Sentence Card (Phases 1 + 2 — translation HIDDEN!)
      const preRevealEnd = Math.max(start + 0.1, win.answerStart);
      elements.push({
        id: `reel-tr-prompt-card-${idx}`,
        type: 'sentence-card',
        label: `Prompt #${idx + 1}`,
        startTime: start,
        endTime: preRevealEnd,
        enterAnimation: cardEnterAnim,
        exitAnimation: 'fade-out',
        layout: {
          x: 540,
          y: compId === 'cartoon-host' ? activeProfile.cardY : 865,
          width: 880,
          scale: compId === 'cartoon-host' ? 0.92 : 1,
          zIndex: 20,
        },
        props: {
          kind: 'sentence-card',
          text: sourcePromptText,
          subtext: trLocale.promptSub(totalRepeats),
          badge: 'question',
          emphasisColor: '#D97706',
          bgColor: isDark ? 'rgba(15, 23, 42, 0.94)' : '#FFFFFF',
          textColor: isDark ? '#F8FAFC' : '#0F172A',
        },
      });

      elements.push({
        id: `reel-tr-karaoke-q-${idx}`,
        type: 'karaoke-card',
        label: `Sub Q #${idx + 1}`,
        startTime: start,
        endTime: preRevealEnd,
        enterAnimation: isCartoonHost ? 'fade-scale' : 'slide-up',
        exitAnimation: 'fade-out',
        layout: { x: 540, y: karaokeCenterY, width: 900, scale: 1, zIndex: 35 },
        props: {
          kind: 'karaoke-card',
          cueId: win.questionCue.id,
          words: win.questionCue.words,
          variant: karaokeVariantForConfig,
          activeColor: isDark ? '#FACC15' : '#D97706',
          inactiveColor: isDark ? '#CBD5E1' : '#9CA3AF',
          spokenColor: isDark ? '#FFFFFF' : '#111827',
        },
      });

      // Phase 3: Answer Reveal + N Repeat Slices
      if (end - win.answerStart > 0.1) {
        const repSlots = win.repeatSlots || [];
        repSlots.forEach((slot, rIdx) => {
          const slotEnd =
            rIdx < repSlots.length - 1
              ? repSlots[rIdx + 1].start
              : win.nuanceSlot
                ? win.nuanceSlot.start
                : end;
          elements.push({
            id: `reel-tr-pill-rep-${idx}-${rIdx}`,
            type: 'topic-pill',
            label: `Repeat ${rIdx + 1}/${totalRepeats}`,
            startTime: slot.start,
            endTime: slotEnd,
            enterAnimation: cardEnterAnim,
            exitAnimation: 'fade-out',
            layout: { x: 540, y: activeProfile.pillY, width: 720, scale: 1, zIndex: 18 },
            props: {
              kind: 'topic-pill',
              text: trLocale.repeatPill(rIdx + 1, totalRepeats),
              bgColor: '#DCFCE7',
              textColor: '#15803D',
            },
          });

          elements.push({
            id: `reel-tr-karaoke-r-${idx}-${rIdx}`,
            type: 'karaoke-card',
            label: `Sub R${rIdx + 1} #${idx + 1}`,
            startTime: slot.start,
            endTime: slotEnd,
            enterAnimation: cardEnterAnim,
            exitAnimation: 'fade-out',
            layout: { x: 540, y: karaokeCenterY, width: 900, scale: 1, zIndex: 36 },
            props: {
              kind: 'karaoke-card',
              cueId: slot.cue.id,
              words: slot.cue.words,
              variant: karaokeVariantForConfig,
              activeColor: '#16A34A',
              inactiveColor: isDark ? '#CBD5E1' : '#9CA3AF',
              spokenColor: isDark ? '#FFFFFF' : '#064E3B',
            },
          });
        });

        if (win.nuanceSlot && end - win.nuanceSlot.start > 0.1) {
          elements.push({
            id: `reel-tr-pill-tip-${idx}`,
            type: 'topic-pill',
            label: `Takeaway #${idx + 1}`,
            startTime: win.nuanceSlot.start,
            endTime: end,
            enterAnimation: cardEnterAnim,
            exitAnimation: 'fade-out',
            layout: { x: 540, y: activeProfile.pillY, width: 720, scale: 1, zIndex: 18 },
            props: {
              kind: 'topic-pill',
              text: trLocale.tipPill(totalRepeats),
              bgColor: '#E0E7FF',
              textColor: '#3730A3',
            },
          });

          elements.push({
            id: `reel-tr-karaoke-tip-${idx}`,
            type: 'karaoke-card',
            label: `Sub Tip #${idx + 1}`,
            startTime: win.nuanceSlot.start,
            endTime: end,
            enterAnimation: cardEnterAnim,
            exitAnimation: 'fade-out',
            layout: { x: 540, y: karaokeCenterY, width: 900, scale: 1, zIndex: 37 },
            props: {
              kind: 'karaoke-card',
              cueId: win.nuanceSlot.cue.id,
              words: win.nuanceSlot.cue.words,
              variant: karaokeVariantForConfig,
              activeColor: '#4F46E5',
              inactiveColor: isDark ? '#CBD5E1' : '#9CA3AF',
              spokenColor: isDark ? '#FFFFFF' : '#1E1B4B',
            },
          });
        }

        // Revealed Target Translation Sentence Card (single concise takeaway + largest prominent sentence)
        const singleTakeaway =
          card.vocabNotes?.trim() || card.grammarNote?.trim() || undefined;
        elements.push({
          id: `reel-tr-ans-card-${idx}`,
          type: 'sentence-card',
          label: `Answer #${idx + 1}`,
          startTime: win.answerStart,
          endTime: end,
          enterAnimation: cardEnterAnim,
          exitAnimation: 'fade-out',
          layout: {
            x: 540,
            y: compId === 'cartoon-host' ? activeProfile.cardY : 665,
            width: 920,
            scale: compId === 'cartoon-host' ? 0.96 : 1.04,
            zIndex: 22,
          },
          props: {
            kind: 'sentence-card',
            text: card.content,
            subtext: singleTakeaway,
            badge: 'check',
            stampText: trLocale.stamp(totalRepeats),
            stampColor: '#16A34A',
            emphasisColor: '#16A34A',
            bgColor: isDark ? 'rgba(6, 78, 59, 0.94)' : '#ECFDF5',
            textColor: isDark ? '#ECFDF5' : '#064E3B',
          },
        });
      }
      return;
    }

    // ── QUIZ CARD WITH 3-PHASE INTERACTIVE CHOREOGRAPHY ───────────────────────
    if (card.type === 'quiz' && card.options && card.options.length > 0) {
      const safeAnsIdx = Math.min(card.answerIndex ?? 0, card.options.length - 1);
      const ansLetter = String.fromCharCode(65 + safeAnsIdx);
      const ansOpt = card.options[safeAnsIdx];

      // Top Lesson Roadmap Strip (Quiz Step Highlighted)
      elements.push({
        id: `reel-stage-${idx}`,
        type: 'comparison-strip',
        label: `${locale.roadmapLabel} #${idx + 1}`,
        startTime: start,
        endTime: stripEnd,
        enterAnimation: stripEnterAnim,
        exitAnimation: stripExitAnim,
        layout: { x: 540, y: activeProfile.stripY, width: 920, scale: 1, zIndex: 12 },
        props: {
          kind: 'comparison-strip',
          items: stageSteps.map((sLbl, sIdx) => ({
            label: sLbl,
            activateAt: sIdx === activeStepIdx ? start : end + 9,
            accentColor: '#D97706',
          })),
        },
      });

      // Phase 1 Pill: Question asking
      if (win.questionEnd - start > 0.15) {
        elements.push({
          id: `reel-q-pill-ask-${idx}`,
          type: 'topic-pill',
          label: `Quiz #${idx + 1}`,
          startTime: start,
          endTime: win.questionEnd,
          enterAnimation: cardEnterAnim,
          exitAnimation: 'fade-out',
          layout: { x: 540, y: activeProfile.pillY, width: 640, scale: 1, zIndex: 16 },
          props: {
            kind: 'topic-pill',
            text: `${card.badge || 'QUIZ'} · ${locale.quizAskTag}`,
            bgColor: '#FEF3C7',
            textColor: '#B45309',
          },
        });
      }

      const hasContextExcerpt = Boolean(card.contextExcerpt?.trim());

      // Phase 2 Countdown Pills + Animated Progress Bar
      if (win.thinkSec >= 1) {
        const wholeSecs = Math.max(1, Math.round(win.thinkSec));
        const sliceDur = (win.thinkEnd - win.thinkStart) / wholeSecs;
        for (let s = 0; s < wholeSecs; s++) {
          const remain = wholeSecs - s;
          const t0 = Number((win.thinkStart + s * sliceDur).toFixed(3));
          const t1 = Number((win.thinkStart + (s + 1) * sliceDur).toFixed(3));
          if (t1 - t0 <= 0.08) continue;

          elements.push({
            id: `reel-q-countdown-pill-${idx}-${s}`,
            type: 'topic-pill',
            label: `Countdown ${remain}s`,
            startTime: t0,
            endTime: t1,
            enterAnimation: isCartoonHost ? 'none' : 'pop-up',
            exitAnimation: isCartoonHost ? 'none' : 'fade-out',
            layout: { x: 540, y: activeProfile.pillY, width: 640, scale: 1, zIndex: 18 },
            props: {
              kind: 'topic-pill',
              text: locale.thinkCountdown(remain),
              bgColor: remain <= 2 ? '#FEE2E2' : '#FEF3C7',
              textColor: remain <= 2 ? '#B91C1C' : '#B45309',
            },
          });

          elements.push({
            id: `reel-q-countdown-meter-${idx}-${s}`,
            type: 'illustration-prop',
            label: `Timer ${remain}s`,
            startTime: t0,
            endTime: t1,
            enterAnimation: isCartoonHost ? 'none' : 'fade-scale',
            exitAnimation: isCartoonHost ? 'none' : 'fade-out',
            layout: {
              x: 540,
              y:
                compId === 'cartoon-host'
                  ? 725
                  : hasContextExcerpt
                    ? 1315
                    : 500,
              width: compId === 'cartoon-host' ? 760 : hasContextExcerpt ? 780 : 840,
              scale: compId === 'cartoon-host' ? 0.52 : hasContextExcerpt ? 0.72 : 0.94,
              zIndex: 10,
            },
            props: {
              kind: 'illustration-prop',
              variant: 'bs-progress-meter',
              data: {
                title: locale.chooseAnswerTitle(remain),
                subtitle: locale.chooseAnswerSubtitle,
                value: Number(((s + 1) / wholeSecs).toFixed(2)),
                sceneIcon: 'clock',
              },
            },
          });
        }
      }

      // Phase 3 Pill: Answer Reveal! (NEVER truncated mid-word)
      if (end - win.answerStart > 0.15) {
        elements.push({
          id: `reel-q-pill-ans-${idx}`,
          type: 'topic-pill',
          label: `${locale.correctBadge} #${idx + 1}`,
          startTime: win.answerStart,
          endTime: end,
          enterAnimation: cardEnterAnim,
          exitAnimation: 'fade-out',
          layout: { x: 540, y: activeProfile.pillY, width: 880, scale: 1, zIndex: 18 },
          props: {
            kind: 'topic-pill',
            text: locale.correctAnswerPill(ansLetter, ansOpt),
            bgColor: '#DCFCE7',
            textColor: '#15803D',
          },
        });

        if (compId !== 'cartoon-host') {
          elements.push({
            id: `reel-q-ans-prop-${idx}`,
            type: 'illustration-prop',
            label: `Answer Card #${idx + 1}`,
            startTime: win.answerStart,
            endTime: end,
            enterAnimation: 'pop-up',
            exitAnimation: 'fade-out',
            layout: { x: 540, y: 515, width: 840, scale: 0.96, zIndex: 11 },
            props: {
              kind: 'illustration-prop',
              variant: 'bs-alert-tip',
              data: {
                title: locale.correctAnswerCardTitle(ansLetter, ansOpt),
                speechText: card.explanation || locale.defaultExplanation(ansLetter, ansOpt),
                highlightWord: locale.correctBadge,
                sceneIcon: 'sparkles',
              },
            },
          });
        }
      }

      // Passage Context Card (concise direct-evidence excerpt kept visible throughout Question + Think countdown)
      if (card.contextExcerpt?.trim()) {
        const preRevealEnd = Math.max(start + 0.1, win.answerStart);
        elements.push({
          id: `reel-q-context-${idx}`,
          type: 'illustration-prop',
          label: `${locale.contextPassageTitle} #${idx + 1}`,
          startTime: start,
          endTime: preRevealEnd,
          enterAnimation: 'fade-scale',
          exitAnimation: 'fade-out',
          layout: {
            x: 540,
            y: compId === 'cartoon-host' ? 400 : 525,
            width: 880,
            scale: compId === 'cartoon-host' ? 0.68 : 0.94,
            zIndex: 9,
          },
          props: {
            kind: 'illustration-prop',
            variant: 'css-browser-mockup',
            data: {
              title: options?.title || locale.contextPassageTitle,
              formula: locale.contextPassageUrl,
              speechText: card.contextExcerpt.trim(),
              sceneIcon: 'book',
            },
          },
        });
      } else if (win.questionEnd - start > 0.15 && compId !== 'cartoon-host') {
        elements.push({
          id: `reel-q-ask-prop-${idx}`,
          type: 'illustration-prop',
          label: `Quiz Visual #${idx + 1}`,
          startTime: start,
          endTime: win.questionEnd,
          enterAnimation: 'fade-scale',
          exitAnimation: 'fade-out',
          layout: { x: 540, y: 500, width: 840, scale: 0.96, zIndex: 9 },
          props: {
            kind: 'illustration-prop',
            variant: visualSpec.variant,
            data: visualSpec.data,
          },
        });
      }

      // Question Sentence Card
      const preRevealEnd = Math.max(start + 0.1, win.answerStart);
      if (preRevealEnd - start > 0.1) {
        elements.push({
          id: `reel-qcard-pre-${idx}`,
          type: 'sentence-card',
          label: `Quiz Q #${idx + 1}`,
          startTime: start,
          endTime: preRevealEnd,
          enterAnimation: cardEnterAnim,
          exitAnimation: 'fade-out',
          layout: {
            x: 540,
            y: compId === 'cartoon-host' ? (hasContextExcerpt ? 535 : 420) : hasContextExcerpt ? 840 : 830,
            width: 880,
            scale: compId === 'cartoon-host' ? 0.84 : 1,
            zIndex: 20,
          },
          props: {
            kind: 'sentence-card',
            text: card.content,
            subtext: card.translation || locale.listenChooseSubtext,
            badge: 'question',
            emphasisColor: '#D97706',
            bgColor: isDark ? 'rgba(15, 23, 42, 0.94)' : '#FFFFFF',
            textColor: isDark ? '#F8FAFC' : '#0F172A',
          },
        });
      }

      if (end - win.answerStart > 0.1) {
        elements.push({
          id: `reel-qcard-post-${idx}`,
          type: 'sentence-card',
          label: `Quiz Answer #${idx + 1}`,
          startTime: win.answerStart,
          endTime: end,
          enterAnimation: cardEnterAnim,
          exitAnimation: 'fade-out',
          layout: {
            x: 540,
            y: compId === 'cartoon-host' ? 425 : 830,
            width: 880,
            scale: compId === 'cartoon-host' ? 0.86 : 1,
            zIndex: 22,
          },
          props: {
            kind: 'sentence-card',
            text: `${ansLetter}. ${ansOpt}`,
            subtext: card.explanation ? card.content : card.translation || card.content,
            badge: 'check',
            stampText: locale.correctStamp,
            stampColor: '#16A34A',
            emphasisColor: '#16A34A',
            bgColor: isDark ? 'rgba(6, 78, 59, 0.94)' : '#ECFDF5',
            textColor: isDark ? '#ECFDF5' : '#064E3B',
          },
        });
      }

      // Options Strip: FULL option text (never truncated mid-word!)
      elements.push({
        id: `reel-quiz-opts-${idx}`,
        type: 'comparison-strip',
        label: `Options #${idx + 1}`,
        startTime: start,
        endTime: end,
        enterAnimation: isCartoonHost ? 'fade-scale' : 'slide-up',
        exitAnimation: 'fade-out',
        layout: {
          x: 540,
          y: compId === 'cartoon-host' ? (hasContextExcerpt ? 645 : 590) : hasContextExcerpt ? 1085 : 1175,
          width: 920,
          scale: compId === 'cartoon-host' ? 0.82 : 1,
          zIndex: 20,
        },
        props: {
          kind: 'comparison-strip',
          items: card.options.slice(0, 4).map((opt, oIdx) => ({
            label: `${String.fromCharCode(65 + oIdx)}. ${opt}`,
            sublabel: oIdx === safeAnsIdx ? locale.correctOptionSublabel : undefined,
            activateAt: oIdx === safeAnsIdx ? win.answerStart : end + 9,
            accentColor: oIdx === safeAnsIdx ? '#16A34A' : '#64748B',
          })),
        },
      });

      // Bottom Karaoke Subtitles
      elements.push({
        id: `reel-karaoke-q-${idx}`,
        type: 'karaoke-card',
        label: `Sub Q #${idx + 1}`,
        startTime: start,
        endTime: Math.max(win.thinkEnd, win.questionEnd),
        enterAnimation: isCartoonHost ? 'fade-scale' : 'slide-up',
        exitAnimation: 'fade-out',
        layout: { x: 540, y: karaokeCenterY, width: 900, scale: 1, zIndex: 35 },
        props: {
          kind: 'karaoke-card',
          cueId: win.questionCue.id,
          words: win.questionCue.words,
          variant: karaokeVariantForConfig,
          activeColor: isDark ? '#FACC15' : '#D97706',
          inactiveColor: isDark ? '#CBD5E1' : '#9CA3AF',
          spokenColor: isDark ? '#FFFFFF' : '#111827',
        },
      });

      if (win.answerCue && end - win.answerStart > 0.1) {
        elements.push({
          id: `reel-karaoke-a-${idx}`,
          type: 'karaoke-card',
          label: `Sub A #${idx + 1}`,
          startTime: win.answerStart,
          endTime: end,
          enterAnimation: cardEnterAnim,
          exitAnimation: 'fade-out',
          layout: { x: 540, y: karaokeCenterY, width: 900, scale: 1, zIndex: 36 },
          props: {
            kind: 'karaoke-card',
            cueId: win.answerCue.id,
            words: win.answerCue.words,
            variant: karaokeVariantForConfig,
            activeColor: '#16A34A',
            inactiveColor: isDark ? '#CBD5E1' : '#9CA3AF',
            spokenColor: isDark ? '#FFFFFF' : '#064E3B',
          },
        });
      }
      return;
    }

    // ── INTRO / READING / VOCAB / OUTRO LESSON SLIDE ──────────────────────────
    const displayHeadline =
      card.type === 'vocab' &&
      card.title &&
      card.title !== card.content &&
      !card.title.startsWith('Reading Point') &&
      !card.title.startsWith('Lesson Point') &&
      !card.title.startsWith('Câu ') &&
      !card.title.startsWith('Line ') &&
      !card.title.startsWith('文 ')
        ? `${card.title}${card.phonetic ? ` ${card.phonetic}` : ''}`
        : card.content;
    const displaySub =
      card.type === 'vocab' &&
      card.title &&
      card.title !== card.content &&
      !card.title.startsWith('Reading Point') &&
      !card.title.startsWith('Lesson Point') &&
      !card.title.startsWith('Câu ') &&
      !card.title.startsWith('Line ') &&
      !card.title.startsWith('文 ')
        ? `${card.content}${card.translation ? ` — ${card.translation}` : ''}`
        : [card.phonetic, card.translation].filter(Boolean).join(' · ') || undefined;

    if (compId === 'word-reveal') {
      // @xun52000 Bold Typography Layout: clean top badge pill + large focal sentence card (no cluttered prop)
      elements.push({
        id: `reel-pill-${idx}`,
        type: 'topic-pill',
        label: `${card.badge || card.type}`,
        startTime: start,
        endTime: end,
        enterAnimation: 'pop-up',
        exitAnimation: 'fade-out',
        layout: { x: 540, y: 245, width: 640, scale: 1, zIndex: 14 },
        props: {
          kind: 'topic-pill',
          text: card.badge || card.type.toUpperCase(),
          bgColor: isDark ? '#334155' : '#E0E7FF',
          textColor: isDark ? '#FACC15' : '#3730A3',
        },
      });

      elements.push({
        id: `reel-card-${idx}`,
        type: 'sentence-card',
        label: `Word Reveal #${idx + 1}: ${card.title.slice(0, 28)}`,
        startTime: start,
        endTime: end,
        enterAnimation: 'fade-scale',
        exitAnimation: 'fade-out',
        layout: { x: 540, y: 740, width: 900, scale: 1, zIndex: 20 },
        props: {
          kind: 'sentence-card',
          text: displayHeadline,
          subtext: displaySub,
          badge: card.type === 'outro' ? 'check' : 'none',
          emphasisWord: card.type === 'vocab' ? card.title : undefined,
          emphasisColor: isDark ? '#FACC15' : '#4F46E5',
          bgColor: isDark ? 'rgba(30, 41, 59, 0.95)' : '#FFFFFF',
          textColor: isDark ? '#F8FAFC' : '#0F172A',
        },
      });
    } else if (compId === '3d-shapes') {
      // 3D Shapes Layout: 3D pill + extruded 3D headline card + staircase or detail card
      elements.push({
        id: `reel-3d-pill-${idx}`,
        type: 'shape-3d',
        label: `3D Pill #${idx + 1}`,
        startTime: start,
        endTime: end,
        enterAnimation: 'drop-in',
        exitAnimation: 'fade-out',
        layout: { x: 540, y: 225, width: 580, height: 108, scale: 1, zIndex: 16 },
        props: {
          kind: 'shape-3d',
          shapeType: 'pill_3d',
          fill: isDark ? '#334155' : '#EEF2FF',
          shadow: true,
          highlight: true,
          depth: 8,
          cornerRadius: 54,
          textContent: card.badge || card.type.toUpperCase(),
          textColor: isDark ? '#FACC15' : '#4338CA',
          textSize: 'body',
          textWeight: 'bold',
        },
      });

      elements.push({
        id: `reel-3d-card-${idx}`,
        type: 'shape-3d',
        label: `3D Card #${idx + 1}`,
        startTime: start,
        endTime: end,
        enterAnimation: 'pop-up',
        exitAnimation: 'fade-out',
        layout: { x: 540, y: 520, width: 860, height: 290, scale: 1, zIndex: 18 },
        props: {
          kind: 'shape-3d',
          shapeType: 'card_3d',
          fill:
            card.type === 'outro'
              ? '#10B981'
              : card.type === 'intro'
                ? '#4F46E5'
                : idx % 2 === 0
                  ? '#0EA5E9'
                  : '#6366F1',
          shadow: true,
          highlight: true,
          depth: 14,
          cornerRadius: 30,
          textContent: displayHeadline,
          textColor: '#FFFFFF',
          textSize: displayHeadline.length > 96 ? 'body' : 'headline',
          textWeight: 'bold',
        },
      });

      if (visualSpec.data.labels && visualSpec.data.labels.length >= 2) {
        elements.push({
          id: `reel-3d-staircase-${idx}`,
          type: 'shape-3d',
          label: `3D Steps #${idx + 1}`,
          startTime: start,
          endTime: end,
          enterAnimation: 'pop-up',
          exitAnimation: 'fade-out',
          layout: { x: 540, y: 980, width: 860, height: 320, scale: 1, zIndex: 16 },
          props: {
            kind: 'shape-3d',
            shapeType: 'staircase_3d',
            fill: '#F59E0B',
            shadow: true,
            highlight: true,
            depth: 12,
            cornerRadius: 20,
            textColor: '#FFFFFF',
            stepLabels: visualSpec.data.labels.slice(0, 3),
          },
        });
      } else if (displaySub) {
        elements.push({
          id: `reel-card-${idx}`,
          type: 'sentence-card',
          label: `Note #${idx + 1}`,
          startTime: start,
          endTime: end,
          enterAnimation: 'pop-up',
          exitAnimation: 'fade-out',
          layout: { x: 540, y: 960, width: 880, scale: 1, zIndex: 20 },
          props: {
            kind: 'sentence-card',
            text: displaySub,
            badge: card.type === 'outro' ? 'check' : 'none',
            bgColor: isDark ? 'rgba(15, 23, 42, 0.94)' : '#FFFFFF',
            textColor: isDark ? '#F8FAFC' : '#0F172A',
          },
        });
      }
    } else {
      if (activeProfile.showStrip) {
        elements.push({
          id: `reel-stage-${idx}`,
          type: 'comparison-strip',
          label: `${locale.roadmapLabel} #${idx + 1}`,
          startTime: start,
          endTime: stripEnd,
          enterAnimation: stripEnterAnim,
          exitAnimation: stripExitAnim,
          layout: { x: 540, y: activeProfile.stripY, width: 920, scale: 1, zIndex: 12 },
          props: {
            kind: 'comparison-strip',
            items: stageSteps.map((sLbl, sIdx) => ({
              label: sLbl,
              activateAt: sIdx === activeStepIdx ? start : end + 9,
              accentColor:
                card.type === 'intro' ? '#4F46E5' : card.type === 'outro' ? '#16A34A' : '#2563EB',
            })),
          },
        });
      }

      const speakerBadgeColors = [
        { bg: '#DBEAFE', text: '#1D4ED8' },
        { bg: '#F3E8FF', text: '#7E22CE' },
        { bg: '#D1FAE5', text: '#047857' },
      ];
      const speakerColorIdx = (() => {
        if (!card.speaker) return -1;
        const seenSpeakers: string[] = [];
        for (const sc of safeCards) {
          if (sc.speaker && !seenSpeakers.includes(sc.speaker)) {
            seenSpeakers.push(sc.speaker);
          }
        }
        return Math.max(0, seenSpeakers.indexOf(card.speaker));
      })();
      const speakerPalette =
        speakerColorIdx >= 0 ? speakerBadgeColors[speakerColorIdx % speakerBadgeColors.length] : null;

      const pillLabel = card.speaker
        ? card.indexLabel
          ? `${card.indexLabel} · 🎙️ ${card.speaker}`
          : `🎙️ ${card.speaker}`
        : card.indexLabel && !card.badge.includes(card.indexLabel)
          ? `${card.indexLabel} · ${card.badge}`
          : card.badge || card.type.toUpperCase();

      elements.push({
        id: `reel-pill-${idx}`,
        type: 'topic-pill',
        label: pillLabel,
        startTime: start,
        endTime: end,
        enterAnimation: cardEnterAnim,
        exitAnimation: 'fade-out',
        layout: { x: 540, y: activeProfile.pillY, width: 640, scale: 1, zIndex: 14 },
        props: {
          kind: 'topic-pill',
          text: pillLabel,
          bgColor:
            speakerPalette?.bg ??
            activeProfile.pillBg ??
            (card.type === 'intro'
              ? '#E0E7FF'
              : card.type === 'outro'
                ? '#DCFCE7'
                : '#DBEAFE'),
          textColor:
            speakerPalette?.text ??
            activeProfile.pillColor ??
            (card.type === 'intro'
              ? '#3730A3'
              : card.type === 'outro'
                ? '#15803D'
                : '#1D4ED8'),
        },
      });

      const speakerRoster = (() => {
        const roster: Array<{ name: string; role?: string; color: string }> = [];
        for (const sc of safeCards) {
          const spName = sc.speaker?.trim();
          if (spName && !roster.some((r) => r.name === spName)) {
            const palette = speakerBadgeColors[roster.length % speakerBadgeColors.length];
            roster.push({
              name: spName,
              role: sc.speakerRole,
              color: palette.text,
            });
          }
        }
        return roster;
      })();

      if (compId === 'full-study-cards') {
        const showTitleHeading =
          card.type === 'vocab' &&
          Boolean(card.title) &&
          card.title !== card.content &&
          !card.title.startsWith('Reading Point') &&
          !card.title.startsWith('Lesson Point') &&
          !card.title.startsWith('Câu ') &&
          !card.title.startsWith('Line ') &&
          !card.title.startsWith('文 ');
        const fullHeadText = showTitleHeading ? card.title : card.content;
        const fullSubText = showTitleHeading
          ? [card.phonetic, card.content].filter(Boolean).join('\n') || undefined
          : card.phonetic || undefined;
        const fullSections: SentenceCardProps['sections'] = [];
        if (card.translation?.trim()) {
          fullSections.push({ text: card.translation.trim(), tone: 'neutral' });
        }
        if (card.vocabNotes?.trim()) {
          fullSections.push({ label: 'Từ vựng', text: card.vocabNotes.trim(), tone: 'indigo' });
        }
        if (card.grammarNote?.trim()) {
          fullSections.push({ label: 'Ngữ pháp', text: card.grammarNote.trim(), tone: 'amber' });
        }
        if (card.explanation?.trim()) {
          fullSections.push({ label: 'Giải thích', text: card.explanation.trim(), tone: 'emerald' });
        }

        elements.push({
          id: `reel-card-${idx}`,
          type: 'sentence-card',
          label: `Full Study #${idx + 1}: ${card.title.slice(0, 28)}`,
          startTime: start,
          endTime: end,
          enterAnimation: 'fade-scale',
          exitAnimation: 'fade-out',
          layout: {
            x: 540,
            y: 880,
            width: 920,
            scale: 1,
            zIndex: 20,
          },
          props: {
            kind: 'sentence-card',
            speakerLabel: card.speaker
              ? `🎙️ ${card.speaker}${card.speakerRole ? ` · ${card.speakerRole}` : ''}`
              : undefined,
            text: fullHeadText,
            subtext: fullSubText,
            sections: fullSections.length > 0 ? fullSections : undefined,
            badge: card.type === 'outro' ? 'check' : 'none',
            emphasisWord: card.type === 'vocab' && !card.title.startsWith('Reading') ? card.title : undefined,
            emphasisColor: isDark ? '#FACC15' : '#4F46E5',
            bgColor: isDark ? 'rgba(15, 23, 42, 0.96)' : '#FFFFFF',
            textColor: isDark ? '#F8FAFC' : '#0F172A',
          },
        });
      } else {
        let resolvedPropVariant = visualSpec.variant;
        let resolvedPropData = visualSpec.data;

        if (compId === 'podcast-duo' && card.type !== 'intro' && card.type !== 'outro') {
          const studioNodes =
            speakerRoster.length >= 2
              ? speakerRoster.slice(0, 3).map((r, ri) => ({
                  label: r.name,
                  sublabel: r.role || `Host ${ri + 1}`,
                  color: r.color,
                }))
              : [
                  { label: card.speaker || 'Host A', sublabel: card.speakerRole || 'Host 1', color: '#3B82F6' },
                  { label: 'Host B', sublabel: 'Co-Host', color: '#8B5CF6' },
                ];
          resolvedPropVariant = 'podcast-studio';
          resolvedPropData = {
            ...visualSpec.data,
            labels: undefined,
            formula: card.speaker ? 'PODCAST · LIVE' : 'PODCAST STUDIO',
            title: card.title || card.badge,
            reactionText: card.speaker || studioNodes[0]?.label,
            nodes: studioNodes,
            sceneIcon: 'mic',
          };
        } else if (compId === 'dialogue-stage' && card.type !== 'intro' && card.type !== 'outro') {
          if (idx % 2 === 1) {
            resolvedPropVariant = 'p168-story-dialogue';
            resolvedPropData = {
              ...visualSpec.data,
              labels:
                speakerRoster.length >= 2
                  ? speakerRoster.slice(0, 3).map((r) => r.name)
                  : [card.speaker || 'Speaker A', 'Conversation'],
              title: card.title || card.badge,
              reactionText: card.speaker || 'Speaker',
              speechText: card.content,
              highlightWord: card.translation || card.title,
              sceneIcon: 'chat',
            };
          } else {
            const prevCard = idx > 0 ? safeCards[idx - 1] : undefined;
            resolvedPropVariant = 'css-chat-thread';
            resolvedPropData = {
              ...visualSpec.data,
              title:
                speakerRoster.length >= 2
                  ? speakerRoster.slice(0, 2).map((r) => r.name).join(' ↔ ')
                  : card.speaker || card.title,
              labels: [
                prevCard?.speaker ? `${prevCard.speaker}: ${prevCard.content.slice(0, 38)}` : card.title,
                card.speaker ? `${card.speaker}: ${card.content.slice(0, 42)}` : card.content.slice(0, 42),
              ],
              sceneIcon: 'chat',
            };
          }
        }

        if (compId !== 'cartoon-host') {
          elements.push({
            id: `reel-prop-${idx}`,
            type: 'illustration-prop',
            label: `Visual #${idx + 1}`,
            startTime: start,
            endTime: end,
            enterAnimation: 'fade-scale',
            exitAnimation: 'fade-out',
            layout: { x: 540, y: activeProfile.illY, width: 860, scale: 0.96, zIndex: 10 },
            props: {
              kind: 'illustration-prop',
              variant: resolvedPropVariant,
              data: resolvedPropData,
            },
          });
        }

        const badgeHaystack = `${card.badge} ${card.title} ${displayHeadline} ${displaySub || ''}`;
        const inferredReelBadge: 'check' | 'cross' | 'question' | 'none' =
          card.type === 'outro'
            ? 'check'
            : card.type === 'intro'
              ? 'none'
              : /\b(avoid|rude|wrong|mistake|don't say|stop saying)\b|tránh|sai/i.test(badgeHaystack) ||
                  /(?:^|[\s「『(【])NG(?:$|[\s」』)】:：!])/u.test(badgeHaystack)
                ? 'cross'
                : /\b(natural|polite|better|instead|smart|tip|upgrade)\b|nên dùng|tự nhiên|chuẩn/i.test(
                      badgeHaystack,
                    )
                  ? 'check'
                  : 'none';

        elements.push({
          id: `reel-card-${idx}`,
          type: 'sentence-card',
          label: `Card #${idx + 1}: ${card.title.slice(0, 28)}`,
          startTime: start,
          endTime: end,
          enterAnimation: cardEnterAnim,
          exitAnimation: 'fade-out',
          layout: {
            x: 540,
            y: activeProfile.cardY,
            width: 880,
            scale: compId === 'cartoon-host' ? 0.94 : 1,
            zIndex: 20,
          },
          props: {
            kind: 'sentence-card',
            speakerLabel:
              compId === 'podcast-duo' || compId === 'dialogue-stage'
                ? card.speaker
                  ? `🎙️ ${card.speaker}${card.speakerRole ? ` · ${card.speakerRole}` : ''}`
                  : undefined
                : undefined,
            text: displayHeadline,
            subtext: displaySub,
            badge: inferredReelBadge,
            stampText:
              inferredReelBadge === 'cross'
                ? 'AVOID'
                : inferredReelBadge === 'check' && card.type !== 'outro'
                  ? 'NATURAL'
                  : undefined,
            stampColor:
              inferredReelBadge === 'cross'
                ? '#DC2626'
                : inferredReelBadge === 'check'
                  ? '#16A34A'
                  : undefined,
            emphasisWord: card.type === 'vocab' && !card.title.startsWith('Reading') ? card.title : undefined,
            emphasisColor:
              inferredReelBadge === 'cross'
                ? '#DC2626'
                : activeProfile.emphasisColor ?? (card.type === 'outro' ? '#16A34A' : '#2563EB'),
            bgColor: isDark
              ? 'rgba(15, 23, 42, 0.94)'
              : inferredReelBadge === 'cross'
                ? '#FFF1F2'
                : activeProfile.cardBg ?? '#FFFFFF',
            textColor: isDark ? '#F8FAFC' : (activeProfile.cardText ?? '#0F172A'),
          },
        });
      }
    }

    elements.push({
      id: `reel-karaoke-${idx}`,
      type: 'karaoke-card',
      label: `Karaoke #${idx + 1}`,
      startTime: start,
      endTime: end,
      enterAnimation: isCartoonHost ? 'fade-scale' : 'slide-up',
      exitAnimation: 'fade-out',
      layout: { x: 540, y: karaokeCenterY, width: 900, scale: 1, zIndex: 35 },
      props: {
        kind: 'karaoke-card',
        cueId: win.questionCue.id,
        words: win.questionCue.words,
        variant: karaokeVariantForConfig,
        activeColor: isDark ? '#FACC15' : '#2563EB',
        inactiveColor: isDark ? '#CBD5E1' : '#9CA3AF',
        spokenColor: isDark ? '#FFFFFF' : '#111827',
      },
    });
  });

  const resolvedElements = resolveProjectOverlaps(elements, {
    preserveKaraokeY: compId === 'plain' || resolvedSubtitleConfig.position !== 'bottom',
  });
  const aspectRatio: ExportAspectRatioId = options?.aspectRatio || '9:16';

  return {
    id: `reels-${Date.now().toString(36)}`,
    title: options?.title || safeCards[0]?.title || 'English Reels Studio Video',
    subtitle: options?.subtitle || `English Reels Studio × KineticSub ${aspectRatio}`,
    theme,
    compositionId: compId,
    aspectRatio,
    backgroundImage: options?.backgroundImage,
    subtitleConfig: resolvedSubtitleConfig,
    duration: totalDuration,
    fps: 30,
    audioFileName: options?.audioFileName,
    cues,
    elements: resolvedElements,
    watermark: options?.watermark,
    titleLayout: options?.titleLayout,
  };
}

export interface SpeakerVoiceResolutionOptions {
  defaultVoice?: string;
  defaultLang?: string;
  provider?: string;
  availableVoices?: Array<{ id: string; label?: string; lang?: string }>;
}

const MULTI_SPEAKER_VOICE_POOLS: Record<
  string,
  { female: string[]; male: string[] }
> = {
  en: {
    female: ['en-US-JennyNeural', 'en-US-AriaNeural', 'en-GB-SoniaNeural', 'en-US-AvaMultilingualNeural'],
    male: ['en-US-GuyNeural', 'en-US-AndrewMultilingualNeural', 'en-US-BrianMultilingualNeural'],
  },
  ja: {
    female: ['ja-JP-NanamiNeural', 'en-US-AvaMultilingualNeural', 'en-US-EmmaMultilingualNeural'],
    male: ['ja-JP-KeitaNeural', 'en-US-AndrewMultilingualNeural', 'en-US-BrianMultilingualNeural'],
  },
  zh: {
    female: ['zh-CN-XiaoxiaoNeural', 'en-US-AvaMultilingualNeural', 'en-US-EmmaMultilingualNeural'],
    male: ['zh-CN-YunxiNeural', 'en-US-AndrewMultilingualNeural', 'en-US-BrianMultilingualNeural'],
  },
  ko: {
    female: ['ko-KR-SunHiNeural', 'en-US-AvaMultilingualNeural', 'en-US-EmmaMultilingualNeural'],
    male: ['ko-KR-InJoonNeural', 'ko-KR-HyunsuMultilingualNeural', 'en-US-BrianMultilingualNeural'],
  },
  fr: {
    female: ['fr-FR-DeniseNeural', 'fr-FR-VivienneMultilingualNeural', 'en-US-AvaMultilingualNeural'],
    male: ['fr-FR-HenriNeural', 'en-US-AndrewMultilingualNeural', 'en-US-BrianMultilingualNeural'],
  },
  es: {
    female: ['es-ES-ElviraNeural', 'en-US-EmmaMultilingualNeural', 'en-US-AvaMultilingualNeural'],
    male: ['es-ES-AlvaroNeural', 'en-US-BrianMultilingualNeural', 'en-US-AndrewMultilingualNeural'],
  },
  vi: {
    female: ['vi-VN-HoaiMyNeural', 'en-US-AvaMultilingualNeural'],
    male: ['vi-VN-NamMinhNeural', 'en-US-AndrewMultilingualNeural'],
  },
};

function normalizeBaseVoiceLang(rawLang?: string): string {
  const low = String(rawLang || 'en').trim().toLowerCase();
  if (low.startsWith('ja') || low === 'jp') return 'ja';
  if (low.startsWith('zh')) return 'zh';
  if (low.startsWith('ko')) return 'ko';
  if (low.startsWith('fr')) return 'fr';
  if (low.startsWith('es')) return 'es';
  if (low.startsWith('vi')) return 'vi';
  return 'en';
}

function detectVoiceIdGender(voiceId?: string): 'male' | 'female' | null {
  const v = String(voiceId || '').toLowerCase();
  if (!v) return null;
  if (
    /(?:guy|andrew|brian|keita|yunxi|injoon|hyunsu|henri|alvaro|namminh|matthew|takumi|onyx|echo|fenrir|puck|charon)/.test(
      v,
    )
  ) {
    return 'male';
  }
  if (
    /(?:jenny|aria|sonia|natasha|ava|emma|vivienne|nanami|xiaoxiao|sunhi|denise|elvira|hoaimy|joanna|amy|mizuki|alloy|nova|shimmer|kore|aoede|leda)/.test(
      v,
    )
  ) {
    return 'female';
  }
  return null;
}

function inferSpeakerGenderForCard(
  speakerName: string,
  explicitGender?: 'male' | 'female',
): 'male' | 'female' | null {
  if (explicitGender === 'male' || explicitGender === 'female') {
    return explicitGender;
  }
  const s = speakerName.trim().toLowerCase();
  if (!s) return null;
  if (
    /\b(?:female|woman|girl|lady|she|her|yuki|sakura|hana|mei|lin|yuna|jisoo|minji|emma|sarah|maya|lisa|anna|sophie|maria|elena|claire|chloe|hoa|lan|mai|linh|thảo|trang|nữ)\b/i.test(
      s,
    )
  ) {
    return 'female';
  }
  if (
    /\b(?:male|man|boy|guy|he|him|ken|takeshi|haruto|minho|jun|wei|ming|alex|john|david|tom|mike|mark|daniel|lucas|carlos|nam|hùng|minh|nam giới)\b/i.test(
      s,
    )
  ) {
    return 'male';
  }
  return null;
}

/**
 * Assigns distinct TTS voices per speaker when a lesson contains 2+ speakers
 * (e.g. Podcast Duo, Shadowing Dialogue, Roleplay), respecting explicit `speakerGender`
 * and falling back to alternating Female/Male Edge Neural voices for the target language.
 * Returns a map keyed by `card.id` -> resolved `voiceId` (empty if single/no speaker).
 */
export function buildSpeakerVoiceMap(
  cards: ReelCard[],
  options?: SpeakerVoiceResolutionOptions,
): Map<string, string> {
  const voiceByCardId = new Map<string, string>();
  const provider = String(options?.provider || 'edge').toLowerCase();
  if (provider === 'google') return voiceByCardId;

  const speakerOrder: Array<{
    key: string;
    label: string;
    explicitGender?: 'male' | 'female';
    langCode: string;
  }> = [];

  for (const card of cards) {
    const rawSpeaker = String(card.speaker || '').trim();
    if (!rawSpeaker) continue;
    const key = rawSpeaker.toLowerCase();
    const cardLang = normalizeBaseVoiceLang(
      card.learningLang || inferLearningLangFromCards([card], options?.defaultLang),
    );
    const existing = speakerOrder.find((item) => item.key === key);
    if (!existing) {
      speakerOrder.push({
        key,
        label: rawSpeaker,
        explicitGender: card.speakerGender,
        langCode: cardLang,
      });
    } else if (!existing.explicitGender && card.speakerGender) {
      existing.explicitGender = card.speakerGender;
    }
  }

  if (speakerOrder.length < 2) {
    return voiceByCardId;
  }

  const primaryLang = speakerOrder[0].langCode || normalizeBaseVoiceLang(options?.defaultLang);

  // ElevenLabs / custom voice pools when >= 2 voices are present in availableVoices
  if (provider === 'elevenlabs' && options?.availableVoices && options.availableVoices.length >= 2) {
    const speakerVoices = new Map<string, string>();
    const pool = options.availableVoices.map((v) => v.id).filter(Boolean);
    const firstVoice =
      options.defaultVoice && pool.includes(options.defaultVoice)
        ? options.defaultVoice
        : pool[0];
    const remaining = pool.filter((id) => id !== firstVoice);
    const orderedPool = [firstVoice, ...remaining];
    speakerOrder.forEach((sp, idx) => {
      speakerVoices.set(sp.key, orderedPool[idx % orderedPool.length]);
    });
    for (const card of cards) {
      const key = String(card.speaker || '').trim().toLowerCase();
      const v = key ? speakerVoices.get(key) : undefined;
      if (v) voiceByCardId.set(card.id, v);
    }
    return voiceByCardId;
  }

  if (provider === 'streamelements') {
    const seFemale = primaryLang === 'ja' ? ['Mizuki'] : ['Joanna', 'Amy'];
    const seMale = primaryLang === 'ja' ? ['Takumi'] : ['Matthew', 'Brian'];
    const speakerVoices = new Map<string, string>();
    let fIdx = 0;
    let mIdx = 0;
    speakerOrder.forEach((sp, idx) => {
      const inferred = inferSpeakerGenderForCard(sp.label, sp.explicitGender);
      const gender: 'male' | 'female' =
        inferred ?? (idx % 2 === 0 ? 'female' : 'male');
      const v =
        gender === 'male'
          ? seMale[mIdx++ % seMale.length]
          : seFemale[fIdx++ % seFemale.length];
      speakerVoices.set(sp.key, v);
    });
    for (const card of cards) {
      const key = String(card.speaker || '').trim().toLowerCase();
      const v = key ? speakerVoices.get(key) : undefined;
      if (v) voiceByCardId.set(card.id, v);
    }
    return voiceByCardId;
  }

  const langPool = MULTI_SPEAKER_VOICE_POOLS[primaryLang] || MULTI_SPEAKER_VOICE_POOLS.en;
  const defaultVoice = String(options?.defaultVoice || '').trim();
  const defaultGender = detectVoiceIdGender(defaultVoice);
  const firstSpeakerInferred = inferSpeakerGenderForCard(
    speakerOrder[0].label,
    speakerOrder[0].explicitGender,
  );
  const firstSpeakerGender: 'male' | 'female' =
    firstSpeakerInferred ?? defaultGender ?? 'female';

  const usedVoices = new Set<string>();
  const speakerVoices = new Map<string, string>();

  const pickNextUnusedVoice = (pool: string[], preferred?: string): string => {
    if (preferred && !usedVoices.has(preferred)) {
      usedVoices.add(preferred);
      return preferred;
    }
    for (const candidate of pool) {
      if (!usedVoices.has(candidate)) {
        usedVoices.add(candidate);
        return candidate;
      }
    }
    return pool[usedVoices.size % pool.length];
  };

  speakerOrder.forEach((sp, idx) => {
    const spPool = MULTI_SPEAKER_VOICE_POOLS[sp.langCode] || langPool;
    const inferred = inferSpeakerGenderForCard(sp.label, sp.explicitGender);
    const gender: 'male' | 'female' =
      inferred ??
      (idx === 0
        ? firstSpeakerGender
        : idx % 2 === 1
          ? firstSpeakerGender === 'female'
            ? 'male'
            : 'female'
          : firstSpeakerGender);

    const canKeepDefaultForFirst =
      idx === 0 &&
      Boolean(defaultVoice) &&
      (!defaultGender || defaultGender === gender) &&
      (defaultVoice.toLowerCase().startsWith(`${sp.langCode}-`) ||
        /MultilingualNeural$/i.test(defaultVoice));

    const chosen = pickNextUnusedVoice(
      gender === 'male' ? spPool.male : spPool.female,
      canKeepDefaultForFirst ? defaultVoice : undefined,
    );
    speakerVoices.set(sp.key, chosen);
  });

  for (const card of cards) {
    const key = String(card.speaker || '').trim().toLowerCase();
    const v = key ? speakerVoices.get(key) : undefined;
    if (v) {
      voiceByCardId.set(card.id, v);
    }
  }

  return voiceByCardId;
}

export function buildReelPromptBundleForSubtitles(
  cues: TranscriptCue[],
  title: string,
  style: PromptVideoStyle = 'tiktok-cards',
): string {
  return buildSceneGenerationPrompt(cues, { title, style });
}
