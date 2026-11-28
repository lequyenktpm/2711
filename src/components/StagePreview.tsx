import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
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
import {
  DEFAULT_BGM_PRESET,
  DEFAULT_BGM_VOLUME,
  STUDIO_BGM_PRESETS,
  StudioBgmPresetId,
} from '../engine/audioMixHelper';
import { buildLeveledOutputStem } from '../engine/outputNaming';
import { downloadTextAsPlainFile } from '../utils/safeFileDownload';
import {
  VideoDescriptionOutput,
  VideoDescriptionStyle,
} from '../engine/videoDescriptionBuilder';
import { BACKGROUND_PRESETS } from '../engine/backgroundPresets';
import {
  ensureProjectAssetsLoaded,
  getEffectiveIntroSeconds,
  getEffectiveOutroSeconds,
  getStageDimensionsForAspect,
  hitTestCanvasOverlayZone,
  hitTestElementLayout,
  renderProjectFrame,
  resolveElementLayoutForAspect,
  resolveLessonTitleBox,
  seekBackgroundVideoTo,
  subscribeBgImageLoaded,
} from '../engine/canvasRenderer';
import { subscribeCartoonAnimations } from '../engine/cartoonAnimationDb';
import { subscribeCustomComponents } from '../engine/customComponentStore';
import { LAYOUT_COMPOSITIONS } from '../engine/illustrationLayouts';
import {
  detectActiveStageOverlaps,
  reflowElementsAvoidingOverlap,
} from '../engine/layoutSolver';
import {
  ASPECT_RATIO_OPTIONS,
  estimateMp4FileSize,
  ExportAspectRatioId,
  FPS_OPTIONS,
  Mp4ExportSettings,
  QUALITY_OPTIONS,
  RESOLUTION_OPTIONS,
  resolveDimensionsForAspect,
  resolveMp4EncodingParams,
} from '../engine/mp4Config';
import {
  BackgroundFitMode,
  BackgroundImageConfig,
  BackgroundPresetId,
  CANVAS_THEMES,
  CanvasThemeId,
  CartoonAnimationParams,
  CustomComponentPresetConfig,
  ElementLayout,
  IllustrationSceneIcon,
  IllustrationVariant,
  LayoutCompositionId,
  LessonProject,
  SceneElement,
  SubtitleBoxStyle,
  SubtitleDisplayConfig,
  SubtitlePosition,
  SubtitleSize,
  TitleOverlayLayout,
  WatermarkCorner,
  WatermarkOutroConfig,
} from '../engine/types';
import { getEffectiveVectorCatalog, SCENE_ICON_KEYWORDS } from '../engine/vectorComponentDb';
import { resizeImageFileToStageDataUrl } from '../utils/imageResize';
import { InlinePreviewElementEditor, StageOverlayZone } from './InlinePreviewElementEditor';

const DEFAULT_WATERMARK_CONFIG: WatermarkOutroConfig = {
  introSeconds: 0,
  introBadge: 'BÀI HỌC HÔM NAY',
  introTitle: '',
  introSubtitle: '',
  watermarkEnabled: false,
  watermarkText: '@KineticSub',
  watermarkCorner: 'bottom-right',
  watermarkOpacity: 0.7,
  outroSeconds: 0,
  outroLine1: 'Thanks for watching!',
  outroLine2: 'Subscribe & Practice daily',
};

interface StagePreviewProps {
  project: LessonProject;
  currentTime: number;
  isPlaying: boolean;
  isExportingVideo: boolean;
  exportProgress: number;
  exportStageLabel?: string;
  lastExportSummary?: {
    fileName: string;
    savedPath?: string;
    outputCount: number;
    outputDir?: string;
  } | null;
  selectedElementId: string | null;
  mp4Settings: Mp4ExportSettings;
  customCompositionConfig?: CustomComponentPresetConfig;
  onChangeMp4Settings: (next: Mp4ExportSettings) => void;
  onChangeComposition: (compositionId: LayoutCompositionId) => void;
  onRandomizeComposition: () => void;
  onChangeCustomComposition?: (next: CustomComponentPresetConfig) => void;
  onApplyCustomComposition?: (config: CustomComponentPresetConfig, scope?: 'all' | 'active-cue') => void;
  onTogglePlay: () => void;
  onRestart: () => void;
  onSeek: (time: number) => void;
  onChangeTheme: (theme: CanvasThemeId) => void;
  onChangeBackgroundImage: (bg?: BackgroundImageConfig) => void;
  onChangeSubtitleConfig?: (next: SubtitleDisplayConfig) => void;
  onChangeWatermark?: (wm: WatermarkOutroConfig) => void;
  onSelectElement: (id: string | null) => void;
  onMoveElement: (id: string, x: number, y: number) => void;
  onUpdateElement?: (id: string, patch: Partial<SceneElement>) => void;
  onChangeTitle?: (title: string) => void;
  onChangeTitleLayout?: (next?: TitleOverlayLayout) => void;
  onApplyReflowElements?: (reflowedMap: Map<string, ElementLayout>) => void;
  onDeleteElement?: (id: string) => void;
  onApplySubtitlePositionToAll?: (x: number, y: number) => void;
  onResetElementPosition?: (id: string) => void;
  selectedOverlayZone?: StageOverlayZone | null;
  onSelectOverlayZone?: (zone: StageOverlayZone | null) => void;
  onOpenAnimationStudio?: (
    actionId?: string,
    spec?: Partial<CartoonAnimationParams>,
    elementId?: string,
  ) => void;
  bgmPreset?: StudioBgmPresetId;
  bgmVolume?: number;
  customBgmFile?: File | null;
  onChangeBgmPreset?: (preset: StudioBgmPresetId) => void;
  onChangeBgmVolume?: (volume: number) => void;
  onChangeCustomBgmFile?: (file: File | null) => void;
  descriptionOutput?: VideoDescriptionOutput;
  descriptionStyle?: VideoDescriptionStyle;
  onChangeDescriptionStyle?: (style: VideoDescriptionStyle) => void;
  onExportVideo: () => void;
  onCancelExportVideo?: () => void;
  onOpenOutputFolder?: () => void;
}

