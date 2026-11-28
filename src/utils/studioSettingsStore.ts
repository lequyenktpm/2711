import { PromptVideoStyle } from '../engine/aiPromptBuilder';
import { StudioBgmPresetId } from '../engine/audioMixHelper';
import {
  EduKaraokePosition,
  EduKaraokeSize,
  EduWatermarkOutroConfig,
} from '../engine/eduStudioEffects';
import {
  CreatorFormatCategory,
  LearningLanguageId,
  ReelCreationMode,
  ReelMode,
} from '../engine/englishReelsEngine';
import {
  ExportAspectRatioId,
  ExportFpsOption,
  ExportQualityId,
  ExportResolutionId,
} from '../engine/mp4Config';
import { ReadingFormatCategory, ReadingLearningLang } from '../engine/readingPromptBuilder';
import {
  BackgroundPresetId,
  CanvasThemeId,
  LayoutCompositionId,
  SubtitleBoxStyle,
  SubtitleDisplayConfig,
  SubtitlePosition,
  SubtitleSize,
  WatermarkOutroConfig,
} from '../engine/types';
import { VideoDescriptionStyle } from '../engine/videoDescriptionBuilder';

export const USER_SETTINGS_HYDRATED_EVENT = 'kineticsub:user-settings-hydrated';
export const USER_SETTINGS_RESET_EVENT = 'kineticsub:user-settings-reset';

const STORAGE_KEY = 'kineticsub_user_settings_v1';

export interface PersistedReelsModeSettings {
  includeQuizInPrompt?: 'auto' | 'always' | 'none';
  mode?: ReelMode;
  targetLang?: string;
  ttsProvider?: string;
  ttsVoice?: string;
  enableLearningAudio?: boolean;
  enableDualTts?: boolean;
  splitAudioByRole?: boolean;
  explanationTtsVoice?: string;
  ttsRate?: number;
  ttsRateManuallyEdited?: boolean;
  reelsAspectRatio?: ExportAspectRatioId;
  selectedTheme?: CanvasThemeId;
  selectedComposition?: LayoutCompositionId;
  subtitlePosition?: SubtitlePosition;
  subtitleSize?: SubtitleSize;
  subtitleBoxStyle?: SubtitleBoxStyle;
  backgroundPresetId?: BackgroundPresetId | '';
  learningScrimOpacity?: number;
  bgmPreset?: StudioBgmPresetId;
  bgmVolume?: number;
  enableCountdownSfx?: boolean;
  descriptionStyle?: VideoDescriptionStyle;
  watermarkConfig?: Partial<WatermarkOutroConfig>;
  mp4Resolution?: ExportResolutionId;
  mp4Quality?: ExportQualityId;
  mp4Fps?: ExportFpsOption;
  previewViewMode?: 'video' | 'cards';
  layoutOverridesByAspect?: Record<string, Record<string, any>>;
}

