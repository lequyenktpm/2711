import {
  computeElementFrameState,
  computeStaggerItemState,
  easeInOutCubic,
  easeOutCubic,
  easeOutQuint,
  clamp01,
} from './animationMath';
import { getCustomComponentByVariant } from './customComponentStore';
import { VectorPrimitive } from './customComponentTypes';
import { drawPresetBackground, getBackgroundPresetMeta } from './backgroundPresets';
import {
  computeCartoonHostContextFromElements,
  computeSpeechLipSyncState,
  formatCartoonHostHeadline,
  type CartoonHostContext,
  type CartoonLipSyncFrame,
} from './cartoonHostAnimator';
import { estimateElementHalfExtents } from './layoutSolver';
import type { ExportAspectRatioId } from './mp4Config';
import {
  BackgroundFitMode,
  CANVAS_THEMES,
  CartoonAnimationParams,
  ComparisonStripProps,
  DynamicSceneSpec,
  ElementLayout,
  IllustrationPropData,
  IllustrationPropProps,
  IllustrationSceneIcon,
  KaraokeCardProps,
  LayoutCompositionId,
  LessonProject,
  SceneElement,
  SentenceCardProps,
  Shape3DProps,
  SubtitleDisplayConfig,
  ThemePalette,
  TitleOverlayLayout,
  ToneMeterProps,
  TopicPillProps,
  TranscriptCue,
  WordStackProps,
} from './types';

export const STAGE_WIDTH = 1080;
export const STAGE_HEIGHT = 1920;

export function getStageDimensionsForAspect(
  aspectRatio: ExportAspectRatioId = '9:16',
): { width: number; height: number } {
  switch (aspectRatio) {
    case '16:9':
      return { width: 1920, height: 1080 };
    case '1:1':
      return { width: 1080, height: 1080 };
    case '4:5':
      return { width: 1080, height: 1350 };
    case '9:16':
    default:
      return { width: STAGE_WIDTH, height: STAGE_HEIGHT };
  }
}

function resolveKaraokeTargetY(
  pos: 'top' | 'center' | 'bottom',
  aspectRatio: ExportAspectRatioId,
  stageH: number,
): number {
  if (pos === 'top') {
    return aspectRatio === '16:9' ? 175 : Math.round(stageH * 0.18);
  }
  if (pos === 'center') {
    return Math.round(stageH * 0.5);
  }
  return aspectRatio === '16:9' ? 948 : aspectRatio === '1:1' ? 920 : aspectRatio === '4:5' ? 1160 : 1585;
}

export function getEffectiveIntroSeconds(
  project: Pick<LessonProject, 'watermark' | 'title'>,
): number {
  const wm = project.watermark;
  if (!wm || !(Number(wm.introSeconds) > 0)) return 0;
  const hasContent = Boolean(
    wm.introTitle?.trim() ||
      wm.introSubtitle?.trim() ||
      wm.introBadge?.trim() ||
      project.title?.trim(),
  );
  return hasContent ? Math.max(0, Math.min(6, Number(wm.introSeconds) || 0)) : 0;
}

export function getEffectiveOutroSeconds(
  project: Pick<LessonProject, 'watermark'>,
): number {
  const wm = project.watermark;
  if (!wm || !(Number(wm.outroSeconds) > 0)) return 0;
  const hasContent = Boolean(wm.outroLine1?.trim() || wm.outroLine2?.trim());
  return hasContent ? Math.max(0, Math.min(10, Number(wm.outroSeconds) || 0)) : 0;
}

function enforceNonOverlappingResolvedLayouts(
  elements: SceneElement[],
  layoutMap: Map<string, ElementLayout>,
  time: number,
  aspectRatio: ExportAspectRatioId,
  subtitleConfig?: SubtitleDisplayConfig,
): Map<string, ElementLayout> {
  const stage = getStageDimensionsForAspect(aspectRatio);
  const visible = elements.filter((el) => time >= el.startTime - 0.01 && time <= el.endTime + 0.01);
  if (visible.length <= 1) return layoutMap;

  const getBounds = (el: SceneElement, l: ElementLayout) => {
    const ext = estimateElementHalfExtents({ ...el, layout: l });
    const halfW = Math.min(stage.width * 0.48, ext.halfW);
    const halfH = ext.halfH;
    return {
      left: l.x - halfW,
      right: l.x + halfW,
      top: l.y - halfH,
      bottom: l.y + halfH,
      halfW,
      halfH,
    };
  };

  const karaokeEls = visible.filter((el) => el.type === 'karaoke-card');
  const hostEl = visible.find(
    (el) => el.props.kind === 'illustration-prop' && el.props.variant === 'cartoon-host',
  );
  const pos = subtitleConfig?.position;

  let safeTop = 58;
  let safeBottom = stage.height - 64;
  for (const kEl of karaokeEls) {
    const kLay = layoutMap.get(kEl.id) || kEl.layout;
    const kb = getBounds(kEl, kLay);
    if (pos === 'top' || kLay.y < stage.height * 0.34) {
      safeTop = Math.max(safeTop, kb.bottom + 14);
    } else if (!pos || pos === 'bottom' || kLay.y > stage.height * 0.66) {
      safeBottom = Math.min(safeBottom, kb.top - 14);
    }
  }

  // Keep elements within horizontal bounds first (unless manually positioned)
  for (const el of visible) {
    if (el.layout.manualPosition) continue;
    const lay = layoutMap.get(el.id) || el.layout;
    const b = getBounds(el, lay);
    let nextX = lay.x;
    if (b.left < 16) nextX += 16 - b.left;
    if (b.right > stage.width - 16) nextX -= b.right - (stage.width - 16);
    if (nextX !== lay.x) {
      layoutMap.set(el.id, { ...lay, x: Math.round(nextX) });
    }
  }

  // Resolve vertical overlaps among non-karaoke, non-host elements that horizontally overlap
  const stackables = visible
    .filter(
      (el) =>
        !el.layout.manualPosition &&
        el.type !== 'karaoke-card' &&
        !(el.props.kind === 'illustration-prop' && el.props.variant === 'cartoon-host'),
    )
    .sort((a, b) => {
      const la = layoutMap.get(a.id) || a.layout;
      const lb = layoutMap.get(b.id) || b.layout;
      return la.y - lb.y;
    });

  const minGap = 14;
  for (let i = 0; i < stackables.length; i++) {
    const currEl = stackables[i];
    let currLay = layoutMap.get(currEl.id) || currEl.layout;
    let currB = getBounds(currEl, currLay);

    // Clamp top within safeTop
    if (currB.top < safeTop) {
      currLay = { ...currLay, y: Math.round(currLay.y + (safeTop - currB.top)) };
      layoutMap.set(currEl.id, currLay);
      currB = getBounds(currEl, currLay);
    }

    for (let j = 0; j < i; j++) {
      const prevEl = stackables[j];
      const prevLay = layoutMap.get(prevEl.id) || prevEl.layout;
      const prevB = getBounds(prevEl, prevLay);
      const xOverlap = Math.min(currB.right, prevB.right) - Math.max(currB.left, prevB.left);
      if (xOverlap > 28 && currB.top < prevB.bottom + minGap) {
        const pushDown = prevB.bottom + minGap - currB.top;
        currLay = { ...currLay, y: Math.round(currLay.y + pushDown) };
        layoutMap.set(currEl.id, currLay);
        currB = getBounds(currEl, currLay);
      }
    }

    // Check against cartoon-host (vertical stack in 9:16 & 4:5)
    if (hostEl && !hostEl.layout.manualPosition && (aspectRatio === '9:16' || aspectRatio === '4:5')) {
      const hostLay = layoutMap.get(hostEl.id) || hostEl.layout;
      const hostTop = hostLay.y - Math.round(335 * (hostLay.scale || 1));
      const hostMaxBottom = Math.min(stage.height - 40, safeBottom);
      if (currB.bottom + 14 > hostTop) {
        // Compress host slightly if needed, or gently shrink current card
        const newHostTop = currB.bottom + 16;
        const availForHost = hostMaxBottom - newHostTop;
        if (availForHost >= 320) {
          const nextHostScale = Math.max(
            0.44,
            Math.min(hostLay.scale || 0.9, Number((availForHost / (335 + 346)).toFixed(3))),
          );
          const nextHostY = Math.min(
            hostMaxBottom - Math.round(346 * nextHostScale),
            newHostTop + Math.round(335 * nextHostScale),
          );
          layoutMap.set(hostEl.id, { ...hostLay, y: nextHostY, scale: nextHostScale });
        }
      }
    }
  }

  // Final pass: keep bottom of stackables inside safeBottom by scaling down only if overflowing bottom
  for (const el of stackables) {
    let lay = layoutMap.get(el.id) || el.layout;
    let b = getBounds(el, lay);
    const maxBottomLimit =
      hostEl && (aspectRatio === '9:16' || aspectRatio === '4:5')
        ? Math.min(
            safeBottom,
            (layoutMap.get(hostEl.id) || hostEl.layout).y -
              Math.round(335 * ((layoutMap.get(hostEl.id) || hostEl.layout).scale || 1)) -
              12,
          )
        : safeBottom;
    if (b.bottom > maxBottomLimit && maxBottomLimit > safeTop + 120) {
      const currentH = Math.max(40, b.bottom - b.top);
      const availH = Math.max(64, maxBottomLimit - Math.max(safeTop, b.top));
      const ratio = Math.max(0.54, Math.min(1, availH / currentH));
      const nextScale = Number(((lay.scale || 1) * ratio).toFixed(3));
      const nextHalfH = Math.round(b.halfH * ratio);
      const nextY = Math.max(safeTop + nextHalfH, Math.min(maxBottomLimit - nextHalfH, lay.y));
      lay = { ...lay, scale: nextScale, y: Math.round(nextY) };
      layoutMap.set(el.id, lay);
    }
  }

  return layoutMap;
}

function collectSampleTimesForCartoonSlices(elements: SceneElement[]): number[] {
  const times = new Set<number>();
  for (const el of elements) {
    if (el.props.kind === 'illustration-prop' && el.props.variant === 'cartoon-host') continue;
    if (el.type === 'karaoke-card') continue;
    const mid = Number(((el.startTime + el.endTime) * 0.5).toFixed(3));
    if (Number.isFinite(mid) && mid >= 0) times.add(mid);
  }
  return Array.from(times);
}

function computeStackBottom916ForSlice(
  slice: SceneElement[],
  isTopSub: boolean,
  outMap?: Map<string, ElementLayout>,
): number {
  const hasTopStrip = slice.some(
    (el) => el.type === 'comparison-strip' && el.layout.y < 900 && !el.id.includes('-quiz-opts-'),
  );
  let stackBottom = isTopSub ? 375 : 212;

  const stripEl = slice.find(
    (el) => el.type === 'comparison-strip' && el.layout.y < 900 && !el.id.includes('-quiz-opts-'),
  );
  if (stripEl) {
    const stripY = stripEl.layout.manualPosition
      ? stripEl.layout.y
      : isTopSub
        ? Math.max(stripEl.layout.y, 380)
        : Math.max(stripEl.layout.y, 252);
    const stripScale = stripEl.layout.manualPosition
      ? stripEl.layout.scale || 1
      : Math.min(stripEl.layout.scale || 1, 0.9);
    const stripExt = estimateElementHalfExtents({
      ...stripEl,
      layout: { ...stripEl.layout, scale: stripScale },
    });
    if (outMap) outMap.set(stripEl.id, { ...stripEl.layout, y: stripY, scale: stripScale });
    stackBottom = Math.max(stackBottom, stripY + stripExt.halfH);
  }

  const pillEl = slice.find((el) => el.type === 'topic-pill' && el.layout.y < 520);
  if (pillEl) {
    const pillScale = pillEl.layout.manualPosition
      ? pillEl.layout.scale || 1
      : Math.min(pillEl.layout.scale || 1, 0.92);
    const pillExt = estimateElementHalfExtents({
      ...pillEl,
      layout: { ...pillEl.layout, scale: pillScale },
    });
    const preferredPillY = isTopSub
      ? Math.max(pillEl.layout.y, 455)
      : hasTopStrip
        ? Math.max(pillEl.layout.y, 350)
        : Math.max(pillEl.layout.y, 258);
    const pillY = pillEl.layout.manualPosition
      ? pillEl.layout.y
      : Math.max(preferredPillY, stackBottom + 18 + pillExt.halfH);
    if (outMap) outMap.set(pillEl.id, { ...pillEl.layout, y: pillY, scale: pillScale });
    stackBottom = Math.max(stackBottom, pillY + pillExt.halfH);
  }

  for (const cardEl of slice.filter((el) => el.type === 'sentence-card')) {
    if (cardEl.layout.manualPosition) {
      const mExt = estimateElementHalfExtents(cardEl);
      if (outMap) outMap.set(cardEl.id, cardEl.layout);
      stackBottom = Math.max(stackBottom, cardEl.layout.y + mExt.halfH);
      continue;
    }
    const cardScale = Math.min(cardEl.layout.scale || 1, 0.9);
    const cardWidth = Math.min(860, cardEl.layout.width || 860);
    const cardExt = estimateElementHalfExtents({
      ...cardEl,
      layout: { ...cardEl.layout, width: cardWidth, scale: cardScale },
    });
    const cardY = Math.max(
      isTopSub ? 580 : hasTopStrip ? 495 : 425,
      stackBottom + 22 + cardExt.halfH,
    );
    if (outMap) {
      outMap.set(cardEl.id, { ...cardEl.layout, y: cardY, width: cardWidth, scale: cardScale });
    }
    stackBottom = Math.max(stackBottom, cardY + cardExt.halfH);
  }

  for (const lowerEl of slice.filter(
    (el) =>
      el.type === 'tone-meter' ||
      (el.type === 'comparison-strip' && (el.id.includes('-quiz-opts-') || el.layout.y >= 900)) ||
      el.id.includes('-q-countdown-meter-') ||
      el.id.includes('-tr-q-countdown-meter-'),
  )) {
    if (lowerEl.layout.manualPosition) {
      const mExt = estimateElementHalfExtents(lowerEl);
      if (outMap) outMap.set(lowerEl.id, lowerEl.layout);
      stackBottom = Math.max(stackBottom, lowerEl.layout.y + mExt.halfH);
      continue;
    }
    const isMeter = lowerEl.type === 'tone-meter';
    const meterScale = isMeter ? Math.min(lowerEl.layout.scale || 0.78, 0.78) : Math.min(lowerEl.layout.scale || 0.76, 0.76);
    const meterWidth = isMeter ? 700 : Math.min(860, lowerEl.layout.width || 860);
    const meterExt = estimateElementHalfExtents({
      ...lowerEl,
      layout: { ...lowerEl.layout, width: meterWidth, scale: meterScale },
    });
    const meterY = Math.max(
      isTopSub ? 780 : 625,
      stackBottom + 28 + meterExt.halfH,
    );
    if (outMap) {
      outMap.set(lowerEl.id, {
        ...lowerEl.layout,
        x: 540,
        y: meterY,
        width: meterWidth,
        scale: meterScale,
      });
    }
    stackBottom = Math.max(stackBottom, meterY + meterExt.halfH);
  }

  return stackBottom;
}

function computeStackBottom45ForSlice(
  slice: SceneElement[],
  hasTopSubCollision: boolean,
  outMap?: Map<string, ElementLayout>,
): number {
  const isQuizOpt = (el: SceneElement): boolean =>
    el.type === 'comparison-strip' && (el.id.includes('-quiz-opts-') || el.layout.y >= 900);
  const isCountdown = (el: SceneElement): boolean =>
    el.id.includes('-q-countdown-meter-') || el.id.includes('-tr-q-countdown-meter-');
  const isPill = (el: SceneElement): boolean =>
    (el.type === 'topic-pill' && el.layout.y < 520) ||
    (el.type === 'shape-3d' &&
      el.props.kind === 'shape-3d' &&
      el.props.shapeType === 'pill_3d' &&
      el.layout.y < 420);

  const hasTopStrip = slice.some((el) => el.type === 'comparison-strip' && !isQuizOpt(el));
  let stackBottom = hasTopSubCollision ? 320 : 178;

  const stripEl = slice.find((el) => el.type === 'comparison-strip' && !isQuizOpt(el));
  if (stripEl) {
    const sy = stripEl.layout.manualPosition
      ? stripEl.layout.y
      : hasTopSubCollision
        ? 365
        : 218;
    if (outMap) {
      outMap.set(
        stripEl.id,
        stripEl.layout.manualPosition
          ? stripEl.layout
          : { ...stripEl.layout, x: 540, y: sy, width: 880, scale: 0.84 },
      );
    }
    stackBottom = Math.max(stackBottom, sy + 52);
  }

  const pillEl = slice.find(isPill);
  if (pillEl) {
    if (pillEl.layout.manualPosition) {
      if (outMap) outMap.set(pillEl.id, pillEl.layout);
      stackBottom = Math.max(stackBottom, pillEl.layout.y + estimateElementHalfExtents(pillEl).halfH);
    } else {
      const pillExt = estimateElementHalfExtents({
        ...pillEl,
        layout: { ...pillEl.layout, width: 620, scale: 0.84 },
      });
      const py = Math.max(
        hasTopSubCollision ? (hasTopStrip ? 445 : 365) : hasTopStrip ? 298 : 226,
        stackBottom + 16 + pillExt.halfH,
      );
      if (outMap) outMap.set(pillEl.id, { ...pillEl.layout, x: 540, y: py, width: 620, scale: 0.84 });
      stackBottom = Math.max(stackBottom, py + pillExt.halfH);
    }
  }

  for (const cardEl of slice.filter((el) => el.type === 'sentence-card')) {
    if (cardEl.layout.manualPosition) {
      if (outMap) outMap.set(cardEl.id, cardEl.layout);
      stackBottom = Math.max(stackBottom, cardEl.layout.y + estimateElementHalfExtents(cardEl).halfH);
      continue;
    }
    const cardExt = estimateElementHalfExtents({
      ...cardEl,
      layout: { ...cardEl.layout, width: 820, scale: 0.8 },
    });
    const cy = Math.max(hasTopSubCollision ? 565 : hasTopStrip ? 425 : 365, stackBottom + 18 + cardExt.halfH);
    if (outMap) outMap.set(cardEl.id, { ...cardEl.layout, x: 540, y: cy, width: 820, scale: 0.8 });
    stackBottom = Math.max(stackBottom, cy + cardExt.halfH);
  }

  for (const lowerEl of slice.filter((el) => el.type === 'tone-meter' || isQuizOpt(el) || isCountdown(el))) {
    if (lowerEl.layout.manualPosition) {
      if (outMap) outMap.set(lowerEl.id, lowerEl.layout);
      stackBottom = Math.max(stackBottom, lowerEl.layout.y + estimateElementHalfExtents(lowerEl).halfH);
      continue;
    }
    const lowerExt = estimateElementHalfExtents({
      ...lowerEl,
      layout: { ...lowerEl.layout, width: 780, scale: 0.72 },
    });
    const ly = Math.max(hasTopSubCollision ? 710 : 555, stackBottom + 20 + lowerExt.halfH);
    if (outMap) outMap.set(lowerEl.id, { ...lowerEl.layout, x: 540, y: ly, width: 780, scale: 0.72 });
    stackBottom = Math.max(stackBottom, ly + lowerExt.halfH);
  }

  return stackBottom;
}

function computeStableProjectCartoonStackBottom(
  elements: SceneElement[],
  aspectRatio: '9:16' | '4:5',
  isTopSub: boolean,
): number {
  const sampleTimes = collectSampleTimesForCartoonSlices(elements);
  let maxBottom = aspectRatio === '9:16' ? (isTopSub ? 375 : 212) : isTopSub ? 320 : 178;
  for (const st of sampleTimes) {
    const slice = elements.filter((el) => st >= el.startTime - 0.01 && st <= el.endTime + 0.01);
    const sb =
      aspectRatio === '9:16'
        ? computeStackBottom916ForSlice(slice, isTopSub)
        : computeStackBottom45ForSlice(slice, isTopSub);
    if (sb > maxBottom) maxBottom = sb;
  }
  return maxBottom;
}

export function resolveElementLayoutForAspect(
  elements: SceneElement[],
  time: number,
  aspectRatio: ExportAspectRatioId = '9:16',
  subtitleConfig?: SubtitleDisplayConfig,
  compositionId?: LayoutCompositionId,
): Map<string, ElementLayout> {
  const out = new Map<string, ElementLayout>();
  const explicitPos = subtitleConfig?.position ?? (compositionId === 'plain' ? 'center' : undefined);
  const stage = getStageDimensionsForAspect(aspectRatio);

  const isCartoonHostProject =
    compositionId === 'cartoon-host' ||
    elements.some(
      (el) => el.props.kind === 'illustration-prop' && el.props.variant === 'cartoon-host',
    );

  if (aspectRatio === '9:16') {
    const visible916 = isCartoonHostProject
      ? elements.filter((el) => time >= el.startTime - 0.01 && time <= el.endTime + 0.01)
      : [];
    const hasTopStrip916 = visible916.some(
      (el) => el.type === 'comparison-strip' && el.layout.y < 900 && !el.id.includes('-quiz-opts-'),
    );
    const isTopSub916 = explicitPos === 'top';
    const cartoonStackBottom916 = isCartoonHostProject
      ? computeStackBottom916ForSlice(visible916, isTopSub916, out)
      : isTopSub916
        ? 375
        : 212;
    const stableHostStackBottom916 = isCartoonHostProject
      ? computeStableProjectCartoonStackBottom(elements, '9:16', isTopSub916)
      : cartoonStackBottom916;

    for (const el of elements) {
      if (el.layout.manualPosition) {
        out.set(el.id, el.layout);
        continue;
      }
      if (el.type === 'karaoke-card' && explicitPos) {
        out.set(el.id, {
          ...el.layout,
          x: stage.width / 2,
          y: resolveKaraokeTargetY(explicitPos, aspectRatio, stage.height),
          width: compositionId === 'plain' ? 960 : el.layout.width,
        });
        continue;
      }
      if (out.has(el.id)) continue;

      if (isCartoonHostProject) {
        const isTopSub = isTopSub916;
        if (el.type === 'comparison-strip' && el.layout.y < 900 && !el.id.includes('-quiz-opts-')) {
          out.set(el.id, {
            ...el.layout,
            y: isTopSub ? Math.max(el.layout.y, 380) : Math.max(el.layout.y, 252),
            scale: Math.min(el.layout.scale || 1, 0.9),
          });
          continue;
        }
        if (el.type === 'topic-pill' && el.layout.y < 520) {
          out.set(el.id, {
            ...el.layout,
            y: isTopSub
              ? Math.max(el.layout.y, 455)
              : hasTopStrip916
                ? Math.max(el.layout.y, 350)
                : Math.max(el.layout.y, 258),
            scale: Math.min(el.layout.scale || 1, 0.92),
          });
          continue;
        }
        if (el.type === 'sentence-card') {
          const cardScale = Math.min(el.layout.scale || 1, 0.9);
          const cardWidth = Math.min(860, el.layout.width || 860);
          const cardExt = estimateElementHalfExtents({
            ...el,
            layout: { ...el.layout, width: cardWidth, scale: cardScale },
          });
          out.set(el.id, {
            ...el.layout,
            y: Math.max(isTopSub ? 580 : 425, cartoonStackBottom916 + 22 + cardExt.halfH),
            width: cardWidth,
            scale: cardScale,
          });
          continue;
        }
        if (el.type === 'tone-meter') {
          const meterScale = Math.min(el.layout.scale || 0.78, 0.78);
          const meterExt = estimateElementHalfExtents({
            ...el,
            layout: { ...el.layout, width: 700, scale: meterScale },
          });
          out.set(el.id, {
            ...el.layout,
            x: 540,
            y: Math.max(isTopSub ? 780 : 625, cartoonStackBottom916 + 28 + meterExt.halfH),
            width: 700,
            scale: meterScale,
          });
          continue;
        }
        if (el.props.kind === 'illustration-prop' && el.props.variant === 'cartoon-host') {
          // Project-wide invariant anchor keeps Gimmy rock-steady across every card & transition gap
          let hostScale = Math.min(el.layout.scale || 0.92, 0.92);
          const maxHostBottom = isTopSub ? 1810 : 1482;
          const halfHBase = 335;
          let hostY = Math.max(
            isTopSub ? 1155 : 1105,
            stableHostStackBottom916 + 24 + Math.round(halfHBase * hostScale),
          );
          if (hostY + Math.round(346 * hostScale) > maxHostBottom) {
            const avail = Math.max(440, maxHostBottom - (stableHostStackBottom916 + 24));
            hostScale = Math.max(0.68, Math.min(hostScale, Number((avail / (halfHBase + 346)).toFixed(3))));
            hostY = Math.max(
              isTopSub ? 1155 : 1105,
              stableHostStackBottom916 + 22 + Math.round(halfHBase * hostScale),
            );
            hostY = Math.min(hostY, maxHostBottom - Math.round(346 * hostScale));
          }
          out.set(el.id, {
            ...el.layout,
            x: 540,
            y: hostY,
            width: 820,
            scale: hostScale,
          });
          continue;
        }
      }
      out.set(el.id, el.layout);
    }
    return enforceNonOverlappingResolvedLayouts(elements, out, time, aspectRatio, subtitleConfig);
  }

  const visible = elements.filter((el) => time >= el.startTime - 0.01 && time <= el.endTime + 0.01);
  const topStrip = visible.filter(
    (el) => el.type === 'comparison-strip' && el.layout.y < 900 && !el.id.includes('-quiz-opts-'),
  );
  const hasTopStrip = topStrip.length > 0;

  const isTopPill = (el: SceneElement): boolean =>
    (el.type === 'topic-pill' && el.layout.y < 520) ||
    (el.type === 'shape-3d' &&
      el.props.kind === 'shape-3d' &&
      el.props.shapeType === 'pill_3d' &&
      el.layout.y < 420);

  const isQuizOptStrip = (el: SceneElement): boolean =>
    el.type === 'comparison-strip' && (el.id.includes('-quiz-opts-') || el.layout.y >= 900);

  const isCountdownMeter = (el: SceneElement): boolean =>
    el.id.includes('-q-countdown-meter-') || el.id.includes('-tr-q-countdown-meter-');

  const isCartoonHostEl = (el: SceneElement): boolean =>
    el.props.kind === 'illustration-prop' && el.props.variant === 'cartoon-host';

  const isRightFocal = (el: SceneElement): boolean =>
    el.type === 'sentence-card' || el.type === 'tone-meter';

  const isLeftVisual = (el: SceneElement): boolean =>
    (el.type === 'illustration-prop' && !isCountdownMeter(el)) || el.type === 'word-stack';

  const midVisuals = visible.filter(isLeftVisual);
  const midCards = visible.filter(isRightFocal);
  const mid3dBlocks = visible.filter((el) => el.type === 'shape-3d' && !isTopPill(el));
  const midQuizOpts = visible.filter(isQuizOptStrip);
  const midMeters = visible.filter(isCountdownMeter);
  const hasTopSubCollision = explicitPos === 'top';

  if (isCartoonHostProject && (aspectRatio === '1:1' || aspectRatio === '4:5')) {
    const projectHasLowerRight = elements.some(
      (v) => v.type === 'tone-meter' || isQuizOptStrip(v) || isCountdownMeter(v),
    );
    const projectHasCompanion = elements.some(
      (v) =>
        isRightFocal(v) ||
        isQuizOptStrip(v) ||
        isCountdownMeter(v) ||
        (v.type === 'comparison-strip' && v.layout.y < 900 && !v.id.includes('-quiz-opts-')) ||
        isTopPill(v),
    );

    if (aspectRatio === '4:5') {
      // 1080 x 1350: Clean stacked responsive vertical layout (Header -> Strip -> Pill -> Card -> Meter -> Gimmy -> Karaoke)
      const stackBottom45 = computeStackBottom45ForSlice(visible, hasTopSubCollision, out);
      const stableHostStackBottom45 = computeStableProjectCartoonStackBottom(elements, '4:5', hasTopSubCollision);

      for (const el of elements) {
        if (el.layout.manualPosition) {
          out.set(el.id, el.layout);
          continue;
        }
        if (out.has(el.id)) continue;
        if (el.type === 'karaoke-card') {
          out.set(el.id, {
            ...el.layout,
            x: 540,
            y: resolveKaraokeTargetY(explicitPos || 'bottom', '4:5', stage.height),
            width: 920,
            scale: 0.92,
          });
          continue;
        }
        if (el.type === 'comparison-strip' && !isQuizOptStrip(el)) {
          out.set(el.id, {
            ...el.layout,
            x: 540,
            y: hasTopSubCollision ? 365 : 218,
            width: 880,
            scale: 0.84,
          });
          continue;
        }
        if (isTopPill(el)) {
          out.set(el.id, {
            ...el.layout,
            x: 540,
            y: hasTopSubCollision ? (hasTopStrip ? 445 : 365) : hasTopStrip ? 298 : 226,
            width: 620,
            scale: 0.84,
          });
          continue;
        }
        if (el.type === 'sentence-card') {
          out.set(el.id, {
            ...el.layout,
            x: 540,
            y: hasTopSubCollision ? 565 : hasTopStrip ? 425 : 365,
            width: 820,
            scale: 0.8,
          });
          continue;
        }
        if (el.type === 'tone-meter' || isQuizOptStrip(el) || isCountdownMeter(el)) {
          out.set(el.id, {
            ...el.layout,
            x: 540,
            y: Math.max(hasTopSubCollision ? 710 : 555, stackBottom45 + 20 + 58),
            width: 780,
            scale: 0.72,
          });
          continue;
        }
        if (isCartoonHostEl(el)) {
          // Project-wide invariant anchor keeps Gimmy rock-steady across every card & transition gap
          let hScale = projectHasLowerRight ? 0.66 : 0.72;
          const maxB = hasTopSubCollision ? 1270 : 1065;
          const halfHBase = 335;
          const footBase = 346;
          let hy = Math.max(
            hasTopSubCollision ? 920 : projectHasLowerRight ? 835 : 795,
            stableHostStackBottom45 + 18 + Math.round(halfHBase * hScale),
          );
          if (hy + Math.round(footBase * hScale) > maxB) {
            const avail = Math.max(300, maxB - (stableHostStackBottom45 + 16));
            hScale = Math.max(
              0.44,
              Math.min(hScale, Number((avail / (halfHBase + footBase)).toFixed(3))),
            );
            hy = Math.max(
              stableHostStackBottom45 + 16 + Math.round(halfHBase * hScale),
              Math.min(
                maxB - Math.round(footBase * hScale),
                stableHostStackBottom45 + 18 + Math.round(halfHBase * hScale),
              ),
            );
          }
          out.set(el.id, {
            ...el.layout,
            x: 540,
            y: hy,
            width: 780,
            scale: hScale,
          });
          continue;
        }
        out.set(el.id, {
          ...el.layout,
          x: 540,
          y: Math.min(620, el.layout.y),
          width: Math.min(820, el.layout.width),
          scale: 0.76,
        });
      }
      return enforceNonOverlappingResolvedLayouts(elements, out, time, aspectRatio, subtitleConfig);
    }

    // 1:1 Square (1080 x 1080): Two-column split (Gimmy left pointing right, cards right)
    const hasLowerRight = midQuizOpts.length > 0 || midMeters.length > 0 || visible.some((v) => v.type === 'tone-meter');
    for (const el of elements) {
      if (el.layout.manualPosition) {
        out.set(el.id, el.layout);
        continue;
      }
      if (el.type === 'karaoke-card') {
        out.set(el.id, {
          ...el.layout,
          x: 540,
          y: resolveKaraokeTargetY(explicitPos || 'bottom', '1:1', stage.height),
          width: 940,
          scale: 0.9,
        });
        continue;
      }
      if (el.type === 'comparison-strip' && !isQuizOptStrip(el)) {
        out.set(el.id, {
          ...el.layout,
          x: 765,
          y: hasTopSubCollision ? 310 : 112,
          width: 560,
          scale: 0.7,
        });
        continue;
      }
      if (isTopPill(el)) {
        out.set(el.id, {
          ...el.layout,
          x: 765,
          y: hasTopSubCollision ? (hasTopStrip ? 385 : 310) : hasTopStrip ? 190 : 128,
          width: 480,
          scale: 0.76,
        });
        continue;
      }
      if (el.type === 'sentence-card') {
        out.set(el.id, {
          ...el.layout,
          x: 765,
          y: hasLowerRight ? 360 : 455,
          width: 530,
          scale: 0.78,
        });
        continue;
      }
      if (el.type === 'tone-meter' || isQuizOptStrip(el) || isCountdownMeter(el)) {
        out.set(el.id, {
          ...el.layout,
          x: 765,
          y: 625,
          width: 520,
          scale: 0.72,
        });
        continue;
      }
      if (isCartoonHostEl(el)) {
        out.set(el.id, {
          ...el.layout,
          x: projectHasCompanion ? 280 : 540,
          y: hasTopSubCollision ? 595 : 550,
          width: 680,
          scale: projectHasCompanion ? 0.65 : 0.74,
        });
        continue;
      }
      out.set(el.id, {
        ...el.layout,
        x: 765,
        y: 460,
        width: 520,
        scale: 0.72,
      });
    }
    return enforceNonOverlappingResolvedLayouts(elements, out, time, aspectRatio, subtitleConfig);
  }

  if (aspectRatio === '1:1' || aspectRatio === '4:5') {
    const yScale = stage.height / STAGE_HEIGHT;
    const xOffset = (stage.width - STAGE_WIDTH) / 2;
    for (const el of elements) {
      if (el.layout.manualPosition) {
        out.set(el.id, el.layout);
        continue;
      }
      if (el.type === 'karaoke-card' && explicitPos) {
        out.set(el.id, {
          ...el.layout,
          x: stage.width / 2,
          y: resolveKaraokeTargetY(explicitPos, aspectRatio, stage.height),
          width: Math.min(stage.width - 64, Math.max(880, el.layout.width)),
          scale: 1,
        });
        continue;
      }
      const scaledHeight = el.layout.height ? Math.round(el.layout.height * Math.max(0.75, yScale)) : undefined;
      out.set(el.id, {
        ...el.layout,
        x: Math.round(el.layout.x + xOffset),
        y: Math.round(70 + ((el.layout.y - 120) / Math.max(1, STAGE_HEIGHT - 240)) * (stage.height - 150)),
        width: Math.min(stage.width - 48, el.layout.width),
        height: scaledHeight,
        scale: Number((el.layout.scale * Math.max(0.8, Math.sqrt(yScale))).toFixed(3)),
      });
    }
    return enforceNonOverlappingResolvedLayouts(elements, out, time, aspectRatio, subtitleConfig);
  }

  // 16:9 Widescreen (1920 x 1080) dedicated responsive choreography for Cartoon Host (@Gimmys)
  if (isCartoonHostProject) {
    const hasQuiz = midQuizOpts.length > 0;
    const hasLowerRight =
      hasQuiz || midMeters.length > 0 || visible.some((v) => v.type === 'tone-meter');
    const projectHasRightColumn = elements.some(
      (v) =>
        (v.type === 'comparison-strip' && v.layout.y < 900 && !v.id.includes('-quiz-opts-')) ||
        isTopPill(v) ||
        isRightFocal(v) ||
        isQuizOptStrip(v) ||
        isCountdownMeter(v) ||
        (isLeftVisual(v) && !isCartoonHostEl(v)),
    );

    for (const el of elements) {
      if (el.layout.manualPosition) {
        out.set(el.id, el.layout);
        continue;
      }
      if (el.type === 'karaoke-card') {
        const targetY = explicitPos
          ? resolveKaraokeTargetY(explicitPos, '16:9', stage.height)
          : 948;
        out.set(el.id, {
          ...el.layout,
          x: 960,
          y: targetY,
          width: Math.min(1680, Math.max(1380, Math.round(el.layout.width * 1.65))),
          scale: explicitPos === 'center' ? 1 : 0.94,
        });
        continue;
      }
      if (isCartoonHostEl(el)) {
        out.set(el.id, {
          ...el.layout,
          x: projectHasRightColumn ? 455 : 960,
          y: hasTopSubCollision ? 595 : 562,
          width: 780,
          scale: 0.78,
        });
        continue;
      }
      if (el.type === 'comparison-strip' && !isQuizOptStrip(el)) {
        out.set(el.id, {
          ...el.layout,
          x: 1365,
          y: hasTopSubCollision ? 315 : 108,
          width: 920,
          scale: 0.88,
        });
        continue;
      }
      if (isTopPill(el)) {
        out.set(el.id, {
          ...el.layout,
          x: 1365,
          y: hasTopSubCollision ? (hasTopStrip ? 395 : 320) : hasTopStrip ? 202 : 132,
          width: 740,
          scale: 0.88,
        });
        continue;
      }
      if (el.type === 'sentence-card') {
        out.set(el.id, {
          ...el.layout,
          x: 1365,
          y: hasLowerRight ? (hasTopSubCollision ? 515 : 378) : hasTopSubCollision ? 560 : 485,
          width: 880,
          scale: hasLowerRight ? 0.88 : 0.98,
        });
        continue;
      }
      if (isQuizOptStrip(el)) {
        out.set(el.id, {
          ...el.layout,
          x: 1365,
          y: midMeters.length > 0 ? 635 : 675,
          width: 840,
          scale: 0.82,
        });
        continue;
      }
      if (isCountdownMeter(el)) {
        out.set(el.id, {
          ...el.layout,
          x: 1365,
          y: hasQuiz ? 810 : 695,
          width: 780,
          scale: hasQuiz ? 0.62 : 0.72,
        });
        continue;
      }
      if (el.type === 'tone-meter') {
        out.set(el.id, {
          ...el.layout,
          x: 1365,
          y: 675,
          width: 780,
          scale: 0.86,
        });
        continue;
      }
      // Companion illustration/word-stack in right column
      out.set(el.id, {
        ...el.layout,
        x: 1365,
        y: 515,
        width: 840,
        scale: 0.88,
      });
    }
    return enforceNonOverlappingResolvedLayouts(elements, out, time, aspectRatio, subtitleConfig);
  }

  // 16:9 Widescreen (1920 x 1080) adaptive layout for standard compositions
  const hasSplitColumns =
    (midVisuals.length > 0 && (midCards.length > 0 || midQuizOpts.length > 0 || midMeters.length > 0)) ||
    mid3dBlocks.length >= 2;

  for (const el of elements) {
    if (el.layout.manualPosition) {
      out.set(el.id, el.layout);
      continue;
    }
    if (el.type === 'comparison-strip' && !isQuizOptStrip(el)) {
      out.set(el.id, {
        ...el.layout,
        x: 960,
        y: hasTopSubCollision ? 58 : 72,
        width: 1460,
        scale: hasTopSubCollision ? 0.78 : 0.92,
      });
      continue;
    }

    if (isTopPill(el)) {
      out.set(el.id, {
        ...el.layout,
        x: 960,
        y: hasTopSubCollision ? 295 : hasTopStrip ? 162 : 96,
        width: Math.min(1180, Math.max(660, el.layout.width)),
        height: el.layout.height ? Math.min(96, el.layout.height) : undefined,
        scale: 0.94,
      });
      continue;
    }

    if (el.type === 'karaoke-card') {
      const targetY = explicitPos
        ? resolveKaraokeTargetY(explicitPos, '16:9', stage.height)
        : 948;
      out.set(el.id, {
        ...el.layout,
        x: 960,
        y: targetY,
        width: Math.min(1680, Math.max(1380, Math.round(el.layout.width * 1.65))),
        scale: explicitPos === 'center' ? 1 : 0.94,
      });
      continue;
    }

    if (isQuizOptStrip(el)) {
      const hasMeter = midMeters.length > 0;
      const baseQuizY = hasSplitColumns
        ? hasMeter
          ? 575
          : 630
        : hasMeter
          ? 590
          : 645;
      out.set(el.id, {
        ...el.layout,
        x: hasSplitColumns ? 1405 : 960,
        y: hasTopSubCollision ? Math.max(baseQuizY, 640) : baseQuizY,
        width: hasSplitColumns ? 820 : 1280,
        scale: hasSplitColumns ? 0.80 : 0.86,
      });
      continue;
    }

    if (isCountdownMeter(el)) {
      out.set(el.id, {
        ...el.layout,
        x: hasSplitColumns ? 1405 : 960,
        y: midQuizOpts.length > 0 ? 835 : 715,
        width: 780,
        scale: midQuizOpts.length > 0 ? 0.62 : 0.68,
      });
      continue;
    }

    if (isLeftVisual(el)) {
      if (hasSplitColumns) {
        const vIdx = Math.max(0, midVisuals.findIndex((v) => v.id === el.id));
        const baseLeftY = midVisuals.length > 1 ? 375 + vIdx * 260 : 515;
        out.set(el.id, {
          ...el.layout,
          x: 515,
          y: hasTopSubCollision ? Math.max(baseLeftY, 555) : baseLeftY,
          width: 820,
          scale: Math.min(0.95, el.layout.scale || 1),
        });
      } else {
        out.set(el.id, {
          ...el.layout,
          x: 960,
          y: hasTopSubCollision ? 560 : 515,
          width: Math.min(1260, Math.round(el.layout.width * 1.2)),
          scale: Math.min(1.02, el.layout.scale || 1),
        });
      }
      continue;
    }

    if (isRightFocal(el)) {
      if (hasSplitColumns) {
        const hasQuiz = midQuizOpts.length > 0;
        const hasRightLower = hasQuiz || midMeters.length > 0;
        const isToneWithSentence =
          el.type === 'tone-meter' && visible.some((v) => v.type === 'sentence-card');
        let yPos = hasTopSubCollision ? 555 : 515;
        if (el.type === 'sentence-card' && hasQuiz) {
          yPos = hasTopSubCollision ? 345 : 295;
        } else if (el.type === 'sentence-card' && hasRightLower) {
          yPos = hasTopSubCollision ? 430 : 395;
        } else if (el.type === 'sentence-card' && visible.some((v) => v.type === 'tone-meter')) {
          yPos = hasTopSubCollision ? 445 : 410;
        } else if (isToneWithSentence) {
          yPos = 665;
        }
        out.set(el.id, {
          ...el.layout,
          x: 1405,
          y: yPos,
          width: 820,
          scale: hasQuiz ? 0.84 : hasRightLower ? 0.92 : 0.97,
        });
      } else {
        const cIdx = Math.max(0, midCards.findIndex((c) => c.id === el.id));
        const hasCenterLower = midMeters.length > 0 || midQuizOpts.length > 0;
        const baseY =
          midCards.length > 1
            ? 410 + cIdx * 240
            : hasCenterLower && el.type === 'sentence-card'
              ? 355
              : 515;
        out.set(el.id, {
          ...el.layout,
          x: 960,
          y: hasTopSubCollision ? Math.max(baseY, 445) : baseY,
          width: Math.min(1260, Math.round(el.layout.width * 1.25)),
          scale: hasCenterLower ? 0.92 : 1,
        });
      }
      continue;
    }

    if (el.type === 'shape-3d') {
      const sIdx = Math.max(0, mid3dBlocks.findIndex((b) => b.id === el.id));
      if (mid3dBlocks.length >= 2) {
        const isLeft = sIdx % 2 === 0;
        out.set(el.id, {
          ...el.layout,
          x: isLeft ? 515 : 1405,
          y: 515,
          width: 800,
          height: el.layout.height ? Math.min(340, el.layout.height) : undefined,
          scale: 0.96,
        });
      } else {
        out.set(el.id, {
          ...el.layout,
          x: 960,
          y: 515,
          width: Math.min(1220, Math.round(el.layout.width * 1.2)),
          scale: 1,
        });
      }
      continue;
    }

    // Fallback generic mapping
    out.set(el.id, {
      ...el.layout,
      x: Math.round((el.layout.x / STAGE_WIDTH) * stage.width),
      y: Math.round((el.layout.y / STAGE_HEIGHT) * stage.height),
      width: Math.min(stage.width - 64, el.layout.width),
    });
  }

  return enforceNonOverlappingResolvedLayouts(elements, out, time, aspectRatio, subtitleConfig);
}

const FONT_DISPLAY = '"Outfit", "Plus Jakarta Sans", "Noto Sans JP", "Noto Sans SC", "Noto Sans KR", "Hiragino Sans", "Yu Gothic", "Meiryo", system-ui, sans-serif';
const FONT_SANS = '"Plus Jakarta Sans", "Noto Sans JP", "Noto Sans SC", "Noto Sans KR", "Hiragino Sans", "Yu Gothic", "Meiryo", system-ui, sans-serif';

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function fillCardWithShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  shadowAlpha = 0.08,
) {
  ctx.save();
  ctx.shadowColor = `rgba(15, 23, 42, ${shadowAlpha})`;
  ctx.shadowBlur = 32;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = fill;
  drawRoundedRectPath(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.trim();
  if (clean.startsWith('rgb') || clean.startsWith('hsl')) return clean;
  const raw = clean.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (full.length !== 6) return `rgba(37, 99, 235, ${alpha})`;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return `rgba(37, 99, 235, ${alpha})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha)})`;
}

function drawCharacterAvatar(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number;
    y: number;
    shirtColor: string;
    hairColor: string;
    skinColor?: string;
    hairStyle?: 'short' | 'bob' | 'side';
    expression?: 'smile' | 'happy' | 'curious';
    nameTag?: string;
    tagColor?: string;
    scale?: number;
    lipSync?: CartoonLipSyncFrame;
  },
) {
  const {
    x,
    y,
    shirtColor,
    hairColor,
    skinColor = '#FDE2C8',
    hairStyle = 'short',
    expression = 'smile',
    nameTag,
    tagColor = shirtColor,
    scale = 1,
    lipSync,
  } = opts;

  ctx.save();
  ctx.translate(x, y + (lipSync ? lipSync.headBobY * 0.45 : 0));
  if (scale !== 1) ctx.scale(scale, scale);

  // Back hair for bob/long styles
  if (hairStyle === 'bob') {
    ctx.fillStyle = hairColor;
    drawRoundedRectPath(ctx, -46, -42, 92, 86, 36);
    ctx.fill();
  }

  // Shoulders & shirt
  ctx.fillStyle = shirtColor;
  drawRoundedRectPath(ctx, -48, 34, 96, 62, 30);
  ctx.fill();

  // Shirt collar
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(-18, 34);
  ctx.lineTo(0, 50);
  ctx.lineTo(18, 34);
  ctx.closePath();
  ctx.fill();

  // Neck + subtle chin shadow
  ctx.fillStyle = skinColor;
  drawRoundedRectPath(ctx, -13, 18, 26, 24, 10);
  ctx.fill();
  ctx.fillStyle = 'rgba(180, 83, 9, 0.14)';
  ctx.beginPath();
  ctx.ellipse(0, 26, 13, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = skinColor;
  ctx.beginPath();
  ctx.arc(0, -14, 41, 0, Math.PI * 2);
  ctx.fill();

  // Soft cheek blush
  ctx.fillStyle = 'rgba(244, 114, 182, 0.25)';
  ctx.beginPath();
  ctx.ellipse(-22, -4, 8, 5, 0, 0, Math.PI * 2);
  ctx.ellipse(22, -4, 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Top hair & fringe
  ctx.fillStyle = hairColor;
  ctx.beginPath();
  ctx.arc(0, -24, 42, Math.PI * 0.96, Math.PI * 2.04);
  ctx.fill();
  if (hairStyle === 'side') {
    ctx.beginPath();
    ctx.moveTo(-40, -28);
    ctx.quadraticCurveTo(-8, -12, 34, -36);
    ctx.quadraticCurveTo(10, -56, -40, -28);
    ctx.fill();
  } else if (hairStyle === 'bob') {
    ctx.beginPath();
    ctx.ellipse(-18, -36, 22, 13, -0.3, 0, Math.PI * 2);
    ctx.ellipse(18, -36, 22, 13, 0.3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.ellipse(0, -44, 34, 15, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eyebrows
  const browRaise = lipSync ? lipSync.browLift * 2.5 : 0;
  ctx.strokeStyle = hairColor;
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-21, -24 - browRaise);
  ctx.quadraticCurveTo(-14, -27 - browRaise, -7, -24 - browRaise);
  ctx.moveTo(7, -24 - browRaise);
  ctx.quadraticCurveTo(14, -27 - browRaise, 21, -24 - browRaise);
  ctx.stroke();

  // Eyes + white specular glints (smooth blink support)
  const eyeScaleY = lipSync ? Math.max(0.1, 1 - lipSync.blinkFactor) : 1;
  if (eyeScaleY < 0.25) {
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(-14, -12, 5.2, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(14, -12, 5.2, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.ellipse(-14, -12, 4.8, 4.8 * eyeScaleY, 0, 0, Math.PI * 2);
    ctx.ellipse(14, -12, 4.8, 4.8 * eyeScaleY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-15.5, -13.5, 1.7, 0, Math.PI * 2);
    ctx.arc(12.5, -13.5, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }

  // Mouth expression (smooth lip-sync when lipSync state is active)
  if (lipSync && lipSync.isSpeaking && lipSync.mouthOpen > 0.08) {
    const mw = 11.5 * lipSync.mouthWidth;
    const mh = 3.5 + lipSync.mouthOpen * 11;
    ctx.fillStyle = '#9F1239';
    ctx.beginPath();
    if (lipSync.mouthRound > 0.55) {
      ctx.ellipse(0, 3, mw * 0.72, mh * 0.85, 0, 0, Math.PI * 2);
    } else {
      ctx.moveTo(-mw, -1);
      ctx.quadraticCurveTo(0, 1, mw, -1);
      ctx.bezierCurveTo(mw * 0.9, mh + 2, -mw * 0.9, mh + 2, -mw, -1);
    }
    ctx.fill();
    if (lipSync.mouthOpen > 0.45 && lipSync.mouthRound < 0.5) {
      ctx.fillStyle = '#FB7185';
      ctx.beginPath();
      ctx.ellipse(0, mh * 0.62, mw * 0.48, Math.max(2, mh * 0.25), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (expression === 'happy') {
    ctx.fillStyle = '#E11D48';
    ctx.beginPath();
    ctx.arc(0, -1, 13, 0.08 * Math.PI, 0.92 * Math.PI);
    ctx.closePath();
    ctx.fill();
  } else if (expression === 'curious') {
    ctx.fillStyle = '#9F1239';
    ctx.beginPath();
    ctx.ellipse(0, 4, 5.5, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 3.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, -3, 12, 0.16 * Math.PI, 0.84 * Math.PI);
    ctx.stroke();
  }

  // Optional crisp name badge pill below shoulders
  if (nameTag) {
    ctx.font = `700 20px ${FONT_SANS}`;
    const pillW = Math.min(156, Math.max(82, ctx.measureText(nameTag).width + 28));
    fillCardWithShadow(ctx, -pillW / 2, 76, pillW, 34, 17, tagColor, 0.12);
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(nameTag, 0, 93, pillW - 16);
  }

  ctx.restore();
}

export interface ResolvedLessonTitleBox {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  maxW: number;
  maxH: number;
  maxFontSize: number;
  cleanTitle: string;
}

export function shouldRenderLessonTitle(project: LessonProject, time?: number): boolean {
  const cleanTitle = formatCartoonHostHeadline(project.title);
  if (!cleanTitle) return false;
  if (project.titleLayout?.hidden) return false;
  if (typeof time === 'number') {
    const introSec = getEffectiveIntroSeconds(project);
    const outroSec = getEffectiveOutroSeconds(project);
    if (introSec > 0 && time < introSec) return false;
    if (
      outroSec > 0 &&
      project.duration > 0 &&
      project.watermark &&
      [project.watermark.outroLine1?.trim(), project.watermark.outroLine2?.trim()].some(Boolean) &&
      time >= Math.max(introSec, project.duration - outroSec)
    ) {
      return false;
    }
  }
  const isCartoonStage =
    project.compositionId === 'cartoon-host' ||
    project.elements.some(
      (el) => el.props.kind === 'illustration-prop' && el.props.variant === 'cartoon-host',
    );
  const hasExplicitTitleLayout =
    Boolean(project.titleLayout) &&
    (project.titleLayout?.hidden === false ||
      typeof project.titleLayout?.x === 'number' ||
      typeof project.titleLayout?.y === 'number' ||
      typeof project.titleLayout?.scale === 'number');
  return isCartoonStage || hasExplicitTitleLayout;
}

export function resolveLessonTitleBox(
  project: LessonProject,
  aspectRatio: ExportAspectRatioId = '9:16',
  time = 0,
): ResolvedLessonTitleBox | null {
  if (!shouldRenderLessonTitle(project, time)) return null;
  const cleanTitle = formatCartoonHostHeadline(project.title);
  if (!cleanTitle) return null;

  const stage = getStageDimensionsForAspect(aspectRatio);
  const stageW = stage.width;
  const subtitlePos = project.subtitleConfig?.position;
  const introSec = getEffectiveIntroSeconds(project);
  const lessonTime = Math.max(0, time - introSec);

  const hasRightHeaderSplit =
    (aspectRatio === '16:9' || aspectRatio === '1:1') &&
    project.elements.some(
      (el) =>
        lessonTime >= el.startTime - 0.01 &&
        lessonTime <= el.endTime + 0.01 &&
        !(el.props.kind === 'illustration-prop' && el.props.variant === 'cartoon-host') &&
        el.type !== 'karaoke-card',
    );

  let centerX = stageW / 2;
  let centerY = 148;
  let maxW = stageW - 96;
  let maxH = 104;
  let maxFontSize = 54;

  if (aspectRatio === '16:9') {
    if (hasRightHeaderSplit) {
      centerX = 430;
      maxW = 720;
      maxFontSize = 44;
    } else {
      centerX = stageW / 2;
      maxW = 1480;
      maxFontSize = 52;
    }
    centerY = subtitlePos === 'top' ? 104 : 126;
    maxH = 92;
  } else if (aspectRatio === '1:1') {
    if (hasRightHeaderSplit) {
      centerX = 285;
      maxW = 470;
      maxFontSize = 36;
    } else {
      centerX = stageW / 2;
      maxW = 920;
      maxFontSize = 44;
    }
    centerY = subtitlePos === 'top' ? 98 : 118;
    maxH = 88;
  } else if (aspectRatio === '4:5') {
    centerX = stageW / 2;
    centerY = subtitlePos === 'top' ? 102 : 124;
    maxW = 920;
    maxH = 88;
    maxFontSize = 46;
  } else {
    centerX = stageW / 2;
    centerY = subtitlePos === 'top' ? 116 : 148;
    maxW = 920;
    maxH = 104;
    maxFontSize = 54;
  }

  const ov = project.titleLayout;
  const scale =
    typeof ov?.scale === 'number' && Number.isFinite(ov.scale)
      ? Math.max(0.3, Math.min(2.0, ov.scale))
      : 1;
  const finalX =
    typeof ov?.x === 'number' && Number.isFinite(ov.x)
      ? Math.max(80, Math.min(stageW - 80, ov.x))
      : centerX;
  const finalY =
    typeof ov?.y === 'number' && Number.isFinite(ov.y)
      ? Math.max(48, Math.min(stage.height - 48, ov.y))
      : centerY;

  // When title is scaled smaller than 1.0, its effective unscaled wrap box expands proportionally
  // so shrinking the title renders the full text cleanly without unnecessary wrapping or cutoff.
  const availStageW = Math.max(240, 2 * Math.min(finalX - 24, stageW - 24 - finalX));
  const effectiveMaxW =
    scale < 0.99
      ? Math.max(maxW, Math.round(availStageW / Math.max(0.3, scale)))
      : Math.max(maxW, Math.min(stageW - 48, availStageW));
  const effectiveMaxH =
    scale < 0.99 ? Math.round(maxH / Math.max(0.35, scale)) : Math.max(maxH, 128);

  const estWidth = Math.min(
    availStageW,
    Math.max(180, Math.round(cleanTitle.length * maxFontSize * 0.56)) * scale,
  );
  const estHeight = Math.round(Math.min(stage.height * 0.45, Math.max(maxH, 96) * scale));

  return {
    x: Math.round(finalX),
    y: Math.round(finalY),
    width: Math.round(estWidth),
    height: Math.round(estHeight),
    scale,
    maxW: effectiveMaxW,
    maxH: effectiveMaxH,
    maxFontSize,
    cleanTitle,
  };
}

/**
 * Renders the signature @Gimmys golden-orange outlined short hook headline
 * directly in stage coordinates so it never clips or collides across 9:16, 16:9, 1:1, or 4:5.
 */
function drawCartoonHostHeadline(
  ctx: CanvasRenderingContext2D,
  project: LessonProject,
  aspectRatio: ExportAspectRatioId = '9:16',
  time: number,
  isSelected = false,
) {
  const box = resolveLessonTitleBox(project, aspectRatio, time);
  if (!box) return;

  const { x: centerX, y: centerY, maxW, maxH, maxFontSize, scale, cleanTitle } = box;

  const fitted = fitWrappedTextBlock(ctx, cleanTitle, maxW, maxH, {
    fontWeight: 900,
    maxFontSize,
    minFontSize: 16,
    maxLines: 6,
    lineHeightRatio: 1.14,
  });

  ctx.save();
  ctx.translate(centerX, centerY);
  if (Math.abs(scale - 1) > 0.005) {
    ctx.scale(scale, scale);
  }
  ctx.font = `900 ${fitted.fontSize}px ${FONT_DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const startY = -((fitted.lines.length - 1) * fitted.lineHeight) / 2;
  const grad = ctx.createLinearGradient(0, -36, 0, 36);
  grad.addColorStop(0, '#FEF08A');
  grad.addColorStop(0.55, '#FACC15');
  grad.addColorStop(1, '#F97316');

  let widestLine = 180;
  fitted.lines.forEach((ln, li) => {
    const ly = startY + li * fitted.lineHeight;
    widestLine = Math.max(widestLine, Math.min(maxW, ctx.measureText(ln).width));
    ctx.save();
    ctx.shadowColor = 'rgba(250, 204, 21, 0.50)';
    ctx.shadowBlur = 16;
    ctx.strokeStyle = '#3B1D0A';
    ctx.lineWidth = Math.max(7, Math.round(fitted.fontSize * 0.22));
    ctx.lineJoin = 'round';
    ctx.strokeText(ln, 0, ly);
    ctx.restore();
    ctx.fillStyle = grad;
    ctx.fillText(ln, 0, ly);
  });

  if (isSelected) {
    const guideW = Math.min(maxW + 32, widestLine + 38);
    const guideH = fitted.lines.length * fitted.lineHeight + 28;
    ctx.save();
    ctx.strokeStyle = '#4F46E5';
    ctx.lineWidth = 4 / Math.max(0.3, scale);
    ctx.setLineDash([12, 8]);
    drawRoundedRectPath(ctx, -guideW / 2, -guideH / 2, guideW, guideH, 18);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Draws a silky-smooth, context-reactive & speech-synced @Gimmys-style 2D cartoon mascot:
 * - Warm shaded round tan head with thick ink outlines
 * - Expressive mood-driven eyes (gaze tracking toward active card) & eyebrows (worried/curious/happy)
 * - Continuous viseme-interpolated mouth modulated by context mood
 * - Articulated stick arms that point UP (9:16/4:5) or RIGHT (16:9/1:1), warn on mistakes, or celebrate tips
 * - ZERO speech bubble above head so subtitles & interactive teaching cards stay crystal clear
 */
function drawCartoonHostCharacter(
  ctx: CanvasRenderingContext2D,
  time: number,
  cues: TranscriptCue[] = [],
  propData?: IllustrationPropData,
  hostContext?: CartoonHostContext,
) {
  const effectiveContext: CartoonHostContext | undefined =
    hostContext ||
    (propData?.cartoonAction || propData?.cartoonMood || propData?.cartoonAnimationSpec
      ? {
          actionId: propData.cartoonAction,
          explicitMood: propData.cartoonMood,
          customSpec: propData.cartoonAnimationSpec,
        }
      : undefined);

  const lip = computeSpeechLipSyncState(cues, time, effectiveContext);
  const ink = '#0F172A';
  const kneeBend = clamp01(lip.kneeBend || 0);
  const clapImpact = clamp01(lip.clapImpact || 0);
  const kneeDropY = kneeBend * 18;

  ctx.save();

  const skinLight = '#ECC094';

  // Helper to draw optional hand prop for mic / megaphone / pointer-stick
  const drawHandPropAccessory = (wx: number, wy: number, dirAngle: number) => {
    if (lip.accessory === 'mic') {
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(dirAngle - 0.15);
      // Black mic handle + silver mesh ball pointing toward mouth
      ctx.fillStyle = '#1E293B';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.roundRect(-8, -32, 16, 48, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#94A3B8';
      ctx.beginPath();
      ctx.arc(0, -40, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else if (lip.accessory === 'pointer-stick') {
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(dirAngle);
      ctx.strokeStyle = '#78350F';
      ctx.lineWidth = 6.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(106, 0);
      ctx.stroke();
      ctx.fillStyle = '#FACC15';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(110, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else if (lip.accessory === 'megaphone') {
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(dirAngle - 0.15);
      ctx.fillStyle = '#EF4444';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(6, -12);
      ctx.lineTo(54, -30);
      ctx.lineTo(54, 24);
      ctx.lineTo(6, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  };

  // Helper to draw a chunky, clearly visible skin-filled cartoon palm + bold fingers at wrist (wx, wy)
  const drawBlendedRightHand = (
    wx: number,
    wy: number,
    dirAngle: number,
    pointMix: number,
    compactMix: number,
  ) => {
    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(dirAngle);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (pointMix >= 0.45) {
      ctx.fillStyle = skinLight;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 4.2;

      ctx.beginPath();
      ctx.ellipse(5, 8, 9, 6.5, 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(9, -11, 9.5, 5.2, -0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(4, 1, 13.5, 11.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const extLen = 36 + 8 * pointMix;
      ctx.beginPath();
      ctx.moveTo(6, -5.5);
      ctx.lineTo(extLen, -4.5);
      ctx.arc(extLen, 0.5, 5.0, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(6, 5.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      const compact = compactMix >= 0.65;
      const spreadScale = compact ? 0.78 : 1;
      const palmRx = compact ? 11.5 : 13.5;
      const palmRy = compact ? 9.5 : 11.5;

      const fingerSpecs = compact
        ? [
            { a: -0.34, len: 23, w: 7.2 },
            { a: 0, len: 26, w: 7.5 },
            { a: 0.34, len: 22, w: 7.2 },
          ]
        : [
            { a: -0.92, len: 23, w: 8.2 },
            { a: -0.34, len: 31, w: 8.4 },
            { a: 0.02, len: 34, w: 8.6 },
            { a: 0.38, len: 31, w: 8.4 },
            { a: 0.72, len: 25, w: 7.8 },
          ];

      fingerSpecs.forEach((f) => {
        ctx.save();
        ctx.rotate(f.a);
        const fLen = f.len * spreadScale;
        ctx.fillStyle = skinLight;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 3.8;
        ctx.beginPath();
        ctx.roundRect(6, -f.w / 2, fLen, f.w, f.w / 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });

      ctx.fillStyle = skinLight;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 4.2;
      ctx.beginPath();
      ctx.ellipse(4, 0, palmRx, palmRy, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  };

  // Large, crisp, unmistakable vector reaction badge positioned clear of the hand & fingertips
  const drawHandReactionBadge = (
    wx: number,
    wy: number,
    dirAngle: number,
    pointMix: number,
    glyph: CartoonLipSyncFrame['badgeGlyph'],
    opacity: number,
    scale: number,
    badgeEmoji?: string,
  ) => {
    if ((!glyph && !badgeEmoji) || opacity <= 0.02 || scale <= 0.1) return;
    const anchorDist = pointMix >= 0.45 ? 98 : 82;
    const badgeAngle = pointMix >= 0.45 ? dirAngle + 0.28 : dirAngle;
    const offsetX =
      pointMix >= 0.45 ? Math.cos(badgeAngle) * anchorDist : 54;
    const offsetY =
      pointMix >= 0.45 ? Math.sin(badgeAngle) * anchorDist : -66;
    const gx = wx + offsetX;
    const gy = wy + offsetY;
    const pulse = 1 + Math.sin(time * 4.2) * 0.04;

    const badgeFill =
      glyph === 'cross'
        ? '#DC2626'
        : glyph === 'check'
          ? '#16A34A'
          : glyph === 'question'
            ? '#D97706'
            : '#2563EB';

    ctx.save();
    ctx.globalAlpha *= clamp01(opacity);
    ctx.translate(gx, gy);
    ctx.scale(scale * pulse, scale * pulse);

    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.26)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = badgeFill;
    ctx.beginPath();
    ctx.arc(0, 0, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 4.6;
    ctx.beginPath();
    ctx.arc(0, 0, 32, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#FFFFFF';
    ctx.fillStyle = '#FFFFFF';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (badgeEmoji) {
      ctx.font = '700 32px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeEmoji, 0, 2);
    } else if (glyph === 'check') {
      ctx.lineWidth = 6.5;
      ctx.beginPath();
      ctx.moveTo(-13, 1);
      ctx.lineTo(-3.5, 11);
      ctx.lineTo(14, -10);
      ctx.stroke();
    } else if (glyph === 'cross') {
      ctx.lineWidth = 6.5;
      ctx.beginPath();
      ctx.moveTo(-11, -11);
      ctx.lineTo(11, 11);
      ctx.moveTo(11, -11);
      ctx.lineTo(-11, 11);
      ctx.stroke();
    } else if (glyph === 'question') {
      ctx.font = `900 38px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', 0, 2);
    } else {
      ctx.font = `900 38px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', 0, 2);
    }
    ctx.restore();
  };

  // Optional FX Aura / Floating Icons around character
  const drawFxOverlay = () => {
    if (!lip.fxOverlay || lip.fxOverlay === 'none') return;
    ctx.save();
    const bobA = Math.sin(time * 3.6) * 8;
    const bobB = Math.cos(time * 4.1) * 7;
    if (lip.fxOverlay === 'fire-aura') {
      const auraGrad = ctx.createRadialGradient(0, -10, 80, 0, -10, 280);
      auraGrad.addColorStop(0, 'rgba(251, 146, 60, 0.34)');
      auraGrad.addColorStop(0.55, 'rgba(250, 204, 21, 0.16)');
      auraGrad.addColorStop(1, 'rgba(251, 146, 60, 0)');
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(0, -10, 280, 0, Math.PI * 2);
      ctx.fill();
    } else if (lip.fxOverlay === 'sparkles' || lip.fxOverlay === 'check-burst') {
      const color = lip.fxOverlay === 'check-burst' ? '#22C55E' : '#FACC15';
      const pts = [
        { x: -165, y: -230 + bobA, s: 18 },
        { x: 175, y: -250 + bobB, s: 16 },
        { x: -185, y: -60 - bobB, s: 13 },
      ];
      ctx.fillStyle = color;
      pts.forEach((p) => {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(time * 1.4);
        ctx.beginPath();
        ctx.moveTo(0, -p.s);
        ctx.quadraticCurveTo(0, 0, p.s, 0);
        ctx.quadraticCurveTo(0, 0, 0, p.s);
        ctx.quadraticCurveTo(0, 0, -p.s, 0);
        ctx.quadraticCurveTo(0, 0, 0, -p.s);
        ctx.fill();
        ctx.restore();
      });
    } else if (lip.fxOverlay === 'lightbulb') {
      const lx = -148;
      const ly = -255 + bobA * 0.7;
      ctx.fillStyle = '#FACC15';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(lx, ly, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#94A3B8';
      ctx.beginPath();
      ctx.roundRect(lx - 10, ly + 18, 20, 12, 4);
      ctx.fill();
      ctx.stroke();
    } else if (lip.fxOverlay === 'warning-bolt') {
      ctx.fillStyle = '#EF4444';
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3;
      ctx.font = `900 44px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.fillText('⚡', -152, -230 + bobA);
      ctx.fillText('❗', 158, -220 + bobB);
    } else if (lip.fxOverlay === 'question-marks') {
      ctx.fillStyle = '#F59E0B';
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 4;
      ctx.font = `900 48px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.strokeText('?', -154, -225 + bobA);
      ctx.fillText('?', -154, -225 + bobA);
      ctx.font = `900 36px ${FONT_DISPLAY}`;
      ctx.strokeText('?', 154, -245 + bobB);
      ctx.fillText('?', 154, -245 + bobB);
    } else if (lip.fxOverlay === 'hearts') {
      ctx.font = '700 36px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('💖', -150, -230 + bobA);
      ctx.fillText('💕', 156, -245 + bobB);
    } else if (lip.fxOverlay === 'music-notes') {
      ctx.fillStyle = '#6366F1';
      ctx.font = `900 44px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.fillText('♪', -154, -225 + bobA);
      ctx.fillText('♫', 162, -242 + bobB);
    } else if (lip.fxOverlay === 'sweat-drop') {
      const sx = 92;
      const sy = -182 + Math.abs(bobA) * 0.8;
      ctx.fillStyle = '#38BDF8';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 18);
      ctx.quadraticCurveTo(sx + 16, sy + 4, sx, sy + 16);
      ctx.quadraticCurveTo(sx - 16, sy + 4, sx, sy - 18);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  };

  // Helper to draw a chunky, skin-filled fanned cartoon left hand at wrist (wx, wy)
  const drawCartoonHand = (wx: number, wy: number, baseAngle: number, spreadFlip = 1, compact = false) => {
    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(baseAngle);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const fingerSpecs = compact
      ? [
          { a: -0.32 * spreadFlip, len: 22, w: 7.2 },
          { a: 0, len: 25, w: 7.5 },
          { a: 0.32 * spreadFlip, len: 21, w: 7.2 },
        ]
      : [
          { a: -0.88 * spreadFlip, len: 22, w: 8.0 },
          { a: -0.32 * spreadFlip, len: 30, w: 8.2 },
          { a: 0.02 * spreadFlip, len: 33, w: 8.4 },
          { a: 0.36 * spreadFlip, len: 30, w: 8.2 },
          { a: 0.68 * spreadFlip, len: 24, w: 7.6 },
        ];

    fingerSpecs.forEach((f) => {
      ctx.save();
      ctx.rotate(f.a);
      ctx.fillStyle = skinLight;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 3.8;
      ctx.beginPath();
      ctx.roundRect(5, -f.w / 2, f.len, f.w, f.w / 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });

    ctx.fillStyle = skinLight;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.ellipse(4, 0, compact ? 11.5 : 13.5, compact ? 9.5 : 11.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  // Continuous viewer-left arm drawn cleanly in front of tunic edge (never hidden behind torso)
  const drawSmoothLeftArm = (sway: number) => {
    const sx = -78;
    const sy = 16;
    const hasExplicitLeftArm =
      lip.leftWristX !== undefined && lip.leftWristY !== undefined;

    if (hasExplicitLeftArm) {
      const ex = lip.leftElbowX ?? -135;
      const ey = lip.leftElbowY ?? 95;
      const wx = lip.leftWristX as number;
      const wy = lip.leftWristY as number;
      const handAngle = lip.leftHandAngle ?? Math.atan2(wy - ey, wx - ex);

      ctx.save();
      ctx.strokeStyle = ink;
      ctx.lineWidth = 9.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(ex, ey, wx, wy);
      ctx.stroke();
      ctx.restore();
      drawCartoonHand(wx, wy, handAngle, -1, clapImpact > 0.25);
      return;
    }

    const openMix = clamp01((lip.leftShoulderAngle - 0.44) / 0.24);
    const smoothOpen = openMix * openMix * (3 - 2 * openMix);

    const hipEx = -146 - sway * 0.35;
    const hipEy = 112;
    const hipWx = -122 - sway * 0.2;
    const hipWy = 204;
    const hipHandAngle = Math.PI * 0.5 - 0.14;

    const upperLen = 104;
    const foreLen = 94;
    const a1 = Math.PI * 0.66 + lip.leftShoulderAngle * 0.52;
    const artEx = sx + Math.cos(a1) * upperLen;
    const artEy = sy + Math.sin(a1) * upperLen;
    const a2 = a1 + (0.34 + lip.leftElbowAngle * 0.42);
    const artWx = artEx + Math.cos(a2) * foreLen;
    const artWy = artEy + Math.sin(a2) * foreLen;

    const ex = Math.min(-112, hipEx + (artEx - hipEx) * smoothOpen);
    const ey = hipEy + (artEy - hipEy) * smoothOpen;
    const wx = Math.min(-114, hipWx + (artWx - hipWx) * smoothOpen);
    const wy = hipWy + (artWy - hipWy) * smoothOpen;
    const handAngle = hipHandAngle + (a2 - hipHandAngle) * smoothOpen;

    ctx.save();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 9.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(ex - 4 * smoothOpen, ey, wx, wy);
    ctx.stroke();
    ctx.restore();
    drawCartoonHand(wx, wy, handAngle, -1, smoothOpen < 0.4);
  };

  // Unified continuous viewer-right arm (never snaps between discrete gesture branches)
  const drawContinuousRightArm = () => {
    const sx = 78;
    const sy = 16;
    const ex = lip.rightElbowX;
    const ey = lip.rightElbowY;
    const wx = lip.rightWristX;
    const wy = lip.rightWristY;

    ctx.save();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 9.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(ex, ey, wx, wy);
    ctx.stroke();
    ctx.restore();

    drawHandPropAccessory(wx, wy, lip.rightHandAngle);
    drawBlendedRightHand(wx, wy, lip.rightHandAngle, lip.rightHandPointMix, lip.rightHandCompactMix);
    if (clapImpact <= 0.2) {
      drawHandReactionBadge(
        wx,
        wy,
        lip.rightHandAngle,
        lip.rightHandPointMix,
        lip.badgeGlyph,
        lip.badgeOpacity,
        lip.badgeScale,
        lip.badgeEmoji,
      );
    }

    if (clapImpact > 0.15) {
      const clapCx = ((lip.leftWristX ?? 0) + wx) * 0.5;
      const clapCy = ((lip.leftWristY ?? wy) + wy) * 0.5 - 6;
      ctx.save();
      ctx.globalAlpha *= clapImpact;
      ctx.strokeStyle = '#FACC15';
      ctx.lineWidth = 5.5;
      ctx.lineCap = 'round';
      for (let rayIdx = 0; rayIdx < 6; rayIdx++) {
        const ang = (rayIdx / 6) * Math.PI * 2 + 0.35;
        const rIn = 34;
        const rOut = 58 + clapImpact * 14;
        ctx.beginPath();
        ctx.moveTo(clapCx + Math.cos(ang) * rIn, clapCy + Math.sin(ang) * rIn);
        ctx.lineTo(clapCx + Math.cos(ang) * rOut, clapCy + Math.sin(ang) * rOut);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  drawFxOverlay();

  // 0. Ground radial shadow under shoes (feet stay firmly planted on floor)
  ctx.save();
  const floorShadow = ctx.createRadialGradient(0, 344, 14, 0, 344, 165);
  floorShadow.addColorStop(0, 'rgba(12, 62, 128, 0.28)');
  floorShadow.addColorStop(0.6, 'rgba(12, 62, 128, 0.12)');
  floorShadow.addColorStop(1, 'rgba(12, 62, 128, 0)');
  ctx.fillStyle = floorShadow;
  ctx.beginPath();
  ctx.ellipse(0, 344, 165, 24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 1. Thicker cartoon legs + grounded shoes (articulated knee flexion without jumping or squash)
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 9.6;
  ctx.lineCap = 'round';
  const hipStartY = 194 + kneeDropY;
  const footY = 335;
  const kneeOutOffset = kneeBend * 28;
  const kneeMidY = (hipStartY + footY) * 0.52 + kneeBend * 10;
  ctx.beginPath();
  ctx.moveTo(-44, hipStartY);
  ctx.quadraticCurveTo(-50 - kneeOutOffset, kneeMidY, -46 - kneeBend * 4, footY);
  ctx.moveTo(44, hipStartY);
  ctx.quadraticCurveTo(50 + kneeOutOffset, kneeMidY, 46 + kneeBend * 4, footY);
  ctx.stroke();

  const shoeTilt = -0.16;
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.ellipse(-58 - kneeBend * 4, footY + 4, 34, 13.5, shoeTilt, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(58 + kneeBend * 4, footY + 4, 34, 13.5, -shoeTilt, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Stable torso & articulated arms (tracks grounded hip flexion only)
  ctx.save();
  ctx.translate(0, kneeDropY);

  const lSway = Math.sin(time * 1.35) * 4;

  // Soft drop shadow beneath tunic bottom
  ctx.fillStyle = 'rgba(15, 23, 42, 0.08)';
  ctx.beginPath();
  ctx.ellipse(0, 206, 98, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // White bell/dome tunic body with crisp shading + thick outline
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-62, -24);
  ctx.bezierCurveTo(-98, 34, -106, 140, -98, 186);
  ctx.quadraticCurveTo(0, 212, 98, 186);
  ctx.bezierCurveTo(106, 140, 98, 34, 62, -24);
  ctx.closePath();

  const tunicGrad = ctx.createLinearGradient(-102, -20, 102, 195);
  tunicGrad.addColorStop(0, '#FFFFFF');
  tunicGrad.addColorStop(0.68, '#F8FAFC');
  tunicGrad.addColorStop(1, '#D5E1EF');
  ctx.fillStyle = tunicGrad;
  ctx.fill();

  ctx.strokeStyle = ink;
  ctx.lineWidth = 8.4;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();

  // Optional badge card on chest
  if (lip.accessory === 'badge-card') {
    ctx.save();
    ctx.fillStyle = '#EEF2FF';
    ctx.strokeStyle = '#4F46E5';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(-34, 48, 68, 42, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#4F46E5';
    ctx.font = `800 18px ${FONT_SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('HOST', 0, 69);
    ctx.restore();
  }

  // Left arm & viewer-right contextual gesture arm
  drawSmoothLeftArm(lSway);
  drawContinuousRightArm();

  // 3. Slightly oval Tan Head rotating around neck pivot with subtle head nod/shake/tilt
  ctx.save();
  ctx.translate(lip.headShakeX, -34 + lip.headBobY);
  ctx.rotate(lip.headTiltRad);
  ctx.translate(0, -124);

  const headRx = 124;
  const headRy = 128;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, headRx, headRy, 0, 0, Math.PI * 2);
  const skinGrad = ctx.createRadialGradient(-42, -54, 18, 10, 16, headRy * 1.15);
  skinGrad.addColorStop(0, '#ECC094');
  skinGrad.addColorStop(0.58, '#DDA46F');
  skinGrad.addColorStop(1, '#C5844E');
  ctx.fillStyle = skinGrad;
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 8.6;
  ctx.stroke();
  ctx.restore();

  // Cheek blush modulated by blushIntensity / happy moods
  const effectiveBlush = Math.max(
    lip.mood === 'happy' || lip.mood === 'excited' || lip.mood === 'proud' ? 0.24 : 0,
    lip.blushIntensity ?? 0,
  );
  if (effectiveBlush > 0.04) {
    ctx.save();
    ctx.fillStyle = `rgba(244, 114, 182, ${Math.min(0.65, effectiveBlush * 0.72).toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(-62, 14, 19, 10.5, 0, 0, Math.PI * 2);
    ctx.ellipse(62, 14, 19, 10.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Context-driven eyebrows
  const browBaseY = -46 - lip.browLift * 10;
  const gazeX = lip.eyeTargetX * 5.5;
  const gazeY = lip.eyeTargetY * 4;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 5.4;
  ctx.lineCap = 'round';

  if (lip.mood === 'worried' || lip.mood === 'sad') {
    ctx.beginPath();
    ctx.moveTo(-56, browBaseY + 9);
    ctx.quadraticCurveTo(-37, browBaseY + 1, -18, browBaseY - 8);
    ctx.moveTo(18, browBaseY - 8);
    ctx.quadraticCurveTo(37, browBaseY + 1, 56, browBaseY + 9);
    ctx.stroke();
  } else if (lip.mood === 'curious') {
    ctx.beginPath();
    ctx.moveTo(-54, browBaseY + 5);
    ctx.quadraticCurveTo(-37, browBaseY - 2, -20, browBaseY + 4);
    ctx.moveTo(18, browBaseY - 5);
    ctx.quadraticCurveTo(37, browBaseY - 18, 56, browBaseY - 7);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(-54, browBaseY + 4);
    ctx.quadraticCurveTo(-37, browBaseY - 8, -20, browBaseY + 3);
    ctx.moveTo(20, browBaseY + 3);
    ctx.quadraticCurveTo(37, browBaseY - 8, 54, browBaseY + 4);
    ctx.stroke();
  }

  // Expressive Eyes (eyeStyle + blink)
  const eyeScaleY = Math.max(0.08, 1 - lip.blinkFactor);
  const lx = -37 + gazeX;
  const rx = 37 + gazeX;
  const ey = -18 + gazeY;

  if (lip.eyeStyle === 'cool-shades' || lip.accessory === 'sunglasses') {
    ctx.save();
    ctx.fillStyle = '#0F172A';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(lx - 26, ey - 16, 50, 30, 8);
    ctx.roundRect(rx - 24, ey - 16, 50, 30, 8);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(lx + 24, ey - 5);
    ctx.lineTo(rx - 24, ey - 5);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.moveTo(lx - 18, ey - 11);
    ctx.lineTo(lx - 2, ey - 11);
    ctx.lineTo(lx - 14, ey + 9);
    ctx.closePath();
    ctx.moveTo(rx - 16, ey - 11);
    ctx.lineTo(rx, ey - 11);
    ctx.lineTo(rx - 12, ey + 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else if (eyeScaleY < 0.24 || lip.eyeStyle === 'happy-arc') {
    ctx.strokeStyle = ink;
    ctx.lineWidth = 5.6;
    ctx.beginPath();
    if (lip.eyeStyle === 'happy-arc' || lip.mood === 'happy' || lip.mood === 'excited' || lip.mood === 'proud') {
      ctx.arc(lx, ey + 5, 13, 1.1 * Math.PI, 1.9 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(rx, ey + 5, 13, 1.1 * Math.PI, 1.9 * Math.PI);
      ctx.stroke();
    } else {
      ctx.arc(lx, ey, 12, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(rx, ey, 12, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
    }
  } else if (lip.eyeStyle === 'star' || lip.eyeStyle === 'heart') {
    const drawGlyphEye = (cx: number, cy: number) => {
      ctx.fillStyle = lip.eyeStyle === 'heart' ? '#E11D48' : '#F59E0B';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.5;
      ctx.font = `900 32px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const glyph = lip.eyeStyle === 'heart' ? '♥' : '★';
      ctx.strokeText(glyph, cx, cy);
      ctx.fillText(glyph, cx, cy);
    };
    drawGlyphEye(lx, ey);
    drawGlyphEye(rx, ey);
  } else if (lip.eyeStyle === 'wink') {
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(lx, ey, 10.5, 13.5 * eyeScaleY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(lx + 2.4, ey - 3.8, 2.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 5.6;
    ctx.beginPath();
    ctx.arc(rx, ey + 4, 12, 1.1 * Math.PI, 1.9 * Math.PI);
    ctx.stroke();
  } else if (lip.eyeStyle === 'wide-surprised') {
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = ink;
    ctx.lineWidth = 4.6;
    ctx.beginPath();
    ctx.ellipse(lx, ey, 17, 19 * eyeScaleY, 0, 0, Math.PI * 2);
    ctx.ellipse(rx, ey, 17, 19 * eyeScaleY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(lx, ey, 7.2, 0, Math.PI * 2);
    ctx.arc(rx, ey, 7.2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const isSleepy = lip.eyeStyle === 'sleepy';
    const isFocused = lip.eyeStyle === 'focused';
    const lScaleMod = isSleepy ? 0.55 : isFocused ? 0.82 : lip.mood === 'worried' ? 0.85 : lip.mood === 'curious' ? 0.92 : 1;
    const rScaleMod = isSleepy ? 0.55 : isFocused ? 0.82 : lip.mood === 'worried' ? 0.85 : lip.mood === 'curious' ? 1.1 : 1;
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(lx, ey, 10.5, 13.5 * eyeScaleY * lScaleMod, 0, 0, Math.PI * 2);
    ctx.ellipse(rx, ey, 10.5, 13.5 * eyeScaleY * rScaleMod, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(lx + 2.4 + lip.eyeTargetX * 1.6, ey - 3.8 + lip.eyeTargetY * 1.4, 2.7, 0, Math.PI * 2);
    ctx.arc(rx + 2.4 + lip.eyeTargetX * 1.6, ey - 3.8 + lip.eyeTargetY * 1.4, 2.7, 0, Math.PI * 2);
    ctx.fill();
  }

  // Smooth syllable/viseme lip-synced mouth modulated by mood & mouthStyle
  const mouthY = 36;
  const openAmt = lip.mouthOpen;
  if (lip.mouthStyle === 'o-shock' && (!lip.isSpeaking || openAmt < 0.25)) {
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(0, mouthY + 12, 18, 22, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (lip.mouthStyle === 'big-grin' && (!lip.isSpeaking || openAmt <= 0.16)) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-42, mouthY - 2);
    ctx.quadraticCurveTo(0, mouthY + 6, 42, mouthY - 2);
    ctx.bezierCurveTo(36, mouthY + 42, -36, mouthY + 42, -42, mouthY - 2);
    ctx.closePath();
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 5.4;
    ctx.stroke();
    ctx.restore();
  } else if (openAmt <= 0.09) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = 6.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (lip.mouthStyle === 'wavy-nervous') {
      ctx.moveTo(-26, mouthY + 6);
      ctx.quadraticCurveTo(-12, mouthY - 4, 0, mouthY + 6);
      ctx.quadraticCurveTo(12, mouthY + 16, 26, mouthY + 4);
    } else if (lip.mouthStyle === 'flat-serious') {
      ctx.moveTo(-22, mouthY + 6);
      ctx.lineTo(22, mouthY + 6);
    } else if (lip.mouthStyle === 'smirk') {
      ctx.moveTo(-22, mouthY + 8);
      ctx.quadraticCurveTo(8, mouthY + 14, 30, mouthY - 4);
    } else if (lip.mood === 'worried' || lip.mood === 'sad') {
      ctx.arc(0, mouthY + 24, 26, 1.18 * Math.PI, 1.82 * Math.PI);
    } else if (lip.mood === 'curious') {
      ctx.moveTo(-18, mouthY + 5);
      ctx.quadraticCurveTo(0, mouthY + 2, 18, mouthY + 7);
    } else if (lip.viseme === 'closed') {
      ctx.moveTo(-25, mouthY + 4);
      ctx.quadraticCurveTo(0, mouthY + 6, 25, mouthY + 4);
    } else {
      const smileDepth = lip.mood === 'happy' || lip.mood === 'excited' || lip.mood === 'proud' ? 31 : 27;
      ctx.arc(0, mouthY - 8, smileDepth, 0.14 * Math.PI, 0.86 * Math.PI);
    }
    ctx.stroke();
  } else {
    const mw = 38 * lip.mouthWidth;
    const mh = 12 + openAmt * 36;
    const cornerCurve = lip.mood === 'worried' || lip.mood === 'sad' ? -4 : lip.mood === 'happy' || lip.mood === 'excited' ? 6 : 4;
    ctx.save();
    ctx.beginPath();
    if (lip.mouthRound > 0.55) {
      const rxMouth = mw * (0.72 - 0.14 * lip.mouthRound);
      const ryMouth = Math.max(10, mh * 0.62);
      ctx.ellipse(0, mouthY + ryMouth * 0.45, rxMouth, ryMouth, 0, 0, Math.PI * 2);
    } else {
      ctx.moveTo(-mw, mouthY);
      ctx.quadraticCurveTo(0, mouthY + cornerCurve, mw, mouthY);
      ctx.bezierCurveTo(
        mw * 0.96,
        mouthY + mh * 1.18,
        -mw * 0.96,
        mouthY + mh * 1.18,
        -mw,
        mouthY,
      );
      ctx.closePath();
    }
    ctx.fillStyle = ink;
    ctx.fill();

    if (openAmt > 0.42 && lip.mouthRound < 0.58) {
      ctx.clip();
      ctx.fillStyle = '#E11D48';
      ctx.beginPath();
      ctx.ellipse(0, mouthY + mh * 0.88, mw * 0.56, mh * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Optional Graduation Cap on Head
  if (lip.accessory === 'graduation-cap') {
    ctx.save();
    ctx.translate(0, -headRy + 12);
    ctx.fillStyle = '#1E293B';
    ctx.strokeStyle = ink;
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(0, -34);
    ctx.lineTo(118, -6);
    ctx.lineTo(0, 22);
    ctx.lineTo(-118, -6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(-52, 10, 104, 24, 6);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(82, -2);
    ctx.lineTo(96, 34);
    ctx.stroke();
    ctx.fillStyle = '#FACC15';
    ctx.beginPath();
    ctx.arc(96, 38, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore(); // end head
  ctx.restore(); // end torso/bob
  ctx.restore(); // end character root & squash/stretch
}

const bgImageCache = new Map<string, HTMLImageElement>();
const bgImageLoading = new Map<string, Promise<HTMLImageElement | null>>();
const bgVideoCache = new Map<string, HTMLVideoElement>();
const bgVideoLoading = new Map<string, Promise<HTMLVideoElement | null>>();

export function computeBackgroundImageDrawRect(
  imgW: number,
  imgH: number,
  stageW = STAGE_WIDTH,
  stageH = STAGE_HEIGHT,
  fit: BackgroundFitMode = 'cover',
): { dx: number; dy: number; dw: number; dh: number } {
  const safeImgW = Math.max(1, imgW);
  const safeImgH = Math.max(1, imgH);
  const scale =
    fit === 'contain'
      ? Math.min(stageW / safeImgW, stageH / safeImgH)
      : Math.max(stageW / safeImgW, stageH / safeImgH);
  const dw = Math.round(safeImgW * scale);
  const dh = Math.round(safeImgH * scale);
  const dx = Math.round((stageW - dw) / 2);
  const dy = Math.round((stageH - dh) / 2);
  return { dx, dy, dw, dh };
}

const bgLoadListeners = new Set<() => void>();

export function subscribeBgImageLoaded(listener: () => void): () => void {
  bgLoadListeners.add(listener);
  return () => {
    bgLoadListeners.delete(listener);
  };
}

function notifyBgImageLoaded() {
  bgLoadListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore listener errors
    }
  });
}

export async function ensureBgVideoLoaded(videoUrl: string): Promise<HTMLVideoElement | null> {
  if (!videoUrl || typeof document === 'undefined') return null;
  const cached = bgVideoCache.get(videoUrl);
  if (cached && cached.readyState >= 2) return cached;

  const pending = bgVideoLoading.get(videoUrl);
  if (pending) return pending;

  const p = new Promise<HTMLVideoElement | null>((resolve) => {
    const vid = document.createElement('video');
    vid.muted = true;
    vid.loop = true;
    vid.playsInline = true;
    vid.preload = 'auto';
    vid.crossOrigin = 'anonymous';
    const done = (ok: boolean) => {
      vid.removeEventListener('loadeddata', onReady);
      vid.removeEventListener('canplay', onReady);
      vid.removeEventListener('error', onErr);
      bgVideoLoading.delete(videoUrl);
      if (ok && vid.videoWidth > 0) {
        bgVideoCache.set(videoUrl, vid);
        notifyBgImageLoaded();
        resolve(vid);
      } else {
        resolve(null);
      }
    };
    const onReady = () => done(true);
    const onErr = () => done(false);
    vid.addEventListener('loadeddata', onReady);
    vid.addEventListener('canplay', onReady);
    vid.addEventListener('error', onErr);
    vid.src = videoUrl;
    vid.load();
  });
  bgVideoLoading.set(videoUrl, p);
  return p;
}

export function getCachedBgVideo(videoUrl: string): HTMLVideoElement | null {
  if (!videoUrl) return null;
  const cached = bgVideoCache.get(videoUrl);
  if (cached && cached.readyState >= 2) return cached;
  if (!bgVideoLoading.has(videoUrl)) {
    void ensureBgVideoLoaded(videoUrl);
  }
  return cached && cached.readyState >= 2 ? cached : null;
}

export async function seekBackgroundVideoTo(videoUrl: string | undefined, timeSec: number): Promise<void> {
  if (!videoUrl) return;
  const vid = (await ensureBgVideoLoaded(videoUrl)) || getCachedBgVideo(videoUrl);
  if (!vid || !Number.isFinite(vid.duration) || vid.duration <= 0.05) return;
  const wrapped = ((Math.max(0, timeSec) % vid.duration) + vid.duration) % vid.duration;
  if (Math.abs(vid.currentTime - wrapped) < 0.025 && vid.readyState >= 2) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      vid.removeEventListener('seeked', finish);
      resolve();
    };
    vid.addEventListener('seeked', finish, { once: true });
    try {
      vid.currentTime = wrapped;
    } catch {
      finish();
    }
    setTimeout(finish, 180);
  });
}

export async function seekProjectVideoAssets(project: LessonProject, timeSec: number): Promise<void> {
  const bg = project.backgroundImage;
  if (!bg || bg.kind !== 'video' || !bg.videoUrl) return;
  await seekBackgroundVideoTo(bg.videoUrl, timeSec);
}

export function drawLoadedImageCover(
  ctx: CanvasRenderingContext2D,
  media: HTMLImageElement | HTMLVideoElement,
  mediaW: number,
  mediaH: number,
  stageW: number,
  stageH: number,
  fit: BackgroundFitMode = 'cover',
  zoom = 1,
) {
  const rect = computeBackgroundImageDrawRect(mediaW || stageW, mediaH || stageH, stageW, stageH, fit);
  if (zoom > 1.001) {
    const cx = rect.dx + rect.dw / 2;
    const cy = rect.dy + rect.dh / 2;
    const zw = rect.dw * zoom;
    const zh = rect.dh * zoom;
    ctx.drawImage(media, cx - zw / 2, cy - zh / 2, zw, zh);
    return;
  }
  ctx.drawImage(media, rect.dx, rect.dy, rect.dw, rect.dh);
}

export async function ensureProjectAssetsLoaded(project: LessonProject): Promise<void> {
  const bg = project.backgroundImage;
  if (bg?.kind === 'video' && bg.videoUrl) {
    await ensureBgVideoLoaded(bg.videoUrl);
    return;
  }
  const presetAssetUrl =
    (bg?.kind === 'preset' || (!bg?.kind && !bg?.dataUrl && !bg?.videoUrl)) && bg?.presetId
      ? getBackgroundPresetMeta(bg.presetId)?.assetUrl
      : undefined;
  const dataUrl = bg?.dataUrl || presetAssetUrl;
  if (!dataUrl || typeof Image === 'undefined') return;
  const cached = bgImageCache.get(dataUrl);
  if (cached && cached.complete && cached.naturalWidth > 0) return;

  const pending = bgImageLoading.get(dataUrl);
  if (pending) {
    await pending;
    return;
  }

  const p = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => {
      bgImageCache.set(dataUrl, img);
      bgImageLoading.delete(dataUrl);
      notifyBgImageLoaded();
      resolve(img);
    };
    img.onerror = () => {
      bgImageLoading.delete(dataUrl);
      resolve(null);
    };
    img.src = dataUrl;
  });
  bgImageLoading.set(dataUrl, p);
  await p;
}

export function getCachedBgImage(dataUrl: string): HTMLImageElement | null {
  const cached = bgImageCache.get(dataUrl);
  if (cached && cached.complete && cached.naturalWidth > 0) return cached;
  if (!bgImageLoading.has(dataUrl) && typeof Image !== 'undefined') {
    const img = new Image();
    const p = new Promise<HTMLImageElement | null>((resolve) => {
      img.onload = () => {
        bgImageCache.set(dataUrl, img);
        bgImageLoading.delete(dataUrl);
        notifyBgImageLoaded();
        resolve(img);
      };
      img.onerror = () => {
        bgImageLoading.delete(dataUrl);
        resolve(null);
      };
    });
    bgImageLoading.set(dataUrl, p);
    img.src = dataUrl;
    if (img.complete && img.naturalWidth > 0) {
      bgImageCache.set(dataUrl, img);
      bgImageLoading.delete(dataUrl);
      return img;
    }
  }
  return null;
}

function drawVectorPrimitives(
  ctx: CanvasRenderingContext2D,
  primitives: VectorPrimitive[],
  time: number,
  extraCustomDraw?: (icon: IllustrationSceneIcon) => void,
) {
  let inferredCardWidth = 0;
  for (const p of primitives) {
    if ((p.shape === 'rect' || p.shape === 'pill') && typeof p.w === 'number' && p.w > inferredCardWidth) {
      inferredCardWidth = p.w;
    }
  }

  for (const prim of primitives) {
    ctx.save();
    if (typeof prim.opacity === 'number') {
      ctx.globalAlpha *= clamp01(prim.opacity);
    }
    const px = prim.x ?? 0;
    const py = prim.y ?? 0;

    if (prim.shape === 'rect' || prim.shape === 'pill') {
      const w = prim.w ?? 200;
      const h = prim.h ?? 110;
      const r = prim.shape === 'pill' ? h / 2 : (prim.radius ?? 22);
      if (prim.shadow && prim.fill) {
        fillCardWithShadow(ctx, px, py, w, h, r, prim.fill, 0.09);
      }
      drawRoundedRectPath(ctx, px, py, w, h, r);
      if (prim.fill && !prim.shadow) {
        ctx.fillStyle = prim.fill;
        ctx.fill();
      }
      if (prim.stroke) {
        ctx.strokeStyle = prim.stroke;
        ctx.lineWidth = prim.lineWidth ?? 3;
        ctx.stroke();
      }
    } else if (prim.shape === 'circle') {
      const r = prim.r ?? 44;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      if (prim.fill) {
        ctx.fillStyle = prim.fill;
        ctx.fill();
      }
      if (prim.stroke) {
        ctx.strokeStyle = prim.stroke;
        ctx.lineWidth = prim.lineWidth ?? 4;
        ctx.stroke();
      }
    } else if (prim.shape === 'ellipse') {
      const rx = prim.rx ?? 64;
      const ry = prim.ry ?? 40;
      ctx.beginPath();
      ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
      if (prim.fill) {
        ctx.fillStyle = prim.fill;
        ctx.fill();
      }
      if (prim.stroke) {
        ctx.strokeStyle = prim.stroke;
        ctx.lineWidth = prim.lineWidth ?? 4;
        ctx.stroke();
      }
    } else if (prim.shape === 'arc') {
      const r = prim.r ?? 48;
      ctx.strokeStyle = prim.stroke || prim.fill || '#2563EB';
      ctx.lineWidth = prim.lineWidth ?? 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(px, py, r, prim.startAngle ?? 0, prim.endAngle ?? Math.PI);
      ctx.stroke();
    } else if (prim.shape === 'polygon' && Array.isArray(prim.points) && prim.points.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(prim.points[0][0], prim.points[0][1]);
      for (let i = 1; i < prim.points.length; i++) {
        ctx.lineTo(prim.points[i][0], prim.points[i][1]);
      }
      ctx.closePath();
      if (prim.fill) {
        ctx.fillStyle = prim.fill;
        ctx.fill();
      }
      if (prim.stroke) {
        ctx.strokeStyle = prim.stroke;
        ctx.lineWidth = prim.lineWidth ?? 3;
        ctx.stroke();
      }
    } else if (prim.shape === 'line' || prim.shape === 'arrow') {
      const x2 = prim.x2 ?? px + 80;
      const y2 = prim.y2 ?? py;
      const col = prim.stroke || prim.fill || '#1E293B';
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = prim.lineWidth ?? 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      if (prim.shape === 'arrow') {
        const ang = Math.atan2(y2 - py, x2 - px);
        const head = Math.max(12, (prim.lineWidth ?? 6) * 2.4);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - head * Math.cos(ang - 0.52), y2 - head * Math.sin(ang - 0.52));
        ctx.lineTo(x2 - head * Math.cos(ang + 0.52), y2 - head * Math.sin(ang + 0.52));
        ctx.closePath();
        ctx.fill();
      }
    } else if (prim.shape === 'text') {
      const maxSize = Math.max(16, prim.fontSize ?? 32);
      const weight = prim.fontWeight ?? 700;
      const fallbackW = inferredCardWidth > 0 ? Math.max(80, inferredCardWidth - 40) : 380;
      const maxW = Math.max(48, prim.w ?? fallbackW);
      const maxH = prim.h ? Math.max(28, prim.h) : 220;
      const fitted = fitWrappedTextBlock(ctx, prim.text || '', maxW, maxH, {
        fontWeight: weight,
        fontFamily: FONT_DISPLAY,
        maxFontSize: maxSize,
        minFontSize: 15,
        lineHeightRatio: 1.22,
        maxLines: 3,
      });
      ctx.font = `${weight} ${fitted.fontSize}px ${FONT_DISPLAY}`;
      ctx.fillStyle = prim.fill || '#0F172A';
      ctx.textAlign = prim.align ?? 'center';
      ctx.textBaseline = 'middle';
      const startY = py - ((fitted.lines.length - 1) * fitted.lineHeight) / 2;
      fitted.lines.forEach((ln, li) => {
        ctx.fillText(ln, px, startY + li * fitted.lineHeight, maxW);
      });
    } else if (prim.shape === 'icon' && extraCustomDraw) {
      const bounce = Math.sin(time * 2.5) * 3;
      ctx.translate(px, py + bounce);
      ctx.scale(0.85, 0.85);
      extraCustomDraw((prim.icon || 'sparkles') as IllustrationSceneIcon);
    }

    ctx.restore();
  }
}

function drawSceneIcon(ctx: CanvasRenderingContext2D, kind: IllustrationSceneIcon) {
  ctx.save();
  if (kind === 'tv') {
    fillCardWithShadow(ctx, -92, -62, 184, 124, 28, '#0F172A', 0.14);
    const screenGrad = ctx.createLinearGradient(-72, -44, 72, 34);
    screenGrad.addColorStop(0, '#60A5FA');
    screenGrad.addColorStop(1, '#38BDF8');
    ctx.fillStyle = screenGrad;
    drawRoundedRectPath(ctx, -74, -44, 148, 80, 16);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(-74, -44);
    ctx.lineTo(18, -44);
    ctx.lineTo(-32, 36);
    ctx.lineTo(-74, 36);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(-12, -22);
    ctx.lineTo(28, -2);
    ctx.lineTo(-12, 18);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-30, 72);
    ctx.lineTo(30, 72);
    ctx.stroke();
  } else if (kind === 'glasses') {
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Left lens
    ctx.fillStyle = '#E0F2FE';
    drawRoundedRectPath(ctx, -68, -22, 54, 42, 16);
    ctx.fill();
    ctx.stroke();
    // Right lens
    drawRoundedRectPath(ctx, 14, -22, 54, 42, 16);
    ctx.fill();
    ctx.stroke();
    // Nose bridge & temple arms
    ctx.beginPath();
    ctx.arc(0, -4, 15, Math.PI * 1.1, Math.PI * 1.9);
    ctx.moveTo(-68, -6);
    ctx.lineTo(-78, -14);
    ctx.moveTo(68, -6);
    ctx.lineTo(78, -14);
    ctx.stroke();
    // Specular sheen
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-54, -12);
    ctx.lineTo(-42, 6);
    ctx.moveTo(28, -12);
    ctx.lineTo(40, 6);
    ctx.stroke();
  } else if (kind === 'eye') {
    ctx.fillStyle = '#EFF6FF';
    ctx.strokeStyle = '#2563EB';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-74, 0);
    ctx.quadraticCurveTo(0, -54, 74, 0);
    ctx.quadraticCurveTo(0, 54, -74, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2563EB';
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-6, -6, 4.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'watch') {
    ctx.fillStyle = '#334155';
    drawRoundedRectPath(ctx, -20, -64, 40, 128, 12);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#2563EB';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -20);
    ctx.moveTo(0, 0);
    ctx.lineTo(16, 8);
    ctx.stroke();
  } else if (kind === 'listen') {
    ctx.fillStyle = '#FDE68A';
    ctx.beginPath();
    ctx.ellipse(-8, 0, 36, 48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(18, 0, 38, -0.7, 0.7);
    ctx.stroke();
  } else if (kind === 'walk') {
    ctx.fillStyle = '#FDBA74';
    ctx.beginPath();
    ctx.arc(0, -36, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#EA580C';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(0, 28);
    ctx.moveTo(0, 4);
    ctx.lineTo(-28, 22);
    ctx.moveTo(0, 4);
    ctx.lineTo(26, 18);
    ctx.moveTo(0, 28);
    ctx.lineTo(-18, 58);
    ctx.moveTo(0, 28);
    ctx.lineTo(22, 58);
    ctx.stroke();
  } else if (kind === 'airplane') {
    ctx.fillStyle = '#DBEAFE';
    ctx.beginPath();
    ctx.arc(0, 0, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2563EB';
    ctx.beginPath();
    ctx.moveTo(0, -44);
    ctx.lineTo(12, -10);
    ctx.lineTo(48, 6);
    ctx.lineTo(48, 18);
    ctx.lineTo(12, 8);
    ctx.lineTo(8, 34);
    ctx.lineTo(22, 46);
    ctx.lineTo(-22, 46);
    ctx.lineTo(-8, 34);
    ctx.lineTo(-12, 8);
    ctx.lineTo(-48, 18);
    ctx.lineTo(-48, 6);
    ctx.lineTo(-12, -10);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'luggage') {
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-18, -36);
    ctx.lineTo(-18, -56);
    ctx.lineTo(18, -56);
    ctx.lineTo(18, -36);
    ctx.stroke();
    fillCardWithShadow(ctx, -42, -36, 84, 88, 18, '#F59E0B', 0.12);
    ctx.fillStyle = '#FEF3C7';
    drawRoundedRectPath(ctx, -26, -16, 52, 16, 8);
    ctx.fill();
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.arc(-26, 56, 7, 0, Math.PI * 2);
    ctx.arc(26, 56, 7, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'menu') {
    fillCardWithShadow(ctx, -50, -56, 100, 112, 16, '#FFF7ED', 0.12);
    ctx.fillStyle = '#EA580C';
    drawRoundedRectPath(ctx, -50, -56, 100, 26, 12);
    ctx.fill();
    ctx.fillStyle = '#FDBA74';
    drawRoundedRectPath(ctx, -32, -14, 64, 10, 5);
    ctx.fill();
    drawRoundedRectPath(ctx, -32, 6, 48, 10, 5);
    ctx.fill();
    drawRoundedRectPath(ctx, -32, 26, 56, 10, 5);
    ctx.fill();
  } else if (kind === 'cup') {
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    [-12, 8].forEach((sx) => {
      ctx.beginPath();
      ctx.moveTo(sx, -34);
      ctx.quadraticCurveTo(sx - 6, -46, sx + 2, -56);
      ctx.stroke();
    });
    fillCardWithShadow(ctx, -46, -24, 92, 74, 22, '#FFFFFF', 0.12);
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 3;
    drawRoundedRectPath(ctx, -46, -24, 92, 74, 22);
    ctx.stroke();
    ctx.fillStyle = '#38BDF8';
    drawRoundedRectPath(ctx, -36, -12, 72, 52, 15);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    drawRoundedRectPath(ctx, -28, -4, 14, 34, 7);
    ctx.fill();
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(46, 12, 16, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
  } else if (kind === 'shopping-bag') {
    ctx.strokeStyle = '#BE185D';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(0, -34, 20, Math.PI, 0);
    ctx.stroke();
    fillCardWithShadow(ctx, -44, -30, 88, 86, 16, '#EC4899', 0.12);
    ctx.fillStyle = '#FCE7F3';
    ctx.beginPath();
    ctx.arc(-16, -12, 5, 0, Math.PI * 2);
    ctx.arc(16, -12, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'price-tag') {
    ctx.save();
    ctx.rotate(-0.2);
    fillCardWithShadow(ctx, -52, -32, 104, 64, 16, '#10B981', 0.12);
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-32, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `800 30px ${FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$%', 12, 2);
    ctx.restore();
  } else if (kind === 'stethoscope') {
    ctx.fillStyle = '#FEE2E2';
    ctx.beginPath();
    ctx.arc(0, 0, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#EF4444';
    drawRoundedRectPath(ctx, -12, -34, 24, 68, 8);
    ctx.fill();
    drawRoundedRectPath(ctx, -34, -12, 68, 24, 8);
    ctx.fill();
  } else if (kind === 'sun') {
    ctx.fillStyle = '#FACC15';
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    for (let r = 0; r < 8; r++) {
      const a = (r * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 44, Math.sin(a) * 44);
      ctx.lineTo(Math.cos(a) * 58, Math.sin(a) * 58);
      ctx.stroke();
    }
  } else if (kind === 'rain' || kind === 'umbrella') {
    ctx.fillStyle = '#93C5FD';
    ctx.beginPath();
    ctx.arc(-18, -14, 26, 0, Math.PI * 2);
    ctx.arc(16, -18, 30, 0, Math.PI * 2);
    ctx.arc(38, -6, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2563EB';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    [-22, 0, 22].forEach((dx) => {
      ctx.beginPath();
      ctx.moveTo(dx, 22);
      ctx.lineTo(dx - 8, 46);
      ctx.stroke();
    });
  } else if (kind === 'snowflake') {
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    for (let r = 0; r < 3; r++) {
      const a = (r * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * -48, Math.sin(a) * -48);
      ctx.lineTo(Math.cos(a) * 48, Math.sin(a) * 48);
      ctx.stroke();
    }
  } else if (kind === 'book') {
    fillCardWithShadow(ctx, -56, -42, 54, 84, 10, '#FFFFFF', 0.1);
    fillCardWithShadow(ctx, 2, -42, 54, 84, 10, '#F8FAFC', 0.1);
    ctx.strokeStyle = '#4F46E5';
    ctx.lineWidth = 6;
    drawRoundedRectPath(ctx, -56, -42, 112, 84, 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -42);
    ctx.lineTo(0, 42);
    ctx.stroke();
  } else if (kind === 'pencil') {
    ctx.save();
    ctx.rotate(-0.6);
    fillCardWithShadow(ctx, -16, -48, 32, 88, 6, '#FACC15', 0.1);
    ctx.fillStyle = '#FCA5A5';
    drawRoundedRectPath(ctx, -16, -54, 32, 18, 6);
    ctx.fill();
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.moveTo(-16, 40);
    ctx.lineTo(16, 40);
    ctx.lineTo(0, 62);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else if (kind === 'graduation') {
    ctx.fillStyle = '#312E81';
    ctx.beginPath();
    ctx.moveTo(0, -42);
    ctx.lineTo(62, -12);
    ctx.lineTo(0, 18);
    ctx.lineTo(-62, -12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#4338CA';
    drawRoundedRectPath(ctx, -32, 8, 64, 30, 10);
    ctx.fill();
    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(46, -10);
    ctx.lineTo(46, 30);
    ctx.stroke();
  } else if (kind === 'laptop') {
    fillCardWithShadow(ctx, -58, -42, 116, 74, 12, '#1E293B', 0.12);
    ctx.fillStyle = '#60A5FA';
    drawRoundedRectPath(ctx, -46, -32, 92, 54, 8);
    ctx.fill();
    ctx.fillStyle = '#94A3B8';
    drawRoundedRectPath(ctx, -74, 34, 148, 14, 7);
    ctx.fill();
  } else if (kind === 'calendar') {
    fillCardWithShadow(ctx, -50, -46, 100, 96, 18, '#FFFFFF', 0.1);
    ctx.fillStyle = '#4F46E5';
    drawRoundedRectPath(ctx, -50, -46, 100, 30, 14);
    ctx.fill();
    ctx.fillStyle = '#0F172A';
    ctx.font = `800 32px ${FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('15', 0, 18);
  } else if (kind === 'briefcase') {
    ctx.strokeStyle = '#78350F';
    ctx.lineWidth = 7;
    drawRoundedRectPath(ctx, -20, -52, 40, 20, 8);
    ctx.stroke();
    fillCardWithShadow(ctx, -54, -34, 108, 82, 18, '#92400E', 0.12);
    ctx.fillStyle = '#FACC15';
    drawRoundedRectPath(ctx, -14, -4, 28, 16, 6);
    ctx.fill();
  } else if (kind === 'clock') {
    fillCardWithShadow(ctx, -54, -54, 108, 108, 54, '#FFFFFF', 0.12);
    ctx.strokeStyle = '#2563EB';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, 48, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#0F172A';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -26);
    ctx.moveTo(0, 0);
    ctx.lineTo(22, 10);
    ctx.stroke();
  } else if (kind === 'car' || kind === 'bus') {
    fillCardWithShadow(ctx, -60, -26, 120, 56, 16, kind === 'bus' ? '#F59E0B' : '#3B82F6', 0.12);
    ctx.fillStyle = '#DBEAFE';
    drawRoundedRectPath(ctx, -42, -16, 84, 24, 8);
    ctx.fill();
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(-34, 34, 12, 0, Math.PI * 2);
    ctx.arc(34, 34, 12, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'home') {
    ctx.fillStyle = '#F97316';
    ctx.beginPath();
    ctx.moveTo(0, -54);
    ctx.lineTo(62, -6);
    ctx.lineTo(-62, -6);
    ctx.closePath();
    ctx.fill();
    fillCardWithShadow(ctx, -46, -8, 92, 60, 12, '#FFFBEB', 0.1);
    ctx.fillStyle = '#B45309';
    drawRoundedRectPath(ctx, -14, 12, 28, 40, 8);
    ctx.fill();
  } else if (kind === 'dumbbell') {
    ctx.fillStyle = '#475569';
    drawRoundedRectPath(ctx, -48, -6, 96, 12, 6);
    ctx.fill();
    ctx.fillStyle = '#2563EB';
    drawRoundedRectPath(ctx, -56, -28, 18, 56, 8);
    ctx.fill();
    drawRoundedRectPath(ctx, 38, -28, 18, 56, 8);
    ctx.fill();
  } else if (kind === 'music' || kind === 'mic') {
    ctx.fillStyle = '#7C3AED';
    drawRoundedRectPath(ctx, -16, -46, 32, 54, 16);
    ctx.fill();
    ctx.strokeStyle = '#7C3AED';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, -8, 28, 0, Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 20);
    ctx.lineTo(0, 44);
    ctx.moveTo(-20, 44);
    ctx.lineTo(20, 44);
    ctx.stroke();
  } else if (kind === 'camera') {
    fillCardWithShadow(ctx, -54, -34, 108, 72, 18, '#1E293B', 0.12);
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.arc(0, 2, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-8, -6, 6, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'heart') {
    ctx.fillStyle = '#EC4899';
    ctx.beginPath();
    ctx.arc(-20, -14, 22, 0, Math.PI * 2);
    ctx.arc(20, -14, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-40, -6);
    ctx.lineTo(40, -6);
    ctx.lineTo(0, 42);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'sparkles') {
    ctx.fillStyle = '#FACC15';
    const drawStar4 = (sx: number, sy: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(sx, sy - r);
      ctx.quadraticCurveTo(sx, sy, sx + r, sy);
      ctx.quadraticCurveTo(sx, sy, sx, sy + r);
      ctx.quadraticCurveTo(sx, sy, sx - r, sy);
      ctx.quadraticCurveTo(sx, sy, sx, sy - r);
      ctx.fill();
    };
    drawStar4(-6, -4, 42);
    ctx.fillStyle = '#38BDF8';
    drawStar4(34, -30, 20);
    ctx.fillStyle = '#A855F7';
    drawStar4(32, 28, 16);
  } else if (kind === 'brain') {
    ctx.fillStyle = '#F472B6';
    ctx.beginPath();
    ctx.arc(-18, -6, 28, 0, Math.PI * 2);
    ctx.arc(18, -6, 28, 0, Math.PI * 2);
    ctx.arc(0, -24, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#9D174D';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, -38);
    ctx.lineTo(0, 24);
    ctx.stroke();
  } else if (kind === 'lightning') {
    ctx.fillStyle = '#FACC15';
    ctx.beginPath();
    ctx.moveTo(8, -54);
    ctx.lineTo(-28, 4);
    ctx.lineTo(2, 4);
    ctx.lineTo(-10, 54);
    ctx.lineTo(30, -6);
    ctx.lineTo(-2, -6);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'scale') {
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(0, -40);
    ctx.lineTo(0, 42);
    ctx.moveTo(-48, -22);
    ctx.lineTo(48, -22);
    ctx.moveTo(-26, 42);
    ctx.lineTo(26, 42);
    ctx.stroke();
    ctx.fillStyle = '#3B82F6';
    ctx.beginPath();
    ctx.arc(-48, 12, 18, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = '#10B981';
    ctx.beginPath();
    ctx.arc(48, 12, 18, 0, Math.PI);
    ctx.fill();
  } else if (kind === 'gift') {
    fillCardWithShadow(ctx, -46, -26, 92, 74, 14, '#EF4444', 0.12);
    ctx.fillStyle = '#FACC15';
    ctx.fillRect(-8, -26, 16, 74);
    ctx.fillRect(-46, 2, 92, 14);
  } else if (kind === 'wallet') {
    fillCardWithShadow(ctx, -52, -34, 104, 72, 18, '#0F766E', 0.12);
    ctx.fillStyle = '#14B8A6';
    drawRoundedRectPath(ctx, 10, -10, 46, 26, 10);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(26, 3, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'map-pin') {
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.arc(0, -16, 34, Math.PI, 0);
    ctx.lineTo(0, 48);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(0, -14, 14, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'globe') {
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.arc(0, 0, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 22, 48, 0, 0, Math.PI * 2);
    ctx.moveTo(-48, 0);
    ctx.lineTo(48, 0);
    ctx.stroke();
  } else if (kind === 'handshake' || kind === 'chat') {
    fillCardWithShadow(ctx, -54, -36, 108, 68, 22, '#4F46E5', 0.12);
    ctx.fillStyle = '#FFFFFF';
    [-22, 0, 22].forEach((dx) => {
      ctx.beginPath();
      ctx.arc(dx, -2, 6, 0, Math.PI * 2);
      ctx.fill();
    });
  } else {
    // Crisp smartphone fallback
    fillCardWithShadow(ctx, -40, -70, 80, 140, 18, '#0F172A', 0.1);
    ctx.fillStyle = '#38BDF8';
    drawRoundedRectPath(ctx, -28, -54, 56, 100, 12);
    ctx.fill();
  }
  ctx.restore();
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const safeMaxW = Math.max(24, maxWidth);
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];

  const splitMixedAtoms = (token: string): string[] => {
    if (!/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(token)) {
      return [token];
    }
    const rawParts =
      token.match(
        /[「『（【《〈"']*?[A-Za-z0-9\u00C0-\u024F\u1E00-\u1EFF][A-Za-z0-9\u00C0-\u024F\u1E00-\u1EFF'’\-.,!?;:]*[」』）】》〉"']*|[「『（【《〈]?[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fffー々]|[^\s]/g,
      ) || [token];
    const glued: string[] = [];
    for (const part of rawParts) {
      if (/^[」』）】》〉。、！？.,!?;:]+$/.test(part) && glued.length > 0) {
        glued[glued.length - 1] += part;
      } else {
        glued.push(part);
      }
    }
    return glued;
  };

  const pushWrappedWord = (word: string, seedLine = '') => {
    const atoms = splitMixedAtoms(word);
    let chunk = seedLine;
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (ctx.measureText(atom).width > safeMaxW && !/[A-Za-z0-9]/.test(atom)) {
        for (const ch of atom) {
          const next = chunk + ch;
          if (ctx.measureText(next).width <= safeMaxW || chunk.length === 0) {
            chunk = next;
          } else {
            lines.push(chunk);
            chunk = ch;
          }
        }
        continue;
      }
      const next = chunk + atom;
      if (ctx.measureText(next).width <= safeMaxW || chunk.length === 0) {
        chunk = next;
      } else {
        lines.push(chunk);
        chunk = atom;
      }
    }
    if (chunk) lines.push(chunk);
  };

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    let current = '';
    for (const word of words) {
      if (!current) {
        if (ctx.measureText(word).width <= safeMaxW) {
          current = word;
        } else {
          pushWrappedWord(word);
          current = lines.pop() ?? '';
        }
        continue;
      }
      const candidate = `${current} ${word}`;
      if (ctx.measureText(candidate).width <= safeMaxW) {
        current = candidate;
      } else if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(word)) {
        pushWrappedWord(word, `${current} `);
        current = lines.pop() ?? '';
      } else {
        lines.push(current);
        if (ctx.measureText(word).width <= safeMaxW) {
          current = word;
        } else {
          pushWrappedWord(word);
          current = lines.pop() ?? '';
        }
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function fitWrappedTextBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number,
  options: {
    fontWeight?: number | string;
    fontFamily?: string;
    maxFontSize: number;
    minFontSize?: number;
    lineHeightRatio?: number;
    maxLines?: number;
    strictMaxLines?: boolean;
  },
): { fontSize: number; lineHeight: number; lines: string[] } {
  const weight = options.fontWeight ?? 700;
  const family = options.fontFamily ?? FONT_DISPLAY;
  const minFont = Math.max(10, options.minFontSize ?? 16);
  const lhRatio = options.lineHeightRatio ?? 1.24;
  const maxLines = options.maxLines ?? 8;
  const safeW = Math.max(24, maxWidth);
  const safeH = Math.max(24, maxHeight);

  const hasShortOrphan = (wrapped: string[]): boolean => {
    if (wrapped.length < 2) return false;
    const lastClean = wrapped[wrapped.length - 1].replace(/\s+/g, '');
    return lastClean.length <= 2;
  };

  let fontSize = Math.max(minFont, options.maxFontSize);
  let firstFit: { fontSize: number; lineHeight: number; lines: string[] } | null = null;
  let bestLines: string[] = [];

  while (fontSize >= minFont) {
    ctx.font = `${weight} ${fontSize}px ${family}`;
    const wrapped = wrapTextLines(ctx, text, safeW);
    const lh = Math.round(fontSize * lhRatio);
    bestLines = wrapped;
    if (wrapped.length <= maxLines && wrapped.length * lh <= safeH) {
      if (!firstFit) {
        firstFit = { fontSize, lineHeight: lh, lines: wrapped };
      }
      // If shrinking slightly avoids a 1-2 char orphan tail line (e.g. "か。"), take the cleaner wrap
      if (!hasShortOrphan(wrapped) || fontSize <= Math.max(minFont, options.maxFontSize * 0.78)) {
        return { fontSize, lineHeight: lh, lines: wrapped };
      }
    }
    fontSize -= 2;
  }

  if (firstFit) return firstFit;

  // Step down slightly below requested minFont (down to 10px) before giving up so full text fits without clipping
  let floorTry = minFont - 2;
  while (floorTry >= 10) {
    ctx.font = `${weight} ${floorTry}px ${family}`;
    const wrapped = wrapTextLines(ctx, text, safeW);
    const lh = Math.round(floorTry * lhRatio);
    bestLines = wrapped;
    if (wrapped.length <= maxLines && wrapped.length * lh <= safeH) {
      return { fontSize: floorTry, lineHeight: lh, lines: wrapped };
    }
    floorTry -= 2;
  }

  return {
    fontSize: Math.min(minFont, 12),
    lineHeight: Math.round(Math.min(minFont, 12) * lhRatio),
    lines: options.strictMaxLines ? bestLines.slice(0, maxLines) : bestLines,
  };
}

function drawComparisonStrip(
  ctx: CanvasRenderingContext2D,
  props: ComparisonStripProps,
  width: number,
  time: number,
  elStartTime = 0,
) {
  const count = Math.max(1, props.items.length);
  const safeStripW = Math.max(360, width);
  const elElapsed = Math.max(0, time - elStartTime);

  // Determine active index: latest item whose activateAt <= time
  let activeIdx = -1;
  props.items.forEach((item, idx) => {
    if (item.activateAt !== undefined && time >= item.activateAt) {
      activeIdx = idx;
    }
  });

  const isLongStack =
    !props.singleRow &&
    (props.items.some((item) => item.label.trim().length > 16) || count > 4);

  if (isLongStack) {
    const rowW = Math.min(1200, safeStripW);
    const rowGap = 12;
    const layouts = props.items.map((item, idx) => {
      const isActive = idx === activeIdx;
      const showSub = Boolean(
        item.sublabel &&
          !(
            !isActive &&
            item.activateAt !== undefined &&
            time < item.activateAt &&
            /đáp\s*án|correct\s*answer|正解/i.test(item.sublabel)
          ),
      );
      const fSize = item.label.length > 78 ? 25 : 28;
      ctx.font = `700 ${fSize}px ${FONT_DISPLAY}`;
      const textMaxW = Math.max(120, rowW - (showSub ? 230 : 68));
      const fitted = fitWrappedTextBlock(ctx, item.label, textMaxW, 130, {
        fontWeight: 700,
        fontFamily: FONT_DISPLAY,
        maxFontSize: fSize,
        minFontSize: 18,
        lineHeightRatio: 1.24,
        maxLines: 3,
      });
      const rowH = Math.max(76, fitted.lines.length * fitted.lineHeight + 28);
      return { item, idx, isActive, showSub, fSize: fitted.fontSize, lh: fitted.lineHeight, lines: fitted.lines, rowH, textMaxW };
    });

    const totalH =
      layouts.reduce((acc, l) => acc + l.rowH, 0) + rowGap * Math.max(0, layouts.length - 1);
    let cursorY = -totalH / 2;

    layouts.forEach(({ item, idx, isActive, showSub, fSize, lh, lines, rowH, textMaxW }) => {
      const stag = computeStaggerItemState(elElapsed, idx, 0.075, 0.34);
      if (!stag.visible) {
        cursorY += rowH + rowGap;
        return;
      }
      const accent = item.accentColor || '#16A34A';
      const activeBoost = isActive ? 1.018 : 1;
      const centerY = cursorY + rowH / 2;

      ctx.save();
      ctx.globalAlpha *= stag.opacity;
      ctx.translate(0, centerY + stag.translateY);
      ctx.scale(stag.scale * activeBoost, stag.scale * activeBoost);

      fillCardWithShadow(
        ctx,
        -rowW / 2,
        -rowH / 2,
        rowW,
        rowH,
        24,
        isActive ? '#FFFFFF' : 'rgba(255,255,255,0.92)',
        isActive ? 0.14 : 0.06,
      );

      if (isActive) {
        ctx.save();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 4.5;
        drawRoundedRectPath(ctx, -rowW / 2, -rowH / 2, rowW, rowH, 24);
        ctx.stroke();
        ctx.restore();
      }

      const textStartY = -((lines.length - 1) * lh) / 2;
      ctx.font = `700 ${fSize}px ${FONT_DISPLAY}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isActive ? '#0F172A' : '#334155';
      lines.forEach((ln, li) => {
        ctx.fillText(ln, -rowW / 2 + 32, textStartY + li * lh, textMaxW);
      });

      if (showSub && item.sublabel) {
        ctx.font = `700 22px ${FONT_SANS}`;
        const pillW = Math.min(186, Math.max(120, ctx.measureText(item.sublabel).width + 30));
        ctx.fillStyle = isActive ? accent : '#E2E8F0';
        drawRoundedRectPath(ctx, rowW / 2 - pillW - 18, -20, pillW, 40, 20);
        ctx.fill();
        ctx.fillStyle = isActive ? '#FFFFFF' : '#475569';
        ctx.textAlign = 'center';
        ctx.fillText(item.sublabel, rowW / 2 - pillW / 2 - 18, 1, pillW - 18);
      }

      ctx.restore();
      cursorY += rowH + rowGap;
    });
    return;
  }

  // Unified @englishpracticing168 frosted capsule housing all tabs inside one cohesive header bar
  const outerPadX = 14;
  const outerW = safeStripW + outerPadX * 2;
  const isSingleRow = Boolean(props.singleRow);
  const outerH = isSingleRow ? 92 : 120;
  fillCardWithShadow(
    ctx,
    -outerW / 2,
    -outerH / 2,
    outerW,
    outerH,
    isSingleRow ? 32 : 40,
    'rgba(255, 255, 255, 0.92)',
    0.08,
  );
  ctx.save();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 2;
  drawRoundedRectPath(ctx, -outerW / 2, -outerH / 2, outerW, outerH, isSingleRow ? 32 : 40);
  ctx.stroke();
  ctx.restore();

  const gap = isSingleRow ? 8 : 12;
  const itemW = (safeStripW - gap * (count - 1)) / count;
  const itemH = isSingleRow ? 72 : 96;
  const startX = -safeStripW / 2;
  const startY = -itemH / 2;

  props.items.forEach((item, idx) => {
    const stag = computeStaggerItemState(elElapsed, idx, 0.075, 0.34);
    if (!stag.visible) return;
    const x = startX + idx * (itemW + gap);
    const isActive = idx === activeIdx;
    const accent = item.accentColor || '#2563EB';
    const activeScale = isActive ? 1.02 : 1;

    ctx.save();
    ctx.globalAlpha *= stag.opacity;
    ctx.translate(x + itemW / 2, stag.translateY);
    ctx.scale(stag.scale * activeScale, stag.scale * activeScale);

    if (isActive) {
      fillCardWithShadow(
        ctx,
        -itemW / 2,
        startY,
        itemW,
        itemH,
        isSingleRow ? 22 : 28,
        '#FFFFFF',
        0.1,
      );
      ctx.fillStyle = hexToRgba(accent, 0.1);
      drawRoundedRectPath(ctx, -itemW / 2, startY, itemW, itemH, isSingleRow ? 22 : 28);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(241, 245, 249, 0.72)';
      drawRoundedRectPath(ctx, -itemW / 2, startY, itemW, itemH, isSingleRow ? 22 : 28);
      ctx.fill();
    }

    const showSublabel = Boolean(
      item.sublabel &&
        !(
          !isActive &&
          item.activateAt !== undefined &&
          time < item.activateAt &&
          /đáp\s*án|correct\s*answer|正解/i.test(item.sublabel)
        ),
    );

    const maxLabelW = Math.max(44, itemW - (isSingleRow ? 14 : 24));
    const fitted = fitWrappedTextBlock(ctx, item.label, maxLabelW, showSublabel ? 48 : isSingleRow ? 62 : 80, {
      fontWeight: 700,
      fontFamily: FONT_DISPLAY,
      maxFontSize: isSingleRow ? (count >= 4 ? 22 : 26) : 31,
      minFontSize: 11,
      lineHeightRatio: 1.14,
      maxLines: isSingleRow ? 2 : 3,
    });

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isActive ? accent : '#64748B';
    ctx.font = `700 ${fitted.fontSize}px ${FONT_DISPLAY}`;

    const labelCenterY = showSublabel ? startY + 32 : startY + itemH / 2;
    const firstY = labelCenterY - ((fitted.lines.length - 1) * fitted.lineHeight) / 2;
    fitted.lines.forEach((ln, li) => {
      ctx.fillText(ln, 0, firstY + li * fitted.lineHeight, maxLabelW);
    });

    if (showSublabel && item.sublabel) {
      ctx.font = `600 20px ${FONT_SANS}`;
      ctx.fillStyle = isActive ? '#334155' : '#94A3B8';
      ctx.fillText(item.sublabel, 0, startY + 69, maxLabelW);
    }
    ctx.restore();
  });
}

function drawTopicPill(
  ctx: CanvasRenderingContext2D,
  props: TopicPillProps,
  maxBoxWidth = 880,
) {
  const safeBoxW = Math.max(220, maxBoxWidth);
  const maxTextW = Math.max(150, safeBoxW - 64);
  const fitted = fitWrappedTextBlock(ctx, props.text, maxTextW, 130, {
    fontWeight: 700,
    fontFamily: FONT_SANS,
    maxFontSize: 34,
    minFontSize: 20,
    lineHeightRatio: 1.24,
    maxLines: 3,
  });
  ctx.font = `700 ${fitted.fontSize}px ${FONT_SANS}`;
  const maxLineW = Math.max(120, ...fitted.lines.map((ln) => Math.min(maxTextW, ctx.measureText(ln).width)));
  const pillW = Math.min(safeBoxW, Math.max(220, maxLineW + 64));
  const lh = fitted.lineHeight;
  const pillH = fitted.lines.length === 1 ? 74 : fitted.lines.length * lh + 32;

  fillCardWithShadow(
    ctx,
    -pillW / 2,
    -pillH / 2,
    pillW,
    pillH,
    Math.min(37, Math.round(pillH / 2)),
    props.bgColor,
    0.06,
  );
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = props.textColor;
  ctx.font = `700 ${fitted.fontSize}px ${FONT_SANS}`;
  const startY = -((fitted.lines.length - 1) * lh) / 2 + 1;
  fitted.lines.forEach((ln, li) => {
    ctx.fillText(ln, 0, startY + li * lh, pillW - 44);
  });
}

const VARIANTS_WITH_NATIVE_LABELS = new Set<string>([
  'flow-diagram',
  'timeline-track',
  'tense-timeline',
  'degree-scale',
  'phrasal-split',
  'syllable-stress',
  'trio-icon-cards',
  'contrast-pair-cards',
  'quiz-fill-blank',
  'bs-list-group',
  'bs-pricing-tier',
  'bs-breadcrumb-path',
  'css-bento-stats',
  'css-chat-thread',
  'css-roadmap-steps',
  'css-grammar-equation',
  'bs-badge-cluster',
  'bs-modal-quiz',
  'p168-step-quiz-formula',
  'p168-grammar-formula',
  'p168-pronunciation-matrix',
  'p168-situation-cards',
  'p168-slider-compare',
  'p168-story-dialogue',
  'cartoon-host',
  'podcast-studio',
  'dynamic-scene',
  'custom-vector',
]);

function drawProminentLabelsStrip(
  ctx: CanvasRenderingContext2D,
  labels: string[],
  topY: number,
  stripW = 840,
): number {
  const clean = labels.map((l) => l.trim()).filter(Boolean).slice(0, 3);
  if (clean.length === 0) return 0;
  const safeStripW = Math.min(840, Math.max(240, stripW));

  const palette = [
    { bg: '#EEF2FF', border: '#C7D2FE', fg: '#312E81', badge: '#4F46E5' },
    { bg: '#ECFDF5', border: '#A7F3D0', fg: '#065F46', badge: '#10B981' },
    { bg: '#FFF7ED', border: '#FED7AA', fg: '#9A3412', badge: '#EA580C' },
  ];

  // If 2–3 labels are all concise (<= 13 chars), lay them out in 2–3 distinct wide columns
  const allShort = clean.every((l) => l.length <= 13);
  if (allShort && clean.length >= 2) {
    const gap = 16;
    const colW = (safeStripW - gap * (clean.length - 1)) / clean.length;
    const colH = 74;
    const startX = -safeStripW / 2;
    clean.forEach((lbl, i) => {
      const col = palette[i % palette.length];
      const cx = startX + i * (colW + gap);
      fillCardWithShadow(ctx, cx, topY, colW, colH, 20, col.bg, 0.08);
      ctx.strokeStyle = col.border;
      ctx.lineWidth = 2.5;
      drawRoundedRectPath(ctx, cx, topY, colW, colH, 20);
      ctx.stroke();

      const fitted = fitWrappedTextBlock(ctx, lbl, colW - 24, colH - 12, {
        fontWeight: 800,
        maxFontSize: 30,
        minFontSize: 18,
        maxLines: 2,
        lineHeightRatio: 1.15,
      });
      ctx.font = `800 ${fitted.fontSize}px ${FONT_DISPLAY}`;
      ctx.fillStyle = col.fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const ly = topY + colH / 2 - ((fitted.lines.length - 1) * fitted.lineHeight) / 2;
      fitted.lines.forEach((ln, li) => ctx.fillText(ln, cx + colW / 2, ly + li * fitted.lineHeight, colW - 20));
    });
    return colH;
  }

  // Longer callouts: stack vertically in 2 or 3 distinct spacious rows (never cramped!)
  const gap = 10;
  let cursorY = topY;
  clean.forEach((lbl, i) => {
    const col = palette[i % palette.length];
    const textMaxW = Math.max(120, safeStripW - 108);
    const fitted = fitWrappedTextBlock(ctx, lbl, textMaxW, 86, {
      fontWeight: 800,
      maxFontSize: 30,
      minFontSize: 18,
      maxLines: 2,
      lineHeightRatio: 1.2,
    });
    const rowH = Math.max(66, fitted.lines.length * fitted.lineHeight + 26);

    fillCardWithShadow(ctx, -safeStripW / 2, cursorY, safeStripW, rowH, 20, col.bg, 0.08);
    ctx.strokeStyle = col.border;
    ctx.lineWidth = 2.5;
    drawRoundedRectPath(ctx, -safeStripW / 2, cursorY, safeStripW, rowH, 20);
    ctx.stroke();

    // Numbered pill on left
    ctx.fillStyle = col.badge;
    ctx.beginPath();
    ctx.arc(-safeStripW / 2 + 38, cursorY + rowH / 2, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `800 22px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${i + 1}`, -safeStripW / 2 + 38, cursorY + rowH / 2 + 1);

    ctx.font = `800 ${fitted.fontSize}px ${FONT_DISPLAY}`;
    ctx.fillStyle = col.fg;
    ctx.textAlign = 'left';
    const textStartY = cursorY + rowH / 2 - ((fitted.lines.length - 1) * fitted.lineHeight) / 2;
    fitted.lines.forEach((ln, li) => {
      ctx.fillText(ln, -safeStripW / 2 + 72, textStartY + li * fitted.lineHeight, textMaxW);
    });
    cursorY += rowH + gap;
  });
  return cursorY - topY - gap;
}

function measureProminentLabelsHeight(labels?: string[]): number {
  const clean = (labels || []).map((l) => l.trim()).filter(Boolean).slice(0, 3);
  if (clean.length === 0) return 0;
  if (clean.length >= 2 && clean.every((l) => l.length <= 13)) return 74;
  return clean.reduce((sum, l, idx) => {
    const rowH = l.length > 36 ? 98 : 66;
    return sum + rowH + (idx > 0 ? 10 : 0);
  }, 0);
}

function drawIllustrationProp(
  ctx: CanvasRenderingContext2D,
  props: IllustrationPropProps,
  time: number,
  elStartTime = 0,
  cues: TranscriptCue[] = [],
  hostContext?: CartoonHostContext,
) {
  const elElapsed = Math.max(0, time - elStartTime);
  const floatRamp = easeOutCubic(clamp01(elElapsed / 0.5));
  const floatOffset = props.variant === 'cartoon-host' ? 0 : Math.sin(elElapsed * 2.1) * 6 * floatRamp;
  ctx.save();
  ctx.translate(0, floatOffset);

  if (props.data?.customPrimitives && props.data.customPrimitives.length > 0) {
    drawVectorPrimitives(ctx, props.data.customPrimitives, time, (icon) => drawSceneIcon(ctx, icon));
    ctx.restore();
    return;
  }

  const customDef = getCustomComponentByVariant(props.variant);
  if (customDef && customDef.primitives && customDef.primitives.length > 0) {
    drawVectorPrimitives(ctx, customDef.primitives, time, (icon) => drawSceneIcon(ctx, icon));
    ctx.restore();
    return;
  }

  const attachExtraLabels =
    !VARIANTS_WITH_NATIVE_LABELS.has(props.variant) &&
    Boolean(props.data?.labels && props.data.labels.length > 0);
  const extraLabelsH = attachExtraLabels
    ? measureProminentLabelsHeight(props.data?.labels)
    : 0;
  if (extraLabelsH > 0) {
    ctx.translate(0, -(extraLabelsH + 16) / 2);
  }

  if (props.variant === 'cafe-water') {
    // Glass of water on the left
    ctx.save();
    ctx.translate(-225, 65);
    ctx.fillStyle = '#E0F2FE';
    ctx.beginPath();
    ctx.moveTo(-36, -64);
    ctx.lineTo(36, -64);
    ctx.lineTo(26, 68);
    ctx.lineTo(-26, 68);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#60A5FA';
    ctx.beginPath();
    ctx.moveTo(-31, -20);
    ctx.lineTo(31, -20);
    ctx.lineTo(24, 62);
    ctx.lineTo(-24, 62);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#93C5FD';
    ctx.lineWidth = 4;
    ctx.strokeRect(-1, -1, 2, 2); // noop clean state
    ctx.restore();

    // Minimalist cafe shop center
    fillCardWithShadow(ctx, -125, -80, 250, 220, 24, '#FFFDF9', 0.08);
    // Roof stripes
    const stripeW = 250 / 5;
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#EF4444' : '#FFFFFF';
      drawRoundedRectPath(ctx, -135 + i * (270 / 5), -110, 270 / 5, 58, 12);
      ctx.fill();
    }
    // Window
    ctx.fillStyle = '#BAE6FD';
    drawRoundedRectPath(ctx, -98, -22, 108, 92, 16);
    ctx.fill();
    // Door
    ctx.fillStyle = '#92400E';
    drawRoundedRectPath(ctx, 28, -12, 72, 152, 14);
    ctx.fill();
    ctx.fillStyle = '#FBBF24';
    ctx.beginPath();
    ctx.arc(84, 64, 7, 0, Math.PI * 2);
    ctx.fill();

    // Friendly modern character on right
    drawCharacterAvatar(ctx, {
      x: 220,
      y: 12,
      shirtColor: '#EC4899',
      hairColor: '#3E2723',
      hairStyle: 'bob',
      expression: 'happy',
      nameTag: 'Customer',
      tagColor: '#DB2777',
    });
  } else if (props.variant === 'coffee-cup') {
    fillCardWithShadow(ctx, -95, -50, 190, 130, 32, '#FFFFFF', 0.08);
    ctx.fillStyle = '#92400E';
    ctx.beginPath();
    ctx.ellipse(0, -34, 72, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(105, 10, 32, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
  } else if (props.variant === 'friends-chat') {
    // Two modern flat-vector characters chatting with speech bubble above
    drawCharacterAvatar(ctx, {
      x: -145,
      y: 12,
      shirtColor: '#2563EB',
      hairColor: '#1E293B',
      hairStyle: 'short',
      expression: 'smile',
      nameTag: props.data?.labels?.[0] || 'Alex',
      tagColor: '#2563EB',
    });
    drawCharacterAvatar(ctx, {
      x: 145,
      y: 12,
      shirtColor: '#EC4899',
      hairColor: '#78350F',
      hairStyle: 'bob',
      expression: 'happy',
      nameTag: props.data?.labels?.[1] || 'Mia',
      tagColor: '#DB2777',
    });
    // Crisp chat bubble above
    fillCardWithShadow(ctx, -74, -124, 148, 72, 24, '#FFFFFF', 0.09);
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 2;
    drawRoundedRectPath(ctx, -74, -124, 148, 72, 24);
    ctx.stroke();
    ctx.fillStyle = '#2563EB';
    [-26, 0, 26].forEach((dx, i) => {
      const bounce = Math.sin(time * 5 + i * 0.9) * 4;
      ctx.beginPath();
      ctx.arc(dx, -88 + bounce, 7, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (props.variant === 'office-work') {
    // Minimalist office monitor / desk & calendar
    fillCardWithShadow(ctx, -165, -95, 330, 195, 28, '#FFFFFF', 0.08);
    ctx.fillStyle = '#E0E7FF';
    drawRoundedRectPath(ctx, -135, -65, 270, 125, 16);
    ctx.fill();
    // Tie / collar badge in center + calendar card
    ctx.fillStyle = '#4F46E5';
    drawRoundedRectPath(ctx, -108, -42, 108, 80, 12);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `800 28px ${FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FRI', -54, -2);
    // Email lines on right
    ctx.fillStyle = '#6366F1';
    drawRoundedRectPath(ctx, 18, -36, 94, 14, 7);
    ctx.fill();
    ctx.fillStyle = '#94A3B8';
    drawRoundedRectPath(ctx, 18, -8, 76, 12, 6);
    ctx.fill();
    drawRoundedRectPath(ctx, 18, 18, 86, 12, 6);
    ctx.fill();
    // Stand
    ctx.fillStyle = '#CBD5E1';
    drawRoundedRectPath(ctx, -40, 100, 80, 20, 8);
    ctx.fill();
  } else if (props.variant === 'hotel-desk') {
    // Formal hotel reception bell + keycard
    fillCardWithShadow(ctx, -160, -70, 320, 165, 28, '#FFFDF9', 0.08);
    ctx.fillStyle = '#7C3AED';
    drawRoundedRectPath(ctx, -125, 24, 250, 44, 16);
    ctx.fill();
    // Bell dome
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.arc(0, 18, 68, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#FDE68A';
    drawRoundedRectPath(ctx, -12, -66, 24, 16, 8);
    ctx.fill();
    // Sparkle
    const pulse = 0.7 + 0.3 * Math.sin(time * 4);
    ctx.fillStyle = `rgba(124, 58, 237, ${pulse})`;
    ctx.beginPath();
    ctx.arc(82, -52, 8, 0, Math.PI * 2);
    ctx.fill();
  } else if (props.variant === 'lightbulb-tip') {
    const glow = 0.28 + 0.14 * Math.sin(time * 3.5);
    ctx.fillStyle = `rgba(250, 204, 21, ${glow})`;
    ctx.beginPath();
    ctx.arc(0, -18, 118, 0, Math.PI * 2);
    ctx.fill();
    // Bulb glass
    ctx.fillStyle = '#FACC15';
    ctx.beginPath();
    ctx.arc(0, -24, 72, 0, Math.PI * 2);
    ctx.fill();
    drawRoundedRectPath(ctx, -36, 26, 72, 42, 14);
    ctx.fill();
    // Screw base
    ctx.fillStyle = '#475569';
    drawRoundedRectPath(ctx, -32, 68, 64, 34, 12);
    ctx.fill();
    // Inner filament check
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-22, -20);
    ctx.lineTo(-4, 0);
    ctx.lineTo(26, -34);
    ctx.stroke();
  } else if (props.variant === 'ear-listen') {
    fillCardWithShadow(ctx, -140, -90, 280, 180, 44, '#FFFFFF', 0.08);
    // Headphones arc + sound waves
    ctx.strokeStyle = '#4F46E5';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 6, 58, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = '#4F46E5';
    drawRoundedRectPath(ctx, -74, -4, 28, 56, 14);
    ctx.fill();
    drawRoundedRectPath(ctx, 46, -4, 28, 56, 14);
    ctx.fill();
    // Equalizer bars in middle
    [0, 1, 2].forEach((i) => {
      const h = 22 + 28 * Math.abs(Math.sin(time * 5 + i * 0.9));
      ctx.fillStyle = '#0284C7';
      drawRoundedRectPath(ctx, -22 + i * 18, 20 - h / 2, 10, h, 5);
      ctx.fill();
    });
  } else if (props.variant === 'speech-bubble') {
    fillCardWithShadow(ctx, -180, -90, 360, 160, 44, '#FFFFFF', 0.08);
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(-40, 70);
    ctx.lineTo(10, 70);
    ctx.lineTo(-25, 118);
    ctx.closePath();
    ctx.fill();

    // Animated sound bars inside bubble
    const barHeights = [26, 52, 74, 44, 64, 34];
    barHeights.forEach((h, i) => {
      const pulse = Math.abs(Math.sin(time * 4 + i * 0.7));
      const bh = 22 + h * 0.65 * pulse;
      ctx.fillStyle = i % 2 === 0 ? '#4F46E5' : '#0284C7';
      drawRoundedRectPath(ctx, -105 + i * 38, -bh / 2 - 10, 18, bh, 9);
      ctx.fill();
    });
  } else if (props.variant === 'flow-diagram') {
    const nodes =
      props.data?.nodes && props.data.nodes.length >= 2
        ? props.data.nodes.slice(0, 3)
        : [
            { label: 'Present', icon: 'clock' as const, color: '#2563EB' },
            { label: 'Past', icon: 'history' as const, color: '#16A34A' },
            { label: 'Future', icon: 'rocket' as const, color: '#7C3AED' },
          ];
    const xs = nodes.length === 2 ? [-190, 190] : [-280, 0, 280];

    // Connecting arrows
    for (let i = 0; i < xs.length - 1; i++) {
      const ax1 = xs[i] + 74;
      const ax2 = xs[i + 1] - 74;
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ax1, -24);
      ctx.lineTo(ax2 - 12, -24);
      ctx.stroke();
      ctx.fillStyle = '#94A3B8';
      ctx.beginPath();
      ctx.moveTo(ax2, -24);
      ctx.lineTo(ax2 - 20, -36);
      ctx.lineTo(ax2 - 20, -12);
      ctx.closePath();
      ctx.fill();
    }

    nodes.forEach((node, idx) => {
      const nx = xs[idx];
      const color = node.color || '#2563EB';
      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.12)';
      ctx.shadowBlur = 22;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(nx, -24, 58, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = color;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(nx, -24, 54, 0, Math.PI * 2);
      ctx.stroke();

      // Inner glyph
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (node.icon === 'rocket') {
        ctx.beginPath();
        ctx.moveTo(nx, -48);
        ctx.lineTo(nx + 16, -18);
        ctx.lineTo(nx - 16, -18);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(nx - 6, -18, 12, 16);
      } else if (node.icon === 'star') {
        ctx.beginPath();
        for (let s = 0; s < 5; s++) {
          const a1 = -Math.PI / 2 + (s * 2 * Math.PI) / 5;
          const a2 = a1 + Math.PI / 5;
          ctx.lineTo(nx + Math.cos(a1) * 22, -24 + Math.sin(a1) * 22);
          ctx.lineTo(nx + Math.cos(a2) * 10, -24 + Math.sin(a2) * 10);
        }
        ctx.closePath();
        ctx.fill();
      } else if (node.icon === 'check') {
        ctx.beginPath();
        ctx.moveTo(nx - 18, -24);
        ctx.lineTo(nx - 4, -10);
        ctx.lineTo(nx + 20, -38);
        ctx.stroke();
      } else if (node.icon === 'chat') {
        drawRoundedRectPath(ctx, nx - 22, -40, 44, 30, 10);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        [-10, 0, 10].forEach((dx) => {
          ctx.beginPath();
          ctx.arc(nx + dx, -25, 3.2, 0, Math.PI * 2);
          ctx.fill();
        });
      } else {
        // clock / history default
        ctx.beginPath();
        ctx.arc(nx, -24, 21, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(nx, -36);
        ctx.lineTo(nx, -24);
        ctx.lineTo(nx + 11, -18);
        ctx.stroke();
      }

      // Label pill below circle
      ctx.font = `800 28px ${FONT_DISPLAY}`;
      const lw = Math.min(240, Math.max(132, ctx.measureText(node.label).width + 38));
      fillCardWithShadow(ctx, nx - lw / 2, 46, lw, 46, 23, color, 0.08);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.label, nx, 69, lw - 24);
    });
  } else if (props.variant === 'gauge-arc') {
    const val = clamp01((props.data?.value ?? 0.65) + Math.sin(time * 2.4) * 0.015);
    const segments = ['#EF4444', '#F97316', '#FACC15', '#4ADE80', '#16A34A'];
    const cx = 0;
    const cy = 58;
    const radius = 152;
    const segSpan = Math.PI / segments.length;
    const gapRad = 0.04;

    fillCardWithShadow(ctx, -370, -138, 740, 278, 36, '#FFFFFF', 0.09);

    segments.forEach((col, i) => {
      const a0 = Math.PI + i * segSpan + gapRad / 2;
      const a1 = Math.PI + (i + 1) * segSpan - gapRad / 2;
      ctx.strokeStyle = col;
      ctx.lineWidth = 34;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.arc(cx, cy, radius, a0, a1);
      ctx.stroke();
    });

    // Indicator dot along arc
    const needleAngle = Math.PI + val * Math.PI;
    const dotX = cx + Math.cos(needleAngle) * radius;
    const dotY = cy + Math.sin(needleAngle) * radius;
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.25)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(dotX, dotY, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#0F172A';
    ctx.stroke();
    ctx.restore();

    // Friendly emoji face inside arc
    ctx.fillStyle = val < 0.35 ? '#FECACA' : val > 0.65 ? '#BBF7D0' : '#FEF08A';
    ctx.beginPath();
    ctx.arc(0, 24, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.arc(-18, 16, 5.5, 0, Math.PI * 2);
    ctx.arc(18, 16, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (val < 0.35) {
      ctx.arc(0, 48, 16, 1.15 * Math.PI, 1.85 * Math.PI);
    } else if (val > 0.6) {
      ctx.arc(0, 26, 20, 0.15 * Math.PI, 0.85 * Math.PI);
    } else {
      ctx.moveTo(-16, 36);
      ctx.lineTo(16, 36);
    }
    ctx.stroke();

    const statusText = props.data?.subtitle || 'Good & Polite';
    ctx.font = `700 28px ${FONT_SANS}`;
    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(statusText, 0, 106, 480);
  } else if (props.variant === 'timeline-track') {
    const progress = clamp01(props.data?.value ?? 0.68);
    const labels =
      props.data?.labels && props.data.labels.length >= 2
        ? props.data.labels.slice(0, 3)
        : ['Early', 'On time', 'Too late'];

    fillCardWithShadow(ctx, -430, -104, 860, 208, 34, '#FFFFFF', 0.09);

    // Track line
    const x0 = -320;
    const x1 = 320;
    const trackY = -20;
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, trackY);
    ctx.lineTo(x1, trackY);
    ctx.stroke();

    // Active progress fill
    const activeX = x0 + (x1 - x0) * progress;
    const grad = ctx.createLinearGradient(x0, 0, x1, 0);
    grad.addColorStop(0, '#3B82F6');
    grad.addColorStop(1, '#10B981');
    ctx.strokeStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x0, trackY);
    ctx.lineTo(activeX, trackY);
    ctx.stroke();

    // Start marker & Finish Flag
    ctx.fillStyle = '#3B82F6';
    ctx.beginPath();
    ctx.arc(x0, trackY, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x1, trackY + 6);
    ctx.lineTo(x1, trackY - 44);
    ctx.stroke();
    ctx.fillStyle = '#F59E0B';
    drawRoundedRectPath(ctx, x1, trackY - 44, 34, 22, 4);
    ctx.fill();

    // Moving runner dot
    ctx.save();
    ctx.shadowColor = 'rgba(16, 185, 129, 0.45)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#10B981';
    ctx.beginPath();
    ctx.arc(activeX, trackY, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(activeX, trackY, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Milestone labels
    const lxs = labels.length === 2 ? [-200, 200] : [-270, 0, 270];
    const pillW = labels.length === 2 ? 320 : 236;
    labels.forEach((lbl, i) => {
      const lx = lxs[i];
      const isCurrent = Math.abs(progress - i / Math.max(1, labels.length - 1)) < 0.35;
      ctx.font = `700 24px ${FONT_SANS}`;
      const lines = wrapTextLines(ctx, lbl, pillW - 24).slice(0, 2);
      const pillH = lines.length > 1 ? 66 : 50;
      ctx.fillStyle = isCurrent ? '#DCFCE7' : '#F1F5F9';
      drawRoundedRectPath(ctx, lx - pillW / 2, 24, pillW, pillH, 20);
      ctx.fill();
      ctx.fillStyle = isCurrent ? '#15803D' : '#334155';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const ly = 24 + pillH / 2 - ((lines.length - 1) * 26) / 2;
      lines.forEach((ln, li) => ctx.fillText(ln, lx, ly + li * 26));
    });
  } else if (props.variant === 'checklist-card') {
    const items =
      props.data?.checklist && props.data.checklist.length > 0
        ? props.data.checklist.slice(0, 4)
        : [
            { text: 'You are right.', ok: true },
            { text: 'We are on time.', ok: true },
            { text: 'They are here.', ok: true },
          ];
    const rowH = 66;
    const cardH = 74 + items.length * rowH;
    const cardW = 840;
    const topY = -cardH / 2;

    fillCardWithShadow(ctx, -cardW / 2, topY, cardW, cardH, 34, '#FFFFFF', 0.09);

    ctx.font = `700 24px ${FONT_SANS}`;
    ctx.fillStyle = '#64748B';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(props.data?.title || 'Checklist', 0, topY + 34);

    items.forEach((item, idx) => {
      const ry = topY + 80 + idx * rowH;
      const isOk = item.ok !== false;
      ctx.fillStyle = isOk ? '#F0FDF4' : '#FEF2F2';
      drawRoundedRectPath(ctx, -cardW / 2 + 28, ry - 24, cardW - 56, 52, 18);
      ctx.fill();

      // Check or Cross circle
      const bx = -cardW / 2 + 64;
      ctx.fillStyle = isOk ? '#16A34A' : '#DC2626';
      ctx.beginPath();
      ctx.arc(bx, ry + 2, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      if (isOk) {
        ctx.moveTo(bx - 7, ry + 2);
        ctx.lineTo(bx - 2, ry + 8);
        ctx.lineTo(bx + 8, ry - 5);
      } else {
        ctx.moveTo(bx - 6, ry - 4);
        ctx.lineTo(bx + 6, ry + 8);
        ctx.moveTo(bx + 6, ry - 4);
        ctx.lineTo(bx - 6, ry + 8);
      }
      ctx.stroke();

      ctx.font = `700 30px ${FONT_DISPLAY}`;
      ctx.fillStyle = '#0F172A';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.text, bx + 32, ry + 3, cardW - 140);
    });
  } else if (props.variant === 'dialogue-upgrade') {
    const rows =
      props.data?.upgrades && props.data.upgrades.length > 0
        ? props.data.upgrades.slice(0, 3)
        : [
            { prompt: 'Very good', upgrade: 'Wonderful', badgeColor: '#2563EB' },
            { prompt: 'Very tasty', upgrade: 'Delicious', badgeColor: '#16A34A' },
            { prompt: 'Very nice', upgrade: 'Amazing', badgeColor: '#7C3AED' },
          ];
    const rowH = 82;
    const totalH = rows.length * rowH;
    const startY = -totalH / 2 + rowH / 2;

    rows.forEach((row, idx) => {
      const ry = startY + idx * rowH;
      fillCardWithShadow(ctx, -430, ry - 34, 860, 68, 24, '#FFFFFF', 0.08);

      // Mini avatar
      ctx.fillStyle = '#FDE68A';
      ctx.beginPath();
      ctx.arc(-384, ry, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1E293B';
      ctx.beginPath();
      ctx.arc(-390, ry - 2, 2.5, 0, Math.PI * 2);
      ctx.arc(-378, ry - 2, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Prompt text (auto-fit font size so it never squishes)
      let promptFontPx = 25;
      while (promptFontPx > 19) {
        ctx.font = `600 ${promptFontPx}px ${FONT_SANS}`;
        if (ctx.measureText(row.prompt).width <= 366) break;
        promptFontPx -= 1;
      }
      ctx.fillStyle = '#334155';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(row.prompt, -350, ry + 1, 366);

      // Arrow
      ctx.fillStyle = '#94A3B8';
      ctx.font = `700 28px ${FONT_SANS}`;
      ctx.textAlign = 'center';
      ctx.fillText('→', 42, ry);

      // Upgrade pill
      const bColor = row.badgeColor || '#16A34A';
      ctx.fillStyle = bColor;
      drawRoundedRectPath(ctx, 78, ry - 24, 336, 48, 24);
      ctx.fill();

      let upgFontPx = 25;
      while (upgFontPx > 18) {
        ctx.font = `700 ${upgFontPx}px ${FONT_DISPLAY}`;
        if (ctx.measureText(row.upgrade).width <= 300) break;
        upgFontPx -= 1;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(row.upgrade, 246, ry + 1, 300);
    });
  } else if (props.variant === 'clock-face') {
    const hour = props.data?.timeHour ?? 8;
    const minute = props.data?.timeMinute ?? 20;
    const formula = props.data?.formula || `${hour}:${String(minute).padStart(2, '0')}`;
    const sub = props.data?.subtitle || 'Use "past" / "to"';

    // Analog clock on left
    const cx = -165;
    const cy = 0;
    const r = 114;
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.12)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Shaded minute sector
    const startAng = -Math.PI / 2;
    const minAng = startAng + (minute / 60) * Math.PI * 2;
    if (minute > 0) {
      ctx.fillStyle = 'rgba(59, 130, 246, 0.16)';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r - 12, startAng, minAng);
      ctx.closePath();
      ctx.fill();
    }

    // 12 hour dots
    for (let h = 0; h < 12; h++) {
      const a = -Math.PI / 2 + (h / 12) * Math.PI * 2;
      ctx.fillStyle = h % 3 === 0 ? '#1E293B' : '#94A3B8';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * (r - 18), cy + Math.sin(a) * (r - 18), h % 3 === 0 ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hour & Minute hands
    const hourAng = -Math.PI / 2 + (((hour % 12) + minute / 60) / 12) * Math.PI * 2;
    ctx.strokeStyle = '#0F172A';
    ctx.lineCap = 'round';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(hourAng) * 58, cy + Math.sin(hourAng) * 58);
    ctx.stroke();

    ctx.strokeStyle = '#2563EB';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(minAng) * 86, cy + Math.sin(minAng) * 86);
    ctx.stroke();

    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fill();

    // Right readout card
    fillCardWithShadow(ctx, -10, -86, 390, 172, 32, '#FFFFFF', 0.09);
    ctx.font = `800 50px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#2563EB';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(formula, 185, -18, 350);
    ctx.font = `600 28px ${FONT_SANS}`;
    ctx.fillStyle = '#475569';
    ctx.fillText(sub, 185, 42, 350);
  } else if (props.variant === 'spatial-boxes') {
    const boxes =
      props.data?.boxes && props.data.boxes.length >= 2
        ? props.data.boxes.slice(0, 3)
        : [
            { title: 'AT', subtitle: 'point', icon: 'dot' as const, accent: '#2563EB' },
            { title: 'ON', subtitle: 'surface', icon: 'surface' as const, accent: '#16A34A' },
            { title: 'IN', subtitle: 'space', icon: 'cube' as const, accent: '#7C3AED' },
          ];
    const gap = 24;
    const bw = boxes.length === 2 ? 360 : 276;
    const totalW = boxes.length * bw + (boxes.length - 1) * gap;
    const startX = -totalW / 2;

    boxes.forEach((box, idx) => {
      const bx = startX + idx * (bw + gap) + bw / 2;
      const accent = box.accent || '#2563EB';
      fillCardWithShadow(ctx, bx - bw / 2, -108, bw, 216, 30, '#FFFFFF', 0.09);

      // Icon container
      ctx.fillStyle = '#F8FAFC';
      drawRoundedRectPath(ctx, bx - bw / 2 + 20, -90, bw - 40, 88, 20);
      ctx.fill();

      if (box.icon === 'surface') {
        ctx.fillStyle = '#CBD5E1';
        drawRoundedRectPath(ctx, bx - 44, -40, 88, 16, 8);
        ctx.fill();
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(bx, -52, 14, 0, Math.PI * 2);
        ctx.fill();
      } else if (box.icon === 'cube') {
        ctx.strokeStyle = accent;
        ctx.lineWidth = 4;
        ctx.strokeRect(bx - 26, -68, 52, 46);
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(bx, -45, 11, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(bx, -46, 20, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.font = `800 36px ${FONT_DISPLAY}`;
      ctx.fillStyle = accent;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(box.title, bx, 34, bw - 36);

      if (box.subtitle) {
        ctx.font = `600 24px ${FONT_SANS}`;
        ctx.fillStyle = '#64748B';
        ctx.fillText(box.subtitle, bx, 76, bw - 36);
      }
    });
  } else if (props.variant === 'cartoon-host') {
    drawCartoonHostCharacter(ctx, time, cues, props.data, hostContext);
  } else if (props.variant === 'avatar-speech') {
    const speech = props.data?.speechText || 'Could I have some water, please?';
    const reaction = props.data?.reactionText || 'Polite!';
    const lip = computeSpeechLipSyncState(cues, time);

    // Modern speaker avatar on left with smooth speech lip-sync + natural blink
    ctx.save();
    ctx.fillStyle = '#DBEAFE';
    ctx.beginPath();
    ctx.arc(-295, 10, 86, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawCharacterAvatar(ctx, {
      x: -295,
      y: 2,
      shirtColor: '#2563EB',
      hairColor: '#1E293B',
      hairStyle: 'side',
      expression: reaction.includes('blunt') ? 'curious' : 'smile',
      scale: 0.92,
      lipSync: lip,
    });

    // Speech bubble on right
    fillCardWithShadow(ctx, -185, -86, 585, 152, 34, '#FFFFFF', 0.09);
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(-185, -18);
    ctx.lineTo(-218, 4);
    ctx.lineTo(-185, 20);
    ctx.closePath();
    ctx.fill();

    ctx.font = `700 34px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const lines = wrapTextLines(ctx, speech, 520).slice(0, 2);
    const lh = 44;
    const sy = -10 - ((lines.length - 1) * lh) / 2;
    lines.forEach((ln, i) => ctx.fillText(ln, -148, sy + i * lh, 520));

    // Reaction pill
    ctx.font = `700 22px ${FONT_SANS}`;
    const rw = Math.min(240, Math.max(120, ctx.measureText(reaction).width + 38));
    fillCardWithShadow(ctx, 400 - rw - 16, 46, rw, 42, 21, '#4F46E5', 0.08);
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(reaction, 400 - rw / 2 - 16, 67, rw - 24);
  } else if (props.variant === 'phrase-icon-split') {
    const nodes = (props.data?.nodes ?? []).slice(0, 3);
    const quote = props.data?.speechText || 'I see TV every';
    const chip = (props.data?.highlightWord || 'night.').replace(/["“”]/g, '');
    const contextRule = props.data?.subtitle || props.data?.title || 'Context & meaning';
    const iconKind = props.data?.sceneIcon || 'tv';

    // 1. Cohesive integrated summary card on top (rule breakdown + context line)
    fillCardWithShadow(ctx, -420, -214, 840, 168, 30, '#FFFFFF', 0.09);
    ctx.save();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 2;
    drawRoundedRectPath(ctx, -420, -214, 840, 168, 30);
    ctx.stroke();
    ctx.restore();

    if (nodes.length >= 2) {
      const slotW = 760 / nodes.length;
      nodes.forEach((node, i) => {
        const nx = -380 + i * slotW + slotW / 2;
        ctx.fillStyle = '#F8FAFC';
        drawRoundedRectPath(ctx, nx - slotW * 0.42, -198, slotW * 0.84, 72, 18);
        ctx.fill();
        ctx.font = `800 26px ${FONT_DISPLAY}`;
        ctx.fillStyle = node.color || '#334155';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.label, nx, -172, slotW * 0.78);
        if (node.sublabel) {
          ctx.font = `600 18px ${FONT_SANS}`;
          ctx.fillStyle = '#64748B';
          ctx.fillText(node.sublabel, nx, -142, slotW * 0.78);
        }
        if (i < nodes.length - 1) {
          ctx.fillStyle = '#94A3B8';
          ctx.font = `700 22px ${FONT_SANS}`;
          ctx.fillText('→', nx + slotW / 2, -162);
        }
      });
    } else {
      ctx.font = `800 28px ${FONT_DISPLAY}`;
      ctx.fillStyle = '#1E293B';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(props.data?.title || 'KEY CONTRAST', 0, -162, 760);
    }

    // Thin divider + fitted context line (never squished!)
    ctx.strokeStyle = '#EEF2F7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-388, -112);
    ctx.lineTo(388, -112);
    ctx.stroke();

    const fittedRule = fitWrappedTextBlock(ctx, contextRule, 760, 48, {
      fontWeight: 700,
      fontFamily: FONT_DISPLAY,
      maxFontSize: 28,
      minFontSize: 18,
      maxLines: 1,
    });
    ctx.font = `700 ${fittedRule.fontSize}px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fittedRule.lines[0] ?? contextRule, 0, -79, 760);

    // 2. Large crisp quote line
    const fittedQuote = fitWrappedTextBlock(ctx, quote, 800, 74, {
      fontWeight: 800,
      fontFamily: FONT_DISPLAY,
      maxFontSize: 48,
      minFontSize: 28,
      maxLines: 2,
      lineHeightRatio: 1.18,
    });
    ctx.font = `800 ${fittedQuote.fontSize}px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const qBaseY = fittedQuote.lines.length > 1 ? -4 : 6;
    fittedQuote.lines.forEach((ln, li) => {
      ctx.fillText(
        ln,
        0,
        qBaseY - ((fittedQuote.lines.length - 1) * fittedQuote.lineHeight) / 2 + li * fittedQuote.lineHeight,
        800,
      );
    });

    // 3. Framed rounded icon tile + sleek emphasis chip pill side-by-side / stacked cleanly
    fillCardWithShadow(ctx, -186, 56, 152, 134, 30, '#FFFFFF', 0.11);
    ctx.save();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 2.5;
    drawRoundedRectPath(ctx, -186, 56, 152, 134, 30);
    ctx.stroke();
    ctx.translate(-110, 123);
    ctx.scale(0.84, 0.84);
    drawSceneIcon(ctx, iconKind);
    ctx.restore();

    ctx.font = `800 34px ${FONT_DISPLAY}`;
    const chipW = Math.min(340, Math.max(180, ctx.measureText(chip).width + 64));
    fillCardWithShadow(ctx, 18, 88, chipW, 70, 35, '#EEF2FF', 0.08);
    ctx.strokeStyle = '#C7D2FE';
    ctx.lineWidth = 2.5;
    drawRoundedRectPath(ctx, 18, 88, chipW, 70, 35);
    ctx.stroke();
    ctx.fillStyle = '#4338CA';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(chip, 18 + chipW / 2, 123, chipW - 28);
  } else if (props.variant === 'trio-icon-cards') {
    const defaultNodes = [
      { label: 'Look', sublabel: 'on purpose', sceneIcon: 'eye' as IllustrationSceneIcon, color: '#2563EB' },
      { label: 'See', sublabel: 'automatic', sceneIcon: 'glasses' as IllustrationSceneIcon, color: '#64748B' },
      { label: 'Watch', sublabel: 'moving', sceneIcon: 'tv' as IllustrationSceneIcon, color: '#D97706' },
    ];
    const nodes =
      props.data?.nodes && props.data.nodes.length >= 2
        ? props.data.nodes.slice(0, 3)
        : defaultNodes;
    const gap = 22;
    const cw = nodes.length === 2 ? 360 : 264;
    const ch = 250;
    const startX = -((nodes.length * cw + (nodes.length - 1) * gap) / 2);

    nodes.forEach((node, idx) => {
      const stag = computeStaggerItemState(elElapsed, idx, 0.09, 0.36);
      if (!stag.visible) return;
      const cx = startX + idx * (cw + gap) + cw / 2;
      const accent = node.color || defaultNodes[idx % 3].color;
      const nodeIcon =
        node.sceneIcon ||
        (idx === 0 ? 'eye' : idx === 1 ? 'glasses' : 'tv');

      ctx.save();
      ctx.globalAlpha *= stag.opacity;
      ctx.translate(cx, stag.translateY);
      ctx.scale(stag.scale, stag.scale);

      fillCardWithShadow(ctx, -cw / 2, -ch / 2, cw, ch, 32, '#FFFFFF', 0.1);
      ctx.strokeStyle = hexToRgba(accent, 0.35);
      ctx.lineWidth = 3;
      drawRoundedRectPath(ctx, -cw / 2, -ch / 2, cw, ch, 32);
      ctx.stroke();

      // Tinted icon well
      ctx.fillStyle = hexToRgba(accent, 0.08);
      drawRoundedRectPath(ctx, -cw / 2 + 18, -ch / 2 + 18, cw - 36, 114, 22);
      ctx.fill();
      ctx.save();
      ctx.translate(0, -ch / 2 + 75);
      ctx.scale(0.68, 0.68);
      drawSceneIcon(ctx, nodeIcon);
      ctx.restore();

      ctx.font = `800 34px ${FONT_DISPLAY}`;
      ctx.fillStyle = accent;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.label, 0, 42, cw - 28);

      if (node.sublabel) {
        ctx.font = `600 22px ${FONT_SANS}`;
        ctx.fillStyle = '#64748B';
        ctx.fillText(node.sublabel, 0, 86, cw - 28);
      }
      ctx.restore();
    });
  } else if (props.variant === 'contrast-pair-cards') {
    const labels =
      props.data?.labels && props.data.labels.length >= 2
        ? props.data.labels.slice(0, 2)
        : ['Look', 'Watch'];
    const nodes = props.data?.nodes?.slice(0, 2);
    const leftTitle = nodes?.[0]?.label || labels[0];
    const rightTitle = nodes?.[1]?.label || labels[1];
    const leftSub = nodes?.[0]?.sublabel || '';
    const rightSub = nodes?.[1]?.sublabel || '';
    const leftColor = nodes?.[0]?.color || '#2563EB';
    const rightColor = nodes?.[1]?.color || '#D97706';
    const isSwapX = (props.data?.formula || 'cross').toLowerCase() !== 'arrow';

    const cw = 326;
    const ch = 224;
    const leftCx = -235;
    const rightCx = 235;

    // Left Card
    const s0 = computeStaggerItemState(elElapsed, 0, 0, 0.34);
    if (s0.visible) {
      ctx.save();
      ctx.globalAlpha *= s0.opacity;
      ctx.translate(leftCx, s0.translateY);
      ctx.scale(s0.scale, s0.scale);
      fillCardWithShadow(ctx, -cw / 2, -ch / 2, cw, ch, 34, '#FFFFFF', 0.1);
      ctx.strokeStyle = leftColor;
      ctx.lineWidth = 4;
      drawRoundedRectPath(ctx, -cw / 2, -ch / 2, cw, ch, 34);
      ctx.stroke();
      const fittedL = fitWrappedTextBlock(ctx, leftTitle, cw - 40, 120, {
        fontWeight: 800,
        maxFontSize: 52,
        minFontSize: 28,
        maxLines: 2,
      });
      ctx.font = `800 ${fittedL.fontSize}px ${FONT_DISPLAY}`;
      ctx.fillStyle = leftColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lyBase = leftSub ? -18 : 0;
      fittedL.lines.forEach((ln, li) =>
        ctx.fillText(ln, 0, lyBase - ((fittedL.lines.length - 1) * fittedL.lineHeight) / 2 + li * fittedL.lineHeight, cw - 36),
      );
      if (leftSub) {
        ctx.font = `600 22px ${FONT_SANS}`;
        ctx.fillStyle = '#64748B';
        ctx.fillText(leftSub, 0, 56, cw - 36);
      }
      ctx.restore();
    }

    // Right Card
    const s1 = computeStaggerItemState(elElapsed, 1, 0.12, 0.34);
    if (s1.visible) {
      ctx.save();
      ctx.globalAlpha *= s1.opacity;
      ctx.translate(rightCx, s1.translateY);
      ctx.scale(s1.scale, s1.scale);
      fillCardWithShadow(ctx, -cw / 2, -ch / 2, cw, ch, 34, '#FFFFFF', 0.1);
      ctx.strokeStyle = rightColor;
      ctx.lineWidth = 4;
      drawRoundedRectPath(ctx, -cw / 2, -ch / 2, cw, ch, 34);
      ctx.stroke();
      const fittedR = fitWrappedTextBlock(ctx, rightTitle, cw - 40, 120, {
        fontWeight: 800,
        maxFontSize: 52,
        minFontSize: 28,
        maxLines: 2,
      });
      ctx.font = `800 ${fittedR.fontSize}px ${FONT_DISPLAY}`;
      ctx.fillStyle = rightColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const ryBase = rightSub ? -18 : 0;
      fittedR.lines.forEach((ln, li) =>
        ctx.fillText(ln, 0, ryBase - ((fittedR.lines.length - 1) * fittedR.lineHeight) / 2 + li * fittedR.lineHeight, cw - 36),
      );
      if (rightSub) {
        ctx.font = `600 22px ${FONT_SANS}`;
        ctx.fillStyle = '#64748B';
        ctx.fillText(rightSub, 0, 56, cw - 36);
      }
      ctx.restore();
    }

    // Central swap-cross or arrow badge
    ctx.save();
    if (isSwapX) {
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, 44, -Math.PI * 0.85, -Math.PI * 0.15);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 44, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
    fillCardWithShadow(ctx, -28, -28, 56, 56, 28, isSwapX ? '#DC2626' : '#16A34A', 0.14);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (isSwapX) {
      ctx.moveTo(-10, -10);
      ctx.lineTo(10, 10);
      ctx.moveTo(10, -10);
      ctx.lineTo(-10, 10);
    } else {
      ctx.moveTo(-12, 0);
      ctx.lineTo(12, 0);
      ctx.moveTo(2, -10);
      ctx.lineTo(12, 0);
      ctx.lineTo(2, 10);
    }
    ctx.stroke();
    ctx.restore();
  } else if (props.variant === 'quiz-fill-blank') {
    const pillTitle = props.data?.title || 'Question';
    const promptText = props.data?.speechText || "I can't ______ without my glasses.";
    const iconKind = props.data?.sceneIcon || 'glasses';

    fillCardWithShadow(ctx, -420, -142, 840, 284, 34, '#FFFFFF', 0.11);
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 2;
    drawRoundedRectPath(ctx, -420, -142, 840, 284, 34);
    ctx.stroke();

    // Top Question Pill
    ctx.font = `800 22px ${FONT_SANS}`;
    const qPillW = Math.min(280, Math.max(146, ctx.measureText(pillTitle).width + 44));
    ctx.fillStyle = '#EEF2FF';
    drawRoundedRectPath(ctx, -qPillW / 2, -118, qPillW, 42, 21);
    ctx.fill();
    ctx.fillStyle = '#4338CA';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pillTitle, 0, -97, qPillW - 20);

    // Fill-in-the-blank prompt line(s)
    const fittedQ = fitWrappedTextBlock(ctx, promptText, 760, 88, {
      fontWeight: 700,
      fontFamily: FONT_DISPLAY,
      maxFontSize: 34,
      minFontSize: 22,
      maxLines: 2,
      lineHeightRatio: 1.24,
    });
    ctx.font = `700 ${fittedQ.fontSize}px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#0F172A';
    const qStartY = -28 - ((fittedQ.lines.length - 1) * fittedQ.lineHeight) / 2;
    fittedQ.lines.forEach((ln, li) => {
      const ly = qStartY + li * fittedQ.lineHeight;
      ctx.fillText(ln, 0, ly, 760);
      // Highlight blank underline nicely if ______ present
      const blankMatch = ln.match(/_{3,}/);
      if (blankMatch && blankMatch.index !== undefined) {
        const lineW = ctx.measureText(ln).width;
        const preW = ctx.measureText(ln.slice(0, blankMatch.index)).width;
        const bW = ctx.measureText(blankMatch[0]).width;
        const bx = -lineW / 2 + preW;
        ctx.strokeStyle = '#4F46E5';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(bx, ly + fittedQ.fontSize * 0.45);
        ctx.lineTo(bx + bW, ly + fittedQ.fontSize * 0.45);
        ctx.stroke();
      }
    });

    // Crisp vector icon below prompt
    ctx.fillStyle = '#F8FAFC';
    drawRoundedRectPath(ctx, -96, 30, 192, 92, 24);
    ctx.fill();
    ctx.save();
    ctx.translate(0, 76);
    ctx.scale(0.68, 0.68);
    drawSceneIcon(ctx, iconKind);
    ctx.restore();
  } else if (props.variant === 'airport-travel') {
    fillCardWithShadow(ctx, -370, -110, 740, 220, 34, '#FFFFFF', 0.09);
    ctx.fillStyle = '#2563EB';
    drawRoundedRectPath(ctx, -370, -110, 740, 52, 26);
    ctx.fill();
    ctx.font = `800 24px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('BOARDING PASS', -334, -84);
    ctx.textAlign = 'right';
    ctx.fillText('GATE B12', 334, -84);

    ctx.save();
    ctx.translate(-210, 22);
    ctx.scale(0.85, 0.85);
    drawSceneIcon(ctx, 'airplane');
    ctx.restore();

    ctx.font = `800 34px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'left';
    ctx.fillText(props.data?.title || 'At the Airport', -100, -4, 420);
    ctx.font = `600 24px ${FONT_SANS}`;
    ctx.fillStyle = '#64748B';
    ctx.fillText(props.data?.subtitle || 'Check-in · Boarding · Window seat', -100, 44, 420);
  } else if (props.variant === 'restaurant-order') {
    fillCardWithShadow(ctx, -370, -112, 740, 224, 34, '#FFFDF7', 0.09);
    ctx.save();
    ctx.translate(-220, 0);
    drawSceneIcon(ctx, 'menu');
    ctx.restore();
    ctx.font = `800 34px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#9A3412';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(props.data?.title || 'Ordering Food', -105, -24, 430);
    ctx.font = `600 25px ${FONT_SANS}`;
    ctx.fillStyle = '#475569';
    ctx.fillText(props.data?.speechText || '"Could I see the menu, please?"', -105, 28, 430);
  } else if (props.variant === 'shopping-price') {
    fillCardWithShadow(ctx, -370, -112, 740, 224, 34, '#FFFFFF', 0.09);
    ctx.save();
    ctx.translate(-225, 0);
    drawSceneIcon(ctx, 'shopping-bag');
    ctx.restore();
    ctx.save();
    ctx.translate(250, -32);
    ctx.scale(0.8, 0.8);
    drawSceneIcon(ctx, 'price-tag');
    ctx.restore();
    ctx.font = `800 34px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#BE185D';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(props.data?.title || 'Shopping & Price', -110, -14, 310);
    ctx.font = `600 24px ${FONT_SANS}`;
    ctx.fillStyle = '#475569';
    ctx.fillText(props.data?.speechText || '"Can I try this on?"', -110, 34, 430);
  } else if (props.variant === 'doctor-health') {
    fillCardWithShadow(ctx, -370, -110, 740, 220, 34, '#FFFFFF', 0.09);
    ctx.save();
    ctx.translate(-220, 0);
    drawSceneIcon(ctx, 'stethoscope');
    ctx.restore();
    ctx.font = `800 34px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#DC2626';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(props.data?.title || 'Health & Clinic', -110, -20, 440);
    ctx.font = `600 25px ${FONT_SANS}`;
    ctx.fillStyle = '#475569';
    ctx.fillText(props.data?.speechText || '"I have a slight headache."', -110, 30, 440);
  } else if (props.variant === 'weather-forecast') {
    fillCardWithShadow(ctx, -370, -110, 740, 220, 34, '#F0F9FF', 0.09);
    ctx.save();
    ctx.translate(-220, 0);
    drawSceneIcon(ctx, props.data?.sceneIcon || 'sun');
    ctx.restore();
    ctx.font = `800 34px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#0369A1';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(props.data?.title || 'Weather Forecast', -110, -20, 440);
    ctx.font = `600 25px ${FONT_SANS}`;
    ctx.fillStyle = '#334155';
    ctx.fillText(props.data?.speechText || "It's chilly & sunny outside", -110, 30, 440);
  } else if (props.variant === 'study-desk') {
    fillCardWithShadow(ctx, -370, -110, 740, 220, 34, '#FFFFFF', 0.09);
    ctx.save();
    ctx.translate(-225, 0);
    drawSceneIcon(ctx, 'book');
    ctx.restore();
    ctx.save();
    ctx.translate(275, -18);
    ctx.scale(0.68, 0.68);
    drawSceneIcon(ctx, 'pencil');
    ctx.restore();
    ctx.font = `800 34px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#3730A3';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(props.data?.title || 'Study & Practice', -110, -20, 340);
    ctx.font = `600 24px ${FONT_SANS}`;
    ctx.fillStyle = '#475569';
    ctx.fillText(props.data?.speechText || 'Review notes every day', -110, 30, 400);
  } else if (props.variant === 'commute-transport') {
    fillCardWithShadow(ctx, -370, -110, 740, 220, 34, '#FFFFFF', 0.09);
    ctx.save();
    ctx.translate(-210, -6);
    drawSceneIcon(ctx, props.data?.sceneIcon === 'car' ? 'car' : 'bus');
    ctx.restore();
    ctx.font = `800 34px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(props.data?.title || 'Daily Commute', -100, -20, 430);
    ctx.font = `600 24px ${FONT_SANS}`;
    ctx.fillStyle = '#475569';
    ctx.fillText(props.data?.speechText || 'Catch the bus on time', -100, 30, 430);
  } else if (props.variant === 'home-routine') {
    fillCardWithShadow(ctx, -370, -110, 740, 220, 34, '#FFFBEB', 0.09);
    ctx.save();
    ctx.translate(-215, 0);
    drawSceneIcon(ctx, 'home');
    ctx.restore();
    ctx.font = `800 34px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#92400E';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(props.data?.title || 'Home Routine', -105, -20, 430);
    ctx.font = `600 24px ${FONT_SANS}`;
    ctx.fillStyle = '#475569';
    ctx.fillText(props.data?.speechText || 'Everyday daily habits', -105, 30, 430);
  } else if (props.variant === 'gym-fitness') {
    fillCardWithShadow(ctx, -370, -110, 740, 220, 34, '#FFFFFF', 0.09);
    ctx.save();
    ctx.translate(-215, 0);
    drawSceneIcon(ctx, 'dumbbell');
    ctx.restore();
    ctx.font = `800 34px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#1D4ED8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(props.data?.title || 'Workout & Habit', -105, -20, 430);
    ctx.font = `600 24px ${FONT_SANS}`;
    ctx.fillStyle = '#475569';
    ctx.fillText(props.data?.speechText || 'Stay consistent daily', -105, 30, 430);
  } else if (props.variant === 'phone-call') {
    fillCardWithShadow(ctx, -370, -110, 740, 220, 34, '#0F172A', 0.22);
    ctx.save();
    ctx.translate(-220, 0);
    ctx.scale(0.75, 0.75);
    drawSceneIcon(ctx, 'phone');
    ctx.restore();
    ctx.font = `800 34px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#38BDF8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(props.data?.title || 'Incoming Call', -115, -20, 440);
    ctx.font = `600 24px ${FONT_SANS}`;
    ctx.fillStyle = '#CBD5E1';
    ctx.fillText(props.data?.speechText || '"Hold on, I’ll call you back"', -115, 30, 440);
  } else if (props.variant === 'tense-timeline') {
    const val = clamp01(props.data?.value ?? 0.5);
    const labels = props.data?.labels?.slice(0, 3) ?? ['Past', 'Present', 'Future'];
    fillCardWithShadow(ctx, -430, -112, 860, 224, 34, '#FFFFFF', 0.09);
    ctx.font = `700 22px ${FONT_SANS}`;
    ctx.fillStyle = '#64748B';
    ctx.textAlign = 'center';
    ctx.fillText(props.data?.formula || 'TIME AXIS', 0, -76);
    const x0 = -300;
    const x1 = 300;
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, -14);
    ctx.lineTo(x1, -14);
    ctx.stroke();
    const xs = [-260, 0, 260];
    const cols = ['#64748B', '#2563EB', '#7C3AED'];
    labels.forEach((lbl, i) => {
      const mx = xs[i];
      const active = Math.abs(val - i * 0.5) < 0.26;
      ctx.fillStyle = active ? cols[i] : '#E2E8F0';
      ctx.beginPath();
      ctx.arc(mx, -14, active ? 20 : 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = active ? cols[i] : '#475569';
      ctx.font = `${active ? 800 : 600} 26px ${FONT_DISPLAY}`;
      ctx.fillText(lbl, mx, 46, 200);
    });
  } else if (props.variant === 'degree-scale') {
    const steps = props.data?.labels?.slice(0, 3) ?? ['Basic', 'Stronger', 'Native!'];
    const cols = ['#64748B', '#0284C7', '#EAB308'];
    const useStacked = steps.some((s) => s.length > 14);
    if (useStacked) {
      fillCardWithShadow(ctx, -430, -138, 860, 276, 30, '#FFFFFF', 0.09);
      ctx.font = `800 26px ${FONT_SANS}`;
      ctx.fillStyle = '#334155';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(props.data?.title || 'Key Points', 0, -104, 780);
      steps.forEach((st, i) => {
        const ry = -62 + i * 64;
        const w = 360 + i * 210;
        ctx.fillStyle = cols[i % cols.length];
        drawRoundedRectPath(ctx, -w / 2, ry, w, 52, 16);
        ctx.fill();
        const fitted = fitWrappedTextBlock(ctx, st, w - 28, 44, {
          fontWeight: 800,
          maxFontSize: 26,
          minFontSize: 17,
          maxLines: 1,
        });
        ctx.font = `800 ${fitted.fontSize}px ${FONT_DISPLAY}`;
        ctx.fillStyle = i === 2 ? '#0F172A' : '#FFFFFF';
        ctx.fillText(fitted.lines[0] ?? st, 0, ry + 27, w - 24);
      });
    } else {
      fillCardWithShadow(ctx, -430, -124, 860, 248, 34, '#FFFFFF', 0.09);
      ctx.font = `800 26px ${FONT_SANS}`;
      ctx.fillStyle = '#334155';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(props.data?.title || 'Intensity Scale', 0, -88, 780);
      steps.forEach((st, i) => {
        const bx = -265 + i * 265;
        const barH = 56 + i * 28;
        ctx.fillStyle = cols[i % cols.length];
        drawRoundedRectPath(ctx, bx - 112, 74 - barH, 224, barH, 16);
        ctx.fill();
        const fitted = fitWrappedTextBlock(ctx, st, 200, Math.max(36, barH - 12), {
          fontWeight: 800,
          maxFontSize: 26,
          minFontSize: 16,
          maxLines: 2,
          lineHeightRatio: 1.12,
        });
        ctx.font = `800 ${fitted.fontSize}px ${FONT_DISPLAY}`;
        ctx.fillStyle = i === 2 ? '#0F172A' : '#FFFFFF';
        const ly = 74 - barH / 2 - ((fitted.lines.length - 1) * fitted.lineHeight) / 2;
        fitted.lines.forEach((ln, li) => ctx.fillText(ln, bx, ly + li * fitted.lineHeight, 204));
      });
    }
  } else if (props.variant === 'phrasal-split') {
    const parts = props.data?.labels?.slice(0, 2) ?? ['Verb', 'Particle'];
    fillCardWithShadow(ctx, -430, -116, 860, 232, 34, '#FFFFFF', 0.09);
    fillCardWithShadow(ctx, -370, -54, 240, 86, 24, '#DBEAFE', 0.05);
    ctx.font = `800 32px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#1D4ED8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const p0Lines = wrapTextLines(ctx, parts[0], 210).slice(0, 2);
    p0Lines.forEach((ln, li) => ctx.fillText(ln, -250, -11 - ((p0Lines.length - 1) * 32) / 2 + li * 32));
    ctx.fillStyle = '#64748B';
    ctx.fillText('+', -90, -11);
    fillCardWithShadow(ctx, -50, -54, 240, 86, 24, '#DCFCE7', 0.05);
    ctx.fillStyle = '#15803D';
    const p1Lines = wrapTextLines(ctx, parts[1], 210).slice(0, 2);
    p1Lines.forEach((ln, li) => ctx.fillText(ln, 70, -11 - ((p1Lines.length - 1) * 32) / 2 + li * 32));
    ctx.fillStyle = '#4F46E5';
    ctx.fillText('=', 228, -11);
    ctx.save();
    ctx.translate(325, -12);
    ctx.scale(0.65, 0.65);
    drawSceneIcon(ctx, props.data?.sceneIcon || 'lightning');
    ctx.restore();
    ctx.font = `700 26px ${FONT_SANS}`;
    ctx.fillStyle = '#475569';
    ctx.fillText(props.data?.formula || 'New meaning!', 0, 74, 780);
  } else if (props.variant === 'idiom-split') {
    fillCardWithShadow(ctx, -430, -116, 860, 232, 34, '#FFFFFF', 0.09);
    ctx.fillStyle = '#FEF2F2';
    drawRoundedRectPath(ctx, -395, -72, 340, 144, 24);
    ctx.fill();
    ctx.font = `700 24px ${FONT_SANS}`;
    ctx.fillStyle = '#DC2626';
    ctx.textAlign = 'center';
    ctx.fillText('LITERAL', -225, -38);
    ctx.font = `800 28px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#7F1D1D';
    const litLines = wrapTextLines(ctx, props.data?.speechText || 'Word for word', 300).slice(0, 2);
    litLines.forEach((ln, li) => ctx.fillText(ln, -225, 16 - ((litLines.length - 1) * 30) / 2 + li * 30));

    ctx.fillStyle = '#64748B';
    ctx.font = `800 34px ${FONT_DISPLAY}`;
    ctx.fillText('≠', 0, 0);

    ctx.fillStyle = '#F0FDF4';
    drawRoundedRectPath(ctx, 55, -72, 340, 144, 24);
    ctx.fill();
    ctx.font = `700 24px ${FONT_SANS}`;
    ctx.fillStyle = '#16A34A';
    ctx.fillText('MEANING', 225, -38);
    ctx.font = `800 28px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#14532D';
    const meanLines = wrapTextLines(ctx, props.data?.subtitle || 'Natural sense', 300).slice(0, 2);
    meanLines.forEach((ln, li) => ctx.fillText(ln, 225, 16 - ((meanLines.length - 1) * 30) / 2 + li * 30));
  } else if (props.variant === 'syllable-stress') {
    const syllables = props.data?.labels?.length ? props.data.labels.slice(0, 4) : ['re', 'CORD'];
    const stressedIdx = Math.min(syllables.length - 1, Math.max(0, Math.round(props.data?.value ?? 1)));
    fillCardWithShadow(ctx, -410, -116, 820, 232, 34, '#FFFFFF', 0.09);
    ctx.font = `700 24px ${FONT_SANS}`;
    ctx.fillStyle = '#64748B';
    ctx.textAlign = 'center';
    ctx.fillText(props.data?.title || 'SYLLABLE STRESS', 0, -76, 760);
    const gap = Math.min(170, Math.floor(720 / Math.max(1, syllables.length)));
    const startX = -((syllables.length - 1) * gap) / 2;
    syllables.forEach((syl, idx) => {
      const sx = startX + idx * gap;
      const isStressed = idx === stressedIdx;
      ctx.fillStyle = isStressed ? '#4F46E5' : '#E2E8F0';
      ctx.beginPath();
      ctx.arc(sx, -12, isStressed ? 42 : 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `${isStressed ? 800 : 700} ${isStressed ? 28 : 24}px ${FONT_DISPLAY}`;
      ctx.fillStyle = isStressed ? '#312E81' : '#475569';
      ctx.fillText(syl, sx, 62, gap - 16);
    });
  } else if (props.variant === 'intonation-curve') {
    const rising = (props.data?.value ?? 0.8) >= 0.5;
    fillCardWithShadow(ctx, -410, -112, 820, 224, 34, '#FFFFFF', 0.09);
    ctx.font = `700 24px ${FONT_SANS}`;
    ctx.fillStyle = '#64748B';
    ctx.textAlign = 'center';
    ctx.fillText(rising ? 'RISING INTONATION ↗' : 'FALLING INTONATION ↘', 0, -74);
    ctx.strokeStyle = rising ? '#2563EB' : '#10B981';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (rising) {
      ctx.moveTo(-260, 40);
      ctx.bezierCurveTo(-60, 36, 80, -34, 260, -40);
    } else {
      ctx.moveTo(-260, -34);
      ctx.bezierCurveTo(-60, -30, 80, 34, 260, 40);
    }
    ctx.stroke();
    ctx.font = `700 28px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#0F172A';
    ctx.fillText(props.data?.speechText || 'Watch the pitch flow!', 0, 74, 760);
  } else if (props.variant === 'bs-alert-tip') {
    // Callout / Alert Banner with left accent stripe, crisp dynamic tag pill & multi-line body
    const titleStr = props.data?.title || 'Key Note';
    const bodyStr = props.data?.speechText || props.data?.subtitle || '';
    const tagStr = (props.data?.highlightWord || props.data?.formula || '').trim();

    ctx.font = `800 34px ${FONT_DISPLAY}`;
    const titleLines = wrapTextLines(ctx, titleStr, 590);
    ctx.font = `600 30px ${FONT_DISPLAY}`;
    const bodyLines = bodyStr ? wrapTextLines(ctx, bodyStr, 590) : [];

    const tagH = tagStr ? 48 : 0;
    const contentH = tagH + titleLines.length * 42 + bodyLines.length * 38 + 52;
    const cardH = Math.max(224, contentH);
    const topY = -cardH / 2;

    fillCardWithShadow(ctx, -430, topY, 860, cardH, 24, '#EFF6FF', 0.08);
    ctx.strokeStyle = '#BFDBFE';
    ctx.lineWidth = 3;
    drawRoundedRectPath(ctx, -430, topY, 860, cardH, 24);
    ctx.stroke();
    // Left accent bar
    ctx.fillStyle = '#2563EB';
    drawRoundedRectPath(ctx, -430, topY, 18, cardH, 9);
    ctx.fill();
    // Icon circle
    ctx.fillStyle = '#DBEAFE';
    ctx.beginPath();
    ctx.arc(-336, 0, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(-336, 0);
    ctx.scale(0.62, 0.62);
    drawSceneIcon(ctx, props.data?.sceneIcon || 'sparkles');
    ctx.restore();

    let cursorY = topY + 30;
    if (tagStr) {
      ctx.font = `800 24px ${FONT_DISPLAY}`;
      const pillW = Math.min(420, Math.max(150, ctx.measureText(tagStr).width + 44));
      ctx.fillStyle = '#2563EB';
      drawRoundedRectPath(ctx, -252, cursorY, pillW, 42, 21);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tagStr, -252 + pillW / 2, cursorY + 21, pillW - 24);
      cursorY += 60;
    } else {
      cursorY += 12;
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `800 34px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#1E3A8A';
    titleLines.forEach((ln) => {
      ctx.fillText(ln, -252, cursorY + 14, 595);
      cursorY += 42;
    });

    if (bodyLines.length > 0) {
      cursorY += 6;
      ctx.font = `600 30px ${FONT_DISPLAY}`;
      ctx.fillStyle = '#334155';
      bodyLines.forEach((ln) => {
        ctx.fillText(ln, -252, cursorY + 14, 595);
        cursorY += 38;
      });
    }
  } else if (props.variant === 'bs-card-header') {
    // Card with Colored Header Bar + Multi-line Body (zero hardcoded English boilerplate)
    const headerStr = props.data?.formula || 'LESSON FOCUS';
    const titleStr = props.data?.title || 'Key Lesson';
    const subStr = props.data?.subtitle || props.data?.speechText || '';

    ctx.font = `800 38px ${FONT_DISPLAY}`;
    const titleLines = wrapTextLines(ctx, titleStr, 600);
    ctx.font = `600 30px ${FONT_DISPLAY}`;
    const subLines = subStr ? wrapTextLines(ctx, subStr, 600) : [];
    const textBlockH = titleLines.length * 46 + (subLines.length > 0 ? 8 + subLines.length * 38 : 0);
    const bodyH = textBlockH + 64;
    const cardH = Math.max(264, 72 + bodyH);
    const topY = -cardH / 2;

    fillCardWithShadow(ctx, -430, topY, 860, cardH, 26, '#FFFFFF', 0.1);
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 2.5;
    drawRoundedRectPath(ctx, -430, topY, 860, cardH, 26);
    ctx.stroke();

    // Top Header
    ctx.fillStyle = '#4F46E5';
    drawRoundedRectPath(ctx, -430, topY, 860, 72, 24);
    ctx.fill();
    ctx.fillRect(-430, topY + 46, 860, 26);
    ctx.font = `800 28px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(headerStr, -396, topY + 36, 540);

    if (props.data?.highlightWord) {
      ctx.font = `700 24px ${FONT_DISPLAY}`;
      const pillW = Math.min(250, Math.max(115, ctx.measureText(props.data.highlightWord).width + 36));
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      drawRoundedRectPath(ctx, 396 - pillW, topY + 17, pillW, 38, 19);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(props.data.highlightWord, 396 - pillW / 2, topY + 36, pillW - 20);
    }

    // Body icon
    const bodyCenterY = topY + 72 + (cardH - 72) / 2;
    ctx.save();
    ctx.translate(-338, bodyCenterY);
    ctx.scale(0.68, 0.68);
    drawSceneIcon(ctx, props.data?.sceneIcon || 'book');
    ctx.restore();

    ctx.textAlign = 'left';
    let by = bodyCenterY - textBlockH / 2 + 22;
    ctx.font = `800 38px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#0F172A';
    titleLines.forEach((ln) => {
      ctx.fillText(ln, -246, by, 606);
      by += 46;
    });
    if (subLines.length > 0) {
      by += 4;
      ctx.font = `600 30px ${FONT_DISPLAY}`;
      ctx.fillStyle = '#475569';
      subLines.forEach((ln) => {
        ctx.fillText(ln, -246, by, 606);
        by += 38;
      });
    }
  } else if (props.variant === 'bs-progress-meter') {
    const targetPct = clamp01(props.data?.value ?? 0.78);
    const fillEase = easeOutQuint(clamp01((time - 0.08) / 0.65));
    const pct = targetPct * fillEase;
    const pctLabel = `${Math.round(targetPct * fillEase * 100)}%`;
    fillCardWithShadow(ctx, -420, -112, 840, 224, 28, '#FFFFFF', 0.09);
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 2;
    drawRoundedRectPath(ctx, -420, -112, 840, 224, 28);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `800 32px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#0F172A';
    ctx.fillText(props.data?.title || 'Progress', -376, -54, 580);

    // % Badge pill on right
    ctx.fillStyle = '#DCFCE7';
    drawRoundedRectPath(ctx, 250, -76, 126, 44, 22);
    ctx.fill();
    ctx.font = `800 26px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#15803D';
    ctx.textAlign = 'center';
    ctx.fillText(pctLabel, 313, -54);

    // Track
    const barX = -376;
    const barW = 752;
    const barY = -8;
    const barH = 42;
    ctx.fillStyle = '#E2E8F0';
    drawRoundedRectPath(ctx, barX, barY, barW, barH, 21);
    ctx.fill();

    const fillW = Math.max(48, barW * pct);
    const grad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
    grad.addColorStop(0, '#0D6EFD');
    grad.addColorStop(1, '#10B981');
    ctx.save();
    drawRoundedRectPath(ctx, barX, barY, fillW, barH, 21);
    ctx.clip();
    ctx.fillStyle = grad;
    ctx.fillRect(barX, barY, fillW, barH);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    const offset = (time * 36) % 36;
    for (let sx = barX - 40 + offset; sx < barX + fillW + 40; sx += 36) {
      ctx.beginPath();
      ctx.moveTo(sx, barY + barH);
      ctx.lineTo(sx + 16, barY);
      ctx.lineTo(sx + 30, barY);
      ctx.lineTo(sx + 14, barY + barH);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.textAlign = 'left';
    ctx.font = `600 24px ${FONT_SANS}`;
    ctx.fillStyle = '#475569';
    ctx.fillText(props.data?.subtitle || '', -376, 68, 740);
  } else if (props.variant === 'bs-toast-notify') {
    // Floating Toast Notification with dynamic header & multi-line body
    fillCardWithShadow(ctx, -400, -120, 800, 240, 26, '#FFFFFF', 0.12);
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2;
    drawRoundedRectPath(ctx, -400, -120, 800, 240, 26);
    ctx.stroke();

    ctx.fillStyle = '#F8FAFC';
    drawRoundedRectPath(ctx, -400, -120, 800, 62, 24);
    ctx.fill();
    ctx.fillRect(-400, -80, 800, 22);
    ctx.fillStyle = '#10B981';
    drawRoundedRectPath(ctx, -366, -102, 28, 28, 8);
    ctx.fill();
    ctx.font = `800 24px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(props.data?.formula || 'KEY TAKEAWAY', -324, -88, 520);
    ctx.font = `700 22px ${FONT_SANS}`;
    ctx.fillStyle = '#059669';
    ctx.textAlign = 'right';
    ctx.fillText(props.data?.highlightWord || '✓', 366, -88);

    ctx.strokeStyle = '#E2E8F0';
    ctx.beginPath();
    ctx.moveTo(-400, -58);
    ctx.lineTo(400, -58);
    ctx.stroke();

    ctx.save();
    ctx.translate(-310, 30);
    ctx.scale(0.6, 0.6);
    drawSceneIcon(ctx, props.data?.sceneIcon || 'chat');
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.font = `800 32px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#0F172A';
    ctx.fillText(props.data?.title || 'Key Phrase', -225, -4, 590);
    const toastBody = fitWrappedTextBlock(
      ctx,
      props.data?.speechText || props.data?.subtitle || '',
      590,
      78,
      { fontWeight: 600, fontFamily: FONT_SANS, maxFontSize: 26, minFontSize: 13, maxLines: 4, lineHeightRatio: 1.2 },
    );
    ctx.font = `600 ${toastBody.fontSize}px ${FONT_SANS}`;
    ctx.fillStyle = '#334155';
    toastBody.lines.forEach((ln, li) => ctx.fillText(ln, -225, 36 + li * toastBody.lineHeight));
  } else if (props.variant === 'bs-list-group') {
    const items = props.data?.labels?.slice(0, 3) ?? [
      'Listen to rhythm',
      'Repeat out loud',
      'Use in context',
    ];
    fillCardWithShadow(ctx, -415, -138, 830, 276, 26, '#FFFFFF', 0.09);
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 2;
    drawRoundedRectPath(ctx, -415, -138, 830, 276, 26);
    ctx.stroke();

    items.forEach((row, i) => {
      const stag = computeStaggerItemState(elElapsed, i, 0.09, 0.34);
      if (!stag.visible) return;
      const ry = -88 + i * 88;
      ctx.save();
      ctx.globalAlpha *= stag.opacity;
      ctx.translate(0, stag.translateY);
      if (i === 1) {
        ctx.fillStyle = '#EFF6FF';
        drawRoundedRectPath(ctx, -400, ry - 36, 800, 72, 16);
        ctx.fill();
      }
      if (i > 0) {
        ctx.strokeStyle = '#F1F5F9';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-395, ry - 44);
        ctx.lineTo(395, ry - 44);
        ctx.stroke();
      }
      ctx.fillStyle = i === 1 ? '#2563EB' : '#64748B';
      ctx.beginPath();
      ctx.arc(-352, ry, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `800 24px ${FONT_DISPLAY}`;
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${i + 1}`, -352, ry + 1);

      ctx.textAlign = 'left';
      const fittedRow = fitWrappedTextBlock(ctx, row, 670, 64, {
        fontWeight: i === 1 ? 800 : 700,
        maxFontSize: 28,
        minFontSize: 14,
        maxLines: 3,
        lineHeightRatio: 1.12,
      });
      ctx.font = `${i === 1 ? 800 : 700} ${fittedRow.fontSize}px ${FONT_DISPLAY}`;
      ctx.fillStyle = i === 1 ? '#1D4ED8' : '#1E293B';
      const ly = ry - ((fittedRow.lines.length - 1) * fittedRow.lineHeight) / 2;
      fittedRow.lines.forEach((ln, li) => ctx.fillText(ln, -308, ly + li * fittedRow.lineHeight));
      ctx.restore();
    });
  } else if (props.variant === 'bs-pricing-tier') {
    const leftTxt = props.data?.labels?.[0] || 'Literal Style';
    const rightTxt = props.data?.labels?.[1] || 'Natural Fluency';

    fillCardWithShadow(ctx, -420, -118, 392, 236, 26, '#FFFFFF', 0.07);
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 2;
    drawRoundedRectPath(ctx, -420, -118, 392, 236, 26);
    ctx.stroke();
    ctx.fillStyle = '#F1F5F9';
    drawRoundedRectPath(ctx, -386, -88, 128, 36, 18);
    ctx.fill();
    ctx.font = `700 20px ${FONT_SANS}`;
    ctx.fillStyle = '#64748B';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BASIC', -322, -70);
    const lFitted = fitWrappedTextBlock(ctx, leftTxt, 340, 86, {
      fontWeight: 800,
      maxFontSize: 30,
      minFontSize: 14,
      maxLines: 4,
      lineHeightRatio: 1.14,
    });
    ctx.font = `800 ${lFitted.fontSize}px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#334155';
    lFitted.lines.forEach((ln, li) =>
      ctx.fillText(ln, -224, -4 - ((lFitted.lines.length - 1) * lFitted.lineHeight) / 2 + li * lFitted.lineHeight),
    );
    ctx.font = `600 24px ${FONT_SANS}`;
    ctx.fillStyle = '#64748B';
    ctx.fillText('✗ Literal', -224, 64, 340);

    fillCardWithShadow(ctx, 28, -126, 392, 252, 26, '#EEF2FF', 0.14);
    ctx.strokeStyle = '#4F46E5';
    ctx.lineWidth = 4;
    drawRoundedRectPath(ctx, 28, -126, 392, 252, 26);
    ctx.stroke();
    ctx.fillStyle = '#4F46E5';
    drawRoundedRectPath(ctx, 62, -98, 214, 38, 19);
    ctx.fill();
    ctx.font = `800 20px ${FONT_SANS}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('★ RECOMMENDED', 169, -79, 196);
    const rFitted = fitWrappedTextBlock(ctx, rightTxt, 340, 88, {
      fontWeight: 800,
      maxFontSize: 30,
      minFontSize: 14,
      maxLines: 4,
      lineHeightRatio: 1.14,
    });
    ctx.font = `800 ${rFitted.fontSize}px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#312E81';
    rFitted.lines.forEach((ln, li) =>
      ctx.fillText(ln, 224, -6 - ((rFitted.lines.length - 1) * rFitted.lineHeight) / 2 + li * rFitted.lineHeight),
    );
    ctx.font = `700 24px ${FONT_SANS}`;
    ctx.fillStyle = '#15803D';
    ctx.fillText('✓ 100% Natural', 224, 66, 340);
  } else if (props.variant === 'bs-accordion-faq') {
    fillCardWithShadow(ctx, -420, -128, 840, 256, 26, '#FFFFFF', 0.09);
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2;
    drawRoundedRectPath(ctx, -420, -128, 840, 256, 26);
    ctx.stroke();

    ctx.fillStyle = '#E0E7FF';
    drawRoundedRectPath(ctx, -420, -128, 840, 74, 24);
    ctx.fill();
    ctx.fillRect(-420, -78, 840, 24);
    ctx.font = `800 28px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#3730A3';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Q: ${props.data?.title || 'Quick Question'}`, -386, -90, 700);
    ctx.textAlign = 'right';
    ctx.fillText('▲', 386, -90);

    ctx.textAlign = 'left';
    const ansText = props.data?.speechText || props.data?.subtitle || 'Clear explanation';
    const ansFitted = fitWrappedTextBlock(ctx, ansText, 768, 138, {
      fontWeight: 600,
      fontFamily: FONT_SANS,
      maxFontSize: 26,
      minFontSize: 13,
      maxLines: 6,
      lineHeightRatio: 1.24,
    });
    ctx.font = `600 ${ansFitted.fontSize}px ${FONT_SANS}`;
    ctx.fillStyle = '#1E293B';
    ansFitted.lines.forEach((ln, li) => ctx.fillText(ln, -386, -24 + li * ansFitted.lineHeight));
  } else if (props.variant === 'bs-breadcrumb-path') {
    const crumbs = props.data?.labels?.slice(0, 3) ?? ['Context', 'Pattern', 'Fluent!'];
    const useVertical = crumbs.some((c) => c.length > 12);
    if (useVertical) {
      fillCardWithShadow(ctx, -425, -138, 850, 276, 28, '#FFFFFF', 0.09);
      ctx.font = `800 24px ${FONT_SANS}`;
      ctx.fillStyle = '#475569';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(props.data?.title || 'KEY STEPS', 0, -106, 760);
      crumbs.forEach((c, i) => {
        const ry = -66 + i * 64;
        const active = i === crumbs.length - 1;
        ctx.fillStyle = active ? '#0D6EFD' : '#F1F5F9';
        drawRoundedRectPath(ctx, -385, ry, 770, 52, 18);
        ctx.fill();
        const fitted = fitWrappedTextBlock(ctx, `${i + 1}. ${c}`, 730, 44, {
          fontWeight: 800,
          maxFontSize: 28,
          minFontSize: 18,
          maxLines: 1,
        });
        ctx.font = `800 ${fitted.fontSize}px ${FONT_DISPLAY}`;
        ctx.fillStyle = active ? '#FFFFFF' : '#1E293B';
        ctx.fillText(fitted.lines[0] ?? `${i + 1}. ${c}`, 0, ry + 27, 730);
      });
    } else {
      fillCardWithShadow(ctx, -425, -104, 850, 208, 28, '#FFFFFF', 0.09);
      ctx.font = `700 24px ${FONT_SANS}`;
      ctx.fillStyle = '#64748B';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(props.data?.title || 'LEARNING PATHWAY', 0, -64, 720);

      const xs = [-260, 0, 260];
      crumbs.forEach((c, i) => {
        const cx = xs[i];
        const active = i === crumbs.length - 1;
        ctx.fillStyle = active ? '#0D6EFD' : '#F1F5F9';
        drawRoundedRectPath(ctx, cx - 108, -24, 216, 68, 34);
        ctx.fill();
        const fitted = fitWrappedTextBlock(ctx, c, 192, 56, {
          fontWeight: 800,
          maxFontSize: 26,
          minFontSize: 16,
          maxLines: 2,
          lineHeightRatio: 1.15,
        });
        ctx.font = `800 ${fitted.fontSize}px ${FONT_DISPLAY}`;
        ctx.fillStyle = active ? '#FFFFFF' : '#334155';
        const ly = 10 - ((fitted.lines.length - 1) * fitted.lineHeight) / 2;
        fitted.lines.forEach((ln, li) => ctx.fillText(ln, cx, ly + li * fitted.lineHeight, 196));
        if (i < crumbs.length - 1) {
          ctx.font = `800 28px ${FONT_SANS}`;
          ctx.fillStyle = '#94A3B8';
          ctx.fillText('›', cx + 130, 10);
        }
      });
    }
  } else if (props.variant === 'css-bento-stats') {
    const tiles = [
      { bg: '#EEF2FF', fg: '#4338CA', num: '01', lbl: props.data?.labels?.[0] || 'Core Word' },
      { bg: '#ECFDF5', fg: '#047857', num: '02', lbl: props.data?.labels?.[1] || 'Tone Check' },
      { bg: '#FFF7ED', fg: '#C2410C', num: '03', lbl: props.data?.labels?.[2] || 'Practice' },
      { bg: '#FDF2F8', fg: '#BE185D', num: '★', lbl: props.data?.title || 'Example' },
    ];
    const coords = [
      [-420, -132],
      [12, -132],
      [-420, 10],
      [12, 10],
    ];
    tiles.forEach((tile, i) => {
      const stag = computeStaggerItemState(elElapsed, i, 0.075, 0.34);
      if (!stag.visible) return;
      const [tx, ty] = coords[i];
      ctx.save();
      ctx.globalAlpha *= stag.opacity;
      ctx.translate(tx + 204, ty + 61 + stag.translateY);
      ctx.scale(stag.scale, stag.scale);
      fillCardWithShadow(ctx, -204, -61, 408, 122, 22, tile.bg, 0.06);
      ctx.fillStyle = tile.fg;
      drawRoundedRectPath(ctx, -204 + 16, -61 + 33, 56, 56, 16);
      ctx.fill();
      ctx.font = `800 24px ${FONT_DISPLAY}`;
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tile.num, -204 + 44, -61 + 62);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#0F172A';
      const tileFitted = fitWrappedTextBlock(ctx, tile.lbl, 298, 96, {
        fontWeight: 800,
        maxFontSize: 26,
        minFontSize: 13,
        maxLines: 4,
        lineHeightRatio: 1.15,
      });
      ctx.font = `800 ${tileFitted.fontSize}px ${FONT_DISPLAY}`;
      const ly = -61 + 62 - ((tileFitted.lines.length - 1) * tileFitted.lineHeight) / 2;
      tileFitted.lines.forEach((ln, li) => ctx.fillText(ln, -204 + 88, ly + li * tileFitted.lineHeight));
      ctx.restore();
    });
  } else if (props.variant === 'css-glass-quote') {
    const grad = ctx.createLinearGradient(-420, -124, 420, 124);
    grad.addColorStop(0, 'rgba(99, 102, 241, 0.16)');
    grad.addColorStop(1, 'rgba(236, 72, 153, 0.14)');
    fillCardWithShadow(ctx, -420, -124, 840, 248, 32, 'rgba(255,255,255,0.86)', 0.12);
    ctx.fillStyle = grad;
    drawRoundedRectPath(ctx, -420, -124, 840, 248, 32);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.font = `800 84px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#6366F1';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('“', -382, -52);

    ctx.textAlign = 'center';
    const qFitted = fitWrappedTextBlock(
      ctx,
      props.data?.speechText || props.data?.title || 'Speak clearly, connect naturally.',
      680,
      110,
      { fontWeight: 800, maxFontSize: 34, minFontSize: 15, maxLines: 4, lineHeightRatio: 1.18 },
    );
    ctx.font = `800 ${qFitted.fontSize}px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#0F172A';
    const qStartY = -20 - ((qFitted.lines.length - 1) * qFitted.lineHeight) / 2;
    qFitted.lines.forEach((ln, li) => ctx.fillText(ln, 0, qStartY + li * qFitted.lineHeight));

    if (props.data?.subtitle) {
      ctx.font = `700 24px ${FONT_SANS}`;
      const subW = Math.min(640, Math.max(240, ctx.measureText(props.data.subtitle).width + 44));
      ctx.fillStyle = '#FFFFFF';
      drawRoundedRectPath(ctx, -subW / 2, 50, subW, 46, 23);
      ctx.fill();
      ctx.fillStyle = '#4F46E5';
      ctx.fillText(props.data.subtitle, 0, 74);
    }
  } else if (props.variant === 'css-chat-thread') {
    fillCardWithShadow(ctx, -420, -132, 840, 264, 30, '#F8FAFC', 0.08);
    const s0 = computeStaggerItemState(elElapsed, 0, 0.0, 0.34);
    if (s0.visible) {
      ctx.save();
      ctx.globalAlpha *= s0.opacity;
      ctx.translate(0, s0.translateY);
      fillCardWithShadow(ctx, -382, -104, 620, 88, 24, '#FFFFFF', 0.06);
      const l0Fitted = fitWrappedTextBlock(ctx, props.data?.labels?.[0] || 'A: "Excuse me?"', 560, 74, {
        fontWeight: 600,
        fontFamily: FONT_SANS,
        maxFontSize: 26,
        minFontSize: 13,
        maxLines: 3,
        lineHeightRatio: 1.15,
      });
      ctx.font = `600 ${l0Fitted.fontSize}px ${FONT_SANS}`;
      ctx.fillStyle = '#334155';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      l0Fitted.lines.forEach((ln, li) =>
        ctx.fillText(ln, -352, -60 - ((l0Fitted.lines.length - 1) * l0Fitted.lineHeight) / 2 + li * l0Fitted.lineHeight),
      );
      ctx.restore();
    }

    const s1 = computeStaggerItemState(elElapsed, 1, 0.22, 0.36);
    if (s1.visible) {
      ctx.save();
      ctx.globalAlpha *= s1.opacity;
      ctx.translate(0, s1.translateY);
      fillCardWithShadow(ctx, -238, 12, 620, 90, 24, '#4F46E5', 0.14);
      const l1Fitted = fitWrappedTextBlock(ctx, props.data?.labels?.[1] || 'B: "Go right ahead!"', 560, 76, {
        fontWeight: 700,
        maxFontSize: 26,
        minFontSize: 13,
        maxLines: 3,
        lineHeightRatio: 1.15,
      });
      ctx.font = `700 ${l1Fitted.fontSize}px ${FONT_DISPLAY}`;
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      l1Fitted.lines.forEach((ln, li) =>
        ctx.fillText(ln, -208, 57 - ((l1Fitted.lines.length - 1) * l1Fitted.lineHeight) / 2 + li * l1Fitted.lineHeight),
      );
      ctx.restore();
    }
  } else if (props.variant === 'css-roadmap-steps') {
    const steps = props.data?.labels?.slice(0, 3) ?? ['Spot It', 'Practice', 'Master'];
    const cols = ['#2563EB', '#7C3AED', '#10B981'];
    const isLong = steps.some((s) => s.length > 13);
    if (isLong) {
      fillCardWithShadow(ctx, -425, -138, 850, 276, 28, '#FFFFFF', 0.09);
      steps.forEach((lbl, i) => {
        const stag = computeStaggerItemState(elElapsed, i, 0.10, 0.34);
        if (!stag.visible) return;
        const ry = -84 + i * 84;
        ctx.save();
        ctx.globalAlpha *= stag.opacity;
        ctx.translate(0, stag.translateY);
        ctx.fillStyle = cols[i % cols.length];
        ctx.beginPath();
        ctx.arc(-350, ry, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `800 24px ${FONT_DISPLAY}`;
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`0${i + 1}`, -350, ry + 1);
        const stepFitted = fitWrappedTextBlock(ctx, lbl, 680, 68, {
          fontWeight: 800,
          maxFontSize: 30,
          minFontSize: 14,
          maxLines: 3,
          lineHeightRatio: 1.12,
        });
        ctx.font = `800 ${stepFitted.fontSize}px ${FONT_DISPLAY}`;
        ctx.fillStyle = '#0F172A';
        ctx.textAlign = 'left';
        const ly = ry - ((stepFitted.lines.length - 1) * stepFitted.lineHeight) / 2;
        stepFitted.lines.forEach((ln, li) => ctx.fillText(ln, -304, ly + li * stepFitted.lineHeight));
        ctx.restore();
      });
    } else {
      fillCardWithShadow(ctx, -425, -116, 850, 232, 30, '#FFFFFF', 0.09);
      const lineGrow = easeOutQuint(clamp01(elElapsed / 0.55));
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(-260, -34);
      ctx.lineTo(-260 + 520 * lineGrow, -34);
      ctx.stroke();

      const xs = [-260, 0, 260];
      steps.forEach((lbl, i) => {
        const stag = computeStaggerItemState(elElapsed, i, 0.10, 0.36);
        if (!stag.visible) return;
        const sx = xs[i];
        ctx.save();
        ctx.globalAlpha *= stag.opacity;
        ctx.translate(sx, stag.translateY);
        ctx.scale(stag.scale, stag.scale);
        ctx.fillStyle = cols[i];
        ctx.beginPath();
        ctx.arc(0, -34, 32, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `800 26px ${FONT_DISPLAY}`;
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`0${i + 1}`, 0, -33);

        const stepShort = fitWrappedTextBlock(ctx, lbl, 224, 80, {
          fontWeight: 800,
          maxFontSize: 28,
          minFontSize: 13,
          maxLines: 4,
          lineHeightRatio: 1.14,
        });
        ctx.font = `800 ${stepShort.fontSize}px ${FONT_DISPLAY}`;
        ctx.fillStyle = '#0F172A';
        stepShort.lines.forEach((ln, li) => ctx.fillText(ln, 0, 38 + li * stepShort.lineHeight));
        ctx.restore();
      });
    }
  } else if (props.variant === 'css-toggle-switch') {
    const isOn = (props.data?.value ?? 1) >= 0.5;
    const toggleSlide = isOn ? easeOutQuint(clamp01((elElapsed - 0.12) / 0.42)) : 0;
    fillCardWithShadow(ctx, -415, -112, 830, 224, 30, '#FFFFFF', 0.09);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `700 24px ${FONT_SANS}`;
    ctx.fillStyle = '#64748B';
    ctx.fillText(props.data?.labels?.[0] || 'OFF', -370, -48, 460);
    ctx.font = `800 34px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#0F172A';
    ctx.fillText(props.data?.title || 'ON · Native Mode', -370, 22, 460);

    const tx = 140;
    const ty = -46;
    ctx.fillStyle = toggleSlide > 0.5 ? '#10B981' : '#CBD5E1';
    drawRoundedRectPath(ctx, tx, ty, 224, 92, 46);
    ctx.fill();
    const knobX = tx + 48 + (176 - 48) * toggleSlide;
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.25)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(knobX, ty + 46, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.font = `800 24px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(toggleSlide > 0.5 ? 'ON' : 'OFF', toggleSlide > 0.5 ? tx + 86 : tx + 140, ty + 48);
  } else if (props.variant === 'css-browser-mockup') {
    // Modern Browser Window Card with macOS Dots + URL bar + Clear Multi-line Reading Context
    const bodyText =
      props.data?.speechText ||
      props.data?.subtitle ||
      'Reading context';
    const bodyFontPx = bodyText.length > 210 ? 24 : bodyText.length > 145 ? 28 : 32;
    const bodyLineH = Math.round(bodyFontPx * 1.26);
    ctx.font = `600 ${bodyFontPx}px ${FONT_DISPLAY}`;
    const displayLines = wrapTextLines(ctx, bodyText, 760);
    const titleStr = props.data?.title || 'Reading Context';
    ctx.font = `800 34px ${FONT_DISPLAY}`;
    const titleLines = wrapTextLines(ctx, titleStr, 760);
    const cardH = Math.max(250, 90 + titleLines.length * 42 + displayLines.length * bodyLineH + 38);
    const cardTop = -Math.round(cardH / 2);

    fillCardWithShadow(ctx, -430, cardTop, 860, cardH, 24, '#FFFFFF', 0.11);
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 2;
    drawRoundedRectPath(ctx, -430, cardTop, 860, cardH, 24);
    ctx.stroke();

    // Top chrome bar
    ctx.fillStyle = '#F1F5F9';
    drawRoundedRectPath(ctx, -430, cardTop, 860, 58, 22);
    ctx.fill();
    ctx.fillRect(-430, cardTop + 34, 860, 24);

    const dots = ['#EF4444', '#F59E0B', '#10B981'];
    dots.forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(-388 + i * 26, cardTop + 29, 8, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = '#FFFFFF';
    drawRoundedRectPath(ctx, -270, cardTop + 11, 580, 36, 18);
    ctx.fill();
    ctx.font = `700 22px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(props.data?.formula || 'Reading Context', 20, cardTop + 29, 550);

    let cy = cardTop + 92;
    ctx.font = `800 34px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#0F172A';
    titleLines.forEach((tln) => {
      ctx.fillText(tln, 0, cy, 768);
      cy += 42;
    });

    cy += 8;
    ctx.font = `600 ${bodyFontPx}px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#1E293B';
    displayLines.forEach((ln, idx) => {
      ctx.fillText(ln, 0, cy + idx * bodyLineH, 768);
    });
  } else if (props.variant === 'css-grammar-equation') {
    const parts = props.data?.labels?.slice(0, 3) ?? ['Could you', 'V-inf', 'Polite!'];
    fillCardWithShadow(ctx, -430, -118, 860, 236, 30, '#FFFFFF', 0.09);
    ctx.font = `700 24px ${FONT_SANS}`;
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(props.data?.title || 'PATTERN', 0, -78, 760);

    const boxes = [
      { x: -395, w: 220, bg: '#DBEAFE', fg: '#1D4ED8', txt: parts[0] },
      { x: -115, w: 220, bg: '#FEF3C7', fg: '#B45309', txt: parts[1] },
      { x: 165, w: 230, bg: '#DCFCE7', fg: '#15803D', txt: parts[2] },
    ];
    boxes.forEach((b) => {
      ctx.fillStyle = b.bg;
      drawRoundedRectPath(ctx, b.x, -30, b.w, 96, 22);
      ctx.fill();
      const bFitted = fitWrappedTextBlock(ctx, b.txt, b.w - 20, 82, {
        fontWeight: 800,
        maxFontSize: 26,
        minFontSize: 13,
        maxLines: 3,
        lineHeightRatio: 1.12,
      });
      ctx.font = `800 ${bFitted.fontSize}px ${FONT_DISPLAY}`;
      ctx.fillStyle = b.fg;
      const ly = 18 - ((bFitted.lines.length - 1) * bFitted.lineHeight) / 2;
      bFitted.lines.forEach((ln, li) => ctx.fillText(ln, b.x + b.w / 2, ly + li * bFitted.lineHeight));
    });
    ctx.font = `800 32px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#64748B';
    ctx.fillText('+', -145, 18);
    ctx.fillText('=', 135, 18);
  } else if (props.variant === 'css-flashcard-flip') {
    fillCardWithShadow(ctx, -340, -124, 680, 224, 28, '#E0E7FF', 0.06);
    fillCardWithShadow(ctx, -370, -104, 740, 224, 28, '#FFFFFF', 0.12);
    ctx.strokeStyle = '#C7D2FE';
    ctx.lineWidth = 2.5;
    drawRoundedRectPath(ctx, -370, -104, 740, 224, 28);
    ctx.stroke();

    ctx.fillStyle = '#EEF2FF';
    drawRoundedRectPath(ctx, -115, -82, 230, 36, 18);
    ctx.fill();
    ctx.font = `800 20px ${FONT_SANS}`;
    ctx.fillStyle = '#4338CA';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(props.data?.formula || 'FLASHCARD', 0, -64, 210);

    const fcTitle = fitWrappedTextBlock(ctx, props.data?.title || 'commute', 660, 56, {
      fontWeight: 800,
      maxFontSize: 42,
      minFontSize: 20,
      maxLines: 2,
      lineHeightRatio: 1.1,
    });
    ctx.font = `800 ${fcTitle.fontSize}px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#0F172A';
    fcTitle.lines.forEach((ln, li) =>
      ctx.fillText(ln, 0, -6 - ((fcTitle.lines.length - 1) * fcTitle.lineHeight) / 2 + li * fcTitle.lineHeight),
    );
    const fcSub = fitWrappedTextBlock(
      ctx,
      props.data?.subtitle || props.data?.speechText || '',
      660,
      74,
      { fontWeight: 600, fontFamily: FONT_SANS, maxFontSize: 26, minFontSize: 13, maxLines: 3, lineHeightRatio: 1.18 },
    );
    ctx.font = `600 ${fcSub.fontSize}px ${FONT_SANS}`;
    ctx.fillStyle = '#475569';
    fcSub.lines.forEach((ln, li) => ctx.fillText(ln, 0, 48 + li * fcSub.lineHeight));
  } else if (props.variant === 'css-sticky-note') {
    ctx.save();
    ctx.rotate(-0.018);
    fillCardWithShadow(ctx, -375, -124, 750, 248, 22, '#FEF9C3', 0.12);
    ctx.strokeStyle = '#FDE047';
    ctx.lineWidth = 2.5;
    drawRoundedRectPath(ctx, -375, -124, 750, 248, 22);
    ctx.stroke();

    ctx.fillStyle = '#FDE047';
    ctx.beginPath();
    ctx.moveTo(315, 124);
    ctx.lineTo(375, 68);
    ctx.lineTo(315, 68);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.arc(0, -112, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FCA5A5';
    ctx.beginPath();
    ctx.arc(-5, -116, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 22px ${FONT_SANS}`;
    ctx.fillStyle = '#B45309';
    ctx.fillText(props.data?.formula || 'QUICK NOTE', 0, -68, 620);

    const stickyTitle = fitWrappedTextBlock(ctx, props.data?.title || 'Remember', 660, 66, {
      fontWeight: 800,
      maxFontSize: 36,
      minFontSize: 18,
      maxLines: 2,
      lineHeightRatio: 1.12,
    });
    ctx.font = `800 ${stickyTitle.fontSize}px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#1E293B';
    const stStartY = stickyTitle.lines.length > 1 ? -14 : -6;
    stickyTitle.lines.forEach((sln, sli) => {
      ctx.fillText(sln, 0, stStartY + sli * stickyTitle.lineHeight);
    });

    const rawSub = props.data?.subtitle || props.data?.speechText || '';
    const subFitted = fitWrappedTextBlock(ctx, rawSub, 650, 74, {
      fontWeight: 600,
      fontFamily: FONT_SANS,
      maxFontSize: 26,
      minFontSize: 15,
      maxLines: 3,
      lineHeightRatio: 1.18,
    });
    ctx.font = `600 ${subFitted.fontSize}px ${FONT_SANS}`;
    ctx.fillStyle = '#334155';
    const subStartY = subFitted.lines.length >= 2 ? 42 : 58;
    subFitted.lines.forEach((line, idx) => {
      ctx.fillText(line, 0, subStartY + idx * subFitted.lineHeight);
    });
    ctx.restore();
  } else if (props.variant === 'bs-badge-cluster') {
    const pills = props.data?.labels?.slice(0, 3) ?? ['Phrase 1', 'Phrase 2', 'Phrase 3'];
    const useStacked = pills.some((p) => p.length > 14);
    const palette = [
      { bg: '#DBEAFE', fg: '#1D4ED8' },
      { bg: '#DCFCE7', fg: '#15803D' },
      { bg: '#EDE9FE', fg: '#6D28D9' },
    ];
    if (useStacked) {
      fillCardWithShadow(ctx, -420, -142, 840, 284, 28, '#FFFFFF', 0.1);
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 2;
      drawRoundedRectPath(ctx, -420, -142, 840, 284, 28);
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 28px ${FONT_DISPLAY}`;
      ctx.fillStyle = '#0F172A';
      ctx.fillText(props.data?.title || 'KEY HIGHLIGHTS', 0, -104, 760);

      pills.forEach((txt, i) => {
        const col = palette[i % palette.length];
        const py = -68 + i * 64;
        ctx.fillStyle = col.bg;
        drawRoundedRectPath(ctx, -380, py, 760, 52, 22);
        ctx.fill();
        const fitted = fitWrappedTextBlock(ctx, txt, 720, 44, {
          fontWeight: 800,
          maxFontSize: 28,
          minFontSize: 18,
          maxLines: 1,
        });
        ctx.font = `800 ${fitted.fontSize}px ${FONT_DISPLAY}`;
        ctx.fillStyle = col.fg;
        ctx.fillText(fitted.lines[0] ?? txt, 0, py + 27, 720);
      });
    } else {
      fillCardWithShadow(ctx, -420, -124, 840, 248, 28, '#FFFFFF', 0.1);
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 2;
      drawRoundedRectPath(ctx, -420, -124, 840, 248, 28);
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 28px ${FONT_DISPLAY}`;
      ctx.fillStyle = '#0F172A';
      ctx.fillText(props.data?.title || 'KEY HIGHLIGHTS', 0, -72, 740);

      const xs = pills.length === 2 ? [-195, 195] : [-258, 0, 258];
      const pw = pills.length === 2 ? 330 : 236;
      pills.forEach((txt, i) => {
        const col = palette[i % palette.length];
        ctx.fillStyle = col.bg;
        drawRoundedRectPath(ctx, xs[i] - pw / 2, -20, pw, 80, 36);
        ctx.fill();
        const fitted = fitWrappedTextBlock(ctx, txt, pw - 24, 68, {
          fontWeight: 800,
          maxFontSize: 26,
          minFontSize: 16,
          maxLines: 2,
          lineHeightRatio: 1.15,
        });
        ctx.font = `800 ${fitted.fontSize}px ${FONT_DISPLAY}`;
        ctx.fillStyle = col.fg;
        fitted.lines.forEach((ln, li) =>
          ctx.fillText(ln, xs[i], 20 - ((fitted.lines.length - 1) * fitted.lineHeight) / 2 + li * fitted.lineHeight, pw - 20),
        );
      });

      if (props.data?.subtitle) {
        ctx.font = `600 24px ${FONT_SANS}`;
        ctx.fillStyle = '#475569';
        ctx.fillText(props.data.subtitle, 0, 90, 740);
      }
    }
  } else if (props.variant === 'css-magnifying-word') {
    fillCardWithShadow(ctx, -420, -122, 840, 244, 28, '#FFFFFF', 0.1);
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2;
    drawRoundedRectPath(ctx, -420, -122, 840, 244, 28);
    ctx.stroke();

    ctx.fillStyle = '#EEF2FF';
    ctx.beginPath();
    ctx.arc(-270, -6, 66, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4F46E5';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-222, 42);
    ctx.lineTo(-190, 74);
    ctx.stroke();

    ctx.save();
    ctx.translate(-270, -6);
    ctx.scale(0.58, 0.58);
    drawSceneIcon(ctx, props.data?.sceneIcon || 'eye');
    ctx.restore();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `800 22px ${FONT_SANS}`;
    ctx.fillStyle = '#4F46E5';
    ctx.fillText(props.data?.formula || 'KEY FOCUS', -160, -64, 520);

    ctx.font = `800 36px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#0F172A';
    ctx.fillText(props.data?.highlightWord || props.data?.title || 'Spotlight', -160, -4, 540);

    const magSub = fitWrappedTextBlock(
      ctx,
      props.data?.subtitle || props.data?.speechText || '',
      540,
      78,
      { fontWeight: 600, fontFamily: FONT_SANS, maxFontSize: 26, minFontSize: 13, maxLines: 4, lineHeightRatio: 1.18 },
    );
    ctx.font = `600 ${magSub.fontSize}px ${FONT_SANS}`;
    ctx.fillStyle = '#475569';
    magSub.lines.forEach((ln, li) => ctx.fillText(ln, -160, 44 + li * magSub.lineHeight));
  } else if (props.variant === 'bs-modal-quiz') {
    fillCardWithShadow(ctx, -415, -130, 830, 260, 26, '#FFFFFF', 0.13);
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2;
    drawRoundedRectPath(ctx, -415, -130, 830, 260, 26);
    ctx.stroke();

    ctx.fillStyle = '#1E1B4B';
    drawRoundedRectPath(ctx, -415, -130, 830, 62, 24);
    ctx.fill();
    ctx.fillRect(-415, -90, 830, 22);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `800 24px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(props.data?.formula || 'QUICK CHECK', -380, -98, 560);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#A5B4FC';
    ctx.fillText('✕', 380, -98);

    ctx.textAlign = 'center';
    const qText = props.data?.title || props.data?.speechText || 'Quick Question';
    const fittedQ = fitWrappedTextBlock(ctx, qText, 760, 74, {
      fontWeight: 800,
      maxFontSize: 32,
      minFontSize: 20,
      maxLines: 2,
      lineHeightRatio: 1.18,
    });
    ctx.font = `800 ${fittedQ.fontSize}px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#0F172A';
    const qY = -16 - ((fittedQ.lines.length - 1) * fittedQ.lineHeight) / 2;
    fittedQ.lines.forEach((ln, li) => ctx.fillText(ln, 0, qY + li * fittedQ.lineHeight, 760));

    const optA = props.data?.labels?.[0] || 'A';
    const optB = props.data?.labels?.[1] || 'B';
    ctx.fillStyle = '#EEF2FF';
    drawRoundedRectPath(ctx, -370, 38, 350, 62, 18);
    ctx.fill();
    ctx.fillStyle = '#ECFDF5';
    drawRoundedRectPath(ctx, 20, 38, 350, 62, 18);
    ctx.fill();

    const fittedA = fitWrappedTextBlock(ctx, optA, 324, 52, {
      fontWeight: 800,
      maxFontSize: 26,
      minFontSize: 16,
      maxLines: 2,
      lineHeightRatio: 1.15,
    });
    ctx.font = `800 ${fittedA.fontSize}px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#4338CA';
    const aY = 70 - ((fittedA.lines.length - 1) * fittedA.lineHeight) / 2;
    fittedA.lines.forEach((ln, li) => ctx.fillText(ln, -195, aY + li * fittedA.lineHeight, 324));

    const fittedB = fitWrappedTextBlock(ctx, optB, 324, 52, {
      fontWeight: 800,
      maxFontSize: 26,
      minFontSize: 16,
      maxLines: 2,
      lineHeightRatio: 1.15,
    });
    ctx.font = `800 ${fittedB.fontSize}px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#15803D';
    const bY = 70 - ((fittedB.lines.length - 1) * fittedB.lineHeight) / 2;
    fittedB.lines.forEach((ln, li) => ctx.fillText(ln, 195, bY + li * fittedB.lineHeight, 324));
  } else if (props.variant === 'p168-step-quiz-formula') {
    // 5-step progress stepper + Question pill + Question prompt + (A)/(B) options + 2 rule bars
    fillCardWithShadow(ctx, -420, -204, 840, 408, 30, '#FFFFFF', 0.11);
    ctx.strokeStyle = '#DCE6F7';
    ctx.lineWidth = 2;
    drawRoundedRectPath(ctx, -420, -204, 840, 408, 30);
    ctx.stroke();

    // Top 5-step progress track
    const stepX = [-260, -130, 0, 130, 260];
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(stepX[0], -164);
    ctx.lineTo(stepX[4], -164);
    ctx.stroke();
    ctx.strokeStyle = '#22C55E';
    ctx.beginPath();
    ctx.moveTo(stepX[0], -164);
    ctx.lineTo(stepX[1], -164);
    ctx.stroke();
    stepX.forEach((sx, si) => {
      const done = si === 0;
      const active = si === 1;
      ctx.fillStyle = done ? '#22C55E' : active ? '#3B82F6' : '#FFFFFF';
      ctx.beginPath();
      ctx.arc(sx, -164, 21, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = done ? '#16A34A' : active ? '#2563EB' : '#CBD5E1';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.font = `800 19px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = done || active ? '#FFFFFF' : '#64748B';
      ctx.fillText(done ? '✓' : String(si + 1), sx, -163);
    });

    // Blue Question badge pill
    const badgeTxt = props.data?.formula || 'Question 1';
    ctx.fillStyle = '#3B82F6';
    drawRoundedRectPath(ctx, -116, -124, 232, 46, 23);
    ctx.fill();
    ctx.font = `800 22px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(badgeTxt, 0, -101, 210);

    // Question card
    ctx.fillStyle = '#F8FAFC';
    drawRoundedRectPath(ctx, -370, -64, 740, 74, 20);
    ctx.fill();
    const qPrompt = props.data?.title || 'Can you ____ me your pen?';
    const fittedQ = fitWrappedTextBlock(ctx, qPrompt, 700, 62, {
      fontWeight: 800,
      maxFontSize: 30,
      minFontSize: 18,
      maxLines: 2,
      lineHeightRatio: 1.18,
    });
    ctx.font = `800 ${fittedQ.fontSize}px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#0F172A';
    const qY = -27 - ((fittedQ.lines.length - 1) * fittedQ.lineHeight) / 2;
    fittedQ.lines.forEach((ln, li) => ctx.fillText(ln, 0, qY + li * fittedQ.lineHeight, 700));

    // Choice buttons (A) vs (B)
    const rawLabels = props.data?.labels ?? [];
    const optA = rawLabels[0] || 'A  lend';
    const optB = rawLabels[1] || 'B  borrow';
    ctx.fillStyle = '#ECFDF5';
    drawRoundedRectPath(ctx, -356, 20, 336, 56, 18);
    ctx.fill();
    ctx.strokeStyle = '#22C55E';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#EFF6FF';
    drawRoundedRectPath(ctx, 20, 20, 336, 56, 18);
    ctx.fill();
    ctx.strokeStyle = '#BFDBFE';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.font = `800 24px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#15803D';
    ctx.fillText(optA, -188, 48, 304);
    ctx.fillStyle = '#1D4ED8';
    ctx.fillText(optB, 188, 48, 304);

    // 2 Side-by-side rule formula cards neatly aligned beneath (A) & (B)
    const rule1 = rawLabels[2] || props.data?.subtitle || 'lend = give to someone';
    const rule2 = rawLabels[3] || props.data?.speechText || 'borrow = get from someone';
    const ruleConfigs = [
      { text: rule1, x: -356, cx: -188, bg: '#E0F2FE', border: '#BAE6FD', fg: '#0369A1' },
      { text: rule2, x: 20, cx: 188, bg: '#EEF2FF', border: '#C7D2FE', fg: '#3730A3' },
    ];
    ruleConfigs.forEach((rc) => {
      ctx.fillStyle = rc.bg;
      drawRoundedRectPath(ctx, rc.x, 94, 336, 76, 16);
      ctx.fill();
      ctx.strokeStyle = rc.border;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      const fittedRule = fitWrappedTextBlock(ctx, rc.text, 304, 62, {
        fontWeight: 700,
        maxFontSize: 21,
        minFontSize: 15,
        maxLines: 2,
        lineHeightRatio: 1.18,
      });
      ctx.font = `700 ${fittedRule.fontSize}px ${FONT_SANS}`;
      ctx.fillStyle = rc.fg;
      const startRuleY = 132 - ((fittedRule.lines.length - 1) * fittedRule.lineHeight) / 2;
      fittedRule.lines.forEach((ln, li) =>
        ctx.fillText(ln, rc.cx, startRuleY + li * fittedRule.lineHeight, 304),
      );
    });
  } else if (props.variant === 'p168-grammar-formula') {
    // 3 top switching tabs + blue Rule pill + [Part A] + [Part B] equation + icon circle + takeaway
    fillCardWithShadow(ctx, -420, -192, 840, 384, 30, '#FFFFFF', 0.11);
    ctx.strokeStyle = '#DBEAFE';
    ctx.lineWidth = 2;
    drawRoundedRectPath(ctx, -420, -192, 840, 384, 30);
    ctx.stroke();

    const tabs = props.data?.labels?.slice(0, 3) ?? ['Pattern 1', 'Pattern 2', 'Pattern 3'];
    const tabW = 236;
    const tabXs = [-252, 0, 252];
    tabs.forEach((tb, ti) => {
      const tx = tabXs[ti];
      const active = ti === 0;
      ctx.fillStyle = active ? '#3B82F6' : '#EFF6FF';
      drawRoundedRectPath(ctx, tx - tabW / 2, -168, tabW, 48, 20);
      ctx.fill();
      ctx.font = `800 22px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = active ? '#FFFFFF' : '#1E40AF';
      ctx.fillText(tb, tx, -144, tabW - 22);
    });

    // Blue Rule banner pill
    ctx.fillStyle = '#2563EB';
    drawRoundedRectPath(ctx, -180, -104, 360, 46, 23);
    ctx.fill();
    ctx.font = `800 23px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(props.data?.formula || 'KEY GRAMMAR RULE', 0, -81, 330);

    // Equation row [A] + [B]
    const partA = props.data?.highlightWord || props.data?.title || 'used to';
    const partB = props.data?.speechText || 'base verb';
    ctx.fillStyle = '#DBEAFE';
    drawRoundedRectPath(ctx, -350, -34, 300, 68, 20);
    ctx.fill();
    ctx.strokeStyle = '#60A5FA';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = '#ECFDF5';
    drawRoundedRectPath(ctx, 50, -34, 300, 68, 20);
    ctx.fill();
    ctx.strokeStyle = '#6EE7B7';
    ctx.stroke();

    ctx.font = `800 34px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#334155';
    ctx.fillText('+', 0, 0);

    ctx.font = `800 26px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#1D4ED8';
    ctx.fillText(partA, -200, 0, 276);
    ctx.fillStyle = '#047857';
    ctx.fillText(partB, 200, 0, 276);

    // Central circular icon badge
    ctx.fillStyle = '#FFF7ED';
    ctx.beginPath();
    ctx.arc(0, 86, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FDBA74';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.save();
    ctx.translate(0, 86);
    ctx.scale(0.42, 0.42);
    drawSceneIcon(ctx, props.data?.sceneIcon || 'book');
    ctx.restore();

    // Concise bottom takeaway
    const takeaway = props.data?.subtitle || 'Simple pattern for clear communication';
    ctx.font = `700 24px ${FONT_SANS}`;
    ctx.fillStyle = '#334155';
    ctx.fillText(takeaway, 0, 158, 760);
  } else if (props.variant === 'p168-pronunciation-matrix') {
    // 3 side-by-side rounded sound/category columns with colored top pills & example list
    const cols = (props.data?.nodes ?? []).slice(0, 3);
    const items =
      cols.length >= 2
        ? cols
        : [
            { label: 'T sound', sublabel: 'k · p · s', color: '#3B82F6' },
            { label: 'D sound', sublabel: 'l · n · v', color: '#6366F1' },
            { label: 'ID', sublabel: 't · d', color: '#DB2777' },
          ];
    const extraExamples = props.data?.labels ?? [];
    const cw = items.length === 2 ? 380 : 262;
    const gap = 22;
    const startX = -((items.length * cw + (items.length - 1) * gap) / 2);

    items.forEach((col, ci) => {
      const cx = startX + ci * (cw + gap) + cw / 2;
      const accent = col.color || (ci === 0 ? '#3B82F6' : ci === 1 ? '#6366F1' : '#DB2777');
      fillCardWithShadow(ctx, cx - cw / 2, -172, cw, 344, 28, '#FFFFFF', 0.1);
      ctx.strokeStyle = ci === 2 ? '#F9A8D4' : '#BFDBFE';
      ctx.lineWidth = 3;
      drawRoundedRectPath(ctx, cx - cw / 2, -172, cw, 344, 28);
      ctx.stroke();

      // Top colored header pill
      ctx.fillStyle = accent;
      drawRoundedRectPath(ctx, cx - cw * 0.4, -148, cw * 0.8, 52, 22);
      ctx.fill();
      ctx.font = `800 25px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(col.label, cx, -122, cw * 0.72);

      // Sublabel phonetic rule
      ctx.font = `700 22px ${FONT_SANS}`;
      ctx.fillStyle = '#64748B';
      ctx.fillText(col.sublabel || `Group ${ci + 1}`, cx, -64, cw - 28);

      // Divider
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - cw * 0.36, -34);
      ctx.lineTo(cx + cw * 0.36, -34);
      ctx.stroke();

      // Example chip inside column
      const exampleWord = extraExamples[ci] || props.data?.title || col.label;
      ctx.fillStyle = '#F8FAFC';
      drawRoundedRectPath(ctx, cx - cw * 0.41, -12, cw * 0.82, 136, 18);
      ctx.fill();
      const fittedEx = fitWrappedTextBlock(ctx, exampleWord, cw * 0.74, 114, {
        fontWeight: 800,
        maxFontSize: 28,
        minFontSize: 18,
        maxLines: 3,
        lineHeightRatio: 1.24,
      });
      ctx.font = `800 ${fittedEx.fontSize}px ${FONT_DISPLAY}`;
      ctx.fillStyle = '#0F172A';
      const exY = 56 - ((fittedEx.lines.length - 1) * fittedEx.lineHeight) / 2;
      fittedEx.lines.forEach((ln, li) => ctx.fillText(ln, cx, exY + li * fittedEx.lineHeight, cw * 0.74));
    });
  } else if (props.variant === 'p168-situation-cards') {
    // 3-circle milestone header + Step pill + headline + 2 stacked Casual / Formal context cards
    fillCardWithShadow(ctx, -420, -204, 840, 408, 30, '#FFFFFF', 0.11);
    ctx.strokeStyle = '#E0F2FE';
    ctx.lineWidth = 2;
    drawRoundedRectPath(ctx, -420, -204, 840, 408, 30);
    ctx.stroke();

    // 3 milestone circles
    const msX = [-210, 0, 210];
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(msX[0], -162);
    ctx.lineTo(msX[2], -162);
    ctx.stroke();
    msX.forEach((mx, mi) => {
      ctx.fillStyle = mi === 0 ? '#FB7185' : mi === 1 ? '#38BDF8' : '#34D399';
      ctx.beginPath();
      ctx.arc(mx, -162, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `800 20px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(mi < 2 ? '✓' : '3', mx, -161);
    });

    // Step pill & Headline
    ctx.fillStyle = '#38BDF8';
    drawRoundedRectPath(ctx, -90, -124, 180, 42, 21);
    ctx.fill();
    ctx.font = `800 21px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(props.data?.formula || 'Step 2', 0, -103, 160);

    ctx.font = `800 32px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#0F172A';
    ctx.fillText(props.data?.title || 'Say no, but softly.', 0, -54, 760);

    // 2 Context scenario cards stacked cleanly
    const cNodes = props.data?.nodes ?? [];
    const scenarios = [
      {
        title: cNodes[0]?.label || 'With friends:',
        quote: cNodes[0]?.sublabel || props.data?.labels?.[0] || '"I\'d love to, but I can\'t."',
        bg: '#EFF6FF',
        accent: '#2563EB',
        icon: 'chat' as IllustrationSceneIcon,
      },
      {
        title: cNodes[1]?.label || 'At work:',
        quote: cNodes[1]?.sublabel || props.data?.labels?.[1] || '"I\'m afraid I can\'t make it."',
        bg: '#FFF7ED',
        accent: '#EA580C',
        icon: 'briefcase' as IllustrationSceneIcon,
      },
    ];
    scenarios.forEach((sc, si) => {
      const sy = -12 + si * 102;
      fillCardWithShadow(ctx, -360, sy, 720, 86, 22, '#F8FAFC', 0.06);
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 2;
      drawRoundedRectPath(ctx, -360, sy, 720, 86, 22);
      ctx.stroke();

      ctx.fillStyle = sc.bg;
      drawRoundedRectPath(ctx, -340, sy + 15, 56, 56, 16);
      ctx.fill();
      ctx.save();
      ctx.translate(-312, sy + 43);
      ctx.scale(0.38, 0.38);
      drawSceneIcon(ctx, sc.icon);
      ctx.restore();

      ctx.textAlign = 'left';
      ctx.font = `800 22px ${FONT_DISPLAY}`;
      ctx.fillStyle = sc.accent;
      ctx.fillText(sc.title, -264, sy + 27, 580);

      ctx.font = `700 25px ${FONT_SANS}`;
      ctx.fillStyle = '#0F172A';
      ctx.fillText(sc.quote, -264, sy + 60, 580);
    });
  } else if (props.variant === 'p168-slider-compare') {
    // 2 top contrast pills + white horizontal glowing slider track + guiding question + solid blue bold choice pill
    fillCardWithShadow(ctx, -420, -192, 840, 384, 30, '#FFFFFF', 0.11);
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 2;
    drawRoundedRectPath(ctx, -420, -192, 840, 384, 30);
    ctx.stroke();

    const optLeft = props.data?.labels?.[0] || 'Past simple';
    const optRight = props.data?.labels?.[1] || 'Present perfect';
    const sliderVal = clamp01(props.data?.value ?? 0.72);
    const activeRight = sliderVal >= 0.5;

    ctx.fillStyle = !activeRight ? '#3B82F6' : '#F1F5F9';
    drawRoundedRectPath(ctx, -356, -162, 336, 54, 22);
    ctx.fill();
    ctx.fillStyle = activeRight ? '#3B82F6' : '#F1F5F9';
    drawRoundedRectPath(ctx, 20, -162, 336, 54, 22);
    ctx.fill();

    ctx.font = `800 24px ${FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = !activeRight ? '#FFFFFF' : '#475569';
    ctx.fillText(optLeft, -188, -135, 310);
    ctx.fillStyle = activeRight ? '#FFFFFF' : '#475569';
    ctx.fillText(optRight, 188, -135, 310);

    // Slider bar
    ctx.fillStyle = '#E2E8F0';
    drawRoundedRectPath(ctx, -300, -48, 600, 16, 8);
    ctx.fill();
    const grad = ctx.createLinearGradient(-300, 0, 300, 0);
    grad.addColorStop(0, '#93C5FD');
    grad.addColorStop(1, '#2563EB');
    ctx.fillStyle = grad;
    drawRoundedRectPath(ctx, -300, -48, 600 * sliderVal, 16, 8);
    ctx.fill();

    const kx = -300 + 600 * sliderVal;
    ctx.save();
    ctx.shadowColor = 'rgba(37, 99, 235, 0.45)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(kx, -40, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2563EB';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.restore();

    ctx.font = `700 21px ${FONT_SANS}`;
    ctx.fillStyle = '#64748B';
    ctx.fillText(optLeft.toLowerCase(), -275, -8, 180);
    ctx.fillText(optRight.toLowerCase(), 275, -8, 180);

    // Guiding title
    ctx.font = `700 25px ${FONT_SANS}`;
    ctx.fillStyle = '#1E293B';
    ctx.fillText(props.data?.formula || "Here's how to choose:", 0, 56, 720);

    // Solid bold choice CTA pill
    const chosenAnswer = props.data?.highlightWord || props.data?.title || (activeRight ? optRight : optLeft);
    fillCardWithShadow(ctx, -280, 92, 560, 68, 28, '#2563EB', 0.16);
    ctx.font = `800 30px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(chosenAnswer, 0, 126, 520);
  } else if (props.variant === 'p168-story-dialogue') {
    // Story | Question | Detail header + Avatar speech quote card + highlighted phrase capsule
    fillCardWithShadow(ctx, -420, -192, 840, 384, 30, '#FFFFFF', 0.11);
    ctx.strokeStyle = '#FED7AA';
    ctx.lineWidth = 2;
    drawRoundedRectPath(ctx, -420, -192, 840, 384, 30);
    ctx.stroke();

    const sTabs = props.data?.labels?.slice(0, 3) ?? ['Story', 'Question', 'Detail'];
    const sTabXs = [-232, 0, 232];
    sTabs.forEach((st, si) => {
      const tx = sTabXs[si];
      ctx.fillStyle = si === 0 ? '#3B82F6' : '#F8FAFC';
      drawRoundedRectPath(ctx, tx - 96, -166, 192, 42, 21);
      ctx.fill();
      ctx.font = `800 20px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = si === 0 ? '#FFFFFF' : '#475569';
      ctx.fillText(st, tx, -145, 172);
    });

    // Narration line
    ctx.font = `700 26px ${FONT_SANS}`;
    ctx.fillStyle = '#0F172A';
    ctx.fillText(props.data?.title || 'Her roommate leans in,', 0, -90, 740);

    // Character avatar left
    const lip = computeSpeechLipSyncState(cues, time);
    drawCharacterAvatar(ctx, {
      x: -265,
      y: 8,
      shirtColor: '#3B82F6',
      hairColor: '#1E293B',
      hairStyle: 'bob',
      expression: 'curious',
      scale: 0.78,
      lipSync: lip,
    });
    ctx.fillStyle = '#3B82F6';
    drawRoundedRectPath(ctx, -345, 70, 160, 32, 16);
    ctx.fill();
    ctx.font = `800 18px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(props.data?.reactionText || 'Speaker', -265, 86, 146);

    // Speech dialogue bubble right
    fillCardWithShadow(ctx, -145, -48, 520, 134, 24, '#F8FAFC', 0.06);
    ctx.strokeStyle = '#93C5FD';
    ctx.lineWidth = 2.5;
    drawRoundedRectPath(ctx, -145, -48, 520, 134, 24);
    ctx.stroke();

    const dialogueTxt = props.data?.speechText || '"Why? What happened? Did someone tell a joke?"';
    const fittedDlg = fitWrappedTextBlock(ctx, dialogueTxt, 480, 114, {
      fontWeight: 700,
      maxFontSize: 27,
      minFontSize: 18,
      maxLines: 3,
      lineHeightRatio: 1.24,
    });
    ctx.font = `700 ${fittedDlg.fontSize}px ${FONT_SANS}`;
    ctx.fillStyle = '#0F172A';
    const dStartY = 19 - ((fittedDlg.lines.length - 1) * fittedDlg.lineHeight) / 2;
    fittedDlg.lines.forEach((ln, li) => ctx.fillText(ln, 115, dStartY + li * fittedDlg.lineHeight, 480));

    // Bottom highlight pill takeaway
    const keyHighlight = props.data?.highlightWord || props.data?.subtitle || 'Natural everyday reaction';
    ctx.fillStyle = '#DBEAFE';
    drawRoundedRectPath(ctx, -340, 118, 680, 50, 25);
    ctx.fill();
    ctx.font = `800 24px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#1D4ED8';
    ctx.fillText(keyHighlight, 0, 143, 640);
  } else if (props.variant === 'podcast-studio') {
    drawPodcastStudioScene(ctx, props.data, time, cues);
  } else if (props.variant === 'dynamic-scene' && props.data?.dynamicScene) {
    drawDynamicScene(ctx, props.data.dynamicScene, time);
  } else {
    // pronunciation-wave
    const bars = 9;
    for (let i = 0; i < bars; i++) {
      const pulse = 0.35 + 0.65 * Math.abs(Math.sin(time * 4.5 + i * 0.6));
      const bh = 120 * pulse;
      ctx.fillStyle = i % 3 === 0 ? '#EA580C' : i % 3 === 1 ? '#2563EB' : '#DB2777';
      drawRoundedRectPath(ctx, -160 + i * 38, -bh / 2, 22, bh, 11);
      ctx.fill();
    }
  }

  if (attachExtraLabels && props.data?.labels) {
    drawProminentLabelsStrip(ctx, props.data.labels, 128, 840);
  }

  ctx.restore();
}

function drawDynamicScene(
  ctx: CanvasRenderingContext2D,
  spec: DynamicSceneSpec,
  time: number,
) {
  const motifs = spec.motifs?.length
    ? spec.motifs.slice(0, 3)
    : [{ icon: 'sparkles' as IllustrationSceneIcon, label: 'Key Focus', accent: '#4F46E5' }];

  if (spec.layout === 'split-compare' && motifs.length >= 2) {
    fillCardWithShadow(ctx, -430, -124, 860, 248, 34, '#FFFFFF', 0.09);
    if (spec.badgeText) {
      ctx.font = `700 22px ${FONT_SANS}`;
      ctx.fillStyle = '#64748B';
      ctx.textAlign = 'center';
      ctx.fillText(spec.badgeText, 0, -90);
    }
    const left = motifs[0];
    const right = motifs[1];
    const leftAccent = left.accent || '#DC2626';
    const rightAccent = right.accent || '#16A34A';

    // Left panel
    ctx.fillStyle = '#FEF2F2';
    drawRoundedRectPath(ctx, -395, -56, 336, 154, 24);
    ctx.fill();
    ctx.save();
    ctx.translate(-227, -4);
    ctx.scale(0.55, 0.55);
    drawSceneIcon(ctx, left.icon);
    ctx.restore();
    ctx.font = `800 26px ${FONT_DISPLAY}`;
    ctx.fillStyle = leftAccent;
    ctx.textAlign = 'center';
    ctx.fillText(left.label, -227, 68, 300);

    // Connector
    ctx.font = `800 34px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#64748B';
    ctx.fillText(
      spec.connector === 'vs' ? 'VS' : spec.connector === 'equals' ? '=' : spec.connector === 'plus' ? '+' : '→',
      0,
      14,
    );

    // Right panel
    ctx.fillStyle = '#F0FDF4';
    drawRoundedRectPath(ctx, 59, -56, 336, 154, 24);
    ctx.fill();
    ctx.save();
    ctx.translate(227, -4);
    ctx.scale(0.55, 0.55);
    drawSceneIcon(ctx, right.icon);
    ctx.restore();
    ctx.font = `800 26px ${FONT_DISPLAY}`;
    ctx.fillStyle = rightAccent;
    ctx.fillText(right.label, 227, 68, 300);
    return;
  }

  if (spec.layout === 'triple-card-grid') {
    const gap = 22;
    const count = Math.max(2, Math.min(3, motifs.length));
    const cw = count === 2 ? 370 : 272;
    const startX = -((count * cw + (count - 1) * gap) / 2);
    motifs.slice(0, count).forEach((m, i) => {
      const cx = startX + i * (cw + gap) + cw / 2;
      fillCardWithShadow(ctx, cx - cw / 2, -110, cw, 220, 28, '#FFFFFF', 0.09);
      ctx.save();
      ctx.translate(cx, -32);
      ctx.scale(0.62, 0.62);
      drawSceneIcon(ctx, m.icon);
      ctx.restore();
      ctx.font = `800 28px ${FONT_DISPLAY}`;
      ctx.fillStyle = m.accent || '#2563EB';
      ctx.textAlign = 'center';
      ctx.fillText(m.label, cx, 52, cw - 28);
      if (m.sublabel) {
        ctx.font = `600 20px ${FONT_SANS}`;
        ctx.fillStyle = '#64748B';
        ctx.fillText(m.sublabel, cx, 86, cw - 28);
      }
    });
    return;
  }

  // Hero icon formula / default dynamic composer
  const hero = motifs[0];
  fillCardWithShadow(ctx, -380, -116, 760, 232, 34, '#FFFFFF', 0.09);
  ctx.save();
  ctx.translate(-225, 0);
  const pulseScale = 0.86 + Math.sin(time * 2.5) * 0.03;
  ctx.scale(pulseScale, pulseScale);
  drawSceneIcon(ctx, hero.icon);
  ctx.restore();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  if (spec.badgeText) {
    ctx.font = `700 20px ${FONT_SANS}`;
    ctx.fillStyle = hero.accent || '#4F46E5';
    ctx.fillText(spec.badgeText.toUpperCase(), -100, -52, 430);
  }
  ctx.font = `800 34px ${FONT_DISPLAY}`;
  ctx.fillStyle = '#0F172A';
  ctx.fillText(spec.headline || hero.label, -100, 0, 440);
  if (spec.formula || spec.subtext || hero.sublabel) {
    ctx.font = `600 24px ${FONT_SANS}`;
    ctx.fillStyle = '#475569';
    ctx.fillText(spec.formula || spec.subtext || hero.sublabel || '', -100, 48, 440);
  }
}

function drawPodcastStudioScene(
  ctx: CanvasRenderingContext2D,
  data: IllustrationPropData | undefined,
  time: number,
  cues: TranscriptCue[],
) {
  const cardW = 840;
  const cardH = 368;
  fillCardWithShadow(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 32, '#0F172A', 0.24);
  ctx.strokeStyle = 'rgba(129, 140, 248, 0.38)';
  ctx.lineWidth = 2.5;
  drawRoundedRectPath(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 32);
  ctx.stroke();

  // Top studio header bar
  ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
  drawRoundedRectPath(ctx, -cardW / 2 + 16, -cardH / 2 + 16, cardW - 32, 48, 18);
  ctx.fill();

  ctx.fillStyle = '#EF4444';
  ctx.beginPath();
  ctx.arc(-cardW / 2 + 46, -cardH / 2 + 40, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `800 19px ${FONT_DISPLAY}`;
  ctx.fillStyle = '#F8FAFC';
  ctx.fillText(data?.formula || 'PODCAST STUDIO', -cardW / 2 + 68, -cardH / 2 + 40, 320);

  ctx.textAlign = 'right';
  ctx.font = `600 18px ${FONT_SANS}`;
  ctx.fillStyle = '#94A3B8';
  ctx.fillText(data?.title || 'Multi-Speaker Dialogue', cardW / 2 - 34, -cardH / 2 + 40, 380);

  // Speaker roster (2 or 3 hosts)
  const rawNodes = data?.nodes && data.nodes.length >= 2
    ? data.nodes.slice(0, 3)
    : [
        { label: data?.labels?.[0] || 'Host A', sublabel: 'Host 1', color: '#3B82F6' },
        { label: data?.labels?.[1] || 'Host B', sublabel: 'Host 2', color: '#8B5CF6' },
      ];
  const activeSpeaker = (data?.reactionText || rawNodes[0]?.label || '').trim().toLowerCase();
  const lip = computeSpeechLipSyncState(cues, time);

  const count = rawNodes.length;
  const colW = count === 2 ? 365 : 248;
  const colGap = count === 2 ? 28 : 18;
  const startX = -((count * colW + (count - 1) * colGap) / 2);

  rawNodes.forEach((spk, idx) => {
    const cx = startX + idx * (colW + colGap) + colW / 2;
    const spkAccent = spk.color || (idx === 0 ? '#3B82F6' : idx === 1 ? '#8B5CF6' : '#10B981');
    const isActive = activeSpeaker
      ? spk.label.trim().toLowerCase() === activeSpeaker ||
        activeSpeaker.includes(spk.label.trim().toLowerCase())
      : idx === 0;

    ctx.fillStyle = isActive ? 'rgba(59, 130, 246, 0.18)' : 'rgba(30, 41, 59, 0.72)';
    drawRoundedRectPath(ctx, cx - colW / 2, -104, colW, 184, 24);
    ctx.fill();
    ctx.strokeStyle = isActive ? spkAccent : 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = isActive ? 3.5 : 1.5;
    ctx.stroke();

    // Animated speaking glow ring + avatar
    if (isActive) {
      const pulse = 1 + 0.08 * Math.sin(time * 9);
      ctx.save();
      ctx.strokeStyle = hexToRgba(spkAccent, 0.45);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, -34, 48 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    drawCharacterAvatar(ctx, {
      x: cx,
      y: -36,
      shirtColor: spkAccent,
      hairColor: idx % 2 === 0 ? '#0F172A' : '#78350F',
      hairStyle: idx % 2 === 1 ? 'bob' : 'side',
      expression: isActive ? 'happy' : 'curious',
      scale: 0.62,
      lipSync: isActive ? lip : undefined,
    });

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 22px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(spk.label, cx, 26, colW - 24);

    if (isActive) {
      ctx.fillStyle = spkAccent;
      drawRoundedRectPath(ctx, cx - 64, 42, 128, 28, 14);
      ctx.fill();
      ctx.font = `800 15px ${FONT_SANS}`;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText('● ON MIC', cx, 56, 114);
    } else if (spk.sublabel) {
      ctx.font = `600 16px ${FONT_SANS}`;
      ctx.fillStyle = '#94A3B8';
      ctx.fillText(spk.sublabel, cx, 56, colW - 24);
    }
  });

  // Live animated audio spectrum footer bar
  const barCount = 26;
  const barW = 14;
  const barGap = 14;
  const waveStartX = -((barCount * barW + (barCount - 1) * barGap) / 2);
  for (let b = 0; b < barCount; b++) {
    const wave = 0.25 + 0.75 * Math.abs(Math.sin(time * 6.2 + b * 0.48) * Math.cos(time * 2.4 + b * 0.2));
    const bh = Math.round(12 + wave * 42);
    ctx.fillStyle = b % 3 === 0 ? '#60A5FA' : b % 3 === 1 ? '#A78BFA' : '#34D399';
    drawRoundedRectPath(ctx, waveStartX + b * (barW + barGap), 132 - bh / 2, barW, bh, 7);
    ctx.fill();
  }
}

function drawSentenceCard(
  ctx: CanvasRenderingContext2D,
  props: SentenceCardProps,
  width: number,
  elElapsed = 1,
) {
  const safeWidth = Math.max(260, width);
  const innerMaxW = Math.max(180, safeWidth - 88);
  const textLen = props.text.trim().length;
  const widthScale = Math.min(1, safeWidth / 760);
  const hasSections = Array.isArray(props.sections) && props.sections.length > 0;
  const baseHeadFont = hasSections
    ? textLen > 140
      ? 28
      : textLen > 85
        ? 32
        : 36
    : textLen > 95
      ? 36
      : textLen > 58
        ? 42
        : 48;
  const maxHeadFont = Math.max(20, Math.round(baseHeadFont * widthScale));

  const fittedHead = fitWrappedTextBlock(ctx, props.text, innerMaxW, hasSections ? 340 : 380, {
    fontWeight: 700,
    maxFontSize: maxHeadFont,
    minFontSize: hasSections ? 16 : 20,
    maxLines: hasSections ? 10 : 6,
    lineHeightRatio: 1.26,
  });
  let headFontSize = fittedHead.fontSize;
  let lineH = fittedHead.lineHeight;
  let lines = fittedHead.lines;

  const subFontSize = Math.max(16, Math.round((hasSections ? 22 : 25) * widthScale));
  const subLineH = Math.round(subFontSize * 1.26);
  const fittedSub = props.subtext
    ? fitWrappedTextBlock(ctx, props.subtext, innerMaxW, hasSections ? 220 : 280, {
        fontWeight: 600,
        maxFontSize: subFontSize,
        minFontSize: 12,
        maxLines: hasSections ? 6 : 9,
        lineHeightRatio: 1.24,
      })
    : null;
  let subLines = fittedSub ? fittedSub.lines : [];
  let actualSubFont = fittedSub ? fittedSub.fontSize : subFontSize;
  let actualSubLineH = fittedSub ? fittedSub.lineHeight : subLineH;

  // Responsive multi-section layout (Translation + Vocab + Grammar + Explanation — ZERO '...' truncation)
  interface MeasuredSection {
    label?: string;
    tone: 'neutral' | 'indigo' | 'amber' | 'emerald';
    fontSize: number;
    lineHeight: number;
    lines: string[];
    boxH: number;
  }
  let measuredSections: MeasuredSection[] = [];
  if (hasSections && props.sections) {
    const rawSections = props.sections.filter((s) => Boolean(s.text && s.text.trim()));
    const sectionInnerW = Math.max(160, innerMaxW - 28);
    // Iteratively find section + head font size so ALL sections fit comfortably inside maxStudyCardH
    const maxStudyCardH = 1040;
    let tryScale = 1;
    for (let attempt = 0; attempt < 6; attempt++) {
      if (attempt > 0) {
        tryScale = Math.max(0.62, tryScale - 0.08);
        const reHead = fitWrappedTextBlock(ctx, props.text, innerMaxW, Math.round(320 * tryScale), {
          fontWeight: 700,
          maxFontSize: Math.max(16, Math.round(maxHeadFont * tryScale)),
          minFontSize: 15,
          maxLines: 12,
          lineHeightRatio: 1.22,
        });
        headFontSize = reHead.fontSize;
        lineH = reHead.lineHeight;
        lines = reHead.lines;
        if (props.subtext) {
          const reSub = fitWrappedTextBlock(ctx, props.subtext, innerMaxW, 140, {
            fontWeight: 600,
            maxFontSize: Math.max(14, Math.round(subFontSize * tryScale)),
            minFontSize: 13,
            maxLines: 5,
            lineHeightRatio: 1.2,
          });
          subLines = reSub.lines;
          actualSubFont = reSub.fontSize;
          actualSubLineH = reSub.lineHeight;
        }
      }

      const secMaxFont = Math.max(14, Math.round(23 * widthScale * tryScale));
      measuredSections = rawSections.map((sec) => {
        const displayStr = sec.label ? `${sec.label}: ${sec.text.trim()}` : sec.text.trim();
        const fitted = fitWrappedTextBlock(ctx, displayStr, sectionInnerW, 240, {
          fontWeight: 600,
          fontFamily: FONT_SANS,
          maxFontSize: secMaxFont,
          minFontSize: 13,
          maxLines: 10,
          lineHeightRatio: 1.24,
        });
        const boxH = fitted.lines.length * fitted.lineHeight + 18;
        return {
          label: sec.label,
          tone: sec.tone || 'neutral',
          fontSize: fitted.fontSize,
          lineHeight: fitted.lineHeight,
          lines: fitted.lines,
          boxH,
        };
      });

      const speakerHCalc = props.speakerLabel ? 42 : 0;
      const subHCalc = subLines.length > 0 ? subLines.length * actualSubLineH + 14 : 0;
      const secHCalc = measuredSections.reduce((acc, s) => acc + s.boxH + 10, 0);
      const estTotal = lines.length * lineH + subHCalc + speakerHCalc + secHCalc + 74;
      if (estTotal <= maxStudyCardH) break;
    }
  }

  const speakerH = props.speakerLabel ? 42 : 0;
  const subH = subLines.length > 0 ? subLines.length * actualSubLineH + 16 : 0;
  const sectionsH = measuredSections.reduce((acc, s) => acc + s.boxH + 10, 0);
  const stampPad = props.stampText ? 18 : 0;
  const cardH = Math.max(
    156,
    lines.length * lineH + subH + speakerH + sectionsH + 74 + stampPad,
  );
  const x = -safeWidth / 2;
  const y = -cardH / 2;

  const cardBg = props.bgColor || '#FFFFFF';
  const isDarkBg =
    cardBg !== '#FFFFFF' &&
    (cardBg.startsWith('#0') ||
      cardBg.startsWith('#1') ||
      cardBg.startsWith('#2') ||
      cardBg.includes('rgba') ||
      cardBg.includes('15, 23, 42'));
  const defaultTextColor = props.textColor || (isDarkBg ? '#F8FAFC' : '#0F172A');

  fillCardWithShadow(ctx, x, y, safeWidth, cardH, 38, cardBg, isDarkBg ? 0.3 : 0.1);
  ctx.save();
  ctx.strokeStyle = isDarkBg ? 'rgba(148, 163, 184, 0.24)' : 'rgba(226, 232, 240, 0.95)';
  ctx.lineWidth = 2;
  drawRoundedRectPath(ctx, x, y, safeWidth, cardH, 38);
  ctx.stroke();
  ctx.restore();

  // Clip text inside the card boundary so no oversized token ever bleeds outside
  ctx.save();
  drawRoundedRectPath(ctx, x + 10, y + 8, safeWidth - 20, cardH - 16, 30);
  ctx.clip();

  // Render optional speaker label badge at top of card
  const blockH =
    speakerH +
    lines.length * lineH +
    subH +
    sectionsH;
  let cursorY = y + Math.max(30, (cardH - stampPad * 0.45 - blockH) / 2);

  if (props.speakerLabel) {
    ctx.save();
    ctx.font = `800 20px ${FONT_DISPLAY}`;
    const spW = Math.min(innerMaxW, Math.max(140, ctx.measureText(props.speakerLabel).width + 32));
    ctx.fillStyle = isDarkBg ? 'rgba(99, 102, 241, 0.28)' : '#EEF2FF';
    drawRoundedRectPath(ctx, -spW / 2, cursorY, spW, 32, 16);
    ctx.fill();
    ctx.fillStyle = isDarkBg ? '#A5B4FC' : '#4338CA';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(props.speakerLabel, 0, cursorY + 16, spW - 20);
    ctx.restore();
    cursorY += speakerH;
  }

  // Render lines with optional emphasis word + kinetic highlight pill sweep
  ctx.font = `700 ${headFontSize}px ${FONT_DISPLAY}`;
  ctx.textBaseline = 'middle';
  const startTextY = cursorY + lineH / 2;
  const emphasisLower = props.emphasisWord?.trim().toLowerCase();
  const emphColor = props.emphasisColor || (isDarkBg ? '#FACC15' : '#2563EB');
  const sweepProgress = easeOutQuint(clamp01((elElapsed - 0.1) / 0.38));

  lines.forEach((line, lineIdx) => {
    const lineY = startTextY + lineIdx * lineH;
    if (emphasisLower && line.toLowerCase().includes(emphasisLower)) {
      const lower = line.toLowerCase();
      const idx = lower.indexOf(emphasisLower);
      const before = line.slice(0, idx);
      const match = line.slice(idx, idx + emphasisLower.length);
      const after = line.slice(idx + emphasisLower.length);

      const beforeW = before ? ctx.measureText(before).width : 0;
      const matchW = ctx.measureText(match).width;
      const afterW = after ? ctx.measureText(after).width : 0;
      const pillPadX = 12;
      const gapL = before ? 4 : 0;
      const gapR = after ? 4 : 0;
      const totalW = beforeW + gapL + pillPadX * 2 + matchW + gapR + afterW;
      const fitScaleX = totalW > innerMaxW ? innerMaxW / totalW : 1;

      ctx.save();
      if (fitScaleX < 1) {
        ctx.scale(fitScaleX, 1);
      }
      let cursorX = -totalW / 2;
      ctx.textAlign = 'left';

      if (before) {
        ctx.fillStyle = defaultTextColor;
        ctx.fillText(before, cursorX, lineY);
        cursorX += beforeW + gapL;
      }

      const pillW = matchW + pillPadX * 2;
      const pillH = Math.round(headFontSize * 1.24);
      const revealW = Math.max(16, pillW * sweepProgress);
      ctx.fillStyle = hexToRgba(emphColor, isDarkBg ? 0.26 : 0.14);
      drawRoundedRectPath(ctx, cursorX, lineY - pillH / 2, revealW, pillH, 12);
      ctx.fill();

      ctx.fillStyle = emphColor;
      ctx.fillText(match, cursorX + pillPadX, lineY);
      cursorX += pillW + gapR;

      if (after) {
        ctx.fillStyle = defaultTextColor;
        ctx.fillText(after, cursorX, lineY);
      }
      ctx.restore();
    } else {
      ctx.textAlign = 'center';
      ctx.fillStyle = defaultTextColor;
      ctx.fillText(line, 0, lineY, innerMaxW);
    }
  });

  cursorY += lines.length * lineH;

  if (subLines.length > 0) {
    cursorY += 8;
    ctx.font = `600 ${actualSubFont}px ${FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = isDarkBg ? '#94A3B8' : '#475569';
    const subStartY = cursorY + actualSubLineH / 2;
    subLines.forEach((sLn, sIdx) => {
      ctx.fillText(sLn, 0, subStartY + sIdx * actualSubLineH, innerMaxW);
    });
    cursorY += subLines.length * actualSubLineH + 8;
  }

  // Structured All-in-One Study Sections
  if (measuredSections.length > 0) {
    cursorY += 6;
    const toneStyles: Record<
      'neutral' | 'indigo' | 'amber' | 'emerald',
      { bg: string; darkBg: string; text: string; darkText: string; border: string }
    > = {
      neutral: {
        bg: '#F8FAFC',
        darkBg: 'rgba(30, 41, 59, 0.85)',
        text: '#334155',
        darkText: '#E2E8F0',
        border: '#E2E8F0',
      },
      indigo: {
        bg: '#EEF2FF',
        darkBg: 'rgba(49, 46, 129, 0.45)',
        text: '#3730A3',
        darkText: '#C7D2FE',
        border: '#C7D2FE',
      },
      amber: {
        bg: '#FFFBEB',
        darkBg: 'rgba(120, 53, 15, 0.42)',
        text: '#9A3412',
        darkText: '#FDE68A',
        border: '#FDE68A',
      },
      emerald: {
        bg: '#ECFDF5',
        darkBg: 'rgba(6, 78, 59, 0.42)',
        text: '#065F46',
        darkText: '#A7F3D0',
        border: '#A7F3D0',
      },
    };

    for (const sec of measuredSections) {
      const style = toneStyles[sec.tone];
      const bx = -innerMaxW / 2;
      ctx.fillStyle = isDarkBg ? style.darkBg : style.bg;
      drawRoundedRectPath(ctx, bx, cursorY, innerMaxW, sec.boxH, 16);
      ctx.fill();
      ctx.strokeStyle = isDarkBg ? 'rgba(148, 163, 184, 0.22)' : style.border;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.font = `600 ${sec.fontSize}px ${FONT_SANS}`;
      ctx.fillStyle = isDarkBg ? style.darkText : style.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const firstLineY = cursorY + 9 + sec.lineHeight / 2;
      sec.lines.forEach((sLn, sIdx) => {
        ctx.fillText(sLn, 0, firstLineY + sIdx * sec.lineHeight, innerMaxW - 24);
      });
      cursorY += sec.boxH + 10;
    }
  }
  ctx.restore();

  // Top-right badge (check, cross, or question) with crisp white halo ring
  if (props.badge === 'check' || props.badge === 'cross' || props.badge === 'question') {
    const bx = x + safeWidth - 18;
    const by = y + 10;
    ctx.save();
    ctx.fillStyle =
      props.badge === 'check' ? '#16A34A' : props.badge === 'cross' ? '#DC2626' : '#4F46E5';
    ctx.beginPath();
    ctx.arc(bx, by, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 4;
    ctx.stroke();
    if (props.badge === 'question') {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `800 34px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', bx, by + 1);
    } else {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      if (props.badge === 'check') {
        ctx.moveTo(bx - 12, by + 1);
        ctx.lineTo(bx - 3, by + 10);
        ctx.lineTo(bx + 13, by - 9);
      } else {
        ctx.moveTo(bx - 10, by - 10);
        ctx.lineTo(bx + 10, by + 10);
        ctx.moveTo(bx + 10, by - 10);
        ctx.lineTo(bx - 10, by + 10);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Optional stamp (e.g., RUDE / AVOID) — neatly inset with crisp white border so it never clips
  if (props.stampText) {
    ctx.save();
    ctx.font = `800 24px ${FONT_DISPLAY}`;
    const pillW = Math.min(
      Math.max(116, safeWidth - 56),
      Math.max(126, ctx.measureText(props.stampText).width + 32),
    );
    const stampX = x + safeWidth - Math.max(82, pillW / 2 + 26);
    ctx.translate(stampX, y + cardH - 18);
    ctx.rotate(-0.07);
    ctx.fillStyle = props.stampColor || '#DC2626';
    drawRoundedRectPath(ctx, -pillW / 2, -22, pillW, 44, 12);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(props.stampText, 0, 1, pillW - 22);
    ctx.restore();
  }
}

function drawToneMeter(
  ctx: CanvasRenderingContext2D,
  props: ToneMeterProps,
  width: number,
  time: number,
) {
  const span = Math.max(0.1, props.animateEnd - props.animateStart);
  const progress = clamp01((time - props.animateStart) / span);
  const eased = easeInOutCubic(progress);
  const value = props.valueStart + (props.valueEnd - props.valueStart) * eased;

  // Gradient bar
  const barW = Math.max(220, width);

  // Title
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 24px ${FONT_SANS}`;
  ctx.fillStyle = '#64748B';
  ctx.fillText(props.title, 0, -48, barW);

  const barH = 22;
  const grad = ctx.createLinearGradient(-barW / 2, 0, barW / 2, 0);
  grad.addColorStop(0, '#DC2626');
  grad.addColorStop(0.5, '#F59E0B');
  grad.addColorStop(1, '#16A34A');

  ctx.fillStyle = grad;
  drawRoundedRectPath(ctx, -barW / 2, -barH / 2, barW, barH, barH / 2);
  ctx.fill();

  // Thumb
  const thumbX = -barW / 2 + barW * clamp01(value);
  ctx.save();
  ctx.shadowColor = 'rgba(15, 23, 42, 0.2)';
  ctx.shadowBlur = 16;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(thumbX, 0, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = value < 0.38 ? '#DC2626' : value > 0.65 ? '#16A34A' : '#F59E0B';
  ctx.stroke();
  ctx.restore();

  // Labels
  const labelMaxW = Math.max(80, barW * 0.44);
  ctx.font = `700 28px ${FONT_SANS}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#DC2626';
  ctx.fillText(props.leftLabel, -barW / 2, 48, labelMaxW);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#16A34A';
  ctx.fillText(props.rightLabel, barW / 2, 48, labelMaxW);
}

function drawWordStack(
  ctx: CanvasRenderingContext2D,
  props: WordStackProps,
  width: number,
  time: number,
) {
  const safeWidth = Math.max(280, width);
  const rowH = 128;
  const gap = 28;
  const totalH = props.rows.length * rowH + (props.rows.length - 1) * gap;
  const startY = -totalH / 2;

  props.rows.forEach((row, idx) => {
    if (time < row.appearAt) return;
    const p = clamp01((time - row.appearAt) / 0.34);
    const eased = easeOutQuint(p);
    const scale = 0.9 + 0.1 * eased;
    const slideY = (1 - eased) * 24;

    ctx.save();
    ctx.globalAlpha *= easeOutCubic(p);
    ctx.translate(0, startY + idx * (rowH + gap) + rowH / 2 + slideY);
    ctx.scale(scale, scale);

    fillCardWithShadow(ctx, -safeWidth / 2, -rowH / 2, safeWidth, rowH, 34, '#FFFFFF', 0.09);

    let phoneticW = 0;
    const maxPhoneticW = Math.round(safeWidth * 0.32);
    if (row.phonetic) {
      ctx.font = `600 30px ${FONT_SANS}`;
      phoneticW = Math.min(maxPhoneticW, ctx.measureText(row.phonetic).width) + 28;
    }

    const availMainW = Math.max(140, safeWidth - 112 - phoneticW);
    let mainFontSize = 66;
    while (mainFontSize > 26) {
      ctx.font = `800 ${mainFontSize}px ${FONT_DISPLAY}`;
      const w = ctx.measureText(row.prefix).width + ctx.measureText(row.suffix).width;
      if (w <= availMainW) break;
      mainFontSize -= 2;
    }

    ctx.font = `800 ${mainFontSize}px ${FONT_DISPLAY}`;
    ctx.textBaseline = 'middle';
    const prefixW = ctx.measureText(row.prefix).width;
    const suffixW = ctx.measureText(row.suffix).width;
    const fullW = prefixW + suffixW;
    const fitScaleX = fullW > availMainW ? availMainW / fullW : 1;
    const leftX = row.phonetic ? -safeWidth / 2 + 56 : -(fullW * fitScaleX) / 2;

    ctx.save();
    ctx.translate(leftX, 0);
    if (fitScaleX < 1) {
      ctx.scale(fitScaleX, 1);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0F172A';
    ctx.fillText(row.prefix, 0, 0);
    ctx.fillStyle = row.suffixColor;
    ctx.fillText(row.suffix, prefixW, 0);
    ctx.restore();

    if (row.phonetic) {
      ctx.font = `600 30px ${FONT_SANS}`;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#64748B';
      ctx.fillText(row.phonetic, safeWidth / 2 - 48, 2, maxPhoneticW);
    }

    ctx.restore();
  });
}

function adjustHex(hex: string, factor: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const nr = factor >= 1 ? clamp(r + (255 - r) * (factor - 1)) : clamp(r * factor);
  const ng = factor >= 1 ? clamp(g + (255 - g) * (factor - 1)) : clamp(g * factor);
  const nb = factor >= 1 ? clamp(b + (255 - b) * (factor - 1)) : clamp(b * factor);
  return `rgb(${nr}, ${ng}, ${nb})`;
}

function drawShape3D(
  ctx: CanvasRenderingContext2D,
  props: Shape3DProps,
  width: number,
  height: number,
  elElapsed = 1,
) {
  const x = -width / 2;
  const y = -height / 2;
  const depth = Math.max(0, props.depth ?? 10);
  const darkFill = adjustHex(props.fill, 0.72);
  const lightEdge = adjustHex(props.fill, 1.35);

  if (props.shapeType === 'cube_3d') {
    const s = Math.min(width, height) * 0.48;
    const topY = -s * 0.95;
    const midY = -s * 0.42;
    const botY = s * 0.58;
    const sideY = s * 0.08;

    ctx.save();
    if (props.shadow) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = 26;
      ctx.shadowOffsetY = 18;
    }
    // Left face (medium)
    ctx.fillStyle = props.fill;
    ctx.beginPath();
    ctx.moveTo(-s * 0.92, sideY - s * 0.48);
    ctx.lineTo(0, midY);
    ctx.lineTo(0, botY + s * 0.42);
    ctx.lineTo(-s * 0.92, sideY + s * 0.48);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Right face (dark)
    ctx.fillStyle = darkFill;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(s * 0.92, sideY - s * 0.48);
    ctx.lineTo(s * 0.92, sideY + s * 0.48);
    ctx.lineTo(0, botY + s * 0.42);
    ctx.closePath();
    ctx.fill();

    // Top face (bright)
    ctx.fillStyle = adjustHex(props.fill, 1.25);
    ctx.beginPath();
    ctx.moveTo(0, topY);
    ctx.lineTo(s * 0.92, sideY - s * 0.48);
    ctx.lineTo(0, midY);
    ctx.lineTo(-s * 0.92, sideY - s * 0.48);
    ctx.closePath();
    ctx.fill();

    if (props.highlight) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  } else if (props.shapeType === 'staircase_3d') {
    const steps = 3;
    const gap = 16;
    const stepW = (width - gap * (steps - 1)) / steps;
    const labels = props.stepLabels ?? ['Step 1', 'Step 2', 'Step 3'];

    for (let i = 0; i < steps; i++) {
      const stag = computeStaggerItemState(elElapsed, i, 0.1, 0.38);
      if (!stag.visible) continue;
      const ratio = 0.45 + i * 0.27;
      const sh = Math.max(40, height * ratio * (0.28 + 0.72 * stag.progress));
      const sx = x + i * (stepW + gap);
      const sy = y + height - sh;

      ctx.save();
      ctx.globalAlpha *= stag.opacity;

      // Extruded depth
      if (depth > 0) {
        ctx.fillStyle = darkFill;
        drawRoundedRectPath(ctx, sx, sy + depth, stepW, sh, 18);
        ctx.fill();
      }
      fillCardWithShadow(ctx, sx, sy, stepW, sh, 18, props.fill, props.shadow ? 0.25 : 0);

      // Top highlight face
      if (props.highlight) {
        ctx.fillStyle = lightEdge;
        drawRoundedRectPath(ctx, sx + 4, sy + 2, stepW - 8, 14, 7);
        ctx.fill();
      }

      const label = labels[i];
      if (label) {
        const stepMaxW = Math.max(60, stepW - 22);
        const fitted = fitWrappedTextBlock(ctx, label, stepMaxW, Math.max(28, sh - 16), {
          fontWeight: 800,
          maxFontSize: 28,
          minFontSize: 15,
          maxLines: 2,
          lineHeightRatio: 1.2,
        });
        ctx.fillStyle = props.textColor || '#FFFFFF';
        ctx.font = `800 ${fitted.fontSize}px ${FONT_DISPLAY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const ly = sy + sh / 2 - ((fitted.lines.length - 1) * fitted.lineHeight) / 2;
        fitted.lines.forEach((ln, li) =>
          ctx.fillText(ln, sx + stepW / 2, ly + li * fitted.lineHeight, stepMaxW),
        );
      }
      ctx.restore();
    }
    return;
  } else {
    const radius =
      props.shapeType === 'pill_3d'
        ? height / 2
        : props.shapeType === 'rect_3d'
          ? 12
          : Math.min(props.cornerRadius ?? 28, height / 2);

    if (props.shadow) {
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 32;
      ctx.shadowOffsetX = 6;
      ctx.shadowOffsetY = 16 + depth;
      ctx.fillStyle = darkFill;
      drawRoundedRectPath(ctx, x, y + depth, width, height, radius);
      ctx.fill();
      ctx.restore();
    }

    if (depth > 0) {
      ctx.fillStyle = darkFill;
      drawRoundedRectPath(ctx, x, y + depth, width, height, radius);
      ctx.fill();
    }

    // Specular 3D face gradient for crisp depth
    const faceGrad = ctx.createLinearGradient(x, y, x, y + height);
    faceGrad.addColorStop(0, adjustHex(props.fill, 1.14));
    faceGrad.addColorStop(0.55, props.fill);
    faceGrad.addColorStop(1, adjustHex(props.fill, 0.88));
    ctx.fillStyle = faceGrad;
    drawRoundedRectPath(ctx, x, y, width, height, radius);
    ctx.fill();

    if (props.highlight) {
      ctx.save();
      ctx.strokeStyle = lightEdge;
      ctx.lineWidth = 4;
      drawRoundedRectPath(ctx, x + 2, y + 2, width - 4, height - 4, Math.max(4, radius - 2));
      ctx.stroke();
      ctx.restore();
    }
  }

  // Render attached text content
  if (props.textContent) {
    const sizeMap = {
      display: 64,
      headline: 48,
      body: 36,
      caption: 28,
      label: 24,
    };
    const weightMap = {
      regular: 400,
      medium: 500,
      bold: 700,
      black: 800,
    };
    const fSize = sizeMap[props.textSize ?? 'headline'];
    const fWeight = weightMap[props.textWeight ?? 'bold'];
    const textMaxW = Math.max(80, width - 52);
    const textMaxH = Math.max(40, height - 20);
    const fitted = fitWrappedTextBlock(ctx, props.textContent, textMaxW, textMaxH, {
      fontWeight: fWeight,
      maxFontSize: fSize,
      minFontSize: 18,
      maxLines: 5,
      lineHeightRatio: 1.22,
    });
    ctx.font = `${fWeight} ${fitted.fontSize}px ${FONT_DISPLAY}`;
    ctx.fillStyle = props.textColor || '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const startY = -((fitted.lines.length - 1) * fitted.lineHeight) / 2;
    fitted.lines.forEach((ln, idx) => {
      ctx.fillText(ln, 0, startY + idx * fitted.lineHeight, textMaxW);
    });
  }
}

const RE_HAS_CJK_OR_HANGUL = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;
const RE_ENDS_CJK_OR_CLOSE_PUNCT = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af」』）】》〉。、！？]$/;
const RE_STARTS_CJK_OR_PUNCT = /^[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af「『（【《〈」』）】》〉。、！？]/;
const RE_ENDS_OPEN_CJK_PUNCT = /[「『（【《〈]$/;
const RE_STARTS_CLOSE_CJK_PUNCT = /^[」』）】》〉。、！？]/;

export function karaokeTokenGapPx(prevWord: string, nextWord: string, asciiSpaceW: number): number {
  if (RE_ENDS_OPEN_CJK_PUNCT.test(prevWord) || RE_STARTS_CLOSE_CJK_PUNCT.test(nextWord)) {
    return 0;
  }
  const prevCjkOnly = RE_HAS_CJK_OR_HANGUL.test(prevWord) && !/[A-Za-z0-9]/.test(prevWord);
  const nextCjkOnly = RE_HAS_CJK_OR_HANGUL.test(nextWord) && !/[A-Za-z0-9]/.test(nextWord);
  if (prevCjkOnly && nextCjkOnly) {
    return 0;
  }
  if (RE_ENDS_CJK_OR_CLOSE_PUNCT.test(prevWord) && RE_STARTS_CJK_OR_PUNCT.test(nextWord)) {
    return 2;
  }
  return asciiSpaceW;
}

export interface KaraokeWrappedLine<T extends { word: string }> {
  tokens: T[];
  lineWidth: number;
}

/**
 * Pure layout solver for karaoke subtitle lines:
 * - Preserves compact CJK / mixed CJK-punct gaps (no spaces inserted between "please?」" and "とか")
 * - Automatically shrinks fontSize slightly when wrapping would leave a tiny 1-2 char/word orphan
 *   (e.g. "か。") or overflow by 1-2 tokens onto an extra line
 * - Rebalances 2-line breaks if shrinking still requires 2 lines so the final line never holds just 1-2 chars
 */
export function layoutKaraokeTokens<T extends { word: string }>(
  words: T[],
  options: {
    baseFontSize: number;
    minFontSize?: number;
    maxLineW: number;
    linesPerPage: number;
    measureWidth: (text: string, fontSize: number) => number;
    measureSpace: (fontSize: number) => number;
  },
): {
  fontSize: number;
  allLines: KaraokeWrappedLine<T>[];
} {
  const minFont = Math.max(20, options.minFontSize ?? Math.round(options.baseFontSize * 0.72));
  const maxLineW = Math.max(160, options.maxLineW);

  const buildLinesAtSize = (fSize: number): KaraokeWrappedLine<T>[] => {
    const spaceW = Math.max(10, options.measureSpace(fSize) * 1.42);
    const out: KaraokeWrappedLine<T>[] = [];
    let cur: T[] = [];
    let curW = 0;

    for (const token of words) {
      const wW = options.measureWidth(token.word, fSize);
      const prev = cur.length > 0 ? cur[cur.length - 1].word : null;
      const sep = prev !== null ? karaokeTokenGapPx(prev, token.word, spaceW) : 0;
      const nextW = cur.length === 0 ? wW : curW + sep + wW;
      if (nextW > maxLineW && cur.length > 0) {
        out.push({ tokens: cur, lineWidth: curW });
        cur = [token];
        curW = wW;
      } else {
        cur.push(token);
        curW = nextW;
      }
    }
    if (cur.length > 0) {
      out.push({ tokens: cur, lineWidth: curW });
    }
    return out;
  };

  const lineWidthOf = (tokens: T[], fSize: number): number => {
    const spaceW = Math.max(10, options.measureSpace(fSize) * 1.42);
    let w = 0;
    for (let i = 0; i < tokens.length; i++) {
      const tw = options.measureWidth(tokens[i].word, fSize);
      const sep = i > 0 ? karaokeTokenGapPx(tokens[i - 1].word, tokens[i].word, spaceW) : 0;
      w += sep + tw;
    }
    return w;
  };

  const hasWidowLine = (lines: KaraokeWrappedLine<T>[], fSize: number): boolean => {
    if (lines.length < 2) return false;
    const last = lines[lines.length - 1];
    const prev = lines[lines.length - 2];
    const lastCharCount = last.tokens.map((t) => t.word).join('').replace(/\s+/g, '').length;
    if (lastCharCount <= 3) return true;
    if (
      last.tokens.length === 1 &&
      prev.tokens.length >= 3 &&
      last.lineWidth < Math.max(prev.lineWidth * 0.48, fSize * 6.5)
    ) {
      return true;
    }
    if (
      last.tokens.length <= 2 &&
      prev.tokens.length >= 4 &&
      last.lineWidth < Math.max(prev.lineWidth * 0.42, fSize * 4.5)
    ) {
      return true;
    }
    return false;
  };

  let fontSize = Math.max(minFont, options.baseFontSize);
  while (fontSize > minFont) {
    const hasWideWord = words.some((tok) => options.measureWidth(tok.word, fontSize) > maxLineW);
    if (!hasWideWord) break;
    fontSize -= 2;
  }

  let bestLines = buildLinesAtSize(fontSize);
  const initialLinesCount = bestLines.length;
  const initialWidow = hasWidowLine(bestLines, fontSize);
  const initialExceedsPage = initialLinesCount > options.linesPerPage;

  // Auto-shrink slightly to prevent pushing 1-2 orphan chars/words onto a new line or new page
  if ((initialWidow || initialExceedsPage) && fontSize > minFont) {
    for (let trial = fontSize - 2; trial >= minFont; trial -= 2) {
      const candidate = buildLinesAtSize(trial);
      const fitsFewerLines = candidate.length < initialLinesCount;
      const clearedWidow = initialWidow && !hasWidowLine(candidate, trial);
      const fitsSinglePage = initialExceedsPage && candidate.length <= options.linesPerPage;
      if (fitsSinglePage || (fitsFewerLines && !hasWidowLine(candidate, trial)) || clearedWidow) {
        fontSize = trial;
        bestLines = candidate;
        if (!hasWidowLine(candidate, trial) && candidate.length <= options.linesPerPage) {
          break;
        }
      }
    }
  }

  // If a multi-line sentence still has a tiny widow tail after modest shrinking, pull 1-2 tokens down to balance lines
  if (bestLines.length >= 2 && hasWidowLine(bestLines, fontSize)) {
    const lastIdx = bestLines.length - 1;
    const prevTokens = [...bestLines[lastIdx - 1].tokens];
    const lastTokens = [...bestLines[lastIdx].tokens];
    while (prevTokens.length >= 3 && lastTokens.length < 3) {
      const moved = prevTokens.pop()!;
      const candidateLast = [moved, ...lastTokens];
      const candW = lineWidthOf(candidateLast, fontSize);
      if (candW > maxLineW) {
        prevTokens.push(moved);
        break;
      }
      lastTokens.unshift(moved);
      const charCount = lastTokens.map((t) => t.word).join('').replace(/\s+/g, '').length;
      if (charCount >= 5 && lastTokens.length >= 2) break;
    }
    bestLines[lastIdx - 1] = {
      tokens: prevTokens,
      lineWidth: lineWidthOf(prevTokens, fontSize),
    };
    bestLines[lastIdx] = {
      tokens: lastTokens,
      lineWidth: lineWidthOf(lastTokens, fontSize),
    };
  }

  return { fontSize, allLines: bestLines };
}

function drawKaraokeCard(
  ctx: CanvasRenderingContext2D,
  props: KaraokeCardProps,
  width: number,
  time: number,
  renderOpts?: {
    subtitleConfig?: SubtitleDisplayConfig;
    stageW?: number;
    stageH?: number;
    compositionId?: LayoutCompositionId;
    hasDarkStage?: boolean;
  },
) {
  const words = props.words;
  if (words.length === 0) return;

  const stageW = renderOpts?.stageW ?? STAGE_WIDTH;
  const stageH = renderOpts?.stageH ?? STAGE_HEIGHT;
  const subCfg = renderOpts?.subtitleConfig;
  const isPlain = renderOpts?.compositionId === 'plain' || props.variant === 'plain-shadow';
  const isYellowPill = props.variant === 'yellow-pill';
  const boxStyle = subCfg?.boxStyle ?? (isPlain ? 'clean' : 'card');
  const isCleanBox = boxStyle === 'clean' && !isYellowPill;
  const isDarkBar = props.variant === 'dark-bar' || isPlain;

  const minDim = Math.min(stageW, stageH);
  const defaultSize = isPlain ? 'lg' : 'md';
  const sizeKey = subCfg?.size ?? defaultSize;
  const sizeMul =
    sizeKey === 'sm' ? 0.78 : sizeKey === 'lg' ? 1.24 : sizeKey === 'xl' ? 1.48 : 1.0;

  const maxAllowedW = Math.max(320, Math.round(stageW * (isCleanBox ? 0.88 : 0.92)));
  const safeWidth = Math.min(maxAllowedW, Math.max(width, isCleanBox ? Math.round(stageW * 0.82) : width));
  const maxLineW = Math.max(220, isCleanBox ? safeWidth - 36 : safeWidth - 104);

  const hasHelperNote = Boolean(props.helperText?.trim());
  const baseFont =
    stageW >= 1600
      ? Math.round(minDim * (hasHelperNote && (subCfg?.position ?? 'bottom') !== 'center' ? 0.041 : 0.046))
      : Math.round(minDim * 0.043);
  const startFontSize = Math.max(26, Math.min(88, Math.round(baseFont * sizeMul)));
  const linesPerPage = isPlain && (subCfg?.position ?? 'center') === 'center' ? 3 : 2;

  let cachedMeasureFontSize = -1;
  const ensureMeasureFont = (fSize: number) => {
    if (cachedMeasureFontSize !== fSize) {
      ctx.font = `700 ${fSize}px ${FONT_DISPLAY}`;
      cachedMeasureFontSize = fSize;
    }
  };

  const solved = layoutKaraokeTokens(words, {
    baseFontSize: startFontSize,
    minFontSize: Math.max(22, Math.round(startFontSize * 0.72)),
    maxLineW,
    linesPerPage,
    measureWidth: (text, fSize) => {
      ensureMeasureFont(fSize);
      return ctx.measureText(text).width;
    },
    measureSpace: (fSize) => {
      ensureMeasureFont(fSize);
      return ctx.measureText(' ').width;
    },
  });

  const fontSize = solved.fontSize;
  const allLines = solved.allLines;
  ctx.font = `700 ${fontSize}px ${FONT_DISPLAY}`;
  const asciiSpaceW = Math.max(10, ctx.measureText(' ').width * 1.42);
  const gapBetween = (a: string, b: string) => karaokeTokenGapPx(a, b, asciiSpaceW);

  // Group into pages (up to 3 lines when centered/clean so multi-clause sentences breathe naturally)
  const pages: { tokens: typeof words; lineWidth: number }[][] = [];
  for (let i = 0; i < allLines.length; i += linesPerPage) {
    pages.push(allLines.slice(i, i + linesPerPage));
  }

  let activePageIdx = 0;
  if (pages.length > 1) {
    const foundIdx = pages.findIndex((page) => {
      const first = page[0]?.tokens[0];
      const lastLine = page[page.length - 1];
      const last = lastLine?.tokens[lastLine.tokens.length - 1];
      return first && last && time <= last.end + 0.02;
    });
    activePageIdx = foundIdx === -1 ? pages.length - 1 : foundIdx;
  }

  const lines = pages[activePageIdx] ?? allLines.slice(0, linesPerPage);
  const activeMaxLineW = Math.max(160, ...lines.map((l) => l.lineWidth));
  const pillW = Math.min(safeWidth, Math.max(300, Math.round(activeMaxLineW + 104)));
  const lineH = Math.round(fontSize * 1.38);

  // Optional helper text below the karaoke line (vocab meanings, grammar note, or source prompt in Plain mode)
  const helperLines: string[] = [];
  const helperFontSize = Math.max(20, Math.round(fontSize * 0.54));
  const helperLineH = Math.round(helperFontSize * 1.38);
  const helperGap = Math.max(28, Math.round(fontSize * 0.5));
  if (props.helperText?.trim()) {
    ctx.font = `600 ${helperFontSize}px ${FONT_SANS}`;
    const rawParas = props.helperText.trim().split(/\r?\n/);
    const maxHelperW = Math.max(240, maxLineW);
    for (const para of rawParas) {
      const pWords = para.trim().split(/\s+/).filter(Boolean);
      let lineBuf = '';
      for (const pw of pWords) {
        const candidate = lineBuf ? `${lineBuf} ${pw}` : pw;
        if (ctx.measureText(candidate).width <= maxHelperW) {
          lineBuf = candidate;
        } else {
          if (lineBuf) helperLines.push(lineBuf);
          lineBuf = pw;
        }
      }
      if (lineBuf) helperLines.push(lineBuf);
      if (helperLines.length >= 4) break;
    }
  }
  const helperBlockH =
    helperLines.length > 0 ? helperGap + helperLines.slice(0, 4).length * helperLineH : 0;

  const mainTextH = lines.length * lineH;
  const totalContentH = mainTextH + helperBlockH;
  const cardH = Math.max(112, totalContentH + (isCleanBox ? 32 : 56));
  const cardRadius = isYellowPill
    ? 28
    : boxStyle === 'pill' && lines.length === 1 && helperLines.length === 0
      ? Math.round(cardH / 2)
      : isDarkBar
        ? 28
        : lines.length === 1 && helperLines.length === 0
          ? Math.round(cardH / 2)
          : 34;
  const x = -pillW / 2;
  const y = -cardH / 2;

  if (!isCleanBox) {
    if (isYellowPill) {
      const yGrad = ctx.createLinearGradient(x, y, x, y + cardH);
      yGrad.addColorStop(0, '#FDE047');
      yGrad.addColorStop(1, '#FACC15');
      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.18)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = yGrad;
      drawRoundedRectPath(ctx, x, y, pillW, cardH, cardRadius);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = '#EAB308';
      ctx.lineWidth = 2.5;
      drawRoundedRectPath(ctx, x, y, pillW, cardH, cardRadius);
      ctx.stroke();
      ctx.restore();
    } else {
      fillCardWithShadow(
        ctx,
        x,
        y,
        pillW,
        cardH,
        cardRadius,
        isDarkBar ? 'rgba(15, 23, 42, 0.84)' : '#FFFFFF',
        isDarkBar ? 0.28 : 0.11,
      );
      ctx.save();
      ctx.strokeStyle = isDarkBar ? 'rgba(148, 163, 184, 0.28)' : '#E2E8F0';
      ctx.lineWidth = 2;
      drawRoundedRectPath(ctx, x, y, pillW, cardH, cardRadius);
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.font = `700 ${fontSize}px ${FONT_DISPLAY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const startY = -totalContentH / 2 + lineH / 2;

  const useDarkBackdropInk = renderOpts?.hasDarkStage ?? true;
  const isLightClean = isCleanBox && !useDarkBackdropInk;

  const activeWordColor = isCleanBox
    ? isLightClean
      ? props.activeColor === '#FACC15' || props.activeColor === '#93C5FD'
        ? '#4F46E5'
        : props.activeColor
      : props.activeColor === '#2563EB' || props.activeColor === '#16A34A'
        ? '#FACC15'
        : props.activeColor
    : props.activeColor;
  const spokenWordColor = isCleanBox
    ? isLightClean
      ? '#0F172A'
      : '#FFFFFF'
    : props.spokenColor;
  const inactiveWordColor = isCleanBox
    ? isLightClean
      ? 'rgba(51, 65, 85, 0.58)'
      : 'rgba(241, 245, 249, 0.82)'
    : props.inactiveColor;

  lines.forEach((line, lineIdx) => {
    let cursorX = -line.lineWidth / 2;
    const lineY = startY + lineIdx * lineH;

    line.tokens.forEach((token, tIdx) => {
      const isActive = time >= token.start && time <= token.end;
      const isSpoken = time > token.end;
      const tokenW = ctx.measureText(token.word).width;

      if (isCleanBox) {
        ctx.save();
        if (isLightClean) {
          ctx.shadowColor = 'rgba(255, 255, 255, 0.65)';
          ctx.shadowBlur = 8;
          ctx.shadowOffsetY = 1;
        } else {
          ctx.shadowColor = 'rgba(2, 6, 23, 0.85)';
          ctx.shadowBlur = 12;
          ctx.shadowOffsetY = 3;
          ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.065));
          ctx.strokeStyle = 'rgba(2, 6, 23, 0.62)';
        }
        if (isActive) {
          ctx.translate(cursorX + tokenW / 2, lineY);
          ctx.scale(1.06, 1.06);
          ctx.textAlign = 'center';
          if (!isLightClean) ctx.strokeText(token.word, 0, 0);
          ctx.fillStyle = token.highlightColor || activeWordColor;
          ctx.fillText(token.word, 0, 0);
        } else {
          if (!isLightClean) ctx.strokeText(token.word, cursorX, lineY);
          ctx.fillStyle = isSpoken ? spokenWordColor : inactiveWordColor;
          ctx.fillText(token.word, cursorX, lineY);
        }
        ctx.restore();
      } else if (isActive) {
        ctx.save();
        ctx.fillStyle = token.highlightColor || activeWordColor;
        ctx.translate(cursorX + tokenW / 2, lineY);
        ctx.scale(1.04, 1.04);
        ctx.textAlign = 'center';
        ctx.fillText(token.word, 0, 0);
        ctx.restore();
      } else {
        ctx.fillStyle = isSpoken ? spokenWordColor : inactiveWordColor;
        ctx.fillText(token.word, cursorX, lineY);
      }

      const nextTok = line.tokens[tIdx + 1];
      cursorX += tokenW + (nextTok ? gapBetween(token.word, nextTok.word) : 0);
    });
  });

  if (helperLines.length > 0) {
    ctx.save();
    ctx.font = `600 ${helperFontSize}px ${FONT_SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const helperStartY =
      startY + (lines.length - 1) * lineH + lineH * 0.5 + helperGap + helperLineH / 2;
    helperLines.slice(0, 4).forEach((hl, hIdx) => {
      const hy = helperStartY + hIdx * helperLineH;
      if (isCleanBox) {
        if (isLightClean) {
          ctx.fillStyle = '#475569';
        } else {
          ctx.shadowColor = 'rgba(2, 6, 23, 0.88)';
          ctx.shadowBlur = 8;
          ctx.shadowOffsetY = 2;
          ctx.fillStyle = 'rgba(226, 232, 240, 0.94)';
        }
      } else {
        ctx.fillStyle = isDarkBar ? 'rgba(226, 232, 240, 0.88)' : '#475569';
      }
      ctx.fillText(hl, 0, hy, maxLineW);
    });
    ctx.restore();
  }
}

export function renderIllustrationVariantThumbnail(
  ctx: CanvasRenderingContext2D,
  variant: string,
  width: number,
  height: number,
  time = 0.6,
  primitivesOverride?: VectorPrimitive[],
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = variant === 'cartoon-host' ? '#93DCFC' : '#F8FAFC';
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(width / 2, height / 2);
  const scale =
    variant === 'cartoon-host'
      ? Math.min(width / 460, height / 760)
      : Math.min(width / 920, height / 340);
  ctx.scale(scale, scale);

  if (primitivesOverride && primitivesOverride.length > 0) {
    drawVectorPrimitives(ctx, primitivesOverride, time, (icon) => drawSceneIcon(ctx, icon));
  } else {
    drawIllustrationProp(ctx, { kind: 'illustration-prop', variant }, time);
  }
  ctx.restore();
}

export function renderCartoonHostPreviewFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  spec: Partial<CartoonAnimationParams>,
  isSpeaking = true,
): void {
  ctx.clearRect(0, 0, width, height);
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#7DD3FC');
  grad.addColorStop(0.7, '#BAE6FD');
  grad.addColorStop(1, '#E0F2FE');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  const syntheticCues: TranscriptCue[] = isSpeaking
    ? [
        {
          id: 'preview-cue',
          start: 0,
          end: 999,
          text: 'Hey look how amazing this natural English phrase is!',
          words: [],
        },
      ]
    : [];

  ctx.save();
  ctx.translate(width / 2, height * 0.56);
  const scale = Math.min(width / 520, height / 760);
  ctx.scale(scale, scale);
  drawCartoonHostCharacter(ctx, time, syntheticCues, undefined, {
    explicitMood: spec.mood,
    customSpec: spec,
  });
  ctx.restore();
}

let staticBackdropCache: { key: string; canvas: HTMLCanvasElement } | null = null;

function drawBaseThemeBackdrop(
  targetCtx: CanvasRenderingContext2D,
  palette: ThemePalette,
  stageW: number,
  stageH: number,
  isCartoonBackdrop: boolean,
) {
  if (isCartoonBackdrop) {
    const skyGrad = targetCtx.createLinearGradient(0, 0, 0, stageH);
    skyGrad.addColorStop(0, '#78C6FF');
    skyGrad.addColorStop(0.55, '#59B2FF');
    skyGrad.addColorStop(1, '#82CCFF');
    targetCtx.fillStyle = skyGrad;
    targetCtx.fillRect(0, 0, stageW, stageH);

    targetCtx.save();
    const centerGlow = targetCtx.createRadialGradient(
      stageW * 0.5,
      stageH * 0.54,
      60,
      stageW * 0.5,
      stageH * 0.54,
      stageW * 0.72,
    );
    centerGlow.addColorStop(0, 'rgba(255, 255, 255, 0.20)');
    centerGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    targetCtx.fillStyle = centerGlow;
    targetCtx.fillRect(0, 0, stageW, stageH);
    targetCtx.restore();
    return;
  }

  const bgGrad = targetCtx.createLinearGradient(0, 0, 0, stageH);
  bgGrad.addColorStop(0, palette.bgTop);
  bgGrad.addColorStop(1, palette.bgBottom);
  targetCtx.fillStyle = bgGrad;
  targetCtx.fillRect(0, 0, stageW, stageH);

  const g1x = Math.round(stageW * 0.19);
  const g1y = Math.round(stageH * 0.17);
  const glow1 = targetCtx.createRadialGradient(
    g1x,
    g1y,
    40,
    g1x,
    g1y,
    Math.round(Math.max(stageW, stageH) * 0.34),
  );
  glow1.addColorStop(0, palette.glowA);
  glow1.addColorStop(1, 'rgba(255,255,255,0)');
  targetCtx.fillStyle = glow1;
  targetCtx.fillRect(0, 0, stageW, stageH);

  const g2x = Math.round(stageW * 0.81);
  const g2y = Math.round(stageH * 0.74);
  const glow2 = targetCtx.createRadialGradient(
    g2x,
    g2y,
    40,
    g2x,
    g2y,
    Math.round(Math.max(stageW, stageH) * 0.36),
  );
  glow2.addColorStop(0, palette.glowB);
  glow2.addColorStop(1, 'rgba(255,255,255,0)');
  targetCtx.fillStyle = glow2;
  targetCtx.fillRect(0, 0, stageW, stageH);
}

export function renderProjectFrame(
  ctx: CanvasRenderingContext2D,
  project: LessonProject,
  time: number,
  selectedElementId?: string | null,
) {
  const palette = CANVAS_THEMES[project.theme] || CANVAS_THEMES['pastel-sunrise'];
  const stage = getStageDimensionsForAspect(project.aspectRatio);
  const stageW = stage.width;
  const stageH = stage.height;

  const introSec = getEffectiveIntroSeconds(project);
  const outroSec = getEffectiveOutroSeconds(project);
  const lessonTime = Math.max(0, time - introSec);

  // Determine whether learning content is currently on screen so background dims softly for readability
  const isLearningMomentActive =
    time >= introSec &&
    project.elements.some((el) => {
      if (lessonTime < el.startTime || lessonTime > el.endTime) return false;
      if (el.type === 'karaoke-card' || el.type === 'sentence-card') return true;
      return false;
    });

  const bg = project.backgroundImage;
  const isCartoonBackdrop = project.compositionId === 'cartoon-host' && !bg;
  const staticBgImg =
    bg && !(bg.kind === 'preset' || (!bg.kind && bg.presetId && !bg.dataUrl && !bg.videoUrl)) && !(bg.kind === 'video' && bg.videoUrl) && bg.dataUrl
      ? getCachedBgImage(bg.dataUrl)
      : null;

  const canCacheBackdrop =
    typeof document !== 'undefined' &&
    (!bg || Boolean(staticBgImg));

  if (canCacheBackdrop) {
    const baseScrim = bg ? bg.scrimOpacity ?? 0.22 : 0;
    const focusScrim = bg
      ? bg.learningScrimOpacity ?? Math.min(0.85, Math.max(baseScrim, baseScrim + 0.2))
      : 0;
    const effectiveScrim = bg ? clamp01(isLearningMomentActive ? focusScrim : baseScrim) : 0;
    const bgCacheKey = [
      stageW,
      stageH,
      project.theme,
      isCartoonBackdrop ? 'cartoon' : 'std',
      bg?.dataUrl ? `${bg.dataUrl.slice(0, 64)}:${bg.dataUrl.length}:${bg.fit || 'cover'}:${effectiveScrim.toFixed(2)}` : 'none',
    ].join('|');

    if (!staticBackdropCache || staticBackdropCache.key !== bgCacheKey) {
      const offscreen =
        staticBackdropCache?.canvas &&
        staticBackdropCache.canvas.width === stageW &&
        staticBackdropCache.canvas.height === stageH
          ? staticBackdropCache.canvas
          : document.createElement('canvas');
      offscreen.width = stageW;
      offscreen.height = stageH;
      const offCtx = offscreen.getContext('2d');
      if (offCtx) {
        drawBaseThemeBackdrop(offCtx, palette, stageW, stageH, isCartoonBackdrop);
        if (staticBgImg) {
          offCtx.save();
          drawLoadedImageCover(
            offCtx,
            staticBgImg,
            staticBgImg.naturalWidth || stageW,
            staticBgImg.naturalHeight || stageH,
            stageW,
            stageH,
            bg?.fit || 'cover',
          );
          offCtx.restore();
          if (effectiveScrim > 0.01) {
            offCtx.save();
            offCtx.fillStyle = `rgba(10, 15, 28, ${effectiveScrim})`;
            offCtx.fillRect(0, 0, stageW, stageH);
            offCtx.restore();
          }
        }
        staticBackdropCache = { key: bgCacheKey, canvas: offscreen };
      }
    }

    if (staticBackdropCache && staticBackdropCache.key === bgCacheKey) {
      ctx.drawImage(staticBackdropCache.canvas, 0, 0);
    } else {
      drawBaseThemeBackdrop(ctx, palette, stageW, stageH, isCartoonBackdrop);
    }
  } else {
    drawBaseThemeBackdrop(ctx, palette, stageW, stageH, isCartoonBackdrop);
  }

  const drawWatermarkCornerOverlay = () => {
    const wm = project.watermark;
    if (!wm || !wm.watermarkEnabled || !wm.watermarkText.trim()) return;
    const wmText = wm.watermarkText.trim();
    ctx.save();
    ctx.globalAlpha = Math.max(0.15, Math.min(1, wm.watermarkOpacity ?? 0.65));
    ctx.font = '700 24px "Plus Jakarta Sans", "Inter", sans-serif';
    const tw = ctx.measureText(wmText).width;
    const boxW = Math.min(stageW - 80, tw + 36);
    const boxH = 48;
    const padX = 36;
    const padY = 44;
    const x =
      wm.watermarkCorner === 'top-left' || wm.watermarkCorner === 'bottom-left'
        ? padX
        : stageW - padX - boxW;
    const y =
      wm.watermarkCorner === 'top-left' || wm.watermarkCorner === 'top-right'
        ? padY
        : stageH - padY - boxH;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.58)';
    drawRoundedRectPath(ctx, x, y, boxW, boxH, 14);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(wmText, x + 18, y + boxH / 2, boxW - 36);
    ctx.restore();
  };

  // Dynamic preset / uploaded video / uncached image background
  if (bg && !canCacheBackdrop) {
    let drewCustomBg = false;
    if ((bg.kind === 'preset' || (!bg.kind && bg.presetId && !bg.dataUrl && !bg.videoUrl)) && bg.presetId) {
      const presetMeta = getBackgroundPresetMeta(bg.presetId);
      const presetImg = presetMeta?.assetUrl ? getCachedBgImage(presetMeta.assetUrl) : null;
      if (presetImg) {
        const gentleZoom = 1 + 0.022 * (1 - Math.cos(Math.max(0, time) * 0.2));
        ctx.save();
        drawLoadedImageCover(
          ctx,
          presetImg,
          presetImg.naturalWidth || stageW,
          presetImg.naturalHeight || stageH,
          stageW,
          stageH,
          bg.fit || 'cover',
          gentleZoom,
        );
        ctx.restore();
        drawPresetBackground(ctx, bg.presetId, stageW, stageH, time, { overlayOnly: true });
      } else {
        drawPresetBackground(ctx, bg.presetId, stageW, stageH, time);
      }
      drewCustomBg = true;
    } else if (bg.kind === 'video' && bg.videoUrl) {
      const vid = getCachedBgVideo(bg.videoUrl);
      if (vid && vid.videoWidth > 0) {
        if (vid.readyState >= 2 && Number.isFinite(vid.duration) && vid.duration > 0.05) {
          const wrapped = ((Math.max(0, time) % vid.duration) + vid.duration) % vid.duration;
          if (Math.abs(vid.currentTime - wrapped) > 0.08 && !vid.seeking) {
            try {
              vid.currentTime = wrapped;
            } catch {
              // ignore seek throttle
            }
          }
        }
        ctx.save();
        drawLoadedImageCover(
          ctx,
          vid,
          vid.videoWidth,
          vid.videoHeight,
          stageW,
          stageH,
          bg.fit || 'cover',
        );
        ctx.restore();
        drewCustomBg = true;
      }
    } else if (bg.dataUrl) {
      const img = getCachedBgImage(bg.dataUrl);
      if (img) {
        ctx.save();
        drawLoadedImageCover(
          ctx,
          img,
          img.naturalWidth || stageW,
          img.naturalHeight || stageH,
          stageW,
          stageH,
          bg.fit || 'cover',
        );
        ctx.restore();
        drewCustomBg = true;
      }
    }

    if (drewCustomBg) {
      const baseScrim = bg.scrimOpacity ?? (bg.kind === 'preset' ? 0.16 : 0.22);
      const focusScrim =
        bg.learningScrimOpacity ??
        Math.min(0.85, Math.max(baseScrim, baseScrim + 0.2));
      const effectiveScrim = clamp01(isLearningMomentActive ? focusScrim : baseScrim);
      if (effectiveScrim > 0.01) {
        ctx.save();
        ctx.fillStyle = `rgba(10, 15, 28, ${effectiveScrim})`;
        ctx.fillRect(0, 0, stageW, stageH);
        ctx.restore();
      }
    }
  }

  // Optional Intro Card overlay during [0, introSec)
  if (introSec > 0 && time < introSec) {
    const wm = project.watermark;
    const enterP = easeOutQuint(clamp01(time / 0.42));
    const exitFade = time > introSec - 0.32 ? clamp01((introSec - time) / 0.32) : 1;
    const cardAlpha = enterP * exitFade;
    const badgeText = wm?.introBadge?.trim() || 'BÀI HỌC HÔM NAY';
    const introTitle = wm?.introTitle?.trim() || project.title || 'English Practice';
    const introSubtitle =
      wm?.introSubtitle?.trim() || `${project.cues.length} câu hội thoại thực tế`;

    ctx.save();
    ctx.fillStyle = palette.isDark
      ? 'rgba(15, 23, 42, 0.62)'
      : 'rgba(15, 23, 42, 0.36)';
    ctx.fillRect(0, 0, stageW, stageH);

    const cardW = Math.min(stageW - 96, 860);
    const maxTitleW = cardW - 96;
    const fittedTitle = fitWrappedTextBlock(ctx, introTitle, maxTitleW, 340, {
      fontWeight: 800,
      maxFontSize: (project.aspectRatio || '9:16') === '16:9' ? 54 : 50,
      minFontSize: 28,
      maxLines: 4,
      lineHeightRatio: 1.18,
    });
    const fittedSub = introSubtitle
      ? fitWrappedTextBlock(ctx, introSubtitle, maxTitleW, 130, {
          fontWeight: 600,
          maxFontSize: 28,
          minFontSize: 18,
          maxLines: 2,
          lineHeightRatio: 1.3,
        })
      : null;

    const cardH =
      148 +
      fittedTitle.lines.length * fittedTitle.lineHeight +
      (fittedSub ? fittedSub.lines.length * fittedSub.lineHeight + 28 : 0);
    const cardX = (stageW - cardW) / 2;
    const cardY = (stageH - cardH) / 2 + (1 - enterP) * 28;

    ctx.globalAlpha = cardAlpha;
    fillCardWithShadow(
      ctx,
      cardX,
      cardY,
      cardW,
      cardH,
      36,
      palette.isDark ? '#1E293B' : '#FFFFFF',
      0.24,
    );
    ctx.strokeStyle = palette.isDark ? 'rgba(148, 163, 184, 0.35)' : 'rgba(99, 102, 241, 0.25)';
    ctx.lineWidth = 3;
    drawRoundedRectPath(ctx, cardX, cardY, cardW, cardH, 36);
    ctx.stroke();

    // Badge pill
    ctx.font = `800 22px ${FONT_SANS}`;
    const bw = Math.min(cardW - 80, ctx.measureText(badgeText).width + 48);
    const bx = stageW / 2 - bw / 2;
    const by = cardY + 34;
    ctx.fillStyle = palette.accentBlue || '#4F46E5';
    drawRoundedRectPath(ctx, bx, by, bw, 46, 23);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, stageW / 2, by + 23, bw - 24);

    // Main title
    let textCursorY = by + 78 + fittedTitle.lineHeight / 2;
    ctx.font = `800 ${fittedTitle.fontSize}px ${FONT_DISPLAY}`;
    ctx.fillStyle = palette.isDark ? '#F8FAFC' : '#0F172A';
    fittedTitle.lines.forEach((ln) => {
      ctx.fillText(ln, stageW / 2, textCursorY, maxTitleW);
      textCursorY += fittedTitle.lineHeight;
    });

    if (fittedSub) {
      textCursorY += 12;
      ctx.font = `600 ${fittedSub.fontSize}px ${FONT_SANS}`;
      ctx.fillStyle = palette.isDark ? '#CBD5E1' : '#475569';
      fittedSub.lines.forEach((ln) => {
        ctx.fillText(ln, stageW / 2, textCursorY, maxTitleW);
        textCursorY += fittedSub.lineHeight;
      });
    }

    // Smooth bottom progress bar
    const progW = Math.min(260, cardW * 0.44);
    const progX = stageW / 2 - progW / 2;
    const progY = cardY + cardH - 34;
    ctx.fillStyle = palette.isDark ? 'rgba(255,255,255,0.16)' : 'rgba(15, 23, 42, 0.1)';
    drawRoundedRectPath(ctx, progX, progY, progW, 8, 4);
    ctx.fill();
    ctx.fillStyle = palette.accentBlue || '#4F46E5';
    drawRoundedRectPath(ctx, progX, progY, Math.max(12, progW * clamp01(time / introSec)), 8, 4);
    ctx.fill();
    ctx.restore();

    drawWatermarkCornerOverlay();
    return;
  }

  // 2. Sort elements by zIndex & resolve aspect layout
  const sorted = [...project.elements].sort((a, b) => a.layout.zIndex - b.layout.zIndex);
  const layoutMap = resolveElementLayoutForAspect(
    sorted,
    lessonTime,
    project.aspectRatio,
    project.subtitleConfig,
    project.compositionId,
  );

  const isCartoonStage =
    project.compositionId === 'cartoon-host' ||
    sorted.some(
      (el) => el.props.kind === 'illustration-prop' && el.props.variant === 'cartoon-host',
    );
  const cartoonHostContext = isCartoonStage
    ? computeCartoonHostContextFromElements(sorted, lessonTime, project.cues, project.aspectRatio)
    : undefined;

  if (shouldRenderLessonTitle(project, time)) {
    drawCartoonHostHeadline(
      ctx,
      project,
      project.aspectRatio || '9:16',
      time,
      selectedElementId === '__title__',
    );
  }

  for (const el of sorted) {
    const frame = computeElementFrameState(el, lessonTime);
    if (!frame.visible) continue;

    const activeLayout = layoutMap.get(el.id) || el.layout;
    const activeScale = frame.scale * ((activeLayout.scale || 1) / Math.max(0.1, el.layout.scale || 1));

    const isCartoonHostEl =
      el.props.kind === 'illustration-prop' && el.props.variant === 'cartoon-host';
    const clampedWidth = Math.min(stageW - 32, Math.max(120, activeLayout.width || 600));
    const halfBoundsW = isCartoonHostEl
      ? Math.min(180 * activeScale, stageW * 0.34)
      : (clampedWidth * activeScale) / 2;
    const drawX = isCartoonHostEl
      ? Math.max(90, Math.min(stageW - 90, activeLayout.x))
      : halfBoundsW * 2 >= stageW - 32
        ? stageW / 2
        : Math.max(halfBoundsW + 16, Math.min(stageW - halfBoundsW - 16, activeLayout.x));

    ctx.save();
    ctx.globalAlpha = frame.opacity;
    ctx.translate(drawX, activeLayout.y + frame.translateY);
    ctx.scale(activeScale, activeScale);

    switch (el.props.kind) {
      case 'comparison-strip':
        drawComparisonStrip(ctx, el.props, clampedWidth, lessonTime, el.startTime);
        break;
      case 'topic-pill':
        drawTopicPill(ctx, el.props, clampedWidth);
        break;
      case 'illustration-prop': {
        const hasCustomPrims =
          Boolean(el.props.data?.customPrimitives?.length) ||
          Boolean(getCustomComponentByVariant(el.props.variant)?.primitives?.length);
        const fitScale =
          !isCartoonHostEl && !hasCustomPrims && (clampedWidth < 840 || (activeLayout.height && activeLayout.height < 280))
            ? Math.max(
                0.45,
                Math.min(
                  1,
                  clampedWidth / 860,
                  activeLayout.height ? activeLayout.height / 280 : 1,
                ),
              )
            : 1;
        if (fitScale < 0.999) {
          ctx.save();
          ctx.scale(fitScale, fitScale);
          drawIllustrationProp(
            ctx,
            el.props,
            lessonTime,
            el.startTime,
            project.cues,
            el.props.variant === 'cartoon-host' ? cartoonHostContext : undefined,
          );
          ctx.restore();
        } else {
          drawIllustrationProp(
            ctx,
            el.props,
            lessonTime,
            el.startTime,
            project.cues,
            el.props.variant === 'cartoon-host' ? cartoonHostContext : undefined,
          );
        }
        break;
      }
      case 'sentence-card':
        drawSentenceCard(ctx, el.props, clampedWidth, Math.max(0, lessonTime - el.startTime));
        break;
      case 'tone-meter':
        drawToneMeter(ctx, el.props, clampedWidth, lessonTime);
        break;
      case 'word-stack':
        drawWordStack(ctx, el.props, clampedWidth, lessonTime);
        break;
      case 'shape-3d':
        drawShape3D(ctx, el.props, clampedWidth, activeLayout.height ?? 200, Math.max(0, lessonTime - el.startTime));
        break;
      case 'karaoke-card':
        drawKaraokeCard(ctx, el.props, clampedWidth, lessonTime, {
          subtitleConfig: project.subtitleConfig,
          stageW,
          stageH,
          compositionId: project.compositionId,
          hasDarkStage:
            Boolean(project.backgroundImage) ||
            Boolean(CANVAS_THEMES[project.theme]?.isDark),
        });
        break;
    }

    // Optional crisp selection guide on canvas when editing in studio
    if (selectedElementId && el.id === selectedElementId) {
      ctx.save();
      ctx.strokeStyle = '#4F46E5';
      ctx.lineWidth = 4;
      ctx.setLineDash([12, 10]);
      const est = estimateElementBoxDimensions(el, activeLayout);
      const boxW = est.width + 26;
      const boxH = est.height + 26;
      drawRoundedRectPath(ctx, -boxW / 2, -boxH / 2, boxW, boxH, 24);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  // 3. Optional Watermark & Outro overlay (shared across 9:16, 16:9, & English Reels)
  const wm = project.watermark;
  if (wm) {
    drawWatermarkCornerOverlay();

    const outroLines = [wm.outroLine1?.trim() || '', wm.outroLine2?.trim() || ''].filter(Boolean);
    if (outroSec > 0 && outroLines.length > 0 && project.duration > 0) {
      const outroStart = Math.max(introSec, project.duration - outroSec);
      if (time >= outroStart) {
        const fadeDur = Math.min(0.55, outroSec);
        const progress = fadeDur > 0 ? Math.min(1, (time - outroStart) / fadeDur) : 1;
        ctx.save();
        ctx.fillStyle = `rgba(15, 23, 42, ${(0.92 * progress).toFixed(3)})`;
        ctx.fillRect(0, 0, stageW, stageH);
        ctx.globalAlpha = progress;

        // Subtle accent rule above outro lines
        ctx.fillStyle = palette.accentBlue || '#6366F1';
        drawRoundedRectPath(ctx, stageW / 2 - 48, stageH / 2 - 110, 96, 6, 3);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '800 54px "Outfit", "Plus Jakarta Sans", sans-serif';
        const lineGap = 76;
        const baseLineY = stageH / 2 - ((outroLines.length - 1) * lineGap) / 2;
        outroLines.forEach((line, idx) => {
          ctx.fillText(line, stageW / 2, baseLineY + idx * lineGap, stageW * 0.84);
        });
        ctx.restore();
      }
    }
  }
}

function estimateElementBoxDimensions(
  el: SceneElement,
  activeLayout: ElementLayout,
): { width: number; height: number } {
  const width = Math.max(120, activeLayout.width || 600);
  if (el.props.kind === 'shape-3d') {
    return { width, height: activeLayout.height ?? 200 };
  }
  if (el.props.kind === 'word-stack') {
    return { width, height: Math.max(360, activeLayout.height ?? 450) };
  }
  if (el.props.kind === 'illustration-prop') {
    if (el.props.variant === 'cartoon-host') {
      return { width: 420, height: activeLayout.height ?? 650 };
    }
    return { width, height: Math.max(220, activeLayout.height ?? 300) };
  }
  if (el.props.kind === 'comparison-strip') {
    const items = Array.isArray(el.props.items) ? el.props.items : [];
    const itemsLen = items.length;
    const isLongStack =
      !el.props.singleRow &&
      (el.id.startsWith('reel-quiz-opts-') ||
        items.some((item) => item.label.trim().length > 16) ||
        itemsLen > 4);
    const computedH = isLongStack ? Math.max(150, itemsLen * 88 + 20) : el.props.singleRow ? 96 : 124;
    return {
      width,
      height: isLongStack ? Math.max(activeLayout.height ?? 0, computedH) : (activeLayout.height ?? computedH),
    };
  }
  if (el.props.kind === 'sentence-card') {
    const subLen = (el.props.subtext || '').length;
    const textLen = (el.props.text || '').length;
    const extraLines = Math.floor(textLen / 46) + Math.floor(subLen / 52);
    return {
      width,
      height: Math.max(165, activeLayout.height ?? Math.min(340, 175 + extraLines * 26)),
    };
  }
  if (el.props.kind === 'topic-pill') {
    return { width, height: activeLayout.height ?? 84 };
  }
  return { width, height: activeLayout.height ?? 160 };
}

export type CanvasOverlayZone = 'intro' | 'outro' | 'watermark' | 'title';

export function hitTestCanvasOverlayZone(
  project: LessonProject,
  canvasX: number,
  canvasY: number,
  time: number,
  aspectRatio: ExportAspectRatioId = '9:16',
): CanvasOverlayZone | null {
  const stage = getStageDimensionsForAspect(aspectRatio);
  const stageW = stage.width;
  const stageH = stage.height;
  const introSec = getEffectiveIntroSeconds(project);
  const outroSec = getEffectiveOutroSeconds(project);
  const wm = project.watermark;

  if (wm && wm.watermarkEnabled && wm.watermarkText.trim()) {
    const approxTextW = Math.max(120, wm.watermarkText.trim().length * 14.5);
    const boxW = Math.min(stageW - 80, approxTextW + 36);
    const boxH = 48;
    const padX = 36;
    const padY = 44;
    const x =
      wm.watermarkCorner === 'top-left' || wm.watermarkCorner === 'bottom-left'
        ? padX
        : stageW - padX - boxW;
    const y =
      wm.watermarkCorner === 'top-left' || wm.watermarkCorner === 'top-right'
        ? padY
        : stageH - padY - boxH;
    if (canvasX >= x - 12 && canvasX <= x + boxW + 12 && canvasY >= y - 12 && canvasY <= y + boxH + 12) {
      return 'watermark';
    }
  }

  if (introSec > 0 && time < introSec) {
    return 'intro';
  }

  if (wm && outroSec > 0 && project.duration > 0) {
    const outroLines = [wm.outroLine1?.trim() || '', wm.outroLine2?.trim() || ''].filter(Boolean);
    const outroStart = Math.max(introSec, project.duration - outroSec);
    if (outroLines.length > 0 && time >= outroStart) {
      return 'outro';
    }
  }

  const titleBox = resolveLessonTitleBox(project, aspectRatio, time);
  if (titleBox) {
    const halfW = titleBox.width / 2 + 18;
    const halfH = titleBox.height / 2 + 14;
    if (
      canvasX >= titleBox.x - halfW &&
      canvasX <= titleBox.x + halfW &&
      canvasY >= titleBox.y - halfH &&
      canvasY <= titleBox.y + halfH
    ) {
      return 'title';
    }
  }

  return null;
}

export function hitTestElementLayout(
  elements: SceneElement[],
  canvasX: number,
  canvasY: number,
  time: number,
  aspectRatio: ExportAspectRatioId = '9:16',
  subtitleConfig?: SubtitleDisplayConfig,
  compositionId?: LayoutCompositionId,
): { element: SceneElement; layout: ElementLayout } | null {
  const stage = getStageDimensionsForAspect(aspectRatio);
  const stageW = stage.width;
  const sorted = [...elements].sort((a, b) => b.layout.zIndex - a.layout.zIndex);
  const layoutMap = resolveElementLayoutForAspect(
    sorted,
    time,
    aspectRatio,
    subtitleConfig,
    compositionId,
  );
  for (const el of sorted) {
    const state = computeElementFrameState(el, time);
    if (!state.visible) continue;
    const isCartoonHostEl =
      el.props.kind === 'illustration-prop' && el.props.variant === 'cartoon-host';
    const activeLayout = layoutMap.get(el.id) || el.layout;
    const activeScale =
      state.scale * ((activeLayout.scale || 1) / Math.max(0.1, el.layout.scale || 1));
    const est = estimateElementBoxDimensions(el, activeLayout);
    const clampedWidth = Math.min(stageW - 32, Math.max(120, est.width));
    const halfW = (clampedWidth * activeScale) / 2;
    const halfH = (est.height * activeScale) / 2;
    const drawX = isCartoonHostEl
      ? Math.max(90, Math.min(stageW - 90, activeLayout.x))
      : halfW * 2 >= stageW - 32
        ? stageW / 2
        : Math.max(halfW + 16, Math.min(stageW - halfW - 16, activeLayout.x));
    const drawY = activeLayout.y + state.translateY;
    if (
      canvasX >= drawX - halfW &&
      canvasX <= drawX + halfW &&
      canvasY >= drawY - halfH &&
      canvasY <= drawY + halfH
    ) {
      return { element: el, layout: activeLayout };
    }
  }
  return null;
}

export function hitTestElements(
  elements: SceneElement[],
  canvasX: number,
  canvasY: number,
  time: number,
  aspectRatio: ExportAspectRatioId = '9:16',
  subtitleConfig?: SubtitleDisplayConfig,
  compositionId?: LayoutCompositionId,
): SceneElement | null {
  return (
    hitTestElementLayout(elements, canvasX, canvasY, time, aspectRatio, subtitleConfig, compositionId)
      ?.element ?? null
  );
}
