import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, Database, Film, Layers, RotateCcw, Sparkles, X } from 'lucide-react';
import { AudioSubtitleStudioModal } from './components/AudioSubtitleStudioModal';
import { AutomationPipelinePanel, PresetId } from './components/AutomationPipelinePanel';
import { BatchQueueModal } from './components/BatchQueueModal';
import { CartoonAnimationStudioModal } from './components/CartoonAnimationStudioModal';
import { ComponentDatabaseModal } from './components/ComponentDatabaseModal';
import { EducationalStudioTab } from './components/EducationalStudioTab';
import { EnglishReelsTab } from './components/EnglishReelsTab';
import { GlobalOutputPanel, emitOutputUpdated } from './components/GlobalOutputPanel';
import { StageOverlayZone } from './components/InlinePreviewElementEditor';
import { StagePreview } from './components/StagePreview';
import { TimelineAndInspector } from './components/TimelineAndInspector';
import {
  DEFAULT_BGM_PRESET,
  DEFAULT_BGM_VOLUME,
  mixVoiceWithBgmPreset,
  StudioBgmPresetId,
} from './engine/audioMixHelper';
import {
  choreographFromTranscript,
  resyncProjectTimingToCues,
} from './engine/autoChoreographer';
import {
  getEffectiveIntroSeconds,
  getEffectiveOutroSeconds,
} from './engine/canvasRenderer';
import {
  syncCartoonAnimationsFromServer,
  upsertCartoonAnimation,
} from './engine/cartoonAnimationDb';
import { syncCustomComponentsFromServer } from './engine/customComponentStore';
import { buildVideoDescription, VideoDescriptionStyle } from './engine/videoDescriptionBuilder';
import { hydrateClientApiKeysFromServer } from './utils/apiKeysStore';
import { playExportCompleteSound } from './utils/soundEffects';
import {
  hydrateUserSettingsFromServer,
  loadPersistedSettings,
  PersistedStudioSettings,
  resetAllUserSettings,
  updatePersistedSettings,
  USER_SETTINGS_HYDRATED_EVENT,
  USER_SETTINGS_RESET_EVENT,
} from './utils/studioSettingsStore';
import {
  applyCustomComponentComposition,
  pickRandomComposition,
  recomposeProjectWithStyle,
} from './engine/illustrationLayouts';
import {
  DEFAULT_MP4_EXPORT_SETTINGS,
  Mp4ExportSettings,
  resolveMp4EncodingParams,
} from './engine/mp4Config';
import {
  ExportAbortedError,
  ExportVideoResult,
  exportProjectToVideo,
} from './engine/mp4Exporter';
import { cleanOutputTitleStem, TAB_OUTPUT_SUBFOLDERS } from './engine/outputNaming';
import {
  PRESET_3D_SHAPES_KARAOKE,
  PRESET_ED_PRONUNCIATION,
  PRESET_JP_EN_POLITE,
  PRESET_WATER_POLITE,
  PRESET_XUN52000_DARK,
} from './engine/demoPresets';
import { FlexibleSceneDocument, scenePlanToProject } from './engine/scenePlanAdapter';
import { adjustCuesTiming, cuesToBlockTranscript } from './engine/transcriptParser';
import { resyncCuesToAudioFile } from './engine/ttsSyncHelper';
import {
  BackgroundImageConfig,
  BackgroundPresetId,
  CanvasThemeId,
  CartoonAnimationParams,
  CustomComponentPresetConfig,
  ElementLayout,
  isDarkCanvasTheme,
  LayoutCompositionId,
  LessonProject,
  SceneElement,
  ScenePlanDocument,
  SubtitleDisplayConfig,
  TitleOverlayLayout,
  TranscriptCue,
  WatermarkOutroConfig,
  WordTiming,
} from './engine/types';

