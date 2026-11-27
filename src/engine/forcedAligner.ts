import { WordTiming } from './types';

export interface SpeechIsland {
  start: number;
  end: number;
  energy: number;
}

/**
 * Pure PCM 16-bit WAV parser returning mono Float32Array samples (16kHz expected).
 */
export function parseWavBufferToMonoFloat32(wavBuf: Uint8Array): {
  samples: Float32Array;
  sampleRate: number;
} {
  if (wavBuf.length < 44) {
    throw new Error('File WAV không hợp lệ hoặc quá ngắn.');
  }
  const view = new DataView(wavBuf.buffer, wavBuf.byteOffset, wavBuf.byteLength);
  const sampleRate = view.getUint32(24, true) || 16000;

  let offset = 12;
  let dataOffset = 44;
  let dataSize = wavBuf.length - 44;
  let bitsPerSample = 16;
  let numChannels = view.getUint16(22, true) || 1;

  while (offset + 8 <= wavBuf.length) {
    const id = String.fromCharCode(
      wavBuf[offset],
      wavBuf[offset + 1],
      wavBuf[offset + 2],
      wavBuf[offset + 3],
    );
    const size = view.getUint32(offset + 4, true);
    if (id === 'fmt ') {
      numChannels = view.getUint16(offset + 10, true) || 1;
      bitsPerSample = view.getUint16(offset + 22, true) || 16;
    } else if (id === 'data') {
      dataOffset = offset + 8;
      dataSize = Math.min(size, wavBuf.length - dataOffset);
      break;
    }
    offset += 8 + size + (size % 2);
  }

  if (bitsPerSample !== 16) {
    throw new Error(`Forced aligner chỉ hỗ trợ WAV PCM 16-bit (nhận được ${bitsPerSample}-bit).`);
  }

  const totalSamples = Math.floor(dataSize / (2 * numChannels));
  const out = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    let sum = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      const byteIdx = dataOffset + (i * numChannels + ch) * 2;
      if (byteIdx + 1 < wavBuf.length) {
        sum += view.getInt16(byteIdx, true) / 32768;
      }
    }
    out[i] = sum / numChannels;
  }
  return { samples: out, sampleRate };
}

/**
 * Detects spoken voice activity islands in a mono PCM Float32Array using 20ms RMS frames.
 */
export function detectSpeechIslands(
  samples: Float32Array,
  sampleRate = 16000,
): SpeechIsland[] {
  if (samples.length === 0 || sampleRate <= 0) return [];
  const totalDur = samples.length / sampleRate;
  const frameLen = Math.max(160, Math.round(sampleRate * 0.02)); // 20ms frames
  const frameDur = frameLen / sampleRate;
  const energies: number[] = [];

  for (let start = 0; start < samples.length; start += frameLen) {
    const end = Math.min(samples.length, start + frameLen);
    let sq = 0;
    for (let i = start; i < end; i++) {
      sq += samples[i] * samples[i];
    }
    energies.push(Math.sqrt(sq / Math.max(1, end - start)));
  }

  if (energies.length === 0) return [];
  const sorted = [...energies].sort((a, b) => a - b);
  const noiseFloor = sorted[Math.floor(sorted.length * 0.15)] || 0;
  const peak = sorted[Math.floor(sorted.length * 0.92)] || 0.05;
  const threshold = Math.max(0.008, noiseFloor * 2.2 + (peak - noiseFloor) * 0.08);

  const rawActive = energies.map((e) => e >= threshold);
  // Bridge brief intra-word consonantal/plosive dips (< 140ms => 7 frames)
  const minSilenceFrames = 7;
  let silenceRun = 0;
  for (let i = 0; i < rawActive.length; i++) {
    if (!rawActive[i]) {
      silenceRun += 1;
    } else {
      if (silenceRun > 0 && silenceRun < minSilenceFrames && i - silenceRun > 0) {
        for (let k = i - silenceRun; k < i; k++) rawActive[k] = true;
      }
      silenceRun = 0;
    }
  }

  const islands: SpeechIsland[] = [];
  let inSpeech = false;
  let startFrame = 0;
  let energyAcc = 0;
  let frameCount = 0;

  for (let i = 0; i < rawActive.length; i++) {
    if (rawActive[i] && !inSpeech) {
      inSpeech = true;
      startFrame = i;
      energyAcc = energies[i];
      frameCount = 1;
    } else if (rawActive[i] && inSpeech) {
      energyAcc += energies[i];
      frameCount += 1;
    } else if (!rawActive[i] && inSpeech) {
      const s = Math.max(0, startFrame * frameDur - 0.02);
      const e = Math.min(totalDur, i * frameDur + 0.02);
      if (e - s >= 0.08) {
        islands.push({ start: s, end: e, energy: energyAcc / Math.max(1, frameCount) });
      }
      inSpeech = false;
    }
  }
  if (inSpeech) {
    const s = Math.max(0, startFrame * frameDur - 0.02);
    const e = totalDur;
    if (e - s >= 0.08) {
      islands.push({ start: s, end: e, energy: energyAcc / Math.max(1, frameCount) });
    }
  }

  return islands;
}

