import { buildSceneGenerationPrompt, PromptVideoStyle } from './aiPromptBuilder';
import { getReadingUiStrings, ReadingUiStrings } from './eduStudioEffects';
import {
  buildAiCreatorWebAiPrompt,
  buildTranslationChallengePrompt,
  CreatorFormatCategory,
  getQuizCardSpeechParts,
  inferLearningLangFromCards,
  LEARNING_LANGUAGE_OPTIONS,
  LearningLanguageId,
  parseEnglishReelsAiJson,
  ReelCard,
  ReelCardTimingMeta,
} from './englishReelsEngine';
import type { ExportAspectRatioId } from './mp4Config';
import { cleanDownloadFileName, cleanOutputTitleStem } from './outputNaming';
import {
  buildReadingWebAiPrompt,
  parseReadingWebAiResponse,
  ReadingFormatCategory,
  ReadingLearningLang,
} from './readingPromptBuilder';
import { FlexibleSceneDocument } from './scenePlanAdapter';
import type { LayoutCompositionId, TranscriptCue } from './types';

export type BatchSubTabId = 'studio' | 'creator' | 'translation' | 'reading';

export interface ParsedCreatorBatchPayload {
  subTab: 'creator' | 'translation';
  title: string;
  learningLanguage: LearningLanguageId;
  cards: ReelCard[];
  sceneJsonOverride?: FlexibleSceneDocument;
}

export interface ParsedReadingBatchPayload {
  subTab: 'reading';
  title: string;
  topicBadge: string;
  level: string;
  text: string;
  learningLanguage: LearningLanguageId;
  uiStrings: ReadingUiStrings;
}

export interface BatchTtsSegmentSpec {
  id: string;
  text: string;
  pauseAfterSec?: number;
  voice?: string;
  lang?: string;
  autoSplit?: boolean;
}

export interface BatchCardSegmentMapping {
  qIdx: number | null;
  explIdx: number | null;
  aIdx: number | null;
  repeatIndices?: number[];
  thinkSec: number;
  isOutro: boolean;
  isTranslation?: boolean;
}

