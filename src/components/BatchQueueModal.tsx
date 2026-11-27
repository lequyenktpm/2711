import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  BookOpen,
  Check,
  CheckCircle2,
  Clipboard,
  Download,
  Eye,
  FileText,
  FolderOpen,
  FolderSearch,
  Image as ImageIcon,
  Layers,
  Loader2,
  Play,
  RotateCcw,
  Shuffle,
  Sparkles,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { PasteButton } from './PasteButton';
import { BatchPreviewPane } from './BatchPreviewPane';
import { emitOutputUpdated } from './GlobalOutputPanel';
import { buildSceneGenerationPrompt, PromptVideoStyle } from '../engine/aiPromptBuilder';
import {
  concatAudioFilesWithGaps,
  DEFAULT_BGM_PRESET,
  DEFAULT_BGM_VOLUME,
  extractCountdownWindowsFromElements,
  mixVoiceWithBgmPreset,
  shiftReadingWordsForIntro,
  STUDIO_BGM_PRESETS,
  StudioBgmPresetId,
} from '../engine/audioMixHelper';
import { choreographFromTranscript, resyncProjectTimingToCues } from '../engine/autoChoreographer';
import { BACKGROUND_PRESETS } from '../engine/backgroundPresets';
import {
  computeReadingTimelineMetrics,
  READING_BOOK_FRAMES,
  READING_BOOK_PALETTES,
  READING_POINTER_STYLES,
  ReadingBookFrameId,
  ReadingBookPalette,
  ReadingPointerStyleId,
  renderReadingAlongFrame,
} from '../engine/eduStudioEffects';
import {
  CREATOR_FORMAT_OPTIONS,
  CreatorFormatCategory,
  getLevelsForLearningLanguage,
  LEARNING_LANGUAGE_OPTIONS,
  LearningLanguageId,
  reelCardsToLessonProject,
} from '../engine/englishReelsEngine';
import {
  applyCompositionToProject,
  LAYOUT_COMPOSITIONS,
  pickRandomComposition as pickContextRandomComposition,
  recomposeProjectWithStyle,
  shouldApplyCompositionOverride,
} from '../engine/illustrationLayouts';
import {
  ASPECT_RATIO_OPTIONS,
  DEFAULT_MP4_EXPORT_SETTINGS,
  FPS_OPTIONS,
  Mp4ExportSettings,
  QUALITY_OPTIONS,
  RESOLUTION_OPTIONS,
  resolveMp4EncodingParams,
} from '../engine/mp4Config';
import {
  ExportAbortedError,
  exportProjectToServerDisk,
  exportProjectToVideo,
} from '../engine/mp4Exporter';
import {
  BatchSubTabId,
  buildBatchPromptZipName,
  buildBatchTtsSegmentsForReelCards,
  generateBatchPromptsForTopics,
  getBatchPromptSubfolder,
  mapBatchSynthesisDurations,
  mapBatchWordBoundariesToProjectCues,
  parseCreatorOrTranslationBatchInput,
  ParsedCreatorBatchPayload,
  ParsedReadingBatchPayload,
  parseReadingBatchInput,
  parseTopicLinesInput,
  splitMultiJsonInputs,
} from '../engine/multiTabBatchHelper';
import {
  buildLeveledOutputStem,
  cleanDownloadFileName,
  resolveTabOutputSubfolder,
  TAB_OUTPUT_SUBFOLDERS,
} from '../engine/outputNaming';
import {
  cleanReadingWorksheetInput,
  READING_FORMAT_OPTIONS,
  ReadingFormatCategory,
} from '../engine/readingPromptBuilder';
import { parseScenePlanJson, scenePlanToProject } from '../engine/scenePlanAdapter';
import { parseTranscriptAuto } from '../engine/transcriptParser';
import {
  synthesizeAudioAndSyncCues,
  synthesizeAudioWithProgressJob,
} from '../engine/ttsSyncHelper';
import {
  BackgroundFitMode,
  BackgroundImageConfig,
  BackgroundPresetId,
  CanvasThemeId,
  isDarkCanvasTheme,
  LayoutCompositionId,
  LessonProject,
} from '../engine/types';
import { buildVideoDescription } from '../engine/videoDescriptionBuilder';
import { resizeImageFileToStageDataUrl } from '../utils/imageResize';
import { playExportCompleteSound, playTtsCompleteSound } from '../utils/soundEffects';
import { notifyEdgeFallbackToGoogle } from '../utils/ttsFallbackNotice';
import {
  downloadServerOutputFile,
  downloadTextAsPlainFile,
} from '../utils/safeFileDownload';
import { buildZipArchive, extractFilesFromZipArchive } from '../utils/zipBuilder';

export type BatchItemStatus =
  | 'pending'
  | 'generating-json'
  | 'rendering'
  | 'done'
  | 'prompt-ready'
  | 'error';

export interface BatchJobItem {
  id: string;
  baseName: string;
  audioFile: File | null;
  srtFile: File | null;
  jsonFile: File | null;
  pastedJsonText?: string;
  status: BatchItemStatus;
  progress: number;
  detail: string;
  outputInfo?: string;
  promptText?: string;
}

export interface MultiJsonBatchItem {
  id: string;
  subTab: 'creator' | 'translation' | 'reading';
  sourceFileName: string;
  title: string;
  learningLanguage: LearningLanguageId;
  payload: ParsedCreatorBatchPayload | ParsedReadingBatchPayload;
  status: 'pending' | 'synthesizing' | 'rendering' | 'done' | 'error';
  progress: number;
  detail: string;
  outputInfo?: string;
}

interface BatchQueueModalProps {
  isOpen: boolean;
  mp4Settings: Mp4ExportSettings;
  onChangeMp4Settings?: (next: Mp4ExportSettings) => void;
  onClose: () => void;
  onPreviewProject?: (project: LessonProject) => void;
}

const AUDIO_EXT_RE = /\.(mp3|wav|m4a|aac|ogg|flac|webm)$/i;
const SUB_EXT_RE = /\.(srt|vtt|txt)$/i;
const JSON_EXT_RE = /\.json$/i;

const BATCH_SUBTAB_META: Array<{
  id: BatchSubTabId;
  label: string;
  shortDesc: string;
}> = [
  {
    id: 'studio',
    label: '1. Từ vựng (Audio + SRT)',
    shortDesc: 'Cặp .mp3 + .srt + .json',
  },
  {
    id: 'creator',
    label: '2. AI Tạo Từ & Câu',
    shortDesc: 'Upload nhiều JSON từ Web AI',
  },
  {
    id: 'translation',
    label: '3. Phản Xạ Dịch Câu',
    shortDesc: 'Upload nhiều JSON (3 bước)',
  },
  {
    id: 'reading',
    label: '4. Video Đọc Theo Chữ',
    shortDesc: 'Upload nhiều JSON (Book + Pointer)',
  },
];

function getBaseName(fileName: string): string {
  return fileName
    .replace(/\.project\.json$/i, '')
    .replace(/\.scene\.json$/i, '')
    .replace(/\.[^.]+$/, '')
    .trim();
}

