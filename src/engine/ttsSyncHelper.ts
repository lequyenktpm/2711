import { buildApiKeyHeaders, loadClientApiKeys } from '../utils/apiKeysStore';
import { splitMixedLanguageTtsSpans } from './bilingualTtsHelper';
import { cleanDownloadFileName } from './outputNaming';
import {
  cuesToBlockTranscript,
  cuesToSrt,
  refineCuesWithWhisperWords,
  stripTimestampsFromScript,
} from './transcriptParser';
import { TranscriptCue, WordTiming } from './types';

export interface TtsVoiceItem {
  id: string;
  label: string;
  lang: string;
}

export interface TtsProviderItem {
  id: string;
  name: string;
  voices: TtsVoiceItem[];
}

export interface TtsSynthesizeResponse {
  ok?: boolean;
  providerUsed?: string;
  mimeType?: string;
  audioBase64?: string;
  durationSec?: number;
  segmentDurations?: number[];
  spokenDurations?: number[];
  pauseDurations?: number[];
  hasWordBoundaries?: boolean;
  cues?: TranscriptCue[];
  srt?: string;
  vtt?: string;
  error?: string;
}

export interface WhisperAlignResponse {
  ok?: boolean;
  words?: WordTiming[];
  segments?: Array<{ start: number; end: number; text: string }>;
  text?: string;
  language?: string;
  modelUsed?: string;
  backendUsed?: string;
  srt?: string;
  cues?: TranscriptCue[];
  error?: string;
}

export interface SynthesizeAndSyncResult {
  audioFile: File;
  audioBase64: string;
  cues: TranscriptCue[];
  srt: string;
  blockTranscript: string;
  providerUsed: string;
  detectedLanguage?: string;
  durationSec: number;
  whisperAligned: boolean;
}

function base64ToMp3File(base64: string, fileName: string, mimeType = 'audio/mpeg'): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], fileName, { type: mimeType });
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeUtf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

export async function fetchTtsVoicesCatalog(): Promise<{
  providers: TtsProviderItem[];
  hasGeminiKey: boolean;
  hasElevenLabsKey: boolean;
}> {
  const res = await fetch('/api/tts/voices', {
    headers: buildApiKeyHeaders(),
  });
  const data = (await res.json().catch(() => ({}))) as {
    providers?: TtsProviderItem[];
    hasGeminiKey?: boolean;
    hasElevenLabsKey?: boolean;
  };
  return {
    providers: Array.isArray(data.providers) ? data.providers : [],
    hasGeminiKey: Boolean(data.hasGeminiKey),
    hasElevenLabsKey: Boolean(data.hasElevenLabsKey),
  };
}

async function runDirectTtsFallback(
  headers: Record<string, string>,
  bodyWithKeys: Record<string, unknown>,
  onProgress?: (progress: number, stageLabel: string) => void,
): Promise<TtsSynthesizeResponse> {
  onProgress?.(35, 'Đang tổng hợp giọng đọc TTS...');
  const directRes = await fetch('/api/tts/synthesize', {
    method: 'POST',
    headers,
    body: JSON.stringify(bodyWithKeys),
  });
  const directRaw = await directRes.text();
  let directJson: TtsSynthesizeResponse = {};
  try {
    directJson = JSON.parse(directRaw) as TtsSynthesizeResponse;
  } catch {
    throw new Error(
      directRes.ok
        ? 'Server trả về dữ liệu TTS không hợp lệ (không phải JSON).'
        : `Lỗi tổng hợp TTS (HTTP ${directRes.status}).`,
    );
  }
  if (!directRes.ok || !directJson.audioBase64) {
    throw new Error(directJson.error || `Lỗi tổng hợp TTS (HTTP ${directRes.status}).`);
  }
  onProgress?.(100, 'Tổng hợp Audio hoàn tất!');
  return directJson;
}

