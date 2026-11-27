export interface TtsFallbackNoticeItem {
  id: string;
  sourceLabel: string;
  edgeErrorSummary?: string;
  canRetry: boolean;
  isRetrying: boolean;
  retryError?: string;
  onRetryEdge?: () => Promise<void>;
  onKeepGoogle?: () => void;
}

type Listener = (notices: TtsFallbackNoticeItem[]) => void;

let activeNotices: TtsFallbackNoticeItem[] = [];
const listeners = new Set<Listener>();

function emit() {
  const snapshot = [...activeNotices];
  listeners.forEach((fn) => fn(snapshot));
}

export function subscribeTtsFallbackNotices(listener: Listener): () => void {
  listeners.add(listener);
  listener([...activeNotices]);
  return () => {
    listeners.delete(listener);
  };
}

export function dismissTtsFallbackNotice(id: string): void {
  activeNotices = activeNotices.filter((n) => n.id !== id);
  emit();
}

export function notifyEdgeFallbackToGoogle(params: {
  id?: string;
  sourceLabel: string;
  edgeErrors?: string[];
  onRetryEdge?: () => Promise<void>;
  onKeepGoogle?: () => void;
}): string {
  const id = params.id || `tts-fb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const summary =
    Array.isArray(params.edgeErrors) && params.edgeErrors.length > 0
      ? params.edgeErrors[0]
      : undefined;

  const item: TtsFallbackNoticeItem = {
    id,
    sourceLabel: params.sourceLabel,
    edgeErrorSummary: summary,
    canRetry: typeof params.onRetryEdge === 'function',
    isRetrying: false,
    retryError: undefined,
    onRetryEdge: params.onRetryEdge,
    onKeepGoogle: params.onKeepGoogle,
  };

  activeNotices = [...activeNotices.filter((n) => n.id !== id), item];
  emit();
  return id;
}

export async function triggerRetryEdgeFromNotice(id: string): Promise<void> {
  const target = activeNotices.find((n) => n.id === id);
  if (!target || target.isRetrying || !target.onRetryEdge) return;

  activeNotices = activeNotices.map((n) =>
    n.id === id ? { ...n, isRetrying: true, retryError: undefined } : n,
  );
  emit();

  try {
    await target.onRetryEdge();
    dismissTtsFallbackNotice(id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Edge TTS vẫn đang lỗi, đã giữ nguyên Audio Google.';
    activeNotices = activeNotices.map((n) =>
      n.id === id ? { ...n, isRetrying: false, retryError: msg } : n,
    );
    emit();
  }
}

export function keepGoogleFromNotice(id: string): void {
  const target = activeNotices.find((n) => n.id === id);
  try {
    target?.onKeepGoogle?.();
  } finally {
    dismissTtsFallbackNotice(id);
  }
}
