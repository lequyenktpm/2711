import type { VectorPrimitive } from './customComponentTypes';
import { parseTimeToken } from './transcriptParser';
import {
  CanvasThemeId,
  CartoonAnimationDefinition,
  CartoonAnimationParams,
  CartoonExpressionMood,
  ComparisonItem,
  DynamicSceneSpec,
  EnterAnimation,
  ExitAnimation,
  IllustrationPropData,
  IllustrationSceneIcon,
  IllustrationVariant,
  LayoutCompositionId,
  Shape3DType,
  TranscriptCue,
  WordTiming,
} from './types';
import { ALL_SCENE_ICONS, pickContextualSceneIcon } from './vectorComponentDb';

export interface StoryboardSourceSegment {
  segment_id: string;
  start: number;
  end: number;
  text: string;
}

export type StoryboardAnchorType =
  | 'segment_start'
  | 'phrase'
  | 'segment_end'
  | 'full_segment';

export interface StoryboardSyncAnchor {
  segment_id: string;
  anchor_type?: StoryboardAnchorType;
  quote?: string;
  offset_s?: number;
}

export interface StoryboardPosition {
  x: number; // normalized 0..1 (left)
  y: number; // normalized 0..1 (top)
  width: number; // normalized 0..1
  height: number; // normalized 0..1
}

export type StoryboardElementKind =
  | 'text'
  | 'illustration'
  | 'object'
  | 'connector'
  | 'asset'
  | 'card'
  | 'sentence_card'
  | 'pill'
  | 'topic_pill'
  | 'strip'
  | 'comparison_strip'
  | 'meter'
  | 'tone_meter'
  | 'word_stack'
  | 'shape_3d'
  | 'staircase_3d'
  | (string & {});

export interface StoryboardAnimation {
  in?: string;
  out?: string;
  duration_s?: number;
}

export interface StoryboardStyle {
  bgColor?: string;
  textColor?: string;
  accentColor?: string;
  borderColor?: string;
  fill?: string;
  depth?: number;
  fontSize?: number;
  text_effect?: string;
  badge?: 'check' | 'cross' | 'question' | 'none';
  stampText?: string;
  stampColor?: string;
  emphasisWord?: string;
  emphasisColor?: string;
  strokeColor?: string;
  lineWidth?: number;
  align?: 'left' | 'center' | 'right';
}

export interface StoryboardConnectorSpec {
  from?: string;
  to?: string;
  direction?: 'right' | 'left' | 'down' | 'up';
  label?: string;
  arrow?: boolean;
  dashed?: boolean;
}

export interface StoryboardV19Element {
  element_id: string;
  kind: StoryboardElementKind;
  role?: string;
  content?: string;
  text?: string;
  subtext?: string;
  variant?: IllustrationVariant;
  asset_id?: string;
  sceneIcon?: IllustrationSceneIcon | string;
  shape_type?: Shape3DType;
  sync_anchor?: StoryboardSyncAnchor;
  position?: StoryboardPosition;
  style?: StoryboardStyle;
  animation?: StoryboardAnimation;
  // Optional overrides or structured component props
  start_s?: number;
  end_s?: number;
  start?: string | number;
  end?: string | number;
  data?: IllustrationPropData;
  dynamicScene?: DynamicSceneSpec;
  customPrimitives?: VectorPrimitive[];
  object_spec?: {
    label?: string;
    sublabel?: string;
    icon?: string;
    primitives?: VectorPrimitive[];
  };
  connector_spec?: StoryboardConnectorSpec;
  items?: (Omit<ComparisonItem, 'activateAt'> & {
    activateAt?: string | number;
    sync_anchor?: StoryboardSyncAnchor;
  })[];
  rows?: Array<{
    prefix: string;
    suffix?: string;
    suffixColor?: string;
    appearAt?: string | number;
    phonetic?: string;
    sync_anchor?: StoryboardSyncAnchor;
  }>;
  labels?: string[];
  title?: string;
  subtitle?: string;
  formula?: string;
  value?: number;
  leftLabel?: string;
  rightLabel?: string;
  valueStart?: number;
  valueEnd?: number;
  step_labels?: string[];
  stepLabels?: string[];
  highlightWord?: string;
  speechText?: string;
  cartoonAction?: string;
  cartoonMood?: CartoonExpressionMood;
  cartoonAnimationSpec?: Partial<CartoonAnimationParams>;
}

