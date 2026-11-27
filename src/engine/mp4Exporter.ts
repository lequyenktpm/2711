import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import {
  ensureProjectAssetsLoaded,
  getStageDimensionsForAspect,
  renderProjectFrame,
  seekProjectVideoAssets,
} from './canvasRenderer';
import {
  DEFAULT_MP4_EXPORT_SETTINGS,
  Mp4ExportSettings,
  resolveMp4EncodingParams,
  ResolvedMp4Encoding,
} from './mp4Config';
import { cleanOutputTitleStem, resolveTabOutputSubfolder } from './outputNaming';
import { LessonProject } from './types';

export interface ExportVideoProgress {
  progress: number;
  stageLabel: string;
}

export interface ExportVideoResult {
  format: 'mp4' | 'webm';
  fileName: string;
  byteLength: number;
  width: number;
  height: number;
  fps: number;
  qualityLabel: string;
  blob?: Blob;
  savedPath?: string;
  relativePath?: string;
}

export class ExportAbortedError extends Error {
  constructor(message = 'Đã hủy quá trình xuất video.') {
    super(message);
    this.name = 'ExportAbortedError';
  }
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new ExportAbortedError();
  }
}

function sanitizeFileBase(raw: string): string {
  return cleanOutputTitleStem(raw, 'KineticSub Video');
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function renderScaledProjectFrame(
  ctx: CanvasRenderingContext2D,
  project: LessonProject,
  time: number,
  targetWidth: number,
  targetHeight: number,
): void {
  const stage = getStageDimensionsForAspect(project.aspectRatio);
  ctx.save();
  ctx.scale(targetWidth / stage.width, targetHeight / stage.height);
  renderProjectFrame(ctx, project, time, null);
  ctx.restore();
}

interface SupportedVideoEncoderSpec {
  webCodec: string;
  muxerCodec: 'avc' | 'vp9';
}

async function pickSupportedVideoCodec(
  width: number,
  height: number,
  fps: number,
  bitrate: number,
): Promise<SupportedVideoEncoderSpec | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    return null;
  }

  const candidates: SupportedVideoEncoderSpec[] =
    width >= 1440
      ? [
          { webCodec: 'avc1.640033', muxerCodec: 'avc' },
          { webCodec: 'avc1.4d0033', muxerCodec: 'avc' },
          { webCodec: 'avc1.420033', muxerCodec: 'avc' },
          { webCodec: 'vp09.00.50.08', muxerCodec: 'vp9' },
          { webCodec: 'vp09.00.10.08', muxerCodec: 'vp9' },
        ]
      : [
          { webCodec: 'avc1.64002a', muxerCodec: 'avc' },
          { webCodec: 'avc1.4d002a', muxerCodec: 'avc' },
          { webCodec: 'avc1.42002a', muxerCodec: 'avc' },
          { webCodec: 'avc1.42001f', muxerCodec: 'avc' },
          { webCodec: 'vp09.00.10.08', muxerCodec: 'vp9' },
        ];

  for (const item of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: item.webCodec,
        width,
        height,
        bitrate,
        framerate: fps,
      });
      if (support.supported) {
        return item;
      }
    } catch {
      // Try next candidate
    }
  }

  return null;
}

interface SupportedAudioEncoderSpec {
  webCodec: string;
  muxerCodec: 'aac' | 'opus';
  sampleRate: number;
  channels: number;
  bitrate: number;
}

async function pickSupportedAudioCodec(
  preferredSampleRate: number,
  channels: number,
  bitrate: number,
): Promise<SupportedAudioEncoderSpec | null> {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') {
    return null;
  }

  const aacSampleRate =
    preferredSampleRate === 44100 || preferredSampleRate === 48000 ? preferredSampleRate : 48000;

  const candidates: SupportedAudioEncoderSpec[] = [
    {
      webCodec: 'mp4a.40.2',
      muxerCodec: 'aac',
      sampleRate: aacSampleRate,
      channels,
      bitrate,
    },
    {
      webCodec: 'opus',
      muxerCodec: 'opus',
      sampleRate: 48000,
      channels,
      bitrate,
    },
  ];

  for (const item of candidates) {
    try {
      const support = await AudioEncoder.isConfigSupported({
        codec: item.webCodec,
        sampleRate: item.sampleRate,
        numberOfChannels: item.channels,
        bitrate: item.bitrate,
      });
      if (support.supported) {
        return item;
      }
    } catch {
      // Try next candidate
    }
  }

  return null;
}

