import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FileAudio,
  FileJson,
  Loader2,
  Mic,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Square,
  Upload,
  Volume2,
  XCircle,
} from 'lucide-react';
import { buildSceneGenerationPrompt } from '../engine/aiPromptBuilder';
import { getEffectiveIntroSeconds } from '../engine/canvasRenderer';
import { validateStoryboardDocument } from '../engine/storyboardValidator';
import { cleanDownloadFileName } from '../engine/outputNaming';
import {
  fetchTtsVoicesCatalog,
  synthesizeAudioAndSyncCues,
  TtsProviderItem,
} from '../engine/ttsSyncHelper';
import { isMultilingualVoiceId } from '../engine/bilingualTtsHelper';
import { notifyEdgeFallbackToGoogle } from '../utils/ttsFallbackNotice';
import type { PromptVideoStyle } from '../engine/aiPromptBuilder';
import { subscribeCartoonAnimations } from '../engine/cartoonAnimationDb';
import { subscribeCustomComponents } from '../engine/customComponentStore';
import { LAYOUT_COMPOSITIONS, pickRandomComposition } from '../engine/illustrationLayouts';
import {
  FPS_OPTIONS,
  Mp4ExportSettings,
  QUALITY_OPTIONS,
  RESOLUTION_OPTIONS,
  resolveMp4EncodingParams,
} from '../engine/mp4Config';
import { ExportVideoResult } from '../engine/mp4Exporter';
import {
  SAMPLE_JP_EN_SCENE_JSON,
  SAMPLE_JP_EN_TRANSCRIPT,
  SAMPLE_SCENE_PLAN,
  SAMPLE_WORDS_JSON,
  SAMPLE_XUN52000_SCENE_JSON,
  SAMPLE_XUN52000_TRANSCRIPT,
} from '../engine/demoPresets';
import {
  clampStoryboardPlanToAudioDuration,
  parseScenePlanJson,
  parseWordLevelJson,
  summarizeScenePlan,
} from '../engine/scenePlanAdapter';
import { clampCuesToAudioDuration } from '../engine/storyboardV19';
import {
  cuesToBlockTranscript,
  formatTimeToken,
  parseTranscriptAuto,
} from '../engine/transcriptParser';
import { ApiKeyInlineControl } from './ApiKeyInlineControl';
import { PasteButton } from './PasteButton';
import { getEffectiveVectorCatalog, SCENE_ICON_KEYWORDS } from '../engine/vectorComponentDb';
import {
  CustomComponentPresetConfig,
  IllustrationSceneIcon,
  IllustrationVariant,
  isDarkCanvasTheme,
  LayoutCompositionId,
  LessonProject,
  ScenePlanDocument,
  TranscriptCue,
  WordTiming,
} from '../engine/types';
import { useClientApiKeys } from '../utils/apiKeysStore';
import {
  loadPersistedSettings,
  PersistedStudioSettings,
  updatePersistedSettings,
  USER_SETTINGS_HYDRATED_EVENT,
  USER_SETTINGS_RESET_EVENT,
} from '../utils/studioSettingsStore';

export type PresetId = 'jp-en' | 'water' | 'ed' | '3d' | 'xun';

interface AutomationPipelinePanelProps {
  project: LessonProject;
  audioUrl?: string | null;
  audioFile?: File | null;
  audioFileName?: string;
  audioDurationSec?: number | null;
  currentTime: number;
  isExportingVideo: boolean;
  exportProgress: number;
  exportStageLabel: string;
  exportError: string | null;
  mp4Settings: Mp4ExportSettings;
  customCompositionConfig?: CustomComponentPresetConfig;
  onChangeMp4Settings: (next: Mp4ExportSettings) => void;
  onChangeComposition: (compositionId: LayoutCompositionId) => void;
  onRandomizeComposition: () => void;
  onChangeCustomComposition?: (next: CustomComponentPresetConfig) => void;
  onApplyCustomComposition?: (config: CustomComponentPresetConfig, scope?: 'all' | 'active-cue') => void;
  onSelectPreset: (presetId: PresetId) => void;
  onUploadAudio: (file: File) => void;
  onClearAudio: () => void;
  onApplyTranscript: (cues: TranscriptCue[], title: string) => void;
  onApplyAudioAndCues?: (audioFile: File | null, cues: TranscriptCue[], title?: string) => void;
  onResyncCuesToAudio?: (
    mode: 'fast-forced' | 'whisper',
    options?: { resyncVisuals?: boolean; onProgress?: (pct: number, label: string) => void },
  ) => Promise<{
    cueCount: number;
    backendUsed: string;
    blockTranscript: string;
    srt: string;
  } | null>;
  onAdjustTiming?: (adjust: {
    offsetMs?: number;
    speedFactor?: number;
    targetDurationSec?: number;
    resyncVisuals?: boolean;
  }) => void;
  onApplyScenePlan: (
    words: WordTiming[],
    plan: ScenePlanDocument,
    title: string,
    cuesOverride?: TranscriptCue[],
  ) => LessonProject;
  onApplyAndRenderVideo: (
    words: WordTiming[],
    plan: ScenePlanDocument,
    title: string,
    cuesOverride?: TranscriptCue[],
  ) => Promise<ExportVideoResult | null>;
  onSeek: (time: number) => void;
  onOpenAdvancedEditor: () => void;
  onOpenAudioSubtitleStudio: () => void;
  onCancelExportVideo?: () => void;
  onOpenAnimationStudio?: () => void;
}

