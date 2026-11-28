import { computeElementFrameState } from './animationMath';
import {
  ElementLayout,
  LessonProject,
  SceneElement,
  SceneElementType,
} from './types';

export const STAGE_SAFE_TOP = 108;
export const STAGE_SAFE_BOTTOM = 1415;
export const KARAOKE_SAFE_Y = 1585;
export const DEFAULT_MIN_VERTICAL_GAP = 24;
export const TIGHT_MIN_VERTICAL_GAP = 14;

export interface ElementBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  halfW: number;
  halfH: number;
}

function hasCjk(text: string): boolean {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text);
}

export function estimateWrappedLineCount(
  text: string,
  maxWidthPx: number,
  fontPx: number,
): number {
  const clean = text.trim();
  if (!clean) return 1;
  // Estimate line wrapping by measuring approximate per-character visual width (handles mixed JP/EN cleanly)
  const effectiveMaxW = Math.max(80, maxWidthPx);
  const tokens = clean.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]|[^\s\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]+|\s+/g) ?? [clean];

  let lines = 1;
  let lineW = 0;
  for (const tok of tokens) {
    if (/^\s+$/.test(tok)) {
      if (lineW > 0) lineW += fontPx * 0.28;
      continue;
    }
    let tokW = 0;
    for (const ch of tok) {
      if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/.test(ch)) {
        tokW += fontPx * 1.02;
      } else if (/[A-ZMW@]/.test(ch)) {
        tokW += fontPx * 0.68;
      } else if (/[ilI.,:;!|'"()「」]/.test(ch)) {
        tokW += fontPx * 0.34;
      } else {
        tokW += fontPx * 0.56;
      }
    }
    if (tokW > effectiveMaxW) {
      if (lineW > 0) {
        lines += 1;
        lineW = 0;
      }
      const extraLines = Math.ceil(tokW / effectiveMaxW) - 1;
      lines += extraLines;
      lineW = tokW % effectiveMaxW || effectiveMaxW;
      continue;
    }
    if (lineW > 0 && lineW + tokW > effectiveMaxW) {
      lines += 1;
      lineW = tokW;
    } else {
      lineW += tokW;
    }
  }
  return Math.max(1, lines);
}