async function decodeAndResampleAudio(
  audioFile: File,
  maxDurationSec: number,
  audioBitrate: number,
): Promise<{ buffer: AudioBuffer; spec: SupportedAudioEncoderSpec } | null> {
  const audioCtx = new AudioContext();
  try {
    const decoded = await audioCtx.decodeAudioData(await audioFile.arrayBuffer());
    const channels = Math.max(1, Math.min(2, decoded.numberOfChannels));
    const spec = await pickSupportedAudioCodec(decoded.sampleRate, channels, audioBitrate);
    if (!spec) {
      return null;
    }

    const targetDuration = Math.min(decoded.duration, maxDurationSec);
    if (decoded.sampleRate === spec.sampleRate && decoded.numberOfChannels === channels) {
      return { buffer: decoded, spec };
    }

    const targetLength = Math.max(1, Math.ceil(targetDuration * spec.sampleRate));
    const offline = new OfflineAudioContext(channels, targetLength, spec.sampleRate);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start(0);
    const resampled = await offline.startRendering();
    return { buffer: resampled, spec };
  } finally {
    await audioCtx.close().catch(() => undefined);
  }
}

async function exportWithWebCodecsMp4(
  project: LessonProject,
  audioFile: File | null,
  encoding: ResolvedMp4Encoding,
  onProgress: (info: ExportVideoProgress) => void,
  options?: {
    signal?: AbortSignal;
    skipDownload?: boolean;
    customFileBase?: string;
    customRenderFrame?: (ctx: CanvasRenderingContext2D, time: number, width: number, height: number) => void;
    onBeforeRenderFrame?: (time: number) => Promise<void>;
  },
): Promise<ExportVideoResult | null> {
  checkAborted(options?.signal);
  const safeWidth = encoding.width & ~1;
  const safeHeight = encoding.height & ~1;
  const videoSpec = await pickSupportedVideoCodec(
    safeWidth,
    safeHeight,
    encoding.fps,
    encoding.videoBitrate,
  );
  if (!videoSpec) {
    return null;
  }
  await ensureProjectAssetsLoaded(project);

  let preparedAudio: { buffer: AudioBuffer; spec: SupportedAudioEncoderSpec } | null = null;
  if (audioFile) {
    onProgress({ progress: 0.03, stageLabel: 'Đang giải mã & đồng bộ Audio...' });
    try {
      preparedAudio = await decodeAndResampleAudio(
        audioFile,
        project.duration,
        encoding.audioBitrate,
      );
      if (!preparedAudio) {
        // Browser lacks AAC/Opus AudioEncoder; fall back cleanly to FFmpeg/WebM so audio isn't lost
        return null;
      }
    } catch {
      return null;
    }
  }

  const totalAudioFrames = preparedAudio
    ? Math.min(
        preparedAudio.buffer.length,
        Math.ceil(Math.max(0.1, project.duration) * preparedAudio.spec.sampleRate),
      )
    : 0;
  const hasValidAudio = Boolean(preparedAudio && totalAudioFrames > 0);

  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = safeWidth;
  offscreenCanvas.height = safeHeight;
  const ctx = offscreenCanvas.getContext('2d', { alpha: false });
  if (!ctx) {
    return null;
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: videoSpec.muxerCodec,
      width: safeWidth,
      height: safeHeight,
      frameRate: encoding.fps,
    },
    audio: hasValidAudio && preparedAudio
      ? {
          codec: preparedAudio.spec.muxerCodec,
          numberOfChannels: preparedAudio.spec.channels,
          sampleRate: preparedAudio.spec.sampleRate,
        }
      : undefined,
    fastStart: 'in-memory',
  });

  let encoderError: unknown = null;

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => {
      encoderError = err;
    },
  });

  videoEncoder.configure({
    codec: videoSpec.webCodec,
    width: safeWidth,
    height: safeHeight,
    bitrate: encoding.videoBitrate,
    framerate: encoding.fps,
  });

  let audioEncoder: AudioEncoder | null = null;
  if (hasValidAudio && preparedAudio) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (err) => {
        encoderError = err;
      },
    });
    audioEncoder.configure({
      codec: preparedAudio.spec.webCodec,
      sampleRate: preparedAudio.spec.sampleRate,
      numberOfChannels: preparedAudio.spec.channels,
      bitrate: preparedAudio.spec.bitrate,
    });
  }

  try {
    const totalFrames = Math.max(1, Math.ceil(project.duration * encoding.fps));
    const frameDurationUs = Math.round(1_000_000 / encoding.fps);
    const keyInterval = encoding.fps * 2;

    for (let i = 0; i < totalFrames; i++) {
      checkAborted(options?.signal);
      if (encoderError) throw encoderError;

      const t = Math.min(project.duration, i / encoding.fps);
      if (options?.onBeforeRenderFrame) {
        await options.onBeforeRenderFrame(t);
      } else {
        await seekProjectVideoAssets(project, t);
      }
      if (options?.customRenderFrame) {
        options.customRenderFrame(ctx, t, safeWidth, safeHeight);
      } else {
        renderScaledProjectFrame(ctx, project, t, safeWidth, safeHeight);
      }

      const frame = new VideoFrame(offscreenCanvas, {
        timestamp: Math.round((i * 1_000_000) / encoding.fps),
        duration: frameDurationUs,
      });

      while (videoEncoder.encodeQueueSize > 8) {
        checkAborted(options?.signal);
        if (encoderError) {
          frame.close();
          throw encoderError;
        }
        await new Promise((r) => setTimeout(r, 4));
      }

      videoEncoder.encode(frame, { keyFrame: i % keyInterval === 0 });
      frame.close();

      if (i % 4 === 0 || i === totalFrames - 1) {
        onProgress({
          progress: 0.05 + ((i + 1) / totalFrames) * (hasValidAudio ? 0.78 : 0.88),
          stageLabel: `Đang dựng & nén MP4 ${safeWidth}×${safeHeight} (${i + 1}/${totalFrames})...`,
        });
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    if (audioEncoder && preparedAudio && hasValidAudio) {
      checkAborted(options?.signal);
      onProgress({ progress: 0.86, stageLabel: 'Đang ghép track Audio vào MP4...' });
      const { buffer, spec } = preparedAudio;
      const chunkFrames = 4096;

      for (let offset = 0; offset < totalAudioFrames; offset += chunkFrames) {
        checkAborted(options?.signal);
        if (encoderError) throw encoderError;
        const count = Math.min(chunkFrames, totalAudioFrames - offset);
        const planar = new Float32Array(count * spec.channels);
        for (let ch = 0; ch < spec.channels; ch++) {
          const channelData = buffer.getChannelData(ch);
          planar.set(channelData.subarray(offset, offset + count), ch * count);
        }
        const audioData = new AudioData({
          format: 'f32-planar',
          sampleRate: spec.sampleRate,
          numberOfFrames: count,
          numberOfChannels: spec.channels,
          timestamp: Math.round((offset * 1_000_000) / spec.sampleRate),
          data: planar,
        });
        while (audioEncoder.encodeQueueSize > 16) {
          checkAborted(options?.signal);
          await new Promise((r) => setTimeout(r, 2));
        }
        audioEncoder.encode(audioData);
        audioData.close();
      }
    }

    checkAborted(options?.signal);
    onProgress({ progress: 0.94, stageLabel: 'Đang đóng gói file .mp4...' });
    await videoEncoder.flush();
    if (audioEncoder) {
      await audioEncoder.flush();
    }
    if (encoderError) throw encoderError;

    muxer.finalize();
    const mp4Blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
    const base = sanitizeFileBase(options?.customFileBase || project.title || project.id);
    const fileName = `${base}.mp4`;
    if (!options?.skipDownload) {
      triggerBlobDownload(mp4Blob, fileName);
      onProgress({ progress: 1, stageLabel: 'Đã tải xong file MP4!' });
    } else {
      onProgress({ progress: 0.96, stageLabel: 'Đã đóng gói MP4, đang lưu ra ổ cứng...' });
    }
    return {
      format: 'mp4',
      fileName,
      byteLength: mp4Blob.size,
      width: safeWidth,
      height: safeHeight,
      fps: encoding.fps,
      qualityLabel: encoding.qualityLabel,
      blob: mp4Blob,
    };
  } finally {
    try {
      if (videoEncoder.state !== 'closed') videoEncoder.close();
    } catch {
      // ignore
    }
    try {
      if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close();
    } catch {
      // ignore
    }
    offscreenCanvas.width = 0;
    offscreenCanvas.height = 0;
  }
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Không thể mã hóa khung hình JPEG từ canvas.'));
      },
      'image/jpeg',
      quality,
    );
  });
}

