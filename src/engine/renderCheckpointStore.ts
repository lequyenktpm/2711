import { ReelCard, ReelCardTimingMeta, ReelCreationMode, ReelMode } from './englishReelsEngine';
import { Mp4ExportSettings } from './mp4Config';
import {
  BatchSubTabId,
  ParsedCreatorBatchPayload,
  ParsedReadingBatchPayload,
} from './multiTabBatchHelper';
import { CanvasThemeId, LayoutCompositionId, LessonProject, TranscriptCue } from './types';

export interface SerializedBatchStudioItem {
  id: string;
  baseName: string;
  status: 'pending' | 'generating-json' | 'rendering' | 'done' | 'prompt-ready' | 'error';
  progress: number;
  detail: string;
  outputInfo?: string;
  pastedJsonText?: string;
  promptText?: string;
  hasAudioFile: boolean;
  audioFileName?: string;
  hasSrtFile: boolean;
  srtFileName?: string;
  hasJsonFile: boolean;
  jsonFileName?: string;
}

export interface SerializedBatchAiItem {
  id: string;
  subTab: 'creator' | 'translation' | 'reading';
  sourceFileName: string;
  title: string;
  learningLanguage: string;
  payload: ParsedCreatorBatchPayload | ParsedReadingBatchPayload;
  status: 'pending' | 'synthesizing' | 'rendering' | 'done' | 'error';
  progress: number;
  detail: string;
  outputInfo?: string;
}

export interface BatchCheckpointState {
  version: 1;
  updatedAt: number;
  wasRunning: boolean;
  batchSubTab: BatchSubTabId;
  batchMode: 'render' | 'prompt-zip';
  saveMode: 'disk' | 'download';
  customSavePath: string;
  outputDirName: string;
  studioItems: SerializedBatchStudioItem[];
  aiItems: SerializedBatchAiItem[];
  exportSettings?: Mp4ExportSettings;
  reelBatchTheme?: CanvasThemeId;
  reelBatchDualTts?: boolean;
  reelBatchRate?: number;
  reelBatchBgm?: string;
  reelBatchBgmVol?: number;
  reelBatchCountdownSfx?: boolean;
  reelBatchOutroText?: string;
  reelBatchOutroSec?: number;
  readingBatchPalette?: string;
  readingBatchFrame?: string;
  readingBatchPointer?: string;
  readingBatchBgPreset?: string;
  readingBatchIntro?: boolean;
  readingBatchOutroSpeech?: boolean;
  videoStyle?: string;
  compositionId?: LayoutCompositionId | 'ai-decide' | 'random';
  contextLockedRandom?: boolean;
}

export interface ReelsDraftCheckpoint {
  version: 1;
  mode: ReelCreationMode;
  updatedAt: number;
  activeRenderInterrupted: boolean;
  interruptedStage?: string;
  lessonTitle: string;
  parsedLessonLevel?: string;
  reelMode: ReelMode;
  cards: ReelCard[];
  rawText: string;
  pastedAiJson: string;
  generatedDurations?: number[];
  generatedTimings?: ReelCardTimingMeta[];
  customSyncedCues?: TranscriptCue[] | null;
  synthesizedAudioSig: string;
  hasAudioFile: boolean;
  audioFileName?: string;
}

export interface StudioDraftCheckpoint {
  version: 1;
  updatedAt: number;
  activeRenderInterrupted: boolean;
  interruptedStage?: string;
  project: LessonProject;
  hasAudioFile: boolean;
  audioFileName?: string;
}

export interface BatchRecoverySummary {
  hasCheckpoint: boolean;
  wasInterrupted: boolean;
  totalCount: number;
  doneCount: number;
  pendingCount: number;
  batchSubTab: BatchSubTabId;
  updatedAt: number;
  outputDirName: string;
  customSavePath: string;
}

export function normalizeInterruptedStudioItems<
  T extends { status: string; progress: number; detail: string },