export interface StoryboardV19Scene {
  scene_id: string;
  id?: string;
  title?: string;
  learning_objective?: string;
  composition?: LayoutCompositionId;
  transition?: string;
  cartoonAction?: string;
  cartoonMood?: CartoonExpressionMood;
  cartoonAnimationSpec?: Partial<CartoonAnimationParams>;
  elements: StoryboardV19Element[];
}

export interface StoryboardStyleProfile {
  palette?: string;
  primaryAccent?: string;
  secondaryAccent?: string;
  cardStyle?: string;
  typography?: string;
}

export interface StoryboardV19Document {
  schema_version?: string;
  title?: string;
  theme?: CanvasThemeId;
  compositionId?: LayoutCompositionId;
  compositionReason?: string;
  style_profile?: StoryboardStyleProfile;
  cartoonAnimations?: Partial<CartoonAnimationDefinition>[];
  source_segments: StoryboardSourceSegment[];
  scenes: StoryboardV19Scene[];
}

const VALID_SCENE_ICON_SET = new Set<string>(ALL_SCENE_ICONS);

export const SCENE_ICON_ALIAS_MAP: Record<string, IllustrationSceneIcon> = {
  lightbulb: 'lightning',
  bulb: 'sparkles',
  idea: 'sparkles',
  tree: 'globe',
  leaf: 'globe',
  nature: 'sun',
  plant: 'sun',
  person: 'chat',
  people: 'chat',
  user: 'chat',
  speaker: 'mic',
  audio: 'listen',
  sound: 'listen',
  ear: 'listen',
  arrow: 'lightning',
  check: 'sparkles',
  warning: 'lightning',
  alert: 'lightning',
  question: 'brain',
  thought: 'brain',
  coffee: 'cup',
  drink: 'cup',
  food: 'menu',
  plane: 'airplane',
  flight: 'airplane',
  bag: 'shopping-bag',
  money: 'wallet',
  dollar: 'price-tag',
  work: 'briefcase',
  office: 'briefcase',
  study: 'book',
  school: 'graduation',
  computer: 'laptop',
  time: 'clock',
  house: 'home',
  gym: 'dumbbell',
  note: 'pencil',
  map: 'map-pin',
};

export function isValidSceneIconName(icon: string | undefined): icon is IllustrationSceneIcon {
  if (!icon) return false;
  return VALID_SCENE_ICON_SET.has(icon);
}

export function normalizeSceneIconWithAlias(
  icon: string | undefined,
  contextText = '',
): { icon: IllustrationSceneIcon; isExactCatalogMatch: boolean; suggestedAlias?: IllustrationSceneIcon } {
  const clean = (icon || '').trim().toLowerCase();
  if (clean && VALID_SCENE_ICON_SET.has(clean)) {
    return { icon: clean as IllustrationSceneIcon, isExactCatalogMatch: true };
  }
  if (clean && SCENE_ICON_ALIAS_MAP[clean]) {
    const mapped = SCENE_ICON_ALIAS_MAP[clean];
    return {
      icon: mapped,
      isExactCatalogMatch: false,
      suggestedAlias: mapped,
    };
  }
  const contextual = contextText ? pickContextualSceneIcon(contextText, 'sparkles') : 'sparkles';
  return {
    icon: contextual,
    isExactCatalogMatch: !clean,
    suggestedAlias: contextual,
  };
}

export function isStoryboardV19Document(doc: unknown): doc is StoryboardV19Document {
  if (!doc || typeof doc !== 'object') return false;
  const obj = doc as Record<string, unknown>;
  if (obj.schema_version === '1.9') return true;
  if (Array.isArray(obj.source_segments) && Array.isArray(obj.scenes)) return true;
  if (
    Array.isArray(obj.scenes) &&
    obj.scenes.some((sc) => {
      if (!sc || typeof sc !== 'object') return false;
      const s = sc as Record<string, unknown>;
      if (typeof s.scene_id === 'string') return true;
      if (Array.isArray(s.elements)) {
        return s.elements.some(
          (el) =>
            el &&
            typeof el === 'object' &&
            ('element_id' in el || 'sync_anchor' in el || 'kind' in el),
        );
      }
      return false;
    })
  ) {
    return true;
  }
  return false;
}

