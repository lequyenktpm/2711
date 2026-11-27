import { drawPresetBackground, getBackgroundPresetMeta } from './backgroundPresets';
import { drawLoadedImageCover, getCachedBgImage, getCachedBgVideo } from './canvasRenderer';
import { tokenizeTextForAlignment } from './forcedAligner';
import { parseTranscriptAuto } from './transcriptParser';
import {
  BackgroundImageConfig,
  TranscriptCue,
  WatermarkCorner,
  WatermarkOutroConfig,
  WordTiming,
} from './types';

export type EduWatermarkCorner = WatermarkCorner;
export type EduKaraokePosition = 'Dưới' | 'Giữa' | 'Trên';
export type EduKaraokeSize = 'Nhỏ' | 'Vừa' | 'Lớn';

export type EduWatermarkOutroConfig = WatermarkOutroConfig;

export interface KaraokeEffectSpec {
  id: string;
  description: string;
  mode: 'karaoke' | 'typewriter';
  activeColor: string;
  inactiveColor: string;
  outlineColor: string;
  border: number;
  shadow: number;
  blur: number;
  bold: number;
  box: boolean;
  pop: boolean;
}

export const KARAOKE_EFFECT_PRESETS: KaraokeEffectSpec[] = [
  {
    id: 'Classic Karaoke – tô màu từng từ',
    description: 'Chữ trắng, từ đang đọc chuyển tím theo tiến độ; viền tối rõ trên mọi nền.',
    mode: 'karaoke',
    activeColor: '#A78BFA',
    inactiveColor: '#FFFFFF',
    outlineColor: '#172033',
    border: 2.4,
    shadow: 1.2,
    blur: 0,
    bold: -1,
    box: false,
    pop: false,
  },
  {
    id: 'Neon Glow – phát sáng',
    description: 'Từ đang đọc chuyển xanh cyan, có viền và phát sáng nhẹ; hợp video tech/hiện đại.',
    mode: 'karaoke',
    activeColor: '#67E8F9',
    inactiveColor: '#F8FAFC',
    outlineColor: '#155E75',
    border: 3.2,
    shadow: 0.5,
    blur: 1.1,
    bold: -1,
    box: false,
    pop: false,
  },
  {
    id: 'Pop Bounce – bật nảy',
    description: 'Cả dòng bật nảy nhẹ khi xuất hiện; từ đang đọc chuyển vàng cam đậm nét.',
    mode: 'karaoke',
    activeColor: '#FBBF24',
    inactiveColor: '#FFFFFF',
    outlineColor: '#292014',
    border: 3.0,
    shadow: 1.0,
    blur: 0,
    bold: -1,
    box: false,
    pop: true,
  },
  {
    id: 'Soft Caption Card – thẻ nền mờ',
    description: 'Phụ đề nằm trên thẻ nền xanh đen bán trong suốt, bo kiểu caption cổ điển.',
    mode: 'karaoke',
    activeColor: '#C4B5FD',
    inactiveColor: '#FFFFFF',
    outlineColor: '#263449',
    border: 10.0,
    shadow: 0,
    blur: 0,
    bold: 0,
    box: true,
    pop: false,
  },
  {
    id: 'Minimal Outline – tối giản',
    description: 'Không thẻ nền; chữ trắng viền đen mảnh, từ đang đọc chuyển xanh lá nhẹ.',
    mode: 'karaoke',
    activeColor: '#86EFAC',
    inactiveColor: '#FFFFFF',
    outlineColor: '#000000',
    border: 1.5,
    shadow: 0.8,
    blur: 0,
    bold: 0,
    box: false,
    pop: false,
  },
  {
    id: 'Typewriter – hiện lần lượt',
    description: 'Câu hiện dần theo từng từ; từ mới xuất hiện được tô màu nhấn cho video từ vựng.',
    mode: 'typewriter',
    activeColor: '#FBBF24',
    inactiveColor: '#FFFFFF',
    outlineColor: '#172033',
    border: 2.2,
    shadow: 1.0,
    blur: 0,
    bold: -1,
    box: false,
    pop: false,
  },
];

function hexToAssBgr(hex: string, alpha = 0): string {
  const clean = hex.replace('#', '').trim();
  const a = Math.max(0, Math.min(255, Math.round(alpha)))
    .toString(16)
    .toUpperCase()
    .padStart(2, '0');
  if (clean.length === 6) {
    const r = clean.slice(0, 2);
    const g = clean.slice(2, 4);
    const b = clean.slice(4, 6);
    return `&H${a}${b}${g}${r}`.toUpperCase();
  }
  return `&H${a}FFFFFF`;
}

function toAssTime(sec: number): string {
  const cs = Math.max(0, Math.round(sec * 100));
  const hh = Math.floor(cs / 360000);
  const mm = Math.floor((cs % 360000) / 6000);
  const ss = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

function escAssText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\{/g, '(').replace(/\}/g, ')');
}

export function buildEduKaraokeAss(
  rawInput: string,
  options: {
    effectId?: string;
    activeColorOverride?: string;
    position?: EduKaraokePosition;
    size?: EduKaraokeSize;
    width?: number;
    height?: number;
  } = {},
): string {
  const spec =
    KARAOKE_EFFECT_PRESETS.find((e) => e.id === options.effectId) ?? KARAOKE_EFFECT_PRESETS[0];
  const width = options.width ?? 1080;
  const height = options.height ?? 1920;
  const position: EduKaraokePosition = options.position ?? 'Dưới';
  const size: EduKaraokeSize = options.size ?? 'Vừa';

  const sizeFactor = size === 'Nhỏ' ? 0.035 : size === 'Lớn' ? 0.056 : 0.045;
  const fontSize = Math.max(24, Math.min(92, Math.round(height * sizeFactor)));
  const align = position === 'Giữa' ? 5 : position === 'Trên' ? 8 : 2;
  const marginV = Math.max(36, Math.round(height * (position === 'Giữa' ? 0.0 : 0.065)));

  const activeBgr = hexToAssBgr(options.activeColorOverride || spec.activeColor);
  const inactiveBgr = hexToAssBgr(spec.inactiveColor);
  const outlineBgr = hexToAssBgr(spec.outlineColor);
  const backBgr = hexToAssBgr('#101827', 78);
  const borderStyle = spec.box ? 3 : 1;

  const parsedCues = parseTranscriptAuto(rawInput);
  const cues: TranscriptCue[] =
    parsedCues.length > 0
      ? parsedCues
      : rawInput
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .map((text, idx) => ({
            id: `k-${idx + 1}`,
            start: idx * 3.5,
            end: (idx + 1) * 3.5,
            text,
            words: [],
          }));

  const lines = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: TV.709',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Karaoke,Noto Sans,${fontSize},${activeBgr},${inactiveBgr},${outlineBgr},${backBgr},${spec.bold},0,0,0,100,100,0,0,${borderStyle},${spec.border.toFixed(1)},${spec.shadow.toFixed(1)},${align},${Math.round(width * 0.055)},${Math.round(width * 0.055)},${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  for (const cue of cues) {
    const tokens = cue.text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    if (tokens.length === 0) continue;
    const totalCs = Math.max(tokens.length * 4, Math.round((cue.end - cue.start) * 100));
    const weights = tokens.map((t) => Math.max(1, t.length));
    const weightSum = weights.reduce((a, b) => a + b, 0);
    const allocated: number[] = [];
    let remaining = totalCs;
    for (let i = 0; i < tokens.length; i++) {
      if (i === tokens.length - 1) {
        allocated.push(Math.max(2, remaining));
      } else {
        const cs = Math.max(2, Math.min(remaining - (tokens.length - i - 1) * 2, Math.round((totalCs * weights[i]) / weightSum)));
        allocated.push(cs);
        remaining -= cs;
      }
    }

    if (spec.mode === 'typewriter') {
      let cursor = cue.start;
      const prefix: string[] = [];
      for (let i = 0; i < tokens.length; i++) {
        const tokenStart = cursor;
        cursor += allocated[i] / 100;
        prefix.push(tokens[i]);
        const eventEnd = i === tokens.length - 1 ? cue.end : Math.min(cue.end, cursor + 0.005);
        const visible = prefix.map((tok, j) =>
          j === prefix.length - 1
            ? `{\\1c${activeBgr}}${escAssText(tok)}{\\1c${inactiveBgr}}`
            : escAssText(tok),
        );
        const popTag =
          spec.pop && i === 0 ? '\\t(0,120,\\fscx112\\fscy112)\\t(120,240,\\fscx100\\fscy100)' : '';
        lines.push(
          `Dialogue: 0,${toAssTime(tokenStart)},${toAssTime(eventEnd)},Karaoke,,0,0,0,,{\\an${align}\\q2\\fad(60,70)${popTag}}${visible.join(' ')}`,
        );
      }
    } else {
      const kBody = tokens
        .map((w, idx) => `{\\kf${allocated[idx]}}${escAssText(w)}`)
        .join(' ');
      const blurTag = spec.blur > 0 ? `\\blur${spec.blur.toFixed(1)}` : '';
      const popTag = spec.pop ? '\\t(0,120,\\fscx112\\fscy112)\\t(120,240,\\fscx100\\fscy100)' : '';
      lines.push(
        `Dialogue: 0,${toAssTime(cue.start)},${toAssTime(cue.end)},Karaoke,,0,0,0,,{\\an${align}\\q2${blurTag}${popTag}}${kBody}`,
      );
    }
  }

  return lines.join('\n') + '\n';
}

export type ReadingBookPaletteId =
  | 'Sunny Yellow'
  | 'Sky Blue'
  | 'Mint Green'
  | 'Warm Cream'
  | 'Lavender'
  | 'Sakura Blossom'
  | 'Matcha Kyoto'
  | 'Midnight Ink'
  | 'Sunset Coral'
  | 'Ocean Breeze'
  | 'Vintage Kraft'
  | 'Nordic Slate'
  | 'Ocean Wave'
  | 'Coastal Sand'
  | 'Deep Forest'
  | 'Rose Quartz'
  | 'Amber Dusk'
  | 'Indigo Night';

export interface ReadingBookPalette {
  id: ReadingBookPaletteId;
  bgTop: string;
  bgBottom: string;
  pageBg: string;
  pageBorder: string;
  spineColor: string;
  headerBg: string;
  headerText: string;
  bodyText: string;
  highlightBg: string;
  highlightText: string;
  spokenText: string;
  accent: string;
  isDark?: boolean;
}

