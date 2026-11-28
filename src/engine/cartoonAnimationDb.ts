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
  bodySquashStretch: 0,
};

export const BUILTIN_CARTOON_ANIMATIONS: CartoonAnimationDefinition[] = [
  {
    id: 'explain',
    label: 'Giải thích tự nhiên (Explain 💬)',
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
      badgeEmoji: '💬',
      speed: 1,
      bounceIntensity: 1,
      headTiltDeg: 2,
      blushIntensity: 0.15,
      bodySquashStretch: 0,
    },
  },
  {
    id: 'present',
    label: 'Đứng chào chỉnh tề (Present 🙋)',
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
      badgeEmoji: '🙋',
      speed: 0.9,
      bounceIntensity: 0.75,
      headTiltDeg: 0,
      blushIntensity: 0.2,
      bodySquashStretch: 0,
    },
  },
  {
    id: 'wave-hello',
    label: 'Vẫy tay chào mừng (Wave Hello 👋)',
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
      bodySquashStretch: 0,
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
      bodySquashStretch: 0,
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
      badgeEmoji: '☝️',
      speed: 1.0,
      bounceIntensity: 0.9,
      headTiltDeg: -3,
      blushIntensity: 0.15,
      bodySquashStretch: 0,
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
      badgeEmoji: '👉',
      speed: 1.0,
      bounceIntensity: 0.9,
      headTiltDeg: 5,
      blushIntensity: 0.25,
      bodySquashStretch: 0,
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
      bodySquashStretch: 0,
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
      bodySquashStretch: 0,
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
      bodySquashStretch: 0,
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
      bodySquashStretch: 0,
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
      fxOverlay: 'mind-blown',
      accessory: 'none',
      badgeGlyph: 'tip',
      badgeEmoji: '🤯',
      speed: 1.4,
      bounceIntensity: 1.6,
      headTiltDeg: -4,
      blushIntensity: 0.3,
      bodySquashStretch: 0,
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
      fxOverlay: 'confetti-pop',
      accessory: 'none',
      badgeGlyph: 'check',
      badgeEmoji: '🎉',
      speed: 1.3,
      bounceIntensity: 1.5,
      headTiltDeg: 6,
      blushIntensity: 0.65,
      bodySquashStretch: 0,
    },
  },
  {
    id: 'celebrate-jump',
    label: 'Ăn mừng bùng nổ (Victory Fist 🔥)',
    category: 'emphasis',
    description: 'Nắm tay đấm không khí cực sung kèm hào quang lửa nhiệt huyết (chân bám sàn).',
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
      bounceIntensity: 1.6,
      headTiltDeg: 4,
      blushIntensity: 0.6,
      bodySquashStretch: 0,
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
      bodySquashStretch: 0,
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
      bodySquashStretch: 0,
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
      bodySquashStretch: 0,
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
      bodySquashStretch: 0,
    },
  },
  {
    id: 'clap-jump',
    label: 'Vỗ tay reo vui & nhún gối khớp chân 5 nhịp (Clap Cheer 👏)',
    category: 'emphasis',
    description:
      'Chuỗi 5 keyframe cử động khớp thuần túy: khuỵu gối nhẹ trên nền -> giơ hai tay lên -> hai lòng bàn tay chạm vỗ -> tiếp tục vỗ nhịp cổ vũ -> dang rộng hai tay cười rạng rỡ (chân bám sàn, không co giãn hay nhảy thân).',
    keywords: ['clap', 'applause', 'bravo', 'clap cheer', 'congrats', 'vỗ tay', 'cổ vũ', 'khen ngợi'],
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
      bounceIntensity: 1.0,
      headTiltDeg: 3,
      blushIntensity: 0.55,
      bodySquashStretch: 0,
      sequenceDurationSec: 1.5,
      loopSequence: true,
      keyframes: [
        {
          at: 0,
          label: 'Frame 1: Khuỵu gối nhẹ giữ thăng bằng, hai tay hạ xuống chuẩn bị',
          jumpOffsetY: 0,
          kneeBend: 0.68,
          leftWristX: -124,
          leftWristY: 162,
          leftHandAngle: Math.PI * 0.62,
          rightWristX: 124,
          rightWristY: 162,
          rightHandAngle: Math.PI * 0.38,
          clapImpact: 0,
          mouthStyle: 'smile',
          bodySquashX: 1,
          bodySquashY: 1,
          headTiltDeg: -4,
        },
        {
          at: 0.22,
          label: 'Frame 2: Đứng thẳng khớp gối, hai tay vung lên cao',
          jumpOffsetY: 0,
          kneeBend: 0.1,
          leftWristX: -112,
          leftWristY: -176,
          leftHandAngle: -Math.PI * 0.56,
          rightWristX: 112,
          rightWristY: -176,
          rightHandAngle: -Math.PI * 0.44,
          clapImpact: 0,
          mouthStyle: 'big-grin',
          bodySquashX: 1,
          bodySquashY: 1,
          headTiltDeg: 3,
        },
        {
          at: 0.44,
          label: 'Frame 3: Hai lòng bàn tay chạm nhau vỗ tay trước ngực',
          jumpOffsetY: 0,
          kneeBend: 0.14,
          leftWristX: -10,
          leftWristY: -108,
          leftHandAngle: -Math.PI * 0.5,
          rightWristX: 10,
          rightWristY: -108,
          rightHandAngle: -Math.PI * 0.5,
          clapImpact: 1,
          mouthStyle: 'big-grin',
          bodySquashX: 1,
          bodySquashY: 1,
          headTiltDeg: 5,
        },
        {
          at: 0.68,
          label: 'Frame 4: Tiếp tục vỗ nhịp tay trên, nghiêng đầu reo vui',
          jumpOffsetY: 0,
          kneeBend: 0.18,
          leftWristX: -14,
          leftWristY: -116,
          leftHandAngle: -Math.PI * 0.5,
          rightWristX: 14,
          rightWristY: -116,
          rightHandAngle: -Math.PI * 0.5,
          clapImpact: 0.92,
          mouthStyle: 'lip-sync',
          bodySquashX: 1,
          bodySquashY: 1,
          headTiltDeg: 6,
        },
        {
          at: 0.94,
          label: 'Frame 5: Gối nhún nhịp cuối, hai tay dang rộng cười rạng rỡ',
          jumpOffsetY: 0,
          kneeBend: 0.36,
          leftWristX: -194,
          leftWristY: -26,
          leftHandAngle: -Math.PI * 0.82,
          rightWristX: 194,
          rightWristY: -26,
          rightHandAngle: -0.56,
          clapImpact: 0,
          mouthStyle: 'big-grin',
          bodySquashX: 1,
          bodySquashY: 1,
          headTiltDeg: 2,
        },
      ],
    },
  },
  {
    id: 'laugh-joy',
    label: 'Cười sảng khoái (Laugh Joy 😂)',
    category: 'reaction',
    description: 'Mắt híp cười tít + miệng cười ha ha + pháo giấy vui nhộn (bám sàn, không nhảy).',
    keywords: ['laugh', 'funny', 'haha', 'lol', 'joke', 'hài hước', 'cười'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'excited',
      gestureMode: 'cheer',
      eyeStyle: 'laugh-squint',
      mouthStyle: 'laugh-open',
      fxOverlay: 'confetti-pop',
      accessory: 'none',
      badgeGlyph: null,
      badgeEmoji: '😂',
      speed: 1.2,
      bounceIntensity: 1.15,
      headTiltDeg: 8,
      blushIntensity: 0.65,
      bodySquashStretch: 0,
    },
  },
  {
    id: 'love-adore',
    label: 'Yêu thích say mê (Love 😍)',
    category: 'reaction',
    description: 'Mắt trái tim, miệng mèo dễ thương và hai tay ghép hình tim trước ngực.',
    keywords: ['love', 'adore', 'favorite', 'cute', 'yêu thích', 'tuyệt'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'happy',
      gestureMode: 'heart-hands',
      eyeStyle: 'heart',
      mouthStyle: 'cat-smile',
      fxOverlay: 'hearts',
      accessory: 'none',
      badgeGlyph: null,
      badgeEmoji: '😍',
      speed: 1.0,
      bounceIntensity: 0.9,
      headTiltDeg: 6,
      blushIntensity: 0.75,
      bodySquashStretch: 0,
    },
  },
  {
    id: 'wink-secret',
    label: 'Nháy mắt bật mí (Wink Secret 😉)',
    category: 'emphasis',
    description: 'Nháy mắt tinh nghịch kèm động tác búng tay phát hiện mẹo hay.',
    keywords: ['wink', 'trick', 'secret', 'clever', 'nháy mắt', 'bí quyết'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'cool',
      gestureMode: 'snap-idea',
      eyeStyle: 'wink',
      mouthStyle: 'smirk',
      fxOverlay: 'sparkles',
      accessory: 'none',
      badgeGlyph: 'tip',
      badgeEmoji: '😉',
      speed: 1.05,
      bounceIntensity: 0.95,
      headTiltDeg: 5,
      blushIntensity: 0.35,
      bodySquashStretch: 0,
    },
  },
  {
    id: 'party-celebrate',
    label: 'Chúc mừng pháo giấy (Party 🥳)',
    category: 'emphasis',
    description: 'Đội mũ tốt nghiệp, pháo hoa giấy rực rỡ khi hoàn thành bài học hoặc đạt điểm cao.',
    keywords: ['party', 'celebrate', 'graduate', 'finish', 'chúc mừng', 'hoàn thành'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'excited',
      gestureMode: 'cheer',
      eyeStyle: 'star',
      mouthStyle: 'laugh-open',
      fxOverlay: 'confetti-pop',
      accessory: 'graduation-cap',
      badgeGlyph: 'check',
      badgeEmoji: '🥳',
      speed: 1.25,
      bounceIntensity: 1.25,
      headTiltDeg: 4,
      blushIntensity: 0.6,
      bodySquashStretch: 0,
    },
  },
  {
    id: 'muscle-determined',
    label: 'Quyết tâm chinh phục (Determined 💪)',
    category: 'emphasis',
    description: 'Ánh mắt quyết tâm, giơ nắm đấm chắc nịch truyền động lực luyện nói.',
    keywords: ['power', 'strong', 'try', 'practice', 'focus', 'quyết tâm', 'cố lên'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'proud',
      gestureMode: 'fist-pump',
      eyeStyle: 'determined',
      mouthStyle: 'grit-teeth',
      fxOverlay: 'fire-aura',
      accessory: 'none',
      badgeGlyph: 'check',
      badgeEmoji: '💪',
      speed: 1.15,
      bounceIntensity: 1.0,
      headTiltDeg: -3,
      blushIntensity: 0.2,
      bodySquashStretch: 0,
    },
  },
  {
    id: 'shush-secret',
    label: 'Suỵt — Mẹo nhỏ bí mật (Shush 🤫)',
    category: 'teaching',
    description: 'Đưa ngón trỏ lên môi ra hiệu bí mật ít người biết.',
    keywords: ['shh', 'shush', 'secret', 'quiet', 'insider', 'bí mật', 'ít ai biết'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'shy',
      gestureMode: 'shush',
      eyeStyle: 'wink',
      mouthStyle: 'whistle-o',
      fxOverlay: 'sparkles',
      accessory: 'none',
      badgeGlyph: 'tip',
      badgeEmoji: '🤫',
      speed: 0.9,
      bounceIntensity: 0.65,
      headTiltDeg: 7,
      blushIntensity: 0.4,
      bodySquashStretch: 0,
    },
  },
  {
    id: 'eyes-notice',
    label: 'Chú ý điểm quan trọng (Notice 👀)',
    category: 'teaching',
    description: 'Mắt mở to quan sát kỹ và chỉ tay sang phần cần lưu ý.',
    keywords: ['notice', 'watch', 'look', 'attention', 'detail', 'chú ý', 'quan sát'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'curious',
      gestureMode: 'point-right',
      eyeStyle: 'wide-surprised',
      mouthStyle: 'flat-serious',
      fxOverlay: 'sparkles',
      accessory: 'none',
      badgeGlyph: 'tip',
      badgeEmoji: '👀',
      speed: 1.0,
      bounceIntensity: 0.75,
      headTiltDeg: -4,
      blushIntensity: 0.1,
      bodySquashStretch: 0,
    },
  },
  {
    id: 'target-focus',
    label: 'Bắt trúng trọng tâm (Target 🎯)',
    category: 'teaching',
    description: 'Mắt sắc bén tập trung, chỉ tay dứt khoát kèm biểu tượng hồng tâm.',
    keywords: ['target', 'goal', 'key', 'main point', 'trọng tâm', 'mục tiêu', 'chính xác'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'proud',
      gestureMode: 'point-up',
      eyeStyle: 'determined',
      mouthStyle: 'smirk',
      fxOverlay: 'target-bull',
      accessory: 'none',
      badgeGlyph: 'check',
      badgeEmoji: '🎯',
      speed: 1.05,
      bounceIntensity: 0.85,
      headTiltDeg: 2,
      blushIntensity: 0.15,
      bodySquashStretch: 0,
    },
  },
  {
    id: 'perfect-100',
    label: 'Chuẩn 100 điểm bản xứ (100% 💯)',
    category: 'emphasis',
    description: 'Giơ ngón cái kèm hiệu ứng 100 điểm đỏ rực cho câu chuẩn tự nhiên.',
    keywords: ['100', 'perfect', 'score', 'fluent', 'hoàn hảo', 'điểm 10'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'excited',
      gestureMode: 'thumbs-up',
      eyeStyle: 'star',
      mouthStyle: 'big-grin',
      fxOverlay: 'hundred-score',
      accessory: 'none',
      badgeGlyph: 'check',
      badgeEmoji: '💯',
      speed: 1.15,
      bounceIntensity: 1.1,
      headTiltDeg: 4,
      blushIntensity: 0.5,
      bodySquashStretch: 0,
    },
  },
  {
    id: 'plead-soft',
    label: 'Năn nỉ lịch sự / Nhờ vả nhẹ nhàng (Plead 🥺)',
    category: 'reaction',
    description: 'Mắt long lanh dễ thương + môi bĩu nhẹ + hai tay mở xin giúp đỡ lịch sự.',
    keywords: ['please', 'beg', 'polite request', 'sorry', 'làm ơn', 'nhờ vả', 'xin lỗi'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'shy',
      gestureMode: 'open-welcome',
      eyeStyle: 'pleading',
      mouthStyle: 'pout',
      fxOverlay: 'hearts',
      accessory: 'none',
      badgeGlyph: null,
      badgeEmoji: '🥺',
      speed: 0.85,
      bounceIntensity: 0.6,
      headTiltDeg: 9,
      blushIntensity: 0.65,
      bodySquashStretch: 0,
    },
  },
  {
    id: 'proud-huff',
    label: 'Khoanh tay nghiêm khắc / Bực nhẹ (Huff 😤)',
    category: 'reaction',
    description: 'Khoanh tay trước ngực, mắt nghiêm và ký hiệu gân nổi khi cảnh báo câu thô lỗ.',
    keywords: ['strict', 'rude', 'upset', 'annoyed', 'nghiêm khắc', 'bực mình', 'thô lỗ'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'worried',
      gestureMode: 'cross-arms',
      eyeStyle: 'determined',
      mouthStyle: 'pout',
      fxOverlay: 'angry-vein',
      accessory: 'none',
      badgeGlyph: 'cross',
      badgeEmoji: '😤',
      speed: 1.0,
      bounceIntensity: 0.7,
      headTiltDeg: -6,
      blushIntensity: 0.15,
      bodySquashStretch: 0,
    },
  },
  {
    id: 'bow-polite',
    label: 'Cúi chào lễ phép (Polite Bow 🙇)',
    category: 'greeting',
    description: 'Chắp tay lịch sự, nghiêng người chào trang trọng kiểu Nhật/Hàn/Việt.',
    keywords: ['bow', 'polite', 'respect', 'keigo', 'ojigi', 'cúi chào', 'kính ngữ', 'cảm ơn'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'happy',
      gestureMode: 'bow-polite',
      eyeStyle: 'happy-arc',
      mouthStyle: 'smile',
      fxOverlay: 'sparkles',
      accessory: 'none',
      badgeGlyph: null,
      badgeEmoji: '🙇',
      speed: 0.9,
      bounceIntensity: 0.65,
      headTiltDeg: 10,
      blushIntensity: 0.35,
      bodySquashStretch: 0,
    },
  },
  {
    id: 'thank-you',
    label: 'Chắp tay cảm ơn chân thành (Thank You 🙏)',
    category: 'greeting',
    description: 'Chắp hai tay trước ngực đầy biết ơn kèm trái tim ấm áp.',
    keywords: ['thank', 'thanks', 'grateful', 'appreciate', 'cảm ơn', 'biết ơn'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'happy',
      gestureMode: 'heart-hands',
      eyeStyle: 'happy-arc',
      mouthStyle: 'cat-smile',
      fxOverlay: 'hearts',
      accessory: 'none',
      badgeGlyph: 'check',
      badgeEmoji: '🙏',
      speed: 0.95,
      bounceIntensity: 0.75,
      headTiltDeg: 5,
      blushIntensity: 0.5,
      bodySquashStretch: 0,
    },
  },
  {
    id: 'peace-friendly',
    label: 'Giơ tay Peace thân thiện (Peace ✌️)',
    category: 'greeting',
    description: 'Giơ ký hiệu chữ V thân thiện, nháy mắt tươi tắn.',
    keywords: ['peace', 'friendly', 'bye', 'see you', 'tạm biệt', 'thân thiện'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'happy',
      gestureMode: 'peace-sign',
      eyeStyle: 'wink',
      mouthStyle: 'big-grin',
      fxOverlay: 'sparkles',
      accessory: 'none',
      badgeGlyph: null,
      badgeEmoji: '✌️',
      speed: 1.1,
      bounceIntensity: 1.0,
      headTiltDeg: 6,
      blushIntensity: 0.45,
      bodySquashStretch: 0,
    },
  },
  {
    id: 'take-note',
    label: 'Ghi chép sổ tay ngữ pháp (Take Note ✍️)',
    category: 'teaching',
    description: 'Cầm sổ tay ghi chú cấu trúc quan trọng cần nhớ.',
    keywords: ['write', 'note', 'notebook', 'memorize', 'grammar', 'ghi chú', 'sổ tay'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'curious',
      gestureMode: 'writing-note',
      eyeStyle: 'focused',
      mouthStyle: 'flat-serious',
      fxOverlay: 'lightbulb',
      accessory: 'notebook',
      badgeGlyph: 'tip',
      badgeEmoji: '✍️',
      speed: 0.95,
      bounceIntensity: 0.7,
      headTiltDeg: -5,
      blushIntensity: 0.15,
      bodySquashStretch: 0,
    },
  },
  {
    id: 'salute-ready',
    label: 'Chào điều lệnh sẵn sàng (Salute 🫡)',
    category: 'greeting',
    description: 'Đưa tay lên trán chào nghiêm chỉnh sẵn sàng thử thách.',
    keywords: ['salute', 'ready', 'challenge', 'mission', 'sẵn sàng', 'thử thách'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'proud',
      gestureMode: 'salute',
      eyeStyle: 'determined',
      mouthStyle: 'smile',
      fxOverlay: 'check-burst',
      accessory: 'none',
      badgeGlyph: 'check',
      badgeEmoji: '🫡',
      speed: 1.05,
      bounceIntensity: 0.85,
      headTiltDeg: -2,
      blushIntensity: 0.2,
      bodySquashStretch: 0,
    },
  },
  {
    id: 'sleepy-break',
    label: 'Buồn ngủ / Chậm chạp nhàm chán (Sleepy 😴)',
    category: 'reaction',
    description: 'Mắt lim dim kèm chữ Zzz khi ví dụ kiểu câu cũ rích buồn ngủ.',
    keywords: ['sleep', 'boring', 'tired', 'textbook', 'nhàm chán', 'buồn ngủ', 'mệt'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'sad',
      gestureMode: 'present',
      eyeStyle: 'sleepy',
      mouthStyle: 'whistle-o',
      fxOverlay: 'sleep-zzz',
      accessory: 'none',
      badgeGlyph: null,
      badgeEmoji: '😴',
      speed: 0.7,
      bounceIntensity: 0.45,
      headTiltDeg: -12,
      blushIntensity: 0.15,
      bodySquashStretch: 0,
    },
  },
  {
    id: 'coffee-chat',
    label: 'Thư giãn tán gẫu quán cà phê (Coffee Chat ☕)',
    category: 'greeting',
    description: 'Cầm cốc cà phê ấm áp cho tình huống giao tiếp đời thường, quán cà phê.',
    keywords: ['coffee', 'cafe', 'casual', 'small talk', 'morning', 'cà phê', 'trò chuyện'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'happy',
      gestureMode: 'open-welcome',
      eyeStyle: 'happy-arc',
      mouthStyle: 'smile',
      fxOverlay: 'music-notes',
      accessory: 'coffee-cup',
      badgeGlyph: null,
      badgeEmoji: '☕',
      speed: 0.9,
      bounceIntensity: 0.75,
      headTiltDeg: 4,
      blushIntensity: 0.35,
      bodySquashStretch: 0,
    },
  },
  {
    id: 'trophy-winner',
    label: 'Cúp vô địch hoàn thành xuất sắc (Trophy 🏆)',
    category: 'emphasis',
    description: 'Nâng cúp vàng chiến thắng kèm pháo giấy chúc mừng ở cuối bài.',
    keywords: ['trophy', 'champion', 'master', 'winner', 'cúp', 'vô địch', 'xuất sắc'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'excited',
      gestureMode: 'cheer',
      eyeStyle: 'star',
      mouthStyle: 'laugh-open',
      fxOverlay: 'confetti-pop',
      accessory: 'trophy',
      badgeGlyph: 'check',
      badgeEmoji: '🏆',
      speed: 1.2,
      bounceIntensity: 1.1,
      headTiltDeg: 3,
      blushIntensity: 0.55,
      bodySquashStretch: 0,
    },
  },
  {
    id: 'heart-hands',
    label: 'Thả tim đồng cảm (Heart Hands 🫶)',
    category: 'reaction',
    description: 'Hai tay tạo hình trái tim ấm áp ủng hộ người học.',
    keywords: ['heart hands', 'support', 'warm', 'care', 'thả tim', 'ủng hộ'],
    source: 'built-in',
    updatedAt: 1,
    params: {
      mood: 'happy',
      gestureMode: 'heart-hands',
      eyeStyle: 'happy-arc',
      mouthStyle: 'big-grin',
      fxOverlay: 'hearts',
      accessory: 'none',
      badgeGlyph: null,
      badgeEmoji: '🫶',
      speed: 1.0,
      bounceIntensity: 0.9,
      headTiltDeg: 5,
      blushIntensity: 0.6,
      bodySquashStretch: 0,
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
  'peace-sign',
  'salute',
  'shush',
  'bow-polite',
  'heart-hands',
  'cross-arms',
  'open-welcome',
  'writing-note',
  'snap-idea',
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
  'laugh-squint',
  'determined',
  'pleading',
  'dizzy',
]);

