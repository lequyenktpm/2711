import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanOutputTitleStem, resolveTabOutputSubfolder } from '../engine/outputNaming.ts';
import { interpolateWordTimings } from '../engine/transcriptParser.ts';

export interface WhisperWordChunk {
  text: string;
  start: number;
  end: number;
}

export interface WhisperTranscribeResult {
  text: string;
  segments: Array<{ start: number; end: number; text: string }>;
  words: WhisperWordChunk[];
  language?: string;
  modelUsed?: string;
  backendUsed?: string;
}

const whisperPipelines = new Map<string, Promise<any>>();
const whisperProgressListeners = new Map<string, Set<(pct: number, label: string) => void>>();
let cachedFasterWhisperAvailable: boolean | null = null;

export async function isFasterWhisperPythonAvailable(): Promise<boolean> {
  if (cachedFasterWhisperAvailable !== null) return cachedFasterWhisperAvailable;
  const check = async (pyCmd: string): Promise<boolean> =>
    new Promise((resolve) => {
      const proc = spawn(pyCmd, ['-c', 'import faster_whisper'], { shell: false });
      proc.on('error', () => resolve(false));
      proc.on('close', (code) => resolve(code === 0));
    });
  cachedFasterWhisperAvailable = (await check('python3')) || (await check('python'));
  return cachedFasterWhisperAvailable;
}

export function inferSpokenLanguageFromText(text: string, fallback = 'English'): string {
  const s = (text || '').trim();
  if (!s) return fallback;
  if (/[\u3040-\u30ff]/.test(s)) return 'Japanese';
  if (/[\uac00-\ud7af\u1100-\u11ff]/.test(s)) return 'Korean';
  if (/[\u4e00-\u9fff]/.test(s)) return 'Chinese';
  if (/[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/i.test(s)) {
    return 'Vietnamese';
  }
  if (/[ñ¿¡]/i.test(s)) return 'Spanish';
  if (/[çœæ]/i.test(s)) return 'French';
  return fallback;
}

function normalizeLanguageName(codeOrName: string | undefined, textSample = ''): string {
  const low = (codeOrName || '').trim().toLowerCase();
  if (!low || low === 'auto') {
    return inferSpokenLanguageFromText(textSample, 'English');
  }
  const map: Record<string, string> = {
    en: 'English',
    english: 'English',
    vi: 'Vietnamese',
    vietnamese: 'Vietnamese',
    ja: 'Japanese',
    japanese: 'Japanese',
    zh: 'Chinese',
    'zh-cn': 'Chinese',
    chinese: 'Chinese',
    ko: 'Korean',
    korean: 'Korean',
    fr: 'French',
    french: 'French',
    es: 'Spanish',
    spanish: 'Spanish',
  };
  return map[low] || codeOrName || inferSpokenLanguageFromText(textSample, 'English');
}

async function runFasterWhisperPython(
  wavPath: string,
  modelName: string,
  sourceLang?: string,
  wordLevel?: boolean,
): Promise<WhisperTranscribeResult | null> {
  if (!(await isFasterWhisperPythonAvailable())) return null;
  const whisperLang = mapLanguageToIsoCode(sourceLang || 'auto');
  const script = `
import json, sys
from faster_whisper import WhisperModel
wav_path, model_name, lang, word_ts = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4] == "1"
model = WhisperModel(model_name, device="auto", compute_type="int8")
kwargs = {"word_timestamps": word_ts, "vad_filter": True}
if lang:
    kwargs["language"] = lang
segs_gen, info = model.transcribe(wav_path, **kwargs)
segs = []
words = []
texts = []
for s in segs_gen:
    txt = (s.text or "").strip()
    if txt:
        segs.append({"start": round(float(s.start), 3), "end": round(float(s.end), 3), "text": txt})
        texts.append(txt)
    if word_ts and getattr(s, "words", None):
        for w in s.words:
            wt = (w.word or "").strip()
            if wt:
                words.append({"text": wt, "start": round(float(w.start), 3), "end": round(float(w.end), 3)})
detected_lang = getattr(info, "language", "") or ""
print(json.dumps({"text": " ".join(texts), "segments": segs, "words": words, "language": detected_lang}, ensure_ascii=False))
`;

  const runPy = (pyCmd: string) =>
    new Promise<string>((resolve, reject) => {
      const proc = spawn(
        pyCmd,
        ['-c', script, wavPath, modelName, whisperLang || '', wordLevel ? '1' : '0'],
        { shell: false },
      );
      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (c: Buffer) => {
        stdout += c.toString('utf8');
      });
      proc.stderr?.on('data', (c: Buffer) => {
        stderr += c.toString('utf8');
      });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(stderr.slice(-500) || `python exit ${code}`));
      });
    });

  try {
    const out = await runPy('python3').catch(() => runPy('python'));
    const parsed = JSON.parse(out.trim()) as WhisperTranscribeResult;
    return {
      text: parsed.text || '',
      segments: Array.isArray(parsed.segments) ? parsed.segments : [],
      words: Array.isArray(parsed.words) ? parsed.words : [],
      language: normalizeLanguageName(parsed.language, parsed.text || ''),
      modelUsed: modelName,
      backendUsed: 'faster-whisper',
    };
  } catch {
    return null;
  }
}

