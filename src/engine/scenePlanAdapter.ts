import { normalizeCustomComponent } from './customComponentStore';
import type { VectorPrimitive } from './customComponentTypes';
import { matchIllustrationForCue } from './illustrationLayouts';
import { resolveProjectOverlaps } from './layoutSolver';
import {
  clampCuesToAudioDuration,
  clampSourceSegmentsToAudioDuration,
  isStoryboardV19Document,
  mapV19EnterAnimation,
  mapV19ExitAnimation,
  normalizeSceneIconWithAlias,
  parseV19TimeFallback,
  resolveSyncAnchorTiming,
  StoryboardSourceSegment,
  StoryboardV19Document,
  StoryboardV19Element,
} from './storyboardV19';
import { interpolateWordTimings, parseTimeToken } from './transcriptParser';
import {
  CanvasThemeId,
  CartoonActionSegment,
  CartoonAnimationDefinition,
  CartoonAnimationParams,
  CartoonExpressionMood,
  ComparisonItem,
  DynamicSceneSpec,
  IllustrationPropData,
  IllustrationSceneIcon,
  IllustrationVariant,
  isDarkCanvasTheme,
  LayoutCompositionId,
  LessonProject,
  SceneElement,
  ScenePlanDocument,
  ScenePlanShape,
  ScenePlanText,
  TranscriptCue,
  WordTiming,
} from './types';
import {
  isKnownIllustrationVariant,
  pickContextualSceneIcon,
  resolveContextualVisualForCue,
} from './vectorComponentDb';

const STAGE_W = 1080;
const STAGE_H = 1920;

export function parseWordLevelJson(input: string): WordTiming[] {
  try {
    const parsed = JSON.parse(input);
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.words)
        ? parsed.words
        : [];

    const words: WordTiming[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const w = String(item.word ?? item.text ?? '').trim();
      const start = Number(item.start ?? 0);
      const end = Number(item.end ?? start + 0.4);
      if (!w || Number.isNaN(start) || Number.isNaN(end)) continue;
      words.push({
        word: w,
        start: Number(start.toFixed(3)),
        end: Number(Math.max(end, start + 0.1).toFixed(3)),
      });
    }
    return words;
  } catch {
    return [];
  }
}

export function groupWordsIntoCues(words: WordTiming[], maxWordsPerCue = 6): TranscriptCue[] {
  if (words.length === 0) return [];
  const cues: TranscriptCue[] = [];
  let bucket: WordTiming[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    bucket.push(w);
    const endsSentence = /[.!?。！？]$/.test(w.word);
    const nextGap = words[i + 1] ? words[i + 1].start - w.end : 0;

    if (bucket.length >= maxWordsPerCue || endsSentence || nextGap > 0.65 || i === words.length - 1) {
      cues.push({
        id: `cue-${cues.length + 1}`,
        start: bucket[0].start,
        end: bucket[bucket.length - 1].end,
        text: bucket.map((b) => b.word).join(' '),
        words: bucket,
      });
      bucket = [];
    }
  }
  return cues;
}

export interface FlexibleAiWordStackRow {
  prefix: string;
  suffix?: string;
  suffixColor?: string;
  appearAt?: string | number;
  phonetic?: string;
}

export interface FlexibleAiElement {
  type: string;
  start?: string | number;
  end?: string | number;
  cue?: number;
  at?: number;
  until?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  // comparison_strip
  items?: (Omit<ComparisonItem, 'activateAt'> & { activateAt?: string | number })[];
  // topic_pill
  text?: string;
  bgColor?: string;
  textColor?: string;
  // illustration & @168 diagrams & dynamic_scene
  variant?: IllustrationVariant;
  data?: IllustrationPropData;
  nodes?: IllustrationPropData['nodes'];
  labels?: string[];
  value?: number;
  timeHour?: number;
  timeMinute?: number;
  formula?: string;
  subtitle?: string;
  checklist?: IllustrationPropData['checklist'];
  upgrades?: IllustrationPropData['upgrades'];
  boxes?: IllustrationPropData['boxes'];
  speechText?: string;
  reactionText?: string;
  sceneIcon?: IllustrationSceneIcon;
  highlightWord?: string;
  dynamicScene?: DynamicSceneSpec;
  dynamic_scene?: DynamicSceneSpec;
  customPrimitives?: VectorPrimitive[];
  // sentence_card
  subtext?: string;
  badge?: 'check' | 'cross' | 'question' | 'none';
  stampText?: string;
  stampColor?: string;
  emphasisWord?: string;
  emphasisColor?: string;
  // word_stack
  rows?: FlexibleAiWordStackRow[];
  // tone_meter
  title?: string;
  leftLabel?: string;
  rightLabel?: string;
  valueStart?: number;
  valueEnd?: number;
  // staircase_3d / shapes
  fill?: string;
  depth?: number;
  step_labels?: string[];
  stepLabels?: string[];
}

export interface FlexibleSceneDocument extends ScenePlanDocument {
  schema_version?: string;
  title?: string;
  theme?: CanvasThemeId;
  compositionId?: LayoutCompositionId;
  compositionReason?: string;
  source_segments?: StoryboardSourceSegment[];
  style_profile?: StoryboardV19Document['style_profile'];
  cartoonAnimations?: Partial<CartoonAnimationDefinition>[];
  elements?: FlexibleAiElement[];
  scenes: (ScenePlanDocument['scenes'][number] & {
    title?: string;
    learning_objective?: string;
    composition?: LayoutCompositionId;
    transition?: string;
    cartoonAction?: string;
    cartoonMood?: CartoonExpressionMood;
    cartoonAnimationSpec?: Partial<CartoonAnimationParams>;
    elements?: (FlexibleAiElement | StoryboardV19Element)[];
  })[];
}

function extractCleanJsonText(raw: string): string {
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }
  // Remove trailing commas before closing } or ]
  return text.replace(/,\s*([}\]])/g, '$1');
}

