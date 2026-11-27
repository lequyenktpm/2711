import { VectorPrimitive } from './customComponentTypes';
import { IllustrationSceneIcon } from './types';

export type VisualLayoutPresetId =
  | 'bs-alert'
  | 'bs-card'
  | 'bs-progress'
  | 'bs-toast'
  | 'css-compare'
  | 'css-roadmap'
  | 'css-glass'
  | 'css-browser'
  | 'css-equation'
  | 'css-flashcard';

export interface VisualLayoutPresetMeta {
  id: VisualLayoutPresetId;
  name: string;
  sourceTag: 'Bootstrap 5' | 'Modern CSS';
  hint: string;
}

export const VISUAL_LAYOUT_PRESETS: VisualLayoutPresetMeta[] = [
  {
    id: 'bs-alert',
    name: 'Alert Callout',
    sourceTag: 'Bootstrap 5',
    hint: 'Viền trái nổi bật + icon + badge + ghi chú',
  },
  {
    id: 'bs-card',
    name: 'Header Card',
    sourceTag: 'Bootstrap 5',
    hint: 'Thanh tiêu đề màu + nội dung + chân thẻ',
  },
  {
    id: 'bs-progress',
    name: 'Progress Meter',
    sourceTag: 'Bootstrap 5',
    hint: 'Thanh tiến độ % + huy hiệu mục tiêu',
  },
  {
    id: 'bs-toast',
    name: 'Toast Notify',
    sourceTag: 'Bootstrap 5',
    hint: 'Thông báo nổi góc phải kiểu Toast UI',
  },
  {
    id: 'css-compare',
    name: '2-Column Compare',
    sourceTag: 'Bootstrap 5',
    hint: 'So sánh 2 cột Basic vs Recommended',
  },
  {
    id: 'css-roadmap',
    name: '3-Step Roadmap',
    sourceTag: 'Modern CSS',
    hint: '3 bước 01 → 02 → 03 nối liền mạch',
  },
  {
    id: 'css-glass',
    name: 'Glass Quote',
    sourceTag: 'Modern CSS',
    hint: 'Thẻ trích dẫn kính mờ sang trọng',
  },
  {
    id: 'css-browser',
    name: 'Browser Mockup',
    sourceTag: 'Modern CSS',
    hint: 'Khung trình duyệt 3 chấm + thanh URL',
  },
  {
    id: 'css-equation',
    name: 'Grammar Equation',
    sourceTag: 'Modern CSS',
    hint: 'Công thức ghép khối [A] + [B] = [C]',
  },
  {
    id: 'css-flashcard',
    name: 'Stacked Flashcard',
    sourceTag: 'Modern CSS',
    hint: 'Thẻ từ vựng 2 lớp kèm phiên âm IPA',
  },
];

export interface VisualColorPalette {
  id: string;
  label: string;
  bgColor: string;
  accentColor: string;
  softColor: string;
  borderColor: string;
  textColor: string;
}

export const VISUAL_COLOR_PALETTES: VisualColorPalette[] = [
  {
    id: 'indigo',
    label: 'Indigo Pro',
    bgColor: '#FFFFFF',
    accentColor: '#4F46E5',
    softColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    textColor: '#0F172A',
  },
  {
    id: 'primary',
    label: 'BS Blue',
    bgColor: '#EFF6FF',
    accentColor: '#0D6EFD',
    softColor: '#DBEAFE',
    borderColor: '#93C5FD',
    textColor: '#1E3A8A',
  },
  {
    id: 'success',
    label: 'BS Emerald',
    bgColor: '#ECFDF5',
    accentColor: '#10B981',
    softColor: '#D1FAE5',
    borderColor: '#6EE7B7',
    textColor: '#064E3B',
  },
  {
    id: 'danger',
    label: 'BS Rose',
    bgColor: '#FFF1F2',
    accentColor: '#E11D48',
    softColor: '#FFE4E6',
    borderColor: '#FDA4AF',
    textColor: '#881337',
  },
  {
    id: 'warning',
    label: 'BS Amber',
    bgColor: '#FFFBEB',
    accentColor: '#D97706',
    softColor: '#FEF3C7',
    borderColor: '#FCD34D',
    textColor: '#78350F',
  },
  {
    id: 'violet',
    label: 'Violet Glow',
    bgColor: '#FAF5FF',
    accentColor: '#7C3AED',
    softColor: '#EDE9FE',
    borderColor: '#C4B5FD',
    textColor: '#3B0764',
  },
  {
    id: 'slate',
    label: 'Dark Slate',
    bgColor: '#0F172A',
    accentColor: '#38BDF8',
    softColor: '#1E293B',
    borderColor: '#334155',
    textColor: '#F8FAFC',
  },
];

