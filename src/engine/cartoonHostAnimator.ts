import {
  DEFAULT_CARTOON_ANIMATION_PARAMS,
  resolveCartoonAnimationForSignal,
} from './cartoonAnimationDb';
import type { ExportAspectRatioId } from './mp4Config';
import type {
  CartoonAccessory,
  CartoonAnimationKeyframe,
  CartoonAnimationParams,
  CartoonExpressionMood,
  CartoonEyeStyle,
  CartoonFxOverlay,
  CartoonGestureMode,
  CartoonMouthStyle,
  SceneElement,
  TranscriptCue,
  WordTiming,
} from './types';

export type {
  CartoonGestureMode,
  CartoonExpressionMood,
  CartoonEyeStyle,
  CartoonMouthStyle,
  CartoonFxOverlay,
  CartoonAccessory,
};

export type CartoonViseme =
  | 'rest'
  | 'closed'
  | 'smile'
  | 'ah'
  | 'ee'
  | 'oh'
  | 'oo';

export interface CartoonHostContext {
  activeBadge?: 'check' | 'cross' | 'question' | 'none';
  activeStamp?: string;
  activeText?: string;
  cueText?: string;
  toneValue?: number;
  targetDirection?: 'up' | 'right' | 'none';
  /** Explicit action preset ID from cartoonAnimationDb */
  actionId?: string;
  /** Explicit mood override */
  explicitMood?: CartoonExpressionMood;
  /** Inline or AI-invented animation parameter overrides */
  customSpec?: Partial<CartoonAnimationParams>;
  /** Previous reaction context just before the latest card/element boundary, for smooth retraction/blending */
  transitionFrom?: Omit<CartoonHostContext, 'transitionFrom' | 'transitionProgress'>;
  /** 0 = still in transitionFrom state, 1 = fully settled into current context */
  transitionProgress?: number;
}

export interface CartoonLipSyncFrame {
  isSpeaking: boolean;
  activeWord: string;
  activeCueText: string;
  viseme: CartoonViseme;
  /** 0 (closed/smile) .. 1 (wide open D-shape) */
  mouthOpen: number;
  /** Horizontal stretch multiplier (~0.62 narrow O .. 1.24 wide EE/smile) */
  mouthWidth: number;
  /** 0 (flat/D-shape) .. 1 (circular O/OO shape) */
  mouthRound: number;
  /** 0 (open eyes) .. 1 (closed eyelid blink) */
  blinkFactor: number;
  /** Gentle subtle vertical breath/float offset in px (before scale) */
  headBobY: number;
  /** Gentle horizontal negative/emphasis head shake offset in px (before scale) */
  headShakeX: number;
  /** Subtle conversational head tilt in radians */
  headTiltRad: number;
  /** 0..1 eyebrow raise on questions & emphasis */
  browLift: number;
  /** -1 (worried inner-up / \) .. 0 (level) .. +1 (inquisitive asymmetrical raise) */
  browSlope: number;
  /** -1 (concerned downturn) .. 0 (neutral) .. +1 (warm smile) */
  smileBias: number;
  /** Pupil horizontal gaze target (-1 left .. +1 right toward companion card) */
  eyeTargetX: number;
  /** Pupil vertical gaze target (-1 up toward top card .. +1 down) */
  eyeTargetY: number;
  mood: CartoonExpressionMood;
  /** Optional subtle reaction indicator near gesturing hand */
  pointerGlyph: 'check' | 'cross' | 'question' | 'tip' | null;
  /** Smoothly interpolated viewer-left arm angles (radians) */
  leftShoulderAngle: number;
  leftElbowAngle: number;
  /** Smoothly interpolated viewer-right arm angles (radians) */
  rightShoulderAngle: number;
  rightElbowAngle: number;
  /** Continuous unified right-arm kinematics (eliminates abrupt gesture-branch snapping) */
  rightElbowX: number;
  rightElbowY: number;
  rightWristX: number;
  rightWristY: number;
  rightHandAngle: number;
  /** 0 = relaxed open palm, 1 = extended pointing index finger */
  rightHandPointMix: number;
  /** 0 = spread fingers, 1 = compact hip-resting fingers */
  rightHandCompactMix: number;
  /** Keyframe-driven left arm kinematics for 2-hand actions like clap-jump */
  leftElbowX?: number;
  leftElbowY?: number;
  leftWristX?: number;
  leftWristY?: number;
  leftHandAngle?: number;
  /** 0..1 crouch knee bend */
  kneeBend: number;
  /** Vertical jump/crouch offset in local character coords */
  jumpOffsetY: number;
  /** 0..1 clapping palm contact impact burst */
  clapImpact: number;
  /** Active or fading-out reaction badge near gesturing hand */
  badgeGlyph: 'check' | 'cross' | 'question' | 'tip' | null;
  badgeEmoji?: string;
  badgeOpacity: number;
  badgeScale: number;
  gestureMode: CartoonGestureMode;
  actionId?: string;
  eyeStyle: CartoonEyeStyle;
  mouthStyle: CartoonMouthStyle;
  fxOverlay: CartoonFxOverlay;
  accessory: CartoonAccessory;
  blushIntensity: number;
  bodySquashX: number;
  bodySquashY: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clampRange(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * clamp01(t);
}

interface RightArmKinematics {
  ex: number;
  ey: number;
  wx: number;
  wy: number;
  handAngle: number;
  pointMix: number;
  compactMix: number;
}

function getRightArmTargetPose(
  mode: CartoonGestureMode,
  t: number,
  speechActivity: number,
  sway: number,
): RightArmKinematics {
  const bob = Math.sin(t * 2.8) * 4;
  switch (mode) {
    case 'point-up':
    case 'approve-tip':
      return {
        ex: 162 + sway * 0.4,
        ey: -42 + bob * 0.4,
        wx: 168 + sway * 0.3,
        wy: -182 + bob,
        handAngle: -Math.PI * 0.52,
        pointMix: 1,
        compactMix: 0,
      };
    case 'point-right':
    case 'double-point':
      return {
        ex: 168 + sway * 0.4,
        ey: 26 + bob * 0.4,
        wx: 256 + Math.sin(t * 2.4) * 6,
        wy: mode === 'double-point' ? -72 + bob : -32 + bob,
        handAngle: mode === 'double-point' ? -0.45 : -0.22,
        pointMix: 1,
        compactMix: 0,
      };
    case 'wave':
      return {
        ex: 158 + sway * 0.3,
        ey: -38,
        wx: 192 + Math.sin(t * 8.5) * 24,
        wy: -178 + Math.cos(t * 8.5) * 8,
        handAngle: -Math.PI * 0.48 + Math.sin(t * 8.5) * 0.28,
        pointMix: 0,
        compactMix: 0,
      };
    case 'thumbs-up':
      return {
        ex: 156 + sway * 0.3,
        ey: 16 + bob * 0.3,
        wx: 184 + sway * 0.25,
        wy: -108 + bob * 0.8,
        handAngle: -Math.PI * 0.45,
        pointMix: 0.72,
        compactMix: 0.35,
      };
    case 'fist-pump':
      return {
        ex: 154 + sway * 0.3,
        ey: -54 + Math.sin(t * 6.4) * 14,
        wx: 168 + Math.cos(t * 6.4) * 8,
        wy: -172 + Math.sin(t * 6.4) * 20,
        handAngle: -Math.PI * 0.5,
        pointMix: 0,
        compactMix: 0.85,
      };
    case 'think-chin':
      return {
        ex: 138,
        ey: 42,
        wx: 118,
        wy: -76 + Math.sin(t * 2.1) * 3,
        handAngle: -Math.PI * 0.72,
        pointMix: 0.55,
        compactMix: 0.5,
      };
    case 'facepalm':
      return {
        ex: 146,
        ey: -10,
        wx: 118,
        wy: -148 + Math.sin(t * 2.5) * 3,
        handAngle: -Math.PI * 0.75,
        pointMix: 0,
        compactMix: 0.15,
      };
    case 'hold-mic':
      return {
        ex: 144 + sway * 0.25,
        ey: 48,
        wx: 122 + Math.sin(t * 3.1) * 4,
        wy: -44 + bob * 0.5,
        handAngle: -Math.PI * 0.62,
        pointMix: 0,
        compactMix: 0.8,
      };
    case 'shrug':
      return {
        ex: 162 + sway * 0.3,
        ey: 44 + Math.sin(t * 2.6) * 5,
        wx: 204 + sway * 0.2,
        wy: -14 + Math.sin(t * 2.6) * 6,
        handAngle: -0.25,
        pointMix: 0,
        compactMix: 0,
      };
    case 'warn-avoid':
      return {
        ex: 166 + sway * 0.3,
        ey: 8 + Math.sin(t * 3.0) * 4,
        wx: 186 + Math.sin(t * 3.0) * 5,
        wy: -112 + Math.cos(t * 2.6) * 4,
        handAngle: -Math.PI * 0.46,
        pointMix: 0,
        compactMix: 0,
      };
    case 'question':
      return {
        ex: 158 + sway * 0.3,
        ey: 36,
        wx: 154,
        wy: -68 + bob * 0.4,
        handAngle: -Math.PI * 0.6,
        pointMix: 0,
        compactMix: 0.2,
      };
    case 'cheer':
      return {
        ex: 162 + sway * 0.35,
        ey: -18 + bob * 0.4,
        wx: 194 + sway * 0.3,
        wy: -136 + bob,
        handAngle: -Math.PI * 0.4,
        pointMix: 0,
        compactMix: 0,
      };
    case 'clap-jump':
      return {
        ex: 132,
        ey: -42,
        wx: 18,
        wy: -110,
        handAngle: -Math.PI * 0.5,
        pointMix: 0,
        compactMix: 0,
      };
    case 'explain': {
      // Smoothly modulate gesture height by continuous speechActivity (zero abrupt threshold jumps)
      const act = clamp01(speechActivity);
      return {
        ex: lerp(142, 160, act) + sway * 0.35,
        ey: lerp(96, 48, act),
        wx: lerp(128, 186, act) + sway * 0.25,
        wy: lerp(152, -16, act) + Math.sin(t * 2.6) * (3 + 4 * act),
        handAngle: lerp(0.92, -0.32, act),
        pointMix: 0,
        compactMix: lerp(0.75, 0.15, act),
      };
    }
    case 'present':
    default:
      return {
        ex: 146 + sway * 0.35,
        ey: 112,
        wx: 122 + sway * 0.2,
        wy: 206,
        handAngle: Math.PI * 0.5 + 0.14,
        pointMix: 0,
        compactMix: 1,
      };
  }
}

interface VisemeMetrics {
  open: number;
  width: number;
  round: number;
}

const VISEME_SHAPES: Record<CartoonViseme, VisemeMetrics> = {
  rest: { open: 0, width: 0.96, round: 0 },
  smile: { open: 0.04, width: 1.08, round: 0 },
  closed: { open: 0.03, width: 0.92, round: 0.05 },
  ah: { open: 0.94, width: 1.06, round: 0.14 },
  ee: { open: 0.46, width: 1.24, round: 0.04 },
  oh: { open: 0.78, width: 0.76, round: 0.88 },
  oo: { open: 0.48, width: 0.62, round: 0.96 },
};

/**
 * Cleans accidental technical/duration suffixes like "(Transcript Nhật-Anh 1:42)" from
 * the top cartoon headline while preserving the full title text without forcing "..." cutoffs.
 */
export function formatCartoonHostHeadline(rawTitle?: string, maxChars = 0): string {
  const raw = (rawTitle || '').trim();
  if (!raw) return '';

  let cleaned = raw
    .replace(/\(\s*(?:transcript|audio|video|demo|preset|sample)\b[^)]*\)/gi, '')
    .replace(/\(\s*\d{1,2}:\d{2}(?::\d{2})?\s*\)/g, '')
    .replace(/\[(?:transcript|audio|video)\b[^\]]*\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—·:|]+|[\s\-–—·:|]+$/g, '')
    .trim();

  if (!cleaned) cleaned = raw;
  if (!maxChars || maxChars <= 0 || cleaned.length <= maxChars) return cleaned;

  const slice = cleaned.slice(0, maxChars - 1).trim();
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace >= Math.floor(maxChars * 0.52) ? slice.slice(0, lastSpace).trim() : slice;
  return `${cut.replace(/[,;:·-]+$/, '')}…`;
}

