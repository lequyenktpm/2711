import { TranscriptCue, WordTiming } from './types';

export function parseTimeToken(raw: string): number {
  const cleaned = raw.trim().replace(',', '.');
  const parts = cleaned.split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] ?? 0;
}

export function formatTimeToken(sec: number): string {
  const safe = Math.max(0, sec);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

// Split CJK runs into readable 3-4 char karaoke chunks while preserving Latin/English words intact
export function tokenizeTextForKaraoke(text: string): string[] {
  const rawTokens = text.trim().split(/\s+/).filter(Boolean);
  const result: string[] = [];
  const hasCjk = (s: string) => /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(s);
  const hasLatinOrDigit = (s: string) => /[A-Za-z0-9\u00C0-\u024F\u1E00-\u1EFF]/.test(s);
  const isTrailingCjkPunct = (s: string) => /^[。、！？「」『』（）()【】《》.,!?;:]+$/.test(s);

  const pushCjkRun = (run: string) => {
    const clauses = run.split(/(?<=[。、！？「」『』,.!?])/).filter(Boolean);
    for (const clause of clauses) {
      if (isTrailingCjkPunct(clause) && result.length > 0) {
        result[result.length - 1] += clause;
        continue;
      }
      if (clause.length <= 5) {
        result.push(clause);
        continue;
      }
      // Split into balanced 3-5 char chunks so no chunk exceeds 5 chars and no 1-2 char orphan tail is created
      let i = 0;
      while (i < clause.length) {
        const rem = clause.length - i;
        if (rem <= 5) {
          if (rem <= 2 && result.length > 0 && result[result.length - 1].length + rem <= 5) {
            result[result.length - 1] += clause.slice(i);
          } else {
            result.push(clause.slice(i));
          }
          break;
        }
        const take = rem === 6 ? 3 : 4;
        result.push(clause.slice(i, i + take));
        i += take;
      }
    }
  };

  for (const tok of rawTokens) {
    if (!hasCjk(tok) || tok.length <= 5) {
      result.push(tok);
      continue;
    }

    // Separate Latin/digit runs (with attached quotes/punct) from pure CJK runs so English words are NEVER sliced
    const scriptParts =
      tok.match(
        /[「『（【《〈"']*?[A-Za-z0-9\u00C0-\u024F\u1E00-\u1EFF][A-Za-z0-9\u00C0-\u024F\u1E00-\u1EFF'’\-.,!?;:]*[」』）】》〉"']*|[「『（【《〈]?[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fffー々、。！？「」『』（）()【】《》]+|[^\s]/g,
      ) || [tok];

    for (const part of scriptParts) {
      if (isTrailingCjkPunct(part) && result.length > 0) {
        result[result.length - 1] += part;
      } else if (hasLatinOrDigit(part) || !hasCjk(part)) {
        result.push(part);
      } else {
        pushCjkRun(part);
      }
    }
  }
  return result;
}

export function interpolateWordTimings(
  text: string,
  start: number,
  end: number,
): WordTiming[] {
  const tokens = tokenizeTextForKaraoke(text);
  if (tokens.length === 0) return [];

  const safeEnd = Math.max(end, start + 0.3);
  const totalDuration = safeEnd - start;

  const weights = tokens.map((t) => Math.max(2, t.length));
  const weightSum = weights.reduce((acc, w) => acc + w, 0);

  let cursor = start;
  return tokens.map((word, idx) => {
    const slice = (weights[idx] / weightSum) * totalDuration;
    const wStart = Number(cursor.toFixed(3));
    const wEnd =
      idx === tokens.length - 1
        ? Number(safeEnd.toFixed(3))
        : Number((cursor + slice).toFixed(3));
    cursor += slice;
    return { word, start: wStart, end: wEnd };
  });
}

export function parseSrtOrVtt(input: string): TranscriptCue[] {
  const normalized = input.replace(/\r\n/g, '\n').replace(/^WEBVTT[^\n]*\n*/i, '').trim();
  if (!normalized) return [];

  const blocks = normalized.split(/\n{2,}/);
  const cues: TranscriptCue[] = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    const timeLineIndex = lines.findIndex((l) => l.includes('-->'));
    if (timeLineIndex === -1) continue;

    const [startRaw, endRaw] = lines[timeLineIndex].split('-->').map((s) => s.trim().split(' ')[0]);
    const start = parseTimeToken(startRaw);
    const end = parseTimeToken(endRaw);
    const textLines = lines.slice(timeLineIndex + 1);
    const text = textLines.join(' ').replace(/<[^>]+>/g, '').trim();
    if (!text) continue;

    const idx = cues.length + 1;
    cues.push({
      id: `cue-${idx}`,
      start,
      end: Math.max(end, start + 0.4),
      text,
      words: interpolateWordTimings(text, start, Math.max(end, start + 0.4)),
    });
  }

  return cues;
}

export function parseJsonTranscript(input: string): TranscriptCue[] {
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed?.words) && !Array.isArray(parsed?.segments)) {
      const words: WordTiming[] = (parsed.words as unknown[])
        .filter((w): w is { word?: string; text?: string; start?: number; end?: number } =>
          Boolean(w && typeof w === 'object'),
        )
        .map((w) => ({
          word: String(w.word ?? w.text ?? '').trim(),
          start: Number(w.start ?? 0),
          end: Number(w.end ?? 0.4),
        }))
        .filter((w) => w.word.length > 0);
      if (words.length > 0) {
        const cues: TranscriptCue[] = [];
        let bucket: WordTiming[] = [];
        for (let i = 0; i < words.length; i++) {
          bucket.push(words[i]);
          const endsSent = /[.!?。！？]$/.test(words[i].word);
          const gap = words[i + 1] ? words[i + 1].start - words[i].end : 0;
          if (bucket.length >= 6 || endsSent || gap > 0.65 || i === words.length - 1) {
            cues.push({
              id: `cue-${cues.length + 1}`,
              start: bucket[0].start,
              end: bucket[bucket.length - 1].end,
              text: bucket.map((b) => b.word).join(' '),
              words: bucket,
            });
            bucket = [];
          }
        }
        return cues;
      }
    }

    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.segments)
        ? parsed.segments
        : Array.isArray(parsed?.cues)
          ? parsed.cues
          : [];

    const cues: TranscriptCue[] = [];
    for (const item of list) {
      if (!item || typeof item.text !== 'string') continue;
      const start = Number(item.start ?? item.startTime ?? 0);
      const end = Number(item.end ?? item.endTime ?? start + 2.5);
      const text = item.text.trim();
      if (!text) continue;

      interface RawWord {
        word?: string;
        text?: string;
        start?: number;
        end?: number;
      }

      let words: WordTiming[] = [];
      if (Array.isArray(item.words) && item.words.length > 0) {
        words = (item.words as unknown[])
          .filter((w): w is RawWord => Boolean(w && typeof w === 'object'))
          .map((w) => ({
            word: String(w.word ?? w.text ?? '').trim(),
            start: Number(w.start ?? start),
            end: Number(w.end ?? end),
          }))
          .filter((w) => w.word.length > 0);
      }
      if (words.length === 0) {
        words = interpolateWordTimings(text, start, end);
      }

      cues.push({
        id: `cue-${cues.length + 1}`,
        start,
        end: Math.max(end, start + 0.4),
        text,
        words,
      });
    }
    return cues;
  } catch {
    return [];
  }
}