const RE_HAS_CJK_OR_KANA = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
const RE_HAS_KANA = /[\u3040-\u30ff]/;
const RE_TRAILING_PUNCT = /^[,.!?;:、。！？「」『』（）()《》【】"']+$/;

function resolveSegmenterLocale(text: string, lang?: string): string {
  const norm = String(lang || '').trim().toLowerCase();
  if (norm.startsWith('ja')) return 'ja';
  if (norm.startsWith('zh')) return 'zh';
  if (RE_HAS_KANA.test(text)) return 'ja';
  return 'zh';
}

/**
 * Splits text into word-level tokens with proper handling for CJK (Chinese/Japanese)
 * where words are not separated by whitespace, while keeping space-delimited languages
 * (English, Vietnamese, Korean, French, Spanish) intact.
 */
export function tokenizeTextForAlignment(text: string, lang?: string): string[] {
  const rawTokens = text
    .replace(/\r?\n+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (rawTokens.length === 0) return [];

  const result: string[] = [];
  const SegmenterCtor =
    typeof Intl !== 'undefined' &&
    typeof (Intl as unknown as { Segmenter?: unknown }).Segmenter === 'function'
      ? (Intl as unknown as {
          Segmenter: new (
            locales?: string | string[],
            options?: { granularity?: 'grapheme' | 'word' | 'sentence' },
          ) => { segment: (input: string) => Iterable<{ segment: string; isWordLike?: boolean }> };
        }).Segmenter
      : null;

  for (const tok of rawTokens) {
    if (!RE_HAS_CJK_OR_KANA.test(tok) || tok.length <= 2) {
      result.push(tok);
      continue;
    }

    if (SegmenterCtor) {
      const locale = resolveSegmenterLocale(tok, lang);
      try {
        const segmenter = new SegmenterCtor(locale, { granularity: 'word' });
        const segs = Array.from(segmenter.segment(tok));
        for (const s of segs) {
          const piece = s.segment.trim();
          if (!piece) continue;
          if (RE_TRAILING_PUNCT.test(piece) && result.length > 0) {
            result[result.length - 1] += piece;
          } else if (RE_HAS_CJK_OR_KANA.test(piece) && piece.length > 4) {
            for (let i = 0; i < piece.length; i += 2) {
              result.push(piece.slice(i, i + 2));
            }
          } else {
            result.push(piece);
          }
        }
        continue;
      } catch {
        // Fallback below if locale segmenter fails
      }
    }

    // Regex fallback: separate Latin/digit tokens from CJK runs, only chunk CJK runs
    const scriptParts =
      tok.match(
        /[「『（【《〈"']*?[A-Za-z0-9\u00C0-\u024F\u1E00-\u1EFF][A-Za-z0-9\u00C0-\u024F\u1E00-\u1EFF'’\-.,!?;:]*[」』）】》〉"']*|[「『（【《〈]?[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fffー々、。！？「」『』（）()【】《》]+|[^\s]/g,
      ) || [tok];
    for (const part of scriptParts) {
      if (!RE_HAS_CJK_OR_KANA.test(part)) {
        if (RE_TRAILING_PUNCT.test(part) && result.length > 0) {
          result[result.length - 1] += part;
        } else {
          result.push(part);
        }
        continue;
      }
      const clauses = part.split(/(?<=[。、！？；：「」『』,.!?;:])/).filter(Boolean);
      for (const clause of clauses) {
        if (!RE_HAS_CJK_OR_KANA.test(clause) || clause.length <= 3) {
          if (RE_TRAILING_PUNCT.test(clause) && result.length > 0) {
            result[result.length - 1] += clause;
          } else {
            result.push(clause);
          }
        } else {
          for (let i = 0; i < clause.length; i += 2) {
            const slice = clause.slice(i, i + 2);
            if (RE_TRAILING_PUNCT.test(slice) && result.length > 0) {
              result[result.length - 1] += slice;
            } else {
              result.push(slice);
            }
          }
        }
      }
    }
  }

  return result;
}

export interface WavSpeechBounds {
  speechStartSec: number;
  speechEndSec: number;
  durationSec: number;
}

/**
 * Finds the leading and trailing speech onset/offset in mono PCM Float32 samples
 * using 10ms RMS energy frames so multi-TTS spans can be trimmed tightly without cutting consonants.
 */
export function detectWavSpeechBounds(
  samples: Float32Array,
  sampleRate = 24000,
  options?: { leadPadSec?: number; tailPadSec?: number; minSpeechSpanSec?: number },
): WavSpeechBounds {
  const safeRate = Math.max(8000, sampleRate);
  const durationSec = Number((samples.length / safeRate).toFixed(4));
  if (samples.length === 0) {
    return { speechStartSec: 0, speechEndSec: 0, durationSec: 0 };
  }

  const frameLen = Math.max(80, Math.round(safeRate * 0.01)); // 10ms frames
  const frameDur = frameLen / safeRate;
  const energies: number[] = [];
  let maxEnergy = 0;

  for (let start = 0; start < samples.length; start += frameLen) {
    const end = Math.min(samples.length, start + frameLen);
    let sq = 0;
    for (let i = start; i < end; i++) {
      sq += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sq / Math.max(1, end - start));
    energies.push(rms);
    if (rms > maxEnergy) maxEnergy = rms;
  }

  if (maxEnergy < 0.002 || energies.length === 0) {
    return { speechStartSec: 0, speechEndSec: durationSec, durationSec };
  }

  const threshold = Math.max(0.0065, maxEnergy * 0.038);
  let firstActive = -1;
  let lastActive = -1;
  for (let i = 0; i < energies.length; i++) {
    if (energies[i] >= threshold) {
      if (firstActive === -1) firstActive = i;
      lastActive = i;
    }
  }

  if (firstActive === -1 || lastActive === -1) {
    return { speechStartSec: 0, speechEndSec: durationSec, durationSec };
  }

  const leadPad = Math.max(0, options?.leadPadSec ?? 0.03);
  const tailPad = Math.max(0, options?.tailPadSec ?? 0.045);
  const minSpan = Math.max(0.08, options?.minSpeechSpanSec ?? 0.14);

  const rawStart = Math.max(0, firstActive * frameDur - leadPad);
  let rawEnd = Math.min(durationSec, (lastActive + 1) * frameDur + tailPad);
  if (rawEnd - rawStart < minSpan) {
    rawEnd = Math.min(durationSec, rawStart + minSpan);
  }

  return {
    speechStartSec: Number(rawStart.toFixed(4)),
    speechEndSec: Number(rawEnd.toFixed(4)),
    durationSec,
  };
}

function wordSpeechWeight(word: string): number {
  const letters = word.replace(/[^\p{L}\p{N}]/gu, '');
  const cjkMatches = letters.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/g);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const nonCjkCount = Math.max(0, letters.length - cjkCount);
  const base =
    cjkCount > 0
      ? Math.max(1.8, cjkCount * 1.45 + (nonCjkCount > 0 ? Math.pow(nonCjkCount, 0.78) : 0))
      : Math.max(1.8, Math.pow(Math.max(1, letters.length), 0.78));
  const pauseBonus = /[.!?。！？]$/.test(word) ? 1.8 : /[,;:、，；：]$/.test(word) ? 0.9 : 0;
  return base + pauseBonus;
}

/**
 * Aligns known text lines/words onto detected speech islands from PCM Float32 audio.
 * Runs in <100ms offline with zero external model downloads or HTTP 429 risk.
 * Supports English, Vietnamese, Korean, Chinese, Japanese, French, and Spanish.
 */
export function alignKnownTextToPcmFloat(
  referenceText: string,
  samples: Float32Array,
  sampleRate = 16000,
  options?: { lang?: string },
): {
  words: WordTiming[];
  segments: Array<{ start: number; end: number; text: string }>;
  durationSec: number;
  islands: SpeechIsland[];
} {
  const totalDur = Number(Math.max(0.5, samples.length / Math.max(1, sampleRate)).toFixed(3));
  const lines = referenceText
    .split(/\r?\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const tokens = lines.flatMap((line, lineIdx) =>
    tokenizeTextForAlignment(line, options?.lang).map((word) => ({ word, lineIdx })),
  );

  if (tokens.length === 0) {
    return { words: [], segments: [], durationSec: totalDur, islands: [] };
  }

  const detectedIslands = detectSpeechIslands(samples, sampleRate);
  const islands: SpeechIsland[] =
    detectedIslands.length > 0
      ? detectedIslands
      : [{ start: 0.05, end: Math.max(0.4, totalDur - 0.05), energy: 0.1 }];

  // Total voiced timeline across islands mapped linearly to active spoken progress
  const islandSpans = islands.map((isl) => Math.max(0.05, isl.end - isl.start));
  const totalSpokenSpan = islandSpans.reduce((a, b) => a + b, 0);

  const mapActiveOffsetToAudioTime = (voicedOffset: number): number => {
    let rem = Math.max(0, Math.min(totalSpokenSpan, voicedOffset));
    for (let i = 0; i < islands.length; i++) {
      const span = islandSpans[i];
      if (rem <= span || i === islands.length - 1) {
        return Math.min(islands[i].end, islands[i].start + rem);
      }
      rem -= span;
    }
    return islands[islands.length - 1].end;
  };

  const weights = tokens.map((t) => wordSpeechWeight(t.word));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  let voicedCursor = 0;
  const alignedWords: Array<WordTiming & { lineIdx: number }> = [];

  for (let i = 0; i < tokens.length; i++) {
    const share = (weights[i] / totalWeight) * totalSpokenSpan;
    const rawStart = mapActiveOffsetToAudioTime(voicedCursor);
    voicedCursor += share;
    const rawEnd = mapActiveOffsetToAudioTime(voicedCursor);
    const prevEnd = i > 0 ? alignedWords[i - 1].end : 0;
    const start = Number(Math.max(prevEnd, rawStart).toFixed(3));
    const end = Number(Math.max(start + 0.06, Math.min(totalDur, rawEnd)).toFixed(3));
    alignedWords.push({
      word: tokens[i].word,
      start,
      end,
      lineIdx: tokens[i].lineIdx,
    });
  }

  const segments: Array<{ start: number; end: number; text: string }> = [];
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineWords = alignedWords.filter((w) => w.lineIdx === lineIdx);
    if (lineWords.length === 0) continue;
    segments.push({
      start: lineWords[0].start,
      end: lineWords[lineWords.length - 1].end,
      text: lines[lineIdx],
    });
  }

  return {
    words: alignedWords.map(({ word, start, end }) => ({ word, start, end })),
    segments,
    durationSec: totalDur,
    islands,
  };
}
