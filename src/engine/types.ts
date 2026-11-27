import type { VectorPrimitive } from './customComponentTypes';
import type { ExportAspectRatioId } from './mp4Config';

export type CanvasThemeId =
  | 'pastel-sunrise'
  | 'soft-lavender'
  | 'mint-breeze'
  | 'warm-paper'
  | 'studio-slate';

export type BackgroundFitMode = 'cover' | 'contain';

export type BackgroundMediaKind = 'image' | 'video' | 'preset';

export type BackgroundPresetId =
  | 'ocean-shore-waves'
  | 'golden-sea-sunset'
  | 'calm-mountain-lake'
  | 'emerald-forest-stream'
  | 'cherry-blossom-breeze'
  | 'aurora-night-sky'
  | 'cozy-rain-cafe'
  | 'night-study-desk'
  | 'misty-forest-dusk'
  | 'midnight-city-lofi'
  | 'warm-sunset-paper'
  | 'zen-botanical-room';

export interface BackgroundImageConfig {
  kind?: BackgroundMediaKind; // defaults to 'image' when dataUrl is present
  dataUrl?: string;
  videoUrl?: string;
  presetId?: BackgroundPresetId;
  fileName?: string;
  fit?: BackgroundFitMode;
  scrimOpacity?: number; // 0..0.9 base overlay opacity
  learningScrimOpacity?: number; // 0..0.92 extra focus scrim when learning text/subtitles appear
}

export type SubtitlePosition = 'top' | 'center' | 'bottom';
export type SubtitleSize = 'sm' | 'md' | 'lg' | 'xl';
export type SubtitleBoxStyle = 'card' | 'clean' | 'pill';

export interface SubtitleDisplayConfig {
  position?: SubtitlePosition;
  size?: SubtitleSize;
  boxStyle?: SubtitleBoxStyle;
}

export interface WordTiming {
  word: string;
  start: number;
  end: number;
  highlightColor?: string;
}

export interface TranscriptCue {
  id: string;
  start: number;
  end: number;
  text: string;
  words: WordTiming[];
}

export type EnterAnimation = 'pop-up' | 'slide-up' | 'fade-scale' | 'drop-in' | 'none';
export type ExitAnimation = 'fade-out' | 'slide-down' | 'shrink' | 'none';

export type Shape3DType =
  | 'card_3d'
  | 'pill_3d'
  | 'cube_3d'
  | 'rect_3d'
  | 'staircase_3d';

export type TextSizeRole = 'display' | 'headline' | 'body' | 'caption' | 'label';
export type TextWeightRole = 'regular' | 'medium' | 'bold' | 'black';

export type SceneElementType =
  | 'comparison-strip'
  | 'topic-pill'
  | 'illustration-prop'
  | 'sentence-card'
  | 'tone-meter'
  | 'word-stack'
  | 'shape-3d'
  | 'karaoke-card';

export interface ElementLayout {
  x: number; // Center X on canvas
  y: number; // Center Y on canvas
  width: number;
  height?: number;
  scale: number;
  zIndex: number;
  manualPosition?: boolean;
}

export interface ComparisonItem {
  label: string;
  sublabel?: string;
  activateAt?: number;
  accentColor?: string;
}

export interface WordStackRow {
  prefix: string;
  suffix: string;
  suffixColor: string;
  appearAt: number;
  phonetic?: string;
}

export interface ComparisonStripProps {
  kind: 'comparison-strip';
  items: ComparisonItem[];
  /** Force all items onto one compact horizontal row instead of stacking vertically */
  singleRow?: boolean;
}

export interface TopicPillProps {
  kind: 'topic-pill';
  text: string;
  bgColor: string;
  textColor: string;
}

export type IllustrationSceneIcon =
  | 'tv'
  | 'eye'
  | 'glasses'
  | 'watch'
  | 'listen'
  | 'walk'
  | 'phone'
  | 'airplane'
  | 'luggage'
  | 'menu'
  | 'cup'
  | 'shopping-bag'
  | 'price-tag'
  | 'stethoscope'
  | 'sun'
  | 'rain'
  | 'umbrella'
  | 'snowflake'
  | 'book'
  | 'pencil'
  | 'graduation'
  | 'laptop'
  | 'calendar'
  | 'briefcase'
  | 'clock'
  | 'car'
  | 'bus'
  | 'home'
  | 'dumbbell'
  | 'music'
  | 'mic'
  | 'camera'
  | 'heart'
  | 'sparkles'
  | 'brain'
  | 'lightning'
  | 'scale'
  | 'gift'
  | 'wallet'
  | 'map-pin'
  | 'globe'
  | 'handshake'
  | 'chat';

