import { resolveProjectOverlaps } from './layoutSolver';
import {
  CanvasThemeId,
  ComparisonItem,
  CustomComponentPresetConfig,
  IllustrationChecklistItem,
  IllustrationDialogueRow,
  IllustrationFlowNode,
  IllustrationPropData,
  IllustrationSpatialBox,
  IllustrationVariant,
  IllustrationSceneIcon,
  isDarkCanvasTheme,
  LayoutCompositionId,
  LessonProject,
  SceneElement,
  TranscriptCue,
} from './types';
import { getCustomComponentByVariant } from './customComponentStore';
import {
  getEffectiveVectorCatalog,
  pickContextualSceneIcon,
  resolveContextualVisualForCue,
} from './vectorComponentDb';

export interface LayoutCompositionMeta {
  id: LayoutCompositionId;
  name: string;
  shortLabel: string;
  description: string;
  recommendedTheme: CanvasThemeId;
  signatureVariant: IllustrationVariant;
}

export const LAYOUT_COMPOSITIONS: LayoutCompositionMeta[] = [
  {
    id: 'plain',
    name: 'Plain — Chỉ Chữ & Nền (Tối giản YouTube)',
    shortLabel: 'Plain (Chỉ chữ)',
    description: 'Không chèn thẻ hay hình minh họa — chỉ nền ảnh/video (có opacity dịu mắt) và phụ đề ở giữa/tùy chỉnh',
    recommendedTheme: 'studio-slate',
    signatureVariant: 'css-sticky-note',
  },
  {
    id: 'story-scenes',
    name: 'Cảnh đời sống (@168 Story)',
    shortLabel: 'Cảnh đời sống',
    description: 'Tự đổi hình minh họa theo từng ngữ cảnh (quán nước, công sở, bạn bè, mẹo hay)',
    recommendedTheme: 'pastel-sunrise',
    signatureVariant: 'cafe-water',
  },
  {
    id: 'cartoon-host',
    name: 'Nhân vật Hoạt Hình Lip-Sync (@Gimmys)',
    shortLabel: 'Hoạt hình Lip-Sync',
    description:
      'Nhân vật hoạt hình nền trời xanh cử động tay mượt và nhép miệng khớp từng từ kèm thanh phụ đề vàng nổi bật',
    recommendedTheme: 'pastel-sunrise',
    signatureVariant: 'cartoon-host',
  },
  {
    id: 'flow-steps',
    name: 'Sơ đồ 3 bước (Flow Steps)',
    shortLabel: 'Sơ đồ 3 bước',
    description: '3 nút tròn nối mũi tên theo cấp độ hoặc dòng thời gian giống @englishpracticing168',
    recommendedTheme: 'soft-lavender',
    signatureVariant: 'flow-diagram',
  },
  {
    id: 'gauge-tone',
    name: 'Đồng hồ sắc thái (Mood Gauge)',
    shortLabel: 'Đồng hồ sắc thái',
    description: 'Cung bán nguyệt chia 5 nấc màu kèm biểu cảm tự dịch chuyển theo từng câu',
    recommendedTheme: 'mint-breeze',
    signatureVariant: 'gauge-arc',
  },
  {
    id: 'checklist-cards',
    name: 'Thẻ Checklist đối chiếu',
    shortLabel: 'Thẻ Checklist',
    description: 'Bảng câu mẫu đánh dấu ✔ / ✘ rõ ràng, tô đậm từ khóa ngữ pháp',
    recommendedTheme: 'soft-lavender',
    signatureVariant: 'checklist-card',
  },
  {
    id: 'dialogue-upgrade',
    name: 'Nâng cấp hội thoại (Boring → Natural)',
    shortLabel: 'Nâng cấp câu',
    description: 'So sánh song song câu nói cơ bản bên trái → cách nói tự nhiên bên phải',
    recommendedTheme: 'warm-paper',
    signatureVariant: 'dialogue-upgrade',
  },
  {
    id: 'timeline-track',
    name: 'Đường chạy tiến trình (Timeline Track)',
    shortLabel: 'Đường chạy Timeline',
    description: 'Thanh đường chạy có mốc xuất phát – về đích theo tiến độ câu chuyện',
    recommendedTheme: 'mint-breeze',
    signatureVariant: 'timeline-track',
  },
  {
    id: 'spatial-contrast',
    name: '3 Hộp khái niệm / Phát âm',
    shortLabel: '3 Hộp khái niệm',
    description: '3 khung thẻ có icon trực quan đối chiếu quy tắc, giới từ hoặc cấp độ',
    recommendedTheme: 'warm-paper',
    signatureVariant: 'spatial-boxes',
  },
  {
    id: 'avatar-dialogue',
    name: 'Nhân vật & Bóng thoại (Real-life)',
    shortLabel: 'Nhân vật & Thoại',
    description: 'Nhân vật nói chuyện kèm bóng thoại tương tác và thẻ câu nhấn mạnh',
    recommendedTheme: 'pastel-sunrise',
    signatureVariant: 'avatar-speech',
  },
  {
    id: 'clock-spotlight',
    name: 'Đồng hồ & Thời điểm (Time Focus)',
    shortLabel: 'Đồng hồ & Giờ',
    description: 'Đồng hồ kim chỉ giờ kèm công thức đọc hoặc nhấn mạnh thời điểm trong bài',
    recommendedTheme: 'warm-paper',
    signatureVariant: 'clock-face',
  },
  {
    id: 'phrase-icon-split',
    name: 'Câu tách icon (@168 Look/See/Watch)',
    shortLabel: 'Câu tách icon',
    description:
      '3 pill đối chiếu trên cùng, sơ đồ nghĩa ngắn, câu quote lớn chèn icon giữa câu và từ cuối trong pill — giống Look / See / Watch',
    recommendedTheme: 'soft-lavender',
    signatureVariant: 'phrase-icon-split',
  },
  {
    id: 'p168-quiz-formula',
    name: 'Đố Vui Công Thức (@168 Quiz + Formula)',
    shortLabel: '@168 Đố Vui',
    description:
      'Thẻ câu hỏi điền khuyết kèm nút tròn A/B/C và công thức màu [A] / [B] nổi bật phong cách @englishpracticing168',
    recommendedTheme: 'warm-paper',
    signatureVariant: 'p168-step-quiz-formula',
  },
  {
    id: 'p168-grammar-formula',
    name: 'Công Thức Ngữ Pháp (@168 Grammar)',
    shortLabel: '@168 Công thức',
    description:
      'Khung màu xanh/tím đóng khung công thức [S + used to + V] kèm nhãn phân biệt nghĩa rõ ràng như @englishpracticing168',
    recommendedTheme: 'soft-lavender',
    signatureVariant: 'p168-grammar-formula',
  },
  {
    id: 'p168-pronunciation',
    name: 'Bảng Quy Tắc Phát Âm (@168 Pronunciation)',
    shortLabel: '@168 Phát âm',
    description:
      'Bảng chia 3 cột quy tắc phát âm (/t/, /d/, /ɪd/ hoặc trọng âm) kèm ví dụ tô màu chữ cái đầu/cuối',
    recommendedTheme: 'pastel-sunrise',
    signatureVariant: 'p168-pronunciation-matrix',
  },
  {
    id: 'p168-situations',
    name: 'Thẻ Tình Huống Giao Tiếp (@168 Situations)',
    shortLabel: '@168 Tình huống',
    description:
      'Khung tiêu đề màu kết hợp 3 thẻ tình huống đời sống (Bạn bè, Công sở, Từ chối khéo) với icon vector',
    recommendedTheme: 'mint-breeze',
    signatureVariant: 'p168-situation-cards',
  },
  {
    id: 'p168-slider-compare',
    name: 'Thanh Trượt So Sánh Thì (@168 Slider)',
    shortLabel: '@168 Thanh trượt',
    description:
      'Thanh trượt đối chiếu sắc thái / thì ngữ pháp (Quá khứ vs Hiện tại hoàn thành) kèm nút highlight lớn',
    recommendedTheme: 'warm-paper',
    signatureVariant: 'p168-slider-compare',
  },
  {
    id: 'word-reveal',
    name: '⚡ Word Reveal Typography (@xun52000)',
    shortLabel: 'Word Reveal',
    description:
      'Chữ Kinetic Typography cỡ lớn nổi bật từng câu + từ nhấn trọng tâm (hợp mọi nền sáng/tối hoặc ảnh nền)',
    recommendedTheme: 'studio-slate',
    signatureVariant: 'degree-scale',
  },
  {
    id: '3d-shapes',
    name: '🎲 Khối 3D & Bậc thang (3D Shapes)',
    shortLabel: 'Khối 3D',
    description:
      'Thẻ card_3d / pill_3d nổi khối 3D kết hợp bậc thang 3 cấp staircase_3d đồng bộ từng câu',
    recommendedTheme: 'studio-slate',
    signatureVariant: 'flow-diagram',
  },
  {
    id: 'podcast-duo',
    name: '🎙️ Podcast Studio (2–3 người + Sóng âm)',
    shortLabel: 'Podcast Studio',
    description:
      'Phòng thu Podcast hiển thị 2–3 người nói, đèn báo mic người đang nói & sóng âm nhảy mượt cho Podcast / Shadowing',
    recommendedTheme: 'studio-slate',
    signatureVariant: 'podcast-studio',
  },
  {
    id: 'dialogue-stage',
    name: '💬 Hội thoại nhiều người (Nhân vật + Bong bóng thoại)',
    shortLabel: 'Hội thoại đa vai',
    description:
      'Sân khấu hội thoại luân phiên khung truyện & bong bóng chat đa vai đồng bộ đổi màu từng người nói',
    recommendedTheme: 'pastel-sunrise',
    signatureVariant: 'p168-story-dialogue',
  },
  {
    id: 'full-study-cards',
    name: '📋 Thẻ Học Đầy Đủ (Toàn bộ Nghĩa + Từ vựng + Ngữ pháp)',
    shortLabel: 'Thẻ học đầy đủ',
    description:
      'Xuất video hiển thị trọn vẹn từng thẻ như mục Xem Thẻ (Câu + Nghĩa + Từ vựng khó + Ngữ pháp), tự co giãn không cắt chữ',
    recommendedTheme: 'soft-lavender',
    signatureVariant: 'bs-card-header',
  },
  {
    id: 'custom',
    name: '🎨 Tự sáng tạo từ Kho Component',
    shortLabel: 'Tự sáng tạo',
    description:
      'Chọn bất kỳ component Bootstrap 5 / Modern CSS / Vector tự vẽ từ Kho Component và tùy biến tiêu đề, nhãn, màu nhấn & bố cục',
    recommendedTheme: 'soft-lavender',
    signatureVariant: 'css-sticky-note',
  },
];

export function isLayoutCompositionId(value: unknown): value is LayoutCompositionId {
  return typeof value === 'string' && LAYOUT_COMPOSITIONS.some((c) => c.id === value);
}

const ALL_CLEAN_THEMES: CanvasThemeId[] = [
  'pastel-sunrise',
  'soft-lavender',
  'mint-breeze',
  'warm-paper',
  'studio-slate',
];

const LIGHT_TIKTOK_THEMES: CanvasThemeId[] = [
  'pastel-sunrise',
  'soft-lavender',
  'mint-breeze',
  'warm-paper',
];

export function shouldApplyCompositionOverride(
  hasCustomJson: boolean,
  forceOverride = false,
): boolean {
  return !hasCustomJson || forceOverride;
}