export async function synthesizeAudioWithProgressJob(
  payload: Record<string, unknown>,
  onProgress?: (progress: number, stageLabel: string) => void,
): Promise<TtsSynthesizeResponse> {
  onProgress?.(4, 'Đang khởi tạo tác vụ đọc TTS...');
  const clientKeys = loadClientApiKeys();
  const bodyWithKeys: Record<string, unknown> = {
    ...payload,
    ...(clientKeys.elevenlabsApiKey ? { elevenLabsApiKey: clientKeys.elevenlabsApiKey } : {}),
    ...(clientKeys.geminiApiKey ? { geminiApiKey: clientKeys.geminiApiKey } : {}),
  };
  const headers = buildApiKeyHeaders({ 'Content-Type': 'application/json' });
  const startRes = await fetch('/api/tts/synthesize/start', {
    method: 'POST',
    headers,
    body: JSON.stringify(bodyWithKeys),
  });
  const startRaw = await startRes.text();
  const trimmedStart = startRaw.trim();

  // Graceful fallback to synchronous endpoint if /start returned 404 or HTML page
  if (startRes.status === 404 || trimmedStart.startsWith('<')) {
    return runDirectTtsFallback(headers, bodyWithKeys, onProgress);
  }

  let startJson: { jobId?: string; error?: string } = {};
  try {
    startJson = JSON.parse(trimmedStart) as { jobId?: string; error?: string };
  } catch {
    throw new Error(
      startRes.ok
        ? 'Server trả về dữ liệu TTS không hợp lệ.'
        : `Lỗi tạo tác vụ TTS (HTTP ${startRes.status}).`,
    );
  }
  if (!startRes.ok || !startJson.jobId) {
    throw new Error(startJson.error || `Lỗi tạo tác vụ TTS (HTTP ${startRes.status}).`);
  }

  const jobId = startJson.jobId;
  const startedAt = Date.now();
  let consecutivePollFailures = 0;
  let notFoundRetries = 0;

  while (Date.now() - startedAt < 10 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 380));
    let pollRes: Response;
    try {
      pollRes = await fetch(`/api/tts/synthesize/${encodeURIComponent(jobId)}`);
    } catch (netErr) {
      consecutivePollFailures += 1;
      if (consecutivePollFailures >= 4) {
        return runDirectTtsFallback(headers, bodyWithKeys, onProgress);
      }
      continue;
    }

    if (pollRes.status === 429 || pollRes.status === 502 || pollRes.status === 503 || pollRes.status === 504) {
      await new Promise((r) => setTimeout(r, 650));
      continue;
    }

    if (pollRes.status === 404) {
      notFoundRetries += 1;
      if (notFoundRetries <= 2) {
        await new Promise((r) => setTimeout(r, 420));
        continue;
      }
      // Server restarted or routed to another instance: seamlessly fall back to stateless sync TTS
      return runDirectTtsFallback(headers, bodyWithKeys, onProgress);
    }

    const pollRaw = await pollRes.text();
    const trimmedPoll = pollRaw.trim();
    if (!trimmedPoll || trimmedPoll.startsWith('<')) {
      consecutivePollFailures += 1;
      if (consecutivePollFailures >= 4) {
        return runDirectTtsFallback(headers, bodyWithKeys, onProgress);
      }
      continue;
    }

    let pollData: {
      status?: 'queued' | 'running' | 'done' | 'error';
      progress?: number;
      stageLabel?: string;
      result?: TtsSynthesizeResponse;
      error?: string;
    } = {};
    try {
      pollData = JSON.parse(trimmedPoll);
    } catch {
      consecutivePollFailures += 1;
      if (consecutivePollFailures >= 4) {
        throw new Error('Server trả về dữ liệu tiến trình TTS không hợp lệ.');
      }
      continue;
    }

    if (!pollRes.ok) {
      throw new Error(pollData.error || `Mất kết nối theo dõi tiến trình TTS (HTTP ${pollRes.status}).`);
    }
    consecutivePollFailures = 0;
    notFoundRetries = 0;

    if (typeof pollData.progress === 'number' || pollData.stageLabel) {
      onProgress?.(
        Math.max(5, Math.min(99, Number(pollData.progress ?? 10))),
        pollData.stageLabel || 'Đang tổng hợp giọng đọc...',
      );
    }
    if (pollData.status === 'done' && pollData.result) {
      onProgress?.(100, 'Tổng hợp Audio hoàn tất!');
      return pollData.result;
    }
    if (pollData.status === 'error') {
      throw new Error(pollData.error || 'Lỗi tổng hợp Audio TTS.');
    }
  }
  throw new Error('Hết thời gian chờ tổng hợp Audio TTS.');
}