export type BuiltinIllustrationVariant =
  | 'cafe-water'
  | 'coffee-cup'
  | 'pronunciation-wave'
  | 'speech-bubble'
  | 'friends-chat'
  | 'office-work'
  | 'hotel-desk'
  | 'lightbulb-tip'
  | 'ear-listen'
  | 'flow-diagram'
  | 'gauge-arc'
  | 'timeline-track'
  | 'checklist-card'
  | 'dialogue-upgrade'
  | 'clock-face'
  | 'spatial-boxes'
  | 'avatar-speech'
  | 'phrase-icon-split'
  | 'trio-icon-cards'
  | 'contrast-pair-cards'
  | 'quiz-fill-blank'
  | 'airport-travel'
  | 'restaurant-order'
  | 'shopping-price'
  | 'doctor-health'
  | 'weather-forecast'
  | 'study-desk'
  | 'commute-transport'
  | 'home-routine'
  | 'gym-fitness'
  | 'phone-call'
  | 'tense-timeline'
  | 'degree-scale'
  | 'phrasal-split'
  | 'idiom-split'
  | 'syllable-stress'
  | 'intonation-curve'
  | 'bs-alert-tip'
  | 'bs-card-header'
  | 'bs-progress-meter'
  | 'bs-toast-notify'
  | 'bs-list-group'
  | 'bs-pricing-tier'
  | 'bs-accordion-faq'
  | 'bs-breadcrumb-path'
  | 'css-bento-stats'
  | 'css-glass-quote'
  | 'css-chat-thread'
  | 'css-roadmap-steps'
  | 'css-toggle-switch'
  | 'css-browser-mockup'
  | 'css-grammar-equation'
  | 'css-flashcard-flip'
  | 'css-sticky-note'
  | 'bs-badge-cluster'
  | 'css-magnifying-word'
  | 'bs-modal-quiz'
  | 'p168-step-quiz-formula'
  | 'p168-grammar-formula'
  | 'p168-pronunciation-matrix'
  | 'p168-situation-cards'
  | 'p168-slider-compare'
  | 'p168-story-dialogue'
  | 'cartoon-host'
  | 'dynamic-scene';

export type IllustrationVariant = BuiltinIllustrationVariant | (string & {});

export interface IllustrationFlowNode {
  label: string;
  sublabel?: string;
  icon?: 'clock' | 'history' | 'rocket' | 'chat' | 'star' | 'check' | 'water' | 'office';
  sceneIcon?: IllustrationSceneIcon;
  color?: string;
}

export interface IllustrationChecklistItem {
  text: string;
  highlight?: string;
  ok?: boolean;
}

export interface IllustrationDialogueRow {
  prompt: string;
  upgrade: string;
  badgeColor?: string;
}

export interface IllustrationSpatialBox {
  title: string;
  subtitle?: string;
  icon: 'dot' | 'surface' | 'cube' | 'check' | 'cross' | 'letter';
  accent?: string;
}

export interface DynamicSceneMotif {
  icon: IllustrationSceneIcon;
  label: string;
  sublabel?: string;
  accent?: string;
  status?: 'check' | 'cross' | 'neutral';
}

export interface DynamicSceneSpec {
  layout:
    | 'split-compare'
    | 'hero-icon-formula'
    | 'triple-card-grid'
    | 'timeline-bridge'
    | 'phonetic-breakdown';
  badgeText?: string;
  headline?: string;
  subtext?: string;
  formula?: string;
  connector?: 'arrow' | 'vs' | 'equals' | 'plus';
  motifs: DynamicSceneMotif[];
}

export type CartoonGestureMode =
  | 'present'
  | 'explain'
  | 'question'
  | 'cheer'
  | 'point-up'
  | 'point-right'
  | 'warn-avoid'
  | 'approve-tip'
  | 'wave'
  | 'shrug'
  | 'think-chin'
  | 'thumbs-up'
  | 'double-point'
  | 'facepalm'
  | 'fist-pump'
  | 'hold-mic'
  | 'clap-jump';