export function formatSegmentId(index: number): string {
  return `seg_${String(index + 1).padStart(3, '0')}`;
}

export function buildSourceSegmentsFromCues(cues: TranscriptCue[]): StoryboardSourceSegment[] {
  return cues.map((cue, idx) => ({
    segment_id: formatSegmentId(idx),
    start: Number(cue.start.toFixed(3)),
    end: Number(cue.end.toFixed(3)),
    text: cue.text,
  }));
}

export function clampSourceSegmentsToAudioDuration(
  segments: StoryboardSourceSegment[],
  audioDurationSec: number,
): { segments: StoryboardSourceSegment[]; changed: boolean } {
  if (!Array.isArray(segments) || segments.length === 0) {
    return { segments: [], changed: false };
  }
  const safeAudio = Number(audioDurationSec);
  if (!Number.isFinite(safeAudio) || safeAudio <= 0.2) {
    return { segments: segments.map((s) => ({ ...s })), changed: false };
  }

  const maxEnd = segments.reduce((mx, s) => Math.max(mx, Number(s?.end) || 0), 0);
  if (maxEnd <= safeAudio + 0.001) {
    return { segments: segments.map((s) => ({ ...s })), changed: false };
  }

  // If all segments start well inside the audio file, only clamp trailing end timestamps
  // so earlier cue timings stay untouched. Otherwise proportionally scale to preserve monotonicity.
  const canTrimTailOnly = segments.every((s) => Number(s?.start || 0) < safeAudio - 0.2);
  if (canTrimTailOnly) {
    const next = segments.map((s) => {
      const rawStart = Math.max(0, Number(s.start) || 0);
      const rawEnd = Math.min(safeAudio, Math.max(rawStart + 0.15, Number(s.end) || rawStart + 0.5));
      const clampedStart = Math.min(rawStart, Math.max(0, rawEnd - 0.15));
      return {
        ...s,
        start: Number(clampedStart.toFixed(3)),
        end: Number(rawEnd.toFixed(3)),
      };
    });
    return { segments: next, changed: true };
  }

  const ratio = safeAudio / Math.max(0.1, maxEnd);
  const next = segments.map((s) => {
    const st = Math.max(0, (Number(s.start) || 0) * ratio);
    const en = Math.min(safeAudio, Math.max(st + 0.1, (Number(s.end) || st + 0.5) * ratio));
    return {
      ...s,
      start: Number(st.toFixed(3)),
      end: Number(en.toFixed(3)),
    };
  });
  return { segments: next, changed: true };
}

export function clampCuesToAudioDuration(
  cues: TranscriptCue[],
  audioDurationSec: number,
): TranscriptCue[] {
  if (!Array.isArray(cues) || cues.length === 0) return [];
  const safeAudio = Number(audioDurationSec);
  if (!Number.isFinite(safeAudio) || safeAudio <= 0.2) {
    return cues.map((c) => ({ ...c, words: c.words.map((w) => ({ ...w })) }));
  }

  const maxEnd = cues.reduce((mx, c) => Math.max(mx, c.end), 0);
  if (maxEnd <= safeAudio + 0.001) {
    return cues.map((c) => ({ ...c, words: c.words.map((w) => ({ ...w })) }));
  }

  const canTrimTailOnly = cues.every((c) => c.start < safeAudio - 0.2);
  const globalRatio = canTrimTailOnly ? 1 : safeAudio / Math.max(0.1, maxEnd);

  return cues.map((cue) => {
    const rawStart = cue.start * globalRatio;
    const targetEnd = Math.min(safeAudio, Math.max(rawStart + 0.15, cue.end * globalRatio));
    const targetStart = Math.min(rawStart, Math.max(0, targetEnd - 0.15));
    const origSpan = Math.max(0.05, cue.end - cue.start);
    const targetSpan = Math.max(0.1, targetEnd - targetStart);
    const needsWordRescale =
      !canTrimTailOnly || cue.end > safeAudio + 0.001 || cue.words.some((w) => w.end > safeAudio);

    const words = cue.words.map((w) => {
      if (!needsWordRescale) return { ...w };
      const relS = Math.max(0, Math.min(1, (w.start - cue.start) / origSpan));
      const relE = Math.max(relS + 0.02, Math.min(1, (w.end - cue.start) / origSpan));
      return {
        ...w,
        start: Number((targetStart + relS * targetSpan).toFixed(3)),
        end: Number(Math.min(safeAudio, targetStart + relE * targetSpan).toFixed(3)),
      };
    });

    return {
      ...cue,
      start: Number(targetStart.toFixed(3)),
      end: Number(targetEnd.toFixed(3)),
      words,
    };
  });
}

