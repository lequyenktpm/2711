import {
  CartoonAccessory,
  CartoonAnimationDefinition,
  CartoonAnimationParams,
  CartoonExpressionMood,
  CartoonEyeStyle,
  CartoonFxOverlay,
  CartoonGestureMode,
  CartoonMouthStyle,
} from './types';

const STORAGE_KEY = 'kineticsub_cartoon_animations_v1';

interface CartoonAnimationStorePayload {
  version: 1;
  animations: CartoonAnimationDefinition[];
  hiddenBuiltIns: string[];
}

export const DEFAULT_CARTOON_ANIMATION_PARAMS: CartoonAnimationParams = {
  mood: 'happy',
  gestureMode: 'explain',
  eyeStyle: 'normal',
  mouthStyle: 'lip-sync',
  fxOverlay: 'none',
  accessory: 'none',
  badgeGlyph: null,
  badgeEmoji: undefined,
  speed: 1,
  bounceIntensity: 1,
  headTiltDeg: 0,
  blushIntensity: 0.25,
  bodySquashStretch: 0.04,
};

export const BUILTIN_CARTOON_ANIMATIONS: CartoonAnimationDefinition[] = [
  {
    id: 'explain',
    label: 'Giải thích tự nhiên (Explain)',
    category: 'teaching',
    description: 'Nhịp tay mở linh hoạt khi giảng bài, nhép miệng chuẩn theo lời thoại.',
    keywords: ['explain', 'teach', 'lesson', 'note', 'grammar', 'giải thích', 'bài học'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'neutral',
      gestureMode: 'explain',
      eyeStyle: 'normal',
      mouthStyle: 'lip-sync',
      fxOverlay: 'none',
      accessory: 'none',
      badgeGlyph: null,
      speed: 1,
      bounceIntensity: 1,
      headTiltDeg: 2,
      blushIntensity: 0.15,
      bodySquashStretch: 0.03,
    },
  },
  {
    id: 'present',
    label: 'Đứng chào chỉnh tề (Present)',
    category: 'greeting',
    description: 'Tư thế tự tin, hai tay đặt gọn bên hông nhẹ nhàng nhún theo nhịp thở.',
    keywords: ['present', 'idle', 'stand', 'intro', 'giới thiệu'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'happy',
      gestureMode: 'present',
      eyeStyle: 'normal',
      mouthStyle: 'lip-sync',
      fxOverlay: 'none',
      accessory: 'none',
      badgeGlyph: null,
      speed: 0.9,
      bounceIntensity: 0.75,
      headTiltDeg: 0,
      blushIntensity: 0.2,
      bodySquashStretch: 0.02,
    },
  },
  {
    id: 'wave-hello',
    label: 'Vẫy tay chào mừng (Wave Hello)',
    category: 'greeting',
    description: 'Vẫy tay nhiệt tình kèm mắt cười cong và ánh sao lấp lánh đầu video.',
    keywords: ['wave', 'hello', 'hi', 'welcome', 'chào', 'mở đầu', 'intro'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'happy',
      gestureMode: 'wave',
      eyeStyle: 'happy-arc',
      mouthStyle: 'big-grin',
      fxOverlay: 'sparkles',
      accessory: 'none',
      badgeGlyph: null,
      badgeEmoji: '👋',
      speed: 1.25,
      bounceIntensity: 1.3,
      headTiltDeg: 6,
      blushIntensity: 0.55,
      bodySquashStretch: 0.08,
    },
  },
  {
    id: 'approve-tip',
    label: 'Gợi ý mẹo hay (Approve Tip 💡)',
    category: 'teaching',
    description: 'Chỉ tay lên kèm bóng đèn ý tưởng và huy hiệu Tip màu xanh dương.',
    keywords: ['tip', 'idea', 'polite', 'remember', 'better', 'mẹo', 'lưu ý'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'proud',
      gestureMode: 'approve-tip',
      eyeStyle: 'star',
      mouthStyle: 'lip-sync',
      fxOverlay: 'lightbulb',
      accessory: 'none',
      badgeGlyph: 'tip',
      badgeEmoji: '💡',
      speed: 1.05,
      bounceIntensity: 1.15,
      headTiltDeg: 4,
      blushIntensity: 0.35,
      bodySquashStretch: 0.05,
    },
  },
  {
    id: 'point-up',
    label: 'Chỉ lên thẻ câu (Point Up ☝️)',
    category: 'teaching',
    description: 'Đưa tay trỏ thẳng lên thẻ nội dung phía trên đầu.',
    keywords: ['look', 'above', 'card', 'read', 'xem', 'trên', 'point up'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'curious',
      gestureMode: 'point-up',
      eyeStyle: 'normal',
      mouthStyle: 'lip-sync',
      fxOverlay: 'none',
      accessory: 'pointer-stick',
      badgeGlyph: null,
      speed: 1.0,
      bounceIntensity: 0.9,
      headTiltDeg: -3,
      blushIntensity: 0.15,
      bodySquashStretch: 0.03,
    },
  },
  {
    id: 'point-right',
    label: 'Chỉ sang bảng bên phải (Point Right 👉)',
    category: 'teaching',
    description: 'Mắt liếc sang phải và đưa tay chỉ vào khung so sánh bên cạnh.',
    keywords: ['compare', 'right', 'example', 'so sánh', 'ví dụ', 'bên phải'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'happy',
      gestureMode: 'point-right',
      eyeStyle: 'normal',
      mouthStyle: 'lip-sync',
      fxOverlay: 'none',
      accessory: 'pointer-stick',
      badgeGlyph: null,
      speed: 1.0,
      bounceIntensity: 0.9,
      headTiltDeg: 5,
      blushIntensity: 0.25,
      bodySquashStretch: 0.03,
    },
  },
  {
    id: 'thumbs-up',
    label: 'Giơ ngón cái chuẩn xác (Thumbs Up 👍)',
    category: 'emphasis',
    description: 'Giơ ngón cái 👍 kèm huy hiệu check xanh và biểu cảm tự hào.',
    keywords: ['correct', 'natural', 'native', 'right', 'yes', 'chuẩn', 'đúng', 'tốt'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'proud',
      gestureMode: 'thumbs-up',
      eyeStyle: 'happy-arc',
      mouthStyle: 'big-grin',
      fxOverlay: 'check-burst',
      accessory: 'none',
      badgeGlyph: 'check',
      badgeEmoji: '👍',
      speed: 1.1,
      bounceIntensity: 1.2,
      headTiltDeg: 5,
      blushIntensity: 0.45,
      bodySquashStretch: 0.06,
    },
  },
  {
    id: 'warn-avoid',
    label: 'Cảnh báo tránh dùng (Warn Avoid ⚠️)',
    category: 'reaction',
    description: 'Lắc đầu nhẹ, mày nhíu lo lắng và giơ tay ra hiệu ❌ cần tránh.',
    keywords: ['wrong', 'avoid', 'mistake', 'rude', 'never', "don't", 'sai', 'tránh'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'worried',
      gestureMode: 'warn-avoid',
      eyeStyle: 'focused',
      mouthStyle: 'wavy-nervous',
      fxOverlay: 'warning-bolt',
      accessory: 'none',
      badgeGlyph: 'cross',
      badgeEmoji: '⚠️',
      speed: 1.15,
      bounceIntensity: 0.85,
      headTiltDeg: -6,
      blushIntensity: 0,
      bodySquashStretch: 0.04,
    },
  },
  {
    id: 'question',
    label: 'Thắc mắc đặt câu hỏi (Question ❓)',
    category: 'teaching',
    description: 'Nghiêng đầu tò mò, nhướng 1 bên lông mày và hiện dấu chấm hỏi bay.',
    keywords: ['question', 'quiz', 'why', 'how', 'which', 'hỏi', 'tại sao', 'đố'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'curious',
      gestureMode: 'question',
      eyeStyle: 'normal',
      mouthStyle: 'lip-sync',
      fxOverlay: 'question-marks',
      accessory: 'none',
      badgeGlyph: 'question',
      badgeEmoji: '❓',
      speed: 0.95,
      bounceIntensity: 0.85,
      headTiltDeg: 10,
      blushIntensity: 0.15,
      bodySquashStretch: 0.04,
    },
  },
  {
    id: 'thinking-chin',
    label: 'Chống cằm suy nghĩ (Thinking 🤔)',
    category: 'reaction',
    description: 'Đưa tay lên cằm suy tư trong lúc đếm ngược Quiz / Phản xạ dịch.',
    keywords: ['think', 'countdown', 'pause', 'guess', 'suy nghĩ', 'đếm ngược'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'curious',
      gestureMode: 'think-chin',
      eyeStyle: 'focused',
      mouthStyle: 'flat-serious',
      fxOverlay: 'question-marks',
      accessory: 'none',
      badgeGlyph: 'question',
      badgeEmoji: '🤔',
      speed: 0.8,
      bounceIntensity: 0.5,
      headTiltDeg: 8,
      blushIntensity: 0.1,
      bodySquashStretch: 0.02,
    },
  },
  {
    id: 'mind-blown',
    label: 'Bất ngờ vỡ òa (Shocked / Wow 🤯)',
    category: 'reaction',
    description: 'Mắt mở to lấp lánh, miệng chữ O ngạc nhiên khi phát hiện bí quyết.',
    keywords: ['shock', 'wow', 'surprise', 'amazing', 'secret', 'ngạc nhiên', 'bất ngờ'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'surprised',
      gestureMode: 'double-point',
      eyeStyle: 'wide-surprised',
      mouthStyle: 'o-shock',
      fxOverlay: 'sparkles',
      accessory: 'none',
      badgeGlyph: 'tip',
      badgeEmoji: '🤯',
      speed: 1.4,
      bounceIntensity: 1.6,
      headTiltDeg: -4,
      blushIntensity: 0.3,
      bodySquashStretch: 0.14,
    },
  },
  {
    id: 'cheer',
    label: 'Cổ vũ hào hứng (Cheer 🎉)',
    category: 'emphasis',
    description: 'Giơ tay cao ăn mừng rạng rỡ với hiệu ứng tim và sao tung bay.',
    keywords: ['cheer', 'great', 'awesome', 'congrats', 'done', 'tuyệt vời', 'chúc mừng'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'excited',
      gestureMode: 'cheer',
      eyeStyle: 'star',
      mouthStyle: 'big-grin',
      fxOverlay: 'sparkles',
      accessory: 'none',
      badgeGlyph: 'check',
      badgeEmoji: '🎉',
      speed: 1.3,
      bounceIntensity: 1.5,
      headTiltDeg: 6,
      blushIntensity: 0.65,
      bodySquashStretch: 0.1,
    },
  },
  {
    id: 'celebrate-jump',
    label: 'Nhảy ăn mừng bùng nổ (Victory Fist 🔥)',
    category: 'emphasis',
    description: 'Nắm tay đấm không khí cực sung kèm hào quang lửa nhiệt huyết.',
    keywords: ['victory', 'win', 'finish', 'boom', 'fire', 'chiến thắng', 'bùng nổ'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'excited',
      gestureMode: 'fist-pump',
      eyeStyle: 'star',
      mouthStyle: 'big-grin',
      fxOverlay: 'fire-aura',
      accessory: 'graduation-cap',
      badgeGlyph: 'check',
      badgeEmoji: '🔥',
      speed: 1.5,
      bounceIntensity: 1.8,
      headTiltDeg: 4,
      blushIntensity: 0.6,
      bodySquashStretch: 0.16,
    },
  },
  {
    id: 'cool-native',
    label: 'Ngầu chuẩn bản xứ (Cool Native 😎)',
    category: 'emphasis',
    description: 'Đeo kính râm sành điệu, nhếch mép tự tin và nói câu chuẩn người bản xứ.',
    keywords: ['cool', 'slang', 'native', 'boss', 'pro', 'ngầu', 'bản xứ'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'cool',
      gestureMode: 'thumbs-up',
      eyeStyle: 'cool-shades',
      mouthStyle: 'smirk',
      fxOverlay: 'sparkles',
      accessory: 'sunglasses',
      badgeGlyph: 'tip',
      badgeEmoji: '😎',
      speed: 0.95,
      bounceIntensity: 0.9,
      headTiltDeg: -6,
      blushIntensity: 0.1,
      bodySquashStretch: 0.04,
    },
  },
  {
    id: 'hold-mic',
    label: 'Phóng viên / Luyện phát âm (Hold Mic 🎤)',
    category: 'teaching',
    description: 'Cầm micro nói rõ từng âm tiết kèm nốt nhạc nhịp điệu.',
    keywords: ['speak', 'pronounce', 'repeat', 'shadowing', 'mic', 'phát âm', 'đọc theo'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'happy',
      gestureMode: 'hold-mic',
      eyeStyle: 'normal',
      mouthStyle: 'lip-sync',
      fxOverlay: 'music-notes',
      accessory: 'mic',
      badgeGlyph: null,
      badgeEmoji: '🎤',
      speed: 1.05,
      bounceIntensity: 1.05,
      headTiltDeg: 3,
      blushIntensity: 0.3,
      bodySquashStretch: 0.05,
    },
  },
  {
    id: 'sad-oops',
    label: 'Bối rối vỗ trán (Facepalm Oops 😅)',
    category: 'reaction',
    description: 'Vỗ trán kèm giọt mồ hôi bối rối khi nhắc lỗi sai thường gặp.',
    keywords: ['oops', 'fail', 'error', 'embarrassed', 'sad', 'bối rối', 'tiếc'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'sad',
      gestureMode: 'facepalm',
      eyeStyle: 'sleepy',
      mouthStyle: 'wavy-nervous',
      fxOverlay: 'sweat-drop',
      accessory: 'none',
      badgeGlyph: 'cross',
      badgeEmoji: '😅',
      speed: 0.85,
      bounceIntensity: 0.65,
      headTiltDeg: -10,
      blushIntensity: 0.45,
      bodySquashStretch: 0.06,
    },
  },
  {
    id: 'shrug-unsure',
    label: 'Nhún vai phân vân (Shrug 🤷)',
    category: 'reaction',
    description: 'Hai tay mở nhún vai nhẹ khi nêu sự khác biệt hoặc câu hỏi mở.',
    keywords: ['shrug', 'maybe', 'difference', 'confused', 'phân vân', 'khác nhau'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'curious',
      gestureMode: 'shrug',
      eyeStyle: 'normal',
      mouthStyle: 'flat-serious',
      fxOverlay: 'question-marks',
      accessory: 'none',
      badgeGlyph: 'question',
      badgeEmoji: '🤷',
      speed: 0.9,
      bounceIntensity: 0.75,
      headTiltDeg: 7,
      blushIntensity: 0.2,
      bodySquashStretch: 0.04,
    },
  },
];

