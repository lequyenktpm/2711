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
        variant === 'bs-list-group'
      ) {
        baseHalfH = 144;
      } else if (variant === 'css-browser-mockup') {
        const bodyTxt = data?.speechText || data?.subtitle || '';
        const bodyFont = bodyTxt.length > 145 ? 30 : 32;
        const bodyLineH = Math.round(bodyFont * 1.28);
        const estLines = Math.min(7, Math.max(2, estimateWrappedLineCount(bodyTxt, 760, bodyFont)));
        const titleLines = Math.min(2, estimateWrappedLineCount(data?.title || 'Reading Context', 760, 34));
        const cardH = Math.max(250, 90 + titleLines * 42 + estLines * bodyLineH + 38);
        baseHalfH = Math.ceil(cardH / 2) + 8;
      } else if (variant === 'bs-progress-meter') {
        baseHalfH = 116;
      } else if (variant === 'bs-alert-tip' || variant === 'bs-card-header') {
        baseHalfH = 152;
      } else if (isCustom && el.layout.height && el.layout.height > 20) {
        baseHalfH = Math.ceil(el.layout.height / 2) + 4;
      } else {
        baseHalfH = 132;
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
      const textLen = (el.props.text || '').trim().length;
      const widthScale = Math.min(1, clampedWidth / 760);
      const baseFont = textLen > 95 ? 36 : textLen > 52 ? 40 : 46;
      const headFontSize = Math.max(22, Math.round(baseFont * widthScale));
      const lineH = Math.round(headFontSize * 1.28);
      const rawLines = (el.props.text || '')
        .split(/\r?\n/)
        .reduce((acc, part) => acc + estimateWrappedLineCount(part, innerW, headFontSize), 0);
      const lines = Math.min(6, Math.max(1, rawLines));
      const subFont = Math.max(19, Math.round(30 * widthScale));
      const subLineH = Math.round(subFont * 1.26);
      const subLines = el.props.subtext
        ? Math.min(
            5,
            el.props.subtext
              .split(/\r?\n/)
              .reduce((acc, part) => acc + estimateWrappedLineCount(part, innerW, subFont), 0),
          )
        : 0;
      const subH = subLines > 0 ? subLines * subLineH + 18 : 0;
      const stampPad = el.props.stampText ? 18 : 0;
      const cardH = Math.max(156, lines * lineH + subH + 74 + stampPad);
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
  },
): Map<string, ElementLayout> {
  const stageW = options?.stageWidth ?? 1080;
  const stageH = options?.stageHeight ?? 1920;
  const gapPx = options?.gapPx ?? 18;

  const working = new Map<string, ElementLayout>();
  for (const el of elements) {
    working.set(el.id, { ...(resolvedMap.get(el.id) || el.layout) });
  }

  const ordered = elements
    .map((el) => ({ el, lay: working.get(el.id)! }))
    .filter((item) => item.el.type !== 'karaoke-card');

  const isPinnedTitle = pinnedId === '__title__' && options?.titleBox;
  const pinnedEl = ordered.find((item) => item.el.id === pinnedId);

  const pushDownOrUp = (
    blockerBox: { left: number; right: number; top: number; bottom: number },
    el: SceneElement,
    lay: ElementLayout,
  ): ElementLayout | null => {
    const box = resolveBoxFromLayout(el, lay);
    const overlapX = Math.min(blockerBox.right, box.right) - Math.max(blockerBox.left, box.left);
    const overlapY = Math.min(blockerBox.bottom, box.bottom) - Math.max(blockerBox.top, box.top);
    if (overlapX <= 10 || overlapY <= -gapPx + 1) return null;

    const minSafeY = Math.round(box.halfH + 40);
    const maxSafeY = Math.round(stageH - box.halfH - 90);

    // Prefer pushing sibling downward below the blocker
    const downY = Math.round(blockerBox.bottom + gapPx + box.halfH);
    if (downY <= maxSafeY) {
      return { ...lay, y: downY, manualPosition: true };
    }

    // Fallback: push upward if downward runs off stage bottom
    const upY = Math.round(blockerBox.top - gapPx - box.halfH);
    if (upY >= minSafeY) {
      return { ...lay, y: upY, manualPosition: true };
    }

    // Last resort: clamp horizontally away in wide stages
    if (stageW > stageH) {
      const shiftRightX = Math.min(stageW - box.halfW - 40, blockerBox.right + gapPx + box.halfW);
      if (shiftRightX > blockerBox.right + 12) {
        return { ...lay, x: Math.round(shiftRightX), manualPosition: true };
      }
    }

    return { ...lay, y: Math.max(minSafeY, Math.min(maxSafeY, downY)), manualPosition: true };
  };

  const karaokeFixed = elements
    .filter((el) => el.type === 'karaoke-card')
    .map((el) => ({ el, lay: working.get(el.id)! }));

  const avoidKaraokeForItem = (item: { el: SceneElement; lay: ElementLayout }) => {
    for (const k of karaokeFixed) {
      if (!intervalsOverlap(k.el, item.el)) continue;
      const kBox = resolveBoxFromLayout(k.el, working.get(k.el.id));
      const currLay = working.get(item.el.id)!;
      const box = resolveBoxFromLayout(item.el, currLay);
      const overlapX = Math.min(kBox.right, box.right) - Math.max(kBox.left, box.left);
      const overlapY = Math.min(kBox.bottom, box.bottom) - Math.max(kBox.top, box.top);
      if (overlapX <= 12 || overlapY <= 0) continue;
      const isBottomKaraoke = kBox.top >= stageH * 0.5;
      const minSafeY = Math.round(box.halfH + 40);
      const maxSafeY = Math.round(stageH - box.halfH - 40);
      const targetY = isBottomKaraoke
        ? Math.max(minSafeY, Math.round(kBox.top - gapPx - box.halfH))
        : Math.min(maxSafeY, Math.round(kBox.bottom + gapPx + box.halfH));
      working.set(item.el.id, { ...currLay, y: targetY, manualPosition: true });
    }
  };

  if (isPinnedTitle && options?.titleBox) {
    const tb = {
      left: options.titleBox.x - options.titleBox.width / 2,
      right: options.titleBox.x + options.titleBox.width / 2,
      top: options.titleBox.y - options.titleBox.height / 2,
      bottom: options.titleBox.y + options.titleBox.height / 2,
    };
    for (const item of ordered) {
      const updated = pushDownOrUp(tb, item.el, working.get(item.el.id)!);
      if (updated) working.set(item.el.id, updated);
    }
  } else if (pinnedEl) {
    const pinnedBox = resolveBoxFromLayout(pinnedEl.el, working.get(pinnedEl.el.id));
    for (const item of ordered) {
      if (item.el.id === pinnedId) continue;
      if (!intervalsOverlap(pinnedEl.el, item.el)) continue;
      const updated = pushDownOrUp(pinnedBox, item.el, working.get(item.el.id)!);
      if (updated) working.set(item.el.id, updated);
    }
    // If the pinned element itself overlaps a fixed karaoke-card, nudge it clear of the subtitle bar
    avoidKaraokeForItem(pinnedEl);
  }

  // Cascade pass: resolve any domino overlaps among shifted cards sorted by Y
  const sortedByY = [...ordered].sort(
    (a, b) => (working.get(a.el.id)?.y ?? a.el.layout.y) - (working.get(b.el.id)?.y ?? b.el.layout.y),
  );
  for (let i = 0; i < sortedByY.length; i++) {
    const prev = sortedByY[i];
    const prevLay = working.get(prev.el.id)!;
    const prevBox = resolveBoxFromLayout(prev.el, prevLay);
    for (let j = i + 1; j < sortedByY.length; j++) {
      const next = sortedByY[j];
      if (next.el.id === pinnedId) continue;
      if (!intervalsOverlap(prev.el, next.el)) continue;
      const updated = pushDownOrUp(prevBox, next.el, working.get(next.el.id)!);
      if (updated) working.set(next.el.id, updated);
    }
  }

  // Ensure shifted non-karaoke elements stay clear of fixed karaoke-card subtitle bands
  for (const item of ordered) {
    if (item.el.id === pinnedId) continue;
    avoidKaraokeForItem(item);
  }

  return working;
}