export const READING_BOOK_PALETTES: ReadingBookPalette[] = [
  {
    id: 'Sunny Yellow',
    bgTop: '#FEF3C7',
    bgBottom: '#FDE68A',
    pageBg: '#FFFDF7',
    pageBorder: '#F59E0B',
    spineColor: '#D97706',
    headerBg: '#FEF08A',
    headerText: '#92400E',
    bodyText: '#1E293B',
    highlightBg: '#F59E0B',
    highlightText: '#FFFFFF',
    spokenText: '#334155',
    accent: '#D97706',
  },
  {
    id: 'Sky Blue',
    bgTop: '#E0F2FE',
    bgBottom: '#BAE6FD',
    pageBg: '#F8FDFF',
    pageBorder: '#38BDF8',
    spineColor: '#0284C7',
    headerBg: '#BAE6FD',
    headerText: '#075985',
    bodyText: '#0F172A',
    highlightBg: '#0284C7',
    highlightText: '#FFFFFF',
    spokenText: '#334155',
    accent: '#0284C7',
  },
  {
    id: 'Mint Green',
    bgTop: '#DCFCE7',
    bgBottom: '#BBF7D0',
    pageBg: '#F7FEF9',
    pageBorder: '#34D399',
    spineColor: '#059669',
    headerBg: '#BBF7D0',
    headerText: '#065F46',
    bodyText: '#0F172A',
    highlightBg: '#059669',
    highlightText: '#FFFFFF',
    spokenText: '#334155',
    accent: '#059669',
  },
  {
    id: 'Warm Cream',
    bgTop: '#F5EFE6',
    bgBottom: '#E8DFCA',
    pageBg: '#FFFBF2',
    pageBorder: '#D4A373',
    spineColor: '#9C6644',
    headerBg: '#FAEDCD',
    headerText: '#6F4E37',
    bodyText: '#2B2118',
    highlightBg: '#BC6C25',
    highlightText: '#FFFFFF',
    spokenText: '#5C4738',
    accent: '#BC6C25',
  },
  {
    id: 'Lavender',
    bgTop: '#F3E8FF',
    bgBottom: '#E9D5FF',
    pageBg: '#FDFBFF',
    pageBorder: '#A78BFA',
    spineColor: '#7C3AED',
    headerBg: '#E9D5FF',
    headerText: '#5B21B6',
    bodyText: '#1E1B4B',
    highlightBg: '#7C3AED',
    highlightText: '#FFFFFF',
    spokenText: '#4338CA',
    accent: '#7C3AED',
  },
  {
    id: 'Sakura Blossom',
    bgTop: '#FFE4E6',
    bgBottom: '#FECDD3',
    pageBg: '#FFF9FA',
    pageBorder: '#FB7185',
    spineColor: '#E11D48',
    headerBg: '#FFE4E6',
    headerText: '#9F1239',
    bodyText: '#1E293B',
    highlightBg: '#E11D48',
    highlightText: '#FFFFFF',
    spokenText: '#64748B',
    accent: '#E11D48',
  },
  {
    id: 'Matcha Kyoto',
    bgTop: '#ECFCCB',
    bgBottom: '#D9F99D',
    pageBg: '#FCFDF7',
    pageBorder: '#84CC16',
    spineColor: '#4D7C0F',
    headerBg: '#ECFCCB',
    headerText: '#365314',
    bodyText: '#1A2E05',
    highlightBg: '#4D7C0F',
    highlightText: '#FFFFFF',
    spokenText: '#4B5563',
    accent: '#4D7C0F',
  },
  {
    id: 'Midnight Ink',
    bgTop: '#0F172A',
    bgBottom: '#1E293B',
    pageBg: '#111827',
    pageBorder: '#334155',
    spineColor: '#020617',
    headerBg: '#1E293B',
    headerText: '#F8FAFC',
    bodyText: '#E2E8F0',
    highlightBg: '#F59E0B',
    highlightText: '#0F172A',
    spokenText: '#94A3B8',
    accent: '#F59E0B',
    isDark: true,
  },
  {
    id: 'Sunset Coral',
    bgTop: '#FFEDD5',
    bgBottom: '#FED7AA',
    pageBg: '#FFFAF5',
    pageBorder: '#FB923C',
    spineColor: '#C2410C',
    headerBg: '#FFEDD5',
    headerText: '#9A3412',
    bodyText: '#27272A',
    highlightBg: '#EA580C',
    highlightText: '#FFFFFF',
    spokenText: '#52525B',
    accent: '#EA580C',
  },
  {
    id: 'Ocean Breeze',
    bgTop: '#CCFBF1',
    bgBottom: '#99F6E4',
    pageBg: '#F6FEFD',
    pageBorder: '#2DD4BF',
    spineColor: '#0F766E',
    headerBg: '#CCFBF1',
    headerText: '#115E59',
    bodyText: '#0F172A',
    highlightBg: '#0F766E',
    highlightText: '#FFFFFF',
    spokenText: '#475569',
    accent: '#0F766E',
  },
  {
    id: 'Vintage Kraft',
    bgTop: '#E7D8C9',
    bgBottom: '#D6C1AC',
    pageBg: '#F9F2E7',
    pageBorder: '#A47551',
    spineColor: '#6F4E37',
    headerBg: '#EFE3D3',
    headerText: '#4A3222',
    bodyText: '#2B1E16',
    highlightBg: '#B45309',
    highlightText: '#FFFFFF',
    spokenText: '#6B5344',
    accent: '#B45309',
  },
  {
    id: 'Nordic Slate',
    bgTop: '#E2E8F0',
    bgBottom: '#CBD5E1',
    pageBg: '#FFFFFF',
    pageBorder: '#94A3B8',
    spineColor: '#334155',
    headerBg: '#EEF2FF',
    headerText: '#312E81',
    bodyText: '#0F172A',
    highlightBg: '#4338CA',
    highlightText: '#FFFFFF',
    spokenText: '#475569',
    accent: '#4338CA',
  },
  {
    id: 'Ocean Wave',
    bgTop: '#CFE8EC',
    bgBottom: '#8EC5CE',
    pageBg: '#F4FBFD',
    pageBorder: '#2A9D8F',
    spineColor: '#0F5E63',
    headerBg: '#D1F0F4',
    headerText: '#0D4A52',
    bodyText: '#0F2933',
    highlightBg: '#0D9488',
    highlightText: '#FFFFFF',
    spokenText: '#3B636E',
    accent: '#0E7490',
  },
  {
    id: 'Coastal Sand',
    bgTop: '#F3ECE1',
    bgBottom: '#DFD2BD',
    pageBg: '#FCF9F3',
    pageBorder: '#C8B08F',
    spineColor: '#7C6246',
    headerBg: '#EDE2D0',
    headerText: '#4F3B26',
    bodyText: '#292118',
    highlightBg: '#0F766E',
    highlightText: '#FFFFFF',
    spokenText: '#6B5C4B',
    accent: '#0F766E',
  },
  {
    id: 'Deep Forest',
    bgTop: '#0B1F19',
    bgBottom: '#12352B',
    pageBg: '#0F2620',
    pageBorder: '#2C6E58',
    spineColor: '#061510',
    headerBg: '#173E34',
    headerText: '#D1FAE5',
    bodyText: '#ECFDF5',
    highlightBg: '#34D399',
    highlightText: '#06281E',
    spokenText: '#94B8AB',
    accent: '#34D399',
    isDark: true,
  },
  {
    id: 'Rose Quartz',
    bgTop: '#FCE7F3',
    bgBottom: '#F5D0FE',
    pageBg: '#FFF9FC',
    pageBorder: '#F472B6',
    spineColor: '#BE185D',
    headerBg: '#FBCFE8',
    headerText: '#831843',
    bodyText: '#2E1032',
    highlightBg: '#DB2777',
    highlightText: '#FFFFFF',
    spokenText: '#6B4263',
    accent: '#DB2777',
  },
  {
    id: 'Amber Dusk',
    bgTop: '#1C1410',
    bgBottom: '#2F1F16',
    pageBg: '#1F1712',
    pageBorder: '#92400E',
    spineColor: '#0F0A08',
    headerBg: '#3B2314',
    headerText: '#FDE68A',
    bodyText: '#FEF3C7',
    highlightBg: '#F59E0B',
    highlightText: '#1C1410',
    spokenText: '#B89B7A',
    accent: '#FBBF24',
    isDark: true,
  },
  {
    id: 'Indigo Night',
    bgTop: '#090D24',
    bgBottom: '#161F4A',
    pageBg: '#0F1535',
    pageBorder: '#3B488B',
    spineColor: '#050817',
    headerBg: '#1B2559',
    headerText: '#E0E7FF',
    bodyText: '#F1F5F9',
    highlightBg: '#38BDF8',
    highlightText: '#082F49',
    spokenText: '#94A3C8',
    accent: '#38BDF8',
    isDark: true,
  },
];

export type ReadingIllustrationStyle = 'Flat 2D' | '2.5D' | '3D Cartoon';

export type ReadingBookFrameId =
  | 'plain'
  | 'plain-glass'
  | 'plain-kinetic'
  | 'plain-editorial'
  | 'plain-ocean-float'
  | 'plain-subtitle-bar'
  | 'plain-serif-poem'
  | 'classic-page'
  | 'open-spread'
  | 'spiral-notebook'
  | 'textbook-card'
  | 'chalkboard'
  | 'washi-scroll'
  | 'ipad-reader'
  | 'editorial-mag'
  | 'vintage-journal'
  | 'linen-minimal'
  | 'study-flashcard';

export interface ReadingBookFrameMeta {
  id: ReadingBookFrameId;
  label: string;
  description: string;
}

export const READING_BOOK_FRAMES: ReadingBookFrameMeta[] = [
  { id: 'plain', label: 'Plain — Chỉ Chữ & Nền (Tối giản)', description: 'Không khung sách — chỉ hình/video nền có opacity dịu mắt và chữ nổi ở giữa' },
  { id: 'plain-glass', label: 'Plain Kính Mờ (Frosted Glass)', description: 'Không khung sách — hộp kính mờ sang trọng nổi bật trên nền ảnh/video' },
  { id: 'plain-kinetic', label: 'Plain Chữ Lớn Kinetic (Tập trung)', description: 'Chữ to đậm tối giản kèm highlight viên thuốc và thanh tiến độ đọc' },
  { id: 'plain-editorial', label: 'Plain Trích Dẫn Báo Chí (Editorial)', description: 'Thanh gạch dọc nhấn bên trái tinh tế, hợp đọc truyện & podcast' },
  { id: 'plain-ocean-float', label: 'Plain Nổi Gợn Sóng (Chill Nature)', description: 'Chữ sáng nổi bật có viền bóng mềm + huy hiệu thanh mảnh cực hợp nền sóng biển & thiên nhiên' },
  { id: 'plain-subtitle-bar', label: 'Plain Dải Điện Ảnh (Cinema Bar)', description: 'Dải nền mờ mượt toàn chiều ngang kiểu phụ đề phim tài liệu cực dễ đọc' },
  { id: 'plain-serif-poem', label: 'Plain Tản Văn & Thơ (Serif Calm)', description: 'Font chữ Serif thanh lịch kèm đường kẻ mảnh đối xứng trên dưới nhẹ nhàng' },
  { id: 'classic-page', label: 'Trang Sách Cổ Điển', description: 'Khung trang sách bo tròn có gáy nổi truyền thống' },
  { id: 'open-spread', label: 'Sách Mở Hai Trang', description: 'Mở trang đôi kèm dải ruy-băng đánh dấu trang' },
  { id: 'spiral-notebook', label: 'Sổ Lò Xo Dòng Kẻ', description: 'Gáy xoắn lò xo phía trên kèm dòng kẻ vở học tập' },
  { id: 'textbook-card', label: 'Giáo Trình Hiện Đại', description: 'Header dải màu toàn phần phong cách Oxford/Cambridge' },
  { id: 'chalkboard', label: 'Bảng Phấn Lớp Học', description: 'Bảng đen viền gỗ với chữ phấn trắng nổi bật' },
  { id: 'washi-scroll', label: 'Giấy Washi Á Đông (Nhật / Trung)', description: 'Khung giấy Washi viền kép kèm dấu triện đỏ cổ phong' },
  { id: 'ipad-reader', label: 'Máy Đọc Sách Tablet (e-Reader)', description: 'Khung màn hình Tablet viền đen tối giản, cực rõ trên mọi tỉ lệ' },
  { id: 'editorial-mag', label: 'Tạp Chí Biên Tập (Editorial Mag)', description: 'Tiêu đề tạp chí hiện đại kết hợp dải chân trang tinh gọn' },
  { id: 'vintage-journal', label: 'Sổ Tay Bìa Da Cổ Điển (Journal)', description: 'Khung bìa da khâu chỉ kèm góc đồng tinh tế cho bài kể chuyện' },
  { id: 'linen-minimal', label: 'Sách Vải Linen Tối Giản (Nordic)', description: 'Khung lề rộng kiểu sách nghệ thuật tối giản dịu mắt' },
  { id: 'study-flashcard', label: 'Thẻ Học Hiện Đại (Study Card)', description: 'Khung thẻ học bo tròn thanh mảnh kèm thanh tiến độ trang' },
];

export type ReadingPointerStyleId =
  | 'none'
  | 'hand-classic'
  | 'magic-wand'
  | 'highlighter'
  | 'laser-dot'
  | 'bouncing-arrow'
  | 'fountain-pen'
  | 'underline-only'
  | 'calligraphy-brush'
  | 'glow-orb'
  | 'bracket-focus'
  | 'feather-quill'
  | 'ribbon-wave'
  | 'stylus-pen'
  | 'sparkle-star'
  | 'leaf-pointer'
  | 'chalk-stick'
  | 'music-note'
  | 'water-drop'
  | 'dot-halo';

export interface ReadingPointerStyleMeta {
  id: ReadingPointerStyleId;
  label: string;
  description: string;
}

export const READING_POINTER_STYLES: ReadingPointerStyleMeta[] = [
  { id: 'none', label: 'Không có con trỏ — Chỉ bôi sáng chữ', description: 'Ẩn hoàn toàn con trỏ, chỉ tô sáng nổi bật từ đang đọc' },
  { id: 'hand-classic', label: 'Ngón Tay Chỉ Chữ', description: 'Bàn tay hoạt hình di chuyển mượt theo từng từ' },
  { id: 'magic-wand', label: 'Đũa Phép Ngôi Sao', description: 'Đũa sao phát sáng lướt nhẹ dưới từ đang đọc' },
  { id: 'highlighter', label: 'Bút Dạ Quang', description: 'Ngòi bút highlight kèm vệt sáng đánh dấu từ' },
  { id: 'laser-dot', label: 'Tia Laser Đỏ', description: 'Chấm laser kèm vầng hào quang sắc nét' },
  { id: 'bouncing-arrow', label: 'Mũi Tên Nhún Nhảy', description: 'Mũi tên chỉ lên nhịp nhàng theo tốc độ đọc' },
  { id: 'fountain-pen', label: 'Bút Máy Cổ Điển', description: 'Ngòi bút máy nghiêng theo nhịp từng chữ' },
  { id: 'underline-only', label: 'Gạch Chân Tối Giản', description: 'Thanh gạch chân động mượt mà, không che chữ' },
  { id: 'calligraphy-brush', label: 'Bút Lông Thư Pháp (Trung / Nhật / Hàn)', description: 'Cọ thư pháp tre lướt nhẹ dưới chữ, rất hợp bài đọc Á Đông' },
  { id: 'glow-orb', label: 'Quả Cầu Phát Sáng Aurora', description: 'Vòng ánh sáng phát quang mềm mại trôi theo từng từ' },
  { id: 'bracket-focus', label: 'Khung Ngắm Focus [ ]', description: 'Cặp ngoặc góc tối giản ôm gọn từ đang đọc, không che dòng dưới' },
  { id: 'feather-quill', label: 'Bút Lông Vũ Cổ Điển', description: 'Lông vũ trắng viền vàng chấm nhẹ theo nhịp phát âm' },
  { id: 'ribbon-wave', label: 'Dải Sóng Neon Mềm', description: 'Đường sóng sáng mềm mại kèm điểm sáng trượt theo âm tiết' },
  { id: 'stylus-pen', label: 'Bút Cảm Ứng Stylus Mảnh', description: 'Bút trắng mảnh kiểu Apple Pencil chỉ chính xác từng âm tiết' },
  { id: 'sparkle-star', label: 'Ngôi Sao Lấp Lánh (Sparkle)', description: 'Cụm sao sáng 4 cánh nhấp nháy nhẹ dưới từ đang đọc' },
  { id: 'leaf-pointer', label: 'Chiếc Lá Thiên Nhiên', description: 'Lá xanh tươi nhỏ nhắn lướt nhẹ hợp nền rừng suối & chill' },
  { id: 'chalk-stick', label: 'Viên Phấn Trắng', description: 'Đầu phấn trắng nghiêng nhẹ — cực hợp khung Bảng Phấn' },
  { id: 'music-note', label: 'Nốt Nhạc Nhịp Điệu (♪)', description: 'Nốt nhạc nhảy nhẹ theo nhịp đọc & nhạc nền thư giãn' },
  { id: 'water-drop', label: 'Giọt Nước Biển Ngọc', description: 'Giọt nước xanh trong suốt lướt êm — cực hợp nền sóng biển' },
  { id: 'dot-halo', label: 'Chấm Vòng Sáng Tối Giản', description: 'Chấm tròn nhỏ kèm vòng gợn sóng thanh lịch dưới từ' },
];