export interface LocalizedStageChrome {
  podcastStudio: string;
  podcastLive: string;
  multiSpeakerTitle: string;
  speakerDefault: string;
  hostPrefix: string;
  coHost: string;
  onMic: string;
  conversation: string;
  detailLabel: string;
  openTurn: string;
  replyTurn: string;
  takeawayTurn: string;
  dialogueTurnLabel: string;
  toneTitle: string;
  toneLeft: string;
  toneRight: string;
}

export function getLocalizedStageChrome(
  targetLang?: string,
  learningLang?: string,
  sampleText?: string,
): LocalizedStageChrome {
  const rawNorm = (targetLang || '').trim().toLowerCase();
  const isLearningSelf =
    rawNorm === 'learning' ||
    rawNorm === 'self' ||
    rawNorm === 'target' ||
    rawNorm.includes('ngôn ngữ muốn học') ||
    rawNorm.includes('ngôn ngữ đang học');
  const norm = isLearningSelf && learningLang ? learningLang.trim().toLowerCase() : rawNorm;

  const pickByCode = (code: string): LocalizedStageChrome | null => {
    if (code === 'ja' || code === 'japanese' || code === '日本語' || code === 'tiếng nhật') {
      return {
        podcastStudio: 'ポッドキャスト収録',
        podcastLive: 'ポッドキャスト · 収録',
        multiSpeakerTitle: '複数話者ダイアログ',
        speakerDefault: '話者',
        hostPrefix: '司会',
        coHost: '対談相手',
        onMic: '● 発言中',
        conversation: '会話',
        detailLabel: '詳細',
        openTurn: '切り出し',
        replyTurn: '応答',
        takeawayTurn: 'ポイント',
        dialogueTurnLabel: '会話',
        toneTitle: 'ニュアンス',
        toneLeft: 'カジュアル',
        toneRight: '丁寧',
      };
    }
    if (code === 'zh' || code === 'zh-cn' || code === 'chinese' || code === '中文' || code === 'tiếng trung') {
      return {
        podcastStudio: '播客录音室',
        podcastLive: '播客 · 对话',
        multiSpeakerTitle: '多人情景对话',
        speakerDefault: '说话人',
        hostPrefix: '主持',
        coHost: '嘉宾',
        onMic: '● 发言中',
        conversation: '对话',
        detailLabel: '详情',
        openTurn: '开场',
        replyTurn: '回应',
        takeawayTurn: '要点',
        dialogueTurnLabel: '对话',
        toneTitle: '语气',
        toneLeft: '随意',
        toneRight: '礼貌',
      };
    }
    if (code === 'ko' || code === 'ko-kr' || code === 'korean' || code === '한국어' || code === 'tiếng hàn') {
      return {
        podcastStudio: '팟캐스트 스튜디오',
        podcastLive: '팟캐스트 · 녹음',
        multiSpeakerTitle: '다인 대화',
        speakerDefault: '화자',
        hostPrefix: '진행',
        coHost: '공동 진행',
        onMic: '● 발언 중',
        conversation: '대화',
        detailLabel: '상세',
        openTurn: '시작',
        replyTurn: '응답',
        takeawayTurn: '핵심',
        dialogueTurnLabel: '대화',
        toneTitle: '어감',
        toneLeft: '편한 말투',
        toneRight: '공손한 말투',
      };
    }
    if (code === 'fr' || code === 'french' || code === 'français' || code === 'tiếng pháp') {
      return {
        podcastStudio: 'STUDIO PODCAST',
        podcastLive: 'PODCAST · DIRECT',
        multiSpeakerTitle: 'Dialogue à plusieurs voix',
        speakerDefault: 'Intervenant',
        hostPrefix: 'Animateur',
        coHost: 'Co-animateur',
        onMic: '● EN ONDE',
        conversation: 'Dialogue',
        detailLabel: 'Détails',
        openTurn: 'Ouverture',
        replyTurn: 'Réponse',
        takeawayTurn: 'À retenir',
        dialogueTurnLabel: 'Dialogue',
        toneTitle: 'Registre',
        toneLeft: 'familier',
        toneRight: 'poli',
      };
    }
    if (code === 'es' || code === 'spanish' || code === 'español' || code === 'tiếng tây ban nha') {
      return {
        podcastStudio: 'ESTUDIO PODCAST',
        podcastLive: 'PODCAST · EN VIVO',
        multiSpeakerTitle: 'Diálogo entre hablantes',
        speakerDefault: 'Hablante',
        hostPrefix: 'Anfitrión',
        coHost: 'Coanfitrión',
        onMic: '● AL AIRE',
        conversation: 'Diálogo',
        detailLabel: 'Detalles',
        openTurn: 'Inicio',
        replyTurn: 'Respuesta',
        takeawayTurn: 'Clave',
        dialogueTurnLabel: 'Diálogo',
        toneTitle: 'Tono',
        toneLeft: 'informal',
        toneRight: 'cortés',
      };
    }
    if (code === 'en' || code === 'english' || code === 'none') {
      return {
        podcastStudio: 'PODCAST STUDIO',
        podcastLive: 'PODCAST · LIVE',
        multiSpeakerTitle: 'Multi-Speaker Dialogue',
        speakerDefault: 'Speaker',
        hostPrefix: 'Host',
        coHost: 'Co-Host',
        onMic: '● ON MIC',
        conversation: 'Conversation',
        detailLabel: 'Details',
        openTurn: 'Opening',
        replyTurn: 'Reply',
        takeawayTurn: 'Key Point',
        dialogueTurnLabel: 'Dialogue',
        toneTitle: 'TONE',
        toneLeft: 'casual',
        toneRight: 'polite',
      };
    }
    if (code === 'vi' || code === 'vietnamese' || code === 'tiếng việt') {
      return {
        podcastStudio: 'PHÒNG THU PODCAST',
        podcastLive: 'PODCAST · TRỰC TIẾP',
        multiSpeakerTitle: 'Hội thoại nhiều người',
        speakerDefault: 'Người nói',
        hostPrefix: 'Người dẫn',
        coHost: 'Đồng dẫn',
        onMic: '● ĐANG NÓI',
        conversation: 'Hội thoại',
        detailLabel: 'Chi tiết',
        openTurn: 'Mở lời',
        replyTurn: 'Phản hồi',
        takeawayTurn: 'Ghi nhớ',
        dialogueTurnLabel: 'Hội thoại thực tế',
        toneTitle: 'SẮC THÁI',
        toneLeft: 'thân mật',
        toneRight: 'lịch sự',
      };
    }
    return null;
  };

  const direct = pickByCode(norm);
  if (direct) return direct;
  if (learningLang) {
    const byLearning = pickByCode(learningLang.trim().toLowerCase());
    if (byLearning) return byLearning;
  }
  const sample = sampleText || '';
  if (/[\u3040-\u30ff]/.test(sample)) return pickByCode('ja')!;
  if (/[\uac00-\ud7af]/.test(sample)) return pickByCode('ko')!;
  if (/[\u4e00-\u9fff]/.test(sample)) return pickByCode('zh')!;
  if (/[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i.test(sample)) {
    return pickByCode('vi')!;
  }
  return pickByCode('en')!;
}

function extractTimeHint(text: string): { hour: number; minute: number; formula: string } | null {
  const m = text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (m) {
    const h = Math.max(1, Math.min(12, Number(m[1]) % 12 || 12));
    const min = Math.max(0, Math.min(59, Number(m[2])));
    return {
      hour: h,
      minute: min,
      formula: `${m[1]}:${m[2]}`,
    };
  }
  if (/friday|weekend|morning|afternoon|evening|clock|hour|minute|late|early/i.test(text)) {
    return {
      hour: 9,
      minute: 15,
      formula: 'Timing matters',
    };
  }
  return null;
}

export function hasTimeContext(text?: string): boolean {
  if (!text) return false;
  return /\b(\d{1,2}:\d{2}|clock|o'clock|twenty past|half past|quarter|morning|afternoon|evening|hour|minute|early|late|schedule|appointment)\b/i.test(
    text,
  );
}

export function getEligibleCompositionsForContext(
  transcriptText?: string,
): LayoutCompositionMeta[] {
  const withoutCustom = LAYOUT_COMPOSITIONS.filter((c) => c.id !== 'custom' && c.id !== 'plain');
  const allowClock = transcriptText ? hasTimeContext(transcriptText) : true;
  if (allowClock) return withoutCustom;
  return withoutCustom.filter((c) => c.id !== 'clock-spotlight');
}

/**
 * Matches the closest semantic vector illustration to a cue's text content
 * so visuals always accurately match the spoken context.
 */
export function matchIllustrationForCue(
  text: string,
  fallback: IllustrationVariant = 'speech-bubble',
): IllustrationVariant {
  return resolveContextualVisualForCue(text, undefined, fallback).variant;
}

const CONTRAST_TRIOS: Array<{ words: [string, string, string]; hints: [string, string, string] }> = [
  { words: ['Look', 'See', 'Watch'], hints: ['on purpose', 'automatic', 'moving'] },
  { words: ['Hear', 'Listen', 'Sound'], hints: ['passive', 'active', 'result'] },
  { words: ['Say', 'Tell', 'Talk'], hints: ['words', 'someone', 'chat'] },
  { words: ['Make', 'Do', 'Get'], hints: ['create', 'action', 'obtain'] },
  { words: ['In time', 'On time', 'Late'], hints: ['before', 'exact', 'after'] },
  { words: ['Borrow', 'Lend', 'Rent'], hints: ['take', 'give', 'pay'] },
];

export function pickSceneIcon(text: string): IllustrationSceneIcon {
  return pickContextualSceneIcon(text, 'sparkles');
}

export function pickCompositionFromContext(text: string): LayoutCompositionId {
  const t = text.toLowerCase();
  const trioHit = CONTRAST_TRIOS.find((trio) =>
    trio.words.filter((w) => new RegExp(`\\b${w.replace(/\s+/g, '\\s+')}\\b`, 'i').test(t)).length >= 2,
  );
  if (trioHit) return 'phrase-icon-split';
  if (/(\bed\b|\/t\/|\/d\/|\/ɪd\/|ending sound|voiced|voiceless|pronunciation|phát âm)/.test(t)) {
    return 'p168-pronunciation';
  }
  if (/(used to|subject \+|formula|grammar rule|công thức|v-ing|\+\s*to\s*\+|noun)/.test(t)) {
    return 'p168-grammar-formula';
  }
  if (/(question\s*\d|quiz|fill in|blank|choose the|lend.*borrow|borrow.*lend|điền vào)/.test(t)) {
    return 'p168-quiz-formula';
  }
  if (/(slider|difference between|past simple|present perfect|versus|so sánh thì)/.test(t)) {
    return 'p168-slider-compare';
  }
  if (/(situation|with friends|at work|say no|softly|polite way|trong công việc|tình huống)/.test(t)) {
    return 'p168-situations';
  }
  if (/\b(\d{1,2}:\d{2}|o'clock|clock|twenty past|half past)\b/.test(t)) return 'clock-spotlight';
  if (/(don't say|stop saying|instead of|upgrade|boring|natural|rude|polite)/.test(t)) return 'dialogue-upgrade';
  if (/(step|first|then|finally|ladder|level 1|level 2)/.test(t)) return 'flow-steps';
  if (/(tone|mood|gauge|too direct|friendly)/.test(t)) return 'gauge-tone';
  if (/(checklist|✔|✘|correct|wrong example|do not|mistakes?)/.test(t)) return 'checklist-cards';
  if (/(early|late|on time|deadline|timeline|yesterday|tomorrow|past tense|future)/.test(t)) return 'timeline-track';
  if (/\b(preposition|at\s*\/\s*on\s*\/\s*in|syllable|stress)\b/.test(t)) return 'spatial-contrast';
  if (/(office|boss|cafe|hotel|friend|airport|flight|restaurant|menu|shopping|doctor|weather|picture this)/.test(t)) {
    return 'story-scenes';
  }
  return 'story-scenes';
}

function splitPhraseForIcon(text: string): { prefix: string; highlight: string } {
  const cleaned = text.replace(/^["“]+|["”]+$/g, '').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    return { prefix: cleaned, highlight: cleaned };
  }
  return {
    prefix: words.slice(0, -1).join(' '),
    highlight: words[words.length - 1],
  };
}

function cleanShortPhrase(text: string, maxWords = 12, maxChars = 72): string {
  const quoted = text.match(/"([^"]+)"|'([^']+)'|「([^」]+)」/);
  const target = (quoted?.[1] || quoted?.[2] || quoted?.[3] || text).trim();
  const words = target.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords && target.length <= maxChars) return target;

  const picked: string[] = [];
  let charCount = 0;
  for (const w of words.slice(0, maxWords)) {
    const nextLen = charCount + (picked.length > 0 ? 1 : 0) + w.length;
    if (picked.length > 0 && nextLen > maxChars) break;
    picked.push(w);
    charCount = nextLen;
  }
  return (picked.length > 0 ? picked.join(' ') : words[0].slice(0, maxChars)).replace(/[,;:]+$/, '');
}

function extractTargetSentence(cue: TranscriptCue): string | null {
  const q = cue.text.match(/"([^"]+)"|'([^']+)'|「([^」]+)」/);
  if (q) return (q[1] || q[2] || q[3] || '').trim();
  // Pure Latin sentence inside a mixed JP/VN lesson
  const trimmed = cue.text.trim();
  if (/^[A-Za-z][A-Za-z0-9\s,'’?!.-]{3,}$/.test(trimmed) && !/^Follow along\.?$/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function deriveStripItems(project: LessonProject): ComparisonItem[] {
  const existing = project.elements.find((e) => e.props.kind === 'comparison-strip');
  if (existing && existing.props.kind === 'comparison-strip' && existing.props.items.length >= 2) {
    return existing.props.items;
  }
  const joined = project.cues.map((c) => c.text).join(' ');
  const trio = CONTRAST_TRIOS.find(
    (item) =>
      item.words.filter((w) => new RegExp(`\\b${w.replace(/\s+/g, '\\s+')}\\b`, 'i').test(joined))
        .length >= 2,
  );
  if (trio) {
    const colors = ['#64748B', '#94A3B8', '#6366F1'];
    return trio.words.map((label, i) => ({
      label,
      sublabel: trio.hints[i],
      activateAt: project.cues[Math.min(i, Math.max(0, project.cues.length - 1))]?.start ?? 0,
      accentColor: colors[i],
    }));
  }
  const cues = project.cues;
  if (cues.length === 0) {
    return [
      { label: 'Step 1', sublabel: 'Intro', activateAt: 0, accentColor: '#2563EB' },
      { label: 'Step 2', sublabel: 'Core', activateAt: 2, accentColor: '#16A34A' },
      { label: 'Step 3', sublabel: 'Tip', activateAt: 4, accentColor: '#7C3AED' },
    ];
  }
  const colors = ['#2563EB', '#16A34A', '#7C3AED'];
  const indices =
    cues.length >= 3
      ? [0, Math.floor(cues.length / 2), cues.length - 1]
      : cues.length === 2
        ? [0, 1]
        : [0];
  return indices.map((idx, i) => {
    const cue = cues[idx];
    const target = extractTargetSentence(cue) ?? cue.text;
    const words = target.replace(/[^\p{L}\p{N}\s'-]/gu, '').split(/\s+/).filter(Boolean);
    const label = words.slice(0, 4).join(' ') || `Part ${i + 1}`;
    return {
      label,
      activateAt: cue.start,
      accentColor: colors[i % colors.length],
    };
  });
}

function buildBeatSegments(project: LessonProject): Array<{
  startTime: number;
  endTime: number;
  cueText: string;
  cardText: string;
  subtext?: string;
  badge: 'check' | 'cross' | 'question' | 'none';
  stampText?: string;
  stampColor?: string;
  emphasisWord?: string;
  emphasisColor?: string;
  topicLabel: string;
  topicBg: string;
  topicColor: string;
}> {
  const existingCards = project.elements
    .filter((e) => e.props.kind === 'sentence-card')
    .sort((a, b) => a.startTime - b.startTime);

  const existingPills = project.elements
    .filter((e) => e.props.kind === 'topic-pill')
    .sort((a, b) => a.startTime - b.startTime);

  const cues = project.cues;
  const segments: ReturnType<typeof buildBeatSegments> = [];

  if (existingCards.length >= 2) {
    existingCards.forEach((card, idx) => {
      if (card.props.kind !== 'sentence-card') return;
      const mid = (card.startTime + card.endTime) / 2;
      const matchingCue =
        cues.find((c) => mid >= c.start && mid <= c.end) ??
        cues[Math.min(cues.length - 1, idx)] ??
        null;
      const matchingPill = existingPills.find((p) => mid >= p.startTime && mid <= p.endTime);
      const pillProps =
        matchingPill?.props.kind === 'topic-pill' ? matchingPill.props : undefined;

      segments.push({
        startTime: card.startTime,
        endTime: card.endTime,
        cueText: `${matchingCue?.text ?? ''} ${card.props.text}`.trim(),
        cardText: card.props.text,
        subtext: card.props.subtext,
        badge: card.props.badge ?? 'none',
        stampText: card.props.stampText,
        stampColor: card.props.stampColor,
        emphasisWord: card.props.emphasisWord,
        emphasisColor: card.props.emphasisColor,
        topicLabel: pillProps?.text ?? `Point #${idx + 1}`,
        topicBg: pillProps?.bgColor ?? '#DDD6FE',
        topicColor: pillProps?.textColor ?? '#4338CA',
      });
    });

    // Preserve any cues not covered by existingCards so recomposing never drops spoken segments
    const uncoveredGroups: TranscriptCue[][] = [];
    let currentGroup: TranscriptCue[] = [];
    for (const cue of cues) {
      const cueMid = (cue.start + cue.end) / 2;
      const isCovered = existingCards.some(
        (c) => cueMid >= c.startTime - 0.15 && cueMid <= c.endTime + 0.15,
      );
      if (isCovered) {
        if (currentGroup.length > 0) {
          uncoveredGroups.push(currentGroup);
          currentGroup = [];
        }
        continue;
      }
      const groupDuration = currentGroup.length > 0 ? cue.end - currentGroup[0].start : 0;
      if (currentGroup.length >= 3 || (currentGroup.length > 0 && groupDuration > 8.0)) {
        uncoveredGroups.push(currentGroup);
        currentGroup = [cue];
      } else {
        currentGroup.push(cue);
      }
    }
    if (currentGroup.length > 0) {
      uncoveredGroups.push(currentGroup);
    }

    uncoveredGroups.forEach((slice) => {
      const first = slice[0];
      const last = slice[slice.length - 1];
      const combined = slice.map((c) => c.text).join(' ');
      const targetCue = slice.find((c) => extractTargetSentence(c)) ?? first;
      const cardText = extractTargetSentence(targetCue) ?? cleanShortPhrase(first.text, 7);
      const mid = (first.start + last.end) / 2;
      const matchingPill = existingPills.find((p) => mid >= p.startTime && mid <= p.endTime);
      const pillProps =
        matchingPill?.props.kind === 'topic-pill' ? matchingPill.props : undefined;
      const isNeg = /(rude|wrong|avoid|never|ぶっきらぼう|NG)/i.test(combined);
      const isPos = /(polite|better|natural|could|may|丁寧|自然)/i.test(combined);

      segments.push({
        startTime: first.start,
        endTime: last.end,
        cueText: combined,
        cardText,
        badge: isNeg ? 'cross' : isPos ? 'check' : 'none',
        stampText: isNeg ? 'AVOID' : undefined,
        stampColor: isNeg ? '#DC2626' : undefined,
        emphasisColor: isNeg ? '#DC2626' : '#2563EB',
        topicLabel:
          pillProps?.text ??
          (isNeg ? 'Avoid this' : isPos ? 'Natural choice' : `Part ${segments.length + 1}`),
        topicBg: pillProps?.bgColor ?? (isNeg ? '#FEE2E2' : isPos ? '#DCFCE7' : '#DDD6FE'),
        topicColor: pillProps?.textColor ?? (isNeg ? '#B91C1C' : isPos ? '#15803D' : '#4338CA'),
      });
    });

    segments.sort((a, b) => a.startTime - b.startTime);
    return segments;
  }

  // Fallback directly from cues
  const chunkSize = Math.max(1, Math.ceil(cues.length / 5));
  for (let i = 0; i < cues.length; i += chunkSize) {
    const slice = cues.slice(i, i + chunkSize);
    const first = slice[0];
    const last = slice[slice.length - 1];
    const combined = slice.map((c) => c.text).join(' ');
    const targetCue = slice.find((c) => extractTargetSentence(c)) ?? first;
    const cardText = extractTargetSentence(targetCue) ?? cleanShortPhrase(first.text, 7);
    const isNeg = /(rude|wrong|avoid|never|ぶっきらぼう|NG)/i.test(combined);
    const isPos = /(polite|better|natural|could|may|丁寧|自然)/i.test(combined);
    segments.push({
      startTime: first.start,
      endTime: last.end,
      cueText: combined,
      cardText,
      badge: isNeg ? 'cross' : isPos ? 'check' : 'none',
      stampText: isNeg ? 'AVOID' : undefined,
      stampColor: isNeg ? '#DC2626' : undefined,
      emphasisColor: isNeg ? '#DC2626' : '#2563EB',
      topicLabel: i === 0 ? 'Picture this' : isPos ? 'Natural choice' : `Part ${segments.length + 1}`,
      topicBg: isNeg ? '#FEE2E2' : isPos ? '#DCFCE7' : '#DDD6FE',
      topicColor: isNeg ? '#B91C1C' : isPos ? '#15803D' : '#4338CA',
    });
  }

  return segments;
}

function buildIllustrationDataForComposition(
  compositionId: LayoutCompositionId,
  stripItems: ComparisonItem[],
  segments: ReturnType<typeof buildBeatSegments>,
  segIdx: number,
  segCount: number,
  project: LessonProject,
): { variant: IllustrationVariant; data?: IllustrationPropData } {
  const seg = segments[segIdx];
  const progress = segCount <= 1 ? 0.65 : (segIdx + 0.5) / segCount;

  const cueContext = `${seg.cueText} ${seg.cardText}`.trim();
  const contextualIcon = pickContextualSceneIcon(cueContext, 'sparkles');

  switch (compositionId) {
    case 'story-scenes': {
      const resolved = resolveContextualVisualForCue(seg.cueText, seg.cardText, 'dynamic-scene');
      return {
        variant: resolved.variant,
        data: resolved.data,
      };
    }

    case 'flow-steps': {
      const colors = ['#2563EB', '#16A34A', '#7C3AED'];
      const icons: IllustrationFlowNode['icon'][] = ['chat', 'check', 'star'];
      const nodes: IllustrationFlowNode[] = stripItems.slice(0, 3).map((it, idx) => ({
        label: it.label,
        sublabel: it.sublabel,
        icon: icons[idx % icons.length],
        color: it.accentColor || colors[idx % colors.length],
      }));
      return {
        variant: 'flow-diagram',
        data: {
          title: seg.topicLabel,
          nodes,
          value: progress,
          sceneIcon: contextualIcon,
        },
      };
    }

    case 'gauge-tone': {
      const sentimentVal =
        seg.badge === 'cross'
          ? 0.16
          : seg.badge === 'check'
            ? Math.min(0.92, 0.52 + progress * 0.42)
            : 0.52;
      return {
        variant: 'gauge-arc',
        data: {
          title: seg.topicLabel,
          subtitle:
            seg.badge === 'cross'
              ? 'Too direct'
              : sentimentVal > 0.75
                ? 'Polite & Natural'
                : 'Friendly',
          labels: ['Rough', 'Okay', 'Good', 'Polite', 'Great'],
          value: sentimentVal,
        },
      };
    }

    case 'checklist-cards': {
      const items: IllustrationChecklistItem[] = segments
        .slice(Math.max(0, segIdx - 1), Math.max(3, segIdx + 2))
        .slice(0, 3)
        .map((s) => ({
          text: s.cardText,
          highlight: s.emphasisWord,
          ok: s.badge !== 'cross',
        }));
      if (items.length < 2 && project.cues.length >= 2) {
        items.push({
          text: cleanShortPhrase(project.cues[1].text, 6),
          ok: true,
        });
      }
      return {
        variant: 'checklist-card',
        data: {
          title: 'Key Examples',
          checklist: items,
        },
      };
    }

    case 'dialogue-upgrade': {
      const negativeSeg = segments.find((s) => s.badge === 'cross');
      const positiveSegs = segments.filter((s) => s.badge !== 'cross');
      const rows: IllustrationDialogueRow[] = [];
      const basePrompt = negativeSeg ? cleanShortPhrase(negativeSeg.cardText, 4, 21) : 'Basic phrase';

      // Pick up to 3 distinct positive levels (e.g. one from Can, Could, May) when available
      const distinctUpgrades: typeof positiveSegs = [];
      const seenLabels = new Set<string>();
      for (const p of positiveSegs) {
        if (!seenLabels.has(p.topicLabel) && !distinctUpgrades.some((d) => d.cardText === p.cardText)) {
          distinctUpgrades.push(p);
          seenLabels.add(p.topicLabel);
        }
        if (distinctUpgrades.length >= 3) break;
      }
      if (distinctUpgrades.length < 3) {
        for (const p of positiveSegs) {
          if (!distinctUpgrades.some((d) => d.cardText === p.cardText)) {
            distinctUpgrades.push(p);
          }
          if (distinctUpgrades.length >= 3) break;
        }
      }

      if (distinctUpgrades.length > 0) {
        const usedPrompts = new Set<string>();
        distinctUpgrades.forEach((u, i) => {
          const prevText = i === 0 ? basePrompt : cleanShortPhrase(distinctUpgrades[i - 1].cardText, 4, 21);
          let promptText =
            i > 0 && prevText === rows[i - 1]?.prompt
              ? `${distinctUpgrades[i - 1].topicLabel || `Step ${i}`}`
              : prevText;
          if (usedPrompts.has(promptText)) {
            promptText = `${promptText} (${i + 1})`;
          }
          usedPrompts.add(promptText);
          rows.push({
            prompt: promptText,
            upgrade: cleanShortPhrase(u.cardText, 4, 21),
            badgeColor: i === 0 ? '#2563EB' : i === 1 ? '#16A34A' : '#7C3AED',
          });
        });
      } else {
        rows.push({
          prompt: cleanShortPhrase(seg.cardText, 4, 21),
          upgrade: 'Sounds natural',
          badgeColor: '#16A34A',
        });
      }
      return {
        variant: 'dialogue-upgrade',
        data: {
          title: 'Upgrade Phrase',
          upgrades: rows,
        },
      };
    }

    case 'timeline-track': {
      const labels = stripItems.slice(0, 3).map((s) => s.label);
      return {
        variant: 'timeline-track',
        data: {
          title: seg.topicLabel,
          labels: labels.length >= 2 ? labels : ['Start', 'Focus', 'Mastered'],
          value: progress,
          sceneIcon: contextualIcon,
        },
      };
    }

    case 'spatial-contrast': {
      const icons: IllustrationSpatialBox['icon'][] = ['dot', 'surface', 'cube'];
      const accents = ['#2563EB', '#16A34A', '#7C3AED'];
      const boxes: IllustrationSpatialBox[] = stripItems.slice(0, 3).map((it, idx) => ({
        title: it.label,
        subtitle: it.sublabel || `Level ${idx + 1}`,
        icon: icons[idx % icons.length],
        accent: it.accentColor || accents[idx % accents.length],
      }));
      return {
        variant: 'spatial-boxes',
        data: { boxes, sceneIcon: contextualIcon },
      };
    }

    case 'avatar-dialogue': {
      return {
        variant: 'avatar-speech',
        data: {
          speechText: seg.cardText,
          reactionText:
            seg.badge === 'cross'
              ? 'Too blunt!'
              : seg.badge === 'check'
                ? 'Natural!'
                : seg.topicLabel,
          sceneIcon: contextualIcon,
        },
      };
    }

    case 'cartoon-host': {
      return {
        variant: 'cartoon-host',
        data: {
          title: seg.topicLabel,
          speechText: seg.cardText,
          reactionText: seg.topicLabel,
          sceneIcon: contextualIcon,
        },
      };
    }

    case 'clock-spotlight': {
      const hint = extractTimeHint(seg.cueText);
      const stepHour = hint?.hour ?? (((8 + segIdx) % 12) || 12);
      const stepMin = hint?.minute ?? (segIdx * 15) % 60;
      return {
        variant: 'clock-face',
        data: {
          timeHour: stepHour,
          timeMinute: stepMin,
          formula: hint?.formula ?? cleanShortPhrase(seg.cardText, 4),
          subtitle: seg.topicLabel,
          sceneIcon: 'clock',
        },
      };
    }

    case 'phrase-icon-split': {
      const split = splitPhraseForIcon(seg.cardText);
      const fallbackColors = ['#64748B', '#2563EB', '#7C3AED'];
      const fallbackIcons: IllustrationSceneIcon[] = ['chat', 'handshake', 'sparkles'];
      const usedIcons = new Set<IllustrationSceneIcon>();
      const nodes: IllustrationFlowNode[] = stripItems.slice(0, 3).map((it, idx) => {
        const picked = pickContextualSceneIcon(
          `${it.label} ${it.sublabel || ''}`,
          fallbackIcons[idx % fallbackIcons.length],
        );
        const sceneIcon = usedIcons.has(picked)
          ? fallbackIcons.find((ic) => !usedIcons.has(ic)) ?? picked
          : picked;
        usedIcons.add(sceneIcon);
        return {
          label: it.label.toUpperCase(),
          sublabel: it.sublabel,
          color: it.accentColor || fallbackColors[idx % fallbackColors.length],
          sceneIcon,
        };
      });

      if (segIdx === 0 || segIdx % 3 === 0) {
        return {
          variant: 'phrase-icon-split',
          data: {
            title: stripItems.map((s) => s.label).join(' / '),
            nodes,
            speechText: split.prefix,
            highlightWord: split.highlight,
            subtitle:
              seg.subtext ||
              (seg.badge === 'cross'
                ? 'Avoid using this literally'
                : 'Use the right word for context'),
            sceneIcon: pickContextualSceneIcon(`${seg.cueText} ${seg.cardText}`, 'sparkles'),
          },
        };
      }

      if (segIdx % 3 === 1) {
        const leftItem = stripItems[0];
        const rightItem = stripItems[Math.min(2, stripItems.length - 1)] ?? stripItems[1];
        return {
          variant: 'contrast-pair-cards',
          data: {
            labels: [leftItem?.label || 'Basic', rightItem?.label || 'Natural'],
            formula: seg.badge === 'cross' ? 'cross' : 'arrow',
            nodes: [
              {
                label: leftItem?.label || 'Avoid',
                sublabel: leftItem?.sublabel || seg.topicLabel,
                color: leftItem?.accentColor || '#DC2626',
              },
              {
                label: rightItem?.label || 'Natural',
                sublabel: rightItem?.sublabel || 'better fit',
                color: rightItem?.accentColor || '#16A34A',
              },
            ],
          },
        };
      }

      return {
        variant: 'trio-icon-cards',
        data: {
          nodes:
            nodes.length >= 2
              ? nodes
              : [
                  { label: 'Focus', sublabel: 'on purpose', sceneIcon: 'eye', color: '#2563EB' },
                  { label: 'Notice', sublabel: 'automatic', sceneIcon: 'glasses', color: '#64748B' },
                  { label: 'Follow', sublabel: 'in motion', sceneIcon: 'tv', color: '#D97706' },
                ],
        },
      };
    }

    case 'p168-quiz-formula': {
      const strip0 = stripItems[0]?.label || 'Option A';
      const strip1 = stripItems[1]?.label || 'Option B';
      return {
        variant: 'p168-step-quiz-formula',
        data: {
          title: `Question ${segIdx + 1}`,
          speechText: seg.cardText,
          labels: [strip0, strip1, stripItems[2]?.label || 'Choose'],
          formula: `${strip0}  /  ${strip1}`,
          highlightWord: seg.emphasisWord || strip0,
          subtitle: seg.subtext || seg.topicLabel,
          value: progress,
          sceneIcon: contextualIcon,
        },
      };
    }

    case 'p168-grammar-formula': {
      const formulaParts = stripItems.slice(0, 3).map((s) => s.label);
      return {
        variant: 'p168-grammar-formula',
        data: {
          title: seg.topicLabel || 'Grammar Pattern',
          formula: formulaParts.length >= 2 ? formulaParts.join(' + ') : cleanShortPhrase(seg.cardText, 5, 28),
          speechText: seg.cardText,
          subtitle: seg.subtext || 'Past habit or natural pattern',
          labels: formulaParts.length >= 2 ? formulaParts : ['Subject', 'Pattern', 'Verb'],
          highlightWord: seg.emphasisWord || formulaParts[0],
          sceneIcon: contextualIcon,
        },
      };
    }

    case 'p168-pronunciation': {
      const cols = stripItems.slice(0, 3);
      return {
        variant: 'p168-pronunciation-matrix',
        data: {
          title: seg.topicLabel || 'Pronunciation Rules',
          subtitle: cleanShortPhrase(seg.cardText, 6, 36),
          nodes:
            cols.length >= 2
              ? cols.map((c, idx) => ({
                  label: c.label,
                  sublabel: c.sublabel || (idx === 0 ? '/t/' : idx === 1 ? '/d/' : '/ɪd/'),
                  color: c.accentColor || (idx === 0 ? '#0EA5E9' : idx === 1 ? '#10B981' : '#8B5CF6'),
                }))
              : [
                  { label: 'Voiceless', sublabel: '/t/', color: '#0EA5E9' },
                  { label: 'Voiced', sublabel: '/d/', color: '#10B981' },
                  { label: 't / d end', sublabel: '/ɪd/', color: '#8B5CF6' },
                ],
          labels: ['asked · helped', 'played · called', 'wanted · needed'],
          value: progress,
          sceneIcon: 'mic',
        },
      };
    }

    case 'p168-situations': {
      const cardIcons: IllustrationSceneIcon[] = ['chat', 'briefcase', 'handshake'];
      const cardColors = ['#2563EB', '#059669', '#D97706'];
      return {
        variant: 'p168-situation-cards',
        data: {
          title: seg.topicLabel || 'Everyday Situations',
          subtitle: cleanShortPhrase(seg.cardText, 6, 34),
          nodes: (stripItems.length >= 2 ? stripItems : [
            { label: 'With Friends', sublabel: 'Warm & casual', accentColor: '#2563EB' },
            { label: 'At Work', sublabel: 'Polite & clear', accentColor: '#059669' },
            { label: 'Soft Refusal', sublabel: 'Kind & gentle', accentColor: '#D97706' },
          ])
            .slice(0, 3)
            .map((it, idx) => ({
              label: it.label,
              sublabel: it.sublabel || 'Natural use',
              color: it.accentColor || cardColors[idx % cardColors.length],
              sceneIcon: pickContextualSceneIcon(`${it.label} ${it.sublabel || ''}`, cardIcons[idx % cardIcons.length]),
            })),
          sceneIcon: contextualIcon,
        },
      };
    }

    case 'p168-slider-compare': {
      const leftItem = stripItems[0];
      const rightItem = stripItems[stripItems.length - 1] ?? stripItems[1];
      return {
        variant: 'p168-slider-compare',
        data: {
          title: seg.topicLabel || 'Key Comparison',
          labels: [leftItem?.label || 'Option A', rightItem?.label || 'Option B'],
          speechText: seg.cardText,
          subtitle: seg.subtext || 'Compare meaning & nuance',
          highlightWord: seg.emphasisWord || rightItem?.label || 'Natural',
          value: seg.badge === 'cross' ? 0.18 : Math.min(0.92, Math.max(0.25, progress)),
          sceneIcon: contextualIcon,
        },
      };
    }

    case 'podcast-duo': {
      const speakers = stripItems.slice(0, 3);
      const chrome = getLocalizedStageChrome(
        project.targetLanguage,
        project.learningLanguage,
        `${project.title} ${seg.cardText} ${seg.subtext || ''}`,
      );
      return {
        variant: 'podcast-studio',
        data: {
          formula: chrome.podcastStudio,
          title: seg.topicLabel || chrome.multiSpeakerTitle,
          reactionText: speakers[segIdx % Math.max(1, speakers.length)]?.label || `${chrome.hostPrefix} 1`,
          highlightWord: chrome.onMic,
          nodes:
            speakers.length >= 2
              ? speakers.map((sp, i) => ({
                  label: sp.label,
                  sublabel: sp.sublabel || `${chrome.hostPrefix} ${i + 1}`,
                  color: sp.accentColor || (i === 0 ? '#3B82F6' : i === 1 ? '#8B5CF6' : '#10B981'),
                }))
              : [
                  { label: `${chrome.hostPrefix} 1`, sublabel: chrome.openTurn, color: '#3B82F6' },
                  { label: `${chrome.hostPrefix} 2`, sublabel: chrome.replyTurn, color: '#8B5CF6' },
                ],
          sceneIcon: 'mic',
        },
      };
    }

    case 'dialogue-stage': {
      const speakers = stripItems.slice(0, 3);
      const chrome = getLocalizedStageChrome(
        project.targetLanguage,
        project.learningLanguage,
        `${project.title} ${seg.cardText} ${seg.subtext || ''}`,
      );
      const activeSpk = speakers[segIdx % Math.max(1, speakers.length)]?.label || `${chrome.speakerDefault} 1`;
      if (segIdx % 2 === 0) {
        return {
          variant: 'p168-story-dialogue',
          data: {
            labels:
              speakers.length >= 2
                ? speakers.map((s) => s.label)
                : [chrome.openTurn, chrome.replyTurn, chrome.takeawayTurn],
            title: seg.topicLabel || chrome.dialogueTurnLabel,
            reactionText: activeSpk,
            speechText: seg.cardText,
            highlightWord: seg.emphasisWord || seg.subtext || seg.topicLabel,
            sceneIcon: 'chat',
          },
        };
      }
      return {
        variant: 'css-chat-thread',
        data: {
          title: speakers.map((s) => s.label).slice(0, 2).join(' ↔ ') || chrome.conversation,
          labels: [
            segments[Math.max(0, segIdx - 1)]?.cardText || seg.topicLabel,
            seg.cardText,
          ],
          sceneIcon: 'chat',
        },
      };
    }

    case 'full-study-cards': {
      const chrome = getLocalizedStageChrome(
        project.targetLanguage,
        project.learningLanguage,
        `${project.title} ${seg.cardText} ${seg.subtext || ''}`,
      );
      return {
        variant: 'bs-card-header',
        data: {
          formula: seg.topicLabel,
          title: seg.cardText,
          subtitle: seg.subtext || chrome.detailLabel,
          sceneIcon: contextualIcon,
        },
      };
    }

    case 'word-reveal':
    case '3d-shapes': {
      const resolved = resolveContextualVisualForCue(seg.cueText, seg.cardText, 'degree-scale');
      return {
        variant: resolved.variant,
        data: resolved.data,
      };
    }

    case 'custom':
    case 'plain': {
      const resolved = resolveContextualVisualForCue(seg.cueText, seg.cardText, 'css-sticky-note');
      return {
        variant: resolved.variant,
        data: resolved.data,
      };
    }
  }
}

export function recomposeProjectWithStyle(
  project: LessonProject,
  compositionId: LayoutCompositionId,
  options?: { theme?: CanvasThemeId },
): LessonProject {
  const meta =
    LAYOUT_COMPOSITIONS.find((c) => c.id === compositionId) ?? LAYOUT_COMPOSITIONS[0];
  const nextTheme = options?.theme ?? meta.recommendedTheme;
  const stripItems = deriveStripItems(project);
  const segments = buildBeatSegments(project);
  const karaokeEls = project.elements.filter((e) => e.type === 'karaoke-card');

  const newVisuals: SceneElement[] = [];

  if (compositionId === 'plain') {
    const nextSubConfig = project.subtitleConfig ?? {
      position: 'center' as const,
      size: 'lg' as const,
      boxStyle: 'clean' as const,
    };
    const pos = nextSubConfig.position || 'center';
    const targetY = pos === 'top' ? 350 : pos === 'bottom' ? 1585 : 960;
    const baseKaraoke: SceneElement[] =
      karaokeEls.length > 0
        ? karaokeEls
        : project.cues.map((cue, idx) => ({
            id: `plain-karaoke-${idx + 1}`,
            type: 'karaoke-card',
            label: `Sub #${idx + 1}: ${cue.text.slice(0, 26)}`,
            startTime: cue.start,
            endTime: cue.end,
            enterAnimation: 'fade-scale',
            exitAnimation: 'fade-out',
            layout: { x: 540, y: targetY, width: 920, scale: 1, zIndex: 35 },
            props: {
              kind: 'karaoke-card',
              cueId: cue.id,
              words: cue.words,
              variant: 'plain-shadow',
              activeColor: '#FACC15',
              inactiveColor: '#E2E8F0',
              spokenColor: '#FFFFFF',
            },
          }));
    const themedPlain = baseKaraoke.map((k) =>
      k.props.kind === 'karaoke-card'
        ? {
            ...k,
            layout: { ...k.layout, y: targetY },
            props: {
              ...k.props,
              variant: 'plain-shadow' as const,
              activeColor: '#FACC15',
              inactiveColor: '#E2E8F0',
              spokenColor: '#FFFFFF',
            },
          }
        : k,
    );
    return {
      ...project,
      theme: nextTheme,
      compositionId: 'plain',
      subtitleConfig: nextSubConfig,
      subtitle: `${project.cues.length} câu thoại · Plain (Chỉ chữ & nền)`,
      elements: resolveProjectOverlaps(themedPlain, { preserveKaraokeY: true }),
    };
  }

  if (compositionId === 'cartoon-host') {
    const subPos = project.subtitleConfig?.position;
    const targetKaraokeY = subPos === 'top' ? 275 : 1585;

    const existingMeter = project.elements.find((e) => e.type === 'tone-meter');

    // Interactive teaching pills + right/wrong/tip sentence cards in upper zone for Gimmy to point at
    segments.forEach((seg, idx) => {
      const safeStart = Math.max(0, seg.startTime);
      const safeEnd = Math.max(safeStart + 0.45, seg.endTime);
      const cardSignalText = `${seg.cueText} ${seg.cardText}`;
      const inferredBadge: 'check' | 'cross' | 'question' | 'none' =
        seg.badge !== 'none'
          ? seg.badge
          : /\b(avoid|rude|wrong|mistake|don't say|stop saying)\b|ぶっきらぼう|tránh|sai/i.test(cardSignalText) ||
              /(?:^|[\s「『(【])NG(?:$|[\s」』)】:：!])/u.test(cardSignalText)
            ? 'cross'
            : /[?？]/.test(cardSignalText)
              ? 'question'
              : /\b(natural|polite|better|instead|could|may|can|tip)\b|丁寧|自然|nên dùng/i.test(
                    cardSignalText,
                  )
                ? 'check'
                : 'none';

      const inferredStamp =
        seg.stampText ||
        (inferredBadge === 'cross'
          ? 'AVOID'
          : inferredBadge === 'check'
            ? 'NATURAL'
            : undefined);

      const pillText =
        seg.topicLabel && !/^Part \d+$/i.test(seg.topicLabel) && !/^Point #\d+$/i.test(seg.topicLabel)
          ? seg.topicLabel
          : inferredBadge === 'cross'
            ? '⚠ Tránh cách nói này'
            : inferredBadge === 'check'
              ? '✔ Nên dùng · Tự nhiên'
              : inferredBadge === 'question'
                ? '❓ Chọn cách nói chuẩn'
                : `💡 Điểm nhấn #${idx + 1}`;

      const pillBg =
        inferredBadge === 'cross'
          ? '#FEE2E2'
          : inferredBadge === 'check'
            ? '#DCFCE7'
            : inferredBadge === 'question'
              ? '#FEF3C7'
              : seg.topicBg || '#E0E7FF';
      const pillColor =
        inferredBadge === 'cross'
          ? '#B91C1C'
          : inferredBadge === 'check'
            ? '#15803D'
            : inferredBadge === 'question'
              ? '#B45309'
              : seg.topicColor || '#3730A3';

      newVisuals.push({
        id: `comp-cartoon-pill-${idx + 1}`,
        type: 'topic-pill',
        label: `Nhãn ngữ cảnh #${idx + 1}: ${pillText}`,
        startTime: Number(safeStart.toFixed(2)),
        endTime: Number(safeEnd.toFixed(2)),
        enterAnimation: 'pop-up',
        exitAnimation: 'fade-out',
        layout: {
          x: 540,
          y: subPos === 'top' ? 430 : 205,
          width: 620,
          scale: 0.92,
          zIndex: 18,
        },
        props: {
          kind: 'topic-pill',
          text: pillText,
          bgColor: pillBg,
          textColor: pillColor,
        },
      });

      newVisuals.push({
        id: `comp-cartoon-card-${idx + 1}`,
        type: 'sentence-card',
        label: `Thẻ tương tác #${idx + 1}: ${seg.cardText.slice(0, 24)}`,
        startTime: Number(safeStart.toFixed(2)),
        endTime: Number(safeEnd.toFixed(2)),
        enterAnimation: 'pop-up',
        exitAnimation: idx === segments.length - 1 ? 'fade-out' : 'shrink',
        layout: {
          x: 540,
          y: subPos === 'top' ? 600 : 395,
          width: 860,
          scale: 0.92,
          zIndex: 20,
        },
        props: {
          kind: 'sentence-card',
          text: seg.cardText,
          subtext: seg.subtext,
          badge: inferredBadge,
          stampText: inferredStamp,
          stampColor:
            inferredBadge === 'cross'
              ? '#DC2626'
              : inferredBadge === 'check'
                ? '#16A34A'
                : seg.stampColor,
          emphasisWord: seg.emphasisWord,
          emphasisColor:
            inferredBadge === 'cross'
              ? '#DC2626'
              : inferredBadge === 'check'
                ? '#16A34A'
                : seg.emphasisColor || '#2563EB',
          bgColor: inferredBadge === 'cross' ? '#FFF1F2' : '#FFFFFF',
          textColor: '#0F172A',
        },
      });
    });

    if (existingMeter && existingMeter.props.kind === 'tone-meter') {
      newVisuals.push({
        ...existingMeter,
        layout: {
          ...existingMeter.layout,
          x: 540,
          y: subPos === 'top' ? 760 : 595,
          width: 700,
          scale: 0.78,
          zIndex: 18,
        },
      });
    }

    // Continuous full-duration @Gimmys cartoon mascot synced dynamically to project.cues + active cards
    newVisuals.push({
      id: 'comp-cartoon-host-main',
      type: 'illustration-prop',
      label: 'Nhân vật Hoạt Hình Lip-Sync (@Gimmys)',
      startTime: 0,
      endTime: project.duration,
      enterAnimation: 'none',
      exitAnimation: 'none',
      layout: {
        x: 540,
        y: subPos === 'top' ? 1135 : 1085,
        width: 820,
        scale: existingMeter ? 0.88 : 0.94,
        zIndex: 12,
      },
      props: {
        kind: 'illustration-prop',
        variant: 'cartoon-host',
        data: {
          title: project.title,
          speechText: project.cues[0]?.text || '',
        },
      },
    });

    const baseKaraoke: SceneElement[] =
      karaokeEls.length > 0
        ? karaokeEls
        : project.cues.map((cue, idx) => ({
            id: `cartoon-karaoke-${idx + 1}`,
            type: 'karaoke-card',
            label: `Sub #${idx + 1}: ${cue.text.slice(0, 26)}`,
            startTime: cue.start,
            endTime: cue.end,
            enterAnimation: 'pop-up',
            exitAnimation: 'fade-out',
            layout: { x: 540, y: targetKaraokeY, width: 900, scale: 1, zIndex: 35 },
            props: {
              kind: 'karaoke-card',
              cueId: cue.id,
              words: cue.words,
              variant: 'yellow-pill',
              activeColor: '#B91C1C',
              inactiveColor: '#334155',
              spokenColor: '#0F172A',
            },
          }));

    const yellowKaraoke = baseKaraoke.map((k) =>
      k.props.kind === 'karaoke-card'
        ? {
            ...k,
            layout: { ...k.layout, y: targetKaraokeY, width: Math.min(940, k.layout.width || 900) },
            props: {
              ...k.props,
              variant: 'yellow-pill' as const,
              activeColor: '#B91C1C',
              inactiveColor: '#334155',
              spokenColor: '#0F172A',
            },
          }
        : k,
    );

    return {
      ...project,
      theme: nextTheme,
      compositionId: 'cartoon-host',
      subtitleConfig:
        subPos === 'center'
          ? {
              position: 'bottom',
              size: project.subtitleConfig?.size || 'md',
              boxStyle: 'card',
            }
          : project.subtitleConfig,
      subtitle: `${project.cues.length} câu thoại · Hoạt hình Lip-Sync (@Gimmys)`,
      elements: resolveProjectOverlaps([...newVisuals, ...yellowKaraoke], {
        preserveKaraokeY: subPos === 'top' || subPos === 'bottom',
      }),
    };
  }

  if (compositionId === 'word-reveal' || compositionId === 'full-study-cards') {
    const isFullStudy = compositionId === 'full-study-cards';
    const recomposeChrome = getLocalizedStageChrome(
      project.targetLanguage,
      project.learningLanguage,
      `${project.title} ${project.cues[0]?.text || ''}`,
    );
    segments.forEach((seg, idx) => {
      const safeStart = Math.max(0, seg.startTime);
      const safeEnd = Math.max(safeStart + 0.45, seg.endTime);
      const isDark = isDarkCanvasTheme(nextTheme);
      if (isFullStudy) {
        newVisuals.push({
          id: `comp-full-pill-${idx + 1}`,
          type: 'topic-pill',
          label: `Nhãn: ${seg.topicLabel}`,
          startTime: Number(safeStart.toFixed(2)),
          endTime: Number(safeEnd.toFixed(2)),
          enterAnimation: 'pop-up',
          exitAnimation: 'fade-out',
          layout: { x: 540, y: 205, width: 520, scale: 1, zIndex: 14 },
          props: {
            kind: 'topic-pill',
            text: seg.topicLabel,
            bgColor: isDark ? '#334155' : '#E0E7FF',
            textColor: isDark ? '#FACC15' : '#3730A3',
          },
        });
      }
      newVisuals.push({
        id: `${isFullStudy ? 'comp-full-card' : 'comp-word-reveal'}-${idx + 1}`,
        type: 'sentence-card',
        label: `${isFullStudy ? 'Full Study' : 'Word Reveal'} #${idx + 1}: ${seg.cardText.slice(0, 24)}`,
        startTime: Number(safeStart.toFixed(2)),
        endTime: Number(safeEnd.toFixed(2)),
        enterAnimation: 'fade-scale',
        exitAnimation: idx === segments.length - 1 ? 'fade-out' : 'shrink',
        layout: {
          x: 540,
          y: isFullStudy ? 875 : 780,
          width: isFullStudy ? 920 : 880,
          scale: 1,
          zIndex: 22,
        },
        props: {
          kind: 'sentence-card',
          text: seg.cardText,
          subtext: seg.subtext || seg.topicLabel,
          sections: isFullStudy && seg.subtext
            ? [{ label: recomposeChrome.detailLabel, text: seg.subtext, tone: 'indigo' }]
            : undefined,
          badge: seg.badge,
          stampText: seg.stampText,
          stampColor: seg.stampColor,
          emphasisWord: seg.emphasisWord,
          emphasisColor: isDark ? '#FACC15' : seg.emphasisColor || '#4F46E5',
          bgColor: isDark ? '#1E293B' : '#FFFFFF',
          textColor: isDark ? '#F8FAFC' : '#0F172A',
        },
      });
    });
  } else if (compositionId === '3d-shapes') {
    // Unified 3D Shapes choreography: top 3D pill + per-segment 3D card + optional staircase_3d
    const isDark = isDarkCanvasTheme(nextTheme);
    if (stripItems.length >= 2) {
      newVisuals.push({
        id: 'comp-3d-staircase',
        type: 'shape-3d',
        label: `Bậc thang 3D: ${stripItems.slice(0, 3).map((s) => s.label).join(' / ')}`,
        startTime: 0,
        endTime: project.duration,
        enterAnimation: 'pop-up',
        exitAnimation: 'fade-out',
        layout: { x: 540, y: 1030, width: 820, height: 380, scale: 1, zIndex: 16 },
        props: {
          kind: 'shape-3d',
          shapeType: 'staircase_3d',
          fill: '#F59E0B',
          shadow: true,
          highlight: true,
          depth: 14,
          cornerRadius: 20,
          textColor: '#FFFFFF',
          stepLabels: stripItems.slice(0, 3).map((s) => s.label),
        },
      });
    }

    let lastCard3dEnd = -1;
    segments.forEach((seg, idx) => {
      const safeStart = Math.max(0, seg.startTime, lastCard3dEnd + 0.03);
      const safeEnd = Math.max(safeStart + 0.45, seg.endTime);
      newVisuals.push({
        id: `comp-3d-pill-${idx + 1}`,
        type: 'shape-3d',
        label: `Pill 3D: ${seg.topicLabel}`,
        startTime: Number(safeStart.toFixed(2)),
        endTime: Number(safeEnd.toFixed(2)),
        enterAnimation: 'drop-in',
        exitAnimation: 'fade-out',
        layout: { x: 540, y: 245, width: 520, height: 112, scale: 1, zIndex: 18 },
        props: {
          kind: 'shape-3d',
          shapeType: 'pill_3d',
          fill: isDark ? '#334155' : '#EEF2FF',
          shadow: true,
          highlight: true,
          depth: 8,
          cornerRadius: 56,
          textContent: seg.topicLabel,
          textColor: isDark ? '#FACC15' : '#4338CA',
          textSize: 'body',
          textWeight: 'bold',
        },
      });

      newVisuals.push({
        id: `comp-3d-card-${idx + 1}`,
        type: 'shape-3d',
        label: `Card 3D: ${seg.cardText.slice(0, 22)}`,
        startTime: Number(safeStart.toFixed(2)),
        endTime: Number(safeEnd.toFixed(2)),
        enterAnimation: 'pop-up',
        exitAnimation: idx === segments.length - 1 ? 'fade-out' : 'shrink',
        layout: { x: 540, y: 540, width: 840, height: 240, scale: 1, zIndex: 20 },
        props: {
          kind: 'shape-3d',
          shapeType: 'card_3d',
          fill: seg.badge === 'cross' ? '#DC2626' : idx % 2 === 0 ? '#14B8A6' : '#4F46E5',
          shadow: true,
          highlight: true,
          depth: 12,
          cornerRadius: 28,
          textContent: seg.cardText,
          textColor: '#FFFFFF',
          textSize: 'headline',
          textWeight: 'bold',
        },
      });
      lastCard3dEnd = safeEnd;
    });
  } else {
    // Composition-specific layout architecture & distinct visual styling so presets are unmistakably different
    const profileMap: Record<
      string,
      {
        showStrip: boolean;
        stripY: number;
        pillY: number;
        illY: number;
        cardY: number;
        pillBg?: string;
        pillColor?: string;
        cardBg?: string;
        cardText?: string;
        emphasisColor?: string;
        showToneMeter: boolean;
      }
    > = {
      'story-scenes': {
        showStrip: true,
        stripY: 185,
        pillY: 335,
        illY: 635,
        cardY: 985,
        showToneMeter: true,
      },
      'flow-steps': {
        showStrip: true,
        stripY: 175,
        pillY: 315,
        illY: 575,
        cardY: 945,
        pillBg: '#E0E7FF',
        pillColor: '#3730A3',
        cardBg: '#EEF2FF',
        cardText: '#1E1B4B',
        emphasisColor: '#4F46E5',
        showToneMeter: true,
      },
      'gauge-tone': {
        showStrip: false,
        stripY: 185,
        pillY: 225,
        illY: 570,
        cardY: 965,
        pillBg: '#DCFCE7',
        pillColor: '#065F46',
        cardBg: '#FFFFFF',
        cardText: '#0F172A',
        emphasisColor: '#059669',
        showToneMeter: false,
      },
      'checklist-cards': {
        showStrip: false,
        stripY: 185,
        pillY: 220,
        illY: 585,
        cardY: 995,
        pillBg: '#F3E8FF',
        pillColor: '#6B21A8',
        cardBg: '#0F172A',
        cardText: '#F8FAFC',
        emphasisColor: '#38BDF8',
        showToneMeter: false,
      },
      'dialogue-upgrade': {
        showStrip: false,
        stripY: 185,
        pillY: 225,
        illY: 600,
        cardY: 1005,
        pillBg: '#FEF3C7',
        pillColor: '#92400E',
        cardBg: '#FFFBEB',
        cardText: '#451A03',
        emphasisColor: '#D97706',
        showToneMeter: false,
      },
      'timeline-track': {
        showStrip: true,
        stripY: 180,
        pillY: 325,
        illY: 590,
        cardY: 955,
        pillBg: '#CCFBF1',
        pillColor: '#0F766E',
        cardBg: '#F0FDFA',
        cardText: '#134E4A',
        emphasisColor: '#0D9488',
        showToneMeter: true,
      },
      'spatial-contrast': {
        showStrip: true,
        stripY: 180,
        pillY: 325,
        illY: 595,
        cardY: 975,
        pillBg: '#1E293B',
        pillColor: '#F8FAFC',
        cardBg: '#FEFCE8',
        cardText: '#1C1917',
        emphasisColor: '#CA8A04',
        showToneMeter: false,
      },
      'avatar-dialogue': {
        showStrip: false,
        stripY: 185,
        pillY: 230,
        illY: 595,
        cardY: 985,
        pillBg: '#FFE4E6',
        pillColor: '#BE123C',
        cardBg: '#FFF1F2',
        cardText: '#1F2937',
        emphasisColor: '#E11D48',
        showToneMeter: false,
      },
      'clock-spotlight': {
        showStrip: false,
        stripY: 185,
        pillY: 225,
        illY: 595,
        cardY: 990,
        pillBg: '#FDE68A',
        pillColor: '#78350F',
        cardBg: '#FFFBEB',
        cardText: '#1C1917',
        emphasisColor: '#B45309',
        showToneMeter: false,
      },
      'phrase-icon-split': {
        showStrip: true,
        stripY: 168,
        pillY: 295,
        illY: 600,
        cardY: 980,
        pillBg: '#EEF2FF',
        pillColor: '#4338CA',
        showToneMeter: false,
      },
      'p168-quiz-formula': {
        showStrip: false,
        stripY: 175,
        pillY: 220,
        illY: 590,
        cardY: 1020,
        pillBg: '#FEF3C7',
        pillColor: '#92400E',
        cardBg: '#FFFFFF',
        cardText: '#0F172A',
        emphasisColor: '#D97706',
        showToneMeter: false,
      },
      'p168-grammar-formula': {
        showStrip: true,
        stripY: 175,
        pillY: 315,
        illY: 595,
        cardY: 1015,
        pillBg: '#E0E7FF',
        pillColor: '#3730A3',
        cardBg: '#FFFFFF',
        cardText: '#0F172A',
        emphasisColor: '#4F46E5',
        showToneMeter: false,
      },
      'p168-pronunciation': {
        showStrip: false,
        stripY: 175,
        pillY: 215,
        illY: 585,
        cardY: 1025,
        pillBg: '#E0F2FE',
        pillColor: '#0369A1',
        cardBg: '#FFFFFF',
        cardText: '#0F172A',
        emphasisColor: '#0284C7',
        showToneMeter: false,
      },
      'p168-situations': {
        showStrip: false,
        stripY: 175,
        pillY: 215,
        illY: 585,
        cardY: 1025,
        pillBg: '#DCFCE7',
        pillColor: '#166534',
        cardBg: '#FFFFFF',
        cardText: '#0F172A',
        emphasisColor: '#059669',
        showToneMeter: false,
      },
      'p168-slider-compare': {
        showStrip: true,
        stripY: 172,
        pillY: 310,
        illY: 595,
        cardY: 1020,
        pillBg: '#FCE7F3',
        pillColor: '#9D174D',
        cardBg: '#FFFFFF',
        cardText: '#0F172A',
        emphasisColor: '#DB2777',
        showToneMeter: false,
      },
      'podcast-duo': {
        showStrip: false,
        stripY: 175,
        pillY: 220,
        illY: 575,
        cardY: 1035,
        pillBg: '#312E81',
        pillColor: '#E0E7FF',
        cardBg: '#1E293B',
        cardText: '#F8FAFC',
        emphasisColor: '#FACC15',
        showToneMeter: false,
      },
      'dialogue-stage': {
        showStrip: false,
        stripY: 175,
        pillY: 220,
        illY: 590,
        cardY: 1035,
        pillBg: '#DBEAFE',
        pillColor: '#1E40AF',
        cardBg: '#FFFFFF',
        cardText: '#0F172A',
        emphasisColor: '#2563EB',
        showToneMeter: false,
      },
    };
    const profile = profileMap[compositionId] ?? profileMap['story-scenes'];

    // 1. Optional Top Comparison Strip spanning the lesson
    if (profile.showStrip && stripItems.length >= 2) {
      newVisuals.push({
        id: `comp-strip-${compositionId}`,
        type: 'comparison-strip',
        label: 'Thanh đối chiếu chủ đề',
        startTime: 0,
        endTime: project.duration,
        enterAnimation: 'drop-in',
        exitAnimation: 'fade-out',
        layout: { x: 540, y: profile.stripY, width: 900, scale: 1, zIndex: 10 },
        props: {
          kind: 'comparison-strip',
          items: stripItems,
        },
      });
    }

    // 2. Per-segment synchronized Topic Pill + Rich Illustration/Diagram + Sentence Card
    let lastPillEnd = -1;
    let lastIllEnd = -1;
    let lastCardEnd = -1;

    segments.forEach((seg, idx) => {
      const safeStart = Math.max(0, seg.startTime);
      const safeEnd = Math.max(safeStart + 0.45, seg.endTime);
      const nextSegStart =
        idx < segments.length - 1 ? Math.max(safeEnd, segments[idx + 1].startTime - 0.03) : project.duration;

      const pillStart = Math.max(safeStart, lastPillEnd + 0.03);
      const pillEnd = Math.max(safeEnd, nextSegStart);
      if (pillEnd - pillStart >= 0.35) {
        newVisuals.push({
          id: `comp-pill-${idx + 1}`,
          type: 'topic-pill',
          label: `Nhãn: ${seg.topicLabel}`,
          startTime: Number(pillStart.toFixed(2)),
          endTime: Number(pillEnd.toFixed(2)),
          enterAnimation: 'pop-up',
          exitAnimation: 'fade-out',
          layout: { x: 540, y: profile.pillY, width: 410, scale: 1, zIndex: 12 },
          props: {
            kind: 'topic-pill',
            text: seg.topicLabel,
            bgColor: profile.pillBg ?? seg.topicBg,
            textColor: profile.pillColor ?? seg.topicColor,
          },
        });
        lastPillEnd = pillEnd;
      }

      const builtIllustration = buildIllustrationDataForComposition(
        compositionId,
        stripItems,
        segments,
        idx,
        segments.length,
        project,
      );

      const illStart = idx === 0 ? 0 : Math.max(safeStart, lastIllEnd + 0.03);
      const illEnd = idx === segments.length - 1 ? project.duration : Math.max(safeEnd, nextSegStart);
      if (illEnd - illStart >= 0.35) {
        newVisuals.push({
          id: `comp-ill-${idx + 1}`,
          type: 'illustration-prop',
          label: `Minh họa: ${builtIllustration.variant}`,
          startTime: Number(illStart.toFixed(2)),
          endTime: Number(illEnd.toFixed(2)),
          enterAnimation: 'fade-scale',
          exitAnimation: 'fade-out',
          layout: {
            x: 540,
            y: profile.illY,
            width: 880,
            scale: 1,
            zIndex: 8,
          },
          props: {
            kind: 'illustration-prop',
            variant: builtIllustration.variant,
            data: builtIllustration.data,
          },
        });
        lastIllEnd = illEnd;
      }

      const cardStart = Math.max(safeStart, lastCardEnd + 0.03);
      if (safeEnd - cardStart >= 0.35) {
        newVisuals.push({
          id: `comp-card-${idx + 1}`,
          type: 'sentence-card',
          label: `Thẻ câu: ${seg.cardText.slice(0, 24)}`,
          startTime: Number(cardStart.toFixed(2)),
          endTime: Number(safeEnd.toFixed(2)),
          enterAnimation: 'pop-up',
          exitAnimation: idx === segments.length - 1 ? 'fade-out' : 'shrink',
          layout: { x: 540, y: profile.cardY, width: 830, scale: 1, zIndex: 20 },
          props: {
            kind: 'sentence-card',
            text: seg.cardText,
            subtext: seg.subtext,
            badge: seg.badge,
            stampText: seg.stampText,
            stampColor: seg.stampColor,
            emphasisWord: seg.emphasisWord,
            emphasisColor: profile.emphasisColor ?? seg.emphasisColor,
            bgColor: profile.cardBg,
            textColor: profile.cardText,
          },
        });
        lastCardEnd = safeEnd;
      }
    });

    // 3. Tone meter for compositions that benefit from a continuous bottom sentiment bar
    if (profile.showToneMeter) {
      const toneChrome = getLocalizedStageChrome(
        project.targetLanguage,
        project.learningLanguage,
        `${project.title} ${project.cues[0]?.text || ''}`,
      );
      newVisuals.push({
        id: `comp-meter-${compositionId}`,
        type: 'tone-meter',
        label: `Thanh sắc thái: ${toneChrome.toneLeft} ↔ ${toneChrome.toneRight}`,
        startTime: segments[0]?.startTime ?? 0,
        endTime: project.duration,
        enterAnimation: 'slide-up',
        exitAnimation: 'fade-out',
        layout: { x: 540, y: 1255, width: 700, scale: 1, zIndex: 18 },
        props: {
          kind: 'tone-meter',
          title: toneChrome.toneTitle,
          leftLabel: toneChrome.toneLeft,
          rightLabel: toneChrome.toneRight,
          valueStart: 0.2,
          valueEnd: 0.88,
          animateStart: project.duration * 0.2,
          animateEnd: Math.max(1.2, project.duration * 0.78),
        },
      });
    }
  }

  // Adapt karaoke card theme colors cleanly
  const isDarkTheme = isDarkCanvasTheme(nextTheme);
  const subPos = project.subtitleConfig?.position;
  const posTargetY =
    subPos === 'top' ? 340 : subPos === 'center' ? 960 : undefined;
  const themedKaraoke: SceneElement[] = karaokeEls.map((k) => {
    if (k.props.kind !== 'karaoke-card') return k;
    return {
      ...k,
      layout: posTargetY !== undefined ? { ...k.layout, y: posTargetY } : k.layout,
      props: {
        ...k.props,
        variant: isDarkTheme ? 'dark-bar' : 'white-card',
        activeColor: isDarkTheme ? '#FACC15' : '#2563EB',
        inactiveColor: isDarkTheme ? '#CBD5E1' : '#9CA3AF',
        spokenColor: isDarkTheme ? '#FFFFFF' : '#111827',
      },
    };
  });

  const resolved = resolveProjectOverlaps([...newVisuals, ...themedKaraoke], {
    preserveKaraokeY: Boolean(posTargetY !== undefined),
  });

  return {
    ...project,
    theme: nextTheme,
    compositionId,
    subtitle: `${project.cues.length} câu thoại · Phối kiểu ${meta.shortLabel}`,
    elements: resolved,
  };
}

/**
 * Applies a user-designed component configuration picked & customized from Kho Component
 * onto the entire project (or active segment) with automatic overlap resolution.
 */
export function applyCustomComponentComposition(
  project: LessonProject,
  customConfig: CustomComponentPresetConfig,
  options?: { theme?: CanvasThemeId; activeTimeSec?: number; scope?: 'all' | 'active-cue' },
): LessonProject {
  const catalog = getEffectiveVectorCatalog();
  const matchedMeta = catalog.find((c) => c.variant === customConfig.variant);
  const nextTheme = options?.theme ?? project.theme;
  const segments = buildBeatSegments(project);
  const stripItems = deriveStripItems(project);
  const karaokeEls = project.elements.filter((e) => e.type === 'karaoke-card');
  const accentColor = customConfig.accentColor || '#4F46E5';

  const makeCustomData = (seg: ReturnType<typeof buildBeatSegments>[number]): IllustrationPropData => ({
    title: customConfig.title?.trim() || seg.topicLabel || matchedMeta?.label || 'Key Insight',
    subtitle:
      customConfig.subtitle?.trim() ||
      (seg.subtext ? cleanShortPhrase(seg.subtext, 8, 46) : matchedMeta?.description),
    speechText: customConfig.speechText?.trim() || cleanShortPhrase(seg.cardText, 8, 48),
    labels:
      customConfig.labels && customConfig.labels.length > 0
        ? customConfig.labels
        : stripItems.slice(0, 3).map((s) => s.label),
    highlightWord: customConfig.highlightWord?.trim() || seg.emphasisWord,
    formula: customConfig.formula?.trim() || undefined,
    sceneIcon: customConfig.sceneIcon ?? matchedMeta?.defaultIcon ?? 'sparkles',
    customPrimitives: getCustomComponentByVariant(customConfig.variant)?.primitives,
  });

  if (options?.scope === 'active-cue' && typeof options.activeTimeSec === 'number') {
    const t = options.activeTimeSec;
    const activeSeg =
      segments.find((s) => t >= s.startTime && t <= s.endTime) ?? segments[0];
    const existingIllustrations = project.elements.filter((e) => e.type === 'illustration-prop');
    const targetIll =
      existingIllustrations.find((e) => t >= e.startTime && t <= e.endTime) ??
      existingIllustrations[0];

    let updatedElements: SceneElement[];
    if (targetIll && activeSeg) {
      updatedElements = project.elements.map((el) =>
        el.id === targetIll.id
          ? {
              ...el,
              label: `Tùy biến: ${matchedMeta?.label || customConfig.variant}`,
              props: {
                kind: 'illustration-prop',
                variant: customConfig.variant,
                data: makeCustomData(activeSeg),
              },
            }
          : el,
      );
    } else {
      updatedElements = [
        ...project.elements.filter((e) => e.type !== 'illustration-prop'),
        {
          id: `custom-ill-${Date.now()}`,
          type: 'illustration-prop',
          label: `Tùy biến: ${matchedMeta?.label || customConfig.variant}`,
          startTime: activeSeg?.startTime ?? 0,
          endTime: activeSeg?.endTime ?? project.duration,
          enterAnimation: 'fade-scale',
          exitAnimation: 'fade-out',
          layout: {
            x: 540,
            y: customConfig.illustrationY ?? 635,
            width: 880,
            scale: 1,
            zIndex: 10,
          },
          props: {
            kind: 'illustration-prop',
            variant: customConfig.variant,
            data: activeSeg ? makeCustomData(activeSeg) : makeCustomData(segments[0]),
          },
        },
      ];
    }

    return {
      ...project,
      theme: nextTheme,
      compositionId: 'custom',
      subtitle: `${project.cues.length} câu thoại · Tự sáng tạo (${matchedMeta?.label || customConfig.variant})`,
      elements: resolveProjectOverlaps(updatedElements),
    };
  }

  const newVisuals: SceneElement[] = [];
  if (customConfig.showStrip !== false && stripItems.length >= 2) {
    newVisuals.push({
      id: 'comp-custom-strip',
      type: 'comparison-strip',
      label: 'Thanh đối chiếu tùy biến',
      startTime: 0,
      endTime: project.duration,
      enterAnimation: 'drop-in',
      exitAnimation: 'fade-out',
      layout: { x: 540, y: 185, width: 900, scale: 1, zIndex: 10 },
      props: {
        kind: 'comparison-strip',
        items: stripItems,
      },
    });
  }

  let lastPillEnd = -1;
  let lastIllEnd = -1;
  let lastCardEnd = -1;
  const pillY = customConfig.showStrip !== false && stripItems.length >= 2 ? 330 : 225;
  const illY = customConfig.illustrationY ?? (customConfig.showStrip !== false ? 630 : 585);
  const cardY = customConfig.showToneMeter ? 980 : 1015;

  segments.forEach((seg, idx) => {
    const safeStart = Math.max(0, seg.startTime);
    const safeEnd = Math.max(safeStart + 0.45, seg.endTime);
    const nextSegStart =
      idx < segments.length - 1 ? Math.max(safeEnd, segments[idx + 1].startTime - 0.03) : project.duration;

    const pillStart = Math.max(safeStart, lastPillEnd + 0.03);
    const pillEnd = Math.max(safeEnd, nextSegStart);
    if (pillEnd - pillStart >= 0.35) {
      newVisuals.push({
        id: `comp-custom-pill-${idx + 1}`,
        type: 'topic-pill',
        label: `Nhãn: ${seg.topicLabel}`,
        startTime: Number(pillStart.toFixed(2)),
        endTime: Number(pillEnd.toFixed(2)),
        enterAnimation: 'pop-up',
        exitAnimation: 'fade-out',
        layout: { x: 540, y: pillY, width: 410, scale: 1, zIndex: 12 },
        props: {
          kind: 'topic-pill',
          text: customConfig.title?.trim() && idx === 0 ? customConfig.title.trim() : seg.topicLabel,
          bgColor: `${accentColor}22`,
          textColor: accentColor,
        },
      });
      lastPillEnd = pillEnd;
    }

    const illStart = idx === 0 ? 0 : Math.max(safeStart, lastIllEnd + 0.03);
    const illEnd = idx === segments.length - 1 ? project.duration : Math.max(safeEnd, nextSegStart);
    if (illEnd - illStart >= 0.35) {
      newVisuals.push({
        id: `comp-custom-ill-${idx + 1}`,
        type: 'illustration-prop',
        label: `Kho Component: ${matchedMeta?.label || customConfig.variant}`,
        startTime: Number(illStart.toFixed(2)),
        endTime: Number(illEnd.toFixed(2)),
        enterAnimation: 'fade-scale',
        exitAnimation: 'fade-out',
        layout: { x: 540, y: illY, width: 880, scale: 1, zIndex: 9 },
        props: {
          kind: 'illustration-prop',
          variant: customConfig.variant,
          data: makeCustomData(seg),
        },
      });
      lastIllEnd = illEnd;
    }

    const cardStart = Math.max(safeStart, lastCardEnd + 0.03);
    if (customConfig.showSentenceCard !== false && safeEnd - cardStart >= 0.35) {
      newVisuals.push({
        id: `comp-custom-card-${idx + 1}`,
        type: 'sentence-card',
        label: `Thẻ câu: ${seg.cardText.slice(0, 24)}`,
        startTime: Number(cardStart.toFixed(2)),
        endTime: Number(safeEnd.toFixed(2)),
        enterAnimation: 'pop-up',
        exitAnimation: idx === segments.length - 1 ? 'fade-out' : 'shrink',
        layout: { x: 540, y: cardY, width: 830, scale: 1, zIndex: 20 },
        props: {
          kind: 'sentence-card',
          text: seg.cardText,
          subtext: seg.subtext,
          badge: seg.badge,
          stampText: seg.stampText,
          stampColor: seg.stampColor,
          emphasisWord: customConfig.highlightWord?.trim() || seg.emphasisWord,
          emphasisColor: accentColor,
          bgColor: customConfig.cardBgColor || '#FFFFFF',
          textColor: customConfig.cardTextColor || '#0F172A',
        },
      });
      lastCardEnd = safeEnd;
    }
  });

  if (customConfig.showToneMeter) {
    newVisuals.push({
      id: 'comp-custom-meter',
      type: 'tone-meter',
      label: 'Thanh sắc thái',
      startTime: segments[0]?.startTime ?? 0,
      endTime: project.duration,
      enterAnimation: 'slide-up',
      exitAnimation: 'fade-out',
      layout: { x: 540, y: 1255, width: 700, scale: 1, zIndex: 18 },
      props: {
        kind: 'tone-meter',
        title: 'TONE',
        leftLabel: 'basic',
        rightLabel: 'pro',
        valueStart: 0.25,
        valueEnd: 0.9,
        animateStart: project.duration * 0.2,
        animateEnd: Math.max(1.2, project.duration * 0.78),
      },
    });
  }

  return {
    ...project,
    theme: nextTheme,
    compositionId: 'custom',
    subtitle: `${project.cues.length} câu thoại · Tự sáng tạo (${matchedMeta?.label || customConfig.variant})`,
    elements: resolveProjectOverlaps([...newVisuals, ...karaokeEls]),
  };
}

export function pickRandomComposition(
  currentCompositionId?: LayoutCompositionId,
  currentTheme?: CanvasThemeId,
  rng: () => number = Math.random,
  options?: {
    transcriptText?: string;
    allowDarkThemes?: boolean;
  },
): { compositionId: LayoutCompositionId; theme: CanvasThemeId } {
  const eligible = getEligibleCompositionsForContext(options?.transcriptText);
  const candidates = eligible.filter((c) => c.id !== currentCompositionId);
  const pool = candidates.length > 0 ? candidates : eligible;
  const chosen = pool[Math.floor(rng() * pool.length) % pool.length] ?? LAYOUT_COMPOSITIONS[0];

  const themePoolBase = options?.allowDarkThemes ? ALL_CLEAN_THEMES : LIGHT_TIKTOK_THEMES;
  const themePool = themePoolBase.filter((t) => t !== currentTheme);
  const fallbackPool = themePool.length > 0 ? themePool : themePoolBase;
  const chosenTheme =
    rng() > 0.35
      ? chosen.recommendedTheme
      : fallbackPool[Math.floor(rng() * fallbackPool.length) % fallbackPool.length] ??
        chosen.recommendedTheme;

  return {
    compositionId: chosen.id,
    theme: chosenTheme,
  };
}

export function applyCompositionToProject(
  project: LessonProject,
  selected: LayoutCompositionId | 'ai-decide',
  options?: { theme?: CanvasThemeId },
): LessonProject {
  if (selected !== 'ai-decide') {
    return recomposeProjectWithStyle(project, selected, options);
  }
  if (isLayoutCompositionId(project.compositionId)) {
    return recomposeProjectWithStyle(project, project.compositionId, options);
  }
  const transcript = project.cues.map((c) => c.text).join(' ');
  return recomposeProjectWithStyle(project, pickCompositionFromContext(transcript), options);
}