export function estimateElementHalfExtents(el: SceneElement): {
  halfW: number;
  halfH: number;
} {
  const scale = el.layout.scale > 0 ? el.layout.scale : 1;
  const clampedWidth = Math.min(1040, Math.max(120, el.layout.width || 600));
  const baseHalfW = clampedWidth / 2;
  let baseHalfH = 90;

  switch (el.props.kind) {
    case 'comparison-strip': {
      const items = el.props.items || [];
      const isLongStack =
        !el.props.singleRow &&
        (items.some((i) => i.label.trim().length > 16) || items.length > 4);
      if (isLongStack && items.length > 0) {
        const totalH = items.reduce((acc, item, idx) => {
          const fSize = item.label.length > 78 ? 25 : 28;
          const lines = Math.min(3, estimateWrappedLineCount(item.label, Math.max(200, clampedWidth - 190), fSize));
          const rowH = Math.max(76, lines * Math.round(fSize * 1.26) + 28);
          return acc + rowH + (idx > 0 ? 12 : 0);
        }, 0);
        baseHalfH = Math.ceil(totalH / 2) + 8;
      } else {
        baseHalfH = el.props.singleRow ? 50 : 60;
      }
      break;
    }
    case 'topic-pill': {
      const pillInnerW = Math.max(160, Math.min(796, clampedWidth - 64));
      const lines = Math.min(3, estimateWrappedLineCount(el.props.text || '', pillInnerW, 30));
      const pillH = lines <= 1 ? 74 : lines * 38 + 32;
      baseHalfH = Math.ceil(pillH / 2) + 6;
      break;
    }
    case 'illustration-prop': {
      const variant = el.props.variant;
      const data = el.props.data;
      const isCustom =
        variant === 'custom-ui' ||
        variant === 'custom-object' ||
        variant === 'custom-connector' ||
        variant === 'custom-vector' ||
        Boolean(data?.customPrimitives?.length);
      const hasNativeLabels =
        variant === 'flow-diagram' ||
        variant === 'timeline-track' ||
        variant === 'tense-timeline' ||
        variant === 'degree-scale' ||
        variant === 'phrasal-split' ||
        variant === 'syllable-stress' ||
        variant === 'phrase-icon-split' ||
        variant === 'trio-icon-cards' ||
        variant === 'contrast-pair-cards' ||
        variant === 'quiz-fill-blank' ||
        variant === 'bs-list-group' ||
        variant === 'bs-pricing-tier' ||
        variant === 'bs-breadcrumb-path' ||
        variant === 'css-bento-stats' ||
        variant === 'css-chat-thread' ||
        variant === 'css-roadmap-steps' ||
        variant === 'css-grammar-equation' ||
        variant === 'bs-badge-cluster' ||
        variant === 'bs-modal-quiz' ||
        variant === 'p168-step-quiz-formula' ||
        variant === 'p168-grammar-formula' ||
        variant === 'p168-pronunciation-matrix' ||
        variant === 'p168-situation-cards' ||
        variant === 'p168-slider-compare' ||
        variant === 'p168-story-dialogue' ||
        variant === 'podcast-studio' ||
        variant === 'cartoon-host' ||
        variant === 'dynamic-scene' ||
        variant === 'custom-vector';

      if (variant === 'flow-diagram') {
        baseHalfH = 118;
      } else if (variant === 'gauge-arc') {
        baseHalfH = 148;
      } else if (variant === 'timeline-track') {
        baseHalfH = 122;
      } else if (variant === 'checklist-card') {
        const rows = Math.max(2, Math.min(4, data?.checklist?.length ?? 3));
        baseHalfH = Math.round((86 + rows * 68) / 2);
      } else if (variant === 'dialogue-upgrade') {
        const rows = Math.max(2, Math.min(3, data?.upgrades?.length ?? 3));
        baseHalfH = Math.round((68 + rows * 84) / 2);
      } else if (variant === 'clock-face') {
        baseHalfH = 145;
      } else if (variant === 'spatial-boxes') {
        baseHalfH = 122;
      } else if (variant === 'avatar-speech') {
        baseHalfH = 116;
      } else if (variant === 'podcast-studio') {
        baseHalfH = 214;
      } else if (variant === 'css-chat-thread') {
        baseHalfH = 150;
      } else if (variant === 'cartoon-host') {
        baseHalfH = 335;
      } else if (
        variant === 'p168-step-quiz-formula' ||
        variant === 'p168-situation-cards'
      ) {
        baseHalfH = 212;
      } else if (
        variant === 'p168-grammar-formula' ||
        variant === 'p168-pronunciation-matrix' ||
        variant === 'p168-slider-compare' ||
        variant === 'p168-story-dialogue'
      ) {
        baseHalfH = 198;
      } else if (variant === 'phrase-icon-split') {
        baseHalfH = 222;
      } else if (
        variant === 'trio-icon-cards' ||
        variant === 'contrast-pair-cards' ||
        variant === 'quiz-fill-blank'
      ) {
        baseHalfH = 148;
      } else if (variant === 'cafe-water' || variant === 'friends-chat' || variant === 'dynamic-scene') {
        baseHalfH = 146;
      } else if (
        variant === 'degree-scale' ||
        variant === 'idiom-split' ||
        variant === 'phrasal-split' ||
        variant === 'syllable-stress' ||
        variant === 'bs-badge-cluster' ||
        variant === 'css-roadmap-steps' ||
        variant === 'bs-breadcrumb-path' ||
        variant === 'bs-list-group' ||
        variant === 'bs-pricing-tier' ||
        variant === 'bs-accordion-faq' ||
        variant === 'css-bento-stats' ||
        variant === 'bs-toast-notify'
      ) {
        baseHalfH = 148;
      } else if (variant === 'css-browser-mockup') {
        const bodyTxt = data?.speechText || data?.subtitle || '';
        const bodyFont = bodyTxt.length > 145 ? 30 : 32;
        const bodyLineH = Math.round(bodyFont * 1.28);
        const estLines = Math.min(7, Math.max(2, estimateWrappedLineCount(bodyTxt, 760, bodyFont)));
        const titleLines = Math.min(2, estimateWrappedLineCount(data?.title || 'Reading Context', 760, 34));
        const cardH = Math.max(250, 90 + titleLines * 42 + estLines * bodyLineH + 38);
        baseHalfH = Math.ceil(cardH / 2) + 8;
      } else if (variant === 'bs-progress-meter') {
        baseHalfH = 120;
      } else if (variant === 'bs-alert-tip') {
        const titleStr = data?.title || 'Key Note';
        const bodyStr = data?.speechText || data?.subtitle || '';
        const tagStr = (data?.highlightWord || data?.formula || '').trim();
        const tLines = estimateWrappedLineCount(titleStr, 590, 34);
        const bLines = bodyStr ? estimateWrappedLineCount(bodyStr, 590, 30) : 0;
        const cardH = Math.max(224, (tagStr ? 48 : 0) + tLines * 42 + bLines * 38 + 52);
        baseHalfH = Math.ceil(cardH / 2) + 8;
      } else if (variant === 'bs-card-header') {
        const titleStr = data?.title || 'Key Lesson';
        const subStr = data?.subtitle || data?.speechText || '';
        const tLines = estimateWrappedLineCount(titleStr, 600, 38);
        const sLines = subStr ? estimateWrappedLineCount(subStr, 600, 30) : 0;
        const textBlockH = tLines * 46 + (sLines > 0 ? 8 + sLines * 38 : 0);
        const cardH = Math.max(264, 72 + textBlockH + 64);
        baseHalfH = Math.ceil(cardH / 2) + 8;
      } else if (isCustom && el.layout.height && el.layout.height > 20) {
        baseHalfH = Math.ceil(el.layout.height / 2) + 4;
      } else {
        baseHalfH = 136;
      }

      if (!hasNativeLabels && !data?.customPrimitives?.length && data?.labels?.length) {
        const clean = data.labels.map((l) => l.trim()).filter(Boolean).slice(0, 3);
        const stripH =
          clean.length >= 2 && clean.every((l) => l.length <= 13)
            ? 74
            : clean.reduce((sum, l, idx) => sum + (l.length > 36 ? 98 : 66) + (idx > 0 ? 10 : 0), 0);
        if (stripH > 0) {
          baseHalfH += Math.ceil((stripH + 16) / 2);
        }
      }

      if (!isCustom && (clampedWidth < 840 || (el.layout.height && el.layout.height < 280))) {
        const fitScale = Math.max(
          0.45,
          Math.min(1, clampedWidth / 860, el.layout.height ? el.layout.height / 280 : 1),
        );
        baseHalfH = Math.ceil(baseHalfH * fitScale);
      }
      break;
    }
    case 'sentence-card': {
      const innerW = Math.max(180, clampedWidth - 88);
      const hasSections = Array.isArray(el.props.sections) && el.props.sections.length > 0;
      const textLen = (el.props.text || '').trim().length;
      const widthScale = Math.min(1, clampedWidth / 760);
      const baseFont = hasSections
        ? textLen > 120
          ? 30
          : textLen > 65
            ? 34
            : 38
        : textLen > 95
          ? 36
          : textLen > 52
            ? 40
            : 46;
      const headFontSize = Math.max(20, Math.round(baseFont * widthScale));
      const lineH = Math.round(headFontSize * 1.28);
      const rawLines = (el.props.text || '')
        .split(/\r?\n/)
        .reduce((acc, part) => acc + estimateWrappedLineCount(part, innerW, headFontSize), 0);
      const lines = Math.min(hasSections ? 9 : 6, Math.max(1, rawLines));
      const subFont = Math.max(18, Math.round((hasSections ? 22 : 30) * widthScale));
      const subLineH = Math.round(subFont * 1.26);
      const subLines = el.props.subtext
        ? Math.min(
            hasSections ? 4 : 5,
            el.props.subtext
              .split(/\r?\n/)
              .reduce((acc, part) => acc + estimateWrappedLineCount(part, innerW, subFont), 0),
          )
        : 0;
      const subH = subLines > 0 ? subLines * subLineH + 16 : 0;
      const speakerExtra = el.props.speakerLabel ? 42 : 0;
      let sectionsH = 0;
      if (hasSections && el.props.sections) {
        const rawSecs = el.props.sections.filter((s) => Boolean(s.text && s.text.trim()));
        const secFont = Math.max(16, Math.round(23 * Math.min(1, widthScale)));
        const secLineH = Math.round(secFont * 1.24);
        const useTwoCol = clampedWidth >= 1150 && rawSecs.length >= 2;
        const halfColW = Math.floor((innerW - 18) / 2);
        const secHeights = rawSecs.map((sec, sIdx) => {
          const spanFull = !useTwoCol || (rawSecs.length % 2 === 1 && sIdx === rawSecs.length - 1);
          const boxInnerW = Math.max(150, (spanFull ? innerW : halfColW) - 28);
          const combined = sec.label ? `${sec.label}: ${sec.text}` : sec.text;
          const sLines = Math.max(1, estimateWrappedLineCount(combined, boxInnerW, secFont));
          return sLines * secLineH + 22;
        });
        if (useTwoCol) {
          let i = 0;
          while (i < secHeights.length) {
            if (secHeights.length % 2 === 1 && i === secHeights.length - 1) {
              sectionsH += secHeights[i] + 10;
              i += 1;
            } else {
              sectionsH += Math.max(secHeights[i], secHeights[i + 1] ?? 0) + 10;
              i += 2;
            }
          }
        } else {
          sectionsH = secHeights.reduce((acc, h) => acc + h + 10, 0);
        }
      }
      const stampPad = el.props.stampText ? 18 : 0;
      const rawCardH = Math.max(156, lines * lineH + subH + speakerExtra + sectionsH + 74 + stampPad);
      const cardH = hasSections
        ? Math.min(clampedWidth >= 1150 ? 700 : 1080, rawCardH)
        : rawCardH;
      const badgeExtra = el.props.badge && el.props.badge !== 'none' ? 18 : 0;
      const stampExtra = el.props.stampText ? 22 : 0;
      baseHalfH = Math.ceil((cardH + badgeExtra + stampExtra) / 2);
      break;
    }
    case 'word-stack': {
      const rowCount = Math.max(1, el.props.rows.length);
      const totalH = rowCount * 128 + (rowCount - 1) * 28;
      baseHalfH = Math.ceil(totalH / 2) + 8;
      break;
    }
    case 'shape-3d': {
      const depth = el.props.depth ?? 10;
      baseHalfH = Math.ceil(((el.layout.height ?? 200) + depth) / 2) + 8;
      break;
    }
    case 'tone-meter':
      baseHalfH = 82;
      break;
    case 'karaoke-card':
      baseHalfH = 104;
      break;
  }

  return {
    halfW: Math.round(baseHalfW * scale),
    halfH: Math.round(baseHalfH * scale),
  };
}