export const StagePreview: React.FC<StagePreviewProps> = ({
  project,
  currentTime,
  isPlaying,
  isExportingVideo,
  exportProgress,
  exportStageLabel,
  lastExportSummary,
  selectedElementId,
  mp4Settings,
  customCompositionConfig,
  onChangeMp4Settings,
  onChangeComposition,
  onRandomizeComposition,
  onChangeCustomComposition,
  onApplyCustomComposition,
  onTogglePlay,
  onRestart,
  onSeek,
  onChangeTheme,
  onChangeBackgroundImage,
  onChangeSubtitleConfig,
  onChangeWatermark,
  onSelectElement,
  onMoveElement,
  onUpdateElement,
  onChangeTitle,
  onChangeTitleLayout,
  onApplyReflowElements,
  onDeleteElement,
  onApplySubtitlePositionToAll,
  onResetElementPosition,
  selectedOverlayZone,
  onSelectOverlayZone,
  onOpenAnimationStudio,
  bgmPreset = DEFAULT_BGM_PRESET,
  bgmVolume = DEFAULT_BGM_VOLUME,
  customBgmFile = null,
  onChangeBgmPreset,
  onChangeBgmVolume,
  onChangeCustomBgmFile,
  descriptionOutput,
  descriptionStyle = 'auto',
  onChangeDescriptionStyle,
  onExportVideo,
  onCancelExportVideo,
  onOpenOutputFolder,
}) => {
  const effectiveAspect: ExportAspectRatioId = project.aspectRatio || mp4Settings.aspectRatio || '9:16';
  const stageDims = getStageDimensionsForAspect(effectiveAspect);
  const resolved = resolveMp4EncodingParams({ ...mp4Settings, aspectRatio: effectiveAspect });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewPanelRef = useRef<HTMLElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const bgmInputRef = useRef<HTMLInputElement>(null);
  const videoBlobUrlRef = useRef<string | null>(null);
  const [assetVersion, setAssetVersion] = useState(0);
  const [dbVersion, setDbVersion] = useState(0);
  const [isProcessingBg, setIsProcessingBg] = useState(false);
  const [bgUploadError, setBgUploadError] = useState<string | null>(null);
  const [isWatermarkOpen, setIsWatermarkOpen] = useState(false);
  const [isDescOpen, setIsDescOpen] = useState(false);
  const [copiedDescTag, setCopiedDescTag] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoReflowOnMove, setAutoReflowOnMove] = useState(true);
  const [dismissedOverlapSig, setDismissedOverlapSig] = useState('');
  const dragStateRef = useRef<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  useEffect(() => {
    const unsubComp = subscribeCustomComponents(() => setDbVersion((v) => v + 1));
    const unsubAnim = subscribeCartoonAnimations(() => setDbVersion((v) => v + 1));
    return () => {
      unsubComp();
      unsubAnim();
    };
  }, []);

  useEffect(() => {
    return subscribeBgImageLoaded(() => setAssetVersion((v) => v + 1));
  }, []);

  useEffect(() => {
    return () => {
      if (videoBlobUrlRef.current) {
        URL.revokeObjectURL(videoBlobUrlRef.current);
        videoBlobUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen((prev) => (prev ? false : prev));
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const toggleFullscreen = () => {
    const panel = previewPanelRef.current;
    if (isFullscreen) {
      if (typeof document !== 'undefined' && document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
      return;
    }
    setIsFullscreen(true);
    if (panel && typeof panel.requestFullscreen === 'function') {
      void panel.requestFullscreen().catch(() => {
        // Theater fixed overlay remains active when iframe restricts fullscreen
      });
    }
  };

  void dbVersion;
  const vectorCatalog = getEffectiveVectorCatalog();

  const wmConfig = project.watermark ?? DEFAULT_WATERMARK_CONFIG;
  const activeSubtitleConfig: SubtitleDisplayConfig = project.subtitleConfig ?? {
    position: project.compositionId === 'plain' ? 'center' : 'bottom',
    size: project.compositionId === 'plain' ? 'lg' : 'md',
    boxStyle: project.compositionId === 'plain' ? 'clean' : 'card',
  };

  useEffect(() => {
    let active = true;
    if (
      project.backgroundImage?.dataUrl ||
      project.backgroundImage?.videoUrl ||
      project.backgroundImage?.kind === 'preset'
    ) {
      void ensureProjectAssetsLoaded(project).then(() => {
        if (active) setAssetVersion((v) => v + 1);
      });
    }
    return () => {
      active = false;
    };
  }, [
    project.backgroundImage?.dataUrl,
    project.backgroundImage?.videoUrl,
    project.backgroundImage?.kind,
    project.backgroundImage?.presetId,
  ]);

  useEffect(() => {
    let active = true;
    if (project.backgroundImage?.kind === 'video' && project.backgroundImage.videoUrl && !isPlaying && !isExportingVideo) {
      void seekBackgroundVideoTo(project.backgroundImage.videoUrl, currentTime).then(() => {
        if (active) setAssetVersion((v) => v + 1);
      });
    }
    return () => {
      active = false;
    };
  }, [project.backgroundImage?.kind, project.backgroundImage?.videoUrl, currentTime, isPlaying, isExportingVideo]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const activeSelectToken =
      isPlaying || isExportingVideo
        ? null
        : selectedOverlayZone === 'title'
          ? '__title__'
          : selectedElementId;
    renderProjectFrame(ctx, project, currentTime, activeSelectToken);
  }, [project, currentTime, selectedElementId, selectedOverlayZone, isPlaying, isExportingVideo, assetVersion]);

  const handleUploadBgImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.currentTarget;
    const file = inputEl.files?.[0];
    if (!file) return;
    setBgUploadError(null);
    setIsProcessingBg(true);
    try {
      const isVideoFile =
        file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
      if (isVideoFile) {
        if (videoBlobUrlRef.current) {
          URL.revokeObjectURL(videoBlobUrlRef.current);
        }
        const videoUrl = URL.createObjectURL(file);
        videoBlobUrlRef.current = videoUrl;
        onChangeBackgroundImage({
          kind: 'video',
          videoUrl,
          fileName: file.name,
          fit: project.backgroundImage?.fit ?? 'cover',
          scrimOpacity: project.backgroundImage?.scrimOpacity ?? 0.2,
          learningScrimOpacity: project.backgroundImage?.learningScrimOpacity ?? 0.45,
        });
      } else {
        const config = await resizeImageFileToStageDataUrl(file, {
          fit: project.backgroundImage?.fit ?? 'cover',
          scrimOpacity: project.backgroundImage?.scrimOpacity ?? 0.22,
          aspectRatio: effectiveAspect,
        });
        onChangeBackgroundImage({
          ...config,
          kind: 'image',
          learningScrimOpacity: project.backgroundImage?.learningScrimOpacity ?? 0.45,
        });
      }
    } catch (err) {
      setBgUploadError(
        err instanceof Error
          ? err.message
          : 'Không thể đọc file ảnh/video nền. Hãy thử file PNG, JPG, WebP hoặc MP4/WebM.',
      );
    } finally {
      inputEl.value = '';
      setIsProcessingBg(false);
    }
  };

  const toCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * stageDims.width,
      y: ((e.clientY - rect.top) / rect.height) * stageDims.height,
    };
  };

  const runReflowFromPin = (
    pinnedId: string,
    elementsOverride?: SceneElement[],
    titleLayoutOverride?: TitleOverlayLayout,
  ) => {
    if (!onApplyReflowElements) return;
    const targetElements = elementsOverride ?? project.elements;
    const targetProj: LessonProject =
      titleLayoutOverride !== undefined ? { ...project, titleLayout: titleLayoutOverride } : project;
    const lessonTime = Math.max(0, currentTime - getEffectiveIntroSeconds(targetProj));
    const resolvedMap = resolveElementLayoutForAspect(
      targetElements,
      lessonTime,
      effectiveAspect,
      targetProj.subtitleConfig,
      targetProj.compositionId,
    );
    const titleBox = resolveLessonTitleBox(targetProj, effectiveAspect, currentTime);
    const reflowed = reflowElementsAvoidingOverlap(targetElements, pinnedId, resolvedMap, {
      stageWidth: stageDims.width,
      stageHeight: stageDims.height,
      titleBox: titleBox
        ? { x: titleBox.x, y: titleBox.y, width: titleBox.width, height: titleBox.height }
        : null,
    });
    onApplyReflowElements(reflowed);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPlaying || isExportingVideo) return;
    const { x, y } = toCanvasCoords(e);
    const overlayZone = hitTestCanvasOverlayZone(
      project,
      x,
      y,
      currentTime,
      effectiveAspect,
    );
    if (overlayZone) {
      onSelectElement(null);
      onSelectOverlayZone?.(overlayZone);
      if (overlayZone === 'title') {
        const titleBox = resolveLessonTitleBox(project, effectiveAspect, currentTime);
        if (titleBox) {
          dragStateRef.current = {
            id: '__title__',
            offsetX: titleBox.x - x,
            offsetY: titleBox.y - y,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }
      }
      return;
    }

    const introSec = getEffectiveIntroSeconds(project);
    const lessonTime = Math.max(0, currentTime - introSec);
    if (currentTime < introSec) {
      onSelectElement(null);
      onSelectOverlayZone?.(null);
      return;
    }
    const hit = hitTestElementLayout(
      project.elements,
      x,
      y,
      lessonTime,
      effectiveAspect,
      project.subtitleConfig,
      project.compositionId,
    );
    if (hit) {
      onSelectOverlayZone?.(null);
      onSelectElement(hit.element.id);
      dragStateRef.current = {
        id: hit.element.id,
        offsetX: hit.layout.x - x,
        offsetY: hit.layout.y - y,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    } else {
      onSelectElement(null);
      onSelectOverlayZone?.(null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const { x, y } = toCanvasCoords(e);
    if (drag.id === '__title__') {
      const clampedX = Math.max(80, Math.min(stageDims.width - 80, Math.round(x + drag.offsetX)));
      const clampedY = Math.max(40, Math.min(stageDims.height - 60, Math.round(y + drag.offsetY)));
      onChangeTitleLayout?.({
        ...project.titleLayout,
        x: clampedX,
        y: clampedY,
      });
      return;
    }
    const clampedX = Math.max(80, Math.min(stageDims.width - 80, Math.round(x + drag.offsetX)));
    const clampedY = Math.max(60, Math.min(stageDims.height - 60, Math.round(y + drag.offsetY)));
    onMoveElement(drag.id, clampedX, clampedY);
  };

  const handlePointerUp = () => {
    const finished = dragStateRef.current;
    dragStateRef.current = null;
    if (finished && autoReflowOnMove) {
      runReflowFromPin(finished.id);
    }
  };

  const fmtTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = (sec % 60).toFixed(2).padStart(5, '0');
    return `${String(mins).padStart(2, '0')}:${secs}`;
  };

  return (
    <section
      ref={previewPanelRef}
      data-testid="studio-preview-section"
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 flex flex-col items-center justify-between bg-white p-3 sm:p-5 overflow-y-auto'
          : 'flex flex-col items-center bg-white border border-slate-200 rounded-xl p-4 h-fit sticky top-4'
      }
    >
      <div className="w-full max-w-6xl flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2 text-xs text-slate-500 whitespace-nowrap">
          <span className="font-medium text-slate-800">Xem trước {effectiveAspect}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{resolved.width}×{resolved.height}</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div
            role="group"
            aria-label="Tỉ lệ khung hình Studio"
            className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200"
          >
            {(['9:16', '16:9'] as ExportAspectRatioId[]).map((ratio) => (
              <button
                key={ratio}
                type="button"
                disabled={isExportingVideo}
                onClick={() =>
                  onChangeMp4Settings({
                    ...mp4Settings,
                    aspectRatio: ratio,
                  })
                }
                className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  effectiveAspect === ratio
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>
          {Object.values(CANVAS_THEMES).map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => onChangeTheme(theme.id)}
              title={theme.name}
              aria-label={`Chọn nền ${theme.name}`}
              className={`w-5 h-5 rounded-md border transition-transform ${
                project.theme === theme.id
                  ? 'border-indigo-600 ring-2 ring-indigo-200 scale-110'
                  : 'border-slate-300 hover:scale-105'
              }`}
              style={{
                background: `linear-gradient(180deg, ${theme.bgTop} 0%, ${theme.bgBottom} 100%)`,
              }}
            />
          ))}
          <button
            type="button"
            data-testid="studio-fullscreen-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Thu gọn Preview (Esc)' : 'Phóng to Preview toàn màn hình'}
            className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              isFullscreen
                ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
            }`}
          >
            {isFullscreen ? (
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

      {!isFullscreen && (
        <>
          {/* Unified Composition & Randomize Bar */}
          <div className="w-full pt-2.5 flex items-center gap-2">
        <select
          aria-label="Kiểu phối minh họa & hiệu ứng"
          disabled={isExportingVideo}
          value={project.compositionId ?? 'story-scenes'}
          onChange={(e) => onChangeComposition(e.target.value as LayoutCompositionId)}
          className="flex-1 min-w-0 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {LAYOUT_COMPOSITIONS.map((comp) => (
            <option key={comp.id} value={comp.id}>
              {comp.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={isExportingVideo}
          onClick={onRandomizeComposition}
          aria-label="Phối ngẫu nhiên đúng ngữ cảnh"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
        >
          <Shuffle className="w-3.5 h-3.5" />
          <span>Phối ngẫu nhiên</span>
        </button>

        {project.compositionId === 'cartoon-host' && onOpenAnimationStudio && (
          <button
            type="button"
            data-testid="studio-open-animation-studio-btn"
            onClick={() => {
              const hostEl = project.elements.find(
                (el) => el.props.kind === 'illustration-prop' && el.props.variant === 'cartoon-host',
              );
              const data = hostEl?.props.kind === 'illustration-prop' ? hostEl.props.data : undefined;
              onOpenAnimationStudio(data?.cartoonAction, data?.cartoonAnimationSpec, hostEl?.id);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 transition-colors whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Animation @Gimmys</span>
          </button>
        )}
      </div>

      {project.compositionId === 'custom' && customCompositionConfig && onChangeCustomComposition && onApplyCustomComposition && (
        <div className="w-full mt-2 p-2.5 rounded-lg bg-indigo-50/60 border border-indigo-200 space-y-2 text-[11px]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-indigo-900">Tự sáng tạo Component từ Kho ({vectorCatalog.length})</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onApplyCustomComposition(customCompositionConfig, 'active-cue')}
                className="px-2 py-0.5 text-[10px] font-semibold bg-white border border-indigo-300 text-indigo-700 rounded hover:bg-indigo-100"
              >
                Áp dụng câu này
              </button>
              <button
                type="button"
                onClick={() => onApplyCustomComposition(customCompositionConfig, 'all')}
                className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                Áp dụng cả bài
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <select
              aria-label="Chọn component từ Kho cho Xem trước"
              value={customCompositionConfig.variant}
              onChange={(e) =>
                onChangeCustomComposition({
                  ...customCompositionConfig,
                  variant: e.target.value as IllustrationVariant,
                })
              }
              className="px-2 py-1 text-[11px] bg-white border border-slate-200 rounded"
            >
              {vectorCatalog.map((item) => (
                <option key={item.variant} value={item.variant}>
                  {item.label} ({item.category})
                </option>
              ))}
            </select>
            <select
              aria-label="Chọn Icon minh họa cho Xem trước"
              value={customCompositionConfig.sceneIcon || 'sparkles'}
              onChange={(e) =>
                onChangeCustomComposition({
                  ...customCompositionConfig,
                  sceneIcon: e.target.value as IllustrationSceneIcon,
                })
              }
              className="px-2 py-1 text-[11px] bg-white border border-slate-200 rounded"
            >
              {SCENE_ICON_KEYWORDS.map((ic) => (
                <option key={ic.icon} value={ic.icon}>
                  {ic.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              aria-label="Tiêu đề component tùy biến"
              value={customCompositionConfig.title || ''}
              onChange={(e) =>
                onChangeCustomComposition({ ...customCompositionConfig, title: e.target.value })
              }
              placeholder="Tiêu đề thẻ..."
              className="flex-1 min-w-0 px-2 py-1 text-[11px] bg-white border border-slate-200 rounded"
            />
            <input
              type="text"
              aria-label="Nội dung thẻ tùy biến"
              value={customCompositionConfig.speechText || ''}
              onChange={(e) =>
                onChangeCustomComposition({ ...customCompositionConfig, speechText: e.target.value })
              }
              placeholder="Chữ nhấn / ghi chú..."
              className="flex-1 min-w-0 px-2 py-1 text-[11px] bg-white border border-slate-200 rounded"
            />
            <input
              type="color"
              aria-label="Màu nhấn component tùy biến"
              value={customCompositionConfig.accentColor || '#4F46E5'}
              onChange={(e) =>
                onChangeCustomComposition({ ...customCompositionConfig, accentColor: e.target.value })
              }
              className="w-7 h-6 p-0.5 bg-white border border-slate-200 rounded cursor-pointer shrink-0"
            />
          </div>
        </div>
      )}

      {/* Background Presets, Video/Image Upload & Learning Opacity + Subtitle Display */}
      <div className="w-full pt-2 space-y-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-2 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="text-[11px] font-semibold text-slate-700">
              Nền không khí / Video &amp; Ảnh nền
            </span>
            <div className="flex items-center gap-1.5">
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
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-100 disabled:opacity-50"
              >
                <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                <span>
                  {isProcessingBg
                    ? `Đang xử lý ${effectiveAspect}...`
                    : project.backgroundImage && project.backgroundImage.kind !== 'preset'
                      ? `${project.backgroundImage.kind === 'video' ? 'Video' : 'Ảnh'}: ${project.backgroundImage.fileName || 'Đã nạp'}`
                      : `Tải ảnh / video`}
                </span>
              </button>
              {project.backgroundImage && (
                <button
                  type="button"
                  onClick={() => {
                    setBgUploadError(null);
                    onChangeBackgroundImage(undefined);
                  }}
                  aria-label="Xóa ảnh hoặc video nền"
                  className="p-1 text-slate-400 hover:text-red-600 rounded bg-white border border-slate-200"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1 max-h-[112px] overflow-y-auto pr-1">
            <button
              type="button"
              onClick={() => onChangeBackgroundImage(undefined)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded border transition-colors ${
                !project.backgroundImage
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              Mặc định
            </button>
            {BACKGROUND_PRESETS.map((preset) => {
              const isActive =
                project.backgroundImage?.kind === 'preset' &&
                project.backgroundImage.presetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() =>
                    onChangeBackgroundImage({
                      kind: 'preset',
                      presetId: preset.id as BackgroundPresetId,
                      fileName: preset.name,
                      fit: 'cover',
                      scrimOpacity: project.backgroundImage?.scrimOpacity ?? 0.2,
                      learningScrimOpacity: project.backgroundImage?.learningScrimOpacity ?? 0.45,
                    })
                  }
                  title={preset.shortDesc}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded border transition-colors ${
                    isActive
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/40"
                    style={{ background: preset.previewGradient }}
                  />
                  <span>{preset.name}</span>
                </button>
              );
            })}
          </div>

          {project.backgroundImage && (
            <div className="flex flex-wrap items-center gap-2.5 pt-1 border-t border-slate-200/70 text-[10px]">
              {project.backgroundImage.kind !== 'preset' && (
                <button
                  type="button"
                  onClick={() =>
                    onChangeBackgroundImage({
                      ...project.backgroundImage!,
                      fit: (project.backgroundImage!.fit === 'contain' ? 'cover' : 'contain') as BackgroundFitMode,
                    })
                  }
                  className="px-2 py-0.5 font-semibold bg-white border border-slate-200 rounded text-slate-700 hover:bg-slate-50"
                >
                  {project.backgroundImage.fit === 'contain' ? 'Vừa khung' : 'Phủ đầy'}
                </button>
              )}
              <label className="flex items-center gap-1.5 text-slate-600">
                <span>Độ tối chung:</span>
                <input
                  type="range"
                  aria-label="Độ tối lớp phủ ảnh nền"
                  min={0}
                  max={0.7}
                  step={0.05}
                  value={project.backgroundImage.scrimOpacity ?? 0.2}
                  onChange={(e) =>
                    onChangeBackgroundImage({
                      ...project.backgroundImage!,
                      scrimOpacity: Number(e.target.value),
                    })
                  }
                  className="w-14 accent-indigo-600 h-1"
                />
              </label>
              <label
                className="flex items-center gap-1.5 text-slate-700 font-medium"
                title="Tự động tăng độ tối nền khi hiện chữ học để tập trung vào nội dung"
              >
                <span>Opacity tập trung học:</span>
                <input
                  type="range"
                  aria-label="Độ tối nền khi vào phần học"
                  min={0}
                  max={0.85}
                  step={0.05}
                  value={project.backgroundImage.learningScrimOpacity ?? 0.45}
                  onChange={(e) =>
                    onChangeBackgroundImage({
                      ...project.backgroundImage!,
                      learningScrimOpacity: Number(e.target.value),
                    })
                  }
                  className="w-16 accent-indigo-600 h-1"
                />
                <span className="font-mono tabular-nums">
                  {Math.round((project.backgroundImage.learningScrimOpacity ?? 0.45) * 100)}%
                </span>
              </label>
            </div>
          )}
        </div>

        {onChangeSubtitleConfig && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2 grid grid-cols-3 gap-2 text-[10px]">
            <div>
              <label
                htmlFor="studio-sub-position"
                className="block font-semibold text-slate-600 mb-0.5"
              >
                Vị trí Sub
              </label>
              <select
                id="studio-sub-position"
                aria-label="Vị trí hiển thị phụ đề"
                value={activeSubtitleConfig.position}
                onChange={(e) =>
                  onChangeSubtitleConfig({
                    ...activeSubtitleConfig,
                    position: e.target.value as SubtitlePosition,
                  })
                }
                className="w-full px-1.5 py-1 text-[11px] bg-white border border-slate-200 rounded"
              >
                <option value="top">Trên</option>
                <option value="center">Giữa</option>
                <option value="bottom">Dưới</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="studio-sub-size"
                className="block font-semibold text-slate-600 mb-0.5"
              >
                Cỡ chữ Sub
              </label>
              <select
                id="studio-sub-size"
                aria-label="Độ to nhỏ phụ đề"
                value={activeSubtitleConfig.size}
                onChange={(e) =>
                  onChangeSubtitleConfig({
                    ...activeSubtitleConfig,
                    size: e.target.value as SubtitleSize,
                  })
                }
                className="w-full px-1.5 py-1 text-[11px] bg-white border border-slate-200 rounded"
              >
                <option value="sm">Nhỏ</option>
                <option value="md">Vừa</option>
                <option value="lg">Lớn</option>
                <option value="xl">Rất lớn</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="studio-sub-box"
                className="block font-semibold text-slate-600 mb-0.5"
              >
                Kiểu khung chữ
              </label>
              <select
                id="studio-sub-box"
                aria-label="Kiểu nền khung chữ phụ đề"
                value={activeSubtitleConfig.boxStyle || 'card'}
                onChange={(e) =>
                  onChangeSubtitleConfig({
                    ...activeSubtitleConfig,
                    boxStyle: e.target.value as SubtitleBoxStyle,
                  })
                }
                className="w-full px-1.5 py-1 text-[11px] bg-white border border-slate-200 rounded"
              >
                <option value="clean">Chữ nổi (Plain)</option>
                <option value="card">Thẻ bo góc</option>
                <option value="pill">Thanh gọn</option>
              </select>
            </div>
          </div>
        )}
      </div>
      {bgUploadError && (
        <p className="w-full mt-1.5 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
          {bgUploadError}
        </p>
      )}

      {/* Intro, Outro & Watermark (Tùy chọn) for Studio 9:16 */}
      {onChangeWatermark && (
        <div className="w-full pt-2">
          {(() => {
            const activeIntroSec = getEffectiveIntroSeconds(project);
            const activeOutroSec = getEffectiveOutroSeconds(project);
            const anyBrandingActive =
              activeIntroSec > 0 || activeOutroSec > 0 || wmConfig.watermarkEnabled;
            return (
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    data-testid="studio-intro-outro-toggle"
                    onClick={() => setIsWatermarkOpen((o) => !o)}
                    className="inline-flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-700 hover:text-indigo-700"
                  >
                    <Stamp className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>Intro, Outro &amp; Watermark (Tùy chọn)</span>
                    {activeIntroSec > 0 && (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold bg-indigo-100 text-indigo-700 rounded">
                        Intro {activeIntroSec.toFixed(1).replace(/\.0$/, '')}s
                      </span>
                    )}
                    {activeOutroSec > 0 && (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold bg-violet-100 text-violet-700 rounded">
                        Outro {activeOutroSec.toFixed(1).replace(/\.0$/, '')}s
                      </span>
                    )}
                    {wmConfig.watermarkEnabled && (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-700 rounded">
                        WM
                      </span>
                    )}
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      data-testid="studio-intro-outro-preset-btn"
                      onClick={() => {
                        if (anyBrandingActive) {
                          onChangeWatermark({
                            ...wmConfig,
                            introSeconds: 0,
                            outroSeconds: 0,
                            watermarkEnabled: false,
                          });
                        } else {
                          onChangeWatermark({
                            ...DEFAULT_WATERMARK_CONFIG,
                            ...wmConfig,
                            introSeconds: Math.max(2.5, Number(wmConfig.introSeconds || 0)),
                            introBadge: wmConfig.introBadge?.trim() || 'BÀI HỌC HÔM NAY',
                            introTitle: wmConfig.introTitle?.trim() || '',
                            introSubtitle: wmConfig.introSubtitle?.trim() || 'Nghe kỹ & luyện nói theo nhịp',
                            outroSeconds: Math.max(3, Number(wmConfig.outroSeconds || 0)),
                            outroLine1: wmConfig.outroLine1?.trim() || 'Thanks for watching!',
                            outroLine2: wmConfig.outroLine2?.trim() || 'Subscribe & Practice daily',
                            watermarkEnabled: true,
                            watermarkText: wmConfig.watermarkText?.trim() || '@KineticSub',
                          });
                          setIsWatermarkOpen(true);
                        }
                      }}
                      className="px-2 py-0.5 text-[10px] font-semibold bg-white border border-slate-200 rounded text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      {anyBrandingActive ? 'Tắt hết' : 'Bật trọn bộ mẫu'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsWatermarkOpen((o) => !o)}
                      className="text-[10px] font-medium text-indigo-600 hover:underline"
                    >
                      {isWatermarkOpen ? 'Thu gọn' : 'Chỉnh sửa'}
                    </button>
                  </div>
                </div>

                {isWatermarkOpen && (
                  <div className="pt-2 border-t border-slate-200/80 space-y-2.5 text-[11px]">
                    {/* 1. Intro Block */}
                    <div className="rounded-md bg-white border border-slate-200/80 p-2 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-indigo-800">Intro đầu video</span>
                        <div className="flex items-center gap-1.5">
                          <label className="text-[10px] text-slate-600">Thời lượng (s):</label>
                          <input
                            type="number"
                            aria-label="Thời lượng Intro giây"
                            min={0}
                            max={6}
                            step={0.5}
                            value={wmConfig.introSeconds ?? 0}
                            onChange={(e) =>
                              onChangeWatermark({
                                ...wmConfig,
                                introSeconds: Math.max(0, Math.min(6, Number(e.target.value) || 0)),
                                introBadge: wmConfig.introBadge ?? 'BÀI HỌC HÔM NAY',
                              })
                            }
                            className="w-14 px-1.5 py-0.5 text-[11px] bg-slate-50 border border-slate-200 rounded font-mono"
                          />
                          {(wmConfig.introSeconds ?? 0) > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                onSeek(Math.min(0.8, Math.max(0.25, (wmConfig.introSeconds ?? 2) * 0.45)))
                              }
                              className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded hover:bg-indigo-100"
                            >
                              Xem Intro
                            </button>
                          )}
                        </div>
                      </div>
                      {(wmConfig.introSeconds ?? 0) > 0 && (
                        <div className="space-y-1.5">
                          <div className="grid grid-cols-2 gap-1.5">
                            <input
                              type="text"
                              aria-label="Nhãn Intro"
                              value={wmConfig.introBadge ?? ''}
                              onChange={(e) =>
                                onChangeWatermark({
                                  ...wmConfig,
                                  introBadge: e.target.value,
                                })
                              }
                              placeholder="Nhãn nhỏ (VD: BÀI HỌC HÔM NAY)"
                              className="px-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded"
                            />
                            <input
                              type="text"
                              aria-label="Phụ đề Intro"
                              value={wmConfig.introSubtitle ?? ''}
                              onChange={(e) =>
                                onChangeWatermark({
                                  ...wmConfig,
                                  introSubtitle: e.target.value,
                                })
                              }
                              placeholder="Phụ đề ngắn (tùy chọn)"
                              className="px-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded"
                            />
                          </div>
                          <input
                            type="text"
                            aria-label="Tiêu đề chính Intro"
                            value={wmConfig.introTitle ?? ''}
                            onChange={(e) =>
                              onChangeWatermark({
                                ...wmConfig,
                                introTitle: e.target.value,
                              })
                            }
                            placeholder={`Tiêu đề Intro (để trống sẽ tự lấy: "${project.title.slice(0, 32)}")`}
                            className="w-full px-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded"
                          />
                        </div>
                      )}
                    </div>

                    {/* 2. Outro Block */}
                    <div className="rounded-md bg-white border border-slate-200/80 p-2 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-violet-800">Outro cuối video</span>
                        <div className="flex items-center gap-1.5">
                          <label className="text-[10px] text-slate-600">Thời lượng (s):</label>
                          <input
                            type="number"
                            aria-label="Thời lượng Outro giây"
                            min={0}
                            max={10}
                            step={0.5}
                            value={wmConfig.outroSeconds}
                            onChange={(e) =>
                              onChangeWatermark({
                                ...wmConfig,
                                outroSeconds: Math.max(0, Math.min(10, Number(e.target.value) || 0)),
                              })
                            }
                            className="w-14 px-1.5 py-0.5 text-[11px] bg-slate-50 border border-slate-200 rounded font-mono"
                          />
                          {wmConfig.outroSeconds > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                onSeek(
                                  Math.max(
                                    0,
                                    project.duration - Math.max(0.3, wmConfig.outroSeconds * 0.45),
                                  ),
                                )
                              }
                              className="px-2 py-0.5 text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200 rounded hover:bg-violet-100"
                            >
                              Xem Outro
                            </button>
                          )}
                        </div>
                      </div>
                      {wmConfig.outroSeconds > 0 && (
                        <div className="grid grid-cols-2 gap-1.5">
                          <input
                            type="text"
                            aria-label="Outro dòng 1"
                            value={wmConfig.outroLine1}
                            onChange={(e) =>
                              onChangeWatermark({
                                ...wmConfig,
                                outroLine1: e.target.value,
                              })
                            }
                            placeholder="Outro dòng 1"
                            className="px-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded"
                          />
                          <input
                            type="text"
                            aria-label="Outro dòng 2"
                            value={wmConfig.outroLine2}
                            onChange={(e) =>
                              onChangeWatermark({
                                ...wmConfig,
                                outroLine2: e.target.value,
                              })
                            }
                            placeholder="Outro dòng 2"
                            className="px-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded"
                          />
                        </div>
                      )}
                    </div>

                    {/* 3. Watermark Block */}
                    <div className="rounded-md bg-white border border-slate-200/80 p-2 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={wmConfig.watermarkEnabled}
                            onChange={(e) =>
                              onChangeWatermark({
                                ...wmConfig,
                                watermarkEnabled: e.target.checked,
                              })
                            }
                            className="rounded border-slate-300 text-indigo-600"
                          />
                          <span>Hiện Watermark</span>
                        </label>
                        <input
                          type="text"
                          aria-label="Nội dung Watermark"
                          value={wmConfig.watermarkText}
                          onChange={(e) =>
                            onChangeWatermark({
                              ...wmConfig,
                              watermarkEnabled: true,
                              watermarkText: e.target.value,
                            })
                          }
                          placeholder="@TenKenh"
                          className="flex-1 min-w-[100px] px-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded"
                        />
                        <select
                          aria-label="Góc Watermark"
                          value={wmConfig.watermarkCorner}
                          onChange={(e) =>
                            onChangeWatermark({
                              ...wmConfig,
                              watermarkCorner: e.target.value as WatermarkCorner,
                            })
                          }
                          className="px-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded"
                        >
                          <option value="top-left">Trên Trái</option>
                          <option value="top-right">Trên Phải</option>
                          <option value="bottom-left">Dưới Trái</option>
                          <option value="bottom-right">Dưới Phải</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-600 shrink-0">
                          Độ mờ Watermark: {Math.round(wmConfig.watermarkOpacity * 100)}%
                        </span>
                        <input
                          type="range"
                          aria-label="Độ mờ Watermark"
                          min={0.15}
                          max={1}
                          step={0.05}
                          value={wmConfig.watermarkOpacity}
                          onChange={(e) =>
                            onChangeWatermark({
                              ...wmConfig,
                              watermarkOpacity: Number(e.target.value),
                            })
                          }
                          className="flex-1 accent-indigo-600 h-1"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* BGM Preset + Upload + Volume (Default Soft Rain 3%) */}
      {onChangeBgmPreset && onChangeBgmVolume && (
        <div className="w-full pt-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2 space-y-1.5 text-[11px]">
            <div className="flex flex-wrap items-center gap-2">
              <Volume2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <select
                aria-label="Nhạc nền Studio"
                value={customBgmFile ? 'custom' : bgmPreset}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'custom') return;
                  onChangeCustomBgmFile?.(null);
                  onChangeBgmPreset(val as StudioBgmPresetId);
                }}
                className="flex-1 min-w-[140px] px-2 py-1 text-[11px] bg-white border border-slate-200 rounded"
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

              {onChangeCustomBgmFile && (
                <>
                  <input
                    ref={bgmInputRef}
                    type="file"
                    accept="audio/*,.mp3,.wav,.m4a,.ogg"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onChangeCustomBgmFile(f);
                      e.currentTarget.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => bgmInputRef.current?.click()}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-700 shrink-0"
                  >
                    <Upload className="w-3 h-3 text-indigo-600" />
                    <span>{customBgmFile ? 'Đổi nhạc' : 'Tải nhạc nền'}</span>
                  </button>
                  {customBgmFile && (
                    <button
                      type="button"
                      aria-label="Xóa nhạc nền tải lên Studio"
                      onClick={() => onChangeCustomBgmFile(null)}
                      className="p-1 text-slate-400 hover:text-rose-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-600">
              <span className="shrink-0">Âm lượng nhạc: {Math.round(bgmVolume * 100)}%</span>
              <input
                type="range"
                aria-label="Âm lượng nhạc nền Studio"
                disabled={bgmPreset === 'none' && !customBgmFile}
                min={0}
                max={0.45}
                step={0.01}
                value={bgmVolume}
                onChange={(e) => onChangeBgmVolume(Number(e.target.value))}
                className="flex-1 accent-indigo-600 h-1 disabled:opacity-40"
              />
            </div>
          </div>
        </div>
      )}
        </>
      )}

      {/* Live Aspect-Adaptive Preview Canvas */}
      <div className={`my-2.5 flex flex-col items-center justify-center w-full gap-2 ${isFullscreen ? 'flex-1 min-h-0 max-w-6xl' : ''}`}>
        <div
          data-aspect-ratio={effectiveAspect}
          className={`relative overflow-hidden border border-slate-200 shadow-sm bg-slate-100 ${
            isFullscreen
              ? effectiveAspect === '16:9'
                ? 'w-full max-w-[1040px] max-h-[calc(100vh-210px)] aspect-video rounded-2xl'
                : effectiveAspect === '1:1'
                  ? 'h-[calc(100vh-210px)] max-w-[680px] aspect-square rounded-2xl'
                  : effectiveAspect === '4:5'
                    ? 'h-[calc(100vh-210px)] max-w-[540px] aspect-[4/5] rounded-2xl'
                    : 'h-[calc(100vh-210px)] max-w-[460px] aspect-[9/16] rounded-[28px]'
              : effectiveAspect === '16:9'
                ? 'w-full max-w-[540px] aspect-video rounded-2xl'
                : effectiveAspect === '1:1'
                  ? 'w-full max-w-[380px] aspect-square rounded-2xl'
                  : effectiveAspect === '4:5'
                    ? 'w-full max-w-[330px] aspect-[4/5] rounded-2xl'
                    : 'h-[515px] aspect-[9/16] rounded-[28px]'
          }`}
        >
          <canvas
            ref={canvasRef}
            data-testid="kinetic-stage-canvas"
            width={stageDims.width}
            height={stageDims.height}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="w-full h-full block cursor-grab active:cursor-grabbing touch-none"
          />
          {isExportingVideo && (
            <div className="absolute inset-0 bg-slate-900/75 backdrop-blur-[2px] flex flex-col items-center justify-center text-white p-5 text-center">
              <p className="text-sm font-semibold mb-2">
                {exportStageLabel || 'Đang render Video MP4...'}
              </p>
              <div className="w-48 h-2 bg-white/25 rounded-full overflow-hidden mb-1.5">
                <div
                  className="h-full bg-indigo-400 transition-all duration-150"
                  style={{ width: `${Math.round(exportProgress * 100)}%` }}
                />
              </div>
              <span className="text-xs tabular-nums text-white/85 mb-4">
                {Math.round(exportProgress * 100)}%
              </span>
              {onCancelExportVideo && (
                <button
                  type="button"
                  onClick={onCancelExportVideo}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition-colors"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>Hủy render</span>
                </button>
              )}
            </div>
          )}
        </div>

        {(() => {
          const selectedEl = selectedElementId
            ? project.elements.find((el) => el.id === selectedElementId) ?? null
            : null;
          const lessonTime = Math.max(0, currentTime - getEffectiveIntroSeconds(project));
          const resolvedMap = resolveElementLayoutForAspect(
            project.elements,
            lessonTime,
            effectiveAspect,
            project.subtitleConfig,
            project.compositionId,
          );
          const resolvedLayout = selectedEl ? resolvedMap.get(selectedEl.id) || selectedEl.layout : null;
          const resolvedTitleBox = resolveLessonTitleBox(project, effectiveAspect, currentTime);

          const overlaps = detectActiveStageOverlaps(
            project.elements,
            resolvedMap,
            lessonTime,
            resolvedTitleBox
              ? {
                  x: resolvedTitleBox.x,
                  y: resolvedTitleBox.y,
                  width: resolvedTitleBox.width,
                  height: resolvedTitleBox.height,
                }
              : null,
          );
          const overlapSig = overlaps
            .map((w) => `${w.firstId}-${w.secondId}:${Math.round(w.overlapPx)}`)
            .join('|');
          const hasVisibleOverlap = overlaps.length > 0 && overlapSig !== dismissedOverlapSig;
          const pinIdForReflow =
            selectedOverlayZone === 'title'
              ? '__title__'
              : selectedEl?.id || overlaps[0]?.firstId || '__title__';

          const handleInlineUpdateElement = (id: string, patch: Partial<SceneElement>) => {
            onUpdateElement?.(id, patch);
            if (autoReflowOnMove && patch.layout) {
              const updatedElements = project.elements.map((el) =>
                el.id === id ? { ...el, ...patch } : el,
              );
              runReflowFromPin(id, updatedElements);
            }
          };

          const handleInlineChangeTitleLayout = (next?: TitleOverlayLayout) => {
            onChangeTitleLayout?.(next);
            if (autoReflowOnMove && next && !next.hidden) {
              runReflowFromPin('__title__', undefined, next);
            }
          };

          const adjustSelectedScale = (delta: number) => {
            if (!selectedEl || !onUpdateElement) return;
            const currentScale = resolvedLayout?.scale ?? selectedEl.layout.scale ?? 1;
            const nextScale = Number(Math.max(0.25, Math.min(2.4, currentScale + delta)).toFixed(2));
            handleInlineUpdateElement(selectedEl.id, {
              layout: {
                ...(resolvedLayout || selectedEl.layout),
                scale: nextScale,
                manualPosition: true,
              },
            });
          };

          const isCartoonHostSelected =
            selectedEl?.props.kind === 'illustration-prop' &&
            selectedEl.props.variant === 'cartoon-host';

          return (
            <>
              <div
                data-testid="studio-title-and-reflow-bar"
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-[10.5px]"
              >
                <button
                  type="button"
                  data-testid="studio-select-title-btn"
                  onClick={() => {
                    onSelectElement(null);
                    onSelectOverlayZone?.(selectedOverlayZone === 'title' ? null : 'title');
                  }}
                  className={`inline-flex items-center gap-1 px-2 py-1 font-semibold rounded border transition-colors ${
                    selectedOverlayZone === 'title'
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

              {hasVisibleOverlap && (
                <div
                  data-testid="studio-overlap-warning"
                  className="w-full px-3 py-2 rounded-lg bg-amber-50 border border-amber-300 text-[11px] text-amber-950 flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span className="font-medium truncate">
                      Đang bị đè lên nhau: <strong>{overlaps[0].firstLabel}</strong> ↔{' '}
                      <strong>{overlaps[0].secondLabel}</strong> (~{overlaps[0].overlapPx}px)
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {onApplyReflowElements && (
                      <button
                        type="button"
                        data-testid="studio-reflow-btn"
                        onClick={() => runReflowFromPin(pinIdForReflow)}
                        className="px-2 py-0.5 text-[10.5px] font-semibold bg-amber-600 text-white rounded hover:bg-amber-700"
                      >
                        Tự động đẩy tránh đè
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDismissedOverlapSig(overlapSig)}
                      className="px-2 py-0.5 text-[10.5px] font-semibold bg-white border border-amber-300 text-amber-900 rounded hover:bg-amber-100"
                    >
                      Giữ nguyên
                    </button>
                  </div>
                </div>
              )}

              {selectedEl && resolvedLayout && (
                <div
                  data-testid="studio-layout-toolbar"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-[10px]"
                >
                  <span className="text-slate-600 font-medium">
                    {selectedEl.label} ·{' '}
                    <span className="font-mono font-semibold text-indigo-700 tabular-nums">
                      x:{Math.round(resolvedLayout.x)}, y:{Math.round(resolvedLayout.y)} ·{' '}
                      {Math.round((resolvedLayout.scale || 1) * 100)}%
                    </span>
                    {selectedEl.type === 'karaoke-card' && (
                      <span className="text-slate-400"> · Chỉ thẻ này</span>
                    )}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {onUpdateElement && (
                      <>
                        <button
                          type="button"
                          onClick={() => adjustSelectedScale(-0.1)}
                          aria-label="Thu nhỏ thành phần đang chọn"
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 font-semibold text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100"
                        >
                          <ZoomOut className="w-3 h-3" />
                          <span>Thu nhỏ</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustSelectedScale(0.1)}
                          aria-label="Phóng to thành phần đang chọn"
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 font-semibold text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100"
                        >
                          <ZoomIn className="w-3 h-3" />
                          <span>Phóng to</span>
                        </button>
                      </>
                    )}
                    {isCartoonHostSelected && onOpenAnimationStudio && (
                      <button
                        type="button"
                        onClick={() => {
                          const data =
                            selectedEl.props.kind === 'illustration-prop'
                              ? selectedEl.props.data
                              : undefined;
                          onOpenAnimationStudio(
                            data?.cartoonAction,
                            data?.cartoonAnimationSpec,
                            selectedEl.id,
                          );
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded hover:bg-violet-100"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Popup Animation</span>
                      </button>
                    )}
                    {selectedEl.type === 'karaoke-card' && onApplySubtitlePositionToAll && (
                      <button
                        type="button"
                        data-testid="studio-apply-sub-all"
                        onClick={() =>
                          onApplySubtitlePositionToAll(
                            Math.round(resolvedLayout.x),
                            Math.round(resolvedLayout.y),
                          )
                        }
                        className="px-2 py-0.5 font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded hover:bg-indigo-100"
                      >
                        Áp dụng cho tất cả Sub
                      </button>
                    )}
                    {selectedEl.layout.manualPosition && onResetElementPosition && (
                      <button
                        type="button"
                        onClick={() => onResetElementPosition(selectedEl.id)}
                        className="px-2 py-0.5 font-semibold text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100"
                      >
                        Đặt lại vị trí
                      </button>
                    )}
                  </div>
                </div>
              )}

              <InlinePreviewElementEditor
                selectedElement={selectedEl}
                resolvedLayout={resolvedLayout}
                selectedOverlayZone={selectedOverlayZone}
                watermarkConfig={wmConfig}
                projectTitle={project.title}
                titleLayout={project.titleLayout}
                resolvedTitleBox={resolvedTitleBox}
                onChangeTitle={onChangeTitle}
                onChangeTitleLayout={handleInlineChangeTitleLayout}
                onChangeWatermark={onChangeWatermark}
                onUpdateElement={handleInlineUpdateElement}
                onResetElementPosition={onResetElementPosition}
                onDeleteElement={onDeleteElement}
                onClearSelection={() => {
                  onSelectElement(null);
                  onSelectOverlayZone?.(null);
                }}
                onOpenAnimationStudio={onOpenAnimationStudio}
                stageWidth={stageDims.width}
                stageHeight={stageDims.height}
              />
            </>
          );
        })()}
      </div>

      {/* Transport & Scrubber */}
      <div className={`w-full pt-2.5 border-t border-slate-100 space-y-2.5 shrink-0 ${isFullscreen ? 'max-w-5xl' : ''}`}>
        <div className="flex items-center gap-3">
          <input
            type="range"
            aria-label="Thanh tua thời gian"
            min={0}
            max={project.duration}
            step={0.02}
            value={currentTime}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="flex-1 accent-indigo-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
          />
          <span className="text-xs font-mono text-slate-600 tabular-nums shrink-0">
            {fmtTime(currentTime)} / {fmtTime(project.duration)}
          </span>
        </div>

        {!isFullscreen && (
        <>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          <select
            aria-label="Khung hình xuất MP4"
            disabled={isExportingVideo}
            value={effectiveAspect}
            onChange={(e) =>
              onChangeMp4Settings({
                ...mp4Settings,
                aspectRatio: e.target.value as ExportAspectRatioId,
              })
            }
            className="w-full px-2 py-1.5 text-[11px] font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {ASPECT_RATIO_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.id}
              </option>
            ))}
          </select>

          <select
            aria-label="Độ phân giải xuất MP4"
            disabled={isExportingVideo}
            value={mp4Settings.resolution}
            onChange={(e) =>
              onChangeMp4Settings({
                ...mp4Settings,
                resolution: e.target.value as Mp4ExportSettings['resolution'],
              })
            }
            className="w-full px-2 py-1.5 text-[11px] font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {RESOLUTION_OPTIONS.map((opt) => {
              const dims = resolveDimensionsForAspect(opt.width, opt.height, effectiveAspect);
              return (
                <option key={opt.id} value={opt.id}>
                  {opt.id} ({dims.width}×{dims.height})
                </option>
              );
            })}
          </select>

          <select
            aria-label="Chất lượng xuất MP4"
            disabled={isExportingVideo}
            value={mp4Settings.quality}
            onChange={(e) =>
              onChangeMp4Settings({
                ...mp4Settings,
                quality: e.target.value as Mp4ExportSettings['quality'],
              })
            }
            className="w-full px-2 py-1.5 text-[11px] font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {QUALITY_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            aria-label="Tốc độ khung hình FPS xuất MP4"
            disabled={isExportingVideo}
            value={mp4Settings.fps}
            onChange={(e) =>
              onChangeMp4Settings({
                ...mp4Settings,
                fps: Number(e.target.value) as Mp4ExportSettings['fps'],
              })
            }
            className="w-full px-2 py-1.5 text-[11px] font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {FPS_OPTIONS.map((fpsVal) => (
              <option key={fpsVal} value={fpsVal}>
                {fpsVal} fps
              </option>
            ))}
          </select>
        </div>

        {(() => {
          const est = estimateMp4FileSize(Math.max(1, project.duration || 0), {
            ...mp4Settings,
            aspectRatio: effectiveAspect,
          });
          const qualOpt = QUALITY_OPTIONS.find((q) => q.id === mp4Settings.quality);
          return (
            <div
              data-testid="studio-mp4-estimate-strip"
              className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[10.5px]"
            >
              <span className="text-slate-600">
                <strong className="text-slate-800">{qualOpt?.label || 'Chuẩn'}:</strong> {est.qualityDescription}
              </span>
              <span className="font-mono font-semibold text-indigo-700 tabular-nums">
                Ước lượng: {est.mbLabel} ({est.rangeLabel})
              </span>
            </div>
          );
        })()}
        </>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onTogglePlay}
              disabled={isExportingVideo}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Tạm dừng</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Phát thử</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onRestart}
              disabled={isExportingVideo}
              aria-label="Phát lại từ đầu"
              className="p-2 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {isExportingVideo && onCancelExportVideo ? (
            <button
              type="button"
              onClick={onCancelExportVideo}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-700 transition-colors whitespace-nowrap"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Hủy render</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={isExportingVideo}
              onClick={onExportVideo}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExportingVideo ? 'Đang render MP4...' : 'Render MP4'}</span>
            </button>
          )}
        </div>

        {/* Companion .txt Description & Hashtags */}
        {descriptionOutput && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2 space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsDescOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-indigo-700"
              >
                <FileText className="w-3.5 h-3.5 text-indigo-600" />
                <span>
                  Mô tả &amp; Hashtag (.txt · {descriptionOutput.learningLangCode.toUpperCase()})
                </span>
              </button>
              <div className="flex items-center gap-1.5">
                {onChangeDescriptionStyle && (
                  <select
                    aria-label="Kiểu mô tả video Studio"
                    value={descriptionStyle}
                    onChange={(e) => onChangeDescriptionStyle(e.target.value as VideoDescriptionStyle)}
                    className="px-1.5 py-0.5 text-[10px] bg-white border border-slate-200 rounded text-slate-700"
                  >
                    <option value="auto">Tự động</option>
                    <option value="hook-bullets">Hook + ✔</option>
                    <option value="training-guide">🏋️ Mục lục</option>
                    <option value="phrase-pack">📌 Mẫu câu</option>
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(descriptionOutput.txtContent);
                    setCopiedDescTag(true);
                    setTimeout(() => setCopiedDescTag(false), 1600);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-white border border-slate-200 rounded hover:bg-indigo-50 text-slate-700"
                >
                  {copiedDescTag ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedDescTag ? 'Đã chép' : 'Sao chép'}</span>
                </button>
              </div>
            </div>
            {isDescOpen ? (
              <div className="space-y-1.5">
                <textarea
                  readOnly
                  rows={5}
                  value={descriptionOutput.txtContent}
                  className="w-full p-2 text-[10px] leading-relaxed bg-white border border-slate-200 rounded text-slate-800 resize-y"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      const stem = buildLeveledOutputStem({
                        title: project.title || project.id,
                        fallback: 'Studio Video',
                      });
                      downloadTextAsPlainFile(descriptionOutput.txtContent, `${stem}.txt`);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-indigo-50 border border-indigo-200 text-indigo-700 rounded hover:bg-indigo-100"
                  >
                    <Download className="w-3 h-3" />
                    <span>Tải .txt</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-[10px] text-slate-500 truncate">
                {descriptionOutput.hashtags.slice(0, 4).join(' ')} · Xuất cùng tên video
              </div>
            )}
          </div>
        )}

        {lastExportSummary && !isExportingVideo && (
          <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2 text-[11px] text-emerald-900">
            <div className="min-w-0">
              <div className="font-semibold truncate">
                ✓ Đã xuất {lastExportSummary.fileName} ({lastExportSummary.outputCount} file trong Output)
              </div>
              {(lastExportSummary.savedPath || lastExportSummary.outputDir) && (
                <div className="text-[10px] text-emerald-700 font-mono truncate">
                  Lưu tại: {lastExportSummary.savedPath || lastExportSummary.outputDir}
                </div>
              )}
            </div>
            {onOpenOutputFolder && (
              <button
                type="button"
                onClick={onOpenOutputFolder}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold bg-white border border-emerald-300 text-emerald-800 rounded-md hover:bg-emerald-100 shrink-0"
              >
                <FolderOpen className="w-3 h-3" />
                <span>Mở thư mục Output</span>
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