const VALID_MOUTHS = new Set<CartoonMouthStyle>([
  'lip-sync',
  'smile',
  'big-grin',
  'o-shock',
  'wavy-nervous',
  'flat-serious',
  'smirk',
  'laugh-open',
  'cat-smile',
  'whistle-o',
  'grit-teeth',
  'pout',
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
  'confetti-pop',
  'angry-vein',
  'sleep-zzz',
  'mind-blown',
  'target-bull',
  'hundred-score',
  'clap-waves',
]);

const VALID_ACCESSORIES = new Set<CartoonAccessory>([
  'none',
  'badge-card',
  'megaphone',
  'pointer-stick',
  'mic',
  'graduation-cap',
  'sunglasses',
  'notebook',
  'trophy',
  'coffee-cup',
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
    case 'chest-heart':
      return 'heart-hands';
    case 'bow':
      return 'bow-polite';
    case 'shh':
      return 'shush';
    case 'snap':
      return 'snap-idea';
    case 'write':
      return 'writing-note';
    case 'welcome':
      return 'open-welcome';
    default:
      return rawGesture;
  }
}

function normalizeFxAlias(rawFx: string): string {
  switch (rawFx) {
    case 'confetti':
      return 'sparkles';
    case 'confetti-burst':
      return 'confetti-pop';
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
    case 'zzz':
    case 'sleep':
      return 'sleep-zzz';
    case 'target':
      return 'target-bull';
    case '100':
      return 'hundred-score';
    case 'clap':
      return 'clap-waves';
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
      // Strictly grounded: never allow jumping or whole-body squash/stretch
      jumpOffsetY: 0,
      bodySquashX: 1,
      bodySquashY: 1,
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
    bodySquashStretch: 0,
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
      `  • "${a.id}" (${a.label}) [emoji=${a.params.badgeEmoji || '—'}, mood=${a.params.mood}, gesture=${a.params.gestureMode}, eyes=${a.params.eyeStyle}, mouth=${a.params.mouthStyle}, fx=${a.params.fxOverlay}${a.params.accessory && a.params.accessory !== 'none' ? `, acc=${a.params.accessory}` : ''}${a.keywords.length ? `, kw: ${a.keywords.slice(0, 4).join(', ')}` : ''}]`,
  );

  return [
    'DANH SÁCH HÀNH ĐỘNG, EMOJI & BIỂU CẢM NHÂN VẬT @Gimmys HIỆN CÓ TRONG DATABASE:',
    ...lines,
    '',
    'CÁCH AI ĐIỀU KHIỂN HOẶC TỰ SÁNG TẠO HÀNH ĐỘNG CHO NHÂN VẬT HOẠT HÌNH:',
    '- **TUYỆT ĐỐI KHÔNG NHẢY (`jumpOffsetY = 0`) & KHÔNG KÉO DÃN/NÉN THÂN (`bodySquash = 1`, `bodySquashStretch = 0`)**: Nhân vật @Gimmys luôn đứng vững hai chân bám sàn; chỉ thể hiện cảm xúc bằng biểu cảm khuôn mặt (mắt, miệng, má hồng, nghiêng đầu), cử động tay khớp, nhún gối nhẹ tại chỗ và emoji/FX.',
    '- Trên từng scene / card, hãy chọn `"cartoonAction": "<id từ danh sách trên>"` (nên xoay vòng đa dạng các emoji như 👋 💬 💡 👍 ⚠️ ❓ 🤔 🤯 🎉 🔥 😎 🎤 😅 🤷 👏 😂 😍 😉 🥳 💪 🤫 👀 🎯 💯 🥺 😤 🙇 🙏 ✌️ ✍️ 🫡 😴 ☕ 🏆 🫶!) và/hoặc `"cartoonMood": "happy|excited|curious|worried|surprised|proud|cool|sad|shy|neutral"`, hoặc gắn `"cartoonAnimationSpec": { gestureMode, mood, eyeStyle, mouthStyle, fxOverlay, accessory, badgeEmoji }` để phối hợp tùy biến.',
    '- **QUY TẮC CHỌN EMOTION NGHIÊM NGẶT (CẤM LỆCH CẢM XÚC)**:',
    '  + Nội dung sai / tránh dùng / AVOID / NG → BẮT BUỘC dùng mood `"worried"` hoặc `"sad"`, action `"warn-avoid"` (⚠️), `"proud-huff"` (😤) hoặc `"sad-oops"` (😅) (TUYỆT ĐỐI KHÔNG dùng `"happy"`/`"excited"`/`"clap-jump"`).',
    '  + Nội dung khen thưởng / đáp án đúng / chúc mừng → dùng `"clap-jump"` (👏), `"cheer"` (🎉), `"party-celebrate"` (🥳), `"perfect-100"` (💯), `"trophy-winner"` (🏆), `"thumbs-up"` (👍) với mood `"excited"`/`"happy"`/`"proud"`.',
    '  + Nội dung câu hỏi / suy nghĩ / chú ý → `"thinking-chin"` (🤔), `"question"` (❓), `"eyes-notice"` (👀), `"target-focus"` (🎯) với mood `"curious"`/`"proud"`.',
    '  + Nội dung chào hỏi / lịch sự / bí quyết → `"wave-hello"` (👋), `"bow-polite"` (🙇), `"thank-you"` (🙏), `"peace-friendly"` (✌️), `"wink-secret"` (😉), `"shush-secret"` (🤫), `"love-adore"` (😍), `"heart-hands"` (🫶), `"take-note"` (✍️), `"coffee-chat"` (☕).',
    '- Có thể gắn `"keyframes": [{ at: 0..1, kneeBend, leftWristX, leftWristY, rightWristX, rightWristY, clapImpact, mouthStyle, eyeStyle, headTiltDeg }]` (giữ `jumpOffsetY: 0`, `bodySquashX: 1`, `bodySquashY: 1`) để tạo chuỗi động tác khớp nhiều frame bám sàn.',
    '- Nếu muốn đề xuất lưu hành động mới vào Database dùng lại lâu dài, có thể kèm mảng gốc `"cartoonAnimations": [{ "id": "...", "label": "...", "category": "reaction", "keywords": ["..."], "params": { ... } }]`.',
  ].join('\n');
}