export function parseWavToFloat32Mono16k(wavBuffer: Buffer): Float32Array {
  if (wavBuffer.length < 44 || wavBuffer.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error('File WAV không hợp lệ để chạy Whisper Local.');
  }
  let offset = 12;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= wavBuffer.length) {
    const chunkId = wavBuffer.toString('ascii', offset, offset + 4);
    const chunkSize = wavBuffer.readUInt32LE(offset + 4);
    if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = Math.min(chunkSize, wavBuffer.length - dataOffset);
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (dataOffset < 0 || dataSize <= 0) {
    throw new Error('Không tìm thấy dữ liệu PCM trong file WAV.');
  }

  const sampleCount = Math.floor(dataSize / 2);
  const floatData = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    floatData[i] = wavBuffer.readInt16LE(dataOffset + i * 2) / 32768.0;
  }
  return floatData;
}

function mapLanguageToIsoCode(lang: string): string | undefined {
  const low = (lang || '').trim().toLowerCase();
  if (!low || low === 'auto') return undefined;
  if (low.startsWith('en')) return 'en';
  if (low.startsWith('vi') || low.includes('tiếng việt')) return 'vi';
  if (low.startsWith('ja') || low.includes('japan')) return 'ja';
  if (low.startsWith('zh') || low.includes('chin')) return 'zh';
  if (low.startsWith('ko') || low.includes('kor')) return 'ko';
  if (low.startsWith('fr')) return 'fr';
  if (low.startsWith('es') || low.includes('span')) return 'es';
  return undefined;
}

function mapLanguageToWhisper(lang: string): string | undefined {
  const low = (lang || '').trim().toLowerCase();
  if (!low || low === 'auto') return undefined;
  if (low.startsWith('en')) return 'english';
  if (low.startsWith('vi') || low.includes('tiếng việt')) return 'vietnamese';
  if (low.startsWith('ja') || low.includes('japan')) return 'japanese';
  if (low.startsWith('zh') || low.includes('chin')) return 'chinese';
  if (low.startsWith('ko') || low.includes('kor')) return 'korean';
  if (low.startsWith('fr')) return 'french';
  if (low.startsWith('es') || low.includes('span')) return 'spanish';
  return undefined;
}

function mapLanguageToGoogleCode(lang: string): string {
  const low = (lang || '').trim().toLowerCase();
  if (low.startsWith('vi') || low.includes('việt')) return 'vi';
  if (low.startsWith('en') || low.includes('anh')) return 'en';
  if (low.startsWith('ja') || low.includes('nhật')) return 'ja';
  if (low.startsWith('zh') || low.includes('trung')) return 'zh-CN';
  if (low.startsWith('ko') || low.includes('hàn')) return 'ko';
  if (low.startsWith('fr') || low.includes('pháp')) return 'fr';
  if (low.startsWith('es') || low.includes('tây ban nha')) return 'es';
  return 'vi';
}

async function getWhisperPipeline(
  modelId: string,
  onProgress?: (pct: number, label: string) => void,
) {
  let listeners = whisperProgressListeners.get(modelId);
  if (!listeners) {
    listeners = new Set();
    whisperProgressListeners.set(modelId, listeners);
  }
  if (onProgress) {
    listeners.add(onProgress);
  }

  const notify = (pct: number, label: string) => {
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    whisperPreloadState.progress = clamped;
    whisperPreloadState.progressLabel = label;
    whisperPreloadState.updatedAt = Date.now();
    const activeListeners = whisperProgressListeners.get(modelId);
    if (activeListeners) {
      for (const cb of activeListeners) {
        try {
          cb(clamped, label);
        } catch {
          // ignore listener error
        }
      }
    }
  };

  let pending = whisperPipelines.get(modelId);
  if (!pending) {
    pending = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.allowRemoteModels = true;
      env.allowLocalModels = true;
      notify(2, `Đang kiểm tra / tải model ${modelId}...`);
      const fileProgress = new Map<string, number>();

      const isTransient429OrNet = (err: unknown): boolean => {
        const msg = err instanceof Error ? err.message : String(err || '');
        return /\b(429|502|503|504|rate limit|too many requests|fetch failed|econnreset|etimedout)\b/i.test(msg);
      };

      let pipe: any = null;
      let lastErr: unknown = null;
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          pipe = await pipeline('automatic-speech-recognition', modelId, {
            dtype: 'q8',
            progress_callback: (info: any) => {
              if (!info || typeof info !== 'object') return;
              const fileName = String(info.file || modelId).split('/').pop() || modelId;
              if (info.status === 'initiate' || info.status === 'download') {
                if (!fileProgress.has(fileName)) fileProgress.set(fileName, 0);
                notify(
                  Math.max(3, whisperPreloadState.progress),
                  `Đang tải tệp model ${fileName}...`,
                );
              } else if (info.status === 'progress') {
                const rawPct =
                  typeof info.progress === 'number'
                    ? info.progress
                    : info.total
                      ? (Number(info.loaded || 0) / Number(info.total || 1)) * 100
                      : 0;
                fileProgress.set(fileName, Math.max(0, Math.min(100, rawPct)));
                const vals = Array.from(fileProgress.values());
                const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : rawPct;
                notify(Math.max(5, Math.min(95, avg)), `Đang tải ${fileName} (${Math.round(rawPct)}%)...`);
              } else if (info.status === 'done') {
                fileProgress.set(fileName, 100);
                const vals = Array.from(fileProgress.values());
                const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 100;
                notify(Math.min(96, avg), `Đã nạp ${fileName}`);
              } else if (info.status === 'ready') {
                notify(100, `Model ${modelId} đã sẵn sàng`);
              }
            },
          });
          break;
        } catch (err) {
          lastErr = err;
          if (attempt < maxAttempts && isTransient429OrNet(err)) {
            const delayMs = 900 * Math.pow(2, attempt - 1);
            notify(
              Math.max(3, whisperPreloadState.progress),
              `HuggingFace phản hồi chậm/HTTP 429 — tự động thử lại (${attempt}/${maxAttempts - 1})...`,
            );
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }
          throw err;
        }
      }
      if (!pipe) {
        throw lastErr instanceof Error ? lastErr : new Error('Không tải được model Whisper.');
      }
      notify(100, `Model ${modelId} đã sẵn sàng`);
      return pipe;
    })();
    whisperPipelines.set(modelId, pending);
  }
  try {
    const res = await pending;
    onProgress?.(100, `Model ${modelId} đã sẵn sàng`);
    return res;
  } catch (err) {
    whisperPipelines.delete(modelId);
    throw err;
  } finally {
    if (onProgress && listeners) {
      listeners.delete(onProgress);
    }
  }
}