export type CartoonExpressionMood =
  | 'neutral'
  | 'happy'
  | 'worried'
  | 'curious'
  | 'surprised'
  | 'excited'
  | 'sad'
  | 'cool'
  | 'proud'
  | 'shy';

export type CartoonEyeStyle =
  | 'normal'
  | 'happy-arc'
  | 'wide-surprised'
  | 'wink'
  | 'star'
  | 'focused'
  | 'sleepy'
  | 'heart'
  | 'cool-shades';

export type CartoonMouthStyle =
  | 'lip-sync'
  | 'smile'
  | 'big-grin'
  | 'o-shock'
  | 'wavy-nervous'
  | 'flat-serious'
  | 'smirk';

export type CartoonFxOverlay =
  | 'none'
  | 'sparkles'
  | 'lightbulb'
  | 'warning-bolt'
  | 'question-marks'
  | 'hearts'
  | 'music-notes'
  | 'sweat-drop'
  | 'check-burst'
  | 'fire-aura';

export type CartoonAccessory =
  | 'none'
  | 'badge-card'
  | 'megaphone'
  | 'pointer-stick'
  | 'mic'
  | 'graduation-cap'
  | 'sunglasses';

export interface CartoonAnimationKeyframe {
  /** Normalized position 0..1 within sequenceDurationSec */
  at: number;
  label?: string;
  /** Vertical jump offset in local px (negative = airborne up, positive = crouch lower) */
  jumpOffsetY?: number;
  /** 0..1 knee bend intensity (0 = straight legs, 1 = deep crouch) */
  kneeBend?: number;
  leftWristX?: number;
  leftWristY?: number;
  leftHandAngle?: number;
  rightWristX?: number;
  rightWristY?: number;
  rightHandAngle?: number;
  /** 0..1 clapping palm contact / impact sparks */
  clapImpact?: number;
  mouthStyle?: CartoonMouthStyle;
  eyeStyle?: CartoonEyeStyle;
  bodySquashX?: number;
  bodySquashY?: number;
  headTiltDeg?: number;
}

export interface CartoonAnimationParams {
  mood: CartoonExpressionMood;
  gestureMode: CartoonGestureMode;
  eyeStyle: CartoonEyeStyle;
  mouthStyle: CartoonMouthStyle;
  fxOverlay: CartoonFxOverlay;
  accessory: CartoonAccessory;
  badgeGlyph?: 'check' | 'cross' | 'question' | 'tip' | null;
  badgeEmoji?: string;
  speed: number;
  bounceIntensity: number;
  headTiltDeg: number;
  blushIntensity: number;
  bodySquashStretch: number;
  keyframes?: CartoonAnimationKeyframe[];
  sequenceDurationSec?: number;
  loopSequence?: boolean;
}

export interface CartoonActionSegment {
  id?: string;
  startTime: number;
  endTime: number;
  actionId?: string;
  mood?: CartoonExpressionMood;
  spec?: Partial<CartoonAnimationParams>;
}

export interface CartoonAnimationDefinition {
  id: string;
  label: string;
  category: 'greeting' | 'teaching' | 'reaction' | 'emphasis' | 'custom';
  description: string;
  keywords: string[];
  source: 'built-in' | 'custom';
  isHidden?: boolean;
  updatedAt: number;
  params: CartoonAnimationParams;
}

export interface IllustrationPropData {
  title?: string;
  subtitle?: string;
  nodes?: IllustrationFlowNode[];
  labels?: string[];
  value?: number; // 0..1 for gauge / timeline-track / degree-scale
  timeHour?: number;
  timeMinute?: number;
  formula?: string;
  checklist?: IllustrationChecklistItem[];
  upgrades?: IllustrationDialogueRow[];
  boxes?: IllustrationSpatialBox[];
  speechText?: string;
  reactionText?: string;
  sceneIcon?: IllustrationSceneIcon;
  highlightWord?: string;
  dynamicScene?: DynamicSceneSpec;
  customPrimitives?: VectorPrimitive[];
  /** @Gimmys cartoon character action preset ID from cartoonAnimationDb */
  cartoonAction?: string;
  /** @Gimmys explicit mood override */
  cartoonMood?: CartoonExpressionMood;
  /** @Gimmys inline/AI-invented expressive specification */
  cartoonAnimationSpec?: Partial<CartoonAnimationParams>;
  /** Timed action keyframes across cards/scenes for @Gimmys */
  cartoonActionSegments?: CartoonActionSegment[];
}