export async function alignAudioWithProgressJob(
  payload: {
    audioFile?: File | null;
    audioBase64?: string;
    ext?: string;
    lang?: string;
    model?: string;
    referenceText?: string;
    alignMode?: 'fast-forced' | 'whisper';
  },
  onProgress?: (progress: number, stageLabel: string) => void,
): Promise<WhisperAlignResponse> {
  const mode = payload.alignMode || (payload.referenceText?.trim() ? 'fast-forced' : 'whisper');
  onProgress?.(
    5,
    mode === 'fast-forced'
      ? 'Đang gửi audio căn nhịp siêu tốc theo kịch bản...'
      : 'Đang gửi audio sang Whisper...',
  );

  let binaryBody: BodyInit;
  let ext = payload.ext || '.mp3';
  if (payload.audioFile) {
    binaryBody = payload.audioFile;
    const match = payload.audioFile.name.match(/\.[a-z0-9]+$/i);
    if (match) ext = match[0].toLowerCase();
  } else if (payload.audioBase64) {
    const rawBytes = base64ToUint8Array(payload.audioBase64);
    binaryBody = rawBytes.buffer.slice(
      rawBytes.byteOffset,
      rawBytes.byteOffset + rawBytes.byteLength,
    ) as ArrayBuffer;
  } else {
    throw new Error('Thiếu file audio để căn chỉnh word-level.');
  }

  const headers: Record<string, string> = buildApiKeyHeaders({
    'Content-Type': 'application/octet-stream',
    'x-file-ext': ext,
    'x-source-lang': payload.lang || 'auto',
    'x-whisper-model': payload.model || 'Xenova/whisper-small',
    'x-align-mode': mode,
  });
  if (payload.referenceText && payload.referenceText.trim()) {
    headers['x-reference-text-b64'] = encodeUtf8Base64(payload.referenceText.trim());
  }

  const postWithRetry = async (url: string): Promise<Response> => {
    let lastRes: Response | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: binaryBody,
      });
      lastRes = res;
      if (res.status !== 429 && res.status !== 503) {
        return res;
      }
      if (attempt < 3) {
        const retryAfter = Number(res.headers.get('retry-after') || 0);
        const waitMs = retryAfter > 0 ? Math.min(4000, retryAfter * 1000) : 700 * attempt;
        onProgress?.(6, `Máy chủ bận (HTTP ${res.status}) — tự động thử lại (${attempt}/2)...`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
    return lastRes!;
  };

  const runDirectAlignFallback = async (): Promise<WhisperAlignResponse> => {
    onProgress?.(35, 'Đang chạy căn chỉnh trực tiếp...');
    const directRes = await postWithRetry('/api/subtitles/align');
    const directData = (await directRes.json().catch(() => ({}))) as WhisperAlignResponse;
    if (!directRes.ok || directData.error) {
      throw new Error(directData.error || `Không thể căn chỉnh audio (HTTP ${directRes.status}).`);
    }
    onProgress?.(100, 'Căn từng từ hoàn tất!');
    return directData;
  };

  const startRes = await postWithRetry('/api/subtitles/align/start');
  const startRaw = await startRes.text();
  const trimmedStart = startRaw.trim();

  if (startRes.status === 404 || trimmedStart.startsWith('<')) {
    return runDirectAlignFallback();
  }

  let startData: { jobId?: string; error?: string } = {};
  try {
    startData = JSON.parse(trimmedStart) as { jobId?: string; error?: string };
  } catch {
    throw new Error(
      startRes.ok
        ? 'Server trả về phản hồi căn chỉnh không hợp lệ.'
        : `Không khởi tạo được Whisper Align (HTTP ${startRes.status}).`,
    );
  }
  if (!startRes.ok || !startData.jobId) {
    throw new Error(startData.error || `Không khởi tạo được Whisper Align (HTTP ${startRes.status}).`);
  }

  const jobId = startData.jobId;
  const startedAt = Date.now();
  let consecutivePollFailures = 0;
  let notFoundRetries = 0;
  while (Date.now() - startedAt < 10 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, mode === 'fast-forced' ? 180 : 600));
    let pollRes: Response;
    try {
      pollRes = await fetch(`/api/subtitles/align/${encodeURIComponent(jobId)}`);
    } catch {
      consecutivePollFailures += 1;
      if (consecutivePollFailures >= 4) throw new Error('Mất kết nối theo dõi tiến trình căn chỉnh.');
      continue;
    }
    if (pollRes.status === 429 || pollRes.status === 502 || pollRes.status === 503 || pollRes.status === 504) {
      await new Promise((r) => setTimeout(r, 700));
      continue;
    }
    if (pollRes.status === 404) {
      notFoundRetries += 1;
      if (notFoundRetries <= 2) {
        await new Promise((r) => setTimeout(r, 420));
        continue;
      }
      return runDirectAlignFallback();
    }
    const pollData = (await pollRes.json().catch(() => ({}))) as {
      status?: 'queued' | 'running' | 'done' | 'error';
      progress?: number;
      stageLabel?: string;
      result?: WhisperAlignResponse;
      error?: string;
    };
    if (!pollRes.ok) {
      throw new Error(pollData.error || 'Lỗi theo dõi tiến trình Whisper Align.');
    }
    consecutivePollFailures = 0;
    notFoundRetries = 0;
    if (typeof pollData.progress === 'number' || pollData.stageLabel) {
      onProgress?.(
        Math.max(8, Math.min(99, Number(pollData.progress ?? 15))),
        pollData.stageLabel || 'Đang căn từng từ...',
      );
    }
    if (pollData.status === 'done' && pollData.result) {
      onProgress?.(100, 'Căn từng từ hoàn tất!');
      return pollData.result;
    }
    if (pollData.status === 'error') {
      throw new Error(pollData.error || 'Lỗi căn chỉnh từ.');
    }
  }
  throw new Error('Hết thời gian chờ căn chỉnh.');
}

