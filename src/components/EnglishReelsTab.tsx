import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  CopyPlus,
  Download,
  ExternalLink,
  FileText,
  Film,
  Globe,
  HelpCircle,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Plus,
  Power,
  RotateCcw,
  Sparkles,
  Stamp,
  Square,
  Trash2,
  Type,
  Upload,
  Volume2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { downloadTextAsPlainFile } from '../utils/safeFileDownload';
import { BACKGROUND_PRESETS } from '../engine/backgroundPresets';
import {
  ensureProjectAssetsLoaded,
  getEffectiveIntroSeconds,
  getStageDimensionsForAspect,
  hitTestCanvasOverlayZone,
  hitTestElementLayout,
  renderProjectFrame,
  resolveElementLayoutForAspect,
  resolveLessonTitleBox,
  seekBackgroundVideoTo,
  subscribeBgImageLoaded,
} from '../engine/canvasRenderer';
import {
  detectActiveStageOverlaps,
  reflowElementsAvoidingOverlap,
} from '../engine/layoutSolver';
import {
  subscribeCartoonAnimations,
  syncCartoonAnimationsFromServer,
  upsertCartoonAnimation,
} from '../engine/cartoonAnimationDb';
import {
  detectVoiceLangCode,
  isMultilingualVoiceId,
  normalizeTtsLangCode,
  pickExplanationDefaultVoice,
  pickLearningDefaultVoice,
  splitMixedLanguageTtsSpans,
} from '../engine/bilingualTtsHelper';
import { notifyEdgeFallbackToGoogle } from '../utils/ttsFallbackNotice';
import { resyncProjectTimingToCues } from '../engine/autoChoreographer';
import {
  buildAiCreatorWebAiPrompt,
  buildEnglishReelsWebAiPrompt,
  buildReelCardsRuleBased,
  buildSpeakerVoiceMap,
  buildStarterLessonForLanguage,
  buildTranslationCardsFromInput,
  buildTranslationChallengePrompt,
  CREATOR_FORMAT_OPTIONS,
  CreatorFormatCategory,
  estimateCardSpeechDuration,
  getLevelsForLearningLanguage,
  getQuizCardSpeechParts,
  getReelLocaleStrings,
  inferLearningLangFromCards,
  LEARNING_LANGUAGE_OPTIONS,
  LearningLanguageId,
  parseEnglishReelsAiJson,
  recommendCreatorItemCount,
  recommendTranslationItemCount,
  ReelCard,
  ReelCardTimingMeta,
  ReelCardType,
  ReelCardVisualConfig,
  ReelCreationMode,
  ReelMode,
  ReelScrapeResult,
  reelCardsToLessonProject,
  isStarterSampleTitle,
  sanitizeTtsSpeech,
  STARTER_SAMPLE_TITLE_PREFIX,
} from '../engine/englishReelsEngine';
import { LAYOUT_COMPOSITIONS } from '../engine/illustrationLayouts';
import {
  ASPECT_RATIO_OPTIONS,
  DEFAULT_MP4_EXPORT_SETTINGS,
  estimateMp4FileSize,
  ExportAspectRatioId,
  ExportFpsOption,
  ExportQualityId,
  ExportResolutionId,
  QUALITY_OPTIONS,
  RESOLUTION_OPTIONS,
  resolveDimensionsForAspect,
} from '../engine/mp4Config';
import { ShutdownCountdownBanner } from '../utils/systemShutdownHelper';
import { ExportAbortedError, exportProjectToVideo } from '../engine/mp4Exporter';
import {
  buildLeveledOutputStem,
  cleanDownloadFileName,
  TAB_OUTPUT_SUBFOLDERS,
} from '../engine/outputNaming';
import { FlexibleSceneDocument } from '../engine/scenePlanAdapter';
import { adjustCuesTiming } from '../engine/transcriptParser';
import {
  resyncCuesToAudioFile,
  synthesizeAudioWithProgressJob,
} from '../engine/ttsSyncHelper';
import {
  DEFAULT_BGM_PRESET,
  DEFAULT_BGM_VOLUME,
  extractCountdownWindowsFromElements,
  mixVoiceWithBgmPreset,
  STUDIO_BGM_PRESETS,
  StudioBgmPresetId,
} from '../engine/audioMixHelper';
import {
  buildVideoDescription,
  VideoDescriptionStyle,
} from '../engine/videoDescriptionBuilder';
import {
  playCountdownRevealChime,
  playCountdownTickSound,
  playExportCompleteSound,
} from '../utils/soundEffects';
import { cleanReadingWorksheetInput } from '../engine/readingPromptBuilder';
import {
  BackgroundFitMode,
  BackgroundImageConfig,
  BackgroundPresetId,
  CANVAS_THEMES,
  CanvasThemeId,
  CartoonAnimationParams,
  ElementLayout,
  IllustrationSceneIcon,
  IllustrationVariant,
  LayoutCompositionId,
  LessonProject,
  SceneElement,
  SubtitleBoxStyle,
  SubtitlePosition,
  SubtitleSize,
  TitleOverlayLayout,
  TranscriptCue,
  WatermarkCorner,
  WatermarkOutroConfig,
} from '../engine/types';
import {
  ALL_SCENE_ICONS,
  getEffectiveVectorCatalog,
} from '../engine/vectorComponentDb';
import { ApiKeyInlineControl } from './ApiKeyInlineControl';
import { TtsProviderInfo } from './AudioSubtitleStudioModal';
import { CartoonAnimationStudioModal } from './CartoonAnimationStudioModal';
import { emitOutputUpdated } from './GlobalOutputPanel';
import { InlinePreviewElementEditor, StageOverlayZone } from './InlinePreviewElementEditor';
import { PasteButton } from './PasteButton';
import { buildApiKeyHeaders, useClientApiKeys } from '../utils/apiKeysStore';
import { resizeImageFileToStageDataUrl } from '../utils/imageResize';
import {
  loadPersistedSettings,
  PersistedReelsModeSettings,
  PersistedStudioSettings,
  resolveReelsModeSettings,
  updatePersistedSettings,
  USER_SETTINGS_HYDRATED_EVENT,
  USER_SETTINGS_RESET_EVENT,
} from '../utils/studioSettingsStore';
import {
  clearReelsDraftInterruptFlag,
  loadReelsDraftCheckpoint,
  ReelsDraftCheckpoint,
  saveReelsDraftCheckpoint,
} from '../engine/renderCheckpointStore';
import {
  abortRenderTaskSlot,
  checkRenderConcurrencyConflict,
  ConcurrencyConflictInfo,
  finishRenderTaskSlot,
  getActiveBlockingTaskFromMap,
  getAppTabForSlot,
  getRenderTask,
  getRenderTasksSnapshot,
  RenderTaskSlotId,
  requestNavigateToTaskSlot,
  startRenderTaskSlot,
  subscribeTaskNavigation,
  updateRenderTaskSlot,
  useRenderTasks,
} from '../engine/renderTaskManager';

interface EnglishReelsTabProps {
  onSendToStudio: (project: LessonProject, audioFile: File | null) => void;
}

const SAMPLE_ARTICLE_TEXT = `## Hotel Check-in & Polite Requests
When arriving at a hotel, polite requests sound much warmer than direct commands.
1. I'd like to check in under the name Alex Morgan.
2. Could we have a quiet room on a higher floor?
3. What time is breakfast served tomorrow morning?

True / False Quiz
Q1. Direct commands like "Give me the room key" always sound friendlier than "Could I have".
(A) True
(B) False
Answer: B
Explanation: Modal verbs like "Could I" soften the request and sound polite in hospitality English.`;

function base64ToMp3File(base64: string, fileName: string): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], fileName, { type: 'audio/mpeg' });
}

async function parseApiJson<T = Record<string, any>>(
  res: Response,
  fallbackError: string,
): Promise<T> {
  const raw = await res.text();
  const trimmed = raw.trim();
  if (!trimmed) {
    if (!res.ok) throw new Error(`${fallbackError} (HTTP ${res.status})`);
    return {} as T;
  }
  if (trimmed.startsWith('<')) {
    throw new Error(`Server trả về HTML (HTTP ${res.status}) thay vì JSON.`);
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(res.ok ? `${fallbackError}: JSON không hợp lệ.` : `${fallbackError} (HTTP ${res.status})`);
  }
}

function getLearningVoiceLangFallback(lang: LearningLanguageId): string {
  switch (lang) {
    case 'zh':
      return 'zh-CN';
    case 'ja':
      return 'ja-JP';
    case 'ko':
      return 'ko-KR';
    case 'fr':
      return 'fr-FR';
    case 'es':
      return 'es-ES';
    default:
      return 'en-US';
  }
}

function pickVoiceIdForProviderAndLang(
  provider: string,
  learningLang: LearningLanguageId,
  voices: Array<{ id: string; label: string; lang: string }>,
): string {
  const fallbackEdge = pickLearningDefaultVoice(learningLang);
  if (!voices.length) return fallbackEdge;
  const targetLang = getLearningVoiceLangFallback(learningLang).toLowerCase();
  const shortLang = targetLang.split('-')[0];
  if (provider === 'google') {
    const gMatch =
      voices.find((v) => v.id.toLowerCase() === targetLang) ||
      voices.find((v) => v.id.toLowerCase().startsWith(shortLang)) ||
      voices.find((v) => v.lang.toLowerCase().startsWith(shortLang));
    return gMatch?.id || voices[0].id;
  }
  const exactEdge = voices.find((v) => v.id === fallbackEdge);
  if (exactEdge) return exactEdge.id;
  const langMatch =
    voices.find((v) => v.lang.toLowerCase() === targetLang) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(shortLang));
  return langMatch?.id || voices[0].id;
}

function formatTargetLangDisplay(
  targetLang: string,
  learningLang: LearningLanguageId = 'en',
): string {
  if (targetLang === 'learning') {
    const label =
      LEARNING_LANGUAGE_OPTIONS.find((l) => l.id === learningLang)?.nativeName ||
      learningLang.toUpperCase();
    return `ngôn ngữ muốn học (${label})`;
  }
  return targetLang;
}

const DEFAULT_REELS_WATERMARK: WatermarkOutroConfig = {
  watermarkEnabled: false,
  watermarkText: '@EnglishReels',
  watermarkCorner: 'bottom-right',
  watermarkOpacity: 0.7,
  outroSeconds: 0,
  outroLine1: 'Thanks for watching!',
  outroLine2: 'Follow for more English tips',
};

interface ElementLayoutOverride {
  x: number;
  y: number;
  width?: number;
  height?: number;
  scale?: number;
}

interface ReelsModeWorkspaceSnapshot {
  cards: ReelCard[];
  lessonTitle: string;
  manualTitleEdited: boolean;
  hasCustomCards: boolean;
  mode: ReelMode;
  rawText: string;
  urlInput: string;
  scrapeResult: ReelScrapeResult | null;
  pastedAiJson: string;
  aiJsonError: string | null;
  aiJsonNotice: string | null;
  sceneJsonOverride: FlexibleSceneDocument | null;
  generatedAudioFile: File | null;
  generatedAudioUrl: string | null;
  generatedDurations: number[] | undefined;
  generatedTimings: ReelCardTimingMeta[] | undefined;
  customSyncedCues: TranscriptCue[] | null;
  syncedTimingOffsetMs: number;
  syncedSpeedFactor: number;
  synthesizedAudioSig: string;
  activeCardIdx: number;
  videoTime: number;
  previewViewMode: 'video' | 'cards';
  layoutOverridesByAspect: Partial<
    Record<ExportAspectRatioId, Record<string, ElementLayoutOverride>>
  >;
  hiddenElementIds: string[];
  selectedPreviewElementId: string | null;
  includeQuizInPrompt: 'auto' | 'always' | 'none';
  targetLang: string;
  ttsProvider: string;
  ttsVoice: string;
  enableLearningAudio: boolean;
  enableDualTts: boolean;
  splitAudioByRole: boolean;
  explanationTtsVoice: string;
  ttsRate: number;
  reelsAspectRatio: ExportAspectRatioId;
  selectedTheme: CanvasThemeId;
  selectedComposition: LayoutCompositionId;
  subtitlePosition: SubtitlePosition;
  subtitleSize: SubtitleSize;
  subtitleBoxStyle: SubtitleBoxStyle;
  backgroundImage: BackgroundImageConfig | undefined;
  bgmPreset: StudioBgmPresetId;
  bgmVolume: number;
  customBgmFile: File | null;
  enableCountdownSfx: boolean;
  descriptionStyle: VideoDescriptionStyle;
  watermarkConfig: WatermarkOutroConfig;
  mp4Resolution: ExportResolutionId;
  mp4Quality: ExportQualityId;
  mp4Fps: ExportFpsOption;
}