export interface ReadingAlongRenderOptions {
  width: number;
  height: number;
  title: string;
  topicBadge?: string;
  text: string;
  words: WordTiming[];
  currentTime: number;
  totalDuration: number;
  contentDuration?: number;
  introEnabled?: boolean;
  introSeconds?: number;
  introTitle?: string;
  introSubtitle?: string;
  paletteId: ReadingBookPalette['id'];
  illustrationStyle: ReadingIllustrationStyle;
  bookFrame?: ReadingBookFrameId;
  pointerStyle?: ReadingPointerStyleId;
  background?: BackgroundImageConfig;
  subtitlePosition?: EduKaraokePosition;
  subtitleSize?: EduKaraokeSize;
  learningLanguage?: string;
  watermarkOutro: EduWatermarkOutroConfig;
  pointerScale?: number;
  pointerOffsetX?: number;
  pointerOffsetY?: number;
}

export type ReadingAlongHitZone =
  | 'outro'
  | 'watermark'
  | 'intro'
  | 'badge'
  | 'title'
  | 'pointer'
  | 'body';

interface ReadingHitRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ReadingHitRegions {
  outro?: ReadingHitRect;
  watermark?: ReadingHitRect;
  intro?: ReadingHitRect;
  badge?: ReadingHitRect;
  title?: ReadingHitRect;
  pointer?: ReadingHitRect;
  body?: ReadingHitRect;
}

const readingHitRegionMap = new WeakMap<CanvasRenderingContext2D, ReadingHitRegions>();

