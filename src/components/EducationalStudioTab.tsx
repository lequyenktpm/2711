import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FileAudio,
  Film,
  FolderOpen,
  FolderPlus,
  Globe,
  Image as ImageIcon,
  Layers,
  Link2,
  Loader2,
  Music,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Volume2,
  Wand2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { PasteButton } from './PasteButton';
import {
  buildEduKaraokeAss,
  buildEstimatedReadingWords,
  computeReadingTimelineMetrics,
  EduKaraokePosition,
  EduKaraokeSize,
  EduWatermarkCorner,
  EduWatermarkOutroConfig,
  getReadingUiStrings,
  hitTestReadingAlongZone,
  isDefaultReadingOutroPair,
  KARAOKE_EFFECT_PRESETS,
  READING_BOOK_FRAMES,
  READING_BOOK_PALETTES,
  READING_POINTER_STYLES,
  ReadingAlongHitZone,
  ReadingBookFrameId,
  ReadingBookPalette,
  ReadingIllustrationStyle,
  ReadingPointerStyleId,
  renderReadingAlongFrame,
} from '../engine/eduStudioEffects';
import {
  ASPECT_RATIO_OPTIONS,
  DEFAULT_MP4_EXPORT_SETTINGS,
  ExportAspectRatioId,
  ExportFpsOption,
  ExportQualityId,
  ExportResolutionId,
  resolveMp4EncodingParams,
} from '../engine/mp4Config';
import { ExportAbortedError, exportProjectToServerDisk } from '../engine/mp4Exporter';
import {
  cleanDownloadFileName,
  cleanOutputTitleStem,
  TAB_OUTPUT_SUBFOLDERS,
} from '../engine/outputNaming';
import {
  buildReadingWebAiPrompt,
  cleanReadingWorksheetInput,
  computeReadingTargetLength,
  parseReadingWebAiResponse,
  READING_FORMAT_OPTIONS,
  READING_STARTER_BY_LANG,
  ReadingFormatCategory,
  ReadingLearningLang,
} from '../engine/readingPromptBuilder';
import {
  getLevelsForLearningLanguage,
  LEARNING_LANGUAGE_OPTIONS,
  LearningLanguageId,
} from '../engine/englishReelsEngine';
import { tokenizeTextForAlignment } from '../engine/forcedAligner';
import {
  concatAudioFilesWithGaps,
  DEFAULT_BGM_PRESET,
  DEFAULT_BGM_VOLUME,
  mixVoiceWithBgmPreset,
  shiftReadingWordsForIntro,
  STUDIO_BGM_PRESETS,
  StudioBgmPresetId,
} from '../engine/audioMixHelper';
import { buildVideoDescription } from '../engine/videoDescriptionBuilder';
import { downloadTextAsPlainFile, isHtmlPayload } from '../utils/safeFileDownload';
import { playExportCompleteSound, playTtsCompleteSound } from '../utils/soundEffects';
import { notifyEdgeFallbackToGoogle } from '../utils/ttsFallbackNotice';
import { isMultilingualVoiceId } from '../engine/bilingualTtsHelper';
import { parseTranscriptAuto } from '../engine/transcriptParser';
import {
  alignAudioWithProgressJob,
  fetchTtsVoicesCatalog,
  synthesizeAudioAndSyncCues,
  synthesizeAudioWithProgressJob,
  TtsProviderItem,
} from '../engine/ttsSyncHelper';
import { BACKGROUND_PRESETS } from '../engine/backgroundPresets';
import {
  ensureProjectAssetsLoaded,
  seekBackgroundVideoTo,
  subscribeBgImageLoaded,
} from '../engine/canvasRenderer';
import {
  BackgroundFitMode,
  BackgroundImageConfig,
  BackgroundPresetId,
  LessonProject,
  SubtitlePosition,
  SubtitleSize,
  TranscriptCue,
  WordTiming,
} from '../engine/types';
import { buildApiKeyHeaders, useClientApiKeys } from '../utils/apiKeysStore';
import { resizeImageFileToStageDataUrl } from '../utils/imageResize';
import {
  loadPersistedSettings,
  PersistedStudioSettings,
  updatePersistedSettings,
  USER_SETTINGS_HYDRATED_EVENT,
  USER_SETTINGS_RESET_EVENT,
} from '../utils/studioSettingsStore';
import { ApiKeyInlineControl } from './ApiKeyInlineControl';
import { emitOutputUpdated } from './GlobalOutputPanel';

interface EducationalStudioTabProps {
  onSendAudioCuesToStudio?: (audioFile: File | null, cues: TranscriptCue[], title?: string) => void;
}

const CHUNK_SIZE = 4 * 1024 * 1024;

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
    if (res.status === 413) {
      throw new Error('File tải lên vượt quá giới hạn dung lượng (tối đa 250MB).');
    }
    throw new Error(
      `Server trả về HTML (HTTP ${res.status}) thay vì JSON — kiểm tra server Node.js hoặc dung lượng file tải lên.`,
    );
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(
      res.ok ? `${fallbackError}: JSON không hợp lệ.` : `${fallbackError} (HTTP ${res.status})`,
    );
  }
}