const listeners = new Set<() => void>();
let cachedPayload: CartoonAnimationStorePayload | null = null;
let hasHydratedFromServer = false;

function hasWindow(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function slugifyCartoonActionId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

const VALID_GESTURES = new Set<CartoonGestureMode>([
  'present',
  'explain',
  'question',
  'cheer',
  'point-up',
  'point-right',
  'warn-avoid',
  'approve-tip',
  'wave',
  'shrug',
  'think-chin',
  'thumbs-up',
  'double-point',
  'facepalm',
  'fist-pump',
  'hold-mic',
]);

const VALID_MOODS = new Set<CartoonExpressionMood>([
  'neutral',
  'happy',
  'worried',
  'curious',
  'surprised',
  'excited',
  'sad',
  'cool',
  'proud',
  'shy',
]);

const VALID_EYES = new Set<CartoonEyeStyle>([
  'normal',
  'happy-arc',
  'wide-surprised',
  'wink',
  'star',
  'focused',
  'sleepy',
  'heart',
  'cool-shades',
]);

const VALID_MOUTHS = new Set<CartoonMouthStyle>([
  'lip-sync',
  'smile',
  'big-grin',
  'o-shock',
  'wavy-nervous',
  'flat-serious',
  'smirk',
]);

const VALID_FX = new Set<CartoonFxOverlay>([
  'none',
  'sparkles',
  'lightbulb',
  'warning-bolt',
  'question-marks',
  'hearts',
  'music-notes',
  'sweat-drop',
  'check-burst',
  'fire-aura',
]);

const VALID_ACCESSORIES = new Set<CartoonAccessory>([
  'none',
  'badge-card',
  'megaphone',
  'pointer-stick',
  'mic',
  'graduation-cap',
  'sunglasses',
]);

function normalizeMoodAlias(rawMood: string): string {
  switch (rawMood) {
    case 'celebrate':
    case 'cheer':
    case 'joy':
      return 'excited';
    case 'warning':
    case 'alert':
    case 'nervous':
    case 'angry':
      return 'worried';
    case 'thinking':
    case 'confused':
    case 'ponder':
      return 'curious';
    case 'confident':
    case 'smart':
      return 'proud';
    case 'love':
    case 'warm':
      return 'happy';
    default:
      return rawMood;
  }
}

function normalizeGestureAlias(rawGesture: string): string {
  switch (rawGesture) {
    case 'celebrate':
    case 'celebrate-arms':
    case 'celebrate-jump':
    case 'clap-hands':
    case 'dance-grooving':
      return 'cheer';
    case 'warn-shake':
    case 'warn':
      return 'warn-avoid';
    case 'idea-bulb':
    case 'tip':
      return 'approve-tip';
    case 'think':
    case 'thinking':
    case 'thinking-chin':
      return 'think-chin';
    case 'wave-greet':
    case 'wave-hello':
      return 'wave';
    case 'hold-pointer':
    case 'present-side':
    case 'hold-megaphone':
      return 'explain';
    case 'peace-sign':
    case 'salute':
    case 'chest-heart':
      return 'thumbs-up';
    default:
      return rawGesture;
  }
}

function normalizeFxAlias(rawFx: string): string {
  switch (rawFx) {
    case 'confetti':
    case 'stars':
    case 'glitter':
    case 'sparkle':
      return 'sparkles';
    case 'bulb':
    case 'idea':
      return 'lightbulb';
    case 'warning':
    case 'bolt':
      return 'warning-bolt';
    case 'question':
      return 'question-marks';
    case 'heart':
      return 'hearts';
    case 'music':
      return 'music-notes';
    case 'fire':
      return 'fire-aura';
    default:
      return rawFx;
  }
}

export function sanitizeCartoonAnimationParams(
  raw: unknown,
  fallback: CartoonAnimationParams = DEFAULT_CARTOON_ANIMATION_PARAMS,
): CartoonAnimationParams {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const moodStr = normalizeMoodAlias(
    typeof obj.mood === 'string' ? obj.mood.trim().toLowerCase() : '',
  );
  const gestureStr = normalizeGestureAlias(
    typeof obj.gestureMode === 'string'
      ? obj.gestureMode.trim().toLowerCase()
      : typeof obj.gesture === 'string'
        ? obj.gesture.trim().toLowerCase()
        : '',
  );
  const eyeStr = typeof obj.eyeStyle === 'string' ? obj.eyeStyle.trim().toLowerCase() : '';
  const mouthRaw = typeof obj.mouthStyle === 'string' ? obj.mouthStyle.trim().toLowerCase() : '';
  const mouthStr = mouthRaw === 'open-happy' ? 'big-grin' : mouthRaw;
  const fxStr = normalizeFxAlias(
    typeof obj.fxOverlay === 'string' ? obj.fxOverlay.trim().toLowerCase() : '',
  );
  const accStr = typeof obj.accessory === 'string' ? obj.accessory.trim().toLowerCase() : '';

  const badgeRaw = obj.badgeGlyph;
  const badgeGlyph: CartoonAnimationParams['badgeGlyph'] =
    badgeRaw === 'check' || badgeRaw === 'cross' || badgeRaw === 'question' || badgeRaw === 'tip'
      ? badgeRaw
      : badgeRaw === null || badgeRaw === 'none'
        ? null
        : fallback.badgeGlyph;

  return {
    mood: VALID_MOODS.has(moodStr as CartoonExpressionMood)
      ? (moodStr as CartoonExpressionMood)
      : fallback.mood,
    gestureMode: VALID_GESTURES.has(gestureStr as CartoonGestureMode)
      ? (gestureStr as CartoonGestureMode)
      : fallback.gestureMode,
    eyeStyle: VALID_EYES.has(eyeStr as CartoonEyeStyle)
      ? (eyeStr as CartoonEyeStyle)
      : fallback.eyeStyle,
    mouthStyle: VALID_MOUTHS.has(mouthStr as CartoonMouthStyle)
      ? (mouthStr as CartoonMouthStyle)
      : fallback.mouthStyle,
    fxOverlay: VALID_FX.has(fxStr as CartoonFxOverlay)
      ? (fxStr as CartoonFxOverlay)
      : fallback.fxOverlay,
    accessory: VALID_ACCESSORIES.has(accStr as CartoonAccessory)
      ? (accStr as CartoonAccessory)
      : fallback.accessory,
    badgeGlyph,
    badgeEmoji:
      typeof obj.badgeEmoji === 'string' && obj.badgeEmoji.trim()
        ? obj.badgeEmoji.trim().slice(0, 6)
        : fallback.badgeEmoji,
    speed:
      typeof obj.speed === 'number' && Number.isFinite(obj.speed)
        ? Math.max(0.4, Math.min(2.2, Number(obj.speed.toFixed(2))))
        : fallback.speed,
    bounceIntensity:
      typeof obj.bounceIntensity === 'number' && Number.isFinite(obj.bounceIntensity)
        ? Math.max(0, Math.min(2, Number(obj.bounceIntensity.toFixed(2))))
        : typeof obj.bounceAmp === 'number' && Number.isFinite(obj.bounceAmp)
          ? Math.max(0, Math.min(2, Number(obj.bounceAmp.toFixed(2))))
          : fallback.bounceIntensity,
    headTiltDeg:
      typeof obj.headTiltDeg === 'number' && Number.isFinite(obj.headTiltDeg)
        ? Math.max(-25, Math.min(25, Math.round(obj.headTiltDeg)))
        : fallback.headTiltDeg,
    blushIntensity:
      typeof obj.blushIntensity === 'number' && Number.isFinite(obj.blushIntensity)
        ? Math.max(0, Math.min(1, Number(obj.blushIntensity.toFixed(2))))
        : fallback.blushIntensity,
    bodySquashStretch:
      typeof obj.bodySquashStretch === 'number' && Number.isFinite(obj.bodySquashStretch)
        ? Math.max(0, Math.min(0.35, Number(obj.bodySquashStretch.toFixed(2))))
        : fallback.bodySquashStretch,
  };
}

function sanitizeDefinition(raw: unknown): CartoonAnimationDefinition | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id = slugifyCartoonActionId(String(obj.id || obj.actionId || obj.label || obj.name || ''));
  if (!id) return null;
  const label =
    typeof obj.label === 'string' && obj.label.trim()
      ? obj.label.trim()
      : typeof obj.name === 'string' && obj.name.trim()
        ? obj.name.trim()
        : id;
  const catRaw = typeof obj.category === 'string' ? obj.category.trim().toLowerCase() : 'custom';
  const category: CartoonAnimationDefinition['category'] =
    catRaw === 'greeting' || catRaw === 'teaching' || catRaw === 'reaction' || catRaw === 'emphasis'
      ? catRaw
      : 'custom';
  const keywords = Array.isArray(obj.keywords)
    ? obj.keywords.map((k) => String(k).trim()).filter(Boolean)
    : typeof obj.keywords === 'string'
      ? obj.keywords
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  const paramsSource = obj.params && typeof obj.params === 'object' ? obj.params : obj;
  const params = sanitizeCartoonAnimationParams(paramsSource);

  return {
    id,
    label,
    category,
    description:
      typeof obj.description === 'string' && obj.description.trim()
        ? obj.description.trim()
        : `${params.mood} + ${params.gestureMode}`,
    keywords,
    source: obj.source === 'built-in' ? 'built-in' : 'custom',
    updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : Date.now(),
    params,
  };
}