/**
 * Maps a Latin, Japanese (Hiragana/Katakana), Korean Hangul, or punctuation character
 * to an expressive lip-sync viseme.
 */
export function classifyCharToViseme(ch: string): CartoonViseme {
  if (!ch) return 'rest';
  const c = ch.toLowerCase();

  // Bilabial stops/nasals compress lips briefly
  if (c === 'm' || c === 'b' || c === 'p' || c === 'ん' || c === 'ン') {
    return 'closed';
  }
  // Open vowels (a-family & Vietnamese diacritics)
  if ('aàáảãạăằắẳẵặâầấẩẫậäå'.includes(c)) {
    return 'ah';
  }
  // Wide vowels / dentals
  if ('eèéẻẽẹêềếểễệiìíỉĩịyỳýỷỹỵ'.includes(c)) {
    return 'ee';
  }
  // Round mid vowels
  if ('oòóỏõọôồốổỗộơờớởỡợ'.includes(c)) {
    return 'oh';
  }
  // Tight round vowels
  if ('uùúủũụưừứửữựw'.includes(c)) {
    return 'oo';
  }
  // Labiodental / sibilant consonants slightly spread mouth
  if ('fvsztdnlrckgjh'.includes(c)) {
    return 'ee';
  }

  // Japanese Hiragana / Katakana vowel rows
  if (/[あかさたなはまやらわがざだばぱぁアカサタナハマヤラワガザダバパァ]/.test(ch)) {
    return 'ah';
  }
  if (/[いきしちにひみりぎじぢびぴぃイキシチニヒミリギジヂビピィ]/.test(ch)) {
    return 'ee';
  }
  if (/[えけせてねへめれげぜでべぺぇエケセテネヘメレゲゼデベペェ]/.test(ch)) {
    return 'ee';
  }
  if (/[おこそとのほもよろをごぞどぼぽぉオコソトノホモヨロヲゴゾドボポォ]/.test(ch)) {
    return 'oh';
  }
  if (/[うくすつぬふむゆるぐずづぶぷぅウクスツヌフムユルグズヅブプゥ]/.test(ch)) {
    return 'oo';
  }

  // CJK / Hangul syllables: cycle naturally across open conversational shapes
  const code = ch.charCodeAt(0);
  if (code > 0x3000) {
    const seq: CartoonViseme[] = ['ah', 'oh', 'ee', 'oo'];
    return seq[code % seq.length];
  }
  return 'smile';
}

function buildWordVisemeSequence(word: string): CartoonViseme[] {
  const clean = word.replace(/[^\p{L}\p{N}]/gu, '');
  if (!clean) return ['smile'];

  const chars = Array.from(clean);
  const raw = chars.map(classifyCharToViseme);
  const compact: CartoonViseme[] = [];
  for (const v of raw) {
    if (compact.length === 0 || compact[compact.length - 1] !== v) {
      compact.push(v);
    }
  }
  if (compact.length === 1 && compact[0] === 'closed') {
    compact.push('ah');
  }
  return compact.slice(0, 6);
}