export interface VisualBuilderConfig {
  preset: VisualLayoutPresetId;
  badgeText: string;
  headline: string;
  subtext: string;
  stepLabels: [string, string, string];
  progressPercent: number;
  icon: IllustrationSceneIcon;
  bgColor: string;
  accentColor: string;
  softColor: string;
  borderColor: string;
  textColor: string;
  radius: number;
  showShadow: boolean;
  showBorder: boolean;
  headlineSize: number;
}

export function createDefaultVisualBuilderConfig(
  overrides?: Partial<VisualBuilderConfig>,
): VisualBuilderConfig {
  const basePalette = VISUAL_COLOR_PALETTES[0];
  return {
    preset: 'bs-card',
    badgeText: 'KEY PATTERN',
    headline: 'Could you give me a hand?',
    subtext: 'Lịch sự hơn hẳn "Help me!" trong giao tiếp',
    stepLabels: ['Listen', 'Practice', 'Speak!'],
    progressPercent: 82,
    icon: 'sparkles',
    bgColor: basePalette.bgColor,
    accentColor: basePalette.accentColor,
    softColor: basePalette.softColor,
    borderColor: basePalette.borderColor,
    textColor: basePalette.textColor,
    radius: 26,
    showShadow: true,
    showBorder: true,
    headlineSize: 32,
    ...overrides,
  };
}

function isDarkHex(hex: string): boolean {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b < 130;
}

export function inferPresetForVariant(variant: string): VisualLayoutPresetId {
  if (variant.includes('alert') || variant.includes('tip')) return 'bs-alert';
  if (variant.includes('progress') || variant.includes('scale')) return 'bs-progress';
  if (variant.includes('toast') || variant.includes('notify')) return 'bs-toast';
  if (variant.includes('pricing') || variant.includes('compare') || variant.includes('idiom'))
    return 'css-compare';
  if (variant.includes('roadmap') || variant.includes('flow') || variant.includes('breadcrumb'))
    return 'css-roadmap';
  if (variant.includes('glass') || variant.includes('quote')) return 'css-glass';
  if (variant.includes('browser') || variant.includes('office')) return 'css-browser';
  if (variant.includes('equation') || variant.includes('phrasal')) return 'css-equation';
  if (variant.includes('flashcard') || variant.includes('study')) return 'css-flashcard';
  return 'bs-card';
}