>(items: T[]): T[] {
  return items.map((it) => {
    if (it.status === 'rendering' || it.status === 'generating-json') {
      return {
        ...it,
        status: 'pending',
        progress: 0,
        detail: 'Bị gián đoạn trước khi tải lại trang — sẵn sàng chạy tiếp',
      };
    }
    return it;
  });
}

export function normalizeInterruptedAiItems<
  T extends { status: string; progress: number; detail: string },
>(items: T[]): T[] {
  return items.map((it) => {
    if (it.status === 'synthesizing' || it.status === 'rendering') {
      return {
        ...it,
        status: 'pending',
        progress: 0,
        detail: 'Bị gián đoạn trước khi tải lại trang — sẵn sàng chạy tiếp',
      };
    }
    return it;
  });
}

export function summarizeBatchRecovery(
  checkpoint: BatchCheckpointState | null | undefined,
): BatchRecoverySummary {
  if (!checkpoint) {
    return {
      hasCheckpoint: false,
      wasInterrupted: false,
      totalCount: 0,
      doneCount: 0,
      pendingCount: 0,
      batchSubTab: 'studio',
      updatedAt: 0,
      outputDirName: '',
      customSavePath: 'Batch',
    };
  }
  const activeList =
    checkpoint.batchSubTab === 'studio'
      ? checkpoint.studioItems
      : checkpoint.aiItems.filter((a) => a.subTab === checkpoint.batchSubTab);
  const fallbackList =
    activeList.length > 0
      ? activeList
      : [...checkpoint.studioItems, ...checkpoint.aiItems];

  const totalCount = fallbackList.length;
  const doneCount = fallbackList.filter(
    (x) => x.status === 'done' || x.status === 'prompt-ready',
  ).length;
  const pendingCount = totalCount - doneCount;

  return {
    hasCheckpoint: totalCount > 0 && (checkpoint.wasRunning || pendingCount > 0 || doneCount > 0),
    wasInterrupted: Boolean(checkpoint.wasRunning && pendingCount > 0),
    totalCount,
    doneCount,
    pendingCount,
    batchSubTab: checkpoint.batchSubTab,
    updatedAt: checkpoint.updatedAt || 0,
    outputDirName: checkpoint.outputDirName || '',
    customSavePath: checkpoint.customSavePath || 'Batch',
  };
}

// ── IndexedDB + localStorage + Server Persistence ───────────────────────────

const DB_NAME = 'kineticsub_recovery_db_v1';
const DB_VERSION = 1;
const STORE_RECORDS = 'records';
const STORE_BLOBS = 'blobs';

const LOCAL_BATCH_KEY = 'kineticsub_batch_checkpoint_v1';
const LOCAL_REELS_PREFIX = 'kineticsub_reels_draft_v1_';
const LOCAL_STUDIO_KEY = 'kineticsub_studio_draft_v1';
const BATCH_DIR_HANDLE_KEY = 'batch:dirHandle';

export const CHECKPOINT_UPDATED_EVENT = 'kineticsub:checkpoint-updated';

function emitCheckpointUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHECKPOINT_UPDATED_EVENT));
  }
}

function openCheckpointDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_RECORDS)) {
          db.createObjectStore(STORE_RECORDS);
        }
        if (!db.objectStoreNames.contains(STORE_BLOBS)) {
          db.createObjectStore(STORE_BLOBS);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPut(storeName: string, key: string, value: unknown): Promise<boolean> {
  const db = await openCheckpointDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value, key);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    } catch {
      db.close();
      resolve(false);
    }
  });
}

async function idbGet<T>(storeName: string, key: string): Promise<T | null> {
  const db = await openCheckpointDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as T) ?? null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

