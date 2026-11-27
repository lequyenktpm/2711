import 'dotenv/config';
import crypto from 'node:crypto';
import { ChildProcess, spawn } from 'node:child_process';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { load as loadHtml } from 'cheerio';
import { MsEdgeTTS, OUTPUT_FORMAT, ProsodyOptions } from 'msedge-tts';
import { buildFfmpegArgs } from './src/engine/ffmpegArgs.ts';
import { alignKnownTextToPcmFloat, detectWavSpeechBounds, parseWavBufferToMonoFloat32 } from './src/engine/forcedAligner.ts';
import { detectReelMode, splitMultipleExercisesFromText } from './src/engine/englishReelsEngine.ts';
import { cleanOutputTitleStem, resolveTabOutputSubfolder } from './src/engine/outputNaming.ts';
import {
  detectVoiceLangCode,
  normalizeTtsLangCode,
  sanitizeSpanTextForSpeech,
  splitMixedLanguageTtsSpans,
} from './src/engine/bilingualTtsHelper.ts';
import {
  formatTimeToken,
  interpolateWordTimings,
  parseTranscriptAuto,
  stripTimestampsFromScript,
  tokenizeTextForKaraoke,
} from './src/engine/transcriptParser.ts';
import {
  ELEVENLABS_DEFAULT_VOICES,
  ensureDefaultStudioAudio,
  getWhisperCacheStatus,
  inferSpokenLanguageFromText,
  probeMediaMeta,
  resolveSafeOutputDir,
  resolveSafeOutputFile,
  runLocalWhisperOnWav,
  sanitizeOutputStem,
  spawnTrackedFfmpeg,
  startWhisperPreloadJob,
  synthesizeElevenLabsTtsBuffer,
  translateLinesWithGeminiOrFree,
} from './src/server/mediaHelpers.ts';

const PERSISTED_API_KEYS_FILE = path.resolve('.studio-tmp', 'api-keys.json');
const PERSISTED_USER_SETTINGS_FILE = path.resolve('.studio-tmp', 'user-settings.json');

function isPlainRecord(val: unknown): val is Record<string, unknown> {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

function deepMergeSettings(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (isPlainRecord(v) && isPlainRecord(out[k]) && k !== 'layoutOverridesByAspect') {
      out[k] = deepMergeSettings(out[k] as Record<string, unknown>, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function loadPersistedUserSettingsSync(): Record<string, unknown> {
  try {
    if (!fs.existsSync(PERSISTED_USER_SETTINGS_FILE)) return {};
    const raw = fs.readFileSync(PERSISTED_USER_SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return isPlainRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function savePersistedUserSettings(
  patch: Record<string, unknown>,
  replaceAll = false,
): Promise<Record<string, unknown>> {
  const current = replaceAll ? {} : loadPersistedUserSettingsSync();
  const next = deepMergeSettings(current, patch);
  next.updatedAt = typeof patch.updatedAt === 'number' ? patch.updatedAt : Date.now();
  await fs.promises.mkdir(path.dirname(PERSISTED_USER_SETTINGS_FILE), { recursive: true });
  await fs.promises.writeFile(PERSISTED_USER_SETTINGS_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

async function resetPersistedUserSettings(): Promise<void> {
  await fs.promises.mkdir(path.dirname(PERSISTED_USER_SETTINGS_FILE), { recursive: true });
  await fs.promises.writeFile(PERSISTED_USER_SETTINGS_FILE, JSON.stringify({}, null, 2), 'utf8');
}

interface PersistedApiKeys {
  elevenLabsApiKey: string;
  geminiApiKey: string;
  updatedAt?: number;
}

function loadPersistedApiKeysSync(): PersistedApiKeys {
  try {
    if (!fs.existsSync(PERSISTED_API_KEYS_FILE)) {
      return { elevenLabsApiKey: '', geminiApiKey: '' };
    }
    const raw = fs.readFileSync(PERSISTED_API_KEYS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistedApiKeys>;
    return {
      elevenLabsApiKey: typeof parsed?.elevenLabsApiKey === 'string' ? parsed.elevenLabsApiKey.trim() : '',
      geminiApiKey: typeof parsed?.geminiApiKey === 'string' ? parsed.geminiApiKey.trim() : '',
      updatedAt: typeof parsed?.updatedAt === 'number' ? parsed.updatedAt : undefined,
    };
  } catch {
    return { elevenLabsApiKey: '', geminiApiKey: '' };
  }
}

async function savePersistedApiKeys(partial: Partial<PersistedApiKeys>): Promise<PersistedApiKeys> {
  const current = loadPersistedApiKeysSync();
  const next: PersistedApiKeys = {
    elevenLabsApiKey:
      partial.elevenLabsApiKey !== undefined
        ? String(partial.elevenLabsApiKey || '').trim()
        : current.elevenLabsApiKey,
    geminiApiKey:
      partial.geminiApiKey !== undefined
        ? String(partial.geminiApiKey || '').trim()
        : current.geminiApiKey,
    updatedAt: Date.now(),
  };
  await fs.promises.mkdir(path.dirname(PERSISTED_API_KEYS_FILE), { recursive: true });
  await fs.promises.writeFile(PERSISTED_API_KEYS_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function resolveClientAndEnvKeys(
  req: express.Request,
  body?: Record<string, any> | null,
): { elevenLabsApiKey: string; geminiApiKey: string } {
  const headerEleven =
    typeof req.headers['x-elevenlabs-api-key'] === 'string'
      ? req.headers['x-elevenlabs-api-key'].trim()
      : '';
  const bodyEleven =
    typeof body?.elevenLabsApiKey === 'string'
      ? body.elevenLabsApiKey.trim()
      : typeof body?.elevenlabsApiKey === 'string'
        ? body.elevenlabsApiKey.trim()
        : '';
  const headerGemini =
    typeof req.headers['x-gemini-api-key'] === 'string'
      ? req.headers['x-gemini-api-key'].trim()
      : '';
  const bodyGemini =
    typeof body?.geminiApiKey === 'string' ? body.geminiApiKey.trim() : '';
  const persisted = loadPersistedApiKeysSync();

  return {
    elevenLabsApiKey:
      headerEleven || bodyEleven || persisted.elevenLabsApiKey || (process.env.ELEVENLABS_API_KEY || '').trim(),
    geminiApiKey:
      headerGemini || bodyGemini || persisted.geminiApiKey || (process.env.GEMINI_API_KEY || '').trim(),
  };
}

interface RenderJob {
  id: string;
  dir: string;
  fps: number;
  crf: number;
  framesPath: string;
  audioPath: string | null;
  createdAt: number;
  chunkCount: number;
}

interface StudioJob {
  id: string;
  dir: string;
  createdAt: number;
  files: Record<string, string>;
  status?: 'idle' | 'running' | 'done' | 'error';
  progress?: number;
  stageLabel?: string;
}

interface TranscribeJobState {
  id: string;
  status: 'running' | 'done' | 'error';
  progress?: number;
  stageLabel: string;
  createdAt: number;
  result?: Record<string, unknown>;
  error?: string;
}

interface TtsJobState {
  id: string;
  status: 'running' | 'done' | 'error';
  progress: number;
  stageLabel: string;
  createdAt: number;
  result?: Record<string, unknown>;
  error?: string;
}

interface AlignJobState {
  id: string;
  status: 'running' | 'done' | 'error';
  progress: number;
  stageLabel: string;
  createdAt: number;
  result?: Record<string, unknown>;
  error?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_AUDIO_EXTS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.webm', '.flac', '.opus']);
const ALLOWED_MEDIA_EXTS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.webm', '.mp4', '.mov', '.mkv', '.avi', '.m4v', '.mpeg', '.mpg']);
const JOB_TTL_MS = 60 * 60 * 1000;
const COMPONENTS_DATA_DIR = path.resolve('data');
const COMPONENTS_DATA_FILE = path.join(COMPONENTS_DATA_DIR, 'custom-components.json');
const CARTOON_ANIMATIONS_DATA_FILE = path.join(COMPONENTS_DATA_DIR, 'cartoon-animations.json');
const RENDER_TMP_ROOT = path.resolve('.render-tmp');
const STUDIO_TMP_ROOT = path.resolve('.studio-tmp');
const OUTPUT_META_FILE = path.join(STUDIO_TMP_ROOT, 'output-meta.json');

interface OutputFileMeta {
  sourceTab: string;
  updatedAt: number;
}

async function readOutputMeta(): Promise<Record<string, OutputFileMeta>> {
  try {
    const raw = await fs.promises.readFile(OUTPUT_META_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, OutputFileMeta>) : {};
  } catch {
    return {};
  }
}

async function recordOutputMeta(relativePath: string, sourceTab: string): Promise<void> {
  if (!relativePath || !sourceTab.trim()) return;
  try {
    await fs.promises.mkdir(STUDIO_TMP_ROOT, { recursive: true });
    const meta = await readOutputMeta();
    const key = relativePath.replace(/\\/g, '/');
    meta[key] = { sourceTab: sourceTab.trim(), updatedAt: Date.now() };
    await fs.promises.writeFile(OUTPUT_META_FILE, JSON.stringify(meta, null, 2), 'utf8');
  } catch {
    // non-fatal metadata write failure
  }
}

async function removeOutputMeta(relativePath: string): Promise<void> {
  if (!relativePath) return;
  try {
    const meta = await readOutputMeta();
    const key = relativePath.replace(/\\/g, '/');
    if (key in meta) {
      delete meta[key];
      await fs.promises.writeFile(OUTPUT_META_FILE, JSON.stringify(meta, null, 2), 'utf8');
    }
  } catch {
    // ignore
  }
}

const JOBS_ASYNC_DIR = path.join(STUDIO_TMP_ROOT, 'async-jobs');
const jobs = new Map<string, RenderJob>();
const activeJobProcs = new Map<string, ChildProcess>();
const studioJobs = new Map<string, StudioJob>();
const activeStudioProcs = new Map<string, ChildProcess>();
const transcribeJobs = new Map<string, TranscribeJobState>();
const ttsJobs = new Map<string, TtsJobState>();
const alignJobs = new Map<string, AlignJobState>();

type AsyncJobKind = 'tts' | 'align' | 'transcribe';

function getAsyncJobSnapshotPath(kind: AsyncJobKind, jobId: string): string {
  return path.join(JOBS_ASYNC_DIR, `${kind}-${jobId}.json`);
}

function writeAsyncJobSnapshotSync(kind: AsyncJobKind, jobId: string, state: unknown): void {
  if (!UUID_RE.test(jobId)) return;
  try {
    fs.mkdirSync(JOBS_ASYNC_DIR, { recursive: true });
    const target = getAsyncJobSnapshotPath(kind, jobId);
    const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
    fs.renameSync(tmp, target);
  } catch {
    // non-fatal disk persistence fallback
  }
}

async function saveAsyncJobSnapshot(kind: AsyncJobKind, jobId: string, state: unknown): Promise<void> {
  if (!UUID_RE.test(jobId)) return;
  try {
    await fs.promises.mkdir(JOBS_ASYNC_DIR, { recursive: true });
    const target = getAsyncJobSnapshotPath(kind, jobId);
    const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
    await fs.promises.writeFile(tmp, JSON.stringify(state), 'utf8');
    await fs.promises.rename(tmp, target);
  } catch {
    // non-fatal disk persistence fallback
  }
}

async function loadAsyncJobSnapshot<T>(
  kind: AsyncJobKind,
  jobId: string,
  memMap: Map<string, T>,
): Promise<T | null> {
  if (!UUID_RE.test(jobId)) return null;
  const cached = memMap.get(jobId);
  if (cached) return cached;
  try {
    const raw = await fs.promises.readFile(getAsyncJobSnapshotPath(kind, jobId), 'utf8');
    const parsed = JSON.parse(raw) as T;
    if (parsed && typeof parsed === 'object') {
      memMap.set(jobId, parsed);
      return parsed;
    }
  } catch {
    // missing or unreadable
  }
  return null;
}

function scheduleAsyncJobCleanup(kind: AsyncJobKind, jobId: string, memMap: Map<string, any>, ttlMs = 30 * 60 * 1000): void {
  setTimeout(() => {
    memMap.delete(jobId);
    void fs.promises.unlink(getAsyncJobSnapshotPath(kind, jobId)).catch(() => undefined);
  }, ttlMs).unref();
}

function getJobDir(jobId: string): string {
  return path.join(RENDER_TMP_ROOT, `ks-render-${jobId}`);
}

function getStudioJobDir(jobId: string): string {
  return path.join(STUDIO_TMP_ROOT, `ks-studio-${jobId}`);
}

async function saveJobMeta(job: RenderJob): Promise<void> {
  const metaPath = path.join(job.dir, 'meta.json');
  await fs.promises.writeFile(metaPath, JSON.stringify(job), 'utf8');
}

async function loadJob(jobId: string): Promise<RenderJob | null> {
  if (!UUID_RE.test(jobId)) return null;
  const cached = jobs.get(jobId);
  if (cached) return cached;

  const dir = getJobDir(jobId);
  const metaPath = path.join(dir, 'meta.json');
  try {
    const raw = await fs.promises.readFile(metaPath, 'utf8');
    const parsed = JSON.parse(raw) as RenderJob;
    if (parsed && parsed.id === jobId && parsed.dir === dir) {
      jobs.set(jobId, parsed);
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

async function cleanupJob(jobId: string): Promise<void> {
  if (!UUID_RE.test(jobId)) return;
  const proc = activeJobProcs.get(jobId);
  if (proc && !proc.killed) {
    try {
      proc.kill('SIGTERM');
    } catch {
      // ignore
    }
  }
  activeJobProcs.delete(jobId);
  const job = jobs.get(jobId);
  jobs.delete(jobId);
  const dir = job?.dir ?? getJobDir(jobId);
  await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

async function loadStudioJob(jobId: string): Promise<StudioJob | null> {
  if (!UUID_RE.test(jobId)) return null;
  const cached = studioJobs.get(jobId);
  if (cached) return cached;
  const dir = getStudioJobDir(jobId);
  try {
    const raw = await fs.promises.readFile(path.join(dir, 'meta.json'), 'utf8');
    const parsed = JSON.parse(raw) as StudioJob;
    if (parsed && parsed.id === jobId && parsed.dir === dir) {
      studioJobs.set(jobId, parsed);
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

async function cleanupStudioJob(jobId: string): Promise<void> {
  if (!UUID_RE.test(jobId)) return;
  const proc = activeStudioProcs.get(jobId);
  if (proc && !proc.killed) {
    try {
      proc.kill('SIGTERM');
    } catch {
      // ignore
    }
  }
  activeStudioProcs.delete(jobId);
  const job = studioJobs.get(jobId);
  studioJobs.delete(jobId);
  const dir = job?.dir ?? getStudioJobDir(jobId);
  await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.createdAt > JOB_TTL_MS) {
      void cleanupJob(id);
    }
  }
}, 60_000).unref();

function sanitizeAudioExt(rawExt: string | undefined): string {
  if (!rawExt) return '.mp3';
  const normalized = rawExt.trim().toLowerCase();
  const withDot = normalized.startsWith('.') ? normalized : `.${normalized}`;
  return ALLOWED_AUDIO_EXTS.has(withDot) ? withDot : '.mp3';
}

function sanitizeMediaExt(rawExt: string | undefined): string {
  if (!rawExt) return '.mp4';
  const normalized = rawExt.trim().toLowerCase();
  const withDot = normalized.startsWith('.') ? normalized : `.${normalized}`;
  return ALLOWED_MEDIA_EXTS.has(withDot) ? withDot : '.mp4';
}

function runProcess(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { shell: false });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout = (stdout + chunk.toString('utf8')).slice(-12000);
    });
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-12000);
    });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.slice(-500)}`));
    });
  });
}

async function getAudioDurationSec(filePath: string): Promise<number> {
  try {
    const { stdout } = await runProcess('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const val = Number.parseFloat(stdout.trim());
    if (Number.isFinite(val) && val > 0.05) return Number(val.toFixed(3));
  } catch {
    // Fallback parsing via ffmpeg stderr
  }
  try {
    const proc = spawn('ffmpeg', ['-i', filePath], { shell: false });
    let stderr = '';
    await new Promise<void>((resolve) => {
      proc.stderr.on('data', (c: Buffer) => {
        stderr += c.toString('utf8');
      });
      proc.on('close', () => resolve());
      proc.on('error', () => resolve());
    });
    const m = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
    if (m) {
      return Number((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])).toFixed(3));
    }
  } catch {
    // ignore
  }
  return 2.5;
}

function isPrivateOrBlockedIp(ip: string): boolean {
  const cleaned = ip.replace(/^::ffff:/i, '');
  const version = net.isIP(cleaned);
  if (version === 4) {
    const parts = cleaned.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (version === 6) {
    const low = cleaned.toLowerCase();
    if (low === '::' || low === '::1') return true;
    if (low.startsWith('fe80:') || low.startsWith('fc') || low.startsWith('fd')) return true;
    if (low.startsWith('ff')) return true;
    return false;
  }
  return true;
}

async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('URL không hợp lệ.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Chỉ hỗ trợ giao thức http:// hoặc https://.');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new Error('Không cho phép truy cập địa chỉ nội bộ.');
  }
  if (net.isIP(host)) {
    if (isPrivateOrBlockedIp(host)) {
      throw new Error('Địa chỉ IP nội bộ / riêng tư bị từ chối.');
    }
    return parsed;
  }
  const records = await dns.lookup(host, { all: true }).catch(() => []);
  if (!records || records.length === 0) {
    throw new Error(`Không phân giải được tên miền: ${host}`);
  }
  for (const rec of records) {
    if (isPrivateOrBlockedIp(rec.address)) {
      throw new Error('Tên miền trỏ tới địa chỉ mạng nội bộ không hợp lệ.');
    }
  }
  return parsed;
}

async function fetchPublicUrlSafe(rawUrl: string, maxRedirects = 3): Promise<{ finalUrl: string; html: string }> {
  let currentUrl = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const validated = await assertPublicHttpUrl(currentUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(validated.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; EnglishReelsBot/1.0)',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) throw new Error(`Redirect (${res.status}) thiếu Location.`);
        currentUrl = new URL(loc, validated).toString();
        continue;
      }
      if (!res.ok) {
        throw new Error(`Không tải được trang (HTTP ${res.status}).`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 3 * 1024 * 1024) {
        return { finalUrl: validated.toString(), html: buf.subarray(0, 3 * 1024 * 1024).toString('utf8') };
      }
      return { finalUrl: validated.toString(), html: buf.toString('utf8') };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('Quá nhiều chuyển hướng URL.');
}

function splitTextForTtsChunks(text: string, maxChars = 175): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const sentences = clean.split(/(?<=[.!?。！？])\s+/);
  const chunks: string[] = [];
  let buf = '';
  for (const s of sentences) {
    if (!buf) {
      if (s.length <= maxChars) {
        buf = s;
      } else {
        for (let i = 0; i < s.length; i += maxChars) {
          chunks.push(s.slice(i, i + maxChars).trim());
        }
      }
    } else if (buf.length + 1 + s.length <= maxChars) {
      buf = `${buf} ${s}`;
    } else {
      chunks.push(buf);
      buf = s.length <= maxChars ? s : '';
      if (!buf) {
        for (let i = 0; i < s.length; i += maxChars) {
          chunks.push(s.slice(i, i + maxChars).trim());
        }
      }
    }
  }
  if (buf) chunks.push(buf);
  return chunks.filter(Boolean);
}

function sanitizeTtsSegmentText(raw: string): string {
  return String(raw || '')
    .replace(/\u200B|\uFEFF/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, ', ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s*&\s*/g, ' and ')
    .replace(/&/g, ' and ')
    .replace(/[<>]/g, ' ')
    .replace(/[`*_~#|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeXmlForSsml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function pickEdgeVoiceForLang(lang: string, requestedVoice: string): string {
  const targetLang = normalizeTtsLangCode(lang);
  const req = (requestedVoice || '').trim();
  if (req && req.includes('Neural')) {
    const reqLang = detectVoiceLangCode(req);
    if (!reqLang || reqLang === targetLang) {
      return req;
    }
  }
  const low = (lang || 'en').trim().toLowerCase();
  if (low.startsWith('vi')) return 'vi-VN-HoaiMyNeural';
  if (low.startsWith('ja')) return 'ja-JP-NanamiNeural';
  if (low.startsWith('zh')) return 'zh-CN-XiaoxiaoNeural';
  if (low.startsWith('ko')) return 'ko-KR-SunHiNeural';
  if (low.startsWith('fr')) return 'fr-FR-DeniseNeural';
  if (low.startsWith('es')) return 'es-ES-ElviraNeural';
  if (low.includes('en-gb') || low === 'uk') return 'en-GB-SoniaNeural';
  if (low.includes('en-au')) return 'en-AU-NatashaNeural';
  return 'en-US-JennyNeural';
}

interface EdgeWordBoundary {
  word: string;
  start: number;
  end: number;
}

async function synthesizeEdgeTtsSingleChunk(
  text: string,
  voice: string,
  rate = 1.0,
): Promise<{ buffer: Buffer; wordBoundaries: EdgeWordBoundary[] }> {
  const safeXmlText = escapeXmlForSsml(sanitizeTtsSegmentText(text));
  if (!safeXmlText) {
    throw new Error('Edge TTS: Nội dung sau khi làm sạch bị rỗng.');
  }
  const tts = new MsEdgeTTS({ connectionTimeoutMs: 9000, synthesisTimeoutMs: 20000 });
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, {
      wordBoundaryEnabled: true,
    });
    const prosody = new ProsodyOptions();
    const pct = Math.round((Math.max(0.6, Math.min(1.6, rate)) - 1) * 100);
    prosody.rate = `${pct >= 0 ? '+' : ''}${pct}%`;
    const { audioStream, metadataStream } = tts.toStream(safeXmlText, prosody);
    const wordBoundaries: EdgeWordBoundary[] = [];

    if (metadataStream) {
      metadataStream.on('data', (chunk: Buffer | string) => {
        try {
          const parsed = JSON.parse(chunk.toString()) as {
            Metadata?: Array<{
              Type?: string;
              Data?: { Offset?: number; Duration?: number; text?: { Text?: string } };
            }>;
          };
          for (const item of parsed.Metadata || []) {
            if (item?.Type === 'WordBoundary' && item.Data?.text?.Text) {
              const startSec = Number(item.Data.Offset || 0) / 10_000_000;
              const durSec = Math.max(0.05, Number(item.Data.Duration || 0) / 10_000_000);
              const w = String(item.Data.text.Text).trim();
              if (w && Number.isFinite(startSec)) {
                wordBoundaries.push({
                  word: w,
                  start: Number(startSec.toFixed(3)),
                  end: Number((startSec + durSec).toFixed(3)),
                });
              }
            }
          }
        } catch {
          // ignore non-JSON metadata chunk
        }
      });
    }

    const buf = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      audioStream.on('data', (d: Buffer) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
      audioStream.on('end', () => resolve(Buffer.concat(chunks)));
      audioStream.on('error', (err) => reject(err));
    });
    if (buf.length < 128) {
      throw new Error('Edge TTS không trả về dữ liệu âm thanh.');
    }
    return { buffer: buf, wordBoundaries };
  } finally {
    try {
      tts.close();
    } catch {
      // ignore
    }
  }
}

async function synthesizeEdgeTtsBuffer(
  text: string,
  voice: string,
  rate = 1.0,
  tmpDir?: string,
  prefix = 'edge',
): Promise<{ buffer: Buffer; wordBoundaries: EdgeWordBoundary[] }> {
  const cleaned = sanitizeTtsSegmentText(text);
  const chunks = splitTextForTtsChunks(cleaned, 290);
  if (chunks.length === 0) {
    throw new Error('Nội dung TTS rỗng.');
  }
  if (chunks.length === 1 || !tmpDir) {
    return synthesizeEdgeTtsSingleChunk(chunks.join(' '), voice, rate);
  }
  const partFiles: string[] = [];
  const combinedBoundaries: EdgeWordBoundary[] = [];
  let chunkCursor = 0;
  for (let i = 0; i < chunks.length; i++) {
    const part = await synthesizeEdgeTtsSingleChunk(chunks[i], voice, rate);
    const partPath = path.join(tmpDir, `${prefix}_e_${i}.mp3`);
    await fs.promises.writeFile(partPath, part.buffer);
    partFiles.push(partPath);
    for (const wb of part.wordBoundaries) {
      combinedBoundaries.push({
        word: wb.word,
        start: Number((chunkCursor + wb.start).toFixed(3)),
        end: Number((chunkCursor + wb.end).toFixed(3)),
      });
    }
    chunkCursor += await getAudioDurationSec(partPath);
  }
  const concatTxt = path.join(tmpDir, `${prefix}_e_concat.txt`);
  await fs.promises.writeFile(
    concatTxt,
    partFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'),
    'utf8',
  );
  const merged = path.join(tmpDir, `${prefix}_e_merged.mp3`);
  await runProcess('ffmpeg', [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    concatTxt,
    '-c:a',
    'libmp3lame',
    '-ar',
    '24000',
    '-ac',
    '1',
    '-b:a',
    '64k',
    merged,
  ]);
  return {
    buffer: await fs.promises.readFile(merged),
    wordBoundaries: combinedBoundaries,
  };
}

async function synthesizeGoogleTranslateTtsChunked(
  text: string,
  lang: string,
  tmpDir: string,
  prefix: string,
  rate = 1.0,
): Promise<Buffer> {
  const cleaned = sanitizeTtsSegmentText(text);
  const rawBase = (lang || 'en').split('-')[0].toLowerCase();
  const normalizedLang = rawBase === 'zh' ? 'zh-CN' : rawBase || 'en';
  const pieces = splitTextForTtsChunks(cleaned, 160);
  if (pieces.length === 0) {
    throw new Error('Google TTS: Nội dung rỗng.');
  }
  const partFiles: string[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const q = encodeURIComponent(pieces[i]);
    const speedParam = rate < 0.85 ? '&ttsspeed=0.7' : '';
    const clients = ['tw-ob', 'gtx'];
    let chunkBuf: Buffer | null = null;
    let lastStatus = 0;
    for (const client of clients) {
      const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${q}&tl=${encodeURIComponent(normalizedLang)}&client=${client}${speedParam}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
          Referer: 'https://translate.google.com/',
        },
        signal: AbortSignal.timeout(10000),
      });
      lastStatus = res.status;
      const ctype = (res.headers.get('content-type') || '').toLowerCase();
      if (res.ok && !ctype.includes('text/html')) {
        const candidate = Buffer.from(await res.arrayBuffer());
        if (candidate.length >= 160) {
          chunkBuf = candidate;
          break;
        }
      }
    }
    if (!chunkBuf) {
      throw new Error(`Google TTS HTTP ${lastStatus || 'error'}`);
    }
    const partPath = path.join(tmpDir, `${prefix}_g_${i}.mp3`);
    await fs.promises.writeFile(partPath, chunkBuf);
    partFiles.push(partPath);
  }
  if (partFiles.length === 1) {
    return fs.promises.readFile(partFiles[0]);
  }
  const concatTxt = path.join(tmpDir, `${prefix}_g_concat.txt`);
  await fs.promises.writeFile(
    concatTxt,
    partFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'),
    'utf8',
  );
  const mergedPath = path.join(tmpDir, `${prefix}_g_merged.mp3`);
  await runProcess('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', concatTxt, '-c:a', 'libmp3lame', '-ar', '24000', '-ac', '1', '-b:a', '64k', mergedPath]);
  return fs.promises.readFile(mergedPath);
}

async function synthesizeStreamElementsTts(text: string, voice: string, tmpDir: string, prefix: string): Promise<Buffer> {
  const cleaned = sanitizeTtsSegmentText(text);
  const pieces = splitTextForTtsChunks(cleaned, 200);
  if (pieces.length === 0) {
    throw new Error('StreamElements TTS: Nội dung rỗng.');
  }
  const partFiles: string[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const url = `https://api.streamelements.com/kappa/v2/speech?voice=${encodeURIComponent(voice || 'Brian')}&text=${encodeURIComponent(pieces[i])}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
    const ctype = (res.headers.get('content-type') || '').toLowerCase();
    if (!res.ok || ctype.includes('text/html')) {
      throw new Error(`StreamElements TTS HTTP ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 160) {
      throw new Error('StreamElements TTS trả về buffer rỗng.');
    }
    const p = path.join(tmpDir, `${prefix}_se_${i}.mp3`);
    await fs.promises.writeFile(p, buf);
    partFiles.push(p);
  }
  if (partFiles.length === 1) {
    return fs.promises.readFile(partFiles[0]);
  }
  const concatTxt = path.join(tmpDir, `${prefix}_se_concat.txt`);
  await fs.promises.writeFile(
    concatTxt,
    partFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'),
    'utf8',
  );
  const merged = path.join(tmpDir, `${prefix}_se_merged.mp3`);
  await runProcess('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', concatTxt, '-c:a', 'libmp3lame', '-ar', '24000', '-ac', '1', '-b:a', '64k', merged]);
  return fs.promises.readFile(merged);
}

async function synthesizeGeminiTtsMp3(
  text: string,
  voiceName: string,
  apiKey: string,
  tmpDir: string,
  prefix: string,
): Promise<Buffer> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
  const res = await ai.models.generateContent({
    model: 'gemini-3.8-flash-lite-tts',
    contents: text,
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' },
        },
      },
    },
  });
  const base64 = res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64) {
    throw new Error('Gemini TTS không trả về dữ liệu âm thanh.');
  }
  const wavPath = path.join(tmpDir, `${prefix}_gem.wav`);
  const mp3Path = path.join(tmpDir, `${prefix}_gem.mp3`);
  await fs.promises.writeFile(wavPath, Buffer.from(base64, 'base64'));
  await runProcess('ffmpeg', ['-y', '-i', wavPath, '-c:a', 'libmp3lame', '-ar', '24000', '-ac', '1', '-b:a', '64k', mp3Path]);
  return fs.promises.readFile(mp3Path);
}