export function compileVisualBuilderToPrimitives(
  cfg: VisualBuilderConfig,
): VectorPrimitive[] {
  const radius = Math.max(8, Math.min(38, Math.round(cfg.radius)));
  const stroke = cfg.showBorder ? cfg.borderColor : undefined;
  const mutedText = isDarkHex(cfg.bgColor) ? '#CBD5E1' : '#475569';
  const badgeTxt = cfg.badgeText.trim() || 'PATTERN';
  const headline = cfg.headline.trim() || 'Natural English';
  const subtext = cfg.subtext.trim() || 'Everyday speaking pattern';
  const hSize = Math.max(24, Math.min(44, Math.round(cfg.headlineSize)));
  const [s1, s2, s3] = cfg.stepLabels;

  if (cfg.preset === 'bs-alert') {
    return [
      {
        shape: 'rect',
        x: -415,
        y: -115,
        w: 830,
        h: 230,
        radius,
        fill: cfg.bgColor,
        stroke,
        lineWidth: 3,
        shadow: cfg.showShadow,
      },
      {
        shape: 'rect',
        x: -415,
        y: -115,
        w: 18,
        h: 230,
        radius: 9,
        fill: cfg.accentColor,
      },
      { shape: 'circle', x: -322, y: 0, r: 52, fill: cfg.softColor },
      { shape: 'icon', icon: cfg.icon, x: -322, y: 0 },
      { shape: 'pill', x: -242, y: -74, w: 185, h: 36, fill: cfg.accentColor },
      {
        shape: 'text',
        x: -149,
        y: -56,
        w: 165,
        text: badgeTxt.toUpperCase(),
        fill: '#FFFFFF',
        fontSize: 16,
        fontWeight: 800,
        align: 'center',
      },
      {
        shape: 'text',
        x: -242,
        y: 2,
        w: 615,
        text: headline,
        fill: cfg.textColor,
        fontSize: hSize,
        fontWeight: 800,
        align: 'left',
      },
      {
        shape: 'text',
        x: -242,
        y: 54,
        w: 615,
        text: subtext,
        fill: mutedText,
        fontSize: 22,
        fontWeight: 600,
        align: 'left',
      },
    ];
  }

  if (cfg.preset === 'bs-card') {
    return [
      {
        shape: 'rect',
        x: -410,
        y: -130,
        w: 820,
        h: 260,
        radius,
        fill: cfg.bgColor,
        stroke,
        lineWidth: 2.5,
        shadow: cfg.showShadow,
      },
      {
        shape: 'rect',
        x: -410,
        y: -130,
        w: 820,
        h: 64,
        radius: Math.min(radius, 22),
        fill: cfg.accentColor,
      },
      { shape: 'rect', x: -410, y: -86, w: 820, h: 20, radius: 0, fill: cfg.accentColor },
      {
        shape: 'text',
        x: -376,
        y: -98,
        w: 560,
        text: badgeTxt.toUpperCase(),
        fill: '#FFFFFF',
        fontSize: 21,
        fontWeight: 800,
        align: 'left',
      },
      { shape: 'circle', x: -320, y: 28, r: 52, fill: cfg.softColor },
      { shape: 'icon', icon: cfg.icon, x: -320, y: 28 },
      {
        shape: 'text',
        x: -238,
        y: 2,
        w: 610,
        text: headline,
        fill: cfg.textColor,
        fontSize: hSize,
        fontWeight: 800,
        align: 'left',
      },
      {
        shape: 'text',
        x: -238,
        y: 52,
        w: 610,
        text: subtext,
        fill: mutedText,
        fontSize: 22,
        fontWeight: 600,
        align: 'left',
      },
      {
        shape: 'line',
        x: -376,
        y: 94,
        x2: 376,
        y2: 94,
        stroke: cfg.softColor,
        lineWidth: 2,
      },
    ];
  }

  if (cfg.preset === 'bs-progress') {
    const pct = Math.max(10, Math.min(100, Math.round(cfg.progressPercent)));
    const barW = 736;
    const fillW = Math.max(44, Math.round((barW * pct) / 100));
    return [
      {
        shape: 'rect',
        x: -415,
        y: -115,
        w: 830,
        h: 230,
        radius,
        fill: cfg.bgColor,
        stroke,
        lineWidth: 2,
        shadow: cfg.showShadow,
      },
      {
        shape: 'text',
        x: -368,
        y: -58,
        w: 530,
        text: headline,
        fill: cfg.textColor,
        fontSize: hSize - 2,
        fontWeight: 800,
        align: 'left',
      },
      { shape: 'pill', x: 240, y: -80, w: 128, h: 44, fill: cfg.softColor },
      {
        shape: 'text',
        x: 304,
        y: -58,
        w: 112,
        text: `${pct}%`,
        fill: cfg.accentColor,
        fontSize: 24,
        fontWeight: 800,
        align: 'center',
      },
      { shape: 'pill', x: -368, y: -8, w: barW, h: 40, fill: '#E2E8F0' },
      { shape: 'pill', x: -368, y: -8, w: fillW, h: 40, fill: cfg.accentColor },
      {
        shape: 'text',
        x: -368,
        y: 68,
        w: 736,
        text: subtext,
        fill: mutedText,
        fontSize: 22,
        fontWeight: 600,
        align: 'left',
      },
    ];
  }

  if (cfg.preset === 'bs-toast') {
    return [
      {
        shape: 'rect',
        x: -395,
        y: -118,
        w: 790,
        h: 236,
        radius,
        fill: cfg.bgColor,
        stroke,
        lineWidth: 2,
        shadow: cfg.showShadow,
      },
      {
        shape: 'rect',
        x: -395,
        y: -118,
        w: 790,
        h: 58,
        radius: Math.min(radius, 22),
        fill: cfg.softColor,
      },
      { shape: 'rect', x: -395, y: -80, w: 790, h: 20, radius: 0, fill: cfg.softColor },
      { shape: 'rect', x: -362, y: -102, w: 26, h: 26, radius: 7, fill: cfg.accentColor },
      {
        shape: 'text',
        x: -322,
        y: -89,
        w: 360,
        text: badgeTxt,
        fill: cfg.textColor,
        fontSize: 20,
        fontWeight: 800,
        align: 'left',
      },
      {
        shape: 'text',
        x: 360,
        y: -89,
        w: 220,
        text: 'just now · ✓',
        fill: mutedText,
        fontSize: 17,
        fontWeight: 600,
        align: 'right',
      },
      { shape: 'icon', icon: cfg.icon, x: -304, y: 28 },
      {
        shape: 'text',
        x: -218,
        y: 4,
        w: 575,
        text: headline,
        fill: cfg.textColor,
        fontSize: hSize,
        fontWeight: 800,
        align: 'left',
      },
      {
        shape: 'text',
        x: -218,
        y: 52,
        w: 575,
        text: subtext,
        fill: mutedText,
        fontSize: 22,
        fontWeight: 600,
        align: 'left',
      },
    ];
  }

  if (cfg.preset === 'css-compare') {
    return [
      {
        shape: 'rect',
        x: -415,
        y: -118,
        w: 388,
        h: 236,
        radius,
        fill: '#FFFFFF',
        stroke: '#E2E8F0',
        lineWidth: 2,
        shadow: cfg.showShadow,
      },
      { shape: 'pill', x: -380, y: -88, w: 130, h: 34, fill: '#FEE2E2' },
      {
        shape: 'text',
        x: -315,
        y: -71,
        w: 115,
        text: '✗ BASIC',
        fill: '#DC2626',
        fontSize: 16,
        fontWeight: 800,
        align: 'center',
      },
      {
        shape: 'text',
        x: -221,
        y: 0,
        w: 340,
        text: s1 || 'Old phrase',
        fill: '#334155',
        fontSize: 28,
        fontWeight: 800,
        align: 'center',
      },
      {
        shape: 'text',
        x: -221,
        y: 58,
        w: 340,
        text: subtext,
        fill: '#94A3B8',
        fontSize: 19,
        fontWeight: 600,
        align: 'center',
      },
      {
        shape: 'rect',
        x: 27,
        y: -124,
        w: 388,
        h: 248,
        radius,
        fill: cfg.softColor,
        stroke: cfg.accentColor,
        lineWidth: 4,
        shadow: cfg.showShadow,
      },
      { shape: 'pill', x: 62, y: -94, w: 195, h: 36, fill: cfg.accentColor },
      {
        shape: 'text',
        x: 159,
        y: -76,
        w: 180,
        text: `✓ ${badgeTxt.toUpperCase()}`,
        fill: '#FFFFFF',
        fontSize: 16,
        fontWeight: 800,
        align: 'center',
      },
      {
        shape: 'text',
        x: 221,
        y: -2,
        w: 340,
        text: s2 || headline,
        fill: cfg.textColor,
        fontSize: 30,
        fontWeight: 800,
        align: 'center',
      },
      {
        shape: 'text',
        x: 221,
        y: 60,
        w: 340,
        text: 'Sounds 100% Natural',
        fill: cfg.accentColor,
        fontSize: 20,
        fontWeight: 700,
        align: 'center',
      },
    ];
  }

  if (cfg.preset === 'css-roadmap') {
    const xs = [-255, 0, 255];
    const stepArr = [s1 || 'Step 1', s2 || 'Step 2', s3 || 'Step 3'];
    const stepPrims: VectorPrimitive[] = [
      {
        shape: 'rect',
        x: -420,
        y: -112,
        w: 840,
        h: 224,
        radius,
        fill: cfg.bgColor,
        stroke,
        lineWidth: 2,
        shadow: cfg.showShadow,
      },
      {
        shape: 'line',
        x: -255,
        y: -20,
        x2: 255,
        y2: -20,
        stroke: cfg.borderColor,
        lineWidth: 8,
      },
    ];
    xs.forEach((sx, idx) => {
      stepPrims.push(
        {
          shape: 'circle',
          x: sx,
          y: -20,
          r: 32,
          fill: idx === 2 ? '#10B981' : cfg.accentColor,
        },
        {
          shape: 'text',
          x: sx,
          y: -19,
          text: `0${idx + 1}`,
          fill: '#FFFFFF',
          fontSize: 24,
          fontWeight: 800,
          align: 'center',
        },
        {
          shape: 'text',
          x: sx,
          y: 52,
          w: 220,
          text: stepArr[idx],
          fill: cfg.textColor,
          fontSize: 25,
          fontWeight: 800,
          align: 'center',
        },
      );
    });
    return stepPrims;
  }

  if (cfg.preset === 'css-glass') {
    return [
      {
        shape: 'rect',
        x: -415,
        y: -120,
        w: 830,
        h: 240,
        radius,
        fill: cfg.softColor,
        stroke: cfg.borderColor,
        lineWidth: 3.5,
        shadow: cfg.showShadow,
      },
      {
        shape: 'text',
        x: -365,
        y: -48,
        text: '“',
        fill: cfg.accentColor,
        fontSize: 78,
        fontWeight: 800,
        align: 'left',
      },
      {
        shape: 'text',
        x: 0,
        y: -8,
        w: 680,
        text: headline,
        fill: cfg.textColor,
        fontSize: hSize,
        fontWeight: 800,
        align: 'center',
      },
      { shape: 'pill', x: -165, y: 46, w: 330, h: 42, fill: cfg.bgColor, stroke: cfg.borderColor, lineWidth: 1.5 },
      {
        shape: 'text',
        x: 0,
        y: 67,
        w: 290,
        text: subtext,
        fill: cfg.accentColor,
        fontSize: 20,
        fontWeight: 700,
        align: 'center',
      },
    ];
  }

  if (cfg.preset === 'css-browser') {
    return [
      {
        shape: 'rect',
        x: -410,
        y: -130,
        w: 820,
        h: 260,
        radius,
        fill: cfg.bgColor,
        stroke,
        lineWidth: 2,
        shadow: cfg.showShadow,
      },
      {
        shape: 'rect',
        x: -410,
        y: -130,
        w: 820,
        h: 56,
        radius: Math.min(radius, 22),
        fill: cfg.softColor,
      },
      { shape: 'rect', x: -410, y: -92, w: 820, h: 18, radius: 0, fill: cfg.softColor },
      { shape: 'circle', x: -370, y: -102, r: 8, fill: '#EF4444' },
      { shape: 'circle', x: -344, y: -102, r: 8, fill: '#F59E0B' },
      { shape: 'circle', x: -318, y: -102, r: 8, fill: '#10B981' },
      { shape: 'pill', x: -260, y: -119, w: 540, h: 34, fill: '#FFFFFF' },
      {
        shape: 'text',
        x: 10,
        y: -102,
        w: 500,
        text: `https://english.studio/${badgeTxt.toLowerCase().replace(/\s+/g, '-')}`,
        fill: '#64748B',
        fontSize: 17,
        fontWeight: 600,
        align: 'center',
      },
      {
        shape: 'text',
        x: 0,
        y: -2,
        w: 730,
        text: headline,
        fill: cfg.textColor,
        fontSize: hSize,
        fontWeight: 800,
        align: 'center',
      },
      {
        shape: 'text',
        x: 0,
        y: 56,
        w: 730,
        text: subtext,
        fill: cfg.accentColor,
        fontSize: 23,
        fontWeight: 700,
        align: 'center',
      },
    ];
  }

  if (cfg.preset === 'css-equation') {
    return [
      {
        shape: 'rect',
        x: -420,
        y: -115,
        w: 840,
        h: 230,
        radius,
        fill: cfg.bgColor,
        stroke,
        lineWidth: 2,
        shadow: cfg.showShadow,
      },
      {
        shape: 'text',
        x: 0,
        y: -74,
        w: 720,
        text: badgeTxt.toUpperCase(),
        fill: mutedText,
        fontSize: 20,
        fontWeight: 800,
        align: 'center',
      },
      { shape: 'rect', x: -390, y: -26, w: 220, h: 86, radius: 20, fill: cfg.softColor },
      {
        shape: 'text',
        x: -280,
        y: 17,
        w: 196,
        text: s1 || 'Could you',
        fill: cfg.accentColor,
        fontSize: 25,
        fontWeight: 800,
        align: 'center',
      },
      { shape: 'text', x: -142, y: 17, text: '+', fill: mutedText, fontSize: 30, fontWeight: 800 },
      { shape: 'rect', x: -110, y: -26, w: 220, h: 86, radius: 20, fill: '#FEF3C7' },
      {
        shape: 'text',
        x: 0,
        y: 17,
        w: 196,
        text: s2 || 'V-inf',
        fill: '#B45309',
        fontSize: 25,
        fontWeight: 800,
        align: 'center',
      },
      { shape: 'text', x: 138, y: 17, text: '=', fill: mutedText, fontSize: 30, fontWeight: 800 },
      { shape: 'rect', x: 170, y: -26, w: 220, h: 86, radius: 20, fill: '#DCFCE7' },
      {
        shape: 'text',
        x: 280,
        y: 17,
        w: 196,
        text: s3 || 'Polite!',
        fill: '#15803D',
        fontSize: 25,
        fontWeight: 800,
        align: 'center',
      },
    ];
  }

  // css-flashcard default
  return [
    {
      shape: 'rect',
      x: -340,
      y: -124,
      w: 680,
      h: 224,
      radius,
      fill: cfg.softColor,
      shadow: false,
    },
    {
      shape: 'rect',
      x: -375,
      y: -102,
      w: 750,
      h: 224,
      radius,
      fill: cfg.bgColor,
      stroke,
      lineWidth: 2.5,
      shadow: cfg.showShadow,
    },
    { shape: 'pill', x: -115, y: -80, w: 230, h: 34, fill: cfg.softColor },
    {
      shape: 'text',
      x: 0,
      y: -63,
      w: 210,
      text: badgeTxt.toUpperCase(),
      fill: cfg.accentColor,
      fontSize: 16,
      fontWeight: 800,
      align: 'center',
    },
    {
      shape: 'text',
      x: 0,
      y: -2,
      w: 660,
      text: headline,
      fill: cfg.textColor,
      fontSize: hSize + 4,
      fontWeight: 800,
      align: 'center',
    },
    {
      shape: 'text',
      x: 0,
      y: 58,
      w: 660,
      text: subtext,
      fill: mutedText,
      fontSize: 23,
      fontWeight: 600,
      align: 'center',
    },
  ];
}