async function idbDelete(storeName: string, key: string): Promise<void> {
  const db = await openCheckpointDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

async function idbDeleteByPrefix(storeName: string, prefix: string): Promise<void> {
  const db = await openCheckpointDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        if (typeof cursor.key === 'string' && cursor.key.startsWith(prefix)) {
          cursor.delete();
        }
        cursor.continue();
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export async function saveBatchFileBlob(
  itemId: string,
  role: 'audio' | 'srt' | 'json',
  file: File | null,
): Promise<void> {
  const key = `batch:studio:${itemId}:${role}`;
  if (!file) {
    await idbDelete(STORE_BLOBS, key);
    return;
  }
  await idbPut(STORE_BLOBS, key, file);
}

export async function loadBatchFileBlob(
  itemId: string,
  role: 'audio' | 'srt' | 'json',
): Promise<File | null> {
  const stored = await idbGet<File | Blob>(STORE_BLOBS, `batch:studio:${itemId}:${role}`);
  if (!stored) return null;
  if (stored instanceof File) return stored;
  return null;
}

export async function saveBatchDirectoryHandle(handle: any): Promise<void> {
  if (!handle) {
    await idbDelete(STORE_RECORDS, BATCH_DIR_HANDLE_KEY);
    return;
  }
  await idbPut(STORE_RECORDS, BATCH_DIR_HANDLE_KEY, handle);
}

export async function loadBatchDirectoryHandle(): Promise<any | null> {
  return idbGet<any>(STORE_RECORDS, BATCH_DIR_HANDLE_KEY);
}

export async function saveBatchCheckpoint(checkpoint: BatchCheckpointState): Promise<void> {
  const payload: BatchCheckpointState = { ...checkpoint, updatedAt: Date.now() };
  await idbPut(STORE_RECORDS, 'batch_checkpoint_v1', payload);
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      window.localStorage.setItem(LOCAL_BATCH_KEY, JSON.stringify(payload));
    } catch {
      // ignore quota overflow on very large JSON lists; IndexedDB + server still persist
    }
  }
  if (typeof fetch === 'function') {
    void fetch('/api/batch/checkpoint', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkpoint: payload }),
    }).catch(() => undefined);
  }
  emitCheckpointUpdated();
}

export async function loadBatchCheckpoint(): Promise<BatchCheckpointState | null> {
  let idbData = await idbGet<BatchCheckpointState>(STORE_RECORDS, 'batch_checkpoint_v1');
  if (!idbData && typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(LOCAL_BATCH_KEY);
      if (raw) {
        idbData = JSON.parse(raw) as BatchCheckpointState;
      }
    } catch {
      idbData = null;
    }
  }
  if (!idbData && typeof fetch === 'function') {
    try {
      const res = await fetch('/api/batch/checkpoint');
      if (res.ok) {
        const json = (await res.json()) as { checkpoint?: BatchCheckpointState | null };
        if (json?.checkpoint) idbData = json.checkpoint;
      }
    } catch {
      // ignore offline
    }
  }
  if (!idbData || idbData.version !== 1) return null;
  return {
    ...idbData,
    studioItems: normalizeInterruptedStudioItems(idbData.studioItems || []),
    aiItems: normalizeInterruptedAiItems(idbData.aiItems || []),
  };
}

export async function clearBatchCheckpoint(): Promise<void> {
  await idbDelete(STORE_RECORDS, 'batch_checkpoint_v1');
  await idbDeleteByPrefix(STORE_BLOBS, 'batch:studio:');
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      window.localStorage.removeItem(LOCAL_BATCH_KEY);
    } catch {
      // ignore
    }
  }
  if (typeof fetch === 'function') {
    void fetch('/api/batch/checkpoint', { method: 'DELETE' }).catch(() => undefined);
  }
  emitCheckpointUpdated();
}