function readPayload(): CartoonAnimationStorePayload {
  if (cachedPayload) return cachedPayload;
  if (!hasWindow()) {
    cachedPayload = { version: 1, animations: [], hiddenBuiltIns: [] };
    return cachedPayload;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cachedPayload = { version: 1, animations: [], hiddenBuiltIns: [] };
      return cachedPayload;
    }
    const parsed = JSON.parse(raw) as Partial<CartoonAnimationStorePayload>;
    const animations = Array.isArray(parsed.animations)
      ? parsed.animations
          .map(sanitizeDefinition)
          .filter((d): d is CartoonAnimationDefinition => Boolean(d))
      : [];
    const hiddenBuiltIns = Array.isArray(parsed.hiddenBuiltIns)
      ? parsed.hiddenBuiltIns.map((s) => String(s)).filter(Boolean)
      : [];
    cachedPayload = { version: 1, animations, hiddenBuiltIns };
    return cachedPayload;
  } catch {
    cachedPayload = { version: 1, animations: [], hiddenBuiltIns: [] };
    return cachedPayload;
  }
}

function notifyListeners() {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // ignore subscriber failure
    }
  });
}

function writePayload(next: CartoonAnimationStorePayload) {
  cachedPayload = next;
  if (hasWindow()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
  }
  notifyListeners();
  void pushCartoonAnimationsToServer(next);
}