export function buildCartoonActionWebAiPrompt(concept: string, baseActionId?: string): string {
  const baseDef = baseActionId ? getCartoonAnimationById(baseActionId) : undefined;
  const cleanConcept = concept.trim() || 'Nhân vật @Gimmys nhún gối bám sàn, vỗ tay chúc mừng và biểu cảm rạng rỡ (không nhảy, không kéo dãn thân)';

  return [
    'Bạn là Đạo diễn Hoạt hình 2D & Biểu cảm Nhân vật cho ứng dụng học ngoại ngữ KineticSub (nhân vật mascot @Gimmys).',
    `Hãy sáng tạo 1 đến 3 Animation / Hành động & Biểu cảm mới theo ý tưởng: "${cleanConcept}".`,
    baseDef
      ? `Bạn có thể tham khảo hoặc phát triển từ mẫu có sẵn "${baseDef.id}" (${JSON.stringify(baseDef.params)}).`
      : '',
    '',
    'QUY TẮC CỐ ĐỊNH: TUYỆT ĐỐI KHÔNG nhảy (`jumpOffsetY = 0`) và KHÔNG kéo dãn/nén thân (`bodySquashStretch = 0`, `bodySquashX = 1`, `bodySquashY = 1`) — chỉ biểu cảm khuôn mặt, cử động tay khớp, nghiêng đầu, nhún gối bám sàn và emoji/FX.',
    '',
    'QUY ƯỚC THAM SỐ HỆ THỐNG BẮT BUỘC:',
    '- gestureMode: "present" | "explain" | "question" | "cheer" | "point-up" | "point-right" | "warn-avoid" | "approve-tip" | "wave" | "shrug" | "think-chin" | "thumbs-up" | "double-point" | "facepalm" | "fist-pump" | "hold-mic" | "clap-jump" | "peace-sign" | "salute" | "shush" | "bow-polite" | "heart-hands" | "cross-arms" | "open-welcome" | "writing-note" | "snap-idea"',
    '- mood: "neutral" | "happy" | "worried" | "curious" | "surprised" | "excited" | "sad" | "cool" | "proud" | "shy"',
    '- eyeStyle: "normal" | "happy-arc" | "wide-surprised" | "wink" | "star" | "focused" | "sleepy" | "heart" | "cool-shades" | "laugh-squint" | "determined" | "pleading" | "dizzy"',
    '- mouthStyle: "lip-sync" | "smile" | "big-grin" | "o-shock" | "wavy-nervous" | "flat-serious" | "smirk" | "laugh-open" | "cat-smile" | "whistle-o" | "grit-teeth" | "pout"',
    '- fxOverlay: "none" | "sparkles" | "lightbulb" | "warning-bolt" | "question-marks" | "hearts" | "music-notes" | "sweat-drop" | "check-burst" | "fire-aura" | "confetti-pop" | "angry-vein" | "sleep-zzz" | "mind-blown" | "target-bull" | "hundred-score" | "clap-waves"',
    '- accessory: "none" | "badge-card" | "megaphone" | "pointer-stick" | "mic" | "graduation-cap" | "sunglasses" | "notebook" | "trophy" | "coffee-cup"',
    '- badgeGlyph: "check" | "cross" | "question" | "tip" | null',
    '- badgeEmoji: 1 emoji ngắn khớp cảm xúc & hành động (VD: "😂", "😍", "😉", "🥳", "💪", "🤫", "👀", "🎯", "💯", "🥺", "😤", "🙇", "🙏", "✌️", "✍️", "🫡", "😴", "☕", "🏆", "🫶", "🔥", "🤯", "👏")',
    '- speed: số thực 0.4..2.2 | bounceIntensity: 0..2.0 (chỉ điều khiển biên độ khớp tay/đầu, KHÔNG nhảy) | headTiltDeg: -25..25 | blushIntensity: 0..1 | bodySquashStretch: 0',
    '- keyframes (tùy chọn cho động tác nhiều frame như nhún gối bám sàn -> 2 tay chạm nhau vỗ tay -> dang tay): mảng `{ at: 0..1, kneeBend, leftWristX, leftWristY, rightWristX, rightWristY, clapImpact, eyeStyle, mouthStyle, headTiltDeg }` (luôn giữ `jumpOffsetY: 0`, `bodySquashX: 1`, `bodySquashY: 1`), kèm `sequenceDurationSec` & `loopSequence: true`.',
    '',
    'BẮT BUỘC XUẤT RA FILE `.json` HOÀN CHỈNH (hoặc duy nhất 1 khối JSON chuẩn có thể tải xuống thành file `.json`, không giải thích ngoài JSON):',
    '```json',
    JSON.stringify(
      {
        cartoonAnimations: [
          {
            id: 'clap-cheer-custom',
            label: 'Vỗ tay cổ vũ rạng rỡ 👏',
            category: 'emphasis',
            description: 'Nhún gối bám sàn -> giơ tay -> 2 tay chạm nhau vỗ tay -> dang tay chúc mừng (không nhảy)',
            keywords: ['clap', 'congrats', 'vỗ tay', 'chúc mừng'],
            params: {
              mood: 'excited',
              gestureMode: 'clap-jump',
              eyeStyle: 'star',
              mouthStyle: 'lip-sync',
              fxOverlay: 'confetti-pop',
              accessory: 'none',
              badgeGlyph: 'check',
              badgeEmoji: '👏',
              speed: 1.0,
              bounceIntensity: 1.1,
              headTiltDeg: 4,
              blushIntensity: 0.55,
              bodySquashStretch: 0,
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
