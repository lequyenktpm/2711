import React, { useEffect, useState } from 'react';
import { AlertTriangle, Power, X } from 'lucide-react';

export interface LocalShutdownResult {
  ok: boolean;
  supported: boolean;
  platform?: string;
  delaySeconds?: number;
  message?: string;
  reason?: string;
}

export async function requestLocalShutdown(delaySeconds = 15): Promise<LocalShutdownResult> {
  try {
    const res = await fetch('/api/system/shutdown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delaySeconds }),
    });
    const data = (await res.json().catch(() => ({}))) as LocalShutdownResult;
    return {
      ok: Boolean(data?.ok),
      supported: Boolean(data?.supported),
      platform: data?.platform,
      delaySeconds: data?.delaySeconds,
      message: data?.message,
      reason: data?.reason,
    };
  } catch (err) {
    return {
      ok: false,
      supported: false,
      reason: err instanceof Error ? err.message : 'Không thể kết nối API server cục bộ để hẹn tắt máy.',
    };
  }
}

export async function cancelLocalShutdown(): Promise<void> {
  try {
    await fetch('/api/system/cancel-shutdown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    // Best-effort cancellation
  }
}

export const ShutdownCountdownBanner: React.FC<{
  active: boolean;
  completedTitle?: string;
  initialSeconds?: number;
  onCancel: () => void;
}> = ({ active, completedTitle, initialSeconds = 15, onCancel }) => {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const [statusResult, setStatusResult] = useState<LocalShutdownResult | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);

  useEffect(() => {
    if (!active) {
      setSecondsLeft(initialSeconds);
      setStatusResult(null);
      setIsTriggering(false);
      return;
    }
    setSecondsLeft(initialSeconds);
    setStatusResult(null);
    setIsTriggering(false);
  }, [active, initialSeconds]);

  useEffect(() => {
    if (!active || statusResult || isTriggering) return;
    if (secondsLeft <= 0) {
      setIsTriggering(true);
      void requestLocalShutdown(10).then((res) => {
        setStatusResult(res);
        setIsTriggering(false);
      });
      return;
    }
    const timer = window.setTimeout(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [active, secondsLeft, statusResult, isTriggering]);

  if (!active) return null;

  const handleShutdownNow = async () => {
    setIsTriggering(true);
    const res = await requestLocalShutdown(10);
    setStatusResult(res);
    setIsTriggering(false);
  };

  const handleCancelAll = async () => {
    await cancelLocalShutdown();
    onCancel();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Hẹn giờ tự tắt máy sau khi render"
      data-testid="shutdown-countdown-banner"
      className="fixed bottom-4 right-4 z-[70] max-w-md w-[calc(100vw-2rem)] rounded-2xl border border-amber-300 bg-white shadow-2xl p-4 space-y-3 text-xs text-slate-800"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <Power className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold text-slate-900 text-sm">
              Đã render xong{completedTitle ? `: ${completedTitle}` : '!'}
            </h4>
            <p className="text-[11px] text-slate-600">
              {statusResult
                ? statusResult.supported
                  ? statusResult.message
                  : 'Không thể tự tắt máy trên môi trường hiện tại'
                : `Sẽ gửi lệnh tắt máy Windows sau ${secondsLeft}s...`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleCancelAll()}
          aria-label="Đóng và hủy tắt máy"
          className="p-1 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {statusResult && !statusResult.supported && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5 flex items-start gap-2 text-[11px] text-slate-700">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>{statusResult.reason}</span>
        </div>
      )}

      {!statusResult && (
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 transition-all duration-700"
            style={{ width: `${Math.max(4, Math.round((secondsLeft / initialSeconds) * 100))}%` }}
          />
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => void handleCancelAll()}
          data-testid="cancel-shutdown-btn"
          className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
        >
          {statusResult?.supported ? 'Hủy lệnh tắt máy (shutdown /a)' : statusResult ? 'Đóng' : 'Hủy tắt máy'}
        </button>
        {!statusResult && (
          <button
            type="button"
            disabled={isTriggering}
            onClick={() => void handleShutdownNow()}
            className="px-3 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-50"
          >
            {isTriggering ? 'Đang gửi...' : 'Tắt ngay'}
          </button>
        )}
      </div>
    </div>
  );
};
