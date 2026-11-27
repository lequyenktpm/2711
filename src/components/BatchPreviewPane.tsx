import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Shuffle, Volume2, VolumeX, X } from 'lucide-react';
import {
  ensureProjectAssetsLoaded,
  getStageDimensionsForAspect,
  renderProjectFrame,
} from '../engine/canvasRenderer';
import {
  CANVAS_THEMES,
  CanvasThemeId,
  LessonProject,
} from '../engine/types';

interface BatchPreviewPaneProps {
  project: LessonProject;
  audioFile: File | null;
  isBusy?: boolean;
  onChangeTheme: (theme: CanvasThemeId) => void;
  onRandomizeLayout: () => void;
  onClose: () => void;
}

const fmtSec = (sec: number): string => {
  const mins = Math.floor(sec / 60);
  const secs = (sec % 60).toFixed(2).padStart(5, '0');
  return `${String(mins).padStart(2, '0')}:${secs}`;
};

export const BatchPreviewPane: React.FC<BatchPreviewPaneProps> = ({
  project,
  audioFile,
  isBusy = false,
  onChangeTheme,
  onRandomizeLayout,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  const [assetVersion, setAssetVersion] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(() =>
    Math.min(Math.max(0.5, project.cues[0]?.start ? project.cues[0].start + 0.5 : 1.2), project.duration),
  );
  const [isMuted, setIsMuted] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Reset time & playback cleanly whenever another batch item is selected
  useEffect(() => {
    setIsPlaying(false);
    const previewStart = project.cues[0]
      ? Math.min(project.duration, project.cues[0].start + 0.45)
      : Math.min(project.duration, 1.0);
    setCurrentTime(Number(previewStart.toFixed(2)));
  }, [project.id, project.duration, project.cues]);

  // Preload custom background image before rendering preview frames
  useEffect(() => {
    let active = true;
    if (project.backgroundImage?.dataUrl) {
      void ensureProjectAssetsLoaded(project).then(() => {
        if (active) setAssetVersion((v) => v + 1);
      });
    }
    return () => {
      active = false;
    };
  }, [project]);

  // Object URL lifecycle for item's audio file
  useEffect(() => {
    if (!audioFile) {
      setAudioUrl(null);
      return;
    }
    const url = URL.createObjectURL(audioFile);
    setAudioUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [audioFile]);

  // Draw current Canvas frame
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderProjectFrame(ctx, project, currentTime, null);
  }, [project, currentTime, assetVersion]);

  // Playback loop synced with audio or requestAnimationFrame
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      lastTsRef.current = null;
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
      return;
    }

    if (audioRef.current && audioUrl) {
      audioRef.current.currentTime = currentTime;
      audioRef.current.muted = isMuted;
      audioRef.current.play().catch(() => undefined);
    }

    const tick = (now: number) => {
      if (audioRef.current && audioUrl && !audioRef.current.paused) {
        const t = audioRef.current.currentTime;
        if (t >= project.duration) {
          setCurrentTime(0);
          setIsPlaying(false);
          return;
        }
        setCurrentTime(t);
      } else {
        if (lastTsRef.current === null) lastTsRef.current = now;
        const dt = (now - lastTsRef.current) / 1000;
        lastTsRef.current = now;
        setCurrentTime((prev) => {
          const next = prev + dt;
          if (next >= project.duration) {
            setIsPlaying(false);
            return 0;
          }
          return next;
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, project.duration, audioUrl, isMuted]);

  const handleSeek = (t: number) => {
    const clamped = Math.max(0, Math.min(project.duration, t));
    setCurrentTime(clamped);
    if (audioRef.current && audioUrl) {
      audioRef.current.currentTime = clamped;
    }
  };

  const themeChoices = Object.values(CANVAS_THEMES);

  return (
    <aside
      aria-label="Xem trước video trong hàng đợi Batch"
      className="flex flex-col bg-slate-50/90 border-t lg:border-t-0 lg:border-l border-slate-200 p-4 h-full min-h-0 overflow-y-auto"
    >
      {audioUrl && <audio ref={audioRef} src={audioUrl} muted={isMuted} />}

      {/* Header */}
      <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-200">
        <div className="min-w-0">
          <h3 className="text-xs font-bold text-slate-900 truncate">
            Xem trước: {project.title}
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate tabular-nums">
            {CANVAS_THEMES[project.theme]?.name ?? project.theme} · {project.cues.length} câu ·{' '}
            {project.duration.toFixed(1)}s
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Đóng khung xem trước"
          className="p-1 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-200/70 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Theme swatches + context-locked randomize */}
      <div className="pt-2.5 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {themeChoices.map((theme) => (
            <button
              key={theme.id}
              type="button"
              disabled={isBusy}
              onClick={() => onChangeTheme(theme.id)}
              title={theme.name}
              aria-label={`Chọn nền ${theme.name}`}
              className={`w-6 h-6 rounded-md border transition-transform ${
                project.theme === theme.id
                  ? 'border-indigo-600 ring-2 ring-indigo-200 scale-105'
                  : 'border-slate-300 hover:scale-105'
              } disabled:opacity-40`}
              style={{
                background: `linear-gradient(180deg, ${theme.bgTop} 0%, ${theme.bgBottom} 100%)`,
              }}
            />
          ))}
        </div>

        <button
          type="button"
          disabled={isBusy}
          onClick={onRandomizeLayout}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 disabled:opacity-40 whitespace-nowrap shrink-0"
        >
          <Shuffle className="w-3 h-3" />
          <span>Random bố cục</span>
        </button>
      </div>

      {/* Live Aspect-Adaptive Canvas */}
      <div className="my-3 flex items-center justify-center flex-1 min-h-0">
        {(() => {
          const aspect = project.aspectRatio || '9:16';
          const dims = getStageDimensionsForAspect(aspect);
          const containerCls =
            aspect === '16:9'
              ? 'w-full max-w-[440px] aspect-video rounded-2xl'
              : aspect === '1:1'
                ? 'w-full max-w-[360px] aspect-square rounded-2xl'
                : aspect === '4:5'
                  ? 'w-full max-w-[310px] aspect-[4/5] rounded-2xl'
                  : 'h-[380px] sm:h-[420px] aspect-[9/16] rounded-2xl';
          return (
            <div className={`${containerCls} overflow-hidden border border-slate-300 shadow-sm bg-slate-900`}>
              <canvas
                ref={canvasRef}
                data-testid="batch-preview-canvas"
                width={dims.width}
                height={dims.height}
                className="w-full h-full block"
              />
            </div>
          );
        })()}
      </div>

      {/* Timeline Scrubber & Transport */}
      <div className="pt-2.5 border-t border-slate-200 space-y-2">
        <div className="flex items-center gap-2.5">
          <input
            type="range"
            aria-label="Thanh tua thời gian Batch Preview"
            min={0}
            max={Math.max(0.5, project.duration)}
            step={0.02}
            value={currentTime}
            onChange={(e) => handleSeek(Number(e.target.value))}
            className="flex-1 accent-indigo-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
          />
          <span className="text-[11px] font-mono text-slate-600 tabular-nums shrink-0">
            {fmtSec(currentTime)} / {fmtSec(project.duration)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isPlaying ? 'Tạm dừng' : 'Phát thử'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                handleSeek(0);
                setIsPlaying(true);
              }}
              aria-label="Phát lại từ đầu"
              className="p-1.5 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {audioFile ? (
            <button
              type="button"
              onClick={() => setIsMuted((m) => !m)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 whitespace-nowrap shrink-0"
              title={isMuted ? 'Bật tiếng' : 'Tắt tiếng'}
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              <span>{isMuted ? 'Đang tắt tiếng' : 'Có Audio'}</span>
            </button>
          ) : (
            <span className="text-[11px] text-slate-400">Không có audio</span>
          )}
        </div>
      </div>
    </aside>
  );
};