export interface PersistedStudioSettings {
  activeTab?: 'studio' | 'reels' | 'edu-studio';
  updatedAt?: number;
  studio?: {
    aspectRatio?: ExportAspectRatioId;
    resolution?: ExportResolutionId;
    quality?: ExportQualityId;
    fps?: ExportFpsOption;
    theme?: CanvasThemeId;
    compositionId?: LayoutCompositionId;
    backgroundPresetId?: BackgroundPresetId | '';
    subtitleConfig?: SubtitleDisplayConfig;
    learningScrimOpacity?: number;
    bgmPreset?: StudioBgmPresetId;
    bgmVolume?: number;
    descriptionStyle?: VideoDescriptionStyle;
    watermark?: WatermarkOutroConfig;
    step2PromptStyle?: PromptVideoStyle;
    targetDurationMinutes?: number;
    step2CompositionMode?: 'manual' | 'ai-decide' | 'random' | 'custom';
    inlineProvider?: string;
    inlineVoice?: string;
    inlineSecondaryVoice?: string;
    inlineRate?: number;
    inlineWhisperSync?: boolean;
  };
  reels?: PersistedReelsModeSettings & {
    reelCreationMode?: ReelCreationMode;
    sourceLearningLang?: LearningLanguageId;
    sourceLevel?: string;
    sourceDurationMinutes?: number;
    creatorTopicHint?: string;
    creatorFormat?: CreatorFormatCategory;
    creatorLearningLang?: LearningLanguageId;
    creatorLevel?: string;
    creatorDurationMinutes?: number;
    creatorItemCount?: number;
    creatorAutoItemCount?: boolean;
    translationTopicHint?: string;
    translationCustomLines?: string;
    translationLearningLang?: LearningLanguageId;
    translationLevel?: string;
    translationDurationMinutes?: number;
    translationItemCount?: number;
    translationAutoItemCount?: boolean;
    translationThinkSec?: number;
    translationRepeatCount?: number;
    translationIncludeNuance?: boolean;
    lessonTitle?: string;
    rawText?: string;
    byMode?: Partial<Record<ReelCreationMode, PersistedReelsModeSettings>>;
  };
  eduStudio?: {
    subTab?: 'merge' | 'karaoke' | 'align';
    selectedSavePath?: string;
    watermarkOutro?: EduWatermarkOutroConfig;
    kmStyleId?: string;
    kmSubPosition?: EduKaraokePosition;
    kmSubSize?: EduKaraokeSize;
    kmHighlightColor?: string;
    kmEffect?: string;
    kmMusicPreset?: StudioBgmPresetId;
    kmSfxPreset?: StudioBgmPresetId;
    kmMuteOriginal?: boolean;
    kmRemoveDialogue?: boolean;
    kmVoicePriority?: boolean;
    kmOriginalVol?: number;
    kmMusicVol?: number;
    kmSfxVol?: number;
    kmVoiceVol?: number;
    readingLearningLang?: ReadingLearningLang;
    readingFormat?: ReadingFormatCategory;
    readingAiLevel?: string;
    readingAiTopic?: string;
    readingPaletteId?: string;
    readingIllustration?: string;
    readingBookFrame?: string;
    readingPointerStyle?: string;
    readingDurationMinutes?: number;
    readingSubtitlePosition?: SubtitlePosition;
    readingSubtitleSize?: SubtitleSize;
    readingBackgroundPresetId?: BackgroundPresetId | '';
    readingLearningScrimOpacity?: number;
    readingIntroEnabled?: boolean;
    readingIntroSeconds?: number;
    readingOutroSpeechEnabled?: boolean;
    readingBgmPreset?: StudioBgmPresetId;
    readingBgmVolume?: number;
    alignMode?: 'fast-forced' | 'whisper';
    alignLang?: string;
    alignModel?: string;
    readingProvider?: string;
    readingVoice?: string;
    readingTtsRate?: number;
    readingAspect?: ExportAspectRatioId;
    readingResolution?: ExportResolutionId;
    readingQuality?: ExportQualityId;
    readingFps?: ExportFpsOption;
  };
  audioModal?: {
    tab?: 'tts' | 'transcribe';
    provider?: string;
    voice?: string;
    secondaryVoice?: string;
    rate?: number;
    ttsTitle?: string;
    autoSplitLanguages?: boolean;
    onlyTargetContentSpeech?: boolean;
    autoAlignWhisper?: boolean;
    ttsAlignMode?: 'fast-forced' | 'whisper';
    ttsWhisperModel?: string;
    sttService?: 'faster-whisper' | 'whisper' | 'gemini';
    whisperModel?: string;
    outputFormat?: 'srt' | 'vtt';
    sourceLang?: string;
    translateLang?: string;
    standaloneTargetLang?: string;
    standaloneBilingual?: boolean;
  };
}