export function estimateElementBounds(el: SceneElement): ElementBounds {
  const { halfW, halfH } = estimateElementHalfExtents(el);
  return {
    left: el.layout.x - halfW,
    right: el.layout.x + halfW,
    top: el.layout.y - halfH,
    bottom: el.layout.y + halfH,
    width: halfW * 2,
    height: halfH * 2,
    halfW,
    halfH,
  };
}

function getZoneTier(el: SceneElement): number {
  switch (el.type) {
    case 'comparison-strip':
      return el.layout.y >= 320 ? 3.5 : 0;
    case 'topic-pill':
      return 1;
    case 'illustration-prop':
      if (el.props.kind === 'illustration-prop' && el.props.variant === 'cartoon-host') {
        return 4.2;
      }
      return el.layout.y >= 1150 ? 3.8 : 2;
    case 'word-stack':
    case 'shape-3d':
      return el.layout.y >= 1150 ? 3.8 : 2;
    case 'sentence-card':
      return 3;
    case 'tone-meter':
      return 4;
    case 'karaoke-card':
      return 5;
  }
}

function intervalsOverlap(a: SceneElement, b: SceneElement, minOverlap = 0.06): boolean {
  return Math.min(a.endTime, b.endTime) - Math.max(a.startTime, b.startTime) > minOverlap;
}

function horizontalOverlap(a: ElementBounds, b: ElementBounds): boolean {
  return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 12;
}

/**
 * Resolves vertical collisions across all simultaneously active visual elements
 * so cards, illustrations, diagrams, and tone meters never overlap each other
 * or encroach into the bottom karaoke subtitle safe zone.
 */
