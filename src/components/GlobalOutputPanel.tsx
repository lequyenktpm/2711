import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Eye,
  FileText,
  FolderOpen,
  Play,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { downloadServerOutputFile, isHtmlPayload } from '../utils/safeFileDownload';

export interface GlobalOutputFileEntry {
  name: string;
  relativePath: string;
  savedPath?: string;
  bytes: number;
  updatedAt: number;
  sourceTab?: string;
}

export function emitOutputUpdated(detail?: { relativePath?: string; sourceTab?: string }): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('kineticsub:output-updated', { detail }));
}

interface GlobalOutputPanelProps {
  activeTab: string;
}

const SOURCE_TAB_BADGE_MAP: Record<string, string> = {
  'Studio 9:16': 'bg-indigo-100 text-indigo-800 border-indigo-200',
  'English Reels': 'bg-violet-100 text-violet-800 border-violet-200',
  'Edu Merge': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Edu Karaoke': 'bg-amber-100 text-amber-800 border-amber-200',
  'Reading Along': 'bg-sky-100 text-sky-800 border-sky-200',
};

export const GlobalOutputPanel: React.FC<GlobalOutputPanelProps> = ({ activeTab }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [outputDir, setOutputDir] = useState('output');
  const [files, setFiles] = useState<GlobalOutputFileEntry[]>([]);
  const [previewRelPath, setPreviewRelPath] = useState<string | null>(null);
  const [previewTextContent, setPreviewTextContent] = useState<string>('');
  const [copiedPreviewText, setCopiedPreviewText] = useState(false);
  const [filterTab, setFilterTab] = useState<string>('all');
  const [folderMsg, setFolderMsg] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshFiles = useCallback(async (selectRelPath?: string) => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/output/files');
      if (!res.ok) return;
      const data = (await res.json()) as {
        outputDir?: string;
        files?: GlobalOutputFileEntry[];
      };
      setOutputDir(data.outputDir || 'output');
      const list = Array.isArray(data.files) ? data.files : [];
      setFiles(list);
      setPreviewRelPath((prev) => {
        if (selectRelPath && list.some((f) => f.relativePath === selectRelPath)) {
          return selectRelPath;
        }
        if (prev && list.some((f) => f.relativePath === prev)) return prev;
        const firstPlayable = list.find((f) => /\.(mp4|webm|mov|mp3|wav|m4a)$/i.test(f.name));
        return firstPlayable ? firstPlayable.relativePath : null;
      });
    } catch {
      // ignore offline
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshFiles();
  }, [refreshFiles, activeTab]);

  useEffect(() => {
    const onUpdated = (evt: Event) => {
      const detail = (evt as CustomEvent<{ relativePath?: string }>).detail;
      setIsExpanded(true);
      void refreshFiles(detail?.relativePath);
    };
    window.addEventListener('kineticsub:output-updated', onUpdated);
    return () => window.removeEventListener('kineticsub:output-updated', onUpdated);
  }, [refreshFiles]);

  const handleOpenFolder = async () => {
    try {
      const res = await fetch('/api/output/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        desktopOpened?: boolean;
        outputDir?: string;
      };
      if (data.desktopOpened) {
        setFolderMsg(`Đã mở thư mục Output: ${data.outputDir}`);
      } else {
        setFolderMsg(`Thư mục Output trên server: ${data.outputDir || outputDir}`);
      }
    } catch {
      // ignore
    }
  };

  const totalSizeMb = useMemo(
    () => (files.reduce((sum, f) => sum + f.bytes, 0) / (1024 * 1024)).toFixed(2),
    [files],
  );

  const visibleFiles = useMemo(() => {
    if (filterTab === 'all') return files;
    return files.filter((f) => (f.sourceTab || 'Khác') === filterTab);
  }, [files, filterTab]);

  const availableSourceTabs = useMemo(() => {
    const set = new Set<string>();
    for (const f of files) {
      set.add(f.sourceTab || 'Khác');
    }
    return Array.from(set);
  }, [files]);

  const isPreviewAudio = Boolean(
    previewRelPath && /\.(mp3|wav|m4a|aac|ogg)$/i.test(previewRelPath),
  );
  const isPreviewText = Boolean(
    previewRelPath && /\.(txt|srt|vtt)$/i.test(previewRelPath),
  );

  useEffect(() => {
    if (!previewRelPath || !isPreviewText) {
      setPreviewTextContent('');
      return;
    }
    let cancelled = false;
    fetch(`/api/output/download?path=${encodeURIComponent(previewRelPath)}&inline=1`, {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then(async (r) => {
        if (!r.ok) return '';
        const ct = r.headers.get('content-type');
        const txt = await r.text();
        if (isHtmlPayload(txt, ct)) {
          return '⚠️ Không đọc được file văn bản (server/proxy trả về HTML thay vì nội dung .txt).';
        }
        return txt;
      })
      .then((txt) => {
        if (!cancelled) setPreviewTextContent(txt);
      })
      .catch(() => {
        if (!cancelled) setPreviewTextContent('');
      });
    return () => {
      cancelled = true;
    };
  }, [previewRelPath, isPreviewText]);

  const handleSafeDownload = async (relPath: string, fileName?: string) => {
    setDownloadError(null);
    const res = await downloadServerOutputFile(relPath, fileName);
    if (!res.ok) {
      setDownloadError(res.error || `Không tải được ${res.fileName}.`);
    }
  };

  return (
    <section
      aria-label="Thư mục Output chung"
      className="max-w-[1400px] w-full mx-auto px-4 lg:px-6 pb-6"
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {/* Compact Header Bar */}
        <div className="px-4 py-3 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setIsExpanded((v) => !v)}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900 hover:text-indigo-700"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-slate-500" />
              ) : (
                <ChevronUp className="w-4 h-4 text-slate-500" />
              )}
              <span>
                Thư mục Output chung ({files.length} file · {totalSizeMb} MB)
              </span>
            </button>
            <span className="hidden sm:inline-block text-[11px] text-slate-500 font-mono truncate max-w-[320px]">
              {outputDir}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {availableSourceTabs.length > 0 && (
              <select
                aria-label="Lọc theo tab đã xuất"
                value={filterTab}
                onChange={(e) => setFilterTab(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-medium text-slate-700"
              >
                <option value="all">Tất cả tab ({files.length})</option>
                {availableSourceTabs.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => void refreshFiles()}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Làm mới</span>
            </button>
            <button
              type="button"
              onClick={() => void handleOpenFolder()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Mở thư mục</span>
            </button>
          </div>
        </div>

        {folderMsg && (
          <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-200 text-xs text-emerald-900 flex items-center justify-between gap-2">
            <span>{folderMsg}</span>
            <button
              type="button"
              onClick={() => setFolderMsg(null)}
              className="font-semibold text-emerald-700"
            >
              Đóng
            </button>
          </div>
        )}

        {downloadError && (
          <div className="px-4 py-2 bg-rose-50 border-b border-rose-200 text-xs text-rose-900 flex items-center justify-between gap-2">
            <span>{downloadError}</span>
            <button
              type="button"
              onClick={() => setDownloadError(null)}
              className="font-semibold text-rose-700"
            >
              Đóng
            </button>
          </div>
        )}

        {isExpanded && (
          <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Compact File List */}
            <div className="lg:col-span-7 divide-y divide-slate-100 max-h-[260px] overflow-y-auto border border-slate-200 rounded-xl">
              {visibleFiles.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  Chưa có file nào trong thư mục Output. Hãy xuất video ở Studio 9:16, English Reels hoặc Edu Studio 1.19 để xem và tải lại tại đây.
                </div>
              ) : (
                visibleFiles.map((f) => {
                  const badgeCls =
                    (f.sourceTab && SOURCE_TAB_BADGE_MAP[f.sourceTab]) ||
                    'bg-slate-100 text-slate-700 border-slate-200';
                  const isSelected = previewRelPath === f.relativePath;
                  return (
                    <div
                      key={f.relativePath}
                      className={`px-3 py-2 flex items-center justify-between gap-2 text-xs transition-colors ${
                        isSelected ? 'bg-indigo-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setPreviewRelPath(f.relativePath)}
                        className="min-w-0 text-left flex-1 flex items-center gap-2.5"
                      >
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-md border shrink-0 ${badgeCls}`}
                        >
                          {f.sourceTab || 'Output'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-900 truncate flex items-center gap-1.5">
                            {/\.txt$/i.test(f.name) && (
                              <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-sky-100 text-sky-700 shrink-0">
                                TXT
                              </span>
                            )}
                            <span className="truncate">{f.name}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono truncate">
                            {f.relativePath} ·{' '}
                            {f.bytes < 1024 * 100
                              ? `${Math.max(1, Math.round(f.bytes / 1024))} KB`
                              : `${(f.bytes / (1024 * 1024)).toFixed(2)} MB`}
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setPreviewRelPath(f.relativePath)}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-100 rounded-md"
                          title={/\.txt$/i.test(f.name) ? 'Xem nội dung mô tả & hashtag' : 'Phát thử'}
                        >
                          {/\.txt$/i.test(f.name) ? (
                            <FileText className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSafeDownload(f.relativePath, f.name)}
                          aria-label={`Tải ${f.name}`}
                          className="p-1.5 text-emerald-700 hover:bg-emerald-100 rounded-md"
                          title="Tải về máy"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await fetch(
                              `/api/output/file?path=${encodeURIComponent(f.relativePath)}`,
                              { method: 'DELETE' },
                            );
                            if (previewRelPath === f.relativePath) {
                              setPreviewRelPath(null);
                            }
                            void refreshFiles();
                          }}
                          className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-md"
                          title="Xóa file"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Compact Media / Text Preview */}
            <div className="lg:col-span-5">
              {previewRelPath ? (
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-[11px] text-indigo-300 font-mono">
                    <span className="truncate">
                      {isPreviewText ? 'Đang xem' : 'Đang phát'}: {previewRelPath}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {isPreviewText && previewTextContent && (
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(previewTextContent);
                            setCopiedPreviewText(true);
                            setTimeout(() => setCopiedPreviewText(false), 1800);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-600/80 hover:bg-indigo-500 text-white font-sans font-semibold text-[10px]"
                        >
                          {copiedPreviewText ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedPreviewText ? 'Đã chép' : 'Sao chép'}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          void handleSafeDownload(
                            previewRelPath,
                            previewRelPath.split('/').filter(Boolean).pop(),
                          )
                        }
                        className="text-emerald-300 hover:text-emerald-200 font-sans font-semibold shrink-0"
                      >
                        Tải về
                      </button>
                    </div>
                  </div>
                  {isPreviewText ? (
                    <pre className="w-full max-h-[220px] overflow-y-auto rounded-lg bg-slate-900 p-2.5 text-[11px] leading-relaxed text-slate-100 whitespace-pre-wrap font-sans">
                      {previewTextContent || 'Đang tải nội dung...'}
                    </pre>
                  ) : isPreviewAudio ? (
                    <audio
                      key={previewRelPath}
                      controls
                      src={`/api/output/download?path=${encodeURIComponent(previewRelPath)}&inline=1`}
                      className="w-full"
                    />
                  ) : (
                    <video
                      key={previewRelPath}
                      controls
                      src={`/api/output/download?path=${encodeURIComponent(previewRelPath)}&inline=1`}
                      className="w-full max-h-[220px] rounded-lg bg-black"
                    />
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center space-y-1.5">
                  <Eye className="w-5 h-5 text-slate-400 mx-auto" />
                  <div className="text-xs font-semibold text-slate-700">Xem thử nhanh Output</div>
                  <p className="text-[11px] text-slate-500">
                    Bấm nút phát ở danh sách bên trái để xem ngay video/audio vừa xuất từ mọi tab.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
