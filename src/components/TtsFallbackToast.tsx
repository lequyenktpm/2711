import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Loader2, RefreshCw, X } from 'lucide-react';
import {
  dismissTtsFallbackNotice,
  keepGoogleFromNotice,
  subscribeTtsFallbackNotices,
  triggerRetryEdgeFromNotice,
  TtsFallbackNoticeItem,
} from '../utils/ttsFallbackNotice';

export const TtsFallbackToast: React.FC = () => {
  const [notices, setNotices] = useState<TtsFallbackNoticeItem[]>([]);

  useEffect(() => {
    return subscribeTtsFallbackNotices(setNotices);
  }, []);

  if (notices.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2.5 max-w-md w-[calc(100vw-2rem)] pointer-events-none"
      aria-live="polite"
    >
      {notices.map((item) => (
        <div
          key={item.id}
          role="alert"
          className="pointer-events-auto rounded-2xl border border-amber-300 bg-white/95 backdrop-blur-md shadow-2xl p-3.5 text-slate-900"
        >
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 p-1.5 rounded-xl bg-amber-100 text-amber-700 shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs font-bold text-slate-900 leading-snug">
                  Edge TTS tạm lỗi — đang dùng Google TTS ({item.sourceLabel})
                </div>
                <button
                  type="button"
                  onClick={() => dismissTtsFallbackNotice(item.id)}
                  aria-label="Đóng thông báo TTS"
                  className="p-0.5 text-slate-400 hover:text-slate-700 rounded"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Audio Google đã sẵn sàng để bạn dùng ngay. Bạn có thể giữ audio Google hoặc bấm thử lại giọng Edge Neural.
              </p>
              {item.edgeErrorSummary && (
                <div className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200/80 rounded-lg px-2 py-1 truncate" title={item.edgeErrorSummary}>
                  Lý do Edge: {item.edgeErrorSummary}
                </div>
              )}
              {item.retryError && (
                <div className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">
                  {item.retryError}
                </div>
              )}
              <div className="pt-1 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={item.isRetrying}
                  onClick={() => keepGoogleFromNotice(item.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-50"
                >
                  <Check className="w-3 h-3 text-emerald-600" />
                  <span>Giữ Audio Google</span>
                </button>
                {item.canRetry && (
                  <button
                    type="button"
                    disabled={item.isRetrying}
                    onClick={() => void triggerRetryEdgeFromNotice(item.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs disabled:opacity-60"
                  >
                    {item.isRetrying ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Đang thử lại Edge...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3 h-3" />
                        <span>Thử lại Edge TTS</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