async function uploadStudioFileChunked(
  jobId: string,
  role: string,
  file: File,
  signal?: AbortSignal,
): Promise<void> {
  for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const slice = file.slice(offset, offset + CHUNK_SIZE);
    const appendQuery = offset > 0 ? '?append=1' : '';
    const res = await fetch(`/api/studio/job/${jobId}/file${appendQuery}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-role': role,
        'x-filename': encodeURIComponent(file.name),
      },
      body: slice,
      signal,
    });
    if (!res.ok) {
      const err = await parseApiJson<{ error?: string }>(res, `Upload ${role} thất bại`).catch(() => ({
        error: undefined,
      }));
      throw new Error(err.error || `Upload ${role} thất bại (HTTP ${res.status})`);
    }
  }
}

function getPreviewVideoCssFilter(effect: string): string {
  switch (effect) {
    case 'Warm film + fade':
      return 'contrast(1.06) saturate(1.15) sepia(0.14)';
    case 'Cool tech + fade':
      return 'contrast(1.06) saturate(1.08) hue-rotate(-8deg)';
    case 'Soft vignette + fade':
      return 'contrast(1.04) saturate(0.92)';
    default:
      return 'none';
  }
}

interface VideoSnapshotStripProps {
  videoUrl: string | null;
  videoFilterCss?: string;
  watermarkOutro: EduWatermarkOutroConfig;
  subtitleSampleText?: string;
  highlightColor?: string;
  subtitlePosition?: EduKaraokePosition;
  onSeek?: (timeSec: number) => void;
}

const VideoSnapshotStrip: React.FC<VideoSnapshotStripProps> = ({
  videoUrl,
  videoFilterCss = 'none',
  watermarkOutro,
  subtitleSampleText,
  highlightColor = '#FACC15',
  subtitlePosition = 'Dưới',
  onSeek,
}) => {
  const [snapshots, setSnapshots] = useState<Array<{ label: string; timeSec: number; dataUrl: string }>>([]);
  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    if (!videoUrl) {
      setSnapshots([]);
      setIsCapturing(false);
      return;
    }

    let cancelled = false;
    setIsCapturing(true);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = videoUrl;

    const captureFrames = async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          const onLoaded = () => {
            cleanup();
            resolve();
          };
          const onErr = () => {
            cleanup();
            reject(new Error('Không đọc được metadata video'));
          };
          const timer = window.setTimeout(() => {
            cleanup();
            resolve();
          }, 4000);
          const cleanup = () => {
            window.clearTimeout(timer);
            video.removeEventListener('loadeddata', onLoaded);
            video.removeEventListener('loadedmetadata', onLoaded);
            video.removeEventListener('error', onErr);
          };
          video.addEventListener('loadeddata', onLoaded);
          video.addEventListener('loadedmetadata', onLoaded);
          video.addEventListener('error', onErr);
        });

        if (cancelled) return;
        const dur = Number.isFinite(video.duration) && video.duration > 0.2 ? video.duration : 3;
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 360;
        const maxW = 320;
        const cw = maxW;
        const ch = Math.max(120, Math.round((maxW * vh) / vw));

        const targets = [
          { label: 'Đầu · 12%', timeSec: Math.max(0.05, dur * 0.12) },
          { label: 'Giữa · 50%', timeSec: Math.max(0.1, dur * 0.5) },
          { label: 'Cuối · 85%', timeSec: Math.max(0.15, dur * 0.85) },
        ];

        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const nextSnaps: Array<{ label: string; timeSec: number; dataUrl: string }> = [];

        for (let i = 0; i < targets.length; i++) {
          if (cancelled) return;
          const target = targets[i];
          await new Promise<void>((resolve) => {
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              window.clearTimeout(timeoutId);
              video.removeEventListener('seeked', finish);
              resolve();
            };
            const timeoutId = window.setTimeout(finish, 1800);
            video.addEventListener('seeked', finish);
            try {
              video.currentTime = Math.min(Math.max(0, dur - 0.05), target.timeSec);
            } catch {
              finish();
            }
          });

          if (cancelled) return;
          ctx.clearRect(0, 0, cw, ch);
          ctx.save();
          ctx.filter = videoFilterCss !== 'none' ? videoFilterCss : 'none';
          ctx.drawImage(video, 0, 0, cw, ch);
          ctx.restore();

          if (subtitleSampleText?.trim()) {
            const subText = subtitleSampleText.trim().slice(0, 48);
            ctx.save();
            ctx.font = 'bold 12px sans-serif';
            const tw = Math.min(cw - 24, ctx.measureText(subText).width + 18);
            const sy =
              subtitlePosition === 'Trên' ? 14 : subtitlePosition === 'Giữa' ? ch / 2 - 12 : ch - 34;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
            ctx.fillRect((cw - tw) / 2, sy, tw, 22);
            ctx.fillStyle = highlightColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(subText, cw / 2, sy + 11, cw - 28);
            ctx.restore();
          }

          if (watermarkOutro.watermarkEnabled && watermarkOutro.watermarkText.trim()) {
            ctx.save();
            ctx.globalAlpha = watermarkOutro.watermarkOpacity;
            ctx.font = 'bold 10px sans-serif';
            const wm = watermarkOutro.watermarkText.trim();
            const wmW = Math.min(cw - 16, ctx.measureText(wm).width + 12);
            const pad = 8;
            const wx = watermarkOutro.watermarkCorner.includes('left') ? pad : cw - wmW - pad;
            const wy = watermarkOutro.watermarkCorner.includes('top') ? pad : ch - 20 - pad;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(wx, wy, wmW, 18);
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(wm, wx + 6, wy + 9, cw - 20);
            ctx.restore();
          }

          if (i === targets.length - 1 && watermarkOutro.outroSeconds > 0 && watermarkOutro.outroLine1.trim()) {
            ctx.save();
            ctx.fillStyle = 'rgba(79, 70, 229, 0.85)';
            ctx.fillRect(8, 8, Math.min(cw - 16, 130), 16);
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 9px sans-serif';
            ctx.textBaseline = 'middle';
            ctx.fillText(`+ Outro ${watermarkOutro.outroSeconds}s`, 14, 16);
            ctx.restore();
          }

          nextSnaps.push({
            label: target.label,
            timeSec: target.timeSec,
            dataUrl: canvas.toDataURL('image/jpeg', 0.8),
          });
        }

        if (!cancelled) {
          setSnapshots(nextSnaps);
        }
      } catch {
        if (!cancelled) setSnapshots([]);
      } finally {
        if (!cancelled) setIsCapturing(false);
        video.src = '';
      }
    };

    void captureFrames();
    return () => {
      cancelled = true;
      video.src = '';
    };
  }, [
    videoUrl,
    videoFilterCss,
    watermarkOutro.watermarkEnabled,
    watermarkOutro.watermarkText,
    watermarkOutro.watermarkCorner,
    watermarkOutro.watermarkOpacity,
    watermarkOutro.outroSeconds,
    watermarkOutro.outroLine1,
    subtitleSampleText,
    highlightColor,
    subtitlePosition,
  ]);

  if (!videoUrl) return null;

  return (
    <div className="pt-2 border-t border-slate-800 space-y-1.5">
      <div className="flex items-center justify-between text-[10px] text-slate-400">
        <span>Ảnh xem trước nhanh 3 mốc (bấm ảnh để tua nhanh)</span>
        {isCapturing && <span className="text-indigo-300">Đang chụp khung hình...</span>}
      </div>
      {snapshots.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {snapshots.map((snap) => (
            <button
              key={snap.label}
              type="button"
              onClick={() => onSeek?.(snap.timeSec)}
              className="group relative rounded-md overflow-hidden border border-slate-700 hover:border-indigo-400 bg-slate-950 text-left"
            >
              <img
                src={snap.dataUrl}
                alt={snap.label}
                className="w-full h-16 object-cover group-hover:opacity-90"
              />
              <div className="px-1.5 py-0.5 bg-slate-950/90 text-[10px] text-slate-300 font-mono flex items-center justify-between">
                <span>{snap.label}</span>
                <span>{snap.timeSec.toFixed(1)}s</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

interface WatermarkOutroSectionProps {
  config: EduWatermarkOutroConfig;
  onChange: (next: EduWatermarkOutroConfig) => void;
  title?: string;
}

const WatermarkOutroSection: React.FC<WatermarkOutroSectionProps> = ({
  config,
  onChange,
  title = 'Watermark & Outro (Tùy chọn)',
}) => (
  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="text-xs font-bold text-slate-800">{title}</div>
      <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
        <input
          type="checkbox"
          checked={config.watermarkEnabled}
          onChange={(e) => onChange({ ...config, watermarkEnabled: e.target.checked })}
          className="rounded border-slate-300 text-indigo-600"
        />
        <span>Bật Watermark xuyên suốt video</span>
      </label>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
      <div>
        <label className="block text-[11px] text-slate-600 mb-1">Nội dung Watermark</label>
        <input
          type="text"
          disabled={!config.watermarkEnabled}
          value={config.watermarkText}
          onChange={(e) => onChange({ ...config, watermarkText: e.target.value })}
          placeholder="@EnglishChannel"
          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg disabled:opacity-50"
        />
      </div>
      <div>
        <label className="block text-[11px] text-slate-600 mb-1">Góc đặt</label>
        <select
          disabled={!config.watermarkEnabled}
          value={config.watermarkCorner}
          onChange={(e) =>
            onChange({ ...config, watermarkCorner: e.target.value as EduWatermarkCorner })
          }
          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg disabled:opacity-50"
        >
          <option value="bottom-right">Dưới phải</option>
          <option value="bottom-left">Dưới trái</option>
          <option value="top-right">Trên phải</option>
          <option value="top-left">Trên trái</option>
        </select>
      </div>
      <div>
        <label className="block text-[11px] text-slate-600 mb-1">
          Độ mờ / Opacity ({Math.round(config.watermarkOpacity * 100)}%)
        </label>
        <input
          type="range"
          disabled={!config.watermarkEnabled}
          min={0.15}
          max={1}
          step={0.05}
          value={config.watermarkOpacity}
          onChange={(e) => onChange({ ...config, watermarkOpacity: Number(e.target.value) })}
          className="w-full accent-indigo-600 mt-1.5 disabled:opacity-50"
        />
      </div>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 border-t border-slate-200/70">
      <div>
        <label className="block text-[11px] text-slate-600 mb-1">Outro dòng 1</label>
        <input
          type="text"
          value={config.outroLine1}
          onChange={(e) => onChange({ ...config, outroLine1: e.target.value })}
          placeholder="Thanks for watching!"
          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
        />
      </div>
      <div>
        <label className="block text-[11px] text-slate-600 mb-1">Outro dòng 2</label>
        <input
          type="text"
          value={config.outroLine2}
          onChange={(e) => onChange({ ...config, outroLine2: e.target.value })}
          placeholder="See you next time"
          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
        />
      </div>
      <div>
        <label className="block text-[11px] text-slate-600 mb-1">
          Thời lượng Outro ({config.outroSeconds}s)
        </label>
        <input
          type="range"
          min={0}
          max={6}
          step={0.5}
          value={config.outroSeconds}
          onChange={(e) => onChange({ ...config, outroSeconds: Number(e.target.value) })}
          className="w-full accent-indigo-600 mt-1.5"
        />
      </div>
    </div>
  </div>
);

export const EducationalStudioTab: React.FC<EducationalStudioTabProps> = ({
  onSendAudioCuesToStudio,
}) => {
  const [initialEduSaved] = useState(() => loadPersistedSettings().eduStudio);
  const [subTab, setSubTab] = useState<'merge' | 'karaoke' | 'align'>(
    () => initialEduSaved?.subTab || 'merge',
  );

  // ── Shared Watermark & Outro (Tùy chọn) across all Edu Studio 1.19 tabs ────
  const [watermarkOutro, setWatermarkOutro] = useState<EduWatermarkOutroConfig>(() => ({
    watermarkEnabled: true,
    watermarkText: 'YOUR CHANNEL',
    watermarkCorner: 'bottom-right',
    watermarkOpacity: 0.65,
    outroSeconds: 3,
    outroLine1: 'Thanks for watching!',
    outroLine2: 'See you next time',
    ...(initialEduSaved?.watermarkOutro || {}),
  }));

  // ── Shared Output Folder Config ────────────────────────────────────────────
  const [outputFolders, setOutputFolders] = useState<string[]>([]);
  const [selectedSavePath, setSelectedSavePath] = useState<string>(
    () => initialEduSaved?.selectedSavePath || '',
  );
  const [localDirHandle, setLocalDirHandle] = useState<any>(null);
  const [localDirName, setLocalDirName] = useState<string | null>(null);
  const [folderStatusMsg, setFolderStatusMsg] = useState<string | null>(null);

  const supportsLocalFolderPicker =
    typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function';

  const refreshOutputFolders = useCallback(async () => {
    try {
      const foldersRes = await fetch('/api/output/folders').catch(() => null);
      if (foldersRes && foldersRes.ok) {
        const fData = (await foldersRes.json()) as { folders?: string[] };
        if (Array.isArray(fData.folders)) {
          setOutputFolders(fData.folders);
        }
      }
    } catch {
      // ignore offline
    }
  }, []);

  useEffect(() => {
    void refreshOutputFolders();
  }, [refreshOutputFolders]);

  const handlePickLocalOutputFolder = async () => {
    if (!supportsLocalFolderPicker) return;
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      setLocalDirHandle(handle);
      setLocalDirName(handle?.name || 'Thư mục máy tính');
      setFolderStatusMsg(
        `Đã chọn thư mục lưu bổ sung trên máy: "${handle?.name}". Khi render xong file sẽ tự động lưu thêm vào thư mục này.`,
      );
    } catch {
      // cancelled
    }
  };

  const saveServerFileToLocalDir = useCallback(
    async (relativePath: string, fileName: string) => {
      if (!localDirHandle) return false;
      try {
        const resp = await fetch(`/api/output/download?path=${encodeURIComponent(relativePath)}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (!resp.ok) return false;
        const ct = resp.headers.get('content-type');
        if (ct && ct.toLowerCase().includes('text/html')) return false;
        let blob: Blob;
        if (/\.(txt|srt|vtt|md|json)$/i.test(fileName)) {
          const text = await resp.text();
          if (isHtmlPayload(text, ct)) return false;
          blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        } else {
          blob = await resp.blob();
        }
        const fileHandle = await localDirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
      } catch {
        return false;
      }
    },
    [localDirHandle],
  );

  const renderOutputFolderControl = () => (
    <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/80 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-[11px] font-bold text-emerald-950 inline-flex items-center gap-1.5">
          <FolderPlus className="w-3.5 h-3.5 text-emerald-700" />
          <span>Thư mục Output lưu file</span>
        </label>
        {supportsLocalFolderPicker && (
          <button
            type="button"
            onClick={() => void handlePickLocalOutputFolder()}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 bg-white border border-emerald-300 rounded-md hover:bg-emerald-50"
          >
            <FolderOpen className="w-3 h-3" />
            <span>
              {localDirName ? `Thư mục máy: ${localDirName}` : 'Chọn thêm thư mục trên máy...'}
            </span>
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <select
          aria-label="Chọn thư mục Output có sẵn"
          value={outputFolders.includes(selectedSavePath) ? selectedSavePath : '__custom__'}
          onChange={(e) => {
            if (e.target.value !== '__custom__') {
              setSelectedSavePath(e.target.value);
            }
          }}
          className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-mono"
        >
          <option value="">Tự động theo module (Edu Merge / Edu Karaoke / Reading Along)</option>
          {outputFolders.map((folder) => (
            <option key={folder} value={folder}>
              output/{folder}
            </option>
          ))}
          {!outputFolders.includes(selectedSavePath) && selectedSavePath !== '' && (
            <option value="__custom__">Thư mục mới: output/{selectedSavePath}</option>
          )}
        </select>
        <input
          type="text"
          value={selectedSavePath}
          onChange={(e) => setSelectedSavePath(e.target.value)}
          placeholder="Để trống = tự vào thư mục con của module trong output/"
          className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-mono"
        />
      </div>
    </div>
  );

  // ── Sub-tab 1: Merge Video + Audio (Single & Batch Pairing) + Watermark/Outro ──
  const [mergeMode, setMergeMode] = useState<'single' | 'batch'>('single');
  const [mergeVideoFile, setMergeVideoFile] = useState<File | null>(null);
  const [mergeAudioFile, setMergeAudioFile] = useState<File | null>(null);
  const [batchVideos, setBatchVideos] = useState<File[]>([]);
  const [batchAudios, setBatchAudios] = useState<File[]>([]);
  const [mergeVideoUrl, setMergeVideoUrl] = useState<string | null>(null);
  const [mergeAudioUrl, setMergeAudioUrl] = useState<string | null>(null);
  const mergePreviewVideoRef = useRef<HTMLVideoElement>(null);
  const mergePreviewAudioRef = useRef<HTMLAudioElement>(null);
  const [showMergeOutroPreview, setShowMergeOutroPreview] = useState(false);
  const [durationMode, setDurationMode] = useState<'loop-video' | 'shortest'>('shortest');
  const [mergeOutputName, setMergeOutputName] = useState('');
  const [mergeAiScript, setMergeAiScript] = useState('');
  const [mergeAiJson, setMergeAiJson] = useState('');
  const [mergeAiError, setMergeAiError] = useState<string | null>(null);
  const [mergeAiNotice, setMergeAiNotice] = useState<string | null>(null);
  const [copiedMergePrompt, setCopiedMergePrompt] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeProgress, setMergeProgress] = useState(0);
  const [mergeStatus, setMergeStatus] = useState<string>('');
  const [mergeError, setMergeError] = useState<string | null>(null);
  const mergeAbortRef = useRef<AbortController | null>(null);
  const activeMergeJobIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!mergeVideoFile) {
      setMergeVideoUrl(null);
      return;
    }
    const url = URL.createObjectURL(mergeVideoFile);
    setMergeVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [mergeVideoFile]);

  useEffect(() => {
    if (!mergeAudioFile) {
      setMergeAudioUrl(null);
      return;
    }
    const url = URL.createObjectURL(mergeAudioFile);
    setMergeAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [mergeAudioFile]);

  const batchMatchedPairs = useMemo(() => {
    const audioMap = new Map<string, File>();
    for (const a of batchAudios) {
      const stem = a.name.replace(/\.[^.]+$/, '').toLowerCase();
      if (!audioMap.has(stem)) audioMap.set(stem, a);
    }
    const matched: Array<{ video: File; audio: File; stem: string }> = [];
    const missing: string[] = [];
    for (const v of batchVideos) {
      const stem = v.name.replace(/\.[^.]+$/, '').toLowerCase();
      const match = audioMap.get(stem);
      if (match) {
        matched.push({ video: v, audio: match, stem: v.name.replace(/\.[^.]+$/, '') });
      } else {
        missing.push(v.name);
      }
    }
    return { matched, missing };
  }, [batchVideos, batchAudios]);

  const handleCancelMerge = () => {
    mergeAbortRef.current?.abort();
    if (activeMergeJobIdRef.current) {
      void fetch(`/api/studio/job/${activeMergeJobIdRef.current}`, { method: 'DELETE' }).catch(
        () => undefined,
      );
    }
  };

  const runSingleMergeJob = async (
    video: File,
    audio: File,
    outStem: string,
    controller: AbortController,
    progressPrefix = '',
  ) => {
    const startRes = await fetch('/api/studio/job/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    const startData = await parseApiJson<{ jobId?: string; error?: string }>(
      startRes,
      'Không khởi tạo được job ghép video',
    );
    if (!startRes.ok || !startData.jobId) {
      throw new Error(startData.error || 'Không khởi tạo được job ghép video.');
    }
    const jobId = startData.jobId;
    activeMergeJobIdRef.current = jobId;

    setMergeProgress(5);
    setMergeStatus(`${progressPrefix}Đang tải Video (${video.name})...`);
    await uploadStudioFileChunked(jobId, 'video', video, controller.signal);

    setMergeProgress(18);
    setMergeStatus(`${progressPrefix}Đang tải Audio (${audio.name})...`);
    await uploadStudioFileChunked(jobId, 'audio', audio, controller.signal);

    const outroText = [watermarkOutro.outroLine1.trim(), watermarkOutro.outroLine2.trim()]
      .filter(Boolean)
      .join('\n');

    setMergeProgress(25);
    setMergeStatus(`${progressPrefix}FFmpeg đang ghép Video + Audio + Watermark/Outro...`);

    const pollTimer = window.setInterval(async () => {
      try {
        const stRes = await fetch(`/api/studio/job/${jobId}/status`, { signal: controller.signal });
        if (!stRes.ok) return;
        const stData = (await stRes.json()) as { progress?: number; stageLabel?: string };
        if (typeof stData.progress === 'number' && stData.progress > 0) {
          setMergeProgress(Math.min(99, Math.max(25, stData.progress)));
        }
        if (stData.stageLabel) {
          setMergeStatus(`${progressPrefix}${stData.stageLabel}`);
        }
      } catch {
        // ignore poll glitch
      }
    }, 450);

    try {
      const mergeCleanStem = cleanOutputTitleStem(outStem, 'Edu Merged Video');
      const mergeDescription = buildVideoDescription({
        title: mergeCleanStem,
        nativeLang: 'vi',
        learningLang: 'auto',
        style: 'phrase-pack',
        topicHint: mergeCleanStem,
      });
      const finishRes = await fetch(`/api/studio/job/${jobId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          durationMode,
          watermarkEnabled: watermarkOutro.watermarkEnabled,
          watermarkText: watermarkOutro.watermarkText,
          watermarkCorner: watermarkOutro.watermarkCorner,
          watermarkOpacity: watermarkOutro.watermarkOpacity,
          outroText,
          outroDuration: watermarkOutro.outroSeconds,
          outputName: mergeCleanStem,
          savePath: selectedSavePath.trim() || TAB_OUTPUT_SUBFOLDERS.merge,
          descriptionTxt: mergeDescription.txtContent,
        }),
      });
      const data = await parseApiJson<{
        ok?: boolean;
        fileName?: string;
        relativePath?: string;
        savedPath?: string;
        txtFileName?: string;
        txtRelativePath?: string;
        error?: string;
      }>(finishRes, 'Ghép video thất bại');
      if (!finishRes.ok) {
        throw new Error(data.error || 'Ghép video thất bại.');
      }
      setMergeProgress(100);
      let copiedLocal = false;
      if (data.relativePath && data.fileName && localDirHandle) {
        copiedLocal = await saveServerFileToLocalDir(data.relativePath, data.fileName);
        if (data.txtRelativePath && data.txtFileName) {
          await saveServerFileToLocalDir(data.txtRelativePath, data.txtFileName).catch(() => false);
        }
      }
      return { ...data, copiedLocal };
    } finally {
      window.clearInterval(pollTimer);
    }
  };

  const handleRunMerge = async () => {
    if (isMerging) return;
    if (mergeMode === 'single' && (!mergeVideoFile || !mergeAudioFile)) return;
    if (mergeMode === 'batch' && batchMatchedPairs.matched.length === 0) return;

    setMergeError(null);
    setMergeProgress(2);
    setIsMerging(true);
    const controller = new AbortController();
    mergeAbortRef.current = controller;

    try {
      if (mergeMode === 'single' && mergeVideoFile && mergeAudioFile) {
        const resolvedName = cleanOutputTitleStem(
          mergeOutputName.trim() || mergeVideoFile.name.replace(/\.[^.]+$/, ''),
          'Edu Merged Video',
        );
        const data = await runSingleMergeJob(mergeVideoFile, mergeAudioFile, resolvedName, controller);
        setMergeStatus(
          `Hoàn tất! Đã lưu ${data.fileName} (${data.savedPath})${data.copiedLocal ? ` · Đã lưu thêm vào "${localDirName}"` : ''}`,
        );
        emitOutputUpdated({ relativePath: data.relativePath, sourceTab: 'Edu Merge' });
        playExportCompleteSound();
      } else {
        const pairs = batchMatchedPairs.matched;
        let lastRel: string | undefined;
        for (let i = 0; i < pairs.length; i++) {
          if (controller.signal.aborted) break;
          const p = pairs[i];
          const res = await runSingleMergeJob(
            p.video,
            p.audio,
            p.stem,
            controller,
            `[${i + 1}/${pairs.length}] `,
          );
          if (res.relativePath) lastRel = res.relativePath;
        }
        emitOutputUpdated({ relativePath: lastRel, sourceTab: 'Edu Merge' });
        playExportCompleteSound();
        setMergeStatus(
          `Hoàn tất Batch! Đã ghép ${pairs.length} cặp video+audio vào thư mục Output${localDirHandle ? ` và "${localDirName}"` : ''}.`,
        );
      }
      await refreshOutputFolders();
    } catch (err) {
      if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
        setMergeStatus('Đã hủy tác vụ ghép video.');
      } else {
        setMergeError(err instanceof Error ? err.message : 'Lỗi FFmpeg ghép video.');
        setMergeStatus('');
      }
    } finally {
      activeMergeJobIdRef.current = null;
      mergeAbortRef.current = null;
      setIsMerging(false);
    }
  };

  // ── Sub-tab 2: Add Karaoke Sub (.ass) + Mix Audio/SFX/Voice + Watermark/Outro ──
  const [kmVideoFile, setKmVideoFile] = useState<File | null>(null);
  const [kmVideoUrl, setKmVideoUrl] = useState<string | null>(null);
  const [kmPreviewTimeSec, setKmPreviewTimeSec] = useState(0);
  const [kmMusicFile, setKmMusicFile] = useState<File | null>(null);
  const [kmSfxFile, setKmSfxFile] = useState<File | null>(null);
  const [kmMusicPreset, setKmMusicPreset] = useState<StudioBgmPresetId>(
    () => (initialEduSaved?.kmMusicPreset as StudioBgmPresetId) || 'soft-rain',
  );
  const [kmSfxPreset, setKmSfxPreset] = useState<StudioBgmPresetId>(
    () => (initialEduSaved?.kmSfxPreset as StudioBgmPresetId) || 'soft-rain',
  );
  const [kmVoiceFile, setKmVoiceFile] = useState<File | null>(null);
  const [kmVoiceUrl, setKmVoiceUrl] = useState<string | null>(null);
  const [kmSrtInput, setKmSrtInput] = useState(
    `1\n00:00:00,200 --> 00:00:03,400\nWelcome to Educational Audio Video Studio.\n\n2\n00:00:03,600 --> 00:00:07,000\nLet us practice speaking naturally every day.`,
  );
  const [kmAssContent, setKmAssContent] = useState('');
  const [kmStyleId, setKmStyleId] = useState<string>(
    () => initialEduSaved?.kmStyleId || KARAOKE_EFFECT_PRESETS[0].id,
  );
  const [kmSubPosition, setKmSubPosition] = useState<EduKaraokePosition>(
    () => (initialEduSaved?.kmSubPosition as EduKaraokePosition) || 'Dưới',
  );
  const [kmSubSize, setKmSubSize] = useState<EduKaraokeSize>(
    () => (initialEduSaved?.kmSubSize as EduKaraokeSize) || 'Vừa',
  );
  const [kmHighlightColor, setKmHighlightColor] = useState(
    () => initialEduSaved?.kmHighlightColor || KARAOKE_EFFECT_PRESETS[0].activeColor,
  );
  const [kmEffect, setKmEffect] = useState(() => initialEduSaved?.kmEffect || 'Fade cinematic');
  const [kmMuteOriginal, setKmMuteOriginal] = useState(() => Boolean(initialEduSaved?.kmMuteOriginal));
  const [kmRemoveDialogue, setKmRemoveDialogue] = useState(() => Boolean(initialEduSaved?.kmRemoveDialogue));
  const [kmVoicePriority, setKmVoicePriority] = useState(() =>
    typeof initialEduSaved?.kmVoicePriority === 'boolean' ? initialEduSaved.kmVoicePriority : true,
  );
  const [kmOriginalVol, setKmOriginalVol] = useState(() =>
    typeof initialEduSaved?.kmOriginalVol === 'number' ? initialEduSaved.kmOriginalVol : 0.45,
  );
  const [kmMusicVol, setKmMusicVol] = useState(() =>
    typeof initialEduSaved?.kmMusicVol === 'number' ? initialEduSaved.kmMusicVol : DEFAULT_BGM_VOLUME,
  );
  const [kmSfxVol, setKmSfxVol] = useState(() =>
    typeof initialEduSaved?.kmSfxVol === 'number' ? initialEduSaved.kmSfxVol : DEFAULT_BGM_VOLUME,
  );
  const [kmVoiceVol, setKmVoiceVol] = useState(() =>
    typeof initialEduSaved?.kmVoiceVol === 'number' ? initialEduSaved.kmVoiceVol : 1.0,
  );
  const [kmVoiceStart, setKmVoiceStart] = useState(0);
  const [kmOutputName, setKmOutputName] = useState('');
  const [kmAiScript, setKmAiScript] = useState('');
  const [kmAiJson, setKmAiJson] = useState('');
  const [kmAiError, setKmAiError] = useState<string | null>(null);
  const [kmAiNotice, setKmAiNotice] = useState<string | null>(null);
  const [copiedKmPrompt, setCopiedKmPrompt] = useState(false);
  const [isRenderingKm, setIsRenderingKm] = useState(false);
  const [kmProgress, setKmProgress] = useState(0);
  const [kmStatus, setKmStatus] = useState('');
  const [kmError, setKmError] = useState<string | null>(null);
  const kmVideoRef = useRef<HTMLVideoElement>(null);
  const kmVoiceRef = useRef<HTMLAudioElement>(null);
  const kmAbortRef = useRef<AbortController | null>(null);
  const activeKmJobIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!kmVideoFile) {
      setKmVideoUrl(null);
      return;
    }
    const url = URL.createObjectURL(kmVideoFile);
    setKmVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [kmVideoFile]);

  useEffect(() => {
    if (!kmVoiceFile) {
      setKmVoiceUrl(null);
      return;
    }
    const url = URL.createObjectURL(kmVoiceFile);
    setKmVoiceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [kmVoiceFile]);

  const kmEffectSpec = useMemo(
    () => KARAOKE_EFFECT_PRESETS.find((e) => e.id === kmStyleId) ?? KARAOKE_EFFECT_PRESETS[0],
    [kmStyleId],
  );

  const kmParsedPreviewCues = useMemo(() => parseTranscriptAuto(kmSrtInput), [kmSrtInput]);
  const kmActiveCue = useMemo(
    () =>
      kmParsedPreviewCues.find((c) => kmPreviewTimeSec >= c.start && kmPreviewTimeSec <= c.end) ??
      kmParsedPreviewCues[0] ??
      null,
    [kmParsedPreviewCues, kmPreviewTimeSec],
  );

  const handleGenerateAss = () => {
    const ass = buildEduKaraokeAss(kmSrtInput, {
      effectId: kmStyleId,
      activeColorOverride: kmHighlightColor,
      position: kmSubPosition,
      size: kmSubSize,
    });
    setKmAssContent(ass);
  };

  const buildEduWebAiPrompt = (modeLabel: string, rawScript: string, fallbackTitle: string) => {
    const cleanScript = rawScript.trim();
    return [
      `# VAI TRÒ: BIÊN TẬP VIÊN NỘI DUNG VIDEO GIÁO DỤC (${modeLabel})`,
      'Hãy biên tập, sửa lỗi chính tả, tối ưu ngắt câu phụ đề/script bên dưới và đặt tiêu đề ngắn gọn cuốn hút đúng ngôn ngữ bài học.',
      '',
      '# NỘI DUNG SUBTITLE / SCRIPT ĐẦU VÀO',
      cleanScript
        ? `"""\n${cleanScript.slice(0, 12000)}\n"""`
        : `(Chưa nhập script — hãy sáng tạo 1 đoạn hội thoại/bài giảng ngắn gọn chủ đề "${fallbackTitle || 'Daily Speaking Practice'}")`,
      '',
      '# ĐỊNH DẠNG JSON CỐ ĐỊNH CẦN TRẢ VỀ (XUẤT RA FILE .JSON)',
      '```json',
      '{',
      '  "title": "<Tiêu đề ngắn gọn, đúng ngôn ngữ đang học>",',
      '  "watermarkText": "@MyLearningChannel",',
      '  "outroLine1": "<Lời chào kết thúc bằng đúng ngôn ngữ học>",',
      '  "outroLine2": "<Lời kêu gọi luyện tập/follow ngắn gọn>",',
      '  "srt": "1\\n00:00:00,200 --> 00:00:03,400\\n<Câu phụ đề 1 đã biên tập>\\n\\n2\\n00:00:03,600 --> 00:00:07,000\\n<Câu phụ đề 2 đã biên tập>",',
      '  "lines": ["<Câu 1>", "<Câu 2>"]',
      '}',
      '```',
      'HÃY XUẤT KẾT QUẢ CUỐI CÙNG DƯỚI DẠNG **1 FILE `.json` HỢP LỆ HOÀN CHỈNH** (chỉ trả về JSON, không giải thích dài dòng bên ngoài).',
    ].join('\n');
  };

  const applyEduWebAiJson = (rawJson: string, target: 'merge' | 'karaoke') => {
    const setErr = target === 'merge' ? setMergeAiError : setKmAiError;
    const setNotice = target === 'merge' ? setMergeAiNotice : setKmAiNotice;
    setErr(null);
    setNotice(null);
    const stripped = rawJson
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) {
      setErr('Không tìm thấy JSON hợp lệ. Hãy dán toàn bộ JSON AI trả về hoặc nạp file .json.');
      return;
    }
    try {
      const obj = JSON.parse(match[0]) as {
        title?: string;
        outputName?: string;
        watermarkText?: string;
        outroLine1?: string;
        outroLine2?: string;
        srt?: string;
        text?: string;
        lines?: string[];
        cues?: Array<{ start?: number; end?: number; text?: string }>;
        cards?: Array<{ ttsText?: string; content?: string; title?: string }>;
        source_segments?: Array<{ start?: number; end?: number; text?: string }>;
      };

      const nextTitle = (obj.outputName || obj.title || '').trim();
      if (nextTitle) {
        if (target === 'merge') setMergeOutputName(nextTitle);
        else setKmOutputName(nextTitle);
      }
      if (obj.watermarkText || obj.outroLine1 || obj.outroLine2) {
        setWatermarkOutro((prev) => ({
          ...prev,
          ...(obj.watermarkText ? { watermarkText: obj.watermarkText, watermarkEnabled: true } : {}),
          ...(obj.outroLine1 ? { outroLine1: obj.outroLine1 } : {}),
          ...(obj.outroLine2 ? { outroLine2: obj.outroLine2 } : {}),
        }));
      }

      const toSrtTimestamp = (sec: number) => {
        const clamped = Math.max(0, sec);
        const h = Math.floor(clamped / 3600);
        const m = Math.floor((clamped % 3600) / 60);
        const s = Math.floor(clamped % 60);
        const ms = Math.round((clamped - Math.floor(clamped)) * 1000);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
      };

      let resolvedSrt = '';
      if (typeof obj.srt === 'string' && obj.srt.trim()) {
        resolvedSrt = obj.srt.trim();
      } else if (Array.isArray(obj.cues) && obj.cues.length > 0) {
        resolvedSrt = obj.cues
          .map((c, idx) => {
            const st = typeof c.start === 'number' ? c.start : idx * 3;
            const en = typeof c.end === 'number' ? c.end : st + 2.8;
            return `${idx + 1}\n${toSrtTimestamp(st)} --> ${toSrtTimestamp(en)}\n${String(c.text || '').trim()}`;
          })
          .filter(Boolean)
          .join('\n\n');
      } else if (Array.isArray(obj.source_segments) && obj.source_segments.length > 0) {
        resolvedSrt = obj.source_segments
          .map((c, idx) => {
            const st = typeof c.start === 'number' ? c.start : idx * 3;
            const en = typeof c.end === 'number' ? c.end : st + 2.8;
            return `${idx + 1}\n${toSrtTimestamp(st)} --> ${toSrtTimestamp(en)}\n${String(c.text || '').trim()}`;
          })
          .filter(Boolean)
          .join('\n\n');
      } else if (Array.isArray(obj.cards) && obj.cards.length > 0) {
        resolvedSrt = obj.cards
          .map((c, idx) => `${idx + 1}\n${toSrtTimestamp(idx * 3)} --> ${toSrtTimestamp(idx * 3 + 2.8)}\n${String(c.content || c.ttsText || c.title || '').trim()}`)
          .join('\n\n');
      } else if (Array.isArray(obj.lines) && obj.lines.length > 0) {
        resolvedSrt = obj.lines
          .map((l, idx) => `${idx + 1}\n${toSrtTimestamp(idx * 3)} --> ${toSrtTimestamp(idx * 3 + 2.8)}\n${String(l).trim()}`)
          .join('\n\n');
      } else if (typeof obj.text === 'string' && obj.text.trim()) {
        resolvedSrt = obj.text
          .split(/\r?\n+/)
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l, idx) => `${idx + 1}\n${toSrtTimestamp(idx * 3)} --> ${toSrtTimestamp(idx * 3 + 2.8)}\n${l}`)
          .join('\n\n');
      }

      if (resolvedSrt) {
        setKmSrtInput(resolvedSrt);
        setKmAssContent(
          buildEduKaraokeAss(resolvedSrt, {
            effectId: kmStyleId,
            activeColorOverride: kmHighlightColor,
            position: kmSubPosition,
            size: kmSubSize,
          }),
        );
      }

      setNotice(
        `Đã nạp JSON AI Web${nextTitle ? ` ("${nextTitle}")` : ''}${resolvedSrt ? ' kèm phụ đề SRT/ASS' : ''}!`,
      );
    } catch {
      setErr('Lỗi phân tích JSON. Vui lòng kiểm tra lại cấu trúc JSON AI trả về.');
    }
  };

  const handleCancelKaraokeMix = () => {
    kmAbortRef.current?.abort();
    if (activeKmJobIdRef.current) {
      void fetch(`/api/studio/job/${activeKmJobIdRef.current}`, { method: 'DELETE' }).catch(
        () => undefined,
      );
    }
  };

  const handleRunKaraokeMix = async () => {
    if (!kmVideoFile || isRenderingKm) return;
    setKmError(null);
    setIsRenderingKm(true);
    setKmProgress(3);
    setKmStatus('Đang tạo job Karaoke & Audio Mix...');
    const controller = new AbortController();
    kmAbortRef.current = controller;
    let pollTimer: number | null = null;

    try {
      const startRes = await fetch('/api/studio/job/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });
      const startData = await parseApiJson<{ jobId?: string; error?: string }>(
        startRes,
        'Không tạo được Studio job',
      );
      if (!startRes.ok || !startData.jobId) {
        throw new Error(startData.error || 'Không tạo được Studio job.');
      }
      const jobId = startData.jobId;
      activeKmJobIdRef.current = jobId;

      setKmProgress(8);
      setKmStatus(`Đang tải Video nền (${kmVideoFile.name})...`);
      await uploadStudioFileChunked(jobId, 'video', kmVideoFile, controller.signal);

      if (kmMusicFile) {
        setKmProgress(14);
        setKmStatus(`Đang tải Nhạc nền (${kmMusicFile.name})...`);
        await uploadStudioFileChunked(jobId, 'music', kmMusicFile, controller.signal);
      }
      if (kmSfxFile) {
        setKmProgress(18);
        setKmStatus(`Đang tải Ambient SFX (${kmSfxFile.name})...`);
        await uploadStudioFileChunked(jobId, 'sfx', kmSfxFile, controller.signal);
      }
      if (kmVoiceFile) {
        setKmProgress(22);
        setKmStatus(`Đang tải Voiceover (${kmVoiceFile.name})...`);
        await uploadStudioFileChunked(jobId, 'voice', kmVoiceFile, controller.signal);
      }

      const finalAss =
        kmAssContent.trim() ||
        (kmSrtInput.trim()
          ? buildEduKaraokeAss(kmSrtInput, {
              effectId: kmStyleId,
              activeColorOverride: kmHighlightColor,
              position: kmSubPosition,
              size: kmSubSize,
            })
          : '');

      const resolvedKmName = cleanOutputTitleStem(
        kmOutputName.trim() || kmVideoFile.name.replace(/\.[^.]+$/, ''),
        'Edu Karaoke Video',
      );
      const outroText = [watermarkOutro.outroLine1.trim(), watermarkOutro.outroLine2.trim()]
        .filter(Boolean)
        .join('\n');

      setKmProgress(25);
      setKmStatus('FFmpeg đang hòa âm Ducking, đốt Karaoke (.ass) & Watermark/Outro...');
      pollTimer = window.setInterval(async () => {
        try {
          const stRes = await fetch(`/api/studio/job/${jobId}/status`, { signal: controller.signal });
          if (!stRes.ok) return;
          const stData = (await stRes.json()) as { progress?: number; stageLabel?: string };
          if (typeof stData.progress === 'number' && stData.progress > 0) {
            setKmProgress(Math.min(99, Math.max(25, stData.progress)));
          }
          if (stData.stageLabel) {
            setKmStatus(stData.stageLabel);
          }
        } catch {
          // ignore poll glitch
        }
      }, 450);

      const kmDescription = buildVideoDescription({
        title: resolvedKmName,
        nativeLang: 'vi',
        learningLang: 'auto',
        style: 'phrase-pack',
        cues: parseTranscriptAuto(kmSrtInput),
        topicHint: resolvedKmName,
      });

      const mixRes = await fetch(`/api/studio/job/${jobId}/karaoke-mix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          assContent: finalAss,
          videoEffect: kmEffect,
          outroSeconds: watermarkOutro.outroSeconds,
          outroText,
          watermarkEnabled: watermarkOutro.watermarkEnabled,
          watermarkText: watermarkOutro.watermarkText,
          watermarkCorner: watermarkOutro.watermarkCorner,
          watermarkOpacity: watermarkOutro.watermarkOpacity,
          muteOriginal: kmMuteOriginal,
          removeDialogue: kmRemoveDialogue,
          originalVolume: kmOriginalVol,
          musicVolume: kmMusicVol,
          sfxVolume: kmSfxVol,
          voiceVolume: kmVoiceVol,
          voiceStart: kmVoiceStart,
          voicePriority: kmVoicePriority,
          musicPreset: kmMusicFile ? 'none' : kmMusicPreset,
          sfxPreset: kmSfxFile ? 'none' : kmSfxPreset,
          outputName: resolvedKmName,
          savePath: selectedSavePath.trim() || TAB_OUTPUT_SUBFOLDERS.karaoke,
          descriptionTxt: kmDescription.txtContent,
        }),
      });
      const data = await parseApiJson<{
        ok?: boolean;
        fileName?: string;
        relativePath?: string;
        savedPath?: string;
        txtFileName?: string;
        txtRelativePath?: string;
        error?: string;
      }>(mixRes, 'Lỗi render Karaoke & Mix');
      if (!mixRes.ok) {
        throw new Error(data.error || 'Lỗi render Karaoke & Mix.');
      }
      setKmProgress(100);
      let extraLocalMsg = '';
      if (data.relativePath && data.fileName && localDirHandle) {
        const copied = await saveServerFileToLocalDir(data.relativePath, data.fileName);
        if (data.txtRelativePath && data.txtFileName) {
          await saveServerFileToLocalDir(data.txtRelativePath, data.txtFileName).catch(() => false);
        }
        if (copied) {
          extraLocalMsg = ` · Đã lưu thêm vào "${localDirName}"`;
        }
      }
      setKmStatus(`Hoàn tất! Đã lưu ${data.fileName} (${data.savedPath})${extraLocalMsg}`);
      emitOutputUpdated({ relativePath: data.relativePath, sourceTab: 'Edu Karaoke' });
      playExportCompleteSound();
      await refreshOutputFolders();
    } catch (err) {
      if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
        setKmStatus('Đã hủy tác vụ Karaoke & Mix.');
      } else {
        setKmError(err instanceof Error ? err.message : 'Lỗi FFmpeg Karaoke & Mix.');
        setKmStatus('');
      }
    } finally {
      if (pollTimer !== null) window.clearInterval(pollTimer);
      activeKmJobIdRef.current = null;
      kmAbortRef.current = null;
      setIsRenderingKm(false);
    }
  };

  // ── Sub-tab 3: Reading Along Studio (Book + Pointer Hand + Whisper + MP4 Export) ──
  const [showKmOutroPreview, setShowKmOutroPreview] = useState(false);
  const { keys: clientKeys } = useClientApiKeys();
  const [readingLearningLang, setReadingLearningLang] = useState<LearningLanguageId>(
    () => initialEduSaved?.readingLearningLang || 'en',
  );
  const [readingTitle, setReadingTitle] = useState('Why 5 AM Changes Everything!');
  const [readingTopic, setReadingTopic] = useState('CEFR B1 · DAILY HABITS');
  const [readingPaletteId, setReadingPaletteId] =
    useState<ReadingBookPalette['id']>(
      () => (initialEduSaved?.readingPaletteId as ReadingBookPalette['id']) || 'Sunny Yellow',
    );
  const [readingIllustration, setReadingIllustration] =
    useState<ReadingIllustrationStyle>(
      () => (initialEduSaved?.readingIllustration as ReadingIllustrationStyle) || '2.5D',
    );
  const [readingBookFrame, setReadingBookFrame] =
    useState<ReadingBookFrameId>(
      () => (initialEduSaved?.readingBookFrame as ReadingBookFrameId) || 'classic-page',
    );
  const [readingPointerStyle, setReadingPointerStyle] =
    useState<ReadingPointerStyleId>(
      () => (initialEduSaved?.readingPointerStyle as ReadingPointerStyleId) || 'hand-classic',
    );
  const [readingPointerScale, setReadingPointerScale] = useState(1);
  const [readingPointerOffsetX, setReadingPointerOffsetX] = useState(0);
  const [readingPointerOffsetY, setReadingPointerOffsetY] = useState(0);
  const [selectedMergeZone, setSelectedMergeZone] = useState<
    'watermark' | 'outro' | 'output' | null
  >(null);
  const [selectedKmZone, setSelectedKmZone] = useState<
    'subtitle' | 'watermark' | 'outro' | 'fx' | null
  >(null);
  const [selectedReadingZone, setSelectedReadingZone] =
    useState<ReadingAlongHitZone | null>(null);
  const [readingDurationMinutes, setReadingDurationMinutes] = useState<number>(() =>
    typeof initialEduSaved?.readingDurationMinutes === 'number' &&
    initialEduSaved.readingDurationMinutes > 0
      ? initialEduSaved.readingDurationMinutes
      : 1,
  );
  const [readingSubtitlePosition, setReadingSubtitlePosition] = useState<SubtitlePosition>(
    () => initialEduSaved?.readingSubtitlePosition || 'center',
  );
  const [readingSubtitleSize, setReadingSubtitleSize] = useState<SubtitleSize>(
    () => initialEduSaved?.readingSubtitleSize || 'lg',
  );
  const [readingBackground, setReadingBackground] = useState<BackgroundImageConfig | undefined>(() => {
    const presetId = initialEduSaved?.readingBackgroundPresetId;
    if (!presetId) return undefined;
    return {
      kind: 'preset',
      presetId,
      fileName: BACKGROUND_PRESETS.find((p) => p.id === presetId)?.name || presetId,
      fit: 'cover',
      scrimOpacity: 0.22,
      learningScrimOpacity:
        typeof initialEduSaved?.readingLearningScrimOpacity === 'number'
          ? initialEduSaved.readingLearningScrimOpacity
          : 0.45,
    };
  });
  const [readingBgAssetVersion, setReadingBgAssetVersion] = useState(0);
  const [isProcessingReadingBg, setIsProcessingReadingBg] = useState(false);
  const [readingBgError, setReadingBgError] = useState<string | null>(null);
  const readingBgInputRef = useRef<HTMLInputElement>(null);
  const readingVideoBlobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return subscribeBgImageLoaded(() => setReadingBgAssetVersion((v) => v + 1));
  }, []);

  useEffect(() => {
    return () => {
      if (readingVideoBlobUrlRef.current) {
        URL.revokeObjectURL(readingVideoBlobUrlRef.current);
        readingVideoBlobUrlRef.current = null;
      }
    };
  }, []);
  const [readingText, setReadingText] = useState(
    `Tom wakes up early every morning.\nHe opens the window and makes his bed.\nThen he drinks a glass of water and eats breakfast.\nHe checks the time, takes his bag, and leaves home.\nA good morning helps him start the day with energy.`,
  );
  const [readingIntroEnabled, setReadingIntroEnabled] = useState(() =>
    typeof initialEduSaved?.readingIntroEnabled === 'boolean' ? initialEduSaved.readingIntroEnabled : true,
  );
  const [readingIntroText, setReadingIntroText] = useState(
    "Today's reading lesson: A Simple Morning Routine. Listen carefully and read along word by word.",
  );
  const [isReadingIntroCustom, setIsReadingIntroCustom] = useState(false);
  const [readingIntroSeconds, setReadingIntroSeconds] = useState(() =>
    typeof initialEduSaved?.readingIntroSeconds === 'number' ? initialEduSaved.readingIntroSeconds : 3.4,
  );
  const [readingOutroSpeechEnabled, setReadingOutroSpeechEnabled] = useState(() =>
    typeof initialEduSaved?.readingOutroSpeechEnabled === 'boolean' ? initialEduSaved.readingOutroSpeechEnabled : true,
  );
  const [readingBgmPreset, setReadingBgmPreset] = useState<StudioBgmPresetId>(
    () => initialEduSaved?.readingBgmPreset || DEFAULT_BGM_PRESET,
  );
  const [readingBgmVolume, setReadingBgmVolume] = useState(() =>
    typeof initialEduSaved?.readingBgmVolume === 'number'
      ? initialEduSaved.readingBgmVolume
      : DEFAULT_BGM_VOLUME,
  );
  const [readingCustomBgmFile, setReadingCustomBgmFile] = useState<File | null>(null);
  const readingBgmInputRef = useRef<HTMLInputElement>(null);
  const [isCustomAlignAudio, setIsCustomAlignAudio] = useState(false);
  const [synthesizedReadingSig, setSynthesizedReadingSig] = useState('');
  const [alignFile, setAlignFile] = useState<File | null>(null);
  const [alignAudioUrl, setAlignAudioUrl] = useState<string | null>(null);
  const [alignAudioDur, setAlignAudioDur] = useState<number>(14);
  const [alignMode, setAlignMode] = useState<'fast-forced' | 'whisper'>(
    () => initialEduSaved?.alignMode || 'fast-forced',
  );
  const [alignLang, setAlignLang] = useState(() => initialEduSaved?.alignLang || 'auto');
  const [alignModel, setAlignModel] = useState(() => initialEduSaved?.alignModel || 'Xenova/whisper-small');
  const [readingTtsRate, setReadingTtsRate] = useState(() =>
    typeof initialEduSaved?.readingTtsRate === 'number' ? initialEduSaved.readingTtsRate : 1.0,
  );
  const [ttsVoices, setTtsVoices] = useState<TtsProviderItem[]>([]);
  const [readingProvider, setReadingProvider] = useState<string>(
    () => initialEduSaved?.readingProvider || 'auto',
  );
  const [hasReadingGeminiKey, setHasReadingGeminiKey] = useState(false);
  const [hasReadingElevenLabsKey, setHasReadingElevenLabsKey] = useState(false);
  const [readingVoice, setReadingVoice] = useState(
    () => initialEduSaved?.readingVoice || 'en-US-JennyNeural',
  );
  const [isGeneratingReadingTts, setIsGeneratingReadingTts] = useState(false);
  const [readingTtsProgress, setReadingTtsProgress] = useState(0);
  const [readingTtsStageLabel, setReadingTtsStageLabel] = useState('');
  const [isAligning, setIsAligning] = useState(false);
  const [alignError, setAlignError] = useState<string | null>(null);
  const [readingAspect, setReadingAspect] = useState<ExportAspectRatioId>(
    () => initialEduSaved?.readingAspect || '9:16',
  );
  const [readingResolution, setReadingResolution] = useState<ExportResolutionId>(
    () => initialEduSaved?.readingResolution || '720p',
  );
  const [readingQuality, setReadingQuality] = useState<ExportQualityId>(
    () => initialEduSaved?.readingQuality || 'high',
  );
  const [readingFps, setReadingFps] = useState<ExportFpsOption>(
    () => initialEduSaved?.readingFps || 30,
  );

  useEffect(() => {
    const onHydrated = (ev: Event) => {
      const s = (ev as CustomEvent<PersistedStudioSettings>).detail?.eduStudio;
      if (!s) return;
      if (s.subTab) setSubTab(s.subTab);
      if (s.selectedSavePath !== undefined) setSelectedSavePath(s.selectedSavePath);
      if (s.watermarkOutro) setWatermarkOutro(s.watermarkOutro);
      if (s.kmStyleId) setKmStyleId(s.kmStyleId);
      if (s.kmSubPosition) setKmSubPosition(s.kmSubPosition);
      if (s.kmSubSize) setKmSubSize(s.kmSubSize);
      if (s.kmHighlightColor) setKmHighlightColor(s.kmHighlightColor);
      if (s.kmEffect) setKmEffect(s.kmEffect);
      if (s.kmMusicPreset) setKmMusicPreset(s.kmMusicPreset);
      if (s.kmSfxPreset) setKmSfxPreset(s.kmSfxPreset);
      if (typeof s.kmMuteOriginal === 'boolean') setKmMuteOriginal(s.kmMuteOriginal);
      if (typeof s.kmRemoveDialogue === 'boolean') setKmRemoveDialogue(s.kmRemoveDialogue);
      if (typeof s.kmVoicePriority === 'boolean') setKmVoicePriority(s.kmVoicePriority);
      if (typeof s.kmOriginalVol === 'number') setKmOriginalVol(s.kmOriginalVol);
      if (typeof s.kmMusicVol === 'number') setKmMusicVol(s.kmMusicVol);
      if (typeof s.kmSfxVol === 'number') setKmSfxVol(s.kmSfxVol);
      if (typeof s.kmVoiceVol === 'number') setKmVoiceVol(s.kmVoiceVol);
      if (s.readingLearningLang) setReadingLearningLang(s.readingLearningLang);
      if (s.readingFormat) setReadingFormat(s.readingFormat);
      if (s.readingAiLevel) setReadingAiLevel(s.readingAiLevel);
      if (s.readingAiTopic !== undefined) setReadingAiTopic(s.readingAiTopic);
      if (s.readingPaletteId) setReadingPaletteId(s.readingPaletteId as ReadingBookPalette['id']);
      if (s.readingIllustration) setReadingIllustration(s.readingIllustration as ReadingIllustrationStyle);
      if (s.readingBookFrame) setReadingBookFrame(s.readingBookFrame as ReadingBookFrameId);
      if (s.readingPointerStyle) setReadingPointerStyle(s.readingPointerStyle as ReadingPointerStyleId);
      if (typeof s.readingDurationMinutes === 'number' && s.readingDurationMinutes > 0) {
        setReadingDurationMinutes(s.readingDurationMinutes);
        setReadingAiLength(
          computeReadingTargetLength(
            (s.readingLearningLang || 'en') as ReadingLearningLang,
            s.readingDurationMinutes,
          ).count,
        );
      }
      if (s.readingSubtitlePosition) setReadingSubtitlePosition(s.readingSubtitlePosition);
      if (s.readingSubtitleSize) setReadingSubtitleSize(s.readingSubtitleSize);
      if (s.readingBackgroundPresetId !== undefined) {
        if (!s.readingBackgroundPresetId) {
          setReadingBackground((prev) => (prev?.kind === 'preset' ? undefined : prev));
        } else {
          setReadingBackground({
            kind: 'preset',
            presetId: s.readingBackgroundPresetId,
            fileName:
              BACKGROUND_PRESETS.find((p) => p.id === s.readingBackgroundPresetId)?.name ||
              s.readingBackgroundPresetId,
            fit: 'cover',
            scrimOpacity: 0.22,
            learningScrimOpacity:
              typeof s.readingLearningScrimOpacity === 'number'
                ? s.readingLearningScrimOpacity
                : 0.45,
          });
        }
      }
      if (typeof s.readingIntroEnabled === 'boolean') setReadingIntroEnabled(s.readingIntroEnabled);
      if (typeof s.readingIntroSeconds === 'number') setReadingIntroSeconds(s.readingIntroSeconds);
      if (typeof s.readingOutroSpeechEnabled === 'boolean') setReadingOutroSpeechEnabled(s.readingOutroSpeechEnabled);
      if (s.readingBgmPreset) setReadingBgmPreset(s.readingBgmPreset);
      if (typeof s.readingBgmVolume === 'number') setReadingBgmVolume(s.readingBgmVolume);
      if (s.alignMode) setAlignMode(s.alignMode);
      if (s.alignLang) setAlignLang(s.alignLang);
      if (s.alignModel) setAlignModel(s.alignModel);
      if (s.readingProvider) setReadingProvider(s.readingProvider);
      if (s.readingVoice) setReadingVoice(s.readingVoice);
      if (typeof s.readingTtsRate === 'number') setReadingTtsRate(s.readingTtsRate);
      if (s.readingAspect) setReadingAspect(s.readingAspect);
      if (s.readingResolution) setReadingResolution(s.readingResolution);
      if (s.readingQuality) setReadingQuality(s.readingQuality);
      if (s.readingFps) setReadingFps(s.readingFps);
    };
    const onReset = () => {
      setSubTab('merge');
      setSelectedSavePath('');
      setWatermarkOutro({
        watermarkEnabled: true,
        watermarkText: 'YOUR CHANNEL',
        watermarkCorner: 'bottom-right',
        watermarkOpacity: 0.65,
        outroSeconds: 3,
        outroLine1: 'Thanks for watching!',
        outroLine2: 'See you next time',
      });
      setKmStyleId(KARAOKE_EFFECT_PRESETS[0].id);
      setKmSubPosition('Dưới');
      setKmSubSize('Vừa');
      setKmHighlightColor(KARAOKE_EFFECT_PRESETS[0].activeColor);
      setKmEffect('Fade cinematic');
      setKmMusicPreset('soft-rain');
      setKmSfxPreset('soft-rain');
      setKmMuteOriginal(false);
      setKmRemoveDialogue(false);
      setKmVoicePriority(true);
      setKmOriginalVol(0.45);
      setKmMusicVol(DEFAULT_BGM_VOLUME);
      setKmSfxVol(DEFAULT_BGM_VOLUME);
      setKmVoiceVol(1.0);
      setReadingLearningLang('en');
      setReadingFormat('auto');
      setReadingAiLevel('B1');
      setReadingAiTopic('');
      setReadingPaletteId('Sunny Yellow');
      setReadingIllustration('2.5D');
      setReadingBookFrame('classic-page');
      setReadingPointerStyle('hand-classic');
      setReadingDurationMinutes(1);
      setReadingAiLength(computeReadingTargetLength('en', 1).count);
      setReadingSubtitlePosition('center');
      setReadingSubtitleSize('lg');
      if (readingVideoBlobUrlRef.current) {
        URL.revokeObjectURL(readingVideoBlobUrlRef.current);
        readingVideoBlobUrlRef.current = null;
      }
      setReadingBackground(undefined);
      setReadingBgError(null);
      setReadingIntroEnabled(true);
      setReadingIntroSeconds(3.4);
      setReadingOutroSpeechEnabled(true);
      setReadingBgmPreset(DEFAULT_BGM_PRESET);
      setReadingBgmVolume(DEFAULT_BGM_VOLUME);
      setReadingCustomBgmFile(null);
      setAlignMode('fast-forced');
      setAlignLang('auto');
      setAlignModel('Xenova/whisper-small');
      setReadingProvider('auto');
      setReadingVoice('en-US-JennyNeural');
      setReadingTtsRate(1.0);
      setReadingAspect('9:16');
      setReadingResolution('720p');
      setReadingQuality('high');
      setReadingFps(30);
    };
    window.addEventListener(USER_SETTINGS_HYDRATED_EVENT, onHydrated);
    window.addEventListener(USER_SETTINGS_RESET_EVENT, onReset);
    return () => {
      window.removeEventListener(USER_SETTINGS_HYDRATED_EVENT, onHydrated);
      window.removeEventListener(USER_SETTINGS_RESET_EVENT, onReset);
    };
  }, []);

  const [readingFormat, setReadingFormat] = useState<ReadingFormatCategory>(
    () => initialEduSaved?.readingFormat || 'auto',
  );
  const [readingAiTopic, setReadingAiTopic] = useState(() => initialEduSaved?.readingAiTopic ?? '');
  const [readingAiLevel, setReadingAiLevel] = useState<string>(
    () => initialEduSaved?.readingAiLevel || 'B1',
  );
  const [readingAiLength, setReadingAiLength] = useState<number>(() =>
    computeReadingTargetLength(
      (initialEduSaved?.readingLearningLang || 'en') as ReadingLearningLang,
      typeof initialEduSaved?.readingDurationMinutes === 'number' &&
        initialEduSaved.readingDurationMinutes > 0
        ? initialEduSaved.readingDurationMinutes
        : 1,
    ).count,
  );

  const hasMountedPersistRef = useRef(false);
  useEffect(() => {
    if (!hasMountedPersistRef.current) {
      hasMountedPersistRef.current = true;
      return;
    }
    updatePersistedSettings({
      eduStudio: {
        subTab,
        selectedSavePath,
        watermarkOutro,
        kmStyleId,
        kmSubPosition,
        kmSubSize,
        kmHighlightColor,
        kmEffect,
        kmMusicPreset,
        kmSfxPreset,
        kmMuteOriginal,
        kmRemoveDialogue,
        kmVoicePriority,
        kmOriginalVol,
        kmMusicVol,
        kmSfxVol,
        kmVoiceVol,
        readingLearningLang,
        readingFormat,
        readingAiLevel,
        readingAiTopic,
        readingPaletteId,
        readingIllustration,
        readingBookFrame,
        readingPointerStyle,
        readingDurationMinutes,
        readingSubtitlePosition,
        readingSubtitleSize,
        readingBackgroundPresetId:
          readingBackground?.kind === 'preset' ? readingBackground.presetId || '' : '',
        readingLearningScrimOpacity: readingBackground?.learningScrimOpacity ?? 0.45,
        readingIntroEnabled,
        readingIntroSeconds,
        readingOutroSpeechEnabled,
        readingBgmPreset,
        readingBgmVolume,
        alignMode,
        alignLang,
        alignModel,
        readingProvider,
        readingVoice,
        readingTtsRate,
        readingAspect,
        readingResolution,
        readingQuality,
        readingFps,
      },
    });
  }, [
    subTab,
    selectedSavePath,
    watermarkOutro,
    kmStyleId,
    kmSubPosition,
    kmSubSize,
    kmHighlightColor,
    kmEffect,
    kmMusicPreset,
    kmSfxPreset,
    kmMuteOriginal,
    kmRemoveDialogue,
    kmVoicePriority,
    kmOriginalVol,
    kmMusicVol,
    kmSfxVol,
    kmVoiceVol,
    readingLearningLang,
    readingFormat,
    readingAiLevel,
    readingAiTopic,
    readingPaletteId,
    readingIllustration,
    readingBookFrame,
    readingPointerStyle,
    readingDurationMinutes,
    readingSubtitlePosition,
    readingSubtitleSize,
    readingBackground,
    readingIntroEnabled,
    readingIntroSeconds,
    readingOutroSpeechEnabled,
    readingBgmPreset,
    readingBgmVolume,
    alignMode,
    alignLang,
    alignModel,
    readingProvider,
    readingVoice,
    readingTtsRate,
    readingAspect,
    readingResolution,
    readingQuality,
    readingFps,
  ]);
  const [readingUrl, setReadingUrl] = useState('');
  const [readingUrlSubLinks, setReadingUrlSubLinks] = useState<Array<{ title: string; url: string }>>([]);
  const [scrapedWebSource, setScrapedWebSource] = useState<{
    url: string;
    title: string;
    rawText: string;
  } | null>(null);
  const [adaptRawInputText, setAdaptRawInputText] = useState('');
  const [readingWebPromptMode, setReadingWebPromptMode] = useState<'web-url' | 'topic' | 'adapt-text'>('topic');
  const [isWebPromptOpen, setIsWebPromptOpen] = useState<boolean>(true);
  const [copiedReadingPrompt, setCopiedReadingPrompt] = useState<boolean>(false);
  const [pastedReadingAiResponse, setPastedReadingAiResponse] = useState<string>('');
  const [pastedReadingAiError, setPastedReadingAiError] = useState<string | null>(null);
  const readingLevelOptions = useMemo(
    () => getLevelsForLearningLanguage(readingLearningLang),
    [readingLearningLang],
  );
  const targetReadingLengthMeta = useMemo(
    () => computeReadingTargetLength(readingLearningLang as ReadingLearningLang, readingDurationMinutes),
    [readingLearningLang, readingDurationMinutes],
  );
  const [isScrapingOrGeneratingReading, setIsScrapingOrGeneratingReading] = useState(false);
  const [readingAiProgress, setReadingAiProgress] = useState(0);
  const [readingAiStageLabel, setReadingAiStageLabel] = useState('');
  const [alignCurrentSec, setAlignCurrentSec] = useState(0);
  const [isPlayingReadingPreview, setIsPlayingReadingPreview] = useState(false);
  const [isExportingReadingMp4, setIsExportingReadingMp4] = useState(false);
  const [readingExportProgress, setReadingExportProgress] = useState(0);
  const [readingExportStatus, setReadingExportStatus] = useState('');
  const readingAbortRef = useRef<AbortController | null>(null);

  const [alignResult, setAlignResult] = useState<{
    language?: string;
    modelUsed: string;
    backendUsed: string;
    durationSec: number;
    text: string;
    words: WordTiming[];
    cues: TranscriptCue[];
    srt: string;
  } | null>(null);
  const alignAudioRef = useRef<HTMLAudioElement>(null);
  const readingCanvasRef = useRef<HTMLCanvasElement>(null);

  const refreshReadingVoices = useCallback(() => {
    void fetchTtsVoicesCatalog()
      .then((res) => {
        setTtsVoices(res.providers);
        setHasReadingGeminiKey(res.hasGeminiKey);
        setHasReadingElevenLabsKey(res.hasElevenLabsKey);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshReadingVoices();
  }, [refreshReadingVoices]);

  const effectiveReadingGeminiKey = hasReadingGeminiKey || Boolean(clientKeys.geminiApiKey);
  const effectiveReadingElevenLabsKey =
    hasReadingElevenLabsKey || Boolean(clientKeys.elevenlabsApiKey);

  const allReadingVoices = useMemo(() => {
    if (readingProvider === 'auto') {
      return ttsVoices
        .filter(
          (p) =>
            (p.id !== 'gemini' || effectiveReadingGeminiKey) &&
            (p.id !== 'elevenlabs' || effectiveReadingElevenLabsKey),
        )
        .flatMap((p) => p.voices);
    }
    return ttsVoices.find((p) => p.id === readingProvider)?.voices ?? [];
  }, [ttsVoices, readingProvider, effectiveReadingGeminiKey, effectiveReadingElevenLabsKey]);

  const pickReadingDefaultVoice = useCallback(
    (lang: LearningLanguageId, providers: TtsProviderItem[]) => {
      const langMeta = LEARNING_LANGUAGE_OPTIONS.find((l) => l.id === lang);
      const preferred = langMeta?.defaultVoice || 'en-US-JennyNeural';
      const pool = providers.flatMap((p) => p.voices);
      const exact = pool.find((v) => v.id === preferred);
      if (exact) return exact.id;
      const prefix = pool.find((v) => (v.lang || '').toLowerCase().startsWith(lang));
      return prefix?.id || preferred;
    },
    [],
  );

  const buildDefaultIntroForLang = useCallback((lang: LearningLanguageId, cleanTitle: string) => {
    switch (lang) {
      case 'ja':
        return `今日のリーディング：${cleanTitle}。音声を聞きながら一緒に読んでみましょう。`;
      case 'zh':
        return `今天的跟读练习：${cleanTitle}。请跟着声音一起读。`;
      case 'ko':
        return `오늘의 읽기 연습: ${cleanTitle}. 소리를 들으며 따라 읽어 보세요.`;
      case 'fr':
        return `Lecture du jour : ${cleanTitle}. Écoutez attentivement et suivez chaque mot.`;
      case 'es':
        return `Lectura de hoy: ${cleanTitle}. Escucha con atención y sigue cada palabra.`;
      default:
        return `Today's reading lesson: ${cleanTitle}. Listen carefully and read along word by word.`;
    }
  }, []);

  const applyReadingStarterPassage = useCallback(
    (lang: LearningLanguageId, overrideLevel?: string) => {
      const starter = READING_STARTER_BY_LANG[(lang as ReadingLearningLang) || 'en'] || READING_STARTER_BY_LANG.en;
      setReadingTitle(starter.title);
      setReadingTopic(overrideLevel ? `${starter.topicBadge.split('·')[0].replace(/\S+$/, overrideLevel)} · READING` : starter.topicBadge);
      setReadingText(starter.text);
      if (!isReadingIntroCustom) {
        setReadingIntroText(starter.introSubtitle);
      }
      setAlignResult(null);
      setAlignCurrentSec(0);
      setSynthesizedReadingSig('');
      setReadingVoice(pickReadingDefaultVoice(lang, ttsVoices));
      setReadingAiStageLabel(
        `Đã nạp bài đọc mẫu ${LEARNING_LANGUAGE_OPTIONS.find((l) => l.id === lang)?.nativeName || lang}!`,
      );
    },
    [isReadingIntroCustom, pickReadingDefaultVoice, ttsVoices],
  );

  useEffect(() => {
    if (allReadingVoices.length > 0 && !allReadingVoices.some((v) => v.id === readingVoice)) {
      setReadingVoice(pickReadingDefaultVoice(readingLearningLang, ttsVoices));
    }
  }, [allReadingVoices, readingVoice, readingLearningLang, ttsVoices, pickReadingDefaultVoice]);

  useEffect(() => {
    return () => {
      if (alignAudioUrl) URL.revokeObjectURL(alignAudioUrl);
    };
  }, [alignAudioUrl]);

  useEffect(() => {
    if (!isReadingIntroCustom) {
      const cleanTitle =
        readingTitle.trim() ||
        READING_STARTER_BY_LANG[(readingLearningLang as ReadingLearningLang) || 'en']?.title ||
        getReadingUiStrings(readingLearningLang).introDefaultTitle;
      setReadingIntroText(buildDefaultIntroForLang(readingLearningLang, cleanTitle));
    }
  }, [readingTitle, readingLearningLang, isReadingIntroCustom, buildDefaultIntroForLang]);

  useEffect(() => {
    if (subTab !== 'align') return;
    const localizedOutro = getReadingUiStrings(readingLearningLang);
    setWatermarkOutro((prev) => {
      if (!isDefaultReadingOutroPair(prev.outroLine1, prev.outroLine2)) {
        return prev;
      }
      if (
        prev.outroLine1 === localizedOutro.outroLine1 &&
        prev.outroLine2 === localizedOutro.outroLine2
      ) {
        return prev;
      }
      return {
        ...prev,
        outroLine1: localizedOutro.outroLine1,
        outroLine2: localizedOutro.outroLine2,
      };
    });
  }, [subTab, readingLearningLang]);

  const outroSpeechText = useMemo(
    () => [watermarkOutro.outroLine1.trim(), watermarkOutro.outroLine2.trim()].filter(Boolean).join('. '),
    [watermarkOutro.outroLine1, watermarkOutro.outroLine2],
  );

  const currentReadingSig = useMemo(
    () =>
      JSON.stringify({
        readingTitle: readingTitle.trim(),
        readingText: readingText.trim(),
        readingProvider,
        readingVoice,
        readingTtsRate,
        readingIntroEnabled,
        readingIntroText: readingIntroEnabled ? readingIntroText.trim() : '',
        readingOutroSpeechEnabled,
        outroSpeechText:
          readingOutroSpeechEnabled && watermarkOutro.outroSeconds > 0 ? outroSpeechText : '',
        outroSeconds: watermarkOutro.outroSeconds,
        readingBgmPreset,
        readingBgmVolume: Number(readingBgmVolume.toFixed(2)),
        readingCustomBgmName: readingCustomBgmFile?.name || '',
        readingCustomBgmSize: readingCustomBgmFile?.size || 0,
      }),
    [
      readingTitle,
      readingText,
      readingProvider,
      readingVoice,
      readingTtsRate,
      readingIntroEnabled,
      readingIntroText,
      readingOutroSpeechEnabled,
      outroSpeechText,
      watermarkOutro.outroSeconds,
      readingBgmPreset,
      readingBgmVolume,
      readingCustomBgmFile,
    ],
  );

  const activeIntroSec =
    readingIntroEnabled && readingIntroText.trim().length > 0 ? readingIntroSeconds : 0;

  const effectiveReadingWords = useMemo(() => {
    if (alignResult && alignResult.words.length > 0) return alignResult.words;
    const tokenCount = Math.max(1, tokenizeTextForAlignment(readingText, readingLearningLang).length);
    const estTotal = alignAudioUrl
      ? Math.max(4, alignAudioDur - activeIntroSec)
      : Math.max(6, tokenCount * 0.42);
    return shiftReadingWordsForIntro(
      buildEstimatedReadingWords(readingText, estTotal, readingLearningLang),
      activeIntroSec,
    );
  }, [alignResult, readingText, readingLearningLang, alignAudioDur, alignAudioUrl, activeIntroSec]);

  const effectiveReadingContentDuration = useMemo(() => {
    const lastWordEnd =
      effectiveReadingWords.length > 0
        ? effectiveReadingWords[effectiveReadingWords.length - 1].end
        : activeIntroSec + 8;
    if (alignResult?.durationSec && alignResult.durationSec > activeIntroSec + 0.5) {
      return Math.max(activeIntroSec + 1.5, alignResult.durationSec, lastWordEnd + 0.3);
    }
    const audioBound = alignAudioUrl ? alignAudioDur : 0;
    return Math.max(activeIntroSec + 2, audioBound, lastWordEnd + 0.35);
  }, [effectiveReadingWords, alignResult, alignAudioDur, alignAudioUrl, activeIntroSec]);

  const readingTimeline = useMemo(
    () =>
      computeReadingTimelineMetrics({
        words: effectiveReadingWords,
        contentDuration: effectiveReadingContentDuration,
        introEnabled: readingIntroEnabled && readingIntroText.trim().length > 0,
        introSeconds: activeIntroSec,
        outroSeconds: watermarkOutro.outroSeconds,
        outroText: [watermarkOutro.outroLine1.trim(), watermarkOutro.outroLine2.trim()]
          .filter(Boolean)
          .join('\n'),
      }),
    [
      effectiveReadingWords,
      effectiveReadingContentDuration,
      readingIntroEnabled,
      readingIntroText,
      activeIntroSec,
      watermarkOutro,
    ],
  );

  const readingWebAiPrompt = useMemo(
    () =>
      buildReadingWebAiPrompt({
        mode: readingWebPromptMode,
        learningLanguage: readingLearningLang as ReadingLearningLang,
        formatPreference: readingFormat,
        url: readingUrl || scrapedWebSource?.url,
        sourceTitle: readingWebPromptMode === 'adapt-text' ? readingTitle : scrapedWebSource?.title,
        sourceText:
          readingWebPromptMode === 'adapt-text'
            ? adaptRawInputText
            : scrapedWebSource?.rawText,
        topic: readingAiTopic,
        level: readingAiLevel,
        wordCount: readingAiLength,
        durationMinutes: readingDurationMinutes,
      }),
    [
      readingWebPromptMode,
      readingLearningLang,
      readingFormat,
      readingUrl,
      readingTitle,
      adaptRawInputText,
      scrapedWebSource,
      readingAiTopic,
      readingAiLevel,
      readingAiLength,
      readingDurationMinutes,
    ],
  );

  const resolvedReadingDims = useMemo(
    () =>
      resolveMp4EncodingParams({
        ...DEFAULT_MP4_EXPORT_SETTINGS,
        aspectRatio: readingAspect,
        resolution: readingResolution,
        quality: readingQuality,
        fps: readingFps,
      }),
    [readingAspect, readingResolution, readingQuality, readingFps],
  );

  const previewCanvasDims = useMemo(() => {
    switch (readingAspect) {
      case '16:9':
        return { w: 960, h: 540, cls: 'aspect-video max-w-full' };
      case '1:1':
        return { w: 720, h: 720, cls: 'aspect-square max-h-[340px]' };
      case '4:5':
        return { w: 640, h: 800, cls: 'aspect-[4/5] max-h-[340px]' };
      default:
        return { w: 540, h: 960, cls: 'aspect-[9/16] max-h-[340px]' };
    }
  }, [readingAspect]);

  const mappedReadingSubPos: EduKaraokePosition =
    readingSubtitlePosition === 'top'
      ? 'Trên'
      : readingSubtitlePosition === 'bottom'
        ? 'Dưới'
        : 'Giữa';
  const mappedReadingSubSize: EduKaraokeSize =
    readingSubtitleSize === 'sm' ? 'Nhỏ' : readingSubtitleSize === 'md' ? 'Vừa' : 'Lớn';

  // Draw live Book + Pointer Hand + Intro/Outro + Custom Background Canvas Preview
  useEffect(() => {
    const canvas = readingCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cancelled = false;
    const renderCurrent = () => {
      if (cancelled) return;
      renderReadingAlongFrame(ctx, {
        width: canvas.width,
        height: canvas.height,
        title: readingTitle,
        topicBadge: readingTopic,
        text: readingText,
        words: effectiveReadingWords,
        currentTime: alignCurrentSec,
        contentDuration: readingTimeline.contentEnd,
        totalDuration: readingTimeline.effectiveTotalDuration,
        introEnabled: readingIntroEnabled && readingIntroText.trim().length > 0,
        introSeconds: activeIntroSec,
        introTitle: getReadingUiStrings(readingLearningLang).introBadge,
        introSubtitle: readingIntroText.trim() || readingTitle,
        paletteId: readingPaletteId,
        illustrationStyle: readingIllustration,
        bookFrame: readingBookFrame,
        pointerStyle: readingPointerStyle,
        background: readingBackground,
        subtitlePosition: mappedReadingSubPos,
        subtitleSize: mappedReadingSubSize,
        learningLanguage: readingLearningLang,
        watermarkOutro,
        pointerScale: readingPointerScale,
        pointerOffsetX: readingPointerOffsetX,
        pointerOffsetY: readingPointerOffsetY,
      });
    };

    renderCurrent();

    if (
      readingBackground &&
      (readingBackground.kind === 'video' ||
        readingBackground.kind === 'preset' ||
        readingBackground.dataUrl)
    ) {
      void (async () => {
        await ensureProjectAssetsLoaded({
          id: 'reading-bg-loader',
          title: readingTitle,
          subtitle: readingTopic,
          theme: 'pastel-sunrise',
          duration: readingTimeline.effectiveTotalDuration,
          fps: 30,
          cues: [],
          elements: [],
          backgroundImage: readingBackground,
        });
        if (!cancelled && readingBackground.kind === 'video' && readingBackground.videoUrl && !isPlayingReadingPreview) {
          await seekBackgroundVideoTo(readingBackground.videoUrl, alignCurrentSec);
        }
        renderCurrent();
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [
    readingTitle,
    readingTopic,
    readingText,
    effectiveReadingWords,
    alignCurrentSec,
    readingTimeline.contentEnd,
    readingTimeline.effectiveTotalDuration,
    readingIntroEnabled,
    readingIntroText,
    activeIntroSec,
    readingPaletteId,
    readingIllustration,
    readingBookFrame,
    readingPointerStyle,
    readingPointerScale,
    readingPointerOffsetX,
    readingPointerOffsetY,
    readingBackground,
    readingBgAssetVersion,
    mappedReadingSubPos,
    mappedReadingSubSize,
    isPlayingReadingPreview,
    watermarkOutro,
    previewCanvasDims.w,
    previewCanvasDims.h,
    subTab,
  ]);

  // Playback timer when previewing without audio or continuing into Outro after audio ends
  useEffect(() => {
    if (!isPlayingReadingPreview) return;
    let rafId = 0;
    let lastTs = performance.now();
    const totalLimit = readingTimeline.effectiveTotalDuration;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTs) / 1000);
      lastTs = now;
      if (
        alignAudioRef.current &&
        alignAudioUrl &&
        !alignAudioRef.current.paused &&
        !alignAudioRef.current.ended
      ) {
        setAlignCurrentSec(alignAudioRef.current.currentTime);
      } else {
        setAlignCurrentSec((prev) => {
          const next = prev + dt;
          if (next >= totalLimit) {
            setIsPlayingReadingPreview(false);
            return 0;
          }
          return next;
        });
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlayingReadingPreview, alignAudioUrl, readingTimeline.effectiveTotalDuration]);

  interface GeneratedReadingBundle {
    audioFile: File;
    title: string;
    text: string;
    words: WordTiming[];
    contentEnd: number;
    totalDuration: number;
    introEnabled: boolean;
    introSeconds: number;
    introSubtitle: string;
    watermarkOutro: EduWatermarkOutroConfig;
  }

  const decodeBase64AudioClip = (
    base64: string,
    fileName: string,
    mimeType = 'audio/mpeg',
  ): File => {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return new File([bytes], fileName, { type: mimeType });
  };

  const handleGenerateReadingTts = async (
    ttsOverride?: { provider?: string; strictProvider?: boolean },
  ): Promise<GeneratedReadingBundle | null> => {
    if (isGeneratingReadingTts || !readingText.trim()) return null;
    setAlignError(null);
    setIsGeneratingReadingTts(true);
    setReadingTtsProgress(4);
    setReadingTtsStageLabel('Đang làm sạch văn bản & tổng hợp giọng đọc...');
    try {
      // Strip worksheet scaffolding lines before reading aloud so audio & text match 1:1
      const cleanedInput = cleanReadingWorksheetInput(readingText, readingTitle);
      const cleanTitle = cleanedInput.title || readingTitle;
      const cleanBody = cleanedInput.bodyText || readingText.trim();
      if (cleanBody !== readingText.trim()) {
        setReadingText(cleanBody);
      }
      if (cleanTitle && cleanTitle !== readingTitle) {
        setReadingTitle(cleanTitle);
      }

      const cleanReadingTitle = cleanOutputTitleStem(cleanTitle, 'Reading Along');
      const voiceObj = allReadingVoices.find((v) => v.id === readingVoice);
      const langFallback =
        LEARNING_LANGUAGE_OPTIONS.find((l) => l.id === readingLearningLang)?.voiceLang || 'en-US';
      const baseLang =
        isMultilingualVoiceId(readingVoice) || !voiceObj?.lang || voiceObj.lang === 'multi'
          ? langFallback
          : voiceObj.lang;
      const activeProvider = ttsOverride?.provider || readingProvider;
      const activeStrict = ttsOverride?.strictProvider === true;
      const unifiedMultilingual = isMultilingualVoiceId(readingVoice);
      const activeIntroText = readingIntroEnabled
        ? (!isReadingIntroCustom
            ? buildDefaultIntroForLang(readingLearningLang, cleanTitle)
            : readingIntroText.trim())
        : '';

      const res = await synthesizeAudioAndSyncCues({
        rawScript: cleanBody,
        title: cleanTitle,
        provider: activeProvider,
        strictProvider: activeStrict,
        voice: readingVoice,
        lang: baseLang,
        rate: readingTtsRate,
        autoSplitLanguages: unifiedMultilingual,
        singleVoiceMultilingual: unifiedMultilingual,
        alignWithWhisper: true,
        whisperModel: alignModel,
        suppressCompleteSound: true,
        onProgress: (pct, label) => {
          setReadingTtsProgress(Math.round(pct * 0.7));
          setReadingTtsStageLabel(label);
        },
      });

      const bodyWords = res.cues.flatMap((c) => c.words);
      const partsToConcat: Array<{ file: File; pauseAfterSec?: number; role: 'intro' | 'body' | 'outro' }> = [];

      const hasVietnameseChars = (s: string) =>
        /[ăđơưảãạằắẳẵặầấẩẫậẻẽẹềếểễệỉĩịỏõọồốổỗộờớởỡợủũụừứửữựỷỹỵ]/i.test(s);

      let anyEdgeFallback = Boolean(res.edgeFallbackToGoogle);
      const collectedEdgeErrors = [...(res.edgeErrors || [])];

      if (activeIntroText) {
        setReadingTtsProgress(74);
        setReadingTtsStageLabel('Đang tạo giọng Intro mở đầu bài đọc...');
        const useViVoice =
          !unifiedMultilingual &&
          hasVietnameseChars(activeIntroText) &&
          (activeProvider === 'auto' || activeProvider === 'edge');
        const introRes = await synthesizeAudioWithProgressJob({
          provider: activeProvider,
          strictProvider: activeStrict,
          voice: unifiedMultilingual ? readingVoice : useViVoice ? 'vi-VN-HoaiMyNeural' : readingVoice,
          lang: hasVietnameseChars(activeIntroText) ? 'vi-VN' : baseLang,
          autoSplitLanguages: false,
          singleVoiceMultilingual: unifiedMultilingual,
          rate: readingTtsRate,
          suppressCompleteSound: true,
          segments: [{ id: 'reading-intro', text: activeIntroText, pauseAfterSec: 0, autoSplit: false }],
        });
        if (introRes.edgeFallbackToGoogle) {
          anyEdgeFallback = true;
          collectedEdgeErrors.push(...(introRes.edgeErrors || []));
        }
        if (introRes.audioBase64) {
          partsToConcat.push({
            file: decodeBase64AudioClip(
              introRes.audioBase64,
              cleanDownloadFileName(`${cleanReadingTitle} Intro`, 'mp3', 'Reading Intro'),
              introRes.mimeType || 'audio/mpeg',
            ),
            pauseAfterSec: 0.45,
            role: 'intro',
          });
        }
      }

      partsToConcat.push({
        file: res.audioFile,
        pauseAfterSec: 0.35,
        role: 'body',
      });

      const outroText = [watermarkOutro.outroLine1.trim(), watermarkOutro.outroLine2.trim()]
        .filter(Boolean)
        .join('. ');
      if (readingOutroSpeechEnabled && watermarkOutro.outroSeconds > 0 && outroText) {
        setReadingTtsProgress(82);
        setReadingTtsStageLabel('Đang tạo giọng đọc Outro...');
        const useViOutro =
          !unifiedMultilingual &&
          hasVietnameseChars(outroText) &&
          (activeProvider === 'auto' || activeProvider === 'edge');
        const outroRes = await synthesizeAudioWithProgressJob({
          provider: activeProvider,
          strictProvider: activeStrict,
          voice: unifiedMultilingual ? readingVoice : useViOutro ? 'vi-VN-HoaiMyNeural' : readingVoice,
          lang: hasVietnameseChars(outroText) ? 'vi-VN' : baseLang,
          autoSplitLanguages: false,
          singleVoiceMultilingual: unifiedMultilingual,
          rate: readingTtsRate,
          suppressCompleteSound: true,
          segments: [{ id: 'reading-outro', text: outroText, pauseAfterSec: 0, autoSplit: false }],
        });
        if (outroRes.edgeFallbackToGoogle) {
          anyEdgeFallback = true;
          collectedEdgeErrors.push(...(outroRes.edgeErrors || []));
        }
        if (outroRes.audioBase64) {
          partsToConcat.push({
            file: decodeBase64AudioClip(
              outroRes.audioBase64,
              cleanDownloadFileName(`${cleanReadingTitle} Outro`, 'mp3', 'Reading Outro'),
              outroRes.mimeType || 'audio/mpeg',
            ),
            pauseAfterSec: 0.45,
            role: 'outro',
          });
        }
      }

      setReadingTtsProgress(88);
      setReadingTtsStageLabel('Đang nối Intro · Bài đọc · Outro & hòa nhạc nền...');

      const combined = await concatAudioFilesWithGaps(
        partsToConcat.map((p) => ({ file: p.file, pauseAfterSec: p.pauseAfterSec })),
        cleanDownloadFileName(cleanReadingTitle, 'wav', 'Reading Speech'),
      );

      const introIdx = partsToConcat.findIndex((p) => p.role === 'intro');
      const bodyIdx = partsToConcat.findIndex((p) => p.role === 'body');
      const outroIdx = partsToConcat.findIndex((p) => p.role === 'outro');

      const exactIntroEndSec = bodyIdx >= 0 ? combined.segmentOffsets[bodyIdx] : 0;
      const bodyDurSec = bodyIdx >= 0 ? combined.segmentDurations[bodyIdx] : res.durationSec;
      const bodyEndWithIntro = Number((exactIntroEndSec + bodyDurSec + 0.35).toFixed(3));
      const outroStartSec = outroIdx >= 0 ? combined.segmentOffsets[outroIdx] : undefined;
      const outroSpeechDur = outroIdx >= 0 ? combined.segmentDurations[outroIdx] + 0.55 : 0;

      const updatedOutroSec =
        readingOutroSpeechEnabled && outroIdx >= 0
          ? Math.max(watermarkOutro.outroSeconds, Number(outroSpeechDur.toFixed(1)))
          : watermarkOutro.outroSeconds;
      const updatedWatermark: EduWatermarkOutroConfig =
        updatedOutroSec !== watermarkOutro.outroSeconds
          ? { ...watermarkOutro, outroSeconds: updatedOutroSec }
          : watermarkOutro;

      if (updatedWatermark !== watermarkOutro) {
        setWatermarkOutro(updatedWatermark);
      }

      const shiftedWords = shiftReadingWordsForIntro(bodyWords, exactIntroEndSec);
      const shiftedCues = res.cues.map((cue) => ({
        ...cue,
        start: Number((cue.start + exactIntroEndSec).toFixed(3)),
        end: Number((cue.end + exactIntroEndSec).toFixed(3)),
        words: shiftReadingWordsForIntro(cue.words, exactIntroEndSec),
      }));

      const speechWindows: Array<{ start: number; end: number }> = [];
      if (introIdx >= 0) {
        speechWindows.push({
          start: combined.segmentOffsets[introIdx],
          end: combined.segmentOffsets[introIdx] + combined.segmentDurations[introIdx],
        });
      }
      if (bodyIdx >= 0) {
        speechWindows.push({
          start: combined.segmentOffsets[bodyIdx],
          end: combined.segmentOffsets[bodyIdx] + combined.segmentDurations[bodyIdx],
        });
      }
      if (outroIdx >= 0) {
        speechWindows.push({
          start: combined.segmentOffsets[outroIdx],
          end: combined.segmentOffsets[outroIdx] + combined.segmentDurations[outroIdx],
        });
      }

      const metrics = computeReadingTimelineMetrics({
        words: shiftedWords,
        contentDuration: bodyEndWithIntro,
        introEnabled: introIdx >= 0,
        introSeconds: exactIntroEndSec,
        outroSeconds: updatedWatermark.outroSeconds,
        outroText,
      });

      let finalAudioFile = combined.file;
      let finalTotalDur = Math.max(combined.durationSec, metrics.effectiveTotalDuration);

      if ((readingBgmPreset !== 'none' || Boolean(readingCustomBgmFile)) && readingBgmVolume > 0) {
        const mixed = await mixVoiceWithBgmPreset({
          voiceFile: combined.file,
          bgmPreset: readingBgmPreset,
          bgmVolume: readingBgmVolume,
          customBgmFile: readingCustomBgmFile,
          speechWindows,
          introEndSec: exactIntroEndSec,
          outroStartSec: outroStartSec ?? metrics.outroStart,
          minTotalDurationSec: metrics.effectiveTotalDuration,
          outputFileName: cleanDownloadFileName(cleanReadingTitle, 'wav', 'Reading Along'),
        });
        if (mixed.file) {
          finalAudioFile = mixed.file;
          finalTotalDur = Math.max(finalTotalDur, mixed.durationSec);
        }
      }

      const nextSig = JSON.stringify({
        readingTitle: cleanTitle.trim(),
        readingText: cleanBody.trim(),
        readingProvider,
        readingVoice,
        readingTtsRate,
        readingIntroEnabled,
        readingIntroText: activeIntroText,
        readingOutroSpeechEnabled,
        outroSpeechText:
          readingOutroSpeechEnabled && updatedWatermark.outroSeconds > 0 ? outroText : '',
        outroSeconds: updatedWatermark.outroSeconds,
        readingBgmPreset,
        readingBgmVolume: Number(readingBgmVolume.toFixed(2)),
        readingCustomBgmName: readingCustomBgmFile?.name || '',
        readingCustomBgmSize: readingCustomBgmFile?.size || 0,
      });

      if (introIdx >= 0) {
        setReadingIntroSeconds(Number(exactIntroEndSec.toFixed(2)));
      }
      setIsCustomAlignAudio(false);
      setSynthesizedReadingSig(nextSig);
      setAlignFile(finalAudioFile);
      setAlignAudioDur(Math.max(3, finalTotalDur));
      setAlignAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(finalAudioFile);
      });
      setAlignResult({
        language: res.detectedLanguage,
        modelUsed: res.whisperAligned ? 'fast-forced' : res.providerUsed,
        backendUsed: res.providerUsed,
        durationSec: metrics.contentEnd,
        text: cleanBody,
        words: shiftedWords,
        cues: shiftedCues,
        srt: res.srt,
      });
      setAlignCurrentSec(0);
      setReadingTtsProgress(100);
      setReadingTtsStageLabel('Hoàn tất Intro · Bài đọc · Outro có nhạc nền!');
      playTtsCompleteSound();

      if (anyEdgeFallback && !activeStrict) {
        notifyEdgeFallbackToGoogle({
          id: 'reading-along-edge-fallback',
          sourceLabel: 'Reading Along',
          edgeErrors: collectedEdgeErrors,
          onRetryEdge: async () => {
            const retried = await handleGenerateReadingTts({
              provider: 'edge',
              strictProvider: true,
            });
            if (!retried) {
              throw new Error('Edge TTS vẫn đang tạm gián đoạn, đã giữ nguyên Audio Google.');
            }
          },
        });
      }

      return {
        audioFile: finalAudioFile,
        title: cleanTitle,
        text: cleanBody,
        words: shiftedWords,
        contentEnd: metrics.contentEnd,
        totalDuration: metrics.effectiveTotalDuration,
        introEnabled: introIdx >= 0,
        introSeconds: exactIntroEndSec,
        introSubtitle: activeIntroText || cleanTitle,
        watermarkOutro: updatedWatermark,
      };
    } catch (err) {
      setAlignError(err instanceof Error ? err.message : 'Lỗi tạo Audio TTS cho bài đọc.');
      return null;
    } finally {
      setIsGeneratingReadingTts(false);
    }
  };

  const handleRunWordAlign = async () => {
    if (!alignFile || isAligning) return;
    setAlignError(null);
    setIsAligning(true);
    setReadingTtsProgress(5);
    const effectiveAlignMode = readingText.trim() ? alignMode : 'whisper';
    setReadingTtsStageLabel(
      effectiveAlignMode === 'fast-forced'
        ? 'Đang căn nhịp siêu tốc theo kịch bản (Fast Forced Align)...'
        : 'Đang tải model Whisper & căn chỉnh từng từ...',
    );
    try {
      const data = await alignAudioWithProgressJob(
        {
          audioFile: alignFile,
          lang: alignLang,
          model: alignModel,
          referenceText: readingText,
          alignMode: effectiveAlignMode,
        },
        (pct, label) => {
          setReadingTtsProgress(pct);
          setReadingTtsStageLabel(label);
        },
      );
      if (data.text?.trim() && !readingText.trim()) {
        setReadingText(data.text.trim());
      }
      if (alignAudioRef.current && Number.isFinite(alignAudioRef.current.duration)) {
        setAlignAudioDur(alignAudioRef.current.duration);
      }
      const cuesArr = Array.isArray(data.cues) ? data.cues : [];
      const wordsArr = Array.isArray(data.words) ? data.words : [];
      const wordsEnd = wordsArr.length > 0 ? wordsArr[wordsArr.length - 1].end : 0;
      const cuesEnd = cuesArr.length > 0 ? cuesArr[cuesArr.length - 1].end : 0;
      const dur = Math.max(
        wordsEnd,
        cuesEnd,
        alignAudioRef.current && Number.isFinite(alignAudioRef.current.duration)
          ? alignAudioRef.current.duration
          : alignAudioDur,
      );
      setAlignResult({
        language: data.language,
        modelUsed: data.modelUsed || (alignMode === 'fast-forced' ? 'fast-forced' : alignModel),
        backendUsed: data.backendUsed || (alignMode === 'fast-forced' ? 'fast-forced' : 'whisper'),
        durationSec: Number(dur || 0),
        text: data.text || readingText,
        words: wordsArr,
        cues: cuesArr,
        srt: data.srt || '',
      });
    } catch (err) {
      setAlignError(err instanceof Error ? err.message : 'Lỗi căn chỉnh từng từ.');
    } finally {
      setIsAligning(false);
    }
  };

  const handleExportReadingAlongMp4 = async () => {
    if (isExportingReadingMp4) return;
    setAlignError(null);
    setIsExportingReadingMp4(true);
    setReadingExportProgress(0);
    setReadingExportStatus('Đang dựng video Reading Along + Intro/Outro + Nhạc nền...');
    const controller = new AbortController();
    readingAbortRef.current = controller;

    try {
      let targetAudio = alignFile;
      let targetTitle = readingTitle;
      let targetText = readingText;
      let targetWords = effectiveReadingWords;
      let targetContentEnd = readingTimeline.contentEnd;
      let targetTotalDur = readingTimeline.effectiveTotalDuration;
      let targetIntroEnabled = readingIntroEnabled && readingIntroText.trim().length > 0;
      let targetIntroSec = activeIntroSec;
      let targetIntroSub = readingIntroText.trim() || readingTitle;
      let targetWatermark = watermarkOutro;

      if (!targetAudio || (!isCustomAlignAudio && synthesizedReadingSig !== currentReadingSig)) {
        setReadingExportStatus('Đang tạo lại giọng đọc Intro/Outro & hòa nhạc nền mới nhất...');
        const bundle = await handleGenerateReadingTts();
        if (!bundle) {
          throw new Error('Không thể tạo audio bài đọc trước khi xuất MP4.');
        }
        targetAudio = bundle.audioFile;
        targetTitle = bundle.title;
        targetText = bundle.text;
        targetWords = bundle.words;
        targetContentEnd = bundle.contentEnd;
        targetTotalDur = bundle.totalDuration;
        targetIntroEnabled = bundle.introEnabled;
        targetIntroSec = bundle.introSeconds;
        targetIntroSub = bundle.introSubtitle;
        targetWatermark = bundle.watermarkOutro;
      }

      if (controller.signal.aborted) {
        throw new ExportAbortedError();
      }

      const baseStem = cleanOutputTitleStem(targetTitle, 'Reading Along');

      const dummyProject: LessonProject = {
        id: 'reading-along-preview',
        title: targetTitle,
        subtitle: readingTopic,
        theme: 'pastel-sunrise',
        duration: targetTotalDur,
        fps: readingFps === 60 ? 60 : 30,
        cues: [],
        elements: [],
        backgroundImage: readingBackground,
      };

      const readingDescription = buildVideoDescription({
        title: targetTitle,
        nativeLang: 'vi',
        learningLang: readingLearningLang,
        style: 'phrase-pack',
        durationSec: targetTotalDur,
        topicHint: readingTopic,
        sampleLines: [targetText],
      });

      const saved = await exportProjectToServerDisk(
        dummyProject,
        targetAudio,
        ({ progress, stageLabel }) => {
          setReadingExportProgress(progress);
          setReadingExportStatus(stageLabel);
        },
        {
          aspectRatio: readingAspect,
          resolution: readingResolution,
          quality: readingQuality,
          fps: readingFps,
        },
        baseStem,
        selectedSavePath.trim() || TAB_OUTPUT_SUBFOLDERS.reading,
        {
          signal: controller.signal,
          directoryHandle: localDirHandle || undefined,
          sourceTab: 'Reading Along',
          companionText: readingDescription.txtContent,
          customRenderFrame: (ctx, time, width, height) => {
            renderReadingAlongFrame(ctx, {
              width,
              height,
              title: targetTitle,
              topicBadge: readingTopic,
              text: targetText,
              words: targetWords,
              currentTime: time,
              contentDuration: targetContentEnd,
              totalDuration: targetTotalDur,
              introEnabled: targetIntroEnabled,
              introSeconds: targetIntroSec,
              introTitle: getReadingUiStrings(readingLearningLang).introBadge,
              introSubtitle: targetIntroSub,
              paletteId: readingPaletteId,
              illustrationStyle: readingIllustration,
              bookFrame: readingBookFrame,
              pointerStyle: readingPointerStyle,
              background: readingBackground,
              subtitlePosition: mappedReadingSubPos,
              subtitleSize: mappedReadingSubSize,
              learningLanguage: readingLearningLang,
              watermarkOutro: targetWatermark,
              pointerScale: readingPointerScale,
              pointerOffsetX: readingPointerOffsetX,
              pointerOffsetY: readingPointerOffsetY,
            });
          },
        },
      );

      setReadingExportStatus(`Hoàn tất! Đã lưu ${saved.fileName} kèm ${baseStem}.txt (${saved.savedPath}).`);
      emitOutputUpdated({ relativePath: saved.relativePath, sourceTab: 'Reading Along' });
      playExportCompleteSound();
      await refreshOutputFolders();
    } catch (err) {
      if (err instanceof ExportAbortedError || controller.signal.aborted) {
        setReadingExportStatus('Đã hủy xuất Reading Along MP4.');
      } else {
        setAlignError(err instanceof Error ? err.message : 'Lỗi xuất Reading Along MP4.');
        setReadingExportStatus('');
      }
    } finally {
      readingAbortRef.current = null;
      setIsExportingReadingMp4(false);
    }
  };

  const handleScrapeReadingUrl = async (targetUrl?: string, adaptWithAi = true) => {
    const cleanUrl = (targetUrl || readingUrl).trim();
    if (!cleanUrl || isScrapingOrGeneratingReading) return;
    if (targetUrl) setReadingUrl(targetUrl);
    setAlignError(null);
    setIsScrapingOrGeneratingReading(true);
    setReadingAiProgress(12);
    setReadingAiStageLabel('Đang tải và bóc tách nội dung sạch từ trang web...');

    try {
      const scrapeRes = await fetch('/api/scraper/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl }),
      });
      const scraped = await parseApiJson<{
        title?: string;
        rawText?: string;
        text?: string;
        links?: Array<{ title: string; url: string }>;
        subLinks?: Array<{ title: string; url: string }>;
        error?: string;
      }>(scrapeRes, 'Không đọc được nội dung từ trang web');
      const extractedText = (scraped.rawText || scraped.text || '').trim();
      const extractedLinks = Array.isArray(scraped.links)
        ? scraped.links
        : Array.isArray(scraped.subLinks)
          ? scraped.subLinks
          : [];
      if (!scrapeRes.ok || !extractedText) {
        throw new Error(scraped.error || 'Không trích xuất được nội dung bài đọc từ URL này.');
      }
      setReadingUrlSubLinks(extractedLinks.slice(0, 8));
      setScrapedWebSource({
        url: cleanUrl,
        title: scraped.title || cleanUrl,
        rawText: extractedText,
      });
      setReadingWebPromptMode('web-url');
      setReadingAiProgress(55);

      if (adaptWithAi && effectiveReadingGeminiKey) {
        setReadingAiStageLabel(`AI đang biên tập lại theo trình độ ${readingAiLevel}...`);
        const aiRes = await fetch('/api/ai/generate-reading', {
          method: 'POST',
          headers: buildApiKeyHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            mode: 'adapt-url',
            learningLanguage: readingLearningLang,
            formatPreference: readingFormat,
            level: readingAiLevel,
            wordCount: readingAiLength,
            durationMinutes: readingDurationMinutes,
            sourceTitle: scraped.title || '',
            sourceText: extractedText,
          }),
        });
        const aiData = await parseApiJson<{
          title?: string;
          topicBadge?: string;
          text?: string;
          error?: string;
        }>(aiRes, 'AI chuyển thể bài đọc thất bại');
        if (aiRes.ok && aiData.text?.trim()) {
          setReadingAiProgress(100);
          setReadingTitle(aiData.title || scraped.title || readingTitle);
          setReadingTopic(aiData.topicBadge || `${readingAiLevel} · WEB`);
          setReadingText(aiData.text.trim());
          setAlignResult(null);
          setAlignCurrentSec(0);
          setSynthesizedReadingSig('');
          setReadingAiStageLabel(`Đã lấy bài từ web & chuyển thể trình độ ${readingAiLevel}!`);
          return;
        }
      }

      const rawLines = extractedText
        .split(/(?<=[.!?。！？])\s+|\r?\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 6)
        .slice(0, 14);
      setReadingAiProgress(100);
      if (scraped.title?.trim()) setReadingTitle(scraped.title.trim().slice(0, 80));
      setReadingTopic(`WEB ARTICLE · ${readingAiLevel}`);
      setReadingText((rawLines.length > 0 ? rawLines : [extractedText.slice(0, 900)]).join('\n'));
      setAlignResult(null);
      setAlignCurrentSec(0);
      setSynthesizedReadingSig('');
      setIsWebPromptOpen(true);
      setReadingAiStageLabel(
        effectiveReadingGeminiKey
          ? 'Đã lấy nội dung trang web vào bài đọc!'
          : 'Đã bóc tách văn bản sạch từ Web — có thể sao chép Prompt Web AI bên dưới rồi dán kết quả về sách!',
      );
    } catch (err) {
      setAlignError(err instanceof Error ? err.message : 'Lỗi đọc nội dung từ trang web.');
      setReadingAiStageLabel('');
    } finally {
      setIsScrapingOrGeneratingReading(false);
    }
  };

  const handleAiGenerateReadingPassage = async () => {
    if (isScrapingOrGeneratingReading) return;
    setAlignError(null);
    setIsScrapingOrGeneratingReading(true);
    setReadingAiProgress(18);
    const langLabel =
      LEARNING_LANGUAGE_OPTIONS.find((l) => l.id === readingLearningLang)?.nativeName || readingLearningLang;
    setReadingAiStageLabel(`AI đang sáng tạo bài đọc ${langLabel} (${readingAiLevel})...`);
    try {
      const res = await fetch('/api/ai/generate-reading', {
        method: 'POST',
        headers: buildApiKeyHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          mode: 'generate',
          learningLanguage: readingLearningLang,
          formatPreference: readingFormat,
          topic: readingAiTopic.trim(),
          level: readingAiLevel,
          wordCount: readingAiLength,
          durationMinutes: readingDurationMinutes,
        }),
      });
      const data = await parseApiJson<{
        title?: string;
        topicBadge?: string;
        text?: string;
        error?: string;
      }>(res, 'AI tạo bài đọc thất bại');
      if (!res.ok || !data.text?.trim()) {
        throw new Error(data.error || 'AI không tạo được bài đọc.');
      }
      setReadingAiProgress(100);
      setReadingTitle(data.title || readingAiTopic.trim() || `${langLabel} Reading`);
      setReadingTopic(data.topicBadge || `${readingAiLevel} · READING`);
      setReadingText(data.text.trim());
      setAlignResult(null);
      setAlignCurrentSec(0);
      setSynthesizedReadingSig('');
      setReadingAiStageLabel(`AI đã tạo xong bài đọc ${langLabel} trình độ ${readingAiLevel}!`);
    } catch (err) {
      setAlignError(err instanceof Error ? err.message : 'Lỗi AI tạo bài đọc.');
      setReadingAiStageLabel('');
    } finally {
      setIsScrapingOrGeneratingReading(false);
    }
  };

  const handleAiAdaptReadingText = async () => {
    if (isScrapingOrGeneratingReading) return;
    if (!adaptRawInputText.trim()) {
      setAlignError('Hãy dán nội dung gốc cần biên tập theo trình độ trước.');
      return;
    }
    setAlignError(null);
    setIsScrapingOrGeneratingReading(true);
    setReadingAiProgress(20);
    const langLabel =
      LEARNING_LANGUAGE_OPTIONS.find((l) => l.id === readingLearningLang)?.nativeName || readingLearningLang;
    setReadingAiStageLabel(
      `AI đang biên tập nội dung sang ${langLabel} trình độ ${readingAiLevel} (~${readingDurationMinutes} phút)...`,
    );
    try {
      const res = await fetch('/api/ai/generate-reading', {
        method: 'POST',
        headers: buildApiKeyHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          mode: 'adapt-text',
          learningLanguage: readingLearningLang,
          formatPreference: readingFormat,
          topic: readingAiTopic.trim(),
          level: readingAiLevel,
          wordCount: readingAiLength,
          durationMinutes: readingDurationMinutes,
          sourceText: adaptRawInputText.trim(),
          sourceTitle: readingTitle.trim(),
        }),
      });
      const data = await parseApiJson<{
        title?: string;
        topicBadge?: string;
        text?: string;
        error?: string;
      }>(res, 'AI biên tập bài đọc thất bại');
      if (!res.ok || !data.text?.trim()) {
        throw new Error(data.error || 'AI không biên tập được nội dung này.');
      }
      setReadingAiProgress(100);
      setReadingTitle(data.title || readingTitle || `${langLabel} Reading`);
      setReadingTopic(data.topicBadge || `${readingAiLevel} · READING`);
      setReadingText(data.text.trim());
      setAlignResult(null);
      setAlignCurrentSec(0);
      setSynthesizedReadingSig('');
      setReadingAiStageLabel(`Đã biên tập xong bài đọc ${langLabel} trình độ ${readingAiLevel}!`);
    } catch (err) {
      setAlignError(err instanceof Error ? err.message : 'Lỗi AI biên tập bài đọc.');
      setReadingAiStageLabel('');
    } finally {
      setIsScrapingOrGeneratingReading(false);
    }
  };

  const handleExportReadingJson = () => {
    const cleanText = readingText.trim();
    if (!cleanText) {
      setAlignError('Chưa có nội dung bài đọc để xuất file .json.');
      return;
    }
    const payload = {
      title: readingTitle.trim() || 'Reading Practice',
      topicBadge: readingTopic.trim() || `${readingAiLevel} · READING`,
      level: readingAiLevel,
      learningLanguage: readingLearningLang,
      text: cleanText,
    };
    const fileName = cleanDownloadFileName(
      readingTitle.trim() || 'reading-lesson',
      'json',
      'reading-lesson',
    );
    downloadTextAsPlainFile(JSON.stringify(payload, null, 2), fileName);
    setReadingAiStageLabel(`Đã xuất file ${fileName} (có thể dùng ngay trong Batch hàng loạt)!`);
  };

  const handleCopyReadingWebPrompt = async () => {
    try {
      await navigator.clipboard.writeText(readingWebAiPrompt);
      setCopiedReadingPrompt(true);
      setTimeout(() => setCopiedReadingPrompt(false), 2000);
    } catch {
      setCopiedReadingPrompt(false);
    }
  };

  const handleApplyPastedReadingAi = () => {
    setPastedReadingAiError(null);
    const parsed = parseReadingWebAiResponse(pastedReadingAiResponse, readingAiLevel);
    if (!parsed) {
      setPastedReadingAiError('Hãy dán kết quả JSON hoặc đoạn văn bản bài đọc từ ChatGPT/Gemini vào ô trên.');
      return;
    }
    setReadingTitle(parsed.title);
    setReadingTopic(parsed.topicBadge);
    setReadingText(parsed.text);
    setAlignResult(null);
    setAlignCurrentSec(0);
    setSynthesizedReadingSig('');
    setReadingAiStageLabel(`Đã nạp nội dung từ Web AI (${parsed.title}) vào trang sách!`);
  };

  const wmPosClass =
    watermarkOutro.watermarkCorner === 'top-left'
      ? 'top-2.5 left-2.5'
      : watermarkOutro.watermarkCorner === 'top-right'
        ? 'top-2.5 right-2.5'
        : watermarkOutro.watermarkCorner === 'bottom-left'
          ? 'bottom-10 left-2.5'
          : 'bottom-10 right-2.5';

  return (
    <div className="max-w-[1400px] w-full mx-auto p-4 lg:p-6 space-y-5">
      {/* Header Banner */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            Educational Audio Video Studio 1.19 — FFmpeg Server &amp; Reading Along
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Đầy đủ 3 module nguyên bản 1.19: Merge Video+Audio (đơn &amp; batch), Add Karaoke Sub (6 style ASS) + Audio Mix, Reading Along Book+Pointer — file xuất hiển thị ngay ở Thư mục Output chung bên dưới.
          </p>
        </div>
      </section>

      {folderStatusMsg && (
        <div className="px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between gap-2">
          <span>{folderStatusMsg}</span>
          <button
            type="button"
            onClick={() => setFolderStatusMsg(null)}
            className="text-emerald-700 font-semibold"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Full-width Studio Workspace */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSubTab('merge')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                subTab === 'merge'
                  ? 'bg-white border-indigo-300 text-indigo-700 shadow-xs'
                  : 'border-transparent text-slate-600 hover:bg-white/60'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>1. Ghép Video + Audio</span>
            </button>

            <button
              type="button"
              onClick={() => setSubTab('karaoke')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                subTab === 'karaoke'
                  ? 'bg-white border-indigo-300 text-indigo-700 shadow-xs'
                  : 'border-transparent text-slate-600 hover:bg-white/60'
              }`}
            >
              <Music className="w-3.5 h-3.5" />
              <span>2. Phụ Đề &amp; Nhạc Nền</span>
            </button>

            <button
              type="button"
              onClick={() => setSubTab('align')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                subTab === 'align'
                  ? 'bg-white border-indigo-300 text-indigo-700 shadow-xs'
                  : 'border-transparent text-slate-600 hover:bg-white/60'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>3. Video Đọc Theo Chữ</span>
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* ── SUB-TAB 1: MERGE VIDEO + AUDIO (Single + Batch) ───────────── */}
            {subTab === 'merge' && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                  <div className="inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setMergeMode('single')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                        mergeMode === 'single'
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Một Video + Một Audio
                    </button>
                    <button
                      type="button"
                      onClick={() => setMergeMode('batch')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                        mergeMode === 'batch'
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Batch – Ghép hàng loạt theo tên file
                    </button>
                  </div>
                  <select
                    value={durationMode}
                    onChange={(e) => setDurationMode(e.target.value as 'loop-video' | 'shortest')}
                    className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                  >
                    <option value="shortest">Cắt theo file ngắn hơn (Shortest - Chuẩn 1.19)</option>
                    <option value="loop-video">Tự lặp Video nền khớp hết Audio</option>
                  </select>
                </div>

                {mergeMode === 'single' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="p-3.5 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 hover:bg-indigo-50/40 cursor-pointer flex items-center gap-2.5">
                      <Film className="w-5 h-5 text-indigo-600 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-800 truncate">
                          {mergeVideoFile ? mergeVideoFile.name : 'Chọn Video nền (.mp4, .mov)'}
                        </div>
                        <div className="text-[11px] text-slate-500">Tên file xuất tự lấy theo tên video gốc</div>
                      </div>
                      <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          setMergeVideoFile(f);
                          if (f) setMergeOutputName(f.name.replace(/\.[^.]+$/, ''));
                        }}
                      />
                    </label>

                    <label className="p-3.5 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 hover:bg-indigo-50/40 cursor-pointer flex items-center gap-2.5">
                      <FileAudio className="w-5 h-5 text-emerald-600 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-800 truncate">
                          {mergeAudioFile ? mergeAudioFile.name : 'Chọn Audio ngoài (.mp3, .wav)'}
                        </div>
                        <div className="text-[11px] text-slate-500">Thay thế audio gốc trong video</div>
                      </div>
                      <input
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={(e) => setMergeAudioFile(e.target.files?.[0] ?? null)}
                      />
                    </label>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="p-3.5 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 hover:bg-indigo-50/40 cursor-pointer flex items-center gap-2.5">
                        <Film className="w-5 h-5 text-indigo-600 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-800">
                            {batchVideos.length > 0 ? `Đã chọn ${batchVideos.length} Video` : 'Chọn nhiều Video (Batch)'}
                          </div>
                          <div className="text-[11px] text-slate-500">Ghép tự động với Audio cùng tên</div>
                        </div>
                        <input
                          type="file"
                          multiple
                          accept="video/*"
                          className="hidden"
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            setBatchVideos(files);
                            if (files[0]) setMergeVideoFile(files[0]);
                          }}
                        />
                      </label>
                      <label className="p-3.5 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 hover:bg-indigo-50/40 cursor-pointer flex items-center gap-2.5">
                        <FileAudio className="w-5 h-5 text-emerald-600 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-800">
                            {batchAudios.length > 0 ? `Đã chọn ${batchAudios.length} Audio` : 'Chọn nhiều Audio (Batch)'}
                          </div>
                          <div className="text-[11px] text-slate-500">VD: lesson01.mp4 ↔ lesson01.mp3</div>
                        </div>
                        <input
                          type="file"
                          multiple
                          accept="audio/*"
                          className="hidden"
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            setBatchAudios(files);
                            if (files[0]) setMergeAudioFile(files[0]);
                          }}
                        />
                      </label>
                    </div>
                    {(batchVideos.length > 0 || batchAudios.length > 0) && (
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] space-y-1">
                        <div className="font-semibold text-emerald-700">
                          Khớp tự động: {batchMatchedPairs.matched.length} cặp Video + Audio
                        </div>
                        {batchMatchedPairs.missing.length > 0 && (
                          <div className="text-amber-700">
                            Thiếu Audio cùng tên: {batchMatchedPairs.missing.slice(0, 6).join(', ')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Always-visible Live Preview for Merge + Watermark/Outro */}
                <div className="p-3.5 rounded-xl bg-slate-900 text-white space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="font-semibold text-indigo-300 inline-flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5" />
                      <span>Live Preview (Merge Video + Watermark &amp; Outro)</span>
                    </span>
                    <div className="flex items-center gap-2">
                      {mergeVideoUrl && mergeAudioUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowMergeOutroPreview(false);
                            const v = mergePreviewVideoRef.current;
                            const a = mergePreviewAudioRef.current;
                            if (!v || !a) return;
                            if (v.paused || a.paused) {
                              v.currentTime = 0;
                              a.currentTime = 0;
                              void v.play().catch(() => undefined);
                              void a.play().catch(() => undefined);
                            } else {
                              v.pause();
                              a.pause();
                            }
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold"
                        >
                          <Play className="w-2.5 h-2.5 fill-current" />
                          <span>Phát khớp Video &amp; Audio</span>
                        </button>
                      )}
                      {watermarkOutro.outroSeconds > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowMergeOutroPreview((o) => !o)}
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-semibold ${
                            showMergeOutroPreview
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-slate-700 hover:bg-slate-600 text-white'
                          }`}
                        >
                          <Eye className="w-2.5 h-2.5" />
                          <span>{showMergeOutroPreview ? 'Đóng Outro' : 'Xem thử Outro'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div
                    onClick={() => setSelectedMergeZone((prev) => prev || 'watermark')}
                    className="relative rounded-lg overflow-hidden bg-slate-950 min-h-[175px] flex items-center justify-center border border-slate-800 cursor-pointer"
                  >
                    {mergeVideoUrl ? (
                      <video
                        ref={mergePreviewVideoRef}
                        controls
                        loop={durationMode === 'loop-video'}
                        muted={Boolean(mergeAudioUrl)}
                        src={mergeVideoUrl}
                        className="w-full max-h-60 mx-auto object-contain"
                      />
                    ) : (
                      <div className="p-6 text-center space-y-1">
                        <Film className="w-7 h-7 text-slate-600 mx-auto" />
                        <p className="text-xs font-medium text-slate-300">
                          Khung Live Preview Watermark &amp; Outro
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Click trực tiếp lên khung, Watermark hoặc Outro để sửa ngay bên dưới
                        </p>
                      </div>
                    )}

                    {watermarkOutro.watermarkEnabled && watermarkOutro.watermarkText.trim() && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMergeZone('watermark');
                        }}
                        title="Click để sửa Watermark ngay bên dưới"
                        style={{ opacity: watermarkOutro.watermarkOpacity }}
                        className={`absolute px-2.5 py-1 rounded bg-black/55 text-white text-xs font-semibold cursor-pointer hover:ring-2 hover:ring-indigo-400 transition-shadow ${wmPosClass}`}
                      >
                        {watermarkOutro.watermarkText}
                      </button>
                    )}

                    {showMergeOutroPreview && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMergeZone('outro');
                        }}
                        title="Click để sửa Outro ngay bên dưới"
                        className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center p-6 text-center space-y-1.5 z-10 cursor-pointer"
                      >
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                          Xem trước Outro cuối video (+{watermarkOutro.outroSeconds}s sau khi kết thúc)
                        </span>
                        <div className="text-base font-bold text-white">
                          {watermarkOutro.outroLine1 || 'Thanks for watching!'}
                        </div>
                        {watermarkOutro.outroLine2 && (
                          <div className="text-xs text-slate-300">{watermarkOutro.outroLine2}</div>
                        )}
                      </div>
                    )}
                  </div>

                  {mergeAudioUrl && (
                    <audio
                      ref={mergePreviewAudioRef}
                      controls
                      src={mergeAudioUrl}
                      className="w-full h-8"
                    />
                  )}

                  <VideoSnapshotStrip
                    videoUrl={mergeVideoUrl}
                    watermarkOutro={watermarkOutro}
                    onSeek={(t) => {
                      if (mergePreviewVideoRef.current) {
                        mergePreviewVideoRef.current.currentTime = t;
                      }
                    }}
                  />

                  <div className="pt-1 border-t border-slate-800 space-y-2" data-testid="merge-inline-preview-editor">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-slate-400 font-semibold">Sửa nhanh ngay dưới Preview:</span>
                        {(
                          [
                            { id: 'watermark', label: 'Watermark' },
                            { id: 'outro', label: 'Outro cuối video' },
                            { id: 'output', label: 'Tên file đầu ra' },
                          ] as const
                        ).map((z) => (
                          <button
                            key={z.id}
                            type="button"
                            onClick={() => {
                              setSelectedMergeZone(z.id);
                              if (z.id === 'outro' && watermarkOutro.outroSeconds > 0) {
                                setShowMergeOutroPreview(true);
                              } else {
                                setShowMergeOutroPreview(false);
                              }
                            }}
                            className={`px-2 py-0.5 rounded font-semibold transition-colors ${
                              selectedMergeZone === z.id
                                ? 'bg-indigo-500 text-white'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {z.label}
                          </button>
                        ))}
                      </div>
                      {selectedMergeZone && (
                        <button
                          type="button"
                          onClick={() => setSelectedMergeZone(null)}
                          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
                          aria-label="Đóng sửa nhanh Merge"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {selectedMergeZone === 'watermark' && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-2.5 rounded-lg bg-slate-800/80 border border-slate-700 text-xs">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-300 mb-1">Chữ Watermark</label>
                          <input
                            type="text"
                            value={watermarkOutro.watermarkText}
                            onChange={(e) =>
                              setWatermarkOutro((p) => ({ ...p, watermarkText: e.target.value, watermarkEnabled: true }))
                            }
                            className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-300 mb-1">Góc đặt</label>
                          <select
                            value={watermarkOutro.watermarkCorner}
                            onChange={(e) =>
                              setWatermarkOutro((p) => ({
                                ...p,
                                watermarkCorner: e.target.value as EduWatermarkCorner,
                              }))
                            }
                            className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white"
                          >
                            <option value="top-left">Trên trái</option>
                            <option value="top-right">Trên phải</option>
                            <option value="bottom-left">Dưới trái</option>
                            <option value="bottom-right">Dưới phải</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-300 mb-1">
                            Độ mờ ({Math.round(watermarkOutro.watermarkOpacity * 100)}%)
                          </label>
                          <input
                            type="range"
                            min={0.15}
                            max={1}
                            step={0.05}
                            value={watermarkOutro.watermarkOpacity}
                            onChange={(e) =>
                              setWatermarkOutro((p) => ({ ...p, watermarkOpacity: Number(e.target.value) }))
                            }
                            className="w-full accent-indigo-400"
                          />
                        </div>
                      </div>
                    )}

                    {selectedMergeZone === 'outro' && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-2.5 rounded-lg bg-slate-800/80 border border-slate-700 text-xs">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-300 mb-1">Outro Dòng 1</label>
                          <input
                            type="text"
                            value={watermarkOutro.outroLine1}
                            onChange={(e) =>
                              setWatermarkOutro((p) => ({ ...p, outroLine1: e.target.value }))
                            }
                            className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-300 mb-1">Outro Dòng 2</label>
                          <input
                            type="text"
                            value={watermarkOutro.outroLine2}
                            onChange={(e) =>
                              setWatermarkOutro((p) => ({ ...p, outroLine2: e.target.value }))
                            }
                            className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-300 mb-1">Thời lượng Outro (giây)</label>
                          <input
                            type="number"
                            min={0}
                            max={15}
                            step={0.5}
                            value={watermarkOutro.outroSeconds}
                            onChange={(e) =>
                              setWatermarkOutro((p) => ({ ...p, outroSeconds: Number(e.target.value) || 0 }))
                            }
                            className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white tabular-nums"
                          />
                        </div>
                      </div>
                    )}

                    {selectedMergeZone === 'output' && (
                      <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700 text-xs">
                        <label className="block text-[10px] font-semibold text-slate-300 mb-1">Tên file đầu ra</label>
                        <input
                          type="text"
                          value={mergeOutputName}
                          onChange={(e) => setMergeOutputName(e.target.value)}
                          placeholder="Tự lấy theo tên video gốc"
                          className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white font-mono"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {mergeMode === 'single' && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Tên file đầu ra (mặc định lấy tên video gốc)
                    </label>
                    <input
                      type="text"
                      value={mergeOutputName}
                      onChange={(e) => setMergeOutputName(e.target.value)}
                      placeholder={
                        mergeVideoFile
                          ? mergeVideoFile.name.replace(/\.[^.]+$/, '')
                          : 'Tự lấy theo tên video gốc'
                      }
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg font-mono"
                    />
                  </div>
                )}

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      Trợ lý AI Web · Nhập Subtitle / Script → Prompt (.json) → Nạp Thẻ &amp; Kịch bản từ JSON AI Web
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          buildEduWebAiPrompt('Ghép Video + Audio', mergeAiScript, mergeOutputName || mergeVideoFile?.name || ''),
                        );
                        setCopiedMergePrompt(true);
                        setTimeout(() => setCopiedMergePrompt(false), 1800);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                    >
                      {copiedMergePrompt ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedMergePrompt ? 'Đã chép Prompt!' : 'Sao chép Prompt AI Web (.json)'}</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-slate-700">1. Nhập Subtitle / Script gửi AI biên tập</span>
                        <PasteButton onPaste={setMergeAiScript} title="Dán nhanh subtitle/script" />
                      </div>
                      <textarea
                        rows={3}
                        value={mergeAiScript}
                        onChange={(e) => setMergeAiScript(e.target.value)}
                        placeholder="Dán subtitle hoặc kịch bản thô để tạo prompt gửi ChatGPT/Gemini biên tập..."
                        className="w-full p-2 text-[11px] font-mono bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div className="space-y-1 flex flex-col">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-slate-700">2. Kết quả JSON từ AI Web</span>
                        <div className="flex items-center gap-1.5">
                          <PasteButton
                            onPaste={(txt) => {
                              setMergeAiJson(txt);
                              setMergeAiError(null);
                            }}
                            title="Dán nhanh JSON"
                          />
                          <label className="inline-flex items-center gap-1 px-2 py-1 text-[10.5px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 cursor-pointer">
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
                                setMergeAiJson(await f.text());
                                setMergeAiError(null);
                              }}
                            />
                          </label>
                        </div>
                      </div>
                      <textarea
                        rows={2}
                        value={mergeAiJson}
                        onChange={(e) => {
                          setMergeAiJson(e.target.value);
                          setMergeAiError(null);
                        }}
                        placeholder='Dán hoặc tải file .json từ AI Web vào đây...'
                        className="w-full flex-1 p-2 text-[11px] font-mono bg-white border border-slate-200 rounded-lg"
                      />
                      <button
                        type="button"
                        disabled={!mergeAiJson.trim()}
                        onClick={() => applyEduWebAiJson(mergeAiJson, 'merge')}
                        className="w-full py-1.5 text-[11px] font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Nạp Thẻ &amp; Kịch bản từ JSON AI Web
                      </button>
                    </div>
                  </div>
                  {mergeAiError && <p className="text-[11px] text-rose-700">{mergeAiError}</p>}
                  {mergeAiNotice && <p className="text-[11px] text-emerald-700 font-medium">{mergeAiNotice}</p>}
                </div>

                {renderOutputFolderControl()}

                <WatermarkOutroSection
                  config={watermarkOutro}
                  onChange={setWatermarkOutro}
                  title="Watermark & Outro (Tùy chọn · Ghép Video)"
                />

                {mergeError && (
                  <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                    {mergeError}
                  </p>
                )}
                {mergeStatus && (
                  <div className="p-2.5 rounded-lg bg-indigo-50 border border-indigo-200 text-xs text-indigo-900 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 font-medium">
                      <span>{mergeStatus}</span>
                      {(isMerging || mergeProgress > 0) && (
                        <span className="font-mono font-bold tabular-nums">{mergeProgress}%</span>
                      )}
                    </div>
                    {isMerging && (
                      <div className="w-full h-1.5 bg-indigo-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 transition-all duration-300"
                          style={{ width: `${Math.max(4, Math.min(100, mergeProgress))}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {isMerging ? (
                    <button
                      type="button"
                      onClick={handleCancelMerge}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-rose-600 rounded-lg hover:bg-rose-700"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>Hủy ghép video</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={
                        mergeMode === 'single'
                          ? !mergeVideoFile || !mergeAudioFile
                          : batchMatchedPairs.matched.length === 0
                      }
                      onClick={() => void handleRunMerge()}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>
                        {mergeMode === 'batch'
                          ? `Ghép Batch (${batchMatchedPairs.matched.length} cặp)`
                          : 'Bắt đầu Ghép Video + Audio (FFmpeg)'}
                      </span>
                    </button>
                  )}
                </div>
              </>
            )}

            {/* ── SUB-TAB 2: ADD KARAOKE SUB (.ASS) & MIX AUDIO ─────────────── */}
            {subTab === 'karaoke' && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    {
                      label: 'Video nền *',
                      file: kmVideoFile,
                      set: (f: File | null) => {
                        setKmVideoFile(f);
                        if (f) setKmOutputName(f.name.replace(/\.[^.]+$/, ''));
                      },
                      accept: 'video/*',
                    },
                    { label: 'Voiceover / TTS', file: kmVoiceFile, set: setKmVoiceFile, accept: 'audio/*' },
                    { label: 'Nhạc nền BGM', file: kmMusicFile, set: setKmMusicFile, accept: 'audio/*' },
                    { label: 'Ambient SFX', file: kmSfxFile, set: setKmSfxFile, accept: 'audio/*' },
                  ].map((slot) => (
                    <label
                      key={slot.label}
                      className="p-2.5 rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:bg-indigo-50/40 cursor-pointer text-center space-y-1"
                    >
                      <Upload className="w-4 h-4 text-indigo-600 mx-auto" />
                      <div className="text-[11px] font-semibold text-slate-800 truncate">
                        {slot.file ? slot.file.name : slot.label}
                      </div>
                      <input
                        type="file"
                        accept={slot.accept}
                        className="hidden"
                        onChange={(e) => slot.set(e.target.files?.[0] ?? null)}
                      />
                    </label>
                  ))}
                </div>

                {/* Default built-in BGM & Ambient SFX presets */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-800">
                      Âm thanh nền mặc định (tự dùng khi chưa tải file BGM / Ambient SFX)
                    </span>
                    <div className="flex items-center gap-2">
                      {kmMusicFile && (
                        <button
                          type="button"
                          onClick={() => setKmMusicFile(null)}
                          className="text-[10px] font-semibold text-rose-600 hover:underline"
                        >
                          Bỏ file BGM
                        </button>
                      )}
                      {kmSfxFile && (
                        <button
                          type="button"
                          onClick={() => setKmSfxFile(null)}
                          className="text-[10px] font-semibold text-rose-600 hover:underline"
                        >
                          Bỏ file SFX
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-semibold text-slate-600">
                        Nhạc nền BGM không bản quyền {kmMusicFile ? '(Đang dùng file tải lên)' : ''}
                      </label>
                      <select
                        disabled={Boolean(kmMusicFile)}
                        value={kmMusicPreset}
                        onChange={(e) => setKmMusicPreset(e.target.value as StudioBgmPresetId)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg disabled:opacity-50"
                      >
                        {STUDIO_BGM_PRESETS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                      {!kmMusicFile && kmMusicPreset !== 'none' && (
                        <audio
                          controls
                          src={`/api/studio/default-audio?preset=${kmMusicPreset}`}
                          className="w-full h-7"
                        />
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-semibold text-slate-600">
                        Âm thanh thiên nhiên / Ambient không bản quyền {kmSfxFile ? '(Đang dùng file tải lên)' : ''}
                      </label>
                      <select
                        disabled={Boolean(kmSfxFile)}
                        value={kmSfxPreset}
                        onChange={(e) => setKmSfxPreset(e.target.value as StudioBgmPresetId)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg disabled:opacity-50"
                      >
                        {STUDIO_BGM_PRESETS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                      {!kmSfxFile && kmSfxPreset !== 'none' && (
                        <audio
                          controls
                          src={`/api/studio/default-audio?preset=${kmSfxPreset}`}
                          className="w-full h-7"
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Always-visible Live Karaoke Effect + Video FX + Watermark/Outro Preview */}
                <div className="p-3 rounded-xl bg-slate-900 text-white space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-indigo-300 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5" />
                      <span>
                        Live Effect Preview ({kmEffectSpec.id.split('–')[0].trim()} · {kmEffect})
                      </span>
                    </span>
                    <div className="flex items-center gap-2">
                      {kmVideoUrl && kmVoiceUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowKmOutroPreview(false);
                            const v = kmVideoRef.current;
                            const a = kmVoiceRef.current;
                            if (!v || !a) return;
                            if (v.paused || a.paused) {
                              v.currentTime = 0;
                              a.currentTime = 0;
                              void v.play().catch(() => undefined);
                              void a.play().catch(() => undefined);
                            } else {
                              v.pause();
                              a.pause();
                            }
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px]"
                        >
                          <Play className="w-2.5 h-2.5 fill-current" />
                          <span>Phát khớp Video &amp; Voice</span>
                        </button>
                      )}
                      {watermarkOutro.outroSeconds > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowKmOutroPreview((o) => !o)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                            showKmOutroPreview
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-slate-700 hover:bg-slate-600 text-white'
                          }`}
                        >
                          <Eye className="w-2.5 h-2.5" />
                          <span>{showKmOutroPreview ? 'Đóng Outro' : 'Xem thử Outro'}</span>
                        </button>
                      )}
                      <span className="font-mono text-slate-400">{kmPreviewTimeSec.toFixed(1)}s</span>
                    </div>
                  </div>

                  <div
                    onClick={() => setSelectedKmZone((prev) => prev || 'subtitle')}
                    className="relative rounded-lg overflow-hidden bg-slate-950 min-h-[185px] flex items-center justify-center border border-slate-800 cursor-pointer"
                  >
                    {kmVideoUrl ? (
                      <video
                        ref={kmVideoRef}
                        controls
                        src={kmVideoUrl}
                        style={{ filter: getPreviewVideoCssFilter(kmEffect) }}
                        onTimeUpdate={(e) => setKmPreviewTimeSec(e.currentTarget.currentTime)}
                        className="w-full max-h-60 mx-auto object-contain"
                      />
                    ) : (
                      <div className="p-6 text-center space-y-1">
                        <Music className="w-7 h-7 text-slate-600 mx-auto" />
                        <p className="text-xs font-medium text-slate-300">
                          Live Preview Karaoke Sub (.ASS) + Watermark/Outro
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Đang hiển thị style <strong>{kmEffectSpec.id}</strong> ({kmSubPosition} · cỡ {kmSubSize}). Click lên phụ đề, Watermark hoặc khung Preview để sửa ngay bên dưới!
                        </p>
                      </div>
                    )}

                    {/* Live Subtitle Style Preview */}
                    {kmActiveCue && !showKmOutroPreview && (
                      <div
                        className={`absolute inset-x-4 flex justify-center pointer-events-none ${
                          kmSubPosition === 'Trên'
                            ? 'top-5'
                            : kmSubPosition === 'Giữa'
                              ? 'top-1/2 -translate-y-1/2'
                              : 'bottom-10'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedKmZone('subtitle');
                          }}
                          title="Click để sửa style & nội dung phụ đề ngay bên dưới"
                          className={`pointer-events-auto cursor-pointer px-3 py-1.5 rounded-lg text-center font-bold max-w-[90%] hover:ring-2 hover:ring-indigo-400 transition-shadow ${
                            kmEffectSpec.box ? 'bg-slate-900/80 border border-slate-700' : 'bg-black/45'
                          } ${
                            kmSubSize === 'Nhỏ'
                              ? 'text-xs'
                              : kmSubSize === 'Lớn'
                                ? 'text-base'
                                : 'text-sm'
                          }`}
                          style={{
                            textShadow: `0 1px 4px ${kmEffectSpec.outlineColor}`,
                          }}
                        >
                          {(() => {
                            const words = kmActiveCue.text.split(/\s+/).filter(Boolean);
                            const span = Math.max(0.4, kmActiveCue.end - kmActiveCue.start);
                            const pct = Math.max(
                              0,
                              Math.min(1, (kmPreviewTimeSec - kmActiveCue.start) / span),
                            );
                            const activeWordIdx = Math.min(
                              words.length - 1,
                              Math.floor(pct * words.length),
                            );
                            const isTypewriter = kmEffectSpec.mode === 'typewriter';
                            return words.map((w, wi) => {
                              if (isTypewriter && wi > activeWordIdx && kmVideoUrl) return null;
                              const isHighlighted = wi <= activeWordIdx;
                              return (
                                <span
                                  key={`${w}-${wi}`}
                                  style={{
                                    color: isHighlighted
                                      ? kmHighlightColor
                                      : kmEffectSpec.inactiveColor,
                                  }}
                                  className="mx-0.5 inline-block"
                                >
                                  {w}
                                </span>
                              );
                            });
                          })()}
                        </button>
                      </div>
                    )}

                    {watermarkOutro.watermarkEnabled && watermarkOutro.watermarkText.trim() && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedKmZone('watermark');
                        }}
                        title="Click để sửa Watermark ngay bên dưới"
                        style={{ opacity: watermarkOutro.watermarkOpacity }}
                        className={`cursor-pointer hover:ring-2 hover:ring-indigo-400 transition-shadow absolute px-2.5 py-1 rounded bg-black/55 text-white text-xs font-semibold ${wmPosClass}`}
                      >
                        {watermarkOutro.watermarkText}
                      </button>
                    )}

                    {showKmOutroPreview && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedKmZone('outro');
                        }}
                        title="Click để sửa Outro ngay bên dưới"
                        className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center p-6 text-center space-y-1.5 z-10 cursor-pointer"
                      >
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                          Xem trước Outro cuối video (+{watermarkOutro.outroSeconds}s sau khi kết thúc karaoke)
                        </span>
                        <div className="text-base font-bold text-white">
                          {watermarkOutro.outroLine1 || 'Thanks for watching!'}
                        </div>
                        {watermarkOutro.outroLine2 && (
                          <div className="text-xs text-slate-300">{watermarkOutro.outroLine2}</div>
                        )}
                      </div>
                    )}
                  </div>

                  {kmVoiceUrl && (
                    <audio ref={kmVoiceRef} controls src={kmVoiceUrl} className="w-full h-8" />
                  )}

                  <VideoSnapshotStrip
                    videoUrl={kmVideoUrl}
                    videoFilterCss={getPreviewVideoCssFilter(kmEffect)}
                    watermarkOutro={watermarkOutro}
                    subtitleSampleText={kmActiveCue?.text}
                    highlightColor={kmHighlightColor}
                    subtitlePosition={kmSubPosition}
                    onSeek={(t) => {
                      if (kmVideoRef.current) {
                        kmVideoRef.current.currentTime = t;
                        setKmPreviewTimeSec(t);
                      }
                    }}
                  />

                  <div className="pt-1 border-t border-slate-800 space-y-2" data-testid="karaoke-inline-preview-editor">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-slate-400 font-semibold">Sửa nhanh ngay dưới Preview:</span>
                        {(
                          [
                            { id: 'subtitle', label: 'Phụ đề Karaoke' },
                            { id: 'fx', label: 'Video FX' },
                            { id: 'watermark', label: 'Watermark' },
                            { id: 'outro', label: 'Outro' },
                          ] as const
                        ).map((z) => (
                          <button
                            key={z.id}
                            type="button"
                            onClick={() => {
                              setSelectedKmZone(z.id);
                              setShowKmOutroPreview(z.id === 'outro' && watermarkOutro.outroSeconds > 0);
                            }}
                            className={`px-2 py-0.5 rounded font-semibold transition-colors ${
                              selectedKmZone === z.id
                                ? 'bg-indigo-500 text-white'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {z.label}
                          </button>
                        ))}
                      </div>
                      {selectedKmZone && (
                        <button
                          type="button"
                          onClick={() => setSelectedKmZone(null)}
                          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
                          aria-label="Đóng sửa nhanh Karaoke"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {selectedKmZone === 'subtitle' && (
                      <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700 space-y-2 text-xs">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-semibold text-slate-300 mb-1">Kiểu Karaoke</label>
                            <select
                              value={kmStyleId}
                              onChange={(e) => {
                                const nextId = e.target.value;
                                setKmStyleId(nextId);
                                const spec = KARAOKE_EFFECT_PRESETS.find((p) => p.id === nextId);
                                if (spec) setKmHighlightColor(spec.activeColor);
                              }}
                              className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white"
                            >
                              {KARAOKE_EFFECT_PRESETS.map((p) => (
                                <option key={p.id} value={p.id}>{p.id}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-300 mb-1">Vị trí</label>
                            <select
                              value={kmSubPosition}
                              onChange={(e) => setKmSubPosition(e.target.value as EduKaraokePosition)}
                              className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white"
                            >
                              <option value="Trên">Trên</option>
                              <option value="Giữa">Giữa</option>
                              <option value="Dưới">Dưới</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-300 mb-1">Cỡ &amp; Màu</label>
                            <div className="flex items-center gap-1.5">
                              <select
                                value={kmSubSize}
                                onChange={(e) => setKmSubSize(e.target.value as EduKaraokeSize)}
                                className="flex-1 px-1.5 py-1 rounded bg-slate-900 border border-slate-700 text-white"
                              >
                                <option value="Nhỏ">Nhỏ</option>
                                <option value="Vừa">Vừa</option>
                                <option value="Lớn">Lớn</option>
                              </select>
                              <input
                                type="color"
                                value={kmHighlightColor}
                                onChange={(e) => setKmHighlightColor(e.target.value)}
                                className="w-7 h-7 rounded bg-transparent border border-slate-700 cursor-pointer"
                                title="Màu chữ đang hát"
                              />
                            </div>
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-300 mb-1">Nội dung SRT / Phụ đề</label>
                          <textarea
                            rows={2}
                            value={kmSrtInput}
                            onChange={(e) => setKmSrtInput(e.target.value)}
                            className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white font-mono text-[11px]"
                          />
                        </div>
                      </div>
                    )}

                    {selectedKmZone === 'fx' && (
                      <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700 text-xs">
                        <label className="block text-[10px] font-semibold text-slate-300 mb-1">Hiệu ứng Video FX</label>
                        <select
                          value={kmEffect}
                          onChange={(e) => setKmEffect(e.target.value)}
                          className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white"
                        >
                          <option value="Fade cinematic">Fade cinematic</option>
                          <option value="Soft vignette + fade">Soft vignette + fade</option>
                          <option value="Warm film + fade">Warm film + fade</option>
                          <option value="Cool tech + fade">Cool tech + fade</option>
                          <option value="Slow zoom + fade">Slow zoom + fade</option>
                          <option value="None">Không hiệu ứng</option>
                        </select>
                      </div>
                    )}

                    {selectedKmZone === 'watermark' && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-2.5 rounded-lg bg-slate-800/80 border border-slate-700 text-xs">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-300 mb-1">Chữ Watermark</label>
                          <input
                            type="text"
                            value={watermarkOutro.watermarkText}
                            onChange={(e) =>
                              setWatermarkOutro((p) => ({ ...p, watermarkText: e.target.value, watermarkEnabled: true }))
                            }
                            className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-300 mb-1">Góc đặt</label>
                          <select
                            value={watermarkOutro.watermarkCorner}
                            onChange={(e) =>
                              setWatermarkOutro((p) => ({
                                ...p,
                                watermarkCorner: e.target.value as EduWatermarkCorner,
                              }))
                            }
                            className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white"
                          >
                            <option value="top-left">Trên trái</option>
                            <option value="top-right">Trên phải</option>
                            <option value="bottom-left">Dưới trái</option>
                            <option value="bottom-right">Dưới phải</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-300 mb-1">
                            Độ mờ ({Math.round(watermarkOutro.watermarkOpacity * 100)}%)
                          </label>
                          <input
                            type="range"
                            min={0.15}
                            max={1}
                            step={0.05}
                            value={watermarkOutro.watermarkOpacity}
                            onChange={(e) =>
                              setWatermarkOutro((p) => ({ ...p, watermarkOpacity: Number(e.target.value) }))
                            }
                            className="w-full accent-indigo-400"
                          />
                        </div>
                      </div>
                    )}

                    {selectedKmZone === 'outro' && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-2.5 rounded-lg bg-slate-800/80 border border-slate-700 text-xs">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-300 mb-1">Outro Dòng 1</label>
                          <input
                            type="text"
                            value={watermarkOutro.outroLine1}
                            onChange={(e) => setWatermarkOutro((p) => ({ ...p, outroLine1: e.target.value }))}
                            className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-300 mb-1">Outro Dòng 2</label>
                          <input
                            type="text"
                            value={watermarkOutro.outroLine2}
                            onChange={(e) => setWatermarkOutro((p) => ({ ...p, outroLine2: e.target.value }))}
                            className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-300 mb-1">Thời lượng (giây)</label>
                          <input
                            type="number"
                            min={0}
                            max={15}
                            step={0.5}
                            value={watermarkOutro.outroSeconds}
                            onChange={(e) =>
                              setWatermarkOutro((p) => ({ ...p, outroSeconds: Number(e.target.value) || 0 }))
                            }
                            className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white tabular-nums"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Karaoke Effect Controls matching 1.19 */}
                <div className="p-3.5 rounded-xl bg-indigo-50/40 border border-indigo-200/70 space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Hiệu ứng Karaoke (6 kiểu chuẩn 1.19)
                      </label>
                      <select
                        value={kmStyleId}
                        onChange={(e) => {
                          const nextId = e.target.value;
                          setKmStyleId(nextId);
                          const spec = KARAOKE_EFFECT_PRESETS.find((p) => p.id === nextId);
                          if (spec) setKmHighlightColor(spec.activeColor);
                        }}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      >
                        {KARAOKE_EFFECT_PRESETS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.id}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-500 mt-1">{kmEffectSpec.description}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Vị trí
                        </label>
                        <select
                          value={kmSubPosition}
                          onChange={(e) => setKmSubPosition(e.target.value as EduKaraokePosition)}
                          className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                        >
                          <option value="Dưới">Dưới</option>
                          <option value="Giữa">Giữa</option>
                          <option value="Trên">Trên</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Cỡ chữ
                        </label>
                        <select
                          value={kmSubSize}
                          onChange={(e) => setKmSubSize(e.target.value as EduKaraokeSize)}
                          className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                        >
                          <option value="Nhỏ">Nhỏ</option>
                          <option value="Vừa">Vừa</option>
                          <option value="Lớn">Lớn</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Trợ lý AI Web biên tập Subtitle / Script -> JSON */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      Trợ lý AI Web · Nhập Subtitle / Script → Prompt (.json) → Nạp Thẻ &amp; Kịch bản từ JSON AI Web
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          buildEduWebAiPrompt(
                            'Phụ Đề Karaoke & Mix Âm Thanh',
                            kmAiScript.trim() || kmSrtInput,
                            kmOutputName || kmVideoFile?.name || '',
                          ),
                        );
                        setCopiedKmPrompt(true);
                        setTimeout(() => setCopiedKmPrompt(false), 1800);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                    >
                      {copiedKmPrompt ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKmPrompt ? 'Đã chép Prompt!' : 'Sao chép Prompt AI Web (.json)'}</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-slate-700">1. Nhập Subtitle / Script gửi AI biên tập</span>
                        <PasteButton onPaste={setKmAiScript} title="Dán nhanh subtitle/script" />
                      </div>
                      <textarea
                        rows={3}
                        value={kmAiScript}
                        onChange={(e) => setKmAiScript(e.target.value)}
                        placeholder="Nhập hoặc dán subtitle/script muốn AI biên tập chuẩn Karaoke (bỏ trống sẽ lấy từ ô SRT bên dưới)..."
                        className="w-full p-2 text-[11px] font-mono bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div className="space-y-1 flex flex-col">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-slate-700">2. Kết quả JSON từ AI Web</span>
                        <div className="flex items-center gap-1.5">
                          <PasteButton
                            onPaste={(txt) => {
                              setKmAiJson(txt);
                              setKmAiError(null);
                            }}
                            title="Dán nhanh JSON"
                          />
                          <label className="inline-flex items-center gap-1 px-2 py-1 text-[10.5px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 cursor-pointer">
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
                                setKmAiJson(await f.text());
                                setKmAiError(null);
                              }}
                            />
                          </label>
                        </div>
                      </div>
                      <textarea
                        rows={2}
                        value={kmAiJson}
                        onChange={(e) => {
                          setKmAiJson(e.target.value);
                          setKmAiError(null);
                        }}
                        placeholder='Dán hoặc tải file .json từ AI Web vào đây...'
                        className="w-full flex-1 p-2 text-[11px] font-mono bg-white border border-slate-200 rounded-lg"
                      />
                      <button
                        type="button"
                        disabled={!kmAiJson.trim()}
                        onClick={() => applyEduWebAiJson(kmAiJson, 'karaoke')}
                        className="w-full py-1.5 text-[11px] font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Nạp Thẻ &amp; Kịch bản từ JSON AI Web
                      </button>
                    </div>
                  </div>
                  {kmAiError && <p className="text-[11px] text-rose-700">{kmAiError}</p>}
                  {kmAiNotice && <p className="text-[11px] text-emerald-700 font-medium">{kmAiNotice}</p>}
                </div>

                {/* SRT / ASS Text */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-slate-700">
                      Nội dung SRT / Câu thoại để đốt Karaoke .ASS
                    </label>
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer">
                        <Upload className="w-3 h-3" />
                        <span>Nạp file .SRT/.VTT/.ASS</span>
                        <input
                          type="file"
                          accept=".srt,.vtt,.ass,.ssa,.lrc,.txt"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            const txt = await f.text();
                            if (/\.ass$/i.test(f.name) || txt.includes('[V4+ Styles]')) {
                              setKmAssContent(txt);
                            } else {
                              setKmSrtInput(txt);
                            }
                          }}
                        />
                      </label>
                      <label className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                        <span>Màu hát:</span>
                        <input
                          type="color"
                          value={kmHighlightColor}
                          onChange={(e) => setKmHighlightColor(e.target.value)}
                          className="w-6 h-5 rounded border border-slate-200 cursor-pointer"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={handleGenerateAss}
                        className="px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100"
                      >
                        Sinh mã .ASS →
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10.5px] font-semibold text-slate-600">SRT / Câu thoại</span>
                        <PasteButton
                          onPaste={(txt) => setKmSrtInput(txt)}
                          title="Dán nhanh SRT / câu thoại (thay thế)"
                        />
                      </div>
                      <textarea
                        rows={4}
                        value={kmSrtInput}
                        onChange={(e) => setKmSrtInput(e.target.value)}
                        placeholder="Dán .SRT hoặc từng dòng câu..."
                        className="w-full p-2.5 text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10.5px] font-semibold text-slate-600">Mã Karaoke .ASS</span>
                        <PasteButton
                          onPaste={(txt) => setKmAssContent(txt)}
                          title="Dán nhanh nội dung .ASS (thay thế)"
                        />
                      </div>
                      <textarea
                        rows={4}
                        value={kmAssContent}
                        onChange={(e) => setKmAssContent(e.target.value)}
                        placeholder="Mã Karaoke .ASS tự động sinh (hoặc dán file .ass có sẵn)..."
                        className="w-full p-2.5 text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>
                </div>

                {/* Video FX + Audio Mix */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Hiệu ứng Video FX
                      </label>
                      <select
                        value={kmEffect}
                        onChange={(e) => setKmEffect(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      >
                        <option value="Fade cinematic">Fade cinematic</option>
                        <option value="Soft vignette + fade">Soft vignette + fade</option>
                        <option value="Warm film + fade">Warm film + fade</option>
                        <option value="Cool tech + fade">Cool tech + fade</option>
                        <option value="Slow zoom + fade">Slow zoom + fade</option>
                        <option value="None">Không hiệu ứng</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Delay Voiceover (giây)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={0.2}
                        value={kmVoiceStart}
                        onChange={(e) => setKmVoiceStart(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Tên file xuất (mặc định tên video gốc)
                      </label>
                      <input
                        type="text"
                        value={kmOutputName}
                        onChange={(e) => setKmOutputName(e.target.value)}
                        placeholder={
                          kmVideoFile
                            ? kmVideoFile.name.replace(/\.[^.]+$/, '')
                            : 'Tự lấy theo tên video gốc'
                        }
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <label>
                      <span>Âm gốc: {Math.round(kmOriginalVol * 100)}%</span>
                      <input
                        type="range"
                        min={0}
                        max={1.5}
                        step={0.05}
                        value={kmOriginalVol}
                        onChange={(e) => setKmOriginalVol(Number(e.target.value))}
                        className="w-full accent-indigo-600"
                      />
                    </label>
                    <label>
                      <span>Nhạc nền: {Math.round(kmMusicVol * 100)}%</span>
                      <input
                        type="range"
                        min={0}
                        max={1.5}
                        step={0.01}
                        value={kmMusicVol}
                        onChange={(e) => setKmMusicVol(Number(e.target.value))}
                        className="w-full accent-indigo-600"
                      />
                    </label>
                    <label>
                      <span>SFX: {Math.round(kmSfxVol * 100)}%</span>
                      <input
                        type="range"
                        min={0}
                        max={1.5}
                        step={0.01}
                        value={kmSfxVol}
                        onChange={(e) => setKmSfxVol(Number(e.target.value))}
                        className="w-full accent-indigo-600"
                      />
                    </label>
                    <label>
                      <span>Voice: {Math.round(kmVoiceVol * 100)}%</span>
                      <input
                        type="range"
                        min={0}
                        max={1.8}
                        step={0.05}
                        value={kmVoiceVol}
                        onChange={(e) => setKmVoiceVol(Number(e.target.value))}
                        className="w-full accent-indigo-600"
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-4 text-xs text-slate-700 pt-1">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={kmVoicePriority}
                        onChange={(e) => setKmVoicePriority(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600"
                      />
                      <span>Ưu tiên Voiceover (Ducking)</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={kmMuteOriginal}
                        onChange={(e) => setKmMuteOriginal(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600"
                      />
                      <span>Tắt tiếng video gốc</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={kmRemoveDialogue}
                        onChange={(e) => setKmRemoveDialogue(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600"
                      />
                      <span>Khử giọng trung tâm</span>
                    </label>
                  </div>
                </div>

                {renderOutputFolderControl()}

                <WatermarkOutroSection
                  config={watermarkOutro}
                  onChange={setWatermarkOutro}
                  title="Watermark & Outro (Tùy chọn · Karaoke & Mix)"
                />

                {kmError && (
                  <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                    {kmError}
                  </p>
                )}
                {kmStatus && (
                  <div className="p-2.5 rounded-lg bg-indigo-50 border border-indigo-200 text-xs text-indigo-900 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 font-medium">
                      <span>{kmStatus}</span>
                      {(isRenderingKm || kmProgress > 0) && (
                        <span className="font-mono font-bold tabular-nums">{kmProgress}%</span>
                      )}
                    </div>
                    {isRenderingKm && (
                      <div className="w-full h-1.5 bg-indigo-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 transition-all duration-300"
                          style={{ width: `${Math.max(4, Math.min(100, kmProgress))}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {isRenderingKm ? (
                    <button
                      type="button"
                      onClick={handleCancelKaraokeMix}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-rose-600 rounded-lg hover:bg-rose-700"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>Hủy render</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!kmVideoFile}
                      onClick={() => void handleRunKaraokeMix()}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Render Video (.mp4)</span>
                    </button>
                  )}
                </div>
              </>
            )}

            {/* ── SUB-TAB 3: READING ALONG STUDIO (Book + Pointer + Export MP4) ── */}
            {subTab === 'align' && (
              <>
                {/* AI Content Director + Webpage URL Scraper + Web AI Prompt (Multilingual) */}
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-indigo-50/80 via-white to-sky-50/70 border border-indigo-200/80 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-indigo-950 inline-flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-indigo-600" />
                        <span>AI Tạo Bài Đọc Theo Chữ · Prompt Web AI &amp; Lấy Bài Web</span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        Chọn ngôn ngữ đọc, trình độ ({readingLevelOptions[0]?.id} → {readingLevelOptions[readingLevelOptions.length - 1]?.id}) &amp; số phút mong muốn — bỏ trống chủ đề AI sẽ tự chọn ý tưởng cuốn hút nhất.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => applyReadingStarterPassage(readingLearningLang, readingAiLevel)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 whitespace-nowrap shrink-0"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>
                          Nạp mẫu thử {LEARNING_LANGUAGE_OPTIONS.find((l) => l.id === readingLearningLang)?.nativeName || readingLearningLang}
                        </span>
                      </button>
                      {effectiveReadingGeminiKey && (
                        <button
                          type="button"
                          disabled={isScrapingOrGeneratingReading}
                          onClick={() => void handleAiGenerateReadingPassage()}
                          className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap shrink-0"
                        >
                          {isScrapingOrGeneratingReading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                          )}
                          <span>{isScrapingOrGeneratingReading ? 'AI đang sáng tạo...' : 'AI Tự Sáng Tạo Ngay'}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsWebPromptOpen((o) => !o)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 whitespace-nowrap shrink-0"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{isWebPromptOpen ? 'Ẩn Prompt Web AI' : 'Tạo Prompt cho Web AI (Không cần API Key)'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Topic Hint (Optional) + Genre/Format + Language + Level */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-2 border-t border-indigo-100">
                    <div className="sm:col-span-6">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label htmlFor="reading-ai-topic" className="text-[11px] font-semibold text-slate-700">
                          Chủ đề / Gợi ý (bỏ trống AI tự chọn)
                        </label>
                        <PasteButton
                          size="sm"
                          onPaste={(txt) => setReadingAiTopic(txt.trim())}
                          title="Dán nhanh chủ đề bài đọc"
                        />
                      </div>
                      <input
                        id="reading-ai-topic"
                        type="text"
                        value={readingAiTopic}
                        onChange={(e) => setReadingAiTopic(e.target.value)}
                        placeholder={
                          READING_STARTER_BY_LANG[(readingLearningLang as ReadingLearningLang) || 'en']
                            ?.aiTopicPlaceholder || 'Bỏ trống để AI tự nghĩ chủ đề...'
                        }
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div className="sm:col-span-6">
                      <label htmlFor="reading-format-select" className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Thể loại / Phong cách bài đọc (A–F)
                      </label>
                      <select
                        id="reading-format-select"
                        value={readingFormat}
                        onChange={(e) => setReadingFormat(e.target.value as ReadingFormatCategory)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-medium"
                      >
                        {READING_FORMAT_OPTIONS.map((fmt) => (
                          <option key={fmt.id} value={fmt.id}>
                            {fmt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-6">
                      <label htmlFor="reading-learning-lang" className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Ngôn ngữ đọc
                      </label>
                      <select
                        id="reading-learning-lang"
                        value={readingLearningLang}
                        onChange={(e) => {
                          const nextLang = e.target.value as LearningLanguageId;
                          setReadingLearningLang(nextLang);
                          const nextLevels = getLevelsForLearningLanguage(nextLang);
                          const langMeta = LEARNING_LANGUAGE_OPTIONS.find((l) => l.id === nextLang);
                          const nextLvl = langMeta?.defaultLevel || nextLevels[0]?.id || 'B1';
                          setReadingAiLevel(nextLvl);
                          setReadingAiLength(
                            computeReadingTargetLength(
                              nextLang as ReadingLearningLang,
                              readingDurationMinutes,
                            ).count,
                          );
                          setReadingVoice(pickReadingDefaultVoice(nextLang, ttsVoices));
                          if (alignLang !== 'auto') {
                            setAlignLang(nextLang);
                          }
                          const isBuiltInStarter = Object.values(READING_STARTER_BY_LANG).some(
                            (st) => st.text.trim() === readingText.trim(),
                          );
                          if (isBuiltInStarter) {
                            applyReadingStarterPassage(nextLang, nextLvl);
                          }
                        }}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-medium"
                      >
                        {LEARNING_LANGUAGE_OPTIONS.map((lang) => (
                          <option key={lang.id} value={lang.id}>
                            {lang.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-6">
                      <label htmlFor="reading-ai-level" className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Trình độ (Dễ → Khó)
                      </label>
                      <select
                        id="reading-ai-level"
                        value={readingAiLevel}
                        onChange={(e) => setReadingAiLevel(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-semibold"
                      >
                        {readingLevelOptions.map((lvl) => (
                          <option key={lvl.id} value={lvl.id}>
                            {lvl.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    <div className="sm:col-span-6">
                      <label htmlFor="reading-duration-min" className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Thời lượng đọc (phút · 0.5 – 30 phút)
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          id="reading-duration-min"
                          type="number"
                          min={0.5}
                          max={30}
                          step={0.5}
                          value={readingDurationMinutes}
                          onChange={(e) => {
                            const raw = Number(e.target.value);
                            const nextMin = Number.isFinite(raw) ? Math.max(0.5, Math.min(30, raw)) : 1;
                            setReadingDurationMinutes(nextMin);
                            setReadingAiLength(
                              computeReadingTargetLength(
                                readingLearningLang as ReadingLearningLang,
                                nextMin,
                              ).count,
                            );
                          }}
                          className="w-20 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg tabular-nums"
                        />
                        <select
                          aria-label="Chọn nhanh thời lượng đọc"
                          value={[0.5, 1, 2, 3, 5, 10, 15, 20, 25, 30].includes(readingDurationMinutes) ? String(readingDurationMinutes) : 'custom'}
                          onChange={(e) => {
                            if (e.target.value === 'custom') return;
                            const mins = Number(e.target.value);
                            setReadingDurationMinutes(mins);
                            setReadingAiLength(
                              computeReadingTargetLength(
                                readingLearningLang as ReadingLearningLang,
                                mins,
                              ).count,
                            );
                          }}
                          className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-medium"
                        >
                          <option value="0.5">~30 giây (0.5 phút)</option>
                          <option value="1">~1 phút</option>
                          <option value="2">~2 phút</option>
                          <option value="3">~3 phút</option>
                          <option value="5">~5 phút</option>
                          <option value="10">~10 phút</option>
                          <option value="15">~15 phút</option>
                          <option value="20">~20 phút</option>
                          <option value="25">~25 phút</option>
                          <option value="30">~30 phút</option>
                          {![0.5, 1, 2, 3, 5, 10, 15, 20, 25, 30].includes(readingDurationMinutes) && (
                            <option value="custom">{readingDurationMinutes} phút</option>
                          )}
                        </select>
                      </div>
                    </div>
                    <div className="sm:col-span-6">
                      <label htmlFor="reading-ai-length" className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Độ dài bài đọc mục tiêu ({targetReadingLengthMeta.unitShort} · gợi ý ~{targetReadingLengthMeta.count} {targetReadingLengthMeta.unitShort})
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          id="reading-ai-length"
                          type="number"
                          min={40}
                          max={6500}
                          step={10}
                          value={readingAiLength}
                          onChange={(e) =>
                            setReadingAiLength(Math.max(40, Math.min(6500, Math.round(Number(e.target.value) || 120))))
                          }
                          className="w-28 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg tabular-nums"
                        />
                        <span className="text-[11px] text-slate-500">
                          {targetReadingLengthMeta.unitLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* URL Input */}
                  <div className="flex flex-col sm:flex-row gap-2 pt-1 border-t border-indigo-100/80">
                    <div className="relative flex-1">
                      <Link2 className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="url"
                        aria-label="Đường link bài báo hoặc truyện cần chuyển thể"
                        value={readingUrl}
                        onChange={(e) => setReadingUrl(e.target.value)}
                        placeholder="Hoặc dán link bài báo/truyện (https://...) để lấy nội dung Web về sách"
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                    <PasteButton
                      size="sm"
                      onPaste={(txt) => setReadingUrl(txt.trim())}
                      title="Dán nhanh link từ Clipboard"
                    />
                    <button
                      type="button"
                      disabled={isScrapingOrGeneratingReading || !readingUrl.trim()}
                      onClick={() => void handleScrapeReadingUrl(undefined, true)}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 shrink-0"
                    >
                      {isScrapingOrGeneratingReading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Globe className="w-3.5 h-3.5" />
                      )}
                      <span>Lấy nội dung Web</span>
                    </button>
                  </div>

                  {readingUrlSubLinks.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-semibold text-slate-500">Bài liên quan:</span>
                      {readingUrlSubLinks.map((lnk) => (
                        <button
                          key={lnk.url}
                          type="button"
                          onClick={() => void handleScrapeReadingUrl(lnk.url, true)}
                          className="px-2 py-0.5 text-[10px] font-medium text-indigo-700 bg-white border border-indigo-200 rounded-md hover:bg-indigo-50 truncate max-w-[200px]"
                          title={lnk.title}
                        >
                          {lnk.title}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Raw Content Input + AI Difficulty Adaptation + JSON Export */}
                  <div className="p-3 rounded-xl bg-white/90 border border-indigo-200/80 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label htmlFor="reading-adapt-raw-text" className="text-[11px] font-bold text-slate-800">
                        Nhập nội dung thô để AI biên tập lại theo trình độ ({readingAiLevel}) &amp; thời lượng ({readingDurationMinutes}p)
                      </label>
                      <div className="flex items-center gap-1.5">
                        <PasteButton
                          size="sm"
                          onPaste={(txt) => setAdaptRawInputText(txt)}
                          title="Dán nhanh văn bản gốc cần AI biên tập"
                        />
                        <button
                          type="button"
                          onClick={handleExportReadingJson}
                          data-testid="export-reading-json-btn"
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
                        >
                          <Download className="w-3 h-3" />
                          <span>Xuất bài đọc .json</span>
                        </button>
                      </div>
                    </div>
                    <textarea
                      id="reading-adapt-raw-text"
                      rows={3}
                      value={adaptRawInputText}
                      onChange={(e) => setAdaptRawInputText(e.target.value)}
                      placeholder="Dán bài báo, đoạn truyện, ghi chú tiếng Việt/Anh/Nhật/Hàn... AI sẽ biên tập lại đúng trình độ đã chọn và độ dài mục tiêu."
                      className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                    />
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {effectiveReadingGeminiKey && (
                        <button
                          type="button"
                          disabled={isScrapingOrGeneratingReading || !adaptRawInputText.trim()}
                          onClick={() => void handleAiAdaptReadingText()}
                          data-testid="ai-adapt-reading-btn"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {isScrapingOrGeneratingReading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Wand2 className="w-3.5 h-3.5" />
                          )}
                          <span>AI Biên tập theo độ khó</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setReadingWebPromptMode('adapt-text');
                          setIsWebPromptOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Tạo Prompt Web AI từ nội dung này</span>
                      </button>
                    </div>
                  </div>

                  {/* External Web AI Prompt Builder & Paste Response Box (Side-by-side like AI Creator) */}
                  {isWebPromptOpen && (
                    <div className="p-3 rounded-xl bg-white border border-indigo-200 space-y-2.5 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-indigo-950">Tạo bằng Web AI (ChatGPT / Gemini / Claude Web):</span>
                          <button
                            type="button"
                            onClick={() => setReadingWebPromptMode('topic')}
                            className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${
                              readingWebPromptMode === 'topic'
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'bg-slate-50 border-slate-200 text-slate-600'
                            }`}
                          >
                            Theo Chủ đề &amp; Thể loại
                          </button>
                          <button
                            type="button"
                            onClick={() => setReadingWebPromptMode('web-url')}
                            className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${
                              readingWebPromptMode === 'web-url'
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'bg-slate-50 border-slate-200 text-slate-600'
                            }`}
                          >
                            Theo URL Web
                          </button>
                          <button
                            type="button"
                            onClick={() => setReadingWebPromptMode('adapt-text')}
                            className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${
                              readingWebPromptMode === 'adapt-text'
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'bg-slate-50 border-slate-200 text-slate-600'
                            }`}
                          >
                            Biên tập từ nội dung dán
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleCopyReadingWebPrompt()}
                          className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                        >
                          {copiedReadingPrompt ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedReadingPrompt ? 'Đã chép Prompt!' : 'Sao chép Prompt Web AI'}</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
                            <span>1. Prompt tự động theo ngôn ngữ · trình độ · {readingDurationMinutes} phút</span>
                            <span className="text-[10px] font-medium text-indigo-600">
                              {READING_FORMAT_OPTIONS.find((f) => f.id === readingFormat)?.id.toUpperCase() || 'AUTO'}
                            </span>
                          </div>
                          <textarea
                            readOnly
                            aria-label="Prompt tạo bài đọc cho Web AI"
                            rows={6}
                            value={readingWebAiPrompt}
                            className="w-full p-2 text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
                          />
                        </div>

                        <div className="space-y-1.5 flex flex-col">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <label htmlFor="paste-web-ai-reading" className="text-[11px] font-semibold text-slate-700">
                              2. Dán hoặc nạp file .json kết quả từ Web AI:
                            </label>
                            <div className="flex items-center gap-1.5">
                              <PasteButton
                                onPaste={(txt) => {
                                  setPastedReadingAiResponse(txt);
                                  setPastedReadingAiError(null);
                                }}
                                title="Dán nhanh kết quả JSON / đoạn văn"
                              />
                              <label className="inline-flex items-center gap-1 px-2 py-1 text-[10.5px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 cursor-pointer">
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
                                    setPastedReadingAiResponse(await f.text());
                                    setPastedReadingAiError(null);
                                  }}
                                />
                              </label>
                            </div>
                          </div>
                          <textarea
                            id="paste-web-ai-reading"
                            rows={4}
                            value={pastedReadingAiResponse}
                            onChange={(e) => {
                              setPastedReadingAiResponse(e.target.value);
                              setPastedReadingAiError(null);
                            }}
                            placeholder='Dán {"title": "...", "topicBadge": "...", "text": "..."} hoặc đoạn văn bản bài đọc...'
                            className="w-full flex-1 p-2 text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-lg"
                          />
                          {pastedReadingAiError && (
                            <p className="text-[11px] text-rose-700">{pastedReadingAiError}</p>
                          )}
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={handleApplyPastedReadingAi}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Nạp Thẻ &amp; Kịch bản từ JSON AI Web</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {(isScrapingOrGeneratingReading || readingAiStageLabel) && (
                    <div className="p-2 rounded-lg bg-white border border-indigo-200 space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-medium text-indigo-900">
                        <span className="truncate">{readingAiStageLabel}</span>
                        <span className="font-mono font-bold tabular-nums">{readingAiProgress}%</span>
                      </div>
                      {isScrapingOrGeneratingReading && (
                        <div className="w-full h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-600 transition-all duration-300"
                            style={{ width: `${Math.max(8, Math.min(100, readingAiProgress))}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                  {/* Left Controls */}
                  <div className="lg:col-span-6 space-y-3">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label htmlFor="reading-palette-select" className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Màu sách (Book Palette · {READING_BOOK_PALETTES.length} mẫu)
                        </label>
                        <select
                          id="reading-palette-select"
                          value={readingPaletteId}
                          onChange={(e) =>
                            setReadingPaletteId(e.target.value as ReadingBookPalette['id'])
                          }
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                        >
                          {READING_BOOK_PALETTES.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.id}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="reading-illustration-select" className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Phong cách minh họa
                        </label>
                        <select
                          id="reading-illustration-select"
                          value={readingIllustration}
                          onChange={(e) =>
                            setReadingIllustration(e.target.value as ReadingIllustrationStyle)
                          }
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                        >
                          <option value="Flat 2D">Flat 2D - Phẳng</option>
                          <option value="2.5D">2.5D - Minh họa nổi khối</option>
                          <option value="3D Cartoon">3D Cartoon - Giả lập 3D</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label htmlFor="reading-book-frame-select" className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Khung sách &amp; Bố cục Plain ({READING_BOOK_FRAMES.length} mẫu)
                        </label>
                        <select
                          id="reading-book-frame-select"
                          value={readingBookFrame}
                          onChange={(e) => {
                            const nextFrame = e.target.value as ReadingBookFrameId;
                            setReadingBookFrame(nextFrame);
                            if (nextFrame.startsWith('plain')) {
                              setReadingSubtitlePosition('center');
                              setReadingSubtitleSize('lg');
                            }
                          }}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                        >
                          {READING_BOOK_FRAMES.map((bf) => (
                            <option key={bf.id} value={bf.id}>
                              {bf.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="reading-pointer-style-select" className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Kiểu con trỏ chỉ chữ &amp; Bôi sáng ({READING_POINTER_STYLES.length} mẫu)
                        </label>
                        <select
                          id="reading-pointer-style-select"
                          value={readingPointerStyle}
                          onChange={(e) =>
                            setReadingPointerStyle(e.target.value as ReadingPointerStyleId)
                          }
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                        >
                          {READING_POINTER_STYLES.map((ps) => (
                            <option key={ps.id} value={ps.id}>
                              {ps.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Subtitle Position/Size & Ambient Photo/Video Background */}
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label htmlFor="reading-sub-pos-select" className="block text-[10px] font-semibold text-slate-600 mb-1">
                            Vị trí chữ / phụ đề
                          </label>
                          <select
                            id="reading-sub-pos-select"
                            value={readingSubtitlePosition}
                            onChange={(e) => setReadingSubtitlePosition(e.target.value as SubtitlePosition)}
                            className="w-full px-2 py-1 text-[11px] bg-white border border-slate-200 rounded-lg font-medium"
                          >
                            <option value="top">Trên (Top)</option>
                            <option value="center">Giữa màn hình (Center)</option>
                            <option value="bottom">Đáy (Bottom)</option>
                          </select>
                        </div>
                        <div>
                          <label htmlFor="reading-sub-size-select" className="block text-[10px] font-semibold text-slate-600 mb-1">
                            Độ to chữ
                          </label>
                          <select
                            id="reading-sub-size-select"
                            value={readingSubtitleSize}
                            onChange={(e) => setReadingSubtitleSize(e.target.value as SubtitleSize)}
                            className="w-full px-2 py-1 text-[11px] bg-white border border-slate-200 rounded-lg font-medium"
                          >
                            <option value="sm">Nhỏ (SM)</option>
                            <option value="md">Vừa (MD)</option>
                            <option value="lg">To (LG)</option>
                            <option value="xl">Rất to (XL)</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1.5 pt-1 border-t border-slate-200/80">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-slate-700 inline-flex items-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Hình / Video nền &amp; Opacity tập trung chữ</span>
                          </span>
                          <div className="flex items-center gap-1.5">
                            <input
                              ref={readingBgInputRef}
                              type="file"
                              accept="image/*,video/mp4,video/webm,video/quicktime"
                              className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                e.target.value = '';
                                if (!file) return;
                                setReadingBgError(null);
                                setIsProcessingReadingBg(true);
                                try {
                                  const isVideo =
                                    file.type.startsWith('video/') ||
                                    /\.(mp4|webm|mov|m4v)$/i.test(file.name);
                                  if (readingVideoBlobUrlRef.current) {
                                    URL.revokeObjectURL(readingVideoBlobUrlRef.current);
                                    readingVideoBlobUrlRef.current = null;
                                  }
                                  if (isVideo) {
                                    const url = URL.createObjectURL(file);
                                    readingVideoBlobUrlRef.current = url;
                                    setReadingBackground({
                                      kind: 'video',
                                      videoUrl: url,
                                      fileName: file.name,
                                      fit: 'cover',
                                      scrimOpacity: 0.2,
                                      learningScrimOpacity: 0.5,
                                    });
                                  } else {
                                    const imgBg = await resizeImageFileToStageDataUrl(file, {
                                      fit: 'cover',
                                      scrimOpacity: 0.22,
                                      aspectRatio: readingAspect,
                                    });
                                    setReadingBackground({
                                      ...imgBg,
                                      kind: 'image',
                                      learningScrimOpacity: 0.48,
                                    });
                                  }
                                } catch (err) {
                                  setReadingBgError(
                                    err instanceof Error ? err.message : 'Không nạp được file nền.',
                                  );
                                } finally {
                                  setIsProcessingReadingBg(false);
                                }
                              }}
                            />
                            <button
                              type="button"
                              disabled={isProcessingReadingBg}
                              onClick={() => readingBgInputRef.current?.click()}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-indigo-700 bg-white border border-indigo-200 rounded-md hover:bg-indigo-50"
                            >
                              <Upload className="w-3 h-3" />
                              <span>{isProcessingReadingBg ? 'Đang xử lý...' : 'Tải Ảnh / Video'}</span>
                            </button>
                            {readingBackground && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (readingVideoBlobUrlRef.current) {
                                    URL.revokeObjectURL(readingVideoBlobUrlRef.current);
                                    readingVideoBlobUrlRef.current = null;
                                  }
                                  setReadingBackground(undefined);
                                }}
                                title="Xóa nền tùy chỉnh"
                                className="inline-flex items-center gap-1 px-1.5 py-1 text-[10px] font-semibold text-rose-600 bg-white border border-rose-200 rounded-md hover:bg-rose-50"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5 max-h-[168px] overflow-y-auto pr-1">
                          {BACKGROUND_PRESETS.map((preset) => {
                            const active =
                              readingBackground?.kind === 'preset' &&
                              readingBackground.presetId === preset.id;
                            return (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => {
                                  if (readingVideoBlobUrlRef.current) {
                                    URL.revokeObjectURL(readingVideoBlobUrlRef.current);
                                    readingVideoBlobUrlRef.current = null;
                                  }
                                  setReadingBackground({
                                    kind: 'preset',
                                    presetId: preset.id as BackgroundPresetId,
                                    fileName: preset.name,
                                    fit: 'cover',
                                    scrimOpacity: 0.22,
                                    learningScrimOpacity: 0.48,
                                  });
                                }}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-left transition ${
                                  active
                                    ? 'border-indigo-500 bg-indigo-50 text-indigo-900 shadow-xs'
                                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                                }`}
                                title={preset.shortDesc}
                              >
                                <span
                                  className="w-3.5 h-3.5 rounded shrink-0 border border-white/40"
                                  style={{ background: preset.previewGradient }}
                                />
                                <span className="text-[10px] font-semibold truncate">
                                  {preset.name}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {readingBackground && (
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <div>
                              <div className="flex justify-between text-[10px] text-slate-600 mb-0.5">
                                <span>Độ mờ khi học chữ</span>
                                <span className="font-mono font-bold tabular-nums">
                                  {Math.round(
                                    (readingBackground.learningScrimOpacity ?? 0.48) * 100,
                                  )}
                                  %
                                </span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={90}
                                step={5}
                                value={Math.round(
                                  (readingBackground.learningScrimOpacity ?? 0.48) * 100,
                                )}
                                onChange={(e) =>
                                  setReadingBackground((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          learningScrimOpacity: Number(e.target.value) / 100,
                                        }
                                      : prev,
                                  )
                                }
                                className="w-full accent-indigo-600"
                              />
                            </div>
                            <div className="flex items-end justify-end gap-1">
                              {(['cover', 'contain'] as BackgroundFitMode[]).map((fitMode) => (
                                <button
                                  key={fitMode}
                                  type="button"
                                  onClick={() =>
                                    setReadingBackground((prev) =>
                                      prev ? { ...prev, fit: fitMode } : prev,
                                    )
                                  }
                                  className={`px-2 py-1 text-[10px] font-semibold rounded border ${
                                    (readingBackground.fit || 'cover') === fitMode
                                      ? 'bg-indigo-600 border-indigo-600 text-white'
                                      : 'bg-white border-slate-200 text-slate-600'
                                  }`}
                                >
                                  {fitMode === 'cover' ? 'Tràn khung' : 'Vừa khung'}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {readingBgError && (
                          <p className="text-[10px] text-rose-600">{readingBgError}</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label htmlFor="reading-title-input" className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Tiêu đề trang sách
                        </label>
                        <input
                          id="reading-title-input"
                          type="text"
                          value={readingTitle}
                          onChange={(e) => setReadingTitle(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                        />
                      </div>
                      <div>
                        <label htmlFor="reading-topic-input" className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Chủ đề / Trình độ
                        </label>
                        <input
                          id="reading-topic-input"
                          type="text"
                          value={readingTopic}
                          onChange={(e) => setReadingTopic(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                        <label htmlFor="reading-passage-textarea" className="text-[11px] font-semibold text-slate-700">
                          Nội dung bài đọc
                        </label>
                        <div className="flex items-center gap-3">
                          <PasteButton
                            onPaste={(txt) => {
                              setReadingText(txt);
                              setAlignResult(null);
                              setAlignCurrentSec(0);
                            }}
                            title="Dán nhanh bài đọc mới (thay thế)"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const cleaned = cleanReadingWorksheetInput(readingText, readingTitle);
                              if (cleaned.title) setReadingTitle(cleaned.title);
                              if (cleaned.bodyText) setReadingText(cleaned.bodyText);
                              setAlignResult(null);
                              setAlignCurrentSec(0);
                              setSynthesizedReadingSig('');
                            }}
                            className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
                          >
                            Làm sạch tiêu đề bài tập
                          </button>
                          <button
                            type="button"
                            onClick={handleExportReadingJson}
                            className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
                          >
                            Xuất .json
                          </button>
                          <label className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 cursor-pointer">
                            Nhập TXT / SRT...
                            <input
                              type="file"
                              accept=".txt,.md,.srt,.vtt"
                              className="hidden"
                              onChange={async (e) => {
                                const f = e.target.files?.[0];
                                if (f) {
                                  const raw = await f.text();
                                  const cleaned = cleanReadingWorksheetInput(raw);
                                  if (cleaned.title) setReadingTitle(cleaned.title);
                                  setReadingText(cleaned.bodyText || raw);
                                  setAlignResult(null);
                                  setAlignCurrentSec(0);
                                  setSynthesizedReadingSig('');
                                }
                              }}
                            />
                          </label>
                        </div>
                      </div>
                      <textarea
                        id="reading-passage-textarea"
                        rows={4}
                        value={readingText}
                        onChange={(e) => {
                          setReadingText(e.target.value);
                          setAlignResult(null);
                          setAlignCurrentSec(0);
                        }}
                        className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg leading-relaxed"
                      />
                    </div>

                    {/* Intro mở đầu theo ngôn ngữ học, Spoken Outro & Background Music */}
                    <div className="p-3 rounded-xl bg-indigo-50/50 border border-indigo-200 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-indigo-950">
                          Intro mở đầu (theo ngôn ngữ học) · Outro có lời · Nhạc nền
                        </span>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-700">
                          <label className="inline-flex items-center gap-1.5 font-semibold cursor-pointer">
                            <input
                              type="checkbox"
                              checked={readingIntroEnabled}
                              onChange={(e) => setReadingIntroEnabled(e.target.checked)}
                              className="rounded border-slate-300 text-indigo-600"
                            />
                            <span>Bật Intro</span>
                          </label>
                          <label className="inline-flex items-center gap-1.5 font-semibold cursor-pointer">
                            <input
                              type="checkbox"
                              checked={readingOutroSpeechEnabled}
                              onChange={(e) => setReadingOutroSpeechEnabled(e.target.checked)}
                              className="rounded border-slate-300 text-indigo-600"
                            />
                            <span>Đọc Outro bằng AI</span>
                          </label>
                        </div>
                      </div>

                      {readingIntroEnabled && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label htmlFor="reading-intro-input" className="text-[10px] font-semibold text-indigo-900">
                              Lời mở đầu Intro (hiển thị &amp; đọc đầu video)
                            </label>
                            {isReadingIntroCustom && (
                              <button
                                type="button"
                                onClick={() => setIsReadingIntroCustom(false)}
                                className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800"
                              >
                                Tự động theo tiêu đề
                              </button>
                            )}
                          </div>
                          <input
                            id="reading-intro-input"
                            type="text"
                            value={readingIntroText}
                            onChange={(e) => {
                              setIsReadingIntroCustom(true);
                              setReadingIntroText(e.target.value);
                            }}
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-indigo-200 rounded-lg"
                          />
                        </div>
                      )}

                      <div className="space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label htmlFor="reading-bgm-select" className="block text-[10px] font-semibold text-slate-700 mb-0.5">
                              Nhạc nền (BGM)
                            </label>
                            <select
                              id="reading-bgm-select"
                              value={readingCustomBgmFile ? 'custom' : readingBgmPreset}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === 'custom') return;
                                setReadingCustomBgmFile(null);
                                setReadingBgmPreset(v as StudioBgmPresetId);
                              }}
                              className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                            >
                              {readingCustomBgmFile && (
                                <option value="custom">Nhạc tải lên: {readingCustomBgmFile.name}</option>
                              )}
                              {STUDIO_BGM_PRESETS.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <div className="flex items-center justify-between text-[10px] font-semibold text-slate-700 mb-0.5">
                              <label htmlFor="reading-bgm-vol">Âm lượng nhạc nền</label>
                              <span className="font-mono">{Math.round(readingBgmVolume * 100)}%</span>
                            </div>
                            <input
                              id="reading-bgm-vol"
                              type="range"
                              min={0}
                              max={0.45}
                              step={0.01}
                              value={readingBgmVolume}
                              disabled={readingBgmPreset === 'none' && !readingCustomBgmFile}
                              onChange={(e) => setReadingBgmVolume(Number(e.target.value))}
                              className="w-full accent-indigo-600 mt-1"
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          <input
                            ref={readingBgmInputRef}
                            type="file"
                            accept="audio/*,.mp3,.wav,.m4a,.ogg"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) setReadingCustomBgmFile(f);
                              e.currentTarget.value = '';
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => readingBgmInputRef.current?.click()}
                            className="inline-flex items-center gap-1 px-2.5 py-1 font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
                          >
                            <Upload className="w-3 h-3 text-indigo-600" />
                            <span>{readingCustomBgmFile ? 'Đổi file nhạc nền' : 'Tải nhạc nền'}</span>
                          </button>
                          {readingCustomBgmFile && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-md max-w-[200px]">
                              <span className="truncate">{readingCustomBgmFile.name}</span>
                              <button
                                type="button"
                                aria-label="Bỏ nhạc nền tải lên Reading Along"
                                onClick={() => setReadingCustomBgmFile(null)}
                                className="text-indigo-500 hover:text-rose-600"
                              >
                                ×
                              </button>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Video Frame Aspect Ratio + Resolution + Quality + FPS + Export (End of Left Column) */}
                    <div className="space-y-3" data-testid="reading-bottom-half-panels">
                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-800">
                            Cấu hình khung hình &amp; chất lượng Video Reading Along
                          </span>
                          <span className="text-[11px] font-mono text-slate-600 tabular-nums">
                            {resolvedReadingDims.width}×{resolvedReadingDims.height} · {resolvedReadingDims.fps}fps
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Khung hình (Tỷ lệ)
                            </label>
                            <select
                              value={readingAspect}
                              onChange={(e) => setReadingAspect(e.target.value as ExportAspectRatioId)}
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                            >
                              {ASPECT_RATIO_OPTIONS.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Độ phân giải
                            </label>
                            <select
                              value={readingResolution}
                              onChange={(e) => setReadingResolution(e.target.value as ExportResolutionId)}
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                            >
                              <option value="540p">540p (Nhanh)</option>
                              <option value="720p">720p (HD Chuẩn)</option>
                              <option value="1080p">1080p (Full HD)</option>
                              <option value="1440p">1440p (2K Siêu nét)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Chất lượng nén
                            </label>
                            <select
                              value={readingQuality}
                              onChange={(e) => setReadingQuality(e.target.value as ExportQualityId)}
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                            >
                              <option value="standard">Tiêu chuẩn</option>
                              <option value="high">Cao (Nét chữ rõ)</option>
                              <option value="ultra">Ultra (Rất nét)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Khung hình/giây (FPS)
                            </label>
                            <select
                              value={readingFps}
                              onChange={(e) => setReadingFps(Number(e.target.value) as ExportFpsOption)}
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                            >
                              <option value={24}>24 fps</option>
                              <option value={30}>30 fps</option>
                              <option value={60}>60 fps (Mượt)</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {alignError && (
                        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                          {alignError}
                        </p>
                      )}

                      {readingExportStatus && (
                        <div className="p-2.5 rounded-lg bg-indigo-50 border border-indigo-200 text-xs text-indigo-800 space-y-1.5">
                          <div className="flex items-center justify-between font-medium">
                            <span>{readingExportStatus}</span>
                            {isExportingReadingMp4 && (
                              <span className="font-mono">{Math.round(readingExportProgress * 100)}%</span>
                            )}
                          </div>
                          {isExportingReadingMp4 && (
                            <div className="w-full h-1.5 bg-indigo-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-600 transition-all"
                                style={{ width: `${Math.round(readingExportProgress * 100)}%` }}
                              />
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        {isExportingReadingMp4 ? (
                          <button
                            type="button"
                            onClick={() => readingAbortRef.current?.abort()}
                            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-rose-600 rounded-lg hover:bg-rose-700"
                          >
                            <Square className="w-3.5 h-3.5 fill-current" />
                            <span>Hủy xuất MP4</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!readingText.trim()}
                            onClick={() => void handleExportReadingAlongMp4()}
                            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                          >
                            <Sparkles className="w-4 h-4" />
                            <span>Render Reading Along MP4</span>
                          </button>
                        )}

                        {alignResult && (
                          <>
                            <button
                              type="button"
                              onClick={() => downloadTextAsPlainFile(alignResult.srt, 'aligned.srt')}
                              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Tải .SRT</span>
                            </button>
                            {onSendAudioCuesToStudio && (
                              <button
                                type="button"
                                onClick={() =>
                                  onSendAudioCuesToStudio(
                                    alignFile,
                                    alignResult.cues,
                                    readingTitle || alignFile?.name.replace(/\.[^.]+$/, '') || 'Aligned Lesson',
                                  )
                                }
                                className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100"
                              >
                                <Play className="w-3.5 h-3.5 fill-current" />
                                <span>Nạp sang Studio 9:16</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                  </div>

                  {/* Right Column: Live Book + Pointer Preview AND Audio TTS/Align */}
                  <div className="lg:col-span-6 space-y-3" data-testid="reading-right-column">
                    <div className="bg-slate-900 rounded-xl p-3 text-white space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
                        <span className="font-bold text-indigo-300">BOOK + POINTER PREVIEW</span>
                        <div className="flex items-center gap-1.5">
                          {readingTimeline.hasOutro && (
                            <button
                              type="button"
                              onClick={() => {
                                const targetSec = Math.min(
                                  readingTimeline.effectiveTotalDuration - 0.1,
                                  readingTimeline.outroStart + 0.05,
                                );
                                setAlignCurrentSec(targetSec);
                                setIsPlayingReadingPreview(true);
                                if (
                                  alignAudioRef.current &&
                                  alignAudioUrl &&
                                  alignAudioDur > readingTimeline.outroStart + 0.1
                                ) {
                                  alignAudioRef.current.currentTime = Math.min(targetSec, alignAudioDur);
                                  void alignAudioRef.current.play().catch(() => undefined);
                                } else {
                                  alignAudioRef.current?.pause();
                                }
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-bold"
                            >
                              <Eye className="w-2.5 h-2.5" />
                              <span>Xem thử Outro</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (isPlayingReadingPreview) {
                                setIsPlayingReadingPreview(false);
                                alignAudioRef.current?.pause();
                              } else {
                                const startAt =
                                  alignCurrentSec >= readingTimeline.effectiveTotalDuration - 0.05
                                    ? 0
                                    : alignCurrentSec;
                                if (startAt !== alignCurrentSec) {
                                  setAlignCurrentSec(startAt);
                                }
                                setIsPlayingReadingPreview(true);
                                if (alignAudioRef.current && alignAudioUrl) {
                                  const audioLimit = Math.max(
                                    readingTimeline.contentEnd,
                                    alignAudioDur || readingTimeline.effectiveTotalDuration,
                                  );
                                  if (startAt < audioLimit) {
                                    alignAudioRef.current.currentTime = Math.min(startAt, audioLimit);
                                    void alignAudioRef.current.play().catch(() => undefined);
                                  }
                                }
                              }
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-semibold"
                          >
                            {isPlayingReadingPreview ? (
                              <>
                                <Pause className="w-2.5 h-2.5" />
                                <span>Tạm dừng</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-2.5 h-2.5 fill-current" />
                                <span>Phát thử trang sách</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      <div className={`${previewCanvasDims.cls} mx-auto rounded-lg overflow-hidden bg-slate-950 border border-slate-800`}>
                        <canvas
                          ref={readingCanvasRef}
                          data-testid="reading-along-canvas"
                          width={previewCanvasDims.w}
                          height={previewCanvasDims.h}
                          title="Click trực tiếp lên Tiêu đề, Nhãn, Nội dung, Con trỏ hoặc Watermark để sửa ngay bên dưới"
                          onClick={(e) => {
                            const canvas = readingCanvasRef.current;
                            if (!canvas) return;
                            const rect = canvas.getBoundingClientRect();
                            if (!rect.width || !rect.height) return;
                            const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
                            const drawW = canvas.width * scale;
                            const drawH = canvas.height * scale;
                            const padX = (rect.width - drawW) / 2;
                            const padY = (rect.height - drawH) / 2;
                            const cx = ((e.clientX - rect.left - padX) / drawW) * canvas.width;
                            const cy = ((e.clientY - rect.top - padY) / drawH) * canvas.height;
                            const zone = hitTestReadingAlongZone(
                              {
                                width: canvas.width,
                                height: canvas.height,
                                title: readingTitle,
                                topicBadge: readingTopic,
                                text: readingText,
                                words: effectiveReadingWords,
                                currentTime: alignCurrentSec,
                                contentDuration: readingTimeline.contentEnd,
                                totalDuration: readingTimeline.effectiveTotalDuration,
                                introEnabled: readingIntroEnabled && readingIntroText.trim().length > 0,
                                introSeconds: activeIntroSec,
                                introTitle: getReadingUiStrings(readingLearningLang).introBadge,
                                introSubtitle: readingIntroText.trim() || readingTitle,
                                paletteId: readingPaletteId,
                                illustrationStyle: readingIllustration,
                                bookFrame: readingBookFrame,
                                pointerStyle: readingPointerStyle,
                                background: readingBackground,
                                subtitlePosition: mappedReadingSubPos,
                                subtitleSize: mappedReadingSubSize,
                                learningLanguage: readingLearningLang,
                                watermarkOutro,
                                pointerScale: readingPointerScale,
                                pointerOffsetX: readingPointerOffsetX,
                                pointerOffsetY: readingPointerOffsetY,
                              },
                              Math.max(0, Math.min(canvas.width, cx)),
                              Math.max(0, Math.min(canvas.height, cy)),
                              canvas.getContext('2d'),
                            );
                            setSelectedReadingZone(zone);
                          }}
                          className="w-full h-full object-contain cursor-pointer"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          aria-label="Thanh tua xem trước Reading Along"
                          min={0}
                          max={readingTimeline.effectiveTotalDuration}
                          step={0.05}
                          value={Math.min(alignCurrentSec, readingTimeline.effectiveTotalDuration)}
                          onChange={(e) => {
                            const t = Number(e.target.value);
                            setAlignCurrentSec(t);
                            if (alignAudioRef.current && alignAudioUrl) {
                              const audioLimit = Math.max(
                                readingTimeline.contentEnd,
                                alignAudioDur || readingTimeline.effectiveTotalDuration,
                              );
                              if (t < audioLimit) {
                                alignAudioRef.current.currentTime = Math.min(
                                  t,
                                  alignAudioRef.current.duration || t,
                                );
                              } else {
                                alignAudioRef.current.pause();
                              }
                            }
                          }}
                          className="flex-1 accent-indigo-400 h-1"
                        />
                        <span className="text-[10px] font-mono text-slate-300 tabular-nums">
                          {alignCurrentSec.toFixed(1)}s / {readingTimeline.effectiveTotalDuration.toFixed(1)}s
                        </span>
                      </div>
                      {(readingTimeline.hasIntro || readingTimeline.hasOutro) && (
                        <div className="text-[10px] text-slate-400 flex flex-wrap items-center justify-between gap-1">
                          <span>
                            {readingTimeline.hasIntro
                              ? `Intro: 0→${readingTimeline.introEnd.toFixed(1)}s · `
                              : ''}
                            Chữ kết thúc: {readingTimeline.lastWordEnd.toFixed(1)}s
                          </span>
                          {readingTimeline.hasOutro && (
                            <span className="text-amber-300">
                              Outro: {readingTimeline.outroStart.toFixed(1)}s (không đè chữ)
                            </span>
                          )}
                        </div>
                      )}

                      {alignAudioUrl && (
                        <audio
                          ref={alignAudioRef}
                          controls
                          src={alignAudioUrl}
                          onLoadedMetadata={(e) => {
                            if (Number.isFinite(e.currentTarget.duration)) {
                              setAlignAudioDur(e.currentTarget.duration);
                            }
                          }}
                          onTimeUpdate={(e) => {
                            if (!e.currentTarget.paused) {
                              setAlignCurrentSec(e.currentTarget.currentTime);
                            }
                          }}
                          onEnded={() => {
                            if (
                              readingTimeline.hasOutro &&
                              alignCurrentSec < readingTimeline.effectiveTotalDuration - 0.15
                            ) {
                              setAlignCurrentSec((prev) => Math.max(prev, readingTimeline.contentEnd));
                              setIsPlayingReadingPreview(true);
                            } else {
                              setIsPlayingReadingPreview(false);
                            }
                          }}
                          className="w-full h-8"
                        />
                      )}
                    </div>

                    {/* Inline Preview Editor directly below Reading Preview */}
                    <div
                      data-testid="reading-inline-preview-editor"
                      className="p-3 rounded-xl bg-white border border-indigo-200 shadow-sm space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="font-bold text-slate-800 mr-1">Sửa trực tiếp dưới Preview:</span>
                          {(
                            [
                              { id: 'badge', label: 'Nhãn' },
                              { id: 'title', label: 'Tiêu đề' },
                              { id: 'body', label: 'Nội dung' },
                              { id: 'pointer', label: 'Con trỏ & Vị trí' },
                              { id: 'intro', label: 'Intro' },
                              { id: 'watermark', label: 'Watermark' },
                              { id: 'outro', label: 'Outro' },
                            ] as const
                          ).map((z) => (
                            <button
                              key={z.id}
                              type="button"
                              onClick={() => setSelectedReadingZone(z.id)}
                              className={`px-2 py-0.5 rounded font-semibold transition-colors whitespace-nowrap ${
                                selectedReadingZone === z.id
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-slate-100 text-slate-700 hover:bg-indigo-50'
                              }`}
                            >
                              {z.label}
                            </button>
                          ))}
                        </div>
                        {selectedReadingZone && (
                          <button
                            type="button"
                            onClick={() => setSelectedReadingZone(null)}
                            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                            aria-label="Đóng sửa nhanh Reading Preview"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {!selectedReadingZone && (
                        <p className="text-[11px] text-slate-500">
                          Click trực tiếp lên Tiêu đề, Nhãn, Bài đọc, Con trỏ hoặc Watermark trên khung preview phía trên để mở ô sửa ngay tại đây.
                        </p>
                      )}

                      {selectedReadingZone === 'badge' && (
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 mb-1">Nhãn chủ đề (Topic Badge)</label>
                          <input
                            type="text"
                            value={readingTopic}
                            onChange={(e) => setReadingTopic(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                          />
                        </div>
                      )}

                      {selectedReadingZone === 'title' && (
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 mb-1">Tiêu đề bài đọc</label>
                          <input
                            type="text"
                            value={readingTitle}
                            onChange={(e) => setReadingTitle(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-semibold"
                          />
                        </div>
                      )}

                      {selectedReadingZone === 'body' && (
                        <div className="space-y-2">
                          <label className="block text-[10px] font-semibold text-slate-600">Nội dung bài đọc</label>
                          <textarea
                            rows={4}
                            value={readingText}
                            onChange={(e) => setReadingText(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg leading-relaxed"
                          />
                          <div className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="text-slate-600 font-semibold">Khung / Bố cục:</span>
                            <select
                              value={readingBookFrame}
                              onChange={(e) => setReadingBookFrame(e.target.value as ReadingBookFrameId)}
                              className="px-2 py-1 rounded border border-slate-300 bg-white text-xs"
                            >
                              {READING_BOOK_FRAMES.map((f) => (
                                <option key={f.id} value={f.id}>{f.label}</option>
                              ))}
                            </select>
                            <select
                              value={readingSubtitleSize}
                              onChange={(e) => setReadingSubtitleSize(e.target.value as SubtitleSize)}
                              className="px-2 py-1 rounded border border-slate-300 bg-white text-xs"
                            >
                              <option value="sm">Cỡ nhỏ</option>
                              <option value="md">Cỡ vừa</option>
                              <option value="lg">Cỡ lớn</option>
                            </select>
                          </div>
                        </div>
                      )}

                      {selectedReadingZone === 'pointer' && (
                        <div className="space-y-2 text-xs">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-600 mb-1">Kiểu con trỏ đọc chữ</label>
                              <select
                                value={readingPointerStyle}
                                onChange={(e) => setReadingPointerStyle(e.target.value as ReadingPointerStyleId)}
                                className="w-full px-2 py-1 rounded border border-slate-300 bg-white text-xs"
                              >
                                {READING_POINTER_STYLES.map((p) => (
                                  <option key={p.id} value={p.id}>{p.label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                                Kích thước con trỏ ({readingPointerScale.toFixed(2)}x)
                              </label>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setReadingPointerScale((s) => Math.max(0.4, Number((s - 0.1).toFixed(2))))}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold whitespace-nowrap"
                                >
                                  <ZoomOut className="w-3 h-3" />
                                  <span>Thu nhỏ</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setReadingPointerScale((s) => Math.min(2.4, Number((s + 0.1).toFixed(2))))}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold whitespace-nowrap"
                                >
                                  <ZoomIn className="w-3 h-3" />
                                  <span>Phóng to</span>
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 items-end">
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-600 mb-1">Dịch X ({readingPointerOffsetX}px)</label>
                              <input
                                type="range"
                                min={-120}
                                max={120}
                                step={4}
                                value={readingPointerOffsetX}
                                onChange={(e) => setReadingPointerOffsetX(Number(e.target.value))}
                                className="w-full accent-indigo-600"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-600 mb-1">Dịch Y ({readingPointerOffsetY}px)</label>
                              <input
                                type="range"
                                min={-120}
                                max={120}
                                step={4}
                                value={readingPointerOffsetY}
                                onChange={(e) => setReadingPointerOffsetY(Number(e.target.value))}
                                className="w-full accent-indigo-600"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setReadingPointerScale(1);
                                setReadingPointerOffsetX(0);
                                setReadingPointerOffsetY(0);
                              }}
                              className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-semibold whitespace-nowrap"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Đặt lại con trỏ</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {selectedReadingZone === 'intro' && (
                        <div className="space-y-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <label className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                              <input
                                type="checkbox"
                                checked={readingIntroEnabled}
                                onChange={(e) => setReadingIntroEnabled(e.target.checked)}
                              />
                              <span>Bật trang Intro mở đầu</span>
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={12}
                              step={0.2}
                              value={readingIntroSeconds}
                              onChange={(e) => setReadingIntroSeconds(Number(e.target.value) || 3)}
                              className="w-20 px-2 py-1 rounded border border-slate-300 text-xs tabular-nums"
                            />
                          </div>
                          <textarea
                            rows={2}
                            value={readingIntroText}
                            onChange={(e) => {
                              setIsReadingIntroCustom(true);
                              setReadingIntroText(e.target.value);
                            }}
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                          />
                        </div>
                      )}

                      {selectedReadingZone === 'watermark' && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 mb-1">Chữ Watermark</label>
                            <input
                              type="text"
                              value={watermarkOutro.watermarkText}
                              onChange={(e) =>
                                setWatermarkOutro((p) => ({ ...p, watermarkText: e.target.value, watermarkEnabled: true }))
                              }
                              className="w-full px-2 py-1 rounded border border-slate-300"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 mb-1">Góc đặt</label>
                            <select
                              value={watermarkOutro.watermarkCorner}
                              onChange={(e) =>
                                setWatermarkOutro((p) => ({
                                  ...p,
                                  watermarkCorner: e.target.value as EduWatermarkCorner,
                                }))
                              }
                              className="w-full px-2 py-1 rounded border border-slate-300 bg-white"
                            >
                              <option value="top-left">Trên trái</option>
                              <option value="top-right">Trên phải</option>
                              <option value="bottom-left">Dưới trái</option>
                              <option value="bottom-right">Dưới phải</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                              Độ mờ ({Math.round(watermarkOutro.watermarkOpacity * 100)}%)
                            </label>
                            <input
                              type="range"
                              min={0.15}
                              max={1}
                              step={0.05}
                              value={watermarkOutro.watermarkOpacity}
                              onChange={(e) =>
                                setWatermarkOutro((p) => ({ ...p, watermarkOpacity: Number(e.target.value) }))
                              }
                              className="w-full accent-indigo-600"
                            />
                          </div>
                        </div>
                      )}

                      {selectedReadingZone === 'outro' && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 mb-1">Outro Dòng 1</label>
                            <input
                              type="text"
                              value={watermarkOutro.outroLine1}
                              onChange={(e) => setWatermarkOutro((p) => ({ ...p, outroLine1: e.target.value }))}
                              className="w-full px-2 py-1 rounded border border-slate-300"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 mb-1">Outro Dòng 2</label>
                            <input
                              type="text"
                              value={watermarkOutro.outroLine2}
                              onChange={(e) => setWatermarkOutro((p) => ({ ...p, outroLine2: e.target.value }))}
                              className="w-full px-2 py-1 rounded border border-slate-300"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 mb-1">Thời lượng (giây)</label>
                            <input
                              type="number"
                              min={0}
                              max={15}
                              step={0.5}
                              value={watermarkOutro.outroSeconds}
                              onChange={(e) =>
                                setWatermarkOutro((p) => ({ ...p, outroSeconds: Number(e.target.value) || 0 }))
                              }
                              className="w-full px-2 py-1 rounded border border-slate-300 tabular-nums"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* TTS / Audio + Fast Forced Align & Whisper (Moved to Right Column below Preview) */}
                    <div
                      data-testid="reading-audio-tts-card"
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-slate-800">
                          Audio giọng đọc (Xuất TTS hoặc Nạp file có sẵn)
                        </span>
                        <label className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-white border border-indigo-200 rounded-md hover:bg-indigo-50 cursor-pointer">
                          <Upload className="w-3 h-3" />
                          <span>{alignFile ? alignFile.name : 'Chọn Audio/Video'}</span>
                          <input
                            type="file"
                            accept="audio/*,video/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0] ?? null;
                              setAlignFile(f);
                              setIsCustomAlignAudio(Boolean(f));
                              setAlignError(null);
                              setAlignResult(null);
                              setAlignCurrentSec(0);
                              setAlignAudioUrl((prev) => {
                                if (prev) URL.revokeObjectURL(prev);
                                return f ? URL.createObjectURL(f) : null;
                              });
                            }}
                          />
                        </label>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <select
                          aria-label="Nhà cung cấp TTS bài đọc"
                          value={readingProvider}
                          onChange={(e) => setReadingProvider(e.target.value)}
                          className="px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                        >
                          <option value="auto">Tự động (Edge TTS miễn phí)</option>
                          <option value="edge">Edge TTS (Miễn phí)</option>
                          <option value="elevenlabs">
                            ElevenLabs AI Voice ({effectiveReadingElevenLabsKey ? 'Đã có Key' : 'Nhập Key ngay dưới'})
                          </option>
                          <option value="google">Google Translate TTS (Miễn phí)</option>
                          <option value="polly">Amazon Polly (Miễn phí)</option>
                        </select>
                        <select
                          aria-label="Giọng đọc bài đọc"
                          value={readingVoice}
                          onChange={(e) => setReadingVoice(e.target.value)}
                          className="sm:col-span-2 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                        >
                          {allReadingVoices.length === 0 ? (
                            <option value="en-US-JennyNeural">Edge TTS — Jenny (English US)</option>
                          ) : (
                            allReadingVoices.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.label}
                              </option>
                            ))
                          )}
                        </select>
                      </div>

                      {readingProvider === 'elevenlabs' && (
                        <ApiKeyInlineControl
                          provider="elevenlabs"
                          hasServerKey={hasReadingElevenLabsKey}
                          onSaved={refreshReadingVoices}
                          compact
                        />
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label="Tốc độ đọc TTS"
                          value={readingTtsRate}
                          onChange={(e) => setReadingTtsRate(Number(e.target.value))}
                          className="px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                        >
                          <option value={0.75}>0.75x</option>
                          <option value={0.9}>0.9x</option>
                          <option value={1.0}>1.0x</option>
                          <option value={1.15}>1.15x</option>
                          <option value={1.3}>1.3x</option>
                        </select>
                        <button
                          type="button"
                          disabled={isGeneratingReadingTts || !readingText.trim()}
                          onClick={() => void handleGenerateReadingTts()}
                          className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {isGeneratingReadingTts ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Volume2 className="w-3 h-3" />
                          )}
                          <span>
                            {isGeneratingReadingTts
                              ? `Đang tạo Audio... ${readingTtsProgress}%`
                              : 'Tạo Audio TTS & Đồng bộ từ'}
                          </span>
                        </button>
                      </div>

                      {(isGeneratingReadingTts || isAligning) && (
                        <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 space-y-1">
                          <div className="flex items-center justify-between text-[11px] font-medium text-emerald-900">
                            <span className="truncate">{readingTtsStageLabel || 'Đang xử lý...'}</span>
                            <span className="font-mono font-bold tabular-nums">{readingTtsProgress}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-emerald-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-600 transition-all duration-300"
                              style={{ width: `${Math.max(4, Math.min(100, readingTtsProgress))}%` }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <select
                          aria-label="Chế độ căn chỉnh từ"
                          value={alignMode}
                          onChange={(e) => setAlignMode(e.target.value as 'fast-forced' | 'whisper')}
                          className="px-2 py-1.5 text-[11px] bg-white border border-slate-200 rounded-lg font-medium"
                        >
                          <option value="fast-forced">⚡ Fast Forced Align (&lt;0.2s)</option>
                          <option value="whisper">Whisper ONNX (Chậm hơn)</option>
                        </select>
                        <select
                          aria-label="Model Whisper căn chữ"
                          disabled={alignMode === 'fast-forced'}
                          value={alignModel}
                          onChange={(e) => setAlignModel(e.target.value)}
                          className="px-2 py-1.5 text-[11px] bg-white border border-slate-200 rounded-lg font-mono disabled:opacity-50"
                        >
                          <option value="Xenova/whisper-small">whisper-small</option>
                          <option value="Xenova/whisper-base">whisper-base</option>
                          <option value="Xenova/whisper-tiny">whisper-tiny</option>
                          <option value="large-v3-turbo">large-v3-turbo</option>
                        </select>
                        <select
                          aria-label="Ngôn ngữ căn chữ"
                          value={alignLang}
                          onChange={(e) => setAlignLang(e.target.value)}
                          className="px-2 py-1.5 text-[11px] bg-white border border-slate-200 rounded-lg"
                        >
                          <option value="auto">Tự động ngôn ngữ</option>
                          <option value="en">English</option>
                          <option value="vi">Tiếng Việt</option>
                          <option value="zh">中文 (Tiếng Trung)</option>
                          <option value="ko">한국어 (Tiếng Hàn)</option>
                          <option value="ja">日本語 (Tiếng Nhật)</option>
                          <option value="fr">Français (Tiếng Pháp)</option>
                          <option value="es">Español (Tiếng TBN)</option>
                        </select>
                      </div>

                      <p className="text-[10px] text-slate-500 leading-snug">
                        Hỗ trợ đồng bộ đa ngôn ngữ (Anh, Trung, Hàn, Nhật, Việt, Pháp, Tây Ban Nha): dán sẵn nội dung vào ô bài đọc + chọn <strong>Fast Forced Align</strong> để căn nhịp chính xác nhất; nếu nạp audio chưa có chữ thì chuyển sang <strong>Whisper ONNX</strong>.
                      </p>

                      {alignFile && (
                        <button
                          type="button"
                          disabled={isAligning}
                          onClick={() => void handleRunWordAlign()}
                          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-50"
                        >
                          {isAligning ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Wand2 className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {isAligning
                              ? `Đang căn chỉnh từng từ... ${readingTtsProgress}%`
                              : alignMode === 'fast-forced'
                                ? '⚡ Căn nhịp siêu tốc theo kịch bản (<0.2s)'
                                : 'Chạy Whisper Word Alignment (khớp bàn tay)'}
                          </span>
                        </button>
                      )}
                    </div>

                    {/* Right Column Lower Cards: Output Folder + Watermark & Outro (pulled tight beneath Audio TTS) */}
                    <div className="space-y-3" data-testid="reading-bottom-right-panels">
                      {renderOutputFolderControl()}

                      <WatermarkOutroSection
                        config={watermarkOutro}
                        onChange={setWatermarkOutro}
                        title="Watermark & Outro (Tùy chọn · Reading Along MP4)"
                      />
                    </div>
                  </div>
                </div>

                {alignResult && alignResult.words.length > 0 && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="text-xs font-bold text-emerald-800 inline-flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>
                        {alignResult.backendUsed} ({alignResult.modelUsed})
                        {alignResult.language ? ` · ${alignResult.language}` : ''} ·{' '}
                        {alignResult.words.length} từ đã căn chỉnh (bấm vào từ để nhảy bàn tay)
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-white rounded-lg border border-slate-200">
                      {alignResult.words.map((w, idx) => {
                        const active = alignCurrentSec >= w.start && alignCurrentSec <= w.end;
                        return (
                          <button
                            key={`${w.start}-${idx}`}
                            type="button"
                            onClick={() => {
                              setAlignCurrentSec(w.start);
                              if (alignAudioRef.current && alignAudioUrl) {
                                alignAudioRef.current.currentTime = w.start;
                                void alignAudioRef.current.play().catch(() => undefined);
                              }
                            }}
                            title={`${w.start.toFixed(2)}s - ${w.end.toFixed(2)}s`}
                            className={`px-2 py-0.5 text-xs rounded-md transition-colors ${
                              active
                                ? 'bg-indigo-600 text-white font-bold shadow-xs'
                                : 'bg-slate-100 text-slate-800 hover:bg-indigo-50'
                            }`}
                          >
                            {w.word}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
  );
};