function resolveWordTimingAtTime(
  cue: TranscriptCue,
  time: number,
): { word: string; start: number; end: number; cueIndex: number } | null {
  const words: WordTiming[] = Array.isArray(cue.words) ? cue.words : [];
  if (words.length > 0) {
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (time >= w.start && time <= w.end) {
        return { word: w.word, start: w.start, end: w.end, cueIndex: i };
      }
    }
    return null;
  }

  const tokens = cue.text
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return null;
  const dur = Math.max(0.2, cue.end - cue.start);
  const ratio = clamp01((time - cue.start) / dur);
  const idx = Math.min(tokens.length - 1, Math.floor(ratio * tokens.length));
  const sliceDur = dur / tokens.length;
  return {
    word: tokens[idx],
    start: cue.start + idx * sliceDur,
    end: cue.start + (idx + 1) * sliceDur,
    cueIndex: idx,
  };
}

interface ArmPose {
  leftShoulder: number;
  leftElbow: number;
  rightShoulder: number;
  rightElbow: number;
}

const ARM_POSES: Record<CartoonGestureMode, ArmPose> = {
  present: {
    leftShoulder: 0.42,
    leftElbow: 0.34,
    rightShoulder: -0.26,
    rightElbow: -0.62,
  },
  explain: {
    leftShoulder: 0.56,
    leftElbow: 0.58,
    rightShoulder: -0.52,
    rightElbow: -0.54,
  },
  question: {
    leftShoulder: 0.78,
    leftElbow: 0.88,
    rightShoulder: -0.22,
    rightElbow: -0.52,
  },
  cheer: {
    leftShoulder: 0.68,
    leftElbow: 0.62,
    rightShoulder: -0.68,
    rightElbow: -0.62,
  },
  'point-up': {
    leftShoulder: 0.25,
    leftElbow: 0.42,
    rightShoulder: -1.45,
    rightElbow: -0.95,
  },
  'point-right': {
    leftShoulder: 0.28,
    leftElbow: 0.46,
    rightShoulder: 1.05,
    rightElbow: 0.22,
  },
  'warn-avoid': {
    leftShoulder: 0.85,
    leftElbow: 0.65,
    rightShoulder: -0.95,
    rightElbow: -0.78,
  },
  'approve-tip': {
    leftShoulder: 0.48,
    leftElbow: 0.44,
    rightShoulder: -1.18,
    rightElbow: -0.76,
  },
  wave: {
    leftShoulder: 0.46,
    leftElbow: 0.42,
    rightShoulder: -1.22,
    rightElbow: -0.82,
  },
  shrug: {
    leftShoulder: 0.86,
    leftElbow: 0.92,
    rightShoulder: -0.86,
    rightElbow: -0.92,
  },
  'think-chin': {
    leftShoulder: 0.48,
    leftElbow: 0.52,
    rightShoulder: -0.72,
    rightElbow: -0.92,
  },
  'thumbs-up': {
    leftShoulder: 0.4,
    leftElbow: 0.36,
    rightShoulder: -0.95,
    rightElbow: -0.68,
  },
  'double-point': {
    leftShoulder: 0.88,
    leftElbow: 0.76,
    rightShoulder: -1.02,
    rightElbow: -0.62,
  },
  facepalm: {
    leftShoulder: 0.44,
    leftElbow: 0.46,
    rightShoulder: -1.35,
    rightElbow: -1.05,
  },
  'fist-pump': {
    leftShoulder: 0.78,
    leftElbow: 0.72,
    rightShoulder: -1.35,
    rightElbow: -0.85,
  },
  'hold-mic': {
    leftShoulder: 0.48,
    leftElbow: 0.46,
    rightShoulder: -0.65,
    rightElbow: -0.88,
  },
  'clap-jump': {
    leftShoulder: 1.12,
    leftElbow: 0.85,
    rightShoulder: -1.12,
    rightElbow: -0.85,
  },
};