export function resolveProjectOverlaps(
  elements: SceneElement[],
  options?: { preserveKaraokeY?: boolean },
): SceneElement[] {
  const karaokeEls: SceneElement[] = [];
  const visualEls: SceneElement[] = [];
  const onlyKaraoke =
    elements.length > 0 && elements.every((el) => el.type === 'karaoke-card');
  const keepKaraokeY = Boolean(options?.preserveKaraokeY || onlyKaraoke);

  for (const el of elements) {
    if (el.type === 'karaoke-card') {
      const safeW = Math.min(1040, Math.max(320, el.layout.width || 920));
      const targetY =
        keepKaraokeY || el.layout.manualPosition
          ? Math.max(140, Math.min(1760, el.layout.y || KARAOKE_SAFE_Y))
          : Math.max(KARAOKE_SAFE_Y - 75, Math.min(1680, el.layout.y || KARAOKE_SAFE_Y));
      const cloned: SceneElement = {
        ...el,
        layout: {
          ...el.layout,
          x: 540,
          width: safeW,
          y: targetY,
        },
      };
      karaokeEls.push(cloned);
    } else {
      const safeScale = el.layout.scale > 0 ? el.layout.scale : 1;
      const safeWidth = Math.min(1040, Math.max(120, el.layout.width || 600));
      const halfW = (safeWidth * safeScale) / 2;
      const safeX =
        halfW * 2 >= 1040
          ? 540
          : Math.round(Math.max(20 + halfW, Math.min(1060 - halfW, el.layout.x)));
      visualEls.push({
        ...el,
        layout: { ...el.layout, x: safeX, width: safeWidth, scale: safeScale },
      });
    }
  }

  // Sort strictly by zone tier -> original Y -> startTime for deterministic topological packing
  visualEls.sort((a, b) => {
    const tierDiff = getZoneTier(a) - getZoneTier(b);
    if (tierDiff !== 0) return tierDiff;
    const yDiff = a.layout.y - b.layout.y;
    if (Math.abs(yDiff) > 4) return yDiff;
    return a.startTime - b.startTime;
  });

  // Pass 1: Place top-down respecting min gap against all overlapping predecessors (and top/center karaoke bands)
  const placed: SceneElement[] = [];
  for (const current of visualEls) {
    const curBounds = estimateElementBounds(current);
    let minCenterY = STAGE_SAFE_TOP + curBounds.halfH;

    for (const prev of placed) {
      if (!intervalsOverlap(current, prev)) continue;
      const prevBounds = estimateElementBounds(prev);
      if (!horizontalOverlap(curBounds, prevBounds)) continue;
      minCenterY = Math.max(
        minCenterY,
        prevBounds.bottom + DEFAULT_MIN_VERTICAL_GAP + curBounds.halfH,
      );
    }

    let desiredY = Math.max(current.layout.y, minCenterY);

    if (keepKaraokeY) {
      for (const k of karaokeEls) {
        if (!intervalsOverlap(current, k)) continue;
        const kBounds = estimateElementBounds(k);
        if (!horizontalOverlap(curBounds, kBounds)) continue;
        // Top-anchored karaoke: push visual elements below it
        if (kBounds.bottom < 700) {
          desiredY = Math.max(
            desiredY,
            kBounds.bottom + DEFAULT_MIN_VERTICAL_GAP + curBounds.halfH,
          );
        } else if (kBounds.top < STAGE_SAFE_BOTTOM) {
          // Center/mid-anchored karaoke: avoid overlapping [kBounds.top - 16, kBounds.bottom + 16]
          const curTop = desiredY - curBounds.halfH;
          const curBottom = desiredY + curBounds.halfH;
          if (curBottom > kBounds.top - 16 && curTop < kBounds.bottom + 16) {
            desiredY = Math.max(
              desiredY,
              kBounds.bottom + DEFAULT_MIN_VERTICAL_GAP + curBounds.halfH,
            );
          }
        }
      }
    }

    placed.push({
      ...current,
      layout: {
        ...current.layout,
        y: Math.round(desiredY),
      },
    });
  }

  // Pass 2: Check for any elements pushed below STAGE_SAFE_BOTTOM and compact/scale crowded slices
  const sampleTimes = Array.from(
    new Set(
      placed.flatMap((el) => [
        Number((el.startTime + 0.05).toFixed(3)),
        Number(((el.startTime + el.endTime) / 2).toFixed(3)),
      ]),
    ),
  ).sort((a, b) => a - b);

  for (const t of sampleTimes) {
    const activeIndices = placed
      .map((el, idx) => ({ el, idx }))
      .filter(({ el }) => t >= el.startTime && t <= el.endTime)
      .map(({ idx }) => idx);

    if (activeIndices.length === 0) continue;

    const maxBottom = Math.max(
      ...activeIndices.map((idx) => estimateElementBounds(placed[idx]).bottom),
    );
    if (maxBottom <= STAGE_SAFE_BOTTOM) continue;

    // Repack this active slice tightly from STAGE_SAFE_TOP to STAGE_SAFE_BOTTOM
    const totalGap = TIGHT_MIN_VERTICAL_GAP * Math.max(0, activeIndices.length - 1);
    const availableH = STAGE_SAFE_BOTTOM - STAGE_SAFE_TOP - totalGap;
    const rawHeights = activeIndices.map((idx) => {
      const b = estimateElementBounds(placed[idx]);
      return b.height;
    });
    const sumH = rawHeights.reduce((acc, h) => acc + h, 0);

    if (sumH > availableH && availableH > 200) {
      const shrinkRatio = Math.max(0.7, Math.min(1, availableH / sumH));
      for (const idx of activeIndices) {
        const el = placed[idx];
        // Never shrink comparison-strip more than 0.92 so top tabs remain crisp
        const factor = el.type === 'comparison-strip' ? Math.max(0.92, shrinkRatio) : shrinkRatio;
        const newScale = Number(((el.layout.scale || 1) * factor).toFixed(3));
        placed[idx] = {
          ...el,
          layout: {
            ...el.layout,
            scale: Math.max(0.68, newScale),
          },
        };
      }
    }

    // Recompute actual total height after first shrink; if comparison-strip floor kept sum > availableH,
    // proportionally tighten non-strip items so no bottom item gets clamped back up onto a predecessor.
    const scaledTotal = activeIndices.reduce(
      (acc, idx) => acc + estimateElementBounds(placed[idx]).height,
      0,
    );
    if (scaledTotal > availableH && availableH > 200) {
      const extraRatio = Math.max(0.56, Math.min(1, availableH / scaledTotal));
      for (const idx of activeIndices) {
        const el = placed[idx];
        const nextScale = Number(((el.layout.scale || 1) * extraRatio).toFixed(3));
        placed[idx] = {
          ...el,
          layout: {
            ...el.layout,
            scale: Math.max(0.56, nextScale),
          },
        };
      }
    }

    // Re-stack cleanly top-down inside STAGE_SAFE_TOP..STAGE_SAFE_BOTTOM
    let cursorY = STAGE_SAFE_TOP;
    for (let i = 0; i < activeIndices.length; i++) {
      const idx = activeIndices[i];
      const el = placed[idx];
      const { halfH } = estimateElementHalfExtents(el);
      const nextY = Math.round(cursorY + halfH);
      placed[idx] = {
        ...el,
        layout: {
          ...el.layout,
          y: nextY,
        },
      };
      cursorY = nextY + halfH + TIGHT_MIN_VERTICAL_GAP;
    }
  }

  // Pass 3: Final safety assertion pass across all time overlaps in case Pass 2 pulled an element
  // into conflict with another companion outside that single sample time
  for (let i = 0; i < placed.length; i++) {
    let current = placed[i];
    let curBounds = estimateElementBounds(current);
    let maxPrevBottom = -Infinity;

    for (let j = 0; j < i; j++) {
      const prev = placed[j];
      if (!intervalsOverlap(current, prev)) continue;
      const prevBounds = estimateElementBounds(prev);
      if (!horizontalOverlap(curBounds, prevBounds)) continue;
      if (curBounds.top < prevBounds.bottom + TIGHT_MIN_VERTICAL_GAP) {
        maxPrevBottom = Math.max(maxPrevBottom, prevBounds.bottom);
      }
    }

    if (maxPrevBottom > -Infinity) {
      const targetTop = maxPrevBottom + TIGHT_MIN_VERTICAL_GAP;
      const shiftedY = Math.round(targetTop + curBounds.halfH);
      if (shiftedY + curBounds.halfH <= STAGE_SAFE_BOTTOM) {
        placed[i] = {
          ...current,
          layout: { ...current.layout, y: shiftedY },
        };
      } else {
        const roomH = Math.max(60, STAGE_SAFE_BOTTOM - targetTop);
        const curFullH = Math.max(1, curBounds.halfH * 2);
        const fitFactor = Math.min(0.9, roomH / curFullH);
        const nextScale = Number(Math.max(0.44, (current.layout.scale || 1) * fitFactor).toFixed(3));
        const updated: SceneElement = {
          ...current,
          layout: { ...current.layout, scale: nextScale },
        };
        const updatedHalfH = estimateElementHalfExtents(updated).halfH;
        const nextY = Math.round(targetTop + updatedHalfH);
        placed[i] = {
          ...updated,
          layout: {
            ...updated.layout,
            y: nextY,
          },
        };
      }
    }
  }

  return [...placed, ...karaokeEls];
}