function resolveOnnxModelCandidates(requestedModel: string): string[] {
  const clean = (requestedModel || '').trim();
  const mapped =
    clean === 'large-v3-turbo' || clean === 'whisper-large-v3-turbo'
      ? 'onnx-community/whisper-large-v3-turbo'
      : clean === 'small'
        ? 'Xenova/whisper-small'
        : clean === 'base'
          ? 'Xenova/whisper-base'
          : clean === 'tiny'
            ? 'Xenova/whisper-tiny'
            : clean || 'Xenova/whisper-small';

  const candidates = [mapped];
  if (mapped !== 'Xenova/whisper-small') candidates.push('Xenova/whisper-small');
  if (mapped !== 'Xenova/whisper-base') candidates.push('Xenova/whisper-base');
  if (mapped !== 'Xenova/whisper-tiny') candidates.push('Xenova/whisper-tiny');
  return candidates;
}

const whisperPreloadState: {
  status: 'idle' | 'downloading' | 'ready' | 'error';
  requestedModel: string | null;
  modelUsed: string | null;
  backendUsed: string | null;
  progress: number;
  progressLabel: string | null;
  error: string | null;
  updatedAt: number;
} = {
  status: 'idle',
  requestedModel: null,
  modelUsed: null,
  backendUsed: null,
  progress: 0,
  progressLabel: null,
  error: null,
  updatedAt: 0,
};

let activePreloadPromise: Promise<void> | null = null;

export async function getWhisperCacheStatus(): Promise<{
  fasterWhisperAvailable: boolean;
  cachedOnnxModels: string[];
  loadedInMemory: string[];
  preloadState: typeof whisperPreloadState;
}> {
  const fasterWhisperAvailable = await isFasterWhisperPythonAvailable();
  const loadedInMemory = Array.from(whisperPipelines.keys());
  const cachedOnnxModels: string[] = [];

  const candidateCacheRoots = [
    path.resolve('node_modules/@huggingface/transformers/.cache'),
    path.join(os.homedir(), '.cache', 'huggingface', 'hub'),
    path.join(os.homedir(), '.cache', 'transformers.js'),
  ];

  for (const root of candidateCacheRoots) {
    try {
      const orgEntries = await fs.promises.readdir(root, { withFileTypes: true }).catch(() => []);
      for (const org of orgEntries) {
        if (!org.isDirectory()) continue;
        if (org.name.startsWith('models--')) {
          const modelName = org.name.replace(/^models--/, '').replace(/--/g, '/');
          if (modelName.toLowerCase().includes('whisper') && !cachedOnnxModels.includes(modelName)) {
            cachedOnnxModels.push(modelName);
          }
          continue;
        }
        const subEntries = await fs.promises
          .readdir(path.join(root, org.name), { withFileTypes: true })
          .catch(() => []);
        for (const sub of subEntries) {
          if (sub.isDirectory() && sub.name.toLowerCase().includes('whisper')) {
            const fullId = `${org.name}/${sub.name}`;
            if (!cachedOnnxModels.includes(fullId)) cachedOnnxModels.push(fullId);
          }
        }
      }
    } catch {
      // ignore missing cache dir
    }
  }

  return { fasterWhisperAvailable, cachedOnnxModels, loadedInMemory, preloadState: { ...whisperPreloadState } };
}

