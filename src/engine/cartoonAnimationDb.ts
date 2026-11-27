import {
  CartoonAccessory,
  CartoonAnimationDefinition,
  CartoonAnimationKeyframe,
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
  {
    id: 'clap-jump',
    label: 'Khuỵu gối bật nhảy vỗ tay 5 nhịp (Clap Jump 👏)',
    category: 'emphasis',
    description:
      'Chuỗi 5 keyframe thật: khuỵu gối lấy đà -> bật nhảy giơ hai tay -> hai lòng bàn tay chạm vỗ -> tiếp tục vỗ trên không reo vui -> tiếp đất squash nhẹ dang tay cười rạng rỡ.',
    keywords: ['clap', 'applause', 'bravo', 'jump clap', 'congrats', 'vỗ tay', 'bật nhảy', 'khen ngợi'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'excited',
      gestureMode: 'clap-jump',
      eyeStyle: 'star',
      mouthStyle: 'lip-sync',
      fxOverlay: 'sparkles',
      accessory: 'none',
      badgeGlyph: 'check',
      badgeEmoji: '👏',
      speed: 1.0,
      bounceIntensity: 1.25,
      headTiltDeg: 3,
      blushIntensity: 0.55,
      bodySquashStretch: 0.1,
      sequenceDurationSec: 1.5,
      loopSequence: true,
      keyframes: [
        {
          at: 0,
          label: 'Frame 1: Khuỵu gối, hai tay đưa xuống lấy đà',
          jumpOffsetY: 38,
          kneeBend: 0.92,
          leftWristX: -124,
          leftWristY: 162,
          leftHandAngle: Math.PI * 0.62,
          rightWristX: 124,
          rightWristY: 162,
          rightHandAngle: Math.PI * 0.38,
          clapImpact: 0,
          mouthStyle: 'smile',
          bodySquashX: 1.09,
          bodySquashY: 0.91,
          headTiltDeg: -4,
        },
        {
          at: 0.22,
          label: 'Frame 2: Bật nhảy lên, hai tay giơ cao',
          jumpOffsetY: -94,
          kneeBend: 0.14,
          leftWristX: -112,
          leftWristY: -176,
          leftHandAngle: -Math.PI * 0.56,
          rightWristX: 112,
          rightWristY: -176,
          rightHandAngle: -Math.PI * 0.44,
          clapImpact: 0,
          mouthStyle: 'big-grin',
          bodySquashX: 0.93,
          bodySquashY: 1.08,
          headTiltDeg: 3,
        },
        {
          at: 0.44,
          label: 'Frame 3: Hai lòng bàn tay chạm nhau vỗ tay',
          jumpOffsetY: -116,
          kneeBend: 0.1,
          leftWristX: -10,
          leftWristY: -108,
          leftHandAngle: -Math.PI * 0.5,
          rightWristX: 10,
          rightWristY: -108,
          rightHandAngle: -Math.PI * 0.5,
          clapImpact: 1,
          mouthStyle: 'big-grin',
          bodySquashX: 0.96,
          bodySquashY: 1.04,
          headTiltDeg: 5,
        },
        {
          at: 0.68,
          label: 'Frame 4: Tiếp tục vỗ tay trên không, miệng mở reo vui',
          jumpOffsetY: -88,
          kneeBend: 0.16,
          leftWristX: -14,
          leftWristY: -116,
          leftHandAngle: -Math.PI * 0.5,
          rightWristX: 14,
          rightWristY: -116,
          rightHandAngle: -Math.PI * 0.5,
          clapImpact: 0.92,
          mouthStyle: 'lip-sync',
          bodySquashX: 0.97,
          bodySquashY: 1.03,
          headTiltDeg: 6,
        },
        {
          at: 0.94,
          label: 'Frame 5: Tiếp đất squash nhẹ, hai tay dang ra cười rạng rỡ',
          jumpOffsetY: 16,
          kneeBend: 0.46,
          leftWristX: -194,
          leftWristY: -26,
          leftHandAngle: -Math.PI * 0.82,
          rightWristX: 194,
          rightWristY: -26,
          rightHandAngle: -0.56,
          clapImpact: 0,
          mouthStyle: 'big-grin',
          bodySquashX: 1.11,
          bodySquashY: 0.89,
          headTiltDeg: 2,
        },
      ],
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
  'clap-jump',
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
    case 'clap-jump':
    case 'clap':
    case 'clap-hands':
    case 'applause':
      return 'clap-jump';
    case 'celebrate':
    case 'celebrate-arms':
    case 'celebrate-jump':
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

function sanitizeKeyframes(raw: unknown): CartoonAnimationKeyframe[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const cleaned: CartoonAnimationKeyframe[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const at =
      typeof obj.at === 'number' && Number.isFinite(obj.at)
        ? Math.max(0, Math.min(1, obj.at))
        : cleaned.length / Math.max(1, raw.length - 1);
    const kf: CartoonAnimationKeyframe = {
      at,
      ...(typeof obj.label === 'string' && obj.label.trim() ? { label: obj.label.trim() } : {}),
      ...(typeof obj.jumpOffsetY === 'number' && Number.isFinite(obj.jumpOffsetY)
        ? { jumpOffsetY: Math.max(-180, Math.min(80, obj.jumpOffsetY)) }
        : {}),
      ...(typeof obj.kneeBend === 'number' && Number.isFinite(obj.kneeBend)
        ? { kneeBend: Math.max(0, Math.min(1, obj.kneeBend)) }
        : {}),
      ...(typeof obj.leftWristX === 'number' && Number.isFinite(obj.leftWristX)
        ? { leftWristX: Math.max(-240, Math.min(20, obj.leftWristX)) }
        : {}),
      ...(typeof obj.leftWristY === 'number' && Number.isFinite(obj.leftWristY)
        ? { leftWristY: Math.max(-220, Math.min(240, obj.leftWristY)) }
        : {}),
      ...(typeof obj.leftHandAngle === 'number' && Number.isFinite(obj.leftHandAngle)
        ? { leftHandAngle: obj.leftHandAngle }
        : {}),
      ...(typeof obj.rightWristX === 'number' && Number.isFinite(obj.rightWristX)
        ? { rightWristX: Math.max(-20, Math.min(280, obj.rightWristX)) }
        : {}),
      ...(typeof obj.rightWristY === 'number' && Number.isFinite(obj.rightWristY)
        ? { rightWristY: Math.max(-220, Math.min(240, obj.rightWristY)) }
        : {}),
      ...(typeof obj.rightHandAngle === 'number' && Number.isFinite(obj.rightHandAngle)
        ? { rightHandAngle: obj.rightHandAngle }
        : {}),
      ...(typeof obj.clapImpact === 'number' && Number.isFinite(obj.clapImpact)
        ? { clapImpact: Math.max(0, Math.min(1, obj.clapImpact)) }
        : {}),
      ...(typeof obj.mouthStyle === 'string' && VALID_MOUTHS.has(obj.mouthStyle as CartoonMouthStyle)
        ? { mouthStyle: obj.mouthStyle as CartoonMouthStyle }
        : {}),
      ...(typeof obj.eyeStyle === 'string' && VALID_EYES.has(obj.eyeStyle as CartoonEyeStyle)
        ? { eyeStyle: obj.eyeStyle as CartoonEyeStyle }
        : {}),
      ...(typeof obj.bodySquashX === 'number' && Number.isFinite(obj.bodySquashX)
        ? { bodySquashX: Math.max(0.75, Math.min(1.25, obj.bodySquashX)) }
        : {}),
      ...(typeof obj.bodySquashY === 'number' && Number.isFinite(obj.bodySquashY)
        ? { bodySquashY: Math.max(0.75, Math.min(1.25, obj.bodySquashY)) }
        : {}),
      ...(typeof obj.headTiltDeg === 'number' && Number.isFinite(obj.headTiltDeg)
        ? { headTiltDeg: Math.max(-25, Math.min(25, obj.headTiltDeg)) }
        : {}),
    };
    cleaned.push(kf);
  }
  if (cleaned.length === 0) return undefined;
  return cleaned.sort((a, b) => a.at - b.at);
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

  const keyframes = sanitizeKeyframes(obj.keyframes) ?? fallback.keyframes;

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
    ...(keyframes ? { keyframes } : {}),
    ...(typeof obj.sequenceDurationSec === 'number' && Number.isFinite(obj.sequenceDurationSec)
      ? { sequenceDurationSec: Math.max(0.4, Math.min(8, Number(obj.sequenceDurationSec.toFixed(2)))) }
      : fallback.sequenceDurationSec !== undefined
        ? { sequenceDurationSec: fallback.sequenceDurationSec }
        : {}),
    ...(typeof obj.loopSequence === 'boolean'
      ? { loopSequence: obj.loopSequence }
      : fallback.loopSequence !== undefined
        ? { loopSequence: fallback.loopSequence }
        : {}),
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

const STRICT_NEGATIVE_TEXT_RE =
  /\b(avoid|wrong|mistake|rude|never say|don't say|do not say|stop saying|too blunt|incorrect)\b|(?:^|[\s「『(【])NG(?:$|[\s」』)】:：!])|tránh|lỗi sai|đừng nói|thô lỗ/iu;
const STRICT_POSITIVE_TEXT_RE =
  /\b(natural|correct|use this instead|much better|polite|native|right way)\b|nên dùng|tự nhiên|chuẩn bản xứ|lịch sự/iu;

/**
 * Prevents contradictory expressions such as smiling/celebrating over an AVOID/NG warning card
 * or looking worried/sad over a praised/natural answer card.
 */
export function enforceContextualCartoonMood(
  params: CartoonAnimationParams,
  spokenText?: string,
  badge?: 'check' | 'cross' | 'question' | 'tip' | 'none' | null,
): CartoonAnimationParams {
  const txt = (spokenText || '').trim();
  const isNeg = badge === 'cross' || (badge !== 'check' && STRICT_NEGATIVE_TEXT_RE.test(txt));
  const isPos = badge === 'check' || (badge !== 'cross' && !isNeg && STRICT_POSITIVE_TEXT_RE.test(txt));

  if (
    isNeg &&
    (params.mood === 'happy' ||
      params.mood === 'excited' ||
      params.mood === 'proud' ||
      params.gestureMode === 'clap-jump' ||
      params.gestureMode === 'cheer' ||
      params.gestureMode === 'thumbs-up')
  ) {
    return {
      ...params,
      mood: 'worried',
      gestureMode: 'warn-avoid',
      eyeStyle: 'focused',
      mouthStyle: 'wavy-nervous',
      fxOverlay: 'warning-bolt',
      badgeGlyph: 'cross',
      keyframes: undefined,
    };
  }

  if (isPos && (params.mood === 'worried' || params.mood === 'sad' || params.gestureMode === 'warn-avoid')) {
    return {
      ...params,
      mood: 'happy',
      gestureMode: 'thumbs-up',
      eyeStyle: 'happy-arc',
      mouthStyle: 'big-grin',
      fxOverlay: 'check-burst',
      badgeGlyph: 'check',
    };
  }

  return params;
}

export function resolveCartoonAnimationForSignal(options: {
  actionId?: string;
  explicitMood?: CartoonExpressionMood;
  spokenText?: string;
  inlineSpec?: Partial<CartoonAnimationParams>;
  activeBadge?: 'check' | 'cross' | 'question' | 'tip' | 'none' | null;
}): { matchedDef?: CartoonAnimationDefinition; params: CartoonAnimationParams } {
  const { actionId, explicitMood, spokenText, inlineSpec, activeBadge } = options;
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

  return {
    matchedDef,
    params: enforceContextualCartoonMood(merged, spokenText, activeBadge),
  };
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
    '- **QUY TẮC CHỌN EMOTION NGHIÊM NGẶT (CẤM LỆCH CẢM XÚC)**:',
    '  + Nội dung sai / tránh dùng / AVOID / NG → BẮT BUỘC dùng mood `"worried"` hoặc `"sad"`, action `"warn-avoid"` hoặc `"sad-oops"` (TUYỆT ĐỐI KHÔNG dùng `"happy"`/`"excited"`/`"clap-jump"`).',
    '  + Nội dung khen thưởng / đáp án đúng / chúc mừng → dùng `"clap-jump"`, `"cheer"`, `"thumbs-up"` với mood `"excited"`/`"happy"`/`"proud"`.',
    '  + Nội dung câu hỏi / suy nghĩ → `"thinking-chin"` / `"question"` với mood `"curious"`.',
    '- Có thể gắn "keyframes": [{ at: 0..1, jumpOffsetY, kneeBend, leftWristX, leftWristY, rightWristX, rightWristY, clapImpact, mouthStyle, bodySquashX, bodySquashY }] để tạo chuỗi động tác nhiều frame thật sự (như `"clap-jump"`).',
    '- Nếu muốn đề xuất lưu hành động mới vào Database dùng lại lâu dài, có thể kèm mảng gốc "cartoonAnimations": [{ "id": "...", "label": "...", "category": "reaction", "keywords": ["..."], "params": { ... } }].',
  ].join('\n');
}

export function buildCartoonActionWebAiPrompt(concept: string, baseActionId?: string): string {
  const baseDef = baseActionId ? getCartoonAnimationById(baseActionId) : undefined;
  const cleanConcept = concept.trim() || 'Nhân vật @Gimmys khuỵu gối bật nhảy lên vỗ tay chúc mừng người học vừa trả lời đúng';

  return [
    'Bạn là Đạo diễn Hoạt hình 2D & Biểu cảm Nhân vật cho ứng dụng học ngoại ngữ KineticSub (nhân vật mascot @Gimmys).',
    `Hãy sáng tạo 1 đến 3 Animation / Hành động & Biểu cảm mới theo ý tưởng: "${cleanConcept}".`,
    baseDef
      ? `Bạn có thể tham khảo hoặc phát triển từ mẫu có sẵn "${baseDef.id}" (${JSON.stringify(baseDef.params)}).`
      : '',
    '',
    'QUY ƯỚC THAM SỐ HỆ THỐNG BẮT BUỘC:',
    '- gestureMode: "present" | "explain" | "question" | "cheer" | "point-up" | "point-right" | "warn-avoid" | "approve-tip" | "wave" | "shrug" | "think-chin" | "thumbs-up" | "double-point" | "facepalm" | "fist-pump" | "hold-mic" | "clap-jump"',
    '- mood: "neutral" | "happy" | "worried" | "curious" | "surprised" | "excited" | "sad" | "cool" | "proud" | "shy"',
    '- eyeStyle: "normal" | "happy-arc" | "wide-surprised" | "wink" | "star" | "focused" | "sleepy" | "heart" | "cool-shades"',
    '- mouthStyle: "lip-sync" | "smile" | "big-grin" | "o-shock" | "wavy-nervous" | "flat-serious" | "smirk"',
    '- fxOverlay: "none" | "sparkles" | "lightbulb" | "warning-bolt" | "question-marks" | "hearts" | "music-notes" | "sweat-drop" | "check-burst" | "fire-aura"',
    '- accessory: "none" | "badge-card" | "megaphone" | "pointer-stick" | "mic" | "graduation-cap" | "sunglasses"',
    '- badgeGlyph: "check" | "cross" | "question" | "tip" | null',
    '- badgeEmoji: 1 emoji ngắn (VD: "🔥", "🤯", "👏", "💯")',
    '- speed: số thực 0.4..2.2 | bounceIntensity: 0..2.0 | headTiltDeg: -25..25 | blushIntensity: 0..1 | bodySquashStretch: 0..0.35',
    '- keyframes (tùy chọn cho động tác nhiều frame như khuỵu gối -> bật nhảy -> 2 tay chạm nhau vỗ tay -> tiếp đất): mảng `{ at: 0..1, jumpOffsetY, kneeBend, leftWristX, leftWristY, rightWristX, rightWristY, clapImpact, bodySquashX, bodySquashY }`, kèm `sequenceDurationSec` & `loopSequence: true`.',
    '',
    'BẮT BUỘC XUẤT RA FILE `.json` HOÀN CHỈNH (hoặc duy nhất 1 khối JSON chuẩn có thể tải xuống thành file `.json`, không giải thích ngoài JSON):',
    '```json',
    JSON.stringify(
      {
        cartoonAnimations: [
          {
            id: 'clap-jump-custom',
            label: 'Bật nhảy vỗ tay chúc mừng 👏',
            category: 'emphasis',
            description: 'Khuỵu gối lấy đà -> bật nhảy giơ tay -> 2 tay chạm nhau vỗ tay -> tiếp đất',
            keywords: ['clap', 'congrats', 'vỗ tay', 'chúc mừng'],
            params: {
              mood: 'excited',
              gestureMode: 'clap-jump',
              eyeStyle: 'star',
              mouthStyle: 'lip-sync',
              fxOverlay: 'sparkles',
              accessory: 'none',
              badgeGlyph: 'check',
              badgeEmoji: '👏',
              speed: 1.0,
              bounceIntensity: 1.25,
              headTiltDeg: 4,
              blushIntensity: 0.55,
              bodySquashStretch: 0.1,
              sequenceDurationSec: 1.5,
              loopSequence: true,
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