export interface VisualOverlapViolation {
  firstId: string;
  secondId: string;
  time: number;
  overlapPx: number;
}

export function findVisualOverlaps(
  elements: SceneElement[],
  stepSec = 0.25,
): VisualOverlapViolation[] {
  const violations: VisualOverlapViolation[] = [];
  if (elements.length === 0) return violations;

  const maxTime = Math.max(...elements.map((e) => e.endTime));
  const seenPairs = new Set<string>();

  for (let t = 0; t <= maxTime; t = Number((t + stepSec).toFixed(2))) {
    const active = elements.filter((el) => computeElementFrameState(el, t).visible);
    for (let i = 0; i < active.length; i++) {
      const a = active[i];
      const ba = estimateElementBounds(a);

      // Check visual element vs karaoke boundary
      if (a.type !== 'karaoke-card' && ba.bottom > STAGE_SAFE_BOTTOM + 20) {
        const key = `${a.id}::karaoke-zone`;
        if (!seenPairs.has(key)) {
          seenPairs.add(key);
          violations.push({
            firstId: a.id,
            secondId: 'karaoke-zone',
            time: t,
            overlapPx: Math.round(ba.bottom - STAGE_SAFE_BOTTOM),
          });
        }
      }

      for (let j = i + 1; j < active.length; j++) {
        const b = active[j];
        if (!intervalsOverlap(a, b, 0.02)) continue;
        const bb = estimateElementBounds(b);
        if (!horizontalOverlap(ba, bb)) continue;
        const overlapY = Math.min(ba.bottom, bb.bottom) - Math.max(ba.top, bb.top);
        if (overlapY > 2) {
          const pairKey = [a.id, b.id].sort().join('::');
          if (!seenPairs.has(pairKey)) {
            seenPairs.add(pairKey);
            violations.push({
              firstId: a.id,
              secondId: b.id,
              time: t,
              overlapPx: Math.round(overlapY),
            });
          }
        }
      }
    }
  }

  return violations;
}

export function resolveProjectElements(project: LessonProject): LessonProject {
  return {
    ...project,
    elements: resolveProjectOverlaps(project.elements),
  };
}

export interface StageOverlapWarning {
  firstId: string;
  firstLabel: string;
  secondId: string;
  secondLabel: string;
  overlapPx: number;
}

export interface TitleBoundsBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function resolveBoxFromLayout(
  el: SceneElement,
  layout?: ElementLayout,
): { left: number; right: number; top: number; bottom: number; halfW: number; halfH: number } {
  const effective: SceneElement = layout ? { ...el, layout } : el;
  const bounds = estimateElementBounds(effective);
  return {
    left: bounds.left,
    right: bounds.right,
    top: bounds.top,
    bottom: bounds.bottom,
    halfW: bounds.halfW,
    halfH: bounds.halfH,
  };
}