const STANDALONE_TIMESTAMP_RE = /^\[?(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\]?$/;

export function parseTimestampedLines(input: string): TranscriptCue[] {
  const lines = input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const parsedEntries: { start: number; end?: number; text: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Format A: Standalone timestamp line followed by text line(s), e.g.:
    // 00:00:00.000
    // このシーンを想像してみて...
    const standaloneMatch = line.match(STANDALONE_TIMESTAMP_RE);
    if (standaloneMatch) {
      const start = parseTimeToken(standaloneMatch[1]);
      const textParts: string[] = [];
      while (i + 1 < lines.length && !STANDALONE_TIMESTAMP_RE.test(lines[i + 1])) {
        i += 1;
        textParts.push(lines[i]);
      }
      const joined = textParts.join(' ').trim();
      if (joined) {
        parsedEntries.push({ start, text: joined });
      }
      continue;
    }

    // Format B: [00:00.0 - 00:02.5] Text
    const rangeMatch = line.match(
      /^\[?(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\s*[-–>to]+\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\]?\s+(.+)$/i,
    );
    if (rangeMatch) {
      parsedEntries.push({
        start: parseTimeToken(rangeMatch[1]),
        end: parseTimeToken(rangeMatch[2]),
        text: rangeMatch[3].trim(),
      });
      continue;
    }

    // Format C: [0:00] Text or 00:00:11.960 Text
    const singleMatch = line.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\]?\s+(.+)$/);
    if (singleMatch) {
      parsedEntries.push({
        start: parseTimeToken(singleMatch[1]),
        text: singleMatch[2].trim(),
      });
      continue;
    }

    // Fallback plain sentence without timestamp: auto-space 2.6s each
    const prevEnd =
      parsedEntries.length > 0
        ? (parsedEntries[parsedEntries.length - 1].end ??
          parsedEntries[parsedEntries.length - 1].start + 2.6)
        : 0;
    parsedEntries.push({
      start: prevEnd,
      end: prevEnd + 2.6,
      text: line,
    });
  }

  return parsedEntries.map((entry, idx) => {
    const nextStart = parsedEntries[idx + 1]?.start;
    const defaultDur = Math.max(2.2, Math.min(8.0, entry.text.length * 0.14));
    const end =
      entry.end ??
      (nextStart !== undefined && nextStart > entry.start
        ? nextStart - 0.06
        : entry.start + defaultDur);
    const safeEnd = Math.max(end, entry.start + 0.5);
    return {
      id: `cue-${idx + 1}`,
      start: Number(entry.start.toFixed(3)),
      end: Number(safeEnd.toFixed(3)),
      text: entry.text,
      words: interpolateWordTimings(entry.text, entry.start, safeEnd),
    };
  });
}