export const AutomationPipelinePanel: React.FC<AutomationPipelinePanelProps> = ({
  project,
  audioUrl,
  audioFile,
  audioFileName,
  audioDurationSec,
  currentTime,
  isExportingVideo,
  exportProgress,
  exportStageLabel,
  exportError,
  mp4Settings,
  customCompositionConfig,
  onChangeMp4Settings,
  onChangeComposition,
  onRandomizeComposition,
  onChangeCustomComposition,
  onApplyCustomComposition,
  onSelectPreset,
  onUploadAudio,
  onClearAudio,
  onApplyTranscript,
  onApplyAudioAndCues,
  onResyncCuesToAudio,
  onAdjustTiming,
  onApplyScenePlan,
  onApplyAndRenderVideo,
  onSeek,
  onOpenAdvancedEditor,
  onOpenAudioSubtitleStudio,
  onCancelExportVideo,
  onOpenAnimationStudio,
}) => {
  const [initialSaved] = useState(() => loadPersistedSettings().studio);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [dbVersion, setDbVersion] = useState(0);
  const [rawTranscript, setRawTranscript] = useState<string>(() =>
    cuesToBlockTranscript(project.cues),
  );
  const [customTitle, setCustomTitle] = useState<string>(project.title);
  const [promptStyle, setPromptStyle] = useState<PromptVideoStyle>(
    () => initialSaved?.step2PromptStyle || 'tiktok-cards',
  );
  const [targetDurationMinutes, setTargetDurationMinutes] = useState<number>(() =>
    typeof initialSaved?.targetDurationMinutes === 'number'
      ? initialSaved.targetDurationMinutes
      : 1,
  );
  const [compositionMode, setCompositionMode] = useState<'manual' | 'ai-decide' | 'random' | 'custom'>(
    () => initialSaved?.step2CompositionMode || 'ai-decide',
  );
  const [localCustomConfig, setLocalCustomConfig] = useState<CustomComponentPresetConfig>({
    variant: 'css-sticky-note',
    sceneIcon: 'sparkles',
    title: '',
    subtitle: '',
    speechText: '',
    labels: [],
    highlightWord: '',
    accentColor: '#4F46E5',
    showStrip: true,
    showToneMeter: false,
    showSentenceCard: true,
  });
  const activeCustomConfig = customCompositionConfig ?? localCustomConfig;
  const updateCustomConfig = (next: CustomComponentPresetConfig) => {
    setLocalCustomConfig(next);
    onChangeCustomComposition?.(next);
  };
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);

  const [rawSceneJson, setRawSceneJson] = useState<string>(() =>
    JSON.stringify(SAMPLE_JP_EN_SCENE_JSON, null, 2),
  );
  const [useSeparateWordsJson, setUseSeparateWordsJson] = useState<boolean>(false);
  const [rawWordsJson, setRawWordsJson] = useState<string>(() =>
    JSON.stringify(SAMPLE_WORDS_JSON, null, 2),
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [renderNotice, setRenderNotice] = useState<string | null>(null);

  const { keys: clientKeys } = useClientApiKeys();

  // Inline TTS synthesis & auto-sync state (mirrors English Reels Studio)
  const [ttsProviders, setTtsProviders] = useState<TtsProviderItem[]>([]);
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [hasElevenLabsKey, setHasElevenLabsKey] = useState(false);
  const [inlineProvider, setInlineProvider] = useState(
    () => initialSaved?.inlineProvider || 'edge',
  );
  const [inlineVoice, setInlineVoice] = useState(
    () => initialSaved?.inlineVoice || 'en-US-JennyNeural',
  );
  const [inlineSecondaryVoice, setInlineSecondaryVoice] = useState(
    () => initialSaved?.inlineSecondaryVoice || 'vi-VN-HoaiMyNeural',
  );
  const [inlineRate, setInlineRate] = useState(() =>
    typeof initialSaved?.inlineRate === 'number' ? initialSaved.inlineRate : 1.0,
  );
  const [inlineWhisperSync, setInlineWhisperSync] = useState(() =>
    typeof initialSaved?.inlineWhisperSync === 'boolean' ? initialSaved.inlineWhisperSync : true,
  );
  const [isGeneratingInlineAudio, setIsGeneratingInlineAudio] = useState(false);
  const [inlineTtsProgress, setInlineTtsProgress] = useState(0);
  const [inlineTtsStageLabel, setInlineTtsStageLabel] = useState('');
  const [inlineTtsNotice, setInlineTtsNotice] = useState<string | null>(null);
  const [inlineGeneratedSrt, setInlineGeneratedSrt] = useState<string | null>(null);
  const [isResyncingTiming, setIsResyncingTiming] = useState(false);
  const [resyncProgress, setResyncProgress] = useState(0);
  const [resyncStageLabel, setResyncStageLabel] = useState('');

  const audioInputRef = useRef<HTMLInputElement>(null);
  const transcriptInputRef = useRef<HTMLInputElement>(null);

  const refreshTtsVoices = () => {
    void fetchTtsVoicesCatalog()
      .then((res) => {
        setTtsProviders(res.providers);
        setHasGeminiKey(res.hasGeminiKey);
        setHasElevenLabsKey(res.hasElevenLabsKey);
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    refreshTtsVoices();
  }, []);

  useEffect(() => {
    const onHydrated = (ev: Event) => {
      const s = (ev as CustomEvent<PersistedStudioSettings>).detail?.studio;
      if (!s) return;
      if (s.step2PromptStyle) setPromptStyle(s.step2PromptStyle);
      if (typeof s.targetDurationMinutes === 'number') {
        setTargetDurationMinutes(s.targetDurationMinutes);
      }
      if (s.step2CompositionMode) setCompositionMode(s.step2CompositionMode);
      if (s.inlineProvider) setInlineProvider(s.inlineProvider);
      if (s.inlineVoice) setInlineVoice(s.inlineVoice);
      if (s.inlineSecondaryVoice) setInlineSecondaryVoice(s.inlineSecondaryVoice);
      if (typeof s.inlineRate === 'number') setInlineRate(s.inlineRate);
      if (typeof s.inlineWhisperSync === 'boolean') setInlineWhisperSync(s.inlineWhisperSync);
    };
    const onReset = () => {
      setStep(1);
      setPromptStyle('tiktok-cards');
      setTargetDurationMinutes(1);
      setCompositionMode('ai-decide');
      setInlineProvider('edge');
      setInlineVoice('en-US-JennyNeural');
      setInlineSecondaryVoice('vi-VN-HoaiMyNeural');
      setInlineRate(1.0);
      setInlineWhisperSync(true);
    };
    window.addEventListener(USER_SETTINGS_HYDRATED_EVENT, onHydrated);
    window.addEventListener(USER_SETTINGS_RESET_EVENT, onReset);
    return () => {
      window.removeEventListener(USER_SETTINGS_HYDRATED_EVENT, onHydrated);
      window.removeEventListener(USER_SETTINGS_RESET_EVENT, onReset);
    };
  }, []);

  const hasMountedPersistRef = useRef(false);
  useEffect(() => {
    if (!hasMountedPersistRef.current) {
      hasMountedPersistRef.current = true;
      return;
    }
    updatePersistedSettings({
      studio: {
        step2PromptStyle: promptStyle,
        targetDurationMinutes,
        step2CompositionMode: compositionMode,
        inlineProvider,
        inlineVoice,
        inlineSecondaryVoice,
        inlineRate,
        inlineWhisperSync,
      },
    });
  }, [
    promptStyle,
    targetDurationMinutes,
    compositionMode,
    inlineProvider,
    inlineVoice,
    inlineSecondaryVoice,
    inlineRate,
    inlineWhisperSync,
  ]);

  const effectiveHasGeminiKey = hasGeminiKey || Boolean(clientKeys.geminiApiKey);
  const effectiveHasElevenLabsKey = hasElevenLabsKey || Boolean(clientKeys.elevenlabsApiKey);

  const inlineAvailableVoices = useMemo(() => {
    if (inlineProvider === 'auto') {
      return ttsProviders.flatMap((p) => {
        if (p.id === 'gemini' && !effectiveHasGeminiKey) return [];
        if (p.id === 'elevenlabs' && !effectiveHasElevenLabsKey) return [];
        return p.voices;
      });
    }
    return ttsProviders.find((p) => p.id === inlineProvider)?.voices ?? [];
  }, [ttsProviders, inlineProvider, effectiveHasGeminiKey, effectiveHasElevenLabsKey]);

  useEffect(() => {
    if (
      inlineAvailableVoices.length > 0 &&
      !inlineAvailableVoices.some((v) => v.id === inlineVoice)
    ) {
      setInlineVoice(inlineAvailableVoices[0].id);
    }
  }, [inlineAvailableVoices, inlineVoice]);

  useEffect(() => {
    const unsubComp = subscribeCustomComponents(() => setDbVersion((v) => v + 1));
    const unsubAnim = subscribeCartoonAnimations(() => setDbVersion((v) => v + 1));
    return () => {
      unsubComp();
      unsubAnim();
    };
  }, []);

  const prevCompIdRef = useRef<LayoutCompositionId | undefined>(project.compositionId);
  useEffect(() => {
    const currentComp = project.compositionId;
    if (prevCompIdRef.current !== currentComp) {
      prevCompIdRef.current = currentComp;
      if (currentComp === '3d-shapes') {
        setPromptStyle('3d-shapes');
        setCompositionMode('manual');
      } else if (currentComp === 'word-reveal') {
        setPromptStyle('word-reveal-dark');
        setCompositionMode('manual');
      } else if (currentComp === 'custom') {
        setPromptStyle('tiktok-cards');
        setCompositionMode('custom');
      } else if (currentComp) {
        setPromptStyle('tiktok-cards');
        setCompositionMode('manual');
      }
    } else if (currentComp === 'cartoon-host' && compositionMode === 'ai-decide') {
      setPromptStyle('tiktok-cards');
      setCompositionMode('manual');
    }
  }, [project.compositionId, compositionMode]);

  useEffect(() => {
    setRawTranscript(cuesToBlockTranscript(project.cues));
    setCustomTitle(project.title);
  }, [project.id, project.cues, project.title]);

  const vectorCatalog = useMemo(() => {
    void dbVersion;
    return getEffectiveVectorCatalog();
  }, [dbVersion]);
  const activeVectorCount = vectorCatalog.length;

  const liveTranscriptCues = useMemo(() => parseTranscriptAuto(rawTranscript), [rawTranscript]);
  const activeCues = project.cues.length > 0 ? project.cues : liveTranscriptCues;

  // Resolve effective compositionId for the prompt
  const effectiveCompositionId = useMemo((): LayoutCompositionId | 'ai-decide' => {
    if (compositionMode === 'custom') return 'custom';
    if (compositionMode === 'ai-decide') return 'ai-decide';
    if (compositionMode === 'random') {
      const transcriptText = activeCues.map((c) => c.text).join(' ');
      return pickRandomComposition(project.compositionId, project.theme, Math.random, {
        transcriptText,
      }).compositionId;
    }
    return project.compositionId ?? 'story-scenes';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compositionMode, project.compositionId, activeCues]);

  const generatedPrompt = useMemo(
    () =>
      buildSceneGenerationPrompt(activeCues, {
        title: customTitle || project.title,
        style: promptStyle,
        compositionId:
          promptStyle === 'tiktok-cards'
            ? effectiveCompositionId
            : promptStyle === '3d-shapes'
              ? '3d-shapes'
              : 'word-reveal',
        theme: isDarkCanvasTheme(project.theme) ? project.theme : undefined,
        customConfig: compositionMode === 'custom' ? activeCustomConfig : undefined,
        audioDurationSec,
        targetDurationMinutes,
      }),
    [activeCues, customTitle, project.title, project.theme, effectiveCompositionId, promptStyle, dbVersion, compositionMode, activeCustomConfig, audioDurationSec, targetDurationMinutes],
  );

  const parsedPreviewPlan = useMemo(() => parseScenePlanJson(rawSceneJson), [rawSceneJson]);

  const jsonPreviewSummary = useMemo(() => {
    if (!parsedPreviewPlan) return null;
    return summarizeScenePlan(parsedPreviewPlan, activeCues);
  }, [parsedPreviewPlan, activeCues]);

  const validationReport = useMemo(() => {
    if (!parsedPreviewPlan) return null;
    return validateStoryboardDocument(parsedPreviewPlan, activeCues, { audioDurationSec });
  }, [parsedPreviewPlan, activeCues, audioDurationSec]);

  const encoding = useMemo(() => resolveMp4EncodingParams(mp4Settings), [mp4Settings]);

  const visualTimelineItems = useMemo(
    () =>
      project.elements
        .filter((e) => e.type !== 'karaoke-card')
        .sort((a, b) => a.startTime - b.startTime),
    [project.elements],
  );

  const handleLoadPreset = (presetId: PresetId) => {
    setErrorMsg(null);
    setRenderNotice(null);
    onSelectPreset(presetId);
    if (presetId === 'jp-en') {
      setRawTranscript(SAMPLE_JP_EN_TRANSCRIPT);
      setCustomTitle('水が欲しい時、CanとCouldどっち？');
      setRawSceneJson(JSON.stringify(SAMPLE_JP_EN_SCENE_JSON, null, 2));
      setPromptStyle('tiktok-cards');
      setUseSeparateWordsJson(false);
    } else if (presetId === '3d') {
      setRawWordsJson(JSON.stringify(SAMPLE_WORDS_JSON, null, 2));
      setRawSceneJson(JSON.stringify(SAMPLE_SCENE_PLAN, null, 2));
      setCustomTitle('3D Shapes & Karaoke: Three Polite Levels');
      setPromptStyle('3d-shapes');
      setUseSeparateWordsJson(true);
    } else if (presetId === 'xun') {
      setRawTranscript(SAMPLE_XUN52000_TRANSCRIPT);
      setCustomTitle('Stop Saying Very (@xun52000 Word Reveal)');
      setRawSceneJson(JSON.stringify(SAMPLE_XUN52000_SCENE_JSON, null, 2));
      setPromptStyle('word-reveal-dark');
      setUseSeparateWordsJson(false);
    }
  };

  const handleTranscriptFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setRawTranscript(text);
    setErrorMsg(null);
    const parsed = parseTranscriptAuto(text);
    if (parsed.length > 0) {
      onApplyTranscript(parsed, customTitle);
    }
  };

  const parseTranscriptOrPlainLines = (text: string): TranscriptCue[] => {
    const parsed = parseTranscriptAuto(text);
    if (parsed.length > 0) return parsed;
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return [];
    let cursor = 0;
    return lines.map((line, idx) => {
      const wordsRaw = line.split(/\s+/).filter(Boolean);
      const dur = Math.max(1.8, Math.min(7.5, wordsRaw.length * 0.42 + 0.6));
      const start = Number(cursor.toFixed(2));
      const end = Number((cursor + dur).toFixed(2));
      cursor = end + 0.15;
      const wordDur = (end - start) / Math.max(1, wordsRaw.length);
      return {
        id: `cue-${idx + 1}`,
        start,
        end,
        text: line,
        words: wordsRaw.map((w, wi) => ({
          word: w,
          start: Number((start + wi * wordDur).toFixed(3)),
          end: Number((start + (wi + 1) * wordDur).toFixed(3)),
        })),
      };
    });
  };

  const handleGenerateInlineAudioAndSync = async () => {
    if (isGeneratingInlineAudio) return;
    setErrorMsg(null);
    setInlineTtsNotice(null);
    setIsGeneratingInlineAudio(true);
    setInlineTtsProgress(3);
    setInlineTtsStageLabel('Đang khởi tạo tác vụ đọc TTS...');
    try {
      const selectedVoiceObj = inlineAvailableVoices.find((v) => v.id === inlineVoice);
      const secondaryVoiceObj = inlineAvailableVoices.find((v) => v.id === inlineSecondaryVoice);
      const baseTtsParams = {
        rawScript: rawTranscript,
        title: customTitle || project.title,
        provider: inlineProvider,
        voice: inlineVoice,
        lang: selectedVoiceObj?.lang || 'en-US',
        secondaryVoice: inlineSecondaryVoice || undefined,
        secondaryLang: secondaryVoiceObj?.lang || 'vi-VN',
        autoSplitLanguages: true,
        singleVoiceMultilingual: isMultilingualVoiceId(inlineVoice),
        rate: inlineRate,
        alignWithWhisper: inlineWhisperSync,
      };
      const applyTtsSyncResult = (res: Awaited<ReturnType<typeof synthesizeAudioAndSyncCues>>) => {
        if (res.blockTranscript) {
          setRawTranscript(res.blockTranscript);
        }
        setInlineGeneratedSrt(res.srt);
        if (onApplyAudioAndCues) {
          onApplyAudioAndCues(res.audioFile, res.cues, customTitle);
        } else {
          onUploadAudio(res.audioFile);
          if (res.cues.length > 0) {
            onApplyTranscript(res.cues, customTitle);
          }
        }
        setInlineTtsNotice(
          `Đã xuất Audio (${res.durationSec.toFixed(1)}s · ${res.providerUsed}) và tự đồng bộ lại toàn bộ ${res.cues.length} mốc Sub khớp 100% với Audio${res.whisperAligned ? ' (đã căn từng từ)' : ''}.`,
        );
      };

      const res = await synthesizeAudioAndSyncCues({
        ...baseTtsParams,
        onProgress: (pct, label) => {
          setInlineTtsProgress(pct);
          setInlineTtsStageLabel(label);
        },
      });
      applyTtsSyncResult(res);

      if (res.edgeFallbackToGoogle) {
        notifyEdgeFallbackToGoogle({
          id: 'automation-edge-fallback',
          sourceLabel: 'Automation Studio',
          edgeErrors: res.edgeErrors,
          onRetryEdge: async () => {
            const retried = await synthesizeAudioAndSyncCues({
              ...baseTtsParams,
              provider: 'edge',
              strictProvider: true,
            });
            applyTtsSyncResult(retried);
          },
        });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể xuất Audio TTS từ Sub.');
    } finally {
      setIsGeneratingInlineAudio(false);
      setInlineTtsProgress(0);
      setInlineTtsStageLabel('');
    }
  };

  const handleRunResync = async (mode: 'fast-forced' | 'whisper') => {
    if (!onResyncCuesToAudio || isResyncingTiming) return;
    setErrorMsg(null);
    setInlineTtsNotice(null);
    setIsResyncingTiming(true);
    setResyncProgress(6);
    setResyncStageLabel(
      mode === 'fast-forced'
        ? 'Đang khớp nhịp Audio ↔ Sub & Karaoke (Fast Forced Align)...'
        : 'Đang phân tích giọng nói bằng Whisper AI để khớp Sub...',
    );
    try {
      const res = await onResyncCuesToAudio(mode, {
        resyncVisuals: true,
        onProgress: (pct, lbl) => {
          setResyncProgress(pct);
          setResyncStageLabel(lbl);
        },
      });
      if (res) {
        if (res.blockTranscript) setRawTranscript(res.blockTranscript);
        if (res.srt) setInlineGeneratedSrt(res.srt);
        setInlineTtsNotice(
          `Đã khớp lại ${res.cueCount} mốc Sub & Karaoke theo Audio (${res.backendUsed}).`,
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể khớp lại timestamp theo Audio.');
    } finally {
      setIsResyncingTiming(false);
      setResyncProgress(0);
      setResyncStageLabel('');
    }
  };

  const handleCommitTranscriptAndGoPrompt = () => {
    const parsed = parseTranscriptOrPlainLines(rawTranscript);
    if (parsed.length === 0) {
      setErrorMsg(
        'Hãy dán Transcript (có timestamp SRT/VTT/Block HOẶC mỗi câu 1 dòng để xuất Audio TTS).',
      );
      return;
    }
    setErrorMsg(null);
    onApplyTranscript(parsed, customTitle);
    setStep(2);
  };

  const handleCopyPrompt = async () => {
    if (liveTranscriptCues.length > 0 && project.cues.length !== liveTranscriptCues.length) {
      onApplyTranscript(liveTranscriptCues, customTitle);
    }
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch {
      setCopiedPrompt(false);
    }
  };

  const handleClampJsonSegmentsToAudio = () => {
    if (!parsedPreviewPlan || !audioDurationSec || audioDurationSec <= 0.2) return;
    const clampedPlan = clampStoryboardPlanToAudioDuration(parsedPreviewPlan, audioDurationSec);
    setRawSceneJson(JSON.stringify(clampedPlan, null, 2));
    setErrorMsg(null);
    setRenderNotice(
      `Đã tự co khớp các mốc segment cuối về đúng thời lượng Audio (${audioDurationSec.toFixed(2)}s).`,
    );
  };

  const parseInputsForRender = (): {
    words: WordTiming[];
    plan: ScenePlanDocument;
    title: string;
    cuesOverride?: TranscriptCue[];
    summary: ReturnType<typeof summarizeScenePlan>;
  } | null => {
    const rawPlan = parseScenePlanJson(rawSceneJson);
    if (!rawPlan || rawPlan.scenes.length === 0) {
      setErrorMsg(
        'Không đọc được JSON từ AI. Hãy đảm bảo đoạn dán chứa object JSON có "scenes" hoặc "elements".',
      );
      return null;
    }
    const plan =
      typeof audioDurationSec === 'number' && audioDurationSec > 0.2
        ? clampStoryboardPlanToAudioDuration(rawPlan, audioDurationSec)
        : rawPlan;

    if (useSeparateWordsJson) {
      const words = parseWordLevelJson(rawWordsJson);
      if (words.length === 0) {
        setErrorMsg('words.json không hợp lệ hoặc thiếu danh sách "words".');
        return null;
      }
      setErrorMsg(null);
      return {
        words,
        plan,
        title: customTitle,
        summary: summarizeScenePlan(plan, project.cues),
      };
    }

    const rawCues = liveTranscriptCues.length > 0 ? liveTranscriptCues : project.cues;
    if (rawCues.length === 0) {
      setErrorMsg('Hãy nhập Transcript ở Bước 1 trước khi Render.');
      setStep(1);
      return null;
    }
    const cues =
      typeof audioDurationSec === 'number' && audioDurationSec > 0.2
        ? clampCuesToAudioDuration(rawCues, audioDurationSec)
        : rawCues;
    const nextTitle = (plan as { title?: string }).title?.trim() || customTitle;
    if ((plan as { title?: string }).title?.trim()) {
      setCustomTitle(nextTitle);
    }
    const words = cues.flatMap((c) => c.words);
    setErrorMsg(null);
    return {
      words,
      plan,
      title: nextTitle,
      cuesOverride: cues,
      summary: summarizeScenePlan(plan, cues),
    };
  };

  const handleApplyPreviewOnly = () => {
    const prepared = parseInputsForRender();
    if (!prepared) return;
    onApplyScenePlan(prepared.words, prepared.plan, prepared.title, prepared.cuesOverride);
    const report = (prepared.plan as { durationReport?: { metMinimum?: boolean; targetMinutes?: number; estimatedMinutes?: number; shortfallReason?: string } }).durationReport;
    const shortfallWarn =
      report && !report.metMinimum && report.shortfallReason
        ? ` ⚠️ AI báo chưa đạt tối thiểu ${report.targetMinutes ?? '?'}p (ước tính ~${report.estimatedMinutes ?? '?'}p): ${report.shortfallReason}`
        : '';
    setRenderNotice(
      `Đã cập nhật xem trước 9:16 với ${prepared.summary.elementCount} lớp chữ/minh họa + ${prepared.summary.cueCount} phụ đề karaoke.${shortfallWarn}`,
    );
  };

  const handleRenderAndDownloadVideo = async () => {
    if (isExportingVideo) return;
    const prepared = parseInputsForRender();
    if (!prepared) return;
    setRenderNotice(null);
    const result = await onApplyAndRenderVideo(
      prepared.words,
      prepared.plan,
      prepared.title,
      prepared.cuesOverride,
    );
    if (result) {
      const mb = (result.byteLength / (1024 * 1024)).toFixed(2);
      setRenderNotice(
        `Đã render xong file ${result.fileName} vào thư mục output/ (${mb} MB, ${result.width}×${result.height} @ ${result.fps}fps · ${result.qualityLabel}${audioFileName ? ' · có tiếng' : ''}).`,
      );
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Main 3-Step Automated Pipeline Card */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
        {/* Top Header + Quick Demo Presets */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Quy trình tự động bằng AI Prompt
            </h2>
            <p className="text-xs text-slate-500">
              Nhập Audio &amp; Transcript → Tạo Prompt gửi ChatGPT/Gemini → Dán JSON để Render
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleLoadPreset('jp-en')}
              className={`px-2.5 py-1.5 text-[11px] font-medium rounded-lg border transition-colors whitespace-nowrap ${
                project.id === 'preset-jp-en-polite'
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Mẫu Nhật-Anh 1:42
            </button>
            <button
              type="button"
              onClick={() => handleLoadPreset('water')}
              className={`px-2.5 py-1.5 text-[11px] font-medium rounded-lg border transition-colors whitespace-nowrap ${
                project.id === 'preset-water-polite'
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Can / Could
            </button>
            <button
              type="button"
              onClick={() => handleLoadPreset('3d')}
              className={`px-2.5 py-1.5 text-[11px] font-medium rounded-lg border transition-colors whitespace-nowrap ${
                project.id === 'preset-3d-shapes'
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              3D Shapes
            </button>
            <button
              type="button"
              onClick={() => handleLoadPreset('xun')}
              className={`px-2.5 py-1.5 text-[11px] font-medium rounded-lg border transition-colors whitespace-nowrap ${
                project.id === 'preset-xun52000-dark'
                  ? 'bg-slate-800 border-slate-700 text-yellow-300'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              ⚡ @xun52000 Dark
            </button>
          </div>
        </div>

        {/* 3-Step Selector Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 bg-slate-50 border-b border-slate-200">
          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              setStep(1);
            }}
            className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-colors ${
              step === 1
                ? 'bg-white border-indigo-300 shadow-xs text-slate-900'
                : 'bg-transparent border-transparent text-slate-600 hover:bg-white/70'
            }`}
          >
            <div>
              <div className="text-[11px] font-semibold text-indigo-600">Bước 1</div>
              <div className="text-xs font-semibold truncate">Audio &amp; Transcript</div>
            </div>
            <span className="text-[11px] font-mono text-slate-500 tabular-nums">
              {activeCues.length} câu
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              setStep(2);
            }}
            className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-colors ${
              step === 2
                ? 'bg-white border-indigo-300 shadow-xs text-slate-900'
                : 'bg-transparent border-transparent text-slate-600 hover:bg-white/70'
            }`}
          >
            <div>
              <div className="text-[11px] font-semibold text-indigo-600">Bước 2 · Xương sống</div>
              <div className="text-xs font-semibold truncate">Tạo Prompt AI</div>
            </div>
            <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              setStep(3);
            }}
            className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-colors ${
              step === 3
                ? 'bg-white border-indigo-300 shadow-xs text-slate-900'
                : 'bg-transparent border-transparent text-slate-600 hover:bg-white/70'
            }`}
          >
            <div>
              <div className="text-[11px] font-semibold text-indigo-600">Bước 3</div>
              <div className="text-xs font-semibold truncate">Dán JSON &amp; Render</div>
            </div>
            <FileJson className="w-4 h-4 text-indigo-500 shrink-0" />
          </button>
        </div>

        {/* Step Content */}
        <div className="p-5 space-y-4">
          {step === 1 && (
            <>
              {/* Audio Input + Inline TTS Synthesis (No upfront audio file required) */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                      <FileAudio className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {audioFileName
                          ? `Audio đã nạp: ${audioFileName}`
                          : '1. Audio giọng đọc (Tải file lên HOẶC Xuất trực tiếp từ Sub bên dưới)'}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Không bắt buộc có sẵn audio — có thể nhập Sub trước rồi bấm Xuất Audio &amp; Sync Sub như English Reels
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <input
                      ref={audioInputRef}
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onUploadAudio(f);
                      }}
                    />
                    <button
                      type="button"
                      onClick={onOpenAudioSubtitleStudio}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
                    >
                      <Mic className="w-3.5 h-3.5" />
                      <span>Bóc Sub Video / Dịch Song Ngữ</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => audioInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5 text-indigo-600" />
                      <span>{audioFileName ? 'Đổi Audio' : 'Nạp file Audio'}</span>
                    </button>
                    {audioFileName && (
                      <button
                        type="button"
                        onClick={onClearAudio}
                        className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-red-600 border border-slate-200 rounded-lg bg-white"
                      >
                        Xóa
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline TTS Bar like English Reels Studio */}
                <div className="pt-2.5 border-t border-slate-200/80 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Chọn nhà cung cấp TTS"
                      value={inlineProvider}
                      onChange={(e) => setInlineProvider(e.target.value)}
                      className="min-w-[165px] px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    >
                      <option value="auto">Tự động miễn phí (Edge → Google)</option>
                      {!ttsProviders.some((p) => p.id === 'edge') && (
                        <option value="edge">Microsoft Edge Neural TTS (Miễn phí · Chất lượng cao)</option>
                      )}
                      {ttsProviders.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Chọn giọng đọc TTS"
                      value={inlineVoice}
                      onChange={(e) => setInlineVoice(e.target.value)}
                      className="flex-1 min-w-[160px] px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    >
                      {inlineAvailableVoices.length === 0 ? (
                        <option value="en-US-JennyNeural">Edge TTS — Jenny (English US)</option>
                      ) : (
                        inlineAvailableVoices.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.label} ({v.lang})
                          </option>
                        ))
                      )}
                    </select>
                    <select
                      aria-label="Chọn giọng đọc phụ cho giải thích (TTS 2)"
                      value={inlineSecondaryVoice}
                      onChange={(e) => setInlineSecondaryVoice(e.target.value)}
                      title="Giọng 2 tự dùng khi câu có giải thích song ngữ (Việt / Nhật / Anh...)"
                      className="min-w-[155px] px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    >
                      <option value="">Tự chọn giọng giải thích</option>
                      <option value="vi-VN-HoaiMyNeural">Giải thích: Tiếng Việt (Hoài My)</option>
                      <option value="vi-VN-NamMinhNeural">Giải thích: Tiếng Việt (Nam Minh)</option>
                      <option value="en-US-JennyNeural">Giải thích: English (Jenny)</option>
                      <option value="ja-JP-NanamiNeural">Giải thích: 日本語 (Nanami)</option>
                    </select>
                    <select
                      aria-label="Tốc độ đọc TTS"
                      value={inlineRate}
                      onChange={(e) => setInlineRate(Number(e.target.value))}
                      className="px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    >
                      <option value={0.85}>0.85x (Chậm)</option>
                      <option value={0.95}>0.95x</option>
                      <option value={1.0}>1.0x (Chuẩn)</option>
                      <option value={1.1}>1.1x</option>
                      <option value={1.2}>1.2x (Nhanh)</option>
                    </select>
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer px-1">
                      <input
                        type="checkbox"
                        checked={inlineWhisperSync}
                        onChange={(e) => setInlineWhisperSync(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600"
                      />
                      <span>Whisper Sync Sub</span>
                    </label>
                    <button
                      type="button"
                      disabled={isGeneratingInlineAudio}
                      onClick={() => void handleGenerateInlineAudioAndSync()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                      {isGeneratingInlineAudio ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {isGeneratingInlineAudio
                          ? `Đang xuất ${inlineTtsProgress}%...`
                          : 'Xuất Audio & Sync Sub'}
                      </span>
                    </button>
                  </div>

                  {inlineProvider === 'elevenlabs' && (
                    <ApiKeyInlineControl
                      provider="elevenlabs"
                      hasServerKey={hasElevenLabsKey}
                      onSaved={refreshTtsVoices}
                      compact
                    />
                  )}

                  {isGeneratingInlineAudio && (
                    <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-medium text-emerald-900">
                        <span className="truncate">{inlineTtsStageLabel || 'Đang tổng hợp Audio TTS...'}</span>
                        <span className="font-mono tabular-nums shrink-0 ml-2">{inlineTtsProgress}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-emerald-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 transition-all duration-200"
                          style={{ width: `${Math.max(4, inlineTtsProgress)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {audioUrl && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <audio controls src={audioUrl} className="flex-1 min-w-[200px] h-8" />
                    <a
                      href={audioUrl}
                      download={cleanDownloadFileName(
                        customTitle || project.title || audioFileName || 'Audio',
                        'mp3',
                        'Audio',
                      )}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 bg-white border border-emerald-200 rounded-lg hover:bg-emerald-50"
                    >
                      <Download className="w-3 h-3" />
                      <span>Tải .MP3</span>
                    </a>
                    {inlineGeneratedSrt && (
                      <button
                        type="button"
                        onClick={() => {
                          const blob = new Blob([inlineGeneratedSrt], {
                            type: 'text/plain;charset=utf-8',
                          });
                          const u = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = u;
                          a.download = cleanDownloadFileName(
                            customTitle || project.title || 'Subtitles',
                            'srt',
                            'Subtitles',
                          );
                          a.click();
                          setTimeout(() => URL.revokeObjectURL(u), 3000);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50"
                      >
                        <Download className="w-3 h-3" />
                        <span>Tải .SRT mới</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Audio ↔ Subtitle / Karaoke Resync & Fine-Tune Bar */}
                {(audioFile || project.cues.length > 0) && (onResyncCuesToAudio || onAdjustTiming) && (
                  <div className="pt-2 border-t border-slate-200/80 space-y-2">
                    {(() => {
                      const cuesEnd = project.cues.reduce((mx, c) => Math.max(mx, c.end), 0);
                      const driftSec =
                        audioDurationSec && cuesEnd > 0 ? audioDurationSec - cuesEnd : 0;
                      const hasNoticeableDrift = Math.abs(driftSec) > 0.8;
                      return (
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                          <span className="font-semibold text-slate-700">
                            Khớp Sub &amp; tốc độ Karaoke với Audio
                          </span>
                          <span
                            className={`font-mono tabular-nums ${
                              hasNoticeableDrift ? 'text-amber-700 font-semibold' : 'text-slate-500'
                            }`}
                          >
                            {audioDurationSec
                              ? `Audio: ${audioDurationSec.toFixed(1)}s · Sub: ${cuesEnd.toFixed(1)}s`
                              : `Sub kết thúc: ${cuesEnd.toFixed(1)}s`}
                            {hasNoticeableDrift
                              ? ` (lệch ${driftSec > 0 ? '+' : ''}${driftSec.toFixed(1)}s)`
                              : ''}
                          </span>
                        </div>
                      );
                    })()}

                    <div className="flex flex-wrap items-center gap-1.5">
                      {audioFile && onResyncCuesToAudio && (
                        <>
                          <button
                            type="button"
                            disabled={isResyncingTiming || isGeneratingInlineAudio}
                            onClick={() => void handleRunResync('fast-forced')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                            title="Dùng cho Audio AI / đọc đúng kịch bản (nhanh dưới 0.5s)"
                          >
                            {isResyncingTiming ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Sparkles className="w-3 h-3" />
                            )}
                            <span>Khớp nhanh Audio ↔ Sub</span>
                          </button>
                          <button
                            type="button"
                            disabled={isResyncingTiming || isGeneratingInlineAudio}
                            onClick={() => void handleRunResync('whisper')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 disabled:opacity-50"
                            title="Dùng khi audio thu ngoài / lệch lời / cần nhận diện từng từ bằng AI"
                          >
                            <Mic className="w-3 h-3" />
                            <span>Khớp bằng Whisper AI</span>
                          </button>
                        </>
                      )}

                      {onAdjustTiming && audioDurationSec && audioDurationSec > 0.5 && (
                        <button
                          type="button"
                          onClick={() =>
                            onAdjustTiming({
                              targetDurationSec: audioDurationSec,
                              resyncVisuals: true,
                            })
                          }
                          className="px-2 py-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100"
                          title="Co giãn đều toàn bộ Sub & Karaoke khớp tổng thời lượng file Audio"
                        >
                          Khớp đúng {audioDurationSec.toFixed(1)}s Audio
                        </button>
                      )}

                      {onAdjustTiming && (
                        <div className="flex flex-wrap items-center gap-1 ml-auto">
                          <span className="text-[10px] text-slate-500 mr-0.5">Dịch mốc:</span>
                          {([-200, -50, 50, 200] as const).map((ms) => (
                            <button
                              key={ms}
                              type="button"
                              onClick={() => onAdjustTiming({ offsetMs: ms, resyncVisuals: true })}
                              className="px-1.5 py-0.5 text-[10px] font-mono bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-700"
                            >
                              {ms > 0 ? `+${ms}ms` : `${ms}ms`}
                            </button>
                          ))}
                          <span className="text-[10px] text-slate-500 ml-1 mr-0.5">Tốc độ:</span>
                          <button
                            type="button"
                            onClick={() => onAdjustTiming({ speedFactor: 0.95, resyncVisuals: true })}
                            className="px-1.5 py-0.5 text-[10px] font-mono bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-700"
                            title="Chạy chữ nhanh hơn 5% (thu ngắn thời lượng)"
                          >
                            0.95x
                          </button>
                          <button
                            type="button"
                            onClick={() => onAdjustTiming({ speedFactor: 1.05, resyncVisuals: true })}
                            className="px-1.5 py-0.5 text-[10px] font-mono bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-700"
                            title="Chạy chữ chậm lại 5% (kéo giãn thời lượng)"
                          >
                            1.05x
                          </button>
                        </div>
                      )}
                    </div>

                    {isResyncingTiming && (
                      <div className="p-2 rounded-lg bg-indigo-50 border border-indigo-200 space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-medium text-indigo-900">
                          <span className="truncate">{resyncStageLabel}</span>
                          <span className="font-mono tabular-nums">{resyncProgress}%</span>
                        </div>
                        <div className="w-full h-1 bg-indigo-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-600 transition-all duration-150"
                            style={{ width: `${Math.max(5, resyncProgress)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {inlineTtsNotice && (
                  <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 font-medium">
                    {inlineTtsNotice}
                  </p>
                )}
              </div>

              {/* Title + Transcript Input */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label
                    htmlFor="pipeline-title-input"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Tên bài giảng
                  </label>
                  <input
                    id="pipeline-title-input"
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="VD: Can / Could / May — Giao tiếp lịch sự"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRawTranscript(SAMPLE_JP_EN_TRANSCRIPT);
                      setCustomTitle('水が欲しい時、CanとCouldどっち？');
                      setErrorMsg(null);
                    }}
                    className="flex-1 px-3 py-2 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors whitespace-nowrap"
                  >
                    Nạp mẫu Nhật-Anh
                  </button>
                  <button
                    type="button"
                    onClick={() => transcriptInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>File</span>
                  </button>
                  <input
                    ref={transcriptInputRef}
                    type="file"
                    accept=".txt,.srt,.vtt,.json"
                    className="hidden"
                    onChange={handleTranscriptFile}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label
                    htmlFor="pipeline-transcript-input"
                    className="text-xs font-medium text-slate-700"
                  >
                    2. Nội dung Sub / Kịch bản (dán SRT/VTT/Block HOẶC gõ mỗi câu 1 dòng rồi bấm Xuất Audio)
                  </label>
                  <div className="flex items-center gap-2 shrink-0">
                    <PasteButton
                      onPaste={(txt) => {
                        setRawTranscript(txt);
                        setErrorMsg(null);
                      }}
                      title="Dán nhanh kịch bản / SRT mới (thay thế trực tiếp)"
                    />
                    <span className="text-[11px] font-medium text-emerald-700 tabular-nums whitespace-nowrap">
                      Nhận diện: {liveTranscriptCues.length || rawTranscript.split(/\r?\n/).filter((l) => l.trim()).length} câu
                    </span>
                  </div>
                </div>
                <textarea
                  id="pipeline-transcript-input"
                  rows={8}
                  value={rawTranscript}
                  onChange={(e) => {
                    setRawTranscript(e.target.value);
                    setErrorMsg(null);
                  }}
                  placeholder={'Dán SRT / timestamp 00:00:00.000 HOẶC gõ từng câu (mỗi câu 1 dòng):\nStop saying very tired.\nInstead, try saying I am exhausted.'}
                  className="w-full p-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed"
                />
              </div>

              {errorMsg && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">
                  {errorMsg}
                </p>
              )}

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const parsed = parseTranscriptOrPlainLines(rawTranscript);
                    if (parsed.length > 0) onApplyTranscript(parsed, customTitle);
                  }}
                  className="px-4 py-2.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Dựng nhanh không cần AI
                </button>
                <button
                  type="button"
                  onClick={handleCommitTranscriptAndGoPrompt}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Tạo Prompt cho ChatGPT / Gemini</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xs font-semibold text-slate-900">
                      Prompt Storyboard v1.9 · {activeCues.length} segments · {activeVectorCount} component trong Kho
                    </h3>
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded">
                      Đa Scene + sync_anchor
                    </span>
                    {typeof audioDurationSec === 'number' && audioDurationSec > 0 && activeCues.length > 0 && (
                      <span className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 text-slate-700 border border-slate-200 rounded tabular-nums">
                        Audio {audioDurationSec.toFixed(2)}s / Transcript {activeCues[activeCues.length - 1].end.toFixed(2)}s
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Chuẩn 5 tầng: giữ nguyên văn source_segments, chia nhiều scene sư phạm, neo thời gian sync_anchor và chống chồng hình — sao chép dán vào ChatGPT/Gemini → dán JSON sang Bước 3.
                  </p>
                </div>

                {/* Template selector */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPromptStyle('tiktok-cards')}
                    className={`px-3 py-1.5 text-[11px] font-medium rounded-lg border transition-colors ${
                      promptStyle === 'tiktok-cards'
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Dàn cảnh tự động (@168)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPromptStyle('3d-shapes')}
                    className={`px-3 py-1.5 text-[11px] font-medium rounded-lg border transition-colors ${
                      promptStyle === '3d-shapes'
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Ưu tiên Khối 3D
                  </button>
                  <button
                    type="button"
                    onClick={() => setPromptStyle('word-reveal-dark')}
                    className={`px-3 py-1.5 text-[11px] font-medium rounded-lg border transition-colors ${
                      promptStyle === 'word-reveal-dark'
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Ưu tiên Word Reveal (@xun52000)
                  </button>
                  <label className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                    <span>Thời lượng (phút):</span>
                    <select
                      aria-label="Thời lượng render mục tiêu (phút)"
                      value={String(targetDurationMinutes)}
                      onChange={(e) => setTargetDurationMinutes(Number(e.target.value) || 1)}
                      className="bg-transparent font-semibold text-indigo-700 focus:outline-none"
                    >
                      <option value="0.5">0.5p</option>
                      <option value="1">1p</option>
                      <option value="2">2p</option>
                      <option value="3">3p</option>
                      <option value="5">5p</option>
                      <option value="10">10p</option>
                      <option value="15">15p</option>
                      <option value="20">20p</option>
                      <option value="25">25p</option>
                      <option value="30">30p</option>
                    </select>
                  </label>
                </div>
              </div>

              {/* Composition picker — only for tiktok-cards */}
              {promptStyle === 'tiktok-cards' && (
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                      <label
                        htmlFor="step2-composition-select"
                        className="text-[11px] font-semibold text-slate-700 whitespace-nowrap"
                      >
                        Cách phối minh họa:
                      </label>
                      {/* Mode tabs */}
                      <div className="flex flex-wrap gap-1">
                        {(['ai-decide', 'manual', 'custom', 'random'] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setCompositionMode(m)}
                            className={`px-2 py-0.5 text-[10px] font-medium rounded border transition-colors ${
                              compositionMode === m
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                            }`}
                          >
                            {m === 'ai-decide'
                              ? '✨ AI chọn'
                              : m === 'random'
                                ? '🔀 Ngẫu nhiên'
                                : m === 'custom'
                                  ? '🎨 Tự sáng tạo'
                                  : 'Thủ công'}
                          </button>
                        ))}
                      </div>
                      {/* Manual dropdown */}
                      {compositionMode === 'manual' && (
                        <select
                          id="step2-composition-select"
                          value={project.compositionId ?? 'story-scenes'}
                          onChange={(e) => onChangeComposition(e.target.value as LayoutCompositionId)}
                          className="flex-1 min-w-0 px-2 py-1 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          {LAYOUT_COMPOSITIONS.map((comp) => (
                            <option key={comp.id} value={comp.id}>
                              {comp.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    {compositionMode === 'manual' && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={onRandomizeComposition}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 transition-colors whitespace-nowrap"
                        >
                          <Shuffle className="w-3 h-3" />
                          <span>Phối ngẫu nhiên</span>
                        </button>
                        {(project.compositionId === 'cartoon-host' ||
                          effectiveCompositionId === 'cartoon-host') &&
                          onOpenAnimationStudio && (
                            <button
                              type="button"
                              onClick={onOpenAnimationStudio}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-md hover:bg-violet-100 transition-colors whitespace-nowrap"
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>Mở Animation Studio (@Gimmys)</span>
                            </button>
                          )}
                      </div>
                    )}
                    {compositionMode === 'ai-decide' && (
                      <span className="text-[10px] text-violet-700">
                        ✨ AI phân tích context và tự chọn kiểu phối tối ưu + ghi lý do vào JSON
                      </span>
                    )}
                    {compositionMode === 'random' && (
                      <span className="text-[10px] text-orange-600">
                        🔀 Mỗi lần tạo prompt sẽ chọn ngẫu nhiên một kiểu phối
                      </span>
                    )}
                  </div>

                  {compositionMode === 'custom' && (
                    <div className="p-2.5 rounded-lg bg-white border border-indigo-200/80 space-y-2 text-[11px]">
                      <div className="px-2.5 py-1.5 rounded-md bg-indigo-50/70 border border-indigo-100 text-[10.5px] text-indigo-900">
                        <span className="font-semibold">AI tự sáng tạo theo ngữ cảnh:</span> Để trống các ô bên dưới để AI tự chọn Component từ Kho ({activeVectorCount}) và thiết kế <code className="font-mono">customPrimitives</code> sát từng câu thoại. Chỉ điền khi bạn muốn gợi ý/ép một mẫu riêng.
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label htmlFor="custom-comp-variant" className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                            Component ưu tiên từ Kho ({activeVectorCount})
                          </label>
                          <select
                            id="custom-comp-variant"
                            value={activeCustomConfig.variant}
                            onChange={(e) =>
                              updateCustomConfig({
                                ...activeCustomConfig,
                                variant: e.target.value as IllustrationVariant,
                              })
                            }
                            className="w-full px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded"
                          >
                            {vectorCatalog.map((c) => (
                              <option key={c.variant} value={c.variant}>
                                {c.label} ({c.category})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label htmlFor="custom-comp-icon" className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                            Biểu tượng gợi ý (tùy chọn)
                          </label>
                          <select
                            id="custom-comp-icon"
                            value={activeCustomConfig.sceneIcon || 'sparkles'}
                            onChange={(e) =>
                              updateCustomConfig({
                                ...activeCustomConfig,
                                sceneIcon: e.target.value as IllustrationSceneIcon,
                              })
                            }
                            className="w-full px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded"
                          >
                            {SCENE_ICON_KEYWORDS.map((ic) => (
                              <option key={ic.icon} value={ic.icon}>
                                {ic.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          aria-label="Tiêu đề component"
                          value={activeCustomConfig.title || ''}
                          onChange={(e) => updateCustomConfig({ ...activeCustomConfig, title: e.target.value })}
                          placeholder="Tiêu đề (tùy chọn — để trống cho AI)..."
                          className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded"
                        />
                        <input
                          type="text"
                          aria-label="Phụ đề component"
                          value={activeCustomConfig.subtitle || ''}
                          onChange={(e) => updateCustomConfig({ ...activeCustomConfig, subtitle: e.target.value })}
                          placeholder="Phụ đề (tùy chọn)..."
                          className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded"
                        />
                        <input
                          type="text"
                          aria-label="Từ khóa nhấn mạnh"
                          value={activeCustomConfig.highlightWord || ''}
                          onChange={(e) => updateCustomConfig({ ...activeCustomConfig, highlightWord: e.target.value })}
                          placeholder="Từ nhấn mạnh (tùy chọn)..."
                          className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                        <input
                          type="text"
                          aria-label="Nội dung thoại minh họa"
                          value={activeCustomConfig.speechText || ''}
                          onChange={(e) => updateCustomConfig({ ...activeCustomConfig, speechText: e.target.value })}
                          placeholder="Text gợi ý (tùy chọn)..."
                          className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded"
                        />
                        <input
                          type="text"
                          aria-label="Danh sách nhãn cách nhau dấu phẩy"
                          value={(activeCustomConfig.labels || []).join(', ')}
                          onChange={(e) =>
                            updateCustomConfig({
                              ...activeCustomConfig,
                              labels: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                            })
                          }
                          placeholder="Nhãn tùy chọn (để trống để AI nghĩ sát câu)..."
                          className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded"
                        />
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] font-medium text-slate-600 shrink-0">Màu nhấn:</label>
                          <input
                            type="color"
                            aria-label="Màu nhấn"
                            value={activeCustomConfig.accentColor || '#4F46E5'}
                            onChange={(e) => updateCustomConfig({ ...activeCustomConfig, accentColor: e.target.value })}
                            className="w-7 h-6 p-0.5 bg-white border border-slate-200 rounded cursor-pointer"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-700">
                          <label className="inline-flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={activeCustomConfig.showStrip !== false}
                              onChange={(e) => updateCustomConfig({ ...activeCustomConfig, showStrip: e.target.checked })}
                              className="rounded border-slate-300 text-indigo-600"
                            />
                            <span>Thanh đối chiếu</span>
                          </label>
                          <label className="inline-flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={activeCustomConfig.showSentenceCard !== false}
                              onChange={(e) => updateCustomConfig({ ...activeCustomConfig, showSentenceCard: e.target.checked })}
                              className="rounded border-slate-300 text-indigo-600"
                            />
                            <span>Thẻ câu nổi</span>
                          </label>
                          <label className="inline-flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(activeCustomConfig.showToneMeter)}
                              onChange={(e) => updateCustomConfig({ ...activeCustomConfig, showToneMeter: e.target.checked })}
                              className="rounded border-slate-300 text-indigo-600"
                            />
                            <span>Thanh sắc thái</span>
                          </label>
                        </div>

                        {onApplyCustomComposition && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onApplyCustomComposition(activeCustomConfig, 'active-cue')}
                              className="px-2.5 py-1 text-[10px] font-semibold bg-white border border-indigo-300 text-indigo-700 rounded hover:bg-indigo-50"
                            >
                              Áp dụng câu đang xem
                            </button>
                            <button
                              type="button"
                              onClick={() => onApplyCustomComposition(activeCustomConfig, 'all')}
                              className="px-2.5 py-1 text-[10px] font-semibold bg-indigo-600 text-white rounded hover:bg-indigo-700"
                            >
                              Áp dụng cả bài
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <textarea
                aria-label="Prompt sinh Scene JSON cho AI"
                readOnly
                rows={9}
                value={generatedPrompt}
                className="w-full p-3 text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none leading-relaxed text-slate-800"
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-3.5 py-2.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  ← Sửa Transcript
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyPrompt}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    {copiedPrompt ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedPrompt ? 'Đã sao chép Prompt!' : 'Sao chép Prompt cho AI'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-slate-800 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    <span>Dán JSON từ AI</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <label htmlFor="pipeline-scene-json" className="text-xs font-semibold text-slate-900">
                    Dán nguyên kết quả JSON từ ChatGPT / Gemini
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Tự động lọc bỏ dấu <code>```json</code> và tự đồng bộ với Audio + {activeCues.length} câu thoại.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <PasteButton
                    onPaste={(txt) => {
                      setRawSceneJson(txt);
                      setErrorMsg(null);
                      setRenderNotice(null);
                    }}
                    title="Dán nhanh JSON từ AI Web (thay thế nội dung cũ)"
                  />
                  <label className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 cursor-pointer whitespace-nowrap">
                    <Upload className="w-3 h-3" />
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
                        setUseSeparateWordsJson(false);
                        setRawSceneJson(txt);
                        setErrorMsg(null);
                        setRenderNotice(null);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setUseSeparateWordsJson(false);
                      setRawSceneJson(JSON.stringify(SAMPLE_JP_EN_SCENE_JSON, null, 2));
                      setErrorMsg(null);
                    }}
                    className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    Mẫu JSON Nhật-Anh
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUseSeparateWordsJson(false);
                      setRawSceneJson(JSON.stringify(SAMPLE_XUN52000_SCENE_JSON, null, 2));
                      setErrorMsg(null);
                    }}
                    className="text-[11px] font-medium text-amber-600 hover:text-amber-700"
                  >
                    Mẫu @xun52000 JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUseSeparateWordsJson(true);
                      setRawWordsJson(JSON.stringify(SAMPLE_WORDS_JSON, null, 2));
                      setRawSceneJson(JSON.stringify(SAMPLE_SCENE_PLAN, null, 2));
                      setErrorMsg(null);
                    }}
                    className="text-[11px] font-medium text-slate-600 hover:text-slate-900"
                  >
                    Mẫu 3D JSON
                  </button>
                </div>
              </div>

              <textarea
                id="pipeline-scene-json"
                rows={useSeparateWordsJson ? 5 : 7}
                value={rawSceneJson}
                onChange={(e) => {
                  setRawSceneJson(e.target.value);
                  setErrorMsg(null);
                  setRenderNotice(null);
                }}
                placeholder='Dán kết quả từ ChatGPT/Gemini vào đây (hỗ trợ cả ```json ... ```)...'
                className="w-full p-3 text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed"
              />

              {jsonPreviewSummary && validationReport && (
                <div className="space-y-2">
                  <div
                    className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs ${
                      validationReport.errors.length > 0
                        ? 'bg-red-50 border-red-200 text-red-800'
                        : validationReport.warnings.length > 0
                          ? 'bg-amber-50 border-amber-200 text-amber-900'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5 font-medium flex-wrap">
                      {validationReport.errors.length > 0 ? (
                        <XCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                      ) : validationReport.warnings.length > 0 ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      )}
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-white/80 border border-current/20">
                        {jsonPreviewSummary.schemaVersion === '1.9' ? 'Storyboard v1.9' : 'Legacy JSON'}
                      </span>
                      <span>
                        {jsonPreviewSummary.sceneCount} scene ·{' '}
                        {jsonPreviewSummary.schemaVersion === '1.9'
                          ? `${jsonPreviewSummary.sourceSegmentCount} source_segments · `
                          : ''}
                        {jsonPreviewSummary.elementCount} elements · {jsonPreviewSummary.cueCount} câu karaoke
                      </span>
                    </span>
                    <span className="text-[11px] opacity-80 truncate max-w-[240px]">
                      {validationReport.errors.length > 0
                        ? `${validationReport.errors.length} lỗi ngữ nghĩa`
                        : validationReport.warnings.length > 0
                          ? `${validationReport.warnings.length} cảnh báo`
                          : jsonPreviewSummary.types.slice(0, 4).join(', ')}
                    </span>
                  </div>

                  {(validationReport.errors.length > 0 || validationReport.warnings.length > 0) && (
                    <div
                      data-testid="storyboard-validator-issues"
                      className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-1.5 text-[11px]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] font-semibold text-slate-700">
                        <span>Kiểm tra ngữ nghĩa (Stage 4 Validator)</span>
                        <div className="flex items-center gap-2">
                          {typeof audioDurationSec === 'number' &&
                            audioDurationSec > 0.2 &&
                            [...validationReport.errors, ...validationReport.warnings].some(
                              (iss) => iss.code === 'SEGMENT_EXCEEDS_AUDIO',
                            ) && (
                              <button
                                type="button"
                                onClick={handleClampJsonSegmentsToAudio}
                                className="px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-900 border border-amber-300 rounded hover:bg-amber-200 transition-colors"
                              >
                                Khớp Segment theo Audio ({audioDurationSec.toFixed(2)}s)
                              </button>
                            )}
                          <span>
                            {validationReport.errors.length} lỗi · {validationReport.warnings.length} cảnh báo
                          </span>
                        </div>
                      </div>
                      <ul className="space-y-1 max-h-36 overflow-y-auto pr-1">
                        {[...validationReport.errors, ...validationReport.warnings]
                          .slice(0, 6)
                          .map((issue, idx) => (
                            <li
                              key={`${issue.code}-${issue.elementId || issue.segmentId || idx}`}
                              className={`flex items-start gap-1.5 px-2 py-1 rounded ${
                                issue.severity === 'error'
                                  ? 'bg-red-50/80 text-red-800'
                                  : 'bg-amber-50/80 text-amber-900'
                              }`}
                            >
                              <span className="font-mono text-[10px] font-semibold shrink-0">
                                [{issue.code}]
                              </span>
                              <span className="leading-snug">
                                {issue.elementId ? `${issue.elementId}: ` : issue.segmentId ? `${issue.segmentId}: ` : ''}
                                {issue.message}
                              </span>
                            </li>
                          ))}
                      </ul>
                      {validationReport.errors.length + validationReport.warnings.length > 6 && (
                        <p className="text-[10px] text-slate-500">
                          ...còn {validationReport.errors.length + validationReport.warnings.length - 6} mục khác (hệ thống tự chuẩn hóa alias icon / neo thời gian khi dựng).
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="inline-flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useSeparateWordsJson}
                    onChange={(e) => setUseSeparateWordsJson(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Tùy chọn: dùng file words.json riêng thay cho Transcript Bước 1</span>
                </label>
              </div>

              {useSeparateWordsJson && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-700">Dữ liệu words.json</span>
                    <PasteButton
                      onPaste={(txt) => setRawWordsJson(txt)}
                      title="Dán nhanh words.json (thay thế)"
                    />
                  </div>
                  <textarea
                    aria-label="words.json tùy chọn"
                    rows={4}
                    value={rawWordsJson}
                    onChange={(e) => setRawWordsJson(e.target.value)}
                    className="w-full p-2.5 text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              {/* MP4 Resolution, Quality & FPS Controls */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900">
                    Chất lượng &amp; Độ phân giải MP4
                  </span>
                  <span className="text-[11px] font-mono text-slate-600 tabular-nums">
                    {encoding.width}×{encoding.height} · {(encoding.videoBitrate / 1_000_000).toFixed(1)} Mbps · {encoding.fps}fps
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                  <div>
                    <label
                      htmlFor="pipeline-export-aspect"
                      className="block text-[11px] font-medium text-slate-600 mb-1"
                    >
                      Khung hình
                    </label>
                    <select
                      id="pipeline-export-aspect"
                      disabled={isExportingVideo}
                      value={mp4Settings.aspectRatio ?? '9:16'}
                      onChange={(e) =>
                        onChangeMp4Settings({
                          ...mp4Settings,
                          aspectRatio: e.target.value as Mp4ExportSettings['aspectRatio'],
                        })
                      }
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    >
                      <option value="9:16">9:16 · Dọc</option>
                      <option value="16:9">16:9 · Ngang</option>
                      <option value="1:1">1:1 · Vuông</option>
                      <option value="4:5">4:5 · Feed</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="pipeline-export-resolution"
                      className="block text-[11px] font-medium text-slate-600 mb-1"
                    >
                      Độ phân giải
                    </label>
                    <select
                      id="pipeline-export-resolution"
                      disabled={isExportingVideo}
                      value={mp4Settings.resolution}
                      onChange={(e) =>
                        onChangeMp4Settings({
                          ...mp4Settings,
                          resolution: e.target.value as Mp4ExportSettings['resolution'],
                        })
                      }
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    >
                      {RESOLUTION_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="pipeline-export-quality"
                      className="block text-[11px] font-medium text-slate-600 mb-1"
                    >
                      Chất lượng
                    </label>
                    <select
                      id="pipeline-export-quality"
                      disabled={isExportingVideo}
                      value={mp4Settings.quality}
                      onChange={(e) =>
                        onChangeMp4Settings({
                          ...mp4Settings,
                          quality: e.target.value as Mp4ExportSettings['quality'],
                        })
                      }
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    >
                      {QUALITY_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="pipeline-export-fps"
                      className="block text-[11px] font-medium text-slate-600 mb-1"
                    >
                      Khung hình (FPS)
                    </label>
                    <select
                      id="pipeline-export-fps"
                      disabled={isExportingVideo}
                      value={mp4Settings.fps}
                      onChange={(e) =>
                        onChangeMp4Settings({
                          ...mp4Settings,
                          fps: Number(e.target.value) as Mp4ExportSettings['fps'],
                        })
                      }
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    >
                      {FPS_OPTIONS.map((fpsVal) => (
                        <option key={fpsVal} value={fpsVal}>
                          {fpsVal} fps{fpsVal === 30 ? ' (Chuẩn)' : fpsVal === 60 ? ' (Mượt)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {parsedPreviewPlan?.durationReport &&
                !parsedPreviewPlan.durationReport.metMinimum &&
                parsedPreviewPlan.durationReport.shortfallReason && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                    ⚠️ <strong>AI báo chưa đạt thời lượng tối thiểu</strong> (
                    {parsedPreviewPlan.durationReport.estimatedMinutes ?? '?'}p /{' '}
                    {parsedPreviewPlan.durationReport.targetMinutes ?? '?'}p):{' '}
                    {parsedPreviewPlan.durationReport.shortfallReason}
                  </p>
                )}

              {(errorMsg || exportError) && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">
                  {errorMsg || exportError}
                </p>
              )}

              {isExportingVideo && (
                <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs font-medium text-indigo-800">
                    <span>{exportStageLabel || 'Đang render Video MP4...'}</span>
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums">{Math.round(exportProgress * 100)}%</span>
                      {onCancelExportVideo && (
                        <button
                          type="button"
                          onClick={onCancelExportVideo}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded"
                        >
                          <Square className="w-2.5 h-2.5 fill-current" />
                          <span>Hủy render</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-indigo-200/70 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 transition-all duration-150"
                      style={{ width: `${Math.round(exportProgress * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {renderNotice && !isExportingVideo && (
                <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg p-2.5 font-medium">
                  {renderNotice}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <button
                  type="button"
                  disabled={isExportingVideo}
                  onClick={() => setStep(2)}
                  className="px-3.5 py-2.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors"
                >
                  ← Quay lại Prompt
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isExportingVideo}
                    onClick={handleApplyPreviewOnly}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Nạp Thẻ &amp; Kịch bản từ JSON AI Web</span>
                  </button>
                  {isExportingVideo && onCancelExportVideo ? (
                    <button
                      type="button"
                      onClick={onCancelExportVideo}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-700 transition-colors"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>Hủy render</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isExportingVideo}
                      onClick={() => void handleRenderAndDownloadVideo()}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                    >
                      {isExportingVideo ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {isExportingVideo ? 'Đang render MP4...' : 'Render Video (.mp4)'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Bottom Compact Overview: Auto-synced Cues & AI Visual Beats (No manual design required) */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-xs font-semibold text-slate-900">
              Kịch bản AI đã đồng bộ ({visualTimelineItems.length} hiệu ứng chữ/ảnh · {project.cues.length} phụ đề)
            </h3>
            <p className="text-[11px] text-slate-500">
              Bấm vào bất kỳ mốc nào để xem ngay đoạn chuyển động đó trên khung {project.aspectRatio || '9:16'}
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenAdvancedEditor}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap"
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>Tinh chỉnh nâng cao</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-y-auto pr-1 max-h-[220px]">
          {(() => {
            const introSec = getEffectiveIntroSeconds(project);
            const lessonTime = Math.max(0, currentTime - introSec);
            return visualTimelineItems.map((el) => {
              const active = lessonTime >= el.startTime && lessonTime <= el.endTime;
              return (
                <button
                  key={el.id}
                  type="button"
                  onClick={() =>
                    onSeek(
                      introSec +
                        Math.min(
                          el.endTime - 0.05,
                          el.startTime + Math.min(0.28, (el.endTime - el.startTime) * 0.25),
                        ),
                    )
                  }
                  className={`text-left px-3 py-2 rounded-lg border transition-colors ${
                    active
                      ? 'bg-indigo-50/80 border-indigo-300'
                      : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 tabular-nums">
                    <span className="font-mono">
                      {formatTimeToken(el.startTime).slice(3, 8)} →{' '}
                      {formatTimeToken(el.endTime).slice(3, 8)}
                    </span>
                    <span className="text-[10px] font-medium text-indigo-600">{el.type}</span>
                  </div>
                  <div className="text-xs font-medium text-slate-900 truncate mt-0.5">
                    {el.label}
                  </div>
                </button>
              );
            });
          })()}
        </div>
      </section>
    </div>
  );
};
