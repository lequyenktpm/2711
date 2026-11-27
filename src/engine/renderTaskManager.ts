import { useEffect, useState } from 'react';

export type RenderTaskSlotId =
  | 'studio'
  | 'reels:source'
  | 'reels:creator'
  | 'reels:translation'
  | 'edu:reading'
  | 'edu:merge'
  | 'edu:karaoke'
  | 'batch';

export type RenderTaskStatus =
  | 'idle'
  | 'synthesizing'
  | 'rendering'
  | 'done'
  | 'error'
  | 'aborted';

export type RenderTaskKind = 'render' | 'audio' | 'batch';

export interface RenderTaskState {
  slotId: RenderTaskSlotId;
  label: string;
  kind: RenderTaskKind;
  status: RenderTaskStatus;
  progress: number;
  stageLabel: string;
  title: string;
  startedAt: number;
  notice?: string | null;
  error?: string | null;
}

export interface ConcurrencyConflictInfo {
  blockingTask: RenderTaskState;
  requestedSlotId: RenderTaskSlotId;
  message: string;
}

const SLOT_LABELS: Record<RenderTaskSlotId, string> = {
  studio: 'KineticSub Studio (Dựng Video)',
  'reels:source': 'Video Ngoại Ngữ · Từ Bài / Link',
  'reels:creator': 'Video Ngoại Ngữ · AI Tạo Từ & Câu',
  'reels:translation': 'Video Ngoại Ngữ · Phản Xạ Dịch Câu',
  'edu:reading': 'Hậu Kỳ · Video Đọc Theo Chữ',
  'edu:merge': 'Hậu Kỳ · Ghép Video & Audio',
  'edu:karaoke': 'Hậu Kỳ · Karaoke & Mix',
  batch: 'Chạy Batch Hàng Loạt',
};

export function getRenderSlotLabel(slotId: RenderTaskSlotId): string {
  return SLOT_LABELS[slotId] || slotId;
}

export function getAppTabForSlot(
  slotId: RenderTaskSlotId,
): { activeTab: 'studio' | 'reels' | 'edu-studio'; reelsMode?: 'source' | 'creator' | 'translation'; openBatch?: boolean } {
  if (slotId === 'studio') return { activeTab: 'studio' };
  if (slotId === 'reels:source') return { activeTab: 'reels', reelsMode: 'source' };
  if (slotId === 'reels:creator') return { activeTab: 'reels', reelsMode: 'creator' };
  if (slotId === 'reels:translation') return { activeTab: 'reels', reelsMode: 'translation' };
  if (slotId === 'batch') return { activeTab: 'studio', openBatch: true };
  return { activeTab: 'edu-studio' };
}

export function isTaskActiveStatus(status: RenderTaskStatus): boolean {
  return status === 'rendering' || status === 'synthesizing';
}

export function getActiveBlockingTaskFromMap(
  tasks: Partial<Record<RenderTaskSlotId, RenderTaskState>>,
  excludeSlotId?: RenderTaskSlotId,
): RenderTaskState | null {
  let latest: RenderTaskState | null = null;
  for (const state of Object.values(tasks)) {
    if (!state) continue;
    if (excludeSlotId && state.slotId === excludeSlotId) continue;
    if (!isTaskActiveStatus(state.status)) continue;
    if (!latest || state.startedAt >= latest.startedAt) {
      latest = state;
    }
  }
  return latest;
}

export function checkRenderConcurrencyConflict(
  tasks: Partial<Record<RenderTaskSlotId, RenderTaskState>>,
  requestedSlotId: RenderTaskSlotId,
): ConcurrencyConflictInfo | null {
  const blocking = getActiveBlockingTaskFromMap(tasks, requestedSlotId);
  if (!blocking) return null;
  const pct = Math.max(0, Math.min(100, Math.round(blocking.progress * 100)));
  const titleHint = blocking.title ? ` ("${blocking.title}")` : '';
  return {
    blockingTask: blocking,
    requestedSlotId,
    message: `Đang có luồng khác chạy ở [${blocking.label}]${titleHint} (${pct}%). Không thể chạy 2 luồng render MP4/Audio nặng cùng lúc để tránh xung đột khung hình và tràn RAM gây tải lại trang.`,
  };
}

export function shouldBlockPageUnload(
  tasks: Partial<Record<RenderTaskSlotId, RenderTaskState>>,
): boolean {
  return getActiveBlockingTaskFromMap(tasks) !== null;
}

// ── Singleton Coordinator Store ─────────────────────────────────────────────