export function parseTranscriptAuto(input: string): TranscriptCue[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const jsonCues = parseJsonTranscript(trimmed);
    if (jsonCues.length > 0) return jsonCues;
  }

  if (trimmed.includes('-->')) {
    const srtCues = parseSrtOrVtt(trimmed);
    if (srtCues.length > 0) return srtCues;
  }

  return parseTimestampedLines(trimmed);
}

export function cuesToSrt(cues: TranscriptCue[]): string {
  const fmt = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.round((sec - Math.floor(sec)) * 1000);
    const pad = (n: number, w = 2) => String(n).padStart(w, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
  };
  return cues
    .map((cue, idx) => `${idx + 1}\n${fmt(cue.start)} --> ${fmt(cue.end)}\n${cue.text}`)
    .join('\n\n');
}

export function cuesToBlockTranscript(cues: TranscriptCue[]): string {
  return cues
    .map((cue) => `${formatTimeToken(cue.start)}\n${cue.text}`)
    .join('\n\n');
}

const SRT_ARROW_RE = /\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?\s*-->\s*\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?/;
const INLINE_TS_PREFIX_RE = /^(?:[-•*]|\d+[.)])?\s*\[?\(?\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?(?:\s*[-–>to]+\s*\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)?\)?\]?\s*/i;
const ANY_TIMESTAMP_TOKEN_RE = /\[?\(?\b\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?\b\)?\]?/g;

/**
 * Extracts pure spoken lines from SRT, VTT, JSON, or block-timestamp transcripts
 * so TTS never reads "00:00:00.000" or cue numbers aloud.
 */
export function stripTimestampsFromScript(rawInput: string): string {
  const trimmed = rawInput
    .trim()
    .replace(/^WEBVTT[^\r\n]*(?:\r?\n)+/i, '')
    .trim();
  if (!trimmed) return '';

  const hasJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  if (hasJson) {
    const parsed = parseTranscriptAuto(trimmed);
    if (parsed.length > 0) {
      return parsed
        .map((c) => c.text.replace(ANY_TIMESTAMP_TOKEN_RE, ' ').replace(/\s+/g, ' ').trim())
        .filter((line) => Boolean(line) && !/^WEBVTT\b/i.test(line))
        .join('\n');
    }
  }

  const lines = trimmed.split(/\r?\n/);
  const cleanedLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^(?:WEBVTT|NOTE\b|Kind:|Language:)/i.test(line)) continue;
    if (STANDALONE_TIMESTAMP_RE.test(line) || SRT_ARROW_RE.test(line)) continue;
    if (/^\d+$/.test(line) && lines[i + 1] && SRT_ARROW_RE.test(lines[i + 1].trim())) continue;

    let cleanLine = line.replace(/<[^>]+>/g, ' ').replace(INLINE_TS_PREFIX_RE, '').trim();
    // Also strip any stray timestamp tokens like 00:00:11.960 embedded inside the line
    cleanLine = cleanLine.replace(/\b\d{1,2}:\d{2}:\d{2}(?:[.,]\d{1,3})?\b/g, ' ');
    cleanLine = cleanLine.replace(/\[\d{1,2}:\d{2}(?:[.,]\d{1,3})?\]/g, ' ');
    cleanLine = cleanLine.replace(/\s+/g, ' ').trim();
    if (cleanLine && !STANDALONE_TIMESTAMP_RE.test(cleanLine)) {
      cleanedLines.push(cleanLine);
    }
  }
  return cleanedLines.join('\n');
}