export default function App() {
  const [initialSavedSettings] = useState<PersistedStudioSettings>(() => loadPersistedSettings());
  const [activeTab, setActiveTab] = useState<'studio' | 'reels' | 'edu-studio'>(
    () => initialSavedSettings.activeTab || 'studio',
  );
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const [project, setProject] = useState<LessonProject>(() => {
    const s = initialSavedSettings.studio;
    if (!s) return PRESET_JP_EN_POLITE;
    const restoredBg: BackgroundImageConfig | undefined = s.backgroundPresetId
      ? {
          kind: 'preset',
          presetId: s.backgroundPresetId as BackgroundPresetId,
          fit: 'cover',
          scrimOpacity: 0.2,
          learningScrimOpacity:
            typeof s.learningScrimOpacity === 'number' ? s.learningScrimOpacity : 0.45,
        }
      : undefined;
    const base: LessonProject = {
      ...PRESET_JP_EN_POLITE,
      aspectRatio: s.aspectRatio || PRESET_JP_EN_POLITE.aspectRatio || '9:16',
      theme: s.theme || PRESET_JP_EN_POLITE.theme,
      compositionId: s.compositionId || PRESET_JP_EN_POLITE.compositionId,
      subtitleConfig: s.subtitleConfig,
      backgroundImage: restoredBg,
      watermark: s.watermark ?? PRESET_JP_EN_POLITE.watermark,
    };
    const recomposed =
      s.compositionId || s.theme
        ? recomposeProjectWithStyle(base, base.compositionId || 'story-scenes', { theme: base.theme })
        : base;
    return s.subtitleConfig
      ? { ...recomposed, subtitleConfig: s.subtitleConfig }
      : recomposed;
  });
  const [currentTime, setCurrentTime] = useState<number>(4.8);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedOverlayZone, setSelectedOverlayZone] = useState<StageOverlayZone | null>(null);
  const [animationStudioState, setAnimationStudioState] = useState<{
    isOpen: boolean;
    actionId?: string;
    spec?: Partial<CartoonAnimationParams>;
    elementId?: string;
  }>({ isOpen: false });
  const [isBatchModalOpen, setIsBatchModalOpen] = useState<boolean>(false);
  const [isComponentDbOpen, setIsComponentDbOpen] = useState<boolean>(false);
  const [isAudioSubStudioOpen, setIsAudioSubStudioOpen] = useState<boolean>(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState<boolean>(false);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioFileName, setAudioFileName] = useState<string | undefined>(undefined);
  const [audioDurationSec, setAudioDurationSec] = useState<number | null>(null);
  const [isExportingVideo, setIsExportingVideo] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportStageLabel, setExportStageLabel] = useState<string>('');
  const [exportError, setExportError] = useState<string | null>(null);
  const [lastExportSummary, setLastExportSummary] = useState<{
    fileName: string;
    savedPath?: string;
    outputCount: number;
    outputDir?: string;
  } | null>(null);
  const [mp4Settings, setMp4Settings] = useState<Mp4ExportSettings>(() => ({
    ...DEFAULT_MP4_EXPORT_SETTINGS,
    ...(initialSavedSettings.studio?.aspectRatio
      ? { aspectRatio: initialSavedSettings.studio.aspectRatio }
      : {}),
    ...(initialSavedSettings.studio?.resolution
      ? { resolution: initialSavedSettings.studio.resolution }
      : {}),
    ...(initialSavedSettings.studio?.quality
      ? { quality: initialSavedSettings.studio.quality }
      : {}),
    ...(initialSavedSettings.studio?.fps ? { fps: initialSavedSettings.studio.fps } : {}),
  }));
  const resolvedExport = resolveMp4EncodingParams(mp4Settings);
  const [customCompositionConfig, setCustomCompositionConfig] = useState<CustomComponentPresetConfig>({
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
  const [studioBgmPreset, setStudioBgmPreset] = useState<StudioBgmPresetId>(
    () => initialSavedSettings.studio?.bgmPreset || DEFAULT_BGM_PRESET,
  );
  const [studioBgmVolume, setStudioBgmVolume] = useState<number>(
    () => initialSavedSettings.studio?.bgmVolume ?? DEFAULT_BGM_VOLUME,
  );
  const [studioCustomBgmFile, setStudioCustomBgmFile] = useState<File | null>(null);
  const [studioDescriptionStyle, setStudioDescriptionStyle] = useState<VideoDescriptionStyle>(
    () => (initialSavedSettings.studio?.descriptionStyle as VideoDescriptionStyle) || 'auto',
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameTsRef = useRef<number | null>(null);
  const currentTimeRef = useRef<number>(currentTime);
  currentTimeRef.current = currentTime;
  const exportAbortControllerRef = useRef<AbortController | null>(null);

  // Sync playback loop (accounts for non-destructive Intro & Outro tails around voiceover audio)
  useEffect(() => {
    const introSec = getEffectiveIntroSeconds(project);
    const outroSec = getEffectiveOutroSeconds(project);
    const speechEndLimit =
      audioDurationSec && audioDurationSec > 0
        ? introSec + audioDurationSec
        : Math.max(introSec, project.duration - outroSec);

    if (!isPlaying) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      lastFrameTsRef.current = null;
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
      return;
    }

    if (audioRef.current && audioUrl) {
      if (currentTimeRef.current >= introSec && currentTimeRef.current < speechEndLimit - 0.04) {
        audioRef.current.currentTime = Math.max(0, currentTimeRef.current - introSec);
        audioRef.current.play().catch(() => {
          // Ignore autoplay restrictions
        });
      } else {
        if (!audioRef.current.paused) audioRef.current.pause();
        if (currentTimeRef.current < introSec) {
          audioRef.current.currentTime = 0;
        }
      }
    }

    const tick = (now: number) => {
      if (audioRef.current && audioUrl && !audioRef.current.paused) {
        lastFrameTsRef.current = now;
        const nextT = introSec + audioRef.current.currentTime;
        if (nextT >= project.duration) {
          currentTimeRef.current = 0;
          setCurrentTime(0);
          setIsPlaying(false);
          return;
        }
        currentTimeRef.current = nextT;
        setCurrentTime(nextT);
      } else {
        if (lastFrameTsRef.current === null) {
          lastFrameTsRef.current = now;
        }
        const dt = Math.min(0.1, Math.max(0, (now - lastFrameTsRef.current) / 1000));
        lastFrameTsRef.current = now;
        const next = currentTimeRef.current + dt;
        if (next >= project.duration) {
          currentTimeRef.current = 0;
          setCurrentTime(0);
          setIsPlaying(false);
          return;
        }
        currentTimeRef.current = next;
        setCurrentTime(next);

        if (
          audioRef.current &&
          audioUrl &&
          audioRef.current.paused &&
          next >= introSec &&
          next < speechEndLimit - 0.04
        ) {
          audioRef.current.currentTime = Math.max(0, next - introSec);
          audioRef.current.play().catch(() => {
            // Ignore autoplay restrictions
          });
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, project.duration, project.watermark, audioDurationSec, audioUrl]);

  useEffect(() => {
    void syncCustomComponentsFromServer();
    void syncCartoonAnimationsFromServer();
    void hydrateClientApiKeysFromServer();
    void hydrateUserSettingsFromServer();
  }, []);

  useEffect(() => {
    const onHydrated = (ev: Event) => {
      const s = (ev as CustomEvent<PersistedStudioSettings>).detail;
      if (!s) return;
      if (s.activeTab) setActiveTab(s.activeTab);
      if (s.studio) {
        setMp4Settings((prev) => ({
          ...prev,
          ...(s.studio?.aspectRatio ? { aspectRatio: s.studio.aspectRatio } : {}),
          ...(s.studio?.resolution ? { resolution: s.studio.resolution } : {}),
          ...(s.studio?.quality ? { quality: s.studio.quality } : {}),
          ...(s.studio?.fps ? { fps: s.studio.fps } : {}),
        }));
        setProject((prev) => {
          const nextTheme = s.studio?.theme || prev.theme;
          const nextComp = s.studio?.compositionId || prev.compositionId;
          const nextAspect = s.studio?.aspectRatio || prev.aspectRatio;
          const nextWm = s.studio?.watermark ?? prev.watermark;
          const nextSub = s.studio?.subtitleConfig ?? prev.subtitleConfig;
          const nextBg: BackgroundImageConfig | undefined = s.studio?.backgroundPresetId
            ? {
                kind: 'preset',
                presetId: s.studio.backgroundPresetId as BackgroundPresetId,
                fit: prev.backgroundImage?.fit || 'cover',
                scrimOpacity: prev.backgroundImage?.scrimOpacity ?? 0.2,
                learningScrimOpacity:
                  typeof s.studio.learningScrimOpacity === 'number'
                    ? s.studio.learningScrimOpacity
                    : prev.backgroundImage?.learningScrimOpacity ?? 0.45,
              }
            : prev.backgroundImage;
          const patched: LessonProject = {
            ...prev,
            aspectRatio: nextAspect,
            theme: nextTheme,
            compositionId: nextComp,
            subtitleConfig: nextSub,
            backgroundImage: nextBg,
            watermark: nextWm,
          };
          const recomposed =
            nextTheme !== prev.theme || nextComp !== prev.compositionId
              ? recomposeProjectWithStyle(patched, nextComp || 'story-scenes', { theme: nextTheme })
              : patched;
          const withSub = nextSub ? { ...recomposed, subtitleConfig: nextSub } : recomposed;
          const hydratedExtra =
            getEffectiveIntroSeconds(withSub) + getEffectiveOutroSeconds(withSub);
          return hydratedExtra > 0
            ? { ...withSub, duration: Number((withSub.duration + hydratedExtra).toFixed(2)) }
            : withSub;
        });
        if (s.studio.bgmPreset) setStudioBgmPreset(s.studio.bgmPreset);
        if (typeof s.studio.bgmVolume === 'number') setStudioBgmVolume(s.studio.bgmVolume);
        if (s.studio.descriptionStyle) {
          setStudioDescriptionStyle(s.studio.descriptionStyle as VideoDescriptionStyle);
        }
      }
    };
    const onReset = () => {
      setActiveTab('studio');
      setMp4Settings(DEFAULT_MP4_EXPORT_SETTINGS);
      setProject(PRESET_JP_EN_POLITE);
      setCurrentTime(4.8);
      setSelectedElementId(null);
      setStudioBgmPreset(DEFAULT_BGM_PRESET);
      setStudioBgmVolume(DEFAULT_BGM_VOLUME);
      setStudioCustomBgmFile(null);
      setStudioDescriptionStyle('auto');
      setIsConfirmingReset(false);
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
      activeTab,
      studio: {
        aspectRatio: mp4Settings.aspectRatio ?? '9:16',
        resolution: mp4Settings.resolution,
        quality: mp4Settings.quality,
        fps: mp4Settings.fps,
        theme: project.theme,
        compositionId: project.compositionId,
        subtitleConfig: project.subtitleConfig,
        backgroundPresetId:
          project.backgroundImage?.kind === 'preset' ? project.backgroundImage.presetId || '' : '',
        learningScrimOpacity: project.backgroundImage?.learningScrimOpacity,
        watermark: project.watermark,
        bgmPreset: studioBgmPreset,
        bgmVolume: studioBgmVolume,
        descriptionStyle: studioDescriptionStyle,
      },
    });
  }, [
    activeTab,
    mp4Settings.aspectRatio,
    mp4Settings.resolution,
    mp4Settings.quality,
    mp4Settings.fps,
    project.theme,
    project.compositionId,
    project.subtitleConfig,
    project.backgroundImage,
    project.watermark,
    studioBgmPreset,
    studioBgmVolume,
    studioDescriptionStyle,
  ]);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const handleSelectPreset = useCallback((presetId: PresetId) => {
    setIsPlaying(false);
    const next =
      presetId === 'jp-en'
        ? PRESET_JP_EN_POLITE
        : presetId === 'water'
          ? PRESET_WATER_POLITE
          : presetId === 'ed'
            ? PRESET_ED_PRONUNCIATION
            : presetId === 'xun'
              ? PRESET_XUN52000_DARK
              : PRESET_3D_SHAPES_KARAOKE;
    let nextIntroOffset = 0;
    setProject((prev) => {
      nextIntroOffset = getEffectiveIntroSeconds(prev);
      const extraSec = nextIntroOffset + getEffectiveOutroSeconds(prev);
      return {
        ...next,
        duration: Number((next.duration + extraSec).toFixed(2)),
        aspectRatio: prev.aspectRatio ?? mp4Settings.aspectRatio ?? '9:16',
        subtitleConfig: prev.subtitleConfig,
        backgroundImage: prev.backgroundImage,
        watermark: prev.watermark,
      };
    });
    const baseSeek =
      presetId === 'jp-en'
        ? 4.8
        : presetId === 'water'
          ? 3.1
          : presetId === 'ed'
            ? 3.8
            : presetId === 'xun'
              ? 2.8
              : 1.65;
    setCurrentTime(baseSeek + nextIntroOffset);
    setSelectedElementId(null);
  }, []);

  const handleUploadAudio = useCallback((file: File) => {
    setIsPlaying(false);
    const nextUrl = URL.createObjectURL(file);
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return nextUrl;
    });
    setAudioFile(file);
    setAudioFileName(file.name);
    setAudioDurationSec(null);
    setProject((prev) => ({ ...prev, audioFileName: file.name }));
  }, []);

  const handleClearAudio = useCallback(() => {
    setIsPlaying(false);
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setAudioFile(null);
    setAudioFileName(undefined);
    setAudioDurationSec(null);
    setProject((prev) => ({ ...prev, audioFileName: undefined }));
  }, []);

  const handleApplyTranscript = useCallback(
    (cues: TranscriptCue[], title: string) => {
      setIsPlaying(false);
      const introSec = getEffectiveIntroSeconds(project);
      setProject((prev) => {
        const built = choreographFromTranscript(cues, {
          title,
          theme: isDarkCanvasTheme(prev.theme) ? 'pastel-sunrise' : prev.theme,
          compositionId: prev.compositionId,
          audioFileName,
        });
        const extraSec = getEffectiveIntroSeconds(prev) + getEffectiveOutroSeconds(prev);
        const baseDur = audioDurationSec
          ? Number(Math.max(built.duration, audioDurationSec).toFixed(2))
          : built.duration;
        const nextDur = Number((baseDur + extraSec).toFixed(2));
        const withMeta: LessonProject = {
          ...built,
          aspectRatio: prev.aspectRatio ?? mp4Settings.aspectRatio ?? '9:16',
          duration: nextDur,
          subtitleConfig: prev.subtitleConfig,
          backgroundImage: prev.backgroundImage,
          watermark: prev.watermark,
        };
        return prev.compositionId === 'plain'
          ? {
              ...recomposeProjectWithStyle(withMeta, 'plain'),
              subtitleConfig: prev.subtitleConfig ?? {
                position: 'center',
                size: 'lg',
                boxStyle: 'clean',
              },
            }
          : withMeta;
      });
      const firstCue = cues[0];
      const previewTime = firstCue
        ? Number((introSec + firstCue.start + Math.min(0.5, (firstCue.end - firstCue.start) * 0.45)).toFixed(2))
        : Number((introSec + 0.4).toFixed(2));
      setCurrentTime(previewTime);
      setSelectedElementId(null);
    },
    [audioFileName, audioDurationSec, mp4Settings.aspectRatio, project],
  );

  const handleApplyScenePlan = useCallback(
    (
      words: WordTiming[],
      plan: ScenePlanDocument,
      title: string,
      cuesOverride?: TranscriptCue[],
    ): LessonProject => {
      setIsPlaying(false);
      const flexPlan = plan as FlexibleSceneDocument;
      if (Array.isArray(flexPlan.cartoonAnimations)) {
        for (const anim of flexPlan.cartoonAnimations) {
          if (anim && (anim.id || anim.label)) {
            upsertCartoonAnimation(anim);
          }
        }
      }
      const hasCartoonSignals =
        Boolean(flexPlan.cartoonAnimations?.length) ||
        Boolean(
          flexPlan.scenes?.some(
            (sc) => sc.cartoonAction || sc.cartoonMood || sc.cartoonAnimationSpec,
          ),
        ) ||
        Boolean(
          flexPlan.elements?.some(
            (el) =>
              el.variant === 'cartoon-host' ||
              el.data?.cartoonAction ||
              el.data?.cartoonMood ||
              el.data?.cartoonAnimationSpec,
          ),
        );
      const effectiveCompId =
        flexPlan.compositionId ??
        (hasCartoonSignals ? 'cartoon-host' : project.compositionId);
      const built = scenePlanToProject(words, flexPlan, {
        title,
        theme: flexPlan.theme,
        compositionId: effectiveCompId,
        audioFileName,
        audioDurationSec,
        cuesOverride,
      });
      const introSec = getEffectiveIntroSeconds(project);
      const extraSec = introSec + getEffectiveOutroSeconds(project);
      const baseDur = audioDurationSec
        ? Number(Math.max(built.duration, audioDurationSec).toFixed(2))
        : built.duration;
      const next: LessonProject = {
        ...built,
        aspectRatio: project.aspectRatio ?? mp4Settings.aspectRatio ?? '9:16',
        duration: Number((baseDur + extraSec).toFixed(2)),
        subtitleConfig: project.subtitleConfig,
        backgroundImage: project.backgroundImage,
        watermark: project.watermark,
      };
      setProject(next);
      const firstVisual = next.elements.find((e) => e.type !== 'karaoke-card');
      const firstWord = words[0];
      setCurrentTime(
        Math.min(
          next.duration,
          Number((introSec + (firstVisual?.startTime ?? firstWord?.start ?? 0) + 0.6).toFixed(2)),
        ),
      );
      setSelectedElementId(null);
      setSelectedOverlayZone(null);
      return next;
    },
    [
      audioFileName,
      audioDurationSec,
      mp4Settings.aspectRatio,
      project,
    ],
  );

  const handleSeek = useCallback(
    (time: number) => {
      const introSec = getEffectiveIntroSeconds(project);
      const clamped = Math.max(0, Math.min(project.duration, time));
      currentTimeRef.current = clamped;
      setCurrentTime(clamped);
      if (audioRef.current && audioUrl) {
        if (clamped < introSec) {
          if (!audioRef.current.paused) audioRef.current.pause();
          audioRef.current.currentTime = 0;
        } else {
          const targetAudioTime = Math.max(0, clamped - introSec);
          audioRef.current.currentTime = Number.isFinite(audioRef.current.duration)
            ? Math.min(audioRef.current.duration, targetAudioTime)
            : targetAudioTime;
        }
      }
    },
    [project, audioUrl],
  );

  const handleChangeComposition = useCallback(
    (compositionId: LayoutCompositionId) => {
      setIsPlaying(false);
      setSelectedElementId(null);
      if (compositionId === 'custom') {
        setProject((prev) =>
          applyCustomComponentComposition(prev, customCompositionConfig, {
            scope: 'all',
            activeTimeSec: currentTime,
          }),
        );
        return;
      }
      setProject((prev) => {
        const normalizedPrev: LessonProject =
          prev.compositionId === 'plain' && compositionId !== 'plain'
            ? {
                ...prev,
                subtitleConfig: {
                  position: 'bottom',
                  size: prev.subtitleConfig?.size || 'md',
                  boxStyle: 'card',
                },
              }
            : prev;
        const recomposed = recomposeProjectWithStyle(normalizedPrev, compositionId);
        if (compositionId === 'plain') {
          return {
            ...recomposed,
            subtitleConfig: {
              position: 'center',
              size: prev.subtitleConfig?.size || 'lg',
              boxStyle: 'clean',
            },
          };
        }
        if (prev.compositionId === 'plain') {
          const isDark = isDarkCanvasTheme(recomposed.theme);
          return {
            ...recomposed,
            subtitleConfig: {
              position: 'bottom',
              size: prev.subtitleConfig?.size || 'md',
              boxStyle: 'card',
            },
            elements: recomposed.elements.map((el) =>
              el.props.kind === 'karaoke-card'
                ? {
                    ...el,
                    layout: { ...el.layout, manualPosition: false },
                    props: {
                      ...el.props,
                      variant:
                        compositionId === 'cartoon-host'
                          ? 'yellow-pill'
                          : isDark
                            ? 'dark-bar'
                            : 'white-card',
                    },
                  }
                : el,
            ),
          };
        }
        return recomposed;
      });
    },
    [customCompositionConfig, currentTime],
  );

  const handleChangeSubtitleConfig = useCallback((nextSub: SubtitleDisplayConfig) => {
    setProject((prev) => {
      const isDark = isDarkCanvasTheme(prev.theme);
      return {
        ...prev,
        subtitleConfig: nextSub,
        elements: prev.elements.map((el) => {
          if (el.props.kind !== 'karaoke-card') return el;
          return {
            ...el,
            layout: {
              ...el.layout,
              manualPosition: false,
            },
            props: {
              ...el.props,
              variant:
                nextSub.boxStyle === 'clean'
                  ? 'plain-shadow'
                  : prev.compositionId === 'cartoon-host'
                    ? 'yellow-pill'
                    : isDark
                      ? 'dark-bar'
                      : 'white-card',
            },
          };
        }),
      };
    });
  }, []);

  const handleApplyCustomComposition = useCallback(
    (config: CustomComponentPresetConfig, scope: 'all' | 'active-cue' = 'all') => {
      setIsPlaying(false);
      setSelectedElementId(null);
      setCustomCompositionConfig(config);
      setProject((prev) =>
        applyCustomComponentComposition(prev, config, {
          scope,
          activeTimeSec: currentTime,
        }),
      );
    },
    [currentTime],
  );

  const handleApplyGeneratedAudioAndCues = useCallback(
    (nextAudioFile: File | null, cues: TranscriptCue[], title?: string) => {
      setIsPlaying(false);
      if (nextAudioFile) {
        const nextUrl = URL.createObjectURL(nextAudioFile);
        setAudioUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return nextUrl;
        });
        setAudioFile(nextAudioFile);
        setAudioFileName(nextAudioFile.name);
        setAudioDurationSec(null);
      }
      setProject((prev) => {
        const nextCues = cues.length > 0 ? cues : prev.cues;
        const built = choreographFromTranscript(nextCues, {
          title: title?.trim() || prev.title,
          theme: prev.theme,
          compositionId: prev.compositionId,
          audioFileName: nextAudioFile?.name ?? audioFileName,
        });
        const withMeta: LessonProject = {
          ...built,
          aspectRatio: prev.aspectRatio ?? mp4Settings.aspectRatio ?? '9:16',
          subtitleConfig: prev.subtitleConfig,
          backgroundImage: prev.backgroundImage,
          watermark: prev.watermark,
        };
        return prev.compositionId === 'plain'
          ? {
              ...recomposeProjectWithStyle(withMeta, 'plain'),
              subtitleConfig: prev.subtitleConfig ?? {
                position: 'center',
                size: 'lg',
                boxStyle: 'clean',
              },
            }
          : withMeta;
      });
      const nextCuesForTime = cues.length > 0 ? cues : project.cues;
      const firstCue = nextCuesForTime[0];
      const previewTime = firstCue
        ? Number((firstCue.start + Math.min(0.5, (firstCue.end - firstCue.start) * 0.45)).toFixed(2))
        : 0.4;
      setCurrentTime(previewTime);
      setSelectedElementId(null);
    },
    [project.cues, audioFileName],
  );

  const handleReceiveFromReelsTab = useCallback(
    (incomingProject: LessonProject, incomingAudioFile: File | null) => {
      setIsPlaying(false);
      if (incomingAudioFile) {
        const nextUrl = URL.createObjectURL(incomingAudioFile);
        setAudioUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return nextUrl;
        });
        setAudioFile(incomingAudioFile);
        setAudioFileName(incomingAudioFile.name);
        setAudioDurationSec(null);
      } else {
        handleClearAudio();
      }
      const nextAspect = incomingProject.aspectRatio || '9:16';
      setMp4Settings((prev) =>
        prev.aspectRatio === nextAspect ? prev : { ...prev, aspectRatio: nextAspect },
      );
      setProject(incomingProject);
      const firstCue = incomingProject.cues[0];
      setCurrentTime(
        firstCue
          ? Number((firstCue.start + Math.min(0.45, (firstCue.end - firstCue.start) * 0.35)).toFixed(2))
          : 0.4,
      );
      setSelectedElementId(null);
      setActiveTab('studio');
    },
    [handleClearAudio],
  );

  const handleChangeMp4Settings = useCallback((next: Mp4ExportSettings) => {
    setMp4Settings(next);
    if (next.aspectRatio) {
      const nextAspect = next.aspectRatio;
      setProject((prev) =>
        prev.aspectRatio === nextAspect
          ? prev
          : {
              ...prev,
              aspectRatio: nextAspect,
              elements: prev.elements.map((el) =>
                el.layout.manualPosition ? { ...el, layout: { ...el.layout, manualPosition: false } } : el,
              ),
            },
      );
    }
  }, []);

  const handleChangeBackgroundImage = useCallback((bg?: BackgroundImageConfig) => {
    setProject((prev) => ({
      ...prev,
      backgroundImage: bg,
    }));
  }, []);

  const handleAdjustProjectTiming = useCallback(
    (adjust: {
      offsetMs?: number;
      speedFactor?: number;
      targetDurationSec?: number;
      resyncVisuals?: boolean;
    }) => {
      setIsPlaying(false);
      setProject((prev) => {
        const nextCues = adjustCuesTiming(prev.cues, {
          offsetMs: adjust.offsetMs,
          speedFactor: adjust.speedFactor,
          targetDurationSec: adjust.targetDurationSec,
        });
        return resyncProjectTimingToCues(prev, nextCues, {
          resyncVisuals: adjust.resyncVisuals ?? true,
          audioDurationSec: audioDurationSec ?? undefined,
        });
      });
    },
    [audioDurationSec],
  );

  const handleResyncCuesToAudio = useCallback(
    async (
      mode: 'fast-forced' | 'whisper',
      options?: { resyncVisuals?: boolean; onProgress?: (pct: number, label: string) => void },
    ) => {
      if (!audioFile) {
        throw new Error('Chưa có file Audio để đồng bộ lại.');
      }
      setIsPlaying(false);
      const res = await resyncCuesToAudioFile({
        audioFile,
        cues: project.cues,
        alignMode: mode,
        onProgress: options?.onProgress,
      });
      setProject((prev) =>
        resyncProjectTimingToCues(prev, res.cues, {
          resyncVisuals: options?.resyncVisuals ?? true,
          audioDurationSec: audioDurationSec ?? undefined,
        }),
      );
      return {
        cueCount: res.cues.length,
        backendUsed: res.backendUsed,
        blockTranscript: res.blockTranscript,
        srt: res.srt,
      };
    },
    [audioFile, project.cues, audioDurationSec],
  );

  const handleChangeWatermark = useCallback(
    (wm: WatermarkOutroConfig) => {
      setProject((prev) => {
        const cuesMax = prev.cues.reduce((mx, c) => Math.max(mx, c.end), 0);
        const elMax = prev.elements.reduce((mx, el) => Math.max(mx, el.endTime), 0);
        const prevIntroSec = getEffectiveIntroSeconds(prev);
        const prevOutroSec = getEffectiveOutroSeconds(prev);
        const baseDur = Math.max(
          3,
          cuesMax,
          elMax,
          audioDurationSec ?? 0,
          Number((prev.duration - prevIntroSec - prevOutroSec).toFixed(2)),
        );
        const nextWithWm = { ...prev, watermark: wm };
        const nextIntroSec = getEffectiveIntroSeconds(nextWithWm);
        const nextOutroSec = getEffectiveOutroSeconds(nextWithWm);
        const nextDuration = Number((baseDur + nextIntroSec + nextOutroSec).toFixed(2));
        return {
          ...prev,
          duration: nextDuration,
          watermark: wm,
        };
      });
    },
    [audioDurationSec],
  );

  const handleRandomizeComposition = useCallback(() => {
    setIsPlaying(false);
    setSelectedElementId(null);
    setProject((prev) => {
      const transcriptText = prev.cues.map((c) => c.text).join(' ');
      const pick = pickRandomComposition(prev.compositionId, prev.theme, Math.random, {
        transcriptText,
        allowDarkThemes: true,
      });
      return recomposeProjectWithStyle(prev, pick.compositionId, { theme: pick.theme });
    });
  }, []);

  const handleUpdateElement = useCallback((id: string, patch: Partial<SceneElement>) => {
    setProject((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => (el.id === id ? { ...el, ...patch } : el)),
    }));
  }, []);

  const handleMoveElement = useCallback((id: string, x: number, y: number) => {
    setProject((prev) => ({
      ...prev,
      elements: prev.elements.map((el) =>
        el.id === id ? { ...el, layout: { ...el.layout, x, y, manualPosition: true } } : el,
      ),
    }));
  }, []);

  const handleChangeTitle = useCallback((title: string) => {
    setProject((prev) => ({ ...prev, title }));
  }, []);

  const handleChangeTitleLayout = useCallback((titleLayout?: TitleOverlayLayout) => {
    setProject((prev) => ({ ...prev, titleLayout }));
  }, []);

  const handleApplyReflowElements = useCallback((reflowedMap: Map<string, ElementLayout>) => {
    setProject((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => {
        const nextLay = reflowedMap.get(el.id);
        return nextLay ? { ...el, layout: nextLay } : el;
      }),
    }));
  }, []);

  const handleApplySubtitlePositionToAll = useCallback((x: number, y: number) => {
    setProject((prev) => ({
      ...prev,
      elements: prev.elements.map((el) =>
        el.type === 'karaoke-card'
          ? { ...el, layout: { ...el.layout, x, y, manualPosition: true } }
          : el,
      ),
    }));
  }, []);

  const handleResetElementPosition = useCallback((id: string) => {
    setProject((prev) => ({
      ...prev,
      elements: prev.elements.map((el) =>
        el.id === id ? { ...el, layout: { ...el.layout, manualPosition: false } } : el,
      ),
    }));
  }, []);

  const handleDeleteElement = useCallback(
    (id: string) => {
      setProject((prev) => ({
        ...prev,
        elements: prev.elements.filter((el) => el.id !== id),
      }));
      if (selectedElementId === id) {
        setSelectedElementId(null);
      }
    },
    [selectedElementId],
  );

  const handleAddElement = useCallback(
    (type: 'sentence-card' | 'topic-pill' | 'shape-3d') => {
      const start = Number(Math.max(0, currentTime).toFixed(2));
      const end = Number(Math.min(project.duration, start + 3.0).toFixed(2));
      const id = `custom-${type}-${Date.now()}`;

      let newEl: SceneElement;
      if (type === 'shape-3d') {
        newEl = {
          id,
          type: 'shape-3d',
          label: 'Khối 3D mới',
          startTime: start,
          endTime: Math.max(start + 0.8, end),
          enterAnimation: 'pop-up',
          exitAnimation: 'shrink',
          layout: { x: 540, y: 760, width: 760, height: 220, scale: 1, zIndex: 24 },
          props: {
            kind: 'shape-3d',
            shapeType: 'card_3d',
            fill: '#14B8A6',
            shadow: true,
            highlight: true,
            depth: 12,
            cornerRadius: 28,
            textContent: 'Key Point',
            textColor: '#FFFFFF',
            textSize: 'headline',
            textWeight: 'bold',
          },
        };
      } else if (type === 'sentence-card') {
        newEl = {
          id,
          type: 'sentence-card',
          label: 'Thẻ câu mới',
          startTime: start,
          endTime: Math.max(start + 0.8, end),
          enterAnimation: 'pop-up',
          exitAnimation: 'shrink',
          layout: { x: 540, y: 1005, width: 780, scale: 1, zIndex: 22 },
          props: {
            kind: 'sentence-card',
            text: 'Could I have some water?',
            badge: 'check',
            emphasisWord: 'Could I',
            emphasisColor: '#16A34A',
          },
        };
      } else {
        newEl = {
          id,
          type: 'topic-pill',
          label: 'Nhãn mới',
          startTime: start,
          endTime: Math.max(start + 0.8, end),
          enterAnimation: 'pop-up',
          exitAnimation: 'fade-out',
          layout: { x: 540, y: 345, width: 340, scale: 1, zIndex: 14 },
          props: {
            kind: 'topic-pill',
            text: 'Tip #1',
            bgColor: '#DCFCE7',
            textColor: '#15803D',
          },
        };
      }

      setProject((prev) => ({ ...prev, elements: [...prev.elements, newEl] }));
      setSelectedElementId(id);
    },
    [currentTime, project.duration],
  );

  const handleCancelExportVideo = useCallback(() => {
    exportAbortControllerRef.current?.abort();
  }, []);

  const handleOpenOutputFolder = useCallback(async () => {
    try {
      const res = await fetch('/api/output/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: TAB_OUTPUT_SUBFOLDERS.studio }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        desktopOpened?: boolean;
        outputDir?: string;
      };
      if (!data.desktopOpened) {
        setActiveTab('edu-studio');
      }
    } catch {
      setActiveTab('edu-studio');
    }
  }, []);

  const studioDescription = useMemo(
    () =>
      buildVideoDescription({
        title: project.title,
        nativeLang: 'vi',
        learningLang: 'auto',
        style: studioDescriptionStyle,
        project,
        durationSec: project.duration,
      }),
    [project, studioDescriptionStyle],
  );

  const handleExportVideo = useCallback(
    async (projectOverride?: LessonProject): Promise<ExportVideoResult | null> => {
      if (isExportingVideo) return null;
      const targetProject = projectOverride ?? project;
      const controller = new AbortController();
      exportAbortControllerRef.current = controller;

      setIsPlaying(false);
      setIsExportingVideo(true);
      setExportProgress(0);
      setExportStageLabel('Đang chuẩn bị render MP4...');
      setExportError(null);

      try {
        const cleanFileBase = cleanOutputTitleStem(
          targetProject.title || targetProject.id,
          'Studio Video',
        );
        const targetDescription = projectOverride
          ? buildVideoDescription({
              title: targetProject.title,
              nativeLang: 'vi',
              learningLang: 'auto',
              style: studioDescriptionStyle,
              project: targetProject,
              durationSec: targetProject.duration,
            })
          : studioDescription;

        let finalAudioForExport: File | null = audioFile;
        const introSec = getEffectiveIntroSeconds(targetProject);
        const outroSec = getEffectiveOutroSeconds(targetProject);
        const shouldMixBgm =
          (studioBgmPreset !== 'none' || Boolean(studioCustomBgmFile)) && studioBgmVolume > 0;
        if (shouldMixBgm || (introSec > 0 && Boolean(audioFile))) {
          setExportStageLabel(
            introSec > 0 && !shouldMixBgm
              ? 'Đang căn khoảng lặng Intro cho âm thanh...'
              : 'Đang hòa âm nhạc nền + âm thanh...',
          );
          const speechWindows = targetProject.cues.map((c) => ({
            start: c.start + introSec,
            end: c.end + introSec,
          }));
          const mixed = await mixVoiceWithBgmPreset({
            voiceFile: audioFile,
            bgmPreset: studioBgmPreset,
            bgmVolume: studioBgmVolume,
            customBgmFile: studioCustomBgmFile,
            voiceDelaySec: introSec,
            speechWindows,
            introEndSec: introSec,
            outroStartSec:
              outroSec > 0 ? Math.max(introSec, targetProject.duration - outroSec) : undefined,
            minTotalDurationSec: targetProject.duration,
            outputFileName: `${cleanFileBase}.wav`,
          });
          if (mixed.file) {
            finalAudioForExport = mixed.file;
          }
        }

        const result = await exportProjectToVideo(
          targetProject,
          finalAudioForExport,
          ({ progress, stageLabel }) => {
            setExportProgress(progress);
            setExportStageLabel(stageLabel);
          },
          mp4Settings,
          {
            signal: controller.signal,
            customFileBase: cleanFileBase,
            alsoSaveToServerOutput: true,
            skipDownload: true,
            savePath: TAB_OUTPUT_SUBFOLDERS.studio,
            sourceTab: `Studio ${targetProject.aspectRatio || mp4Settings.aspectRatio || '9:16'}`,
            companionText: targetDescription.txtContent,
          },
        );
        emitOutputUpdated({
          sourceTab: `Studio ${targetProject.aspectRatio || mp4Settings.aspectRatio || '9:16'}`,
        });
        playExportCompleteSound();
        try {
          const outRes = await fetch('/api/output/files');
          const outData = (await outRes.json().catch(() => ({}))) as {
            outputDir?: string;
            files?: Array<unknown>;
          };
          setLastExportSummary({
            fileName: result.fileName,
            savedPath: result.savedPath,
            outputCount: Array.isArray(outData.files) ? outData.files.length : 1,
            outputDir: outData.outputDir,
          });
        } catch {
          setLastExportSummary({
            fileName: result.fileName,
            savedPath: result.savedPath,
            outputCount: 1,
          });
        }
        return result;
      } catch (err) {
        if (err instanceof ExportAbortedError || controller.signal.aborted) {
          setExportError('Đã hủy quá trình render video.');
          return null;
        }
        const msg = err instanceof Error ? err.message : 'Không thể render file video.';
        setExportError(msg);
        return null;
      } finally {
        exportAbortControllerRef.current = null;
        setIsExportingVideo(false);
        setExportProgress(0);
        setExportStageLabel('');
      }
    },
    [
      isExportingVideo,
      project,
      audioFile,
      mp4Settings,
      studioBgmPreset,
      studioBgmVolume,
      studioCustomBgmFile,
      studioDescriptionStyle,
      studioDescription,
    ],
  );

  const handleApplyAndRenderVideo = useCallback(
    async (
      words: WordTiming[],
      plan: ScenePlanDocument,
      title: string,
      cuesOverride?: TranscriptCue[],
    ): Promise<ExportVideoResult | null> => {
      const nextProject = handleApplyScenePlan(words, plan, title, cuesOverride);
      return handleExportVideo(nextProject);
    },
    [handleApplyScenePlan, handleExportVideo],
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F7F9] text-slate-900">
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onLoadedMetadata={(e) => {
            const dur = e.currentTarget.duration;
            if (Number.isFinite(dur) && dur > 0.5) {
              setAudioDurationSec(dur);
              setProject((prev) => {
                const extraSec = getEffectiveIntroSeconds(prev) + getEffectiveOutroSeconds(prev);
                return {
                  ...prev,
                  duration: Number(Math.max(prev.duration, dur + extraSec).toFixed(2)),
                };
              });
            }
          }}
        />
      )}

      {/* Balanced Multi-Zone Studio Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-3 sm:px-5 lg:px-6 py-2.5 shadow-xs">
        <div className="max-w-[1440px] mx-auto flex flex-col xl:flex-row xl:items-center xl:justify-between gap-2.5">
          {/* Brand & Utility Actions on Narrow Screens, Brand on Left on XL */}
          <div className="flex items-center justify-between gap-3 shrink-0">
            <a
              href="#studio"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('studio');
              }}
              className="flex items-center gap-2.5 shrink-0 group"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-xs group-hover:bg-indigo-600 transition-colors">
                <Clapperboard className="w-4 h-4" />
              </div>
              <div className="leading-tight">
                <div className="flex items-center gap-1.5">
                  <span className="text-[14px] sm:text-[15px] font-bold tracking-tight text-slate-900 font-display">
                    KineticSub Studio
                  </span>
                  <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded">
                    {project.aspectRatio || mp4Settings.aspectRatio || '9:16'}
                  </span>
                </div>
                <div className="hidden sm:block text-[10px] font-medium text-slate-500">
                  Video Học Ngoại Ngữ · AI Choreography · MP4 Exporter
                </div>
              </div>
            </a>

            {/* Compact mobile utility actions */}
            <div className="flex xl:hidden items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsComponentDbOpen(true)}
                title="Kho Component"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                <Database className="w-3.5 h-3.5 text-indigo-600" />
                <span className="hidden sm:inline">Kho Component</span>
              </button>
              <button
                type="button"
                onClick={() => setIsBatchModalOpen(true)}
                title="Chạy Batch Hàng Loạt"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 whitespace-nowrap"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Batch</span>
              </button>
              {isConfirmingReset ? (
                <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-lg px-1.5 py-1">
                  <button
                    type="button"
                    onClick={() => void resetAllUserSettings()}
                    className="px-1.5 py-0.5 text-[10px] font-semibold text-white bg-rose-600 rounded hover:bg-rose-700 whitespace-nowrap"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsConfirmingReset(false)}
                    className="px-1 text-[10px] font-medium text-slate-600"
                  >
                    Hủy
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsConfirmingReset(true)}
                  title="Khôi phục tất cả cài đặt về mặc định"
                  className="inline-flex items-center justify-center p-1.5 text-slate-500 bg-slate-50 border border-slate-200 rounded-lg hover:text-rose-700 hover:border-rose-300"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Primary Segmented Workspace Navigation */}
          <nav
            aria-label="Menu chính"
            className="flex flex-wrap sm:flex-nowrap items-center justify-center sm:justify-start gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/90 max-w-full w-full sm:w-auto self-start xl:self-auto"
          >
            <button
              type="button"
              onClick={() => setActiveTab('studio')}
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-[11px] sm:text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'studio'
                  ? 'bg-white text-indigo-700 shadow-xs ring-1 ring-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
              }`}
            >
              <Clapperboard
                className={`w-3.5 h-3.5 ${activeTab === 'studio' ? 'text-indigo-600' : 'text-slate-400'}`}
              />
              <span>Dựng Video ({project.aspectRatio || mp4Settings.aspectRatio || '9:16'})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('reels')}
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-[11px] sm:text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'reels'
                  ? 'bg-white text-violet-700 shadow-xs ring-1 ring-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
              }`}
            >
              <Sparkles
                className={`w-3.5 h-3.5 ${activeTab === 'reels' ? 'text-violet-600' : 'text-slate-400'}`}
              />
              <span>Video Ngoại Ngữ AI</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('edu-studio')}
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-[11px] sm:text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'edu-studio'
                  ? 'bg-white text-emerald-700 shadow-xs ring-1 ring-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
              }`}
            >
              <Film
                className={`w-3.5 h-3.5 ${activeTab === 'edu-studio' ? 'text-emerald-600' : 'text-slate-400'}`}
              />
              <span>Hậu Kỳ &amp; File Xuất</span>
            </button>
          </nav>

          {/* Desktop Right Utility Group (Ordered by frequency & visual priority) */}
          <div className="hidden xl:flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsComponentDbOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-700 transition-colors shadow-xs whitespace-nowrap shrink-0"
            >
              <Database className="w-3.5 h-3.5 text-indigo-600" />
              <span>Kho Component</span>
            </button>

            <button
              type="button"
              onClick={() => setIsBatchModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-xs whitespace-nowrap shrink-0"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Chạy Batch Hàng Loạt</span>
            </button>

            <div className="h-5 w-px bg-slate-200 mx-0.5" aria-hidden="true" />

            {isConfirmingReset ? (
              <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">
                <button
                  type="button"
                  onClick={() => void resetAllUserSettings()}
                  className="px-2 py-1 text-[11px] font-semibold text-white bg-rose-600 rounded-md hover:bg-rose-700 whitespace-nowrap shrink-0"
                >
                  Xác nhận Reset
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirmingReset(false)}
                  className="px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap shrink-0"
                >
                  Hủy
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsConfirmingReset(true)}
                title="Khôi phục tất cả cài đặt các tab về mặc định"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:border-rose-300 hover:text-rose-700 hover:bg-rose-50/50 transition-colors whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Mặc định</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {activeTab === 'reels' ? (
        <main className="flex-1 w-full">
          <EnglishReelsTab onSendToStudio={handleReceiveFromReelsTab} />
        </main>
      ) : activeTab === 'edu-studio' ? (
        <main className="flex-1 w-full">
          <EducationalStudioTab
            onSendAudioCuesToStudio={(incomingAudio, incomingCues, incomingTitle) => {
              handleApplyGeneratedAudioAndCues(incomingAudio, incomingCues, incomingTitle);
              setActiveTab('studio');
            }}
          />
        </main>
      ) : (
        /* Main Automated AI-First Workspace */
        <main id="studio" className="flex-1 max-w-[1400px] w-full mx-auto p-4 lg:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight text-balance">
                {project.title}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">{project.subtitle}</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-600 tabular-nums">
              <span>{project.elements.length} lớp tự động</span>
              <span aria-hidden="true">·</span>
              <span>{project.duration.toFixed(1)}s</span>
              <span aria-hidden="true">·</span>
              <span>
                {resolvedExport.width}×{resolvedExport.height} @ {resolvedExport.fps}fps
              </span>
            </div>
          </div>

          {/* Clean 2-Column AI Pipeline + Live 9:16 Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            <div className="lg:col-span-7 min-h-0">
              <AutomationPipelinePanel
                project={project}
                audioUrl={audioUrl}
                audioFile={audioFile}
                audioFileName={audioFileName}
                audioDurationSec={audioDurationSec}
                currentTime={currentTime}
                mp4Settings={mp4Settings}
                customCompositionConfig={customCompositionConfig}
                isExportingVideo={isExportingVideo}
                exportProgress={exportProgress}
                exportStageLabel={exportStageLabel}
                exportError={exportError}
                onChangeMp4Settings={handleChangeMp4Settings}
                onChangeComposition={handleChangeComposition}
                onRandomizeComposition={handleRandomizeComposition}
                onChangeCustomComposition={setCustomCompositionConfig}
                onApplyCustomComposition={handleApplyCustomComposition}
                onSelectPreset={handleSelectPreset}
                onUploadAudio={handleUploadAudio}
                onClearAudio={handleClearAudio}
                onApplyTranscript={handleApplyTranscript}
                onApplyAudioAndCues={handleApplyGeneratedAudioAndCues}
                onResyncCuesToAudio={handleResyncCuesToAudio}
                onAdjustTiming={handleAdjustProjectTiming}
                onApplyScenePlan={handleApplyScenePlan}
                onApplyAndRenderVideo={handleApplyAndRenderVideo}
                onSeek={handleSeek}
                onOpenAdvancedEditor={() => setIsAdvancedOpen(true)}
                onOpenAudioSubtitleStudio={() => setIsAudioSubStudioOpen(true)}
                onCancelExportVideo={handleCancelExportVideo}
                onOpenAnimationStudio={() => {
                  const hostEl = project.elements.find(
                    (el) => el.props.kind === 'illustration-prop' && el.props.variant === 'cartoon-host',
                  );
                  const data = hostEl?.props.kind === 'illustration-prop' ? hostEl.props.data : undefined;
                  setAnimationStudioState({
                    isOpen: true,
                    actionId: data?.cartoonAction,
                    spec: data?.cartoonAnimationSpec,
                    elementId: hostEl?.id,
                  });
                }}
              />
            </div>

            <div className="lg:col-span-5 min-h-0">
              <StagePreview
                project={project}
                currentTime={currentTime}
                isPlaying={isPlaying}
                mp4Settings={mp4Settings}
                customCompositionConfig={customCompositionConfig}
                isExportingVideo={isExportingVideo}
                exportProgress={exportProgress}
                exportStageLabel={exportStageLabel}
                lastExportSummary={lastExportSummary}
                selectedElementId={selectedElementId}
                selectedOverlayZone={selectedOverlayZone}
                onSelectOverlayZone={setSelectedOverlayZone}
                onChangeMp4Settings={handleChangeMp4Settings}
                onChangeComposition={handleChangeComposition}
                onRandomizeComposition={handleRandomizeComposition}
                onChangeCustomComposition={setCustomCompositionConfig}
                onApplyCustomComposition={handleApplyCustomComposition}
                onTogglePlay={() => setIsPlaying((p) => !p)}
                onRestart={() => {
                  handleSeek(0);
                  setIsPlaying(true);
                }}
                onSeek={handleSeek}
                onChangeTheme={(theme: CanvasThemeId) =>
                  setProject((prev) => {
                    const isDark = isDarkCanvasTheme(theme);
                    return {
                      ...prev,
                      theme,
                      elements: prev.elements.map((el) => {
                        if (el.props.kind !== 'karaoke-card') return el;
                        return {
                          ...el,
                          props: {
                            ...el.props,
                            variant: isDark ? 'dark-bar' : 'white-card',
                            activeColor: isDark ? '#FACC15' : '#2563EB',
                            inactiveColor: isDark ? '#CBD5E1' : '#9CA3AF',
                            spokenColor: isDark ? '#FFFFFF' : '#111827',
                          },
                        };
                      }),
                    };
                  })
                }
                onChangeBackgroundImage={handleChangeBackgroundImage}
                onChangeSubtitleConfig={handleChangeSubtitleConfig}
                onChangeWatermark={handleChangeWatermark}
                onSelectElement={setSelectedElementId}
                onMoveElement={handleMoveElement}
                onUpdateElement={handleUpdateElement}
                onChangeTitle={handleChangeTitle}
                onChangeTitleLayout={handleChangeTitleLayout}
                onApplyReflowElements={handleApplyReflowElements}
                onDeleteElement={handleDeleteElement}
                onApplySubtitlePositionToAll={handleApplySubtitlePositionToAll}
                onResetElementPosition={handleResetElementPosition}
                onOpenAnimationStudio={(actionId, spec, elementId) =>
                  setAnimationStudioState({
                    isOpen: true,
                    actionId,
                    spec,
                    elementId,
                  })
                }
                bgmPreset={studioBgmPreset}
                bgmVolume={studioBgmVolume}
                customBgmFile={studioCustomBgmFile}
                onChangeBgmPreset={setStudioBgmPreset}
                onChangeBgmVolume={setStudioBgmVolume}
                onChangeCustomBgmFile={setStudioCustomBgmFile}
                descriptionOutput={studioDescription}
                descriptionStyle={studioDescriptionStyle}
                onChangeDescriptionStyle={setStudioDescriptionStyle}
                onExportVideo={() => void handleExportVideo()}
                onCancelExportVideo={handleCancelExportVideo}
                onOpenOutputFolder={() => void handleOpenOutputFolder()}
              />
            </div>
          </div>

          {/* Concise 3-Input Architecture Guide */}
          <section
            id="python-guide"
            className="bg-white border border-slate-200 rounded-xl p-6 grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            <div>
              <p className="text-xs font-semibold text-indigo-600 mb-1">01. Không cần thiết kế tay</p>
              <h3 className="text-sm font-semibold text-slate-900 mb-1.5">
                Chỉ nhập Audio &amp; Transcript
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Hỗ trợ file ghi âm, sinh TTS miễn phí đa ngôn ngữ hoặc bóc phụ đề từ video. Karaoke từng từ được đồng bộ tự động.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-indigo-600 mb-1">02. Prompt là xương sống</p>
              <h3 className="text-sm font-semibold text-slate-900 mb-1.5">
                Gửi ChatGPT / Gemini sinh JSON
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Dùng Prompt dựng sẵn với Kho Component vector tùy chỉnh để AI tự chọn hình minh họa, khối 3D và gắn mốc hiện/ẩn không chồng đè.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-indigo-600 mb-1">03. Render tự động 9:16 &amp; 16:9</p>
              <h3 className="text-sm font-semibold text-slate-900 mb-1.5">
                Render &amp; lưu MP4 trực tiếp
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Chọn khung hình (9:16 / 16:9), độ phân giải (540p–2K), ảnh nền, chất lượng &amp; FPS để render file{' '}
                <code>.mp4</code> có tiếng ngay trên trình duyệt, hoặc ghép &amp; mix âm thanh nâng cao tại Edu Studio 1.19.
              </p>
            </div>
          </section>
        </main>
      )}

      {/* Global Output Panel visible across ALL tabs at the bottom */}
      <GlobalOutputPanel activeTab={activeTab} />

      {/* Optional Advanced Editor Modal (Hidden by default so user doesn't have to design) */}
      {isAdvancedOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="advanced-editor-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-[2px] p-4"
        >
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-2xl h-[82vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 id="advanced-editor-title" className="text-sm font-semibold text-slate-900">
                  Tinh chỉnh nâng cao (Tùy chọn)
                </h2>
                <p className="text-xs text-slate-500">
                  Chỉ dùng khi bạn muốn sửa tay thời gian hoặc vị trí của thẻ do AI tạo
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAdvancedOpen(false)}
                aria-label="Đóng chỉnh sửa nâng cao"
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0 p-4 bg-slate-50">
              <TimelineAndInspector
                project={project}
                currentTime={currentTime}
                selectedElementId={selectedElementId}
                onSelectElement={setSelectedElementId}
                onUpdateElement={handleUpdateElement}
                onDeleteElement={handleDeleteElement}
                onAddElement={handleAddElement}
                onSeek={handleSeek}
              />
            </div>
          </div>
        </div>
      )}

      <BatchQueueModal
        isOpen={isBatchModalOpen}
        mp4Settings={mp4Settings}
        onChangeMp4Settings={handleChangeMp4Settings}
        onClose={() => setIsBatchModalOpen(false)}
      />

      <ComponentDatabaseModal
        isOpen={isComponentDbOpen}
        onClose={() => setIsComponentDbOpen(false)}
        onOpenAnimationStudio={() => {
          setIsComponentDbOpen(false);
          const hostEl = project.elements.find(
            (el) => el.props.kind === 'illustration-prop' && el.props.variant === 'cartoon-host',
          );
          const data = hostEl?.props.kind === 'illustration-prop' ? hostEl.props.data : undefined;
          setAnimationStudioState({
            isOpen: true,
            actionId: data?.cartoonAction,
            spec: data?.cartoonAnimationSpec,
            elementId: hostEl?.id,
          });
        }}
      />

      <CartoonAnimationStudioModal
        isOpen={animationStudioState.isOpen}
        initialActionId={animationStudioState.actionId}
        initialSpec={animationStudioState.spec}
        onClose={() => setAnimationStudioState((s) => ({ ...s, isOpen: false }))}
        onApplyToStage={(actionId, spec) => {
          setProject((prev) => {
            const baseProj =
              prev.compositionId === 'cartoon-host' ||
              prev.elements.some(
                (el) => el.props.kind === 'illustration-prop' && el.props.variant === 'cartoon-host',
              )
                ? prev
                : recomposeProjectWithStyle(prev, 'cartoon-host');
            const targetId =
              animationStudioState.elementId ||
              baseProj.elements.find(
                (el) => el.props.kind === 'illustration-prop' && el.props.variant === 'cartoon-host',
              )?.id;
            return {
              ...baseProj,
              elements: baseProj.elements.map((el) => {
                if (el.props.kind !== 'illustration-prop' || el.props.variant !== 'cartoon-host') {
                  return el;
                }
                if (targetId && el.id !== targetId) return el;
                return {
                  ...el,
                  props: {
                    ...el.props,
                    data: {
                      ...(el.props.data || {}),
                      cartoonAction: actionId,
                      cartoonMood: spec.mood || el.props.data?.cartoonMood,
                      cartoonAnimationSpec: spec,
                    },
                  },
                };
              }),
            };
          });
        }}
      />

      <AudioSubtitleStudioModal
        isOpen={isAudioSubStudioOpen}
        initialTranscriptText={cuesToBlockTranscript(project.cues)}
        onClose={() => setIsAudioSubStudioOpen(false)}
        onApplyAudioAndCues={handleApplyGeneratedAudioAndCues}
      />
    </div>
  );
}