function pointInReadingRect(x: number, y: number, r?: ReadingHitRect): boolean {
  if (!r) return false;
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function hitTestReadingAlongZone(
  opts: ReadingAlongRenderOptions,
  canvasX: number,
  canvasY: number,
  ctx?: CanvasRenderingContext2D | null,
): ReadingAlongHitZone {
  const wm = opts.watermarkOutro;
  const outroText = [wm.outroLine1.trim(), wm.outroLine2.trim()].filter(Boolean).join('\n');
  const timeline = computeReadingTimelineMetrics({
    words: opts.words,
    totalDuration: opts.totalDuration,
    contentDuration: opts.contentDuration,
    introEnabled: opts.introEnabled,
    introSeconds: opts.introSeconds,
    outroSeconds: wm.outroSeconds,
    outroText,
  });

  if (timeline.hasOutro && outroText && opts.currentTime >= timeline.outroStart) {
    return 'outro';
  }

  const regions = ctx ? readingHitRegionMap.get(ctx) : undefined;
  if (regions) {
    if (pointInReadingRect(canvasX, canvasY, regions.outro)) return 'outro';
    if (pointInReadingRect(canvasX, canvasY, regions.watermark)) return 'watermark';
    if (pointInReadingRect(canvasX, canvasY, regions.pointer)) return 'pointer';
    if (pointInReadingRect(canvasX, canvasY, regions.intro)) return 'intro';
    if (pointInReadingRect(canvasX, canvasY, regions.badge)) return 'badge';
    if (pointInReadingRect(canvasX, canvasY, regions.title)) return 'title';
    if (pointInReadingRect(canvasX, canvasY, regions.body)) return 'body';
  }

  const { width, height } = opts;
  if (wm.watermarkEnabled && wm.watermarkText.trim()) {
    const pad = Math.round(width * 0.032);
    const hitW = Math.max(120, Math.round(width * 0.34));
    const hitH = Math.max(42, Math.round(height * 0.075));
    const inX =
      wm.watermarkCorner === 'top-left' || wm.watermarkCorner === 'bottom-left'
        ? canvasX <= pad + hitW
        : canvasX >= width - pad - hitW;
    const inY =
      wm.watermarkCorner === 'top-left' || wm.watermarkCorner === 'top-right'
        ? canvasY <= pad + hitH
        : canvasY >= height - pad - hitH;
    if (inX && inY) return 'watermark';
  }

  const inIntroPhase = timeline.hasIntro && opts.currentTime < timeline.introEnd;
  if (inIntroPhase) return 'intro';

  const isLandscape = width > height;
  const refH = isLandscape ? Math.round(height * 1.28) : height;
  const bookY = height * (isLandscape ? 0.065 : 0.085);
  const bookH = height * (isLandscape ? 0.86 : 0.81);
  const pillY = bookY + bookH * (opts.bookFrame === 'spiral-notebook' ? 0.068 : 0.048);
  const pillH = Math.max(24, refH * 0.03);
  const titleY = pillY + pillH + refH * 0.022;
  const dividerY = titleY + refH * 0.044;

  if (canvasY <= pillY + pillH + 10) return 'badge';
  if (canvasY <= dividerY + 8) return 'title';
  return 'body';
}

export interface ReadingUiStrings {
  langCode: 'en' | 'ja' | 'zh' | 'ko' | 'fr' | 'es';
  introBadge: string;
  introDefaultTitle: string;
  introPreparingLabel: string;
  introSubtitleTemplate: (title: string) => string;
  pageIndicator: (current: number, total: number) => string;
  outroLine1: string;
  outroLine2: string;
}

const READING_UI_STRINGS_MAP: Record<ReadingUiStrings['langCode'], ReadingUiStrings> = {
  en: {
    langCode: 'en',
    introBadge: 'TODAY’S READING GOAL',
    introDefaultTitle: 'Reading Practice',
    introPreparingLabel: 'Get ready to read...',
    introSubtitleTemplate: (title: string) =>
      `Today we are going to read "${title}". Listen carefully and follow word by word!`,
    pageIndicator: (current: number, total: number) => `Page ${current}/${total}`,
    outroLine1: 'Thanks for watching!',
    outroLine2: 'See you next time',
  },
  ja: {
    langCode: 'ja',
    introBadge: '今日のリーディング目標',
    introDefaultTitle: '日本語リーディング',
    introPreparingLabel: 'まもなく読み始めます...',
    introSubtitleTemplate: (title: string) =>
      `今日のリーディング：${title}。音声を聞きながら一緒に読んでみましょう。`,
    pageIndicator: (current: number, total: number) => `ページ ${current}/${total}`,
    outroLine1: 'ご視聴ありがとうございました！',
    outroLine2: 'また次回お会いしましょう',
  },
  zh: {
    langCode: 'zh',
    introBadge: '今日跟读目标',
    introDefaultTitle: '中文跟读练习',
    introPreparingLabel: '准备开始跟读...',
    introSubtitleTemplate: (title: string) =>
      `今天的跟读练习：${title}。请跟着声音一起读。`,
    pageIndicator: (current: number, total: number) => `第 ${current}/${total} 页`,
    outroLine1: '感谢观看！',
    outroLine2: '下期再见',
  },
  ko: {
    langCode: 'ko',
    introBadge: '오늘의 읽기 목표',
    introDefaultTitle: '한국어 읽기 연습',
    introPreparingLabel: '곧 읽기를 시작합니다...',
    introSubtitleTemplate: (title: string) =>
      `오늘의 읽기 연습: ${title}. 소리를 들으며 따라 읽어 보세요.`,
    pageIndicator: (current: number, total: number) => `${current}/${total} 페이지`,
    outroLine1: '시청해 주셔서 감사합니다!',
    outroLine2: '다음 시간에 또 만나요',
  },
  fr: {
    langCode: 'fr',
    introBadge: 'OBJECTIF DE LECTURE',
    introDefaultTitle: 'Lecture du jour',
    introPreparingLabel: 'Préparation de la lecture...',
    introSubtitleTemplate: (title: string) =>
      `Lecture du jour : ${title}. Écoutez et suivez chaque mot.`,
    pageIndicator: (current: number, total: number) => `Page ${current}/${total}`,
    outroLine1: 'Merci d’avoir regardé !',
    outroLine2: 'À la prochaine fois',
  },
  es: {
    langCode: 'es',
    introBadge: 'META DE LECTURA',
    introDefaultTitle: 'Lectura de hoy',
    introPreparingLabel: 'Preparando la lectura...',
    introSubtitleTemplate: (title: string) =>
      `Lectura de hoy: ${title}. Escucha con atención y sigue cada palabra.`,
    pageIndicator: (current: number, total: number) => `Página ${current}/${total}`,
    outroLine1: '¡Gracias por ver!',
    outroLine2: 'Hasta la próxima',
  },
};

export function getReadingUiStrings(lang?: string): ReadingUiStrings {
  const norm = (lang || 'en').toLowerCase().trim();
  if (norm.startsWith('ja') || norm === 'jp') return READING_UI_STRINGS_MAP.ja;
  if (norm.startsWith('zh') || norm === 'cn') return READING_UI_STRINGS_MAP.zh;
  if (norm.startsWith('ko') || norm === 'kr') return READING_UI_STRINGS_MAP.ko;
  if (norm.startsWith('fr')) return READING_UI_STRINGS_MAP.fr;
  if (norm.startsWith('es')) return READING_UI_STRINGS_MAP.es;
  return READING_UI_STRINGS_MAP.en;
}

export function isDefaultReadingOutroPair(line1?: string, line2?: string): boolean {
  const l1 = (line1 || '').trim();
  const l2 = (line2 || '').trim();
  if (!l1 && !l2) return true;
  return Object.values(READING_UI_STRINGS_MAP).some(
    (s) => s.outroLine1 === l1 && s.outroLine2 === l2,
  );
}

function wrapTextForCanvas(
  text: string,
  maxWidth: number,
  measureWidth: (s: string) => number,
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const hasCjkOrNoSpaces =
    /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(trimmed) || !trimmed.includes(' ');
  const tokens = hasCjkOrNoSpaces
    ? Array.from(trimmed)
    : trimmed.split(/\s+/).filter(Boolean);
  const joiner = hasCjkOrNoSpaces ? '' : ' ';
  const lines: string[] = [];
  let cur = '';
  for (const tok of tokens) {
    const candidate = cur ? `${cur}${joiner}${tok}` : tok;
    if (measureWidth(candidate) <= maxWidth) {
      cur = candidate;
    } else {
      if (cur) lines.push(cur);
      cur = tok;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export interface ReadingTimelineMetrics {
  introEnd: number;
  hasIntro: boolean;
  lastWordEnd: number;
  contentEnd: number;
  outroStart: number;
  effectiveTotalDuration: number;
  hasOutro: boolean;
}

/**
 * Guarantees Outro never overlaps active words by placing outroStart strictly
 * after both contentDuration and the last spoken word's end timestamp,
 * and accounts for optional spoken Intro window before words start.
 */
export function computeReadingTimelineMetrics(params: {
  words: WordTiming[];
  totalDuration?: number;
  contentDuration?: number;
  introEnabled?: boolean;
  introSeconds?: number;
  outroSeconds: number;
  outroText?: string;
}): ReadingTimelineMetrics {
  const introSec =
    params.introEnabled !== false && Number(params.introSeconds) > 0
      ? Number(params.introSeconds)
      : 0;
  const lastWordEnd = params.words.reduce((mx, w) => Math.max(mx, Number(w.end) || 0), 0);
  const contentEnd = Math.max(introSec + 1, Number(params.contentDuration) || 0, lastWordEnd);
  const outroSec = Math.max(0, Number(params.outroSeconds) || 0);
  const hasOutroText = params.outroText === undefined ? true : params.outroText.trim().length > 0;
  const hasOutro = outroSec > 0 && hasOutroText;
  const baseTotal = Math.max(Number(params.totalDuration) || 0, contentEnd);
  const outroStart = hasOutro
    ? Math.max(contentEnd, baseTotal - outroSec)
    : baseTotal;
  const effectiveTotalDuration = hasOutro
    ? Math.max(baseTotal, outroStart + outroSec)
    : baseTotal;
  return {
    introEnd: Number(introSec.toFixed(3)),
    hasIntro: introSec > 0.15,
    lastWordEnd: Number(lastWordEnd.toFixed(3)),
    contentEnd: Number(contentEnd.toFixed(3)),
    outroStart: Number(outroStart.toFixed(3)),
    effectiveTotalDuration: Number(effectiveTotalDuration.toFixed(3)),
    hasOutro,
  };
}

export interface PaginatedPositionedWord {
  item: WordTiming;
  x: number;
  y: number;
  w: number;
  index: number;
  pageIndex: number;
}

const RE_CJK_BOUNDARY = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;

function isCompactCjkGap(prevWord: string, nextWord: string): boolean {
  if (!prevWord || !nextWord) return false;
  const lastChar = prevWord.slice(-1);
  const firstChar = nextWord.slice(0, 1);
  return RE_CJK_BOUNDARY.test(lastChar) && RE_CJK_BOUNDARY.test(firstChar);
}

export function paginateReadingWords(
  wordsList: WordTiming[],
  measureWidth: (word: string) => number,
  bounds: {
    startX: number;
    maxW: number;
    startY: number;
    maxY: number;
    lineHeight: number;
    wordGap: number;
    getWordGap?: (prevWord: string, nextWord: string) => number;
  },
): PaginatedPositionedWord[][] {
  const pages: PaginatedPositionedWord[][] = [[]];
  let curPageIdx = 0;
  let curX = bounds.startX;
  let curY = bounds.startY;

  for (let i = 0; i < wordsList.length; i++) {
    const item = wordsList[i];
    const w = measureWidth(item.word);
    if (curX + w > bounds.startX + bounds.maxW && curX > bounds.startX) {
      curX = bounds.startX;
      curY += bounds.lineHeight;
    }
    if (curY > bounds.maxY && pages[curPageIdx].length > 0) {
      curPageIdx += 1;
      pages.push([]);
      curX = bounds.startX;
      curY = bounds.startY;
    }
    pages[curPageIdx].push({
      item,
      x: curX,
      y: curY,
      w,
      index: i,
      pageIndex: curPageIdx,
    });
    const nextItem = wordsList[i + 1];
    const gap = nextItem
      ? bounds.getWordGap
        ? bounds.getWordGap(item.word, nextItem.word)
        : isCompactCjkGap(item.word, nextItem.word)
          ? Math.max(2, Math.round(bounds.wordGap * 0.25))
          : bounds.wordGap
      : bounds.wordGap;
    curX += w + gap;
  }
  return pages;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

export function buildEstimatedReadingWords(
  text: string,
  totalDuration = 12,
  lang?: string,
): WordTiming[] {
  const tokens = tokenizeTextForAlignment(text, lang);
  if (tokens.length === 0) return [];
  const weights = tokens.map((t) =>
    Math.max(
      2,
      t.replace(/[^a-zA-Z0-9\u00C0-\u024F\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/g, '').length +
        (/[,.!?。！？]$/.test(t) ? 2.5 : 0),
    ),
  );
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const safeDur = Math.max(tokens.length * 0.22, totalDuration);
  let cursor = 0.15;
  const usable = Math.max(0.5, safeDur - 0.3);
  return tokens.map((word, idx) => {
    const dur = (weights[idx] / totalWeight) * usable;
    const start = Number(cursor.toFixed(3));
    const end = Number((cursor + dur).toFixed(3));
    cursor += dur;
    return { word, start, end };
  });
}

function drawReadingPointer(
  ctx: CanvasRenderingContext2D,
  style: ReadingPointerStyleId,
  x: number,
  y: number,
  wordW: number,
  fontSize: number,
  palette: ReadingBookPalette,
  scale: number,
  timeSec: number,
  isDarkSurface: boolean,
) {
  if (style === 'none') {
    return;
  }

  const bob = Math.sin(timeSec * 7.5) * 2.2;
  ctx.save();

  switch (style) {
    case 'underline-only': {
      const barY = y - 2;
      ctx.fillStyle = isDarkSurface ? '#FACC15' : palette.highlightBg;
      roundRectPath(ctx, x - wordW / 2 - 4, barY, wordW + 8, Math.max(4, Math.round(fontSize * 0.14)), 4);
      ctx.fill();
      ctx.restore();
      return;
    }

    case 'bracket-focus': {
      const padX = Math.max(8, wordW * 0.5 + 8);
      const topY = y - fontSize - 10;
      const botY = y - 2;
      const arm = Math.max(8, Math.round(fontSize * 0.32));
      ctx.strokeStyle = isDarkSurface ? '#FACC15' : palette.accent;
      ctx.lineWidth = Math.max(3, Math.round(3.5 * scale));
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Left bracket
      ctx.beginPath();
      ctx.moveTo(x - padX + arm, topY);
      ctx.lineTo(x - padX, topY);
      ctx.lineTo(x - padX, botY);
      ctx.lineTo(x - padX + arm, botY);
      ctx.stroke();
      // Right bracket
      ctx.beginPath();
      ctx.moveTo(x + padX - arm, topY);
      ctx.lineTo(x + padX, topY);
      ctx.lineTo(x + padX, botY);
      ctx.lineTo(x + padX - arm, botY);
      ctx.stroke();
      ctx.restore();
      return;
    }

    case 'ribbon-wave': {
      const barW = Math.max(wordW + 14, 34);
      const startX = x - barW / 2;
      const baseY = y + 2;
      const waveGrad = ctx.createLinearGradient(startX, baseY, startX + barW, baseY);
      waveGrad.addColorStop(0, '#38BDF8');
      waveGrad.addColorStop(0.5, isDarkSurface ? '#FACC15' : palette.accent);
      waveGrad.addColorStop(1, '#F472B6');
      ctx.strokeStyle = waveGrad;
      ctx.lineWidth = Math.max(4, 4.5 * scale);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const px = startX + t * barW;
        const py = baseY + Math.sin(t * Math.PI * 3 + timeSec * 8) * 3;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(x, baseY + Math.sin(Math.PI * 1.5 + timeSec * 8) * 3, Math.max(3.5, 4 * scale), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    case 'glow-orb': {
      const orbX = x;
      const orbY = y + 8 + bob * 0.5;
      const r = Math.max(9, 13 * scale);
      const aura = ctx.createRadialGradient(orbX, orbY, 2, orbX, orbY, r * 2.4);
      aura.addColorStop(0, 'rgba(56, 189, 248, 0.95)');
      aura.addColorStop(0.5, 'rgba(167, 139, 250, 0.45)');
      aura.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(orbX, orbY, r * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(orbX, orbY, r * 1.35, r * 0.48, Math.sin(timeSec * 3) * 0.25, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(orbX, orbY, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    case 'calligraphy-brush': {
      ctx.translate(x + 4, y + 6 + bob * 0.45);
      ctx.scale(scale, scale);
      ctx.rotate(-0.32);
      ctx.shadowColor = 'rgba(15, 23, 42, 0.28)';
      ctx.shadowBlur = 8;
      // Ink tip
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.quadraticCurveTo(8, 7, 5, 16);
      ctx.lineTo(-5, 16);
      ctx.quadraticCurveTo(-8, 7, 0, -5);
      ctx.closePath();
      ctx.fill();
      // White collar
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(-6, 15, 12, 6);
      // Bamboo handle
      ctx.fillStyle = '#B45309';
      roundRectPath(ctx, -5.5, 21, 11, 42, 4);
      ctx.fill();
      ctx.fillStyle = '#92400E';
      ctx.fillRect(-5.5, 34, 11, 2.5);
      ctx.fillRect(-5.5, 48, 11, 2.5);
      ctx.restore();
      return;
    }

    case 'feather-quill': {
      ctx.translate(x + 4, y + 4 + bob * 0.45);
      ctx.scale(scale, scale);
      ctx.rotate(-0.38);
      ctx.shadowColor = 'rgba(15, 23, 42, 0.24)';
      ctx.shadowBlur = 8;
      // Feather vane
      ctx.fillStyle = '#FEF3C7';
      ctx.strokeStyle = '#D97706';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -3);
      ctx.quadraticCurveTo(16, 14, 10, 48);
      ctx.lineTo(0, 56);
      ctx.lineTo(-7, 46);
      ctx.quadraticCurveTo(-11, 16, 0, -3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Quill shaft
      ctx.strokeStyle = '#B45309';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, -3);
      ctx.lineTo(2, 58);
      ctx.stroke();
      ctx.restore();
      return;
    }

    case 'laser-dot': {
      const dotX = x;
      const dotY = y + 4 + bob * 0.4;
      const r = Math.max(7, 10 * scale);
      const glow = ctx.createRadialGradient(dotX, dotY, 1, dotX, dotY, r * 2.6);
      glow.addColorStop(0, 'rgba(239, 68, 68, 0.95)');
      glow.addColorStop(0.45, 'rgba(239, 68, 68, 0.35)');
      glow.addColorStop(1, 'rgba(239, 68, 68, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(dotX, dotY, r * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(dotX, dotY, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    case 'bouncing-arrow': {
      const arrY = y + 2 + Math.abs(bob) * 1.4;
      ctx.translate(x, arrY);
      ctx.scale(scale, scale);
      ctx.shadowColor = 'rgba(15, 23, 42, 0.25)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = isDarkSurface ? '#38BDF8' : palette.accent;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.lineTo(18, 22);
      ctx.lineTo(7, 22);
      ctx.lineTo(7, 46);
      ctx.lineTo(-7, 46);
      ctx.lineTo(-7, 22);
      ctx.lineTo(-18, 22);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }

    case 'highlighter': {
      ctx.translate(x + 6, y + 6 + bob * 0.5);
      ctx.scale(scale, scale);
      ctx.rotate(-0.42);
      ctx.shadowColor = 'rgba(15, 23, 42, 0.24)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      // Glowing marker tip
      ctx.fillStyle = '#FACC15';
      ctx.beginPath();
      ctx.moveTo(-8, -2);
      ctx.lineTo(8, -2);
      ctx.lineTo(5, 12);
      ctx.lineTo(-5, 12);
      ctx.closePath();
      ctx.fill();
      // Marker body
      ctx.fillStyle = '#FEF08A';
      ctx.strokeStyle = '#CA8A04';
      ctx.lineWidth = 2.5;
      roundRectPath(ctx, -11, 10, 22, 46, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = palette.accent;
      roundRectPath(ctx, -11, 38, 22, 18, 4);
      ctx.fill();
      ctx.restore();
      return;
    }

    case 'magic-wand': {
      ctx.translate(x, y + 8 + bob * 0.6);
      ctx.scale(scale, scale);
      ctx.shadowColor = 'rgba(250, 204, 21, 0.55)';
      ctx.shadowBlur = 12;
      // Wand stick angled down-right
      ctx.strokeStyle = '#7C3AED';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(2, 6);
      ctx.lineTo(26, 52);
      ctx.stroke();
      ctx.strokeStyle = '#DDD6FE';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(5, 12);
      ctx.lineTo(24, 48);
      ctx.stroke();
      // 5-point Star tip
      ctx.fillStyle = '#FACC15';
      ctx.strokeStyle = '#D97706';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 15 : 6.5;
        const a = -Math.PI / 2 + (i * Math.PI) / 5 + Math.sin(timeSec * 3) * 0.08;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }

    case 'fountain-pen': {
      ctx.translate(x + 4, y + 6 + bob * 0.4);
      ctx.scale(scale, scale);
      ctx.rotate(-0.35);
      ctx.shadowColor = 'rgba(15, 23, 42, 0.25)';
      ctx.shadowBlur = 8;
      // Gold nib
      ctx.fillStyle = '#F59E0B';
      ctx.strokeStyle = '#78350F';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.lineTo(9, 14);
      ctx.lineTo(-9, 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Pen barrel
      ctx.fillStyle = '#1E293B';
      roundRectPath(ctx, -8, 13, 16, 48, 5);
      ctx.fill();
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(-8, 15, 16, 4);
      ctx.restore();
      return;
    }

    case 'stylus-pen': {
      ctx.translate(x + 3, y + 6 + bob * 0.35);
      ctx.scale(scale, scale);
      ctx.rotate(-0.36);
      ctx.shadowColor = 'rgba(15, 23, 42, 0.28)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(5, 8);
      ctx.lineTo(-5, 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#F8FAFC';
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 1.5;
      roundRectPath(ctx, -5.5, 8, 11, 46, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(-5.5, 13, 11, 3);
      ctx.restore();
      return;
    }

    case 'sparkle-star': {
      const sx = x;
      const sy = y + 8 + bob * 0.5;
      const r = Math.max(10, 14 * scale);
      const draw4Star = (cx: number, cy: number, rad: number, color: string) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const d = i % 2 === 0 ? rad : rad * 0.28;
          const a = (i * Math.PI) / 4;
          const px = cx + Math.cos(a) * d;
          const py = cy + Math.sin(a) * d;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      };
      ctx.shadowColor = 'rgba(250, 204, 21, 0.6)';
      ctx.shadowBlur = 10;
      draw4Star(sx, sy, r, '#FACC15');
      draw4Star(sx + r * 0.9, sy + r * 0.55, r * 0.52, '#FDE68A');
      ctx.restore();
      return;
    }

    case 'leaf-pointer': {
      ctx.translate(x + 2, y + 6 + bob * 0.5);
      ctx.scale(scale, scale);
      ctx.rotate(-0.35 + Math.sin(timeSec * 2.5) * 0.08);
      ctx.shadowColor = 'rgba(6, 78, 59, 0.32)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#22C55E';
      ctx.strokeStyle = '#14532D';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.quadraticCurveTo(18, 12, 6, 36);
      ctx.quadraticCurveTo(-14, 24, 0, -4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#DCFCE7';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(4, 18, 5, 38);
      ctx.stroke();
      ctx.restore();
      return;
    }

    case 'chalk-stick': {
      ctx.translate(x + 5, y + 6 + bob * 0.4);
      ctx.scale(scale, scale);
      ctx.rotate(-0.42);
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#F8FAFC';
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1.5;
      roundRectPath(ctx, -6, 0, 12, 42, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#BAE6FD';
      ctx.fillRect(-6, 18, 12, 10);
      ctx.restore();
      return;
    }

    case 'music-note': {
      ctx.translate(x, y + 10 + bob * 0.7);
      ctx.scale(scale, scale);
      ctx.shadowColor = 'rgba(15, 23, 42, 0.3)';
      ctx.shadowBlur = 8;
      const noteColor = isDarkSurface ? '#38BDF8' : palette.accent;
      ctx.fillStyle = noteColor;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(-6, 16, 8, 6, -0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(1, 14);
      ctx.lineTo(1, -4);
      ctx.quadraticCurveTo(14, 0, 15, 10);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = noteColor;
      ctx.stroke();
      ctx.restore();
      return;
    }

    case 'water-drop': {
      ctx.translate(x, y + 6 + bob * 0.55);
      ctx.scale(scale, scale);
      ctx.shadowColor = 'rgba(14, 116, 144, 0.38)';
      ctx.shadowBlur = 10;
      const dropGrad = ctx.createLinearGradient(0, -4, 0, 28);
      dropGrad.addColorStop(0, '#67E8F9');
      dropGrad.addColorStop(1, '#0891B2');
      ctx.fillStyle = dropGrad;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.bezierCurveTo(13, 12, 13, 27, 0, 28);
      ctx.bezierCurveTo(-13, 27, -13, 12, 0, -4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.beginPath();
      ctx.ellipse(-4, 15, 2.2, 4.5, 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    case 'dot-halo': {
      const dx = x;
      const dy = y + 6 + bob * 0.25;
      const pulse = 1 + 0.22 * Math.sin(timeSec * 4.5);
      const r = Math.max(5, 7 * scale);
      const dotColor = isDarkSurface ? '#FACC15' : palette.accent;
      ctx.strokeStyle = isDarkSurface ? 'rgba(250, 204, 21, 0.45)' : 'rgba(14, 116, 144, 0.38)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(dx, dy, r * 1.9 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(dx, dy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    case 'hand-classic':
    default: {
      ctx.translate(x, y + 4 + bob * 0.6);
      ctx.scale(scale, scale);
      ctx.shadowColor = 'rgba(15, 23, 42, 0.25)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = '#FDBA74';
      ctx.strokeStyle = '#7C2D12';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-6, 4);
      ctx.lineTo(-6, 22);
      ctx.quadraticCurveTo(-18, 22, -18, 34);
      ctx.lineTo(-18, 48);
      ctx.quadraticCurveTo(-18, 62, 0, 62);
      ctx.quadraticCurveTo(22, 62, 22, 46);
      ctx.lineTo(22, 30);
      ctx.quadraticCurveTo(22, 20, 12, 20);
      ctx.lineTo(12, 4);
      ctx.quadraticCurveTo(12, -4, 3, -4);
      ctx.quadraticCurveTo(-6, -4, -6, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = palette.accent;
      roundRectPath(ctx, -14, 58, 32, 16, 6);
      ctx.fill();
      ctx.restore();
      return;
    }
  }
}

export function renderReadingAlongFrame(
  ctx: CanvasRenderingContext2D,
  opts: ReadingAlongRenderOptions,
): void {
  const { width, height } = opts;
  const hitRegions: ReadingHitRegions = {};
  readingHitRegionMap.set(ctx, hitRegions);
  const pointerScaleFactor = Math.max(0.4, Math.min(2.4, opts.pointerScale ?? 1));
  const pointerOffsetX = Math.max(-240, Math.min(240, opts.pointerOffsetX ?? 0));
  const pointerOffsetY = Math.max(-240, Math.min(240, opts.pointerOffsetY ?? 0));
  const isLandscape = width > height;
  const refH = isLandscape ? Math.round(height * 1.28) : height;
  const palette =
    READING_BOOK_PALETTES.find((p) => p.id === opts.paletteId) ?? READING_BOOK_PALETTES[0];
  const uiStrings = getReadingUiStrings(opts.learningLanguage);
  const bookFrame: ReadingBookFrameId = opts.bookFrame ?? 'classic-page';
  const pointerStyle: ReadingPointerStyleId = opts.pointerStyle ?? 'hand-classic';
  const isChalkboard = bookFrame === 'chalkboard';
  const isDarkPage = isChalkboard || Boolean(palette.isDark);
  const isPlainFrame =
    bookFrame === 'plain' ||
    bookFrame === 'plain-glass' ||
    bookFrame === 'plain-kinetic' ||
    bookFrame === 'plain-editorial' ||
    bookFrame === 'plain-ocean-float' ||
    bookFrame === 'plain-subtitle-bar' ||
    bookFrame === 'plain-serif-poem';

  // Background gradient fallback
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  if (isChalkboard || isPlainFrame) {
    grad.addColorStop(0, palette.isDark ? palette.bgTop : '#1E293B');
    grad.addColorStop(1, palette.isDark ? palette.bgBottom : '#0F172A');
  } else {
    grad.addColorStop(0, palette.bgTop);
    grad.addColorStop(1, palette.bgBottom);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  const wm = opts.watermarkOutro;
  const outroText = [wm.outroLine1.trim(), wm.outroLine2.trim()].filter(Boolean).join('\n');
  const timeline = computeReadingTimelineMetrics({
    words: opts.words,
    totalDuration: opts.totalDuration,
    contentDuration: opts.contentDuration,
    introEnabled: opts.introEnabled,
    introSeconds: opts.introSeconds,
    outroSeconds: wm.outroSeconds,
    outroText,
  });
  const inIntroPhase = timeline.hasIntro && opts.currentTime < timeline.introEnd;
  const isLearningFocus = !inIntroPhase && (!timeline.hasOutro || opts.currentTime < timeline.outroStart);

  // Optional preset / video / image background with focus opacity scrim
  const bg = opts.background;
  let hasCustomBg = false;
  if (bg) {
    if ((bg.kind === 'preset' || (!bg.kind && bg.presetId && !bg.dataUrl && !bg.videoUrl)) && bg.presetId) {
      const presetMeta = getBackgroundPresetMeta(bg.presetId);
      const presetImg = presetMeta?.assetUrl ? getCachedBgImage(presetMeta.assetUrl) : null;
      if (presetImg) {
        const gentleZoom = 1 + 0.022 * (1 - Math.cos(Math.max(0, opts.currentTime) * 0.2));
        ctx.save();
        drawLoadedImageCover(
          ctx,
          presetImg,
          presetImg.naturalWidth || width,
          presetImg.naturalHeight || height,
          width,
          height,
          bg.fit || 'cover',
          gentleZoom,
        );
        ctx.restore();
        drawPresetBackground(ctx, bg.presetId, width, height, opts.currentTime, { overlayOnly: true });
      } else {
        drawPresetBackground(ctx, bg.presetId, width, height, opts.currentTime);
      }
      hasCustomBg = true;
    } else if (bg.kind === 'video' && bg.videoUrl) {
      const vid = getCachedBgVideo(bg.videoUrl);
      if (vid && vid.videoWidth > 0) {
        if (vid.readyState >= 2 && Number.isFinite(vid.duration) && vid.duration > 0.05) {
          const wrapped = ((Math.max(0, opts.currentTime) % vid.duration) + vid.duration) % vid.duration;
          if (Math.abs(vid.currentTime - wrapped) > 0.08 && !vid.seeking) {
            try {
              vid.currentTime = wrapped;
            } catch {
              // ignore
            }
          }
        }
        ctx.save();
        drawLoadedImageCover(ctx, vid, vid.videoWidth, vid.videoHeight, width, height, bg.fit || 'cover');
        ctx.restore();
        hasCustomBg = true;
      }
    } else if (bg.dataUrl) {
      const img = getCachedBgImage(bg.dataUrl);
      if (img) {
        ctx.save();
        drawLoadedImageCover(
          ctx,
          img,
          img.naturalWidth || width,
          img.naturalHeight || height,
          width,
          height,
          bg.fit || 'cover',
        );
        ctx.restore();
        hasCustomBg = true;
      }
    }
    if (hasCustomBg) {
      const baseScrim = bg.scrimOpacity ?? 0.22;
      const focusScrim = bg.learningScrimOpacity ?? Math.min(0.85, Math.max(baseScrim, baseScrim + 0.22));
      const effectiveScrim = Math.max(0, Math.min(0.92, isLearningFocus ? focusScrim : baseScrim));
      if (effectiveScrim > 0.01) {
        ctx.save();
        ctx.fillStyle = `rgba(10, 15, 28, ${effectiveScrim})`;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }
    }
  }

  if (isPlainFrame) {
    if (inIntroPhase) {
      ctx.save();
      const introProgress = Math.max(0, Math.min(1, opts.currentTime / Math.max(0.25, timeline.introEnd)));
      const introFade = Math.min(1, opts.currentTime / 0.35 + 0.15);
      ctx.globalAlpha = introFade;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(2, 6, 23, 0.85)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 4;

      const plainKicker = (opts.introTitle || uiStrings.introBadge).trim();
      const plainKickerFs = Math.max(13, Math.round(Math.min(width, height) * 0.02));
      ctx.font = `800 ${plainKickerFs}px "Plus Jakarta Sans", sans-serif`;
      const plainKickerW = Math.min(width * 0.78, ctx.measureText(plainKicker).width + 30);
      const plainKickerH = Math.max(28, Math.round(plainKickerFs * 1.8));
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.fillStyle = palette.accent;
      roundRectPath(ctx, width / 2 - plainKickerW / 2, height * 0.31 - plainKickerH / 2, plainKickerW, plainKickerH, plainKickerH / 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(plainKicker, width / 2, height * 0.31, plainKickerW - 18);
      ctx.restore();

      const heroFs = Math.max(28, Math.round(Math.min(width, height) * 0.05));
      ctx.font = `800 ${heroFs}px "Outfit", "Plus Jakarta Sans", sans-serif`;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(opts.title || uiStrings.introDefaultTitle, width / 2, height * 0.43, width * 0.84);

      const introSub = (
        opts.introSubtitle || uiStrings.introSubtitleTemplate(opts.title || uiStrings.introDefaultTitle)
      ).trim();
      const subFs = Math.max(18, Math.round(heroFs * 0.52));
      ctx.font = `600 ${subFs}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillStyle = 'rgba(226, 232, 240, 0.94)';
      const plainSubLines = wrapTextForCanvas(introSub, width * 0.8, (s) => ctx.measureText(s).width).slice(0, 2);
      const subLineStep = Math.round(subFs * 1.38);
      plainSubLines.forEach((ln, idx) => {
        ctx.fillText(ln, width / 2, height * 0.525 + idx * subLineStep, width * 0.82);
      });

      const barW = Math.min(width * 0.44, 360);
      const barH = 8;
      const barTop = height * 0.65;
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      roundRectPath(ctx, width / 2 - barW / 2, barTop, barW, barH, 4);
      ctx.fill();
      ctx.fillStyle = '#FACC15';
      roundRectPath(ctx, width / 2 - barW / 2, barTop, Math.max(12, barW * introProgress), barH, 4);
      ctx.fill();

      ctx.font = `700 ${Math.max(13, Math.round(subFs * 0.72))}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillStyle = 'rgba(253, 230, 138, 0.92)';
      ctx.fillText(uiStrings.introPreparingLabel, width / 2, barTop + 26, width * 0.75);
      hitRegions.intro = { x: 0, y: 0, w: width, h: height };
      ctx.restore();
    } else {
      const bodyDuration = Math.max(1, timeline.contentEnd - timeline.introEnd);
      const wordsList =
        opts.words.length > 0
          ? opts.words
          : buildEstimatedReadingWords(opts.text, bodyDuration).map((w) => ({
              ...w,
              start: Number((w.start + timeline.introEnd).toFixed(3)),
              end: Number((w.end + timeline.introEnd).toFixed(3)),
            }));
      const subPos = opts.subtitlePosition ?? 'Giữa';
      const subSize = opts.subtitleSize ?? 'Lớn';
      const sizeScale = subSize === 'Nhỏ' ? 0.78 : subSize === 'Lớn' ? 1.24 : 1.0;
      const baseFs = isLandscape ? Math.round(height * 0.052) : Math.round(width * 0.048);
      const kineticScale = bookFrame === 'plain-kinetic' ? 1.12 : 1.0;
      const fontSize = Math.max(24, Math.min(86, Math.round(baseFs * sizeScale * kineticScale)));
      const lineHeight = Math.round(fontSize * 1.48);
      const wordGap = Math.round(fontSize * 0.34);
      const maxLineW = Math.round(
        width *
          (bookFrame === 'plain-glass' ||
          bookFrame === 'plain-editorial' ||
          bookFrame === 'plain-serif-poem'
            ? 0.78
            : 0.84),
      );
      const fontFamily =
        bookFrame === 'plain-editorial' || bookFrame === 'plain-serif-poem'
          ? `"Georgia", "Noto Serif", "Plus Jakarta Sans", serif`
          : `"Outfit", "Plus Jakarta Sans", sans-serif`;
      ctx.font = `700 ${fontSize}px ${fontFamily}`;

      // Wrap all words into centered lines with CJK-aware compact gaps
      const wrappedLines: Array<{
        words: Array<{ item: WordTiming; index: number; w: number; gapAfter: number }>;
        totalW: number;
      }> = [];
      let curWords: Array<{ item: WordTiming; index: number; w: number; gapAfter: number }> = [];
      let curW = 0;
      wordsList.forEach((item, index) => {
        const w = ctx.measureText(item.word).width;
        const prevItem = curWords.length > 0 ? curWords[curWords.length - 1].item : null;
        const prevGap = prevItem
          ? isCompactCjkGap(prevItem.word, item.word)
            ? Math.max(2, Math.round(wordGap * 0.22))
            : wordGap
          : 0;
        const nextW = curWords.length === 0 ? w : curW + prevGap + w;
        if (nextW > maxLineW && curWords.length > 0) {
          wrappedLines.push({ words: curWords, totalW: curW });
          curWords = [{ item, index, w, gapAfter: 0 }];
          curW = w;
        } else {
          if (curWords.length > 0) curWords[curWords.length - 1].gapAfter = prevGap;
          curWords.push({ item, index, w, gapAfter: 0 });
          curW = nextW;
        }
      });
      if (curWords.length > 0) {
        wrappedLines.push({ words: curWords, totalW: curW });
      }

      const clampedWordTime = Math.max(
        timeline.introEnd,
        Math.min(opts.currentTime, Math.max(timeline.introEnd, timeline.contentEnd - 0.001)),
      );
      let globalActiveIdx = wordsList.findIndex(
        (w) => clampedWordTime >= w.start && clampedWordTime <= w.end,
      );
      if (globalActiveIdx === -1 && wordsList.length > 0) {
        for (let i = wordsList.length - 1; i >= 0; i--) {
          if (clampedWordTime >= wordsList[i].start) {
            globalActiveIdx = i;
            break;
          }
        }
        if (globalActiveIdx === -1) globalActiveIdx = 0;
      }

      const linesPerPage = 3;
      const pages: typeof wrappedLines[] = [];
      for (let i = 0; i < wrappedLines.length; i += linesPerPage) {
        pages.push(wrappedLines.slice(i, i + linesPerPage));
      }
      const activePageIdx = Math.max(
        0,
        pages.findIndex((pg) => pg.some((ln) => ln.words.some((pw) => pw.index === globalActiveIdx))),
      );
      const activeLines = pages[activePageIdx] ?? wrappedLines.slice(0, linesPerPage);
      const blockH = activeLines.length * lineHeight;
      const anchorY =
        subPos === 'Trên' ? height * 0.22 : subPos === 'Dưới' ? height * 0.78 : height * 0.5;
      const startY = anchorY - blockH / 2 + lineHeight / 2;

      // Plain layout backdrops (frosted glass / editorial left accent / kinetic progress / ocean float / cinema bar / serif poem)
      if (bookFrame === 'plain-glass') {
        ctx.save();
        const cardW = Math.min(width * 0.9, maxLineW + 64);
        const cardH = blockH + (opts.topicBadge ? 74 : 44);
        const cardX = width / 2 - cardW / 2;
        const cardY = anchorY - cardH / 2 - (opts.topicBadge ? 10 : 0);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.54)';
        roundRectPath(ctx, cardX, cardY, cardW, cardH, 26);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = 2;
        ctx.stroke();
        if (opts.topicBadge) {
          ctx.fillStyle = palette.accent;
          const badgeW = Math.min(cardW * 0.6, 260);
          roundRectPath(ctx, width / 2 - badgeW / 2, cardY + 14, badgeW, 24, 12);
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.font = `700 12px "Plus Jakarta Sans", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(opts.topicBadge, width / 2, cardY + 26, badgeW - 16);
        }
        ctx.restore();
      } else if (bookFrame === 'plain-editorial') {
        ctx.save();
        const quoteX = width / 2 - maxLineW / 2 - 22;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.42)';
        roundRectPath(ctx, quoteX - 16, anchorY - blockH / 2 - 44, maxLineW + 76, blockH + 88, 18);
        ctx.fill();
        ctx.fillStyle = palette.highlightBg;
        roundRectPath(ctx, quoteX, anchorY - blockH / 2 - 18, 6, blockH + 36, 3);
        ctx.fill();
        if (opts.title) {
          ctx.fillStyle = 'rgba(226, 232, 240, 0.86)';
          ctx.font = `700 ${Math.max(13, Math.round(fontSize * 0.36))}px "Plus Jakarta Sans", sans-serif`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          ctx.fillText(opts.title.toUpperCase(), quoteX + 18, anchorY - blockH / 2 - 12, maxLineW);
        }
        ctx.restore();
      } else if (bookFrame === 'plain-kinetic') {
        ctx.save();
        const progRatio =
          wordsList.length > 1 ? Math.max(0.03, (globalActiveIdx + 1) / wordsList.length) : 1;
        const barW = Math.min(width * 0.56, 480);
        const barY = anchorY + blockH / 2 + 34;
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        roundRectPath(ctx, width / 2 - barW / 2, barY, barW, 6, 3);
        ctx.fill();
        ctx.fillStyle = palette.highlightBg;
        roundRectPath(ctx, width / 2 - barW / 2, barY, barW * progRatio, 6, 3);
        ctx.fill();
        ctx.restore();
      } else if (bookFrame === 'plain-ocean-float') {
        ctx.save();
        if (opts.topicBadge) {
          const pillW = Math.min(width * 0.56, 270);
          const pillY = anchorY - blockH / 2 - 52;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.36)';
          roundRectPath(ctx, width / 2 - pillW / 2, pillY, pillW, 26, 13);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.fillStyle = '#E0F2FE';
          ctx.font = `700 12px "Plus Jakarta Sans", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(opts.topicBadge, width / 2, pillY + 13, pillW - 20);
        }
        ctx.restore();
      } else if (bookFrame === 'plain-subtitle-bar') {
        ctx.save();
        const bandH = blockH + 56;
        const bandY = anchorY - bandH / 2;
        const bandGrad = ctx.createLinearGradient(0, bandY, width, bandY);
        bandGrad.addColorStop(0, 'rgba(15, 23, 42, 0.15)');
        bandGrad.addColorStop(0.15, 'rgba(15, 23, 42, 0.62)');
        bandGrad.addColorStop(0.85, 'rgba(15, 23, 42, 0.62)');
        bandGrad.addColorStop(1, 'rgba(15, 23, 42, 0.15)');
        ctx.fillStyle = bandGrad;
        ctx.fillRect(0, bandY, width, bandH);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.fillRect(width * 0.12, bandY, width * 0.76, 1.5);
        ctx.fillRect(width * 0.12, bandY + bandH - 1.5, width * 0.76, 1.5);
        ctx.restore();
      } else if (bookFrame === 'plain-serif-poem') {
        ctx.save();
        const ruleW = Math.min(maxLineW * 0.45, 260);
        const topRuleY = anchorY - blockH / 2 - 26;
        const botRuleY = anchorY + blockH / 2 + 26;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(width / 2 - ruleW / 2, topRuleY);
        ctx.lineTo(width / 2 + ruleW / 2, topRuleY);
        ctx.moveTo(width / 2 - ruleW / 2, botRuleY);
        ctx.lineTo(width / 2 + ruleW / 2, botRuleY);
        ctx.stroke();
        ctx.fillStyle = '#FACC15';
        ctx.beginPath();
        ctx.arc(width / 2, topRuleY, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      let activePlainTarget: { cx: number; cy: number; w: number } | null = null;
      let nextPlainTarget: { cx: number; cy: number; w: number } | null = null;

      ctx.save();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      activeLines.forEach((ln, lIdx) => {
        let cx = width / 2 - ln.totalW / 2;
        const cy = startY + lIdx * lineHeight;
        ln.words.forEach((pw) => {
          const isActive = pw.index === globalActiveIdx;
          const isSpoken = pw.index < globalActiveIdx;
          if (isActive) {
            activePlainTarget = { cx, cy, w: pw.w };
          } else if (pw.index === globalActiveIdx + 1) {
            nextPlainTarget = { cx, cy, w: pw.w };
          }
          ctx.save();
          ctx.shadowColor = 'rgba(2, 6, 23, 0.9)';
          ctx.shadowBlur = 14;
          ctx.shadowOffsetY = 3;
          ctx.lineWidth = Math.max(3, Math.round(fontSize * 0.08));
          ctx.strokeStyle = 'rgba(2, 6, 23, 0.72)';
          ctx.font = `${isActive ? 800 : 700} ${fontSize}px ${fontFamily}`;
          if (isActive) {
            if (bookFrame === 'plain-kinetic' || pointerStyle === 'none' || pointerStyle === 'highlighter') {
              ctx.save();
              ctx.shadowBlur = 0;
              ctx.fillStyle =
                pointerStyle === 'highlighter' ? 'rgba(250, 204, 21, 0.92)' : palette.highlightBg;
              roundRectPath(ctx, cx - 10, cy - fontSize * 0.56, pw.w + 20, fontSize * 1.12, 12);
              ctx.fill();
              ctx.restore();
              ctx.fillStyle =
                pointerStyle === 'highlighter' ? '#0F172A' : palette.highlightText;
              ctx.fillText(pw.item.word, cx, cy);
            } else {
              ctx.translate(cx + pw.w / 2, cy);
              ctx.scale(1.06, 1.06);
              ctx.textAlign = 'center';
              ctx.strokeText(pw.item.word, 0, 0);
              ctx.fillStyle = '#FACC15';
              ctx.fillText(pw.item.word, 0, 0);
            }
          } else {
            ctx.strokeText(pw.item.word, cx, cy);
            ctx.fillStyle = isSpoken ? '#FFFFFF' : 'rgba(241, 245, 249, 0.82)';
            ctx.fillText(pw.item.word, cx, cy);
          }
          ctx.restore();
          cx += pw.w + pw.gapAfter;
        });
      });
      ctx.restore();

      hitRegions.body = {
        x: Math.max(0, width * 0.06),
        y: Math.max(0, anchorY - blockH / 2 - 20),
        w: width * 0.88,
        h: blockH + 40,
      };
      if (opts.topicBadge && (bookFrame === 'plain-glass' || bookFrame === 'plain-ocean-float')) {
        hitRegions.badge = {
          x: width * 0.2,
          y: Math.max(0, anchorY - blockH / 2 - 64),
          w: width * 0.6,
          h: 38,
        };
      }
      if (opts.title && bookFrame === 'plain-editorial') {
        hitRegions.title = {
          x: width * 0.08,
          y: Math.max(0, anchorY - blockH / 2 - 48),
          w: width * 0.84,
          h: 34,
        };
      }

      if (activePlainTarget && pointerStyle !== 'none') {
        const tgt = activePlainTarget as { cx: number; cy: number; w: number };
        let px = tgt.cx + tgt.w / 2;
        let py = tgt.cy + fontSize * 0.58 + 6;
        let pwInterp = tgt.w;
        const activeWordObj = wordsList[globalActiveIdx];
        if (nextPlainTarget && activeWordObj) {
          const nxt = nextPlainTarget as { cx: number; cy: number; w: number };
          const wordDur = Math.max(0.08, activeWordObj.end - activeWordObj.start);
          const transitionWindow = Math.min(0.14, wordDur * 0.34);
          const timeRemaining = activeWordObj.end - clampedWordTime;
          if (timeRemaining >= 0 && timeRemaining < transitionWindow) {
            const rawT = 1 - timeRemaining / transitionWindow;
            const ease = rawT * rawT * (3 - 2 * rawT);
            px = px + (nxt.cx + nxt.w / 2 - px) * ease;
            py = py + (nxt.cy + fontSize * 0.58 + 6 - py) * ease;
            pwInterp = tgt.w + (nxt.w - tgt.w) * ease;
          }
        }
        const baseScale = Math.max(0.65, Math.min(width, height) / 1080);
        const effScale = baseScale * pointerScaleFactor;
        const drawPx = px + pointerOffsetX;
        const drawPy = py + pointerOffsetY;
        const hitPadX = Math.max(36, 42 * effScale);
        const hitPadH = Math.max(54, 72 * effScale);
        hitRegions.pointer = {
          x: drawPx - hitPadX,
          y: drawPy - 12,
          w: hitPadX * 2,
          h: hitPadH,
        };
        drawReadingPointer(
          ctx,
          pointerStyle,
          drawPx,
          drawPy,
          pwInterp,
          fontSize,
          palette,
          effScale,
          opts.currentTime,
          true,
        );
      }

      if (pages.length > 1) {
        ctx.save();
        ctx.font = `700 ${Math.max(12, Math.round(refH * 0.015))}px "Plus Jakarta Sans", sans-serif`;
        ctx.fillStyle = 'rgba(241, 245, 249, 0.72)';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(
          uiStrings.pageIndicator(activePageIdx + 1, pages.length),
          width - Math.round(width * 0.035),
          height - Math.round(height * 0.03),
        );
        ctx.restore();
      }
    }

    // Watermark + Outro still apply on plain mode
    if (wm.watermarkEnabled && wm.watermarkText.trim()) {
      ctx.save();
      ctx.globalAlpha = Math.max(0.15, Math.min(1, wm.watermarkOpacity));
      const wmFontSize = Math.max(14, Math.round(height * 0.02));
      ctx.font = `700 ${wmFontSize}px "Plus Jakarta Sans", sans-serif`;
      const wmText = wm.watermarkText.trim();
      const tw = ctx.measureText(wmText).width;
      const pad = Math.round(width * 0.032);
      const boxW = tw + 22;
      const boxH = wmFontSize + 14;
      const x =
        wm.watermarkCorner === 'top-left' || wm.watermarkCorner === 'bottom-left'
          ? pad
          : width - pad - boxW;
      const y =
        wm.watermarkCorner === 'top-left' || wm.watermarkCorner === 'top-right'
          ? pad
          : height - pad - boxH;
      hitRegions.watermark = { x: x - 6, y: y - 6, w: boxW + 12, h: boxH + 12 };
      ctx.fillStyle = 'rgba(15, 23, 42, 0.52)';
      roundRectPath(ctx, x, y, boxW, boxH, 10);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.textBaseline = 'middle';
      ctx.fillText(wmText, x + 11, y + boxH / 2);
      ctx.restore();
    }
    if (timeline.hasOutro && outroText && opts.currentTime >= timeline.outroStart) {
      hitRegions.outro = { x: 0, y: 0, w: width, h: height };
      const progress = Math.min(
        1,
        (opts.currentTime - timeline.outroStart) / Math.min(0.55, Math.max(0.25, wm.outroSeconds)),
      );
      ctx.save();
      ctx.fillStyle = `rgba(15, 23, 42, ${(0.9 * progress).toFixed(3)})`;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = progress;
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lines = outroText.split('\n');
      const outroSize = Math.max(24, Math.round(height * 0.036));
      ctx.font = `800 ${outroSize}px "Outfit", "Plus Jakarta Sans", sans-serif`;
      const baseLineY = height / 2 - ((lines.length - 1) * outroSize * 1.4) / 2;
      lines.forEach((line, idx) => {
        ctx.fillText(line, width / 2, baseLineY + idx * outroSize * 1.4, width * 0.85);
      });
      ctx.restore();
    }
    return;
  }

  // Decorative floating circles (only when not covered by custom backdrop)
  if (!hasCustomBg) {
    ctx.save();
    ctx.globalAlpha = opts.illustrationStyle === '3D Cartoon' ? 0.32 : 0.2;
    ctx.fillStyle = isChalkboard ? '#38BDF8' : palette.pageBorder;
    ctx.beginPath();
    ctx.arc(width * 0.14, height * 0.1, Math.min(width, height) * 0.11, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(width * 0.88, height * 0.86, Math.min(width, height) * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const bookX = width * (isLandscape ? 0.045 : 0.065);
  const bookY = height * (isLandscape ? 0.065 : 0.085);
  const bookW = width * (isLandscape ? 0.91 : 0.87);
  const bookH = height * (isLandscape ? 0.86 : 0.81);
  const frameRadius = bookFrame === 'textbook-card' ? Math.min(width, height) * 0.024 : Math.min(width, height) * 0.034;

  // Frame outer cover / stacked pages
  if (bookFrame === 'open-spread') {
    ctx.save();
    ctx.fillStyle = palette.spineColor;
    roundRectPath(ctx, bookX - 10, bookY + 6, bookW + 20, bookH + 8, frameRadius + 6);
    ctx.fill();
    // Stacked side paper layers
    ctx.fillStyle = '#E2E8F0';
    roundRectPath(ctx, bookX - 5, bookY + 3, bookW + 10, bookH + 3, frameRadius + 2);
    ctx.fill();
    ctx.restore();
  } else if (opts.illustrationStyle !== 'Flat 2D' || isChalkboard) {
    ctx.save();
    ctx.fillStyle = isChalkboard ? '#78350F' : palette.spineColor;
    roundRectPath(
      ctx,
      bookX + Math.min(width, height) * (isChalkboard ? 0.008 : 0.014),
      bookY + Math.min(width, height) * (isChalkboard ? 0.01 : 0.012),
      bookW,
      bookH,
      frameRadius,
    );
    ctx.fill();
    ctx.restore();
  }

  // Book main surface & frame-specific outer styling
  if (bookFrame === 'ipad-reader') {
    // Tablet outer dark bezel
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.34)';
    ctx.shadowBlur = Math.min(width, height) * 0.05;
    ctx.shadowOffsetY = Math.min(width, height) * 0.015;
    ctx.fillStyle = '#0F172A';
    roundRectPath(ctx, bookX - 10, bookY - 14, bookW + 20, bookH + 28, frameRadius + 10);
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Top camera dot
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(bookX + bookW / 2, bookY - 5, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = 'rgba(15, 23, 42, 0.18)';
  ctx.shadowBlur = Math.min(width, height) * 0.04;
  ctx.shadowOffsetY = Math.min(width, height) * 0.01;
  ctx.fillStyle = isChalkboard ? '#14332B' : palette.pageBg;
  roundRectPath(ctx, bookX, bookY, bookW, bookH, frameRadius);
  ctx.fill();
  ctx.lineWidth = isChalkboard
    ? Math.max(8, Math.min(width, height) * 0.014)
    : bookFrame === 'ipad-reader'
      ? 1.5
      : Math.max(2, Math.min(width, height) * 0.004);
  ctx.strokeStyle = isChalkboard ? '#92400E' : bookFrame === 'ipad-reader' ? '#334155' : palette.pageBorder;
  ctx.stroke();
  ctx.restore();

  // Frame-specific chrome accents
  if (bookFrame === 'textbook-card' || bookFrame === 'editorial-mag') {
    ctx.save();
    roundRectPath(ctx, bookX, bookY, bookW, bookH, frameRadius);
    ctx.clip();
    ctx.fillStyle = palette.accent;
    ctx.fillRect(
      bookX,
      bookY,
      bookW,
      Math.max(12, Math.round(bookH * (bookFrame === 'editorial-mag' ? 0.032 : 0.022))),
    );
    if (bookFrame === 'editorial-mag') {
      ctx.fillStyle = palette.headerBg;
      ctx.fillRect(bookX, bookY + bookH - 18, bookW, 18);
    }
    ctx.restore();
  } else if (bookFrame === 'washi-scroll') {
    ctx.save();
    // Double inner border
    ctx.strokeStyle = palette.accent;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    roundRectPath(ctx, bookX + 12, bookY + 12, bookW - 24, bookH - 24, Math.max(8, frameRadius - 8));
    ctx.stroke();
    ctx.globalAlpha = 0.88;
    // Traditional red hanko seal in bottom-left
    const sealSize = Math.max(26, Math.round(Math.min(width, height) * 0.038));
    const sealX = bookX + bookW * 0.06;
    const sealY = bookY + bookH - sealSize - Math.max(16, bookH * 0.028);
    ctx.fillStyle = '#DC2626';
    roundRectPath(ctx, sealX, sealY, sealSize, sealSize, 5);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `800 ${Math.round(sealSize * 0.52)}px "Plus Jakarta Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('読', sealX + sealSize / 2, sealY + sealSize / 2);
    ctx.restore();
  } else if (bookFrame === 'open-spread') {
    // Satin bookmark ribbon hanging from top right
    ctx.save();
    const ribX = bookX + bookW * 0.82;
    const ribW = Math.max(16, Math.round(width * 0.02));
    const ribH = Math.max(38, Math.round(bookH * 0.095));
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.moveTo(ribX, bookY - 2);
    ctx.lineTo(ribX + ribW, bookY - 2);
    ctx.lineTo(ribX + ribW, bookY + ribH);
    ctx.lineTo(ribX + ribW / 2, bookY + ribH - 10);
    ctx.lineTo(ribX, bookY + ribH);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else if (bookFrame === 'spiral-notebook') {
    ctx.save();
    const ringCount = isLandscape ? 14 : 10;
    const ringSpan = bookW * 0.84;
    const ringStart = bookX + bookW * 0.08;
    for (let r = 0; r < ringCount; r++) {
      const rx = ringStart + (r / Math.max(1, ringCount - 1)) * ringSpan;
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.arc(rx, bookY + 12, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(rx, bookY + 2, 10, Math.PI * 0.9, Math.PI * 2.1);
      ctx.stroke();
    }
    // Red vertical notebook margin
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bookX + bookW * 0.042, bookY + 28);
    ctx.lineTo(bookX + bookW * 0.042, bookY + bookH - 18);
    ctx.stroke();
    ctx.restore();
  } else if (bookFrame === 'vintage-journal') {
    ctx.save();
    // Stitched leather outer margin & brass corner flourishes
    ctx.strokeStyle = palette.spineColor;
    ctx.lineWidth = 4;
    roundRectPath(ctx, bookX - 6, bookY - 6, bookW + 12, bookH + 12, frameRadius + 6);
    ctx.stroke();
    ctx.setLineDash([7, 5]);
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 1.6;
    roundRectPath(ctx, bookX + 10, bookY + 10, bookW - 20, bookH - 20, Math.max(8, frameRadius - 6));
    ctx.stroke();
    ctx.setLineDash([]);
    const cornerSize = 18;
    ctx.fillStyle = '#D97706';
    [
      [bookX + 2, bookY + 2],
      [bookX + bookW - cornerSize - 2, bookY + 2],
      [bookX + 2, bookY + bookH - cornerSize - 2],
      [bookX + bookW - cornerSize - 2, bookY + bookH - cornerSize - 2],
    ].forEach(([cx, cy]) => {
      roundRectPath(ctx, cx, cy, cornerSize, cornerSize, 4);
      ctx.fill();
    });
    ctx.restore();
  } else if (bookFrame === 'linen-minimal') {
    ctx.save();
    ctx.strokeStyle = palette.pageBorder;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.5;
    roundRectPath(ctx, bookX + 16, bookY + 16, bookW - 32, bookH - 32, Math.max(8, frameRadius - 8));
    ctx.stroke();
    ctx.restore();
  } else if (bookFrame === 'study-flashcard') {
    ctx.save();
    roundRectPath(ctx, bookX, bookY, bookW, bookH, frameRadius);
    ctx.clip();
    ctx.fillStyle = palette.headerBg;
    ctx.fillRect(bookX, bookY, bookW, Math.max(14, Math.round(bookH * 0.025)));
    ctx.fillStyle = palette.accent;
    ctx.fillRect(bookX, bookY, Math.round(bookW * 0.28), Math.max(14, Math.round(bookH * 0.025)));
    ctx.restore();
  }

  // Book header banner & illustration badge
  const padX = bookX + bookW * (bookFrame === 'spiral-notebook' ? 0.07 : 0.06);
  const contentW = bookW * (bookFrame === 'spiral-notebook' ? 0.86 : 0.88);
  const pillY = bookY + bookH * (bookFrame === 'spiral-notebook' ? 0.068 : 0.048);
  const pillH = Math.max(24, refH * 0.03);

  if (opts.topicBadge) {
    const badgeW = Math.min(contentW * 0.72, Math.max(200, width * 0.42));
    hitRegions.badge = { x: padX - 4, y: pillY - 4, w: badgeW + 8, h: pillH + 8 };
    ctx.save();
    ctx.fillStyle = isChalkboard ? 'rgba(255,255,255,0.12)' : palette.headerBg;
    roundRectPath(ctx, padX, pillY, badgeW, pillH, pillH / 2);
    ctx.fill();
    ctx.fillStyle = isChalkboard ? '#FDE68A' : palette.headerText;
    ctx.font = `700 ${Math.round(refH * 0.0155)}px "Plus Jakarta Sans", sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText(opts.topicBadge, padX + 14, pillY + pillH / 2, Math.max(80, badgeW - 28));
    ctx.restore();
  }

  // Mini book/chalk icon on top right of page
  if (bookFrame !== 'open-spread') {
    ctx.save();
    const iconS = Math.min(54, Math.min(width, height) * 0.065);
    const iconX = bookX + bookW - padX * 0.35 - iconS - 12;
    const iconY = pillY - 2;
    ctx.fillStyle = isChalkboard ? '#F59E0B' : palette.accent;
    if (opts.illustrationStyle === '3D Cartoon') {
      ctx.shadowColor = 'rgba(0,0,0,0.22)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 4;
    }
    roundRectPath(ctx, iconX, iconY, iconS, iconS * 0.78, 10);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(iconX + iconS * 0.48, iconY + 6, 2.5, iconS * 0.78 - 12);
    ctx.restore();
  }

  // Title
  const titleY = pillY + pillH + refH * 0.022;
  hitRegions.title = {
    x: padX - 4,
    y: titleY - 4,
    w: Math.max(80, contentW - 56),
    h: Math.round(refH * 0.036) + 8,
  };
  ctx.save();
  ctx.fillStyle = isChalkboard ? '#F8FAFC' : palette.headerText;
  ctx.font = `800 ${Math.round(refH * 0.026)}px "Outfit", "Plus Jakarta Sans", sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(opts.title || uiStrings.introDefaultTitle, padX, titleY, contentW - 70);
  ctx.restore();

  // Divider line
  const dividerY = titleY + refH * 0.044;
  ctx.strokeStyle = isChalkboard ? 'rgba(255,255,255,0.2)' : palette.headerBg;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX, dividerY);
  ctx.lineTo(padX + contentW, dividerY);
  ctx.stroke();

  // Layout words with automatic multi-page pagination
  const startBodyY = dividerY + refH * 0.026;
  const maxBodyY = bookY + bookH - refH * 0.075;

  if (inIntroPhase) {
    // Dedicated localized Intro card inside the book before words start
    ctx.save();
    const introProgress = Math.max(
      0,
      Math.min(1, opts.currentTime / Math.max(0.25, timeline.introEnd)),
    );
    const introFade = Math.min(1, opts.currentTime / 0.35 + 0.15);
    ctx.globalAlpha = introFade;

    const cardPad = Math.max(18, contentW * 0.05);
    const introBoxY = startBodyY + Math.max(8, (maxBodyY - startBodyY) * 0.06);
    const introBoxH = Math.max(160, (maxBodyY - startBodyY) * 0.78);
    hitRegions.intro = { x: padX, y: introBoxY, w: contentW, h: introBoxH };
    ctx.fillStyle = isChalkboard ? 'rgba(15, 23, 42, 0.55)' : palette.headerBg;
    roundRectPath(ctx, padX, introBoxY, contentW, introBoxH, 20);
    ctx.fill();
    ctx.strokeStyle = isChalkboard ? 'rgba(253, 230, 138, 0.35)' : palette.pageBorder;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Intro header pill (localized to target learning language)
    const introKicker = (opts.introTitle || uiStrings.introBadge).trim();
    const kickerFs = Math.max(13, Math.round(refH * 0.016));
    ctx.font = `800 ${kickerFs}px "Plus Jakarta Sans", sans-serif`;
    const kickerW = Math.min(contentW - cardPad * 2, ctx.measureText(introKicker).width + 28);
    const kickerH = Math.max(28, Math.round(refH * 0.032));
    const kickerX = padX + (contentW - kickerW) / 2;
    const kickerY = introBoxY + cardPad;
    ctx.fillStyle = isChalkboard ? '#F59E0B' : palette.accent;
    roundRectPath(ctx, kickerX, kickerY, kickerW, kickerH, kickerH / 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(introKicker, padX + contentW / 2, kickerY + kickerH / 2, kickerW - 18);

    // Big lesson title
    const heroTitleFs = Math.max(22, Math.round(refH * 0.032));
    ctx.font = `800 ${heroTitleFs}px "Outfit", "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = isChalkboard ? '#F8FAFC' : palette.headerText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const titleStartY = kickerY + kickerH + Math.max(16, refH * 0.024);
    ctx.fillText(opts.title || uiStrings.introDefaultTitle, padX + contentW / 2, titleStartY, contentW - cardPad * 2);

    // Wrapped intro subtitle / goal (CJK-aware wrapping)
    const introSub = (
      opts.introSubtitle || uiStrings.introSubtitleTemplate(opts.title || uiStrings.introDefaultTitle)
    ).trim();
    const subFs = Math.max(15, Math.round(refH * 0.019));
    ctx.font = `600 ${subFs}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = isChalkboard ? '#CBD5E1' : palette.bodyText;
    const maxSubW = contentW - cardPad * 2.2;
    const wrappedSubLines = wrapTextForCanvas(introSub, maxSubW, (s) => ctx.measureText(s).width);

    const subLineH = Math.round(subFs * 1.48);
    const subStartY = titleStartY + heroTitleFs + Math.max(16, refH * 0.022);
    wrappedSubLines.slice(0, 4).forEach((ln, idx) => {
      ctx.fillText(ln, padX + contentW / 2, subStartY + idx * subLineH, maxSubW);
    });

    // Progress bar at bottom of Intro card
    const barW = Math.min(contentW * 0.68, 460);
    const barH = 10;
    const barX = padX + (contentW - barW) / 2;
    const barY = introBoxY + introBoxH - cardPad - 24;
    ctx.fillStyle = isChalkboard ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.1)';
    roundRectPath(ctx, barX, barY, barW, barH, barH / 2);
    ctx.fill();
    ctx.fillStyle = isChalkboard ? '#FACC15' : palette.accent;
    roundRectPath(ctx, barX, barY, Math.max(16, barW * introProgress), barH, barH / 2);
    ctx.fill();

    ctx.font = `700 ${Math.max(12, Math.round(refH * 0.014))}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = isChalkboard ? '#FDE68A' : palette.spokenText;
    ctx.fillText(uiStrings.introPreparingLabel, padX + contentW / 2, barY + barH + 10, contentW - cardPad * 2);
    ctx.restore();
  } else {
    const bodyDuration = Math.max(1, timeline.contentEnd - timeline.introEnd);
    const wordsList =
      opts.words.length > 0
        ? opts.words
        : buildEstimatedReadingWords(opts.text, bodyDuration).map((w) => ({
            ...w,
            start: Number((w.start + timeline.introEnd).toFixed(3)),
            end: Number((w.end + timeline.introEnd).toFixed(3)),
          }));

    const fontSize = Math.max(15, Math.round(refH * 0.0235));
    const lineHeight = Math.round(fontSize * 1.72);
    const wordGap = Math.round(fontSize * 0.34);
    ctx.font = `600 ${fontSize}px "Plus Jakarta Sans", sans-serif`;

    const pages = paginateReadingWords(
      wordsList,
      (w) => ctx.measureText(w).width,
      {
        startX: padX,
        maxW: contentW,
        startY: startBodyY,
        maxY: maxBodyY,
        lineHeight,
        wordGap,
      },
    );

    // Spiral notebook ruled lines
    if (bookFrame === 'spiral-notebook') {
      ctx.save();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
      ctx.lineWidth = 1.5;
      for (let ly = startBodyY + fontSize + 8; ly <= maxBodyY + fontSize; ly += lineHeight) {
        ctx.beginPath();
        ctx.moveTo(padX, ly);
        ctx.lineTo(padX + contentW, ly);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Find global active word index
    const clampedWordTime = Math.max(
      timeline.introEnd,
      Math.min(opts.currentTime, Math.max(timeline.introEnd, timeline.contentEnd - 0.001)),
    );
    let globalActiveIdx = wordsList.findIndex(
      (w) => clampedWordTime >= w.start && clampedWordTime <= w.end,
    );
    if (globalActiveIdx === -1 && wordsList.length > 0) {
      for (let i = wordsList.length - 1; i >= 0; i--) {
        if (clampedWordTime >= wordsList[i].start) {
          globalActiveIdx = i;
          break;
        }
      }
      if (globalActiveIdx === -1) globalActiveIdx = 0;
    }

    // Pick page holding globalActiveIdx
    const activePageIdx = Math.max(
      0,
      pages.findIndex((pg) => pg.some((p) => p.index === globalActiveIdx)),
    );
    const activePageWords = pages[activePageIdx] ?? pages[0] ?? [];

    // Draw words on current page
    for (let i = 0; i < activePageWords.length; i++) {
      const p = activePageWords[i];
      const isActive = p.index === globalActiveIdx;
      const isSpoken = p.index < globalActiveIdx;

      if (isActive) {
        ctx.save();
        ctx.fillStyle =
          pointerStyle === 'highlighter'
            ? 'rgba(250, 204, 21, 0.9)'
            : isChalkboard
              ? '#F59E0B'
              : palette.highlightBg;
        roundRectPath(
          ctx,
          p.x - 8,
          p.y - 6,
          p.w + 16,
          fontSize + 12,
          10,
        );
        ctx.fill();
        ctx.restore();
        ctx.fillStyle =
          pointerStyle === 'highlighter'
            ? '#0F172A'
            : isChalkboard
              ? '#0F172A'
              : palette.highlightText;
      } else if (isSpoken) {
        ctx.fillStyle = isChalkboard ? '#CBD5E1' : palette.spokenText;
      } else {
        ctx.fillStyle = isChalkboard ? '#F8FAFC' : palette.bodyText;
      }
      ctx.font = `${isActive ? 700 : 600} ${fontSize}px "Plus Jakarta Sans", sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(p.item.word, p.x, p.y);
    }

    // Multi-page indicator if >= 2 pages (localized to learning language)
    if (pages.length > 1) {
      ctx.save();
      const pgLabel = uiStrings.pageIndicator(activePageIdx + 1, pages.length);
      ctx.font = `700 ${Math.max(12, Math.round(refH * 0.014))}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillStyle = isDarkPage ? 'rgba(255,255,255,0.65)' : palette.spokenText;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(pgLabel, bookX + bookW - bookW * 0.05, bookY + bookH - Math.max(14, bookH * 0.026));
      ctx.restore();
    }

    hitRegions.body = {
      x: padX - 6,
      y: startBodyY - 6,
      w: contentW + 12,
      h: Math.max(80, maxBodyY - startBodyY + 24),
    };

    // Pointer cursor smoothly glided toward next word on the same page
    const activePosIdx = activePageWords.findIndex((p) => p.index === globalActiveIdx);
    if (activePosIdx >= 0 && activePageWords[activePosIdx] && pointerStyle !== 'none') {
      const target = activePageWords[activePosIdx];
      const nextTarget =
        activePosIdx + 1 < activePageWords.length ? activePageWords[activePosIdx + 1] : null;
      let handX = target.x + target.w / 2;
      let handY = target.y + fontSize + 10;
      let interpW = target.w;

      if (nextTarget) {
        const wordDur = Math.max(0.08, target.item.end - target.item.start);
        const transitionWindow = Math.min(0.14, wordDur * 0.34);
        const timeRemaining = target.item.end - clampedWordTime;
        if (timeRemaining >= 0 && timeRemaining < transitionWindow) {
          const rawT = 1 - timeRemaining / transitionWindow;
          const ease = rawT * rawT * (3 - 2 * rawT);
          const nextX = nextTarget.x + nextTarget.w / 2;
          const nextY = nextTarget.y + fontSize + 10;
          handX = handX + (nextX - handX) * ease;
          handY = handY + (nextY - handY) * ease;
          interpW = target.w + (nextTarget.w - target.w) * ease;
        }
      }

      const baseScale = Math.max(0.6, Math.min(width, height) / 1080);
      const effScale = baseScale * pointerScaleFactor;
      const drawHandX = handX + pointerOffsetX;
      const drawHandY = handY + pointerOffsetY;
      const hitPadX = Math.max(36, 42 * effScale);
      const hitPadH = Math.max(54, 72 * effScale);
      hitRegions.pointer = {
        x: drawHandX - hitPadX,
        y: drawHandY - 10,
        w: hitPadX * 2,
        h: hitPadH,
      };
      drawReadingPointer(
        ctx,
        pointerStyle,
        drawHandX,
        drawHandY,
        interpW,
        fontSize,
        palette,
        effScale,
        opts.currentTime,
        isDarkPage,
      );
    }
  }

  // Watermark overlay (always visible if enabled & non-empty)
  if (wm.watermarkEnabled && wm.watermarkText.trim()) {
    ctx.save();
    ctx.globalAlpha = Math.max(0.15, Math.min(1, wm.watermarkOpacity));
    const wmFontSize = Math.max(14, Math.round(height * 0.02));
    ctx.font = `700 ${wmFontSize}px "Plus Jakarta Sans", sans-serif`;
    const wmText = wm.watermarkText.trim();
    const tw = ctx.measureText(wmText).width;
    const pad = Math.round(width * 0.032);
    const boxW = tw + 22;
    const boxH = wmFontSize + 14;
    const x =
      wm.watermarkCorner === 'top-left' || wm.watermarkCorner === 'bottom-left'
        ? pad
        : width - pad - boxW;
    const y =
      wm.watermarkCorner === 'top-left' || wm.watermarkCorner === 'top-right'
        ? pad
        : height - pad - boxH;
    hitRegions.watermark = { x: x - 6, y: y - 6, w: boxW + 12, h: boxH + 12 };
    ctx.fillStyle = 'rgba(15, 23, 42, 0.52)';
    roundRectPath(ctx, x, y, boxW, boxH, 10);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'middle';
    ctx.fillText(wmText, x + 11, y + boxH / 2);
    ctx.restore();
  }

  // Outro screen strictly after all content & words have completed
  if (timeline.hasOutro && outroText && opts.currentTime >= timeline.outroStart) {
    hitRegions.outro = { x: 0, y: 0, w: width, h: height };
    const progress = Math.min(
      1,
      (opts.currentTime - timeline.outroStart) / Math.min(0.55, Math.max(0.25, wm.outroSeconds)),
    );
    ctx.save();
    ctx.fillStyle = `rgba(15, 23, 42, ${(0.9 * progress).toFixed(3)})`;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = progress;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = outroText.split('\n');
    const outroSize = Math.max(24, Math.round(height * 0.036));
    ctx.font = `800 ${outroSize}px "Outfit", "Plus Jakarta Sans", sans-serif`;
    const baseLineY = height / 2 - ((lines.length - 1) * outroSize * 1.4) / 2;
    lines.forEach((line, idx) => {
      ctx.fillText(line, width / 2, baseLineY + idx * outroSize * 1.4, width * 0.85);
    });
    ctx.restore();
  }
}