export function detectActiveStageOverlaps(
  elements: SceneElement[],
  resolvedMap: Map<string, ElementLayout>,
  time: number,
  titleBox?: TitleBoundsBox | null,
): StageOverlapWarning[] {
  const warnings: StageOverlapWarning[] = [];
  const active = elements.filter((el) => computeElementFrameState(el, time).visible);

  if (titleBox) {
    const tbLeft = titleBox.x - titleBox.width / 2;
    const tbRight = titleBox.x + titleBox.width / 2;
    const tbTop = titleBox.y - titleBox.height / 2;
    const tbBottom = titleBox.y + titleBox.height / 2;
    for (const el of active) {
      if (el.type === 'karaoke-card') continue;
      const box = resolveBoxFromLayout(el, resolvedMap.get(el.id));
      const overlapX = Math.min(tbRight, box.right) - Math.max(tbLeft, box.left);
      const overlapY = Math.min(tbBottom, box.bottom) - Math.max(tbTop, box.top);
      if (overlapX > 10 && overlapY > 6) {
        warnings.push({
          firstId: '__title__',
          firstLabel: 'Tiêu đề bài giảng',
          secondId: el.id,
          secondLabel: el.label || el.type,
          overlapPx: Math.round(overlapY),
        });
      }
    }
  }

  for (let i = 0; i < active.length; i++) {
    const a = active[i];
    const ba = resolveBoxFromLayout(a, resolvedMap.get(a.id));
    for (let j = i + 1; j < active.length; j++) {
      const b = active[j];
      if (!intervalsOverlap(a, b, 0.02)) continue;
      const bb = resolveBoxFromLayout(b, resolvedMap.get(b.id));
      const overlapX = Math.min(ba.right, bb.right) - Math.max(ba.left, bb.left);
      const overlapY = Math.min(ba.bottom, bb.bottom) - Math.max(ba.top, bb.top);
      if (overlapX > 12 && overlapY > 6) {
        warnings.push({
          firstId: a.id,
          firstLabel: a.label || a.type,
          secondId: b.id,
          secondLabel: b.label || b.type,
          overlapPx: Math.round(overlapY),
        });
      }
    }
  }

  return warnings;
}