export interface IllustrationPropProps {
  kind: 'illustration-prop';
  variant: IllustrationVariant;
  data?: IllustrationPropData;
}

export type LayoutCompositionId =
  | 'plain'
  | 'story-scenes'
  | 'cartoon-host'
  | 'flow-steps'
  | 'gauge-tone'
  | 'checklist-cards'
  | 'dialogue-upgrade'
  | 'timeline-track'
  | 'spatial-contrast'
  | 'avatar-dialogue'
  | 'clock-spotlight'
  | 'phrase-icon-split'
  | 'p168-quiz-formula'
  | 'p168-grammar-formula'
  | 'p168-pronunciation'
  | 'p168-situations'
  | 'p168-slider-compare'
  | 'word-reveal'
  | '3d-shapes'
  | 'custom';

export interface CustomComponentPresetConfig {
  variant: IllustrationVariant;
  sceneIcon?: IllustrationSceneIcon;
  title?: string;
  subtitle?: string;
  speechText?: string;
  labels?: string[];
  highlightWord?: string;
  formula?: string;
  accentColor?: string;
  cardBgColor?: string;
  cardTextColor?: string;
  showStrip?: boolean;
  showToneMeter?: boolean;
  showSentenceCard?: boolean;
  illustrationY?: number;
}

export interface SentenceCardProps {
  kind: 'sentence-card';
  text: string;
  subtext?: string;
  badge?: 'check' | 'cross' | 'question' | 'none';
  stampText?: string;
  stampColor?: string;
  emphasisWord?: string;
  emphasisColor?: string;
  strikethrough?: boolean;
  bgColor?: string;
  textColor?: string;
}

export interface ToneMeterProps {
  kind: 'tone-meter';
  title: string;
  leftLabel: string;
  rightLabel: string;
  valueStart: number; // 0..1
  valueEnd: number; // 0..1
  animateStart: number;
  animateEnd: number;
}

export interface WordStackProps {
  kind: 'word-stack';
  rows: WordStackRow[];
}

export interface Shape3DProps {
  kind: 'shape-3d';
  shapeType: Shape3DType;
  fill: string;
  shadow: boolean;
  highlight: boolean;
  depth: number;
  cornerRadius: number;
  textContent?: string;
  textColor?: string;
  textSize?: TextSizeRole;
  textWeight?: TextWeightRole;
  stepLabels?: string[];
}

export interface KaraokeCardProps {
  kind: 'karaoke-card';
  cueId: string;
  words: WordTiming[];
  activeColor: string;
  inactiveColor: string;
  spokenColor: string;
  variant?: 'white-card' | 'dark-bar' | 'plain-shadow' | 'yellow-pill';
  helperText?: string;
}

export type SceneElementProps =
  | ComparisonStripProps
  | TopicPillProps
  | IllustrationPropProps
  | SentenceCardProps
  | ToneMeterProps
  | WordStackProps
  | Shape3DProps
  | KaraokeCardProps;

export interface SceneElement {
  id: string;
  type: SceneElementType;
  label: string;
  startTime: number;
  endTime: number;
  enterAnimation: EnterAnimation;
  exitAnimation: ExitAnimation;
  layout: ElementLayout;
  props: SceneElementProps;
  atWordIndex?: number;
}

export type WatermarkCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface WatermarkOutroConfig {
  watermarkEnabled: boolean;
  watermarkText: string;
  watermarkCorner: WatermarkCorner;
  watermarkOpacity: number; // 0.15..1.0
  outroSeconds: number; // 0..10
  outroLine1: string;
  outroLine2: string;
  introSeconds?: number; // 0..6
  introBadge?: string;
  introTitle?: string;
  introSubtitle?: string;
}

export interface TitleOverlayLayout {
  x?: number;
  y?: number;
  scale?: number;
  hidden?: boolean;
}