export async function saveReelsDraftCheckpoint(
  draft: ReelsDraftCheckpoint,
  audioFile: File | null,
): Promise<void> {
  const key = `reels_draft_v1_${draft.mode}`;
  const blobKey = `reels:${draft.mode}:audio`;
  const payload: ReelsDraftCheckpoint = { ...draft, updatedAt: Date.now() };
  await idbPut(STORE_RECORDS, key, payload);
  if (audioFile) {
    await idbPut(STORE_BLOBS, blobKey, audioFile);
  } else {
    await idbDelete(STORE_BLOBS, blobKey);
  }
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      window.localStorage.setItem(`${LOCAL_REELS_PREFIX}${draft.mode}`, JSON.stringify(payload));
    } catch {
      // ignore quota
    }
  }
  emitCheckpointUpdated();
}

export async function loadReelsDraftCheckpoint(
  mode: ReelCreationMode,
): Promise<{ draft: ReelsDraftCheckpoint; audioFile: File | null } | null> {
  let draft = await idbGet<ReelsDraftCheckpoint>(STORE_RECORDS, `reels_draft_v1_${mode}`);
  if (!draft && typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(`${LOCAL_REELS_PREFIX}${mode}`);
      if (raw) draft = JSON.parse(raw) as ReelsDraftCheckpoint;
    } catch {
      draft = null;
    }
  }
  if (!draft || draft.version !== 1) return null;
  const audioBlob = await idbGet<File | Blob>(STORE_BLOBS, `reels:${mode}:audio`);
  const audioFile =
    audioBlob instanceof File
      ? audioBlob
      : audioBlob instanceof Blob
        ? new File([audioBlob], draft.audioFileName || 'lesson-audio.wav', {
            type: audioBlob.type || 'audio/wav',
          })
        : null;
  return { draft, audioFile };
}

export async function clearReelsDraftInterruptFlag(mode: ReelCreationMode): Promise<void> {
  const loaded = await loadReelsDraftCheckpoint(mode);
  if (!loaded || !loaded.draft.activeRenderInterrupted) return;
  await saveReelsDraftCheckpoint(
    { ...loaded.draft, activeRenderInterrupted: false, interruptedStage: undefined },
    loaded.audioFile,
  );
}

export async function saveStudioDraftCheckpoint(
  draft: StudioDraftCheckpoint,
  audioFile: File | null,
): Promise<void> {
  const payload: StudioDraftCheckpoint = { ...draft, updatedAt: Date.now() };
  await idbPut(STORE_RECORDS, 'studio_draft_v1', payload);
  if (audioFile) {
    await idbPut(STORE_BLOBS, 'studio:audio', audioFile);
  } else {
    await idbDelete(STORE_BLOBS, 'studio:audio');
  }
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      window.localStorage.setItem(LOCAL_STUDIO_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }
  emitCheckpointUpdated();
}

export async function loadStudioDraftCheckpoint(): Promise<{
  draft: StudioDraftCheckpoint;
  audioFile: File | null;
} | null> {
  let draft = await idbGet<StudioDraftCheckpoint>(STORE_RECORDS, 'studio_draft_v1');
  if (!draft && typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(LOCAL_STUDIO_KEY);
      if (raw) draft = JSON.parse(raw) as StudioDraftCheckpoint;
    } catch {
      draft = null;
    }
  }
  if (!draft || draft.version !== 1) return null;
  const audioBlob = await idbGet<File | Blob>(STORE_BLOBS, 'studio:audio');
  const audioFile =
    audioBlob instanceof File
      ? audioBlob
      : audioBlob instanceof Blob
        ? new File([audioBlob], draft.audioFileName || 'studio-audio.wav', {
            type: audioBlob.type || 'audio/wav',
          })
        : null;
  return { draft, audioFile };
}

export async function clearStudioDraftInterruptFlag(): Promise<void> {
  const loaded = await loadStudioDraftCheckpoint();
  if (!loaded || !loaded.draft.activeRenderInterrupted) return;
  await saveStudioDraftCheckpoint(
    { ...loaded.draft, activeRenderInterrupted: false, interruptedStage: undefined },
    loaded.audioFile,
  );
}