export async function synthesizeAudioAndSyncCues(params: {
  rawScript: string;
  title?: string;
  provider?: string;
  voice?: string;
  lang?: string;
  secondaryVoice?: string;
  secondaryLang?: string;
  autoSplitLanguages?: boolean;
  rate?: number;
  alignWithWhisper?: boolean;
  whisperModel?: string;
  onProgress?: (progress: number, stageLabel: string) => void;
}): Promise<SynthesizeAndSyncResult> {
  const cleanText = stripTimestampsFromScript(params.rawScript).trim();
  if (!cleanText) {
    throw new Error('Hãy nhập nội dung văn bản (mỗi dòng 1 câu) để xuất Audio.');
  }

  const hasMixedLangs =
    splitMixedLanguageTtsSpans(cleanText, {
      primaryLang: params.lang || 'en-US',
      secondaryLang: params.secondaryLang,
      primaryVoice: params.voice,
      secondaryVoice: params.secondaryVoice,
      autoSplit: params.autoSplitLanguages !== false,
    }).length > 1;

  const useWhisperAlign = params.alignWithWhisper !== false && !hasMixedLangs;
  const data = await synthesizeAudioWithProgressJob(
    {
      provider: params.provider || 'auto',
      voice: params.voice || 'en-US-JennyNeural',
      lang: params.lang || 'en-US',
      ...(params.secondaryVoice ? { secondaryVoice: params.secondaryVoice } : {}),
      ...(params.secondaryLang ? { secondaryLang: params.secondaryLang } : {}),
      autoSplitLanguages: params.autoSplitLanguages !== false,
      rate: params.rate ?? 1.0,
      text: cleanText,
    },
    (pct, label) => {
      const scaled = useWhisperAlign ? Math.round(pct * 0.72) : pct;
      params.onProgress?.(Math.max(3, scaled), label);
    },
  );

  if (!data.audioBase64) {
    throw new Error(data.error || 'Không thể sinh Audio TTS từ server.');
  }

  let finalCues: TranscriptCue[] = Array.isArray(data.cues) ? data.cues : [];
  let providerUsed = data.providerUsed || params.provider || 'edge';
  let detectedLanguage: string | undefined;
  let whisperAligned = false;

  if (useWhisperAlign && finalCues.length > 0 && !data.hasWordBoundaries) {
    try {
      params.onProgress?.(74, 'Đang căn nhịp từng từ theo kịch bản (Fast Forced Align)...');
      const alignData = await alignAudioWithProgressJob(
        {
          audioBase64: data.audioBase64,
          ext: '.mp3',
          lang: params.lang || 'auto',
          model: params.whisperModel || 'Xenova/whisper-small',
          referenceText: cleanText,
          alignMode: 'fast-forced',
        },
        (pct, label) => {
          const scaled = Math.min(98, Math.round(74 + pct * 0.24));
          params.onProgress?.(scaled, label);
        },
      );
      if (Array.isArray(alignData.words) && alignData.words.length > 0) {
        finalCues = refineCuesWithWhisperWords(finalCues, alignData.words);
        detectedLanguage = alignData.language;
        providerUsed = `${providerUsed} + ${alignData.backendUsed || 'fast-forced'}`;
        whisperAligned = true;
      }
    } catch {
      // Keep exact per-line MP3 durations measured by FFmpeg
    }
  } else if (data.hasWordBoundaries) {
    whisperAligned = true;
    providerUsed = `${providerUsed} (WordBoundary)`;
  } else if (hasMixedLangs) {
    providerUsed = `${providerUsed} (Dual-TTS)`;
  }

  params.onProgress?.(100, 'Hoàn tất đồng bộ Audio & Sub!');
  const srt = finalCues.length > 0 ? cuesToSrt(finalCues) : data.srt || '';
  const blockTranscript = finalCues.length > 0 ? cuesToBlockTranscript(finalCues) : '';
  const cleanMp3Name = cleanDownloadFileName(params.title || 'KineticSub Audio', 'mp3', 'KineticSub Audio');
  const audioFile = base64ToMp3File(
    data.audioBase64,
    cleanMp3Name,
    data.mimeType || 'audio/mpeg',
  );

  return {
    audioFile,
    audioBase64: data.audioBase64,
    cues: finalCues,
    srt,
    blockTranscript,
    providerUsed,
    detectedLanguage,
    durationSec: Number(data.durationSec || 0),
    whisperAligned,
  };
}