const MAX_UPLOAD_CHUNK_BYTES = 550 * 1024;
const MAX_FRAMES_PER_BATCH = 10;

async function postBinaryWithRetry(
  url: string,
  body: Blob,
  headers: Record<string, string>,
  label: string,
  signal?: AbortSignal,
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    checkAborted(signal);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal,
      });
      if (res.ok) return res;

      const text = await res.text().catch(() => '');
      let detail = text;
      try {
        const parsed = JSON.parse(text) as { error?: string };
        if (parsed.error) detail = parsed.error;
      } catch {
        // plain text response
      }
      lastError = new Error(
        res.status === 404 && url.includes('/api/render/')
          ? `${label} (HTTP 404: Render job trên server không còn tồn tại — có thể server vừa khởi động lại. Hãy thử Render lại).`
          : `${label} (HTTP ${res.status}${detail ? `: ${detail.slice(0, 140)}` : ''})`,
      );

      if (res.status !== 429 && res.status < 500) {
        throw lastError;
      }
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
        throw new ExportAbortedError();
      }
      if (err instanceof Error && err.message.startsWith(label)) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
  }
  throw lastError ?? new Error(label);
}

export async function exportBlobToServerOutput(
  blob: Blob,
  fileName: string,
  savePath?: string,
  signal?: AbortSignal,
  sourceTab?: string,
): Promise<{ savedPath: string; relativePath?: string; fileName: string; byteLength: number }> {
  const resolvedFolder = resolveTabOutputSubfolder(sourceTab, savePath);
  const chunkLimit = 4 * 1024 * 1024;
  let lastJson: { savedPath?: string; relativePath?: string; fileName?: string; bytes?: number } = {};
  for (let offset = 0; offset < blob.size; offset += chunkLimit) {
    checkAborted(signal);
    const slice = blob.slice(offset, offset + chunkLimit);
    const appendQuery = offset > 0 ? '?append=1' : '';
    const res = await postBinaryWithRetry(
      `/api/output/save${appendQuery}`,
      slice,
      {
        'Content-Type': 'application/octet-stream',
        'x-file-name': encodeURIComponent(fileName),
        'x-save-path': encodeURIComponent(resolvedFolder),
        ...(sourceTab ? { 'x-source-tab': encodeURIComponent(sourceTab) } : {}),
      },
      'Lỗi lưu file MP4 vào thư mục output',
      signal,
    );
    lastJson = (await res.json().catch(() => ({}))) as typeof lastJson;
  }
  return {
    savedPath: lastJson.savedPath || `output/${resolvedFolder}/${fileName}`,
    relativePath: lastJson.relativePath,
    fileName: lastJson.fileName || fileName,
    byteLength: lastJson.bytes ?? blob.size,
  };
}