export async function pushCartoonAnimationsToServer(
  payload?: CartoonAnimationStorePayload,
): Promise<boolean> {
  if (typeof fetch === 'undefined') return false;
  const body = payload ?? readPayload();
  try {
    const res = await fetch('/api/cartoon-animations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function syncCartoonAnimationsFromServer(): Promise<void> {
  if (hasHydratedFromServer || typeof fetch === 'undefined') return;
  try {
    const res = await fetch('/api/cartoon-animations');
    if (!res.ok) return;
    const data = (await res.json()) as {
      animations?: unknown[];
      hiddenBuiltIns?: string[];
    };
    const serverAnims = Array.isArray(data?.animations)
      ? data.animations
          .map(sanitizeDefinition)
          .filter((d): d is CartoonAnimationDefinition => Boolean(d))
      : [];
    const serverHidden = Array.isArray(data?.hiddenBuiltIns)
      ? data.hiddenBuiltIns.map(String).filter(Boolean)
      : [];

    const local = readPayload();
    // Merge: local overrides or server wins on newer timestamp
    const mergedMap = new Map<string, CartoonAnimationDefinition>();
    serverAnims.forEach((a) => mergedMap.set(a.id, a));
    local.animations.forEach((a) => {
      const prev = mergedMap.get(a.id);
      if (!prev || a.updatedAt >= prev.updatedAt) {
        mergedMap.set(a.id, a);
      }
    });
    const hiddenSet = new Set<string>([...serverHidden, ...local.hiddenBuiltIns]);
    const merged: CartoonAnimationStorePayload = {
      version: 1,
      animations: Array.from(mergedMap.values()),
      hiddenBuiltIns: Array.from(hiddenSet),
    };
    cachedPayload = merged;
    if (hasWindow()) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch {
        // ignore
      }
    }
    hasHydratedFromServer = true;
    notifyListeners();
  } catch {
    // ignore startup fetch error
  }
}

export function subscribeCartoonAnimations(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAllCartoonAnimations(): CartoonAnimationDefinition[] {
  const payload = readPayload();
  const hiddenSet = new Set(payload.hiddenBuiltIns);
  const customMap = new Map(payload.animations.map((a) => [a.id, a]));

  const builtInMerged: CartoonAnimationDefinition[] = BUILTIN_CARTOON_ANIMATIONS.map((b) => {
    const override = customMap.get(b.id);
    if (override) {
      return {
        ...override,
        source: 'built-in',
        isHidden: hiddenSet.has(b.id),
      };
    }
    return {
      ...b,
      isHidden: hiddenSet.has(b.id),
    };
  });

  const builtInIds = new Set(BUILTIN_CARTOON_ANIMATIONS.map((b) => b.id));
  const extraCustom = payload.animations
    .filter((a) => !builtInIds.has(a.id))
    .map((a) => ({ ...a, source: 'custom' as const, isHidden: false }));

  return [...extraCustom, ...builtInMerged];
}

export function getEffectiveCartoonAnimationCatalog(): CartoonAnimationDefinition[] {
  return getAllCartoonAnimations().filter((a) => !a.isHidden);
}

const ACTION_ID_ALIAS_MAP: Record<string, string> = {
  'warn-shake': 'warn-avoid',
  'wave-greet': 'wave-hello',
  'celebrate-sparkle': 'celebrate-jump',
  'idea-bulb': 'approve-tip',
  'think-chin': 'thinking-chin',
};

export function getCartoonAnimationById(actionId?: string | null): CartoonAnimationDefinition | undefined {
  if (!actionId) return undefined;
  const rawSlug = slugifyCartoonActionId(actionId);
  const clean = ACTION_ID_ALIAS_MAP[rawSlug] ?? rawSlug;
  if (!clean) return undefined;
  const all = getAllCartoonAnimations();
  return all.find((a) => a.id === clean) ?? all.find((a) => a.id.includes(clean) || clean.includes(a.id));
}

export function upsertCartoonAnimation(
  def: CartoonAnimationDefinition | (Partial<CartoonAnimationDefinition> & Record<string, unknown>),
): CartoonAnimationDefinition {
  const rec = def as Record<string, unknown>;
  const rawLabel =
    typeof def.label === 'string' && def.label.trim()
      ? def.label.trim()
      : typeof rec.name === 'string' && rec.name.trim()
        ? rec.name.trim()
        : '';
  const cleanId =
    slugifyCartoonActionId(String(def.id || rec.actionId || rawLabel || `action-${Date.now()}`)) ||
    `action-${Date.now()}`;
  const isBuiltIn = BUILTIN_CARTOON_ANIMATIONS.some((b) => b.id === cleanId);
  const sanitizedParams = sanitizeCartoonAnimationParams(def.params ?? rec);
  const rawKeywords = Array.isArray(def.keywords) ? def.keywords : [];
  const rawDesc = typeof def.description === 'string' ? def.description.trim() : '';
  const rawCat = def.category;
  const category: CartoonAnimationDefinition['category'] =
    rawCat === 'greeting' || rawCat === 'teaching' || rawCat === 'reaction' || rawCat === 'emphasis'
      ? rawCat
      : 'custom';
  const normalized: CartoonAnimationDefinition = {
    id: cleanId,
    label: rawLabel || cleanId,
    category,
    description: rawDesc || `${sanitizedParams.mood} · ${sanitizedParams.gestureMode}`,
    keywords: Array.from(new Set(rawKeywords.map((k) => String(k).trim()).filter(Boolean))),
    source: isBuiltIn ? 'built-in' : 'custom',
    isHidden: false,
    updatedAt: Date.now(),
    params: sanitizedParams,
  };

  const payload = readPayload();
  const nextAnims = [
    ...payload.animations.filter((a) => a.id !== cleanId),
    normalized,
  ];
  const nextHidden = payload.hiddenBuiltIns.filter((id) => id !== cleanId);
  writePayload({ version: 1, animations: nextAnims, hiddenBuiltIns: nextHidden });
  return normalized;
}

export function deleteCartoonAnimation(id: string): void {
  const clean = slugifyCartoonActionId(id);
  const payload = readPayload();
  const isBuiltIn = BUILTIN_CARTOON_ANIMATIONS.some((b) => b.id === clean);
  if (isBuiltIn) {
    const nextHidden = Array.from(new Set([...payload.hiddenBuiltIns, clean]));
    const nextAnims = payload.animations.filter((a) => a.id !== clean);
    writePayload({ version: 1, animations: nextAnims, hiddenBuiltIns: nextHidden });
  } else {
    const nextAnims = payload.animations.filter((a) => a.id !== clean);
    writePayload({ version: 1, animations: nextAnims, hiddenBuiltIns: payload.hiddenBuiltIns });
  }
}

export function restoreBuiltInCartoonAnimation(id: string): void {
  const clean = slugifyCartoonActionId(id);
  const payload = readPayload();
  writePayload({
    version: 1,
    animations: payload.animations.filter((a) => a.id !== clean),
    hiddenBuiltIns: payload.hiddenBuiltIns.filter((h) => h !== clean),
  });
}

export function resolveCartoonAnimationForSignal(options: {
  actionId?: string;
  explicitMood?: CartoonExpressionMood;
  spokenText?: string;
  inlineSpec?: Partial<CartoonAnimationParams>;
}): { matchedDef?: CartoonAnimationDefinition; params: CartoonAnimationParams } {
  const { actionId, explicitMood, spokenText, inlineSpec } = options;
  let matchedDef = getCartoonAnimationById(actionId);

  if (!matchedDef && spokenText) {
    const lower = spokenText.toLowerCase();
    // Prioritize custom user/AI-saved actions first so DB custom actions automatically trigger on keywords!
    const catalog = getEffectiveCartoonAnimationCatalog();
    const customOnly = catalog.filter((a) => a.source === 'custom');
    matchedDef = customOnly.find((item) =>
      item.keywords.some((kw) => kw.length >= 2 && lower.includes(kw.toLowerCase())),
    );
  }

  const baseParams = matchedDef ? matchedDef.params : DEFAULT_CARTOON_ANIMATION_PARAMS;
  const merged = sanitizeCartoonAnimationParams(
    {
      ...baseParams,
      ...(explicitMood ? { mood: explicitMood } : {}),
      ...(inlineSpec || {}),
    },
    baseParams,
  );

  return { matchedDef, params: merged };
}

export function parseCartoonAnimationAiJson(rawInput: string): CartoonAnimationDefinition[] {
  const trimmed = rawInput.trim();
  if (!trimmed) return [];
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced);
  } catch {
    const firstBrace = unfenced.indexOf('{');
    const firstBracket = unfenced.indexOf('[');
    const start =
      firstBracket >= 0 && (firstBrace < 0 || firstBracket < firstBrace) ? firstBracket : firstBrace;
    if (start < 0) return [];
    const endChar = start === firstBracket ? ']' : '}';
    const end = unfenced.lastIndexOf(endChar);
    if (end <= start) return [];
    try {
      parsed = JSON.parse(unfenced.slice(start, end + 1));
    } catch {
      return [];
    }
  }

  const candidates: unknown[] = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object'
      ? Array.isArray((parsed as Record<string, unknown>).cartoonAnimations)
        ? ((parsed as Record<string, unknown>).cartoonAnimations as unknown[])
        : Array.isArray((parsed as Record<string, unknown>).animations)
          ? ((parsed as Record<string, unknown>).animations as unknown[])
          : [parsed]
      : [];

  return candidates
    .map(sanitizeDefinition)
    .filter((d): d is CartoonAnimationDefinition => Boolean(d));
}