export function detectLearningLanguageFromText(
  text: string,
  fallback: LearningLanguageId = 'en',
): LearningLanguageId {
  const s = (text || '').trim();
  if (!s) return fallback;
  if (/[\u3040-\u30ff\u31f0-\u31ff]/.test(s)) return 'ja';
  if (/[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/.test(s)) return 'ko';
  if (/[\u4e00-\u9faf\u3400-\u4dbf]/.test(s)) return 'zh';
  if (/[ñ¿¡]/i.test(s)) return 'es';
  if (/[çœæàâèêëîïôùûü]/i.test(s)) return 'fr';
  if (/[áéíóúü]/i.test(s) && !/[àâèêëîïôù]/i.test(s)) return 'es';
  const lower = s.toLowerCase();
  if (/\b(?:bonjour|merci|avec|pour|nous|vous|c'est|est-ce|aujourd'hui|allez-vous|dans|une|très)\b/i.test(lower)) {
    return 'fr';
  }
  if (/\b(?:hola|gracias|buenos|dias|donde|como|estas|para|pero|muy|porque|tambien)\b/i.test(lower)) {
    return 'es';
  }
  return fallback;
}

export function getDefaultVoiceMetaForLang(lang: LearningLanguageId): {
  voice: string;
  voiceLang: string;
} {
  const meta =
    LEARNING_LANGUAGE_OPTIONS.find((l) => l.id === lang) || LEARNING_LANGUAGE_OPTIONS[0];
  return {
    voice: meta.defaultVoice,
    voiceLang: meta.voiceLang,
  };
}

export function sanitizeBatchSpeechText(text?: string): string {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]/g, ' $1 ')
    .replace(/\{([^}]+)\}/g, ' $1 ')
    .replace(/[*_`~#<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripBatchParenthesizedPinyinIfCjk(text: string, voiceLang: string): string {
  const isCjkOrKo = /^(zh|ja|ko)/i.test(voiceLang);
  if (!isCjkOrKo) return text;
  const cleaned = text
    .replace(/\s*\([^)]*[A-Za-z0-9āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ][^)]*\)/g, '')
    .replace(/\s*（[^）]*[A-Za-z0-9āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ][^）]*）/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || text;
}

function shouldAutoSplitBatchSpeech(
  text: string,
  ownLang: string,
  partnerLang: string,
): boolean | undefined {
  const clean = text.trim();
  if (!clean) return undefined;
  const ownBase = ownLang.split('-')[0].toLowerCase();
  const partnerBase = partnerLang.split('-')[0].toLowerCase();
  if (ownBase === 'vi') {
    if (partnerBase === 'ja' && /[\u3040-\u30ff\u4e00-\u9faf]/.test(clean)) return true;
    if (partnerBase === 'zh' && /[\u4e00-\u9faf]/.test(clean)) return true;
    if (partnerBase === 'ko' && /[\uac00-\ud7af]/.test(clean)) return true;
    if (/[A-Za-z]{2,}/.test(clean)) return true;
    return false;
  }
  return undefined;
}

/**
 * Splits a raw string that may contain one JSON object, a JSON array of lesson/reading
 * objects, or multiple back-to-back JSON/fenced objects pasted into one batch drop.
 */
export function splitMultiJsonInputs(rawText: string): string[] {
  const raw = rawText.trim();
  if (!raw) return [];

  // Strip outer markdown fences if whole payload is fenced once
  const unfencedWhole = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  // Check top-level JSON array of distinct lesson objects
  if (unfencedWhole.startsWith('[') && unfencedWhole.endsWith(']')) {
    try {
      const parsed = JSON.parse(unfencedWhole);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((x) => x && typeof x === 'object')) {
        // Distinguish between a bare array of Reel cards vs an array of independent lessons
        const looksLikeMultiLessons = parsed.some(
          (item: Record<string, unknown>) =>
            Array.isArray(item.cards) ||
            Array.isArray(item.items) ||
            typeof item.text === 'string' ||
            typeof item.passage === 'string',
        );
        if (looksLikeMultiLessons) {
          return parsed.map((item) => JSON.stringify(item, null, 2));
        }
        return [unfencedWhole];
      }
    } catch {
      // fall through to balanced-brace scanning
    }
  }

  // Extract fenced blocks first if >= 2 fenced json blocks exist
  const fencedMatches = Array.from(raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi))
    .map((m) => m[1].trim())
    .filter(Boolean);
  if (fencedMatches.length >= 2) {
    return fencedMatches;
  }

  // Balanced-brace scanner for concatenated JSON objects `{...} {...}`
  const chunks: string[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let startIdx = -1;

  for (let i = 0; i < unfencedWhole.length; i++) {
    const ch = unfencedWhole[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') {
      if (depth === 0) startIdx = i;
      depth++;
    } else if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0 && startIdx >= 0) {
        chunks.push(unfencedWhole.slice(startIdx, i + 1));
        startIdx = -1;
      }
    }
  }

  if (chunks.length > 0) return chunks;
  return [raw];
}

export function parseCreatorOrTranslationBatchInput(
  rawText: string,
  options: {
    mode: 'creator' | 'translation';
    fileName?: string;
    fallbackLang?: LearningLanguageId;
  },
): ParsedCreatorBatchPayload | null {
  let normalizedText = rawText;
  try {
    const cleaned = rawText
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    const obj = JSON.parse(cleaned) as Record<string, unknown>;
    if (obj && typeof obj === 'object' && !Array.isArray(obj) && !Array.isArray(obj.cards) && Array.isArray(obj.items)) {
      const convertedCards = (obj.items as Array<Record<string, unknown>>).map((it) => {
        if (options.mode === 'translation' || it.prompt || it.sourcePrompt || it.answer || it.target) {
          return {
            type: 'translation',
            title: String(it.answer || it.target || it.title || it.content || ''),
            sourcePrompt: String(it.prompt || it.sourcePrompt || it.source || ''),
            translation: String(it.meaning || it.translation || it.prompt || ''),
            ttsText: String(it.ttsText || it.answer || it.target || ''),
            explanationSpeech: typeof it.explanationSpeech === 'string' ? it.explanationSpeech : undefined,
            thinkSec: typeof it.thinkSec === 'number' ? it.thinkSec : undefined,
            repeatCount: typeof it.repeatCount === 'number' ? it.repeatCount : undefined,
          };
        }
        return { type: 'vocab', ...it };
      });
      normalizedText = JSON.stringify({
        ...obj,
        mode: options.mode === 'translation' ? 'translation' : obj.mode || 'vocab',
        cards: convertedCards,
      });
    }
  } catch {
    // Let parseEnglishReelsAiJson handle fences / plain text
  }

  const parsed = parseEnglishReelsAiJson(normalizedText);
  if (!parsed || parsed.cards.length === 0) return null;

  const detectedLang =
    parsed.learningLang ||
    inferLearningLangFromCards(parsed.cards, options.fallbackLang || 'en');
  const fallbackStem = options.fileName
    ? options.fileName.replace(/\.[^.]+$/, '').trim()
    : 'Batch Lesson';
  const cleanTitle = cleanOutputTitleStem(parsed.title || fallbackStem, 'Batch Lesson');

  return {
    subTab: options.mode,
    title: cleanTitle,
    learningLanguage: detectedLang,
    cards: parsed.cards,
    sceneJsonOverride: parsed.sceneJson || undefined,
  };
}

export function parseReadingBatchInput(
  rawText: string,
  options?: {
    fileName?: string;
    fallbackLang?: LearningLanguageId;
    fallbackLevel?: string;
  },
): ParsedReadingBatchPayload | null {
  const parsed = parseReadingWebAiResponse(rawText, options?.fallbackLevel || 'B1');
  if (!parsed || !parsed.text.trim()) return null;

  const detectedLang = detectLearningLanguageFromText(
    `${parsed.title}\n${parsed.text}`,
    options?.fallbackLang || 'en',
  );
  const uiStrings = getReadingUiStrings(detectedLang);
  const fallbackStem = options?.fileName
    ? options.fileName.replace(/\.[^.]+$/, '').trim()
    : uiStrings.introDefaultTitle;
  const cleanTitle =
    parsed.title && parsed.title !== 'Custom Web Reading'
      ? parsed.title
      : cleanOutputTitleStem(fallbackStem, uiStrings.introDefaultTitle);

  return {
    subTab: 'reading',
    title: cleanTitle,
    topicBadge: parsed.topicBadge,
    level: parsed.level || options?.fallbackLevel || 'B1',
    text: parsed.text,
    learningLanguage: detectedLang,
    uiStrings,
  };
}

export function buildBatchTtsSegmentsForReelCards(
  cards: ReelCard[],
  opts: {
    learningLanguage: LearningLanguageId;
    enableDualTts: boolean;
    explVoice?: string;
    explLang?: string;
    targetVoiceOverride?: string;
    targetVoiceLangOverride?: string;
    defaultThinkSec?: number;
    defaultRepeatCount?: number;
    outroWatermarkSpeech?: string;
  },
): {
  segments: BatchTtsSegmentSpec[];
  cardMapping: BatchCardSegmentMapping[];
  extraOutroIdx: number;
  lessonVoice: string;
  lessonVoiceLang: string;
  explVoice: string;
  explLang: string;
} {
  const defaultTarget = getDefaultVoiceMetaForLang(opts.learningLanguage);
  const lessonVoice = opts.targetVoiceOverride || defaultTarget.voice;
  const lessonVoiceLang = opts.targetVoiceLangOverride || defaultTarget.voiceLang;
  const explVoice = opts.explVoice || 'vi-VN-HoaiMyNeural';
  const explLang = opts.explLang || 'vi-VN';

  const segments: BatchTtsSegmentSpec[] = [];
  const cardMapping: BatchCardSegmentMapping[] = [];
  let quizOrd = 0;

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const explSpeech = sanitizeBatchSpeechText(c.explanationSpeech);

    if (c.type === 'translation') {
      const promptSpeech =
        sanitizeBatchSpeechText(c.sourcePrompt || c.translation || c.title) || 'Hãy dịch câu sau.';
      const answerSpeech = stripBatchParenthesizedPinyinIfCjk(
        sanitizeBatchSpeechText(c.ttsText || c.content || c.title) || 'Practice speaking aloud.',
        lessonVoiceLang,
      );
      const cardThink = Math.max(0, Math.min(15, c.thinkSec ?? opts.defaultThinkSec ?? 4));
      const cardReps = Math.max(1, Math.min(5, c.repeatCount ?? opts.defaultRepeatCount ?? 2));
      const nuanceTip =
        opts.enableDualTts &&
        c.explanationSpeech &&
        c.explanationSpeech.trim().toLowerCase() !== promptSpeech.toLowerCase()
          ? sanitizeBatchSpeechText(c.explanationSpeech)
          : '';

      const qIdx = segments.length;
      segments.push({
        id: `${c.id}-q`,
        text: promptSpeech,
        pauseAfterSec: cardThink,
        voice: opts.enableDualTts ? explVoice : lessonVoice,
        lang: opts.enableDualTts ? explLang : lessonVoiceLang,
        autoSplit: opts.enableDualTts
          ? shouldAutoSplitBatchSpeech(promptSpeech, explLang, lessonVoiceLang)
          : undefined,
      });

      const repeatIndices: number[] = [];
      for (let r = 0; r < cardReps; r++) {
        repeatIndices.push(segments.length);
        segments.push({
          id: `${c.id}-r${r}`,
          text: answerSpeech,
          pauseAfterSec: r < cardReps - 1 ? 0.55 : nuanceTip ? 0.25 : 0.35,
          voice: lessonVoice,
          lang: lessonVoiceLang,
          autoSplit: shouldAutoSplitBatchSpeech(answerSpeech, lessonVoiceLang, explLang),
        });
      }

      let explIdx: number | null = null;
      if (nuanceTip) {
        explIdx = segments.length;
        segments.push({
          id: `${c.id}-expl`,
          text: nuanceTip,
          pauseAfterSec: 0.3,
          voice: explVoice,
          lang: explLang,
          autoSplit: shouldAutoSplitBatchSpeech(nuanceTip, explLang, lessonVoiceLang),
        });
      }
      cardMapping.push({
        qIdx,
        explIdx,
        aIdx: null,
        repeatIndices,
        thinkSec: cardThink,
        isOutro: false,
        isTranslation: true,
      });
    } else if (c.type === 'quiz' && c.options && c.options.length > 0) {
      quizOrd += 1;
      const { questionSpeech, answerSpeech, thinkSec } = getQuizCardSpeechParts(c, quizOrd);
      const cleanQ = stripBatchParenthesizedPinyinIfCjk(questionSpeech || 'Quiz question.', lessonVoiceLang);
      const qIdx = segments.length;
      segments.push({
        id: `${c.id}-q`,
        text: cleanQ,
        pauseAfterSec: thinkSec,
        voice: lessonVoice,
        lang: lessonVoiceLang,
        autoSplit: opts.enableDualTts
          ? shouldAutoSplitBatchSpeech(cleanQ, lessonVoiceLang, explLang)
          : undefined,
      });
      let aIdx: number | null = null;
      if (answerSpeech) {
        const cleanA = stripBatchParenthesizedPinyinIfCjk(answerSpeech, lessonVoiceLang);
        aIdx = segments.length;
        segments.push({
          id: `${c.id}-a`,
          text: cleanA,
          pauseAfterSec: 0,
          voice: lessonVoice,
          lang: lessonVoiceLang,
          autoSplit: opts.enableDualTts
            ? shouldAutoSplitBatchSpeech(cleanA, lessonVoiceLang, explLang)
            : undefined,
        });
      }
      let explIdx: number | null = null;
      if (
        opts.enableDualTts &&
        explSpeech &&
        explSpeech.toLowerCase() !== (answerSpeech || '').toLowerCase()
      ) {
        explIdx = segments.length;
        segments.push({
          id: `${c.id}-expl`,
          text: explSpeech,
          pauseAfterSec: 0,
          voice: explVoice,
          lang: explLang,
          autoSplit: shouldAutoSplitBatchSpeech(explSpeech, explLang, lessonVoiceLang),
        });
      }
      cardMapping.push({ qIdx, explIdx, aIdx, thinkSec, isOutro: false });
    } else if (opts.enableDualTts && (c.type === 'intro' || c.type === 'transition' || c.type === 'outro')) {
      const explOnly =
        sanitizeBatchSpeechText(c.explanationSpeech || c.translation || c.content || c.title) ||
        (c.type === 'outro'
          ? 'Cảm ơn bạn đã theo dõi bài học.'
          : c.type === 'transition'
            ? 'Tiếp theo.'
            : 'Chào mừng bạn đến với bài học.');
      const explIdx = segments.length;
      segments.push({
        id: `${c.id}-expl`,
        text: explOnly,
        pauseAfterSec: 0,
        voice: explVoice,
        lang: explLang,
        autoSplit: shouldAutoSplitBatchSpeech(explOnly, explLang, lessonVoiceLang),
      });
      cardMapping.push({ qIdx: null, explIdx, aIdx: null, thinkSec: 0, isOutro: c.type === 'outro' });
    } else {
      const cleanSpeech = stripBatchParenthesizedPinyinIfCjk(
        sanitizeBatchSpeechText(c.ttsText || c.content || c.title) || 'Next lesson point.',
        lessonVoiceLang,
      );
      const qIdx = segments.length;
      segments.push({
        id: c.id,
        text: cleanSpeech,
        pauseAfterSec: 0,
        voice: lessonVoice,
        lang: lessonVoiceLang,
        autoSplit: opts.enableDualTts
          ? shouldAutoSplitBatchSpeech(cleanSpeech, lessonVoiceLang, explLang)
          : undefined,
      });
      let explIdx: number | null = null;
      if (opts.enableDualTts && explSpeech && explSpeech.toLowerCase() !== cleanSpeech.toLowerCase()) {
        explIdx = segments.length;
        segments.push({
          id: `${c.id}-expl`,
          text: explSpeech,
          pauseAfterSec: 0,
          voice: explVoice,
          lang: explLang,
          autoSplit: shouldAutoSplitBatchSpeech(explSpeech, explLang, lessonVoiceLang),
        });
      }
      cardMapping.push({ qIdx, explIdx, aIdx: null, thinkSec: 0, isOutro: c.type === 'outro' });
    }
  }

  const cleanOutroSpeech = sanitizeBatchSpeechText(opts.outroWatermarkSpeech);
  const extraOutroIdx =
    cleanOutroSpeech && !cards.some((c) => c.type === 'outro') ? segments.length : -1;
  if (extraOutroIdx >= 0) {
    segments.push({
      id: 'watermark-outro-speech',
      text: cleanOutroSpeech,
      pauseAfterSec: 0.4,
      voice: opts.enableDualTts ? explVoice : lessonVoice,
      lang: opts.enableDualTts ? explLang : lessonVoiceLang,
      autoSplit: opts.enableDualTts
        ? shouldAutoSplitBatchSpeech(cleanOutroSpeech, explLang, lessonVoiceLang)
        : undefined,
    });
  }

  return {
    segments,
    cardMapping,
    extraOutroIdx,
    lessonVoice,
    lessonVoiceLang,
    explVoice,
    explLang,
  };
}

export function mapBatchSynthesisDurations(
  cardMapping: BatchCardSegmentMapping[],
  segDurs: number[],
  spokenDurs: number[],
  pauseDurs: number[],
  extraOutroIdx: number,
): {
  timings: ReelCardTimingMeta[];
  durations: number[];
  speechWindows: Array<{ start: number; end: number }>;
  outroStartSec?: number;
} {
  const speechWindows: Array<{ start: number; end: number }> = [];
  let outroStartSec: number | undefined;
  let winCursor = 0;

  const timings: ReelCardTimingMeta[] = cardMapping.map((m) => {
    if (m.isTranslation && m.repeatIndices && m.repeatIndices.length > 0) {
      const qSpoken = m.qIdx !== null ? spokenDurs[m.qIdx] ?? segDurs[m.qIdx] ?? 2.5 : 0;
      const pDur = m.qIdx !== null ? pauseDurs[m.qIdx] ?? m.thinkSec : m.thinkSec;
      const repeatDurationsSec = m.repeatIndices.map(
        (rIdx) => spokenDurs[rIdx] ?? segDurs[rIdx] ?? 2.4,
      );
      const firstPause =
        m.repeatIndices.length > 1 ? pauseDurs[m.repeatIndices[0]] ?? 0.55 : 0;
      let ansSpan = 0;
      if (qSpoken > 0.05) {
        speechWindows.push({ start: winCursor, end: winCursor + qSpoken });
      }
      let repWinCursor = winCursor + qSpoken + pDur;
      m.repeatIndices.forEach((rIdx, posIdx) => {
        const spoken = repeatDurationsSec[posIdx];
        const pause = pauseDurs[rIdx] ?? (posIdx < m.repeatIndices!.length - 1 ? 0.55 : 0.25);
        if (spoken > 0.05) {
          speechWindows.push({ start: repWinCursor, end: repWinCursor + spoken });
        }
        repWinCursor += spoken + pause;
        ansSpan += spoken + pause;
      });
      const nuanceSec = m.explIdx !== null ? segDurs[m.explIdx] ?? 0 : 0;
      if (nuanceSec > 0.05) {
        speechWindows.push({ start: repWinCursor, end: repWinCursor + nuanceSec });
        ansSpan += nuanceSec;
      }
      const totalSec = Number(Math.max(1.5, qSpoken + pDur + ansSpan).toFixed(3));
      winCursor += totalSec + 0.08;
      return {
        totalSec,
        questionSec: qSpoken,
        thinkSec: pDur,
        answerSec: Number(ansSpan.toFixed(3)),
        repeatDurationsSec,
        repeatPauseSec: firstPause,
        nuanceSec,
      };
    }

    const qSpoken = m.qIdx !== null ? spokenDurs[m.qIdx] ?? segDurs[m.qIdx] ?? 2.8 : 0;
    const pDur = m.qIdx !== null ? pauseDurs[m.qIdx] ?? 0 : 0;
    const aSpoken = m.aIdx !== null ? segDurs[m.aIdx] ?? 2.6 : undefined;
    const explDur = m.explIdx !== null ? segDurs[m.explIdx] ?? 0 : 0;
    const isQuiz = m.aIdx !== null;
    const totalSec = Number(
      Math.max(1.2, qSpoken + pDur + (aSpoken ?? 0) + explDur).toFixed(3),
    );
    if (m.isOutro) outroStartSec = winCursor;
    if (qSpoken > 0.05) {
      speechWindows.push({ start: winCursor, end: winCursor + qSpoken });
    }
    if (isQuiz && aSpoken && aSpoken > 0.05) {
      const ansStart = winCursor + qSpoken + pDur;
      speechWindows.push({ start: ansStart, end: ansStart + aSpoken });
      if (explDur > 0.05) {
        speechWindows.push({ start: ansStart + aSpoken, end: ansStart + aSpoken + explDur });
      }
    } else if (!isQuiz && explDur > 0.05) {
      speechWindows.push({ start: winCursor + qSpoken, end: winCursor + qSpoken + explDur });
    }
    winCursor += totalSec + 0.08;
    return {
      totalSec,
      questionSec: isQuiz ? qSpoken : undefined,
      thinkSec: isQuiz ? pDur : undefined,
      answerSec: isQuiz ? Number(((aSpoken ?? 0) + explDur).toFixed(3)) : undefined,
    };
  });

  if (extraOutroIdx >= 0 && segDurs[extraOutroIdx]) {
    outroStartSec = winCursor;
    speechWindows.push({ start: winCursor, end: winCursor + segDurs[extraOutroIdx] });
  }

  return {
    timings,
    durations: timings.map((t) => t.totalSec),
    speechWindows,
    outroStartSec,
  };
}

export function mapBatchWordBoundariesToProjectCues(
  projCues: TranscriptCue[],
  cardMapping: BatchCardSegmentMapping[],
  dataCues: TranscriptCue[],
): TranscriptCue[] {
  let projCueCursor = 0;
  const mappedWordsByProjCue: Array<Array<{ word: string; start: number; end: number }>> = [];
  for (const m of cardMapping) {
    if (m.isTranslation && m.repeatIndices && m.repeatIndices.length > 0) {
      const qWords = m.qIdx !== null ? dataCues[m.qIdx]?.words ?? [] : [];
      mappedWordsByProjCue[projCueCursor++] = qWords.map((w) => ({ ...w }));
      for (const rIdx of m.repeatIndices) {
        const rWords = dataCues[rIdx]?.words ?? [];
        mappedWordsByProjCue[projCueCursor++] = rWords.map((w) => ({ ...w }));
      }
      if (m.explIdx !== null) {
        const eWords = dataCues[m.explIdx]?.words ?? [];
        mappedWordsByProjCue[projCueCursor++] = eWords.map((w) => ({ ...w }));
      }
    } else if (m.aIdx !== null) {
      const qWords = m.qIdx !== null ? dataCues[m.qIdx]?.words ?? [] : [];
      mappedWordsByProjCue[projCueCursor++] = qWords.map((w) => ({ ...w }));
      const aWords = dataCues[m.aIdx]?.words ?? [];
      const eWords = m.explIdx !== null ? dataCues[m.explIdx]?.words ?? [] : [];
      mappedWordsByProjCue[projCueCursor++] = [...aWords, ...eWords].map((w) => ({ ...w }));
    } else {
      const qWords = m.qIdx !== null ? dataCues[m.qIdx]?.words ?? [] : [];
      const eWords = m.explIdx !== null ? dataCues[m.explIdx]?.words ?? [] : [];
      mappedWordsByProjCue[projCueCursor++] = [...qWords, ...eWords].map((w) => ({ ...w }));
    }
  }
  return projCues.map((orig, idx) => {
    const mapped = mappedWordsByProjCue[idx];
    if (mapped && mapped.length > 0) {
      return { ...orig, words: mapped };
    }
    return orig;
  });
}

export function parseTopicLinesInput(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]+|\d+[.):])\s*/, '').trim())
    .filter(Boolean);
}

const BATCH_PROMPT_ZIP_NAMES: Record<BatchSubTabId, string> = {
  studio: 'Prompts_Tab_1_Studio.zip',
  creator: 'Prompts_Tab_2_AI_Creator.zip',
  translation: 'Prompts_Tab_3_Phan_Xa_Dich.zip',
  reading: 'Prompts_Tab_4_Doc_Theo_Chu.zip',
};

const BATCH_PROMPT_SUBFOLDERS: Record<BatchSubTabId, string> = {
  studio: 'Prompts/Tab-1-Studio',
  creator: 'Prompts/Tab-2-AI-Creator',
  translation: 'Prompts/Tab-3-Phan-Xa-Dich',
  reading: 'Prompts/Tab-4-Doc-Theo-Chu',
};

export function buildBatchPromptZipName(subTab: BatchSubTabId): string {
  return BATCH_PROMPT_ZIP_NAMES[subTab] || 'Prompts_Tab_Batch.zip';
}

export function getBatchPromptSubfolder(subTab: BatchSubTabId): string {
  return BATCH_PROMPT_SUBFOLDERS[subTab] || 'Prompts/Tab-Batch';
}

const DEFAULT_BATCH_TOPIC_IDEAS = [
  'Sound More Natural with Everyday Phrasal Verbs',
  'Polite Disagreement & Softening Requests at Work',
  'Common Learner Mistakes vs Native Expressions',
  'Small Talk & Ordering Smoothly at a Cafe',
  'Expressing Emotions Nuancedly Without Basic Adjectives',
  'Storytelling Connectors That Sound Effortless',
  'Airport, Hotel & Travel Problem-Solving',
  'Reacting Naturally in Casual Conversations',
  'Time & Routine Habits That Boost Clarity',
  'Upgrade Overused Textbook Greetings & Goodbyes',
];

function buildStudioBatchPrompt(params: {
  topic: string;
  learningLanguage: LearningLanguageId;
  level: string;
  durationMinutes: number;
  targetLang: string;
  style?: PromptVideoStyle;
  compositionId?: LayoutCompositionId | 'ai-decide';
  aspectRatio?: ExportAspectRatioId;
}): string {
  const langMeta =
    LEARNING_LANGUAGE_OPTIONS.find((item) => item.id === params.learningLanguage) ||
    LEARNING_LANGUAGE_OPTIONS[0];
  const approxCuesCount = Math.max(4, Math.min(24, Math.round(params.durationMinutes * 3)));
  const segStepSec = Number(((params.durationMinutes * 60) / approxCuesCount).toFixed(2));
  const syntheticCues: TranscriptCue[] = Array.from({ length: Math.min(6, approxCuesCount) }, (_, idx) => {
    const start = Number((idx * segStepSec).toFixed(2));
    const end = Number(((idx + 1) * segStepSec).toFixed(2));
    return {
      id: `seg_${String(idx + 1).padStart(3, '0')}`,
      start,
      end,
      text: `[Segment ${idx + 1} placeholder for ${langMeta.nativeName} script about "${params.topic}" at level ${params.level}]`,
      words: [],
    };
  });

  const baseStoryboardPrompt = buildSceneGenerationPrompt(syntheticCues, {
    title: params.topic,
    style: params.style ?? 'tiktok-cards',
    compositionId: params.compositionId ?? 'ai-decide',
    targetDurationMinutes: params.durationMinutes,
  });

  return `# BÀI GIẢNG STUDIO TỰ ĐỘNG (TAB 1 STUDIO · ${params.aspectRatio || '9:16'})
- Chủ đề trọng tâm: **${params.topic}**
- Ngôn ngữ học: **${langMeta.label}** · Trình độ: **${params.level}**
- Ngôn ngữ giải thích phụ đề/thẻ: **${params.targetLang === 'none' ? 'Pure target language' : params.targetLang === 'learning' ? `${langMeta.nativeName} (giải thích bằng ngôn ngữ muốn học)` : params.targetLang}**
- Thời lượng mục tiêu: **${params.durationMinutes} phút (~${Math.round(params.durationMinutes * 60)} giây)**
- Lưu ý: Nếu chưa có audio sẵn, hãy tự viết toàn bộ kịch bản \`source_segments[]\` (${approxCuesCount} segments phân bổ đều trong **~${Math.round(params.durationMinutes * 60)} giây**) với nội dung sư phạm sâu (giải thích lý do tự nhiên, đối chiếu lỗi thường gặp, sắc thái & ví dụ thực tế) thay thế các segment placeholder bên dưới rồi dựng trọn vẹn JSON \`schema_version: "1.9"\`.

${baseStoryboardPrompt}`;
}

export function pickBatchItemDurationMinutes(options: {
  durationMode?: 'fixed' | 'random';
  durationMinutes?: number;
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
  rng?: () => number;
}): number {
  const clampMin = (val: number) => Math.max(0.5, Math.min(30, val));
  if (options.durationMode === 'random') {
    const lo = clampMin(Number(options.minDurationMinutes ?? options.durationMinutes ?? 1) || 1);
    const hi = clampMin(Number(options.maxDurationMinutes ?? options.durationMinutes ?? 5) || lo);
    const minVal = Math.min(lo, hi);
    const maxVal = Math.max(lo, hi);
    const rand = (options.rng ? options.rng() : Math.random());
    // Round to nearest 0.5 minute so durations stay clean (e.g., 1.5m, 3m, 5m)
    const stepped = Math.round((minVal + rand * (maxVal - minVal)) * 2) / 2;
    return Number(clampMin(stepped).toFixed(1));
  }
  return Number(clampMin(Number(options.durationMinutes ?? 2) || 2).toFixed(1));
}

export function generateBatchPromptsForTopics(options: {
  subTab: BatchSubTabId;
  topics: string[];
  promptCount?: number;
  learningLanguage: LearningLanguageId;
  level?: string;
  durationMode?: 'fixed' | 'random';
  durationMinutes?: number;
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
  targetLang?: string;
  aspectRatio?: ExportAspectRatioId;
  style?: PromptVideoStyle;
  compositionId?: LayoutCompositionId | 'ai-decide';
  formatPreference?: CreatorFormatCategory;
  thinkSec?: number;
  repeatCount?: number;
  readingFormat?: ReadingFormatCategory;
  rng?: () => number;
}): Array<{ fileName: string; topic: string; durationMinutes: number; promptText: string }> {
  const userTopics = options.topics.map((t) => t.trim()).filter(Boolean);
  const desiredCount = Math.max(
    1,
    Math.min(30, Math.round(options.promptCount ?? (userTopics.length > 0 ? userTopics.length : 5))),
  );
  const resolvedLevel = options.level?.trim() || 'B1';
  const resolvedTopics: string[] = Array.from({ length: desiredCount }, (_, idx) => {
    if (idx < userTopics.length) return userTopics[idx];
    const seed = DEFAULT_BATCH_TOPIC_IDEAS[idx % DEFAULT_BATCH_TOPIC_IDEAS.length];
    return `${seed} (${resolvedLevel} #${idx + 1})`;
  });

  const targetLang = options.targetLang ?? 'vi';

  return resolvedTopics.map((topic, index) => {
    const indexPrefix = String(index + 1).padStart(2, '0');
    const durationMinutes = pickBatchItemDurationMinutes({
      durationMode: options.durationMode,
      durationMinutes: options.durationMinutes,
      minDurationMinutes: options.minDurationMinutes,
      maxDurationMinutes: options.maxDurationMinutes,
      rng: options.rng,
    });

    let promptText = '';
    if (options.subTab === 'studio') {
      promptText = buildStudioBatchPrompt({
        topic,
        learningLanguage: options.learningLanguage,
        level: resolvedLevel,
        durationMinutes,
        targetLang,
        style: options.style,
        compositionId: options.compositionId,
        aspectRatio: options.aspectRatio || '9:16',
      });
    } else if (options.subTab === 'creator') {
      promptText = buildAiCreatorWebAiPrompt({
        topicHint: topic,
        learningLanguage: options.learningLanguage,
        level: resolvedLevel,
        durationMinutes,
        itemCount: 'auto',
        targetLang,
        formatPreference: options.formatPreference || 'auto',
        compositionId: options.compositionId || 'ai-decide',
        aspectRatio: options.aspectRatio || '9:16',
        includeExplanationSpeech: targetLang !== 'none',
        splitAudioByRole: targetLang !== 'none',
        includeQuiz: true,
      });
    } else if (options.subTab === 'translation') {
      promptText = buildTranslationChallengePrompt({
        topicHint: topic,
        learningLanguage: options.learningLanguage,
        level: resolvedLevel,
        durationMinutes,
        itemCount: 'auto',
        targetLang: targetLang === 'none' ? 'vi' : targetLang,
        thinkSec: options.thinkSec ?? 4,
        repeatCount: options.repeatCount ?? 2,
        includeNuanceTip: true,
        compositionId: options.compositionId || 'ai-decide',
        aspectRatio: options.aspectRatio || '9:16',
      });
    } else {
      promptText = buildReadingWebAiPrompt({
        mode: 'topic',
        learningLanguage: options.learningLanguage as ReadingLearningLang,
        formatPreference: options.readingFormat || 'auto',
        topic,
        level: resolvedLevel,
        durationMinutes,
      });
    }

    const baseFile = cleanDownloadFileName(
      `${indexPrefix}_${durationMinutes}m_${topic}`,
      'prompt.txt',
      `Prompt_${indexPrefix}_${durationMinutes}m`,
    );
    return {
      fileName: baseFile,
      topic,
      durationMinutes,
      promptText,
    };
  });
}