export async function preloadWhisperModel(modelId = 'Xenova/whisper-small'): Promise<{
  backendUsed: string;
  modelUsed: string;
}> {
  if (await isFasterWhisperPythonAvailable()) {
    const fwModel =
      modelId.replace(/^onnx-community\/whisper-/i, '').replace(/^Xenova\/whisper-/i, '') ||
      'large-v3-turbo';
    const pyScript = `
import sys
from faster_whisper import WhisperModel
WhisperModel(sys.argv[1], device="auto", compute_type="int8")
print("OK")
`;
    const downloaded = await new Promise<boolean>((resolve) => {
      const run = (cmd: string) =>
        new Promise<boolean>((res) => {
          const p = spawn(cmd, ['-c', pyScript, fwModel], { shell: false });
          p.on('error', () => res(false));
          p.on('close', (code) => res(code === 0));
        });
      void run('python3').then((ok) => (ok ? resolve(true) : void run('python').then(resolve)));
    });
    if (downloaded) {
      return { backendUsed: 'faster-whisper', modelUsed: fwModel };
    }
  }

  const candidates = resolveOnnxModelCandidates(modelId);
  let lastErr: unknown = null;
  for (const candidate of candidates) {
    try {
      await getWhisperPipeline(candidate, (pct, label) => {
        whisperPreloadState.status = 'downloading';
        whisperPreloadState.progress = pct;
        whisperPreloadState.progressLabel = label;
        whisperPreloadState.updatedAt = Date.now();
      });
      return { backendUsed: 'faster-whisper-built-in (ONNX)', modelUsed: candidate };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Không tải được model Whisper.');
}

export function startWhisperPreloadJob(modelId = 'Xenova/whisper-small'): typeof whisperPreloadState {
  if (whisperPreloadState.status === 'downloading' && activePreloadPromise) {
    return { ...whisperPreloadState };
  }
  whisperPreloadState.status = 'downloading';
  whisperPreloadState.requestedModel = modelId;
  whisperPreloadState.modelUsed = null;
  whisperPreloadState.backendUsed = null;
  whisperPreloadState.progress = 2;
  whisperPreloadState.progressLabel = `Đang chuẩn bị tải ${modelId}...`;
  whisperPreloadState.error = null;
  whisperPreloadState.updatedAt = Date.now();

  activePreloadPromise = preloadWhisperModel(modelId)
    .then((res) => {
      whisperPreloadState.status = 'ready';
      whisperPreloadState.modelUsed = res.modelUsed;
      whisperPreloadState.backendUsed = res.backendUsed;
      whisperPreloadState.progress = 100;
      whisperPreloadState.progressLabel = `Đã tải xong ${res.modelUsed}`;
      whisperPreloadState.error = null;
      whisperPreloadState.updatedAt = Date.now();
    })
    .catch((err) => {
      whisperPreloadState.status = 'error';
      whisperPreloadState.progress = 0;
      whisperPreloadState.progressLabel = null;
      whisperPreloadState.error = err instanceof Error ? err.message : 'Không tải được model Whisper.';
      whisperPreloadState.updatedAt = Date.now();
    })
    .finally(() => {
      activePreloadPromise = null;
    });

  return { ...whisperPreloadState };
}

export async function runLocalWhisperOnWav(
  wavPath: string,
  options?: {
    sourceLang?: string;
    modelId?: string;
    wordLevel?: boolean;
    preferFasterWhisper?: boolean;
    onProgress?: (progress: number, label: string) => void;
  },
): Promise<WhisperTranscribeResult> {
  const requestedModel =
    options?.modelId?.trim() ||
    process.env.WHISPER_MODEL?.trim() ||
    'Xenova/whisper-small';

  options?.onProgress?.(6, `Đang khởi tạo Whisper (${requestedModel})...`);

  // 1. Try native faster-whisper Python library if installed on the machine
  if (options?.preferFasterWhisper !== false) {
    const fwModel = requestedModel
      .replace(/^onnx-community\/whisper-/i, '')
      .replace(/^Xenova\/whisper-/i, '');
    const fwRes = await runFasterWhisperPython(
      wavPath,
      fwModel || 'large-v3-turbo',
      options?.sourceLang,
      options?.wordLevel,
    );
    if (fwRes && (fwRes.segments.length > 0 || fwRes.text)) {
      options?.onProgress?.(100, 'Nhận diện faster-whisper hoàn tất');
      return fwRes;
    }
  }

  // 2. Built-in zero-dependency ONNX Whisper via @huggingface/transformers (works everywhere)
  const wavBuf = await fs.promises.readFile(wavPath);
  const audioFloat = parseWavToFloat32Mono16k(wavBuf);
  if (audioFloat.length < 160) {
    options?.onProgress?.(100, 'Audio trống');
    return { text: '', segments: [], words: [], language: 'English', modelUsed: requestedModel, backendUsed: 'whisper-onnx' };
  }

  const candidates = resolveOnnxModelCandidates(requestedModel);
  const whisperLang = mapLanguageToWhisper(options?.sourceLang || 'auto');
  let result: any = null;
  let modelUsed = candidates[0];
  let wordTimestampsActuallyUsed = false;
  let lastLoadErr: unknown = null;

  for (const candidate of candidates) {
    try {
      const transcriber = await getWhisperPipeline(candidate, (dlPct, dlLabel) => {
        const scaled = Math.min(68, Math.max(8, Math.round(8 + dlPct * 0.6)));
        options?.onProgress?.(scaled, dlLabel);
      });
      options?.onProgress?.(74, `Đang chạy nhận diện Whisper (${candidate})...`);
      const baseOpts = {
        chunk_length_s: 30,
        stride_length_s: 5,
        ...(whisperLang ? { language: whisperLang, task: 'transcribe' } : {}),
      };

      // Models like onnx-community/whisper-large-v3-turbo lack output_attentions=True in ONNX,
      // so skip return_timestamps: 'word' directly for them and use segment timestamps + interpolation.
      const supportsWordAttentions = !/large-v3-turbo/i.test(candidate);

      if (options?.wordLevel && supportsWordAttentions) {
        try {
          result = await transcriber(audioFloat, {
            ...baseOpts,
            return_timestamps: 'word',
          });
          wordTimestampsActuallyUsed = true;
        } catch {
          // Gracefully fall back to segment timestamps + word interpolation on any attention/timestamp error
          try {
            result = await transcriber(audioFloat, {
              ...baseOpts,
              return_timestamps: true,
            });
            wordTimestampsActuallyUsed = false;
          } catch {
            result = await transcriber(audioFloat, {
              ...baseOpts,
              return_timestamps: false,
            });
            wordTimestampsActuallyUsed = false;
          }
        }
      } else {
        try {
          result = await transcriber(audioFloat, {
            ...baseOpts,
            return_timestamps: true,
          });
        } catch {
          result = await transcriber(audioFloat, {
            ...baseOpts,
            return_timestamps: false,
          });
        }
        wordTimestampsActuallyUsed = false;
      }

      modelUsed = candidate;
      break;
    } catch (err) {
      lastLoadErr = err;
      result = null;
    }
  }

  if (!result) {
    throw lastLoadErr instanceof Error ? lastLoadErr : new Error('Không thể tải hoặc chạy mô hình Whisper local.');
  }

  const chunks: Array<{ text?: string; timestamp?: [number | null, number | null] }> = Array.isArray(
    result?.chunks,
  )
    ? result.chunks
    : [];

  const totalDur = Number((audioFloat.length / 16000).toFixed(3));
  const rawChunks: WhisperWordChunk[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const txt = String(chunk?.text || '').trim();
    if (!txt) continue;
    const ts = Array.isArray(chunk?.timestamp) ? chunk.timestamp : [0, totalDur];
    const start = Math.max(0, Number(ts[0] ?? (i === 0 ? 0 : rawChunks[rawChunks.length - 1]?.end ?? 0)));
    const rawEnd = ts[1] !== null && ts[1] !== undefined ? Number(ts[1]) : Math.min(totalDur, start + 1.5);
    const end = Math.max(start + 0.08, Math.min(totalDur, rawEnd));
    rawChunks.push({
      text: txt,
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
    });
  }

  const segments: Array<{ start: number; end: number; text: string }> = [];
  let words: WhisperWordChunk[] = [];

  if (wordTimestampsActuallyUsed) {
    words = rawChunks;
    let curWords: WhisperWordChunk[] = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      curWords.push(w);
      const isSentenceEnd = /[.!?。！？]$/.test(w.text);
      const nextGap = i + 1 < words.length ? words[i + 1].start - w.end : 1;
      if (isSentenceEnd || curWords.length >= 9 || nextGap >= 0.65 || i === words.length - 1) {
        segments.push({
          start: curWords[0].start,
          end: curWords[curWords.length - 1].end,
          text: curWords.map((x) => x.text).join(' ').replace(/\s+([,.!?;:])/g, '$1').trim(),
        });
        curWords = [];
      }
    }
  } else {
    for (const seg of rawChunks) {
      segments.push({ start: seg.start, end: seg.end, text: seg.text });
      const interp = interpolateWordTimings(seg.text, seg.start, seg.end);
      for (const w of interp) {
        words.push({ text: w.word, start: w.start, end: w.end });
      }
    }
  }

  if (segments.length === 0 && typeof result?.text === 'string' && result.text.trim()) {
    const segText = result.text.trim();
    const safeEnd = Math.max(1.5, totalDur);
    segments.push({ start: 0, end: safeEnd, text: segText });
    words = interpolateWordTimings(segText, 0, safeEnd).map((w) => ({
      text: w.word,
      start: w.start,
      end: w.end,
    }));
  }

  const fullText = String(result?.text || segments.map((s) => s.text).join(' ')).trim();
  return {
    text: fullText,
    segments,
    words,
    language: normalizeLanguageName(
      typeof result?.language === 'string' ? result.language : options?.sourceLang,
      fullText,
    ),
    modelUsed,
    backendUsed: wordTimestampsActuallyUsed
      ? 'faster-whisper-built-in (ONNX)'
      : 'faster-whisper-built-in (ONNX · Segment Sync)',
  };
}

export async function translateLinesWithGeminiOrFree(
  lines: string[],
  targetLang: string,
  geminiApiKeyOverride?: string,
): Promise<{ translations: string[]; engineUsed: string }> {
  const cleanLines = lines.map((l) => l.trim());
  if (cleanLines.length === 0 || !targetLang || targetLang === 'none') {
    return { translations: cleanLines, engineUsed: 'none' };
  }

  const apiKey = (geminiApiKeyOverride || '').trim() || process.env.GEMINI_API_KEY || '';
  if (apiKey) {
    try {
      const { GoogleGenAI, Type } = await import('@google/genai');
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
      for (const model of ['gemini-4-hydrogen', 'gemini-3.1-flash-lite']) {
        try {
          const trRes = await ai.models.generateContent({
            model,
            contents: `Translate each subtitle line naturally into ${targetLang}. Keep concise for video subtitles and match exact array length (${cleanLines.length}):\n${JSON.stringify(cleanLines)}`,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  translations: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
              },
            },
          });
          const parsed = JSON.parse(trRes.text || '{}') as { translations?: string[] };
          if (Array.isArray(parsed.translations) && parsed.translations.length === cleanLines.length) {
            return {
              translations: parsed.translations.map((t, idx) => String(t || cleanLines[idx] || '').trim()),
              engineUsed: `gemini (${model})`,
            };
          }
        } catch {
          // try next Gemini model or fallback to free translator
        }
      }
    } catch {
      // fallback to free translator
    }
  }

  // Free zero-key Google Translate fallback (batched into chunks separated by sentinel line)
  const tl = mapLanguageToGoogleCode(targetLang);
  const translatedAll = new Array<string>(cleanLines.length).fill('');
  const BATCH_SIZE = 15;

  for (let start = 0; start < cleanLines.length; start += BATCH_SIZE) {
    const slice = cleanLines.slice(start, start + BATCH_SIZE);
    const joined = slice.map((l) => l.replace(/\r?\n+/g, ' ')).join('\n');
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(joined)}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Array<Array<[string]>>;
      const combined = Array.isArray(json?.[0])
        ? json[0].map((part) => String(part?.[0] || '')).join('')
        : '';
      const splitLines = combined.split(/\r?\n/);
      if (splitLines.length === slice.length) {
        for (let i = 0; i < slice.length; i++) {
          translatedAll[start + i] = splitLines[i].trim() || slice[i];
        }
        continue;
      }
    } catch {
      // per-line fallback below
    }

    for (let i = 0; i < slice.length; i++) {
      const line = slice[i];
      if (!line) {
        translatedAll[start + i] = '';
        continue;
      }
      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(line)}`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const json = (await res.json()) as Array<Array<[string]>>;
          const txt = Array.isArray(json?.[0])
            ? json[0].map((part) => String(part?.[0] || '')).join('').trim()
            : '';
          translatedAll[start + i] = txt || line;
          continue;
        }
      } catch {
        // keep source
      }
      translatedAll[start + i] = line;
    }
  }

  return {
    translations: translatedAll,
    engineUsed: 'google-translate-free',
  };
}

export const ELEVENLABS_DEFAULT_VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel (US Female · Tự nhiên rõ)', lang: 'en-US' },
  { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah / Bella (Soft Narration)', lang: 'en-US' },
  { id: 'pNInz6obpgDQGcFmaJgB', label: 'Adam (US Male · Thuyết minh)', lang: 'en-US' },
  { id: 'ErXwobaYiN019PkySvjV', label: 'Antoni (Warm Male)', lang: 'en-US' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', label: 'Josh (Young Energetic Male)', lang: 'en-US' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', label: 'Callum (Storyteller)', lang: 'en-US' },
];

export async function synthesizeElevenLabsTtsBuffer(
  text: string,
  voiceId: string,
  apiKey: string,
): Promise<Buffer> {
  const safeVoiceId = /^[A-Za-z0-9]{10,40}$/.test(voiceId)
    ? voiceId
    : ELEVENLABS_DEFAULT_VOICES[0].id;
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(safeVoiceId)}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.52,
          similarity_boost: 0.78,
        },
      }),
    },
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`ElevenLabs HTTP ${res.status}: ${errText.slice(0, 180)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export function resolveSafeOutputDir(rawSubPath?: string, sourceTab?: string): { baseDir: string; targetDir: string } {
  const baseDir = path.resolve(process.env.BATCH_OUTPUT_DIR || 'output');
  const raw = (rawSubPath || '').trim().replace(/^[/\\]+/, '');
  const trimmed =
    raw || sourceTab
      ? resolveTabOutputSubfolder(sourceTab, raw)
      : '';
  const candidate = trimmed ? path.resolve(baseDir, trimmed) : baseDir;
  const targetDir =
    candidate === baseDir || candidate.startsWith(baseDir + path.sep) ? candidate : baseDir;
  return { baseDir, targetDir };
}

export function resolveSafeOutputFile(relPath: string): { baseDir: string; filePath: string } | null {
  const baseDir = path.resolve(process.env.BATCH_OUTPUT_DIR || 'output');
  const clean = (relPath || '').replace(/^[/\\]+/, '');
  if (!clean) return null;
  const candidate = path.resolve(baseDir, clean);
  if (!candidate.startsWith(baseDir + path.sep)) return null;
  return { baseDir, filePath: candidate };
}

export function sanitizeOutputStem(raw: string, fallback = 'KineticSub Video'): string {
  return cleanOutputTitleStem(raw, fallback);
}

export async function probeMediaMeta(filePath: string): Promise<{
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  isStereo: boolean;
}> {
  let duration = 0;
  let width = 1080;
  let height = 1920;
  let fps = 30;
  let hasAudio = false;
  let isStereo = false;

  try {
    const proc = spawn('ffprobe', [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]);
    let out = '';
    await new Promise<void>((resolve) => {
      proc.stdout?.on('data', (c: Buffer) => {
        out += c.toString('utf8');
      });
      proc.on('close', () => resolve());
      proc.on('error', () => resolve());
    });
    const parsed = JSON.parse(out || '{}') as {
      format?: { duration?: string };
      streams?: Array<{
        codec_type?: string;
        width?: number;
        height?: number;
        avg_frame_rate?: string;
        r_frame_rate?: string;
        channels?: number;
      }>;
    };
    const fd = Number.parseFloat(String(parsed.format?.duration || '0'));
    if (Number.isFinite(fd) && fd > 0.05) duration = fd;
    for (const s of parsed.streams || []) {
      if (s.codec_type === 'video') {
        if (s.width && s.height) {
          width = s.width;
          height = s.height;
        }
        const rateStr = s.avg_frame_rate && s.avg_frame_rate !== '0/0' ? s.avg_frame_rate : s.r_frame_rate;
        if (rateStr && rateStr.includes('/')) {
          const [num, den] = rateStr.split('/').map(Number);
          if (num > 0 && den > 0) {
            const calc = num / den;
            if (calc >= 10 && calc <= 120) fps = Math.round(calc);
          }
        }
      } else if (s.codec_type === 'audio') {
        hasAudio = true;
        if ((s.channels ?? 0) >= 2) isStereo = true;
      }
    }
  } catch {
    // fallback values preserved
  }

  return { duration: Math.max(0.5, duration || 3), width, height, fps, hasAudio, isStereo };
}

export function spawnTrackedFfmpeg(
  args: string[],
  cwd: string,
  registerProc?: (proc: ChildProcess) => void,
  onProgressTimeSec?: (sec: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const finalArgs = onProgressTimeSec && !args.includes('-stats')
      ? ['-stats', ...args]
      : args;
    const proc = spawn('ffmpeg', finalArgs, { cwd, shell: false });
    registerProc?.(proc);
    let stderr = '';
    proc.stderr?.on('data', (c: Buffer) => {
      const txt = c.toString('utf8');
      stderr = (stderr + txt).slice(-8000);
      if (onProgressTimeSec) {
        const matches = [...txt.matchAll(/time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/g)];
        if (matches.length > 0) {
          const m = matches[matches.length - 1];
          const sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
          if (Number.isFinite(sec)) onProgressTimeSec(sec);
        }
      }
    });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg lỗi (${code}): ${stderr.slice(-500)}`));
    });
  });
}

export type StudioDefaultAudioPreset =
  | 'ocean-waves'
  | 'forest-stream'
  | 'gentle-piano'
  | 'wind-chimes'
  | 'sunset-ambient'
  | 'lofi-calm'
  | 'soft-study'
  | 'soft-rain'
  | 'cafe-room';

const STUDIO_DEFAULT_AUDIO_SPECS: Record<
  StudioDefaultAudioPreset,
  { lavfi: string; af: string; duration: number }
> = {
  'ocean-waves': {
    // Slow rolling surf wave swell over warm brown ocean noise
    lavfi: 'anoisesrc=color=brown:r=44100:a=0.72',
    af: 'lowpass=f=900,volume=0.52+0.48*sin(2*PI*0.14*t):eval=frame,afade=t=in:st=0:d=1.4,afade=t=out:st=22.4:d=1.6,volume=0.38',
    duration: 24,
  },
  'forest-stream': {
    // Gentle babbling brook & soft pine breeze
    lavfi: 'anoisesrc=color=pink:r=44100:a=0.45',
    af: 'highpass=f=280,lowpass=f=1900,volume=0.72+0.28*sin(2*PI*0.26*t):eval=frame,afade=t=in:st=0:d=1.2,afade=t=out:st=18.5:d=1.5,volume=0.22',
    duration: 20,
  },
  'gentle-piano': {
    // Soft bell-like Rhodes/piano Cmaj9 arpeggio with comma-free exponential swells
    lavfi:
      'aevalsrc=0.18*sin(2*PI*261.63*t)*exp(-2.6*(1-cos(2*PI*0.25*t)))+0.14*sin(2*PI*329.63*t)*exp(-2.6*(1-cos(2*PI*0.25*(t-1.0))))+0.12*sin(2*PI*392.00*t)*exp(-2.6*(1-cos(2*PI*0.25*(t-2.0))))+0.10*sin(2*PI*493.88*t)*exp(-2.6*(1-cos(2*PI*0.25*(t-3.0)))):s=44100',
    af: 'lowpass=f=1350,aecho=0.8:0.75:260:0.4,afade=t=in:st=0:d=1.2,afade=t=out:st=22.4:d=1.6,volume=0.38',
    duration: 24,
  },
  'wind-chimes': {
    // Tranquil Zen pentatonic bamboo wind chimes with comma-free exponential swells
    lavfi:
      'aevalsrc=0.14*sin(2*PI*523.25*t)*exp(-3.4*(1-cos(2*PI*0.2*t)))+0.11*sin(2*PI*659.25*t)*exp(-3.4*(1-cos(2*PI*0.2*(t-1.3))))+0.10*sin(2*PI*783.99*t)*exp(-3.4*(1-cos(2*PI*0.2*(t-2.6))))+0.08*sin(2*PI*1046.5*t)*exp(-3.4*(1-cos(2*PI*0.2*(t-3.8)))):s=44100',
    af: 'lowpass=f=2100,aecho=0.85:0.8:320:0.45,afade=t=in:st=0:d=1.2,afade=t=out:st=22.4:d=1.6,volume=0.30',
    duration: 24,
  },
  'sunset-ambient': {
    // Deep warm meditative sunset chord pad
    lavfi:
      'aevalsrc=0.16*sin(2*PI*174.61*t)+0.12*sin(2*PI*220*t)+0.10*sin(2*PI*261.63*t)+0.08*sin(2*PI*329.63*t)*(0.55+0.45*sin(2*PI*0.18*t)):s=44100',
    af: 'lowpass=f=900,aecho=0.8:0.7:340:0.35,afade=t=in:st=0:d=1.4,afade=t=out:st=22.4:d=1.6,volume=0.34',
    duration: 24,
  },
  'lofi-calm': {
    // Gentle warm ambient pad cycling Cmaj7 / Fmaj7 overtones
    lavfi:
      'aevalsrc=0.14*sin(2*PI*220*t)+0.11*sin(2*PI*277.18*t)+0.09*sin(2*PI*329.63*t)+0.06*sin(2*PI*440*t)*(0.5+0.5*sin(2*PI*0.25*t)):s=44100',
    af: 'lowpass=f=1100,afade=t=in:st=0:d=1.2,afade=t=out:st=22.5:d=1.5,volume=0.35',
    duration: 24,
  },
  'soft-study': {
    lavfi:
      'aevalsrc=0.14*sin(2*PI*196*t)+0.11*sin(2*PI*246.94*t)+0.09*sin(2*PI*293.66*t)+0.05*sin(2*PI*392*t)*(0.5+0.5*cos(2*PI*0.2*t)):s=44100',
    af: 'lowpass=f=950,afade=t=in:st=0:d=1.2,afade=t=out:st=22.5:d=1.5,volume=0.32',
    duration: 24,
  },
  'soft-rain': {
    lavfi: 'anoisesrc=color=pink:r=44100:a=0.45',
    af: 'highpass=f=350,lowpass=f=2400,afade=t=in:st=0:d=1.0,afade=t=out:st=16.8:d=1.2,volume=0.22',
    duration: 18,
  },
  'cafe-room': {
    lavfi: 'anoisesrc=color=brown:r=44100:a=0.55',
    af: 'highpass=f=120,lowpass=f=700,afade=t=in:st=0:d=1.0,afade=t=out:st=16.8:d=1.2,volume=0.28',
    duration: 18,
  },
};

const pendingDefaultAudioCache = new Map<string, Promise<string | null>>();

export async function ensureDefaultStudioAudio(presetId: string): Promise<string | null> {
  if (!presetId || presetId === 'none') return null;
  if (!(presetId in STUDIO_DEFAULT_AUDIO_SPECS)) return null;
  const spec = STUDIO_DEFAULT_AUDIO_SPECS[presetId as StudioDefaultAudioPreset];

  const defaultsDir = path.resolve('.studio-tmp', 'defaults');
  const outPath = path.join(defaultsDir, `${presetId}.mp3`);

  try {
    const st = await fs.promises.stat(outPath);
    if (st.size > 1024) return outPath;
  } catch {
    // will synthesize
  }

  let job = pendingDefaultAudioCache.get(presetId);
  if (!job) {
    job = (async () => {
      await fs.promises.mkdir(defaultsDir, { recursive: true });
      const tmpPath = path.join(defaultsDir, `${presetId}.tmp.mp3`);
      await spawnTrackedFfmpeg(
        [
          '-y',
          '-f',
          'lavfi',
          '-t',
          String(spec.duration),
          '-i',
          spec.lavfi,
          '-af',
          spec.af,
          '-c:a',
          'libmp3lame',
          '-b:a',
          '128k',
          tmpPath,
        ],
        process.cwd(),
      );
      await fs.promises.rename(tmpPath, outPath);
      return outPath;
    })();
    pendingDefaultAudioCache.set(presetId, job);
  }
  try {
    return await job;
  } finally {
    pendingDefaultAudioCache.delete(presetId);
  }
}