export async function resyncCuesToAudioFile(params: {
  audioFile: File;
  cues: TranscriptCue[];
  alignMode?: 'fast-forced' | 'whisper';
  lang?: string;
  whisperModel?: string;
  onProgress?: (progress: number, stageLabel: string) => void;
}): Promise<{ cues: TranscriptCue[]; backendUsed: string; srt: string; blockTranscript: string }> {
  const mode = params.alignMode ?? 'fast-forced';
  const referenceText = params.cues
    .map((c) => c.text.trim())
    .filter(Boolean)
    .join('\n');

  const alignData = await alignAudioWithProgressJob(
    {
      audioFile: params.audioFile,
      lang: params.lang || 'auto',
      model: params.whisperModel || 'Xenova/whisper-small',
      referenceText: referenceText || undefined,
      alignMode: referenceText ? mode : 'whisper',
    },
    params.onProgress,
  );

  let nextCues: TranscriptCue[] = params.cues;
  if (Array.isArray(alignData.cues) && alignData.cues.length > 0) {
    if (params.cues.length > 0 && Array.isArray(alignData.words) && alignData.words.length > 0) {
      // Map cue [start, end] spans onto alignData.cues when counts match, otherwise map words
      if (alignData.cues.length === params.cues.length) {
        nextCues = params.cues.map((orig, idx) => {
          const ac = alignData.cues![idx];
          const cueWords = alignData.words!.filter(
            (w) => w.end > ac.start - 0.1 && w.start < ac.end + 0.1,
          );
          const refined = refineCuesWithWhisperWords(
            [{ ...orig, start: ac.start, end: ac.end }],
            cueWords,
          )[0];
          return refined || { ...orig, start: ac.start, end: ac.end };
        });
      } else {
        // Re-segment words by original cue word count proportionally across detected words
        const totalAligned = alignData.words.length;
        const totalOrigWords = Math.max(
          1,
          params.cues.reduce((s, c) => s + Math.max(1, c.words.length || c.text.split(/\s+/).length), 0),
        );
        let cursorIdx = 0;
        nextCues = params.cues.map((orig, cIdx) => {
          const origCount = Math.max(1, orig.words.length || orig.text.split(/\s+/).length);
          const take =
            cIdx === params.cues.length - 1
              ? Math.max(1, totalAligned - cursorIdx)
              : Math.max(1, Math.round((origCount / totalOrigWords) * totalAligned));
          const slice = alignData.words!.slice(cursorIdx, Math.min(totalAligned, cursorIdx + take));
          cursorIdx += slice.length;
          if (slice.length > 0) {
            const st = slice[0].start;
            const en = Math.max(st + 0.25, slice[slice.length - 1].end);
            return refineCuesWithWhisperWords([{ ...orig, start: st, end: en }], slice)[0] ?? orig;
          }
          return orig;
        });
      }
    } else {
      nextCues = alignData.cues;
    }
  } else if (Array.isArray(alignData.words) && alignData.words.length > 0 && params.cues.length > 0) {
    nextCues = refineCuesWithWhisperWords(params.cues, alignData.words);
  }

  return {
    cues: nextCues,
    backendUsed: alignData.backendUsed || mode,
    srt: cuesToSrt(nextCues),
    blockTranscript: cuesToBlockTranscript(nextCues),
  };
}