function isPlainRecord(val: unknown): val is Record<string, unknown> {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

function deepMergeSettings<T extends Record<string, any>>(
  base: T,
  patch: Record<string, any>,
): T {
  const out: Record<string, any> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (isPlainRecord(v) && isPlainRecord(out[k]) && k !== 'layoutOverridesByAspect') {
      out[k] = deepMergeSettings(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

export function loadPersistedSettings(): PersistedStudioSettings {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return isPlainRecord(parsed) ? (parsed as PersistedStudioSettings) : {};
  } catch {
    return {};
  }
}

let pendingSyncTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSyncPatch: Record<string, any> = {};

export function updatePersistedSettings(
  patch: Partial<PersistedStudioSettings>,
): PersistedStudioSettings {
  const current = loadPersistedSettings();
  const next = deepMergeSettings(current, patch as Record<string, any>);
  next.updatedAt = Date.now();

  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
  }

  if (typeof fetch === 'function') {
    pendingSyncPatch = deepMergeSettings(pendingSyncPatch, patch as Record<string, any>);
    if (pendingSyncTimer) clearTimeout(pendingSyncTimer);
    pendingSyncTimer = setTimeout(() => {
      const toSend = pendingSyncPatch;
      pendingSyncPatch = {};
      pendingSyncTimer = null;
      void fetch('/api/settings/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: toSend }),
      }).catch(() => undefined);
    }, 350);
  }

  return next;
}

export async function hydrateUserSettingsFromServer(): Promise<PersistedStudioSettings> {
  const local = loadPersistedSettings();
  if (typeof fetch !== 'function') return local;
  try {
    const res = await fetch('/api/settings/preferences');
    if (!res.ok) return local;
    const data = (await res.json()) as { settings?: PersistedStudioSettings };
    const serverSettings = isPlainRecord(data?.settings) ? data.settings : {};
    if (Object.keys(serverSettings).length === 0) return local;
    const merged = deepMergeSettings(serverSettings, local as Record<string, any>);
    if (
      typeof local.updatedAt !== 'number' ||
      (typeof serverSettings.updatedAt === 'number' && serverSettings.updatedAt > local.updatedAt)
    ) {
      const next = serverSettings;
      if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(USER_SETTINGS_HYDRATED_EVENT, { detail: next }));
      }
      return next;
    }
    return merged;
  } catch {
    return local;
  }
}

export async function resetAllUserSettings(): Promise<void> {
  if (pendingSyncTimer) {
    clearTimeout(pendingSyncTimer);
    pendingSyncTimer = null;
  }
  pendingSyncPatch = {};
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  if (typeof fetch === 'function') {
    await fetch('/api/settings/preferences/reset', { method: 'POST' }).catch(() => undefined);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(USER_SETTINGS_RESET_EVENT));
  }
}

export function resolveReelsModeSettings(
  reels: PersistedStudioSettings['reels'] | undefined,
  mode: ReelCreationMode,
): PersistedReelsModeSettings {
  if (!reels) return {};
  if (reels.byMode) {
    return reels.byMode[mode] ? { ...reels.byMode[mode] } : {};
  }
  const legacyMode: ReelCreationMode = reels.reelCreationMode || 'source';
  if (legacyMode !== mode) {
    return {};
  }
  return {
    includeQuizInPrompt: reels.includeQuizInPrompt,
    mode: reels.mode,
    targetLang: reels.targetLang,
    ttsProvider: reels.ttsProvider,
    ttsVoice: reels.ttsVoice,
    enableLearningAudio: reels.enableLearningAudio,
    enableDualTts: reels.enableDualTts,
    splitAudioByRole: reels.splitAudioByRole,
    explanationTtsVoice: reels.explanationTtsVoice,
    ttsRate: reels.ttsRate,
    ttsRateManuallyEdited: reels.ttsRateManuallyEdited,
    reelsAspectRatio: reels.reelsAspectRatio,
    selectedTheme: reels.selectedTheme,
    selectedComposition: reels.selectedComposition,
    subtitlePosition: reels.subtitlePosition,
    subtitleSize: reels.subtitleSize,
    subtitleBoxStyle: reels.subtitleBoxStyle,
    backgroundPresetId: reels.backgroundPresetId,
    learningScrimOpacity: reels.learningScrimOpacity,
    bgmPreset: reels.bgmPreset,
    bgmVolume: reels.bgmVolume,
    enableCountdownSfx: reels.enableCountdownSfx,
    descriptionStyle: reels.descriptionStyle,
    watermarkConfig: reels.watermarkConfig,
    mp4Resolution: reels.mp4Resolution,
    mp4Quality: reels.mp4Quality,
    mp4Fps: reels.mp4Fps,
    previewViewMode: reels.previewViewMode,
    layoutOverridesByAspect: reels.layoutOverridesByAspect,
  };
}