function downloadBlob(data: Uint8Array, fileName: string, mimeType = 'application/octet-stream') {
  const blob = new Blob([new Uint8Array(data)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function downloadText(text: string, fileName: string) {
  downloadTextAsPlainFile(text, fileName);
}

function base64ToAudioFile(base64: string, fileName: string, mimeType = 'audio/mpeg'): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], fileName, { type: mimeType });
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export const BatchQueueModal: React.FC<BatchQueueModalProps> = ({
  isOpen,
  mp4Settings,
  onChangeMp4Settings,
  onClose,
}) => {
  // ── Sub-tab Selector across all 4 workflows ───────────────────────────────
  const [batchSubTab, setBatchSubTab] = useState<BatchSubTabId>('studio');

  // ── Studio (Audio + SRT + Scene JSON) queue state ─────────────────────────
  const [items, setItems] = useState<BatchJobItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  // ── Multi-Tab JSON Batch Queue & Settings-First Prompt ZIP State ──────────
  const [aiBatchItems, setAiBatchItems] = useState<MultiJsonBatchItem[]>([]);
  const [multiJsonParseMsg, setMultiJsonParseMsg] = useState<string | null>(null);
  const [isPasteMultiOpen, setIsPasteMultiOpen] = useState(false);
  const [pasteMultiRaw, setPasteMultiRaw] = useState('');
  const [isTopicPromptOpen, setIsTopicPromptOpen] = useState(true);
  const [topicLinesInput, setTopicLinesInput] = useState('');
  const [batchPromptCount, setBatchPromptCount] = useState<number>(5);
  const [promptGenLang, setPromptGenLang] = useState<LearningLanguageId>('en');
  const [promptGenLevel, setPromptGenLevel] = useState<string>('B1');
  const [promptGenTargetLang, setPromptGenTargetLang] = useState<string>('vi');
  const [promptDurationMode, setPromptDurationMode] = useState<'fixed' | 'random'>('fixed');
  const [promptGenMinutes, setPromptGenMinutes] = useState<number>(5);
  const [promptMinMinutes, setPromptMinMinutes] = useState<number>(3);
  const [promptMaxMinutes, setPromptMaxMinutes] = useState<number>(10);
  const [promptGenCreatorFormat, setPromptGenCreatorFormat] =
    useState<CreatorFormatCategory>('auto');
  const [promptGenThinkSec, setPromptGenThinkSec] = useState<number>(4);
  const [promptGenRepeatCount, setPromptGenRepeatCount] = useState<number>(2);
  const [promptGenReadingFormat, setPromptGenReadingFormat] =
    useState<ReadingFormatCategory>('auto');
  const [savedPromptZipInfo, setSavedPromptZipInfo] = useState<{
    zipName: string;
    relativePath: string;
    savedPath: string;
    subfolder: string;
    count: number;
  } | null>(null);
  const [batchErrorNotice, setBatchErrorNotice] = useState<{
    title: string;
    errors: string[];
  } | null>(null);

  // ── Shared Settings for AI JSON Tabs (Zero API Needed) ────────────────────
  const [reelBatchTheme, setReelBatchTheme] = useState<CanvasThemeId>('studio-slate');
  const [reelBatchDualTts, setReelBatchDualTts] = useState(true);
  const [reelBatchRate, setReelBatchRate] = useState(1.0);
  const [reelBatchBgm, setReelBatchBgm] = useState<StudioBgmPresetId>(DEFAULT_BGM_PRESET);
  const [reelBatchBgmVol, setReelBatchBgmVol] = useState(DEFAULT_BGM_VOLUME);
  const [reelBatchCountdownSfx, setReelBatchCountdownSfx] = useState(true);
  const [reelBatchOutroText, setReelBatchOutroText] = useState('YOUR CHANNEL');
  const [reelBatchOutroSec, setReelBatchOutroSec] = useState(3);

  // ── Reading Along Batch Options ───────────────────────────────────────────
  const [readingBatchPalette, setReadingBatchPalette] =
    useState<ReadingBookPalette['id']>('Warm Cream');
  const [readingBatchFrame, setReadingBatchFrame] =
    useState<ReadingBookFrameId>('classic-page');
  const [readingBatchPointer, setReadingBatchPointer] =
    useState<ReadingPointerStyleId>('hand-classic');
  const [readingBatchBgPreset, setReadingBatchBgPreset] = useState<BackgroundPresetId | ''>('');
  const [readingBatchIntro, setReadingBatchIntro] = useState(true);
  const [readingBatchOutroSpeech, setReadingBatchOutroSpeech] = useState(true);

  // ── Studio Mode ('render' | 'prompt-zip') & choreography ──────────────────
  const [batchMode, setBatchMode] = useState<'render' | 'prompt-zip'>('render');
  const [videoStyle, setVideoStyle] = useState<PromptVideoStyle>('tiktok-cards');
  const [compositionId, setCompositionId] = useState<LayoutCompositionId | 'ai-decide' | 'random'>(
    'ai-decide',
  );
  const [contextLockedRandom, setContextLockedRandom] = useState(true);

  // ── Batch optional uploaded background image (auto-resized 9:16) ──────────
  const [batchBackgroundImage, setBatchBackgroundImage] = useState<BackgroundImageConfig | undefined>(
    undefined,
  );
  const [isProcessingBg, setIsProcessingBg] = useState(false);
  const [bgUploadError, setBgUploadError] = useState<string | null>(null);

  // ── In-batch live preview state ───────────────────────────────────────────
  const [previewState, setPreviewState] = useState<{
    itemId: string;
    project: LessonProject;
  } | null>(null);
  const [isLoadingPreviewId, setIsLoadingPreviewId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [itemOverrides, setItemOverrides] = useState<
    Record<string, { compositionId?: LayoutCompositionId; theme?: CanvasThemeId }>
  >({});

  // ── Output Save Settings ──────────────────────────────────────────────────
  const [saveMode, setSaveMode] = useState<'disk' | 'download'>('disk');
  const [customSavePath, setCustomSavePath] = useState<string>(TAB_OUTPUT_SUBFOLDERS.batch);
  const [outputDirHandle, setOutputDirHandle] = useState<any>(null);
  const [outputDirName, setOutputDirName] = useState<string>('');

  // ── Modals / Dialogs ──────────────────────────────────────────────────────
  const [pasteJsonItem, setPasteJsonItem] = useState<BatchJobItem | null>(null);
  const [pasteJsonContent, setPasteJsonContent] = useState<string>('');
  const [pasteJsonError, setPasteJsonError] = useState<string | null>(null);

  const [missingJsonWarning, setMissingJsonWarning] = useState<{
    open: boolean;
    count: number;
    names: string[];
  } | null>(null);

  const [localExportSettings, setLocalExportSettings] = useState<Mp4ExportSettings>(
    mp4Settings ?? DEFAULT_MP4_EXPORT_SETTINGS,
  );
  const [outputFilesState, setOutputFilesState] = useState<{
    outputDir: string;
    files: Array<{ name: string; relativePath: string; bytes: number }>;
  }>({ outputDir: 'output', files: [] });
  const [showOutputList, setShowOutputList] = useState(false);
  const [openFolderMsg, setOpenFolderMsg] = useState<string | null>(null);

  const stopFlagRef = useRef(false);
  const batchAbortControllerRef = useRef<AbortController | null>(null);
  const customSaveInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonOnlyInputRef = useRef<HTMLInputElement>(null);
  const aiJsonMultiInputRef = useRef<HTMLInputElement>(null);
  const bgImageInputRef = useRef<HTMLInputElement>(null);

  const refreshOutputFiles = async () => {
    try {
      const res = await fetch('/api/output/files');
      if (!res.ok) return;
      const data = (await res.json()) as {
        outputDir?: string;
        files?: Array<{ name: string; relativePath: string; bytes: number }>;
      };
      setOutputFilesState({
        outputDir: data.outputDir || 'output',
        files: Array.isArray(data.files) ? data.files : [],
      });
    } catch {
      // ignore offline
    }
  };

  useEffect(() => {
    if (isOpen) {
      void refreshOutputFiles();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const activeSettings = onChangeMp4Settings ? mp4Settings : localExportSettings;
  const updateSettings = (next: Mp4ExportSettings) => {
    setLocalExportSettings(next);
    onChangeMp4Settings?.(next);
  };
  const encoding = resolveMp4EncodingParams(activeSettings);

  const activeAiItems =
    batchSubTab === 'studio'
      ? []
      : aiBatchItems.filter((item) => item.subTab === batchSubTab);

  const handleUploadBatchBackground = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.currentTarget;
    const file = inputEl.files?.[0];
    if (!file) return;
    setBgUploadError(null);
    setIsProcessingBg(true);
    try {
      const cfg = await resizeImageFileToStageDataUrl(file, {
        fit: batchBackgroundImage?.fit ?? 'cover',
        scrimOpacity: batchBackgroundImage?.scrimOpacity ?? 0.22,
      });
      setBatchBackgroundImage(cfg);
      if (previewState) {
        setPreviewState({
          itemId: previewState.itemId,
          project: { ...previewState.project, backgroundImage: cfg },
        });
      }
    } catch (err) {
      setBgUploadError(
        err instanceof Error
          ? err.message
          : 'Không thể đọc file ảnh nền. Hãy thử file PNG, JPG hoặc WebP.',
      );
    } finally {
      inputEl.value = '';
      setIsProcessingBg(false);
    }
  };

  const applyStyleThemeToProject = (
    proj: LessonProject,
    overrideTheme?: CanvasThemeId,
  ): LessonProject => {
    const targetTheme = overrideTheme ?? proj.theme;
    const isDark = isDarkCanvasTheme(targetTheme);
    return {
      ...proj,
      theme: targetTheme,
      backgroundImage: batchBackgroundImage ?? proj.backgroundImage,
      elements: proj.elements.map((el) => {
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
  };

  const resolveCompositionAndTheme = (
    transcriptText: string,
    override?: { compositionId?: LayoutCompositionId; theme?: CanvasThemeId },
  ): { compositionId: LayoutCompositionId | 'ai-decide'; theme?: CanvasThemeId } => {
    if (override?.compositionId) {
      return { compositionId: override.compositionId, theme: override.theme };
    }

    const effectiveSelectedComp =
      compositionId !== 'ai-decide' && compositionId !== 'random'
        ? compositionId
        : videoStyle === 'word-reveal-dark'
          ? 'word-reveal'
          : videoStyle === '3d-shapes'
            ? '3d-shapes'
            : compositionId;

    if (effectiveSelectedComp === 'random') {
      const picked = pickContextRandomComposition(undefined, override?.theme, Math.random, {
        transcriptText: contextLockedRandom ? transcriptText : undefined,
      });
      return {
        compositionId: picked.compositionId,
        theme: override?.theme ?? picked.theme,
      };
    }

    return {
      compositionId: effectiveSelectedComp,
      theme: override?.theme,
    };
  };

  const handlePickDirectory = async () => {
    try {
      if ('showDirectoryPicker' in window) {
        const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
        setOutputDirHandle(handle);
        setOutputDirName(handle.name);
        setOpenFolderMsg(`Đã chọn thư mục trên máy: ${handle.name}`);
      } else {
        setOpenFolderMsg(
          'Trình duyệt/iframe không hỗ trợ hộp thoại chọn thư mục trực tiếp — hãy nhập tên thư mục con ở ô đường dẫn server bên cạnh (mặc định: Batch).',
        );
        customSaveInputRef.current?.focus();
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.warn('Directory picker cancelled or error:', err);
      }
    }
  };

  const handleOpenOutputFolder = async (overrideSubPath?: string) => {
    try {
      const targetPath =
        overrideSubPath !== undefined
          ? overrideSubPath
          : resolveTabOutputSubfolder('Batch', customSavePath);
      const res = await fetch('/api/output/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        desktopOpened?: boolean;
        outputDir?: string;
        error?: string;
      };
      if (data.desktopOpened) {
        setOpenFolderMsg(`Đã mở thư mục trên máy: ${data.outputDir || targetPath}`);
      } else {
        setOpenFolderMsg(
          `Đường dẫn lưu trữ: ${data.outputDir || outputFilesState.outputDir} (Mở danh sách file bên dưới hoặc copy đường dẫn này vào File Explorer).`,
        );
        setShowOutputList(true);
      }
    } catch {
      setShowOutputList(true);
    }
  };

  const saveTextOutput = async (text: string, fileName: string) => {
    if (outputDirHandle) {
      try {
        const fileHandle = await outputDirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(text);
        await writable.close();
        return;
      } catch (e) {
        console.warn('Failed writing to directory handle, falling back to browser download', e);
      }
    }
    downloadText(text, fileName);
  };

  const saveBlobOutput = async (data: Uint8Array, fileName: string, mimeType?: string) => {
    if (outputDirHandle) {
      try {
        const fileHandle = await outputDirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(data);
        await writable.close();
        return;
      } catch (e) {
        console.warn('Failed writing to directory handle, falling back to browser download', e);
      }
    }
    downloadBlob(data, fileName, mimeType);
  };

  const saveZipToServerSubfolder = async (
    zipData: Uint8Array,
    zipName: string,
    subfolder: string,
    sourceTab: string,
  ): Promise<{ relativePath: string; savedPath: string }> => {
    try {
      const res = await fetch('/api/output/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: zipName,
          base64: uint8ArrayToBase64(zipData),
          relativeDir: subfolder,
          sourceTab,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          relativePath?: string;
          savedPath?: string;
        };
        if (data.relativePath) {
          emitOutputUpdated({ relativePath: data.relativePath, sourceTab });
          void refreshOutputFiles();
        }
        return {
          relativePath: data.relativePath || `${subfolder}/${zipName}`,
          savedPath: data.savedPath || `output/${subfolder}/${zipName}`,
        };
      }
    } catch {
      // Fall back to relative display path when server save fails
    }
    return {
      relativePath: `${subfolder}/${zipName}`,
      savedPath: `output/${subfolder}/${zipName}`,
    };
  };

  const expandUploadedFilesOrZips = async (files: File[]): Promise<File[]> => {
    const expanded: File[] = [];
    const zipErrors: string[] = [];

    for (const f of files) {
      if (!/\.zip$/i.test(f.name)) {
        expanded.push(f);
        continue;
      }
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const archiveFiles = await extractFilesFromZipArchive(bytes);
        const entryNames = Object.keys(archiveFiles).filter((entryPath) => {
          const leaf = entryPath.split('/').pop() || '';
          return (
            leaf.length > 0 &&
            !entryPath.includes('__MACOSX/') &&
            !leaf.startsWith('._')
          );
        });
        if (entryNames.length === 0) {
          zipErrors.push(`File ZIP "${f.name}" không chứa tệp hợp lệ bên trong.`);
          continue;
        }
        for (const entryPath of entryNames) {
          const leaf = entryPath.split('/').pop() || entryPath;
          const entryBytes = archiveFiles[entryPath];
          const mime = /\.json$/i.test(leaf)
            ? 'application/json'
            : /\.mp3$/i.test(leaf)
              ? 'audio/mpeg'
              : /\.wav$/i.test(leaf)
                ? 'audio/wav'
                : 'text/plain';
          expanded.push(new File([new Uint8Array(entryBytes)], leaf, { type: mime }));
        }
      } catch (err) {
        zipErrors.push(
          `Lỗi giải nén "${f.name}": ${err instanceof Error ? err.message : 'File ZIP bị hỏng.'}`,
        );
      }
    }

    if (zipErrors.length > 0) {
      setBatchErrorNotice({
        title: `Không đọc được ${zipErrors.length} file .zip`,
        errors: zipErrors,
      });
    }

    return expanded;
  };

  // ── Multi-Tab AI JSON Ingestion (No API Needed) ───────────────────────────
  const ingestMultiJsonTexts = (
    entries: Array<{ rawText: string; fileName: string }>,
    targetSubTab: 'creator' | 'translation' | 'reading',
  ) => {
    const added: MultiJsonBatchItem[] = [];
    const failedFiles: string[] = [];

    entries.forEach((entry, entryIdx) => {
      const chunks = splitMultiJsonInputs(entry.rawText);
      let matchedAny = false;
      chunks.forEach((chunk, chunkIdx) => {
        const suffixName =
          chunks.length > 1 ? `${entry.fileName}#${chunkIdx + 1}` : entry.fileName;
        if (targetSubTab === 'reading') {
          const parsed = parseReadingBatchInput(chunk, {
            fileName: suffixName,
            fallbackLang: promptGenLang,
            fallbackLevel: promptGenLevel,
          });
          if (parsed) {
            matchedAny = true;
            added.push({
              id: `ai-${targetSubTab}-${Date.now()}-${entryIdx}-${chunkIdx}-${Math.random().toString(36).slice(2, 6)}`,
              subTab: 'reading',
              sourceFileName: suffixName,
              title: parsed.title,
              learningLanguage: parsed.learningLanguage,
              payload: parsed,
              status: 'pending',
              progress: 0,
              detail: `Sẵn sàng · ${parsed.learningLanguage.toUpperCase()} · ~${parsed.text.length} ký tự`,
            });
          }
        } else {
          const parsed = parseCreatorOrTranslationBatchInput(chunk, {
            mode: targetSubTab,
            fileName: suffixName,
            fallbackLang: promptGenLang,
          });
          if (parsed) {
            matchedAny = true;
            added.push({
              id: `ai-${targetSubTab}-${Date.now()}-${entryIdx}-${chunkIdx}-${Math.random().toString(36).slice(2, 6)}`,
              subTab: targetSubTab,
              sourceFileName: suffixName,
              title: parsed.title,
              learningLanguage: parsed.learningLanguage,
              payload: parsed,
              status: 'pending',
              progress: 0,
              detail: `Sẵn sàng · ${parsed.learningLanguage.toUpperCase()} · ${parsed.cards.length} thẻ`,
            });
          }
        }
      });

      if (!matchedAny) {
        failedFiles.push(entry.fileName);
      }
    });

    if (added.length > 0) {
      setAiBatchItems((prev) => [...prev, ...added]);
    }
    if (added.length > 0 && failedFiles.length === 0) {
      setMultiJsonParseMsg(`Đã nạp thành công ${added.length} kịch bản JSON vào hàng đợi!`);
    } else if (added.length > 0 && failedFiles.length > 0) {
      setMultiJsonParseMsg(
        `Đã nạp ${added.length} bài, bỏ qua ${failedFiles.length} file sai định dạng (${failedFiles.slice(0, 3).join(', ')}).`,
      );
      setBatchErrorNotice({
        title: `Có ${failedFiles.length} file JSON không đúng định dạng tab hiện tại`,
        errors: failedFiles.map((fn) => `${fn}: sai cấu trúc hoặc không chứa bài hợp lệ`),
      });
    } else if (failedFiles.length > 0) {
      const msg = `Không đọc được nội dung JSON hợp lệ từ: ${failedFiles.slice(0, 3).join(', ')}. Hãy kiểm tra đúng tab con đã chọn.`;
      setMultiJsonParseMsg(msg);
      setBatchErrorNotice({
        title: 'Không đọc được các file JSON vừa tải lên',
        errors: failedFiles.map((fn) => `${fn}: không khớp cấu trúc tab đang chọn`),
      });
    }
  };

  const handleUploadAiJsonFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0 || batchSubTab === 'studio') return;
    const rawFiles = Array.from(fileList);
    e.target.value = '';
    const expandedFiles = await expandUploadedFilesOrZips(rawFiles);
    const entries = await Promise.all(
      expandedFiles
        .filter((f) => /\.(json|txt|md)$/i.test(f.name) || f.type === 'application/json')
        .map(async (f) => ({
          rawText: await f.text(),
          fileName: f.name,
        })),
    );
    if (entries.length === 0) {
      setMultiJsonParseMsg('Không tìm thấy file .json/.txt nào bên trong tệp bạn vừa chọn.');
      return;
    }
    ingestMultiJsonTexts(entries, batchSubTab);
  };

  const handleApplyPasteMultiJson = () => {
    if (batchSubTab === 'studio' || !pasteMultiRaw.trim()) return;
    ingestMultiJsonTexts(
      [{ rawText: pasteMultiRaw, fileName: `Pasted-${Date.now().toString().slice(-4)}.json` }],
      batchSubTab,
    );
    setPasteMultiRaw('');
    setIsPasteMultiOpen(false);
  };

  const handleExportTopicsPromptZip = async () => {
    setBatchErrorNotice(null);
    const topics = parseTopicLinesInput(topicLinesInput);
    const safeMin = Math.max(0.5, Math.min(30, Math.min(promptMinMinutes, promptMaxMinutes)));
    const safeMax = Math.max(0.5, Math.min(30, Math.max(promptMinMinutes, promptMaxMinutes)));
    const effectiveCount = Math.max(
      1,
      Math.min(30, topics.length > 0 ? Math.max(batchPromptCount, topics.length) : batchPromptCount),
    );
    const resolvedStudioComp: LayoutCompositionId | 'ai-decide' =
      compositionId === 'random' ? 'ai-decide' : compositionId;

    const prompts = generateBatchPromptsForTopics({
      subTab: batchSubTab,
      topics,
      promptCount: effectiveCount,
      learningLanguage: promptGenLang,
      level: promptGenLevel,
      durationMode: promptDurationMode,
      durationMinutes: promptGenMinutes,
      minDurationMinutes: safeMin,
      maxDurationMinutes: safeMax,
      targetLang: promptGenTargetLang,
      aspectRatio: activeSettings.aspectRatio || '9:16',
      style: videoStyle,
      compositionId: resolvedStudioComp,
      formatPreference: promptGenCreatorFormat,
      thinkSec: promptGenThinkSec,
      repeatCount: promptGenRepeatCount,
      readingFormat: promptGenReadingFormat,
    });

    const zipEntries: Record<string, string> = {};
    prompts.forEach((p) => {
      zipEntries[p.fileName] = p.promptText;
    });
    const zipData = buildZipArchive(zipEntries);
    const zipName = buildBatchPromptZipName(batchSubTab);
    const subfolder = getBatchPromptSubfolder(batchSubTab);
    const savedMeta = await saveZipToServerSubfolder(
      zipData,
      zipName,
      subfolder,
      `Prompt ${batchSubTab}`,
    );
    await saveBlobOutput(zipData, zipName, 'application/zip');
    setSavedPromptZipInfo({
      zipName,
      relativePath: savedMeta.relativePath,
      savedPath: savedMeta.savedPath,
      subfolder,
      count: prompts.length,
    });
    setMultiJsonParseMsg(
      `Đã tạo ${prompts.length} prompt trong ${zipName} (lưu tại ${savedMeta.savedPath}). Chạy AI Web lấy JSON → nén .zip (hoặc chọn nhiều .json) rồi upload lên đây!`,
    );
  };

  // ── Studio File Handling ──────────────────────────────────────────────────
  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = await expandUploadedFilesOrZips(Array.from(fileList));

    setItems((prev) => {
      const map = new Map<string, BatchJobItem>();
      for (const existing of prev) {
        map.set(existing.baseName.toLowerCase(), { ...existing });
      }

      for (const file of files) {
        const base = getBaseName(file.name);
        if (!base) continue;
        const key = base.toLowerCase();
        const current: BatchJobItem = map.get(key) ?? {
          id: `batch-${key}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          baseName: base,
          audioFile: null,
          srtFile: null,
          jsonFile: null,
          status: 'pending',
          progress: 0,
          detail: 'Chờ xử lý',
        };

        if (AUDIO_EXT_RE.test(file.name)) {
          current.audioFile = file;
        } else if (SUB_EXT_RE.test(file.name)) {
          current.srtFile = file;
        } else if (JSON_EXT_RE.test(file.name)) {
          current.jsonFile = file;
        }

        if (current.status === 'error') {
          current.status = 'pending';
          current.detail = 'Chờ xử lý lại';
        }
        map.set(key, current);
      }

      return Array.from(map.values()).sort((a, b) => a.baseName.localeCompare(b.baseName));
    });
  };

  const handleJsonFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = (await expandUploadedFilesOrZips(Array.from(fileList))).filter((f) =>
      JSON_EXT_RE.test(f.name),
    );
    if (files.length === 0) return;

    setItems((prev) => {
      return prev.map((item) => {
        const matchingFile = files.find(
          (f) => getBaseName(f.name).toLowerCase() === item.baseName.toLowerCase(),
        );
        if (matchingFile) {
          return {
            ...item,
            jsonFile: matchingFile,
            detail: `Đã nạp file ${matchingFile.name}`,
          };
        }
        return item;
      });
    });
  };

  const updateItem = (id: string, patch: Partial<BatchJobItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const updateAiItem = (id: string, patch: Partial<MultiJsonBatchItem>) => {
    setAiBatchItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const buildPromptForItem = async (item: BatchJobItem): Promise<string> => {
    if (!item.srtFile) {
      throw new Error(`Thiếu file phụ đề (.srt / .txt) cho "${item.baseName}"`);
    }
    const srtText = await item.srtFile.text();
    const cues = parseTranscriptAuto(srtText);
    if (cues.length === 0) {
      throw new Error(`Không đọc được mốc thời gian trong ${item.srtFile.name}`);
    }

    const transcriptText = cues.map((c) => c.text).join(' ');
    const resolved = resolveCompositionAndTheme(transcriptText, itemOverrides[item.id]);
    return buildSceneGenerationPrompt(cues, {
      title: item.baseName,
      style: videoStyle,
      compositionId: resolved.compositionId,
      theme: resolved.theme,
    });
  };

  const exportBaseName = (item: BatchJobItem): string =>
    buildLeveledOutputStem({
      title: item.audioFile ? getBaseName(item.audioFile.name) : item.baseName,
      fallback: 'Batch Video',
    });

  const buildProjectForItem = async (
    item: BatchJobItem,
    effectiveComposition: LayoutCompositionId | 'ai-decide',
    options?: { themeOverride?: CanvasThemeId },
  ): Promise<LessonProject> => {
    if (item.jsonFile && item.jsonFile.name.endsWith('.project.json')) {
      const raw = await item.jsonFile.text();
      const parsed = JSON.parse(raw) as LessonProject;
      if (parsed && Array.isArray(parsed.elements) && Array.isArray(parsed.cues)) {
        return {
          ...parsed,
          id: item.baseName,
          theme: options?.themeOverride ?? parsed.theme,
          backgroundImage: batchBackgroundImage ?? parsed.backgroundImage,
          audioFileName: item.audioFile?.name ?? parsed.audioFileName,
        };
      }
    }

    if (!item.srtFile) {
      throw new Error(`Thiếu file phụ đề (.srt / .txt) cho "${item.baseName}"`);
    }

    const srtText = await item.srtFile.text();
    const cues = parseTranscriptAuto(srtText);
    if (cues.length === 0) {
      throw new Error(`Không đọc được mốc thời gian trong file ${item.srtFile.name}`);
    }

    let rawSceneJson = '';
    if (item.pastedJsonText) {
      rawSceneJson = item.pastedJsonText;
    } else if (item.jsonFile) {
      rawSceneJson = await item.jsonFile.text();
    }

    if (rawSceneJson) {
      const plan = parseScenePlanJson(rawSceneJson);
      if (plan && plan.scenes.length > 0) {
        const words = cues.flatMap((c) => c.words);
        const proj = scenePlanToProject(words, plan, {
          id: item.baseName,
          title: plan.title || item.baseName,
          theme: options?.themeOverride ?? plan.theme,
          audioFileName: item.audioFile?.name,
          cuesOverride: cues,
        });
        return {
          ...proj,
          backgroundImage: batchBackgroundImage ?? proj.backgroundImage,
        };
      }
    }

    const fallbackProj = choreographFromTranscript(cues, {
      id: item.baseName,
      title: item.baseName,
      theme: options?.themeOverride,
      audioFileName: item.audioFile?.name,
    });
    return {
      ...fallbackProj,
      backgroundImage: batchBackgroundImage ?? fallbackProj.backgroundImage,
    };
  };

  const handleOpenPreview = async (item: BatchJobItem) => {
    setPreviewError(null);
    setIsLoadingPreviewId(item.id);
    try {
      const srtText = item.srtFile ? await item.srtFile.text() : '';
      const override = itemOverrides[item.id];
      const hasCustomJson = Boolean(item.jsonFile || item.pastedJsonText);
      const resolved = resolveCompositionAndTheme(srtText, override);
      let builtProject = await buildProjectForItem(item, resolved.compositionId, {
        themeOverride: hasCustomJson ? override?.theme : resolved.theme,
      });

      if (shouldApplyCompositionOverride(hasCustomJson, Boolean(override?.compositionId))) {
        builtProject = applyCompositionToProject(builtProject, resolved.compositionId, {
          theme: resolved.theme,
        });
      }
      builtProject = applyStyleThemeToProject(builtProject, override?.theme);
      setPreviewState({ itemId: item.id, project: builtProject });
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Không thể tạo bản xem trước cho bài này.');
    } finally {
      setIsLoadingPreviewId(null);
    }
  };

  const handleOpenAiItemPreview = (item: MultiJsonBatchItem) => {
    if (item.payload.subTab === 'reading') {
      setPreviewError('Tab Đọc Theo Chữ dùng bộ dựng trang sách + con trỏ riêng khi chạy Batch.');
      return;
    }
    setPreviewError(null);
    const payload = item.payload;
    const override = itemOverrides[item.id];
    const proj = reelCardsToLessonProject(payload.cards, {
      title: payload.title,
      theme: override?.theme ?? reelBatchTheme,
      aspectRatio: activeSettings.aspectRatio || '9:16',
      targetLang: 'vi',
      backgroundImage: batchBackgroundImage,
      compositionId: override?.compositionId,
      sceneJsonOverride: payload.sceneJsonOverride,
      watermark: {
        watermarkEnabled: Boolean(reelBatchOutroText.trim()),
        watermarkText: reelBatchOutroText.trim(),
        watermarkCorner: 'bottom-right',
        watermarkOpacity: 0.65,
        outroSeconds: reelBatchOutroSec,
        outroLine1: 'Thanks for watching!',
        outroLine2: 'See you next time',
      },
    });
    setPreviewState({ itemId: item.id, project: proj });
  };

  const handlePreviewThemeChange = (nextTheme: CanvasThemeId) => {
    if (!previewState) return;
    const updated = applyStyleThemeToProject(previewState.project, nextTheme);
    setPreviewState({ itemId: previewState.itemId, project: updated });
    setItemOverrides((prev) => ({
      ...prev,
      [previewState.itemId]: { ...prev[previewState.itemId], theme: nextTheme },
    }));
  };

  const handlePreviewRandomizeLayout = () => {
    if (!previewState) return;
    const curr = previewState.project;
    const transcriptText = curr.cues.map((c) => c.text).join(' ');
    const picked = pickContextRandomComposition(curr.compositionId, curr.theme, Math.random, {
      transcriptText: contextLockedRandom ? transcriptText : undefined,
      allowDarkThemes: true,
    });
    const nextProject = {
      ...recomposeProjectWithStyle(curr, picked.compositionId, { theme: picked.theme }),
      backgroundImage: batchBackgroundImage ?? curr.backgroundImage,
    };

    setPreviewState({ itemId: previewState.itemId, project: nextProject });
    setItemOverrides((prev) => ({
      ...prev,
      [previewState.itemId]: {
        compositionId: picked.compositionId,
        theme: nextProject.theme,
      },
    }));
  };

  const handleGeneratePromptZip = async () => {
    if (isRunning) return;
    stopFlagRef.current = false;
    setBatchErrorNotice(null);
    setIsRunning(true);

    const queueSnapshot = [...items];
    const promptFiles: Record<string, string> = {};
    const runErrors: string[] = [];

    for (let idx = 0; idx < queueSnapshot.length; idx++) {
      const item = queueSnapshot[idx];
      if (stopFlagRef.current) break;
      if (item.status === 'done' || item.status === 'prompt-ready') continue;

      try {
        updateItem(item.id, {
          status: 'generating-json',
          progress: 0.3,
          detail: 'Đang tạo prompt...',
        });

        const promptText = await buildPromptForItem(item);
        const promptStem = buildLeveledOutputStem({
          title: item.baseName,
          fallback: 'Prompt',
        });
        const promptFileName = cleanDownloadFileName(`${promptStem} | Prompt`, 'txt', 'Prompt');
        promptFiles[promptFileName] = promptText;
        await saveTextOutput(promptText, promptFileName);

        updateItem(item.id, {
          status: 'prompt-ready',
          progress: 1,
          detail: `Prompt đã tạo & lưu ${outputDirName ? `vào [${outputDirName}]` : 'máy'} (${promptText.length.toLocaleString()} ký tự)`,
          promptText,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Lỗi không xác định';
        runErrors.push(`${item.baseName}: ${msg}`);
        setBatchErrorNotice({
          title: `Có ${runErrors.length} bài tạo Prompt thất bại (đang tiếp tục các bài còn lại)`,
          errors: [...runErrors],
        });
        updateItem(item.id, {
          status: 'error',
          progress: 0,
          detail: msg,
        });
      }

      if (idx < queueSnapshot.length - 1 && !stopFlagRef.current) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    if (Object.keys(promptFiles).length >= 1) {
      const zipData = buildZipArchive(promptFiles);
      const zipName = buildBatchPromptZipName('studio');
      const subfolder = getBatchPromptSubfolder('studio');
      const savedMeta = await saveZipToServerSubfolder(
        zipData,
        zipName,
        subfolder,
        'Prompt studio',
      );
      await saveBlobOutput(zipData, zipName, 'application/zip');
      setSavedPromptZipInfo({
        zipName,
        relativePath: savedMeta.relativePath,
        savedPath: savedMeta.savedPath,
        subfolder,
        count: Object.keys(promptFiles).length,
      });
    }

    setIsRunning(false);
  };

  const handleStartBatchClick = () => {
    if (isRunning) return;
    if (batchSubTab !== 'studio') {
      void handleStartAiBatch();
      return;
    }

    const missingJsonItems = items.filter(
      (it) => !it.jsonFile && !it.pastedJsonText && it.status !== 'done',
    );

    if (missingJsonItems.length > 0) {
      setMissingJsonWarning({
        open: true,
        count: missingJsonItems.length,
        names: missingJsonItems.map((i) => i.baseName),
      });
      return;
    }

    void handleStartBatch();
  };

  const handleCancelBatchImmediately = () => {
    stopFlagRef.current = true;
    batchAbortControllerRef.current?.abort();
  };

  // ── Studio Batch Execution ────────────────────────────────────────────────
  const handleStartBatch = async () => {
    if (isRunning) return;
    stopFlagRef.current = false;
    setBatchErrorNotice(null);
    const controller = new AbortController();
    batchAbortControllerRef.current = controller;
    setIsRunning(true);

    const queueSnapshot = [...items];
    let completedCount = 0;
    const runErrors: string[] = [];
    for (let idx = 0; idx < queueSnapshot.length; idx++) {
      const item = queueSnapshot[idx];
      if (stopFlagRef.current || controller.signal.aborted) break;
      if (item.status === 'done') continue;

      try {
        updateItem(item.id, {
          status: 'generating-json',
          progress: 0.05,
          detail: 'Đang chuẩn bị dữ liệu...',
        });

        const srtText = item.srtFile ? await item.srtFile.text() : '';
        const override = itemOverrides[item.id];
        const hasCustomJson = Boolean(item.jsonFile || item.pastedJsonText);
        const resolved = resolveCompositionAndTheme(srtText, override);
        let builtProject = await buildProjectForItem(item, resolved.compositionId, {
          themeOverride: hasCustomJson ? override?.theme : resolved.theme,
        });
        if (shouldApplyCompositionOverride(hasCustomJson, Boolean(override?.compositionId))) {
          builtProject = applyCompositionToProject(builtProject, resolved.compositionId, {
            theme: resolved.theme,
          });
        }
        builtProject = applyStyleThemeToProject(builtProject, override?.theme);
        const fileBase = exportBaseName(item);

        const batchItemDescription = buildVideoDescription({
          title: builtProject.title || fileBase,
          nativeLang: 'vi',
          learningLang: 'auto',
          project: builtProject,
          durationSec: builtProject.duration,
        });

        updateItem(item.id, {
          status: 'rendering',
          progress: 0.15,
          detail: `Đang dựng ${encoding.width}×${encoding.height} @ ${encoding.fps}fps...`,
        });

        if (saveMode === 'disk') {
          const effectivePath = resolveTabOutputSubfolder('Batch', customSavePath);
          const saved = await exportProjectToServerDisk(
            builtProject,
            item.audioFile,
            ({ progress, stageLabel }) => {
              updateItem(item.id, {
                status: 'rendering',
                progress: 0.15 + progress * 0.85,
                detail: stageLabel,
              });
            },
            activeSettings,
            fileBase,
            effectivePath,
            {
              signal: controller.signal,
              directoryHandle: outputDirHandle,
              sourceTab: 'Batch',
              companionText: batchItemDescription.txtContent,
            },
          );
          const mb = (saved.byteLength / (1024 * 1024)).toFixed(2);
          updateItem(item.id, {
            status: 'done',
            progress: 1,
            detail: `Đã lưu (${mb} MB · ${encoding.width}×${encoding.height} @ ${encoding.fps}fps)`,
            outputInfo: saved.savedPath,
          });
          emitOutputUpdated({ relativePath: saved.relativePath, sourceTab: 'Batch' });
          completedCount++;
          void refreshOutputFiles();
        } else {
          const exported = await exportProjectToVideo(
            { ...builtProject, id: fileBase },
            item.audioFile,
            ({ progress, stageLabel }) => {
              updateItem(item.id, {
                status: 'rendering',
                progress: 0.15 + progress * 0.85,
                detail: stageLabel,
              });
            },
            activeSettings,
            {
              signal: controller.signal,
              customFileBase: fileBase,
              alsoSaveToServerOutput: true,
              savePath: resolveTabOutputSubfolder('Batch', customSavePath),
              sourceTab: 'Batch',
              companionText: batchItemDescription.txtContent,
            },
          );
          const mb = (exported.byteLength / (1024 * 1024)).toFixed(2);
          updateItem(item.id, {
            status: 'done',
            progress: 1,
            detail: `Đã tải ${exported.fileName} (${mb} MB)`,
            outputInfo: exported.savedPath,
          });
          if (exported.relativePath) {
            emitOutputUpdated({ relativePath: exported.relativePath, sourceTab: 'Batch' });
          }
          completedCount++;
          void refreshOutputFiles();
        }
      } catch (err) {
        if (err instanceof ExportAbortedError || controller.signal.aborted) {
          updateItem(item.id, {
            status: 'pending',
            progress: 0,
            detail: 'Đã hủy render giữa chừng',
          });
          break;
        }
        const msg = err instanceof Error ? err.message : 'Lỗi không xác định';
        runErrors.push(`${item.baseName}: ${msg}`);
        setBatchErrorNotice({
          title: `Có ${runErrors.length} bài gặp lỗi khi render (đang tiếp tục hoặc bạn có thể Hủy)`,
          errors: [...runErrors],
        });
        updateItem(item.id, {
          status: 'error',
          progress: 0,
          detail: msg,
        });
      }

      if (idx < queueSnapshot.length - 1 && !stopFlagRef.current && !controller.signal.aborted) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    batchAbortControllerRef.current = null;
    setIsRunning(false);
    if (!stopFlagRef.current && !controller.signal.aborted && completedCount > 0) {
      playExportCompleteSound();
    }
    void refreshOutputFiles();
  };

  // ── Multi-Tab AI JSON Batch Execution (Creator / Translation / Reading) ───
  const handleStartAiBatch = async () => {
    if (isRunning || batchSubTab === 'studio') return;
    stopFlagRef.current = false;
    setBatchErrorNotice(null);
    const controller = new AbortController();
    batchAbortControllerRef.current = controller;
    setIsRunning(true);

    const queueSnapshot = aiBatchItems.filter((it) => it.subTab === batchSubTab);
    let completedCount = 0;
    const runErrors: string[] = [];

    for (let idx = 0; idx < queueSnapshot.length; idx++) {
      const item = queueSnapshot[idx];
      if (stopFlagRef.current || controller.signal.aborted) break;
      if (item.status === 'done') continue;

      try {
        const override = itemOverrides[item.id];

        if (item.payload.subTab === 'reading') {
          const payload = item.payload;
          const uiStrings = payload.uiStrings;
          const cleaned = cleanReadingWorksheetInput(payload.text, payload.title);
          const cleanTitle = cleaned.title || payload.title;
          const cleanBody = cleaned.bodyText || payload.text;
          const fileBase = buildLeveledOutputStem({
            title: cleanTitle,
            level: payload.level,
            learningLanguage: item.learningLanguage,
            fallback: 'Reading Along',
          });
          const voiceMeta =
            LEARNING_LANGUAGE_OPTIONS.find((l) => l.id === item.learningLanguage) ||
            LEARNING_LANGUAGE_OPTIONS[0];

          updateAiItem(item.id, {
            status: 'synthesizing',
            progress: 0.08,
            detail: `Đang tạo giọng đọc ${voiceMeta.nativeName}...`,
          });

          const bodyRes = await synthesizeAudioAndSyncCues({
            rawScript: cleanBody,
            title: cleanTitle,
            provider: 'auto',
            voice: voiceMeta.defaultVoice,
            lang: voiceMeta.voiceLang,
            rate: reelBatchRate,
            autoSplitLanguages: false,
            alignWithWhisper: true,
            suppressCompleteSound: true,
            onProgress: (pct, lbl) => {
              updateAiItem(item.id, {
                status: 'synthesizing',
                progress: 0.05 + (pct / 100) * 0.28,
                detail: lbl,
              });
            },
          });

          const partsToConcat: Array<{
            file: File;
            pauseAfterSec?: number;
            role: 'intro' | 'body' | 'outro';
          }> = [];
          const introSubText = readingBatchIntro
            ? uiStrings.introSubtitleTemplate(cleanTitle)
            : '';

          if (introSubText) {
            const introRes = await synthesizeAudioWithProgressJob({
              provider: 'auto',
              voice: voiceMeta.defaultVoice,
              lang: voiceMeta.voiceLang,
              autoSplitLanguages: false,
              rate: reelBatchRate,
              suppressCompleteSound: true,
              segments: [{ id: 'batch-reading-intro', text: introSubText, pauseAfterSec: 0, autoSplit: false }],
            });
            if (introRes.audioBase64) {
              partsToConcat.push({
                file: base64ToAudioFile(
                  introRes.audioBase64,
                  cleanDownloadFileName(`${fileBase} Intro`, 'mp3', 'Reading Intro'),
                  introRes.mimeType || 'audio/mpeg',
                ),
                pauseAfterSec: 0.45,
                role: 'intro',
              });
            }
          }

          partsToConcat.push({
            file: bodyRes.audioFile,
            pauseAfterSec: 0.35,
            role: 'body',
          });

          const outroSpeech = [uiStrings.outroLine1, uiStrings.outroLine2]
            .filter(Boolean)
            .join('. ');
          if (readingBatchOutroSpeech && reelBatchOutroSec > 0 && outroSpeech) {
            const outroRes = await synthesizeAudioWithProgressJob({
              provider: 'auto',
              voice: voiceMeta.defaultVoice,
              lang: voiceMeta.voiceLang,
              autoSplitLanguages: false,
              rate: reelBatchRate,
              suppressCompleteSound: true,
              segments: [{ id: 'batch-reading-outro', text: outroSpeech, pauseAfterSec: 0, autoSplit: false }],
            });
            if (outroRes.audioBase64) {
              partsToConcat.push({
                file: base64ToAudioFile(
                  outroRes.audioBase64,
                  cleanDownloadFileName(`${fileBase} Outro`, 'mp3', 'Reading Outro'),
                  outroRes.mimeType || 'audio/mpeg',
                ),
                pauseAfterSec: 0.45,
                role: 'outro',
              });
            }
          }
          playTtsCompleteSound();
          if (bodyRes.edgeFallbackToGoogle) {
            notifyEdgeFallbackToGoogle({
              id: `batch-reading-fallback-${item.id}`,
              sourceLabel: `Batch Reading (${cleanTitle})`,
              edgeErrors: bodyRes.edgeErrors,
            });
          }

          const combined = await concatAudioFilesWithGaps(
            partsToConcat.map((p) => ({ file: p.file, pauseAfterSec: p.pauseAfterSec })),
            cleanDownloadFileName(fileBase, 'wav', 'Reading Speech'),
          );

          const introIdx = partsToConcat.findIndex((p) => p.role === 'intro');
          const bodyIdx = partsToConcat.findIndex((p) => p.role === 'body');
          const outroIdx = partsToConcat.findIndex((p) => p.role === 'outro');

          const exactIntroEndSec = bodyIdx >= 0 ? combined.segmentOffsets[bodyIdx] : 0;
          const bodyDurSec =
            bodyIdx >= 0 ? combined.segmentDurations[bodyIdx] : bodyRes.durationSec;
          const bodyEndWithIntro = Number((exactIntroEndSec + bodyDurSec + 0.35).toFixed(3));
          const outroStartSec =
            outroIdx >= 0 ? combined.segmentOffsets[outroIdx] : undefined;
          const outroSpeechDur =
            outroIdx >= 0 ? combined.segmentDurations[outroIdx] + 0.55 : 0;
          const effectiveOutroSec =
            readingBatchOutroSpeech && outroIdx >= 0
              ? Math.max(reelBatchOutroSec, Number(outroSpeechDur.toFixed(1)))
              : reelBatchOutroSec;

          const bodyWords = bodyRes.cues.flatMap((c) => c.words);
          const shiftedWords = shiftReadingWordsForIntro(bodyWords, exactIntroEndSec);
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

          const localizedWm = {
            watermarkEnabled: Boolean(reelBatchOutroText.trim()),
            watermarkText: reelBatchOutroText.trim() || 'YOUR CHANNEL',
            watermarkCorner: 'bottom-right' as const,
            watermarkOpacity: 0.65,
            outroSeconds: effectiveOutroSec,
            outroLine1: uiStrings.outroLine1,
            outroLine2: uiStrings.outroLine2,
          };

          const metrics = computeReadingTimelineMetrics({
            words: shiftedWords,
            contentDuration: bodyEndWithIntro,
            introEnabled: introIdx >= 0,
            introSeconds: exactIntroEndSec,
            outroSeconds: localizedWm.outroSeconds,
            outroText: [localizedWm.outroLine1, localizedWm.outroLine2].filter(Boolean).join('\n'),
          });

          let finalAudioFile = combined.file;
          if (reelBatchBgm !== 'none' && reelBatchBgmVol > 0) {
            const mixed = await mixVoiceWithBgmPreset({
              voiceFile: combined.file,
              bgmPreset: reelBatchBgm,
              bgmVolume: reelBatchBgmVol,
              speechWindows,
              introEndSec: exactIntroEndSec,
              outroStartSec: outroStartSec ?? metrics.outroStart,
              minTotalDurationSec: metrics.effectiveTotalDuration,
              outputFileName: cleanDownloadFileName(fileBase, 'wav', 'Reading Along'),
            });
            if (mixed.file) finalAudioFile = mixed.file;
          }

          const effectiveBg: BackgroundImageConfig | undefined =
            batchBackgroundImage ??
            (readingBatchBgPreset
              ? { kind: 'preset', presetId: readingBatchBgPreset, fit: 'cover', scrimOpacity: 0.2 }
              : undefined);

          const dummyProj: LessonProject = {
            id: `batch-reading-${fileBase}`,
            title: cleanTitle,
            subtitle: payload.topicBadge,
            theme: 'pastel-sunrise',
            duration: metrics.effectiveTotalDuration,
            fps: activeSettings.fps === 60 ? 60 : 30,
            cues: [],
            elements: [],
            backgroundImage: effectiveBg,
          };

          const desc = buildVideoDescription({
            title: cleanTitle,
            nativeLang: 'vi',
            learningLang: item.learningLanguage,
            style: 'phrase-pack',
            durationSec: metrics.effectiveTotalDuration,
            topicHint: payload.topicBadge,
            sampleLines: [cleanBody],
          });

          updateAiItem(item.id, {
            status: 'rendering',
            progress: 0.4,
            detail: `Đang dựng Reading Along ${encoding.width}×${encoding.height}...`,
          });

          const customRenderFrame = (
            ctx: CanvasRenderingContext2D,
            time: number,
            width: number,
            height: number,
          ) => {
            renderReadingAlongFrame(ctx, {
              width,
              height,
              title: cleanTitle,
              topicBadge: payload.topicBadge,
              text: cleanBody,
              words: shiftedWords,
              currentTime: time,
              contentDuration: metrics.contentEnd,
              totalDuration: metrics.effectiveTotalDuration,
              introEnabled: introIdx >= 0,
              introSeconds: exactIntroEndSec,
              introTitle: uiStrings.introBadge,
              introSubtitle: introSubText || cleanTitle,
              paletteId: readingBatchPalette,
              illustrationStyle: '3D Cartoon',
              bookFrame: readingBatchFrame,
              pointerStyle: readingBatchPointer,
              background: effectiveBg,
              subtitlePosition: 'Giữa',
              subtitleSize: 'Lớn',
              learningLanguage: item.learningLanguage,
              watermarkOutro: localizedWm,
            });
          };

          const targetSubfolder = resolveTabOutputSubfolder('Batch', customSavePath);
          if (saveMode === 'disk') {
            const saved = await exportProjectToServerDisk(
              dummyProj,
              finalAudioFile,
              ({ progress, stageLabel }) => {
                updateAiItem(item.id, {
                  status: 'rendering',
                  progress: 0.4 + progress * 0.6,
                  detail: stageLabel,
                });
              },
              activeSettings,
              fileBase,
              targetSubfolder,
              {
                signal: controller.signal,
                directoryHandle: outputDirHandle,
                sourceTab: 'Batch Reading',
                companionText: desc.txtContent,
                customRenderFrame,
              },
            );
            const mb = (saved.byteLength / (1024 * 1024)).toFixed(2);
            updateAiItem(item.id, {
              status: 'done',
              progress: 1,
              detail: `Đã lưu (${mb} MB · ${item.learningLanguage.toUpperCase()})`,
              outputInfo: saved.savedPath,
            });
            emitOutputUpdated({ relativePath: saved.relativePath, sourceTab: 'Batch Reading' });
          } else {
            const exported = await exportProjectToVideo(
              dummyProj,
              finalAudioFile,
              ({ progress, stageLabel }) => {
                updateAiItem(item.id, {
                  status: 'rendering',
                  progress: 0.4 + progress * 0.6,
                  detail: stageLabel,
                });
              },
              activeSettings,
              {
                signal: controller.signal,
                customFileBase: fileBase,
                alsoSaveToServerOutput: true,
                savePath: targetSubfolder,
                sourceTab: 'Batch Reading',
                companionText: desc.txtContent,
                customRenderFrame,
              },
            );
            const mb = (exported.byteLength / (1024 * 1024)).toFixed(2);
            updateAiItem(item.id, {
              status: 'done',
              progress: 1,
              detail: `Đã tải ${exported.fileName} (${mb} MB)`,
              outputInfo: exported.savedPath,
            });
            if (exported.relativePath) {
              emitOutputUpdated({ relativePath: exported.relativePath, sourceTab: 'Batch Reading' });
            }
          }
          completedCount++;
          void refreshOutputFiles();
        } else {
          // AI Creator or Translation Challenge item
          const payload = item.payload;
          const fileBase = buildLeveledOutputStem({
            title: payload.title,
            level: payload.level,
            learningLanguage: item.learningLanguage,
            fallback: 'Batch Reels',
          });
          const {
            segments,
            cardMapping,
            extraOutroIdx,
            lessonVoice,
            lessonVoiceLang,
            explVoice,
            explLang,
          } = buildBatchTtsSegmentsForReelCards(payload.cards, {
            learningLanguage: item.learningLanguage,
            enableDualTts: reelBatchDualTts,
          });

          updateAiItem(item.id, {
            status: 'synthesizing',
            progress: 0.06,
            detail: `Đang tạo Audio Dual-TTS (${item.learningLanguage.toUpperCase()})...`,
          });

          const ttsData = await synthesizeAudioWithProgressJob(
            {
              provider: 'auto',
              voice: lessonVoice,
              lang: lessonVoiceLang,
              secondaryVoice: reelBatchDualTts ? explVoice : undefined,
              secondaryLang: reelBatchDualTts ? explLang : undefined,
              autoSplitLanguages: true,
              rate: reelBatchRate,
              segments,
            },
            (pct, lbl) => {
              updateAiItem(item.id, {
                status: 'synthesizing',
                progress: 0.06 + (pct / 100) * 0.28,
                detail: lbl,
              });
            },
          );

          if (!ttsData.audioBase64) {
            throw new Error(ttsData.error || 'Không tạo được audio TTS cho JSON này.');
          }
          if (ttsData.edgeFallbackToGoogle) {
            notifyEdgeFallbackToGoogle({
              id: `batch-reels-fallback-${item.id}`,
              sourceLabel: `Batch Reels (${payload.title})`,
              edgeErrors: ttsData.edgeErrors,
            });
          }

          const rawAudioFile = base64ToAudioFile(
            ttsData.audioBase64,
            cleanDownloadFileName(fileBase, 'mp3', 'Batch Reels'),
            ttsData.mimeType || 'audio/mpeg',
          );

          const segDurs = Array.isArray(ttsData.segmentDurations) ? ttsData.segmentDurations : [];
          const spokenDurs = Array.isArray(ttsData.spokenDurations) ? ttsData.spokenDurations : segDurs;
          const pauseDurs = Array.isArray(ttsData.pauseDurations) ? ttsData.pauseDurations : [];

          const mappedDurs =
            segDurs.length >= cardMapping.length
              ? mapBatchSynthesisDurations(
                  cardMapping,
                  segDurs,
                  spokenDurs,
                  pauseDurs,
                  extraOutroIdx,
                )
              : null;

          let proj = reelCardsToLessonProject(payload.cards, {
            title: payload.title,
            theme: override?.theme ?? reelBatchTheme,
            aspectRatio: activeSettings.aspectRatio || '9:16',
            targetLang: 'vi',
            backgroundImage: batchBackgroundImage,
            compositionId: override?.compositionId,
            cardDurationsSec: mappedDurs?.durations,
            cardTimings: mappedDurs?.timings,
            audioFileName: rawAudioFile.name,
            sceneJsonOverride: payload.sceneJsonOverride,
            watermark: {
              watermarkEnabled: Boolean(reelBatchOutroText.trim()),
              watermarkText: reelBatchOutroText.trim(),
              watermarkCorner: 'bottom-right',
              watermarkOpacity: 0.65,
              outroSeconds: reelBatchOutroSec,
              outroLine1: 'Thanks for watching!',
              outroLine2: 'See you next time',
            },
          });

          if (ttsData.hasWordBoundaries && Array.isArray(ttsData.cues) && ttsData.cues.length > 0) {
            const mergedCues = mapBatchWordBoundariesToProjectCues(
              proj.cues,
              cardMapping,
              ttsData.cues,
            );
            proj = resyncProjectTimingToCues(proj, mergedCues, { resyncVisuals: false });
          }

          let finalAudioFile = rawAudioFile;
          const countdownWindows = extractCountdownWindowsFromElements(proj.elements);
          const needBgm = reelBatchBgm !== 'none' && reelBatchBgmVol > 0;
          const needCountdown = reelBatchCountdownSfx && countdownWindows.length > 0;
          if (needBgm || needCountdown) {
            updateAiItem(item.id, {
              status: 'synthesizing',
              progress: 0.36,
              detail: needCountdown
                ? 'Đang hòa nhạc nền & hiệu ứng đếm ngược...'
                : 'Đang hòa nhạc nền...',
            });
            const mixed = await mixVoiceWithBgmPreset({
              voiceFile: rawAudioFile,
              bgmPreset: needBgm ? reelBatchBgm : 'none',
              bgmVolume: reelBatchBgmVol,
              speechWindows: mappedDurs?.speechWindows,
              countdownWindows,
              enableCountdownSfx: reelBatchCountdownSfx,
              outroStartSec: mappedDurs?.outroStartSec,
              minTotalDurationSec: proj.duration,
              outputFileName: cleanDownloadFileName(fileBase, 'wav', 'Batch Reels'),
            });
            if (mixed.file) finalAudioFile = mixed.file;
          }

          const desc = buildVideoDescription({
            title: payload.title,
            nativeLang: 'vi',
            learningLang: item.learningLanguage,
            project: proj,
            durationSec: proj.duration,
          });

          updateAiItem(item.id, {
            status: 'rendering',
            progress: 0.42,
            detail: `Đang dựng ${encoding.width}×${encoding.height} @ ${encoding.fps}fps...`,
          });

          const targetSubfolder = resolveTabOutputSubfolder('Batch', customSavePath);
          const sourceLabel =
            item.subTab === 'translation' ? 'Batch Translation' : 'Batch Creator';

          if (saveMode === 'disk') {
            const saved = await exportProjectToServerDisk(
              proj,
              finalAudioFile,
              ({ progress, stageLabel }) => {
                updateAiItem(item.id, {
                  status: 'rendering',
                  progress: 0.42 + progress * 0.58,
                  detail: stageLabel,
                });
              },
              activeSettings,
              fileBase,
              targetSubfolder,
              {
                signal: controller.signal,
                directoryHandle: outputDirHandle,
                sourceTab: sourceLabel,
                companionText: desc.txtContent,
              },
            );
            const mb = (saved.byteLength / (1024 * 1024)).toFixed(2);
            updateAiItem(item.id, {
              status: 'done',
              progress: 1,
              detail: `Đã lưu (${mb} MB · ${payload.cards.length} thẻ)`,
              outputInfo: saved.savedPath,
            });
            emitOutputUpdated({ relativePath: saved.relativePath, sourceTab: sourceLabel });
          } else {
            const exported = await exportProjectToVideo(
              proj,
              finalAudioFile,
              ({ progress, stageLabel }) => {
                updateAiItem(item.id, {
                  status: 'rendering',
                  progress: 0.42 + progress * 0.58,
                  detail: stageLabel,
                });
              },
              activeSettings,
              {
                signal: controller.signal,
                customFileBase: fileBase,
                alsoSaveToServerOutput: true,
                savePath: targetSubfolder,
                sourceTab: sourceLabel,
                companionText: desc.txtContent,
              },
            );
            const mb = (exported.byteLength / (1024 * 1024)).toFixed(2);
            updateAiItem(item.id, {
              status: 'done',
              progress: 1,
              detail: `Đã tải ${exported.fileName} (${mb} MB)`,
              outputInfo: exported.savedPath,
            });
            if (exported.relativePath) {
              emitOutputUpdated({ relativePath: exported.relativePath, sourceTab: sourceLabel });
            }
          }
          completedCount++;
          void refreshOutputFiles();
        }
      } catch (err) {
        if (err instanceof ExportAbortedError || controller.signal.aborted) {
          updateAiItem(item.id, {
            status: 'pending',
            progress: 0,
            detail: 'Đã hủy chạy batch',
          });
          break;
        }
        const msg = err instanceof Error ? err.message : 'Lỗi xử lý bài batch';
        runErrors.push(`${item.title}: ${msg}`);
        setBatchErrorNotice({
          title: `Có ${runErrors.length} bài gặp lỗi khi render (đang tiếp tục hoặc bạn có thể Hủy)`,
          errors: [...runErrors],
        });
        updateAiItem(item.id, {
          status: 'error',
          progress: 0,
          detail: msg,
        });
      }

      if (idx < queueSnapshot.length - 1 && !stopFlagRef.current && !controller.signal.aborted) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    batchAbortControllerRef.current = null;
    setIsRunning(false);
    if (!stopFlagRef.current && !controller.signal.aborted && completedCount > 0) {
      playExportCompleteSound();
    }
    void refreshOutputFiles();
  };

  const handleSavePastedJson = () => {
    if (!pasteJsonItem) return;
    const content = pasteJsonContent.trim();
    if (!content) {
      setPasteJsonError('Vui lòng dán nội dung JSON từ ChatGPT / Gemini.');
      return;
    }
    const parsed = parseScenePlanJson(content);
    if (!parsed || parsed.scenes.length === 0) {
      setPasteJsonError(
        'Đoạn JSON không hợp lệ hoặc thiếu cấu trúc "scenes" / "elements". Hãy copy toàn bộ từ AI.',
      );
      return;
    }

    updateItem(pasteJsonItem.id, {
      pastedJsonText: content,
      detail: `✓ Đã nạp JSON (${parsed.scenes.length} cảnh)`,
    });
    setPasteJsonItem(null);
    setPasteJsonContent('');
    setPasteJsonError(null);
  };

  const pendingCount =
    batchSubTab === 'studio'
      ? items.filter((i) => i.status === 'pending' || i.status === 'error').length
      : activeAiItems.filter((i) => i.status === 'pending' || i.status === 'error').length;
  const doneCount =
    batchSubTab === 'studio'
      ? items.filter((i) => i.status === 'done' || i.status === 'prompt-ready').length
      : activeAiItems.filter((i) => i.status === 'done').length;
  const promptReadyCount = items.filter((i) => i.status === 'prompt-ready').length;
  const hasJsonCount = items.filter((i) => i.jsonFile || i.pastedJsonText).length;
  const totalCount = batchSubTab === 'studio' ? items.length : activeAiItems.length;

  const compositionOptions: Array<{
    value: LayoutCompositionId | 'ai-decide' | 'random';
    label: string;
  }> = [
    { value: 'ai-decide', label: '✨ AI tự chọn tối ưu theo context' },
    { value: 'random', label: '🔀 Phối ngẫu nhiên' },
    ...LAYOUT_COMPOSITIONS.map((c) => ({ value: c.id as LayoutCompositionId, label: c.name })),
  ];

  const promptLevelOptions = getLevelsForLearningLanguage(promptGenLang);
  const currentTabPromptZipName = buildBatchPromptZipName(batchSubTab);
  const currentTabPromptSubfolder = getBatchPromptSubfolder(batchSubTab);

  const renderSettingsFirstPromptZipPanel = () => (
    <div
      className="p-3 rounded-xl bg-violet-50/70 border border-violet-200 space-y-2.5 text-xs"
      data-testid="settings-first-prompt-zip-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-bold text-violet-950">
            Cài đặt thông số trước → Tạo Prompt ZIP ({currentTabPromptZipName})
          </div>
          <div className="text-[10.5px] text-violet-700">
            Thư mục lưu trên máy/server: <code>output/{currentTabPromptSubfolder}</code> · Đưa Prompt cho AI Web rồi nén <code>.zip</code> (hoặc chọn nhiều <code>.json</code>) tải lại vào đây.
          </div>
        </div>
        <button
          type="button"
          disabled={isRunning}
          onClick={() => void handleOpenOutputFolder(currentTabPromptSubfolder)}
          data-testid="open-prompt-folder-btn"
          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-violet-800 bg-white border border-violet-300 rounded-lg hover:bg-violet-100 shrink-0"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span>Mở thư mục Prompt</span>
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
            Số lượng video (1–30)
          </label>
          <input
            type="number"
            min={1}
            max={30}
            value={batchPromptCount}
            onChange={(e) =>
              setBatchPromptCount(Math.max(1, Math.min(30, Math.round(Number(e.target.value) || 1))))
            }
            data-testid="batch-prompt-count-input"
            className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg tabular-nums"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
            Ngôn ngữ học
          </label>
          <select
            value={promptGenLang}
            onChange={(e) => {
              const lang = e.target.value as LearningLanguageId;
              setPromptGenLang(lang);
              const meta = LEARNING_LANGUAGE_OPTIONS.find((l) => l.id === lang);
              setPromptGenLevel(meta?.defaultLevel || 'B1');
            }}
            className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg"
          >
            {LEARNING_LANGUAGE_OPTIONS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
            Trình độ
          </label>
          <select
            value={promptGenLevel}
            onChange={(e) => setPromptGenLevel(e.target.value)}
            className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg"
          >
            {promptLevelOptions.map((lv) => (
              <option key={lv.id} value={lv.id}>
                {lv.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
            Ngôn ngữ giải thích
          </label>
          <select
            value={promptGenTargetLang}
            onChange={(e) => setPromptGenTargetLang(e.target.value)}
            className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg"
          >
            <option value="vi">Tiếng Việt</option>
            <option value="learning">Giải thích bằng ngôn ngữ muốn học</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
            <option value="zh">中文</option>
            <option value="ko">한국어</option>
            <option value="none">Chỉ ngôn ngữ gốc</option>
          </select>
        </div>
      </div>

      {/* Sub-tab specific + Duration Fixed vs Random */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
        <div className="sm:col-span-5">
          <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
            Chế độ thời lượng video (0.5 – 30 phút)
          </label>
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => setPromptDurationMode('fixed')}
              data-testid="prompt-duration-fixed-btn"
              className={`px-2 py-1 text-[11px] font-semibold rounded-lg border ${
                promptDurationMode === 'fixed'
                  ? 'bg-violet-600 border-violet-600 text-white'
                  : 'bg-white border-slate-200 text-slate-700'
              }`}
            >
              Cố định (VD: 5p)
            </button>
            <button
              type="button"
              onClick={() => setPromptDurationMode('random')}
              data-testid="prompt-duration-random-btn"
              className={`px-2 py-1 text-[11px] font-semibold rounded-lg border ${
                promptDurationMode === 'random'
                  ? 'bg-violet-600 border-violet-600 text-white'
                  : 'bg-white border-slate-200 text-slate-700'
              }`}
            >
              Ngẫu nhiên khoảng
            </button>
          </div>
        </div>

        {promptDurationMode === 'fixed' ? (
          <div className="sm:col-span-3">
            <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
              Thời lượng cố định (phút)
            </label>
            <select
              value={[0.5, 1, 2, 3, 5, 10, 15, 20, 25, 30].includes(promptGenMinutes) ? String(promptGenMinutes) : '5'}
              onChange={(e) => setPromptGenMinutes(Number(e.target.value))}
              data-testid="prompt-fixed-minutes-select"
              className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg font-medium"
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
        ) : (
          <>
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
                Từ (phút)
              </label>
              <input
                type="number"
                min={0.5}
                max={30}
                step={0.5}
                value={promptMinMinutes}
                onChange={(e) =>
                  setPromptMinMinutes(Math.max(0.5, Math.min(30, Number(e.target.value) || 0.5)))
                }
                data-testid="prompt-random-min-input"
                className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg tabular-nums"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
                Đến (phút)
              </label>
              <input
                type="number"
                min={0.5}
                max={30}
                step={0.5}
                value={promptMaxMinutes}
                onChange={(e) =>
                  setPromptMaxMinutes(Math.max(0.5, Math.min(30, Number(e.target.value) || 5)))
                }
                data-testid="prompt-random-max-input"
                className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg tabular-nums"
              />
            </div>
          </>
        )}

        {batchSubTab === 'creator' && (
          <div className="sm:col-span-4">
            <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
              Dạng bài (A–E)
            </label>
            <select
              value={promptGenCreatorFormat}
              onChange={(e) => setPromptGenCreatorFormat(e.target.value as CreatorFormatCategory)}
              className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg"
            >
              {CREATOR_FORMAT_OPTIONS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {batchSubTab === 'translation' && (
          <>
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
                Giây suy nghĩ
              </label>
              <input
                type="number"
                min={2}
                max={12}
                value={promptGenThinkSec}
                onChange={(e) =>
                  setPromptGenThinkSec(Math.max(2, Math.min(12, Number(e.target.value) || 4)))
                }
                className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg tabular-nums"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
                Số lần đọc lặp
              </label>
              <input
                type="number"
                min={1}
                max={4}
                value={promptGenRepeatCount}
                onChange={(e) =>
                  setPromptGenRepeatCount(Math.max(1, Math.min(4, Number(e.target.value) || 2)))
                }
                className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg tabular-nums"
              />
            </div>
          </>
        )}

        {batchSubTab === 'reading' && (
          <div className="sm:col-span-4">
            <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
              Thể loại bài đọc
            </label>
            <select
              value={promptGenReadingFormat}
              onChange={(e) => setPromptGenReadingFormat(e.target.value as ReadingFormatCategory)}
              className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg"
            >
              {READING_FORMAT_OPTIONS.map((fmt) => (
                <option key={fmt.id} value={fmt.id}>
                  {fmt.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <textarea
        rows={2}
        value={topicLinesInput}
        onChange={(e) => setTopicLinesInput(e.target.value)}
        placeholder={'(Tuỳ chọn) Nhập chủ đề mỗi dòng 1 bài, hoặc bỏ trống để tự chọn đủ số lượng video đã đặt ở trên...'}
        className="w-full p-2 text-xs bg-white border border-violet-200 rounded-lg"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        {savedPromptZipInfo && (
          <div className="text-[11px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1 flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>
              Đã lưu <strong>{savedPromptZipInfo.count}</strong> prompt → <code>{savedPromptZipInfo.savedPath}</code>
            </span>
          </div>
        )}
        <button
          type="button"
          disabled={isRunning}
          onClick={() => void handleExportTopicsPromptZip()}
          data-testid="generate-topics-prompt-zip-btn"
          className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50"
        >
          <Archive className="w-3.5 h-3.5" />
          <span>Tạo &amp; Lưu Prompt ZIP ({currentTabPromptZipName})</span>
        </button>
      </div>
      {openFolderMsg && (
        <div
          data-testid="prompt-folder-status-msg"
          className="px-2.5 py-1.5 rounded-lg bg-white border border-violet-200 text-[11px] text-slate-700 flex items-center justify-between gap-2"
        >
          <span>{openFolderMsg}</span>
          <button
            type="button"
            onClick={() => setOpenFolderMsg(null)}
            className="text-slate-400 hover:text-slate-700"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px] p-4"
    >
      <div
        className={`bg-white border border-slate-200 rounded-2xl shadow-xl w-full ${
          previewState ? 'max-w-6xl' : 'max-w-5xl'
        } max-h-[92vh] flex flex-col overflow-hidden relative transition-all`}
      >
        {/* Header */}
        <div className="px-6 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 id="batch-modal-title" className="text-base font-bold text-slate-900">
                Hàng đợi Batch Đa Tab — Tự động hóa hàng loạt (Không cần API Key)
              </h2>
              <p className="text-xs text-slate-500">
                Chọn thông số trước để tạo Prompt ZIP riêng cho từng tab, đưa qua AI Web rồi tải lại tệp <code>.zip</code> hoặc nhiều <code>.json</code> để tự động dựng MP4.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isRunning}
            onClick={onClose}
            aria-label="Đóng hàng đợi Batch"
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Multi-Tab Workflow Switcher */}
        <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 grid grid-cols-2 lg:grid-cols-4 gap-1.5">
          {BATCH_SUBTAB_META.map((tab) => {
            const count =
              tab.id === 'studio'
                ? items.length
                : aiBatchItems.filter((i) => i.subTab === tab.id).length;
            const active = batchSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                disabled={isRunning}
                onClick={() => {
                  setBatchSubTab(tab.id);
                  setMultiJsonParseMsg(null);
                  setSavedPromptZipInfo(null);
                }}
                data-testid={`batch-subtab-${tab.id}`}
                className={`px-3 py-2 rounded-xl border text-left transition-all ${
                  active
                    ? 'bg-white border-indigo-400 text-indigo-950 shadow-xs'
                    : 'bg-slate-50/80 border-transparent text-slate-600 hover:bg-white hover:border-slate-200'
                } disabled:opacity-50`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold truncate">{tab.label}</span>
                  {count > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-indigo-100 text-indigo-700 tabular-nums">
                      {count}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 truncate mt-0.5">{tab.shortDesc}</div>
              </button>
            );
          })}
        </div>

        {/* Main Body: Queue Column + Optional Live BatchPreviewPane */}
        <div
          className={`flex-1 min-h-0 ${
            previewState ? 'grid grid-cols-1 lg:grid-cols-12' : 'flex flex-col'
          } overflow-hidden`}
        >
          <div className={`${previewState ? 'lg:col-span-7' : ''} flex flex-col min-h-0 overflow-hidden`}>
            {/* Config Bar */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3 overflow-y-auto max-h-[54vh]">
              {batchSubTab === 'studio' ? (
                <>
                  {/* ── Studio Mode selector ── */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isRunning}
                      onClick={() => setBatchMode('render')}
                      className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left transition-all ${
                        batchMode === 'render'
                          ? 'bg-indigo-50 border-indigo-400 text-indigo-900 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      } disabled:opacity-50`}
                    >
                      <div
                        className={`p-1.5 rounded-lg ${
                          batchMode === 'render' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <Play className="w-4 h-4 fill-current" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold">1. Render MP4 tự động</div>
                        <div className="text-[11px] text-slate-500 truncate">Dựng video + lưu ngay từng file</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={isRunning}
                      onClick={() => setBatchMode('prompt-zip')}
                      className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left transition-all ${
                        batchMode === 'prompt-zip'
                          ? 'bg-violet-50 border-violet-400 text-violet-900 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      } disabled:opacity-50`}
                    >
                      <div
                        className={`p-1.5 rounded-lg ${
                          batchMode === 'prompt-zip' ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold">2. Xuất Prompt ZIP (Cho AI Web)</div>
                        <div className="text-[11px] text-slate-500 truncate">Tạo prompt riêng/video → dán Web AI</div>
                      </div>
                    </button>
                  </div>

                  {/* ── Template & Unified Scene Choreography Picker ── */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Phong cách Prompt &amp; Dàn cảnh
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { id: 'tiktok-cards', label: 'Dàn cảnh tự động (@168)' },
                          { id: '3d-shapes', label: 'Ưu tiên Khối 3D' },
                          { id: 'word-reveal-dark', label: 'Ưu tiên Word Reveal (@xun52000)' },
                        ] as Array<{ id: PromptVideoStyle; label: string }>
                      ).map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          disabled={isRunning}
                          onClick={() => {
                            setVideoStyle(s.id);
                            if (s.id === '3d-shapes') setCompositionId('3d-shapes');
                            else if (s.id === 'word-reveal-dark') setCompositionId('word-reveal');
                          }}
                          className={`px-3 py-1.5 text-[11px] font-medium rounded-lg border transition-colors disabled:opacity-50 ${
                            videoStyle === s.id
                              ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── Unified Composition Picker ── */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Cách phối minh họa (cho bài chưa có JSON):
                    </label>
                    <div className="flex items-center gap-2">
                      <select
                        disabled={isRunning}
                        value={compositionId}
                        onChange={(e) => setCompositionId(e.target.value as typeof compositionId)}
                        className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                      >
                        {compositionOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={isRunning}
                        onClick={() => setCompositionId('random')}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-50 whitespace-nowrap"
                      >
                        <Shuffle className="w-3 h-3" />
                        Ngẫu nhiên
                      </button>
                    </div>
                    {compositionId === 'random' && (
                      <label className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-slate-700 font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          disabled={isRunning}
                          checked={contextLockedRandom}
                          onChange={(e) => setContextLockedRandom(e.target.checked)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>Ép hình minh họa đúng ngữ cảnh khi Random tự do bố cục</span>
                      </label>
                    )}
                  </div>
                </>
              ) : (
                /* ── AI Multi-JSON Sub-Tabs Config (Creator / Translation / Reading) ── */
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-white border border-indigo-200 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-indigo-950">
                        {batchSubTab === 'creator'
                          ? 'Hàng đợi AI Tạo Từ & Câu — Upload nhiều JSON từ Web AI'
                          : batchSubTab === 'translation'
                            ? 'Hàng đợi Phản Xạ Dịch Câu — Upload nhiều JSON (Hỏi → Đếm ngược → Đọc lặp)'
                            : 'Hàng đợi Video Đọc Theo Chữ — Upload nhiều JSON (Sách + Con trỏ chỉ chữ)'}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isRunning}
                          onClick={() => setIsTopicPromptOpen((v) => !v)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100"
                        >
                          <Archive className="w-3 h-3" />
                          <span>{isTopicPromptOpen ? 'Ẩn tạo Prompt ZIP' : 'Xuất Prompt ZIP từ DS Chủ đề'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={isRunning}
                          onClick={() => setIsPasteMultiOpen((v) => !v)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100"
                        >
                          <Clipboard className="w-3 h-3" />
                          <span>Dán nhiều JSON</span>
                        </button>
                      </div>
                    </div>

                    {isTopicPromptOpen && renderSettingsFirstPromptZipPanel()}

                    {isPasteMultiOpen && (
                      <div className="p-2.5 rounded-lg bg-indigo-50/70 border border-indigo-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-indigo-950">
                            Dán 1 hoặc nhiều khối JSON kết quả từ ChatGPT / Claude / Gemini Web:
                          </span>
                          <PasteButton
                            size="sm"
                            onPaste={(txt) => setPasteMultiRaw(txt)}
                            title="Dán nhanh từ Clipboard"
                          />
                        </div>
                        <textarea
                          rows={4}
                          value={pasteMultiRaw}
                          onChange={(e) => setPasteMultiRaw(e.target.value)}
                          placeholder="Dán 1 JSON hoặc nhiều JSON nối tiếp nhau (hoặc mảng JSON)..."
                          className="w-full p-2 text-[11px] font-mono bg-white border border-indigo-200 rounded-lg"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setIsPasteMultiOpen(false)}
                            className="px-2.5 py-1 text-[11px] bg-white border border-slate-200 rounded-lg"
                          >
                            Đóng
                          </button>
                          <button
                            type="button"
                            onClick={handleApplyPasteMultiJson}
                            className="px-3 py-1 text-[11px] font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                          >
                            Nạp vào hàng đợi
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Shared Render Style Controls */}
                    {batchSubTab === 'reading' ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                            Màu sách
                          </label>
                          <select
                            disabled={isRunning}
                            value={readingBatchPalette}
                            onChange={(e) =>
                              setReadingBatchPalette(e.target.value as ReadingBookPalette['id'])
                            }
                            className="w-full px-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded-lg"
                          >
                            {READING_BOOK_PALETTES.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.id}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                            Khung sách / Bố cục
                          </label>
                          <select
                            disabled={isRunning}
                            value={readingBatchFrame}
                            onChange={(e) =>
                              setReadingBatchFrame(e.target.value as ReadingBookFrameId)
                            }
                            className="w-full px-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded-lg"
                          >
                            {READING_BOOK_FRAMES.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                            Con trỏ chỉ chữ
                          </label>
                          <select
                            disabled={isRunning}
                            value={readingBatchPointer}
                            onChange={(e) =>
                              setReadingBatchPointer(e.target.value as ReadingPointerStyleId)
                            }
                            className="w-full px-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded-lg"
                          >
                            {READING_POINTER_STYLES.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                            Cảnh nền có sẵn
                          </label>
                          <select
                            disabled={isRunning}
                            value={readingBatchBgPreset}
                            onChange={(e) =>
                              setReadingBatchBgPreset(e.target.value as BackgroundPresetId | '')
                            }
                            className="w-full px-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded-lg"
                          >
                            <option value="">Theo màu sách mặc định</option>
                            {BACKGROUND_PRESETS.map((bg) => (
                              <option key={bg.id} value={bg.id}>
                                {bg.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-end gap-3 col-span-2">
                          <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={readingBatchIntro}
                              onChange={(e) => setReadingBatchIntro(e.target.checked)}
                              className="rounded border-slate-300 text-indigo-600"
                            />
                            <span>Bật Intro (theo ngôn ngữ bài)</span>
                          </label>
                          <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={readingBatchOutroSpeech}
                              onChange={(e) => setReadingBatchOutroSpeech(e.target.checked)}
                              className="rounded border-slate-300 text-indigo-600"
                            />
                            <span>Đọc Outro (theo ngôn ngữ bài)</span>
                          </label>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                            Màu Canvas
                          </label>
                          <select
                            disabled={isRunning}
                            value={reelBatchTheme}
                            onChange={(e) => setReelBatchTheme(e.target.value as CanvasThemeId)}
                            className="w-full px-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded-lg"
                          >
                            <option value="ocean-indigo">Ocean Indigo (Tối)</option>
                            <option value="obsidian-cyan">Obsidian Cyan (Tối)</option>
                            <option value="pastel-sunrise">Pastel Sunrise (Sáng)</option>
                            <option value="mint-breeze">Mint Breeze (Sáng)</option>
                            <option value="sunset-peach">Sunset Peach (Sáng)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                            Tốc độ giọng
                          </label>
                          <select
                            disabled={isRunning}
                            value={reelBatchRate}
                            onChange={(e) => setReelBatchRate(Number(e.target.value))}
                            className="w-full px-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded-lg"
                          >
                            <option value={0.85}>0.85x (Chậm)</option>
                            <option value={0.95}>0.95x</option>
                            <option value={1.0}>1.0x (Chuẩn)</option>
                            <option value={1.1}>1.1x</option>
                            <option value={1.2}>1.2x (Nhanh)</option>
                          </select>
                        </div>
                        <div className="col-span-2 flex flex-wrap items-center gap-3 pt-3">
                          <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={reelBatchDualTts}
                              onChange={(e) => setReelBatchDualTts(e.target.checked)}
                              className="rounded border-slate-300 text-indigo-600"
                            />
                            <span>Dual-TTS (Bản xứ + Việt)</span>
                          </label>
                          {batchSubTab === 'translation' && (
                            <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={reelBatchCountdownSfx}
                                onChange={(e) => setReelBatchCountdownSfx(e.target.checked)}
                                className="rounded border-slate-300 text-indigo-600"
                              />
                              <span>Âm thanh đếm ngược</span>
                            </label>
                          )}
                        </div>
                      </div>
                    )}

                    {/* BGM + Watermark Row for AI Batch */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-slate-100">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                          Nhạc nền nhẹ (BGM)
                        </label>
                        <select
                          disabled={isRunning}
                          value={reelBatchBgm}
                          onChange={(e) => setReelBatchBgm(e.target.value as StudioBgmPresetId)}
                          className="w-full px-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded-lg"
                        >
                          {STUDIO_BGM_PRESETS.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                          Âm lượng BGM ({Math.round(reelBatchBgmVol * 100)}%)
                        </label>
                        <input
                          type="range"
                          min={0}
                          max={0.4}
                          step={0.01}
                          value={reelBatchBgmVol}
                          disabled={reelBatchBgm === 'none' || isRunning}
                          onChange={(e) => setReelBatchBgmVol(Number(e.target.value))}
                          className="w-full accent-indigo-600 mt-1.5"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                          Watermark góc màn hình
                        </label>
                        <input
                          type="text"
                          value={reelBatchOutroText}
                          onChange={(e) => setReelBatchOutroText(e.target.value)}
                          placeholder="YOUR CHANNEL"
                          className="w-full px-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Batch Background Image Upload (Auto-Resize 9:16) ── */}
              <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <input
                  ref={bgImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handleUploadBatchBackground(e)}
                />
                <button
                  type="button"
                  disabled={isRunning || isProcessingBg}
                  onClick={() => bgImageInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                  <span>
                    {isProcessingBg
                      ? 'Đang resize 9:16...'
                      : batchBackgroundImage
                        ? `Ảnh nền Batch: ${batchBackgroundImage.fileName}`
                        : 'Upload ảnh nền chung cho Batch (Tự resize)'}
                  </span>
                </button>

                {batchBackgroundImage && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const nextBg: BackgroundImageConfig = {
                          ...batchBackgroundImage,
                          fit: (batchBackgroundImage.fit === 'contain' ? 'cover' : 'contain') as BackgroundFitMode,
                        };
                        setBatchBackgroundImage(nextBg);
                        if (previewState) {
                          setPreviewState({
                            itemId: previewState.itemId,
                            project: { ...previewState.project, backgroundImage: nextBg },
                          });
                        }
                      }}
                      className="px-2 py-1 text-[10px] font-semibold bg-slate-50 border border-slate-200 rounded text-slate-700"
                    >
                      {batchBackgroundImage.fit === 'contain' ? 'Vừa khung' : 'Phủ đầy'}
                    </button>
                    <input
                      type="range"
                      aria-label="Độ tối lớp phủ ảnh nền Batch"
                      min={0}
                      max={0.7}
                      step={0.05}
                      value={batchBackgroundImage.scrimOpacity ?? 0.22}
                      onChange={(e) => {
                        const nextBg: BackgroundImageConfig = {
                          ...batchBackgroundImage,
                          scrimOpacity: Number(e.target.value),
                        };
                        setBatchBackgroundImage(nextBg);
                        if (previewState) {
                          setPreviewState({
                            itemId: previewState.itemId,
                            project: { ...previewState.project, backgroundImage: nextBg },
                          });
                        }
                      }}
                      className="w-16 accent-indigo-600 h-1"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setBatchBackgroundImage(undefined);
                        setBgUploadError(null);
                        if (previewState) {
                          setPreviewState({
                            itemId: previewState.itemId,
                            project: { ...previewState.project, backgroundImage: undefined },
                          });
                        }
                      }}
                      aria-label="Xóa ảnh nền Batch"
                      className="p-1 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                {bgUploadError && (
                  <p className="text-[11px] font-medium text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
                    {bgUploadError}
                  </p>
                )}
              </div>

              {/* ── Prompt-ZIP Settings & Destination Folder (Studio prompt-zip mode) ── */}
              {batchSubTab === 'studio' && batchMode === 'prompt-zip' && (
                <div className="space-y-2.5">
                  {renderSettingsFirstPromptZipPanel()}
                  <div className="p-2.5 bg-violet-50/50 border border-violet-200 rounded-xl flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] text-violet-800">
                      {outputDirName ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Thư mục cục bộ đã chọn: {outputDirName}
                        </span>
                      ) : (
                        <span>
                          Tuỳ chọn: chọn thêm thư mục máy để lưu bản sao (hệ thống mặc định lưu vào{' '}
                          <code>output/{currentTabPromptSubfolder}</code>).
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={isRunning}
                      onClick={handlePickDirectory}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-violet-700 bg-white border border-violet-300 rounded-lg hover:bg-violet-100 disabled:opacity-50 transition-colors shadow-xs"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>{outputDirName ? 'Đổi thư mục lưu' : 'Chọn thư mục lưu trên máy'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ── Render MP4: Save Location & Encoding Settings ── */}
              {(batchSubTab !== 'studio' || batchMode === 'render') && (
                <div className="pt-2 border-t border-slate-200/80 space-y-2.5">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                    <div className="md:col-span-6">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Nơi lưu file MP4 đầu ra (Lưu ngay từng video khi xong)
                      </label>
                      <div className="flex gap-1.5">
                        <select
                          disabled={isRunning}
                          value={saveMode}
                          onChange={(e) => setSaveMode(e.target.value as 'disk' | 'download')}
                          className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                        >
                          <option value="download">Tải ngay từng video qua trình duyệt</option>
                          <option value="disk">Lưu vào thư mục output/ của project</option>
                        </select>
                        {saveMode === 'disk' && (
                          <button
                            type="button"
                            disabled={isRunning}
                            onClick={handlePickDirectory}
                            className="px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-50 whitespace-nowrap"
                          >
                            Chọn thư mục
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="md:col-span-6">
                      {saveMode === 'disk' && (
                        <div className="flex items-center gap-2">
                          <FolderSearch className="w-4 h-4 text-slate-500 shrink-0" />
                          <input
                            ref={customSaveInputRef}
                            type="text"
                            disabled={isRunning}
                            value={customSavePath}
                            onChange={(e) => setCustomSavePath(e.target.value)}
                            placeholder="Thư mục con trong output/ (mặc định: Batch)"
                            className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 font-mono"
                          />
                        </div>
                      )}
                      {outputDirName && (
                        <span className="text-[11px] text-emerald-700 font-medium block mt-1">
                          ✓ Đã chọn thư mục: {outputDirName}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Output status summary bar */}
                  <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <div className="min-w-0">
                      <div className="font-semibold text-emerald-900">
                        Thư mục Output: đã lưu <strong>{outputFilesState.files.length}</strong> file
                        {outputDirName ? ` · Máy cục bộ: ${outputDirName}` : ''}
                      </div>
                      <div className="text-[10px] text-emerald-700 font-mono truncate">
                        Đường dẫn: {outputFilesState.outputDir}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          void refreshOutputFiles();
                          setShowOutputList((v) => !v);
                        }}
                        className="px-2.5 py-1 text-[10px] font-semibold bg-white border border-emerald-300 text-emerald-800 rounded-md hover:bg-emerald-100"
                      >
                        {showOutputList ? 'Ẩn danh sách' : `Xem file (${outputFilesState.files.length})`}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleOpenOutputFolder()}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
                      >
                        <FolderOpen className="w-3 h-3" />
                        <span>Mở thư mục Output</span>
                      </button>
                    </div>
                  </div>

                  {openFolderMsg && (
                    <div className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-[11px] text-slate-700 flex items-center justify-between gap-2">
                      <span>{openFolderMsg}</span>
                      <button
                        type="button"
                        onClick={() => setOpenFolderMsg(null)}
                        className="text-slate-400 hover:text-slate-700"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {showOutputList && (
                    <div className="max-h-32 overflow-y-auto bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
                      {outputFilesState.files.length === 0 ? (
                        <div className="p-2.5 text-[11px] text-slate-500 text-center">
                          Chưa có file video nào trong thư mục output trên server.
                        </div>
                      ) : (
                        outputFilesState.files.map((f) => (
                          <div
                            key={f.relativePath}
                            className="px-3 py-1.5 flex items-center justify-between gap-2 text-[11px]"
                          >
                            <span className="font-mono text-slate-800 truncate">{f.relativePath}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-slate-400 tabular-nums">
                                {(f.bytes / (1024 * 1024)).toFixed(2)} MB
                              </span>
                              <button
                                type="button"
                                onClick={() => void downloadServerOutputFile(f.relativePath, f.name)}
                                className="text-indigo-600 hover:text-indigo-800 font-semibold"
                              >
                                Tải
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await fetch(
                                    `/api/output/file?path=${encodeURIComponent(f.relativePath)}`,
                                    { method: 'DELETE' },
                                  );
                                  void refreshOutputFiles();
                                }}
                                className="text-rose-500 hover:text-rose-700"
                                title="Xóa file"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Aspect Ratio, Quality & Resolution */}
                  <div className="grid grid-cols-2 sm:grid-cols-12 gap-2.5 items-end pt-1">
                    <div className="sm:col-span-3">
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Khung hình
                      </label>
                      <select
                        disabled={isRunning}
                        value={activeSettings.aspectRatio || '9:16'}
                        onChange={(e) =>
                          updateSettings({
                            ...activeSettings,
                            aspectRatio: e.target.value as Mp4ExportSettings['aspectRatio'],
                          })
                        }
                        className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                      >
                        {ASPECT_RATIO_OPTIONS.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.id}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Độ phân giải
                      </label>
                      <select
                        disabled={isRunning}
                        value={activeSettings.resolution}
                        onChange={(e) =>
                          updateSettings({
                            ...activeSettings,
                            resolution: e.target.value as Mp4ExportSettings['resolution'],
                          })
                        }
                        className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                      >
                        {RESOLUTION_OPTIONS.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Chất lượng
                      </label>
                      <select
                        disabled={isRunning}
                        value={activeSettings.quality}
                        onChange={(e) =>
                          updateSettings({
                            ...activeSettings,
                            quality: e.target.value as Mp4ExportSettings['quality'],
                          })
                        }
                        className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                      >
                        {QUALITY_OPTIONS.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        FPS
                      </label>
                      <select
                        disabled={isRunning}
                        value={activeSettings.fps}
                        onChange={(e) =>
                          updateSettings({
                            ...activeSettings,
                            fps: Number(e.target.value) as Mp4ExportSettings['fps'],
                          })
                        }
                        className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                      >
                        {FPS_OPTIONS.map((fpsVal) => (
                          <option key={fpsVal} value={fpsVal}>
                            {fpsVal} fps
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2 flex justify-end">
                      <button
                        type="button"
                        disabled={isRunning}
                        onClick={() => updateSettings(DEFAULT_MP4_EXPORT_SETTINGS)}
                        className="w-full px-2 py-1.5 text-[11px] font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50"
                      >
                        Mặc định nhẹ
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Bar for Adding Files (.json / .zip supported) */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
                {batchSubTab === 'studio' ? (
                  <>
                    <div className="flex items-center gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".mp3,.wav,.m4a,.aac,.ogg,.flac,.webm,.srt,.vtt,.txt,.json,.zip"
                        className="hidden"
                        onChange={(e) => {
                          void handleFilesSelected(e.target.files);
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        disabled={isRunning}
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-50 transition-colors shadow-xs"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>Thêm Audio + Sub / ZIP</span>
                      </button>

                      <input
                        ref={jsonOnlyInputRef}
                        type="file"
                        multiple
                        accept=".json,.zip"
                        className="hidden"
                        onChange={(e) => {
                          void handleJsonFilesSelected(e.target.files);
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        disabled={isRunning}
                        onClick={() => jsonOnlyInputRef.current?.click()}
                        data-testid="studio-upload-json-zip-btn"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors shadow-xs"
                        title="Nạp các file .json hoặc file .zip chứa các file .json từ AI Web"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Nạp .json / .zip</span>
                      </button>
                    </div>

                    <span className="text-[11px] text-slate-500">
                      Đã nạp: <strong>{items.length}</strong> bài ({hasJsonCount} có JSON)
                    </span>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <input
                        ref={aiJsonMultiInputRef}
                        type="file"
                        multiple
                        accept=".json,.txt,.zip"
                        className="hidden"
                        onChange={(e) => void handleUploadAiJsonFiles(e)}
                      />
                      <button
                        type="button"
                        disabled={isRunning}
                        onClick={() => aiJsonMultiInputRef.current?.click()}
                        data-testid="batch-upload-multi-json-btn"
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-xs"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload nhiều .json hoặc .zip</span>
                      </button>
                      <button
                        type="button"
                        disabled={isRunning}
                        onClick={() => setIsPasteMultiOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-50"
                      >
                        <Clipboard className="w-3.5 h-3.5" />
                        <span>Dán nhanh JSON</span>
                      </button>
                    </div>

                    <span className="text-[11px] text-slate-600">
                      Hàng đợi tab này: <strong>{activeAiItems.length}</strong> bài
                    </span>
                  </>
                )}
              </div>

              {multiJsonParseMsg && (
                <p className="text-[11px] font-medium text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1.5">
                  {multiJsonParseMsg}
                </p>
              )}
            </div>

            {/* ── Guidance Banner When Prompts Are Ready (Studio) ── */}
            {batchSubTab === 'studio' && promptReadyCount > 0 && batchMode === 'prompt-zip' && (
              <div className="px-5 py-2.5 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="text-xs text-emerald-900">
                    <strong>Đã xuất xong prompt ({promptReadyCount} bài)!</strong> Lấy JSON từ AI Web dán vào từng bài rồi bấm nút bên cạnh:
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isRunning}
                  onClick={() => {
                    setBatchMode('render');
                    handleStartBatchClick();
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition-colors whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Tiến hành Render Video ({items.length} bài)</span>
                </button>
              </div>
            )}

            {/* Queue List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-[200px]">
              {batchErrorNotice && (
                <div
                  data-testid="batch-error-notice"
                  className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-xs text-rose-900 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{batchErrorNotice.title}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isRunning && (
                        <button
                          type="button"
                          onClick={handleCancelBatchImmediately}
                          className="px-2.5 py-1 text-[11px] font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-700"
                        >
                          Hủy chạy
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setBatchErrorNotice(null)}
                        className="text-rose-500 hover:text-rose-800"
                        aria-label="Đóng thông báo lỗi batch"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-rose-800 max-h-24 overflow-y-auto">
                    {batchErrorNotice.errors.map((errLine, errIdx) => (
                      <li key={errIdx}>{errLine}</li>
                    ))}
                  </ul>
                </div>
              )}

              {previewError && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between gap-2">
                  <span>{previewError}</span>
                  <button
                    type="button"
                    onClick={() => setPreviewError(null)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {batchSubTab === 'studio' ? (
                items.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-8 px-4 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                    <Layers className="w-8 h-8 text-slate-400 mb-2" />
                    <p className="text-sm font-semibold text-slate-800">Chưa có bài nào trong hàng đợi Từ vựng</p>
                    <p className="text-xs text-slate-500 max-w-md mt-1 leading-relaxed">
                      Bấm <strong>"Thêm Audio + Sub"</strong> và chọn cùng lúc hàng loạt file{' '}
                      <code>.mp3</code> và <code>.srt</code> (cùng tên gốc), hoặc chuyển sang tab{' '}
                      <strong>2 / 3 / 4</strong> phía trên để upload hàng loạt file JSON từ Web AI.
                    </p>
                  </div>
                ) : (
                  items.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 hover:border-slate-300 transition-colors shadow-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {item.baseName}
                          </span>
                          <span
                            className={`px-2 py-0.5 text-[10px] font-semibold rounded-md ${
                              item.audioFile
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {item.audioFile ? `🎵 ${item.audioFile.name}` : 'Không có Audio'}
                          </span>
                          <span
                            className={`px-2 py-0.5 text-[10px] font-semibold rounded-md ${
                              item.srtFile || item.jsonFile?.name.endsWith('.project.json')
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-red-50 text-red-700 border border-red-200'
                            }`}
                          >
                            {item.srtFile ? `📄 ${item.srtFile.name}` : 'Thiếu .srt'}
                          </span>
                          {item.pastedJsonText ? (
                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                              <Check className="w-2.5 h-2.5" />
                              <span>Đã dán JSON</span>
                            </span>
                          ) : item.jsonFile ? (
                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                              {item.jsonFile.name}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                              Chưa có .json
                            </span>
                          )}
                        </div>

                        <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                          {item.status === 'done' && (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              <span>{item.detail}</span>
                            </span>
                          )}
                          {item.status === 'prompt-ready' && (
                            <span className="inline-flex items-center gap-1 text-violet-700 font-medium">
                              <FileText className="w-3.5 h-3.5 shrink-0" />
                              <span>{item.detail}</span>
                            </span>
                          )}
                          {item.status === 'error' && (
                            <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>{item.detail}</span>
                            </span>
                          )}
                          {(item.status === 'generating-json' || item.status === 'rendering') && (
                            <span className="inline-flex items-center gap-1.5 text-indigo-700 font-medium">
                              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                              <span>
                                {item.detail} ({Math.round(item.progress * 100)}%)
                              </span>
                            </span>
                          )}
                          {item.status === 'pending' && (
                            <span className="text-slate-500">{item.detail}</span>
                          )}
                        </div>

                        {(item.status === 'rendering' || item.status === 'generating-json') && (
                          <div className="mt-1.5 w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 transition-all duration-200 rounded-full"
                              style={{ width: `${Math.round(item.progress * 100)}%` }}
                            />
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={isRunning || (!item.srtFile && !item.jsonFile)}
                          onClick={() => void handleOpenPreview(item)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                            previewState?.itemId === item.id
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                          } disabled:opacity-40`}
                        >
                          {isLoadingPreviewId === item.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Eye className="w-3 h-3" />
                          )}
                          <span>Xem trước</span>
                        </button>

                        <button
                          type="button"
                          disabled={isRunning}
                          onClick={() => {
                            setPasteJsonItem(item);
                            setPasteJsonContent(item.pastedJsonText || '');
                            setPasteJsonError(null);
                          }}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                            item.pastedJsonText || item.jsonFile
                              ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                              : 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                          }`}
                        >
                          <Clipboard className="w-3 h-3" />
                          <span>{item.pastedJsonText || item.jsonFile ? 'Sửa JSON' : 'Dán JSON'}</span>
                        </button>

                        {item.status === 'prompt-ready' && item.promptText && (
                          <button
                            type="button"
                            onClick={() => downloadText(item.promptText!, `${item.baseName}.prompt.txt`)}
                            title="Tải lại file prompt .txt"
                            className="p-1.5 text-violet-600 hover:text-violet-800 rounded-lg hover:bg-violet-50"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        )}

                        {item.status === 'error' && !isRunning && (
                          <button
                            type="button"
                            onClick={() =>
                              updateItem(item.id, { status: 'pending', detail: 'Chờ chạy lại' })
                            }
                            title="Đặt lại để chạy lại"
                            className="p-1.5 text-slate-500 hover:text-indigo-600 rounded-lg hover:bg-slate-100"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={isRunning}
                          onClick={() => setItems((prev) => prev.filter((x) => x.id !== item.id))}
                          title="Xóa khỏi hàng đợi"
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100 disabled:opacity-40"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )
              ) : activeAiItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-8 px-4 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  {batchSubTab === 'reading' ? (
                    <BookOpen className="w-8 h-8 text-indigo-400 mb-2" />
                  ) : (
                    <Sparkles className="w-8 h-8 text-indigo-400 mb-2" />
                  )}
                  <p className="text-sm font-semibold text-slate-800">
                    Chưa có file JSON nào trong hàng đợi tab này
                  </p>
                  <p className="text-xs text-slate-500 max-w-md mt-1 leading-relaxed">
                    Bấm <strong>&quot;Upload nhiều .json hoặc .zip&quot;</strong> (chọn nhiều file{' '}
                    <code>.json</code> hoặc 1 file <code>.zip</code> kết quả từ ChatGPT / Claude / Gemini Web) hoặc bấm{' '}
                    <strong>&quot;Dán nhiều JSON&quot;</strong>. Tool sẽ tự động đọc giọng &amp; dựng video hàng loạt không cần API Key.
                  </p>
                </div>
              ) : (
                activeAiItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 hover:border-slate-300 transition-colors shadow-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900 truncate">
                          {item.title}
                        </span>
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase">
                          {item.learningLanguage}
                        </span>
                        <span className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-slate-100 text-slate-600 truncate max-w-[180px]">
                          {item.sourceFileName}
                        </span>
                      </div>

                      <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                        {item.status === 'done' && (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>{item.detail}</span>
                          </span>
                        )}
                        {item.status === 'error' && (
                          <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{item.detail}</span>
                          </span>
                        )}
                        {(item.status === 'synthesizing' || item.status === 'rendering') && (
                          <span className="inline-flex items-center gap-1.5 text-indigo-700 font-medium">
                            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                            <span>
                              {item.detail} ({Math.round(item.progress * 100)}%)
                            </span>
                          </span>
                        )}
                        {item.status === 'pending' && (
                          <span className="text-slate-500">{item.detail}</span>
                        )}
                      </div>

                      {(item.status === 'synthesizing' || item.status === 'rendering') && (
                        <div className="mt-1.5 w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 transition-all duration-200 rounded-full"
                            style={{ width: `${Math.round(item.progress * 100)}%` }}
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.subTab !== 'reading' && (
                        <button
                          type="button"
                          disabled={isRunning}
                          onClick={() => handleOpenAiItemPreview(item)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                            previewState?.itemId === item.id
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                          } disabled:opacity-40`}
                        >
                          <Eye className="w-3 h-3" />
                          <span>Xem trước</span>
                        </button>
                      )}

                      {item.status === 'error' && !isRunning && (
                        <button
                          type="button"
                          onClick={() =>
                            updateAiItem(item.id, { status: 'pending', detail: 'Chờ chạy lại' })
                          }
                          title="Chạy lại bài này"
                          className="p-1.5 text-slate-500 hover:text-indigo-600 rounded-lg hover:bg-slate-100"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isRunning}
                        onClick={() =>
                          setAiBatchItems((prev) => prev.filter((x) => x.id !== item.id))
                        }
                        title="Xóa khỏi hàng đợi"
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100 disabled:opacity-40"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {previewState && (
            <div className="lg:col-span-5 min-h-0 flex flex-col overflow-hidden">
              <BatchPreviewPane
                project={previewState.project}
                audioFile={items.find((x) => x.id === previewState.itemId)?.audioFile ?? null}
                isBusy={isRunning}
                onChangeTheme={handlePreviewThemeChange}
                onRandomizeLayout={handlePreviewRandomizeLayout}
                onClose={() => setPreviewState(null)}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-600 tabular-nums">
            Tổng tab này: <strong>{totalCount}</strong> bài ·
            {batchSubTab === 'studio' ? (
              <>
                {' '}
                Đã nạp JSON: <strong className="text-emerald-700">{hasJsonCount}</strong> ·{' '}
              </>
            ) : (
              ' '
            )}
            Hoàn thành: <strong className="text-indigo-700">{doneCount}</strong>
          </div>

          <div className="flex items-center gap-2">
            {totalCount > 0 && !isRunning && (
              <button
                type="button"
                onClick={() => {
                  if (batchSubTab === 'studio') {
                    setItems([]);
                  } else {
                    setAiBatchItems((prev) => prev.filter((x) => x.subTab !== batchSubTab));
                  }
                }}
                className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
              >
                Xóa tab này
              </button>
            )}

            {isRunning ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCancelBatchImmediately}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-700 shadow-xs"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>Hủy render ngay</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopFlagRef.current = true;
                  }}
                  className="px-3 py-2 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100"
                >
                  Dừng sau bài xong
                </button>
              </div>
            ) : batchSubTab === 'studio' && batchMode === 'prompt-zip' ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pendingCount === 0}
                  onClick={() => void handleGeneratePromptZip()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors shadow-xs"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>Xuất Prompt ({pendingCount} bài) + Nén ZIP</span>
                </button>
                <button
                  type="button"
                  disabled={items.length === 0}
                  onClick={() => {
                    setBatchMode('render');
                    handleStartBatchClick();
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-xs"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Bắt đầu Render Video</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={pendingCount === 0}
                onClick={handleStartBatchClick}
                data-testid="run-batch-btn"
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-xs"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Chạy Batch ({pendingCount} bài)</span>
              </button>
            )}
          </div>
        </div>

        {/* ── DIALOG 1: DIRECT PASTE JSON MODAL (Studio Item) ── */}
        {pasteJsonItem && (
          <div className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl flex flex-col overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2">
                  <Clipboard className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Dán JSON kịch bản cho: <code>{pasteJsonItem.baseName}</code>
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setPasteJsonItem(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-600">
                    Sao chép đoạn phản hồi JSON từ ChatGPT / Claude / Gemini và dán vào đây:
                  </p>
                  <PasteButton
                    onPaste={(txt) => {
                      setPasteJsonContent(txt);
                      setPasteJsonError(null);
                    }}
                    title="Dán nhanh JSON mới (thay thế trực tiếp)"
                  />
                </div>

                <textarea
                  rows={8}
                  value={pasteJsonContent}
                  onChange={(e) => {
                    setPasteJsonContent(e.target.value);
                    setPasteJsonError(null);
                  }}
                  placeholder={'{\n  "title": "...",\n  "scenes": [\n    ...\n  ]\n}'}
                  className="w-full p-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed"
                />

                {pasteJsonError && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5 font-medium">
                    {pasteJsonError}
                  </p>
                )}
              </div>

              <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPasteJsonItem(null)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleSavePastedJson}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Xác nhận &amp; Lưu kịch bản</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── DIALOG 2: MISSING JSON WARNING MODAL (Studio) ── */}
        {missingJsonWarning && (
          <div className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">
              <div className="px-5 py-3.5 border-b border-amber-200 flex items-center justify-between bg-amber-50">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <h3 className="text-sm font-bold text-amber-900">
                    Phát hiện {missingJsonWarning.count} video chưa có file kịch bản JSON!
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setMissingJsonWarning(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-3.5">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Các video sau chưa có kịch bản JSON:{' '}
                  <strong>
                    {missingJsonWarning.names.slice(0, 4).join(', ')}
                    {missingJsonWarning.names.length > 4 ? '...' : ''}
                  </strong>
                  . Hãy chọn 1 trong 2 cách sau:
                </p>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMissingJsonWarning(null);
                      setBatchMode('prompt-zip');
                      void handleGeneratePromptZip();
                    }}
                    className="w-full text-left p-3 rounded-xl border border-violet-200 bg-violet-50/70 hover:bg-violet-100 transition-colors flex items-center justify-between gap-3 group"
                  >
                    <div>
                      <div className="text-xs font-bold text-violet-900 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-violet-600" />
                        <span>Cách 1: Xuất Prompt ZIP (Miễn phí qua AI Web)</span>
                      </div>
                      <div className="text-[11px] text-violet-700 mt-0.5">
                        Tạo file prompt riêng → nén ZIP → dán vào ChatGPT/Gemini Web lấy JSON
                      </div>
                    </div>
                    <span className="text-xs font-bold text-violet-700 group-hover:translate-x-0.5 transition-transform">
                      →
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMissingJsonWarning(null);
                      jsonOnlyInputRef.current?.click();
                    }}
                    className="w-full text-left p-3 rounded-xl border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100 transition-colors flex items-center justify-between gap-3 group"
                  >
                    <div>
                      <div className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                        <FolderOpen className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Cách 2: Nạp các file .json từ máy tính</span>
                      </div>
                      <div className="text-[11px] text-emerald-700 mt-0.5">
                        Chọn các file .json trùng tên với file audio/srt đã có sẵn
                      </div>
                    </div>
                    <span className="text-xs font-bold text-emerald-700 group-hover:translate-x-0.5 transition-transform">
                      →
                    </span>
                  </button>
                </div>
              </div>

              <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMissingJsonWarning(null);
                    void handleStartBatch();
                  }}
                  className="text-[11px] text-slate-500 hover:text-slate-700 underline"
                >
                  Vẫn tiếp tục render (Chỉ có phụ đề karaoke ở đáy)
                </button>
                <button
                  type="button"
                  onClick={() => setMissingJsonWarning(null)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
                >
                  Đóng &amp; Quay lại
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
