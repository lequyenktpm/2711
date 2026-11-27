import { SceneElement } from './types';

export interface ElementFrameState {
  visible: boolean;
  opacity: number;
  scale: number;
  translateY: number;
  translateX: number;
}

export interface StaggerItemFrameState {
  visible: boolean;
  opacity: number;
  scale: number;
  translateY: number;
  progress: number;
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

export function easeOutQuart(t: number): number {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 4);
}

export function easeOutQuint(t: number): number {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 5);
}

export function easeOutBack(t: number): number {
  const x = clamp01(t);
  const c1 = 1.28;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * Smooth spring-inspired curve for internal card rows, tiles, pills, and badges.
 */
export function computeStaggerItemState(
  elementElapsedSec: number,
  index: number,
  stepDelaySec = 0.08,
  itemDurationSec = 0.34,
): StaggerItemFrameState {
  const local = elementElapsedSec - index * stepDelaySec;
  if (local <= 0) {
    return {
      visible: false,
      opacity: 0,
      scale: 0.93,
      translateY: 18,
      progress: 0,
    };
  }
  const p = clamp01(local / Math.max(0.08, itemDurationSec));
  const opacity = easeOutCubic(clamp01(p * 1.15));
  const glide = easeOutQuint(p);
  const scaleEase = easeOutBack(p);

  return {
    visible: opacity > 0.01,
    opacity,
    scale: 0.93 + 0.07 * scaleEase,
    translateY: (1 - glide) * 18,
    progress: glide,
  };
}

export function computeElementFrameState(
  element: SceneElement,
  time: number,
  enterDur = 0.36,
  exitDur = 0.24,
): ElementFrameState {
  if (time < element.startTime || time > element.endTime) {
    return { visible: false, opacity: 0, scale: 0.9, translateY: 0, translateX: 0 };
  }

  const elapsed = time - element.startTime;
  const remaining = element.endTime - time;
  const lifespan = Math.max(0.12, element.endTime - element.startTime);

  const safeEnter = Math.min(enterDur, lifespan * 0.4);
  const safeExit = Math.min(exitDur, lifespan * 0.28);

  let opacity = 1;
  let scale = element.layout.scale || 1;
  let translateY = 0;
  let translateX = 0;

  if (elapsed < safeEnter && safeEnter > 0) {
    const p = elapsed / safeEnter;
    const easedCubic = easeOutCubic(p);
    const easedQuint = easeOutQuint(p);
    const easedBack = easeOutBack(p);
    opacity = easeOutCubic(clamp01(p * 1.25));

    switch (element.enterAnimation) {
      case 'pop-up':
        scale *= 0.9 + 0.1 * easedBack;
        translateY += (1 - easedQuint) * 26;
        break;
      case 'slide-up':
        scale *= 0.96 + 0.04 * easedQuint;
        translateY += (1 - easedQuint) * 38;
        break;
      case 'drop-in':
        scale *= 0.96 + 0.04 * easedQuint;
        translateY -= (1 - easedQuint) * 32;
        break;
      case 'fade-scale':
        scale *= 0.94 + 0.06 * easedCubic;
        translateY += (1 - easedQuint) * 12;
        break;
    }
  } else if (remaining < safeExit && safeExit > 0) {
    const p = remaining / safeExit; // 1 -> 0
    const eased = easeInOutCubic(p);
    opacity = eased;

    switch (element.exitAnimation) {
      case 'shrink':
        scale *= 0.93 + 0.07 * eased;
        translateY += (1 - eased) * 10;
        break;
      case 'slide-down':
        scale *= 0.97 + 0.03 * eased;
        translateY += (1 - eased) * 26;
        break;
      case 'fade-out':
        translateY -= (1 - eased) * 6;
        break;
    }
  }

  return {
    visible: opacity > 0.01,
    opacity: clamp01(opacity),
    scale,
    translateY,
    translateX,
  };
}