/**
 * Keeps the user's exact script lines and exact measured [start, end] audio cues,
 * while refining per-word karaoke timings using Whisper word timestamps when available.
 */
export function refineCuesWithWhisperWords(
  originalCues: TranscriptCue[],
  whisperWords: Array<{ word?: string; text?: string; start: number; end: number }>,
): TranscriptCue[] {
  if (!Array.isArray(originalCues) || originalCues.length === 0) return [];
  if (!Array.isArray(whisperWords) || whisperWords.length === 0) return originalCues;

  const normWords = whisperWords
    .map((w) => ({
      word: String(w.word ?? w.text ?? '').trim(),
      start: Number(w.start ?? 0),
      end: Number(w.end ?? 0),
    }))
    .filter((w) => w.word.length > 0 && Number.isFinite(w.start) && Number.isFinite(w.end));

  return originalCues.map((cue) => {
    const tokens = tokenizeTextForKaraoke(cue.text);
    if (tokens.length === 0) return cue;

    const inWindow = normWords.filter(
      (w) => w.end > cue.start - 0.12 && w.start < cue.end + 0.12,
    );

    if (inWindow.length === tokens.length) {
      return {
        ...cue,
        words: tokens.map((tok, i) => {
          const st = Math.max(cue.start, Math.min(cue.end - 0.04, inWindow[i].start));
          const en = Math.max(st + 0.04, Math.min(cue.end, inWindow[i].end));
          return {
            word: tok,
            start: Number(st.toFixed(3)),
            end: Number(en.toFixed(3)),
          };
        }),
      };
    }

    if (inWindow.length >= 2) {
      // Distribute original tokens proportionally across Whisper's detected speech span inside this cue
      const speechStart = Math.max(cue.start, inWindow[0].start);
      const speechEnd = Math.min(cue.end, Math.max(speechStart + 0.25, inWindow[inWindow.length - 1].end));
      return {
        ...cue,
        words: interpolateWordTimings(cue.text, speechStart, speechEnd),
      };
    }

    return {
      ...cue,
      words: interpolateWordTimings(cue.text, cue.start, cue.end),
    };
  });
}

export function shiftCuesAndWords(cues: TranscriptCue[], offsetMs: number): TranscriptCue[] {
  if (!Array.isArray(cues) || cues.length === 0) return [];
  const shiftSec = offsetMs / 1000;
  if (Math.abs(shiftSec) < 0.0005) return cues;

  return cues.map((cue) => {
    const start = Number(Math.max(0, cue.start + shiftSec).toFixed(3));
    const end = Number(Math.max(start + 0.12, cue.end + shiftSec).toFixed(3));
    const words =
      cue.words && cue.words.length > 0
        ? cue.words.map((w) => {
            const ws = Number(Math.max(start, w.start + shiftSec).toFixed(3));
            const we = Number(Math.max(ws + 0.04, Math.min(end, w.end + shiftSec)).toFixed(3));
            return { ...w, start: ws, end: we };
          })
        : interpolateWordTimings(cue.text, start, end);
    return { ...cue, start, end, words };
  });
}

export function adjustCuesTiming(
  cues: TranscriptCue[],
  options: {
    offsetMs?: number;
    speedFactor?: number;
    targetDurationSec?: number;
  },
): TranscriptCue[] {
  if (!Array.isArray(cues) || cues.length === 0) return [];
  const lastEnd = cues.reduce((mx, c) => Math.max(mx, c.end), 0);
  const rawScale =
    options.targetDurationSec && options.targetDurationSec > 0.3 && lastEnd > 0.3
      ? options.targetDurationSec / lastEnd
      : options.speedFactor ?? 1;
  const scale = Math.max(0.5, Math.min(2.0, rawScale));
  const shiftSec = (options.offsetMs ?? 0) / 1000;

  return cues.map((cue) => {
    const start = Number(Math.max(0, cue.start * scale + shiftSec).toFixed(3));
    const end = Number(Math.max(start + 0.12, cue.end * scale + shiftSec).toFixed(3));
    const words =
      cue.words && cue.words.length > 0
        ? cue.words.map((w) => {
            const ws = Number(Math.max(start, w.start * scale + shiftSec).toFixed(3));
            const we = Number(Math.max(ws + 0.04, Math.min(end, w.end * scale + shiftSec)).toFixed(3));
            return { ...w, start: ws, end: we };
          })
        : interpolateWordTimings(cue.text, start, end);
    return { ...cue, start, end, words };
  });
}