export interface LessonProject {
  id: string;
  title: string;
  subtitle: string;
  theme: CanvasThemeId;
  compositionId?: LayoutCompositionId;
  backgroundImage?: BackgroundImageConfig;
  subtitleConfig?: SubtitleDisplayConfig;
  watermark?: WatermarkOutroConfig;
  titleLayout?: TitleOverlayLayout;
  duration: number;
  fps: 30 | 60;
  aspectRatio?: ExportAspectRatioId;
  cues: TranscriptCue[];
  elements: SceneElement[];
  audioFileName?: string;
}

export interface ScenePlanShape {
  type: Shape3DType;
  position: { x: number; y: number; w: number; h: number };
  fill: string;
  shadow?: boolean;
  highlight?: boolean;
  depth?: number;
  corner_radius?: number;
  at: number;
  until?: number;
  step_labels?: string[];
}

export interface ScenePlanText {
  content: string;
  shape_index?: number;
  position?: { x: number; y: number; w?: number };
  style?: {
    size?: TextSizeRole;
    color?: string;
    weight?: TextWeightRole;
    align?: 'left' | 'center' | 'right';
  };
  at: number;
  until?: number;
}

export interface ScenePlanEntry {
  id?: string;
  scene_id?: string;
  shapes?: ScenePlanShape[];
  texts?: ScenePlanText[];
}

export interface ScenePlanDocument {
  scenes: ScenePlanEntry[];
}

export interface ThemePalette {
  id: CanvasThemeId;
  name: string;
  isDark?: boolean;
  bgTop: string;
  bgBottom: string;
  glowA: string;
  glowB: string;
  cardBg: string;
  textPrimary: string;
  textMuted: string;
  accentBlue: string;
}

export const CANVAS_THEMES: Record<CanvasThemeId, ThemePalette> = {
  'pastel-sunrise': {
    id: 'pastel-sunrise',
    name: 'Pastel Nắng Sớm',
    bgTop: '#F5F3FF',
    bgBottom: '#FFF5EB',
    glowA: '#E9E2FF',
    glowB: '#FFE4D6',
    cardBg: '#FFFFFF',
    textPrimary: '#111827',
    textMuted: '#9CA3AF',
    accentBlue: '#2563EB',
  },
  'soft-lavender': {
    id: 'soft-lavender',
    name: 'Oải Hương Mềm',
    bgTop: '#EEF2FF',
    bgBottom: '#FAF5FF',
    glowA: '#DDD6FE',
    glowB: '#E0E7FF',
    cardBg: '#FFFFFF',
    textPrimary: '#0F172A',
    textMuted: '#94A3B8',
    accentBlue: '#4F46E5',
  },
  'mint-breeze': {
    id: 'mint-breeze',
    name: 'Bạc Hà Dịu Mát',
    bgTop: '#ECFDF5',
    bgBottom: '#F0F9FF',
    glowA: '#D1FAE5',
    glowB: '#E0F2FE',
    cardBg: '#FFFFFF',
    textPrimary: '#0F172A',
    textMuted: '#94A3B8',
    accentBlue: '#0284C7',
  },
  'warm-paper': {
    id: 'warm-paper',
    name: 'Giấy Kem Editorial',
    bgTop: '#FAF8F5',
    bgBottom: '#F3EFEA',
    glowA: '#FDE68A',
    glowB: '#FED7AA',
    cardBg: '#FFFFFF',
    textPrimary: '#1C1917',
    textMuted: '#A8A29E',
    accentBlue: '#D97706',
  },
  'studio-slate': {
    id: 'studio-slate',
    name: 'Nền Tối Studio Tối Giản',
    isDark: true,
    bgTop: '#111827',
    bgBottom: '#1E293B',
    glowA: 'rgba(56, 189, 248, 0.14)',
    glowB: 'rgba(99, 102, 241, 0.12)',
    cardBg: '#1E293B',
    textPrimary: '#F8FAFC',
    textMuted: '#94A3B8',
    accentBlue: '#38BDF8',
  },
};

export function isDarkCanvasTheme(themeId: CanvasThemeId | undefined | string): boolean {
  if (!themeId) return false;
  return Boolean((CANVAS_THEMES as Record<string, ThemePalette>)[themeId]?.isDark);
}