export async function saveCompanionTextToServerOutput(
  fileName: string,
  textContent: string,
  savePath?: string,
  sourceTab?: string,
  signal?: AbortSignal,
): Promise<{ savedPath: string; relativePath?: string; fileName: string; byteLength: number } | null> {
  if (!textContent.trim()) return null;
  const resolvedFolder = resolveTabOutputSubfolder(sourceTab, savePath);
  const res = await fetch('/api/output/save-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName,
      textContent,
      savePath: resolvedFolder,
      sourceTab,
    }),
    signal,
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as {
    savedPath?: string;
    relativePath?: string;
    fileName?: string;
    bytes?: number;
  };
  return {
    savedPath: data.savedPath || `output/${resolvedFolder}/${fileName}`,
    relativePath: data.relativePath,
    fileName: data.fileName || fileName,
    byteLength: data.bytes ?? textContent.length,
  };
}

async function exportWithServerFfmpeg(
  project: LessonProject,
  audioFile: File | null,
  encoding: ResolvedMp4Encoding,
  onProgress: (info: ExportVideoProgress) => void,
  signal?: AbortSignal,
  customFileBase?: string,
): Promise<ExportVideoResult> {
  checkAborted(signal);
  await ensureProjectAssetsLoaded(project);
  onProgress({ progress: 0.01, stageLabel: 'Đang khởi tạo bộ dựng MP4 (FFmpeg)...' });

  const startRes = await fetch('/api/render/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fps: encoding.fps, crf: encoding.crf }),
    signal,
  });

  if (!startRes.ok) {
    throw new Error(`Server FFmpeg không khả dụng (HTTP ${startRes.status}).`);
  }

  const { jobId } = (await startRes.json()) as { jobId: string };
  let offscreenCanvas: HTMLCanvasElement | null = null;

  try {
    if (audioFile) {
      checkAborted(signal);
      onProgress({ progress: 0.04, stageLabel: 'Đang nạp file Audio vào hàng đợi FFmpeg...' });
      const dotIdx = audioFile.name.lastIndexOf('.');
      const ext = dotIdx >= 0 ? audioFile.name.slice(dotIdx) : '.mp3';

      for (let offset = 0; offset < audioFile.size; offset += MAX_UPLOAD_CHUNK_BYTES) {
        const slice = audioFile.slice(offset, offset + MAX_UPLOAD_CHUNK_BYTES);
        const appendQuery = offset > 0 ? '?append=1' : '';
        await postBinaryWithRetry(
          `/api/render/${jobId}/audio${appendQuery}`,
          slice,
          {
            'Content-Type': 'application/octet-stream',
            'x-audio-ext': ext,
          },
          'Không thể tải file Audio lên máy chủ render',
          signal,
        );
      }
    }

    const safeWidth = encoding.width & ~1;
    const safeHeight = encoding.height & ~1;
    offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = safeWidth;
    offscreenCanvas.height = safeHeight;
    const ctx = offscreenCanvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Không khởi tạo được Canvas 2D để dựng khung hình.');
    }

    const totalFrames = Math.max(1, Math.ceil(project.duration * encoding.fps));
    let batch: Blob[] = [];
    let batchBytes = 0;
    let pendingUpload: Promise<Response | void> = Promise.resolve();

    const flushBatch = async () => {
      if (batch.length === 0) return;
      const chunkBlob = new Blob(batch, { type: 'application/octet-stream' });
      batch = [];
      batchBytes = 0;
      await pendingUpload;
      pendingUpload = postBinaryWithRetry(
        `/api/render/${jobId}/frames`,
        chunkBlob,
        { 'Content-Type': 'application/octet-stream' },
        'Lỗi truyền dữ liệu khung hình lên FFmpeg',
        signal,
      );
    };

    for (let i = 0; i < totalFrames; i++) {
      checkAborted(signal);
      const t = Math.min(project.duration, i / encoding.fps);
      await seekProjectVideoAssets(project, t);
      renderScaledProjectFrame(ctx, project, t, safeWidth, safeHeight);
      const jpeg = await canvasToJpegBlob(offscreenCanvas, 0.85);

      if (
        batch.length > 0 &&
        (batch.length >= MAX_FRAMES_PER_BATCH || batchBytes + jpeg.size > MAX_UPLOAD_CHUNK_BYTES)
      ) {
        await flushBatch();
        await new Promise((r) => setTimeout(r, 0));
      }

      batch.push(jpeg);
      batchBytes += jpeg.size;

      if (i % 6 === 0 || i === totalFrames - 1) {
        onProgress({
          progress: 0.05 + ((i + 1) / totalFrames) * 0.8,
          stageLabel: `Đang dựng khung hình ${safeWidth}×${safeHeight} (${i + 1}/${totalFrames})...`,
        });
      }

      if (i === totalFrames - 1) {
        await flushBatch();
      }
    }

    await pendingUpload;
    checkAborted(signal);

    onProgress({
      progress: 0.9,
      stageLabel: 'Đang ghép MP4 (FFmpeg H.264 / AAC)...',
    });

    const exportBaseName = sanitizeFileBase(customFileBase || project.title || project.id);
    const finishRes = await fetch(`/api/render/${jobId}/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: exportBaseName }),
      signal,
    });

    if (!finishRes.ok) {
      const errBody = await finishRes.json().catch(() => ({}));
      throw new Error((errBody as { error?: string }).error || 'FFmpeg không thể xuất MP4.');
    }

    const mp4Blob = await finishRes.blob();
    const fileName = `${exportBaseName}.mp4`;
    triggerBlobDownload(mp4Blob, fileName);

    onProgress({ progress: 1, stageLabel: 'Đã tải xong file MP4!' });
    return {
      format: 'mp4',
      fileName,
      byteLength: mp4Blob.size,
      width: safeWidth,
      height: safeHeight,
      fps: encoding.fps,
      qualityLabel: encoding.qualityLabel,
      blob: mp4Blob,
    };
  } catch (err) {
    void fetch(`/api/render/${jobId}`, { method: 'DELETE' }).catch(() => undefined);
    if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw new ExportAbortedError();
    }
    throw err;
  } finally {
    if (offscreenCanvas) {
      offscreenCanvas.width = 0;
      offscreenCanvas.height = 0;
    }
  }
}

async function exportProjectToWebmFallback(
  project: LessonProject,
  audioFile: File | null,
  encoding: ResolvedMp4Encoding,
  onProgress: (info: ExportVideoProgress) => void,
  signal?: AbortSignal,
): Promise<ExportVideoResult> {
  checkAborted(signal);
  await ensureProjectAssetsLoaded(project);
  const canvas = document.createElement('canvas');
  canvas.width = encoding.width;
  canvas.height = encoding.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Không khởi tạo được Canvas 2D.');

  let audioCtx: AudioContext | null = null;
  let audioSource: AudioBufferSourceNode | null = null;

  try {
    const videoStream = canvas.captureStream(encoding.fps);
    const tracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];

    if (audioFile) {
      try {
        audioCtx = new AudioContext();
        const buffer = await audioCtx.decodeAudioData(await audioFile.arrayBuffer());
        const dest = audioCtx.createMediaStreamDestination();
        audioSource = audioCtx.createBufferSource();
        audioSource.buffer = buffer;
        audioSource.connect(dest);
        tracks.push(...dest.stream.getAudioTracks());
      } catch {
        // Ignore audio decode fallback
      }
    }

    const combinedStream = new MediaStream(tracks);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';

    const recorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: encoding.videoBitrate,
    });

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunks.push(ev.data);
    };

    const donePromise = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    recorder.start(100);
    if (audioSource) audioSource.start(0);

    const stepMs = 1000 / encoding.fps;
    const totalFrames = Math.max(1, Math.ceil(project.duration * encoding.fps));

    for (let i = 0; i <= totalFrames; i++) {
      if (signal?.aborted) {
        if (audioSource) {
          try {
            audioSource.stop();
          } catch {
            // ignore
          }
        }
        if (recorder.state !== 'inactive') recorder.stop();
        throw new ExportAbortedError();
      }
      const t = Math.min(project.duration, i / encoding.fps);
      await seekProjectVideoAssets(project, t);
      renderScaledProjectFrame(ctx, project, t, encoding.width, encoding.height);
      onProgress({
        progress: i / totalFrames,
        stageLabel: `Đang ghi Video WebM ${encoding.width}×${encoding.height} (${Math.round((i / totalFrames) * 100)}%)...`,
      });
      await new Promise((r) => setTimeout(r, stepMs));
    }

    if (audioSource) {
      try {
        audioSource.stop();
      } catch {
        // already stopped
      }
    }
    recorder.stop();
    await donePromise;

    const blob = new Blob(chunks, { type: 'video/webm' });
    const fileName = `${sanitizeFileBase(project.title || project.id)}.webm`;
    triggerBlobDownload(blob, fileName);
    return {
      format: 'webm',
      fileName,
      byteLength: blob.size,
      width: encoding.width,
      height: encoding.height,
      fps: encoding.fps,
      qualityLabel: encoding.qualityLabel,
      blob,
    };
  } finally {
    if (audioCtx) {
      await audioCtx.close().catch(() => undefined);
    }
  }
}

export async function exportProjectToVideo(
  project: LessonProject,
  audioFile: File | null,
  onProgress: (info: ExportVideoProgress) => void,
  settings: Mp4ExportSettings = DEFAULT_MP4_EXPORT_SETTINGS,
  options?: {
    signal?: AbortSignal;
    skipDownload?: boolean;
    customFileBase?: string;
    alsoSaveToServerOutput?: boolean;
    savePath?: string;
    sourceTab?: string;
    companionText?: string;
    customRenderFrame?: (ctx: CanvasRenderingContext2D, time: number, width: number, height: number) => void;
    onBeforeRenderFrame?: (time: number) => Promise<void>;
  },
): Promise<ExportVideoResult> {
  const effectiveAspect = settings.aspectRatio || project.aspectRatio || '9:16';
  const effectiveSettings: Mp4ExportSettings = { ...settings, aspectRatio: effectiveAspect };
  const effectiveProject: LessonProject =
    project.aspectRatio === effectiveAspect ? project : { ...project, aspectRatio: effectiveAspect };
  const encoding = resolveMp4EncodingParams(effectiveSettings);
  checkAborted(options?.signal);
  onProgress({
    progress: 0.01,
    stageLabel: `Đang khởi tạo bộ dựng MP4 (${encoding.width}×${encoding.height} @ ${encoding.fps}fps)...`,
  });

  const finalizeArchive = async (res: ExportVideoResult): Promise<ExportVideoResult> => {
    const txtBody = options?.companionText?.trim();
    const txtFileName = res.fileName.replace(/\.(mp4|webm|mov)$/i, '') + '.txt';
    if (txtBody && !options?.skipDownload && !options?.signal?.aborted) {
      const txtBlob = new Blob([txtBody], { type: 'text/plain;charset=utf-8' });
      setTimeout(() => triggerBlobDownload(txtBlob, txtFileName), 250);
    }
    if (options?.alsoSaveToServerOutput && res.blob && !options?.signal?.aborted) {
      try {
        onProgress({ progress: 0.98, stageLabel: 'Đang lưu thêm bản sao vào thư mục output...' });
        const saved = await exportBlobToServerOutput(
          res.blob,
          res.fileName,
          options.savePath,
          options.signal,
          options.sourceTab,
        );
        if (txtBody) {
          await saveCompanionTextToServerOutput(
            txtFileName,
            txtBody,
            options.savePath,
            options.sourceTab,
            options.signal,
          ).catch(() => null);
        }
        onProgress({ progress: 1, stageLabel: `Hoàn tất! Đã lưu: ${saved.savedPath}` });
        return { ...res, savedPath: saved.savedPath, relativePath: saved.relativePath };
      } catch (err) {
        if (err instanceof ExportAbortedError || options?.signal?.aborted) {
          throw new ExportAbortedError();
        }
        // Keep browser download result even if server archive fails
      }
    }
    return res;
  };

  // 1. Primary path: 100% browser-native WebCodecs + mp4-muxer (zero server state, immune to multi-instance 404)
  try {
    const webCodecsResult = await exportWithWebCodecsMp4(effectiveProject, audioFile, encoding, onProgress, options);
    if (webCodecsResult) {
      return await finalizeArchive(webCodecsResult);
    }
  } catch (err) {
    if (err instanceof ExportAbortedError || options?.signal?.aborted) {
      throw new ExportAbortedError();
    }
    console.warn('WebCodecs MP4 export failed, falling back to server/WebM:', err);
  }

  // 2. Fallback path: Server FFmpeg or WebM MediaRecorder
  try {
    const serverRes = await exportWithServerFfmpeg(
      effectiveProject,
      audioFile,
      encoding,
      onProgress,
      options?.signal,
      options?.customFileBase,
    );
    return await finalizeArchive(serverRes);
  } catch (err) {
    if (err instanceof ExportAbortedError || options?.signal?.aborted) {
      throw new ExportAbortedError();
    }
    const webmRes = await exportProjectToWebmFallback(effectiveProject, audioFile, encoding, onProgress, options?.signal);
    return await finalizeArchive(webmRes);
  }
}

export async function exportProjectToServerDisk(
  project: LessonProject,
  audioFile: File | null,
  onProgress: (info: ExportVideoProgress) => void,
  settings: Mp4ExportSettings = DEFAULT_MP4_EXPORT_SETTINGS,
  customBaseName?: string,
  customSavePath?: string,
  options?: {
    signal?: AbortSignal;
    directoryHandle?: any;
    sourceTab?: string;
    companionText?: string;
    customRenderFrame?: (ctx: CanvasRenderingContext2D, time: number, width: number, height: number) => void;
    onBeforeRenderFrame?: (time: number) => Promise<void>;
  },
): Promise<{ savedPath: string; relativePath?: string; fileName: string; byteLength: number }> {
  checkAborted(options?.signal);
  const effectiveAspect = settings.aspectRatio || project.aspectRatio || '9:16';
  const effectiveSettings: Mp4ExportSettings = { ...settings, aspectRatio: effectiveAspect };
  const effectiveProject: LessonProject =
    project.aspectRatio === effectiveAspect ? project : { ...project, aspectRatio: effectiveAspect };
  await ensureProjectAssetsLoaded(effectiveProject);
  const encoding = resolveMp4EncodingParams(effectiveSettings);
  const baseName = sanitizeFileBase(customBaseName || effectiveProject.title || effectiveProject.id);
  const targetFileName = `${baseName}.mp4`;
  const targetTxtName = `${baseName}.txt`;
  const txtBody = options?.companionText?.trim() || '';

  // Primary WebCodecs path: Build finished MP4 locally in browser, then save directly to picked folder or /api/output/save
  // Eliminates chunked frame uploads that triggered "HTTP 404: Render job not found"!
  try {
    onProgress({ progress: 0.01, stageLabel: 'Đang dựng MP4 WebCodecs tốc độ cao...' });
    const webResult = await exportWithWebCodecsMp4(effectiveProject, audioFile, encoding, onProgress, {
      signal: options?.signal,
      skipDownload: true,
      customFileBase: baseName,
      customRenderFrame: options?.customRenderFrame,
      onBeforeRenderFrame: options?.onBeforeRenderFrame,
    });
    if (webResult?.blob) {
      if (options?.directoryHandle) {
        onProgress({ progress: 0.97, stageLabel: `Đang ghi ${targetFileName} vào thư mục đã chọn...` });
        const fileHandle = await options.directoryHandle.getFileHandle(targetFileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(webResult.blob);
        await writable.close();
        if (txtBody) {
          const txtHandle = await options.directoryHandle.getFileHandle(targetTxtName, { create: true });
          const txtWritable = await txtHandle.createWritable();
          await txtWritable.write(new Blob([txtBody], { type: 'text/plain;charset=utf-8' }));
          await txtWritable.close();
        }
        onProgress({ progress: 1, stageLabel: 'Hoàn tất lưu vào thư mục máy!' });
        return {
          savedPath: `${options.directoryHandle.name}/${targetFileName}`,
          relativePath: targetFileName,
          fileName: targetFileName,
          byteLength: webResult.blob.size,
        };
      }

      onProgress({ progress: 0.97, stageLabel: `Đang lưu ${targetFileName} vào thư mục output...` });
      const saved = await exportBlobToServerOutput(
        webResult.blob,
        targetFileName,
        customSavePath,
        options?.signal,
        options?.sourceTab,
      );
      if (txtBody) {
        await saveCompanionTextToServerOutput(
          targetTxtName,
          txtBody,
          customSavePath,
          options?.sourceTab,
          options?.signal,
        ).catch(() => null);
      }
      onProgress({ progress: 1, stageLabel: 'Hoàn tất lưu vào thư mục output!' });
      return saved;
    }
  } catch (err) {
    if (err instanceof ExportAbortedError || options?.signal?.aborted) {
      throw new ExportAbortedError();
    }
    console.warn('WebCodecs disk export failed, falling back to server FFmpeg pipeline:', err);
  }

  // Fallback path for browsers lacking WebCodecs VideoEncoder/AudioEncoder
  onProgress({ progress: 0.01, stageLabel: 'Đang khởi tạo job FFmpeg trên server...' });
  const startRes = await fetch('/api/render/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fps: encoding.fps, crf: encoding.crf }),
    signal: options?.signal,
  });

  if (!startRes.ok) {
    throw new Error(`Server FFmpeg không khả dụng (HTTP ${startRes.status}).`);
  }

  const { jobId } = (await startRes.json()) as { jobId: string };

  let offscreenCanvas: HTMLCanvasElement | null = null;

  try {
    if (audioFile) {
      checkAborted(options?.signal);
      onProgress({ progress: 0.04, stageLabel: 'Đang nạp Audio lên server...' });
      const dotIdx = audioFile.name.lastIndexOf('.');
      const ext = dotIdx >= 0 ? audioFile.name.slice(dotIdx) : '.mp3';

      for (let offset = 0; offset < audioFile.size; offset += MAX_UPLOAD_CHUNK_BYTES) {
        const slice = audioFile.slice(offset, offset + MAX_UPLOAD_CHUNK_BYTES);
        const appendQuery = offset > 0 ? '?append=1' : '';
        await postBinaryWithRetry(
          `/api/render/${jobId}/audio${appendQuery}`,
          slice,
          {
            'Content-Type': 'application/octet-stream',
            'x-audio-ext': ext,
          },
          'Không thể tải file Audio lên máy chủ render',
          options?.signal,
        );
      }
    }

    const safeWidth = encoding.width & ~1;
    const safeHeight = encoding.height & ~1;
    offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = safeWidth;
    offscreenCanvas.height = safeHeight;
    const ctx = offscreenCanvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Không khởi tạo được Canvas 2D.');
    }

    const totalFrames = Math.max(1, Math.ceil(project.duration * encoding.fps));
    let batch: Blob[] = [];
    let batchBytes = 0;
    let pendingUpload: Promise<Response | void> = Promise.resolve();

    const flushBatch = async () => {
      if (batch.length === 0) return;
      const chunkBlob = new Blob(batch, { type: 'application/octet-stream' });
      batch = [];
      batchBytes = 0;
      await pendingUpload;
      pendingUpload = postBinaryWithRetry(
        `/api/render/${jobId}/frames`,
        chunkBlob,
        { 'Content-Type': 'application/octet-stream' },
        'Lỗi truyền khung hình lên server',
        options?.signal,
      );
    };

    for (let i = 0; i < totalFrames; i++) {
      checkAborted(options?.signal);
      const t = Math.min(project.duration, i / encoding.fps);
      if (options?.onBeforeRenderFrame) {
        await options.onBeforeRenderFrame(t);
      } else {
        await seekProjectVideoAssets(project, t);
      }
      if (options?.customRenderFrame) {
        options.customRenderFrame(ctx, t, safeWidth, safeHeight);
      } else {
        renderScaledProjectFrame(ctx, project, t, safeWidth, safeHeight);
      }
      const jpeg = await canvasToJpegBlob(offscreenCanvas, 0.85);

      if (
        batch.length > 0 &&
        (batch.length >= MAX_FRAMES_PER_BATCH || batchBytes + jpeg.size > MAX_UPLOAD_CHUNK_BYTES)
      ) {
        await flushBatch();
        await new Promise((r) => setTimeout(r, 0));
      }

      batch.push(jpeg);
      batchBytes += jpeg.size;

      if (i % 6 === 0 || i === totalFrames - 1) {
        onProgress({
          progress: 0.05 + ((i + 1) / totalFrames) * 0.8,
          stageLabel: `Đang vẽ frame ${i + 1}/${totalFrames}...`,
        });
      }

      if (i === totalFrames - 1) {
        await flushBatch();
      }
    }

    await pendingUpload;
    checkAborted(options?.signal);
    onProgress({ progress: 0.9, stageLabel: 'FFmpeg đang xuất MP4 ra ổ cứng...' });

    const resolvedFolder = resolveTabOutputSubfolder(options?.sourceTab, customSavePath);
    const finishRes = await fetch(`/api/render/${jobId}/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: baseName,
        saveToDisk: true,
        savePath: resolvedFolder,
        sourceTab: options?.sourceTab,
        companionText: txtBody || undefined,
      }),
      signal: options?.signal,
    });

    if (!finishRes.ok) {
      const errBody = await finishRes.json().catch(() => ({}));
      throw new Error((errBody as { error?: string }).error || 'FFmpeg không thể lưu MP4.');
    }

    const data = (await finishRes.json()) as { savedPath: string; relativePath?: string; bytes: number };
    onProgress({ progress: 1, stageLabel: 'Hoàn tất!' });
    return {
      savedPath: data.savedPath,
      relativePath: data.relativePath,
      fileName: targetFileName,
      byteLength: data.bytes,
    };
  } catch (err) {
    void fetch(`/api/render/${jobId}`, { method: 'DELETE' }).catch(() => undefined);
    if (options?.signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw new ExportAbortedError();
    }
    throw err;
  } finally {
    if (offscreenCanvas) {
      offscreenCanvas.width = 0;
      offscreenCanvas.height = 0;
    }
  }
}