function cuesToSrt(cues: Array<{ start: number; end: number; text: string }>): string {
  return cues
    .map((c, idx) => {
      const s = formatTimeToken(c.start).replace('.', ',');
      const e = formatTimeToken(c.end).replace('.', ',');
      return `${idx + 1}\n${s} --> ${e}\n${c.text}\n`;
    })
    .join('\n');
}

function cuesToVtt(cues: Array<{ start: number; end: number; text: string }>): string {
  const body = cues
    .map((c) => `${formatTimeToken(c.start)} --> ${formatTimeToken(c.end)}\n${c.text}\n`)
    .join('\n');
  return `WEBVTT\n\n${body}`;
}

async function startServer(): Promise<void> {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.get('/api/health', (req, res) => {
    const { baseDir } = resolveSafeOutputDir();
    const resolved = resolveClientAndEnvKeys(req);
    res.json({
      ok: true,
      encoder: 'ffmpeg-h264-aac',
      hasGeminiKey: Boolean(resolved.geminiApiKey),
      hasElevenLabsKey: Boolean(resolved.elevenLabsApiKey),
      hasWhisperLocal: true,
      outputDir: baseDir,
    });
  });

  app.get('/api/settings/api-keys', (_req, res) => {
    const persisted = loadPersistedApiKeysSync();
    res.json({
      ok: true,
      elevenLabsApiKey: persisted.elevenLabsApiKey,
      geminiApiKey: persisted.geminiApiKey,
      hasElevenLabsKey: Boolean(persisted.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY),
      hasGeminiKey: Boolean(persisted.geminiApiKey || process.env.GEMINI_API_KEY),
    });
  });

  app.post('/api/settings/api-keys', express.json({ limit: '64kb' }), async (req, res) => {
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const patch: Partial<PersistedApiKeys> = {};
      if (typeof body.elevenLabsApiKey === 'string') {
        patch.elevenLabsApiKey = body.elevenLabsApiKey;
      } else if (typeof body.elevenlabsApiKey === 'string') {
        patch.elevenLabsApiKey = body.elevenlabsApiKey;
      }
      if (typeof body.geminiApiKey === 'string') {
        patch.geminiApiKey = body.geminiApiKey;
      }
      const saved = await savePersistedApiKeys(patch);
      res.json({
        ok: true,
        hasElevenLabsKey: Boolean(saved.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY),
        hasGeminiKey: Boolean(saved.geminiApiKey || process.env.GEMINI_API_KEY),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Không lưu được API key.' });
    }
  });

  app.get('/api/settings/preferences', (_req, res) => {
    const settings = loadPersistedUserSettingsSync();
    res.json({ ok: true, settings });
  });

  app.post('/api/settings/preferences', express.json({ limit: '512kb' }), async (req, res) => {
    try {
      const body = isPlainRecord(req.body) ? req.body : {};
      const patch = isPlainRecord(body.settings) ? body.settings : body;
      const replaceAll = Boolean(body.replaceAll);
      const saved = await savePersistedUserSettings(patch, replaceAll);
      res.json({ ok: true, settings: saved });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Không lưu được cài đặt.' });
    }
  });

  app.post('/api/settings/preferences/reset', async (_req, res) => {
    try {
      await resetPersistedUserSettings();
      res.json({ ok: true, settings: {} });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Không đặt lại được cài đặt.' });
    }
  });

  // ── Direct Output Folder Save / List / Preview / Open API ─────────────────
  app.post(
    '/api/output/save',
    express.raw({ type: () => true, limit: '250mb' }),
    async (req, res) => {
      try {
        const body = req.body;
        if (!Buffer.isBuffer(body) || body.length === 0) {
          res.status(400).json({ error: 'File MP4 rỗng.' });
          return;
        }
        const rawName =
          typeof req.headers['x-file-name'] === 'string'
            ? decodeURIComponent(req.headers['x-file-name'])
            : 'KineticSub Video';
        const stem = cleanOutputTitleStem(rawName.replace(/\.mp4$/i, ''), 'KineticSub Video');
        const fileName = `${stem}.mp4`;
        const savePath =
          typeof req.headers['x-save-path'] === 'string'
            ? decodeURIComponent(req.headers['x-save-path'])
            : '';
        const sourceTabHeader =
          typeof req.headers['x-source-tab'] === 'string'
            ? decodeURIComponent(req.headers['x-source-tab']).trim()
            : '';
        const { baseDir, targetDir } = resolveSafeOutputDir(savePath, sourceTabHeader);
        await fs.promises.mkdir(targetDir, { recursive: true });
        const diskPath = path.join(targetDir, fileName);
        if (req.query.append === '1') {
          await fs.promises.appendFile(diskPath, body);
        } else {
          await fs.promises.writeFile(diskPath, body);
        }
        const stat = await fs.promises.stat(diskPath);
        const relPath = path.relative(baseDir, diskPath).replace(/\\/g, '/');
        if (sourceTabHeader && req.query.append !== '1') {
          await recordOutputMeta(relPath, sourceTabHeader);
        }
        res.json({
          ok: true,
          fileName,
          relativePath: relPath,
          savedPath: diskPath,
          bytes: stat.size,
          sourceTab: sourceTabHeader || undefined,
        });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Lỗi lưu file vào output.' });
      }
    },
  );

  app.post(
    '/api/output/save-text',
    express.json({ limit: '2mb' }),
    async (req, res) => {
      try {
        const textContent = typeof req.body?.textContent === 'string' ? req.body.textContent : '';
        if (!textContent.trim()) {
          res.status(400).json({ error: 'Nội dung mô tả .txt rỗng.' });
          return;
        }
        const rawName =
          typeof req.body?.fileName === 'string' && req.body.fileName.trim()
            ? req.body.fileName
            : typeof req.body?.fileBase === 'string' && req.body.fileBase.trim()
              ? req.body.fileBase
              : typeof req.body?.title === 'string' && req.body.title.trim()
                ? req.body.title
                : 'KineticSub Video';
        const stem = cleanOutputTitleStem(rawName.replace(/\.(mp4|webm|txt)$/i, ''), 'KineticSub Video');
        const fileName = `${stem}.txt`;
        const savePath = typeof req.body?.savePath === 'string' ? req.body.savePath : '';
        const sourceTab = typeof req.body?.sourceTab === 'string' ? req.body.sourceTab.trim() : '';
        const { baseDir, targetDir } = resolveSafeOutputDir(savePath, sourceTab);
        await fs.promises.mkdir(targetDir, { recursive: true });
        const diskPath = path.join(targetDir, fileName);
        await fs.promises.writeFile(diskPath, textContent, 'utf8');
        const stat = await fs.promises.stat(diskPath);
        const relPath = path.relative(baseDir, diskPath).replace(/\\/g, '/');
        if (sourceTab) {
          await recordOutputMeta(relPath, sourceTab);
        }
        res.json({
          ok: true,
          fileName,
          relativePath: relPath,
          savedPath: diskPath,
          bytes: stat.size,
          sourceTab: sourceTab || undefined,
        });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Lỗi lưu file mô tả .txt.' });
      }
    },
  );

  app.get('/api/output/files', async (req, res) => {
    try {
      const subPath = typeof req.query.path === 'string' ? req.query.path : '';
      const { baseDir, targetDir } = resolveSafeOutputDir(subPath);
      await fs.promises.mkdir(targetDir, { recursive: true });
      const metaMap = await readOutputMeta();
      const items: Array<{
        name: string;
        relativePath: string;
        savedPath: string;
        bytes: number;
        updatedAt: number;
        sourceTab?: string;
      }> = [];

      const scan = async (dir: string, depth: number) => {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory() && depth < 2) {
            await scan(full, depth + 1);
          } else if (entry.isFile() && /\.(mp4|webm|srt|vtt|mp3|wav|zip|txt)$/i.test(entry.name)) {
            const st = await fs.promises.stat(full).catch(() => null);
            if (st) {
              const relPath = path.relative(baseDir, full).replace(/\\/g, '/');
              items.push({
                name: entry.name,
                relativePath: relPath,
                savedPath: full,
                bytes: st.size,
                updatedAt: st.mtimeMs,
                sourceTab: metaMap[relPath]?.sourceTab,
              });
            }
          }
        }
      };

      await scan(targetDir, 0);
      items.sort((a, b) => b.updatedAt - a.updatedAt);
      res.json({ ok: true, outputDir: targetDir, baseDir, files: items });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Không đọc được thư mục output.' });
    }
  });

  app.get('/api/output/folders', async (_req, res) => {
    try {
      const { baseDir } = resolveSafeOutputDir('');
      await fs.promises.mkdir(baseDir, { recursive: true });
      const folders: string[] = [''];
      const entries = await fs.promises.readdir(baseDir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          folders.push(entry.name);
        }
      }
      res.json({ ok: true, baseDir, folders });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Không đọc được danh sách thư mục.' });
    }
  });

  app.get('/api/output/download', async (req, res) => {
    const rel = typeof req.query.path === 'string' ? req.query.path : '';
    const resolved = resolveSafeOutputFile(rel);
    if (!resolved) {
      res.status(400).json({ error: 'Đường dẫn file không hợp lệ.' });
      return;
    }
    const stat = await fs.promises.stat(resolved.filePath).catch(() => null);
    if (!stat || !stat.isFile()) {
      res.status(404).json({ error: 'Không tìm thấy file trong thư mục output.' });
      return;
    }
    const isInline = req.query.inline === '1';
    const fileName = path.basename(resolved.filePath);
    const ext = path.extname(fileName).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.txt': 'text/plain; charset=utf-8',
      '.srt': 'text/plain; charset=utf-8',
      '.vtt': 'text/vtt; charset=utf-8',
      '.md': 'text/plain; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.mp4': 'video/mp4',
      '.m4v': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.m4a': 'audio/mp4',
      '.zip': 'application/zip',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!isInline) {
      const stemOnly = fileName.slice(0, fileName.length - ext.length);
      const asciiStem = stemOnly.replace(/[^a-zA-Z0-9._ -]/g, '').trim() || 'output';
      const asciiFallback = `${asciiStem}${ext}`;
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      );
    }
    res.sendFile(resolved.filePath);
  });

  app.delete('/api/output/file', async (req, res) => {
    const rel = typeof req.query.path === 'string' ? req.query.path : '';
    const resolved = resolveSafeOutputFile(rel);
    if (!resolved) {
      res.status(400).json({ error: 'Đường dẫn file không hợp lệ.' });
      return;
    }
    await fs.promises.unlink(resolved.filePath).catch(() => undefined);
    await removeOutputMeta(rel);
    res.json({ ok: true });
  });

  app.post('/api/output/open', express.json({ limit: '64kb' }), async (req, res) => {
    const subPath = typeof req.body?.path === 'string' ? req.body.path : '';
    const { targetDir } = resolveSafeOutputDir(subPath);
    await fs.promises.mkdir(targetDir, { recursive: true });
    const entries = await fs.promises.readdir(targetDir).catch(() => []);
    let desktopOpened = false;
    try {
      const hasDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY || process.platform === 'darwin' || process.platform === 'win32');
      if (hasDisplay) {
        const cmd =
          process.platform === 'win32'
            ? 'explorer'
            : process.platform === 'darwin'
              ? 'open'
              : 'xdg-open';
        const p = spawn(cmd, [targetDir], { detached: true, stdio: 'ignore' });
        p.on('error', () => undefined);
        p.unref();
        desktopOpened = true;
      }
    } catch {
      desktopOpened = false;
    }
    res.json({
      ok: true,
      outputDir: targetDir,
      filesCount: entries.filter((n) => !n.startsWith('.')).length,
      desktopOpened,
    });
  });

  // ── Custom Vector Component Database Persistence ────────────────────────────
  app.get('/api/components', async (_req, res) => {
    try {
      const raw = await fs.promises.readFile(COMPONENTS_DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      res.json({
        ok: true,
        components: Array.isArray(parsed?.components) ? parsed.components : [],
        deletedBuiltIns: Array.isArray(parsed?.deletedBuiltIns)
          ? parsed.deletedBuiltIns
          : Array.isArray(parsed?.deletedVariants)
            ? parsed.deletedVariants
            : [],
      });
    } catch {
      res.json({ ok: true, components: [], deletedBuiltIns: [] });
    }
  });

  app.put('/api/components', express.json({ limit: '2mb' }), async (req, res) => {
    try {
      const resolvedTarget = path.resolve(COMPONENTS_DATA_FILE);
      if (!resolvedTarget.startsWith(COMPONENTS_DATA_DIR + path.sep)) {
        res.status(400).json({ error: 'Invalid storage path.' });
        return;
      }
      const components = Array.isArray(req.body?.components) ? req.body.components : [];
      const deletedBuiltIns = Array.isArray(req.body?.deletedBuiltIns)
        ? req.body.deletedBuiltIns
        : Array.isArray(req.body?.deletedVariants)
          ? req.body.deletedVariants
          : [];
      await fs.promises.mkdir(COMPONENTS_DATA_DIR, { recursive: true });
      await fs.promises.writeFile(
        resolvedTarget,
        JSON.stringify({ version: 1, components, deletedBuiltIns }, null, 2),
        'utf8',
      );
      res.json({ ok: true, count: components.length });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Lỗi lưu kho component.' });
    }
  });

  // ── Cartoon Character Animation Database Persistence ───────────────────────
  app.get('/api/cartoon-animations', async (_req, res) => {
    try {
      const raw = await fs.promises.readFile(CARTOON_ANIMATIONS_DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      res.json({
        ok: true,
        animations: Array.isArray(parsed?.animations) ? parsed.animations : [],
        hiddenBuiltIns: Array.isArray(parsed?.hiddenBuiltIns) ? parsed.hiddenBuiltIns : [],
      });
    } catch {
      res.json({ ok: true, animations: [], hiddenBuiltIns: [] });
    }
  });

  app.put('/api/cartoon-animations', express.json({ limit: '2mb' }), async (req, res) => {
    try {
      const resolvedTarget = path.resolve(CARTOON_ANIMATIONS_DATA_FILE);
      if (!resolvedTarget.startsWith(COMPONENTS_DATA_DIR + path.sep)) {
        res.status(400).json({ error: 'Invalid storage path.' });
        return;
      }
      const animations = Array.isArray(req.body?.animations) ? req.body.animations : [];
      const hiddenBuiltIns = Array.isArray(req.body?.hiddenBuiltIns) ? req.body.hiddenBuiltIns : [];
      await fs.promises.mkdir(COMPONENTS_DATA_DIR, { recursive: true });
      await fs.promises.writeFile(
        resolvedTarget,
        JSON.stringify({ version: 1, animations, hiddenBuiltIns }, null, 2),
        'utf8',
      );
      res.json({ ok: true, count: animations.length });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Lỗi lưu database animation nhân vật.',
      });
    }
  });

  // ── URL Content Scraper (English Reels Studio Port) ─────────────────────────
  app.post('/api/scraper/extract', express.json({ limit: '256kb' }), async (req, res) => {
    try {
      const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
      if (!rawUrl) {
        res.status(400).json({ error: 'Vui lòng nhập URL bài học tiếng Anh.' });
        return;
      }

      const { finalUrl, html } = await fetchPublicUrlSafe(rawUrl);
      const $ = loadHtml(html);

      const pageTitle =
        $('meta[property="og:title"]').attr('content')?.trim() ||
        $('h1').first().text().trim() ||
        $('title').first().text().trim() ||
        'Bài học tiếng Anh';

      // Collect candidate sub-lesson links before stripping navs in main container
      const base = new URL(finalUrl);
      const linkMap = new Map<string, string>();
      $('main a[href], article a[href], .content a[href], #content a[href], body a[href]').each((_i, el) => {
        const href = $(el).attr('href')?.trim();
        const text = $(el).text().replace(/\s+/g, ' ').trim();
        if (!href || text.length < 6 || text.length > 110) return;
        if (/^(#|javascript:|mailto:|tel:)/i.test(href)) return;
        try {
          const abs = new URL(href, base);
          if (abs.origin !== base.origin || abs.pathname === base.pathname) return;
          if (/\/(login|signup|register|contact|about|privacy|terms|tag|author|search)\b/i.test(abs.pathname)) return;
          if (!linkMap.has(abs.toString())) {
            linkMap.set(abs.toString(), text);
          }
        } catch {
          // ignore malformed href
        }
      });

      // Strip navigation, ads, comments, scripts, boilerplate
      $(
        'script, style, noscript, iframe, svg, nav, header, footer, aside, form, button, .nav, .navbar, .menu, .sidebar, .ads, .advertisement, .cookie-banner, .breadcrumb, .share-buttons, .comments, #comments',
      ).remove();

      const mainRoot = $('article').first().length
        ? $('article').first()
        : $('main').first().length
          ? $('main').first()
          : $('#content').first().length
            ? $('#content').first()
            : $('body');

      const blocks: string[] = [];
      mainRoot.find('h1, h2, h3, h4, p, li, blockquote').each((_i, el) => {
        const txt = $(el).text().replace(/\s+/g, ' ').trim();
        if (txt.length >= 4 && !/^(cookie|privacy|subscribe|advertisement|menu)$/i.test(txt)) {
          const tag = el.tagName.toLowerCase();
          blocks.push(tag.startsWith('h') ? `## ${txt}` : txt);
        }
      });

      const rawText = (blocks.length > 0 ? blocks.join('\n') : mainRoot.text().replace(/\s+\n/g, '\n'))
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, 18000);

      const links = Array.from(linkMap.entries())
        .slice(0, 24)
        .map(([url, title]) => ({ url, title }));
      const exercises = splitMultipleExercisesFromText(rawText);
      const isDirectoryPage = links.length >= 6 && rawText.length < 1800;

      res.json({
        ok: true,
        url: finalUrl,
        title: pageTitle,
        isDirectoryPage,
        links,
        rawText,
        detectedMode: detectReelMode(rawText),
        exercises,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể đọc nội dung từ URL.';
      const status = /nội bộ|không hợp lệ|giao thức|từ chối/i.test(msg) ? 400 : 500;
      res.status(status).json({ error: msg });
    }
  });

  // ── Free & Key-based Multi-Provider TTS Catalog & Synthesizer ───────────────
  app.get('/api/tts/voices', async (req, res) => {
    const resolvedKeys = resolveClientAndEnvKeys(req);
    const elevenLabsKey = resolvedKeys.elevenLabsApiKey;
    const geminiKey = resolvedKeys.geminiApiKey;
    let elevenLabsVoices = ELEVENLABS_DEFAULT_VOICES;
    if (elevenLabsKey) {
      try {
        const elRes = await fetch('https://api.elevenlabs.io/v1/voices', {
          headers: { 'xi-api-key': elevenLabsKey },
          signal: AbortSignal.timeout(4500),
        });
        if (elRes.ok) {
          const elJson = (await elRes.json()) as {
            voices?: Array<{ voice_id?: string; name?: string; labels?: Record<string, string> }>;
          };
          if (Array.isArray(elJson.voices) && elJson.voices.length > 0) {
            elevenLabsVoices = elJson.voices.slice(0, 20).map((v) => ({
              id: String(v.voice_id || ''),
              label: `${v.name || 'Voice'}${v.labels?.accent ? ` (${v.labels.accent})` : ''}`,
              lang: 'multi',
            }));
          }
        }
      } catch {
        // Keep curated defaults on network timeout
      }
    }

    const whisperStatus = await getWhisperCacheStatus().catch(() => ({
      fasterWhisperAvailable: false,
      cachedOnnxModels: [] as string[],
      loadedInMemory: [] as string[],
    }));

    res.json({
      ok: true,
      hasGeminiKey: Boolean(geminiKey),
      hasElevenLabsKey: Boolean(elevenLabsKey),
      hasWhisperLocal: true,
      fasterWhisperAvailable: whisperStatus.fasterWhisperAvailable,
      whisperStatus,
      providers: [
        {
          id: 'edge',
          name: 'Microsoft Edge Neural TTS (Miễn phí · Chất lượng cao)',
          voices: [
            { id: 'en-US-JennyNeural', label: 'Jenny (US Female · Tự nhiên)', lang: 'en-US' },
            { id: 'en-US-GuyNeural', label: 'Guy (US Male · Rõ ràng)', lang: 'en-US' },
            { id: 'en-US-AriaNeural', label: 'Aria (US Female · Biểu cảm)', lang: 'en-US' },
            { id: 'en-GB-SoniaNeural', label: 'Sonia (UK Female · Chuẩn Anh)', lang: 'en-GB' },
            { id: 'en-AU-NatashaNeural', label: 'Natasha (AU Female)', lang: 'en-AU' },
            { id: 'vi-VN-HoaiMyNeural', label: 'Hoài My (Tiếng Việt Nữ)', lang: 'vi-VN' },
            { id: 'vi-VN-NamMinhNeural', label: 'Nam Minh (Tiếng Việt Nam)', lang: 'vi-VN' },
            { id: 'ja-JP-NanamiNeural', label: 'Nanami (日本語 Nữ)', lang: 'ja-JP' },
            { id: 'zh-CN-XiaoxiaoNeural', label: 'Xiaoxiao (中文 Nữ)', lang: 'zh-CN' },
            { id: 'zh-CN-YunxiNeural', label: 'Yunxi (中文 Nam)', lang: 'zh-CN' },
            { id: 'ko-KR-SunHiNeural', label: 'SunHi (한국어 Nữ)', lang: 'ko-KR' },
            { id: 'fr-FR-DeniseNeural', label: 'Denise (Français Nữ)', lang: 'fr-FR' },
            { id: 'es-ES-ElviraNeural', label: 'Elvira (Español Nữ)', lang: 'es-ES' },
          ],
        },
        {
          id: 'elevenlabs',
          name: elevenLabsKey
            ? 'ElevenLabs AI Voice (Đã nhập API Key)'
            : 'ElevenLabs AI Voice (Nhập Key trực tiếp trong App)',
          voices: elevenLabsVoices,
        },
        {
          id: 'google',
          name: 'Google Translate TTS (Miễn phí · Đa ngôn ngữ)',
          voices: [
            { id: 'en', label: 'English (Google)', lang: 'en' },
            { id: 'vi', label: 'Tiếng Việt (Google)', lang: 'vi' },
            { id: 'ja', label: '日本語 (Google)', lang: 'ja' },
            { id: 'zh-CN', label: '中文 (Google)', lang: 'zh-CN' },
            { id: 'ko', label: '한국어 (Google)', lang: 'ko' },
            { id: 'fr', label: 'Français (Google)', lang: 'fr' },
            { id: 'es', label: 'Español (Google)', lang: 'es' },
          ],
        },
        {
          id: 'streamelements',
          name: 'StreamElements Polly Voices (Miễn phí)',
          voices: [
            { id: 'Joanna', label: 'Joanna (US Female)', lang: 'en-US' },
            { id: 'Matthew', label: 'Matthew (US Male)', lang: 'en-US' },
            { id: 'Amy', label: 'Amy (UK Female)', lang: 'en-GB' },
            { id: 'Brian', label: 'Brian (UK Male)', lang: 'en-GB' },
            { id: 'Mizuki', label: 'Mizuki (日本語)', lang: 'ja-JP' },
            { id: 'Takumi', label: 'Takumi (日本語)', lang: 'ja-JP' },
          ],
        },
        {
          id: 'gemini',
          name: geminiKey
            ? 'Gemini Flash TTS (Đã nhập API Key)'
            : 'Gemini Flash TTS (Nhập Key trực tiếp trong App)',
          voices: [
            { id: 'Kore', label: 'Kore (Tự nhiên · Rõ nét)', lang: 'multi' },
            { id: 'Puck', label: 'Puck (Năng động)', lang: 'multi' },
            { id: 'Aoede', label: 'Aoede (Nhẹ nhàng)', lang: 'multi' },
            { id: 'Charon', label: 'Charon (Trầm ấm)', lang: 'multi' },
          ],
        },
      ],
    });
  });

  async function executeTtsSynthesis(
    body: Record<string, any>,
    onProgress?: (progress: number, stageLabel: string) => void,
    keyOverrides?: { elevenLabsApiKey?: string; geminiApiKey?: string },
  ) {
    const tmpDir = path.join(os.tmpdir(), `ks-tts-${crypto.randomUUID()}`);
    await fs.promises.mkdir(tmpDir, { recursive: true });
    try {
      const providerReq = typeof body?.provider === 'string' ? body.provider : 'auto';
      const voice = typeof body?.voice === 'string' ? body.voice : 'en-US-JennyNeural';
      const lang = typeof body?.lang === 'string' ? body.lang : 'en';
      const secondaryVoice = typeof body?.secondaryVoice === 'string' ? body.secondaryVoice.trim() : '';
      const secondaryLang =
        typeof body?.secondaryLang === 'string' && body.secondaryLang.trim()
          ? body.secondaryLang.trim()
          : normalizeTtsLangCode(lang) === 'vi'
            ? 'en-US'
            : 'vi-VN';
      const autoSplitLanguages = body?.autoSplitLanguages !== false;
      const rate = Number(body?.rate ?? 1.0);
      const rawSegments = Array.isArray(body?.segments)
        ? body.segments
            .map(
              (
                seg: {
                  id?: string;
                  text?: string;
                  pauseAfterSec?: number;
                  voice?: string;
                  lang?: string;
                  provider?: string;
                  rate?: number;
                  autoSplit?: boolean;
                },
                i: number,
              ) => ({
                id: seg?.id || `seg-${i + 1}`,
                text: stripTimestampsFromScript(String(seg?.text || '')),
                pauseAfterSec: seg?.pauseAfterSec,
                voice: typeof seg?.voice === 'string' ? seg.voice.trim() : '',
                lang: typeof seg?.lang === 'string' ? seg.lang.trim() : '',
                provider: typeof seg?.provider === 'string' ? seg.provider.trim() : '',
                rate: typeof seg?.rate === 'number' && Number.isFinite(seg.rate) ? seg.rate : undefined,
                autoSplit: typeof seg?.autoSplit === 'boolean' ? seg.autoSplit : undefined,
              }),
            )
            .filter((s: { text: string }) => s.text.length > 0)
        : typeof body?.text === 'string' && body.text.trim()
          ? stripTimestampsFromScript(body.text)
              .split(/\r?\n+/)
              .map((t: string, i: number) => ({
                id: `seg-${i + 1}`,
                text: t.trim(),
                pauseAfterSec: 0,
                voice: '',
                lang: '',
                provider: '',
                rate: undefined as number | undefined,
                autoSplit: undefined as boolean | undefined,
              }))
              .filter((s: { text: string }) => s.text.length > 0)
          : [];

      if (rawSegments.length === 0) {
        const err = new Error('Vui lòng nhập nội dung văn bản để tạo giọng đọc.');
        (err as any).statusCode = 400;
        throw err;
      }

      const geminiKey =
        (keyOverrides?.geminiApiKey || body?.geminiApiKey || process.env.GEMINI_API_KEY || '').trim();
      const elevenLabsKey =
        (
          keyOverrides?.elevenLabsApiKey ||
          body?.elevenLabsApiKey ||
          body?.elevenlabsApiKey ||
          process.env.ELEVENLABS_API_KEY ||
          ''
        ).trim();
      if (providerReq === 'elevenlabs' && !elevenLabsKey) {
        const err = new Error(
          'Chưa có ELEVENLABS_API_KEY. Hãy dán trực tiếp API Key vào ô nhập ngay trong App (hoặc chọn giọng miễn phí Edge Neural / Google / Polly).',
        );
        (err as any).statusCode = 400;
        throw err;
      }
      if (providerReq === 'gemini' && !geminiKey) {
        const err = new Error(
          'Chưa có GEMINI_API_KEY. Hãy dán trực tiếp API Key vào ô nhập ngay trong App (hoặc chọn giọng miễn phí Edge Neural / Google / Polly).',
        );
        (err as any).statusCode = 400;
        throw err;
      }

      const segFiles: string[] = [];
      const segDurations: number[] = [];
      const spokenDurations: number[] = [];
      const pauseDurations: number[] = [];
      const cues: Array<{
        id: string;
        start: number;
        end: number;
        text: string;
        words: ReturnType<typeof interpolateWordTimings>;
      }> = [];
      let providerUsed = providerReq;
      let cursor = 0;
      let anyWordBoundaries = false;

      const synthesizeOneSpan = async (
        spanText: string,
        spanVoice: string,
        spanLang: string,
        spanProvider: string,
        spanRate: number,
        tag: string,
      ): Promise<{ buffer: Buffer; wordBoundaries: EdgeWordBoundary[]; provider: string }> => {
        let buf: Buffer | null = null;
        let wordBoundaries: EdgeWordBoundary[] = [];
        let used = spanProvider;
        const attemptOrder = Array.from(
          new Set(
            spanProvider === 'auto'
              ? ['edge', 'google', 'streamelements', ...(elevenLabsKey ? ['elevenlabs'] : []), ...(geminiKey ? ['gemini'] : [])]
              : [spanProvider, 'edge', 'google', 'streamelements'],
          ),
        );
        const attemptErrors: string[] = [];
        const hasHanziOnly = /[\u4e00-\u9faf\u3400-\u4dbf]/.test(spanText) && !/[\u3040-\u30ff]/.test(spanText);
        const safeSpanLang =
          hasHanziOnly && normalizeTtsLangCode(spanLang) !== 'zh' && normalizeTtsLangCode(spanLang) !== 'ja'
            ? 'zh'
            : spanLang;
        const safeSpanVoice =
          hasHanziOnly && detectVoiceLangCode(spanVoice) !== 'zh' && detectVoiceLangCode(spanVoice) !== 'ja'
            ? pickEdgeVoiceForLang('zh', spanVoice)
            : spanVoice;
        const langCode = normalizeTtsLangCode(safeSpanLang);

        for (const p of attemptOrder) {
          try {
            if (p === 'elevenlabs') {
              if (!elevenLabsKey) continue;
              buf = await synthesizeElevenLabsTtsBuffer(spanText, safeSpanVoice || voice, elevenLabsKey);
              used = 'elevenlabs';
              break;
            } else if (p === 'edge') {
              const edgeVoice = pickEdgeVoiceForLang(safeSpanLang, safeSpanVoice || voice);
              let edgeOut: { buffer: Buffer; wordBoundaries: EdgeWordBoundary[] };
              try {
                edgeOut = await synthesizeEdgeTtsBuffer(spanText, edgeVoice, spanRate, tmpDir, tag);
              } catch {
                await new Promise((r) => setTimeout(r, 250));
                edgeOut = await synthesizeEdgeTtsBuffer(spanText, edgeVoice, spanRate, tmpDir, `${tag}_r`);
              }
              buf = edgeOut.buffer;
              wordBoundaries = edgeOut.wordBoundaries;
              used = 'edge';
              break;
            } else if (p === 'google') {
              buf = await synthesizeGoogleTranslateTtsChunked(spanText, safeSpanLang || langCode, tmpDir, tag, spanRate);
              used = 'google';
              break;
            } else if (p === 'streamelements') {
              // StreamElements only supports English & Japanese Polly voices; skip for vi/zh/ko/fr/es so it never misreads them
              if (langCode !== 'en' && langCode !== 'ja') continue;
              const seVoice =
                langCode === 'ja'
                  ? ['Mizuki', 'Takumi'].includes(safeSpanVoice)
                    ? safeSpanVoice
                    : 'Mizuki'
                  : ['Joanna', 'Matthew', 'Amy', 'Brian'].includes(safeSpanVoice)
                    ? safeSpanVoice
                    : 'Joanna';
              buf = await synthesizeStreamElementsTts(spanText, seVoice, tmpDir, tag);
              used = 'streamelements';
              break;
            } else if (p === 'gemini' && geminiKey) {
              buf = await synthesizeGeminiTtsMp3(spanText, safeSpanVoice || voice, geminiKey, tmpDir, tag);
              used = 'gemini';
              break;
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            attemptErrors.push(`${p}: ${msg}`);
          }
        }

        if (!buf || buf.length === 0) {
          throw new Error(
            attemptErrors.length > 0
              ? `Không thể tạo giọng đọc (${attemptErrors.join(' | ')})`
              : 'Không thể tạo giọng đọc từ các API TTS.',
          );
        }
        return { buffer: buf, wordBoundaries, provider: used };
      };

      for (let i = 0; i < rawSegments.length; i++) {
        const segItem = rawSegments[i];
        const segText = sanitizeTtsSegmentText(String(segItem?.text || ''));
        const pauseAfterSec = Math.max(0, Math.min(12, Number(segItem?.pauseAfterSec || 0)));
        if (!segText) continue;

        const segPrimaryLang = segItem?.lang || lang;
        const segPrimaryVoice = segItem?.voice || voice;
        const segProvider = segItem?.provider || providerReq;
        const segRate = segItem?.rate ?? rate;
        const segAutoSplit =
          typeof segItem?.autoSplit === 'boolean' ? segItem.autoSplit : autoSplitLanguages;

        const spans = splitMixedLanguageTtsSpans(segText, {
          primaryLang: segPrimaryLang,
          secondaryLang,
          primaryVoice: segPrimaryVoice,
          secondaryVoice,
          autoSplit: segAutoSplit,
        });

        onProgress?.(
          Math.max(6, Math.round((i / rawSegments.length) * 84)),
          spans.length > 1
            ? `Đang đọc song ngữ đoạn ${i + 1}/${rawSegments.length} (${spans.length} TTS riêng)...`
            : `Đang đọc đoạn ${i + 1}/${rawSegments.length} (${segProvider === 'auto' ? 'Auto' : segProvider})...`,
        );

        const normPath = path.join(tmpDir, `seg_norm_${i}.wav`);
        const spanFiles: string[] = [];
        const spanWordTimings: ReturnType<typeof interpolateWordTimings> = [];
        const segWordBoundaries: EdgeWordBoundary[] = [];
        let spanOffset = 0;

        for (let sIdx = 0; sIdx < spans.length; sIdx++) {
          const span = spans[sIdx];
          const spokenSpanText =
            spans.length > 1 ? sanitizeSpanTextForSpeech(span.text) : span.text;
          const synth = await synthesizeOneSpan(
            spokenSpanText,
            span.voice,
            span.lang,
            segProvider,
            segRate,
            `s${i}_${sIdx}`,
          );
          providerUsed = synth.provider;

          const spanRawPath = path.join(tmpDir, `seg_raw_${i}_${sIdx}.mp3`);
          const spanRawWavPath = path.join(tmpDir, `seg_raw_${i}_${sIdx}.wav`);
          const spanNormPath = path.join(tmpDir, `seg_norm_${i}_${sIdx}.wav`);
          await fs.promises.writeFile(spanRawPath, synth.buffer);
          await runProcess('ffmpeg', [
            '-y',
            '-i',
            spanRawPath,
            '-ar',
            '24000',
            '-ac',
            '1',
            '-c:a',
            'pcm_s16le',
            spanRawWavPath,
          ]);

          let trimStart = 0;
          try {
            const wavBuf = await fs.promises.readFile(spanRawWavPath);
            const { samples, sampleRate } = parseWavBufferToMonoFloat32(wavBuf);
            const bounds = detectWavSpeechBounds(samples, sampleRate, {
              leadPadSec: spans.length > 1 ? (sIdx === 0 ? 0.035 : 0.02) : 0.045,
              tailPadSec: spans.length > 1 ? (sIdx === spans.length - 1 ? 0.075 : 0.025) : 0.09,
              minSpeechSpanSec: 0.14,
            });
            const trimDur = bounds.speechEndSec - bounds.speechStartSec;
            if (trimDur >= 0.1 && (bounds.speechStartSec > 0.015 || bounds.durationSec - bounds.speechEndSec > 0.02)) {
              trimStart = bounds.speechStartSec;
              const fadeOutStart = Math.max(0, Number((trimDur - 0.012).toFixed(4)));
              await runProcess('ffmpeg', [
                '-y',
                '-ss',
                bounds.speechStartSec.toFixed(4),
                '-to',
                bounds.speechEndSec.toFixed(4),
                '-i',
                spanRawWavPath,
                '-af',
                `afade=t=in:st=0:d=0.01,afade=t=out:st=${fadeOutStart}:d=0.012`,
                '-ar',
                '24000',
                '-ac',
                '1',
                '-c:a',
                'pcm_s16le',
                spanNormPath,
              ]);
            } else {
              await fs.promises.copyFile(spanRawWavPath, spanNormPath);
            }
          } catch {
            await fs.promises.copyFile(spanRawWavPath, spanNormPath);
          }

          const spanDur = await getAudioDurationSec(spanNormPath);
          spanFiles.push(spanNormPath);

          const spanAbsStart = Number((cursor + spanOffset).toFixed(3));
          const spanAbsEnd = Number((cursor + spanOffset + spanDur).toFixed(3));
          const shiftedBoundaries: EdgeWordBoundary[] = synth.wordBoundaries.map((wb) => {
            const st = Number(Math.max(0, Math.min(spanDur - 0.04, wb.start - trimStart)).toFixed(3));
            const en = Number(Math.max(st + 0.04, Math.min(spanDur, wb.end - trimStart)).toFixed(3));
            return { word: wb.word, start: st, end: en };
          });

          if (shiftedBoundaries.length > 0) {
            for (const wb of shiftedBoundaries) {
              segWordBoundaries.push({
                word: wb.word,
                start: Number((spanOffset + wb.start).toFixed(3)),
                end: Number((spanOffset + wb.end).toFixed(3)),
              });
            }
          }

          // Track exact per-span word timings so multi-TTS segments keep accurate word highlight positions
          const spanTokens = tokenizeTextForKaraoke(span.text);
          if (shiftedBoundaries.length > 0 && spanTokens.length > 0 && shiftedBoundaries.length === spanTokens.length) {
            for (let wIdx = 0; wIdx < spanTokens.length; wIdx++) {
              const wb = shiftedBoundaries[wIdx];
              const ws = Number(Math.max(spanAbsStart, Math.min(spanAbsEnd - 0.04, spanAbsStart + wb.start)).toFixed(3));
              const we = Number(Math.max(ws + 0.04, Math.min(spanAbsEnd, spanAbsStart + wb.end)).toFixed(3));
              spanWordTimings.push({ word: spanTokens[wIdx], start: ws, end: we });
            }
            anyWordBoundaries = true;
          } else if (shiftedBoundaries.length >= 2) {
            const firstStart = Math.max(spanAbsStart, spanAbsStart + shiftedBoundaries[0].start);
            const lastEnd = Math.min(
              spanAbsEnd,
              Math.max(firstStart + 0.16, spanAbsStart + shiftedBoundaries[shiftedBoundaries.length - 1].end),
            );
            spanWordTimings.push(...interpolateWordTimings(span.text, firstStart, lastEnd));
            anyWordBoundaries = true;
          } else {
            spanWordTimings.push(...interpolateWordTimings(span.text, spanAbsStart, spanAbsEnd));
          }

          spanOffset += spanDur;
        }

        if (spanFiles.length === 1) {
          await fs.promises.copyFile(spanFiles[0], normPath);
        } else {
          const spanConcatTxt = path.join(tmpDir, `seg_spans_${i}.txt`);
          await fs.promises.writeFile(
            spanConcatTxt,
            spanFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'),
            'utf8',
          );
          await runProcess('ffmpeg', [
            '-y',
            '-f',
            'concat',
            '-safe',
            '0',
            '-i',
            spanConcatTxt,
            '-ar',
            '24000',
            '-ac',
            '1',
            '-c:a',
            'pcm_s16le',
            normPath,
          ]);
        }

        const spokenDur = await getAudioDurationSec(normPath);
        segFiles.push(normPath);

        let actualPauseDur = 0;
        if (pauseAfterSec > 0.15) {
          const pausePath = path.join(tmpDir, `seg_pause_${i}.wav`);
          await runProcess('ffmpeg', [
            '-y',
            '-f',
            'lavfi',
            '-i',
            'anullsrc=r=24000:cl=mono',
            '-t',
            String(Number(pauseAfterSec.toFixed(2))),
            '-ar',
            '24000',
            '-ac',
            '1',
            '-c:a',
            'pcm_s16le',
            pausePath,
          ]);
          actualPauseDur = await getAudioDurationSec(pausePath);
          segFiles.push(pausePath);
        }

        const totalSegDur = Number((spokenDur + actualPauseDur).toFixed(3));
        segDurations.push(totalSegDur);
        spokenDurations.push(spokenDur);
        pauseDurations.push(actualPauseDur);

        const start = Number(cursor.toFixed(3));
        const spokenEnd = Number((cursor + spokenDur).toFixed(3));
        const segTokens = tokenizeTextForKaraoke(segText);
        let cueWords =
          spanWordTimings.length > 0 && (spans.length > 1 || spanWordTimings.length === segTokens.length)
            ? spanWordTimings
            : interpolateWordTimings(segText, start, spokenEnd);

        if (spans.length === 1 && segWordBoundaries.length > 0) {
          if (segTokens.length > 0 && segWordBoundaries.length === segTokens.length) {
            cueWords = segTokens.map((tok, wIdx) => {
              const wb = segWordBoundaries[wIdx];
              const ws = Number(Math.max(start, Math.min(spokenEnd - 0.04, cursor + wb.start)).toFixed(3));
              const we = Number(Math.max(ws + 0.04, Math.min(spokenEnd, cursor + wb.end)).toFixed(3));
              return { word: tok, start: ws, end: we };
            });
            anyWordBoundaries = true;
          } else if (segWordBoundaries.length >= 2) {
            const firstStart = Math.max(start, cursor + segWordBoundaries[0].start);
            const lastEnd = Math.min(
              spokenEnd,
              Math.max(firstStart + 0.2, cursor + segWordBoundaries[segWordBoundaries.length - 1].end),
            );
            cueWords = interpolateWordTimings(segText, firstStart, lastEnd);
            anyWordBoundaries = true;
          }
        }
        cues.push({
          id: String(segItem?.id || `tts-cue-${i + 1}`),
          start,
          end: spokenEnd,
          text: segText,
          words: cueWords,
        });
        cursor = Number((cursor + totalSegDur).toFixed(3));
        onProgress?.(
          Math.min(88, Math.max(8, Math.round(((i + 1) / rawSegments.length) * 86))),
          `Đã hoàn thành đoạn ${i + 1}/${rawSegments.length}`,
        );
      }

      if (segFiles.length === 0) {
        throw new Error('Các đoạn văn bản sau khi lọc ký tự đặc biệt đều bị rỗng.');
      }

      onProgress?.(92, 'Đang ghép file Audio MP3 hoàn chỉnh...');
      const finalAudioPath = path.join(tmpDir, 'combined.mp3');
      if (segFiles.length === 1) {
        await runProcess('ffmpeg', ['-y', '-i', segFiles[0], '-c:a', 'libmp3lame', '-ar', '24000', '-ac', '1', '-b:a', '64k', finalAudioPath]);
      } else {
        const listPath = path.join(tmpDir, 'concat.txt');
        await fs.promises.writeFile(
          listPath,
          segFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'),
          'utf8',
        );
        await runProcess('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c:a', 'libmp3lame', '-ar', '24000', '-ac', '1', '-b:a', '64k', finalAudioPath]);
      }

      const finalBuf = await fs.promises.readFile(finalAudioPath);
      const totalDur = Number(cursor.toFixed(3));
      onProgress?.(100, 'Tổng hợp Audio TTS hoàn tất!');

      return {
        ok: true,
        providerUsed,
        mimeType: 'audio/mpeg',
        audioBase64: finalBuf.toString('base64'),
        durationSec: totalDur,
        segmentDurations: segDurations,
        spokenDurations,
        pauseDurations,
        hasWordBoundaries: anyWordBoundaries,
        cues,
        srt: cuesToSrt(cues),
        vtt: cuesToVtt(cues),
      };
    } finally {
      await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  app.post('/api/tts/synthesize', express.json({ limit: '10mb' }), async (req, res) => {
    try {
      const resolvedKeys = resolveClientAndEnvKeys(req, req.body || {});
      const result = await executeTtsSynthesis(req.body || {}, undefined, resolvedKeys);
      res.json(result);
    } catch (err: any) {
      const status = Number(err?.statusCode) || 500;
      res.status(status).json({ error: err instanceof Error ? err.message : 'Lỗi tạo Audio TTS.' });
    }
  });

  app.post('/api/tts/synthesize/start', express.json({ limit: '10mb' }), (req, res) => {
    const body = req.body || {};
    const resolvedKeys = resolveClientAndEnvKeys(req, body);
    const providerReq = typeof body?.provider === 'string' ? body.provider : 'auto';
    if (providerReq === 'elevenlabs' && !resolvedKeys.elevenLabsApiKey) {
      res.status(400).json({
        error: 'Chưa có ELEVENLABS_API_KEY. Hãy dán trực tiếp Key vào ô nhập trong App (hoặc chọn Edge Neural / Google / Polly).',
      });
      return;
    }
    if (providerReq === 'gemini' && !resolvedKeys.geminiApiKey) {
      res.status(400).json({
        error: 'Chưa có GEMINI_API_KEY. Hãy dán trực tiếp Key vào ô nhập trong App (hoặc chọn Edge Neural / Google / Polly).',
      });
      return;
    }

    const jobId = crypto.randomUUID();
    const jobState: TtsJobState = {
      id: jobId,
      status: 'running',
      progress: 4,
      stageLabel: 'Đang chuẩn bị tạo giọng đọc TTS...',
      createdAt: Date.now(),
    };
    ttsJobs.set(jobId, jobState);
    writeAsyncJobSnapshotSync('tts', jobId, jobState);
    res.status(202).json({ ok: true, jobId });

    void (async () => {
      let lastSavedPct = -10;
      try {
        const result = await executeTtsSynthesis(
          body,
          (pct, label) => {
            jobState.progress = pct;
            jobState.stageLabel = label;
            if (Math.abs(pct - lastSavedPct) >= 12) {
              lastSavedPct = pct;
              void saveAsyncJobSnapshot('tts', jobId, jobState);
            }
          },
          resolvedKeys,
        );
        jobState.status = 'done';
        jobState.progress = 100;
        jobState.stageLabel = 'Tổng hợp Audio hoàn tất!';
        jobState.result = result;
        await saveAsyncJobSnapshot('tts', jobId, jobState);
      } catch (err) {
        jobState.status = 'error';
        jobState.error = err instanceof Error ? err.message : 'Lỗi tạo Audio TTS.';
        await saveAsyncJobSnapshot('tts', jobId, jobState);
      } finally {
        scheduleAsyncJobCleanup('tts', jobId, ttsJobs);
      }
    })();
  });

  app.get('/api/tts/synthesize/:jobId', async (req, res) => {
    const job = await loadAsyncJobSnapshot('tts', req.params.jobId, ttsJobs);
    if (!job) {
      res.status(404).json({ error: 'Không tìm thấy tác vụ tổng hợp Audio TTS.' });
      return;
    }
    res.json({
      ok: true,
      id: job.id,
      status: job.status,
      progress: job.progress,
      stageLabel: job.stageLabel,
      result: job.result,
      error: job.error,
    });
  });

  // ── Multi-Language Subtitle Extractor (Whisper Local + Gemini / Free Translation) ──
  app.post(
    '/api/subtitles/transcribe',
    express.raw({ type: () => true, limit: '250mb' }),
    async (req, res) => {
      req.setTimeout(600_000);
      res.setTimeout(600_000);
      const tmpDir = path.join(os.tmpdir(), `ks-sub-${crypto.randomUUID()}`);
      await fs.promises.mkdir(tmpDir, { recursive: true });
      try {
        const body = req.body;
        if (!Buffer.isBuffer(body) || body.length === 0) {
          res.status(400).json({ error: 'Vui lòng tải lên file video hoặc audio.' });
          return;
        }

        const ext = sanitizeMediaExt(
          typeof req.headers['x-file-ext'] === 'string' ? req.headers['x-file-ext'] : '.mp4',
        );
        const sourceLang =
          typeof req.headers['x-source-lang'] === 'string' ? req.headers['x-source-lang'].trim() : 'auto';
        const translateLang =
          typeof req.headers['x-translate-lang'] === 'string' ? req.headers['x-translate-lang'].trim() : 'none';
        const engineReq =
          typeof req.headers['x-engine'] === 'string' ? req.headers['x-engine'].trim().toLowerCase() : 'faster-whisper';
        const whisperModel =
          typeof req.headers['x-whisper-model'] === 'string' && req.headers['x-whisper-model'].trim()
            ? req.headers['x-whisper-model'].trim()
            : 'Xenova/whisper-small';

        const inputPath = path.join(tmpDir, `input${ext}`);
        const wavPath = path.join(tmpDir, 'extracted_16k.wav');
        const mp3Path = path.join(tmpDir, 'extracted.mp3');
        await fs.promises.writeFile(inputPath, body);

        await runProcess('ffmpeg', [
          '-y',
          '-i',
          inputPath,
          '-vn',
          '-ac',
          '1',
          '-ar',
          '16000',
          '-c:a',
          'pcm_s16le',
          wavPath,
        ]);
        await runProcess('ffmpeg', [
          '-y',
          '-i',
          wavPath,
          '-c:a',
          'libmp3lame',
          '-b:a',
          '48k',
          mp3Path,
        ]);

        const mp3Buf = await fs.promises.readFile(mp3Path);
        const totalDur = await getAudioDurationSec(wavPath);
        const apiKey = resolveClientAndEnvKeys(req).geminiApiKey;

        let rawSegs: Array<{ start: number; end: number; text: string; translation?: string }> = [];
        let detectedLang = sourceLang;
        let engineUsed = 'faster-whisper (Built-in)';
        let translationEngineUsed = '';
        let whisperWords: Array<{ word: string; start: number; end: number }> = [];

        const tryGeminiTranscribe = async () => {
          if (!apiKey) {
            throw new Error('Chưa nhập GEMINI_API_KEY. Hãy dán Key trực tiếp trong App hoặc .env.');
          }
          const langHint =
            sourceLang && sourceLang !== 'auto'
              ? `The spoken language is ${sourceLang}.`
              : 'Auto-detect the spoken language accurately (English, Vietnamese, Japanese, Chinese, Korean, French, Spanish, etc.).';
          const translateHint =
            translateLang && translateLang !== 'none'
              ? `Also provide a natural translation into ${translateLang} in the "translation" field of each segment.`
              : 'Leave "translation" empty.';
          const prompt = [
            'Transcribe the audio into timestamped subtitle segments suitable for short-form 9:16 videos (1–2 short clauses per segment).',
            langHint,
            translateHint,
            'Return ONLY valid JSON with shape: { "language": "detected code", "segments": [{ "start": 0.0, "end": 2.5, "text": "...", "translation": "..." }] }.',
            `Audio total duration is approximately ${totalDur.toFixed(2)} seconds. Ensure start < end and timestamps never exceed ${totalDur.toFixed(2)}.`,
          ].join(' ');

          const { GoogleGenAI } = await import('@google/genai');
          const ai = new GoogleGenAI({
            apiKey,
            httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
          });
          // Use supported Gemini audio-capable models without triggering broken v1 404s
          const modelCandidates = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
          let aiRes: any = null;
          let lastErr: unknown = null;
          for (const modelName of modelCandidates) {
            try {
              aiRes = await ai.models.generateContent({
                model: modelName,
                contents: [
                  { inlineData: { mimeType: 'audio/mp3', data: mp3Buf.toString('base64') } },
                  { text: prompt },
                ],
                config: { responseMimeType: 'application/json' },
              });
              engineUsed = `gemini (${modelName})`;
              if (translateLang && translateLang !== 'none') {
                translationEngineUsed = `gemini (${modelName})`;
              }
              break;
            } catch (err) {
              lastErr = err;
            }
          }
          if (!aiRes) throw lastErr instanceof Error ? lastErr : new Error('Gemini API không phản hồi.');
          const rawJsonText = (aiRes.text || '').trim();
          let parsed: { language?: string; segments?: Array<{ start?: number; end?: number; text?: string; translation?: string }> } = {};
          try {
            parsed = JSON.parse(rawJsonText);
          } catch {
            const m = rawJsonText.match(/\{[\s\S]*\}/);
            if (m) parsed = JSON.parse(m[0]);
          }
          detectedLang = parsed.language || sourceLang;
          rawSegs = (Array.isArray(parsed.segments) ? parsed.segments : []).map((s) => ({
            start: Number(s.start ?? 0),
            end: Number(s.end ?? 0),
            text: String(s.text || '').trim(),
            translation: String(s.translation || '').trim(),
          }));
        };

        if (engineReq === 'gemini') {
          try {
            await tryGeminiTranscribe();
          } catch (gemErr) {
            // Auto-rescue with Built-in Local Whisper if Gemini fails (404 / no key)
            const wRes = await runLocalWhisperOnWav(wavPath, {
              sourceLang,
              modelId: whisperModel,
              wordLevel: true,
              preferFasterWhisper: true,
            });
            rawSegs = wRes.segments;
            detectedLang = wRes.language || sourceLang;
            whisperWords = wRes.words.map((w) => ({ word: w.text, start: w.start, end: w.end }));
            engineUsed = `${wRes.backendUsed || 'faster-whisper (Built-in)'} · ${wRes.modelUsed || whisperModel}`;
            if (rawSegs.length === 0) throw gemErr;
          }
        } else {
          // Default 'faster-whisper' or 'auto' or 'whisper': Run Local Whisper (0 API key required)
          const wRes = await runLocalWhisperOnWav(wavPath, {
            sourceLang,
            modelId: whisperModel,
            wordLevel: true,
            preferFasterWhisper: engineReq !== 'whisper',
          });
          rawSegs = wRes.segments;
          detectedLang = wRes.language || sourceLang;
          whisperWords = wRes.words.map((w) => ({ word: w.text, start: w.start, end: w.end }));
          engineUsed = `${wRes.backendUsed || 'faster-whisper (Built-in)'} · ${wRes.modelUsed || whisperModel}`;

          // Optional bilingual translation: uses Gemini LLM if GEMINI_API_KEY is set, otherwise free Google Translate fallback
          if (rawSegs.length > 0 && translateLang && translateLang !== 'none') {
            try {
              const tr = await translateLinesWithGeminiOrFree(
                rawSegs.map((s) => s.text),
                translateLang,
                apiKey,
              );
              translationEngineUsed = tr.engineUsed;
              rawSegs = rawSegs.map((s, idx) => ({
                ...s,
                translation: String(tr.translations?.[idx] || '').trim(),
              }));
            } catch {
              // Keep original language cleanly if translation fails
            }
          }
        }

        if (rawSegs.length === 0) {
          throw new Error('Không nhận diện được lời thoại trong file này (có thể file không có giọng nói).');
        }

        const cues = rawSegs
          .map((s, idx) => {
            const st = Math.max(0, Number(s.start ?? 0));
            const en = Math.max(st + 0.3, Number(s.end ?? st + 2.0));
            const mainText = String(s.text || '').trim();
            const trans = String(s.translation || '').trim();
            const fullText = trans && translateLang !== 'none' ? `${mainText}\n${trans}` : mainText;
            const segWords = whisperWords.filter((w) => w.start >= st - 0.05 && w.end <= en + 0.08);
            return {
              id: `sub-cue-${idx + 1}`,
              start: Number(st.toFixed(3)),
              end: Number(en.toFixed(3)),
              text: fullText,
              words:
                segWords.length >= 2
                  ? segWords
                  : interpolateWordTimings(mainText || fullText, st, en),
            };
          })
          .filter((c) => c.text.length > 0);

        res.json({
          ok: true,
          engineUsed,
          translationEngineUsed: translationEngineUsed || undefined,
          language: detectedLang,
          durationSec: totalDur,
          cues,
          srt: cuesToSrt(cues),
          vtt: cuesToVtt(cues),
          audioBase64: mp3Buf.length <= 12 * 1024 * 1024 ? mp3Buf.toString('base64') : undefined,
          audioMimeType: 'audio/mpeg',
        });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Lỗi bóc tách phụ đề.' });
      } finally {
        await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
      }
    },
  );

  // ── Fast Forced Alignment & Whisper Local Word-Level Alignment (Reading Along Studio 1.19) ──
  async function executeWhisperAlign(
    audioBuf: Buffer,
    ext: string,
    sourceLang: string,
    whisperModel: string,
    onProgress?: (progress: number, label: string) => void,
    options?: {
      referenceText?: string;
      alignMode?: 'fast-forced' | 'whisper';
    },
  ) {
    const tmpDir = path.join(os.tmpdir(), `ks-align-${crypto.randomUUID()}`);
    await fs.promises.mkdir(tmpDir, { recursive: true });
    try {
      const inPath = path.join(tmpDir, `audio${ext}`);
      const wavPath = path.join(tmpDir, 'align_16k.wav');
      await fs.promises.writeFile(inPath, audioBuf);
      onProgress?.(10, 'Đang chuyển đổi audio sang WAV 16kHz...');
      await runProcess('ffmpeg', [
        '-y',
        '-i',
        inPath,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-c:a',
        'pcm_s16le',
        wavPath,
      ]);
      const durationSec = await getAudioDurationSec(wavPath);
      const refText = (options?.referenceText || '').trim();
      const alignMode = options?.alignMode || (refText ? 'fast-forced' : 'whisper');

      const runFastForcedAlign = async (backendLabel: string) => {
        onProgress?.(45, 'Đang dò âm tiết & căn nhịp siêu tốc theo kịch bản...');
        const wavBuf = await fs.promises.readFile(wavPath);
        const { samples, sampleRate } = parseWavBufferToMonoFloat32(wavBuf);
        const forced = alignKnownTextToPcmFloat(refText, samples, sampleRate, { lang: sourceLang });
        const cues = forced.segments.map((seg, idx) => ({
          id: `align-cue-${idx + 1}`,
          start: seg.start,
          end: seg.end,
          text: seg.text,
          words: forced.words.filter((w) => w.start >= seg.start - 0.06 && w.end <= seg.end + 0.08),
        }));
        onProgress?.(100, 'Căn chỉnh từng từ hoàn tất!');
        return {
          ok: true,
          language: sourceLang && sourceLang !== 'auto' ? sourceLang : inferSpokenLanguageFromText(refText, 'English'),
          modelUsed: 'pcm-energy-vad-v1',
          backendUsed: backendLabel,
          durationSec: forced.durationSec || durationSec,
          text: refText,
          segments: forced.segments,
          words: forced.words,
          cues,
          srt: cuesToSrt(cues),
        };
      };

      if (alignMode === 'fast-forced' && refText) {
        return await runFastForcedAlign('fast-forced-pcm');
      }

      try {
        const aligned = await runLocalWhisperOnWav(wavPath, {
          sourceLang,
          modelId: whisperModel,
          wordLevel: true,
          preferFasterWhisper: true,
          onProgress: (pct, lbl) => onProgress?.(pct, lbl),
        });
        const mappedWords = aligned.words.map((w) => ({
          word: w.text,
          start: w.start,
          end: w.end,
        }));
        const cues = aligned.segments.map((seg, idx) => ({
          id: `align-cue-${idx + 1}`,
          start: seg.start,
          end: seg.end,
          text: seg.text,
          words: mappedWords.filter((w) => w.start >= seg.start - 0.06 && w.end <= seg.end + 0.08),
        }));
        onProgress?.(100, 'Căn chỉnh Whisper hoàn tất!');
        return {
          ok: true,
          language: aligned.language || sourceLang,
          modelUsed: aligned.modelUsed || whisperModel,
          backendUsed: aligned.backendUsed || 'faster-whisper-built-in',
          durationSec,
          text: aligned.text,
          segments: aligned.segments,
          words: mappedWords,
          cues,
          srt: cuesToSrt(cues),
        };
      } catch (whisperErr) {
        if (refText) {
          onProgress?.(80, 'Whisper bận (HTTP 429) — tự chuyển sang Fast Forced Align theo kịch bản...');
          return await runFastForcedAlign('fast-forced-fallback (Whisper 429)');
        }
        throw whisperErr;
      }
    } finally {
      await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  function parseAlignRequest(req: express.Request): {
    audioBuf: Buffer | null;
    ext: string;
    sourceLang: string;
    whisperModel: string;
    referenceText: string;
    alignMode: 'fast-forced' | 'whisper';
  } {
    const isJson =
      typeof req.headers['content-type'] === 'string' &&
      req.headers['content-type'].includes('application/json');
    let audioBuf: Buffer | null = Buffer.isBuffer(req.body) ? req.body : null;
    let ext = '.mp3';
    let sourceLang = 'auto';
    let whisperModel = 'Xenova/whisper-small';
    let referenceText = '';
    let alignMode: 'fast-forced' | 'whisper' = 'whisper';

    if (isJson && audioBuf) {
      const parsed = JSON.parse(audioBuf.toString('utf8')) as {
        audioBase64?: string;
        ext?: string;
        lang?: string;
        model?: string;
        referenceText?: string;
        alignMode?: string;
      };
      audioBuf = parsed.audioBase64 ? Buffer.from(parsed.audioBase64, 'base64') : null;
      ext = sanitizeAudioExt(parsed.ext || '.mp3');
      sourceLang = parsed.lang?.trim() || 'auto';
      whisperModel = parsed.model?.trim() || 'Xenova/whisper-small';
      referenceText = typeof parsed.referenceText === 'string' ? parsed.referenceText.trim() : '';
      alignMode = parsed.alignMode === 'fast-forced' ? 'fast-forced' : parsed.alignMode === 'whisper' ? 'whisper' : referenceText ? 'fast-forced' : 'whisper';
    } else {
      ext = sanitizeAudioExt(
        typeof req.headers['x-file-ext'] === 'string' ? req.headers['x-file-ext'] : '.mp3',
      );
      sourceLang =
        typeof req.headers['x-source-lang'] === 'string' ? req.headers['x-source-lang'].trim() : 'auto';
      whisperModel =
        typeof req.headers['x-whisper-model'] === 'string' && req.headers['x-whisper-model'].trim()
          ? req.headers['x-whisper-model'].trim()
          : 'Xenova/whisper-small';
      if (typeof req.headers['x-reference-text-b64'] === 'string' && req.headers['x-reference-text-b64'].trim()) {
        try {
          referenceText = Buffer.from(req.headers['x-reference-text-b64'].trim(), 'base64').toString('utf8').trim();
        } catch {
          referenceText = '';
        }
      }
      const modeHeader = typeof req.headers['x-align-mode'] === 'string' ? req.headers['x-align-mode'].trim() : '';
      alignMode = modeHeader === 'fast-forced' ? 'fast-forced' : modeHeader === 'whisper' ? 'whisper' : referenceText ? 'fast-forced' : 'whisper';
    }

    return { audioBuf, ext, sourceLang, whisperModel, referenceText, alignMode };
  }

  app.post(
    '/api/subtitles/align',
    express.raw({ type: () => true, limit: '250mb' }),
    async (req, res) => {
      req.setTimeout(600_000);
      res.setTimeout(600_000);
      try {
        const { audioBuf, ext, sourceLang, whisperModel, referenceText, alignMode } = parseAlignRequest(req);
        if (!audioBuf || audioBuf.length === 0) {
          res.status(400).json({ error: 'Thiếu file audio để căn chỉnh word-level.' });
          return;
        }
        const out = await executeWhisperAlign(audioBuf, ext, sourceLang, whisperModel, undefined, {
          referenceText,
          alignMode,
        });
        res.json(out);
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Lỗi căn chỉnh Whisper Local.' });
      }
    },
  );

  app.post(
    '/api/subtitles/align/start',
    express.raw({ type: () => true, limit: '250mb' }),
    (req, res) => {
      try {
        const { audioBuf, ext, sourceLang, whisperModel, referenceText, alignMode } = parseAlignRequest(req);
        if (!audioBuf || audioBuf.length === 0) {
          res.status(400).json({ error: 'Thiếu file audio để căn chỉnh word-level.' });
          return;
        }
        const jobId = crypto.randomUUID();
        const jobState: AlignJobState = {
          id: jobId,
          status: 'running',
          progress: 4,
          stageLabel:
            alignMode === 'fast-forced' && referenceText
              ? 'Đang căn nhịp siêu tốc theo kịch bản (Fast Forced Align)...'
              : `Đang chuẩn bị model ${whisperModel}...`,
          createdAt: Date.now(),
        };
        alignJobs.set(jobId, jobState);
        writeAsyncJobSnapshotSync('align', jobId, jobState);
        res.status(202).json({ ok: true, jobId });

        void (async () => {
          let lastSavedPct = -10;
          try {
            const out = await executeWhisperAlign(
              audioBuf,
              ext,
              sourceLang,
              whisperModel,
              (pct, lbl) => {
                jobState.progress = pct;
                jobState.stageLabel = lbl;
                if (Math.abs(pct - lastSavedPct) >= 15) {
                  lastSavedPct = pct;
                  void saveAsyncJobSnapshot('align', jobId, jobState);
                }
              },
              { referenceText, alignMode },
            );
            jobState.status = 'done';
            jobState.progress = 100;
            jobState.stageLabel = 'Căn chỉnh từ hoàn tất!';
            jobState.result = out;
            await saveAsyncJobSnapshot('align', jobId, jobState);
          } catch (err) {
            jobState.status = 'error';
            jobState.error = err instanceof Error ? err.message : 'Lỗi căn chỉnh từ.';
            await saveAsyncJobSnapshot('align', jobId, jobState);
          } finally {
            scheduleAsyncJobCleanup('align', jobId, alignJobs);
          }
        })();
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Yêu cầu căn chỉnh không hợp lệ.' });
      }
    },
  );

  app.get('/api/subtitles/align/:jobId', async (req, res) => {
    const job = await loadAsyncJobSnapshot('align', req.params.jobId, alignJobs);
    if (!job) {
      res.status(404).json({ error: 'Không tìm thấy tác vụ căn chỉnh Whisper.' });
      return;
    }
    res.json({
      ok: true,
      id: job.id,
      status: job.status,
      progress: job.progress,
      stageLabel: job.stageLabel,
      result: job.result,
      error: job.error,
    });
  });

  // ── Whisper Model Cache Status, Async Preload & Async Transcribe Jobs ─────
  app.get('/api/whisper/status', async (_req, res) => {
    try {
      const status = await getWhisperCacheStatus();
      res.json({ ok: true, ...status });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Không kiểm tra được Whisper cache.' });
    }
  });

  app.post('/api/whisper/preload', express.json({ limit: '64kb' }), async (req, res) => {
    try {
      const model =
        typeof req.body?.model === 'string' && req.body.model.trim()
          ? req.body.model.trim()
          : 'Xenova/whisper-small';
      const preloadState = startWhisperPreloadJob(model);
      const status = await getWhisperCacheStatus();
      res.status(202).json({ ok: true, started: true, preloadState, status });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Không tải được model Whisper.' });
    }
  });

  app.post(
    '/api/subtitles/transcribe/start',
    express.raw({ type: () => true, limit: '250mb' }),
    async (req, res) => {
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: 'Vui lòng tải lên file video hoặc audio.' });
        return;
      }

      const ext = sanitizeMediaExt(
        typeof req.headers['x-file-ext'] === 'string' ? req.headers['x-file-ext'] : '.mp4',
      );
      const sourceLang =
        typeof req.headers['x-source-lang'] === 'string' ? req.headers['x-source-lang'].trim() : 'auto';
      const translateLang =
        typeof req.headers['x-translate-lang'] === 'string' ? req.headers['x-translate-lang'].trim() : 'none';
      const engineReq =
        typeof req.headers['x-engine'] === 'string' ? req.headers['x-engine'].trim().toLowerCase() : 'faster-whisper';
      const whisperModel =
        typeof req.headers['x-whisper-model'] === 'string' && req.headers['x-whisper-model'].trim()
          ? req.headers['x-whisper-model'].trim()
          : 'Xenova/whisper-small';

      const jobId = crypto.randomUUID();
      const jobState: TranscribeJobState = {
        id: jobId,
        status: 'running',
        progress: 5,
        stageLabel: 'Đang tách âm thanh từ Video/Audio bằng FFmpeg...',
        createdAt: Date.now(),
      };
      transcribeJobs.set(jobId, jobState);
      writeAsyncJobSnapshotSync('transcribe', jobId, jobState);
      res.status(202).json({ ok: true, jobId });

      // Run in background so proxy never hits 504 gateway timeout during first-run model downloads
      void (async () => {
        const tmpDir = path.join(os.tmpdir(), `ks-subjob-${jobId}`);
        await fs.promises.mkdir(tmpDir, { recursive: true });
        try {
          const inputPath = path.join(tmpDir, `input${ext}`);
          const wavPath = path.join(tmpDir, 'extracted_16k.wav');
          const mp3Path = path.join(tmpDir, 'extracted.mp3');
          await fs.promises.writeFile(inputPath, body);

          await runProcess('ffmpeg', [
            '-y',
            '-i',
            inputPath,
            '-vn',
            '-ac',
            '1',
            '-ar',
            '16000',
            '-c:a',
            'pcm_s16le',
            wavPath,
          ]);
          await runProcess('ffmpeg', [
            '-y',
            '-i',
            wavPath,
            '-c:a',
            'libmp3lame',
            '-b:a',
            '48k',
            mp3Path,
          ]);

          const mp3Buf = await fs.promises.readFile(mp3Path);
          const totalDur = await getAudioDurationSec(wavPath);
          const apiKey = resolveClientAndEnvKeys(req).geminiApiKey;

          let rawSegs: Array<{ start: number; end: number; text: string; translation?: string }> = [];
          let detectedLang = sourceLang;
          let engineUsed = 'faster-whisper (Built-in)';
          let translationEngineUsed = '';
          let whisperWords: Array<{ word: string; start: number; end: number }> = [];

          if (engineReq === 'gemini' && apiKey) {
            jobState.stageLabel = 'Đang gửi audio lên Gemini AI để bóc phụ đề...';
            try {
              const langHint =
                sourceLang && sourceLang !== 'auto'
                  ? `The spoken language is ${sourceLang}.`
                  : 'Auto-detect the spoken language accurately.';
              const translateHint =
                translateLang && translateLang !== 'none'
                  ? `Also provide a natural translation into ${translateLang} in the "translation" field.`
                  : 'Leave "translation" empty.';
              const prompt = [
                'Transcribe the audio into timestamped subtitle segments suitable for short-form 9:16 videos (1–2 short clauses per segment).',
                langHint,
                translateHint,
                'Return ONLY valid JSON with shape: { "language": "detected code", "segments": [{ "start": 0.0, "end": 2.5, "text": "...", "translation": "..." }] }.',
                `Audio total duration is approximately ${totalDur.toFixed(2)} seconds.`,
              ].join(' ');
              const { GoogleGenAI } = await import('@google/genai');
              const ai = new GoogleGenAI({
                apiKey,
                httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
              });
              for (const modelName of ['gemini-4-hydrogen', 'gemini-3.1-flash-lite']) {
                try {
                  const aiRes = await ai.models.generateContent({
                    model: modelName,
                    contents: [
                      { inlineData: { mimeType: 'audio/mp3', data: mp3Buf.toString('base64') } },
                      { text: prompt },
                    ],
                    config: { responseMimeType: 'application/json' },
                  });
                  const parsed = JSON.parse((aiRes.text || '{}').trim()) as {
                    language?: string;
                    segments?: Array<{ start?: number; end?: number; text?: string; translation?: string }>;
                  };
                  detectedLang = parsed.language || sourceLang;
                  rawSegs = (Array.isArray(parsed.segments) ? parsed.segments : []).map((s) => ({
                    start: Number(s.start ?? 0),
                    end: Number(s.end ?? 0),
                    text: String(s.text || '').trim(),
                    translation: String(s.translation || '').trim(),
                  }));
                  engineUsed = `gemini (${modelName})`;
                  if (translateLang && translateLang !== 'none') {
                    translationEngineUsed = `gemini (${modelName})`;
                  }
                  break;
                } catch {
                  // try next model or fallback to Whisper
                }
              }
            } catch {
              // fallback to Whisper below
            }
          }

          if (rawSegs.length === 0) {
            jobState.progress = 15;
            jobState.stageLabel = `Đang nạp model ${whisperModel} & nhận diện lời thoại (lần đầu sẽ tự tải model)...`;
            const wRes = await runLocalWhisperOnWav(wavPath, {
              sourceLang,
              modelId: whisperModel,
              wordLevel: true,
              preferFasterWhisper: engineReq !== 'whisper',
              onProgress: (pct, lbl) => {
                jobState.progress = Math.min(88, Math.max(15, Math.round(15 + pct * 0.7)));
                jobState.stageLabel = lbl;
              },
            });
            rawSegs = wRes.segments;
            detectedLang = wRes.language || sourceLang;
            whisperWords = wRes.words.map((w) => ({ word: w.text, start: w.start, end: w.end }));
            engineUsed = `${wRes.backendUsed || 'faster-whisper (Built-in)'} · ${wRes.modelUsed || whisperModel}`;

            if (rawSegs.length > 0 && translateLang && translateLang !== 'none') {
              jobState.progress = 90;
              jobState.stageLabel = `Đang dịch phụ đề sang ${translateLang}...`;
              try {
                const tr = await translateLinesWithGeminiOrFree(
                  rawSegs.map((s) => s.text),
                  translateLang,
                  apiKey,
                );
                translationEngineUsed = tr.engineUsed;
                rawSegs = rawSegs.map((s, idx) => ({
                  ...s,
                  translation: String(tr.translations?.[idx] || '').trim(),
                }));
              } catch {
                // keep original text
              }
            }
          }

          if (rawSegs.length === 0) {
            throw new Error('Không nhận diện được lời thoại trong file này (có thể file không có giọng nói).');
          }

          const cues = rawSegs
            .map((s, idx) => {
              const st = Math.max(0, Number(s.start ?? 0));
              const en = Math.max(st + 0.3, Number(s.end ?? st + 2.0));
              const mainText = String(s.text || '').trim();
              const trans = String(s.translation || '').trim();
              const fullText = trans && translateLang !== 'none' ? `${mainText}\n${trans}` : mainText;
              const segWords = whisperWords.filter((w) => w.start >= st - 0.05 && w.end <= en + 0.08);
              return {
                id: `sub-cue-${idx + 1}`,
                start: Number(st.toFixed(3)),
                end: Number(en.toFixed(3)),
                text: fullText,
                words:
                  segWords.length >= 2
                    ? segWords
                    : interpolateWordTimings(mainText || fullText, st, en),
              };
            })
            .filter((c) => c.text.length > 0);

          jobState.status = 'done';
          jobState.progress = 100;
          jobState.stageLabel = 'Hoàn tất bóc tách phụ đề!';
          jobState.result = {
            ok: true,
            engineUsed,
            translationEngineUsed: translationEngineUsed || undefined,
            language: detectedLang,
            durationSec: totalDur,
            cues,
            srt: cuesToSrt(cues),
            vtt: cuesToVtt(cues),
            audioBase64: mp3Buf.length <= 12 * 1024 * 1024 ? mp3Buf.toString('base64') : undefined,
            audioMimeType: 'audio/mpeg',
          };
          await saveAsyncJobSnapshot('transcribe', jobId, jobState);
        } catch (err) {
          jobState.status = 'error';
          jobState.error = err instanceof Error ? err.message : 'Lỗi bóc tách phụ đề.';
          await saveAsyncJobSnapshot('transcribe', jobId, jobState);
        } finally {
          await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
          scheduleAsyncJobCleanup('transcribe', jobId, transcribeJobs);
        }
      })();
    },
  );

  app.get('/api/subtitles/transcribe/:jobId', async (req, res) => {
    const job = await loadAsyncJobSnapshot('transcribe', req.params.jobId, transcribeJobs);
    if (!job) {
      res.status(404).json({ error: 'Không tìm thấy tác vụ bóc tách phụ đề.' });
      return;
    }
    res.json({
      ok: true,
      id: job.id,
      status: job.status,
      progress: job.progress ?? (job.status === 'done' ? 100 : 12),
      stageLabel: job.stageLabel,
      result: job.result,
      error: job.error,
    });
  });

  app.post('/api/subtitles/translate', express.json({ limit: '5mb' }), async (req, res) => {
    try {
      const targetLang = typeof req.body?.targetLang === 'string' ? req.body.targetLang.trim() : '';
      if (!targetLang || targetLang === 'none') {
        res.status(400).json({ error: 'Vui lòng chọn ngôn ngữ đích để dịch.' });
        return;
      }
      const bilingual = req.body?.bilingual !== false;
      const rawCues = Array.isArray(req.body?.cues)
        ? (req.body.cues as Array<{ id?: string; start?: number; end?: number; text?: string; words?: any[] }>)
        : typeof req.body?.srt === 'string' && req.body.srt.trim()
          ? parseTranscriptAuto(req.body.srt)
          : [];

      if (rawCues.length === 0) {
        res.status(400).json({ error: 'Không có câu phụ đề hoặc file .srt hợp lệ để dịch.' });
        return;
      }

      const sourceTexts = rawCues.map((c) => String(c.text || '').split('\n')[0].trim());
      const resolvedKeys = resolveClientAndEnvKeys(req, req.body || {});
      const tr = await translateLinesWithGeminiOrFree(sourceTexts, targetLang, resolvedKeys.geminiApiKey);

      const translatedCues = rawCues.map((c, idx) => {
        const st = Math.max(0, Number(c.start ?? 0));
        const en = Math.max(st + 0.3, Number(c.end ?? st + 2.5));
        const mainText = sourceTexts[idx] || String(c.text || '').trim();
        const transText = String(tr.translations[idx] || '').trim();
        const finalText = bilingual
          ? transText && transText !== mainText
            ? `${mainText}\n${transText}`
            : mainText
          : transText || mainText;
        const wordSource = bilingual ? mainText : transText || mainText;
        return {
          id: String(c.id || `tr-cue-${idx + 1}`),
          start: Number(st.toFixed(3)),
          end: Number(en.toFixed(3)),
          text: finalText,
          words:
            bilingual && Array.isArray(c.words) && c.words.length > 0
              ? c.words
              : interpolateWordTimings(wordSource, st, en),
        };
      });

      res.json({
        ok: true,
        engineUsed: tr.engineUsed,
        targetLang,
        bilingual,
        cues: translatedCues,
        srt: cuesToSrt(translatedCues),
        vtt: cuesToVtt(translatedCues),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Lỗi dịch phụ đề.' });
    }
  });

  app.post('/api/ai/generate-scene', express.json({ limit: '2mb' }), async (req, res) => {
    try {
      const apiKey = resolveClientAndEnvKeys(req, req.body || {}).geminiApiKey;
      if (!apiKey) {
        res.status(400).json({ error: 'Chưa có GEMINI_API_KEY. Hãy dán trực tiếp Key vào ô nhập trong App.' });
        return;
      }
      const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
      if (!prompt.trim()) {
        res.status(400).json({ error: 'Thiếu prompt đầu vào.' });
        return;
      }
      const model =
        typeof req.body?.model === 'string' && req.body.model.trim()
          ? req.body.model.trim()
          : 'gemini-4-hydrogen';
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
      const isGemini4 = model.startsWith('gemini-4-');
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          ...(isGemini4 ? {} : { temperature: 0.35 }),
        },
      });
      res.json({ ok: true, jsonText: response.text || '', text: response.text || '' });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Lỗi gọi Gemini API',
      });
    }
  });

  app.post('/api/ai/generate-reading', express.json({ limit: '2mb' }), async (req, res) => {
    try {
      const apiKey = resolveClientAndEnvKeys(req, req.body || {}).geminiApiKey;
      if (!apiKey) {
        res.status(400).json({
          error:
            'Chưa có GEMINI_API_KEY. Hãy dán trực tiếp Key vào ô nhập trong App hoặc dùng công cụ "Tạo Prompt cho Web AI" bên dưới (không cần API key).',
        });
        return;
      }

      const mode = req.body?.mode === 'adapt-url' ? 'adapt-url' : 'generate';
      const rawLang =
        typeof req.body?.learningLanguage === 'string'
          ? req.body.learningLanguage.trim().toLowerCase()
          : 'en';
      const langMap: Record<string, { code: string; name: string; unit: 'words' | 'chars'; ratePerMin: number; badgePrefix: string }> = {
        en: { code: 'en', name: 'English', unit: 'words', ratePerMin: 125, badgePrefix: 'CEFR' },
        ja: { code: 'ja', name: 'Japanese (日本語)', unit: 'chars', ratePerMin: 185, badgePrefix: 'JLPT' },
        zh: { code: 'zh', name: 'Mandarin Chinese (中文)', unit: 'chars', ratePerMin: 180, badgePrefix: 'HSK' },
        ko: { code: 'ko', name: 'Korean (한국어)', unit: 'words', ratePerMin: 95, badgePrefix: 'TOPIK' },
        fr: { code: 'fr', name: 'French (Français)', unit: 'words', ratePerMin: 120, badgePrefix: 'CEFR' },
        es: { code: 'es', name: 'Spanish (Español)', unit: 'words', ratePerMin: 125, badgePrefix: 'CEFR' },
      };
      const langMeta = langMap[rawLang] || langMap.en;
      const levelRaw = typeof req.body?.level === 'string' ? req.body.level.trim() : '';
      const level = levelRaw || (langMeta.code === 'ja' ? 'N5' : langMeta.code === 'zh' ? 'HSK 1' : langMeta.code === 'ko' ? 'TOPIK 1' : 'B1');
      const topic = typeof req.body?.topic === 'string' ? req.body.topic.trim() : '';
      const sourceText = typeof req.body?.sourceText === 'string' ? req.body.sourceText.trim() : '';
      const sourceTitle = typeof req.body?.sourceTitle === 'string' ? req.body.sourceTitle.trim() : '';
      const durationRaw = Number(req.body?.durationMinutes);
      const hasDuration = Number.isFinite(durationRaw) && durationRaw > 0;
      const wordCountRaw = Number(
        req.body?.wordCount ?? (hasDuration ? Math.round(durationRaw * langMeta.ratePerMin) : langMeta.ratePerMin),
      );
      const maxLen = langMeta.unit === 'chars' ? 6000 : 3800;
      const wordCount = Number.isFinite(wordCountRaw)
        ? Math.max(40, Math.min(maxLen, Math.round(wordCountRaw)))
        : langMeta.ratePerMin;

      if (mode === 'adapt-url' && !sourceText) {
        res.status(400).json({ error: 'Thiếu nội dung trang web nguồn để chuyển thể.' });
        return;
      }

      const lengthDesc =
        langMeta.unit === 'chars'
          ? `around ${wordCount} ${langMeta.name} characters`
          : `around ${wordCount} ${langMeta.name} words`;

      const furiganaWarning =
        langMeta.code === 'ja'
          ? 'Do NOT add romaji or inline furigana parentheses inside the Japanese sentences — keep natural Japanese Kanji + Kana only.'
          : langMeta.code === 'zh'
            ? 'Write natural Simplified Chinese (简体中文) ONLY — do NOT add inline Pinyin inside the reading text.'
            : langMeta.code === 'ko'
              ? 'Write natural Korean (한국어) ONLY — do NOT add romanization inside the reading text.'
              : `Write natural ${langMeta.name} ONLY.`;

      const rawFormat =
        typeof req.body?.formatPreference === 'string'
          ? req.body.formatPreference.trim().toLowerCase()
          : 'auto';
      const formatMap: Record<string, string> = {
        auto: 'Pick the most engaging reading style automatically (short story, real-life dialogue, mindset reflection, or culture).',
        story: 'Write as a compelling short story with a curiosity hook, smooth flow, and a memorable ending.',
        dialogue: 'Write as a natural everyday life situation or dialogue people genuinely experience.',
        mindset: 'Write an inspiring, practical mindset & daily habits reflection.',
        culture: 'Write an engaging cultural/travel discovery piece showcasing local life or traditions.',
        knowledge: 'Write a clear, fascinating mini essay explaining an everyday phenomenon or science idea.',
        podcast: 'Write in a warm, calm, soothing podcast monologue tone ideal for relaxed read-along listening.',
      };
      const formatInstruction = formatMap[rawFormat] || formatMap.auto;

      const topicInstruction = topic
        ? `about: "${topic}"`
        : `on an engaging, high-retention daily life, mindset, or storytelling topic chosen autonomously by you that fits level ${level}`;

      const prompt =
        mode === 'adapt-url'
          ? `You are an expert ${langMeta.name} curriculum designer for Read-Along karaoke videos.
Convert and adapt the scraped webpage content below into a clean, engaging ${langMeta.name} read-along passage tailored to proficiency level "${level}".
Genre / Style guidance: ${formatInstruction}
${furiganaWarning}
CRITICAL: Strip out any worksheet scaffolding or exercise labels (such as "Practice Reading English Exercises", "## Exercise 1", "Part 1", "Task 1", navigation menus, or instructions). Keep ONLY the clean story title and body sentences.
Target total length: ${lengthDesc}${hasDuration ? ` (for a ~${durationRaw} minute video)` : ''}.
Source title: ${sourceTitle || 'Web Article'}
Source content:
"""
${sourceText.slice(0, 9000)}
"""
Return ONLY valid JSON with keys:
{
  "title": "Short catchy ${langMeta.name} title (5–10 words/phrases, curiosity-driven)",
  "topicBadge": "SHORT UPPERCASE BADGE (e.g. ${level} · READING)",
  "level": "${level}",
  "text": "Clean ${langMeta.name} sentences separated by \\n (1 sentence per line, no bullet symbols, no markdown, no HTML, no timestamps)."
}`
          : `You are an expert ${langMeta.name} curriculum designer for Read-Along karaoke videos.
Write an original, engaging ${langMeta.name} read-along passage ${topicInstruction}.
Genre / Style guidance: ${formatInstruction}
${furiganaWarning}
CRITICAL: Do NOT include worksheet labels like "Practice Reading Exercises", "Exercise 1", "Part 1", or markdown headings inside the title or body text.
Target proficiency level: ${level}.
Target total length: ${lengthDesc}${hasDuration ? ` (for a ~${durationRaw} minute video)` : ''}.
Return ONLY valid JSON with keys:
{
  "title": "Short catchy ${langMeta.name} title (curiosity-driven, e.g. '【...】...' or engaging hook)",
  "topicBadge": "SHORT UPPERCASE BADGE (e.g. ${level} · READING)",
  "level": "${level}",
  "text": "Clean ${langMeta.name} sentences separated by \\n (1 sentence per line, no bullet symbols, no markdown, no timestamps)."
}`;

      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });
      const rawJson = (response.text || '').trim();
      if (!rawJson) {
        res.status(502).json({ error: 'Gemini không trả về nội dung bài đọc.' });
        return;
      }
      const parsed = JSON.parse(rawJson) as {
        title?: string;
        topicBadge?: string;
        level?: string;
        text?: string;
      };
      const isScaffolding = (line: string) =>
        /^(?:#{1,6}\s*)?(?:(?:practice\s+reading|english\s+reading)\b.*|(?:exercise|part|task|section|unit|lesson|reading)\s*(?:#|no\.?)?\s*\d+\b[:.\-\s]*)$/i.test(
          line.trim(),
        );
      const cleanLines = (parsed.text || '')
        .split(/\r?\n/)
        .map((line) => line.replace(/^[#*\-\u2022\d.)\s]+/, '').trim())
        .filter((line) => Boolean(line) && !isScaffolding(line));
      if (cleanLines.length === 0) {
        res.status(502).json({ error: 'AI trả về bài đọc rỗng.' });
        return;
      }
      const cleanTitle = (parsed.title || sourceTitle || topic || 'Reading Along')
        .replace(/^#+\s*/, '')
        .trim();
      res.json({
        ok: true,
        title: isScaffolding(cleanTitle) ? 'Reading Along' : cleanTitle,
        topicBadge: (parsed.topicBadge || `${level} · READING`).trim(),
        level,
        learningLanguage: langMeta.code,
        text: cleanLines.join('\n'),
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Lỗi AI tạo bài đọc.',
      });
    }
  });

  app.post('/api/render/start', express.json({ limit: '1mb' }), async (req, res) => {
    try {
      const requestedFps = Number(req.body?.fps ?? 30);
      const fps = Number.isFinite(requestedFps)
        ? Math.max(1, Math.min(60, Math.round(requestedFps)))
        : 30;
      const requestedCrf = Number(req.body?.crf ?? 22);
      const crf = Number.isFinite(requestedCrf)
        ? Math.max(16, Math.min(32, Math.round(requestedCrf)))
        : 22;
      const jobId = crypto.randomUUID();
      const dir = getJobDir(jobId);
      await fs.promises.mkdir(dir, { recursive: true });
      const framesPath = path.join(dir, 'frames.mjpeg');

      const job: RenderJob = {
        id: jobId,
        dir,
        fps,
        crf,
        framesPath,
        audioPath: null,
        createdAt: Date.now(),
        chunkCount: 0,
      };
      jobs.set(jobId, job);
      await saveJobMeta(job);

      res.json({ jobId, fps, crf });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to create render job',
      });
    }
  });

  app.post(
    '/api/render/:jobId/audio',
    express.raw({ type: () => true, limit: '20mb' }),
    async (req, res) => {
      const job = await loadJob(req.params.jobId);
      if (!job) {
        res.status(404).json({ error: 'Render job not found' });
        return;
      }
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: 'Empty audio payload' });
        return;
      }
      const extHeader =
        typeof req.headers['x-audio-ext'] === 'string' ? req.headers['x-audio-ext'] : '';
      const safeExt = sanitizeAudioExt(extHeader);
      const audioPath = path.join(job.dir, `audio${safeExt}`);
      const isAppend = req.query.append === '1';

      if (isAppend) {
        await fs.promises.appendFile(audioPath, body);
      } else {
        await fs.promises.writeFile(audioPath, body);
      }
      if (job.audioPath !== audioPath) {
        job.audioPath = audioPath;
      }
      job.createdAt = Date.now();
      await saveJobMeta(job);
      res.json({ ok: true, bytes: body.length });
    },
  );

  app.post(
    '/api/render/:jobId/frames',
    express.raw({ type: () => true, limit: '20mb' }),
    async (req, res) => {
      const job = await loadJob(req.params.jobId);
      if (!job) {
        res.status(404).json({ error: 'Render job not found (job đã hết hạn hoặc bị hủy)' });
        return;
      }
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: 'Empty frames chunk' });
        return;
      }
      await fs.promises.appendFile(job.framesPath, body);
      job.chunkCount += 1;
      job.createdAt = Date.now();
      if (job.chunkCount % 10 === 0) {
        await saveJobMeta(job).catch(() => undefined);
      }
      res.json({ ok: true, chunkCount: job.chunkCount, bytes: body.length });
    },
  );

  app.post('/api/render/:jobId/finish', express.json({ limit: '256kb' }), async (req, res) => {
    const job = await loadJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Render job not found' });
      return;
    }

    try {
      const stat = await fs.promises.stat(job.framesPath).catch(() => null);
      if (!stat || stat.size === 0) {
        await cleanupJob(job.id);
        res.status(400).json({ error: 'No video frames uploaded' });
        return;
      }

      const outputPath = path.join(job.dir, 'output.mp4');
      const ffmpegArgs = buildFfmpegArgs({
        fps: job.fps,
        framesPath: job.framesPath,
        outputPath,
        audioPath: job.audioPath,
        crf: job.crf,
      });

      await new Promise<void>((resolve, reject) => {
        const proc = spawn('ffmpeg', ffmpegArgs, { shell: false });
        activeJobProcs.set(job.id, proc);
        let stderr = '';
        proc.stderr.on('data', (chunk: Buffer) => {
          stderr = (stderr + chunk.toString('utf8')).slice(-8000);
        });
        proc.on('error', (err) => {
          activeJobProcs.delete(job.id);
          reject(err);
        });
        proc.on('close', (code) => {
          activeJobProcs.delete(job.id);
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
          }
        });
      });

      const outStat = await fs.promises.stat(outputPath);
      const rawName = typeof req.body?.fileName === 'string' ? req.body.fileName : 'KineticSub Video';
      const safeBaseName = cleanOutputTitleStem(rawName, 'KineticSub Video');
      const sourceTab = typeof req.body?.sourceTab === 'string' ? req.body.sourceTab.trim() : '';

      if (req.body?.saveToDisk === true) {
        const rawSavePath = typeof req.body?.savePath === 'string' ? req.body.savePath.trim() : '';
        const { baseDir, targetDir } = resolveSafeOutputDir(rawSavePath, sourceTab || 'Studio 9:16');
        await fs.promises.mkdir(targetDir, { recursive: true });
        const diskPath = path.join(targetDir, `${safeBaseName}.mp4`);
        await fs.promises.copyFile(outputPath, diskPath);
        const relPath = path.relative(baseDir, diskPath).replace(/\\/g, '/');
        if (sourceTab) {
          await recordOutputMeta(relPath, sourceTab);
        }
        const companionText = typeof req.body?.companionText === 'string' ? req.body.companionText : '';
        if (companionText.trim()) {
          const txtDiskPath = path.join(targetDir, `${safeBaseName}.txt`);
          await fs.promises.writeFile(txtDiskPath, companionText, 'utf8');
          const txtRelPath = path.relative(baseDir, txtDiskPath).replace(/\\/g, '/');
          if (sourceTab) {
            await recordOutputMeta(txtRelPath, sourceTab);
          }
        }
        await cleanupJob(job.id);
        res.json({
          ok: true,
          savedPath: diskPath,
          relativePath: relPath,
          bytes: outStat.size,
          sourceTab: sourceTab || undefined,
        });
        return;
      }

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Length', String(outStat.size));
      const asciiFallback = safeBaseName.replace(/[^a-zA-Z0-9 -]/g, '').trim() || 'KineticSub Video';
      res.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(safeBaseName)}.mp4; filename="${asciiFallback}.mp4"`,
      );

      const stream = fs.createReadStream(outputPath);
      const onDone = () => {
        void cleanupJob(job.id);
      };
      res.on('close', onDone);
      stream.on('error', () => {
        void cleanupJob(job.id);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to stream rendered MP4' });
        }
      });
      stream.pipe(res);
    } catch (err) {
      await cleanupJob(job.id);
      if (!res.headersSent) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'MP4 encoding failed',
        });
      }
    }
  });

  app.delete('/api/render/:jobId', async (req, res) => {
    await cleanupJob(req.params.jobId);
    res.json({ ok: true });
  });

  // ── Educational Video Studio 1.19 Server FFmpeg Merge & Karaoke-Mix Routes ─
  app.post('/api/studio/job/start', express.json({ limit: '64kb' }), async (_req, res) => {
    try {
      const jobId = crypto.randomUUID();
      const dir = getStudioJobDir(jobId);
      await fs.promises.mkdir(dir, { recursive: true });
      const job: StudioJob = {
        id: jobId,
        dir,
        createdAt: Date.now(),
        files: {},
        status: 'idle',
        progress: 0,
        stageLabel: 'Đã khởi tạo Studio job.',
      };
      studioJobs.set(jobId, job);
      await fs.promises.writeFile(path.join(dir, 'meta.json'), JSON.stringify(job), 'utf8');
      res.json({ ok: true, jobId });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Không tạo được Studio job.' });
    }
  });

  app.get('/api/studio/job/:jobId/status', async (req, res) => {
    const job = await loadStudioJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Studio job không tồn tại hoặc đã hoàn tất.' });
      return;
    }
    res.json({
      ok: true,
      id: job.id,
      status: job.status ?? 'idle',
      progress: job.progress ?? 0,
      stageLabel: job.stageLabel ?? '',
    });
  });

  app.post(
    '/api/studio/job/:jobId/file',
    express.raw({ type: () => true, limit: '250mb' }),
    async (req, res) => {
      const job = await loadStudioJob(req.params.jobId);
      if (!job) {
        res.status(404).json({ error: 'Studio job không tồn tại hoặc đã bị hủy.' });
        return;
      }
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: 'File upload rỗng.' });
        return;
      }
      const role = sanitizeOutputStem(
        typeof req.headers['x-role'] === 'string' ? req.headers['x-role'] : 'media',
        'media',
      );
      const rawFileName =
        typeof req.headers['x-filename'] === 'string'
          ? decodeURIComponent(req.headers['x-filename'])
          : `${role}.bin`;
      const baseOnly = path.basename(rawFileName).replace(/[\x00-\x1f\\/:*?"<>|]/g, '_') || `${role}.bin`;
      const destPath = path.join(job.dir, `${role}_${baseOnly}`);
      if (req.query.append === '1') {
        await fs.promises.appendFile(destPath, body);
      } else {
        await fs.promises.writeFile(destPath, body);
      }
      job.files[role] = destPath;
      job.createdAt = Date.now();
      await fs.promises.writeFile(path.join(job.dir, 'meta.json'), JSON.stringify(job), 'utf8');
      res.json({ ok: true, role, bytes: body.length });
    },
  );

  app.post('/api/studio/job/:jobId/merge', express.json({ limit: '256kb' }), async (req, res) => {
    const job = await loadStudioJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Studio job không tồn tại hoặc đã bị hủy.' });
      return;
    }
    try {
      const videoPath = job.files.video;
      const audioPath = job.files.audio;
      if (!videoPath || !audioPath) {
        res.status(400).json({ error: 'Thiếu file video hoặc file audio để ghép.' });
        return;
      }
      const vMeta = await probeMediaMeta(videoPath);
      const aMeta = await probeMediaMeta(audioPath);
      const durationMode = req.body?.durationMode === 'loop-video' ? 'loop-video' : 'shortest';
      const shouldLoopVideo = durationMode === 'loop-video' && vMeta.duration > 0.2 && vMeta.duration < aMeta.duration;
      const duration = Math.max(
        0.5,
        durationMode === 'loop-video' ? aMeta.duration : Math.min(vMeta.duration, aMeta.duration),
      );

      const watermarkEnabled = req.body?.watermarkEnabled !== false;
      const watermarkText =
        watermarkEnabled && typeof req.body?.watermarkText === 'string'
          ? req.body.watermarkText.trim()
          : '';
      const watermarkCorner = typeof req.body?.watermarkCorner === 'string' ? req.body.watermarkCorner : 'bottom-right';
      const watermarkOpacity = Math.max(0.1, Math.min(1, Number(req.body?.watermarkOpacity ?? 0.65)));
      const outroText = typeof req.body?.outroText === 'string' ? req.body.outroText.trim() : '';
      const outroDuration = Math.max(0, Math.min(6, Number(req.body?.outroDuration ?? 0)));

      const assLines: string[] = [
        '[Script Info]',
        'ScriptType: v4.00+',
        `PlayResX: ${vMeta.width}`,
        `PlayResY: ${vMeta.height}`,
        'WrapStyle: 2',
        '',
        '[V4+ Styles]',
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
        `Style: Watermark,Noto Sans,${Math.max(20, Math.round(vMeta.height * 0.024))},&H00FFFFFF,&H00FFFFFF,&H800F172A,&H00000000,-1,0,0,0,100,100,0,0,1,2,1,3,36,36,28,1`,
        `Style: Outro,Noto Sans,${Math.max(26, Math.round(vMeta.height * 0.042))},&H00FFFFFF,&H00FFFFFF,&H400F172A,&H00000000,-1,0,0,0,100,100,0,0,1,3,1,5,40,40,40,1`,
        '',
        '[Events]',
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      ];

      const toAssTime = (sec: number) => {
        const s = Math.max(0, sec);
        const cs = Math.round(s * 100);
        const hh = Math.floor(cs / 360000);
        const mm = Math.floor((cs % 360000) / 6000);
        const ss = Math.floor((cs % 6000) / 100);
        const cc = cs % 100;
        return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(cc).padStart(2, '0')}`;
      };
      const escAss = (s: string) => s.replace(/\\/g, '\\\\').replace(/\{/g, '(').replace(/\}/g, ')');

      const contentDuration = duration;
      const hasOutro = outroDuration > 0 && outroText.length > 0;
      const totalDuration = hasOutro ? contentDuration + outroDuration : contentDuration;

      if (watermarkText) {
        const anCode =
          watermarkCorner === 'top-left'
            ? 7
            : watermarkCorner === 'top-right'
              ? 9
              : watermarkCorner === 'bottom-left'
                ? 1
                : 3;
        const alphaHex = Math.round((1 - watermarkOpacity) * 255)
          .toString(16)
          .toUpperCase()
          .padStart(2, '0');
        assLines.push(
          `Dialogue: 1,0:00:00.00,${toAssTime(contentDuration)},Watermark,,0,0,0,,{\\an${anCode}\\alpha&H${alphaHex}&}${escAss(watermarkText)}`,
        );
      }
      if (hasOutro) {
        const startOutro = contentDuration;
        const joined = outroText
          .split(/\r?\n/)
          .map((l: string) => escAss(l.trim()))
          .filter(Boolean)
          .slice(0, 2)
          .join('\\N');
        if (joined) {
          assLines.push(
            `Dialogue: 2,${toAssTime(startOutro)},${toAssTime(totalDuration)},Outro,,0,0,0,,{\\an5\\fad(450,400)}${joined}`,
          );
        }
      }

      const assPath = path.join(job.dir, 'overlay.ass');
      await fs.promises.writeFile(assPath, '\uFEFF' + assLines.join('\n'), 'utf8');

      const vFilters: string[] = [];
      if (hasOutro) {
        vFilters.push(`tpad=stop_mode=clone:stop_duration=${outroDuration.toFixed(3)}`);
        const fadeDur = Math.min(0.55, Math.max(0.2, outroDuration * 0.4));
        vFilters.push(`fade=t=out:st=${contentDuration.toFixed(3)}:d=${fadeDur.toFixed(3)}`);
      }
      if (watermarkText || hasOutro) {
        vFilters.push(`subtitles=filename=${path.basename(assPath)}`);
      }

      const outLocal = path.join(job.dir, 'merged.mp4');
      const args: string[] = ['-y', '-hide_banner', '-loglevel', 'error'];
      if (shouldLoopVideo) args.push('-stream_loop', '-1');
      args.push('-i', videoPath, '-i', audioPath);
      if (vFilters.length > 0) {
        const aFilter = hasOutro
          ? `[1:a:0]apad=pad_dur=${outroDuration.toFixed(3)}[aout]`
          : '[1:a:0]anull[aout]';
        args.push(
          '-filter_complex',
          `[0:v:0]${vFilters.join(',')}[v];${aFilter}`,
          '-map',
          '[v]',
          '-map',
          '[aout]',
        );
        args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p');
      } else {
        args.push('-map', '0:v:0', '-map', '1:a:0', '-c:v', shouldLoopVideo ? 'libx264' : 'copy');
        if (shouldLoopVideo) {
          args.push('-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p');
        }
      }
      args.push('-t', totalDuration.toFixed(3), '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outLocal);

      job.status = 'running';
      job.progress = 8;
      job.stageLabel = 'FFmpeg đang ghép Video + Audio...';

      await spawnTrackedFfmpeg(
        args,
        job.dir,
        (p) => activeStudioProcs.set(job.id, p),
        (sec) => {
          const pct = Math.min(96, Math.max(10, Math.round(10 + (sec / Math.max(0.5, totalDuration)) * 86)));
          job.progress = pct;
          job.stageLabel = `Đang ghép Video + Audio (${pct}%)...`;
        },
      );
      activeStudioProcs.delete(job.id);
      job.progress = 98;
      job.stageLabel = 'Đang lưu file vào thư mục Output...';

      const rawOutName = typeof req.body?.outputName === 'string' ? req.body.outputName : '';
      const origBase = path.basename(videoPath, path.extname(videoPath)).replace(/^video_/, '');
      const stem = cleanOutputTitleStem(rawOutName, cleanOutputTitleStem(origBase, 'Edu Merge Video'));
      const fileName = `${stem}.mp4`;
      const saveSubPath = typeof req.body?.savePath === 'string' ? req.body.savePath : '';
      const { baseDir, targetDir } = resolveSafeOutputDir(saveSubPath, 'Edu Merge');
      await fs.promises.mkdir(targetDir, { recursive: true });
      const diskPath = path.join(targetDir, fileName);
      await fs.promises.copyFile(outLocal, diskPath);
      const stat = await fs.promises.stat(diskPath);
      const relPath = path.relative(baseDir, diskPath).replace(/\\/g, '/');
      await recordOutputMeta(relPath, 'Edu Merge');
      let txtFileName: string | undefined;
      let txtRelativePath: string | undefined;
      const descriptionTxt = typeof req.body?.descriptionTxt === 'string' ? req.body.descriptionTxt : '';
      if (descriptionTxt.trim()) {
        txtFileName = `${stem}.txt`;
        const txtDiskPath = path.join(targetDir, txtFileName);
        await fs.promises.writeFile(txtDiskPath, descriptionTxt, 'utf8');
        txtRelativePath = path.relative(baseDir, txtDiskPath).replace(/\\/g, '/');
        await recordOutputMeta(txtRelativePath, 'Edu Merge');
      }
      job.progress = 100;
      job.status = 'done';
      job.stageLabel = 'Ghép Video hoàn tất!';
      await cleanupStudioJob(job.id);

      res.json({
        ok: true,
        fileName,
        relativePath: relPath,
        savedPath: diskPath,
        bytes: stat.size,
        sourceTab: 'Edu Merge',
        txtFileName,
        txtRelativePath,
      });
    } catch (err) {
      job.status = 'error';
      await cleanupStudioJob(job.id);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Lỗi FFmpeg ghép Video + Audio.' });
    }
  });

  app.post('/api/studio/job/:jobId/karaoke-mix', express.json({ limit: '1mb' }), async (req, res) => {
    const job = await loadStudioJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Studio job không tồn tại hoặc đã bị hủy.' });
      return;
    }
    try {
      const videoPath = job.files.video;
      if (!videoPath) {
        res.status(400).json({ error: 'Thiếu file Video nền.' });
        return;
      }
      const vMeta = await probeMediaMeta(videoPath);
      const contentDuration = vMeta.duration;
      const assContent = typeof req.body?.assContent === 'string' ? req.body.assContent : '';
      const assPath = path.join(job.dir, 'karaoke.ass');
      if (assContent.trim()) {
        await fs.promises.writeFile(assPath, '\uFEFF' + assContent, 'utf8');
      }

      const effect = typeof req.body?.videoEffect === 'string' ? req.body.videoEffect : 'Fade cinematic';
      const outroSeconds = Math.max(0, Math.min(6, Number(req.body?.outroSeconds ?? 0)));

      const watermarkEnabled = req.body?.watermarkEnabled !== false;
      const watermarkText =
        watermarkEnabled && typeof req.body?.watermarkText === 'string'
          ? req.body.watermarkText.trim()
          : '';
      const watermarkCorner =
        typeof req.body?.watermarkCorner === 'string' ? req.body.watermarkCorner : 'bottom-right';
      const watermarkOpacity = Math.max(0.15, Math.min(1, Number(req.body?.watermarkOpacity ?? 0.65)));
      const outroText = typeof req.body?.outroText === 'string' ? req.body.outroText.trim() : '';

      const hasOutro = outroSeconds > 0 && outroText.length > 0;
      const totalDuration = hasOutro ? contentDuration + outroSeconds : contentDuration;
      const fadeOutStart = hasOutro ? contentDuration : Math.max(0, contentDuration - 0.35);
      const fadeOutDur = hasOutro ? Math.min(0.55, Math.max(0.25, outroSeconds * 0.4)) : 0.35;

      const vFilters: string[] = [];
      if (effect === 'Fade cinematic') {
        vFilters.push('fade=t=in:st=0:d=0.65');
      } else if (effect === 'Soft vignette + fade') {
        vFilters.push('vignette=PI/5', 'eq=contrast=1.04:saturation=0.92', 'fade=t=in:st=0:d=0.7');
      } else if (effect === 'Warm film + fade') {
        vFilters.push('eq=contrast=1.06:saturation=1.12:brightness=0.015', 'colorbalance=rs=0.035:gs=0.012:bs=-0.025', 'vignette=PI/6', 'fade=t=in:st=0:d=0.7');
      } else if (effect === 'Cool tech + fade') {
        vFilters.push('eq=contrast=1.05:saturation=1.08', 'colorbalance=rs=-0.025:gs=0.005:bs=0.035', 'fade=t=in:st=0:d=0.7');
      } else if (effect === 'Slow zoom + fade') {
        const srcFps = Math.max(24, Math.min(60, vMeta.fps || 30));
        vFilters.push(
          `fps=${srcFps}`,
          `zoompan=z='min(zoom+0.00012,1.045)':d=1:s=${vMeta.width}x${vMeta.height}:fps=${srcFps}`,
          'fade=t=in:st=0:d=0.7',
        );
      }

      if (assContent.trim()) {
        vFilters.push(`subtitles=filename=${path.basename(assPath)}`);
      }

      if (hasOutro) {
        vFilters.push(`tpad=stop_mode=clone:stop_duration=${outroSeconds.toFixed(3)}`);
      }
      if (vFilters.length > 0 || hasOutro) {
        vFilters.push(`fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeOutDur.toFixed(3)}`);
      }

      if (watermarkText || hasOutro) {
        const toAssTimeOverlay = (sec: number) => {
          const s = Math.max(0, sec);
          const cs = Math.round(s * 100);
          const hh = Math.floor(cs / 360000);
          const mm = Math.floor((cs % 360000) / 6000);
          const ss = Math.floor((cs % 6000) / 100);
          const cc = cs % 100;
          return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(cc).padStart(2, '0')}`;
        };
        const escAssOverlay = (s: string) =>
          s.replace(/\\/g, '\\\\').replace(/\{/g, '(').replace(/\}/g, ')');

        const overlayLines: string[] = [
          '[Script Info]',
          'ScriptType: v4.00+',
          `PlayResX: ${vMeta.width}`,
          `PlayResY: ${vMeta.height}`,
          'WrapStyle: 2',
          '',
          '[V4+ Styles]',
          'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
          `Style: Watermark,Noto Sans,${Math.max(18, Math.round(vMeta.height * 0.022))},&H00FFFFFF,&H00FFFFFF,&H800F172A,&H00000000,-1,0,0,0,100,100,0,0,1,2,1,3,36,36,28,1`,
          `Style: Outro,Noto Sans,${Math.max(26, Math.round(vMeta.height * 0.044))},&H00FFFFFF,&H00FFFFFF,&H400F172A,&H00000000,-1,0,0,0,100,100,0,0,1,3,1,5,40,40,40,1`,
          '',
          '[Events]',
          'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
        ];

        if (watermarkText) {
          const anCode =
            watermarkCorner === 'top-left'
              ? 7
              : watermarkCorner === 'top-right'
                ? 9
                : watermarkCorner === 'bottom-left'
                  ? 1
                  : 3;
          const alphaHex = Math.round((1 - watermarkOpacity) * 255)
            .toString(16)
            .toUpperCase()
            .padStart(2, '0');
          overlayLines.push(
            `Dialogue: 1,0:00:00.00,${toAssTimeOverlay(contentDuration)},Watermark,,0,0,0,,{\\an${anCode}\\alpha&H${alphaHex}&}${escAssOverlay(watermarkText)}`,
          );
        }
        if (hasOutro) {
          const startOutro = contentDuration;
          const joined = outroText
            .split(/\r?\n/)
            .map((l: string) => escAssOverlay(l.trim()))
            .filter(Boolean)
            .slice(0, 2)
            .join('\\N');
          if (joined) {
            overlayLines.push(
              `Dialogue: 2,${toAssTimeOverlay(startOutro)},${toAssTimeOverlay(totalDuration)},Outro,,0,0,0,,{\\an5\\fad(450,400)}${joined}`,
            );
          }
        }
        const wmOverlayPath = path.join(job.dir, 'wm_outro.ass');
        await fs.promises.writeFile(wmOverlayPath, '\uFEFF' + overlayLines.join('\n'), 'utf8');
        vFilters.push(`subtitles=filename=${path.basename(wmOverlayPath)}`);
      }

      const musicPreset = typeof req.body?.musicPreset === 'string' ? req.body.musicPreset.trim() : '';
      const sfxPreset = typeof req.body?.sfxPreset === 'string' ? req.body.sfxPreset.trim() : '';
      const resolvedMusicPath =
        job.files.music || (musicPreset && musicPreset !== 'none' ? await ensureDefaultStudioAudio(musicPreset) : null);
      const resolvedSfxPath =
        job.files.sfx || (sfxPreset && sfxPreset !== 'none' ? await ensureDefaultStudioAudio(sfxPreset) : null);

      const cmd: string[] = ['-y', '-hide_banner', '-loglevel', 'error', '-i', videoPath];
      let nextIdx = 1;
      let musicIdx: number | null = null;
      let sfxIdx: number | null = null;
      let voiceIdx: number | null = null;

      if (resolvedMusicPath) {
        cmd.push('-stream_loop', '-1', '-i', resolvedMusicPath);
        musicIdx = nextIdx++;
      }
      if (resolvedSfxPath) {
        cmd.push('-stream_loop', '-1', '-i', resolvedSfxPath);
        sfxIdx = nextIdx++;
      }
      if (job.files.voice) {
        cmd.push('-i', job.files.voice);
        voiceIdx = nextIdx++;
      }

      const muteOriginal = Boolean(req.body?.muteOriginal);
      const removeDialogue = Boolean(req.body?.removeDialogue);
      const originalVol = Math.max(0, Math.min(2, Number(req.body?.originalVolume ?? 0.6)));
      const musicVol = Math.max(0, Math.min(2, Number(req.body?.musicVolume ?? 0.35)));
      const sfxVol = Math.max(0, Math.min(2, Number(req.body?.sfxVolume ?? 0.3)));
      const voiceVol = Math.max(0, Math.min(2, Number(req.body?.voiceVolume ?? 1.0)));
      const voiceStart = Math.max(0, Number(req.body?.voiceStart ?? 0));
      const voicePriority = req.body?.voicePriority !== false;

      const filters: string[] = [vFilters.length > 0 ? `[0:v:0]${vFilters.join(',')}[vout]` : '[0:v:0]null[vout]'];
      const bedLabels: string[] = [];

      if (!muteOriginal && vMeta.hasAudio) {
        const origPad = hasOutro ? `,apad=pad_dur=${outroSeconds.toFixed(3)}` : '';
        if (removeDialogue && vMeta.isStereo) {
          filters.push(`[0:a:0]aformat=sample_rates=48000:channel_layouts=stereo,pan=stereo|c0=FL-FR|c1=FR-FL,volume=${originalVol.toFixed(3)}${origPad}[orig]`);
        } else {
          filters.push(`[0:a:0]aformat=sample_rates=48000:channel_layouts=stereo,volume=${originalVol.toFixed(3)}${origPad}[orig]`);
        }
        bedLabels.push('[orig]');
      }
      if (musicIdx !== null) {
        filters.push(
          `[${musicIdx}:a:0]aformat=sample_rates=48000:channel_layouts=stereo,volume=${musicVol.toFixed(3)},atrim=0:${totalDuration.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=1.2,afade=t=out:st=${Math.max(0, totalDuration - 1.5).toFixed(3)}:d=${Math.min(1.5, totalDuration).toFixed(3)}[music]`,
        );
        bedLabels.push('[music]');
      }
      if (sfxIdx !== null) {
        filters.push(
          `[${sfxIdx}:a:0]aformat=sample_rates=48000:channel_layouts=stereo,volume=${sfxVol.toFixed(3)},atrim=0:${totalDuration.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=1.8,afade=t=out:st=${Math.max(0, totalDuration - 2.0).toFixed(3)}:d=${Math.min(2.0, totalDuration).toFixed(3)}[sfx]`,
        );
        bedLabels.push('[sfx]');
      }
      if (voiceIdx !== null) {
        const delayMs = Math.max(0, Math.round(voiceStart * 1000));
        filters.push(
          `[${voiceIdx}:a:0]aformat=sample_rates=48000:channel_layouts=stereo,volume=${voiceVol.toFixed(3)},adelay=${delayMs}:all=1,apad,atrim=0:${contentDuration.toFixed(3)},asetpts=PTS-STARTPTS${hasOutro ? `,apad=pad_dur=${outroSeconds.toFixed(3)}` : ''}[voice]`,
        );
      }

      if (bedLabels.length > 0 && voiceIdx !== null) {
        if (bedLabels.length === 1) {
          filters.push(`${bedLabels[0]}anull[bed]`);
        } else {
          filters.push(
            `${bedLabels.join('')}amix=inputs=${bedLabels.length}:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.95[bed]`,
          );
        }
      }

      const audioPresent = bedLabels.length > 0 || voiceIdx !== null;
      if (voiceIdx !== null) {
        if (bedLabels.length > 0) {
          if (voicePriority) {
            filters.push('[voice]asplit=2[voice_key][voice_mix]');
            filters.push('[bed][voice_key]sidechaincompress=threshold=0.025:ratio=10:attack=15:release=420:makeup=1[bedduck]');
            filters.push("[bedduck][voice_mix]amix=inputs=2:duration=longest:dropout_transition=0:weights='0.55 1.0':normalize=0,alimiter=limit=0.95[aout]");
          } else {
            filters.push("[bed][voice]amix=inputs=2:duration=longest:dropout_transition=0:weights='0.8 1.0':normalize=0,alimiter=limit=0.95[aout]");
          }
        } else {
          filters.push('[voice]alimiter=limit=0.95[aout]');
        }
      } else if (bedLabels.length > 0) {
        if (bedLabels.length === 1) {
          filters.push(`${bedLabels[0]}alimiter=limit=0.95[aout]`);
        } else {
          filters.push(
            `${bedLabels.join('')}amix=inputs=${bedLabels.length}:duration=longest:dropout_transition=2,alimiter=limit=0.95[aout]`,
          );
        }
      }

      const outLocal = path.join(job.dir, 'karaoke_out.mp4');
      cmd.push('-filter_complex', filters.join(';'), '-map', '[vout]');
      if (audioPresent) cmd.push('-map', '[aout]');
      cmd.push('-t', totalDuration.toFixed(3), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p');
      if (audioPresent) cmd.push('-c:a', 'aac', '-b:a', '192k');
      else cmd.push('-an');
      cmd.push('-movflags', '+faststart', outLocal);

      job.status = 'running';
      job.progress = 8;
      job.stageLabel = 'FFmpeg đang render Karaoke & Mix âm thanh...';

      await spawnTrackedFfmpeg(
        cmd,
        job.dir,
        (p) => activeStudioProcs.set(job.id, p),
        (sec) => {
          const pct = Math.min(96, Math.max(10, Math.round(10 + (sec / Math.max(0.5, totalDuration)) * 86)));
          job.progress = pct;
          job.stageLabel = `Đang render Karaoke & Mix (${pct}%)...`;
        },
      );
      activeStudioProcs.delete(job.id);
      job.progress = 98;
      job.stageLabel = 'Đang lưu file vào thư mục Output...';

      const rawOutName = typeof req.body?.outputName === 'string' ? req.body.outputName : '';
      const origBase = path.basename(videoPath, path.extname(videoPath)).replace(/^video_/, '');
      const stem = cleanOutputTitleStem(rawOutName, cleanOutputTitleStem(origBase, 'Edu Karaoke Video'));
      const fileName = `${stem}.mp4`;
      const saveSubPath = typeof req.body?.savePath === 'string' ? req.body.savePath : '';
      const { baseDir, targetDir } = resolveSafeOutputDir(saveSubPath, 'Edu Karaoke');
      await fs.promises.mkdir(targetDir, { recursive: true });
      const diskPath = path.join(targetDir, fileName);
      await fs.promises.copyFile(outLocal, diskPath);
      const stat = await fs.promises.stat(diskPath);
      const relPath = path.relative(baseDir, diskPath).replace(/\\/g, '/');
      await recordOutputMeta(relPath, 'Edu Karaoke');
      let txtFileName: string | undefined;
      let txtRelativePath: string | undefined;
      const descriptionTxt = typeof req.body?.descriptionTxt === 'string' ? req.body.descriptionTxt : '';
      if (descriptionTxt.trim()) {
        txtFileName = `${stem}.txt`;
        const txtDiskPath = path.join(targetDir, txtFileName);
        await fs.promises.writeFile(txtDiskPath, descriptionTxt, 'utf8');
        txtRelativePath = path.relative(baseDir, txtDiskPath).replace(/\\/g, '/');
        await recordOutputMeta(txtRelativePath, 'Edu Karaoke');
      }
      job.progress = 100;
      job.status = 'done';
      job.stageLabel = 'Render Karaoke & Mix hoàn tất!';
      await cleanupStudioJob(job.id);

      res.json({
        ok: true,
        fileName,
        relativePath: relPath,
        savedPath: diskPath,
        bytes: stat.size,
        sourceTab: 'Edu Karaoke',
        txtFileName,
        txtRelativePath,
      });
    } catch (err) {
      job.status = 'error';
      await cleanupStudioJob(job.id);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Lỗi FFmpeg render Karaoke & Mix.' });
    }
  });

  app.get('/api/studio/default-audio', async (req, res) => {
    try {
      const preset = typeof req.query.preset === 'string' ? req.query.preset.trim() : '';
      if (!preset || preset === 'none') {
        res.status(400).json({ error: 'Vui lòng chọn preset âm thanh mặc định.' });
        return;
      }
      const filePath = await ensureDefaultStudioAudio(preset);
      if (!filePath) {
        res.status(404).json({ error: 'Preset âm thanh mặc định không hợp lệ.' });
        return;
      }
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.sendFile(filePath);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Không tạo được âm thanh mặc định.',
      });
    }
  });

  app.delete('/api/studio/job/:jobId', async (req, res) => {
    await cleanupStudioJob(req.params.jobId);
    res.json({ ok: true });
  });

  // Always return JSON errors for /api/* routes (including PayloadTooLargeError 413)
  app.use(
    '/api',
    (
      err: { status?: number; statusCode?: number; type?: string; message?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (res.headersSent) return;
      const status =
        typeof err?.status === 'number'
          ? err.status
          : typeof err?.statusCode === 'number'
            ? err.statusCode
            : err?.type === 'entity.too.large'
              ? 413
              : 500;
      const message =
        status === 413
          ? 'File tải lên vượt quá giới hạn dung lượng 250MB.'
          : err?.message || 'Lỗi xử lý API trên server.';
      res.status(status).json({ error: message });
    },
  );

  // Never fall through to HTML for unmatched /api/* endpoints
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint không tồn tại.' });
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve('dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`KineticSub Studio server listening on http://0.0.0.0:${port}`);
  });
}

void startServer();