export function getCartoonAnimationsPromptBlock(): string {
  const active = getEffectiveCartoonAnimationCatalog();
  const lines = active.map(
    (a) =>
      `  • "${a.id}" (${a.label}) [mood=${a.params.mood}, gesture=${a.params.gestureMode}, eyes=${a.params.eyeStyle}, fx=${a.params.fxOverlay}${a.keywords.length ? `, kw: ${a.keywords.slice(0, 4).join(', ')}` : ''}]`,
  );

  return [
    'DANH SÁCH HÀNH ĐỘNG & BIỂU CẢM NHÂN VẬT @Gimmys HIỆN CÓ TRONG DATABASE:',
    ...lines,
    '',
    'CÁCH AI ĐIỀU KHIỂN HOẶC TỰ SÁNG TẠO HÀNH ĐỘNG CHO NHÂN VẬT HOẠT HÌNH:',
    '- Trên từng scene / card, có thể thêm "cartoonAction": "<id từ danh sách trên>" và/hoặc "cartoonMood": "happy|excited|curious|worried|surprised|proud|cool|sad|shy|neutral".',
    '- HOẶC AI tự sáng tạo hành động/biểu cảm mới hoàn toàn bằng cách gắn "cartoonAnimationSpec": { "mood", "gestureMode", "eyeStyle", "mouthStyle", "fxOverlay", "accessory", "badgeGlyph", "badgeEmoji", "speed", "bounceIntensity", "headTiltDeg", "blushIntensity", "bodySquashStretch" }!',
    '- Nếu muốn đề xuất lưu hành động mới vào Database dùng lại lâu dài, có thể kèm mảng gốc "cartoonAnimations": [{ "id": "...", "label": "...", "category": "reaction", "keywords": ["..."], "params": { ... } }].',
  ].join('\n');
}