export const EnglishReelsTab: React.FC<EnglishReelsTabProps> = ({ onSendToStudio }) => {
  const [initialReelsSaved] = useState(() => loadPersistedSettings().reels);
  const initialCreationMode: ReelCreationMode = initialReelsSaved?.reelCreationMode || 'source';
  const [initialModeSaved] = useState<PersistedReelsModeSettings>(() =>
    resolveReelsModeSettings(initialReelsSaved, initialCreationMode),
  );
  const skipNextPersistRef = useRef(false);
  const hasMountedPersistRef = useRef(false);
  const hasCustomCardsRef = useRef(
    Boolean(initialReelsSaved?.rawText && initialReelsSaved.rawText !== SAMPLE_ARTICLE_TEXT),
  );
  const manualTitleEditedRef = useRef(
    Boolean(
      initialReelsSaved?.lessonTitle &&
        initialReelsSaved.lessonTitle !== 'Hotel Check-in & Polite Requests' &&
        !isStarterSampleTitle(initialReelsSaved.lessonTitle),
    ),
  );
  const modeWorkspacesRef = useRef<Partial<Record<ReelCreationMode, ReelsModeWorkspaceSnapshot>>>({});
  const videoBgBlobUrlRef = useRef<string | null>(null);
  const createdAudioUrlsRef = useRef<Set<string>>(new Set());

  // ── 1. Creation Mode, URL Scraper & Content ───────────────────────────────
  const [reelCreationMode, setReelCreationMode] = useState<ReelCreationMode>(initialCreationMode);
  const [sourceDurationMinutes, setSourceDurationMinutes] = useState<number>(
    () => initialReelsSaved?.sourceDurationMinutes ?? 2,
  );
  const [creatorTopicHint, setCreatorTopicHint] = useState(
    () => initialReelsSaved?.creatorTopicHint || '',
  );
  const [creatorScriptInput, setCreatorScriptInput] = useState('');
  const [creatorFormat, setCreatorFormat] = useState<CreatorFormatCategory>(
    () => initialReelsSaved?.creatorFormat || 'auto',
  );
  const [creatorLearningLang, setCreatorLearningLang] = useState<LearningLanguageId>(
    () => initialReelsSaved?.creatorLearningLang || 'en',
  );
  const [creatorLevel, setCreatorLevel] = useState<string>(
    () => initialReelsSaved?.creatorLevel || 'B1',
  );
  const [creatorDurationMinutes, setCreatorDurationMinutes] = useState<number>(
    () => initialReelsSaved?.creatorDurationMinutes ?? 1,
  );
  const [creatorItemCount, setCreatorItemCount] = useState<number>(
    () => initialReelsSaved?.creatorItemCount ?? 8,
  );
  const [creatorAutoItemCount, setCreatorAutoItemCount] = useState<boolean>(
    () => initialReelsSaved?.creatorAutoItemCount ?? true,
  );
  const [translationTopicHint, setTranslationTopicHint] = useState(
    () => initialReelsSaved?.translationTopicHint || '',
  );
  const [translationCustomLines, setTranslationCustomLines] = useState(
    () => initialReelsSaved?.translationCustomLines || '',
  );
  const [translationLearningLang, setTranslationLearningLang] = useState<LearningLanguageId>(
    () => initialReelsSaved?.translationLearningLang || 'en',
  );
  const [translationLevel, setTranslationLevel] = useState<string>(
    () => initialReelsSaved?.translationLevel || 'B1',
  );
  const [translationDurationMinutes, setTranslationDurationMinutes] = useState<number>(
    () => initialReelsSaved?.translationDurationMinutes ?? 2,
  );
  const [translationThinkSec, setTranslationThinkSec] = useState<number>(
    () => initialReelsSaved?.translationThinkSec ?? 4,
  );
  const [translationRepeatCount, setTranslationRepeatCount] = useState<number>(
    () => initialReelsSaved?.translationRepeatCount ?? 2,
  );
  const [translationItemCount, setTranslationItemCount] = useState<number>(
    () => initialReelsSaved?.translationItemCount ?? 6,
  );
  const [translationAutoItemCount, setTranslationAutoItemCount] = useState<boolean>(
    () => initialReelsSaved?.translationAutoItemCount ?? true,
  );
  const [translationIncludeNuance, setTranslationIncludeNuance] = useState<boolean>(
    () => initialReelsSaved?.translationIncludeNuance ?? true,
  );
  const [includeQuizInPrompt, setIncludeQuizInPrompt] = useState<'auto' | 'always' | 'none'>(
    () => initialModeSaved.includeQuizInPrompt || 'auto',
  );

  const [urlInput, setUrlInput] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scrapeResult, setScrapeResult] = useState<ReelScrapeResult | null>(null);

  const [initialStarter] = useState(() => {
    const savedMode = initialCreationMode;
    const savedExpl = initialModeSaved.targetLang || 'Tiếng Việt';
    if (savedMode === 'translation' && !initialReelsSaved?.rawText) {
      return buildTranslationCardsFromInput({
        topicHint: initialReelsSaved?.translationTopicHint,
        customInputLines: initialReelsSaved?.translationCustomLines,
        learningLanguage: initialReelsSaved?.translationLearningLang || 'en',
        level: initialReelsSaved?.translationLevel || 'B1',
        itemCount: initialReelsSaved?.translationItemCount ?? 6,
        targetLang: savedExpl,
        thinkSec: initialReelsSaved?.translationThinkSec ?? 4,
        repeatCount: initialReelsSaved?.translationRepeatCount ?? 2,
        includeNuanceTip: initialReelsSaved?.translationIncludeNuance ?? true,
      });
    }
    const savedLang = initialReelsSaved?.creatorLearningLang || 'en';
    const savedLevel = initialReelsSaved?.creatorLevel;
    if (savedLang !== 'en' && !initialReelsSaved?.rawText) {
      return buildStarterLessonForLanguage(savedLang, savedExpl, savedLevel);
    }
    return null;
  });

  const [lessonTitle, setLessonTitle] = useState(
    () =>
      initialReelsSaved?.lessonTitle ||
      initialStarter?.title ||
      'Hotel Check-in & Polite Requests',
  );
  const [parsedLessonLevel, setParsedLessonLevel] = useState<string>('');
  const [rawText, setRawText] = useState(() => initialReelsSaved?.rawText || SAMPLE_ARTICLE_TEXT);
  const [mode, setMode] = useState<ReelMode>(
    () => initialStarter?.mode || initialModeSaved.mode || 'auto',
  );
  const [targetLang, setTargetLang] = useState(
    () => initialModeSaved.targetLang || 'Tiếng Việt',
  );

  // ── 2. Web AI Prompt & JSON Paste ──────────────────────────────────────────
  const [pastedAiJson, setPastedAiJson] = useState('');
  const [aiJsonError, setAiJsonError] = useState<string | null>(null);
  const [aiJsonNotice, setAiJsonNotice] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [sceneJsonOverride, setSceneJsonOverride] = useState<FlexibleSceneDocument | null>(null);

  // ── 3. Cards Editor State ──────────────────────────────────────────────────
  const [cards, setCards] = useState<ReelCard[]>(() => {
    if (initialStarter) return initialStarter.cards;
    if (initialCreationMode === 'translation') {
      return buildTranslationCardsFromInput({
        topicHint: initialReelsSaved?.translationTopicHint,
        customInputLines: initialReelsSaved?.translationCustomLines,
        learningLanguage: initialReelsSaved?.translationLearningLang || 'en',
        level: initialReelsSaved?.translationLevel || 'B1',
        itemCount: initialReelsSaved?.translationItemCount ?? 6,
        targetLang: initialModeSaved.targetLang || 'Tiếng Việt',
        thinkSec: initialReelsSaved?.translationThinkSec ?? 4,
        repeatCount: initialReelsSaved?.translationRepeatCount ?? 2,
        includeNuanceTip: initialReelsSaved?.translationIncludeNuance ?? true,
      }).cards;
    }
    const textToBuild = initialReelsSaved?.rawText || SAMPLE_ARTICLE_TEXT;
    return buildReelCardsRuleBased(textToBuild, {
      title: initialReelsSaved?.lessonTitle || 'Hotel Check-in & Polite Requests',
      mode: initialModeSaved.mode || 'auto',
      targetLang: initialModeSaved.targetLang || 'Tiếng Việt',
      includeQuiz: (initialModeSaved.includeQuizInPrompt || 'auto') !== 'none',
    }).cards;
  });
  const [activeCardIdx, setActiveCardIdx] = useState(0);

  // ── 4. TTS Multi-Provider & Live Video Render State ────────────────────────
  const [ttsProviders, setTtsProviders] = useState<TtsProviderInfo[]>([]);
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [hasElevenLabsKey, setHasElevenLabsKey] = useState(false);
  const [ttsProvider, setTtsProvider] = useState(() => initialModeSaved.ttsProvider || 'auto');
  const [ttsVoice, setTtsVoice] = useState(() => {
    const savedLang =
      initialCreationMode === 'creator'
        ? initialReelsSaved?.creatorLearningLang || 'en'
        : initialCreationMode === 'translation'
          ? initialReelsSaved?.translationLearningLang || 'en'
          : 'en';
    const savedVoice = initialModeSaved.ttsVoice;
    if (
      savedVoice &&
      (isMultilingualVoiceId(savedVoice) || savedLang === 'en' || detectVoiceLangCode(savedVoice) === savedLang)
    ) {
      return savedVoice;
    }
    return pickLearningDefaultVoice(savedLang);
  });
  const [enableLearningAudio, setEnableLearningAudio] = useState(
    () => initialModeSaved.enableLearningAudio ?? true,
  );
  const [enableDualTts, setEnableDualTts] = useState(
    () => initialModeSaved.enableDualTts ?? true,
  );
  const [splitAudioByRole, setSplitAudioByRole] = useState(
    () => initialModeSaved.splitAudioByRole ?? true,
  );
  const [explanationTtsVoice, setExplanationTtsVoice] = useState(() => {
    const savedLang =
      initialCreationMode === 'creator'
        ? initialReelsSaved?.creatorLearningLang || 'en'
        : initialCreationMode === 'translation'
          ? initialReelsSaved?.translationLearningLang || 'en'
          : 'en';
    return (
      initialModeSaved.explanationTtsVoice ||
      pickExplanationDefaultVoice(initialModeSaved.targetLang || 'Tiếng Việt', savedLang)
    );
  });
  const [ttsRate, setTtsRate] = useState(() => initialModeSaved.ttsRate ?? 1.0);
  const [reelsAspectRatio, setReelsAspectRatio] = useState<ExportAspectRatioId>(
    () => initialModeSaved.reelsAspectRatio || '9:16',
  );
  const [selectedTheme, setSelectedTheme] = useState<CanvasThemeId>(
    () => initialModeSaved.selectedTheme || 'pastel-sunrise',
  );
  const [selectedComposition, setSelectedComposition] = useState<LayoutCompositionId>(
    () => initialModeSaved.selectedComposition || 'story-scenes',
  );
  const [subtitlePosition, setSubtitlePosition] = useState<SubtitlePosition>(
    () =>
      initialModeSaved.subtitlePosition ??
      (initialModeSaved.selectedComposition === 'plain' ? 'center' : 'bottom'),
  );
  const [subtitleSize, setSubtitleSize] = useState<SubtitleSize>(
    () =>
      initialModeSaved.subtitleSize ??
      (initialModeSaved.selectedComposition === 'plain' ? 'lg' : 'md'),
  );
  const [subtitleBoxStyle, setSubtitleBoxStyle] = useState<SubtitleBoxStyle>(
    () =>
      initialModeSaved.subtitleBoxStyle ??
      (initialModeSaved.selectedComposition === 'plain' ? 'clean' : 'card'),
  );
  const [backgroundImage, setBackgroundImage] = useState<BackgroundImageConfig | undefined>(() => {
    const pid = initialModeSaved.backgroundPresetId;
    if (!pid) return undefined;
    return {
      kind: 'preset',
      presetId: pid,
      scrimOpacity: 0.16,
      learningScrimOpacity: initialModeSaved.learningScrimOpacity ?? 0.42,
    };
  });
  const [isProcessingBg, setIsProcessingBg] = useState(false);
  const [bgUploadError, setBgUploadError] = useState<string | null>(null);
  const [bgAssetVersion, setBgAssetVersion] = useState(0);

  const [localIsGeneratingAudio, setLocalIsGeneratingAudio] = useState(false);
  const [isGeneratingAiCards, setIsGeneratingAiCards] = useState(false);
  const [isPreviewingVoice, setIsPreviewingVoice] = useState(false);
  const [isResyncingReels, setIsResyncingReels] = useState(false);
  const [localTtsProgress, setLocalTtsProgress] = useState(0);
  const [localTtsStageLabel, setLocalTtsStageLabel] = useState('');
  const [modeErrors, setModeErrors] = useState<Partial<Record<ReelCreationMode, string | null>>>({});
  const [modeNotices, setModeNotices] = useState<Partial<Record<ReelCreationMode, string | null>>>({});
  const [concurrencyConflict, setConcurrencyConflict] = useState<ConcurrencyConflictInfo | null>(null);
  const [interruptedDrafts, setInterruptedDrafts] = useState<
    Array<{ draft: ReelsDraftCheckpoint; audioFile: File | null }>
  >([]);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [bgmPreset, setBgmPreset] = useState<StudioBgmPresetId>(
    () => initialModeSaved.bgmPreset || DEFAULT_BGM_PRESET,
  );
  const [bgmVolume, setBgmVolume] = useState<number>(
    () => initialModeSaved.bgmVolume ?? DEFAULT_BGM_VOLUME,
  );
  const [customBgmFile, setCustomBgmFile] = useState<File | null>(null);
  const [enableCountdownSfx, setEnableCountdownSfx] = useState<boolean>(
    () => initialModeSaved.enableCountdownSfx ?? true,
  );
  const [descriptionStyle, setDescriptionStyle] = useState<VideoDescriptionStyle>(
    () => (initialModeSaved.descriptionStyle as VideoDescriptionStyle) || 'auto',
  );
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [copiedDescNotice, setCopiedDescNotice] = useState<'desc' | 'tags' | 'all' | null>(null);
  const [watermarkConfig, setWatermarkConfig] = useState<WatermarkOutroConfig>(() => ({
    ...DEFAULT_REELS_WATERMARK,
    ...(initialModeSaved.watermarkConfig || {}),
  }));
  const [isWatermarkExpanded, setIsWatermarkExpanded] = useState(false);

  // Live Video preview, interactive canvas layout editing & direct MP4 export state
  const [previewViewMode, setPreviewViewMode] = useState<'video' | 'cards'>(
    () => initialModeSaved.previewViewMode || 'video',
  );
  const [selectedPreviewElementId, setSelectedPreviewElementId] = useState<string | null>(null);
  const [selectedPreviewOverlayZone, setSelectedPreviewOverlayZone] =
    useState<StageOverlayZone | null>(null);
  const [selectedCardPreviewField, setSelectedCardPreviewField] = useState<
    | null
    | 'badge'
    | 'title'
    | 'content'
    | 'translation'
    | 'grammarNote'
    | 'quiz'
    | 'watermark'
  >(null);
  const [cartoonDbVersion, setCartoonDbVersion] = useState(0);
  const [reelsAnimStudioState, setReelsAnimStudioState] = useState<{
    isOpen: boolean;
    actionId?: string;
    spec?: Partial<CartoonAnimationParams>;
    cardIdx?: number;
  }>({ isOpen: false });
  const [layoutOverridesByAspect, setLayoutOverridesByAspect] = useState<
    Partial<Record<ExportAspectRatioId, Record<string, ElementLayoutOverride>>>
  >(() => initialModeSaved.layoutOverridesByAspect || {});
  const [hiddenElementIds, setHiddenElementIds] = useState<string[]>([]);
  const [titleLayoutByAspect, setTitleLayoutByAspect] = useState<
    Partial<Record<ExportAspectRatioId, TitleOverlayLayout | undefined>>
  >({});
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const [autoReflowOnMove, setAutoReflowOnMove] = useState(true);
  const [dismissedOverlapSig, setDismissedOverlapSig] = useState('');
  const dragStateRef = useRef<{
    id: string;
    offsetX: number;
    offsetY: number;
    width?: number;
    height?: number;
    scale?: number;
  } | null>(null);

  useEffect(() => {
    void syncCartoonAnimationsFromServer();
    return subscribeCartoonAnimations(() => setCartoonDbVersion((v) => v + 1));
  }, []);

  const [generatedAudioFile, setGeneratedAudioFile] = useState<File | null>(null);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [generatedDurations, setGeneratedDurations] = useState<number[] | undefined>(undefined);
  const [generatedTimings, setGeneratedTimings] = useState<ReelCardTimingMeta[] | undefined>(undefined);
  const [customSyncedCues, setCustomSyncedCues] = useState<TranscriptCue[] | null>(null);
  const [syncedTimingOffsetMs, setSyncedTimingOffsetMs] = useState(0);
  const [syncedSpeedFactor, setSyncedSpeedFactor] = useState(1);
  const [synthesizedAudioSig, setSynthesizedAudioSig] = useState<string>('');
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [videoTime, setVideoTime] = useState(0.5);
  const [mp4Resolution, setMp4Resolution] = useState<ExportResolutionId>(
    () => initialModeSaved.mp4Resolution || DEFAULT_MP4_EXPORT_SETTINGS.resolution,
  );
  const [mp4Quality, setMp4Quality] = useState<ExportQualityId>(
    () => initialModeSaved.mp4Quality || DEFAULT_MP4_EXPORT_SETTINGS.quality,
  );
  const [mp4Fps, setMp4Fps] = useState<ExportFpsOption>(
    () => initialModeSaved.mp4Fps || DEFAULT_MP4_EXPORT_SETTINGS.fps,
  );
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);
  const [autoShutdownAfterRender, setAutoShutdownAfterRender] = useState(false);
  const [shutdownCountdownInfo, setShutdownCountdownInfo] = useState<{
    active: boolean;
    title?: string;
  }>({ active: false });

  // Per-sub-tab isolated Render/TTS task states via shared renderTaskManager
  const renderTasks = useRenderTasks();
  const activeModeRef = useRef<ReelCreationMode>(reelCreationMode);
  activeModeRef.current = reelCreationMode;
  const exportAbortByModeRef = useRef<Partial<Record<ReelCreationMode, AbortController | null>>>({});

  const getReelsSlotId = (m: ReelCreationMode): RenderTaskSlotId =>
    m === 'creator' ? 'reels:creator' : m === 'translation' ? 'reels:translation' : 'reels:source';
  const currentSlotId = getReelsSlotId(reelCreationMode);
  const currentSlotTask = renderTasks[currentSlotId] ?? getRenderTask(currentSlotId);
  const isExportingVideo = currentSlotTask.status === 'rendering';
  const isGeneratingAudio = localIsGeneratingAudio || currentSlotTask.status === 'synthesizing';
  const exportProgress = isExportingVideo ? currentSlotTask.progress : 0;
  const exportStageLabel = isExportingVideo ? currentSlotTask.stageLabel : '';
  const ttsProgress =
    currentSlotTask.status === 'synthesizing'
      ? Math.round(currentSlotTask.progress * 100)
      : localTtsProgress;
  const ttsStageLabel =
    currentSlotTask.status === 'synthesizing' ? currentSlotTask.stageLabel : localTtsStageLabel;
  const otherActiveBlockingTask = useMemo(
    () => getActiveBlockingTaskFromMap(renderTasks, currentSlotId),
    [renderTasks, currentSlotId],
  );
  const studioError = modeErrors[reelCreationMode] ?? null;
  const exportNotice = modeNotices[reelCreationMode] ?? null;

  const setModeStudioError = (modeKey: ReelCreationMode, msg: string | null) => {
    setModeErrors((prev) => ({ ...prev, [modeKey]: msg }));
  };
  const setModeExportNotice = (modeKey: ReelCreationMode, msg: string | null) => {
    setModeNotices((prev) => ({ ...prev, [modeKey]: msg }));
  };
  const setStudioError = (msg: string | null) => setModeStudioError(activeModeRef.current, msg);
  const setExportNotice = (msg: string | null) => setModeExportNotice(activeModeRef.current, msg);
  const setTtsProgress = (pct: number) => setLocalTtsProgress(pct);
  const setTtsStageLabel = (lbl: string) => setLocalTtsStageLabel(lbl);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (!selectedPreviewElementId || isVideoPlaying || isExportingVideo || previewViewMode !== 'video') {
        return;
      }
      if (!stageContainerRef.current || stageContainerRef.current.offsetParent === null) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      const targetId = selectedPreviewElementId;
      setHiddenElementIds((prev) => (prev.includes(targetId) ? prev : [...prev, targetId]));
      setSelectedPreviewElementId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedPreviewElementId, isVideoPlaying, isExportingVideo, previewViewMode]);

  const currentAudioSignature = useMemo(
    () =>
      JSON.stringify({
        cards: cards.map((c) => ({
          id: c.id,
          type: c.type,
          sourcePrompt: c.sourcePrompt,
          ttsText: c.ttsText,
          explanationSpeech: c.explanationSpeech,
          translation: c.translation,
          content: c.content,
          ttsAnswerText: c.ttsAnswerText,
          options: c.options,
          answerIndex: c.answerIndex,
          thinkSec: c.thinkSec,
          repeatCount: c.repeatCount,
          explanation: c.explanation,
        })),
        ttsProvider,
        ttsVoice,
        enableLearningAudio,
        enableDualTts,
        splitAudioByRole,
        explanationTtsVoice,
        targetLang,
        ttsRate,
        bgmPreset,
        bgmVolume,
        customBgmName: customBgmFile?.name || '',
        customBgmSize: customBgmFile?.size || 0,
        enableCountdownSfx,
        outroSeconds: watermarkConfig.outroSeconds,
        outroLine1: watermarkConfig.outroLine1,
        outroLine2: watermarkConfig.outroLine2,
      }),
    [
      cards,
      ttsProvider,
      ttsVoice,
      enableLearningAudio,
      enableDualTts,
      splitAudioByRole,
      explanationTtsVoice,
      targetLang,
      ttsRate,
      bgmPreset,
      bgmVolume,
      customBgmFile,
      enableCountdownSfx,
      watermarkConfig.outroSeconds,
      watermarkConfig.outroLine1,
      watermarkConfig.outroLine2,
    ],
  );

  const videoCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewFullscreenContainerRef = useRef<HTMLDivElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const bgmFileInputRef = useRef<HTMLInputElement>(null);
  const lessonAudioRef = useRef<HTMLAudioElement>(null);
  const videoRafRef = useRef<number | null>(null);
  const lastRafTsRef = useRef<number | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const lastCountdownSfxKeyRef = useRef<string>('');
  const switchModeRef = useRef<((m: ReelCreationMode) => void) | null>(null);

  const togglePreviewFullscreen = () => {
    const el = previewFullscreenContainerRef.current;
    if (isPreviewFullscreen) {
      if (typeof document !== 'undefined' && document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
      }
      setIsPreviewFullscreen(false);
      return;
    }
    setIsPreviewFullscreen(true);
    if (el && typeof el.requestFullscreen === 'function') {
      void el.requestFullscreen().catch(() => {
        // Theater fixed overlay remains active if iframe restricts native fullscreen
      });
    }
  };

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        // Keep React fullscreen state coherent only when exiting native fullscreen
        setIsPreviewFullscreen((prev) => (prev ? false : prev));
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPreviewFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    const scanReelsRecovery = async () => {
      try {
        const modes: ReelCreationMode[] = ['source', 'creator', 'translation'];
        const results = await Promise.all(modes.map((m) => loadReelsDraftCheckpoint(m)));
        const pending = results.filter(
          (res): res is { draft: ReelsDraftCheckpoint; audioFile: File | null } =>
            Boolean(res && res.draft.activeRenderInterrupted && res.draft.cards.length > 0),
        );
        setInterruptedDrafts(pending);
      } catch {
        // ignore recovery scan failures
      }
    };
    void scanReelsRecovery();
  }, []);

  useEffect(() => {
    return subscribeTaskNavigation((slotId) => {
      const target = getAppTabForSlot(slotId);
      if (target.activeTab === 'reels' && target.reelsMode) {
        switchModeRef.current?.(target.reelsMode);
      }
    });
  }, []);

  useEffect(() => {
    const onHydrated = (ev: Event) => {
      const r = (ev as CustomEvent<PersistedStudioSettings>).detail?.reels;
      if (!r) return;
      skipNextPersistRef.current = true;
      modeWorkspacesRef.current = {};
      const hydratedMode: ReelCreationMode = r.reelCreationMode || 'source';
      const m = resolveReelsModeSettings(r, hydratedMode);
      setReelCreationMode(hydratedMode);
      if (r.creatorTopicHint !== undefined) setCreatorTopicHint(r.creatorTopicHint);
      if (r.creatorFormat) setCreatorFormat(r.creatorFormat);
      if (r.creatorLearningLang) setCreatorLearningLang(r.creatorLearningLang);
      if (r.creatorLevel) setCreatorLevel(r.creatorLevel);
      if (typeof r.sourceDurationMinutes === 'number') {
        setSourceDurationMinutes(r.sourceDurationMinutes);
      }
      if (typeof r.creatorDurationMinutes === 'number') {
        setCreatorDurationMinutes(r.creatorDurationMinutes);
      }
      if (typeof r.creatorItemCount === 'number') setCreatorItemCount(r.creatorItemCount);
      if (typeof r.creatorAutoItemCount === 'boolean') {
        setCreatorAutoItemCount(r.creatorAutoItemCount);
      }
      if (r.translationTopicHint !== undefined) setTranslationTopicHint(r.translationTopicHint);
      if (r.translationCustomLines !== undefined) setTranslationCustomLines(r.translationCustomLines);
      if (r.translationLearningLang) setTranslationLearningLang(r.translationLearningLang);
      if (r.translationLevel) setTranslationLevel(r.translationLevel);
      if (typeof r.translationDurationMinutes === 'number') {
        setTranslationDurationMinutes(r.translationDurationMinutes);
      }
      if (typeof r.translationThinkSec === 'number') setTranslationThinkSec(r.translationThinkSec);
      if (typeof r.translationRepeatCount === 'number') setTranslationRepeatCount(r.translationRepeatCount);
      if (typeof r.translationItemCount === 'number') setTranslationItemCount(r.translationItemCount);
      if (typeof r.translationAutoItemCount === 'boolean') {
        setTranslationAutoItemCount(r.translationAutoItemCount);
      }
      if (typeof r.translationIncludeNuance === 'boolean') setTranslationIncludeNuance(r.translationIncludeNuance);

      const hydratedLang: LearningLanguageId =
        hydratedMode === 'creator'
          ? r.creatorLearningLang || 'en'
          : hydratedMode === 'translation'
            ? r.translationLearningLang || 'en'
            : 'en';
      const nextLearningAudio = m.enableLearningAudio ?? true;
      const nextDualTts =
        !nextLearningAudio && m.enableDualTts === false ? true : (m.enableDualTts ?? true);
      setMode(m.mode || 'auto');
      setTargetLang(m.targetLang || 'Tiếng Việt');
      setTtsProvider(m.ttsProvider || 'auto');
      if (m.ttsVoice) setTtsVoice(m.ttsVoice);
      setEnableLearningAudio(nextLearningAudio);
      setEnableDualTts(nextDualTts);
      setSplitAudioByRole(m.splitAudioByRole ?? true);
      setExplanationTtsVoice(
        m.explanationTtsVoice ||
          pickExplanationDefaultVoice(m.targetLang || 'Tiếng Việt', hydratedLang),
      );
      setTtsRate(typeof m.ttsRate === 'number' ? m.ttsRate : 1.0);
      setReelsAspectRatio(m.reelsAspectRatio || '9:16');
      setSelectedTheme(m.selectedTheme || 'pastel-sunrise');
      setSelectedComposition(m.selectedComposition || 'story-scenes');
      setSubtitlePosition(
        m.subtitlePosition ?? (m.selectedComposition === 'plain' ? 'center' : 'bottom'),
      );
      setSubtitleSize(m.subtitleSize ?? (m.selectedComposition === 'plain' ? 'lg' : 'md'));
      setSubtitleBoxStyle(
        m.subtitleBoxStyle ?? (m.selectedComposition === 'plain' ? 'clean' : 'card'),
      );
      if (m.backgroundPresetId) {
        setBackgroundImage({
          kind: 'preset',
          presetId: m.backgroundPresetId,
          scrimOpacity: 0.16,
          learningScrimOpacity: typeof m.learningScrimOpacity === 'number' ? m.learningScrimOpacity : 0.42,
        });
      } else {
        setBackgroundImage(undefined);
      }
      setBgmPreset(m.bgmPreset || DEFAULT_BGM_PRESET);
      setBgmVolume(typeof m.bgmVolume === 'number' ? m.bgmVolume : DEFAULT_BGM_VOLUME);
      setEnableCountdownSfx(m.enableCountdownSfx ?? true);
      setDescriptionStyle((m.descriptionStyle as VideoDescriptionStyle) || 'auto');
      setWatermarkConfig({ ...DEFAULT_REELS_WATERMARK, ...(m.watermarkConfig || {}) });
      setMp4Resolution(m.mp4Resolution || DEFAULT_MP4_EXPORT_SETTINGS.resolution);
      setMp4Quality(m.mp4Quality || DEFAULT_MP4_EXPORT_SETTINGS.quality);
      setMp4Fps(m.mp4Fps || DEFAULT_MP4_EXPORT_SETTINGS.fps);
      setIncludeQuizInPrompt(m.includeQuizInPrompt || 'auto');
      setPreviewViewMode(m.previewViewMode || 'video');
      setLayoutOverridesByAspect(m.layoutOverridesByAspect || {});
      if (r.lessonTitle) setLessonTitle(r.lessonTitle);
      if (r.rawText) setRawText(r.rawText);

      if (hydratedMode === 'translation' && (!r.rawText || r.rawText === SAMPLE_ARTICLE_TEXT)) {
        const builtTr = buildTranslationCardsFromInput({
          topicHint: r.translationTopicHint,
          customInputLines: r.translationCustomLines,
          learningLanguage: r.translationLearningLang || 'en',
          level: r.translationLevel || 'B1',
          itemCount: r.translationItemCount ?? 6,
          targetLang: m.targetLang || 'Tiếng Việt',
          thinkSec: r.translationThinkSec ?? 4,
          repeatCount: r.translationRepeatCount ?? 2,
          includeNuanceTip: r.translationIncludeNuance ?? true,
        });
        setLessonTitle(r.lessonTitle || builtTr.title);
        setMode(builtTr.mode);
        setCards(builtTr.cards);
        setActiveCardIdx(0);
        hasCustomCardsRef.current = Boolean(r.translationCustomLines?.trim());
        const trLang = r.translationLearningLang || 'en';
        if (!m.ttsVoice || (!isMultilingualVoiceId(m.ttsVoice) && detectVoiceLangCode(m.ttsVoice) !== trLang)) {
          setTtsVoice(pickLearningDefaultVoice(trLang));
        }
      } else if (hydratedMode === 'creator' && r.creatorLearningLang && r.creatorLearningLang !== 'en' && !r.rawText) {
        const starter = buildStarterLessonForLanguage(
          r.creatorLearningLang,
          m.targetLang || 'Tiếng Việt',
          r.creatorLevel,
        );
        setLessonTitle(r.lessonTitle || starter.title);
        setMode(starter.mode);
        setCards(starter.cards);
        setActiveCardIdx(0);
        hasCustomCardsRef.current = false;
        if (!m.ttsVoice || (!isMultilingualVoiceId(m.ttsVoice) && detectVoiceLangCode(m.ttsVoice) !== r.creatorLearningLang)) {
          setTtsVoice(pickLearningDefaultVoice(r.creatorLearningLang));
        }
      } else if (r.rawText) {
        hasCustomCardsRef.current = r.rawText !== SAMPLE_ARTICLE_TEXT;
        const rebuilt = buildReelCardsRuleBased(r.rawText, {
          title: r.lessonTitle,
          mode: m.mode || 'auto',
          targetLang: m.targetLang || 'Tiếng Việt',
          includeQuiz: (m.includeQuizInPrompt || 'auto') !== 'none',
        });
        setCards(rebuilt.cards);
        setActiveCardIdx(0);
      }
    };

    const onReset = () => {
      skipNextPersistRef.current = true;
      hasCustomCardsRef.current = false;
      manualTitleEditedRef.current = false;
      modeWorkspacesRef.current = {};
      if (videoBgBlobUrlRef.current) {
        URL.revokeObjectURL(videoBgBlobUrlRef.current);
        videoBgBlobUrlRef.current = null;
      }
      setReelCreationMode('source');
      setSourceDurationMinutes(2);
      setCreatorTopicHint('');
      setCreatorFormat('auto');
      setCreatorLearningLang('en');
      setCreatorLevel('B1');
      setCreatorDurationMinutes(1);
      setCreatorItemCount(8);
      setCreatorAutoItemCount(true);
      setTranslationTopicHint('');
      setTranslationCustomLines('');
      setTranslationLearningLang('en');
      setTranslationLevel('B1');
      setTranslationDurationMinutes(2);
      setTranslationThinkSec(4);
      setTranslationRepeatCount(2);
      setTranslationItemCount(6);
      setTranslationAutoItemCount(true);
      setTranslationIncludeNuance(true);
      setIncludeQuizInPrompt('auto');
      setMode('auto');
      setTargetLang('Tiếng Việt');
      setTtsProvider('auto');
      setTtsVoice('en-US-JennyNeural');
      setEnableLearningAudio(true);
      setEnableDualTts(true);
      setSplitAudioByRole(true);
      setExplanationTtsVoice('vi-VN-HoaiMyNeural');
      setTtsRate(1.0);
      setReelsAspectRatio('9:16');
      setSelectedTheme('pastel-sunrise');
      setSelectedComposition('story-scenes');
      setSubtitlePosition('bottom');
      setSubtitleSize('md');
      setSubtitleBoxStyle('card');
      setBackgroundImage(undefined);
      setBgmPreset('lofi-calm');
      setBgmVolume(0.18);
      setWatermarkConfig(DEFAULT_REELS_WATERMARK);
      setMp4Resolution(DEFAULT_MP4_EXPORT_SETTINGS.resolution);
      setMp4Quality(DEFAULT_MP4_EXPORT_SETTINGS.quality);
      setMp4Fps(DEFAULT_MP4_EXPORT_SETTINGS.fps);
      setPreviewViewMode('video');
      setLayoutOverridesByAspect({});
      setHiddenElementIds([]);
      setSelectedPreviewElementId(null);
      setGeneratedAudioFile(null);
      setGeneratedAudioUrl(null);
      setGeneratedDurations(undefined);
      setGeneratedTimings(undefined);
      setCustomSyncedCues(null);
      setSynthesizedAudioSig('');
      setLessonTitle('Hotel Check-in & Polite Requests');
      setRawText(SAMPLE_ARTICLE_TEXT);
      setPastedAiJson('');
      setSceneJsonOverride(null);
      setCards(
        buildReelCardsRuleBased(SAMPLE_ARTICLE_TEXT, {
          title: 'Hotel Check-in & Polite Requests',
          mode: 'auto',
          targetLang: 'Tiếng Việt',
        }).cards,
      );
      setActiveCardIdx(0);
    };

    window.addEventListener(USER_SETTINGS_HYDRATED_EVENT, onHydrated);
    window.addEventListener(USER_SETTINGS_RESET_EVENT, onReset);
    return () => {
      window.removeEventListener(USER_SETTINGS_HYDRATED_EVENT, onHydrated);
      window.removeEventListener(USER_SETTINGS_RESET_EVENT, onReset);
      if (videoBgBlobUrlRef.current) {
        URL.revokeObjectURL(videoBgBlobUrlRef.current);
        videoBgBlobUrlRef.current = null;
      }
      createdAudioUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      createdAudioUrlsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!hasMountedPersistRef.current) {
      hasMountedPersistRef.current = true;
      return;
    }
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    const activeModeSnapshot: PersistedReelsModeSettings = {
      includeQuizInPrompt,
      mode,
      targetLang,
      ttsProvider,
      ttsVoice,
      enableLearningAudio,
      enableDualTts,
      splitAudioByRole,
      explanationTtsVoice,
      ttsRate,
      reelsAspectRatio,
      selectedTheme,
      selectedComposition,
      subtitlePosition,
      subtitleSize,
      subtitleBoxStyle,
      backgroundPresetId:
        backgroundImage?.kind === 'preset' ? backgroundImage.presetId || '' : '',
      learningScrimOpacity: backgroundImage?.learningScrimOpacity ?? 0.42,
      bgmPreset,
      bgmVolume,
      enableCountdownSfx,
      descriptionStyle,
      watermarkConfig,
      mp4Resolution,
      mp4Quality,
      mp4Fps,
      previewViewMode,
      layoutOverridesByAspect,
    };
    updatePersistedSettings({
      reels: {
        reelCreationMode,
        sourceDurationMinutes,
        creatorTopicHint,
        creatorFormat,
        creatorLearningLang,
        creatorLevel,
        creatorDurationMinutes,
        creatorItemCount,
        creatorAutoItemCount,
        translationTopicHint,
        translationCustomLines,
        translationLearningLang,
        translationLevel,
        translationDurationMinutes,
        translationItemCount,
        translationAutoItemCount,
        translationThinkSec,
        translationRepeatCount,
        translationIncludeNuance,
        lessonTitle,
        rawText,
        byMode: {
          [reelCreationMode]: activeModeSnapshot,
        },
      },
    });
  }, [
    reelCreationMode,
    sourceDurationMinutes,
    creatorTopicHint,
    creatorFormat,
    creatorLearningLang,
    creatorLevel,
    creatorDurationMinutes,
    creatorItemCount,
    creatorAutoItemCount,
    translationTopicHint,
    translationCustomLines,
    translationLearningLang,
    translationLevel,
    translationDurationMinutes,
    translationItemCount,
    translationAutoItemCount,
    translationThinkSec,
    translationRepeatCount,
    translationIncludeNuance,
    lessonTitle,
    rawText,
    includeQuizInPrompt,
    mode,
    targetLang,
    ttsProvider,
    ttsVoice,
    enableLearningAudio,
    enableDualTts,
    splitAudioByRole,
    explanationTtsVoice,
    ttsRate,
    reelsAspectRatio,
    selectedTheme,
    selectedComposition,
    subtitlePosition,
    subtitleSize,
    subtitleBoxStyle,
    backgroundImage,
    bgmPreset,
    bgmVolume,
    enableCountdownSfx,
    descriptionStyle,
    watermarkConfig,
    mp4Resolution,
    mp4Quality,
    mp4Fps,
    previewViewMode,
    layoutOverridesByAspect,
  ]);

  useEffect(() => {
    return subscribeBgImageLoaded(() => setBgAssetVersion((v) => v + 1));
  }, []);

  const handleUploadBgImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.currentTarget;
    const file = inputEl.files?.[0];
    if (!file) return;
    setBgUploadError(null);
    setIsProcessingBg(true);
    try {
      const isVideo =
        file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
      if (isVideo) {
        if (videoBgBlobUrlRef.current) {
          URL.revokeObjectURL(videoBgBlobUrlRef.current);
        }
        const blobUrl = URL.createObjectURL(file);
        videoBgBlobUrlRef.current = blobUrl;
        setBackgroundImage((prev) => ({
          kind: 'video',
          videoUrl: blobUrl,
          fileName: file.name,
          fit: prev?.fit ?? 'cover',
          scrimOpacity: prev?.scrimOpacity ?? 0.18,
          learningScrimOpacity: prev?.learningScrimOpacity ?? 0.42,
        }));
      } else {
        const config = await resizeImageFileToStageDataUrl(file, {
          fit: backgroundImage?.fit ?? 'cover',
          scrimOpacity: backgroundImage?.scrimOpacity ?? 0.22,
          aspectRatio: reelsAspectRatio,
        });
        setBackgroundImage((prev) => ({
          ...config,
          kind: 'image',
          learningScrimOpacity: prev?.learningScrimOpacity ?? 0.42,
        }));
      }
    } catch (err) {
      setBgUploadError(
        err instanceof Error
          ? err.message
          : 'Không thể đọc file nền. Hãy thử file PNG, JPG, WebP hoặc MP4/WebM.',
      );
    } finally {
      inputEl.value = '';
      setIsProcessingBg(false);
    }
  };

  const { keys: clientKeys } = useClientApiKeys();

  const refreshTtsVoices = () => {
    fetch('/api/tts/voices', { headers: buildApiKeyHeaders() })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.providers)) {
          setTtsProviders(data.providers);
          setHasGeminiKey(Boolean(data?.hasGeminiKey));
          setHasElevenLabsKey(Boolean(data?.hasElevenLabsKey));
        }
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    refreshTtsVoices();
  }, []);

  useEffect(() => {
    return () => {
      if (previewAudioUrl) URL.revokeObjectURL(previewAudioUrl);
    };
  }, [previewAudioUrl]);

  const effectiveHasGeminiKey = hasGeminiKey || Boolean(clientKeys.geminiApiKey);
  const effectiveHasElevenLabsKey = hasElevenLabsKey || Boolean(clientKeys.elevenlabsApiKey);

  const availableVoices = useMemo(() => {
    if (ttsProvider === 'auto') {
      return ttsProviders.flatMap((p) => {
        if (p.id === 'gemini' && !effectiveHasGeminiKey) return [];
        if (p.id === 'elevenlabs' && !effectiveHasElevenLabsKey) return [];
        return p.voices;
      });
    }
    return ttsProviders.find((p) => p.id === ttsProvider)?.voices ?? [];
  }, [ttsProviders, ttsProvider, effectiveHasGeminiKey, effectiveHasElevenLabsKey]);

  useEffect(() => {
    if (availableVoices.length > 0 && !availableVoices.some((v) => v.id === ttsVoice)) {
      const desiredLang =
        reelCreationMode === 'creator'
          ? creatorLearningLang
          : reelCreationMode === 'translation'
            ? translationLearningLang
            : 'en';
      setTtsVoice(pickVoiceIdForProviderAndLang(ttsProvider, desiredLang, availableVoices));
    }
  }, [availableVoices, ttsVoice, ttsProvider, reelCreationMode, creatorLearningLang, translationLearningLang]);

  const vectorCatalog = useMemo(() => getEffectiveVectorCatalog(), []);

  const stageDims = useMemo(() => getStageDimensionsForAspect(reelsAspectRatio), [reelsAspectRatio]);

  const applyElementLayoutOverrides = (proj: LessonProject): LessonProject => {
    const hiddenSet = hiddenElementIds.length > 0 ? new Set(hiddenElementIds) : null;
    const aspectKey = proj.aspectRatio || reelsAspectRatio;
    const overrides = layoutOverridesByAspect[aspectKey];
    if (!hiddenSet && (!overrides || Object.keys(overrides).length === 0)) return proj;
    const filtered = hiddenSet
      ? proj.elements.filter((el) => !hiddenSet.has(el.id))
      : proj.elements;
    return {
      ...proj,
      elements: filtered.map((el) => {
        const ov = overrides?.[el.id];
        if (!ov) return el;
        return {
          ...el,
          layout: {
            ...el.layout,
            x: ov.x,
            y: ov.y,
            ...(ov.width !== undefined ? { width: ov.width } : {}),
            ...(ov.height !== undefined ? { height: ov.height } : {}),
            ...(ov.scale !== undefined ? { scale: ov.scale } : {}),
            manualPosition: true,
          },
        };
      }),
    };
  };

  const activeLearningLang = useMemo<LearningLanguageId>(() => {
    const inferred = inferLearningLangFromCards(cards);
    const hasNonEnScript = cards.some(
      (c) =>
        (c.learningLang && c.learningLang !== 'en') ||
        /[\u3040-\u30ff\u4e00-\u9faf\uac00-\ud7af]/.test(`${c.title} ${c.content} ${c.ttsText || ''}`),
    );
    if (inferred !== 'en') return inferred;
    if (reelCreationMode === 'creator') {
      if (creatorLearningLang !== 'en' && !hasNonEnScript && cards.length > 0) {
        return 'en';
      }
      return creatorLearningLang;
    }
    if (reelCreationMode === 'translation') {
      if (translationLearningLang !== 'en' && !hasNonEnScript && cards.length > 0) {
        return 'en';
      }
      return translationLearningLang;
    }
    return inferred;
  }, [reelCreationMode, creatorLearningLang, translationLearningLang, cards]);

  const cardPreviewLocale = useMemo(
    () => getReelLocaleStrings(targetLang, activeLearningLang),
    [targetLang, activeLearningLang],
  );

  const previewProject = useMemo(() => {
    const baseProj = reelCardsToLessonProject(cards, {
      title: lessonTitle,
      theme: selectedTheme,
      aspectRatio: reelsAspectRatio,
      targetLang,
      learningLanguage: activeLearningLang,
      backgroundImage,
      subtitleConfig: {
        position: subtitlePosition,
        size: subtitleSize,
        boxStyle: subtitleBoxStyle,
      },
      compositionId:
        selectedComposition === 'cartoon-host'
          ? 'cartoon-host'
          : sceneJsonOverride?.compositionId || selectedComposition,
      cardDurationsSec:
        generatedDurations && generatedDurations.length === cards.length
          ? generatedDurations
          : undefined,
      cardTimings:
        generatedTimings && generatedTimings.length === cards.length
          ? generatedTimings
          : undefined,
      audioFileName: generatedAudioFile?.name,
      sceneJsonOverride,
      watermark: watermarkConfig,
      titleLayout: titleLayoutByAspect[reelsAspectRatio],
      enableLearningAudio,
      enableExplanationAudio: enableDualTts && targetLang !== 'none',
      hiddenElementIds,
    });
    if (
      !customSyncedCues &&
      syncedTimingOffsetMs === 0 &&
      Math.abs(syncedSpeedFactor - 1) < 0.001
    ) {
      return applyElementLayoutOverrides(baseProj);
    }
    const sourceCues =
      customSyncedCues && customSyncedCues.length === baseProj.cues.length
        ? customSyncedCues
        : baseProj.cues;
    const adjusted = adjustCuesTiming(sourceCues, {
      offsetMs: syncedTimingOffsetMs,
      speedFactor: syncedSpeedFactor,
    });
    return applyElementLayoutOverrides(
      resyncProjectTimingToCues(baseProj, adjusted, { resyncVisuals: true }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    cards,
    lessonTitle,
    selectedTheme,
    reelsAspectRatio,
    targetLang,
    activeLearningLang,
    backgroundImage,
    selectedComposition,
    subtitlePosition,
    subtitleSize,
    subtitleBoxStyle,
    generatedDurations,
    generatedTimings,
    generatedAudioFile?.name,
    sceneJsonOverride,
    watermarkConfig,
    customSyncedCues,
    syncedTimingOffsetMs,
    syncedSpeedFactor,
    layoutOverridesByAspect,
    hiddenElementIds,
    titleLayoutByAspect,
    enableLearningAudio,
    enableDualTts,
  ]);

  useEffect(() => {
    setVideoTime((prev) => Math.min(prev, Math.max(0.1, previewProject.duration)));
  }, [previewProject.duration]);

  useEffect(() => {
    if (previewViewMode !== 'video') return;
    let cancelled = false;
    void ensureProjectAssetsLoaded(previewProject).then(() => {
      if (!cancelled) {
        setBgAssetVersion((v) => v + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [previewProject, previewViewMode]);

  useEffect(() => {
    if (previewViewMode !== 'video' || isVideoPlaying || isExportingVideo) return;
    if (previewProject.backgroundImage?.kind !== 'video' || !previewProject.backgroundImage.videoUrl) return;
    let cancelled = false;
    void seekBackgroundVideoTo(previewProject.backgroundImage.videoUrl, videoTime).then(() => {
      if (!cancelled) {
        setBgAssetVersion((v) => v + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    previewViewMode,
    previewProject.backgroundImage?.kind,
    previewProject.backgroundImage?.videoUrl,
    videoTime,
    isVideoPlaying,
    isExportingVideo,
  ]);

  useEffect(() => {
    if (previewViewMode !== 'video') return;
    const canvas = videoCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const activeSelectToken =
      isVideoPlaying || isExportingVideo
        ? null
        : selectedPreviewOverlayZone === 'title'
          ? '__title__'
          : selectedPreviewElementId;
    renderProjectFrame(ctx, previewProject, videoTime, activeSelectToken);
  }, [
    previewProject,
    videoTime,
    previewViewMode,
    bgAssetVersion,
    selectedPreviewElementId,
    selectedPreviewOverlayZone,
    isVideoPlaying,
    isExportingVideo,
  ]);

  useEffect(() => {
    if (!isVideoPlaying) {
      if (videoRafRef.current !== null) cancelAnimationFrame(videoRafRef.current);
      lastRafTsRef.current = null;
      if (lessonAudioRef.current && !lessonAudioRef.current.paused) {
        lessonAudioRef.current.pause();
      }
      return;
    }

    if (lessonAudioRef.current && generatedAudioUrl) {
      lessonAudioRef.current.currentTime = videoTime;
      lessonAudioRef.current.play().catch(() => undefined);
    }

    const step = (now: number) => {
      if (lessonAudioRef.current && generatedAudioUrl && !lessonAudioRef.current.paused) {
        const nextT = lessonAudioRef.current.currentTime;
        if (nextT >= previewProject.duration) {
          setVideoTime(0);
          setIsVideoPlaying(false);
          return;
        }
        setVideoTime(nextT);
      } else {
        if (lastRafTsRef.current === null) lastRafTsRef.current = now;
        const dt = (now - lastRafTsRef.current) / 1000;
        lastRafTsRef.current = now;
        setVideoTime((prev) => {
          const next = prev + dt;
          if (next >= previewProject.duration) {
            setIsVideoPlaying(false);
            return 0;
          }
          return next;
        });
      }
      videoRafRef.current = requestAnimationFrame(step);
    };

    videoRafRef.current = requestAnimationFrame(step);
    return () => {
      if (videoRafRef.current !== null) cancelAnimationFrame(videoRafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideoPlaying, previewProject.duration, generatedAudioUrl]);

  const countdownWindows = useMemo(
    () => extractCountdownWindowsFromElements(previewProject.elements),
    [previewProject.elements],
  );

  const detectedLearningLangForDesc = useMemo(() => {
    if (reelCreationMode === 'creator') return creatorLearningLang;
    if (reelCreationMode === 'translation') return translationLearningLang;
    return inferLearningLangFromCards(cards);
  }, [reelCreationMode, creatorLearningLang, translationLearningLang, cards]);

  const videoDescription = useMemo(
    () =>
      buildVideoDescription({
        title: lessonTitle,
        nativeLang: targetLang,
        learningLang: detectedLearningLangForDesc,
        style: descriptionStyle,
        project: previewProject,
        durationSec: previewProject.duration,
        itemCount:
          reelCreationMode === 'translation'
            ? translationItemCount
            : cards.filter((c) => c.type !== 'intro' && c.type !== 'transition' && c.type !== 'outro').length || cards.length,
        thinkSec: translationThinkSec,
        repeatCount: translationRepeatCount,
        hasCountdown: countdownWindows.length > 0,
        topicHint:
          reelCreationMode === 'translation'
            ? translationTopicHint
            : creatorTopicHint,
      }),
    [
      lessonTitle,
      targetLang,
      detectedLearningLangForDesc,
      descriptionStyle,
      previewProject,
      reelCreationMode,
      translationItemCount,
      cards,
      translationThinkSec,
      translationRepeatCount,
      countdownWindows.length,
      translationTopicHint,
      creatorTopicHint,
    ],
  );

  // Silent live-preview countdown tick & reveal chime (disabled once pre-mixed audio is active)
  useEffect(() => {
    if (!isVideoPlaying || generatedAudioUrl || !enableCountdownSfx || countdownWindows.length === 0) {
      if (!isVideoPlaying) {
        lastCountdownSfxKeyRef.current = '';
      }
      return;
    }
    const introOffset = getEffectiveIntroSeconds(previewProject);
    const adjTime = videoTime - introOffset;
    if (adjTime < 0) return;
    for (const win of countdownWindows) {
      for (let i = 0; i < win.tickTimesSec.length; i++) {
        const tickSec = win.tickTimesSec[i];
        if (adjTime >= tickSec && adjTime < tickSec + 0.16) {
          const key = `tick-${win.startSec}-${i}`;
          if (lastCountdownSfxKeyRef.current !== key) {
            lastCountdownSfxKeyRef.current = key;
            playCountdownTickSound(i === win.tickTimesSec.length - 1);
          }
          return;
        }
      }
      if (
        typeof win.revealChimeSec === 'number' &&
        adjTime >= win.revealChimeSec &&
        adjTime < win.revealChimeSec + 0.18
      ) {
        const key = `reveal-${win.startSec}`;
        if (lastCountdownSfxKeyRef.current !== key) {
          lastCountdownSfxKeyRef.current = key;
          playCountdownRevealChime();
        }
        return;
      }
    }
  }, [isVideoPlaying, videoTime, generatedAudioUrl, enableCountdownSfx, countdownWindows, previewProject]);

  const creatorLevelOptions = useMemo(
    () => getLevelsForLearningLanguage(creatorLearningLang),
    [creatorLearningLang],
  );
  const translationLevelOptions = useMemo(
    () => getLevelsForLearningLanguage(translationLearningLang),
    [translationLearningLang],
  );

  const webAiPrompt = useMemo(
    () =>
      reelCreationMode === 'translation'
        ? buildTranslationChallengePrompt({
            topicHint: translationTopicHint.trim() || undefined,
            customInputLines: translationCustomLines.trim() || undefined,
            learningLanguage: translationLearningLang,
            level: translationLevel,
            durationMinutes: translationDurationMinutes,
            itemCount: translationAutoItemCount ? 'auto' : translationItemCount,
            targetLang,
            thinkSec: translationThinkSec,
            repeatCount: translationRepeatCount,
            includeNuanceTip: translationIncludeNuance,
            compositionId: selectedComposition,
            aspectRatio: reelsAspectRatio,
          })
        : reelCreationMode === 'creator'
          ? buildAiCreatorWebAiPrompt({
              topicHint: creatorTopicHint.trim() || undefined,
              customInputLines: creatorScriptInput.trim() || undefined,
              learningLanguage: creatorLearningLang,
              level: creatorLevel,
              durationMinutes: creatorDurationMinutes,
              itemCount: creatorAutoItemCount ? 'auto' : creatorItemCount,
              targetLang,
              formatPreference: creatorFormat,
              compositionId: selectedComposition,
              aspectRatio: reelsAspectRatio,
              includeExplanationSpeech: enableDualTts && targetLang !== 'none',
              splitAudioByRole: splitAudioByRole && enableDualTts && targetLang !== 'none',
              includeQuiz: includeQuizInPrompt === 'always',
            })
          : buildEnglishReelsWebAiPrompt({
              sourceText: rawText,
              sourceUrl: urlInput.trim() || undefined,
              title: lessonTitle,
              mode,
              targetLang,
              durationMinutes: sourceDurationMinutes,
              compositionId: selectedComposition,
              includeQuiz: includeQuizInPrompt,
            }),
    [
      reelCreationMode,
      sourceDurationMinutes,
      translationTopicHint,
      translationCustomLines,
      translationLearningLang,
      translationLevel,
      translationDurationMinutes,
      translationItemCount,
      translationAutoItemCount,
      translationThinkSec,
      translationRepeatCount,
      translationIncludeNuance,
      creatorTopicHint,
      creatorScriptInput,
      creatorLearningLang,
      creatorLevel,
      creatorDurationMinutes,
      creatorItemCount,
      creatorAutoItemCount,
      creatorFormat,
      rawText,
      urlInput,
      lessonTitle,
      mode,
      targetLang,
      selectedComposition,
      reelsAspectRatio,
      enableDualTts,
      splitAudioByRole,
      includeQuizInPrompt,
      cartoonDbVersion,
    ],
  );

  const safeActiveIdx = Math.min(activeCardIdx, Math.max(0, cards.length - 1));
  const activeCard = cards[safeActiveIdx] ?? null;

  const syncVoiceForDetectedLang = (lang: LearningLanguageId) => {
    setCreatorLearningLang(lang);
    setTranslationLearningLang(lang);
    setTtsVoice((prevVoice) => {
      if (isMultilingualVoiceId(prevVoice)) return prevVoice;
      const currentLang = detectVoiceLangCode(prevVoice);
      if (currentLang === lang) return prevVoice;
      return pickVoiceIdForProviderAndLang(ttsProvider, lang, availableVoices);
    });
  };

  const handleScrapeUrl = async (targetUrl?: string) => {
    const cleanUrl = (targetUrl ?? urlInput).trim();
    if (!cleanUrl) {
      setScrapeError('Vui lòng nhập URL bài học (Reading / Quiz / Vocab).');
      return;
    }
    setUrlInput(cleanUrl);
    setScrapeError(null);
    setIsScraping(true);
    try {
      const res = await fetch('/api/scraper/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl }),
      });
      const data = await parseApiJson<ReelScrapeResult & { error?: string }>(
        res,
        'Không thể bóc nội dung từ URL',
      );
      if (!res.ok) {
        throw new Error(data?.error || 'Không thể bóc nội dung từ URL.');
      }
      const result = data as ReelScrapeResult;
      setScrapeResult(result);
      if (result.title) {
        setLessonTitle(result.title);
        setParsedLessonLevel('');
        manualTitleEditedRef.current = false;
      }
      if (result.rawText) {
        setRawText(result.rawText);
        if (result.detectedMode) setMode(result.detectedMode);
        const built = buildReelCardsRuleBased(result.rawText, {
          title: result.title,
          mode: result.detectedMode || 'auto',
          targetLang,
          includeQuiz: includeQuizInPrompt !== 'none',
        });
        setCards(built.cards);
        hasCustomCardsRef.current = true;
        syncVoiceForDetectedLang(inferLearningLangFromCards(built.cards));
        setActiveCardIdx(0);
        setHiddenElementIds([]);
        setSelectedPreviewElementId(null);
        setSceneJsonOverride(null);
      }
    } catch (err) {
      setScrapeError(err instanceof Error ? err.message : 'Lỗi bóc nội dung URL.');
    } finally {
      setIsScraping(false);
    }
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(webAiPrompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch {
      setCopiedPrompt(false);
    }
  };

  const invalidateSynthesizedAudio = () => {
    setSynthesizedAudioSig('');
    setGeneratedDurations(undefined);
    setGeneratedTimings(undefined);
    setCustomSyncedCues(null);
    setSyncedTimingOffsetMs(0);
    setSyncedSpeedFactor(1);
  };

  const handleApplyPastedAiJson = () => {
    setAiJsonError(null);
    setAiJsonNotice(null);
    const parsed = parseEnglishReelsAiJson(pastedAiJson, { targetLang });
    if (!parsed) {
      setAiJsonError(
        'Không đọc được JSON định dạng chuẩn English Reels / KineticSub. Hãy copy toàn bộ đoạn JSON AI trả về.',
      );
      return;
    }
    if (parsed.cartoonAnimations && parsed.cartoonAnimations.length > 0) {
      for (const anim of parsed.cartoonAnimations) {
        if (anim && (anim.id || anim.label)) {
          upsertCartoonAnimation(anim);
        }
      }
    }
    const nextComp = parsed.compositionId || parsed.sceneJson?.compositionId;
    if (nextComp && selectedComposition !== 'cartoon-host') {
      setSelectedComposition(nextComp);
    }
    setLessonTitle(parsed.title);
    setParsedLessonLevel(parsed.level || '');
    manualTitleEditedRef.current = false;
    setMode(parsed.mode);
    setCards(parsed.cards);
    hasCustomCardsRef.current = true;
    if (typeof parsed.thinkSec === 'number') setTranslationThinkSec(parsed.thinkSec);
    if (typeof parsed.repeatCount === 'number') setTranslationRepeatCount(parsed.repeatCount);
    const detectedLang = parsed.learningLang || inferLearningLangFromCards(parsed.cards);
    syncVoiceForDetectedLang(detectedLang);
    setSceneJsonOverride(parsed.sceneJson ?? null);
    setActiveCardIdx(0);
    setHiddenElementIds([]);
    setSelectedPreviewElementId(null);
    invalidateSynthesizedAudio();
    const shortfallWarn =
      parsed.durationReport && !parsed.durationReport.metMinimum && parsed.durationReport.shortfallReason
        ? ` ⚠️ Chưa đạt tối thiểu ${parsed.durationReport.targetMinutes ?? '?'}p (ước tính ~${parsed.durationReport.estimatedMinutes ?? '?'}p) — Lý do AI báo: ${parsed.durationReport.shortfallReason}`
        : '';
    setAiJsonNotice(
      `Đã nạp ${parsed.cards.length} thẻ (${parsed.isTranslationMode ? 'PHẢN XẠ DỊCH' : parsed.mode.toUpperCase()} · ${detectedLang.toUpperCase()})${parsed.sceneJson ? ' kèm Scene JSON KineticSub' : ''}${parsed.cartoonAnimations?.length ? ` · +${parsed.cartoonAnimations.length} animation @Gimmys` : ''}!${shortfallWarn}`,
    );
  };

  const handleQuickRuleExtract = () => {
    setAiJsonError(null);
    const cleaned = cleanReadingWorksheetInput(rawText);
    const useManualTitle =
      manualTitleEditedRef.current &&
      lessonTitle.trim() &&
      lessonTitle !== 'Hotel Check-in & Polite Requests';
    const built = buildReelCardsRuleBased(rawText, {
      title: useManualTitle ? lessonTitle : cleaned.title,
      mode,
      targetLang,
      includeQuiz: includeQuizInPrompt !== 'none',
    });
    if (built.title && !useManualTitle) {
      setLessonTitle(built.title);
      setParsedLessonLevel('');
    }
    setCards(built.cards);
    hasCustomCardsRef.current = true;
    syncVoiceForDetectedLang(inferLearningLangFromCards(built.cards));
    setActiveCardIdx(0);
    setHiddenElementIds([]);
    setSelectedPreviewElementId(null);
    setSceneJsonOverride(null);
    invalidateSynthesizedAudio();
    setAiJsonNotice(`Đã tách nhanh ${built.cards.length} thẻ (${built.mode.toUpperCase()}) từ nội dung.`);
  };

  // ── Card CRUD Helpers ──────────────────────────────────────────────────────
  const updateCard = (index: number, patch: Partial<ReelCard>) => {
    hasCustomCardsRef.current = true;
    setCards((prev) =>
      prev.map((c, idx) => {
        if (idx !== index) return c;
        const next = { ...c, ...patch };
        if (patch.ttsText !== undefined) {
          next.durationSec = estimateCardSpeechDuration(patch.ttsText);
        }
        return next;
      }),
    );
  };

  const handleAddCard = (type: ReelCardType) => {
    hasCustomCardsRef.current = true;
    const newCard: ReelCard =
      type === 'translation'
        ? {
            id: `card-${Date.now().toString(36)}`,
            type: 'translation',
            badge: `DỊCH CÂU #${cards.filter((c) => c.type === 'translation').length + 1}`,
            title: 'Watch out for her!',
            sourcePrompt: 'Coi chừng cô ấy đấy!',
            content: 'Watch out for her!',
            phonetic: '/wɑːtʃ aʊt fɔːr hɜːr/',
            translation: 'Coi chừng cô ấy đấy!',
            grammarNote: 'Watch out for + O = coi chừng ai đó',
            explanationSpeech: translationIncludeNuance
              ? 'Cách nói tự nhiên khi cảnh báo ai đó dè chừng.'
              : '',
            learningLang: translationLearningLang,
            ttsText: 'Watch out for her!',
            thinkSec: translationThinkSec,
            repeatCount: translationRepeatCount,
            durationSec: Number((3 + translationThinkSec + translationRepeatCount * 2.8).toFixed(2)),
          }
        : type === 'quiz'
          ? {
              id: `card-${Date.now().toString(36)}`,
              type: 'quiz',
              badge: `QUIZ #${cards.length + 1}`,
              title: `Question ${cards.length + 1}`,
              content: 'Which sentence sounds more polite?',
              translation: targetLang !== 'none' ? 'Câu nào nghe lịch sự hơn?' : undefined,
              ttsText: 'Which sentence sounds more polite?',
              options: ['Give me water', 'Could I have some water?'],
              answerIndex: 1,
              explanation: '"Could I" softens direct requests.',
              durationSec: 3.4,
            }
          : {
              id: `card-${Date.now().toString(36)}`,
              type: 'vocab',
              badge: `CARD #${cards.length + 1}`,
              title: 'Key Phrase',
              content: 'Excuse me, could you help me with this?',
              phonetic: '/ɪkˈskjuːz miː/',
              translation: targetLang !== 'none' ? 'Xin lỗi, bạn có thể giúp tôi việc này không?' : undefined,
              ttsText: 'Excuse me, could you help me with this?',
              durationSec: 3.5,
            };
    setCards((prev) => {
      const next = [...prev, newCard];
      setActiveCardIdx(next.length - 1);
      return next;
    });
  };

  const handleMoveCard = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= cards.length) return;
    setCards((prev) => {
      const next = [...prev];
      const [moved] = next.splice(idx, 1);
      next.splice(target, 0, moved);
      return next;
    });
    setActiveCardIdx(target);
  };

  const handleDuplicateCard = (idx: number) => {
    const source = cards[idx];
    if (!source) return;
    const copy: ReelCard = {
      ...source,
      id: `card-${Date.now().toString(36)}`,
      title: `${source.title} (Bản sao)`,
    };
    setCards((prev) => {
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
    setActiveCardIdx(idx + 1);
  };

  const handleDeleteCard = (idx: number) => {
    if (cards.length <= 1) return;
    setCards((prev) => prev.filter((_, i) => i !== idx));
    setActiveCardIdx((prevIdx) => Math.max(0, Math.min(prevIdx, cards.length - 2)));
  };

  const rawVoiceLang = availableVoices.find((v) => v.id === ttsVoice)?.lang;
  const selectedVoiceLang =
    !rawVoiceLang || rawVoiceLang === 'multi'
      ? reelCreationMode === 'creator'
        ? getLearningVoiceLangFallback(creatorLearningLang)
        : reelCreationMode === 'translation'
          ? getLearningVoiceLangFallback(translationLearningLang)
          : 'en-US'
      : rawVoiceLang;
  const explanationVoiceChoices = useMemo(() => {
    const allVoices = ttsProviders.flatMap((p) => {
      if (p.id === 'gemini' && !effectiveHasGeminiKey) return [];
      if (p.id === 'elevenlabs' && !effectiveHasElevenLabsKey) return [];
      return p.voices;
    });
    const dedup = new Map<string, { id: string; label: string; lang: string }>();
    const defaults: Array<{ id: string; label: string; lang: string }> = [
      { id: 'vi-VN-HoaiMyNeural', label: 'Tiếng Việt — Hoài My (Nữ)', lang: 'vi-VN' },
      { id: 'vi-VN-NamMinhNeural', label: 'Tiếng Việt — Nam Minh (Nam)', lang: 'vi-VN' },
      { id: 'en-US-JennyNeural', label: 'English US — Jenny (Nữ)', lang: 'en-US' },
      { id: 'ja-JP-NanamiNeural', label: '日本語 — Nanami (Nữ)', lang: 'ja-JP' },
      { id: 'zh-CN-XiaoxiaoNeural', label: '中文 — Xiaoxiao (Nữ)', lang: 'zh-CN' },
      { id: 'zh-CN-YunxiNeural', label: '中文 — Yunxi (Nam)', lang: 'zh-CN' },
      { id: 'ko-KR-SunHiNeural', label: '한국어 — SunHi (Nữ)', lang: 'ko-KR' },
    ];
    for (const d of defaults) dedup.set(d.id, d);
    for (const v of allVoices) dedup.set(v.id, v);
    return Array.from(dedup.values());
  }, [ttsProviders, effectiveHasGeminiKey, effectiveHasElevenLabsKey]);

  const explVoiceLang =
    explanationVoiceChoices.find((v) => v.id === explanationTtsVoice)?.lang ||
    (targetLang !== 'none'
      ? normalizeTtsLangCode(targetLang, activeLearningLang)
      : 'vi');

  const resolveCardExplanationSpeech = (card: ReelCard): string => {
    if (!enableDualTts || targetLang === 'none') return '';
    const explicit = sanitizeTtsSpeech(card.explanationSpeech || '');
    if (explicit) return explicit;
    if (card.type === 'quiz') {
      return sanitizeTtsSpeech(card.explanation || '');
    }
    return sanitizeTtsSpeech(card.translation || '');
  };

  const resolveCardTargetVoice = (
    card: ReelCard,
  ): { voice: string; lang: string } => {
    const inferredLang = inferLearningLangFromCards(
      [card],
      card.learningLang ||
        (reelCreationMode === 'creator'
          ? creatorLearningLang
          : reelCreationMode === 'translation'
            ? translationLearningLang
            : undefined),
    );
    if (isMultilingualVoiceId(ttsVoice)) {
      return {
        voice: ttsVoice,
        lang: getLearningVoiceLangFallback(inferredLang),
      };
    }
    const currentVoiceLang = detectVoiceLangCode(ttsVoice);
    if (currentVoiceLang === inferredLang || (inferredLang === 'en' && !card.learningLang && reelCreationMode === 'source' && !/[\u4e00-\u9faf\u3040-\u30ff\uac00-\ud7af]/.test(`${card.title} ${card.content} ${card.ttsText}`))) {
      return { voice: ttsVoice, lang: selectedVoiceLang };
    }
    const matchedVoice = pickVoiceIdForProviderAndLang(
      ttsProvider,
      inferredLang,
      availableVoices,
    );
    return {
      voice: matchedVoice,
      lang: getLearningVoiceLangFallback(inferredLang),
    };
  };

  const stripParenthesizedPinyinIfCjk = (speech: string, cardTargetVoiceLang: string): string => {
    if (!cardTargetVoiceLang.toLowerCase().startsWith('zh') && !/[\u4e00-\u9faf]/.test(speech)) {
      return speech;
    }
    return speech
      .replace(/\s*\([^)]*[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ][^)]*\)/g, '')
      .replace(/\s+/g, ' ')
      .trim() || speech;
  };

  const applyStarterLesson = (
    nextLang: LearningLanguageId,
    explLang: string,
    nextLevel?: string,
  ) => {
    const starter = buildStarterLessonForLanguage(nextLang, explLang, nextLevel);
    hasCustomCardsRef.current = false;
    manualTitleEditedRef.current = false;
    setLessonTitle(starter.title);
    setMode(starter.mode);
    setCards(starter.cards);
    setSceneJsonOverride(null);
    setActiveCardIdx(0);
    setSelectedPreviewElementId(null);
    setLayoutOverridesByAspect({});
    setHiddenElementIds([]);
    invalidateSynthesizedAudio();
  };

  const applyTranslationStarterOrCustom = (overrides?: {
    topicHint?: string;
    customLines?: string;
    learningLang?: LearningLanguageId;
    level?: string;
    itemCount?: number;
    explLang?: string;
    thinkSec?: number;
    repeatCount?: number;
    includeNuance?: boolean;
  }) => {
    const built = buildTranslationCardsFromInput({
      topicHint: overrides?.topicHint ?? translationTopicHint,
      customInputLines: overrides?.customLines ?? translationCustomLines,
      learningLanguage: overrides?.learningLang ?? translationLearningLang,
      level: overrides?.level ?? translationLevel,
      itemCount: overrides?.itemCount ?? translationItemCount,
      targetLang: overrides?.explLang ?? targetLang,
      thinkSec: overrides?.thinkSec ?? translationThinkSec,
      repeatCount: overrides?.repeatCount ?? translationRepeatCount,
      includeNuanceTip: overrides?.includeNuance ?? translationIncludeNuance,
    });
    hasCustomCardsRef.current = Boolean((overrides?.customLines ?? translationCustomLines).trim());
    manualTitleEditedRef.current = false;
    setLessonTitle(built.title);
    setMode(built.mode);
    setCards(built.cards);
    setSceneJsonOverride(null);
    setActiveCardIdx(0);
    setSelectedPreviewElementId(null);
    setLayoutOverridesByAspect({});
    setHiddenElementIds([]);
    invalidateSynthesizedAudio();
    setAiJsonNotice(`Đã tạo bộ Phản Xạ Dịch ${built.cards.filter((c) => c.type === 'translation').length} câu!`);
  };

  const switchReelCreationMode = (nextMode: ReelCreationMode) => {
    if (nextMode === reelCreationMode) return;
    setIsVideoPlaying(false);
    setConcurrencyConflict(null);
    setPreviewAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    // Snapshot current workspace & ALL visual/audio/export settings so each of the 3 sub-tabs stays 100% isolated
    modeWorkspacesRef.current[reelCreationMode] = {
      cards,
      lessonTitle,
      manualTitleEdited: manualTitleEditedRef.current,
      hasCustomCards: hasCustomCardsRef.current,
      mode,
      rawText,
      urlInput,
      scrapeResult,
      pastedAiJson,
      aiJsonError,
      aiJsonNotice,
      sceneJsonOverride,
      generatedAudioFile,
      generatedAudioUrl,
      generatedDurations,
      generatedTimings,
      customSyncedCues,
      syncedTimingOffsetMs,
      syncedSpeedFactor,
      synthesizedAudioSig,
      activeCardIdx,
      videoTime,
      previewViewMode,
      layoutOverridesByAspect,
      hiddenElementIds,
      selectedPreviewElementId,
      includeQuizInPrompt,
      targetLang,
      ttsProvider,
      ttsVoice,
      enableLearningAudio,
      enableDualTts,
      splitAudioByRole,
      explanationTtsVoice,
      ttsRate,
      reelsAspectRatio,
      selectedTheme,
      selectedComposition,
      subtitlePosition,
      subtitleSize,
      subtitleBoxStyle,
      backgroundImage,
      bgmPreset,
      bgmVolume,
      customBgmFile,
      enableCountdownSfx,
      descriptionStyle,
      watermarkConfig,
      mp4Resolution,
      mp4Quality,
      mp4Fps,
    };

    setReelCreationMode(nextMode);
    const saved = modeWorkspacesRef.current[nextMode];
    if (saved) {
      hasCustomCardsRef.current = saved.hasCustomCards;
      manualTitleEditedRef.current = saved.manualTitleEdited;
      setCards(saved.cards);
      setLessonTitle(saved.lessonTitle);
      setMode(saved.mode);
      setRawText(saved.rawText);
      setUrlInput(saved.urlInput);
      setScrapeResult(saved.scrapeResult);
      setPastedAiJson(saved.pastedAiJson);
      setAiJsonError(saved.aiJsonError);
      setAiJsonNotice(saved.aiJsonNotice);
      setSceneJsonOverride(saved.sceneJsonOverride);
      setGeneratedAudioFile(saved.generatedAudioFile);
      setGeneratedAudioUrl(saved.generatedAudioUrl);
      setGeneratedDurations(saved.generatedDurations);
      setGeneratedTimings(saved.generatedTimings);
      setCustomSyncedCues(saved.customSyncedCues);
      setSyncedTimingOffsetMs(saved.syncedTimingOffsetMs);
      setSyncedSpeedFactor(saved.syncedSpeedFactor);
      setSynthesizedAudioSig(saved.synthesizedAudioSig);
      setActiveCardIdx(saved.activeCardIdx);
      setVideoTime(saved.videoTime);
      setPreviewViewMode(saved.previewViewMode);
      setLayoutOverridesByAspect(saved.layoutOverridesByAspect);
      setHiddenElementIds(saved.hiddenElementIds || []);
      setSelectedPreviewElementId(saved.selectedPreviewElementId);
      setIncludeQuizInPrompt(saved.includeQuizInPrompt);
      setTargetLang(saved.targetLang);
      setTtsProvider(saved.ttsProvider);
      setTtsVoice(saved.ttsVoice);
      setEnableLearningAudio(saved.enableLearningAudio);
      setEnableDualTts(saved.enableDualTts);
      setSplitAudioByRole(saved.splitAudioByRole);
      setExplanationTtsVoice(saved.explanationTtsVoice);
      setTtsRate(saved.ttsRate);
      setReelsAspectRatio(saved.reelsAspectRatio);
      setSelectedTheme(saved.selectedTheme);
      setSelectedComposition(saved.selectedComposition);
      setSubtitlePosition(saved.subtitlePosition);
      setSubtitleSize(saved.subtitleSize);
      setSubtitleBoxStyle(saved.subtitleBoxStyle);
      setBackgroundImage(saved.backgroundImage);
      setBgmPreset(saved.bgmPreset);
      setBgmVolume(saved.bgmVolume);
      setCustomBgmFile(saved.customBgmFile);
      setEnableCountdownSfx(saved.enableCountdownSfx);
      setDescriptionStyle(saved.descriptionStyle);
      setWatermarkConfig(saved.watermarkConfig);
      setMp4Resolution(saved.mp4Resolution);
      setMp4Quality(saved.mp4Quality);
      setMp4Fps(saved.mp4Fps);
      return;
    }

    // First time entering nextMode in this session: restore persisted per-mode settings or clean defaults
    const persistedNext = resolveReelsModeSettings(loadPersistedSettings().reels, nextMode);
    const nextComp = persistedNext.selectedComposition || 'story-scenes';
    const nextTargetLang = persistedNext.targetLang || 'Tiếng Việt';
    const nextProvider = persistedNext.ttsProvider || 'auto';
    const nextIncludeQuiz = persistedNext.includeQuizInPrompt || 'auto';
    const nextModeLearningLang: LearningLanguageId =
      nextMode === 'creator'
        ? creatorLearningLang
        : nextMode === 'translation'
          ? translationLearningLang
          : 'en';
    const nextModeLearningAudio = persistedNext.enableLearningAudio ?? true;
    const nextModeDualTts =
      !nextModeLearningAudio && persistedNext.enableDualTts === false
        ? true
        : (persistedNext.enableDualTts ?? true);

    setIncludeQuizInPrompt(nextIncludeQuiz);
    setTargetLang(nextTargetLang);
    setTtsProvider(nextProvider);
    setEnableLearningAudio(nextModeLearningAudio);
    setEnableDualTts(nextModeDualTts);
    setSplitAudioByRole(persistedNext.splitAudioByRole ?? true);
    setExplanationTtsVoice(
      persistedNext.explanationTtsVoice ||
        pickExplanationDefaultVoice(nextTargetLang, nextModeLearningLang),
    );
    setTtsRate(typeof persistedNext.ttsRate === 'number' ? persistedNext.ttsRate : 1.0);
    setReelsAspectRatio(persistedNext.reelsAspectRatio || '9:16');
    setSelectedTheme(persistedNext.selectedTheme || 'pastel-sunrise');
    setSelectedComposition(nextComp);
    setSubtitlePosition(persistedNext.subtitlePosition ?? (nextComp === 'plain' ? 'center' : 'bottom'));
    setSubtitleSize(persistedNext.subtitleSize ?? (nextComp === 'plain' ? 'lg' : 'md'));
    setSubtitleBoxStyle(persistedNext.subtitleBoxStyle ?? (nextComp === 'plain' ? 'clean' : 'card'));
    setBackgroundImage(
      persistedNext.backgroundPresetId
        ? {
            kind: 'preset',
            presetId: persistedNext.backgroundPresetId,
            scrimOpacity: 0.16,
            learningScrimOpacity:
              typeof persistedNext.learningScrimOpacity === 'number'
                ? persistedNext.learningScrimOpacity
                : 0.42,
          }
        : undefined,
    );
    setBgmPreset(persistedNext.bgmPreset || DEFAULT_BGM_PRESET);
    setBgmVolume(
      typeof persistedNext.bgmVolume === 'number' ? persistedNext.bgmVolume : DEFAULT_BGM_VOLUME,
    );
    setCustomBgmFile(null);
    setEnableCountdownSfx(persistedNext.enableCountdownSfx ?? true);
    setDescriptionStyle((persistedNext.descriptionStyle as VideoDescriptionStyle) || 'auto');
    setWatermarkConfig({ ...DEFAULT_REELS_WATERMARK, ...(persistedNext.watermarkConfig || {}) });
    setMp4Resolution(persistedNext.mp4Resolution || DEFAULT_MP4_EXPORT_SETTINGS.resolution);
    setMp4Quality(persistedNext.mp4Quality || DEFAULT_MP4_EXPORT_SETTINGS.quality);
    setMp4Fps(persistedNext.mp4Fps || DEFAULT_MP4_EXPORT_SETTINGS.fps);

    setPastedAiJson('');
    setAiJsonError(null);
    setAiJsonNotice(null);
    setSceneJsonOverride(null);
    setGeneratedAudioFile(null);
    setGeneratedAudioUrl(null);
    setGeneratedDurations(undefined);
    setGeneratedTimings(undefined);
    setCustomSyncedCues(null);
    setSyncedTimingOffsetMs(0);
    setSyncedSpeedFactor(1);
    setSynthesizedAudioSig('');
    setActiveCardIdx(0);
    setVideoTime(0.5);
    setPreviewViewMode(persistedNext.previewViewMode || 'video');
    setLayoutOverridesByAspect(persistedNext.layoutOverridesByAspect || {});
    setHiddenElementIds([]);
    setSelectedPreviewElementId(null);

    if (nextMode === 'source') {
      hasCustomCardsRef.current = false;
      manualTitleEditedRef.current = false;
      setUrlInput('');
      setScrapeResult(null);
      setRawText(SAMPLE_ARTICLE_TEXT);
      setLessonTitle('Hotel Check-in & Polite Requests');
      setMode(persistedNext.mode || 'auto');
      setTtsVoice(
        persistedNext.ttsVoice || pickVoiceIdForProviderAndLang(nextProvider, 'en', availableVoices),
      );
      setCards(
        buildReelCardsRuleBased(SAMPLE_ARTICLE_TEXT, {
          title: 'Hotel Check-in & Polite Requests',
          mode: persistedNext.mode || 'auto',
          targetLang: nextTargetLang,
          includeQuiz: nextIncludeQuiz !== 'none',
        }).cards,
      );
    } else if (nextMode === 'creator') {
      applyStarterLesson(creatorLearningLang, nextTargetLang, creatorLevel);
      setTtsVoice(
        persistedNext.ttsVoice &&
          (isMultilingualVoiceId(persistedNext.ttsVoice) || detectVoiceLangCode(persistedNext.ttsVoice) === creatorLearningLang)
          ? persistedNext.ttsVoice
          : pickVoiceIdForProviderAndLang(nextProvider, creatorLearningLang, availableVoices),
      );
    } else {
      applyTranslationStarterOrCustom({ explLang: nextTargetLang });
      setTtsVoice(
        persistedNext.ttsVoice &&
          (isMultilingualVoiceId(persistedNext.ttsVoice) || detectVoiceLangCode(persistedNext.ttsVoice) === translationLearningLang)
          ? persistedNext.ttsVoice
          : pickVoiceIdForProviderAndLang(nextProvider, translationLearningLang, availableVoices),
      );
    }
  };

  const shouldAutoSplitForTts = (
    text: string,
    primaryLang: string,
    secondaryLang?: string,
  ): boolean => {
    if (!text.trim()) return false;
    const spans = splitMixedLanguageTtsSpans(text, {
      primaryLang,
      secondaryLang,
      autoSplit: true,
    });
    const normPrimary = normalizeTtsLangCode(primaryLang);
    return spans.length > 1 || spans.some((s) => normalizeTtsLangCode(s.lang) !== normPrimary);
  };

  const updateCardVisual = (index: number, patch: Partial<ReelCardVisualConfig>) => {
    setCards((prev) =>
      prev.map((c, idx) =>
        idx === index ? { ...c, visual: { ...(c.visual || {}), ...patch } } : c,
      ),
    );
  };

  const handlePreviewSingleCardVoice = async () => {
    if (!activeCard) return;
    setIsPreviewingVoice(true);
    setTtsProgress(5);
    setTtsStageLabel('Đang tạo audio nghe thử thẻ...');
    setStudioError(null);
    try {
      const allowExplAudio = enableDualTts && targetLang !== 'none';
      const allowLearningAudio = enableLearningAudio;
      const roleSeparated = splitAudioByRole && allowExplAudio;
      const cardTarget = resolveCardTargetVoice(activeCard);
      const speakerVoiceMap = buildSpeakerVoiceMap(cards, {
        defaultVoice: cardTarget.voice,
        defaultLang: cardTarget.lang,
        provider: ttsProvider,
        availableVoices,
      });
      const resolvedCardVoice = speakerVoiceMap.get(activeCard.id) || cardTarget.voice;
      const segments: Array<{
        id: string;
        text: string;
        pauseAfterSec?: number;
        voice?: string;
        lang?: string;
        autoSplit?: boolean;
      }> = [];
      if (activeCard.type === 'translation') {
        const promptSpeech = sanitizeTtsSpeech(
          activeCard.sourcePrompt || activeCard.translation || activeCard.title,
        );
        const answerSpeech = stripParenthesizedPinyinIfCjk(
          sanitizeTtsSpeech(activeCard.ttsText || activeCard.content || activeCard.title) ||
            activeCard.content,
          cardTarget.lang,
        );
        const cardThink = Math.max(0, Math.min(15, activeCard.thinkSec ?? translationThinkSec ?? 4));
        const cardReps = Math.max(1, Math.min(5, activeCard.repeatCount ?? translationRepeatCount ?? 2));
        const nuanceTip =
          activeCard.explanationSpeech &&
          activeCard.explanationSpeech.trim().toLowerCase() !== promptSpeech.toLowerCase()
            ? sanitizeTtsSpeech(activeCard.explanationSpeech)
            : '';

        if (allowExplAudio && promptSpeech) {
          segments.push({
            id: `${activeCard.id}-q`,
            text: promptSpeech,
            pauseAfterSec: cardThink,
            voice: explanationTtsVoice,
            lang: explVoiceLang,
            autoSplit: shouldAutoSplitForTts(promptSpeech, explVoiceLang, cardTarget.lang),
          });
        }
        if (allowLearningAudio) {
          for (let r = 0; r < cardReps; r++) {
            segments.push({
              id: `${activeCard.id}-r${r}`,
              text: answerSpeech,
              pauseAfterSec: r < cardReps - 1 ? 0.55 : allowExplAudio && nuanceTip ? 0.25 : 0.35,
              voice: resolvedCardVoice,
              lang: cardTarget.lang,
              autoSplit: shouldAutoSplitForTts(answerSpeech, cardTarget.lang, explVoiceLang),
            });
          }
        }
        if (allowExplAudio && nuanceTip) {
          segments.push({
            id: `${activeCard.id}-expl`,
            text: nuanceTip,
            pauseAfterSec: 0.3,
            voice: explanationTtsVoice,
            lang: explVoiceLang,
            autoSplit: shouldAutoSplitForTts(nuanceTip, explVoiceLang, cardTarget.lang),
          });
        }
      } else if (activeCard.type === 'quiz' && activeCard.options?.length) {
        const { questionSpeech, answerSpeech, thinkSec } = getQuizCardSpeechParts(activeCard);
        if (allowLearningAudio && questionSpeech) {
          const cleanQ = stripParenthesizedPinyinIfCjk(questionSpeech, cardTarget.lang);
          segments.push({
            id: `${activeCard.id}-q`,
            text: cleanQ,
            pauseAfterSec: thinkSec,
            voice: resolvedCardVoice,
            lang: cardTarget.lang,
            autoSplit: roleSeparated
              ? shouldAutoSplitForTts(cleanQ, cardTarget.lang, explVoiceLang)
              : undefined,
          });
        }
        if (allowLearningAudio && answerSpeech) {
          const cleanA = stripParenthesizedPinyinIfCjk(answerSpeech, cardTarget.lang);
          segments.push({
            id: `${activeCard.id}-a`,
            text: cleanA,
            pauseAfterSec: 0,
            voice: resolvedCardVoice,
            lang: cardTarget.lang,
            autoSplit: roleSeparated
              ? shouldAutoSplitForTts(cleanA, cardTarget.lang, explVoiceLang)
              : undefined,
          });
        }
        const explSpeech = resolveCardExplanationSpeech(activeCard);
        if (
          allowExplAudio &&
          explSpeech &&
          (!allowLearningAudio || explSpeech.toLowerCase() !== answerSpeech.toLowerCase())
        ) {
          segments.push({
            id: `${activeCard.id}-expl`,
            text: explSpeech,
            pauseAfterSec: 0,
            voice: explanationTtsVoice,
            lang: explVoiceLang,
            autoSplit: shouldAutoSplitForTts(explSpeech, explVoiceLang, cardTarget.lang),
          });
        }
      } else if (
        allowExplAudio &&
        (activeCard.type === 'intro' || activeCard.type === 'transition' || activeCard.type === 'outro') &&
        (roleSeparated ||
          !allowLearningAudio ||
          (normalizeTtsLangCode(explVoiceLang) !== normalizeTtsLangCode(cardTarget.lang) &&
            Boolean(sanitizeTtsSpeech(activeCard.explanationSpeech || activeCard.translation || ''))))
      ) {
        const explOnly = sanitizeTtsSpeech(
          activeCard.explanationSpeech || activeCard.translation || activeCard.content || activeCard.title,
        );
        if (explOnly) {
          segments.push({
            id: `${activeCard.id}-expl`,
            text: explOnly,
            voice: explanationTtsVoice,
            lang: explVoiceLang,
            autoSplit: shouldAutoSplitForTts(explOnly, explVoiceLang, cardTarget.lang),
          });
        } else if (allowLearningAudio) {
          const cleanSpeech = stripParenthesizedPinyinIfCjk(
            sanitizeTtsSpeech(activeCard.ttsText || activeCard.content || activeCard.title) ||
              activeCard.content,
            cardTarget.lang,
          );
          segments.push({
            id: activeCard.id,
            text: cleanSpeech,
            voice: resolvedCardVoice,
            lang: cardTarget.lang,
            autoSplit: shouldAutoSplitForTts(cleanSpeech, cardTarget.lang, explVoiceLang),
          });
        }
      } else {
        const cleanSpeech = stripParenthesizedPinyinIfCjk(
          sanitizeTtsSpeech(activeCard.ttsText || activeCard.content || activeCard.title) ||
            activeCard.content,
          cardTarget.lang,
        );
        const canSplitTarget = allowExplAudio;
        if (allowLearningAudio && cleanSpeech) {
          segments.push({
            id: activeCard.id,
            text: cleanSpeech,
            voice: resolvedCardVoice,
            lang: cardTarget.lang,
            autoSplit: canSplitTarget
              ? shouldAutoSplitForTts(cleanSpeech, cardTarget.lang, explVoiceLang)
              : false,
          });
        }
        const explSpeech =
          resolveCardExplanationSpeech(activeCard) ||
          (!allowLearningAudio && allowExplAudio
            ? sanitizeTtsSpeech(activeCard.translation || activeCard.explanation || '')
            : '');
        if (
          allowExplAudio &&
          explSpeech &&
          (!allowLearningAudio || explSpeech.toLowerCase() !== cleanSpeech.toLowerCase())
        ) {
          segments.push({
            id: `${activeCard.id}-expl`,
            text: explSpeech,
            voice: explanationTtsVoice,
            lang: explVoiceLang,
            autoSplit: shouldAutoSplitForTts(explSpeech, explVoiceLang, cardTarget.lang),
          });
        }
      }
      if (segments.length === 0) {
        throw new Error('Thẻ này không có nội dung cho kênh audio đang bật.');
      }
      const data = await synthesizeAudioWithProgressJob(
        {
          provider: ttsProvider,
          voice: allowLearningAudio ? resolvedCardVoice : explanationTtsVoice,
          lang: allowLearningAudio ? cardTarget.lang : explVoiceLang,
          secondaryVoice: allowLearningAudio
            ? (allowExplAudio ? explanationTtsVoice : undefined)
            : resolvedCardVoice,
          secondaryLang: allowLearningAudio
            ? (allowExplAudio ? explVoiceLang : undefined)
            : cardTarget.lang,
          autoSplitLanguages:
            (allowExplAudio || allowLearningAudio) && segments.some((s) => s.autoSplit === true),
          singleVoiceMultilingual:
            speakerVoiceMap.size > 0
              ? false
              : isMultilingualVoiceId(
                  allowLearningAudio ? resolvedCardVoice : explanationTtsVoice,
                ),
          rate: ttsRate,
          segments,
        },
        (pct, lbl) => {
          setTtsProgress(pct);
          setTtsStageLabel(lbl);
        },
      );
      if (data?.edgeFallbackToGoogle) {
        notifyEdgeFallbackToGoogle({
          id: 'reels-preview-edge-fallback',
          sourceLabel: 'Nghe thử thẻ Reels',
          edgeErrors: data.edgeErrors,
        });
      }
      if (!data?.audioBase64) {
        throw new Error(data?.error || 'Không phát thử được TTS.');
      }
      const file = base64ToMp3File(data.audioBase64, 'preview.mp3');
      const nextUrl = URL.createObjectURL(file);
      setPreviewAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return nextUrl;
      });
    } catch (err) {
      setStudioError(err instanceof Error ? err.message : 'Lỗi phát thử giọng đọc.');
    } finally {
      setIsPreviewingVoice(false);
      setTtsProgress(0);
      setTtsStageLabel('');
    }
  };

  switchModeRef.current = switchReelCreationMode;

  const synthesizeLessonAudioBundle = async (
    quizPositionByCard?: Map<number, number>,
    ttsOverride?: { provider?: string; strictProvider?: boolean },
    runOptions?: {
      targetMode?: ReelCreationMode;
      slotId?: RenderTaskSlotId;
      activeRenderInterrupted?: boolean;
    },
  ): Promise<{
    audioFile: File;
    durations: number[] | undefined;
    timings: ReelCardTimingMeta[] | undefined;
    project: LessonProject;
  }> => {
    const originMode = runOptions?.targetMode ?? activeModeRef.current;
    const originSlotId = runOptions?.slotId ?? getReelsSlotId(originMode);
    const signatureAtStart = currentAudioSignature;
    const cardsAtStart = cards;
    const titleAtStart = lessonTitle;
    const levelAtStart =
      originMode === 'creator'
        ? creatorLevel
        : originMode === 'translation'
          ? translationLevel
          : parsedLessonLevel;
    const rawTextAtStart = rawText;
    const pastedAiJsonAtStart = pastedAiJson;
    const reelModeAtStart = mode;
    const langAtStart = detectedLearningLangForDesc;
    const allowExplAudio = enableDualTts && targetLang !== 'none';
    const allowLearningAudio = enableLearningAudio;
    const roleSeparated = splitAudioByRole && allowExplAudio;
    const inferredLessonLang = inferLearningLangFromCards(
      cards,
      reelCreationMode === 'creator'
        ? creatorLearningLang
        : reelCreationMode === 'translation'
          ? translationLearningLang
          : undefined,
    );
    const defaultVoiceLang = detectVoiceLangCode(ttsVoice);
    const lessonVoice =
      isMultilingualVoiceId(ttsVoice) ||
      defaultVoiceLang === inferredLessonLang ||
      (inferredLessonLang === 'en' && reelCreationMode === 'source')
        ? ttsVoice
        : pickVoiceIdForProviderAndLang(ttsProvider, inferredLessonLang, availableVoices);
    const lessonVoiceLang =
      isMultilingualVoiceId(ttsVoice)
        ? getLearningVoiceLangFallback(inferredLessonLang)
        : defaultVoiceLang === inferredLessonLang || (inferredLessonLang === 'en' && reelCreationMode === 'source')
          ? selectedVoiceLang
          : getLearningVoiceLangFallback(inferredLessonLang);

    const speakerVoiceMap = buildSpeakerVoiceMap(cards, {
      defaultVoice: lessonVoice,
      defaultLang: lessonVoiceLang,
      provider: ttsOverride?.provider || ttsProvider,
      availableVoices,
    });

    const segments: Array<{
      id: string;
      text: string;
      pauseAfterSec?: number;
      voice?: string;
      lang?: string;
      autoSplit?: boolean;
    }> = [];
    const cardMapping: Array<{
      qIdx: number | null;
      explIdx: number | null;
      aIdx: number | null;
      repeatIndices?: number[];
      thinkSec: number;
      isOutro: boolean;
      isTranslation?: boolean;
      isQuiz?: boolean;
      hasAnswerCue?: boolean;
    }> = [];
    let quizOrd = 0;

    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const explSpeech = resolveCardExplanationSpeech(c);
      const cardTarget = resolveCardTargetVoice(c);
      const cardVoice = speakerVoiceMap.get(c.id) || cardTarget.voice;
      if (c.type === 'translation') {
        const promptSpeech =
          sanitizeTtsSpeech(c.sourcePrompt || c.translation || c.title) || 'Hãy dịch câu sau.';
        const answerSpeech = stripParenthesizedPinyinIfCjk(
          sanitizeTtsSpeech(c.ttsText || c.content || c.title) || 'Practice speaking aloud.',
          cardTarget.lang,
        );
        const cardThink = Math.max(0, Math.min(15, c.thinkSec ?? translationThinkSec ?? 4));
        const cardReps = Math.max(1, Math.min(5, c.repeatCount ?? translationRepeatCount ?? 2));
        const nuanceTip =
          allowExplAudio &&
          c.explanationSpeech &&
          c.explanationSpeech.trim().toLowerCase() !== promptSpeech.toLowerCase()
            ? sanitizeTtsSpeech(c.explanationSpeech)
            : '';

        let qIdx: number | null = null;
        if (allowExplAudio && promptSpeech) {
          qIdx = segments.length;
          segments.push({
            id: `${c.id}-q`,
            text: promptSpeech,
            pauseAfterSec: cardThink,
            voice: explanationTtsVoice,
            lang: explVoiceLang,
            autoSplit: shouldAutoSplitForTts(promptSpeech, explVoiceLang, cardTarget.lang),
          });
        }

        const repeatIndices: number[] = [];
        if (allowLearningAudio) {
          for (let r = 0; r < cardReps; r++) {
            repeatIndices.push(segments.length);
            segments.push({
              id: `${c.id}-r${r}`,
              text: answerSpeech,
              pauseAfterSec: r < cardReps - 1 ? 0.55 : nuanceTip ? 0.25 : 0.35,
              voice: cardVoice,
              lang: cardTarget.lang,
              autoSplit: shouldAutoSplitForTts(answerSpeech, cardTarget.lang, explVoiceLang),
            });
          }
        }

        let explIdx: number | null = null;
        if (nuanceTip) {
          explIdx = segments.length;
          segments.push({
            id: `${c.id}-expl`,
            text: nuanceTip,
            pauseAfterSec: 0.3,
            voice: explanationTtsVoice,
            lang: explVoiceLang,
            autoSplit: shouldAutoSplitForTts(nuanceTip, explVoiceLang, cardTarget.lang),
          });
        }
        cardMapping.push({
          qIdx,
          explIdx,
          aIdx: null,
          repeatIndices,
          thinkSec: cardThink,
          isOutro: false,
          isTranslation: true,
        });
      } else if (c.type === 'quiz' && c.options && c.options.length > 0) {
        quizOrd += 1;
        const pos = quizPositionByCard?.get(i) ?? quizOrd;
        const { questionSpeech, answerSpeech, thinkSec } = getQuizCardSpeechParts(c, pos);
        const cleanQ = stripParenthesizedPinyinIfCjk(questionSpeech || 'Quiz question.', cardTarget.lang);
        const canSplitTarget = allowExplAudio;
        let qIdx: number | null = null;
        if (allowLearningAudio) {
          qIdx = segments.length;
          segments.push({
            id: `${c.id}-q`,
            text: cleanQ,
            pauseAfterSec: thinkSec,
            voice: cardVoice,
            lang: cardTarget.lang,
            autoSplit: canSplitTarget
              ? shouldAutoSplitForTts(cleanQ, cardTarget.lang, explVoiceLang)
              : false,
          });
        }
        let aIdx: number | null = null;
        if (allowLearningAudio && answerSpeech) {
          const cleanA = stripParenthesizedPinyinIfCjk(answerSpeech, cardTarget.lang);
          aIdx = segments.length;
          segments.push({
            id: `${c.id}-a`,
            text: cleanA,
            pauseAfterSec: 0,
            voice: cardVoice,
            lang: cardTarget.lang,
            autoSplit: canSplitTarget
              ? shouldAutoSplitForTts(cleanA, cardTarget.lang, explVoiceLang)
              : false,
          });
        }
        let explIdx: number | null = null;
        if (
          allowExplAudio &&
          explSpeech &&
          (!allowLearningAudio || explSpeech.toLowerCase() !== (answerSpeech || '').toLowerCase())
        ) {
          explIdx = segments.length;
          segments.push({
            id: `${c.id}-expl`,
            text: explSpeech,
            pauseAfterSec: 0,
            voice: explanationTtsVoice,
            lang: explVoiceLang,
            autoSplit: shouldAutoSplitForTts(explSpeech, explVoiceLang, cardTarget.lang),
          });
        }
        cardMapping.push({
          qIdx,
          explIdx,
          aIdx,
          thinkSec,
          isOutro: false,
          isQuiz: true,
          hasAnswerCue: Boolean(answerSpeech),
        });
      } else if (
        allowExplAudio &&
        (c.type === 'intro' || c.type === 'transition' || c.type === 'outro') &&
        (roleSeparated ||
          !allowLearningAudio ||
          (normalizeTtsLangCode(explVoiceLang) !== normalizeTtsLangCode(cardTarget.lang) &&
            Boolean(sanitizeTtsSpeech(c.explanationSpeech || c.translation || ''))))
      ) {
        const explOnly =
          sanitizeTtsSpeech(c.explanationSpeech || c.translation || c.content || c.title) ||
          (c.type === 'outro'
            ? 'Cảm ơn bạn đã theo dõi bài học.'
            : c.type === 'transition'
              ? 'Bây giờ chúng ta cùng chuyển sang phần tiếp theo.'
              : 'Chào mừng bạn đến với bài học.');
        const explIdx = segments.length;
        segments.push({
          id: `${c.id}-expl`,
          text: explOnly,
          pauseAfterSec: 0,
          voice: explanationTtsVoice,
          lang: explVoiceLang,
          autoSplit: shouldAutoSplitForTts(explOnly, explVoiceLang, cardTarget.lang),
        });
        cardMapping.push({ qIdx: null, explIdx, aIdx: null, thinkSec: 0, isOutro: c.type === 'outro' });
      } else {
        const cleanSpeech = stripParenthesizedPinyinIfCjk(
          sanitizeTtsSpeech(c.ttsText || c.content || c.title) || 'Next lesson point.',
          cardTarget.lang,
        );
        const canSplitTarget = allowExplAudio;
        let qIdx: number | null = null;
        if (allowLearningAudio) {
          qIdx = segments.length;
          segments.push({
            id: c.id,
            text: cleanSpeech,
            pauseAfterSec: 0,
            voice: cardVoice,
            lang: cardTarget.lang,
            autoSplit: canSplitTarget
              ? shouldAutoSplitForTts(cleanSpeech, cardTarget.lang, explVoiceLang)
              : false,
          });
        }
        let explIdx: number | null = null;
        const effectiveExpl =
          explSpeech ||
          (!allowLearningAudio && allowExplAudio
            ? sanitizeTtsSpeech(c.translation || c.explanation || '')
            : '');
        if (
          allowExplAudio &&
          effectiveExpl &&
          (!allowLearningAudio || effectiveExpl.toLowerCase() !== cleanSpeech.toLowerCase())
        ) {
          explIdx = segments.length;
          segments.push({
            id: `${c.id}-expl`,
            text: effectiveExpl,
            pauseAfterSec: 0,
            voice: explanationTtsVoice,
            lang: explVoiceLang,
            autoSplit: shouldAutoSplitForTts(effectiveExpl, explVoiceLang, cardTarget.lang),
          });
        }
        cardMapping.push({ qIdx, explIdx, aIdx: null, thinkSec: 0, isOutro: c.type === 'outro' });
      }
    }

    const extraOutroSpeech =
      watermarkConfig.outroSeconds > 0 &&
      !cards.some((c) => c.type === 'outro') &&
      (watermarkConfig.outroLine1.trim() || watermarkConfig.outroLine2.trim())
        ? sanitizeTtsSpeech([watermarkConfig.outroLine1, watermarkConfig.outroLine2].filter(Boolean).join('. '))
        : '';
    const extraOutroIdx = extraOutroSpeech ? segments.length : -1;
    if (extraOutroSpeech) {
      const useExplForOutro =
        !allowLearningAudio ||
        (allowExplAudio &&
          (roleSeparated ||
            normalizeTtsLangCode(explVoiceLang) !== normalizeTtsLangCode(lessonVoiceLang)));
      const oVoice = useExplForOutro ? explanationTtsVoice : lessonVoice;
      const oLang = useExplForOutro ? explVoiceLang : lessonVoiceLang;
      segments.push({
        id: 'watermark-outro-speech',
        text: extraOutroSpeech,
        pauseAfterSec: 0.4,
        voice: oVoice,
        lang: oLang,
        autoSplit: allowExplAudio
          ? shouldAutoSplitForTts(extraOutroSpeech, oLang, lessonVoiceLang)
          : false,
      });
    }
    if (segments.length === 0) {
      throw new Error('Không có nội dung phù hợp cho chế độ audio đang bật. Hãy bật thêm ngôn ngữ đọc hoặc điền nội dung giải thích.');
    }

    setTtsProgress(4);
    setTtsStageLabel(
      !allowLearningAudio
        ? 'Đang tạo audio chỉ đọc ngôn ngữ giải thích...'
        : speakerVoiceMap.size > 0
          ? 'Đang tạo giọng đọc hội thoại nhiều nhân vật...'
          : !allowExplAudio
            ? 'Đang tạo audio chỉ đọc ngôn ngữ muốn học...'
            : roleSeparated
              ? 'Đang tạo giọng đọc tách vai (tự xử lý từ xen kẽ nếu có)...'
              : 'Đang tạo giọng đọc bài học (Dual-TTS tách ngôn ngữ)...',
    );
    const effectiveProvider = ttsOverride?.provider || ttsProvider;
    const data = await synthesizeAudioWithProgressJob(
      {
        provider: effectiveProvider,
        strictProvider: ttsOverride?.strictProvider === true,
        voice: allowLearningAudio ? lessonVoice : explanationTtsVoice,
        lang: allowLearningAudio ? lessonVoiceLang : explVoiceLang,
        secondaryVoice: allowLearningAudio
          ? (allowExplAudio ? explanationTtsVoice : undefined)
          : lessonVoice,
        secondaryLang: allowLearningAudio
          ? (allowExplAudio ? explVoiceLang : undefined)
          : lessonVoiceLang,
        autoSplitLanguages:
          (allowExplAudio || allowLearningAudio) && segments.some((s) => s.autoSplit === true),
        singleVoiceMultilingual:
          speakerVoiceMap.size > 0
            ? false
            : isMultilingualVoiceId(
                allowLearningAudio ? lessonVoice : explanationTtsVoice,
              ),
        rate: ttsRate,
        segments,
      },
      (pct, lbl) => {
        if (originSlotId) {
          updateRenderTaskSlot(originSlotId, {
            progress: Math.min(0.95, Math.max(0.02, pct / 100)),
            stageLabel: lbl,
          });
        }
        if (activeModeRef.current === originMode) {
          setTtsProgress(pct);
          setTtsStageLabel(lbl);
        }
      },
    );
    if (!data?.audioBase64) {
      throw new Error(data?.error || 'Không thể tạo audio TTS từ server.');
    }
    if (data.edgeFallbackToGoogle && !ttsOverride?.strictProvider) {
      notifyEdgeFallbackToGoogle({
        id: 'reels-bundle-edge-fallback',
        sourceLabel: 'English Reels / Đa Ngôn Ngữ',
        edgeErrors: data.edgeErrors,
        onRetryEdge: async () => {
          await synthesizeLessonAudioBundle(
            quizPositionByCard,
            {
              provider: 'edge',
              strictProvider: true,
            },
            runOptions,
          );
        },
      });
    }

    const activeFileLevel = levelAtStart;
    const leveledTitleStem = buildLeveledOutputStem({
      title: titleAtStart,
      level: activeFileLevel,
      learningLanguage: langAtStart,
      fallback: 'English Reels',
    });
    const rawFileName = cleanDownloadFileName(leveledTitleStem, 'mp3', 'English Reels');
    const rawAudioFile = base64ToMp3File(data.audioBase64, rawFileName);

    const segDurs: number[] = Array.isArray(data.segmentDurations) ? data.segmentDurations : [];
    const spokenDurs: number[] = Array.isArray(data.spokenDurations) ? data.spokenDurations : segDurs;
    const pauseDurs: number[] = Array.isArray(data.pauseDurations) ? data.pauseDurations : [];

    let timings: ReelCardTimingMeta[] | undefined;
    let durations: number[] | undefined;
    const speechWindows: Array<{ start: number; end: number }> = [];
    let outroStartSec: number | undefined;

    if (segDurs.length > 0 && segments.length > 0) {
      let winCursor = 0;
      timings = cardMapping.map((m) => {
        if (m.isTranslation) {
          const repList = m.repeatIndices || [];
          const qSpoken = m.qIdx !== null ? spokenDurs[m.qIdx] ?? segDurs[m.qIdx] ?? 2.5 : 0;
          const pDur = m.qIdx !== null ? pauseDurs[m.qIdx] ?? m.thinkSec : m.thinkSec;
          const repeatDurationsSec = repList.map(
            (rIdx) => spokenDurs[rIdx] ?? segDurs[rIdx] ?? 2.4,
          );
          const firstPause =
            repList.length > 1
              ? pauseDurs[repList[0]] ?? 0.55
              : 0;
          let ansSpan = 0;
          if (qSpoken > 0.05) {
            speechWindows.push({ start: winCursor, end: winCursor + qSpoken });
          }
          let repWinCursor = winCursor + qSpoken + pDur;
          repList.forEach((rIdx, posIdx) => {
            const spoken = repeatDurationsSec[posIdx];
            const pause =
              pauseDurs[rIdx] ??
              (posIdx < repList.length - 1 ? 0.55 : m.explIdx !== null ? 0.25 : 0.35);
            if (spoken > 0.05) {
              speechWindows.push({ start: repWinCursor, end: repWinCursor + spoken });
            }
            repWinCursor += spoken + pause;
            ansSpan += spoken + pause;
          });
          const nuanceSec = m.explIdx !== null ? segDurs[m.explIdx] ?? 0 : 0;
          const nuanceSpoken = m.explIdx !== null ? spokenDurs[m.explIdx] ?? nuanceSec : 0;
          if (nuanceSpoken > 0.05) {
            speechWindows.push({ start: repWinCursor, end: repWinCursor + nuanceSpoken });
          }
          if (nuanceSec > 0.05) {
            ansSpan += nuanceSec;
          }
          const totalSec = Number(Math.max(1.5, qSpoken + pDur + ansSpan).toFixed(3));
          winCursor += totalSec;
          return {
            totalSec,
            questionSec: qSpoken,
            thinkSec: pDur,
            answerSec: Number(ansSpan.toFixed(3)),
            repeatDurationsSec,
            repeatPauseSec: firstPause,
            nuanceSec,
          };
        }

        const qSpoken = m.qIdx !== null ? spokenDurs[m.qIdx] ?? segDurs[m.qIdx] ?? 2.8 : 0;
        const pDur = m.qIdx !== null ? pauseDurs[m.qIdx] ?? 0 : 0;
        const aSpoken = m.aIdx !== null ? segDurs[m.aIdx] ?? 2.6 : undefined;
        const aOnlySpoken = m.aIdx !== null ? spokenDurs[m.aIdx] ?? aSpoken : undefined;
        const explDur = m.explIdx !== null ? segDurs[m.explIdx] ?? 0 : 0;
        const explSpoken = m.explIdx !== null ? spokenDurs[m.explIdx] ?? explDur : 0;
        const isQuiz = Boolean(m.isQuiz);
        const totalSec = Number(
          Math.max(1.2, qSpoken + pDur + (aSpoken ?? 0) + explDur).toFixed(3),
        );
        if (m.isOutro) outroStartSec = winCursor;
        if (qSpoken > 0.05) {
          speechWindows.push({ start: winCursor, end: winCursor + qSpoken });
        }
        if (isQuiz) {
          const ansStart = winCursor + qSpoken + pDur;
          if (aOnlySpoken && aOnlySpoken > 0.05) {
            speechWindows.push({ start: ansStart, end: ansStart + aOnlySpoken });
          }
          if (explSpoken > 0.05) {
            const explStart = ansStart + (aSpoken ?? 0);
            speechWindows.push({ start: explStart, end: explStart + explSpoken });
          }
        } else if (explSpoken > 0.05) {
          const explStart = winCursor + qSpoken + pDur;
          speechWindows.push({ start: explStart, end: explStart + explSpoken });
        }
        winCursor += totalSec;
        return {
          totalSec,
          questionSec: isQuiz ? qSpoken : undefined,
          thinkSec: isQuiz ? pDur : undefined,
          answerSec: isQuiz ? Number(((aSpoken ?? 0) + explDur).toFixed(3)) : undefined,
        };
      });
      durations = timings.map((t) => t.totalSec);
      if (extraOutroIdx >= 0 && segDurs[extraOutroIdx]) {
        outroStartSec = winCursor;
        const extraOutroSpoken = spokenDurs[extraOutroIdx] ?? segDurs[extraOutroIdx];
        speechWindows.push({ start: winCursor, end: winCursor + extraOutroSpoken });
      }
    }

    const proj = reelCardsToLessonProject(cards, {
      title: lessonTitle,
      theme: selectedTheme,
      aspectRatio: reelsAspectRatio,
      targetLang,
      learningLanguage: langAtStart,
      backgroundImage,
      subtitleConfig: {
        position: subtitlePosition,
        size: subtitleSize,
        boxStyle: subtitleBoxStyle,
      },
      compositionId:
        selectedComposition === 'cartoon-host'
          ? 'cartoon-host'
          : sceneJsonOverride?.compositionId || selectedComposition,
      cardDurationsSec: durations,
      cardTimings: timings,
      audioFileName: rawFileName,
      sceneJsonOverride,
      watermark: watermarkConfig,
      titleLayout: titleLayoutByAspect[reelsAspectRatio],
      enableLearningAudio: allowLearningAudio,
      enableExplanationAudio: allowExplAudio,
      hiddenElementIds,
    });

    // Map per-segment WordBoundary cues cleanly onto proj.cues (handles single, Dual-TTS & multi-repeat translation)
    let syncedProj: LessonProject = proj;
    if (data.hasWordBoundaries && Array.isArray(data.cues) && data.cues.length > 0) {
      let projCueCursor = 0;
      const mappedWordsByProjCue: Array<Array<{ word: string; start: number; end: number }>> = [];
      for (const m of cardMapping) {
        if (m.isTranslation) {
          const qWords = m.qIdx !== null ? data.cues[m.qIdx]?.words ?? [] : [];
          mappedWordsByProjCue[projCueCursor++] = qWords.map((w) => ({ ...w }));
          for (const rIdx of m.repeatIndices || []) {
            const rWords = data.cues[rIdx]?.words ?? [];
            mappedWordsByProjCue[projCueCursor++] = rWords.map((w) => ({ ...w }));
          }
          if (m.explIdx !== null) {
            const eWords = data.cues[m.explIdx]?.words ?? [];
            mappedWordsByProjCue[projCueCursor++] = eWords.map((w) => ({ ...w }));
          }
        } else if (m.isQuiz) {
          const qWords = m.qIdx !== null ? data.cues[m.qIdx]?.words ?? [] : [];
          mappedWordsByProjCue[projCueCursor++] = qWords.map((w) => ({ ...w }));
          if (m.hasAnswerCue) {
            const aWords = m.aIdx !== null ? data.cues[m.aIdx]?.words ?? [] : [];
            const eWords = m.explIdx !== null ? data.cues[m.explIdx]?.words ?? [] : [];
            mappedWordsByProjCue[projCueCursor++] = [...aWords, ...eWords].map((w) => ({ ...w }));
          }
        } else {
          const qWords = m.qIdx !== null ? data.cues[m.qIdx]?.words ?? [] : [];
          const eWords = m.explIdx !== null ? data.cues[m.explIdx]?.words ?? [] : [];
          mappedWordsByProjCue[projCueCursor++] = [...qWords, ...eWords].map((w) => ({ ...w }));
        }
      }
      const mergedCues = proj.cues.map((orig, idx) => {
        const mapped = mappedWordsByProjCue[idx];
        if (mapped && mapped.length > 0) {
          return {
            ...orig,
            start: Number(Math.min(orig.start, mapped[0].start).toFixed(3)),
            end: Number(Math.max(orig.end, mapped[mapped.length - 1].end).toFixed(3)),
            words: mapped,
          };
        }
        return orig;
      });
      syncedProj = resyncProjectTimingToCues(proj, mergedCues, { resyncVisuals: false });
    }
    const nextSyncedCues =
      data.hasWordBoundaries && Array.isArray(data.cues) && data.cues.length > 0
        ? syncedProj.cues
        : null;

    let finalAudioFile: File = rawAudioFile;
    const introSec = getEffectiveIntroSeconds(syncedProj);
    const countdownCues = extractCountdownWindowsFromElements(syncedProj.elements).map((cw) => ({
      ...cw,
      startSec: Number((cw.startSec + introSec).toFixed(3)),
      endSec: Number((cw.endSec + introSec).toFixed(3)),
      tickTimesSec: cw.tickTimesSec.map((t) => Number((t + introSec).toFixed(3))),
      revealChimeSec:
        typeof cw.revealChimeSec === 'number'
          ? Number((cw.revealChimeSec + introSec).toFixed(3))
          : undefined,
    }));
    const shiftedSpeechWindows = speechWindows.map((sw) => ({
      start: Number((sw.start + introSec).toFixed(3)),
      end: Number((sw.end + introSec).toFixed(3)),
    }));
    const shiftedOutroStartSec =
      typeof outroStartSec === 'number' ? Number((outroStartSec + introSec).toFixed(3)) : undefined;
    const shouldMixBgm = (bgmPreset !== 'none' || Boolean(customBgmFile)) && bgmVolume > 0;
    const shouldMixCountdown = enableCountdownSfx && countdownCues.length > 0;
    if (shouldMixBgm || shouldMixCountdown || introSec > 0) {
      const mixLbl =
        shouldMixCountdown && shouldMixBgm
          ? 'Đang hòa âm nhạc nền + hiệu ứng đếm ngược...'
          : shouldMixCountdown
            ? 'Đang ghép hiệu ứng âm thanh đếm ngược...'
            : shouldMixBgm
              ? 'Đang hòa âm nhạc nền + giọng đọc...'
              : 'Đang đồng bộ khoảng chờ Intro vào Audio...';
      updateRenderTaskSlot(originSlotId, { stageLabel: mixLbl });
      if (activeModeRef.current === originMode) {
        setTtsStageLabel(mixLbl);
      }
      const mixed = await mixVoiceWithBgmPreset({
        voiceFile: rawAudioFile,
        bgmPreset: shouldMixBgm ? bgmPreset : 'none',
        bgmVolume,
        customBgmFile,
        speechWindows: shiftedSpeechWindows,
        countdownWindows: countdownCues,
        enableCountdownSfx,
        voiceDelaySec: introSec,
        introEndSec: introSec,
        outroStartSec: shiftedOutroStartSec,
        minTotalDurationSec: syncedProj.duration,
        outputFileName: cleanDownloadFileName(leveledTitleStem, 'wav', 'English Reels'),
      });
      if (mixed.file) {
        finalAudioFile = mixed.file;
      }
    }

    const nextAudioUrl = URL.createObjectURL(finalAudioFile);
    createdAudioUrlsRef.current.add(nextAudioUrl);

    if (activeModeRef.current === originMode) {
      setCustomSyncedCues(nextSyncedCues);
      setSyncedTimingOffsetMs(0);
      setSyncedSpeedFactor(1);
      setGeneratedAudioUrl((prev) => {
        if (prev && createdAudioUrlsRef.current.has(prev)) {
          const stillReferenced = Object.entries(modeWorkspacesRef.current).some(
            ([k, ws]) => k !== originMode && ws?.generatedAudioUrl === prev,
          );
          if (!stillReferenced) {
            URL.revokeObjectURL(prev);
            createdAudioUrlsRef.current.delete(prev);
          }
        }
        return nextAudioUrl;
      });
      setGeneratedAudioFile(finalAudioFile);
      setGeneratedDurations(durations);
      setGeneratedTimings(timings);
      setSynthesizedAudioSig(signatureAtStart);
    } else {
      const existingWs = modeWorkspacesRef.current[originMode];
      if (existingWs) {
        modeWorkspacesRef.current[originMode] = {
          ...existingWs,
          generatedAudioFile: finalAudioFile,
          generatedAudioUrl: nextAudioUrl,
          generatedDurations: durations,
          generatedTimings: timings,
          customSyncedCues: nextSyncedCues,
          syncedTimingOffsetMs: 0,
          syncedSpeedFactor: 1,
          synthesizedAudioSig: signatureAtStart,
        };
      }
    }

    void saveReelsDraftCheckpoint(
      {
        version: 1,
        mode: originMode,
        updatedAt: Date.now(),
        activeRenderInterrupted: Boolean(runOptions?.activeRenderInterrupted),
        interruptedStage: runOptions?.activeRenderInterrupted ? 'Đã tạo xong Audio, đang render MP4' : undefined,
        lessonTitle: titleAtStart,
        parsedLessonLevel: levelAtStart,
        reelMode: reelModeAtStart,
        cards: cardsAtStart,
        rawText: rawTextAtStart,
        pastedAiJson: pastedAiJsonAtStart,
        generatedDurations: durations,
        generatedTimings: timings,
        customSyncedCues: nextSyncedCues,
        synthesizedAudioSig: signatureAtStart,
        hasAudioFile: true,
        audioFileName: finalAudioFile.name,
      },
      finalAudioFile,
    );

    syncedProj = applyElementLayoutOverrides({
      ...syncedProj,
      audioFileName: finalAudioFile.name,
    });
    return { audioFile: finalAudioFile, durations, timings, project: syncedProj };
  };

  const handleResyncReelsAudio = async () => {
    if (!generatedAudioFile || isResyncingReels) return;
    setStudioError(null);
    setIsResyncingReels(true);
    setTtsProgress(10);
    setTtsStageLabel('Đang khớp lại Sub & Karaoke với Audio Reels...');
    try {
      const res = await resyncCuesToAudioFile({
        audioFile: generatedAudioFile,
        cues: previewProject.cues,
        alignMode: 'fast-forced',
        lang: selectedVoiceLang,
        onProgress: (pct, lbl) => {
          setTtsProgress(pct);
          setTtsStageLabel(lbl);
        },
      });
      setCustomSyncedCues(res.cues);
      setSyncedTimingOffsetMs(0);
      setSyncedSpeedFactor(1);
      setExportNotice(`Đã khớp lại ${res.cues.length > 0 ? `${res.cues.length} ` : ''}mốc Sub & Karaoke theo Audio (${res.backendUsed})!`);
    } catch (err) {
      setStudioError(err instanceof Error ? err.message : 'Lỗi đồng bộ lại Sub & Karaoke.');
    } finally {
      setIsResyncingReels(false);
      setTtsProgress(0);
      setTtsStageLabel('');
    }
  };

  const handleGeneratePreviewVideoAudio = async () => {
    if (cards.length === 0) return;
    const originMode = activeModeRef.current;
    const slotId = getReelsSlotId(originMode);
    const conflict = checkRenderConcurrencyConflict(getRenderTasksSnapshot(), slotId);
    if (conflict) {
      setConcurrencyConflict(conflict);
      setModeStudioError(originMode, conflict.message);
      return;
    }

    setConcurrencyConflict(null);
    setModeStudioError(originMode, null);
    setModeExportNotice(originMode, null);
    setLocalIsGeneratingAudio(true);
    startRenderTaskSlot(slotId, {
      kind: 'audio',
      title: lessonTitle || 'Audio Reels',
      stageLabel: 'Đang tổng hợp giọng đọc TTS...',
      progress: 0.04,
    });

    let ttsOk = false;
    let errMsg: string | null = null;
    try {
      await synthesizeLessonAudioBundle(undefined, undefined, {
        targetMode: originMode,
        slotId,
        activeRenderInterrupted: false,
      });
      ttsOk = true;
      if (activeModeRef.current === originMode) {
        setPreviewViewMode('video');
        setVideoTime(0);
        setIsVideoPlaying(true);
      }
      setModeExportNotice(
        originMode,
        `Đã tạo giọng đọc chuẩn kèm nhạc nền & đồng bộ vào Video ${reelsAspectRatio}!`,
      );
    } catch (err) {
      errMsg = err instanceof Error ? err.message : 'Lỗi khi tạo Audio TTS.';
      setModeStudioError(originMode, errMsg);
    } finally {
      setLocalIsGeneratingAudio(false);
      setTtsProgress(0);
      setTtsStageLabel('');
      finishRenderTaskSlot(slotId, {
        status: ttsOk ? 'done' : 'error',
        notice: ttsOk ? 'Đã tạo xong Audio Reels' : null,
        error: errMsg,
      });
    }
  };

  const handleDirectRenderVideo = async () => {
    const originMode = activeModeRef.current;
    const slotId = getReelsSlotId(originMode);
    if (cards.length === 0) return;
    if (getRenderTask(slotId).status === 'rendering') return;

    const conflict = checkRenderConcurrencyConflict(getRenderTasksSnapshot(), slotId);
    if (conflict) {
      setConcurrencyConflict(conflict);
      setModeStudioError(originMode, conflict.message);
      return;
    }

    const controller = new AbortController();
    exportAbortByModeRef.current[originMode] = controller;
    if (originMode === activeModeRef.current) {
      exportAbortRef.current = controller;
    }

    setIsVideoPlaying(false);
    setConcurrencyConflict(null);
    setModeStudioError(originMode, null);
    setModeExportNotice(originMode, null);

    const activeFileLevel =
      originMode === 'creator'
        ? creatorLevel
        : originMode === 'translation'
          ? translationLevel
          : parsedLessonLevel;
    const titleAtStart = lessonTitle;
    const langAtStart = detectedLearningLangForDesc;
    const aspectAtStart = reelsAspectRatio;
    const resAtStart = mp4Resolution;
    const qualAtStart = mp4Quality;
    const fpsAtStart = mp4Fps;
    const descTxtAtStart = videoDescription.txtContent;
    const autoShutdownAtStart = autoShutdownAfterRender;

    startRenderTaskSlot(slotId, {
      kind: 'render',
      title: titleAtStart || 'English Reels',
      stageLabel: `Đang chuẩn bị âm thanh & cảnh ${aspectAtStart}...`,
      progress: 0.02,
      onAbort: () => controller.abort(),
    });

    void saveReelsDraftCheckpoint(
      {
        version: 1,
        mode: originMode,
        updatedAt: Date.now(),
        activeRenderInterrupted: true,
        interruptedStage: `Đang chuẩn bị render MP4 (${aspectAtStart})`,
        lessonTitle: titleAtStart,
        parsedLessonLevel: activeFileLevel,
        reelMode: mode,
        cards,
        rawText,
        pastedAiJson,
        generatedDurations,
        generatedTimings,
        customSyncedCues,
        synthesizedAudioSig,
        hasAudioFile: Boolean(generatedAudioFile),
        audioFileName: generatedAudioFile?.name,
      },
      generatedAudioFile,
    );

    let outcome: 'done' | 'error' | 'aborted' = 'error';
    let outcomeMsg: string | null = null;

    try {
      let targetProject = previewProject;
      let targetAudio = generatedAudioFile;

      if (!targetAudio || synthesizedAudioSig !== currentAudioSignature) {
        updateRenderTaskSlot(slotId, {
          stageLabel: 'Đang tạo lại giọng đọc & nhạc nền cho video mới...',
          progress: 0.04,
        });
        const bundled = await synthesizeLessonAudioBundle(undefined, undefined, {
          targetMode: originMode,
          slotId,
          activeRenderInterrupted: true,
        });
        targetProject = bundled.project;
        targetAudio = bundled.audioFile;
      }

      if (controller.signal.aborted) {
        throw new ExportAbortedError();
      }

      const cleanExportBase = buildLeveledOutputStem({
        title: titleAtStart,
        level: activeFileLevel,
        learningLanguage: langAtStart,
        fallback: 'English Reels',
      });

      const result = await exportProjectToVideo(
        targetProject,
        targetAudio,
        ({ progress, stageLabel }) => {
          updateRenderTaskSlot(slotId, { progress, stageLabel });
        },
        {
          aspectRatio: aspectAtStart,
          resolution: resAtStart,
          quality: qualAtStart,
          fps: fpsAtStart,
        },
        {
          signal: controller.signal,
          customFileBase: cleanExportBase,
          alsoSaveToServerOutput: true,
          skipDownload: true,
          savePath: TAB_OUTPUT_SUBFOLDERS.reels,
          sourceTab: 'English Reels',
          companionText: descTxtAtStart,
        },
      );

      emitOutputUpdated({ sourceTab: 'English Reels' });
      playExportCompleteSound();
      outcome = 'done';
      outcomeMsg = `Đã xuất thành công ${result.fileName} kèm ${cleanExportBase}.txt${result.savedPath ? ` (lưu tại ${result.savedPath})` : ''}!`;
      setModeExportNotice(originMode, outcomeMsg);
      if (autoShutdownAtStart) {
        setShutdownCountdownInfo({ active: true, title: result.fileName });
      }
    } catch (err) {
      if (err instanceof ExportAbortedError || controller.signal.aborted) {
        outcome = 'aborted';
        outcomeMsg = 'Đã hủy quá trình render Video.';
        setModeExportNotice(originMode, outcomeMsg);
      } else {
        outcome = 'error';
        outcomeMsg = err instanceof Error ? err.message : 'Không thể render Video MP4.';
        setModeStudioError(originMode, outcomeMsg);
      }
    } finally {
      exportAbortByModeRef.current[originMode] = null;
      if (exportAbortRef.current === controller) {
        exportAbortRef.current = null;
      }
      void clearReelsDraftInterruptFlag(originMode);
      finishRenderTaskSlot(slotId, {
        status: outcome,
        notice: outcome === 'done' ? outcomeMsg : null,
        error: outcome === 'error' || outcome === 'aborted' ? outcomeMsg : null,
      });
    }
  };

  const handleServerAiGenerateCards = async () => {
    if (!effectiveHasGeminiKey || isGeneratingAiCards) return;
    setIsGeneratingAiCards(true);
    setAiJsonError(null);
    setAiJsonNotice(null);
    try {
      const res = await fetch('/api/ai/generate-scene', {
        method: 'POST',
        headers: buildApiKeyHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ prompt: webAiPrompt }),
      });
      const data = await parseApiJson<{ text?: string; error?: string }>(
        res,
        'Gemini không trả về kết quả hợp lệ',
      );
      if (!res.ok || !data?.text) {
        throw new Error(data?.error || 'Gemini không trả về kết quả hợp lệ.');
      }
      setPastedAiJson(data.text);
      const parsed = parseEnglishReelsAiJson(data.text, { targetLang });
      if (!parsed) {
        throw new Error('JSON AI trả về chưa khớp schema cards.');
      }
      if (parsed.cartoonAnimations && parsed.cartoonAnimations.length > 0) {
        for (const anim of parsed.cartoonAnimations) {
          if (anim && (anim.id || anim.label)) {
            upsertCartoonAnimation(anim);
          }
        }
      }
      const nextComp = parsed.compositionId || parsed.sceneJson?.compositionId;
      if (nextComp && selectedComposition !== 'cartoon-host') {
        setSelectedComposition(nextComp);
      }
      setLessonTitle(parsed.title);
      setParsedLessonLevel(parsed.level || '');
      manualTitleEditedRef.current = false;
      setMode(parsed.mode);
      setCards(parsed.cards);
      hasCustomCardsRef.current = true;
      if (typeof parsed.thinkSec === 'number') setTranslationThinkSec(parsed.thinkSec);
      if (typeof parsed.repeatCount === 'number') setTranslationRepeatCount(parsed.repeatCount);
      const detectedLang = parsed.learningLang || inferLearningLangFromCards(parsed.cards);
      syncVoiceForDetectedLang(detectedLang);
      setSceneJsonOverride(parsed.sceneJson ?? null);
      setActiveCardIdx(0);
      setHiddenElementIds([]);
      setSelectedPreviewElementId(null);
      invalidateSynthesizedAudio();
      const shortfallWarn =
        parsed.durationReport && !parsed.durationReport.metMinimum && parsed.durationReport.shortfallReason
          ? ` ⚠️ Chưa đạt tối thiểu ${parsed.durationReport.targetMinutes ?? '?'}p (ước tính ~${parsed.durationReport.estimatedMinutes ?? '?'}p) — Lý do AI báo: ${parsed.durationReport.shortfallReason}`
          : '';
      setAiJsonNotice(`AI Server đã tạo ${parsed.cards.length} thẻ bài học (${detectedLang.toUpperCase()}) kèm lời đọc tự nhiên!${shortfallWarn}`);
    } catch (err) {
      setAiJsonError(err instanceof Error ? err.message : 'Lỗi gọi Gemini AI trên server.');
    } finally {
      setIsGeneratingAiCards(false);
    }
  };

  const handleGenerateAndSendToStudio = async (withTtsAudio: boolean) => {
    if (cards.length === 0) return;
    setStudioError(null);

    if (!withTtsAudio) {
      onSendToStudio(previewProject, generatedAudioFile);
      return;
    }

    const originMode = activeModeRef.current;
    const slotId = getReelsSlotId(originMode);
    const conflict = checkRenderConcurrencyConflict(getRenderTasksSnapshot(), slotId);
    if (conflict) {
      setConcurrencyConflict(conflict);
      setStudioError(conflict.message);
      return;
    }

    setLocalIsGeneratingAudio(true);
    startRenderTaskSlot(slotId, {
      kind: 'audio',
      title: lessonTitle || 'Audio Reels',
      stageLabel: 'Đang tổng hợp TTS gửi sang Studio...',
      progress: 0.05,
    });
    let ok = false;
    let errMsg: string | null = null;
    try {
      const bundled = await synthesizeLessonAudioBundle(undefined, undefined, {
        targetMode: originMode,
        slotId,
      });
      ok = true;
      onSendToStudio(bundled.project, bundled.audioFile);
    } catch (err) {
      errMsg = err instanceof Error ? err.message : 'Lỗi khi tạo Audio TTS.';
      setStudioError(errMsg);
    } finally {
      setLocalIsGeneratingAudio(false);
      finishRenderTaskSlot(slotId, {
        status: ok ? 'done' : 'error',
        error: errMsg,
      });
    }
  };

  return (
    <div className="max-w-[1400px] w-full mx-auto p-4 lg:p-6 space-y-5">
      {/* Top Hero / URL Scraper Bar */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              Video Ngoại Ngữ AI — Từ Nguồn · AI Tạo Từ &amp; Câu · Phản Xạ Dịch Câu
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Chọn ngoại ngữ (Anh, Nhật N5–N1, Trung, Hàn, Pháp, TBN), thời lượng theo phút, luyện phản xạ đếm ngược kèm lặp lại đa giọng và xuất khung dọc 9:16 hoặc ngang 16:9.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <div
              role="tablist"
              aria-label="Chế độ tạo video ngoại ngữ"
              className="inline-flex flex-wrap sm:flex-nowrap max-w-full gap-0.5 p-0.5 bg-slate-100 border border-slate-200 rounded-lg"
            >
              <button
                type="button"
                role="tab"
                data-testid="reels-subtab-source"
                aria-selected={reelCreationMode === 'source'}
                onClick={() => switchReelCreationMode('source')}
                className={`px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
                  reelCreationMode === 'source'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Từ Bài / Link</span>
                {(renderTasks['reels:source']?.status === 'rendering' ||
                  renderTasks['reels:source']?.status === 'synthesizing') && (
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                )}
              </button>
              <button
                type="button"
                role="tab"
                data-testid="reels-subtab-creator"
                aria-selected={reelCreationMode === 'creator'}
                onClick={() => switchReelCreationMode('creator')}
                className={`inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  reelCreationMode === 'creator'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI Tạo Từ &amp; Câu</span>
                {(renderTasks['reels:creator']?.status === 'rendering' ||
                  renderTasks['reels:creator']?.status === 'synthesizing') && (
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </button>
              <button
                type="button"
                role="tab"
                data-testid="reels-subtab-translation"
                aria-selected={reelCreationMode === 'translation'}
                onClick={() => switchReelCreationMode('translation')}
                className={`inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  reelCreationMode === 'translation'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Phản Xạ Dịch Câu</span>
                {(renderTasks['reels:translation']?.status === 'rendering' ||
                  renderTasks['reels:translation']?.status === 'synthesizing') && (
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </button>
            </div>
            <span className="text-xs font-medium text-indigo-700 tabular-nums whitespace-nowrap">
              {cards.length} thẻ đang soạn
            </span>
          </div>
        </div>

        {/* Recovery banner if a previous Reels render crashed or reloaded mid-way */}
        {interruptedDrafts.length > 0 && (
          <div
            data-testid="reels-recovery-banner"
            className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950"
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                <strong>Phát hiện bài Reels bị gián đoạn trước khi tải lại trang:</strong>{' '}
                {interruptedDrafts
                  .map(
                    (it) =>
                      `${it.draft.mode === 'creator' ? 'AI Tạo Từ & Câu' : it.draft.mode === 'translation' ? 'Phản Xạ Dịch Câu' : 'Từ Bài / Link'} · "${it.draft.lessonTitle}" (${it.draft.cards.length} thẻ${it.audioFile ? ' + đã lưu Audio' : ''})`,
                  )
                  .join('; ')}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {interruptedDrafts.map((it) => (
                <button
                  key={it.draft.mode}
                  type="button"
                  onClick={() => {
                    const targetM = it.draft.mode;
                    if (activeModeRef.current !== targetM) {
                      switchReelCreationMode(targetM);
                    }
                    setTimeout(() => {
                      hasCustomCardsRef.current = true;
                      setCards(it.draft.cards);
                      setLessonTitle(it.draft.lessonTitle);
                      setParsedLessonLevel(it.draft.parsedLessonLevel || '');
                      setMode(it.draft.reelMode);
                      setRawText(it.draft.rawText);
                      setPastedAiJson(it.draft.pastedAiJson);
                      setGeneratedDurations(it.draft.generatedDurations);
                      setGeneratedTimings(it.draft.generatedTimings);
                      setCustomSyncedCues(it.draft.customSyncedCues ?? null);
                      setSynthesizedAudioSig(it.draft.synthesizedAudioSig);
                      if (it.audioFile) {
                        const url = URL.createObjectURL(it.audioFile);
                        createdAudioUrlsRef.current.add(url);
                        setGeneratedAudioFile(it.audioFile);
                        setGeneratedAudioUrl(url);
                      }
                      setModeExportNotice(
                        targetM,
                        `Đã khôi phục bộ ${it.draft.cards.length} thẻ${it.audioFile ? ' kèm file Audio' : ''}! Bạn có thể bấm Render MP4 ngay.`,
                      );
                    }, 30);
                    void clearReelsDraftInterruptFlag(targetM);
                    setInterruptedDrafts((prev) => prev.filter((x) => x.draft.mode !== targetM));
                  }}
                  className="px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                >
                  Khôi phục ({it.draft.mode === 'creator' ? 'AI Tạo Từ' : it.draft.mode === 'translation' ? 'Phản Xạ' : 'Từ Bài'})
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  interruptedDrafts.forEach((it) => void clearReelsDraftInterruptFlag(it.draft.mode));
                  setInterruptedDrafts([]);
                }}
                className="px-2 py-1 rounded-md bg-white border border-amber-300 text-amber-900 hover:bg-amber-100"
              >
                Bỏ qua
              </button>
            </div>
          </div>
        )}

        {reelCreationMode === 'source' && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[260px]">
                <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="Dán URL bài học tiếng Anh (Reading, True/False, Comprehension, Vocabulary)..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <PasteButton
                size="sm"
                onPaste={(txt) => setUrlInput(txt.trim())}
                title="Dán nhanh URL từ Clipboard"
              />
              <button
                type="button"
                disabled={isScraping}
                onClick={() => void handleScrapeUrl()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                {isScraping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                <span>{isScraping ? 'Đang bóc nội dung...' : 'Bóc nội dung URL'}</span>
              </button>
            </div>

            {scrapeError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">
                {scrapeError}
              </p>
            )}

            {/* Directory / Sub-lesson Links if URL is a Table of Contents */}
            {scrapeResult && scrapeResult.links.length > 0 && (
              <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-200 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs font-semibold text-indigo-900">
                  <span>
                    {scrapeResult.isDirectoryPage
                      ? 'Phát hiện trang Mục Lục — bấm chọn bài học con để bóc trực tiếp:'
                      : `Tìm thấy ${scrapeResult.links.length} bài tập / liên kết con trên trang:`}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {scrapeResult.links.map((lk) => (
                    <button
                      key={lk.url}
                      type="button"
                      onClick={() => void handleScrapeUrl(lk.url)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-indigo-800 bg-white border border-indigo-200 rounded-md hover:bg-indigo-100 transition-colors"
                    >
                      <span className="truncate max-w-[220px]">{lk.title}</span>
                      <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Multi-Exercise Picker */}
            {scrapeResult && scrapeResult.exercises.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] font-semibold text-slate-600">Các bài tập con tách được:</span>
                {scrapeResult.exercises.map((ex) => (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => {
                      setRawText(ex.rawText);
                      setMode(ex.mode);
                      setLessonTitle(ex.title);
                      const built = buildReelCardsRuleBased(ex.rawText, {
                        title: ex.title,
                        mode: ex.mode,
                        targetLang,
                      });
                      setCards(built.cards);
                      setActiveCardIdx(0);
                      setHiddenElementIds([]);
                      setSelectedPreviewElementId(null);
                    }}
                    className="px-2.5 py-1 text-[11px] font-medium bg-slate-100 hover:bg-indigo-50 border border-slate-200 rounded-md text-slate-700"
                  >
                    {ex.title} ({ex.mode})
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Content, Web AI Prompt & Card Editor */}
        <div className="lg:col-span-7 space-y-4">
          {/* Source Text or AI Creator Controls + Prompt AI Web Box */}
          <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            {reelCreationMode === 'source' ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                  <div className="sm:col-span-1">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Tên bài học
                    </label>
                    <input
                      type="text"
                      value={lessonTitle}
                      onChange={(e) => {
                        setLessonTitle(e.target.value);
                        manualTitleEditedRef.current = Boolean(e.target.value.trim());
                      }}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Dạng bài nhận diện
                    </label>
                    <select
                      value={mode}
                      onChange={(e) => setMode(e.target.value as ReelMode)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    >
                      <option value="auto">Tự động (Reading / Quiz / Vocab)</option>
                      <option value="reading">Reading (Đoạn đọc)</option>
                      <option value="quiz">Quiz (True/False &amp; Comprehension)</option>
                      <option value="vocab">Vocabulary (Từ vựng &amp; IPA)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Thời lượng Prompt
                    </label>
                    <select
                      aria-label="Thời lượng render mục tiêu cho Prompt Từ Nguồn"
                      value={String(sourceDurationMinutes)}
                      onChange={(e) => setSourceDurationMinutes(Number(e.target.value) || 2)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg tabular-nums"
                    >
                      <option value="0.5">0.5 phút (30s)</option>
                      <option value="1">1 phút</option>
                      <option value="2">2 phút</option>
                      <option value="3">3 phút</option>
                      <option value="5">5 phút</option>
                      <option value="10">10 phút</option>
                      <option value="15">15 phút</option>
                      <option value="20">20 phút</option>
                      <option value="25">25 phút</option>
                      <option value="30">30 phút</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Quiz trong bài
                    </label>
                    <select
                      aria-label="Tùy chọn Quiz trong bài"
                      value={includeQuizInPrompt}
                      onChange={(e) =>
                        setIncludeQuizInPrompt(e.target.value as 'auto' | 'always' | 'none')
                      }
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    >
                      <option value="auto">Chỉ tạo Quiz nếu bài có câu hỏi</option>
                      <option value="none">Không thêm Quiz (chỉ bài học)</option>
                      <option value="always">Luôn kèm Quiz 5s cuối mỗi phần</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Bản dịch mục tiêu
                    </label>
                    <select
                      aria-label="Bản dịch mục tiêu"
                      value={targetLang}
                      onChange={(e) => {
                        const nextLang = e.target.value;
                        setTargetLang(nextLang);
                        if (nextLang !== 'none') {
                          setExplanationTtsVoice(
                            pickExplanationDefaultVoice(nextLang, activeLearningLang),
                          );
                        } else if (!enableLearningAudio) {
                          setEnableLearningAudio(true);
                        }
                        if (!pastedAiJson.trim() && !sceneJsonOverride) {
                          const cleaned = cleanReadingWorksheetInput(rawText, lessonTitle);
                          const built = buildReelCardsRuleBased(rawText, {
                            title: cleaned.title || lessonTitle,
                            mode,
                            targetLang: nextLang,
                            includeQuiz: includeQuizInPrompt !== 'none',
                          });
                          setCards(built.cards);
                          invalidateSynthesizedAudio();
                        }
                      }}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    >
                      <option value="Tiếng Việt">Dịch sang Tiếng Việt</option>
                      <option value="learning">Giải thích bằng ngôn ngữ muốn học</option>
                      <option value="English">Giải thích bằng English</option>
                      <option value="日本語">Dịch sang Tiếng Nhật</option>
                      <option value="zh">Dịch sang 中文</option>
                      <option value="ko">Dịch sang 한국어</option>
                      <option value="none">Không cần bản dịch</option>
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <label className="text-[11px] font-semibold text-slate-700">
                      Nội dung đã lọc sạch (hoặc dán văn bản bài đọc / từ vựng / câu hỏi)
                    </label>
                    <div className="flex items-center gap-2.5">
                      <PasteButton
                        onPaste={(txt) => {
                          setRawText(txt);
                          if (!manualTitleEditedRef.current) {
                            const guessed = cleanReadingWorksheetInput(txt).title;
                            if (guessed && guessed !== 'Reading Practice') setLessonTitle(guessed);
                          }
                        }}
                        title="Dán nhanh văn bản nguồn (thay thế nội dung hiện tại)"
                      />
                      {effectiveHasGeminiKey && (
                        <button
                          type="button"
                          disabled={isGeneratingAiCards}
                          onClick={() => void handleServerAiGenerateCards()}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-50 whitespace-nowrap"
                        >
                          {isGeneratingAiCards ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Sparkles className="w-3 h-3" />
                          )}
                          <span>{isGeneratingAiCards ? 'AI đang soạn bài...' : 'AI Server soạn Thẻ chuẩn'}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleQuickRuleExtract}
                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 whitespace-nowrap"
                      >
                        Tách thẻ nhanh không cần AI →
                      </button>
                    </div>
                  </div>
                  <textarea
                    rows={5}
                    value={rawText}
                    onChange={(e) => {
                      const val = e.target.value;
                      setRawText(val);
                      if (!manualTitleEditedRef.current) {
                        const guessed = cleanReadingWorksheetInput(val).title;
                        if (guessed && guessed !== 'Reading Practice') setLessonTitle(guessed);
                      }
                    }}
                    className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </>
            ) : reelCreationMode === 'translation' ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xs font-bold text-slate-900">
                      Phản Xạ Dịch Câu Nhanh (Nghe câu gốc → Đếm ngược suy nghĩ → Hiện đáp án &amp; Đọc lặp)
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Nhập từ/câu bất kỳ hoặc bỏ trống để AI tự nghĩ chủ đề hay &amp; đặt tiêu đề thu hút kiểu thử thách phản xạ.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => applyTranslationStarterOrCustom()}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 whitespace-nowrap shrink-0"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Tạo Bộ Thẻ Ngay (Không cần AI)</span>
                    </button>
                    {effectiveHasGeminiKey && (
                      <button
                        type="button"
                        disabled={isGeneratingAiCards}
                        onClick={() => void handleServerAiGenerateCards()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        {isGeneratingAiCards ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        <span>{isGeneratingAiCards ? 'AI đang sáng tạo...' : 'AI Tạo Phản Xạ Ngay'}</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-end">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1 min-h-[24px]">
                      <label htmlFor="tr-topic-hint" className="text-[11px] font-semibold text-slate-700">
                        Chủ đề / Tình huống (tùy chọn — bỏ trống AI tự nghĩ)
                      </label>
                      <PasteButton
                        onPaste={(txt) => setTranslationTopicHint(txt.trim())}
                        title="Dán nhanh chủ đề"
                      />
                    </div>
                    <input
                      id="tr-topic-hint"
                      type="text"
                      value={translationTopicHint}
                      onChange={(e) => setTranslationTopicHint(e.target.value)}
                      placeholder="VD: Câu cửa miệng giao tiếp, Đi làm, Hẹn hò... (bỏ trống AI tự chọn)"
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="tr-lesson-title" className="flex items-center min-h-[24px] text-[11px] font-semibold text-slate-700 mb-1">
                      Tiêu đề Video thu hút (tự động hoặc tự sửa)
                    </label>
                    <input
                      id="tr-lesson-title"
                      type="text"
                      value={lessonTitle}
                      onChange={(e) => {
                        setLessonTitle(e.target.value);
                        manualTitleEditedRef.current = Boolean(e.target.value.trim());
                      }}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label htmlFor="tr-custom-lines" className="text-[11px] font-semibold text-slate-700">
                      Từ vựng hoặc câu muốn luyện (tùy chọn · mỗi dòng 1 mục hoặc cặp &quot;Câu Việt | Câu Ngoại Ngữ&quot; · bỏ trống để AI tự sáng tạo)
                    </label>
                    <PasteButton
                      onPaste={(txt) => setTranslationCustomLines(txt)}
                      title="Dán nhanh danh sách câu / từ muốn luyện"
                    />
                  </div>
                  <textarea
                    id="tr-custom-lines"
                    rows={3}
                    value={translationCustomLines}
                    onChange={(e) => setTranslationCustomLines(e.target.value)}
                    placeholder={'Coi chừng cô ấy đấy! | Watch out for her!\nĐể tôi suy nghĩ thêm đã | Let me sleep on it.\n(Hoặc chỉ nhập từ/câu gợi ý, hoặc bỏ trống hoàn toàn để AI tự sáng tạo)'}
                    className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label
                      htmlFor="tr-learning-lang"
                      className="block text-[11px] font-semibold text-slate-700 mb-1"
                    >
                      Ngôn ngữ muốn học
                    </label>
                    <select
                      id="tr-learning-lang"
                      aria-label="Ngôn ngữ muốn học Phản Xạ Dịch"
                      value={translationLearningLang}
                      onChange={(e) => {
                        const nextLang = e.target.value as LearningLanguageId;
                        setTranslationLearningLang(nextLang);
                        const nextLevels = getLevelsForLearningLanguage(nextLang);
                        const langMeta = LEARNING_LANGUAGE_OPTIONS.find((l) => l.id === nextLang);
                        const nextLvl = langMeta?.defaultLevel || nextLevels[0]?.id || 'B1';
                        setTranslationLevel(nextLvl);
                        if (!isMultilingualVoiceId(ttsVoice)) {
                          setTtsVoice(
                            pickVoiceIdForProviderAndLang(ttsProvider, nextLang, availableVoices),
                          );
                        }
                        if (targetLang === 'learning') {
                          setExplanationTtsVoice(
                            pickExplanationDefaultVoice('learning', nextLang),
                          );
                        }
                        if (!translationCustomLines.trim() && !pastedAiJson.trim()) {
                          applyTranslationStarterOrCustom({
                            learningLang: nextLang,
                            level: nextLvl,
                          });
                        }
                      }}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    >
                      {LEARNING_LANGUAGE_OPTIONS.map((lang) => (
                        <option key={lang.id} value={lang.id}>
                          {lang.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="tr-level"
                      className="block text-[11px] font-semibold text-slate-700 mb-1"
                    >
                      Độ khó (Dễ → Khó)
                    </label>
                    <select
                      id="tr-level"
                      aria-label="Độ khó Phản Xạ Dịch"
                      value={translationLevel}
                      onChange={(e) => setTranslationLevel(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    >
                      {translationLevelOptions.map((lvl) => (
                        <option key={lvl.id} value={lvl.id}>
                          {lvl.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="tr-target-lang"
                      className="block text-[11px] font-semibold text-slate-700 mb-1"
                    >
                      Ngôn ngữ câu gốc
                    </label>
                    <select
                      id="tr-target-lang"
                      aria-label="Ngôn ngữ câu gốc Phản Xạ Dịch"
                      value={targetLang}
                      onChange={(e) => {
                        const nextLang = e.target.value;
                        setTargetLang(nextLang);
                        if (nextLang !== 'none') {
                          setExplanationTtsVoice(
                            pickExplanationDefaultVoice(nextLang, translationLearningLang),
                          );
                        } else if (!enableLearningAudio) {
                          setEnableLearningAudio(true);
                        }
                      }}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    >
                      <option value="Tiếng Việt">Tiếng Việt</option>
                      <option value="learning">Giải thích bằng ngôn ngữ muốn học</option>
                      <option value="English">English</option>
                      <option value="日本語">Tiếng Nhật</option>
                      <option value="zh">中文</option>
                      <option value="ko">한국어</option>
                      <option value="none">Chỉ ngôn ngữ học</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div>
                    <label
                      htmlFor="tr-duration-min"
                      className="block text-[11px] font-semibold text-slate-700 mb-1"
                    >
                      Thời lượng (phút)
                    </label>
                    <select
                      id="tr-duration-min"
                      aria-label="Thời lượng video Phản Xạ Dịch (phút)"
                      value={String(translationDurationMinutes)}
                      onChange={(e) => {
                        const nextMin = Number(e.target.value) || 2;
                        setTranslationDurationMinutes(nextMin);
                        setTranslationItemCount(
                          recommendTranslationItemCount(
                            nextMin,
                            translationThinkSec,
                            translationRepeatCount,
                          ),
                        );
                      }}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg tabular-nums"
                    >
                      <option value="0.5">0.5 phút (30s)</option>
                      <option value="1">1 phút</option>
                      <option value="2">2 phút</option>
                      <option value="3">3 phút</option>
                      <option value="5">5 phút</option>
                      <option value="10">10 phút</option>
                      <option value="15">15 phút</option>
                      <option value="20">20 phút</option>
                      <option value="25">25 phút</option>
                      <option value="30">30 phút</option>
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label
                        htmlFor="tr-item-count"
                        className="text-[11px] font-semibold text-slate-700"
                      >
                        Số câu
                      </label>
                      <label
                        htmlFor="tr-auto-item-count"
                        className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 cursor-pointer select-none"
                      >
                        <input
                          id="tr-auto-item-count"
                          type="checkbox"
                          checked={translationAutoItemCount}
                          onChange={(e) => setTranslationAutoItemCount(e.target.checked)}
                          className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                        />
                        <span>AI tự quyết định</span>
                      </label>
                    </div>
                    <input
                      id="tr-item-count"
                      type="number"
                      aria-label="Số câu Phản Xạ Dịch"
                      disabled={translationAutoItemCount}
                      min={3}
                      max={60}
                      step={1}
                      value={translationItemCount}
                      onChange={(e) =>
                        setTranslationItemCount(
                          Math.max(3, Math.min(60, Math.round(Number(e.target.value) || 6))),
                        )
                      }
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg tabular-nums disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="tr-think-sec"
                      className="block text-[11px] font-semibold text-slate-700 mb-1"
                    >
                      Giây suy nghĩ (s)
                    </label>
                    <input
                      id="tr-think-sec"
                      type="number"
                      aria-label="Số giây suy nghĩ trước khi hiện đáp án"
                      min={1}
                      max={15}
                      step={1}
                      value={translationThinkSec}
                      onChange={(e) => {
                        const nextSec = Math.max(1, Math.min(15, Math.round(Number(e.target.value) || 4)));
                        setTranslationThinkSec(nextSec);
                        setCards((prev) =>
                          prev.map((c) =>
                            c.type === 'translation' ? { ...c, thinkSec: nextSec } : c,
                          ),
                        );
                      }}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg tabular-nums"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="tr-repeat-count"
                      className="block text-[11px] font-semibold text-slate-700 mb-1"
                    >
                      Số lần đọc lặp
                    </label>
                    <input
                      id="tr-repeat-count"
                      type="number"
                      aria-label="Số lần đọc lặp lại câu đáp án"
                      min={1}
                      max={5}
                      step={1}
                      value={translationRepeatCount}
                      onChange={(e) => {
                        const nextRep = Math.max(1, Math.min(5, Math.round(Number(e.target.value) || 2)));
                        setTranslationRepeatCount(nextRep);
                        setCards((prev) =>
                          prev.map((c) =>
                            c.type === 'translation' ? { ...c, repeatCount: nextRep } : c,
                          ),
                        );
                      }}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg tabular-nums"
                    />
                  </div>
                </div>

                <label className="inline-flex items-center gap-2 text-[11px] font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={translationIncludeNuance}
                    onChange={(e) => setTranslationIncludeNuance(e.target.checked)}
                    className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span>Đọc thêm 1 câu giải thích sắc thái bản xứ sau khi lặp xong</span>
                </label>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xs font-bold text-slate-900">
                      Chế độ AI Tạo Từ &amp; Mẫu Câu (Autonomous Content Director)
                    </h2>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Chọn ngôn ngữ học, trình độ ({creatorLevelOptions[0]?.id} → {creatorLevelOptions[creatorLevelOptions.length - 1]?.id}) và số phút mong muốn — AI tự chọn chủ đề cuốn hút nhất.
                      </p>
                    </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => applyStarterLesson(creatorLearningLang, targetLang, creatorLevel)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 whitespace-nowrap shrink-0"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>
                        Nạp mẫu thử {LEARNING_LANGUAGE_OPTIONS.find((l) => l.id === creatorLearningLang)?.nativeName || creatorLearningLang}
                      </span>
                    </button>
                    {effectiveHasGeminiKey && (
                      <button
                        type="button"
                        disabled={isGeneratingAiCards}
                        onClick={() => void handleServerAiGenerateCards()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        {isGeneratingAiCards ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        <span>{isGeneratingAiCards ? 'AI đang sáng tạo...' : 'AI Tự Sáng Tạo Ngay'}</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Chủ đề / Gợi ý (tùy chọn — bỏ trống AI tự chọn)
                      </label>
                      <PasteButton
                        onPaste={(txt) => setCreatorTopicHint(txt.trim())}
                        title="Dán nhanh gợi ý chủ đề"
                      />
                    </div>
                    <input
                      type="text"
                      value={creatorTopicHint}
                      onChange={(e) => setCreatorTopicHint(e.target.value)}
                      placeholder="VD: Từ vựng nâng cấp giao tiếp công sở, N5 quán ăn... (hoặc để trống)"
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Định dạng nội dung (A–N)
                    </label>
                    <select
                      aria-label="Định dạng nội dung AI Creator"
                      value={creatorFormat}
                      onChange={(e) => setCreatorFormat(e.target.value as CreatorFormatCategory)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    >
                      {CREATOR_FORMAT_OPTIONS.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label htmlFor="creator-script-input" className="text-[11px] font-semibold text-slate-700">
                      Subtitle / Script đầu vào (tùy chọn — bỏ trống AI tự sáng tạo, điền vào để AI biên tập thành file JSON)
                    </label>
                    <PasteButton
                      onPaste={(txt) => setCreatorScriptInput(txt)}
                      title="Dán nhanh subtitle / script cho AI Creator"
                    />
                  </div>
                  <textarea
                    id="creator-script-input"
                    rows={2}
                    value={creatorScriptInput}
                    onChange={(e) => setCreatorScriptInput(e.target.value)}
                    placeholder="Nhập danh sách câu, subtitle hoặc kịch bản thô nếu muốn AI biên tập lại thành các thẻ JSON..."
                    className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label
                      htmlFor="creator-learning-lang"
                      className="block text-[11px] font-semibold text-slate-700 mb-1"
                    >
                      Ngôn ngữ muốn học
                    </label>
                    <select
                      id="creator-learning-lang"
                      aria-label="Ngôn ngữ muốn học"
                      value={creatorLearningLang}
                      onChange={(e) => {
                        const nextLang = e.target.value as LearningLanguageId;
                        setCreatorLearningLang(nextLang);
                        const nextLevels = getLevelsForLearningLanguage(nextLang);
                        const langMeta = LEARNING_LANGUAGE_OPTIONS.find((l) => l.id === nextLang);
                        const nextLvl = langMeta?.defaultLevel || nextLevels[0]?.id || 'B1';
                        setCreatorLevel(nextLvl);
                        if (!isMultilingualVoiceId(ttsVoice)) {
                          setTtsVoice(
                            pickVoiceIdForProviderAndLang(ttsProvider, nextLang, availableVoices),
                          );
                        }
                        if (targetLang === 'learning') {
                          setExplanationTtsVoice(
                            pickExplanationDefaultVoice('learning', nextLang),
                          );
                        }
                        const isSampleOrUntouched =
                          !hasCustomCardsRef.current ||
                          (!pastedAiJson.trim() &&
                            (lessonTitle === 'Hotel Check-in & Polite Requests' ||
                              isStarterSampleTitle(lessonTitle)));
                        if (isSampleOrUntouched) {
                          applyStarterLesson(nextLang, targetLang, nextLvl);
                        }
                      }}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    >
                      {LEARNING_LANGUAGE_OPTIONS.map((lang) => (
                        <option key={lang.id} value={lang.id}>
                          {lang.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="creator-level"
                      className="block text-[11px] font-semibold text-slate-700 mb-1"
                    >
                      Trình độ (Dễ → Khó)
                    </label>
                    <select
                      id="creator-level"
                      aria-label="Trình độ (Dễ đến Khó)"
                      value={creatorLevel}
                      onChange={(e) => setCreatorLevel(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    >
                      {creatorLevelOptions.map((lvl) => (
                        <option key={lvl.id} value={lvl.id}>
                          {lvl.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="creator-target-lang"
                      className="block text-[11px] font-semibold text-slate-700 mb-1"
                    >
                      Ngôn ngữ giải thích
                    </label>
                    <select
                      id="creator-target-lang"
                      aria-label="Ngôn ngữ giải thích Creator"
                      value={targetLang}
                      onChange={(e) => {
                        const nextLang = e.target.value;
                        setTargetLang(nextLang);
                        if (nextLang !== 'none') {
                          setExplanationTtsVoice(
                            pickExplanationDefaultVoice(nextLang, creatorLearningLang),
                          );
                        } else if (!enableLearningAudio) {
                          setEnableLearningAudio(true);
                        }
                        setCreatorItemCount(
                          recommendCreatorItemCount(creatorDurationMinutes, enableDualTts && nextLang !== 'none'),
                        );
                        const isSampleOrUntouched =
                          !hasCustomCardsRef.current ||
                          (!pastedAiJson.trim() &&
                            (lessonTitle === 'Hotel Check-in & Polite Requests' ||
                              isStarterSampleTitle(lessonTitle)));
                        if (isSampleOrUntouched) {
                          applyStarterLesson(creatorLearningLang, nextLang, creatorLevel);
                        }
                      }}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    >
                      <option value="Tiếng Việt">Tiếng Việt</option>
                      <option value="learning">Giải thích bằng ngôn ngữ muốn học</option>
                      <option value="English">Giải thích English</option>
                      <option value="日本語">Tiếng Nhật</option>
                      <option value="zh">中文</option>
                      <option value="ko">한국어</option>
                      <option value="none">Chỉ ngôn ngữ học</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label
                      htmlFor="creator-duration-min"
                      className="block text-[11px] font-semibold text-slate-700 mb-1"
                    >
                      Thời lượng video (phút · 0.5 – 30 phút)
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        id="creator-duration-min"
                        type="number"
                        aria-label="Thời lượng video tính bằng phút"
                        min={0.5}
                        max={30}
                        step={0.5}
                        value={creatorDurationMinutes}
                        onChange={(e) => {
                          const raw = Number(e.target.value);
                          const nextMin = Number.isFinite(raw) ? Math.max(0.5, Math.min(30, raw)) : 1;
                          setCreatorDurationMinutes(nextMin);
                          setCreatorItemCount(
                            recommendCreatorItemCount(nextMin, enableDualTts && targetLang !== 'none'),
                          );
                        }}
                        className="w-20 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg tabular-nums"
                      />
                      <select
                        aria-label="Chọn nhanh thời lượng phút"
                        value={[0.5, 1, 2, 3, 5, 10, 15, 20, 25, 30].includes(creatorDurationMinutes) ? String(creatorDurationMinutes) : 'custom'}
                        onChange={(e) => {
                          if (e.target.value === 'custom') return;
                          const nextMin = Number(e.target.value);
                          setCreatorDurationMinutes(nextMin);
                          setCreatorItemCount(
                            recommendCreatorItemCount(nextMin, enableDualTts && targetLang !== 'none'),
                          );
                        }}
                        className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      >
                        <option value="0.5">0.5 phút (30 giây)</option>
                        <option value="1">1 phút</option>
                        <option value="2">2 phút</option>
                        <option value="3">3 phút</option>
                        <option value="5">5 phút</option>
                        <option value="10">10 phút</option>
                        <option value="15">15 phút</option>
                        <option value="20">20 phút</option>
                        <option value="25">25 phút</option>
                        <option value="30">30 phút</option>
                        {![0.5, 1, 2, 3, 5, 10, 15, 20, 25, 30].includes(creatorDurationMinutes) && (
                          <option value="custom">{creatorDurationMinutes} phút</option>
                        )}
                      </select>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label
                        htmlFor="creator-item-count"
                        className="text-[11px] font-semibold text-slate-700"
                      >
                        Số mục kiến thức
                      </label>
                      <label
                        htmlFor="creator-auto-item-count"
                        className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-700 cursor-pointer select-none"
                      >
                        <input
                          id="creator-auto-item-count"
                          type="checkbox"
                          checked={creatorAutoItemCount}
                          onChange={(e) => setCreatorAutoItemCount(e.target.checked)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>AI tự quyết định</span>
                      </label>
                    </div>
                    <input
                      id="creator-item-count"
                      type="number"
                      aria-label="Số mục kiến thức"
                      disabled={creatorAutoItemCount}
                      min={4}
                      max={60}
                      step={1}
                      value={creatorItemCount}
                      onChange={(e) =>
                        setCreatorItemCount(Math.max(4, Math.min(60, Math.round(Number(e.target.value) || 8))))
                      }
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg tabular-nums disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Fixed-Schema Prompt Builder for External Web AI */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-slate-900">
                    {reelCreationMode === 'translation'
                      ? 'Prompt Phản Xạ Dịch Câu (ChatGPT / Gemini / Claude) → Tự nghĩ câu & xuất JSON'
                      : reelCreationMode === 'creator'
                        ? 'Prompt AI Tạo Từ & Câu (ChatGPT / Gemini / Claude) → Tự nghĩ ý tưởng & xuất JSON'
                        : 'Tạo Prompt gửi AI Web (ChatGPT / Gemini / Claude) → xuất JSON cố định'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {reelCreationMode === 'translation'
                      ? `Không cần API Key: AI tạo ${translationAutoItemCount ? 'số câu tối ưu theo chiều sâu' : `${translationItemCount} câu phản xạ`} (${translationLevel}) · nghĩ ${translationThinkSec}s · lặp ${translationRepeatCount} lần kèm tiêu đề thu hút.`
                      : reelCreationMode === 'creator'
                        ? `Không cần API Key: AI tự chọn ý tưởng (${creatorLevel}), ${creatorAutoItemCount ? 'tự quyết định số mục theo chiều sâu kiến thức' : `viết ${creatorItemCount} mục`} cho tối thiểu ${creatorDurationMinutes} phút.`
                        : 'Không cần API Key: AI Web sẽ lọc rác, nhận diện Reading/Quiz/Vocab, điền bản dịch và trả về đúng định dạng JSON của app.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <PasteButton
                    onPaste={(txt) => {
                      setPastedAiJson(txt);
                      setAiJsonError(null);
                    }}
                    title="Dán nhanh JSON từ AI Web (thay thế ô bên dưới)"
                  />
                  <label className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 cursor-pointer whitespace-nowrap shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Tải file .json</span>
                    <input
                      type="file"
                      accept=".json,application/json,text/plain"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (!f) return;
                        const txt = await f.text();
                        setPastedAiJson(txt);
                        setAiJsonError(null);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleCopyPrompt()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 whitespace-nowrap shrink-0"
                  >
                    {copiedPrompt ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>
                      {copiedPrompt
                        ? 'Đã chép Prompt!'
                        : reelCreationMode === 'translation'
                          ? 'Sao chép Prompt Phản Xạ Dịch'
                          : reelCreationMode === 'creator'
                            ? 'Sao chép Prompt AI Tạo Bài'
                            : 'Sao chép Prompt AI Web'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <textarea
                  readOnly
                  rows={5}
                  value={webAiPrompt}
                  aria-label="Prompt AI Web cho English Reels"
                  className="w-full p-2 text-[10px] font-mono bg-white border border-slate-200 rounded-lg text-slate-700"
                />
                <div className="flex flex-col gap-1.5">
                  <textarea
                    rows={4}
                    value={pastedAiJson}
                    onChange={(e) => {
                      setPastedAiJson(e.target.value);
                      setAiJsonError(null);
                    }}
                    placeholder='Dán nguyên JSON từ AI Web trả về vào đây (hỗ trợ cả ```json ... ```)...'
                    className="w-full flex-1 p-2 text-[10px] font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    disabled={!pastedAiJson.trim()}
                    onClick={handleApplyPastedAiJson}
                    className="w-full py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Nạp Thẻ &amp; Kịch bản từ JSON AI Web
                  </button>
                </div>
              </div>

              {aiJsonError && (
                <p className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                  {aiJsonError}
                </p>
              )}
              {aiJsonNotice && (
                <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2 font-medium">
                  {aiJsonNotice}
                </p>
              )}
            </div>
          </section>

          {/* Interactive Card CRUD List + Editor */}
          <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900">
                Biên tập danh sách Thẻ ({cards.length} thẻ)
              </h2>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleAddCard('vocab')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Thẻ Đọc/Từ vựng</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddCard('translation')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Thẻ Phản Xạ Dịch</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddCard('quiz')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 whitespace-nowrap shrink-0"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>+ Thẻ Quiz</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* Card Stack Order */}
              <div className="md:col-span-5 space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
                {cards.map((card, idx) => {
                  const selected = idx === safeActiveIdx;
                  return (
                    <div
                      key={card.id}
                      onClick={() => setActiveCardIdx(idx)}
                      className={`p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        selected
                          ? 'bg-indigo-50/80 border-indigo-300'
                          : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[10px] font-bold text-indigo-700 truncate">
                          #{idx + 1} · {card.badge || card.type.toUpperCase()}
                        </span>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveCard(idx, -1);
                            }}
                            disabled={idx === 0}
                            title="Lên trên"
                            className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveCard(idx, 1);
                            }}
                            disabled={idx === cards.length - 1}
                            title="Xuống dưới"
                            className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDuplicateCard(idx);
                            }}
                            title="Nhân bản thẻ"
                            className="p-1 text-slate-400 hover:text-indigo-600"
                          >
                            <CopyPlus className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCard(idx);
                            }}
                            disabled={cards.length <= 1}
                            title="Xóa thẻ"
                            className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-30"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="text-xs font-medium text-slate-900 truncate mt-1">
                        {card.content || card.title}
                      </div>
                      {card.translation && (
                        <div className="text-[11px] text-slate-500 truncate">{card.translation}</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Active Card Inspector */}
              {activeCard && (
                <div className="md:col-span-7 p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Loại thẻ
                      </label>
                      <select
                        value={activeCard.type}
                        onChange={(e) =>
                          updateCard(safeActiveIdx, { type: e.target.value as ReelCardType })
                        }
                        className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      >
                        <option value="intro">Intro (Mở đầu)</option>
                        <option value="transition">Transition (Chuyển phần)</option>
                        <option value="vocab">Reading / Vocab</option>
                        <option value="translation">Phản xạ dịch câu</option>
                        <option value="quiz">Quiz (Câu hỏi)</option>
                        <option value="outro">Outro (Tổng kết)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Nhãn (Badge)
                      </label>
                      <input
                        type="text"
                        value={activeCard.badge}
                        onChange={(e) => updateCard(safeActiveIdx, { badge: e.target.value })}
                        className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Tiêu đề / Từ khóa chính
                    </label>
                    <input
                      type="text"
                      value={activeCard.title}
                      onChange={(e) => updateCard(safeActiveIdx, { title: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Nội dung hiển thị trên thẻ ({reelsAspectRatio})
                    </label>
                    <textarea
                      rows={2}
                      value={activeCard.content}
                      onChange={(e) =>
                        updateCard(safeActiveIdx, { content: e.target.value, ttsText: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Dịch nghĩa / Giải thích từ vựng
                      </label>
                      <input
                        type="text"
                        value={activeCard.translation || ''}
                        onChange={(e) => updateCard(safeActiveIdx, { translation: e.target.value })}
                        placeholder="Giải thích nghĩa từ khó / câu..."
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Ghi chú ngữ pháp (tùy chọn)
                      </label>
                      <input
                        type="text"
                        value={activeCard.grammarNote || ''}
                        onChange={(e) => updateCard(safeActiveIdx, { grammarNote: e.target.value })}
                        placeholder="vd: be going to + V (dự định)..."
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>

                  {activeCard.type !== 'translation' && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Phiên âm IPA (chỉ dùng nếu bài học từ vựng cần)
                      </label>
                      <input
                        type="text"
                        value={activeCard.phonetic || ''}
                        onChange={(e) => updateCard(safeActiveIdx, { phonetic: e.target.value })}
                        placeholder="Để trống nếu là bài đọc hiểu..."
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-mono"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Câu đọc TTS (Ngoại ngữ đang học)
                      </label>
                      <input
                        type="text"
                        value={activeCard.ttsText}
                        onChange={(e) => updateCard(safeActiveIdx, { ttsText: e.target.value })}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Lời giải thích TTS 2 ({targetLang === 'none' ? 'Tắt' : targetLang})
                      </label>
                      <input
                        type="text"
                        value={activeCard.explanationSpeech || ''}
                        onChange={(e) => updateCard(safeActiveIdx, { explanationSpeech: e.target.value })}
                        placeholder={activeCard.translation || 'Tự dùng Dịch nghĩa nếu để trống...'}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>

                  {activeCard.type === 'translation' && (
                    <div className="p-2.5 rounded-lg bg-amber-50/70 border border-amber-200 space-y-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-amber-900 mb-1">
                          Câu gốc cần dịch (Giọng giải thích đọc trước)
                        </label>
                        <input
                          type="text"
                          value={activeCard.sourcePrompt || activeCard.translation || ''}
                          onChange={(e) =>
                            updateCard(safeActiveIdx, {
                              sourcePrompt: e.target.value,
                              translation: e.target.value,
                            })
                          }
                          placeholder="Coi chừng cô ấy đấy!"
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-amber-200 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-amber-900 mb-1">
                          Giải thích từ vựng khó trong câu (thay cho phiên âm cả câu)
                        </label>
                        <input
                          type="text"
                          value={activeCard.vocabNotes || ''}
                          onChange={(e) =>
                            updateCard(safeActiveIdx, { vocabNotes: e.target.value })
                          }
                          placeholder="vd: 彼女 (cô ấy) · 気をつけて (hãy cẩn thận)"
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-amber-200 rounded-lg"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                            Giây suy nghĩ (s)
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={15}
                            value={activeCard.thinkSec ?? translationThinkSec}
                            onChange={(e) =>
                              updateCard(safeActiveIdx, {
                                thinkSec: Math.max(0, Math.min(15, Math.round(Number(e.target.value) || 0))),
                              })
                            }
                            className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                            Số lần đọc lặp đáp án
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={5}
                            value={activeCard.repeatCount ?? translationRepeatCount}
                            onChange={(e) =>
                              updateCard(safeActiveIdx, {
                                repeatCount: Math.max(1, Math.min(5, Math.round(Number(e.target.value) || 1))),
                              })
                            }
                            className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg tabular-nums"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {activeCard.type === 'quiz' && (
                    <div className="pt-2 border-t border-slate-200 space-y-2">
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <label className="text-[11px] font-semibold text-indigo-800">
                            Đoạn văn đối chiếu hiển thị trên thẻ Quiz (giúp người xem đọc lại khi trả lời)
                          </label>
                          <PasteButton
                            onPaste={(txt) => updateCard(safeActiveIdx, { contextExcerpt: txt })}
                            title="Dán nhanh đoạn văn đối chiếu"
                          />
                        </div>
                        <textarea
                          rows={3}
                          value={activeCard.contextExcerpt || ''}
                          onChange={(e) =>
                            updateCard(safeActiveIdx, { contextExcerpt: e.target.value })
                          }
                          placeholder="Full paragraph / reading passage shown during question & 5s countdown..."
                          className="w-full p-2 text-xs bg-white border border-slate-200 rounded-lg leading-relaxed"
                        />
                      </div>
                      <label className="block text-[11px] font-semibold text-amber-800">
                        Lựa chọn đáp án Quiz &amp; Đếm ngược suy nghĩ
                      </label>
                      <textarea
                        rows={3}
                        value={(activeCard.options || []).join('\n')}
                        onChange={(e) =>
                          updateCard(safeActiveIdx, {
                            options: e.target.value.split('\n').filter((o) => o.trim().length > 0),
                          })
                        }
                        className="w-full p-2 text-xs bg-white border border-slate-200 rounded-lg"
                      />
                      <div className="grid grid-cols-4 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                            Đáp án đúng
                          </label>
                          <select
                            value={activeCard.answerIndex ?? 0}
                            onChange={(e) =>
                              updateCard(safeActiveIdx, { answerIndex: Number(e.target.value) })
                            }
                            className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg"
                          >
                            {(activeCard.options || ['True', 'False']).map((opt, oIdx) => (
                              <option key={oIdx} value={oIdx}>
                                {String.fromCharCode(65 + oIdx)}. {opt.slice(0, 14)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                            Suy nghĩ (giây)
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={10}
                            value={activeCard.thinkSec ?? 5}
                            onChange={(e) =>
                              updateCard(safeActiveIdx, {
                                thinkSec: Math.max(0, Math.min(10, Number(e.target.value) || 0)),
                              })
                            }
                            className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg tabular-nums"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                            Giải thích đáp án (hiển thị)
                          </label>
                          <input
                            type="text"
                            value={activeCard.explanation || ''}
                            onChange={(e) =>
                              updateCard(safeActiveIdx, { explanation: e.target.value })
                            }
                            className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                          Lời đọc công bố đáp án sau {activeCard.thinkSec ?? 5}s (tiếng Anh TTS)
                        </label>
                        <input
                          type="text"
                          value={activeCard.ttsAnswerText || ''}
                          onChange={(e) =>
                            updateCard(safeActiveIdx, { ttsAnswerText: e.target.value })
                          }
                          placeholder="Time is up! The correct answer is..."
                          className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg"
                        />
                      </div>
                    </div>
                  )}

                  {/* UI Component Customizer per Card */}
                  <div className="pt-2 border-t border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-indigo-800">
                        UI Component minh họa trên thẻ này
                      </label>
                      {activeCard.visual?.variant && (
                        <button
                          type="button"
                          onClick={() => updateCard(safeActiveIdx, { visual: undefined })}
                          className="text-[10px] text-slate-500 hover:text-indigo-600"
                        >
                          Đặt lại tự động
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                          Mẫu Component (Bootstrap / CSS / Kho)
                        </label>
                        <select
                          value={activeCard.visual?.variant || ''}
                          onChange={(e) =>
                            updateCardVisual(safeActiveIdx, {
                              variant: (e.target.value || undefined) as IllustrationVariant | undefined,
                            })
                          }
                          className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg"
                        >
                          <option value="">Tự động theo ngữ cảnh</option>
                          {vectorCatalog.map((item) => (
                            <option key={item.variant} value={item.variant}>
                              {item.label} ({item.variant})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                          Icon minh họa
                        </label>
                        <select
                          value={activeCard.visual?.sceneIcon || ''}
                          onChange={(e) =>
                            updateCardVisual(safeActiveIdx, {
                              sceneIcon: (e.target.value || undefined) as IllustrationSceneIcon | undefined,
                            })
                          }
                          className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg"
                        >
                          <option value="">Tự chọn Icon</option>
                          {ALL_SCENE_ICONS.map((ic) => (
                            <option key={ic} value={ic}>
                              {ic}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={activeCard.visual?.title || ''}
                        onChange={(e) => updateCardVisual(safeActiveIdx, { title: e.target.value })}
                        placeholder="Tiêu đề trong Component..."
                        className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg"
                      />
                      <input
                        type="text"
                        value={(activeCard.visual?.labels || []).join(', ')}
                        onChange={(e) =>
                          updateCardVisual(safeActiveIdx, {
                            labels: e.target.value
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder="Các nhãn / bước (phẩy cách)..."
                        className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right: 9:16 Live Video Player, TTS Audio & Direct MP4 Export */}
        <div
          ref={previewFullscreenContainerRef}
          data-testid="reels-preview-panel"
          className={
            isPreviewFullscreen
              ? 'fixed inset-0 z-50 bg-white p-4 sm:p-6 lg:px-20 overflow-y-auto space-y-3.5'
              : 'lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 space-y-3.5 sticky top-4'
          }
        >
          {generatedAudioUrl && (
            <audio
              ref={lessonAudioRef}
              src={generatedAudioUrl}
              onEnded={() => setIsVideoPlaying(false)}
            />
          )}

          {/* Mode Toggle: Video Live Canvas vs Card Step View + Aspect Ratio Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
              <button
                type="button"
                onClick={() => setPreviewViewMode('video')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  previewViewMode === 'video'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                <span>Video {reelsAspectRatio} Live</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsVideoPlaying(false);
                  setPreviewViewMode('cards');
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  previewViewMode === 'cards'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Xem Thẻ ({safeActiveIdx + 1}/{cards.length})</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <div
                role="group"
                aria-label="Tỉ lệ khung hình English Reels"
                className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200"
              >
                {(['9:16', '16:9', '1:1', '4:5'] as ExportAspectRatioId[]).map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    disabled={isExportingVideo}
                    onClick={() => setReelsAspectRatio(ratio)}
                    className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      reelsAspectRatio === ratio
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {ratio === '9:16' ? '9:16 Dọc' : ratio === '16:9' ? '16:9 Ngang' : ratio}
                  </button>
                ))}
              </div>
              {previewViewMode === 'cards' && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={safeActiveIdx === 0}
                    onClick={() => setActiveCardIdx((i) => Math.max(0, i - 1))}
                    className="px-2 py-1 text-xs font-medium bg-slate-100 rounded hover:bg-slate-200 disabled:opacity-40"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    disabled={safeActiveIdx >= cards.length - 1}
                    onClick={() => setActiveCardIdx((i) => Math.min(cards.length - 1, i + 1))}
                    className="px-2 py-1 text-xs font-medium bg-slate-100 rounded hover:bg-slate-200 disabled:opacity-40"
                  >
                    →
                  </button>
                </div>
              )}
              <button
                type="button"
                data-testid="reels-fullscreen-btn"
                onClick={togglePreviewFullscreen}
                title={isPreviewFullscreen ? 'Thu gọn Preview (Esc)' : 'Phóng to Preview toàn màn hình'}
                className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  isPreviewFullscreen
                    ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                    : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                }`}
              >
                {isPreviewFullscreen ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5" />
                    <span>Thu gọn</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Toàn màn hình</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {previewViewMode === 'video' ? (
            <div ref={stageContainerRef} className="space-y-2.5">
              {(() => {
                const activeAspectOverrides = layoutOverridesByAspect[reelsAspectRatio] ?? {};
                const previewLessonTime = Math.max(
                  0,
                  videoTime - getEffectiveIntroSeconds(previewProject),
                );
                const selectedPreviewElement = selectedPreviewElementId
                  ? previewProject.elements.find((el) => el.id === selectedPreviewElementId) ?? null
                  : null;
                const resolvedPreviewLayouts = resolveElementLayoutForAspect(
                  previewProject.elements,
                  previewLessonTime,
                  reelsAspectRatio,
                  previewProject.subtitleConfig,
                  previewProject.compositionId,
                );
                const selectedCanvasLayout = selectedPreviewElementId
                  ? resolvedPreviewLayouts.get(selectedPreviewElementId) ?? null
                  : null;
                const resolvedTitleBox = resolveLessonTitleBox(previewProject, reelsAspectRatio, videoTime);

                const applyReelsReflowFromPin = (
                  pinnedId: string,
                  resolvedMapOverride?: Map<string, ElementLayout>,
                  titleLayoutOverride?: TitleOverlayLayout,
                ) => {
                  const targetProj: LessonProject =
                    titleLayoutOverride !== undefined
                      ? { ...previewProject, titleLayout: titleLayoutOverride }
                      : previewProject;
                  const mapToUse = resolvedMapOverride ?? resolvedPreviewLayouts;
                  const tBox = resolveLessonTitleBox(targetProj, reelsAspectRatio, videoTime);
                  const reflowed = reflowElementsAvoidingOverlap(targetProj.elements, pinnedId, mapToUse, {
                    stageWidth: stageDims.width,
                    stageHeight: stageDims.height,
                    titleBox: tBox
                      ? { x: tBox.x, y: tBox.y, width: tBox.width, height: tBox.height }
                      : null,
                  });
                  setLayoutOverridesByAspect((prev) => {
                    const nextAspect = { ...(prev[reelsAspectRatio] ?? {}) };
                    for (const el of targetProj.elements) {
                      if (el.type === 'karaoke-card') continue;
                      const shifted = reflowed.get(el.id);
                      const orig = mapToUse.get(el.id) || el.layout;
                      if (
                        shifted &&
                        (Math.round(shifted.x) !== Math.round(orig.x) ||
                          Math.round(shifted.y) !== Math.round(orig.y))
                      ) {
                        nextAspect[el.id] = {
                          x: Math.round(shifted.x),
                          y: Math.round(shifted.y),
                          width: shifted.width,
                          height: shifted.height,
                          scale: shifted.scale,
                        };
                      }
                    }
                    return { ...prev, [reelsAspectRatio]: nextAspect };
                  });
                };

                const toCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
                  const canvas = videoCanvasRef.current;
                  if (!canvas) return { x: 0, y: 0 };
                  const rect = canvas.getBoundingClientRect();
                  if (!rect.width || !rect.height) return { x: 0, y: 0 };
                  return {
                    x: ((e.clientX - rect.left) / rect.width) * stageDims.width,
                    y: ((e.clientY - rect.top) / rect.height) * stageDims.height,
                  };
                };

                const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
                  if (isVideoPlaying || isExportingVideo) return;
                  const { x, y } = toCanvasCoords(e);
                  const overlayHit = hitTestCanvasOverlayZone(
                    previewProject,
                    x,
                    y,
                    videoTime,
                    reelsAspectRatio,
                  );
                  if (overlayHit) {
                    setSelectedPreviewElementId(null);
                    setSelectedPreviewOverlayZone(overlayHit);
                    if (overlayHit === 'title' && resolvedTitleBox) {
                      dragStateRef.current = {
                        id: '__title__',
                        offsetX: resolvedTitleBox.x - x,
                        offsetY: resolvedTitleBox.y - y,
                      };
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }
                    return;
                  }
                  const hit = hitTestElementLayout(
                    previewProject.elements,
                    x,
                    y,
                    previewLessonTime,
                    reelsAspectRatio,
                    previewProject.subtitleConfig,
                    previewProject.compositionId,
                  );
                  if (hit) {
                    setSelectedPreviewOverlayZone(null);
                    setSelectedPreviewElementId(hit.element.id);
                    dragStateRef.current = {
                      id: hit.element.id,
                      offsetX: hit.layout.x - x,
                      offsetY: hit.layout.y - y,
                      width: hit.layout.width,
                      height: hit.layout.height,
                      scale: hit.layout.scale,
                    };
                    e.currentTarget.setPointerCapture(e.pointerId);
                  } else {
                    setSelectedPreviewElementId(null);
                    setSelectedPreviewOverlayZone(null);
                  }
                };

                const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
                  const drag = dragStateRef.current;
                  if (!drag) return;
                  const { x, y } = toCanvasCoords(e);
                  if (drag.id === '__title__') {
                    const clampedX = Math.max(80, Math.min(stageDims.width - 80, Math.round(x + drag.offsetX)));
                    const clampedY = Math.max(40, Math.min(stageDims.height - 60, Math.round(y + drag.offsetY)));
                    setTitleLayoutByAspect((prev) => ({
                      ...prev,
                      [reelsAspectRatio]: {
                        ...(prev[reelsAspectRatio] ?? {}),
                        x: clampedX,
                        y: clampedY,
                      },
                    }));
                    return;
                  }
                  const clampedX = Math.max(80, Math.min(stageDims.width - 80, Math.round(x + drag.offsetX)));
                  const clampedY = Math.max(60, Math.min(stageDims.height - 60, Math.round(y + drag.offsetY)));
                  setLayoutOverridesByAspect((prev) => ({
                    ...prev,
                    [reelsAspectRatio]: {
                      ...(prev[reelsAspectRatio] ?? {}),
                      [drag.id]: {
                        x: clampedX,
                        y: clampedY,
                        width: drag.width,
                        height: drag.height,
                        scale: drag.scale,
                      },
                    },
                  }));
                };

                const handleCanvasPointerUp = () => {
                  const finished = dragStateRef.current;
                  dragStateRef.current = null;
                  if (finished && autoReflowOnMove) {
                    applyReelsReflowFromPin(finished.id);
                  }
                };

                return (
                  <>
                    <div
                      data-aspect-ratio={reelsAspectRatio}
                      className={`relative mx-auto overflow-hidden border border-slate-200 shadow-sm bg-slate-100 ${
                        isPreviewFullscreen
                          ? reelsAspectRatio === '16:9'
                            ? 'w-full max-w-[920px] aspect-video rounded-2xl'
                            : reelsAspectRatio === '1:1'
                              ? 'w-full max-w-[540px] aspect-square rounded-2xl'
                              : reelsAspectRatio === '4:5'
                                ? 'w-full max-w-[480px] aspect-[4/5] rounded-2xl'
                                : 'h-[70vh] max-w-[420px] aspect-[9/16] rounded-[24px]'
                          : reelsAspectRatio === '16:9'
                            ? 'w-full max-w-[540px] aspect-video rounded-2xl'
                            : reelsAspectRatio === '1:1'
                              ? 'w-full max-w-[360px] aspect-square rounded-2xl'
                              : reelsAspectRatio === '4:5'
                                ? 'w-full max-w-[310px] aspect-[4/5] rounded-2xl'
                                : 'w-full max-w-[270px] aspect-[9/16] rounded-[24px]'
                      }`}
                    >
                      <canvas
                        ref={videoCanvasRef}
                        data-testid="reels-stage-canvas"
                        width={stageDims.width}
                        height={stageDims.height}
                        onPointerDown={handleCanvasPointerDown}
                        onPointerMove={handleCanvasPointerMove}
                        onPointerUp={handleCanvasPointerUp}
                        onPointerCancel={handleCanvasPointerUp}
                        className="w-full h-full block cursor-grab active:cursor-grabbing touch-none"
                      />
                      {isExportingVideo && (
                        <div className="absolute inset-0 bg-slate-900/75 backdrop-blur-[2px] flex flex-col items-center justify-center text-white p-4 text-center">
                          <p className="text-xs font-semibold mb-2">
                            {exportStageLabel || 'Đang render MP4...'}
                          </p>
                          <div className="w-40 h-1.5 bg-white/25 rounded-full overflow-hidden mb-1">
                            <div
                              className="h-full bg-indigo-400 transition-all duration-150"
                              style={{ width: `${Math.round(exportProgress * 100)}%` }}
                            />
                          </div>
                          <span className="text-[11px] tabular-nums text-white/85 mb-3">
                            {Math.round(exportProgress * 100)}%
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              exportAbortByModeRef.current[reelCreationMode]?.abort();
                              abortRenderTaskSlot(currentSlotId);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold bg-rose-600 hover:bg-rose-700 rounded-lg"
                          >
                            <Square className="w-3 h-3 fill-current" />
                            <span>Hủy render</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {(() => {
                      const reelsOverlaps = detectActiveStageOverlaps(
                        previewProject.elements,
                        resolvedPreviewLayouts,
                        previewLessonTime,
                        resolvedTitleBox
                          ? {
                              x: resolvedTitleBox.x,
                              y: resolvedTitleBox.y,
                              width: resolvedTitleBox.width,
                              height: resolvedTitleBox.height,
                            }
                          : null,
                      );
                      const reelsOverlapSig = reelsOverlaps
                        .map((w) => `${w.firstId}-${w.secondId}:${Math.round(w.overlapPx)}`)
                        .join('|');
                      const showReelsOverlap =
                        reelsOverlaps.length > 0 && reelsOverlapSig !== dismissedOverlapSig;
                      const pinForReflow =
                        selectedPreviewOverlayZone === 'title'
                          ? '__title__'
                          : selectedPreviewElementId || reelsOverlaps[0]?.firstId || '__title__';
                      return (
                        <>
                          <div
                            data-testid="reels-title-and-reflow-bar"
                            className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-[10.5px]"
                          >
                            <button
                              type="button"
                              data-testid="reels-select-title-btn"
                              onClick={() => {
                                setSelectedPreviewElementId(null);
                                setSelectedPreviewOverlayZone(
                                  selectedPreviewOverlayZone === 'title' ? null : 'title',
                                );
                              }}
                              className={`inline-flex items-center gap-1 px-2 py-1 font-semibold rounded border transition-colors ${
                                selectedPreviewOverlayZone === 'title'
                                  ? 'bg-indigo-600 border-indigo-600 text-white'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-indigo-50 hover:border-indigo-300'
                              }`}
                            >
                              <Type className="w-3 h-3" />
                              <span>Tiêu đề bài giảng</span>
                            </button>

                            <label className="inline-flex items-center gap-1.5 text-[10.5px] font-medium text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={autoReflowOnMove}
                                onChange={(e) => setAutoReflowOnMove(e.target.checked)}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span>Tự động đẩy tránh đè khi chỉnh</span>
                            </label>
                          </div>

                          {showReelsOverlap && (
                            <div
                              data-testid="reels-overlap-warning"
                              className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-300 text-[11px] text-amber-950 flex flex-wrap items-center justify-between gap-2"
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span className="font-medium truncate">
                                  Đang bị đè lên nhau: <strong>{reelsOverlaps[0].firstLabel}</strong> ↔{' '}
                                  <strong>{reelsOverlaps[0].secondLabel}</strong> (~{reelsOverlaps[0].overlapPx}px)
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  data-testid="reels-reflow-btn"
                                  onClick={() => applyReelsReflowFromPin(pinForReflow)}
                                  className="px-2 py-0.5 text-[10.5px] font-semibold bg-amber-600 text-white rounded hover:bg-amber-700"
                                >
                                  Tự động đẩy tránh đè
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDismissedOverlapSig(reelsOverlapSig)}
                                  className="px-2 py-0.5 text-[10.5px] font-semibold bg-white border border-amber-300 text-amber-900 rounded hover:bg-amber-100"
                                >
                                  Giữ nguyên
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}

                    <div
                      data-testid="reels-layout-toolbar"
                      className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-[10px]"
                    >
                      <span className="text-slate-600 font-medium">
                        {selectedCanvasLayout ? (
                          <>
                            {selectedPreviewElement?.label || 'Đã chọn khối'} ·{' '}
                            <span
                              data-testid="reels-selected-coords"
                              className="font-mono font-semibold text-indigo-700 tabular-nums"
                            >
                              x:{Math.round(selectedCanvasLayout.x)}, y:{Math.round(selectedCanvasLayout.y)} ·{' '}
                              {Math.round((selectedCanvasLayout.scale || 1) * 100)}%
                            </span>
                            {selectedPreviewElement?.type === 'karaoke-card' && (
                              <span className="text-slate-400"> · Chỉ thẻ này</span>
                            )}
                          </>
                        ) : (
                          'Click vào nhân vật / thẻ trên video để sửa ngay bên dưới hoặc kéo thả vị trí'
                        )}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {selectedPreviewElementId && selectedCanvasLayout && (
                          <>
                            <button
                              type="button"
                              aria-label="Thu nhỏ thành phần trên Video Reels"
                              onClick={() => {
                                const nextScale = Number(
                                  Math.max(0.25, Math.min(2.4, (selectedCanvasLayout.scale || 1) - 0.1)).toFixed(2),
                                );
                                setLayoutOverridesByAspect((prev) => ({
                                  ...prev,
                                  [reelsAspectRatio]: {
                                    ...(prev[reelsAspectRatio] ?? {}),
                                    [selectedPreviewElementId]: {
                                      x: Math.round(selectedCanvasLayout.x),
                                      y: Math.round(selectedCanvasLayout.y),
                                      width: selectedCanvasLayout.width,
                                      height: selectedCanvasLayout.height,
                                      scale: nextScale,
                                    },
                                  },
                                }));
                              }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 font-semibold text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100"
                            >
                              <ZoomOut className="w-3 h-3" />
                              <span>Thu nhỏ</span>
                            </button>
                            <button
                              type="button"
                              aria-label="Phóng to thành phần trên Video Reels"
                              onClick={() => {
                                const nextScale = Number(
                                  Math.max(0.25, Math.min(2.4, (selectedCanvasLayout.scale || 1) + 0.1)).toFixed(2),
                                );
                                setLayoutOverridesByAspect((prev) => ({
                                  ...prev,
                                  [reelsAspectRatio]: {
                                    ...(prev[reelsAspectRatio] ?? {}),
                                    [selectedPreviewElementId]: {
                                      x: Math.round(selectedCanvasLayout.x),
                                      y: Math.round(selectedCanvasLayout.y),
                                      width: selectedCanvasLayout.width,
                                      height: selectedCanvasLayout.height,
                                      scale: nextScale,
                                    },
                                  },
                                }));
                              }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 font-semibold text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100"
                            >
                              <ZoomIn className="w-3 h-3" />
                              <span>Phóng to</span>
                            </button>
                          </>
                        )}
                        {selectedPreviewElement?.type === 'karaoke-card' && selectedCanvasLayout && (
                          <button
                            type="button"
                            data-testid="reels-apply-sub-all"
                            onClick={() => {
                              const targetX = Math.round(selectedCanvasLayout.x);
                              const targetY = Math.round(selectedCanvasLayout.y);
                              setLayoutOverridesByAspect((prev) => {
                                const nextAspectOverrides = { ...(prev[reelsAspectRatio] ?? {}) };
                                for (const el of previewProject.elements) {
                                  if (el.type === 'karaoke-card') {
                                    const existing = nextAspectOverrides[el.id];
                                    nextAspectOverrides[el.id] = {
                                      x: targetX,
                                      y: targetY,
                                      width: existing?.width ?? selectedCanvasLayout.width,
                                      height: existing?.height ?? selectedCanvasLayout.height,
                                      scale: existing?.scale ?? selectedCanvasLayout.scale,
                                    };
                                  }
                                }
                                return { ...prev, [reelsAspectRatio]: nextAspectOverrides };
                              });
                            }}
                            className="px-2 py-0.5 font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100"
                          >
                            Áp dụng vị trí này cho tất cả Sub
                          </button>
                        )}
                        {selectedPreviewElementId && activeAspectOverrides[selectedPreviewElementId] && (
                          <button
                            type="button"
                            onClick={() => {
                              setLayoutOverridesByAspect((prev) => {
                                const copy = { ...(prev[reelsAspectRatio] ?? {}) };
                                delete copy[selectedPreviewElementId];
                                return { ...prev, [reelsAspectRatio]: copy };
                              });
                            }}
                            className="px-2 py-0.5 font-semibold text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100"
                          >
                            Đặt lại vị trí thẻ này
                          </button>
                        )}
                        {selectedPreviewElementId && selectedPreviewElement && (
                          <button
                            type="button"
                            data-testid="reels-delete-el-btn"
                            aria-label={`Xóa ${selectedPreviewElement.label}`}
                            onClick={() => {
                              setHiddenElementIds((prev) =>
                                prev.includes(selectedPreviewElementId) ? prev : [...prev, selectedPreviewElementId],
                              );
                              setSelectedPreviewElementId(null);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded hover:bg-rose-100"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Xóa</span>
                          </button>
                        )}
                        {hiddenElementIds.length > 0 && (
                          <button
                            type="button"
                            data-testid="reels-restore-deleted-btn"
                            onClick={() => setHiddenElementIds([])}
                            className="inline-flex items-center gap-1 px-2 py-0.5 font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Khôi phục ({hiddenElementIds.length})</span>
                          </button>
                        )}
                        {Object.keys(activeAspectOverrides).length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setLayoutOverridesByAspect((prev) => {
                                const next = { ...prev };
                                delete next[reelsAspectRatio];
                                return next;
                              });
                              setSelectedPreviewElementId(null);
                            }}
                            className="px-2 py-0.5 font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded hover:bg-indigo-100"
                          >
                            Đặt lại toàn bộ layout
                          </button>
                        )}
                      </div>
                    </div>

                    {(() => {
                      const resolveCardIdxForElement = (elId: string): number => {
                        const tailMatch = elId.match(/-(\d+)(?:-\d+)?$/);
                        if (tailMatch) {
                          const parsedIdx = Number(tailMatch[1]);
                          if (parsedIdx >= 0 && parsedIdx < cards.length) return parsedIdx;
                        }
                        let cursor = getEffectiveIntroSeconds(previewProject);
                        for (let ci = 0; ci < cards.length; ci++) {
                          const d =
                            generatedDurations?.[ci] ??
                            Math.max(1.2, cards[ci].durationSec || 2.8);
                          if (videoTime >= cursor && videoTime <= cursor + d + 0.05) {
                            return ci;
                          }
                          cursor += d;
                        }
                        return safeActiveIdx;
                      };

                      const handleInlineUpdateReelsElement = (
                        elId: string,
                        patch: Partial<SceneElement>,
                      ) => {
                        if (patch.layout) {
                          const nextLay: ElementLayoutOverride = {
                            x: Math.round(patch.layout.x),
                            y: Math.round(patch.layout.y),
                            width: patch.layout.width,
                            height: patch.layout.height,
                            scale: patch.layout.scale,
                          };
                          setLayoutOverridesByAspect((prev) => ({
                            ...prev,
                            [reelsAspectRatio]: {
                              ...(prev[reelsAspectRatio] ?? {}),
                              [elId]: nextLay,
                            },
                          }));
                          if (autoReflowOnMove) {
                            const updatedMap = new Map(resolvedPreviewLayouts);
                            updatedMap.set(elId, {
                              ...(resolvedPreviewLayouts.get(elId) || patch.layout),
                              ...patch.layout,
                            });
                            applyReelsReflowFromPin(elId, updatedMap);
                          }
                        }
                        if (!patch.props) return;
                        const targetCardIdx = resolveCardIdxForElement(elId);
                        const card = cards[targetCardIdx];
                        if (!card) return;
                        if (patch.props.kind === 'topic-pill') {
                          updateCard(targetCardIdx, { badge: patch.props.text });
                        } else if (patch.props.kind === 'comparison-strip') {
                          if (elId.startsWith('reel-quiz-opts-')) {
                            const nextOptions = patch.props.items.map((item) =>
                              item.label.replace(/^[A-Z]\.\s+/, ''),
                            );
                            updateCard(targetCardIdx, {
                              options: nextOptions,
                              visual: {
                                ...(card.visual || {}),
                                quizSingleRow: Boolean(patch.props.singleRow),
                                quizOptionSublabels: patch.props.items.map((item) => item.sublabel),
                              },
                            });
                          } else {
                            updateCardVisual(targetCardIdx, {
                              labels: patch.props.items.map((item) => item.label).filter(Boolean),
                              stripItems: patch.props.items.map((item) => ({
                                label: item.label,
                                sublabel: item.sublabel,
                                accentColor: item.accentColor,
                                activateAt: item.activateAt,
                              })),
                              stripSingleRow: Boolean(patch.props.singleRow),
                            });
                          }
                        } else if (patch.props.kind === 'sentence-card') {
                          if (elId.startsWith('reel-tr-prompt-card-')) {
                            updateCard(targetCardIdx, {
                              sourcePrompt: patch.props.text,
                              translation: patch.props.subtext ?? patch.props.text,
                            });
                          } else if (elId.startsWith('reel-tr-ans-card-')) {
                            updateCard(targetCardIdx, {
                              content: patch.props.text,
                              ttsText: patch.props.text,
                              vocabNotes: patch.props.subtext ?? card.vocabNotes,
                            });
                          } else if (elId.startsWith('reel-q-context-')) {
                            updateCard(targetCardIdx, { contextExcerpt: patch.props.text });
                          } else {
                            updateCard(targetCardIdx, {
                              content: patch.props.text,
                              ttsText: patch.props.text,
                              translation: patch.props.subtext ?? card.translation,
                              phonetic: patch.props.emphasisWord ?? card.phonetic,
                            });
                          }
                        } else if (patch.props.kind === 'karaoke-card') {
                          const txt = patch.props.words.map((w) => w.word).join(' ').trim();
                          if (txt) {
                            updateCard(targetCardIdx, { content: txt, ttsText: txt });
                          }
                        } else if (patch.props.kind === 'illustration-prop') {
                          if (patch.props.variant === 'cartoon-host') {
                            updateCard(targetCardIdx, {
                              cartoonAction: patch.props.data?.cartoonAction,
                              cartoonMood: patch.props.data?.cartoonMood,
                              cartoonAnimationSpec: patch.props.data?.cartoonAnimationSpec,
                            });
                          } else {
                            updateCardVisual(targetCardIdx, {
                              variant: patch.props.variant,
                              title: patch.props.data?.title,
                              subtitle: patch.props.data?.subtitle,
                              speechText: patch.props.data?.speechText,
                              highlightWord: patch.props.data?.highlightWord,
                              formula: patch.props.data?.formula,
                              labels: patch.props.data?.labels,
                              checklist: patch.props.data?.checklist,
                              upgrades: patch.props.data?.upgrades,
                              boxes: patch.props.data?.boxes,
                              nodes: patch.props.data?.nodes,
                            });
                          }
                        }
                      };

                      const handleDeleteReelsElement = (elId: string) => {
                        setHiddenElementIds((prev) =>
                          prev.includes(elId) ? prev : [...prev, elId],
                        );
                        setLayoutOverridesByAspect((prev) => {
                          const aspectMap = prev[reelsAspectRatio];
                          if (!aspectMap || !aspectMap[elId]) return prev;
                          const copy = { ...aspectMap };
                          delete copy[elId];
                          return { ...prev, [reelsAspectRatio]: copy };
                        });
                        if (selectedPreviewElementId === elId) {
                          setSelectedPreviewElementId(null);
                        }
                      };

                      return (
                        <InlinePreviewElementEditor
                          selectedElement={selectedPreviewElement}
                          resolvedLayout={selectedCanvasLayout}
                          selectedOverlayZone={selectedPreviewOverlayZone}
                          watermarkConfig={watermarkConfig}
                          projectTitle={lessonTitle}
                          titleLayout={titleLayoutByAspect[reelsAspectRatio]}
                          resolvedTitleBox={resolvedTitleBox}
                          onChangeTitle={(nextTitle) => {
                            setLessonTitle(nextTitle);
                            manualTitleEditedRef.current = Boolean(nextTitle.trim());
                          }}
                          onChangeTitleLayout={(nextLay) => {
                            setTitleLayoutByAspect((prev) => ({
                              ...prev,
                              [reelsAspectRatio]: nextLay,
                            }));
                            if (autoReflowOnMove && nextLay && !nextLay.hidden) {
                              applyReelsReflowFromPin('__title__', undefined, nextLay);
                            }
                          }}
                          onChangeWatermark={setWatermarkConfig}
                          onUpdateElement={handleInlineUpdateReelsElement}
                          onDeleteElement={handleDeleteReelsElement}
                          onResetElementPosition={(id) => {
                            setLayoutOverridesByAspect((prev) => {
                              const copy = { ...(prev[reelsAspectRatio] ?? {}) };
                              delete copy[id];
                              return { ...prev, [reelsAspectRatio]: copy };
                            });
                          }}
                          onClearSelection={() => {
                            setSelectedPreviewElementId(null);
                            setSelectedPreviewOverlayZone(null);
                          }}
                          onOpenAnimationStudio={(actionId, spec) => {
                            const cIdx = selectedPreviewElementId
                              ? resolveCardIdxForElement(selectedPreviewElementId)
                              : safeActiveIdx;
                            setReelsAnimStudioState({
                              isOpen: true,
                              actionId,
                              spec,
                              cardIdx: cIdx,
                            });
                          }}
                          stageWidth={stageDims.width}
                          stageHeight={stageDims.height}
                        />
                      );
                    })()}
                  </>
                );
              })()}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isExportingVideo}
                  onClick={() => setIsVideoPlaying((p) => !p)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
                >
                  {isVideoPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isVideoPlaying ? 'Tạm dừng' : 'Xem Video'}</span>
                </button>
                <button
                  type="button"
                  disabled={isExportingVideo}
                  onClick={() => {
                    setVideoTime(0);
                    if (lessonAudioRef.current) lessonAudioRef.current.currentTime = 0;
                    setIsVideoPlaying(true);
                  }}
                  title="Phát lại từ đầu"
                  className="p-1.5 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <input
                  type="range"
                  aria-label="Tua thời gian video preview"
                  min={0}
                  max={previewProject.duration}
                  step={0.05}
                  value={videoTime}
                  onChange={(e) => {
                    const nextT = Number(e.target.value);
                    setVideoTime(nextT);
                    if (lessonAudioRef.current) lessonAudioRef.current.currentTime = nextT;
                  }}
                  className="flex-1 accent-indigo-600 h-1.5"
                />
                <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                  {videoTime.toFixed(1)}s / {previewProject.duration.toFixed(1)}s
                </span>
              </div>

              {/* Audio <-> Sub/Karaoke Resync & Offset Controls for Reels Video */}
              <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/80 flex flex-wrap items-center justify-between gap-1.5 text-[10px]">
                <div className="flex items-center gap-1">
                  {generatedAudioFile && (
                    <button
                      type="button"
                      disabled={isResyncingReels || isGeneratingAudio}
                      onClick={() => void handleResyncReelsAudio()}
                      className="inline-flex items-center gap-1 px-2 py-1 font-semibold text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50"
                      title="Căn chỉnh lại từng mốc Sub & Karaoke khớp đúng audio vừa tạo"
                    >
                      {isResyncingReels ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      <span>Khớp lại Sub/Karaoke</span>
                    </button>
                  )}
                  <span className="text-slate-600 font-medium">
                    Độ trễ: {syncedTimingOffsetMs > 0 ? `+${syncedTimingOffsetMs}` : syncedTimingOffsetMs}ms · {syncedSpeedFactor.toFixed(2)}x
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSyncedTimingOffsetMs((v) => v - 100)}
                    className="px-1.5 py-0.5 font-mono bg-white border border-slate-200 rounded hover:bg-slate-100"
                  >
                    -100ms
                  </button>
                  <button
                    type="button"
                    onClick={() => setSyncedTimingOffsetMs((v) => v + 100)}
                    className="px-1.5 py-0.5 font-mono bg-white border border-slate-200 rounded hover:bg-slate-100"
                  >
                    +100ms
                  </button>
                  <button
                    type="button"
                    onClick={() => setSyncedSpeedFactor((v) => Number(Math.max(0.7, v - 0.05).toFixed(2)))}
                    className="px-1.5 py-0.5 font-mono bg-white border border-slate-200 rounded hover:bg-slate-100"
                    title="Karaoke nhanh hơn 5%"
                  >
                    Nhanh hơn
                  </button>
                  <button
                    type="button"
                    onClick={() => setSyncedSpeedFactor((v) => Number(Math.min(1.4, v + 0.05).toFixed(2)))}
                    className="px-1.5 py-0.5 font-mono bg-white border border-slate-200 rounded hover:bg-slate-100"
                    title="Karaoke chậm lại 5%"
                  >
                    Chậm lại
                  </button>
                  {(syncedTimingOffsetMs !== 0 || syncedSpeedFactor !== 1 || customSyncedCues) && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomSyncedCues(null);
                        setSyncedTimingOffsetMs(0);
                        setSyncedSpeedFactor(1);
                      }}
                      className="px-1.5 py-0.5 font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded"
                    >
                      Đặt lại
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : previewViewMode === 'cards' && activeCard ? (
            <>
              {(() => {
                const totalCardChars =
                  (activeCard.title?.length || 0) +
                  (activeCard.content?.length || 0) +
                  (activeCard.translation?.length || 0) +
                  (activeCard.vocabNotes?.length || 0) +
                  (activeCard.grammarNote?.length || 0) +
                  (activeCard.explanation?.length || 0) +
                  (activeCard.options?.join(' ').length || 0);
                const density: 'spacious' | 'medium' | 'dense' =
                  totalCardChars > 340 ? 'dense' : totalCardChars > 180 ? 'medium' : 'spacious';
                const frameDimsClass = isPreviewFullscreen
                  ? reelsAspectRatio === '16:9'
                    ? 'w-full max-w-[820px] min-h-[420px] max-h-[74vh] rounded-2xl'
                    : reelsAspectRatio === '1:1'
                      ? 'w-full max-w-[540px] min-h-[440px] max-h-[74vh] rounded-2xl'
                      : reelsAspectRatio === '4:5'
                        ? 'w-full max-w-[480px] min-h-[480px] max-h-[74vh] rounded-2xl'
                        : 'w-full max-w-[430px] h-[72vh] min-h-[480px] rounded-[24px]'
                  : reelsAspectRatio === '16:9'
                    ? 'w-full max-w-[500px] min-h-[280px] max-h-[540px] rounded-2xl'
                    : reelsAspectRatio === '1:1'
                      ? 'w-full max-w-[380px] min-h-[360px] max-h-[560px] rounded-2xl'
                      : reelsAspectRatio === '4:5'
                        ? 'w-full max-w-[340px] min-h-[400px] max-h-[580px] rounded-2xl'
                        : 'w-full max-w-[320px] h-[560px] rounded-[24px]';

                return (
                  <div
                    data-testid="reels-card-preview-frame"
                    className={`relative overflow-hidden mx-auto p-3.5 sm:p-4 flex flex-col gap-2.5 border border-slate-200 shadow-sm ${frameDimsClass}`}
                    style={{
                      background: `linear-gradient(180deg, ${CANVAS_THEMES[selectedTheme]?.bgTop || '#F5F3FF'} 0%, ${CANVAS_THEMES[selectedTheme]?.bgBottom || '#FFF5EB'} 100%)`,
                      color: CANVAS_THEMES[selectedTheme]?.isDark ? '#F8FAFC' : '#0F172A',
                    }}
                  >
                    {backgroundImage && (
                      <>
                        {backgroundImage.kind === 'video' && backgroundImage.videoUrl ? (
                          <video
                            src={backgroundImage.videoUrl}
                            autoPlay
                            loop
                            muted
                            playsInline
                            data-testid="reels-card-bg-video"
                            className="absolute inset-0 w-full h-full pointer-events-none"
                            style={{
                              objectFit: backgroundImage.fit === 'contain' ? 'contain' : 'cover',
                            }}
                          />
                        ) : backgroundImage.kind === 'preset' && backgroundImage.presetId ? (
                          <div
                            data-testid="reels-card-bg-preset"
                            className="absolute inset-0 w-full h-full pointer-events-none"
                            style={{
                              background:
                                BACKGROUND_PRESETS.find((p) => p.id === backgroundImage.presetId)
                                  ?.previewGradient ||
                                'linear-gradient(160deg, #1E1B2E 0%, #3B2820 55%, #78350F 100%)',
                            }}
                          />
                        ) : (
                          backgroundImage.dataUrl && (
                            <img
                              src={backgroundImage.dataUrl}
                              alt="Ảnh nền xem trước thẻ"
                              data-testid="reels-card-bg-image"
                              className="absolute inset-0 w-full h-full pointer-events-none"
                              style={{
                                objectFit: backgroundImage.fit === 'contain' ? 'contain' : 'cover',
                              }}
                            />
                          )
                        )}
                        <div
                          className="absolute inset-0 pointer-events-none"
                          style={{
                            backgroundColor: `rgba(15, 23, 42, ${
                              backgroundImage.learningScrimOpacity ?? backgroundImage.scrimOpacity ?? 0.22
                            })`,
                          }}
                        />
                      </>
                    )}

                    <div
                      onClick={() => setSelectedCardPreviewField('badge')}
                      title="Bấm để sửa Nhãn (Badge) ngay dưới Preview"
                      className={`relative z-10 shrink-0 flex flex-wrap items-center justify-center gap-1.5 pt-0.5 cursor-pointer rounded-lg transition ${
                        selectedCardPreviewField === 'badge' ? 'ring-2 ring-indigo-500 bg-indigo-50/40' : 'hover:opacity-90'
                      }`}
                    >
                      <span className="px-2.5 py-0.5 text-[11px] font-bold tracking-wide bg-indigo-100 text-indigo-800 rounded-lg">
                        {activeCard.badge || activeCard.type.toUpperCase()}
                      </span>
                      {activeCard.speaker && (
                        <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-100 text-emerald-800 rounded-lg">
                          🎙️ {activeCard.speaker}
                          {activeCard.speakerRole ? ` · ${activeCard.speakerRole}` : ''}
                        </span>
                      )}
                    </div>

                    <div className="relative z-10 flex-1 min-h-0 overflow-y-auto pr-0.5 flex flex-col">
                      <div
                        data-testid="reels-card-preview-body"
                        className={`my-auto bg-white/95 text-slate-900 rounded-2xl shadow-sm border border-slate-200/80 text-center break-words ${
                          density === 'dense'
                            ? 'p-3 space-y-1.5'
                            : density === 'medium'
                              ? 'p-3.5 space-y-2'
                              : 'p-4 space-y-2.5'
                        }`}
                      >
                        {activeCard.type !== 'translation' &&
                          activeCard.title &&
                          activeCard.title.trim() !== activeCard.content.trim() && (
                            <div
                              onClick={() => setSelectedCardPreviewField('title')}
                              title="Bấm để sửa Tiêu đề & Phiên âm"
                              className={`font-extrabold text-indigo-700 cursor-pointer rounded px-1 ${
                                density === 'dense'
                                  ? 'text-xs leading-snug'
                                  : density === 'medium'
                                    ? 'text-sm leading-snug'
                                    : 'text-base leading-snug'
                              } ${
                                selectedCardPreviewField === 'title' ? 'ring-2 ring-indigo-500 bg-indigo-50' : 'hover:bg-indigo-50/50'
                              }`}
                            >
                              {activeCard.title}
                            </div>
                          )}
                        {activeCard.type !== 'translation' && activeCard.phonetic && (
                          <div
                            onClick={() => setSelectedCardPreviewField('title')}
                            className="text-[11px] font-mono text-slate-500 cursor-pointer hover:text-indigo-700"
                          >
                            {activeCard.phonetic}
                          </div>
                        )}
                        <div
                          onClick={() => setSelectedCardPreviewField('content')}
                          title="Bấm để sửa nội dung thẻ ngay bên dưới"
                          className={`font-bold text-slate-900 cursor-pointer rounded px-1.5 py-0.5 ${
                            density === 'dense'
                              ? 'text-[12.5px] leading-snug'
                              : density === 'medium'
                                ? 'text-[13.5px] leading-snug'
                                : 'text-sm leading-snug'
                          } ${
                            selectedCardPreviewField === 'content' ? 'ring-2 ring-indigo-500 bg-indigo-50' : 'hover:bg-indigo-50/50'
                          }`}
                        >
                          {activeCard.content}
                        </div>
                        {activeCard.options && activeCard.options.length > 0 && (
                          <div
                            onClick={() => setSelectedCardPreviewField('quiz')}
                            title="Bấm để sửa đáp án Quiz"
                            className={`space-y-1 pt-1 text-left cursor-pointer rounded-lg p-1 ${
                              selectedCardPreviewField === 'quiz' ? 'ring-2 ring-indigo-500 bg-indigo-50/40' : 'hover:bg-slate-50'
                            }`}
                          >
                            {activeCard.options.map((opt, idx) => {
                              const isCorrect = idx === (activeCard.answerIndex ?? 0);
                              return (
                                <div
                                  key={idx}
                                  className={`px-2.5 py-1.5 rounded-lg text-[11.5px] font-medium border flex items-center justify-between gap-2 ${
                                    isCorrect
                                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                                      : 'bg-slate-50 border-slate-200 text-slate-700'
                                  }`}
                                >
                                  <span>
                                    {String.fromCharCode(65 + idx)}. {opt}
                                  </span>
                                  {isCorrect && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {activeCard.translation && (
                          <div
                            onClick={() => setSelectedCardPreviewField('translation')}
                            title="Bấm để sửa dịch nghĩa"
                            className={`text-slate-600 pt-1.5 border-t border-slate-100 cursor-pointer rounded px-1 ${
                              density === 'dense' ? 'text-[11px] leading-snug' : 'text-xs leading-relaxed'
                            } ${
                              selectedCardPreviewField === 'translation' ? 'ring-2 ring-indigo-500 bg-indigo-50' : 'hover:bg-indigo-50/40'
                            }`}
                          >
                            {activeCard.translation}
                          </div>
                        )}
                        {activeCard.vocabNotes && (
                          <div
                            onClick={() => setSelectedCardPreviewField('translation')}
                            className="text-[11px] leading-snug text-indigo-700 font-medium cursor-pointer hover:underline bg-indigo-50/50 rounded-lg px-2 py-1 text-left"
                          >
                            <span className="font-bold">{cardPreviewLocale.vocabSectionLabel}:</span> {activeCard.vocabNotes}
                          </div>
                        )}
                        {activeCard.grammarNote && (
                          <div
                            onClick={() => setSelectedCardPreviewField('grammarNote')}
                            className={`text-[11px] leading-snug text-amber-800 font-medium cursor-pointer rounded-lg px-2 py-1 text-left bg-amber-50/60 ${
                              selectedCardPreviewField === 'grammarNote' ? 'ring-2 ring-indigo-500' : 'hover:bg-amber-50'
                            }`}
                          >
                            <span className="font-bold">{cardPreviewLocale.grammarSectionLabel}:</span> {activeCard.grammarNote}
                          </div>
                        )}
                        {activeCard.explanation && (
                          <div
                            onClick={() => setSelectedCardPreviewField('quiz')}
                            className="text-[11px] leading-snug text-emerald-700 font-medium cursor-pointer hover:underline text-left bg-emerald-50/50 rounded-lg px-2 py-1"
                          >
                            <span className="font-bold">{cardPreviewLocale.explanationSectionLabel}:</span> {activeCard.explanation}
                          </div>
                        )}
                      </div>
                    </div>

                    {watermarkConfig.watermarkEnabled && watermarkConfig.watermarkText.trim() && (
                      <button
                        type="button"
                        onClick={() => setSelectedCardPreviewField('watermark')}
                        className={`relative z-10 shrink-0 self-end px-2 py-0.5 text-[10px] font-semibold rounded bg-black/55 text-white ${
                          selectedCardPreviewField === 'watermark' ? 'ring-2 ring-indigo-400' : ''
                        }`}
                      >
                        {watermarkConfig.watermarkText}
                      </button>
                    )}

                    <div className="relative z-10 shrink-0 flex flex-col items-center gap-1.5 pt-0.5">
                      <button
                        type="button"
                        disabled={isPreviewingVoice}
                        onClick={() => void handlePreviewSingleCardVoice()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white/95 border border-slate-200 rounded-lg hover:bg-white shadow-xs"
                      >
                        {isPreviewingVoice ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5 text-indigo-600" />
                        )}
                        <span>Nghe thử thẻ này</span>
                      </button>
                      {previewAudioUrl && (
                        <audio controls autoPlay src={previewAudioUrl} className="w-full h-8" />
                      )}
                    </div>
                  </div>
                );
              })()}

              {selectedCardPreviewField && (
                <div
                  data-testid="reels-cards-inline-editor"
                  className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-indigo-900">
                      Sửa nhanh ngay dưới Preview Thẻ ({selectedCardPreviewField})
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedCardPreviewField(null)}
                      aria-label="Đóng sửa nhanh thẻ"
                      className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-white/70"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {selectedCardPreviewField === 'badge' && (
                    <input
                      type="text"
                      aria-label="Sửa nhanh nhãn thẻ"
                      value={activeCard.badge}
                      onChange={(e) => updateCard(safeActiveIdx, { badge: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    />
                  )}
                  {selectedCardPreviewField === 'title' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        aria-label="Sửa nhanh tiêu đề thẻ"
                        value={activeCard.title}
                        onChange={(e) => updateCard(safeActiveIdx, { title: e.target.value })}
                        placeholder="Tiêu đề"
                        className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      />
                      <input
                        type="text"
                        aria-label="Sửa nhanh phiên âm IPA"
                        value={activeCard.phonetic || ''}
                        onChange={(e) => updateCard(safeActiveIdx, { phonetic: e.target.value })}
                        placeholder="Phiên âm /IPA/"
                        className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-mono"
                      />
                    </div>
                  )}
                  {selectedCardPreviewField === 'content' && (
                    <textarea
                      rows={2}
                      aria-label="Sửa nhanh nội dung thẻ"
                      value={activeCard.content}
                      onChange={(e) =>
                        updateCard(safeActiveIdx, { content: e.target.value, ttsText: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    />
                  )}
                  {selectedCardPreviewField === 'translation' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        aria-label="Sửa nhanh dịch nghĩa"
                        value={activeCard.translation || ''}
                        onChange={(e) => updateCard(safeActiveIdx, { translation: e.target.value })}
                        placeholder="Dịch nghĩa"
                        className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      />
                      <input
                        type="text"
                        aria-label="Sửa nhanh ghi chú từ vựng"
                        value={activeCard.vocabNotes || ''}
                        onChange={(e) => updateCard(safeActiveIdx, { vocabNotes: e.target.value })}
                        placeholder="Ghi chú từ vựng"
                        className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                  )}
                  {selectedCardPreviewField === 'grammarNote' && (
                    <input
                      type="text"
                      aria-label="Sửa nhanh ghi chú ngữ pháp"
                      value={activeCard.grammarNote || ''}
                      onChange={(e) => updateCard(safeActiveIdx, { grammarNote: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    />
                  )}
                  {selectedCardPreviewField === 'quiz' && (
                    <div className="space-y-1.5">
                      <textarea
                        rows={2}
                        aria-label="Sửa nhanh các đáp án Quiz"
                        value={(activeCard.options || []).join('\n')}
                        onChange={(e) =>
                          updateCard(safeActiveIdx, {
                            options: e.target.value.split('\n').filter((o) => o.trim().length > 0),
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      />
                      <input
                        type="text"
                        aria-label="Sửa nhanh giải thích đáp án"
                        value={activeCard.explanation || ''}
                        onChange={(e) => updateCard(safeActiveIdx, { explanation: e.target.value })}
                        placeholder="Giải thích đáp án..."
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                  )}
                  {selectedCardPreviewField === 'watermark' && (
                    <input
                      type="text"
                      aria-label="Sửa nhanh Watermark Reels"
                      value={watermarkConfig.watermarkText}
                      onChange={(e) =>
                        setWatermarkConfig((prev) => ({
                          ...prev,
                          watermarkEnabled: true,
                          watermarkText: e.target.value,
                        }))
                      }
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    />
                  )}
                </div>
              )}
            </>
          ) : null}

          {/* Watermark & Outro (Tùy chọn) */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsWatermarkExpanded((v) => !v)}
                className="inline-flex items-center gap-1.5 font-semibold text-slate-800 hover:text-indigo-700"
              >
                <Stamp className="w-3.5 h-3.5 text-indigo-600" />
                <span>Watermark &amp; Outro (Tùy chọn)</span>
                {(watermarkConfig.watermarkEnabled || watermarkConfig.outroSeconds > 0) && (
                  <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-700 rounded">
                    Bật
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsWatermarkExpanded((v) => !v)}
                className="text-[10px] font-medium text-indigo-600 hover:underline"
              >
                {isWatermarkExpanded ? 'Thu gọn' : 'Chỉnh sửa'}
              </button>
            </div>
            {isWatermarkExpanded && (
              <div className="pt-2 border-t border-slate-200/80 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={watermarkConfig.watermarkEnabled}
                      onChange={(e) =>
                        setWatermarkConfig((prev) => ({
                          ...prev,
                          watermarkEnabled: e.target.checked,
                        }))
                      }
                      className="rounded border-slate-300 text-indigo-600"
                    />
                    <span>Hiện Watermark</span>
                  </label>
                  <input
                    type="text"
                    aria-label="Watermark Reels"
                    value={watermarkConfig.watermarkText}
                    onChange={(e) =>
                      setWatermarkConfig((prev) => ({
                        ...prev,
                        watermarkEnabled: true,
                        watermarkText: e.target.value,
                      }))
                    }
                    placeholder="@EnglishReels"
                    className="flex-1 min-w-[90px] px-2 py-1 bg-white border border-slate-200 rounded"
                  />
                  <select
                    aria-label="Góc Watermark Reels"
                    value={watermarkConfig.watermarkCorner}
                    onChange={(e) =>
                      setWatermarkConfig((prev) => ({
                        ...prev,
                        watermarkCorner: e.target.value as WatermarkCorner,
                      }))
                    }
                    className="px-2 py-1 bg-white border border-slate-200 rounded"
                  >
                    <option value="top-left">Trên Trái</option>
                    <option value="top-right">Trên Phải</option>
                    <option value="bottom-left">Dưới Trái</option>
                    <option value="bottom-right">Dưới Phải</option>
                  </select>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-slate-600">Độ mờ: {Math.round(watermarkConfig.watermarkOpacity * 100)}%</span>
                  <input
                    type="range"
                    min={0.15}
                    max={1}
                    step={0.05}
                    value={watermarkConfig.watermarkOpacity}
                    onChange={(e) =>
                      setWatermarkConfig((prev) => ({
                        ...prev,
                        watermarkOpacity: Number(e.target.value),
                      }))
                    }
                    className="w-20 accent-indigo-600 h-1"
                  />
                  <span className="text-slate-600 ml-auto">Outro (s):</span>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.5}
                    value={watermarkConfig.outroSeconds}
                    onChange={(e) =>
                      setWatermarkConfig((prev) => ({
                        ...prev,
                        outroSeconds: Math.max(0, Math.min(10, Number(e.target.value) || 0)),
                      }))
                    }
                    className="w-14 px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono"
                  />
                </div>
                {watermarkConfig.outroSeconds > 0 && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      value={watermarkConfig.outroLine1}
                      onChange={(e) =>
                        setWatermarkConfig((prev) => ({ ...prev, outroLine1: e.target.value }))
                      }
                      placeholder="Outro dòng 1"
                      className="px-2 py-1 bg-white border border-slate-200 rounded"
                    />
                    <input
                      type="text"
                      value={watermarkConfig.outroLine2}
                      onChange={(e) =>
                        setWatermarkConfig((prev) => ({ ...prev, outroLine2: e.target.value }))
                      }
                      placeholder="Outro dòng 2"
                      className="px-2 py-1 bg-white border border-slate-200 rounded"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Audio Engine & Video Output Settings */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Nhà cung cấp TTS
                </label>
                <select
                  value={ttsProvider}
                  onChange={(e) => setTtsProvider(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                >
                  <option value="auto">Tự động miễn phí (Edge → Google → Polly)</option>
                  {ttsProviders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Giọng đọc ({ttsRate.toFixed(2)}x)
                </label>
                <select
                  value={ttsVoice}
                  onChange={(e) => setTtsVoice(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                >
                  {availableVoices.map((v) => (
                    <option key={`${v.lang}-${v.id}`} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {ttsProvider === 'elevenlabs' && (
              <ApiKeyInlineControl
                provider="elevenlabs"
                hasServerKey={hasElevenLabsKey}
                onSaved={refreshTtsVoices}
                compact
              />
            )}

            <div>
              <input
                type="range"
                aria-label="Tốc độ đọc TTS"
                min={0.8}
                max={1.3}
                step={0.05}
                value={ttsRate}
                onChange={(e) => setTtsRate(Number(e.target.value))}
                className="w-full accent-indigo-600 h-1.5"
              />
            </div>

            {/* Dual-TTS & Per-Language Audio On/Off Controls */}
            <div className="pt-2 border-t border-slate-200/80 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-800 cursor-pointer p-2 rounded-lg bg-white border border-slate-200/80">
                  <input
                    type="checkbox"
                    data-testid="toggle-learning-audio"
                    checked={enableLearningAudio}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setEnableLearningAudio(next);
                      if (!next) {
                        if (!enableDualTts) setEnableDualTts(true);
                        if (targetLang === 'none') {
                          setTargetLang('learning');
                          setExplanationTtsVoice(
                            pickExplanationDefaultVoice('learning', activeLearningLang),
                          );
                        }
                      }
                      invalidateSynthesizedAudio();
                    }}
                    className="rounded border-slate-300 text-indigo-600"
                  />
                  <span>Đọc audio ngôn ngữ muốn học ({activeLearningLang.toUpperCase()})</span>
                </label>

                <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-800 cursor-pointer p-2 rounded-lg bg-white border border-slate-200/80">
                  <input
                    type="checkbox"
                    data-testid="toggle-explanation-audio"
                    checked={enableDualTts && targetLang !== 'none'}
                    onChange={(e) => {
                      const next = e.target.checked;
                      if (next) {
                        setEnableDualTts(true);
                        if (targetLang === 'none') {
                          setTargetLang('learning');
                          setExplanationTtsVoice(
                            pickExplanationDefaultVoice('learning', activeLearningLang),
                          );
                        }
                      } else {
                        setEnableDualTts(false);
                        if (!enableLearningAudio) {
                          setEnableLearningAudio(true);
                        }
                      }
                      invalidateSynthesizedAudio();
                    }}
                    className="rounded border-slate-300 text-indigo-600"
                  />
                  <span>Đọc audio ngôn ngữ giải thích</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500 px-0.5">
                <span>
                  {enableLearningAudio && enableDualTts && targetLang !== 'none'
                    ? `Đang bật cả 2 giọng: ${activeLearningLang.toUpperCase()} + giải thích (${formatTargetLangDisplay(targetLang, activeLearningLang)})`
                    : enableLearningAudio
                      ? `Chỉ đọc audio ngôn ngữ muốn học (${activeLearningLang.toUpperCase()})`
                      : `Chỉ đọc audio giải thích (${formatTargetLangDisplay(targetLang, activeLearningLang)})`}
                </span>
              </div>

              {enableLearningAudio && enableDualTts && targetLang !== 'none' && (
                <label className="flex items-start gap-1.5 text-[11px] text-slate-700 cursor-pointer p-2 rounded-lg bg-white border border-slate-200/80">
                  <input
                    type="checkbox"
                    aria-label="Tách vai 2 giọng khi xuất Audio"
                    checked={splitAudioByRole}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setSplitAudioByRole(next);
                      if (next && !enableDualTts) {
                        setEnableDualTts(true);
                      }
                    }}
                    className="mt-0.5 rounded border-slate-300 text-indigo-600"
                  />
                  <span>
                    <span className="font-semibold text-slate-900">
                      Tách vai 2 giọng khi xuất Audio (không trộn giữa câu)
                    </span>
                    <span className="block text-[10px] text-slate-500 mt-0.5">
                      Giọng ngoại ngữ ({activeLearningLang.toUpperCase()}) chỉ đọc từ vựng, ngữ pháp, ví dụ &amp; câu hỏi · Giọng giải thích ({formatTargetLangDisplay(targetLang, activeLearningLang)}) chỉ đọc mở bài, chuyển tiếp, giải nghĩa &amp; tổng kết.
                    </span>
                  </span>
                </label>
              )}

              {enableDualTts && targetLang !== 'none' && (
                <div>
                  <label
                    htmlFor="reels-explanation-tts-voice"
                    className="block text-[10px] font-semibold text-slate-600 mb-1"
                  >
                    Giọng đọc giải thích (TTS 2)
                  </label>
                  <select
                    id="reels-explanation-tts-voice"
                    aria-label="Giọng đọc giải thích TTS 2"
                    value={explanationTtsVoice}
                    onChange={(e) => setExplanationTtsVoice(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                  >
                    {explanationVoiceChoices.map((v) => (
                      <option key={`expl-${v.id}`} value={v.id}>
                        {v.label} ({v.lang})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="space-y-2 pt-1 border-t border-slate-200/80">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Nhạc nền (Outro &amp; Bài học)
                  </label>
                  <select
                    aria-label="Nhạc nền English Reels"
                    value={customBgmFile ? 'custom' : bgmPreset}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'custom') return;
                      setCustomBgmFile(null);
                      setBgmPreset(val as StudioBgmPresetId);
                    }}
                    className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                  >
                    {customBgmFile && (
                      <option value="custom">Nhạc tải lên: {customBgmFile.name}</option>
                    )}
                    {STUDIO_BGM_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Âm lượng nhạc ({Math.round(bgmVolume * 100)}%)
                  </label>
                  <input
                    type="range"
                    aria-label="Âm lượng nhạc nền English Reels"
                    disabled={bgmPreset === 'none' && !customBgmFile}
                    min={0}
                    max={0.45}
                    step={0.01}
                    value={bgmVolume}
                    onChange={(e) => setBgmVolume(Number(e.target.value))}
                    className="w-full accent-indigo-600 h-1.5 mt-2 disabled:opacity-40"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <input
                    ref={bgmFileInputRef}
                    type="file"
                    accept="audio/*,.mp3,.wav,.m4a,.ogg"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setCustomBgmFile(f);
                      }
                      e.currentTarget.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => bgmFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 px-2 py-1 font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
                  >
                    <Upload className="w-3 h-3 text-indigo-600" />
                    <span>{customBgmFile ? 'Đổi nhạc nền' : 'Tải nhạc nền'}</span>
                  </button>
                  {customBgmFile && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-md max-w-[160px]">
                      <span className="truncate">{customBgmFile.name}</span>
                      <button
                        type="button"
                        aria-label="Gỡ nhạc nền tải lên"
                        onClick={() => setCustomBgmFile(null)}
                        className="text-indigo-500 hover:text-rose-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                </div>

                <label className="inline-flex items-center gap-1.5 text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={enableCountdownSfx}
                    onChange={(e) => setEnableCountdownSfx(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="font-medium">Âm thanh đếm ngược (Tick &amp; Ding)</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Tông nền Video
                </label>
                <select
                  value={selectedTheme}
                  onChange={(e) => setSelectedTheme(e.target.value as CanvasThemeId)}
                  className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                >
                  {Object.values(CANVAS_THEMES).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Bố cục KineticSub
                </label>
                <div className="flex items-center gap-1.5">
                  <select
                    aria-label="Bố cục KineticSub"
                    value={selectedComposition}
                    onChange={(e) => {
                      const nextComp = e.target.value as LayoutCompositionId;
                      setSelectedComposition(nextComp);
                      setSceneJsonOverride(null);
                      if (nextComp === 'plain') {
                        setSubtitlePosition('center');
                        setSubtitleSize('lg');
                        setSubtitleBoxStyle('clean');
                      } else if (selectedComposition === 'plain') {
                        setSubtitlePosition('bottom');
                        setSubtitleSize('md');
                        setSubtitleBoxStyle('card');
                      }
                    }}
                    className="flex-1 min-w-0 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                  >
                    {LAYOUT_COMPOSITIONS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {selectedComposition === 'cartoon-host' && (
                    <button
                      type="button"
                      onClick={() =>
                        setReelsAnimStudioState({
                          isOpen: true,
                          actionId: activeCard?.cartoonAction,
                          spec: activeCard?.cartoonAnimationSpec,
                          cardIdx: safeActiveIdx,
                        })
                      }
                      className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 whitespace-nowrap shrink-0"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>@Gimmys</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Ambient Presets + Background Image/Video Upload + Learning Focus Opacity + Subtitle Position/Size */}
            <div className="pt-2 border-t border-slate-200/80 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-700">
                  Nền không gian học tập (YouTube Ambience) hoặc tải Ảnh/Video
                </span>
                <input
                  ref={bgInputRef}
                  type="file"
                  accept="image/*,video/mp4,video/webm,video/quicktime"
                  className="hidden"
                  onChange={(e) => void handleUploadBgImage(e)}
                />
                <button
                  type="button"
                  disabled={isExportingVideo || isProcessingBg}
                  onClick={() => bgInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                  <span>
                    {isProcessingBg
                      ? `Đang xử lý ${reelsAspectRatio}...`
                      : backgroundImage && backgroundImage.kind !== 'preset'
                        ? `Nền: ${backgroundImage.fileName || 'Đã nạp'}`
                        : `Tải Ảnh / Video MP4`}
                  </span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1.5 max-h-[140px] overflow-y-auto pr-1">
                {BACKGROUND_PRESETS.map((preset) => {
                  const isActive =
                    backgroundImage?.kind === 'preset' && backgroundImage.presetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      title={preset.shortDesc}
                      onClick={() => {
                        if (videoBgBlobUrlRef.current) {
                          URL.revokeObjectURL(videoBgBlobUrlRef.current);
                          videoBgBlobUrlRef.current = null;
                        }
                        setBackgroundImage((prev) => ({
                          kind: 'preset',
                          presetId: preset.id as BackgroundPresetId,
                          fileName: preset.name,
                          fit: 'cover',
                          scrimOpacity: prev?.scrimOpacity ?? 0.16,
                          learningScrimOpacity: prev?.learningScrimOpacity ?? 0.42,
                        }));
                      }}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-left text-[10px] font-medium transition-colors ${
                        isActive
                          ? 'bg-indigo-50 border-indigo-400 text-indigo-900'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-sm shrink-0 border border-black/15"
                        style={{ background: preset.previewGradient }}
                      />
                      <span className="truncate">{preset.name}</span>
                    </button>
                  );
                })}
              </div>

              {backgroundImage && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] pt-1">
                  {backgroundImage.kind !== 'preset' && (
                    <button
                      type="button"
                      onClick={() =>
                        setBackgroundImage((prev) =>
                          prev
                            ? {
                                ...prev,
                                fit: (prev.fit === 'contain' ? 'cover' : 'contain') as BackgroundFitMode,
                              }
                            : undefined,
                        )
                      }
                      className="px-2 py-1 font-semibold bg-white border border-slate-200 rounded text-slate-700 hover:bg-slate-50"
                      title={`Đổi chế độ phủ khung ${reelsAspectRatio}`}
                    >
                      {backgroundImage.fit === 'contain' ? 'Vừa khung' : 'Phủ đầy'}
                    </button>
                  )}
                  <label className="flex items-center gap-1.5 text-slate-600">
                    <span>Độ tối nền: {Math.round((backgroundImage.scrimOpacity ?? 0.2) * 100)}%</span>
                    <input
                      type="range"
                      aria-label="Độ tối lớp phủ ảnh nền Reels"
                      min={0}
                      max={0.75}
                      step={0.05}
                      value={backgroundImage.scrimOpacity ?? 0.2}
                      onChange={(e) =>
                        setBackgroundImage((prev) =>
                          prev ? { ...prev, scrimOpacity: Number(e.target.value) } : undefined,
                        )
                      }
                      className="w-16 accent-indigo-600 h-1"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-slate-600">
                    <span>Tập trung chữ: {Math.round((backgroundImage.learningScrimOpacity ?? 0.42) * 100)}%</span>
                    <input
                      type="range"
                      aria-label="Độ tối nền khi vào chữ học Reels"
                      min={0}
                      max={0.85}
                      step={0.05}
                      value={backgroundImage.learningScrimOpacity ?? 0.42}
                      onChange={(e) =>
                        setBackgroundImage((prev) =>
                          prev ? { ...prev, learningScrimOpacity: Number(e.target.value) } : undefined,
                        )
                      }
                      className="w-16 accent-indigo-600 h-1"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setBgUploadError(null);
                      if (videoBgBlobUrlRef.current) {
                        URL.revokeObjectURL(videoBgBlobUrlRef.current);
                        videoBgBlobUrlRef.current = null;
                      }
                      setBackgroundImage(undefined);
                    }}
                    aria-label="Xóa ảnh nền Reels"
                    className="p-1 text-slate-400 hover:text-red-600 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 pt-1.5 border-t border-slate-200/80">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                    Vị trí Sub
                  </label>
                  <select
                    aria-label="Vị trí hiển thị Sub Reels"
                    value={subtitlePosition}
                    onChange={(e) => setSubtitlePosition(e.target.value as SubtitlePosition)}
                    className="w-full px-2 py-1 text-[11px] bg-white border border-slate-200 rounded-lg"
                  >
                    <option value="top">Trên cùng</option>
                    <option value="center">Giữa màn hình</option>
                    <option value="bottom">Dưới đáy</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                    Cỡ chữ Sub
                  </label>
                  <select
                    aria-label="Cỡ chữ Sub Reels"
                    value={subtitleSize}
                    onChange={(e) => setSubtitleSize(e.target.value as SubtitleSize)}
                    className="w-full px-2 py-1 text-[11px] bg-white border border-slate-200 rounded-lg"
                  >
                    <option value="sm">Nhỏ</option>
                    <option value="md">Vừa</option>
                    <option value="lg">To (Rõ)</option>
                    <option value="xl">Rất to (Plain)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                    Khung chữ Sub
                  </label>
                  <select
                    aria-label="Kiểu khung chữ Sub Reels"
                    value={subtitleBoxStyle}
                    onChange={(e) => setSubtitleBoxStyle(e.target.value as SubtitleBoxStyle)}
                    className="w-full px-2 py-1 text-[11px] bg-white border border-slate-200 rounded-lg"
                  >
                    <option value="card">Hộp thẻ nền</option>
                    <option value="clean">Chữ nổi không khung</option>
                    <option value="pill">Dải tối mờ</option>
                  </select>
                </div>
              </div>
            </div>
            {bgUploadError && (
              <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
                {bgUploadError}
              </p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-200/80">
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                  Khung hình
                </label>
                <select
                  aria-label="Tỉ lệ khung hình xuất MP4"
                  value={reelsAspectRatio}
                  onChange={(e) => setReelsAspectRatio(e.target.value as ExportAspectRatioId)}
                  className="w-full px-2 py-1 text-[11px] bg-white border border-slate-200 rounded-lg"
                >
                  {ASPECT_RATIO_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                  Độ phân giải
                </label>
                <select
                  value={mp4Resolution}
                  onChange={(e) => setMp4Resolution(e.target.value as ExportResolutionId)}
                  className="w-full px-2 py-1 text-[11px] bg-white border border-slate-200 rounded-lg"
                >
                  {RESOLUTION_OPTIONS.map((opt) => {
                    const dims = resolveDimensionsForAspect(opt.width, opt.height, reelsAspectRatio);
                    return (
                      <option key={opt.id} value={opt.id}>
                        {opt.id} ({dims.width}×{dims.height})
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                  Chất lượng
                </label>
                <select
                  value={mp4Quality}
                  onChange={(e) => setMp4Quality(e.target.value as ExportQualityId)}
                  className="w-full px-2 py-1 text-[11px] bg-white border border-slate-200 rounded-lg"
                >
                  <option value="standard">Chuẩn</option>
                  <option value="high">Cao</option>
                  <option value="ultra">Ultra</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                  FPS
                </label>
                <select
                  value={mp4Fps}
                  onChange={(e) => setMp4Fps(Number(e.target.value) as ExportFpsOption)}
                  className="w-full px-2 py-1 text-[11px] bg-white border border-slate-200 rounded-lg"
                >
                  <option value={24}>24 fps</option>
                  <option value={30}>30 fps</option>
                  <option value={60}>60 fps</option>
                </select>
              </div>
            </div>
            {(() => {
              const effectiveDuration = Math.max(1, previewProject.duration || 0);
              const sizeEst = estimateMp4FileSize(effectiveDuration, {
                aspectRatio: reelsAspectRatio,
                resolution: mp4Resolution,
                quality: mp4Quality,
                fps: mp4Fps,
              });
              const qualOption = QUALITY_OPTIONS.find((q) => q.id === mp4Quality);
              return (
                <div
                  data-testid="reels-mp4-estimate-box"
                  className="pt-2 border-t border-slate-200/80 space-y-1.5 text-[10.5px]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-slate-600">
                      <strong className="text-slate-800">{qualOption?.label || 'Chuẩn'}:</strong>{' '}
                      {sizeEst.qualityDescription}
                    </span>
                    <span
                      data-testid="reels-mp4-size-badge"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-800 font-semibold font-mono tabular-nums"
                    >
                      Ước lượng: {sizeEst.mbLabel} ({sizeEst.rangeLabel})
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-slate-500">
                    <span className="tabular-nums">
                      {generatedAudioFile ? 'Theo Audio đã tạo' : 'Ước tính từ kịch bản'} ({effectiveDuration.toFixed(1)}s · {(sizeEst.encoding.videoBitrate / 1_000_000).toFixed(2)} Mbps + {Math.round(sizeEst.encoding.audioBitrate / 1000)}k audio)
                    </span>
                    <label
                      className="inline-flex items-center gap-1.5 text-slate-700 font-medium cursor-pointer"
                      title="Chỉ hoạt động khi chạy KineticSub Studio cục bộ trên Windows qua run.bat (có 15 giây đếm ngược & nút hủy)"
                    >
                      <input
                        type="checkbox"
                        data-testid="reels-auto-shutdown-toggle"
                        checked={autoShutdownAfterRender}
                        onChange={(e) => setAutoShutdownAfterRender(e.target.checked)}
                        className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                      />
                      <Power className="w-3 h-3 text-amber-600" />
                      <span>Tự tắt máy sau khi render xong (Windows local)</span>
                    </label>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Description & Hashtags (.txt companion output matching learner's native language) */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsDescriptionExpanded((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800 hover:text-indigo-700"
              >
                <FileText className="w-3.5 h-3.5 text-indigo-600" />
                <span>
                  Mô tả &amp; Hashtag xuất kèm (.txt · {videoDescription.nativeLangCode.toUpperCase()})
                </span>
              </button>
              <div className="flex items-center gap-1.5">
                <select
                  aria-label="Kiểu mô tả video"
                  value={descriptionStyle}
                  onChange={(e) => setDescriptionStyle(e.target.value as VideoDescriptionStyle)}
                  className="px-2 py-1 text-[11px] bg-white border border-slate-200 rounded-md text-slate-700"
                >
                  <option value="auto">Tự động theo bài</option>
                  <option value="hook-bullets">Hook + ✔ Gạch đầu dòng</option>
                  <option value="training-guide">🏋️ Hướng dẫn &amp; Mục lục</option>
                  <option value="phrase-pack">📌 Tổng hợp mẫu câu</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(videoDescription.txtContent);
                    setCopiedDescNotice('all');
                    setTimeout(() => setCopiedDescNotice(null), 1600);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold bg-white border border-slate-200 rounded-md hover:bg-indigo-50 text-slate-700"
                >
                  {copiedDescNotice === 'all' ? (
                    <Check className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>{copiedDescNotice === 'all' ? 'Đã chép' : 'Chép tất cả'}</span>
                </button>
              </div>
            </div>

            {isDescriptionExpanded ? (
              <div className="space-y-2 pt-1">
                <textarea
                  readOnly
                  aria-label="Nội dung mô tả và hashtag video"
                  value={videoDescription.txtContent}
                  rows={7}
                  className="w-full p-2 text-[11px] leading-relaxed bg-white border border-slate-200 rounded-lg text-slate-800 font-sans resize-y"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(videoDescription.description);
                        setCopiedDescNotice('desc');
                        setTimeout(() => setCopiedDescNotice(null), 1600);
                      }}
                      className="px-2 py-1 bg-white border border-slate-200 rounded-md hover:bg-slate-100 font-medium text-slate-700"
                    >
                      {copiedDescNotice === 'desc' ? '✓ Đã chép mô tả' : 'Chép mô tả'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(videoDescription.hashtagsLine);
                        setCopiedDescNotice('tags');
                        setTimeout(() => setCopiedDescNotice(null), 1600);
                      }}
                      className="px-2 py-1 bg-white border border-slate-200 rounded-md hover:bg-slate-100 font-medium text-slate-700"
                    >
                      {copiedDescNotice === 'tags' ? '✓ Đã chép hashtag' : 'Chép hashtag'}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const activeFileLevel =
                        reelCreationMode === 'creator'
                          ? creatorLevel
                          : reelCreationMode === 'translation'
                            ? translationLevel
                            : parsedLessonLevel;
                      const stem = buildLeveledOutputStem({
                        title: lessonTitle,
                        level: activeFileLevel,
                        learningLanguage: detectedLearningLangForDesc,
                        fallback: 'English Reels',
                      });
                      downloadTextAsPlainFile(videoDescription.txtContent, `${stem}.txt`);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md hover:bg-indigo-100"
                  >
                    <Download className="w-3 h-3" />
                    <span>Tải .txt</span>
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-slate-600 line-clamp-2">
                <span className="font-semibold text-indigo-700">{videoDescription.hashtags.slice(0, 4).join(' ')}</span>
                {' · '}
                <span>Tự xuất file .txt cùng tên &amp; thư mục khi render MP4.</span>
              </p>
            )}
          </div>

          {(isGeneratingAudio || isPreviewingVoice || isResyncingReels) && (
            <div className="p-2.5 rounded-lg bg-indigo-50 border border-indigo-200 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-medium text-indigo-900">
                <span className="truncate">{ttsStageLabel || 'Đang tổng hợp Audio TTS...'}</span>
                <span className="font-mono tabular-nums shrink-0 ml-2">{ttsProgress}%</span>
              </div>
              <div className="w-full h-1.5 bg-indigo-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 transition-all duration-200"
                  style={{ width: `${Math.max(4, ttsProgress)}%` }}
                />
              </div>
            </div>
          )}

          {isExportingVideo && (
            <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-medium text-emerald-900">
                <span className="truncate">{exportStageLabel || 'Đang render Video MP4...'}</span>
                <span className="font-mono font-bold tabular-nums shrink-0 ml-2">
                  {Math.round(exportProgress * 100)}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-emerald-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 transition-all duration-200"
                  style={{ width: `${Math.max(4, Math.round(exportProgress * 100))}%` }}
                />
              </div>
            </div>
          )}

          {otherActiveBlockingTask && (
            <div
              data-testid="reels-other-task-notice"
              className="p-2.5 rounded-lg bg-slate-100 border border-slate-300 text-[11px] text-slate-800 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-indigo-800 truncate">
                  Đang chạy ngầm: {otherActiveBlockingTask.label} (
                  {Math.round(otherActiveBlockingTask.progress * 100)}%)
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => requestNavigateToTaskSlot(otherActiveBlockingTask.slotId)}
                    className="px-2 py-0.5 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-700"
                  >
                    Về tab kia
                  </button>
                  <button
                    type="button"
                    onClick={() => abortRenderTaskSlot(otherActiveBlockingTask.slotId)}
                    className="px-2 py-0.5 rounded bg-rose-600 text-white font-semibold hover:bg-rose-700"
                  >
                    Hủy
                  </button>
                </div>
              </div>
              <p className="text-slate-600">
                Bạn vẫn có thể soạn thẻ, chỉnh cài đặt và copy Prompt bình thường ở tab này.
              </p>
            </div>
          )}

          {concurrencyConflict && (
            <div
              data-testid="reels-concurrency-conflict"
              className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-2"
            >
              <p className="font-medium leading-relaxed">{concurrencyConflict.message}</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => requestNavigateToTaskSlot(concurrencyConflict.blockingTask.slotId)}
                  className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                >
                  Xem tab đang render
                </button>
                <button
                  type="button"
                  onClick={() => {
                    abortRenderTaskSlot(concurrencyConflict.blockingTask.slotId);
                    setConcurrencyConflict(null);
                  }}
                  className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                >
                  Hủy luồng kia để chạy bài này
                </button>
                <button
                  type="button"
                  onClick={() => setConcurrencyConflict(null)}
                  className="px-2 py-1 rounded bg-white border border-amber-300 text-amber-900 hover:bg-amber-100"
                >
                  Đóng
                </button>
              </div>
            </div>
          )}

          {studioError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">
              {studioError}
            </p>
          )}
          {exportNotice && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 font-medium">
              {exportNotice}
            </p>
          )}

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isGeneratingAudio || isExportingVideo || cards.length === 0}
                onClick={() => void handleGeneratePreviewVideoAudio()}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 disabled:opacity-50"
              >
                {isGeneratingAudio ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
                <span>
                  {isGeneratingAudio
                    ? `Đang tạo Audio ${ttsProgress}%...`
                    : generatedAudioFile
                      ? 'Tạo lại Audio & Xem'
                      : 'Tạo Audio & Xem Video'}
                </span>
              </button>

              {isExportingVideo ? (
                <button
                  type="button"
                  onClick={() => {
                    exportAbortByModeRef.current[reelCreationMode]?.abort();
                    abortRenderTaskSlot(currentSlotId);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold text-white bg-rose-600 rounded-xl hover:bg-rose-700"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Hủy render</span>
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="reels-render-mp4-btn"
                  disabled={isGeneratingAudio || cards.length === 0}
                  onClick={() => void handleDirectRenderVideo()}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Render MP4</span>
                </button>
              )}
            </div>

            <button
              type="button"
              disabled={isGeneratingAudio || isExportingVideo || cards.length === 0}
              onClick={() => void handleGenerateAndSendToStudio(false)}
              className="w-full inline-flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 rounded-lg hover:bg-slate-200"
            >
              <span>Chuyển sang KineticSub Studio (sửa timeline chi tiết)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <CartoonAnimationStudioModal
        isOpen={reelsAnimStudioState.isOpen}
        initialActionId={reelsAnimStudioState.actionId}
        initialSpec={reelsAnimStudioState.spec}
        onClose={() => setReelsAnimStudioState((s) => ({ ...s, isOpen: false }))}
        onApplyToStage={(actionId, spec) => {
          const targetIdx = reelsAnimStudioState.cardIdx ?? safeActiveIdx;
          if (selectedComposition !== 'cartoon-host') {
            setSelectedComposition('cartoon-host');
          }
          updateCard(targetIdx, {
            cartoonAction: actionId,
            cartoonMood: spec.mood,
            cartoonAnimationSpec: spec,
          });
        }}
      />

      <ShutdownCountdownBanner
        active={shutdownCountdownInfo.active}
        completedTitle={shutdownCountdownInfo.title}
        onCancel={() => setShutdownCountdownInfo({ active: false })}
      />
    </div>
  );
};