const NEGATIVE_CONTEXT_REGEX =
  /\b(avoid|rude|wrong|mistake|don't say|do not say|stop saying|never say|too blunt|too direct|textbook|boring|bad|incorrect|no!)\b|ぶっきらぼう|失礼|ダメ|間違い|使わない|tránh|sai|đừng nói|thô lỗ|cọc lốc|lỗi/i;

const NEGATIVE_NG_TOKEN_REGEX = /(?:^|[\s「『(【])NG(?:$|[\s」』)】:：!])/u;

const QUESTION_CONTEXT_REGEX =
  /[?？]|\b(quiz|question|guess|which|choose|think|wonder|blank|fill in)\b|どっち|どれ|なんで|どう|質問|クイズ|chọn|đố|nghĩ thử|cách nào/i;

const POSITIVE_CONTEXT_REGEX =
  /\b(natural|polite|better|instead|great|correct|awesome|smart|formal|upgrade|native|use this|right way|polite!)\b|丁寧|自然|おすすめ|正解|ネイティブ|良い|使うべき|nên dùng|tự nhiên|chuẩn|lịch sự|chính xác|đúng|hay hơn/i;

const TIP_CONTEXT_REGEX =
  /\b(tip|key|important|note|remember|focus|secret|rule)\b|ポイント|コツ|覚え|重要|mẹo|lưu ý|bí quyết|quy tắc/i;

interface ClassifiedCartoonState {
  mood: CartoonExpressionMood;
  gestureMode: CartoonGestureMode;
  pointerGlyph: CartoonLipSyncFrame['pointerGlyph'];
  params: CartoonAnimationParams;
  actionId?: string;
}

function defaultParamsFor(
  mood: CartoonExpressionMood,
  gestureMode: CartoonGestureMode,
  pointerGlyph: CartoonLipSyncFrame['pointerGlyph'],
): CartoonAnimationParams {
  return {
    ...DEFAULT_CARTOON_ANIMATION_PARAMS,
    mood,
    gestureMode,
    badgeGlyph: pointerGlyph,
    eyeStyle:
      mood === 'surprised'
        ? 'wide-surprised'
        : mood === 'happy' || mood === 'excited' || mood === 'proud'
          ? 'happy-arc'
          : mood === 'cool'
            ? 'cool-shades'
            : mood === 'sad'
              ? 'sleepy'
              : mood === 'worried'
                ? 'focused'
                : 'normal',
    mouthStyle:
      mood === 'surprised'
        ? 'o-shock'
        : mood === 'excited'
          ? 'big-grin'
          : mood === 'cool'
            ? 'smirk'
            : 'lip-sync',
    fxOverlay:
      gestureMode === 'approve-tip'
        ? 'lightbulb'
        : gestureMode === 'warn-avoid'
          ? 'warning-bolt'
          : gestureMode === 'question' || gestureMode === 'think-chin'
            ? 'question-marks'
            : gestureMode === 'cheer' || gestureMode === 'fist-pump'
              ? 'sparkles'
              : 'none',
    blushIntensity: mood === 'happy' || mood === 'excited' || mood === 'shy' ? 0.35 : 0.12,
  };
}

function classifyMoodAndGesture(
  cue: TranscriptCue | undefined,
  cueIdx: number,
  context?: CartoonHostContext,
): ClassifiedCartoonState {
  const txt = cue?.text?.trim() ?? '';
  const combined = [txt, context?.cueText, context?.activeStamp, context?.activeText]
    .filter(Boolean)
    .join(' ');
  const dir = context?.targetDirection ?? 'none';

  // 1. Explicit DB actionId, inline customSpec, explicitMood, or custom DB keyword hit
  if (context?.actionId || context?.customSpec || context?.explicitMood) {
    const resolved = resolveCartoonAnimationForSignal({
      actionId: context.actionId,
      explicitMood: context.explicitMood,
      spokenText: combined,
      inlineSpec: context.customSpec,
      activeBadge: context.activeBadge,
    });
    return {
      mood: resolved.params.mood,
      gestureMode: resolved.params.gestureMode,
      pointerGlyph: resolved.params.badgeGlyph ?? null,
      params: resolved.params,
      actionId: resolved.matchedDef?.id ?? context.actionId,
    };
  }

  // Also check custom user/AI-saved DB keywords before heuristic rules
  if (combined) {
    const customHit = resolveCartoonAnimationForSignal({ spokenText: combined });
    if (customHit.matchedDef) {
      return {
        mood: customHit.params.mood,
        gestureMode: customHit.params.gestureMode,
        pointerGlyph: customHit.params.badgeGlyph ?? null,
        params: customHit.params,
        actionId: customHit.matchedDef.id,
      };
    }
  }

  const isExplicitNegative = context?.activeBadge === 'cross';
  const isExplicitPositive = context?.activeBadge === 'check';
  const isExplicitQuestion = context?.activeBadge === 'question';
  const hasExplicitBadge = isExplicitNegative || isExplicitPositive || isExplicitQuestion;

  const isNegative =
    isExplicitNegative ||
    (!hasExplicitBadge &&
      ((typeof context?.toneValue === 'number' && context.toneValue < 0.34) ||
        NEGATIVE_CONTEXT_REGEX.test(combined) ||
        NEGATIVE_NG_TOKEN_REGEX.test(combined)));

  if (isNegative) {
    return {
      mood: 'worried',
      gestureMode: 'warn-avoid',
      pointerGlyph: 'cross',
      params: defaultParamsFor('worried', 'warn-avoid', 'cross'),
    };
  }

  const isQuestion =
    isExplicitQuestion ||
    (!hasExplicitBadge && QUESTION_CONTEXT_REGEX.test(combined));

  if (isQuestion) {
    const g = dir === 'right' ? 'point-right' : dir === 'up' ? 'point-up' : 'question';
    return {
      mood: 'curious',
      gestureMode: g,
      pointerGlyph: 'question',
      params: defaultParamsFor('curious', g, 'question'),
    };
  }

  const isPositive =
    isExplicitPositive ||
    (typeof context?.toneValue === 'number' && context.toneValue >= 0.62) ||
    POSITIVE_CONTEXT_REGEX.test(combined);

  if (isPositive) {
    const g =
      dir === 'right'
        ? 'point-right'
        : dir === 'up'
          ? cueIdx % 2 === 0
            ? 'point-up'
            : 'approve-tip'
          : 'cheer';
    return {
      mood: 'happy',
      gestureMode: g,
      pointerGlyph: 'check',
      params: defaultParamsFor('happy', g, 'check'),
    };
  }

  const isTip = TIP_CONTEXT_REGEX.test(combined);
  if (dir === 'right') {
    const g = cueIdx % 2 === 0 ? 'point-right' : 'explain';
    const m = isTip ? 'happy' : 'neutral';
    return {
      mood: m,
      gestureMode: g,
      pointerGlyph: isTip ? 'tip' : null,
      params: defaultParamsFor(m, g, isTip ? 'tip' : null),
    };
  }
  if (dir === 'up') {
    const g = cueIdx % 2 === 0 ? 'point-up' : 'explain';
    const m = isTip ? 'happy' : 'neutral';
    return {
      mood: m,
      gestureMode: g,
      pointerGlyph: isTip ? 'tip' : null,
      params: defaultParamsFor(m, g, isTip ? 'tip' : null),
    };
  }

  const g = cueIdx % 2 === 0 ? 'present' : 'explain';
  const m = isTip ? 'happy' : 'neutral';
  return {
    mood: m,
    gestureMode: g,
    pointerGlyph: isTip ? 'tip' : null,
    params: defaultParamsFor(m, g, isTip ? 'tip' : null),
  };
}

function sampleRawCartoonHostContext(
  elements: SceneElement[],
  time: number,
  cues: TranscriptCue[] = [],
  aspectRatio: ExportAspectRatioId = '9:16',
): Omit<CartoonHostContext, 'transitionFrom' | 'transitionProgress'> {
  const hostEl = elements.find(
    (el) => el.props.kind === 'illustration-prop' && el.props.variant === 'cartoon-host',
  );
  const hostData = hostEl?.props.kind === 'illustration-prop' ? hostEl.props.data : undefined;

  const nonHostEls = elements.filter(
    (el) => !(el.props.kind === 'illustration-prop' && el.props.variant === 'cartoon-host'),
  );
  const maxElEnd = nonHostEls.reduce((acc, el) => Math.max(acc, el.endTime), 0);
  // Half-open [startTime, endTime) matching prevents two adjacent cards from overlapping at boundaries;
  // allow inclusive end only at the final end of the timeline, and sort newest-start first so incoming wins cleanly.
  let active = nonHostEls
    .filter(
      (el) =>
        time >= el.startTime &&
        (time < el.endTime || (Math.abs(time - maxElEnd) <= 0.001 && time <= el.endTime)),
    )
    .sort((a, b) => b.startTime - a.startTime);

  if (active.length === 0) {
    active = nonHostEls
      .filter((el) => time >= el.startTime - 0.015 && time <= el.endTime + 0.015)
      .sort((a, b) => b.startTime - a.startTime);
  }

  const activeCard = active.find((el) => el.type === 'sentence-card');
  const activePill = active.find((el) => el.type === 'topic-pill');
  const activeMeter = active.find((el) => el.type === 'tone-meter');
  const activeIll = active.find((el) => el.type === 'illustration-prop');
  const activeCue =
    cues.find((c) => time >= c.start && time < c.end) ??
    cues.find((c) => time >= c.start && time <= c.end);

  const textParts: string[] = [];
  let activeBadge: CartoonHostContext['activeBadge'];
  let activeStamp: string | undefined;
  let toneValue: number | undefined;

  if (activeCard && activeCard.props.kind === 'sentence-card') {
    activeBadge = activeCard.props.badge;
    activeStamp = activeCard.props.stampText;
    textParts.push(activeCard.props.text, activeCard.props.subtext || '');
  }
  if (activePill && activePill.props.kind === 'topic-pill') {
    textParts.push(activePill.props.text);
  }
  if (activeIll && activeIll.props.kind === 'illustration-prop' && activeIll.props.data) {
    const d = activeIll.props.data;
    textParts.push(d.title || '', d.subtitle || '', d.reactionText || '', d.speechText || '');
    if (d.labels?.length) textParts.push(d.labels.join(' '));
  }
  if (activeMeter && activeMeter.props.kind === 'tone-meter') {
    const p = activeMeter.props;
    const span = Math.max(0.05, (p.animateEnd ?? activeMeter.endTime) - (p.animateStart ?? activeMeter.startTime));
    const ratio = clamp01((time - (p.animateStart ?? activeMeter.startTime)) / span);
    toneValue = lerp(p.valueStart, p.valueEnd, ratio);
  }

  // Timed cartoonActionSegments override if active at `time`, otherwise fall back to hostData defaults
  const segs = hostData?.cartoonActionSegments ?? [];
  const maxSegEnd = segs.reduce((acc, seg) => Math.max(acc, seg.endTime), 0);
  const activeSegment =
    segs
      .filter(
        (seg) =>
          time >= seg.startTime &&
          (time < seg.endTime || (Math.abs(time - maxSegEnd) <= 0.001 && time <= seg.endTime)),
      )
      .sort((a, b) => b.startTime - a.startTime)[0] ??
    segs.find((seg) => time >= seg.startTime - 0.015 && time <= seg.endTime + 0.015);

  const hasCompanionVisual = Boolean(activeCard || activePill || activeMeter || activeIll);
  const targetDirection: CartoonHostContext['targetDirection'] = !hasCompanionVisual
    ? 'none'
    : aspectRatio === '16:9' || aspectRatio === '1:1'
      ? 'right'
      : 'up';

  return {
    activeBadge,
    activeStamp,
    activeText: textParts.filter(Boolean).join(' ').trim() || undefined,
    cueText: activeCue?.text,
    toneValue,
    targetDirection,
    actionId: activeSegment?.actionId || hostData?.cartoonAction,
    explicitMood: activeSegment?.mood || hostData?.cartoonMood,
    customSpec: activeSegment?.spec || hostData?.cartoonAnimationSpec,
  };
}

/**
 * Inspects active scene elements at `time` so Gimmy reacts directly to whatever
 * teaching card, comparison, or tone meter is currently on screen, and tracks
 * recent start/end boundaries so arm gestures & badges retract smoothly over ~0.55s.
 */
export function computeCartoonHostContextFromElements(
  elements: SceneElement[],
  time: number,
  cues: TranscriptCue[] = [],
  aspectRatio: ExportAspectRatioId = '9:16',
): CartoonHostContext {
  const current = sampleRawCartoonHostContext(elements, time, cues, aspectRatio);

  const RETRACT_WINDOW = 0.56;
  let latestBoundary = -1;
  for (const el of elements) {
    if (el.props.kind === 'illustration-prop' && el.props.variant === 'cartoon-host') {
      const segs = el.props.data?.cartoonActionSegments;
      if (segs) {
        for (const seg of segs) {
          if (seg.startTime > 0.05 && seg.startTime <= time && time - seg.startTime <= RETRACT_WINDOW && seg.startTime > latestBoundary) {
            latestBoundary = seg.startTime;
          }
          if (seg.endTime <= time && time - seg.endTime <= RETRACT_WINDOW && seg.endTime > latestBoundary) {
            latestBoundary = seg.endTime;
          }
        }
      }
      continue;
    }
    if (el.type !== 'sentence-card' && el.type !== 'topic-pill' && el.type !== 'tone-meter' && el.type !== 'illustration-prop') {
      continue;
    }
    const endBoundary = el.endTime;
    const startBoundary = el.startTime;
    if (endBoundary <= time && time - endBoundary <= RETRACT_WINDOW && endBoundary > latestBoundary) {
      latestBoundary = endBoundary;
    }
    if (startBoundary > 0.05 && startBoundary <= time && time - startBoundary <= RETRACT_WINDOW && startBoundary > latestBoundary) {
      latestBoundary = startBoundary;
    }
  }

  if (latestBoundary >= 0) {
    const prevTime = Math.max(0, latestBoundary - 0.04);
    const transitionFrom = sampleRawCartoonHostContext(elements, prevTime, cues, aspectRatio);
    const transitionProgress = smoothstep((time - latestBoundary) / RETRACT_WINDOW);
    return {
      ...current,
      transitionFrom,
      transitionProgress,
    };
  }

  return current;
}

function resolveSequenceKeyframesForState(state: ClassifiedCartoonState): CartoonAnimationKeyframe[] | undefined {
  if (state.params.keyframes && state.params.keyframes.length > 0) {
    return state.params.keyframes;
  }
  if (state.gestureMode === 'clap-jump') {
    return resolveCartoonAnimationForSignal({ actionId: 'clap-jump' }).params.keyframes;
  }
  return undefined;
}

function evaluateKeyframeArmPose(
  kfs: CartoonAnimationKeyframe[],
  seqDurRaw: number,
  shouldLoop: boolean,
  tSec: number,
) {
  const seqDur = Math.max(0.4, seqDurRaw);
  const rawCycle = tSec / seqDur;
  const seqPhase = shouldLoop ? rawCycle - Math.floor(rawCycle) : clamp01(rawCycle);

  let kfA = kfs[0];
  let kfB = kfs[kfs.length - 1];
  let localFrac = 0;

  if (kfs.length === 1) {
    kfA = kfs[0];
    kfB = kfs[0];
  } else if (seqPhase <= kfs[0].at) {
    kfA = kfs[0];
    kfB = kfs[1];
    localFrac = 0;
  } else if (seqPhase >= kfs[kfs.length - 1].at) {
    kfA = kfs[kfs.length - 1];
    kfB = shouldLoop ? kfs[0] : kfs[kfs.length - 1];
    const wrapSpan = shouldLoop ? Math.max(0.02, 1 - kfA.at + kfB.at) : 1;
    localFrac = shouldLoop ? smoothstep((seqPhase - kfA.at) / wrapSpan) : 1;
  } else {
    for (let ki = 0; ki < kfs.length - 1; ki++) {
      if (seqPhase >= kfs[ki].at && seqPhase <= kfs[ki + 1].at) {
        kfA = kfs[ki];
        kfB = kfs[ki + 1];
        const span = Math.max(0.01, kfB.at - kfA.at);
        localFrac = smoothstep((seqPhase - kfA.at) / span);
        break;
      }
    }
  }

  const kneeBend = clamp01(lerp(kfA.kneeBend ?? 0, kfB.kneeBend ?? 0, localFrac));
  const clapImpact = clamp01(lerp(kfA.clapImpact ?? 0, kfB.clapImpact ?? 0, localFrac));
  const leftWristX = lerp(kfA.leftWristX ?? -124, kfB.leftWristX ?? -124, localFrac);
  const leftWristY = lerp(kfA.leftWristY ?? 150, kfB.leftWristY ?? 150, localFrac);
  const rightWristX = lerp(kfA.rightWristX ?? 124, kfB.rightWristX ?? 124, localFrac);
  const rightWristY = lerp(kfA.rightWristY ?? 150, kfB.rightWristY ?? 150, localFrac);

  const leftElbowX = Math.min(-72, leftWristX * 0.45 - 92);
  const leftElbowY = lerp(18, leftWristY, 0.56) + 28;
  const leftHandAngle = lerpAngle(kfA.leftHandAngle ?? -Math.PI * 0.5, kfB.leftHandAngle ?? -Math.PI * 0.5, localFrac);

  const rightElbowX = Math.max(72, rightWristX * 0.45 + 92);
  const rightElbowY = lerp(18, rightWristY, 0.56) + 28;
  const rightHandAngle = lerpAngle(kfA.rightHandAngle ?? -Math.PI * 0.5, kfB.rightHandAngle ?? -Math.PI * 0.5, localFrac);

  const hasHeadTilt = typeof kfA.headTiltDeg === 'number' || typeof kfB.headTiltDeg === 'number';
  const headTiltDeg = hasHeadTilt ? lerp(kfA.headTiltDeg ?? 0, kfB.headTiltDeg ?? 0, localFrac) : undefined;
  const activeKf = localFrac < 0.5 ? kfA : kfB;

  return {
    kneeBend,
    clapImpact,
    leftWristX,
    leftWristY,
    leftElbowX,
    leftElbowY,
    leftHandAngle,
    rightWristX,
    rightWristY,
    rightElbowX,
    rightElbowY,
    rightHandAngle,
    headTiltDeg,
    eyeStyle: activeKf.eyeStyle,
    mouthStyle: activeKf.mouthStyle,
  };
}

function defaultRestingLeftArmCoords(shoulderAngle: number, elbowAngle: number) {
  // Approximate left shoulder origin in mascot coordinate space (-74, 34) with upperArm ~72, forearm ~66
  const upperLen = 72;
  const foreLen = 66;
  const ex = -74 - Math.sin(Math.max(0.25, Math.abs(shoulderAngle))) * upperLen;
  const ey = 34 + Math.cos(shoulderAngle) * upperLen;
  const totalFore = shoulderAngle + elbowAngle;
  const wx = Math.min(-88, ex - Math.sin(totalFore * 0.5) * foreLen * 0.65);
  const wy = ey + Math.cos(totalFore * 0.4) * foreLen;
  return { ex, ey, wx, wy, handAngle: -Math.PI * 0.45 };
}

function moodMetrics(
  mood: CartoonExpressionMood,
  targetDir: CartoonHostContext['targetDirection'],
  t: number,
  isSpeaking: boolean,
  mouthOpen: number,
) {
  const browSlope =
    mood === 'worried' || mood === 'sad'
      ? -0.88
      : mood === 'curious'
        ? 0.72
        : mood === 'happy' || mood === 'excited' || mood === 'proud'
          ? 0.42
          : mood === 'cool'
            ? 0.18
            : 0.08;
  const smileBias =
    mood === 'worried' || mood === 'sad'
      ? -0.78
      : mood === 'happy' || mood === 'excited' || mood === 'proud'
        ? 0.95
        : mood === 'cool'
          ? 0.55
          : mood === 'curious'
            ? 0.05
            : 0.35;
  const browLift =
    mood === 'curious' || mood === 'surprised'
      ? 0.76
      : mood === 'worried' || mood === 'sad'
        ? 0.32
        : isSpeaking
          ? 0.24 + mouthOpen * 0.22
          : 0.08;
  const eyeTargetX = clampRange(
    targetDir === 'right'
      ? 0.68
      : mood === 'curious' || mood === 'shy'
        ? 0.28
        : Math.sin(t * 0.7) * 0.14,
    -1,
    1,
  );
  const eyeTargetY = clampRange(
    targetDir === 'up'
      ? -0.62
      : mood === 'worried' || mood === 'sad'
        ? 0.15
        : 0,
    -1,
    1,
  );
  const headShakeX =
    mood === 'worried'
      ? Math.sin(t * 4.2) * 3.0 * (isSpeaking ? 1 : 0.45)
      : 0;
  const headTiltExtra =
    (mood === 'curious' ? 0.055 : 0) +
    (mood === 'worried' || mood === 'sad' ? -0.05 : 0) +
    (mood === 'shy' ? 0.08 : 0) +
    (targetDir === 'right' && mood === 'happy' ? 0.03 : 0);
  return { browSlope, smileBias, browLift, eyeTargetX, eyeTargetY, headShakeX, headTiltExtra };
}

/**
 * Computes deterministic, silky-smooth frame-accurate animation state for the
 * @Gimmys-style cartoon mascot at any timestamp `time`.
 * Context-aware: adapts facial expressions, brow slant, eye gaze direction, and
 * pointing/warning gestures to match right/wrong/question/tip cards, with smooth
 * gradual retraction when cards or cues end.
 */
export function computeSpeechLipSyncState(
  cues: TranscriptCue[],
  time: number,
  context?: CartoonHostContext,
): CartoonLipSyncFrame {
  const t = Math.max(0, time);

  // Natural blinking every ~3.45s
  const blinkCycle = 3.45;
  const phase = t % blinkCycle;
  const blinkWindow = 0.16;
  let blinkFactor = 0;
  if (phase >= 2.85 && phase <= 2.85 + blinkWindow) {
    const bp = (phase - 2.85) / blinkWindow;
    blinkFactor = Math.sin(bp * Math.PI);
  }

  // Locate active cue (tiny lead-in of 60ms for natural anticipation)
  let activeCueIdx = cues.findIndex((c) => t >= c.start && t <= c.end);
  if (activeCueIdx === -1) {
    activeCueIdx = cues.findIndex((c) => t >= c.start - 0.06 && t <= c.end + 0.06);
  }
  const activeCue = activeCueIdx >= 0 ? cues[activeCueIdx] : undefined;

  const endedCueCount = cues.filter((c) => c.end < t).length;
  const lastEndedCueIdx = Math.max(0, endedCueCount - 1);
  const effectiveCueIdx = activeCueIdx >= 0 ? activeCueIdx : lastEndedCueIdx;
  const prevCueIdx = activeCueIdx > 0 ? activeCueIdx - 1 : lastEndedCueIdx;

  // Determine speech / lip-sync viseme first so continuous speechActivity can inform arm ease
  let isSpeaking = false;
  let activeWord = '';
  let viseme: CartoonViseme = 'smile';
  let mouthOpen = 0.04;
  let mouthWidth = 1.06;
  let mouthRound = 0;

  if (activeCue && t >= activeCue.start && t <= activeCue.end) {
    const wordHit = resolveWordTimingAtTime(activeCue, t);
    if (wordHit) {
      isSpeaking = true;
      activeWord = wordHit.word;
      const wDur = Math.max(0.08, wordHit.end - wordHit.start);
      const u = clamp01((t - wordHit.start) / wDur);

      const seq = buildWordVisemeSequence(wordHit.word);
      const segPos = u * seq.length;
      const idx0 = Math.min(seq.length - 1, Math.floor(segPos));
      const idx1 = Math.min(seq.length - 1, idx0 + 1);
      const localFrac = segPos - idx0;

      const v0 = seq[idx0];
      const v1 = seq[idx1];
      const s0 = VISEME_SHAPES[v0];
      const s1 = VISEME_SHAPES[v1];

      const interp = smoothstep(localFrac);
      const wordEnvelope = Math.sin(Math.PI * Math.pow(u, 0.85));
      const syllablePulse = 0.72 + 0.28 * Math.sin(Math.PI * localFrac);
      const rawOpen = lerp(s0.open, s1.open, interp);

      viseme = interp < 0.5 ? v0 : v1;
      mouthOpen = clamp01(rawOpen * (0.35 + 0.65 * wordEnvelope) * syllablePulse);
      mouthWidth = lerp(s0.width, s1.width, interp);
      mouthRound = lerp(s0.round, s1.round, interp);
    }
  }

  const hasActiveSignal =
    Boolean(activeCue) ||
    Boolean(context?.actionId) ||
    Boolean(context?.explicitMood) ||
    Boolean(context?.customSpec) ||
    (Boolean(context?.activeBadge) && context?.activeBadge !== 'none') ||
    Boolean(context?.activeText) ||
    typeof context?.toneValue === 'number';

  const currentState: ClassifiedCartoonState = hasActiveSignal
    ? classifyMoodAndGesture(activeCue, effectiveCueIdx, context)
    : {
        mood: 'neutral',
        gestureMode: 'present',
        pointerGlyph: null,
        params: defaultParamsFor('neutral', 'present', null),
      };

  // Determine previous state & smooth blend factor across BOTH element boundaries and cue transitions
  const hasContextTransition =
    context?.transitionFrom !== undefined &&
    typeof context.transitionProgress === 'number' &&
    context.transitionProgress < 0.999;

  let prevState: ClassifiedCartoonState;
  let gestureBlend = 1;
  let prevTargetDir = context?.targetDirection ?? 'none';

  if (hasContextTransition && context?.transitionFrom) {
    const tf = context.transitionFrom;
    const prevCueMatch = tf.cueText
      ? cues.find((c) => c.text === tf.cueText)
      : undefined;
    const prevCueIdxForCtx = prevCueMatch
      ? cues.indexOf(prevCueMatch)
      : activeCueIdx > 0
        ? prevCueIdx
        : effectiveCueIdx;
    const prevCueForCtx = prevCueMatch ?? cues[prevCueIdxForCtx] ?? activeCue;
    prevState = classifyMoodAndGesture(
      prevCueForCtx,
      Math.max(0, prevCueIdxForCtx),
      tf,
    );
    prevTargetDir = tf.targetDirection ?? 'none';
    gestureBlend = clamp01(context.transitionProgress ?? 1);
  } else if (activeCue) {
    prevState =
      activeCueIdx > 0
        ? classifyMoodAndGesture(cues[prevCueIdx], prevCueIdx, undefined)
        : {
            mood: 'neutral',
            gestureMode: 'present',
            pointerGlyph: null,
            params: defaultParamsFor('neutral', 'present', null),
          };
    gestureBlend = smoothstep((t - (activeCue.start - 0.06)) / 0.48);
  } else {
    // Between cues without a context boundary: ease gently toward resting neutral pose over 0.56s
    const lastEnded = cues[lastEndedCueIdx];
    const hasRecentEnd = Boolean(lastEnded && t > lastEnded.end && !hasActiveSignal);
    if (hasRecentEnd && lastEnded) {
      prevState = classifyMoodAndGesture(lastEnded, lastEndedCueIdx, context);
      gestureBlend = smoothstep((t - lastEnded.end) / 0.56);
    } else {
      prevState = currentState;
      gestureBlend = 1;
    }
  }

  if (!isSpeaking && activeCue && t >= activeCue.start && t <= activeCue.end) {
    viseme = currentState.mood === 'worried' || currentState.mood === 'sad' ? 'closed' : 'smile';
    mouthOpen = 0.04;
    mouthWidth = currentState.mood === 'worried' || currentState.mood === 'sad' ? 0.92 : 1.06;
    mouthRound = 0;
  }

  // Keep cyclic phases on continuous clock `t` (never `t * animSpeed`) so action switches never jump phase!
  const prevSpeed = Math.max(0.4, Math.min(2.2, prevState.params.speed || 1));
  const currSpeed = Math.max(0.4, Math.min(2.2, currentState.params.speed || 1));
  const blendedSpeed = lerp(prevSpeed, currSpeed, gestureBlend);
  const swayGain = 0.8 + 0.2 * blendedSpeed;
  const bounceMult = clampRange(
    lerp(prevState.params.bounceIntensity ?? 1, currentState.params.bounceIntensity ?? 1, gestureBlend),
    0,
    2,
  );

  const pA = ARM_POSES[prevState.gestureMode] ?? ARM_POSES.present;
  const pB = ARM_POSES[currentState.gestureMode] ?? ARM_POSES.present;
  const swayA = Math.sin(t * 1.45) * 0.045 * swayGain;
  const swayB = Math.cos(t * 1.25) * 0.04 * swayGain;
  const hipSway = Math.sin(t * 1.55) * 14;
  const speechActivity = isSpeaking ? clamp01(0.35 + mouthOpen * 0.9) : 0;

  const leftShoulderAngle = lerp(pA.leftShoulder, pB.leftShoulder, gestureBlend) + swayA;
  const leftElbowAngle = lerp(pA.leftElbow, pB.leftElbow, gestureBlend) + swayB * 0.8;
  const rightShoulderAngle = lerp(pA.rightShoulder, pB.rightShoulder, gestureBlend) - swayB * 0.7;
  const rightElbowAngle = lerp(pA.rightElbow, pB.rightElbow, gestureBlend) + swayA * 0.6;

  const armFrom = getRightArmTargetPose(prevState.gestureMode, t, speechActivity, hipSway);
  const armTo = getRightArmTargetPose(currentState.gestureMode, t, speechActivity, hipSway);

  // Subtle outward arc boost mid-transition so the wrist never slices across the torso/head silhouette
  const arcSwing = Math.sin(Math.PI * clamp01(gestureBlend)) * 24;
  let rightElbowX = lerp(armFrom.ex, armTo.ex, gestureBlend) + arcSwing * 0.65;
  let rightElbowY = lerp(armFrom.ey, armTo.ey, gestureBlend);
  let rightWristX =
    currentState.gestureMode === 'clap-jump'
      ? lerp(armFrom.wx, armTo.wx, gestureBlend)
      : Math.max(116, lerp(armFrom.wx, armTo.wx, gestureBlend) + arcSwing);
  let rightWristY = lerp(armFrom.wy, armTo.wy, gestureBlend);
  let rightHandAngle = lerpAngle(armFrom.handAngle, armTo.handAngle, gestureBlend);
  const rightHandPointMix = lerp(armFrom.pointMix, armTo.pointMix, gestureBlend);
  const rightHandCompactMix = lerp(armFrom.compactMix, armTo.compactMix, gestureBlend);

  // Smooth badge fade/scale in and gradual retract fade-out (never vanishes abruptly in 1 frame)
  let badgeGlyph: CartoonLipSyncFrame['badgeGlyph'] = currentState.pointerGlyph;
  let badgeOpacity = currentState.pointerGlyph ? 1 : 0;
  let badgeScale = currentState.pointerGlyph ? 1 : 0.7;

  if (prevState.pointerGlyph !== currentState.pointerGlyph) {
    if (currentState.pointerGlyph && !prevState.pointerGlyph) {
      badgeGlyph = currentState.pointerGlyph;
      badgeOpacity = clamp01(gestureBlend * 1.25);
      badgeScale = lerp(0.68, 1, gestureBlend);
    } else if (!currentState.pointerGlyph && prevState.pointerGlyph) {
      badgeGlyph = prevState.pointerGlyph;
      badgeOpacity = clamp01(1 - gestureBlend * 1.18);
      badgeScale = lerp(1, 0.64, gestureBlend);
      if (badgeOpacity <= 0.02) {
        badgeGlyph = null;
        badgeOpacity = 0;
      }
    } else if (currentState.pointerGlyph && prevState.pointerGlyph) {
      if (gestureBlend < 0.42) {
        badgeGlyph = prevState.pointerGlyph;
        badgeOpacity = clamp01(1 - gestureBlend / 0.42);
        badgeScale = lerp(1, 0.75, gestureBlend / 0.42);
      } else {
        const enter = clamp01((gestureBlend - 0.42) / 0.58);
        badgeGlyph = currentState.pointerGlyph;
        badgeOpacity = enter;
        badgeScale = lerp(0.75, 1, enter);
      }
    }
  }

  const mood = currentState.mood;
  // Grounded posture: zero whole-body hopping and zero body squash/stretch; express purely via limbs, knees & head
  const breathY = Math.sin(t * 1.8) * 1.2 * bounceMult;
  const speakBounceY = isSpeaking
    ? Math.sin(t * 6.2) * 1.3 * bounceMult * clamp01(mouthOpen * 1.5)
    : 0;
  let headBobY = breathY + speakBounceY;

  const bodySquashX = 1;
  const bodySquashY = 1;

  const targetDir = context?.targetDirection ?? 'none';
  const mFrom = moodMetrics(prevState.mood, prevTargetDir, t, isSpeaking, mouthOpen);
  const mTo = moodMetrics(mood, targetDir, t, isSpeaking, mouthOpen);

  const headShakeX = lerp(mFrom.headShakeX, mTo.headShakeX, gestureBlend);
  const eyeTargetX = clampRange(lerp(mFrom.eyeTargetX, mTo.eyeTargetX, gestureBlend), -1, 1);
  const eyeTargetY = clampRange(lerp(mFrom.eyeTargetY, mTo.eyeTargetY, gestureBlend), -1, 1);
  const browSlope = lerp(mFrom.browSlope, mTo.browSlope, gestureBlend);
  const smileBias = lerp(mFrom.smileBias, mTo.smileBias, gestureBlend);
  const browLift = lerp(mFrom.browLift, mTo.browLift, gestureBlend);
  const explicitTiltRad =
    (lerp(prevState.params.headTiltDeg ?? 0, currentState.params.headTiltDeg ?? 0, gestureBlend) *
      Math.PI) /
    180;
  let headTiltRad =
    Math.sin(t * 0.95) * 0.022 +
    lerp(mFrom.headTiltExtra, mTo.headTiltExtra, gestureBlend) +
    explicitTiltRad * 0.7;

  // Keyframe Sequence Evaluation (articulated arm trajectories, grounded knee flexion & head tilt)
  let kneeBend = 0;
  const jumpOffsetY = 0;
  let clapImpact = 0;
  let leftElbowX: number | undefined;
  let leftElbowY: number | undefined;
  let leftWristX: number | undefined;
  let leftWristY: number | undefined;
  let leftHandAngleOut: number | undefined;
  let activeEyeStyle = currentState.params.eyeStyle;
  let activeMouthStyle = currentState.params.mouthStyle;

  const currKfs = resolveSequenceKeyframesForState(currentState);
  const prevKfs = hasContextTransition ? resolveSequenceKeyframesForState(prevState) : undefined;
  const currKfPose =
    currKfs && currKfs.length > 0
      ? evaluateKeyframeArmPose(
          currKfs,
          currentState.params.sequenceDurationSec ?? 1.5,
          currentState.params.loopSequence !== false,
          t * currSpeed,
        )
      : undefined;
  const prevKfPose =
    prevKfs && prevKfs.length > 0
      ? evaluateKeyframeArmPose(
          prevKfs,
          prevState.params.sequenceDurationSec ?? 1.5,
          prevState.params.loopSequence !== false,
          t * prevSpeed,
        )
      : undefined;

  if (currKfPose || prevKfPose) {
    const kfMix = currKfPose && prevKfPose
      ? gestureBlend
      : currKfPose
        ? (hasContextTransition ? gestureBlend : 1)
        : 1 - gestureBlend;

    if (currKfPose && !prevKfPose && !hasContextTransition) {
      kneeBend = currKfPose.kneeBend;
      clapImpact = currKfPose.clapImpact;
      leftWristX = currKfPose.leftWristX;
      leftWristY = currKfPose.leftWristY;
      leftElbowX = currKfPose.leftElbowX;
      leftElbowY = currKfPose.leftElbowY;
      leftHandAngleOut = currKfPose.leftHandAngle;
      rightWristX = currKfPose.rightWristX;
      rightWristY = currKfPose.rightWristY;
      rightElbowX = currKfPose.rightElbowX;
      rightElbowY = currKfPose.rightElbowY;
      rightHandAngle = currKfPose.rightHandAngle;
      if (typeof currKfPose.headTiltDeg === 'number') {
        headTiltRad = (currKfPose.headTiltDeg * Math.PI) / 180;
      }
      if (currKfPose.eyeStyle) activeEyeStyle = currKfPose.eyeStyle;
      if (!isSpeaking && currKfPose.mouthStyle) {
        activeMouthStyle = currKfPose.mouthStyle;
        if (currKfPose.mouthStyle === 'big-grin') {
          mouthOpen = Math.max(mouthOpen, 0.34);
          mouthWidth = 1.18;
        }
      }
      headBobY = speakBounceY;
    } else {
      const restLeft = defaultRestingLeftArmCoords(leftShoulderAngle, leftElbowAngle);
      const fromKnee = prevKfPose?.kneeBend ?? 0;
      const toKnee = currKfPose?.kneeBend ?? 0;
      kneeBend = clamp01(lerp(fromKnee, toKnee, gestureBlend));

      const fromClap = prevKfPose?.clapImpact ?? 0;
      const toClap = currKfPose?.clapImpact ?? 0;
      clapImpact = clamp01(lerp(fromClap, toClap, gestureBlend));

      const fromLWX = prevKfPose?.leftWristX ?? restLeft.wx;
      const fromLWY = prevKfPose?.leftWristY ?? restLeft.wy;
      const fromLEX = prevKfPose?.leftElbowX ?? restLeft.ex;
      const fromLEY = prevKfPose?.leftElbowY ?? restLeft.ey;
      const fromLHA = prevKfPose?.leftHandAngle ?? restLeft.handAngle;

      const toLWX = currKfPose?.leftWristX ?? restLeft.wx;
      const toLWY = currKfPose?.leftWristY ?? restLeft.wy;
      const toLEX = currKfPose?.leftElbowX ?? restLeft.ex;
      const toLEY = currKfPose?.leftElbowY ?? restLeft.ey;
      const toLHA = currKfPose?.leftHandAngle ?? restLeft.handAngle;

      if (kfMix > 0.02) {
        leftWristX = lerp(fromLWX, toLWX, gestureBlend);
        leftWristY = lerp(fromLWY, toLWY, gestureBlend);
        leftElbowX = lerp(fromLEX, toLEX, gestureBlend);
        leftElbowY = lerp(fromLEY, toLEY, gestureBlend);
        leftHandAngleOut = lerpAngle(fromLHA, toLHA, gestureBlend);
      }

      const fromRWX = prevKfPose?.rightWristX ?? armFrom.wx;
      const fromRWY = prevKfPose?.rightWristY ?? armFrom.wy;
      const fromREX = prevKfPose?.rightElbowX ?? armFrom.ex;
      const fromREY = prevKfPose?.rightElbowY ?? armFrom.ey;
      const fromRHA = prevKfPose?.rightHandAngle ?? armFrom.handAngle;

      const toRWX = currKfPose?.rightWristX ?? Math.max(116, armTo.wx);
      const toRWY = currKfPose?.rightWristY ?? armTo.wy;
      const toREX = currKfPose?.rightElbowX ?? armTo.ex;
      const toREY = currKfPose?.rightElbowY ?? armTo.ey;
      const toRHA = currKfPose?.rightHandAngle ?? armTo.handAngle;

      rightWristX = lerp(fromRWX, toRWX, gestureBlend);
      rightWristY = lerp(fromRWY, toRWY, gestureBlend);
      rightElbowX = lerp(fromREX, toREX, gestureBlend);
      rightElbowY = lerp(fromREY, toREY, gestureBlend);
      rightHandAngle = lerpAngle(fromRHA, toRHA, gestureBlend);

      const baseTiltDeg = (headTiltRad * 180) / Math.PI;
      const fromTiltDeg = prevKfPose?.headTiltDeg ?? baseTiltDeg;
      const toTiltDeg = currKfPose?.headTiltDeg ?? baseTiltDeg;
      headTiltRad = (lerp(fromTiltDeg, toTiltDeg, gestureBlend) * Math.PI) / 180;

      if (currKfPose) {
        if (gestureBlend >= 0.45 && currKfPose.eyeStyle) activeEyeStyle = currKfPose.eyeStyle;
        if (!isSpeaking && gestureBlend >= 0.45 && currKfPose.mouthStyle) {
          activeMouthStyle = currKfPose.mouthStyle;
          if (currKfPose.mouthStyle === 'big-grin') {
            mouthOpen = Math.max(mouthOpen, lerp(0.08, 0.34, gestureBlend));
            mouthWidth = lerp(1.06, 1.18, gestureBlend);
          }
        }
      }
      headBobY = lerp(breathY + speakBounceY, speakBounceY, kfMix);
    }
  }

  const blushIntensity = lerp(
    prevState.params.blushIntensity ?? 0,
    currentState.params.blushIntensity ?? 0,
    gestureBlend,
  );

  return {
    isSpeaking,
    activeWord,
    activeCueText: activeCue?.text ?? '',
    viseme,
    mouthOpen,
    mouthWidth,
    mouthRound,
    blinkFactor,
    headBobY,
    headShakeX,
    headTiltRad,
    browLift,
    browSlope,
    smileBias,
    eyeTargetX,
    eyeTargetY,
    mood,
    pointerGlyph: currentState.pointerGlyph,
    leftShoulderAngle,
    leftElbowAngle,
    rightShoulderAngle,
    rightElbowAngle,
    rightElbowX,
    rightElbowY,
    rightWristX,
    rightWristY,
    rightHandAngle,
    rightHandPointMix,
    rightHandCompactMix,
    leftElbowX,
    leftElbowY,
    leftWristX,
    leftWristY,
    leftHandAngle: leftHandAngleOut,
    kneeBend,
    jumpOffsetY,
    clapImpact,
    badgeGlyph,
    badgeEmoji: currentState.params.badgeEmoji,
    badgeOpacity,
    badgeScale,
    gestureMode: currentState.gestureMode,
    actionId: currentState.actionId,
    eyeStyle: activeEyeStyle,
    mouthStyle: activeMouthStyle,
    fxOverlay: currentState.params.fxOverlay,
    accessory: currentState.params.accessory,
    blushIntensity: blushIntensity > 0.02 ? blushIntensity : 0,
    bodySquashX,
    bodySquashY,
  };
}