const tasksMap: Partial<Record<RenderTaskSlotId, RenderTaskState>> = {};
const abortHandlers = new Map<RenderTaskSlotId, () => void>();
const navigateListeners = new Set<(slotId: RenderTaskSlotId) => void>();
const listeners = new Set<() => void>();

function emitChange(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // ignore subscriber errors
    }
  }
}

export function getRenderTasksSnapshot(): Partial<Record<RenderTaskSlotId, RenderTaskState>> {
  return { ...tasksMap };
}

export function getRenderTask(slotId: RenderTaskSlotId): RenderTaskState {
  return (
    tasksMap[slotId] ?? {
      slotId,
      label: getRenderSlotLabel(slotId),
      kind: slotId === 'batch' ? 'batch' : 'render',
      status: 'idle',
      progress: 0,
      stageLabel: '',
      title: '',
      startedAt: 0,
      notice: null,
      error: null,
    }
  );
}

export function startRenderTaskSlot(
  slotId: RenderTaskSlotId,
  options: {
    kind: RenderTaskKind;
    title: string;
    stageLabel?: string;
    progress?: number;
    status?: 'synthesizing' | 'rendering';
    onAbort?: () => void;
  },
): void {
  if (options.onAbort) {
    abortHandlers.set(slotId, options.onAbort);
  }
  tasksMap[slotId] = {
    slotId,
    label: getRenderSlotLabel(slotId),
    kind: options.kind,
    status: options.status ?? (options.kind === 'audio' ? 'synthesizing' : 'rendering'),
    progress: options.progress ?? 0,
    stageLabel: options.stageLabel ?? 'Đang khởi tạo...',
    title: options.title,
    startedAt: Date.now(),
    notice: null,
    error: null,
  };
  emitChange();
}

export function updateRenderTaskSlot(
  slotId: RenderTaskSlotId,
  patch: Partial<Omit<RenderTaskState, 'slotId' | 'label'>>,
): void {
  const prev = getRenderTask(slotId);
  tasksMap[slotId] = {
    ...prev,
    ...patch,
    slotId,
    label: getRenderSlotLabel(slotId),
  };
  emitChange();
}

export function finishRenderTaskSlot(
  slotId: RenderTaskSlotId,
  result: {
    status: 'done' | 'error' | 'aborted' | 'idle';
    notice?: string | null;
    error?: string | null;
    stageLabel?: string;
  },
): void {
  abortHandlers.delete(slotId);
  const prev = getRenderTask(slotId);
  tasksMap[slotId] = {
    ...prev,
    status: result.status,
    progress: result.status === 'done' ? 1 : 0,
    stageLabel: result.stageLabel ?? '',
    notice: result.notice ?? null,
    error: result.error ?? null,
  };
  emitChange();
}

export function clearRenderTaskFeedback(slotId: RenderTaskSlotId): void {
  const prev = tasksMap[slotId];
  if (!prev) return;
  tasksMap[slotId] = {
    ...prev,
    notice: null,
    error: null,
    ...(isTaskActiveStatus(prev.status) ? {} : { status: 'idle', progress: 0, stageLabel: '' }),
  };
  emitChange();
}

export function abortRenderTaskSlot(slotId: RenderTaskSlotId): boolean {
  const fn = abortHandlers.get(slotId);
  if (fn) {
    try {
      fn();
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function subscribeRenderTasks(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function requestNavigateToTaskSlot(slotId: RenderTaskSlotId): void {
  for (const fn of navigateListeners) {
    try {
      fn(slotId);
    } catch {
      // ignore
    }
  }
}

export function subscribeTaskNavigation(listener: (slotId: RenderTaskSlotId) => void): () => void {
  navigateListeners.add(listener);
  return () => {
    navigateListeners.delete(listener);
  };
}

export function useRenderTasks(): Partial<Record<RenderTaskSlotId, RenderTaskState>> {
  const [snapshot, setSnapshot] = useState<Partial<Record<RenderTaskSlotId, RenderTaskState>>>(() =>
    getRenderTasksSnapshot(),
  );

  useEffect(() => {
    setSnapshot(getRenderTasksSnapshot());
    return subscribeRenderTasks(() => {
      setSnapshot(getRenderTasksSnapshot());
    });
  }, []);

  return snapshot;
}

export function useActiveTaskBeforeUnloadGuard(): boolean {
  const tasks = useRenderTasks();
  const hasActive = shouldBlockPageUnload(tasks);

  useEffect(() => {
    if (!hasActive || typeof window === 'undefined') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue =
        'Video hoặc Batch đang trong quá trình render. Nếu tải lại trang, tiến trình đang chạy sẽ bị tạm dừng.';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [hasActive]);

  return hasActive;
}