export function reflowElementsAvoidingOverlap(
  elements: SceneElement[],
  pinnedId: string,
  resolvedMap: Map<string, ElementLayout>,
  options?: {
    stageWidth?: number;
    stageHeight?: number;
    gapPx?: number;
    titleBox?: TitleBoundsBox | null;
    pinStrict?: boolean;
  },
): Map<string, ElementLayout> {
  const stageW = options?.stageWidth ?? 1080;
  const stageH = options?.stageHeight ?? 1920;
  const gapPx = options?.gapPx ?? 18;
  const pinStrict = options?.pinStrict ?? true;

  const working = new Map<string, ElementLayout>();
  for (const el of elements) {
    const baseLay = { ...(resolvedMap.get(el.id) || el.layout) };
    const box = resolveBoxFromLayout(el, baseLay);
    const minX = box.halfW + 18;
    const maxX = stageW - box.halfW - 18;
    const clampedX =
      minX > maxX
        ? Math.round(stageW / 2)
        : Math.round(Math.max(minX, Math.min(maxX, baseLay.x)));
    working.set(el.id, { ...baseLay, x: clampedX });
  }

  const ordered = elements
    .map((el) => ({ el, lay: working.get(el.id)! }))
    .filter((item) => item.el.type !== 'karaoke-card');

  const karaokeFixed = elements.filter((el) => el.type === 'karaoke-card');
  const titleRect = options?.titleBox
    ? {
        left: options.titleBox.x - options.titleBox.width / 2,
        right: options.titleBox.x + options.titleBox.width / 2,
        top: options.titleBox.y - options.titleBox.height / 2,
        bottom: options.titleBox.y + options.titleBox.height / 2,
      }
    : null;

  const sampleTimes = Array.from(
    new Set(
      ordered.flatMap((item) => [
        Number((item.el.startTime + 0.04).toFixed(3)),
        Number(((item.el.startTime + item.el.endTime) * 0.5).toFixed(3)),
      ]),
    ),
  )
    .filter((t) => Number.isFinite(t) && t >= 0)
    .sort((a, b) => a - b);

  const isVisualColumnCandidate = (el: SceneElement): boolean => {
    if (el.type === 'word-stack' || el.type === 'shape-3d') return true;
    if (el.type === 'illustration-prop') {
      const v = el.props.kind === 'illustration-prop' ? el.props.variant : '';
      return v !== 'bs-progress-meter';
    }
    return false;
  };

  const getSliceSafeBounds = (t: number) => {
    let safeTop = 36;
    let safeBottom = stageH - 44;
    for (const k of karaokeFixed) {
      if (t < k.startTime - 0.01 || t > k.endTime + 0.01) continue;
      const kb = resolveBoxFromLayout(k, working.get(k.id));
      if (kb.bottom < stageH * 0.42) {
        safeTop = Math.max(safeTop, Math.round(kb.bottom + gapPx));
      } else if (kb.top > stageH * 0.56) {
        safeBottom = Math.min(safeBottom, Math.round(kb.top - gapPx));
      }
    }
    return { safeTop, safeBottom };
  };

  const getColumnTopWithTitle = (
    items: SceneElement[],
    baseSafeTop: number,
  ): number => {
    if (!titleRect) return baseSafeTop;
    let top = baseSafeTop;
    for (const el of items) {
      if (el.id === pinnedId && pinStrict) continue;
      const b = resolveBoxFromLayout(el, working.get(el.id));
      const xOverlap = Math.min(titleRect.right, b.right) - Math.max(titleRect.left, b.left);
      if (xOverlap > 10) {
        top = Math.max(top, Math.round(titleRect.bottom + gapPx));
      }
    }
    return top;
  };

  // Phase 1: On wide/square viewports (16:9 or 1:1), if a slice stacks taller than available height,
  // intelligently distribute visual vs card into crisp 2-column side-by-side placement.
  if (stageW >= stageH) {
    for (const t of sampleTimes) {
      const active = ordered
        .map((o) => o.el)
        .filter((el) => t >= el.startTime - 0.01 && t <= el.endTime + 0.01);
      if (active.length < 2) continue;
      const { safeTop, safeBottom } = getSliceSafeBounds(t);
      const colTop = getColumnTopWithTitle(active, safeTop);
      const availH = Math.max(180, safeBottom - colTop);

      const nonStrip = active.filter(
        (el) => !(el.type === 'comparison-strip' && !el.id.includes('-quiz-opts-')),
      );
      if (nonStrip.length < 2) continue;

      const sumH =
        nonStrip.reduce((acc, el) => acc + resolveBoxFromLayout(el, working.get(el.id)).height, 0) +
        gapPx * (nonStrip.length - 1);
      if (sumH <= availH) continue;

      const visuals = nonStrip.filter(isVisualColumnCandidate);
      const cards = nonStrip.filter((el) => !isVisualColumnCandidate(el));
      if (visuals.length === 0 || cards.length === 0) continue;

      const leftX = Math.round(stageW * 0.27);
      const rightX = Math.round(stageW * 0.73);
      const maxColW = Math.round(stageW * 0.44);

      const pinnedIsRight =
        cards.some((c) => c.id === pinnedId) &&
        (working.get(pinnedId)?.x ?? stageW / 2) >= stageW * 0.48;
      const pinnedIsLeft =
        visuals.some((v) => v.id === pinnedId) &&
        (working.get(pinnedId)?.x ?? stageW / 2) <= stageW * 0.52;

      for (const v of visuals) {
        if (v.id === pinnedId && (pinStrict || pinnedIsLeft)) continue;
        const cur = working.get(v.id)!;
        const targetX = pinnedIsLeft ? rightX : leftX;
        const nextW = Math.min(cur.width || maxColW, maxColW);
        working.set(v.id, { ...cur, x: targetX, width: nextW, manualPosition: true });
      }
      for (const c of cards) {
        if (c.id === pinnedId && (pinStrict || pinnedIsRight)) continue;
        const cur = working.get(c.id)!;
        const targetX = pinnedIsLeft ? leftX : rightX;
        const nextW = Math.min(cur.width || maxColW, maxColW);
        working.set(c.id, { ...cur, x: targetX, width: nextW, manualPosition: true });
      }
    }
  }

  // Phase 2: Multi-pass per-slice constraint solver across ALL cards/segments (1..N)
  const packCluster = (
    cluster: SceneElement[],
    clusterTop: number,
    clusterBottom: number,
  ) => {
    if (cluster.length === 0) return;
    cluster.sort((a, b) => {
      const ya = working.get(a.id)?.y ?? a.layout.y;
      const yb = working.get(b.id)?.y ?? b.layout.y;
      if (Math.abs(ya - yb) > 4) return ya - yb;
      const td = getZoneTier(a) - getZoneTier(b);
      if (td !== 0) return td;
      return a.startTime - b.startTime;
    });

    const pinnedIdx = cluster.findIndex((el) => el.id === pinnedId);
    const hasStrictPin = pinnedIdx >= 0 && pinStrict;

    // If strict pinned element overlaps karaoke bounds, gently nudge it inside [clusterTop, clusterBottom]
    if (hasStrictPin) {
      const pEl = cluster[pinnedIdx];
      const pLay = working.get(pEl.id)!;
      const pBox = resolveBoxFromLayout(pEl, pLay);
      if (pBox.bottom > clusterBottom) {
        const clampedY = Math.max(
          Math.round(pBox.halfH + 36),
          Math.round(clusterBottom - pBox.halfH),
        );
        working.set(pEl.id, { ...pLay, y: clampedY, manualPosition: true });
      } else if (pBox.top < clusterTop && !titleRect) {
        const clampedY = Math.min(
          Math.round(clusterBottom - pBox.halfH),
          Math.round(clusterTop + pBox.halfH),
        );
        working.set(pEl.id, { ...pLay, y: clampedY, manualPosition: true });
      }
    }

    if (hasStrictPin) {
      const pEl = cluster[pinnedIdx];
      const pLay = working.get(pEl.id)!;
      const pBox = resolveBoxFromLayout(pEl, pLay);

      // Partition unpinned items into those staying above pinned vs pushed below pinned
      const above = cluster.filter((el, i) => i < pinnedIdx);
      const below = cluster.filter((el, i) => i > pinnedIdx);

      // Try placing `above` tightly between clusterTop and pBox.top - gapPx
      const aboveAvail = pBox.top - gapPx - clusterTop;
      const aboveNeed =
        above.reduce((acc, el) => acc + resolveBoxFromLayout(el, working.get(el.id)).height, 0) +
        gapPx * Math.max(0, above.length - 1);

      const finalBelow: SceneElement[] = [...below];
      const finalAbove: SceneElement[] = [];
      if (above.length > 0) {
        if (aboveNeed <= aboveAvail && aboveAvail > 40) {
          finalAbove.push(...above);
        } else {
          // If items above don't fit above pinned, try scaling `above` slightly or move colliding ones below pinned
          let runningNeed = 0;
          for (let ai = 0; ai < above.length; ai++) {
            const el = above[ai];
            const h = resolveBoxFromLayout(el, working.get(el.id)).height;
            if (runningNeed + h <= aboveAvail) {
              finalAbove.push(el);
              runningNeed += h + gapPx;
            } else {
              finalBelow.unshift(el);
            }
          }
        }
      }

      if (finalAbove.length > 0) {
        let cursorBottom = pBox.top - gapPx;
        for (let ai = finalAbove.length - 1; ai >= 0; ai--) {
          const el = finalAbove[ai];
          const cur = working.get(el.id)!;
          const b = resolveBoxFromLayout(el, cur);
          const desiredBottom = Math.min(cursorBottom, b.bottom);
          const nextY = Math.max(Math.round(clusterTop + b.halfH), Math.round(desiredBottom - b.halfH));
          working.set(el.id, { ...cur, y: nextY, manualPosition: true });
          cursorBottom = nextY - b.halfH - gapPx;
        }
      }

      if (finalBelow.length > 0) {
        const belowStart = pBox.bottom + gapPx;
        const belowAvail = Math.max(90, clusterBottom - belowStart);
        const belowGap = Math.max(10, Math.min(gapPx, 16));
        const rawNeed =
          finalBelow.reduce((acc, el) => acc + resolveBoxFromLayout(el, working.get(el.id)).height, 0) +
          belowGap * Math.max(0, finalBelow.length - 1);
        if (rawNeed > belowAvail) {
          const ratio = Math.max(0.45, Math.min(1, (belowAvail - belowGap * Math.max(0, finalBelow.length - 1)) / Math.max(1, rawNeed - belowGap * Math.max(0, finalBelow.length - 1))));
          for (const el of finalBelow) {
            const cur = working.get(el.id)!;
            working.set(el.id, {
              ...cur,
              scale: Number(Math.max(0.42, (cur.scale || 1) * ratio).toFixed(3)),
              manualPosition: true,
            });
          }
        }
        let cursorTop = belowStart;
        for (const el of finalBelow) {
          const cur = working.get(el.id)!;
          const b = resolveBoxFromLayout(el, cur);
          const nextY = Math.round(Math.max(cur.y, cursorTop + b.halfH));
          const maxY = Math.round(clusterBottom - b.halfH);
          const placedY = cursorTop + b.halfH <= maxY ? Math.min(nextY, maxY) : Math.round(cursorTop + b.halfH);
          working.set(el.id, { ...cur, y: placedY, manualPosition: true });
          cursorTop = placedY + b.halfH + belowGap;
        }
      }
      return;
    }

    // Unpinned / global smart pack inside [clusterTop, clusterBottom]
    const availH = Math.max(140, clusterBottom - clusterTop);
    const totalGap = gapPx * Math.max(0, cluster.length - 1);
    const rawHeightSum = cluster.reduce(
      (acc, el) => acc + resolveBoxFromLayout(el, working.get(el.id)).height,
      0,
    );

    if (rawHeightSum + totalGap > availH) {
      const compactGap = Math.max(10, gapPx - 6);
      const compactTotalGap = compactGap * Math.max(0, cluster.length - 1);
      if (rawHeightSum + compactTotalGap > availH) {
        const ratio = Math.max(
          0.44,
          Math.min(1, (availH - compactTotalGap) / Math.max(1, rawHeightSum)),
        );
        for (const el of cluster) {
          const cur = working.get(el.id)!;
          const nextScale = Number(Math.max(0.44, (cur.scale || 1) * ratio).toFixed(3));
          working.set(el.id, { ...cur, scale: nextScale, manualPosition: true });
        }
      }
      let cursor = clusterTop;
      for (const el of cluster) {
        const cur = working.get(el.id)!;
        const b = resolveBoxFromLayout(el, cur);
        const ny = Math.round(cursor + b.halfH);
        working.set(el.id, { ...cur, y: ny, manualPosition: true });
        cursor = ny + b.halfH + compactGap;
      }
    } else {
      // Preserve natural Y order unless items overlap or exceed clusterBottom/clusterTop
      let cursor = clusterTop;
      const firstBox = resolveBoxFromLayout(cluster[0], working.get(cluster[0].id));
      const slack = availH - (rawHeightSum + totalGap);
      if (firstBox.top > clusterTop && firstBox.top - clusterTop <= slack) {
        cursor = firstBox.top;
      }
      for (const el of cluster) {
        const cur = working.get(el.id)!;
        const b = resolveBoxFromLayout(el, cur);
        const ny = Math.round(Math.max(cursor + b.halfH, Math.max(clusterTop + b.halfH, cur.y)));
        working.set(el.id, { ...cur, y: ny, manualPosition: true });
        cursor = ny + b.halfH + gapPx;
      }
      // If greedy preservation pushed the bottom item past clusterBottom, pull cluster cleanly top-down from clusterTop
      const lastEl = cluster[cluster.length - 1];
      const lastBottom = resolveBoxFromLayout(lastEl, working.get(lastEl.id)).bottom;
      if (lastBottom > clusterBottom) {
        let tightCursor = clusterTop;
        for (const el of cluster) {
          const cur = working.get(el.id)!;
          const b = resolveBoxFromLayout(el, cur);
          const ny = Math.round(tightCursor + b.halfH);
          working.set(el.id, { ...cur, y: ny, manualPosition: true });
          tightCursor = ny + b.halfH + gapPx;
        }
      }
    }
  };

  for (let pass = 0; pass < 2; pass++) {
    for (const t of sampleTimes) {
      const active = ordered
        .map((o) => o.el)
        .filter((el) => t >= el.startTime - 0.01 && t <= el.endTime + 0.01);
      if (active.length === 0) continue;

      const { safeTop, safeBottom } = getSliceSafeBounds(t);

      // Partition active elements into horizontal-overlap connected clusters
      const visited = new Set<string>();
      for (const seed of active) {
        if (visited.has(seed.id)) continue;
        const cluster: SceneElement[] = [];
        const queue: SceneElement[] = [seed];
        visited.add(seed.id);
        while (queue.length > 0) {
          const cur = queue.shift()!;
          cluster.push(cur);
          const cb = resolveBoxFromLayout(cur, working.get(cur.id));
          for (const cand of active) {
            if (visited.has(cand.id)) continue;
            const kb = resolveBoxFromLayout(cand, working.get(cand.id));
            const xOverlap = Math.min(cb.right, kb.right) - Math.max(cb.left, kb.left);
            if (xOverlap > 10) {
              visited.add(cand.id);
              queue.push(cand);
            }
          }
        }
        const clusterTop = getColumnTopWithTitle(cluster, safeTop);
        packCluster(cluster, clusterTop, safeBottom);
      }
    }
  }

  return working;
}