export function buildCartoonActionWebAiPrompt(concept: string, baseActionId?: string): string {
  const baseDef = baseActionId ? getCartoonAnimationById(baseActionId) : undefined;
  const cleanConcept = concept.trim() || 'Nhân vật @Gimmys hào hứng nhảy lên vỗ tay chúc mừng người học vừa trả lời đúng';

  return [
    'Bạn là Đạo diễn Hoạt hình 2D & Biểu cảm Nhân vật cho ứng dụng học ngoại ngữ KineticSub (nhân vật mascot @Gimmys).',
    `Hãy sáng tạo 1 đến 3 Animation / Hành động & Biểu cảm mới theo ý tưởng: "${cleanConcept}".`,
    baseDef
      ? `Bạn có thể tham khảo hoặc phát triển từ mẫu có sẵn "${baseDef.id}" (${JSON.stringify(baseDef.params)}).`
      : '',
    '',
    'QUY ƯỚC THAM SỐ HỆ THỐNG BẮT BUỘC:',
    '- gestureMode: "present" | "explain" | "question" | "cheer" | "point-up" | "point-right" | "warn-avoid" | "approve-tip" | "wave" | "shrug" | "think-chin" | "thumbs-up" | "double-point" | "facepalm" | "fist-pump" | "hold-mic"',
    '- mood: "neutral" | "happy" | "worried" | "curious" | "surprised" | "excited" | "sad" | "cool" | "proud" | "shy"',
    '- eyeStyle: "normal" | "happy-arc" | "wide-surprised" | "wink" | "star" | "focused" | "sleepy" | "heart" | "cool-shades"',
    '- mouthStyle: "lip-sync" | "smile" | "big-grin" | "o-shock" | "wavy-nervous" | "flat-serious" | "smirk"',
    '- fxOverlay: "none" | "sparkles" | "lightbulb" | "warning-bolt" | "question-marks" | "hearts" | "music-notes" | "sweat-drop" | "check-burst" | "fire-aura"',
    '- accessory: "none" | "badge-card" | "megaphone" | "pointer-stick" | "mic" | "graduation-cap" | "sunglasses"',
    '- badgeGlyph: "check" | "cross" | "question" | "tip" | null',
    '- badgeEmoji: 1 emoji ngắn (VD: "🔥", "🤯", "👏", "💯")',
    '- speed: số thực 0.4..2.2 (1.0 là chuẩn)',
    '- bounceIntensity: 0..2.0 | headTiltDeg: -25..25 | blushIntensity: 0..1 | bodySquashStretch: 0..0.35',
    '',
    'CHỈ TRẢ VỀ JSON HỢP LỆ THEO MẪU SAU (không viết giải thích dài dòng ngoài JSON):',
    '```json',
    JSON.stringify(
      {
        cartoonAnimations: [
          {
            id: 'ten-hanh-dong-slug',
            label: 'Tên hiển thị Tiếng Việt + Emoji',
            category: 'reaction',
            description: 'Mô tả ngắn ngữ cảnh dùng hành động này',
            keywords: ['từ khóa tiếng Anh', 'từ khóa tiếng Việt'],
            params: {
              mood: 'excited',
              gestureMode: 'fist-pump',
              eyeStyle: 'star',
              mouthStyle: 'big-grin',
              fxOverlay: 'sparkles',
              accessory: 'none',
              badgeGlyph: 'check',
              badgeEmoji: '🌟',
              speed: 1.35,
              bounceIntensity: 1.45,
              headTiltDeg: 6,
              blushIntensity: 0.6,
              bodySquashStretch: 0.12,
            },
          },
        ],
      },
      null,
      2,
    ),
    '```',
  ]
    .filter(Boolean)
    .join('\n');
}