export function normalizeQuoteForMatch(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function quoteMatchesSegmentText(quote: string, segmentText: string): boolean {
  const q = normalizeQuoteForMatch(quote);
  const seg = normalizeQuoteForMatch(segmentText);
  if (!q || !seg) return false;
  if (seg.includes(q)) return true;
  // Also allow punctuation-only stripping if quote trimmed trailing comma/period intentionally
  const qAlpha = q.replace(/[^\p{L}\p{N}\s']/gu, '').replace(/\s+/g, ' ').trim();
  const segAlpha = seg.replace(/[^\p{L}\p{N}\s']/gu, '').replace(/\s+/g, ' ').trim();
  if (qAlpha.length >= 3 && segAlpha.includes(qAlpha)) {
    // Only consider exact if punctuation inside didn't alter quotes awkwardly,
    // note: validator has a strict check separately!
    return true;
  }
  return false;
}

export function isQuoteExactSubstring(quote: string, segmentText: string): boolean {
  const q = normalizeQuoteForMatch(quote);
  const seg = normalizeQuoteForMatch(segmentText);
  if (!q || !seg) return false;
  return seg.includes(q);
}

function findCueWordsForSegment(
  segment: StoryboardSourceSegment,
  cues: TranscriptCue[],
): WordTiming[] {
  const segIdxMatch = segment.segment_id.match(/(\d+)$/);
  if (segIdxMatch) {
    const idx = Number(segIdxMatch[1]) - 1;
    if (cues[idx] && Math.abs(cues[idx].start - segment.start) < 0.35) {
      return Array.isArray(cues[idx].words) ? cues[idx].words : [];
    }
  }
  const byTime = cues.find(
    (c) => Math.abs(c.start - segment.start) < 0.25 && Math.abs(c.end - segment.end) < 0.35,
  );
  return byTime?.words ?? [];
}

export function resolveSyncAnchorTiming(
  anchor: StoryboardSyncAnchor | undefined,
  segment: StoryboardSourceSegment | undefined,
  cues: TranscriptCue[],
  fallbackStart: number,
  fallbackEnd: number,
  durationHintSec?: number,
): { startTime: number; endTime: number } {
  if (!segment) {
    const st = fallbackStart;
    const en = durationHintSec ? Math.min(fallbackEnd, st + Math.max(0.5, durationHintSec)) : fallbackEnd;
    return {
      startTime: Number(st.toFixed(3)),
      endTime: Number(Math.max(st + 0.4, en).toFixed(3)),
    };
  }

  const segStart = Math.max(0, Number(segment.start) || 0);
  const segEnd = Math.max(segStart + 0.4, Number(segment.end) || segStart + 2.0);
  const segSpan = segEnd - segStart;
  const offset = Number(anchor?.offset_s ?? 0) || 0;
  const anchorType: StoryboardAnchorType = anchor?.anchor_type ?? 'full_segment';

  let startTime = segStart + offset;
  let endTime = segEnd;

  if (anchorType === 'phrase' && anchor?.quote?.trim()) {
    const rawSeg = segment.text;
    const rawQuote = anchor.quote.trim();
    const normSeg = normalizeQuoteForMatch(rawSeg);
    const normQuote = normalizeQuoteForMatch(rawQuote);
    let charIdx = normSeg.indexOf(normQuote);
    let matchLen = normQuote.length;
    let effectiveSegLen = normSeg.length;

    if (charIdx < 0) {
      const segAlpha = normSeg.replace(/[^\p{L}\p{N}\s']/gu, '').replace(/\s+/g, ' ').trim();
      const quoteAlpha = normQuote.replace(/[^\p{L}\p{N}\s']/gu, '').replace(/\s+/g, ' ').trim();
      if (quoteAlpha.length >= 3 && segAlpha.length > 0) {
        charIdx = segAlpha.indexOf(quoteAlpha);
        matchLen = quoteAlpha.length;
        effectiveSegLen = segAlpha.length;
      }
    }

    if (charIdx >= 0 && effectiveSegLen > 0) {
      // Try word-level snapping if words exist for this cue
      const segWords = findCueWordsForSegment(segment, cues);
      const quoteTokens = normQuote
        .replace(/[^\p{L}\p{N}\s']/gu, ' ')
        .split(/\s+/)
        .filter(Boolean);
      let snappedByWords = false;

      if (segWords.length > 0 && quoteTokens.length > 0) {
        const cleanWords = segWords.map((w) =>
          w.word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, ''),
        );
        for (let i = 0; i <= cleanWords.length - quoteTokens.length; i++) {
          let match = true;
          for (let j = 0; j < quoteTokens.length; j++) {
            if (cleanWords[i + j] !== quoteTokens[j]) {
              match = false;
              break;
            }
          }
          if (match) {
            startTime = Math.max(segStart, segWords[i].start + offset);
            const wordEnd = segWords[i + quoteTokens.length - 1].end + offset;
            const hintEnd = durationHintSec ? startTime + Math.max(0.5, durationHintSec) : wordEnd;
            endTime = Math.min(segEnd, Math.max(startTime + 0.5, wordEnd, hintEnd));
            snappedByWords = true;
            break;
          }
        }
      }

      if (!snappedByWords) {
        const startRatio = Math.max(0, Math.min(0.92, charIdx / effectiveSegLen));
        const endRatio = Math.max(
          startRatio + 0.12,
          Math.min(1, (charIdx + matchLen) / effectiveSegLen),
        );
        startTime = segStart + segSpan * startRatio + offset;
        endTime = durationHintSec
          ? Math.min(segEnd, startTime + Math.max(0.5, durationHintSec))
          : Math.min(segEnd, segStart + segSpan * endRatio + 0.2);
      }
    }
  } else if (anchorType === 'segment_start') {
    startTime = segStart + offset;
    endTime = durationHintSec
      ? Math.min(segEnd, startTime + Math.max(0.6, durationHintSec))
      : segEnd;
  } else if (anchorType === 'segment_end') {
    const tailDur = durationHintSec ? Math.min(segSpan, Math.max(0.8, durationHintSec)) : Math.min(segSpan, 1.8);
    endTime = segEnd;
    startTime = Math.max(segStart, segEnd - tailDur + offset);
  } else {
    // full_segment
    startTime = segStart + offset;
    endTime = durationHintSec
      ? Math.max(segEnd, Math.min(fallbackEnd, startTime + durationHintSec))
      : segEnd;
  }

  startTime = Math.max(0, startTime);
  endTime = Math.max(startTime + 0.45, endTime);
  return {
    startTime: Number(startTime.toFixed(3)),
    endTime: Number(endTime.toFixed(3)),
  };
}

export function mapV19EnterAnimation(raw: string | undefined, fallback: EnterAnimation): EnterAnimation {
  const clean = (raw || '').toLowerCase().replace(/_/g, '-');
  if (clean === 'pop-up' || clean === 'pop') return 'pop-up';
  if (clean === 'slide-up' || clean === 'slide') return 'slide-up';
  if (clean === 'drop-in' || clean === 'drop') return 'drop-in';
  if (clean === 'fade-scale' || clean === 'fade-in' || clean === 'fade') return 'fade-scale';
  return fallback;
}

export function mapV19ExitAnimation(raw: string | undefined, fallback: ExitAnimation): ExitAnimation {
  const clean = (raw || '').toLowerCase().replace(/_/g, '-');
  if (clean === 'fade-out' || clean === 'fade') return 'fade-out';
  if (clean === 'slide-down' || clean === 'slide') return 'slide-down';
  if (clean === 'shrink' || clean === 'scale-down') return 'shrink';
  return fallback;
}

export function parseV19TimeFallback(raw: string | number | undefined, fallback: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    if (trimmed.includes(':')) return parseTimeToken(trimmed);
  }
  return fallback;
}