export function parseScenePlanJson(input: string): FlexibleSceneDocument | null {
  try {
    const cleaned = extractCleanJsonText(input);
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== 'object') return null;
    if (Array.isArray(parsed.scenes)) {
      return parsed as FlexibleSceneDocument;
    }
    // Also support top-level elements array without scenes wrapper
    if (Array.isArray(parsed.elements)) {
      return {
        schema_version: parsed.schema_version,
        title: parsed.title,
        theme: parsed.theme,
        compositionId: parsed.compositionId,
        compositionReason: parsed.compositionReason,
        cartoonAnimations: Array.isArray(parsed.cartoonAnimations) ? parsed.cartoonAnimations : undefined,
        source_segments: Array.isArray(parsed.source_segments) ? parsed.source_segments : undefined,
        scenes: [{ id: 'sc1', elements: parsed.elements }],
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function summarizeScenePlan(
  plan: FlexibleSceneDocument,
  cues: TranscriptCue[],
): {
  elementCount: number;
  cueCount: number;
  sceneCount: number;
  sourceSegmentCount: number;
  schemaVersion: '1.9' | 'legacy';
  types: string[];
} {
  let elementCount = 0;
  const typeSet = new Set<string>();
  const isV19 = isStoryboardV19Document(plan);
  for (const sc of plan.scenes) {
    for (const rawEl of sc.elements ?? []) {
      const el = rawEl as unknown as { type?: string; kind?: string };
      elementCount += 1;
      const tName = el.kind || el.type;
      if (tName) typeSet.add(tName);
    }
    for (const sh of sc.shapes ?? []) {
      elementCount += 1;
      if (sh.type) typeSet.add(sh.type);
    }
    for (const tx of sc.texts ?? []) {
      if (tx.shape_index === undefined) {
        elementCount += 1;
        typeSet.add('text');
      }
    }
  }
  return {
    elementCount,
    cueCount: cues.length || plan.source_segments?.length || 0,
    sceneCount: plan.scenes.length,
    sourceSegmentCount: plan.source_segments?.length ?? 0,
    schemaVersion: isV19 ? '1.9' : 'legacy',
    types: Array.from(typeSet),
  };
}

function resolveTimeValue(
  raw: string | number | undefined,
  words: WordTiming[],
  cues: TranscriptCue[],
  fallback: number,
): number {
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    if (trimmed.includes(':')) return parseTimeToken(trimmed);
  }
  void words;
  void cues;
  return fallback;
}

function convertFlexibleElements(
  rawElements: FlexibleAiElement[],
  words: WordTiming[],
  cues: TranscriptCue[],
  totalDuration: number,
): SceneElement[] {
  const result: SceneElement[] = [];

  rawElements.forEach((el, idx) => {
    const cueRef = el.cue
      ? cues[Math.min(cues.length - 1, Math.max(0, el.cue - 1))]
      : undefined;
    const wordRef = el.at
      ? words[Math.min(words.length - 1, Math.max(0, el.at - 1))]
      : undefined;

    const startTime = resolveTimeValue(
      el.start,
      words,
      cues,
      cueRef?.start ?? wordRef?.start ?? 0,
    );
    const endTime = resolveTimeValue(
      el.end,
      words,
      cues,
      cueRef?.end ?? Math.min(totalDuration, startTime + 3.5),
    );
    const safeEnd = Math.max(startTime + 0.4, endTime);

    const cx = el.x !== undefined ? (el.x <= 1 ? el.x * STAGE_W : el.x) : 540;
    const cy = el.y !== undefined ? (el.y <= 1 ? el.y * STAGE_H : el.y) : 960;
    const width = el.width !== undefined ? (el.width <= 1 ? el.width * STAGE_W : el.width) : 820;
    const height = el.height !== undefined ? (el.height <= 1 ? el.height * STAGE_H : el.height) : 240;

    const id = `ai-el-${idx + 1}`;

    switch (el.type) {
      case 'comparison_strip':
      case 'comparison-strip':
        result.push({
          id,
          type: 'comparison-strip',
          label: 'Thanh đối chiếu',
          startTime,
          endTime: safeEnd,
          enterAnimation: 'drop-in',
          exitAnimation: 'fade-out',
          layout: { x: cx, y: el.y !== undefined ? cy : 190, width: 900, scale: 1, zIndex: 10 },
          props: {
            kind: 'comparison-strip',
            items: (el.items ?? []).map((it) => ({
              ...it,
              activateAt:
                it.activateAt !== undefined
                  ? resolveTimeValue(it.activateAt, words, cues, startTime)
                  : undefined,
            })),
          },
        });
        break;

      case 'topic_pill':
      case 'topic-pill':
        result.push({
          id,
          type: 'topic-pill',
          label: `Nhãn: ${el.text || 'Topic'}`,
          startTime,
          endTime: safeEnd,
          enterAnimation: 'pop-up',
          exitAnimation: 'shrink',
          layout: { x: cx, y: el.y !== undefined ? cy : 345, width: 340, scale: 1, zIndex: 12 },
          props: {
            kind: 'topic-pill',
            text: el.text || 'Tip',
            bgColor: el.bgColor || '#DDD6FE',
            textColor: el.textColor || '#4338CA',
          },
        });
        break;

      case 'illustration':
      case 'illustration-prop':
      case 'flow_diagram':
      case 'gauge_arc':
      case 'timeline_track':
      case 'checklist_card':
      case 'dialogue_upgrade':
      case 'clock_face':
      case 'spatial_boxes':
      case 'avatar_speech':
      case 'phrase_icon_split':
      case 'dynamic_scene':
      case 'dynamic-scene':
      case 'airport_travel':
      case 'restaurant_order':
      case 'shopping_price':
      case 'doctor_health':
      case 'weather_forecast':
      case 'study_desk':
      case 'commute_transport':
      case 'home_routine':
      case 'gym_fitness':
      case 'phone_call':
      case 'tense_timeline':
      case 'degree_scale':
      case 'phrasal_split':
      case 'idiom_split':
      case 'syllable_stress':
      case 'intonation_curve': {
        const normalizedFromType = el.type.replace(/_/g, '-') as IllustrationVariant;
        let mappedVariant: IllustrationVariant;
        if (el.type === 'illustration' || el.type === 'illustration-prop') {
          const candidate = el.variant?.replace(/_/g, '-') as IllustrationVariant | undefined;
          mappedVariant =
            isKnownIllustrationVariant(candidate)
              ? candidate
              : isKnownIllustrationVariant(el.variant)
                ? el.variant
                : matchIllustrationForCue(cueRef?.text ?? el.text ?? '', 'cafe-water');
        } else if (isKnownIllustrationVariant(normalizedFromType)) {
          mappedVariant = normalizedFromType;
        } else {
          mappedVariant = el.variant || matchIllustrationForCue(cueRef?.text ?? el.text ?? '', 'cafe-water');
        }

        const resolvedDynamic =
          el.data?.dynamicScene ?? el.dynamicScene ?? el.dynamic_scene;
        const resolvedIcon =
          el.data?.sceneIcon ??
          el.sceneIcon ??
          (mappedVariant === 'phrase-icon-split' || mappedVariant === 'dynamic-scene'
            ? pickContextualSceneIcon(`${cueRef?.text ?? ''} ${el.text ?? el.speechText ?? ''}`, 'sparkles')
            : undefined);

        const rawPrimitives = el.data?.customPrimitives ?? el.customPrimitives;
        let normalizedPrimitives: VectorPrimitive[] | undefined;
        if (Array.isArray(rawPrimitives) && rawPrimitives.length > 0) {
          const norm = normalizeCustomComponent({
            variant: mappedVariant || 'custom-inline',
            label: el.title || el.text || 'Custom',
            primitives: rawPrimitives,
          });
          if (norm && norm.primitives.length > 0) {
            normalizedPrimitives = norm.primitives;
          }
        }

        const mergedData: IllustrationPropData | undefined =
          el.data ||
          el.nodes ||
          el.labels ||
          el.value !== undefined ||
          el.timeHour !== undefined ||
          el.formula ||
          el.checklist ||
          el.upgrades ||
          el.boxes ||
          el.speechText ||
          resolvedDynamic ||
          resolvedIcon ||
          el.highlightWord ||
          normalizedPrimitives
            ? {
                ...(el.data ?? {}),
                title: el.data?.title ?? el.title,
                subtitle: el.data?.subtitle ?? el.subtitle,
                nodes: el.data?.nodes ?? el.nodes,
                labels: el.data?.labels ?? el.labels,
                value: el.data?.value ?? el.value,
                timeHour: el.data?.timeHour ?? el.timeHour,
                timeMinute: el.data?.timeMinute ?? el.timeMinute,
                formula: el.data?.formula ?? el.formula,
                checklist: el.data?.checklist ?? el.checklist,
                upgrades: el.data?.upgrades ?? el.upgrades,
                boxes: el.data?.boxes ?? el.boxes,
                speechText: el.data?.speechText ?? el.speechText ?? el.text,
                reactionText: el.data?.reactionText ?? el.reactionText,
                sceneIcon: resolvedIcon,
                highlightWord: el.data?.highlightWord ?? el.highlightWord,
                dynamicScene: resolvedDynamic,
                customPrimitives: normalizedPrimitives,
              }
            : undefined;

        result.push({
          id,
          type: 'illustration-prop',
          label: `Minh họa: ${mappedVariant}`,
          startTime,
          endTime: safeEnd,
          enterAnimation: 'fade-scale',
          exitAnimation: 'fade-out',
          layout: { x: cx, y: el.y !== undefined ? cy : 635, width: 880, scale: 1, zIndex: 6 },
          props: {
            kind: 'illustration-prop',
            variant: mappedVariant,
            data: mergedData,
          },
        });
        break;
      }

      case 'sentence_card':
      case 'sentence-card':
        result.push({
          id,
          type: 'sentence-card',
          label: `Thẻ câu: ${(el.text || '').slice(0, 24)}`,
          startTime,
          endTime: safeEnd,
          enterAnimation: 'pop-up',
          exitAnimation: 'shrink',
          layout: { x: cx, y: el.y !== undefined ? cy : 980, width, scale: 1, zIndex: 22 },
          props: {
            kind: 'sentence-card',
            text: el.text || '',
            subtext: el.subtext,
            badge: el.badge || 'none',
            stampText: el.stampText,
            stampColor: el.stampColor,
            emphasisWord: el.emphasisWord,
            emphasisColor: el.emphasisColor,
            bgColor: el.bgColor,
            textColor: el.textColor,
          },
        });
        break;

      case 'word_stack':
      case 'word-stack':
        result.push({
          id,
          type: 'word-stack',
          label: `Xếp chồng ${(el.rows ?? []).length} mục`,
          startTime,
          endTime: safeEnd,
          enterAnimation: 'pop-up',
          exitAnimation: 'fade-out',
          layout: { x: cx, y: el.y !== undefined ? cy : 740, width: 740, scale: 1, zIndex: 20 },
          props: {
            kind: 'word-stack',
            rows: (el.rows ?? []).map((r, rIdx) => ({
              prefix: r.prefix || '',
              suffix: r.suffix || '',
              suffixColor: r.suffixColor || '#2563EB',
              appearAt:
                r.appearAt !== undefined
                  ? resolveTimeValue(r.appearAt, words, cues, startTime + rIdx * 0.6)
                  : startTime + rIdx * 0.6,
              phonetic: r.phonetic,
            })),
          },
        });
        break;

      case 'tone_meter':
      case 'tone-meter':
        result.push({
          id,
          type: 'tone-meter',
          label: `Thanh sắc thái: ${el.leftLabel || 'low'} ↔ ${el.rightLabel || 'high'}`,
          startTime,
          endTime: safeEnd,
          enterAnimation: 'slide-up',
          exitAnimation: 'fade-out',
          layout: { x: cx, y: el.y !== undefined ? cy : 1220, width: 700, scale: 1, zIndex: 18 },
          props: {
            kind: 'tone-meter',
            title: el.title || 'TONE',
            leftLabel: el.leftLabel || 'rude',
            rightLabel: el.rightLabel || 'polite',
            valueStart: el.valueStart ?? 0.2,
            valueEnd: el.valueEnd ?? 0.85,
            animateStart: startTime + 0.3,
            animateEnd: Math.max(startTime + 0.8, safeEnd - 0.3),
          },
        });
        break;

      case 'staircase_3d':
      case 'card_3d':
      case 'pill_3d':
      case 'cube_3d':
      case 'rect_3d':
        result.push({
          id,
          type: 'shape-3d',
          label: `${el.type}: ${el.text || el.step_labels?.join(' / ') || '3D'}`,
          startTime,
          endTime: safeEnd,
          enterAnimation: 'pop-up',
          exitAnimation: 'fade-out',
          layout: {
            x: cx,
            y: el.y !== undefined ? cy : 860,
            width,
            height: el.type === 'staircase_3d' ? 420 : height,
            scale: 1,
            zIndex: 16,
          },
          props: {
            kind: 'shape-3d',
            shapeType: el.type,
            fill: el.fill || '#14B8A6',
            shadow: true,
            highlight: true,
            depth: el.depth ?? 12,
            cornerRadius: 28,
            textContent: el.text,
            textColor: el.textColor || '#FFFFFF',
            textSize: 'headline',
            textWeight: 'bold',
            stepLabels: el.step_labels ?? el.stepLabels,
          },
        });
        break;
    }
  });

  return result;
}

function sanitizeDynamicSceneIcons(
  spec: DynamicSceneSpec | undefined,
  contextText: string,
): DynamicSceneSpec | undefined {
  if (!spec) return undefined;
  return {
    ...spec,
    motifs: (spec.motifs ?? []).map((m) => ({
      ...m,
      icon: normalizeSceneIconWithAlias(m.icon, `${contextText} ${m.label ?? ''}`).icon,
    })),
  };
}

function sanitizeCustomPrimitiveIcons(
  primitives: VectorPrimitive[] | undefined,
  contextText: string,
): VectorPrimitive[] | undefined {
  if (!Array.isArray(primitives) || primitives.length === 0) return undefined;
  return primitives.map((p) =>
    p.shape === 'icon'
      ? {
          ...p,
          icon: normalizeSceneIconWithAlias(p.icon, contextText).icon,
        }
      : p,
  );
}

function synthesizeConnectorPrimitives(
  el: StoryboardV19Element,
  wPx: number,
  hPx: number,
): VectorPrimitive[] {
  const spec = el.connector_spec ?? {};
  const dir = spec.direction ?? (wPx >= hPx ? 'right' : 'down');
  const stroke = el.style?.strokeColor || el.style?.accentColor || '#2563EB';
  const lw = Math.max(4, Math.min(10, el.style?.lineWidth ?? 6));
  const halfSpanX = Math.max(36, Math.round(wPx * 0.42));
  const halfSpanY = Math.max(28, Math.round(hPx * 0.4));

  let x1 = -halfSpanX;
  let y1 = 0;
  let x2 = halfSpanX;
  let y2 = 0;
  if (dir === 'left') {
    x1 = halfSpanX;
    x2 = -halfSpanX;
  } else if (dir === 'down') {
    x1 = 0;
    y1 = -halfSpanY;
    x2 = 0;
    y2 = halfSpanY;
  } else if (dir === 'up') {
    x1 = 0;
    y1 = halfSpanY;
    x2 = 0;
    y2 = -halfSpanY;
  }

  const prims: VectorPrimitive[] = [
    {
      shape: spec.arrow === false ? 'line' : 'arrow',
      x: x1,
      y: y1,
      x2,
      y2,
      stroke,
      lineWidth: lw,
    },
  ];

  const label = (spec.label || el.content || el.text || '').trim();
  if (label) {
    const pillW = Math.min(Math.max(88, label.length * 13 + 26), Math.max(108, wPx + 8));
    const compactText = pillW < 120;
    prims.push(
      {
        shape: 'pill',
        x: -pillW / 2,
        y: dir === 'right' || dir === 'left' ? -52 : -18,
        w: pillW,
        h: 34,
        fill: el.style?.bgColor || '#EFF6FF',
        stroke,
        lineWidth: 2,
      },
      {
        shape: 'text',
        x: 0,
        y: dir === 'right' || dir === 'left' ? -35 : 0,
        w: pillW - 14,
        text: label,
        fill: el.style?.textColor || stroke,
        fontSize: compactText ? 18 : 21,
        fontWeight: 800,
      },
    );
  }
  return prims;
}

function synthesizeObjectPrimitives(
  el: StoryboardV19Element,
  wPx: number,
  hPx: number,
): VectorPrimitive[] {
  const label = (el.object_spec?.label || el.content || el.text || el.title || 'Concept').trim();
  const sublabel = (el.object_spec?.sublabel || el.subtext || el.subtitle || '').trim();
  const iconRes = normalizeSceneIconWithAlias(
    el.object_spec?.icon || (el.sceneIcon as string | undefined),
    `${label} ${sublabel}`,
  );
  const bg = el.style?.bgColor || el.style?.fill || '#FFFFFF';
  const stroke = el.style?.borderColor || el.style?.accentColor || '#CBD5E1';
  const accent = el.style?.accentColor || '#2563EB';
  const cardW = Math.max(220, Math.min(880, wPx));
  const cardH = Math.max(140, Math.min(480, hPx));
  const isCompactCard = cardW < 520;

  const prims: VectorPrimitive[] = [
    {
      shape: 'rect',
      x: -cardW / 2,
      y: -cardH / 2,
      w: cardW,
      h: cardH,
      radius: 26,
      fill: bg,
      stroke,
      lineWidth: 3,
      shadow: true,
    },
    {
      shape: 'rect',
      x: -cardW / 2,
      y: -cardH / 2,
      w: isCompactCard ? cardW : 14,
      h: isCompactCard ? 12 : cardH,
      radius: 8,
      fill: accent,
    },
    {
      shape: 'icon',
      icon: iconRes.icon,
      x: isCompactCard ? 0 : -cardW / 2 + 86,
      y: isCompactCard ? -Math.round(cardH * 0.2) : 0,
    },
    {
      shape: 'text',
      x: isCompactCard ? 0 : 44,
      y: isCompactCard
        ? sublabel
          ? Math.round(cardH * 0.1)
          : Math.round(cardH * 0.18)
        : sublabel
          ? -20
          : 0,
      w: isCompactCard ? cardW - 44 : cardW - 180,
      text: label,
      fill: el.style?.textColor || '#0F172A',
      fontSize: isCompactCard
        ? Math.max(24, Math.min(31, el.style?.fontSize ?? 28))
        : Math.max(26, Math.min(38, el.style?.fontSize ?? 34)),
      fontWeight: 800,
      align: 'center',
    },
  ];
  if (sublabel) {
    prims.push({
      shape: 'text',
      x: isCompactCard ? 0 : 44,
      y: isCompactCard ? Math.round(cardH * 0.31) : 28,
      w: isCompactCard ? cardW - 44 : cardW - 180,
      text: sublabel,
      fill: '#475569',
      fontSize: isCompactCard ? 22 : 25,
      fontWeight: 600,
      align: 'center',
    });
  }
  return prims;
}

function convertStoryboardV19Elements(
  scenes: FlexibleSceneDocument['scenes'],
  sourceSegments: StoryboardSourceSegment[],
  words: WordTiming[],
  cues: TranscriptCue[],
  totalDuration: number,
): SceneElement[] {
  const result: SceneElement[] = [];
  const segMap = new Map<string, StoryboardSourceSegment>();
  sourceSegments.forEach((seg) => {
    if (seg.segment_id) segMap.set(seg.segment_id, seg);
  });

  // Compute each scene's start/end span from its referenced source_segments
  const sceneSpans = scenes.map((sc, scIdx) => {
    const referencedSegs = (sc.elements ?? [])
      .map((raw) => {
        const el = raw as StoryboardV19Element;
        return el.sync_anchor?.segment_id ? segMap.get(el.sync_anchor.segment_id) : undefined;
      })
      .filter((s): s is StoryboardSourceSegment => Boolean(s));

    if (referencedSegs.length > 0) {
      const minS = Math.min(...referencedSegs.map((s) => s.start));
      const maxE = Math.max(...referencedSegs.map((s) => s.end));
      return { start: minS, end: Math.max(minS + 0.6, maxE) };
    }
    const segApprox = sourceSegments[scIdx];
    return {
      start: segApprox?.start ?? scIdx * 4,
      end: segApprox?.end ?? Math.min(totalDuration, (scIdx + 1) * 4),
    };
  });

  scenes.forEach((sc, scIdx) => {
    const span = sceneSpans[scIdx] ?? { start: 0, end: totalDuration };
    const rawList = sc.elements ?? [];

    rawList.forEach((rawItem, elIdx) => {
      const el = rawItem as StoryboardV19Element & FlexibleAiElement;
      const seg = el.sync_anchor?.segment_id ? segMap.get(el.sync_anchor.segment_id) : undefined;
      const isPersistentHeader =
        el.kind === 'strip' ||
        el.kind === 'comparison_strip' ||
        el.role === 'scene_title' ||
        el.role === 'section_header' ||
        el.role === 'comparison_header' ||
        el.role === 'header' ||
        el.role === 'persistent_strip';

      const explicitDisplayDur =
        typeof (el as any).display_duration_s === 'number' && (el as any).display_duration_s > 0
          ? Number((el as any).display_duration_s)
          : typeof (el as any).duration_s === 'number' && (el as any).duration_s > 0
            ? Number((el as any).duration_s)
            : undefined;

      let { startTime, endTime } = resolveSyncAnchorTiming(
        el.sync_anchor,
        seg,
        cues,
        span.start,
        span.end,
        explicitDisplayDur,
      );

      // Explicit start_s/end_s or start/end overrides if provided
      if (el.start_s !== undefined || el.start !== undefined) {
        startTime = parseV19TimeFallback(el.start_s ?? el.start, startTime);
      }
      if (el.end_s !== undefined || el.end !== undefined) {
        endTime = parseV19TimeFallback(el.end_s ?? el.end, endTime);
      } else if (isPersistentHeader) {
        endTime = span.end;
      } else {
        const anchorType = el.sync_anchor?.anchor_type;
        const rawKind = String(el.kind || el.type || 'text').toLowerCase();
        const isVisualProp =
          rawKind === 'illustration' ||
          rawKind === 'asset' ||
          rawKind === 'illustration-prop' ||
          rawKind === 'object' ||
          rawKind === 'connector' ||
          rawKind === 'shape_3d' ||
          rawKind === 'shape-3d' ||
          rawKind === 'word_stack' ||
          rawKind === 'word-stack' ||
          rawKind === 'meter' ||
          rawKind === 'tone_meter' ||
          rawKind === 'tone-meter' ||
          rawKind === 'pill' ||
          rawKind === 'topic_pill' ||
          rawKind === 'topic-pill';
        if (isVisualProp && (anchorType === 'segment_start' || anchorType === 'phrase' || !anchorType)) {
          const naturalHoldEnd = seg ? Math.max(seg.end, startTime + 2.2) : span.end;
          endTime = Math.max(endTime, Math.min(span.end, naturalHoldEnd));
        }
      }

      const safeEnd = Math.min(totalDuration, Math.max(startTime + 0.65, endTime));

      // Position resolution: v1.9 normalized top-left { x, y, width, height } vs legacy center { x, y }
      const pos = el.position;
      const hasNormBox =
        pos &&
        typeof pos === 'object' &&
        typeof pos.x === 'number' &&
        typeof pos.y === 'number' &&
        typeof pos.width === 'number';
      const cx = hasNormBox
        ? Math.round((pos.x + pos.width / 2) * STAGE_W)
        : el.x !== undefined
          ? Math.round(el.x <= 1 ? el.x * STAGE_W : el.x)
          : 540;
      const cy = hasNormBox
        ? Math.round((pos.y + (pos.height ?? 0.1) / 2) * STAGE_H)
        : el.y !== undefined
          ? Math.round(el.y <= 1 ? el.y * STAGE_H : el.y)
          : 720;
      const wPx = hasNormBox
        ? Math.max(120, Math.round(pos.width * STAGE_W))
        : el.width !== undefined
          ? Math.round(el.width <= 1 ? el.width * STAGE_W : el.width)
          : 820;
      const hPx = hasNormBox
        ? Math.max(48, Math.round((pos.height ?? 0.12) * STAGE_H))
        : el.height !== undefined
          ? Math.round(el.height <= 1 ? el.height * STAGE_H : el.height)
          : 220;

      const id = el.element_id?.trim() || `${sc.scene_id || sc.id || `sc${scIdx + 1}`}-el-${elIdx + 1}`;
      const enterAnimation = mapV19EnterAnimation(el.animation?.in, 'pop-up');
      const exitAnimation = mapV19ExitAnimation(el.animation?.out, 'fade-out');
      const kind = String(el.kind || el.type || 'text').toLowerCase();
      const textVal = (el.content ?? el.text ?? '').trim();

      if (kind === 'strip' || kind === 'comparison_strip' || kind === 'comparison-strip') {
        result.push({
          id,
          type: 'comparison-strip',
          label: `Thanh đối chiếu (${sc.title || sc.scene_id || 'Scene'})`,
          startTime,
          endTime: safeEnd,
          enterAnimation: mapV19EnterAnimation(el.animation?.in, 'drop-in'),
          exitAnimation,
          layout: { x: cx, y: hasNormBox || el.y !== undefined ? cy : 185, width: Math.max(640, wPx), scale: 1, zIndex: 10 },
          props: {
            kind: 'comparison-strip',
            items: (el.items ?? []).map((it) => {
              let actAt =
                it.activateAt !== undefined
                  ? parseV19TimeFallback(it.activateAt, startTime)
                  : undefined;
              if (actAt === undefined && it.sync_anchor?.segment_id) {
                const itSeg = segMap.get(it.sync_anchor.segment_id);
                actAt = resolveSyncAnchorTiming(it.sync_anchor, itSeg, cues, startTime, safeEnd).startTime;
              }
              return {
                label: it.label,
                sublabel: it.sublabel,
                accentColor: it.accentColor,
                activateAt: actAt,
              };
            }),
          },
        });
        return;
      }

      if (
        kind === 'pill' ||
        kind === 'topic_pill' ||
        kind === 'topic-pill' ||
        (kind === 'text' &&
          ['badge', 'label', 'pill', 'topic_pill', 'section_tag', 'scene_title'].includes(
            (el.role || '').toLowerCase(),
          ) &&
          textVal.length > 0 &&
          textVal.length <= 54 &&
          (!hasNormBox || (pos?.height ?? 0.06) <= 0.085))
      ) {
        result.push({
          id,
          type: 'topic-pill',
          label: `Nhãn: ${textVal || 'Topic'}`,
          startTime,
          endTime: safeEnd,
          enterAnimation,
          exitAnimation: mapV19ExitAnimation(el.animation?.out, 'shrink'),
          layout: { x: cx, y: hasNormBox || el.y !== undefined ? cy : 335, width: Math.min(880, Math.max(280, wPx)), scale: 1, zIndex: 12 },
          props: {
            kind: 'topic-pill',
            text: textVal || 'Lesson Tip',
            bgColor: el.style?.bgColor || el.bgColor || '#DDD6FE',
            textColor: el.style?.textColor || el.textColor || '#4338CA',
          },
        });
        return;
      }

      if (kind === 'meter' || kind === 'tone_meter' || kind === 'tone-meter') {
        result.push({
          id,
          type: 'tone-meter',
          label: `Thanh sắc thái: ${el.leftLabel || 'low'} ↔ ${el.rightLabel || 'high'}`,
          startTime,
          endTime: safeEnd,
          enterAnimation: mapV19EnterAnimation(el.animation?.in, 'slide-up'),
          exitAnimation,
          layout: { x: cx, y: hasNormBox || el.y !== undefined ? cy : 1215, width: Math.max(540, wPx), scale: 1, zIndex: 18 },
          props: {
            kind: 'tone-meter',
            title: el.title || 'TONE',
            leftLabel: el.leftLabel || 'casual',
            rightLabel: el.rightLabel || 'polite',
            valueStart: el.valueStart ?? 0.25,
            valueEnd: el.valueEnd ?? 0.85,
            animateStart: startTime + 0.25,
            animateEnd: Math.max(startTime + 0.75, safeEnd - 0.25),
          },
        });
        return;
      }

      if (kind === 'word_stack' || kind === 'word-stack') {
        result.push({
          id,
          type: 'word-stack',
          label: `Xếp chồng ${(el.rows ?? []).length} mục`,
          startTime,
          endTime: safeEnd,
          enterAnimation,
          exitAnimation,
          layout: { x: cx, y: hasNormBox || el.y !== undefined ? cy : 700, width: Math.max(580, wPx), scale: 1, zIndex: 20 },
          props: {
            kind: 'word-stack',
            rows: (el.rows ?? []).map((r, rIdx) => {
              let appAt =
                r.appearAt !== undefined
                  ? parseV19TimeFallback(r.appearAt, startTime + rIdx * 0.5)
                  : startTime + rIdx * 0.5;
              if (r.appearAt === undefined && r.sync_anchor?.segment_id) {
                const rSeg = segMap.get(r.sync_anchor.segment_id);
                appAt = resolveSyncAnchorTiming(r.sync_anchor, rSeg, cues, startTime, safeEnd).startTime;
              }
              return {
                prefix: r.prefix || '',
                suffix: r.suffix || '',
                suffixColor: r.suffixColor || '#2563EB',
                appearAt: appAt,
                phonetic: r.phonetic,
              };
            }),
          },
        });
        return;
      }

      if (
        kind === 'shape_3d' ||
        kind === 'shape-3d' ||
        kind === 'staircase_3d' ||
        kind === 'card_3d' ||
        kind === 'pill_3d' ||
        kind === 'cube_3d' ||
        kind === 'rect_3d'
      ) {
        const sType = el.shape_type || (kind === 'shape_3d' || kind === 'shape-3d' ? 'card_3d' : (kind as any));
        result.push({
          id,
          type: 'shape-3d',
          label: `${sType}: ${textVal || el.step_labels?.join(' / ') || '3D'}`,
          startTime,
          endTime: safeEnd,
          enterAnimation,
          exitAnimation,
          layout: {
            x: cx,
            y: hasNormBox || el.y !== undefined ? cy : 780,
            width: wPx,
            height: sType === 'staircase_3d' ? Math.max(320, hPx) : hPx,
            scale: 1,
            zIndex: 16,
          },
          props: {
            kind: 'shape-3d',
            shapeType: sType,
            fill: el.style?.fill || el.style?.bgColor || el.fill || '#14B8A6',
            shadow: true,
            highlight: true,
            depth: el.style?.depth ?? el.depth ?? 12,
            cornerRadius: 28,
            textContent: textVal || undefined,
            textColor: el.style?.textColor || el.textColor || '#FFFFFF',
            textSize: 'headline',
            textWeight: 'bold',
            stepLabels: el.step_labels ?? el.stepLabels,
          },
        });
        return;
      }

      if (kind === 'connector') {
        const connectorPrims = sanitizeCustomPrimitiveIcons(
          el.customPrimitives ?? synthesizeConnectorPrimitives(el, wPx, hPx),
          `${el.connector_spec?.label ?? ''} ${textVal}`,
        );
        result.push({
          id,
          type: 'illustration-prop',
          label: `Kết nối: ${el.connector_spec?.label || el.role || 'Arrow'}`,
          startTime,
          endTime: safeEnd,
          enterAnimation: mapV19EnterAnimation(el.animation?.in, 'fade-scale'),
          exitAnimation,
          layout: { x: cx, y: cy, width: wPx, height: hPx, scale: 1, zIndex: 14 },
          props: {
            kind: 'illustration-prop',
            variant: 'custom-connector',
            data: {
              customPrimitives: connectorPrims,
            },
          },
        });
        return;
      }

      if (kind === 'object') {
        const rawPrims = el.customPrimitives ?? el.data?.customPrimitives ?? el.object_spec?.primitives;
        const objPrims = sanitizeCustomPrimitiveIcons(
          rawPrims && rawPrims.length > 0 ? rawPrims : synthesizeObjectPrimitives(el, wPx, hPx),
          `${textVal} ${el.object_spec?.label ?? ''}`,
        );
        let normalizedPrimitives: VectorPrimitive[] | undefined = objPrims;
        if (objPrims && objPrims.length > 0) {
          const norm = normalizeCustomComponent({
            variant: 'custom-object',
            label: el.object_spec?.label || textVal || 'Object',
            primitives: objPrims,
          });
          if (norm && norm.primitives.length > 0) normalizedPrimitives = norm.primitives;
        }
        result.push({
          id,
          type: 'illustration-prop',
          label: `Vật thể: ${el.object_spec?.label || textVal || 'Object'}`,
          startTime,
          endTime: safeEnd,
          enterAnimation: mapV19EnterAnimation(el.animation?.in, 'fade-scale'),
          exitAnimation,
          layout: { x: cx, y: cy, width: wPx, height: hPx, scale: 1, zIndex: 10 },
          props: {
            kind: 'illustration-prop',
            variant: 'custom-object',
            data: {
              title: el.object_spec?.label || el.title || textVal,
              subtitle: el.object_spec?.sublabel || el.subtext,
              customPrimitives: normalizedPrimitives,
            },
          },
        });
        return;
      }

      if (kind === 'illustration' || kind === 'asset' || kind === 'illustration-prop') {
        const candidate = (el.variant ?? el.asset_id ?? '').replace(/_/g, '-') as IllustrationVariant;
        const rawPrimitives = el.data?.customPrimitives ?? el.customPrimitives;
        const hasPrims = Array.isArray(rawPrimitives) && rawPrimitives.length > 0;
        const mappedVariant: IllustrationVariant = hasPrims
          ? (candidate || 'custom-ui')
          : isKnownIllustrationVariant(candidate)
            ? candidate
            : matchIllustrationForCue(`${seg?.text ?? ''} ${textVal} ${el.title ?? ''}`, 'dynamic-scene');

        const contextForIcon = `${seg?.text ?? ''} ${textVal} ${el.title ?? ''}`;
        const rawIcon = (el.data?.sceneIcon ?? el.sceneIcon) as string | undefined;
        const iconRes = normalizeSceneIconWithAlias(rawIcon, contextForIcon);
        const resolvedDynamic = sanitizeDynamicSceneIcons(
          el.data?.dynamicScene ?? el.dynamicScene ?? el.dynamic_scene,
          contextForIcon,
        );
        const sanitizedPrims = sanitizeCustomPrimitiveIcons(rawPrimitives, contextForIcon);
        let normalizedPrimitives: VectorPrimitive[] | undefined;
        if (sanitizedPrims && sanitizedPrims.length > 0) {
          const norm = normalizeCustomComponent({
            variant: mappedVariant || 'custom-inline',
            label: el.title || textVal || 'Custom',
            primitives: sanitizedPrims,
          });
          if (norm && norm.primitives.length > 0) normalizedPrimitives = norm.primitives;
        }

        result.push({
          id,
          type: 'illustration-prop',
          label: `Minh họa: ${mappedVariant}`,
          startTime,
          endTime: safeEnd,
          enterAnimation: mapV19EnterAnimation(el.animation?.in, 'fade-scale'),
          exitAnimation,
          layout: {
            x: cx,
            y: hasNormBox || el.y !== undefined ? cy : 620,
            width: Math.max(360, wPx),
            height: hasNormBox ? hPx : undefined,
            scale: 1,
            zIndex: 8,
          },
          props: {
            kind: 'illustration-prop',
            variant: mappedVariant,
            data: {
              ...(el.data ?? {}),
              title: el.data?.title ?? el.title,
              subtitle: el.data?.subtitle ?? el.subtitle,
              nodes: el.data?.nodes ?? el.nodes,
              labels: el.data?.labels ?? el.labels,
              value: el.data?.value ?? el.value,
              timeHour: el.data?.timeHour ?? el.timeHour,
              timeMinute: el.data?.timeMinute ?? el.timeMinute,
              formula: el.data?.formula ?? el.formula,
              checklist: el.data?.checklist ?? el.checklist,
              upgrades: el.data?.upgrades ?? el.upgrades,
              boxes: el.data?.boxes ?? el.boxes,
              speechText: el.data?.speechText ?? el.speechText ?? (textVal || undefined),
              reactionText: el.data?.reactionText ?? el.reactionText,
              sceneIcon: iconRes.icon,
              highlightWord: el.data?.highlightWord ?? el.highlightWord,
              dynamicScene: resolvedDynamic,
              customPrimitives: normalizedPrimitives,
            },
          },
        });
        return;
      }

      // Default: 'text' | 'card' | 'sentence_card' | 'sentence-card'
      result.push({
        id,
        type: 'sentence-card',
        label: `Thẻ chữ: ${(textVal || el.role || 'Text').slice(0, 26)}`,
        startTime,
        endTime: safeEnd,
        enterAnimation,
        exitAnimation: mapV19ExitAnimation(el.animation?.out, 'shrink'),
        layout: {
          x: cx,
          y: hasNormBox || el.y !== undefined ? cy : 970,
          width: Math.max(380, wPx),
          scale: 1,
          zIndex: 22,
        },
        props: {
          kind: 'sentence-card',
          text: textVal || seg?.text || '',
          subtext: el.subtext ?? el.subtitle,
          badge: el.style?.badge ?? el.badge ?? 'none',
          stampText: el.style?.stampText ?? el.stampText,
          stampColor: el.style?.stampColor ?? el.stampColor,
          emphasisWord: el.style?.emphasisWord ?? el.emphasisWord ?? el.highlightWord,
          emphasisColor: el.style?.emphasisColor ?? el.emphasisColor ?? el.style?.accentColor,
          bgColor: el.style?.bgColor ?? el.bgColor,
          textColor: el.style?.textColor ?? el.textColor,
        },
      });
    });
  });

  void words;
  return result;
}

export function clampStoryboardPlanToAudioDuration<T extends FlexibleSceneDocument>(
  plan: T,
  audioDurationSec: number,
): T {
  const safeAudio = Number(audioDurationSec);
  if (!plan || !Number.isFinite(safeAudio) || safeAudio <= 0.2) return plan;

  const hasSegs = Array.isArray(plan.source_segments) && plan.source_segments.length > 0;
  const clampedSegs = hasSegs
    ? clampSourceSegmentsToAudioDuration(plan.source_segments!, safeAudio).segments
    : plan.source_segments;

  const clampedScenes = (plan.scenes ?? []).map((sc) => ({
    ...sc,
    elements: Array.isArray(sc.elements)
      ? sc.elements.map((rawEl) => {
          const el = rawEl as unknown as Record<string, unknown>;
          const copy: Record<string, unknown> = { ...el };
          if (typeof el.end_s === 'number' && el.end_s > safeAudio) {
            copy.end_s = Number(safeAudio.toFixed(3));
          }
          if (typeof el.end === 'number' && el.end > safeAudio) {
            copy.end = Number(safeAudio.toFixed(3));
          }
          if (typeof el.start_s === 'number' && el.start_s >= safeAudio - 0.2) {
            copy.start_s = Number(Math.max(0, safeAudio - 0.5).toFixed(3));
          }
          if (typeof el.start === 'number' && el.start >= safeAudio - 0.2) {
            copy.start = Number(Math.max(0, safeAudio - 0.5).toFixed(3));
          }
          return copy as unknown as typeof rawEl;
        })
      : sc.elements,
  }));

  return {
    ...plan,
    source_segments: clampedSegs,
    scenes: clampedScenes,
  };
}

export function scenePlanToProject(
  words: WordTiming[],
  plan: FlexibleSceneDocument,
  options?: {
    id?: string;
    title?: string;
    theme?: CanvasThemeId;
    compositionId?: LayoutCompositionId;
    audioFileName?: string;
    audioDurationSec?: number | null;
    cuesOverride?: TranscriptCue[];
  },
): LessonProject {
  const audioDur =
    typeof options?.audioDurationSec === 'number' && options.audioDurationSec > 0
      ? options.audioDurationSec
      : null;
  const effectivePlan = audioDur !== null ? clampStoryboardPlanToAudioDuration(plan, audioDur) : plan;
  const isV19 = isStoryboardV19Document(effectivePlan);
  const v19Segments = Array.isArray(effectivePlan.source_segments) ? effectivePlan.source_segments : [];

  const rawCues: TranscriptCue[] =
    options?.cuesOverride && options.cuesOverride.length > 0
      ? options.cuesOverride
      : isV19 && v19Segments.length > 0
        ? v19Segments.map((seg, idx) => ({
            id: seg.segment_id || `cue-${idx + 1}`,
            start: Number(seg.start),
            end: Number(seg.end),
            text: seg.text,
            words: interpolateWordTimings(seg.text, Number(seg.start), Number(seg.end)),
          }))
        : groupWordsIntoCues(words);
  const cues = audioDur !== null ? clampCuesToAudioDuration(rawCues, audioDur) : rawCues;

  const segLastEnd =
    v19Segments.length > 0 ? Math.max(...v19Segments.map((s) => Number(s.end) || 0)) : 0;
  const lastEnd =
    cues.length > 0
      ? Math.max(segLastEnd, ...cues.map((c) => c.end))
      : words.length > 0
        ? words[words.length - 1].end
        : Math.max(6.0, segLastEnd);
  const totalDuration =
    audioDur !== null
      ? Number(Math.max(lastEnd, audioDur).toFixed(2))
      : Number((lastEnd + 0.5).toFixed(2));

  const elements: SceneElement[] = [];

  if (isV19) {
    elements.push(
      ...convertStoryboardV19Elements(effectivePlan.scenes, v19Segments, words, cues, totalDuration),
    );
  }

  const sceneStarts = plan.scenes.map((sc) => {
    const allAts = [
      ...(sc.shapes ?? []).map((s) => s.at),
      ...(sc.texts ?? []).map((t) => t.at),
    ].filter((n) => typeof n === 'number' && n >= 1);
    const minAt = allAts.length > 0 ? Math.min(...allAts) : 1;
    const word = words[Math.min(words.length - 1, Math.max(0, minAt - 1))];
    return word ? word.start : 0;
  });

  plan.scenes.forEach((sc, scIdx) => {
    // Path 1: Legacy Flexible AI elements[] schema (skip if already handled by v1.9 converter)
    if (!isV19 && Array.isArray(sc.elements) && sc.elements.length > 0) {
      elements.push(
        ...convertFlexibleElements(sc.elements as FlexibleAiElement[], words, cues, totalDuration),
      );
    }

    // Path 2: Classic video_maker shapes[] + texts[] schema
    const nextSceneStart =
      scIdx < plan.scenes.length - 1 ? sceneStarts[scIdx + 1] : totalDuration;
    const sceneEnd = Math.max(sceneStarts[scIdx] + 0.6, nextSceneStart);
    const shapes = sc.shapes ?? [];
    const texts = sc.texts ?? [];

    shapes.forEach((sh, shIdx) => {
      const startWord = words[Math.min(words.length - 1, Math.max(0, (sh.at || 1) - 1))];
      const startTime = startWord ? startWord.start : 0;
      const untilWord =
        sh.until && words[Math.min(words.length - 1, Math.max(0, sh.until - 1))];
      const endTime = untilWord ? untilWord.end : sceneEnd;

      const attachedText = texts.find((t) => t.shape_index === shIdx);
      const px = (sh.position.x + sh.position.w / 2) * STAGE_W;
      const py = (sh.position.y + sh.position.h / 2) * STAGE_H;
      const pw = Math.round(sh.position.w * STAGE_W);
      const ph = Math.round(sh.position.h * STAGE_H);

      const safeSceneId = sc.id || sc.scene_id || `sc-${scIdx + 1}`;
      elements.push({
        id: `${safeSceneId}-shape-${shIdx}`,
        type: 'shape-3d',
        label: attachedText
          ? `${sh.type}: ${attachedText.content.slice(0, 22)}`
          : `Khối ${sh.type} #${shIdx + 1}`,
        startTime: Number(startTime.toFixed(2)),
        endTime: Number(Math.max(startTime + 0.4, endTime).toFixed(2)),
        enterAnimation: 'pop-up',
        exitAnimation: 'fade-out',
        atWordIndex: sh.at,
        layout: {
          x: Math.round(px),
          y: Math.round(py),
          width: pw,
          height: ph,
          scale: 1,
          zIndex: 10 + shIdx,
        },
        props: {
          kind: 'shape-3d',
          shapeType: sh.type,
          fill: sh.fill || '#14B8A6',
          shadow: sh.shadow ?? true,
          highlight: sh.highlight ?? true,
          depth: sh.depth ?? 10,
          cornerRadius: sh.corner_radius ?? 28,
          textContent: attachedText?.content,
          textColor: attachedText?.style?.color ?? '#FFFFFF',
          textSize: attachedText?.style?.size ?? 'headline',
          textWeight: attachedText?.style?.weight ?? 'bold',
          stepLabels: sh.step_labels,
        },
      });
    });

    texts
      .filter((t) => t.shape_index === undefined)
      .forEach((tx, txIdx) => {
        const startWord = words[Math.min(words.length - 1, Math.max(0, (tx.at || 1) - 1))];
        const startTime = startWord ? startWord.start : 0;
        const untilWord =
          tx.until && words[Math.min(words.length - 1, Math.max(0, tx.until - 1))];
        const endTime = untilWord ? untilWord.end : sceneEnd;
        const px = (tx.position?.x ?? 0.5) * STAGE_W;
        const py = (tx.position?.y ?? 0.42) * STAGE_H;
        const pw = (tx.position?.w ?? 0.78) * STAGE_W;

        const safeSceneId = sc.id || sc.scene_id || `sc-${scIdx + 1}`;
        elements.push({
          id: `${safeSceneId}-text-${txIdx}`,
          type: 'sentence-card',
          label: `Chữ: ${tx.content.slice(0, 22)}`,
          startTime: Number(startTime.toFixed(2)),
          endTime: Number(Math.max(startTime + 0.4, endTime).toFixed(2)),
          enterAnimation: 'slide-up',
          exitAnimation: 'fade-out',
          atWordIndex: tx.at,
          layout: {
            x: Math.round(px),
            y: Math.round(py),
            width: Math.round(pw),
            scale: 1,
            zIndex: 22 + txIdx,
          },
          props: {
            kind: 'sentence-card',
            text: tx.content,
            badge: 'none',
          },
        });
      });
  });

  const inferredSceneComp = plan.scenes?.find((sc) => sc.composition)?.composition as
    | LayoutCompositionId
    | undefined;
  const resolvedCompId = options?.compositionId ?? plan.compositionId ?? inferredSceneComp;
  const isCartoonHost = resolvedCompId === 'cartoon-host';
  const has3dOnly = elements.length > 0 && elements.every((e) => e.type === 'shape-3d');
  const resolvedTheme = options?.theme ?? plan.theme ?? (has3dOnly ? 'studio-slate' : 'pastel-sunrise');
  const isDarkTheme = isDarkCanvasTheme(resolvedTheme);

  // Fallback visual richness guard: if imported JSON/scenes leave any segment/cue with only bare text
  // (no illustration, 3D shape, word-stack, or tone-meter visible during that window), inject a
  // contextual Bootstrap/vector visual component (skipping word-reveal and cartoon-host which uses @Gimmys).
  const enrichWindows: Array<{ start: number; end: number; text: string }> = [];
  if (isV19 && v19Segments.length > 0) {
    v19Segments.forEach((seg) => {
      const s = Number(seg.start);
      const e = Number(seg.end);
      if (Number.isFinite(s) && Number.isFinite(e) && e - s >= 0.25) {
        enrichWindows.push({ start: s, end: e, text: String(seg.text ?? '') });
      }
    });
    cues.forEach((cue) => {
      const coveredBySeg = enrichWindows.some(
        (w) => Math.min(w.end, cue.end) - Math.max(w.start, cue.start) > 0.25,
      );
      if (!coveredBySeg && cue.end - cue.start >= 0.25) {
        enrichWindows.push({ start: cue.start, end: cue.end, text: cue.text });
      }
    });
    enrichWindows.sort((a, b) => a.start - b.start);
  } else {
    cues.forEach((cue) => {
      enrichWindows.push({ start: cue.start, end: cue.end, text: cue.text });
    });
  }

  if (
    resolvedCompId !== 'word-reveal' &&
    !isCartoonHost &&
    !has3dOnly &&
    enrichWindows.length > 0
  ) {
    const ROTATION_VARIANTS: IllustrationVariant[] = [
      'contrast-pair-cards',
      'phrase-icon-split',
      'bs-card-header',
      'css-sticky-note',
      'bs-alert-tip',
      'css-magnifying-word',
      'bs-badge-cluster',
      'css-bento-stats',
    ];
    let lastInjectedVariant: string | null = null;
    let lastVisualEnd = -1;

    enrichWindows.forEach((win, idx) => {
      const winMidStart = win.start + 0.12;
      const winMidEnd = Math.max(winMidStart + 0.08, win.end - 0.12);
      const hasVisual = elements.some(
        (el) =>
          (el.type === 'illustration-prop' ||
            el.type === 'shape-3d' ||
            el.type === 'word-stack' ||
            el.type === 'tone-meter') &&
          Math.min(el.endTime, winMidEnd) - Math.max(el.startTime, winMidStart) > 0.1,
      );
      if (hasVisual) return;

      const startT = Math.max(win.start, lastVisualEnd + 0.02);
      const nextWinStart =
        idx < enrichWindows.length - 1
          ? Math.max(win.end, enrichWindows[idx + 1].start - 0.02)
          : totalDuration;
      const endT =
        idx === enrichWindows.length - 1
          ? Math.min(totalDuration, win.end + 0.5)
          : Math.min(nextWinStart, win.end + 0.5);
      if (endT - startT < 0.4) return;

      const resolved = resolveContextualVisualForCue(win.text, undefined, 'bs-card-header');
      let chosenVariant = resolved.variant;
      let chosenData = resolved.data;
      if (chosenVariant === lastInjectedVariant) {
        const nextVar = ROTATION_VARIANTS[(idx + 1) % ROTATION_VARIANTS.length];
        chosenVariant = nextVar;
        chosenData = {
          ...(chosenData ?? {}),
          title: chosenData?.title || win.text.slice(0, 44),
          speechText: chosenData?.speechText || win.text,
        };
      }

      // Inspect vertical occupancy in this window so injected visual sits cleanly without colliding
      const overlappingText = elements.filter(
        (el) =>
          (el.type === 'sentence-card' || el.type === 'topic-pill') &&
          Math.min(el.endTime, endT) - Math.max(el.startTime, startT) > 0.1,
      );
      const hasUpperCard = overlappingText.some((el) => el.layout.y >= 360 && el.layout.y <= 680);
      const safeY = hasUpperCard ? 1020 : 520;

      elements.push({
        id: `auto-enrich-prop-${idx + 1}`,
        type: 'illustration-prop',
        label: `Minh họa: ${chosenVariant}`,
        startTime: Number(startT.toFixed(2)),
        endTime: Number(endT.toFixed(2)),
        enterAnimation: 'fade-scale',
        exitAnimation: 'fade-out',
        layout: { x: 540, y: safeY, width: 860, scale: 1, zIndex: 8 },
        props: {
          kind: 'illustration-prop',
          variant: chosenVariant,
          data: chosenData,
        },
      });
      lastInjectedVariant = chosenVariant;
      lastVisualEnd = endT;
    });
  }

  if (isCartoonHost) {
    // Prepare stage for @Gimmys: infer badge/stampText on sentence cards for facial reactions & hand pointers,
    // keep teaching elements cleanly in the upper zone above Gimmy (y < 760), and ensure @Gimmys exists.
    elements.forEach((el) => {
      if (el.props.kind === 'sentence-card') {
        const cardText = `${el.props.text || ''} ${el.props.subtext || ''}`;
        if (!el.props.badge || el.props.badge === 'none') {
          const inferredBadge: 'check' | 'cross' | 'question' | 'none' =
            /\b(avoid|rude|wrong|mistake|don't say|stop saying)\b|ぶっきらぼう|tránh|sai/i.test(cardText) ||
            /(?:^|[\s「『(【])NG(?:$|[\s」』)】:：!])/u.test(cardText)
              ? 'cross'
              : /[?？]/.test(cardText)
                ? 'question'
                : /\b(natural|polite|better|instead|could|may|can|tip)\b|丁寧|自然|nên dùng/i.test(cardText)
                  ? 'check'
                  : 'none';
          if (inferredBadge !== 'none') {
            el.props = {
              ...el.props,
              badge: inferredBadge,
              stampText:
                el.props.stampText ||
                (inferredBadge === 'cross'
                  ? 'AVOID'
                  : inferredBadge === 'check'
                    ? 'NATURAL'
                    : undefined),
              stampColor:
                el.props.stampColor ||
                (inferredBadge === 'cross'
                  ? '#DC2626'
                  : inferredBadge === 'check'
                    ? '#16A34A'
                    : undefined),
              bgColor:
                el.props.bgColor || (inferredBadge === 'cross' ? '#FFF1F2' : '#FFFFFF'),
            };
          }
        }
        if (el.layout.y > 760) {
          el.layout = { ...el.layout, y: 500, scale: Math.min(el.layout.scale || 1, 0.92) };
        }
      } else if (el.props.kind === 'tone-meter' && el.layout.y > 760) {
        el.layout = { ...el.layout, y: 690, width: Math.min(el.layout.width, 720), scale: 0.78 };
      } else if (
        el.props.kind === 'illustration-prop' &&
        el.props.variant !== 'cartoon-host' &&
        el.layout.y > 680
      ) {
        el.layout = { ...el.layout, y: 510, scale: Math.min(el.layout.scale || 1, 0.82) };
      }
    });

    // Build timed cartoon action segments from scenes / elements so @Gimmys follows Web AI choreography
    const segTimingMap = new Map<string, StoryboardSourceSegment>();
    v19Segments.forEach((s) => {
      if (s.segment_id) segTimingMap.set(s.segment_id, s);
    });
    const sceneActionSegments: CartoonActionSegment[] = [];
    (effectivePlan.scenes ?? []).forEach((sc, scIdx) => {
      const scEls = (sc.elements ?? []) as Array<StoryboardV19Element & FlexibleAiElement>;
      const elWithAction = scEls.find((it) => it.cartoonAction || it.cartoonMood || it.cartoonAnimationSpec);
      const actionId = sc.cartoonAction || elWithAction?.cartoonAction;
      const mood = sc.cartoonMood || elWithAction?.cartoonMood;
      const spec = sc.cartoonAnimationSpec || elWithAction?.cartoonAnimationSpec;
      if (!actionId && !mood && !spec) return;

      const refSegs = scEls
        .map((it) => (it.sync_anchor?.segment_id ? segTimingMap.get(it.sync_anchor.segment_id) : undefined))
        .filter((s): s is StoryboardSourceSegment => Boolean(s));
      let segStart = scIdx === 0 ? 0 : (cues[scIdx]?.start ?? (scIdx * totalDuration) / Math.max(1, effectivePlan.scenes.length));
      let segEnd = cues[scIdx]?.end ?? ((scIdx + 1) * totalDuration) / Math.max(1, effectivePlan.scenes.length);
      if (refSegs.length > 0) {
        segStart = Math.min(...refSegs.map((s) => Number(s.start) || 0));
        segEnd = Math.max(...refSegs.map((s) => Number(s.end) || segStart + 1.5));
      }
      sceneActionSegments.push({
        startTime: Number(Math.max(0, segStart).toFixed(3)),
        endTime: Number(Math.min(totalDuration, Math.max(segStart + 0.4, segEnd)).toFixed(3)),
        actionId,
        mood,
        spec,
      });
    });

    const existingCartoonHost = elements.find(
      (el) => el.props.kind === 'illustration-prop' && el.props.variant === 'cartoon-host',
    );
    if (existingCartoonHost && existingCartoonHost.props.kind === 'illustration-prop') {
      if (sceneActionSegments.length > 0) {
        existingCartoonHost.props = {
          ...existingCartoonHost.props,
          data: {
            ...(existingCartoonHost.props.data ?? {}),
            cartoonActionSegments: sceneActionSegments,
            cartoonAction: existingCartoonHost.props.data?.cartoonAction || sceneActionSegments[0]?.actionId,
            cartoonMood: existingCartoonHost.props.data?.cartoonMood || sceneActionSegments[0]?.mood,
          },
        };
      }
    } else {
      const hasToneMeter = elements.some((el) => el.type === 'tone-meter');
      elements.push({
        id: 'cartoon-host-main',
        type: 'illustration-prop',
        label: 'Nhân vật Hoạt Hình Lip-Sync (@Gimmys)',
        startTime: 0,
        endTime: totalDuration,
        enterAnimation: 'fade-scale',
        exitAnimation: 'fade-out',
        layout: {
          x: 540,
          y: hasToneMeter ? 1135 : 1085,
          width: 820,
          scale: hasToneMeter ? 0.88 : 0.94,
          zIndex: 12,
        },
        props: {
          kind: 'illustration-prop',
          variant: 'cartoon-host',
          data: {
            title: options?.title?.trim() || plan.title || 'Lesson Host',
            speechText: cues[0]?.text || '',
            cartoonAction: sceneActionSegments[0]?.actionId,
            cartoonMood: sceneActionSegments[0]?.mood,
            cartoonAnimationSpec: sceneActionSegments[0]?.spec,
            cartoonActionSegments: sceneActionSegments.length > 0 ? sceneActionSegments : undefined,
          },
        },
      });
    }
  }

  // Add bottom karaoke cues
  cues.forEach((cue, idx) => {
    elements.push({
      id: `karaoke-cue-${idx + 1}`,
      type: 'karaoke-card',
      label: `Sub động #${idx + 1}`,
      startTime: cue.start,
      endTime: cue.end,
      enterAnimation: isCartoonHost ? 'pop-up' : 'slide-up',
      exitAnimation: 'fade-out',
      layout: { x: 540, y: 1580, width: isCartoonHost ? 900 : 920, scale: 1, zIndex: 40 },
      props: {
        kind: 'karaoke-card',
        cueId: cue.id,
        words: cue.words,
        activeColor: isCartoonHost ? '#B91C1C' : isDarkTheme ? '#FACC15' : '#2563EB',
        inactiveColor: isCartoonHost ? '#334155' : isDarkTheme ? '#CBD5E1' : '#9CA3AF',
        spokenColor: isCartoonHost ? '#0F172A' : isDarkTheme ? '#FFFFFF' : '#111827',
        variant: isCartoonHost ? 'yellow-pill' : isDarkTheme ? 'dark-bar' : 'white-card',
      },
    });
  });

  const resolvedElements = resolveProjectOverlaps(elements);

  return {
    id: options?.id ?? `scene-ai-${Date.now()}`,
    title: options?.title?.trim() || plan.title || 'Dự án từ Scene JSON',
    subtitle: isCartoonHost
      ? `${cues.length} câu thoại · Hoạt hình Lip-Sync (@Gimmys)`
      : `${cues.length} câu thoại · ${resolvedElements.length} lớp đồ họa`,
    theme: resolvedTheme,
    compositionId: resolvedCompId,
    duration: totalDuration,
    fps: 30,
    cues,
    elements: resolvedElements,
    audioFileName: options?.audioFileName,
  };
}

export function projectToWordsAndScenePlan(project: LessonProject): {
  wordsJson: { words: WordTiming[] };
  scenePlan: ScenePlanDocument;
} {
  const allWords = project.cues.flatMap((c) => c.words);
  const findNearestWordIndex = (time: number): number => {
    if (allWords.length === 0) return 1;
    let bestIdx = 0;
    let bestDiff = Infinity;
    allWords.forEach((w, idx) => {
      const diff = Math.abs(w.start - time);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = idx;
      }
    });
    return bestIdx + 1;
  };

  const visualElements = project.elements.filter((e) => e.type !== 'karaoke-card');
  const shapes: ScenePlanShape[] = [];
  const texts: ScenePlanText[] = [];

  visualElements.forEach((el) => {
    const at = el.atWordIndex ?? findNearestWordIndex(el.startTime);
    const until = findNearestWordIndex(el.endTime);
    const wNorm = Number((el.layout.width / STAGE_W).toFixed(3));
    const hNorm = Number(((el.layout.height ?? 200) / STAGE_H).toFixed(3));
    const xNorm = Number(Math.max(0.04, el.layout.x / STAGE_W - wNorm / 2).toFixed(3));
    const yNorm = Number(Math.max(0.04, el.layout.y / STAGE_H - hNorm / 2).toFixed(3));

    if (el.props.kind === 'shape-3d') {
      const shapeIdx = shapes.length;
      shapes.push({
        type: el.props.shapeType,
        position: { x: xNorm, y: yNorm, w: wNorm, h: hNorm },
        fill: el.props.fill,
        shadow: el.props.shadow,
        highlight: el.props.highlight,
        depth: el.props.depth,
        corner_radius: el.props.cornerRadius,
        at,
        until,
        step_labels: el.props.stepLabels,
      });
      if (el.props.textContent) {
        texts.push({
          content: el.props.textContent,
          shape_index: shapeIdx,
          style: {
            size: el.props.textSize ?? 'headline',
            color: el.props.textColor ?? '#FFFFFF',
            weight: el.props.textWeight ?? 'bold',
            align: 'center',
          },
          at,
          until,
        });
      }
    } else if (el.props.kind === 'sentence-card') {
      const shapeIdx = shapes.length;
      shapes.push({
        type: 'card_3d',
        position: { x: xNorm, y: yNorm, w: wNorm, h: 0.11 },
        fill: el.props.badge === 'cross' ? '#FEE2E2' : '#FFFFFF',
        shadow: true,
        highlight: true,
        depth: 8,
        corner_radius: 32,
        at,
        until,
      });
      texts.push({
        content: el.props.text,
        shape_index: shapeIdx,
        style: {
          size: 'headline',
          color: el.props.badge === 'cross' ? '#991B1B' : '#0F172A',
          weight: 'bold',
          align: 'center',
        },
        at,
        until,
      });
    } else if (el.props.kind === 'topic-pill') {
      const shapeIdx = shapes.length;
      shapes.push({
        type: 'pill_3d',
        position: { x: xNorm, y: yNorm, w: Math.min(0.65, wNorm), h: 0.06 },
        fill: el.props.bgColor,
        shadow: true,
        highlight: true,
        depth: 5,
        at,
        until,
      });
      texts.push({
        content: el.props.text,
        shape_index: shapeIdx,
        style: {
          size: 'body',
          color: el.props.textColor,
          weight: 'bold',
          align: 'center',
        },
        at,
        until,
      });
    }
  });

  return {
    wordsJson: { words: allWords },
    scenePlan: {
      scenes: [
        {
          id: 'sc1',
          shapes,
          texts,
        },
      ],
    },
  };
}
