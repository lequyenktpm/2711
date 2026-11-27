export const TAB_OUTPUT_SUBFOLDERS = {
  studio: 'Studio 9-16',
  reels: 'English Reels',
  merge: 'Edu Merge',
  karaoke: 'Edu Karaoke',
  reading: 'Reading Along',
  batch: 'Batch',
} as const;

const SOURCE_TAB_TO_SUBFOLDER: Record<string, string> = {
  'Studio 9:16': TAB_OUTPUT_SUBFOLDERS.studio,
  'Studio Video 9:16': TAB_OUTPUT_SUBFOLDERS.studio,
  'English Reels': TAB_OUTPUT_SUBFOLDERS.reels,
  'English Reels Studio': TAB_OUTPUT_SUBFOLDERS.reels,
  'Edu Merge': TAB_OUTPUT_SUBFOLDERS.merge,
  'Edu Karaoke': TAB_OUTPUT_SUBFOLDERS.karaoke,
  'Reading Along': TAB_OUTPUT_SUBFOLDERS.reading,
  Batch: TAB_OUTPUT_SUBFOLDERS.batch,
  'Batch Queue': TAB_OUTPUT_SUBFOLDERS.batch,
};

/**
 * Resolves the safe subfolder inside the project parent `output/` directory.
 * Ensures every tab writes into its own clean subfolder inside parent `output/`
 * (and prevents duplicate `output/output/...` nesting).
 */
export function resolveTabOutputSubfolder(
  sourceTab?: string,
  requestedSavePath?: string,
): string {
  const cleanRequested = String(requestedSavePath || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/^output(?:\/|$)/i, '')
    .replace(/^\/+|\/+$/g, '');

  const safeSegments = cleanRequested
    .split('/')
    .map((seg) => seg.trim().replace(/[<>:"|?*\x00-\x1f]/g, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((seg) => Boolean(seg) && seg !== '.' && seg !== '..');

  if (safeSegments.length > 0) {
    return safeSegments.join('/');
  }

  const mapped = sourceTab ? SOURCE_TAB_TO_SUBFOLDER[sourceTab.trim()] : undefined;
  return mapped || 'General';
}

/**
 * Produces a clean, meaningful file stem from a lesson/video title.
 * Strictly avoids underscores (`_`), appended dates, timestamps, random hashes,
 * and resolution tags (`_720p`, etc.) while keeping meaningful numbers like "Quiz 5s".
 */
export function cleanOutputTitleStem(raw: string, fallback = 'KineticSub Video'): string {
  let text = String(raw || '').trim();

  // Strip common media/subtitle/archive extensions (including chained ones like .mp4.part)
  text = text.replace(/\.(mp4|webm|mov|mkv|mp3|wav|m4a|srt|vtt|ass|zip|json|txt)$/i, '').trim();

  // Strip noisy filesystem characters cleanly without leaving awkward spaces inside 【...】 / [...]
  text = text
    .replace(/[?!？]+(?=\s*[】\]\)])/g, '')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\s*&\s*/g, ' and ')
    .replace(/([【\[\(])\s+/g, '$1')
    .replace(/\s+([】\]\)])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  // Iteratively strip trailing machine-generated suffixes:
  // - ISO / compact dates (2026-11-24, 20261124, 24-11-2026)
  // - Epoch timestamps (>= 8 digits)
  // - Old exported tags like "reels abc12", "reading mix", "audio", "720p", "1080p", "merged"
  let prev = '';
  while (text !== prev) {
    prev = text;
    text = text
      .replace(/[\s\-]+(?:20\d{2}[-./]?\d{1,2}[-./]?\d{1,2}|\d{1,2}[-./]\d{1,2}[-./]20\d{2})$/i, '')
      .replace(/[\s\-]+\d{7,}$/, '')
      .replace(/[\s\-]+(?:540p|720p|1080p|1440p|2160p)$/i, '')
      .replace(/[\s\-]+(?:reels|reading\s+mix|bgm|mp4|mp3|wav|srt|vtt|zip|webm)$/i, '')
      .replace(/[\s\-]+([a-z0-9]{4,8})$/i, (m, token: string) => {
        // Only strip alphanumeric hash tokens (containing both digits & letters, 4..8 chars)
        return /[a-z]/i.test(token) && /\d/.test(token) && token.length >= 4 && token.length <= 8 ? '' : m;
      })
      .trim();
  }

  // Strip leading YYYY-MM-DD / numeric date prefixes if present
  text = text.replace(/^(?:20\d{2}[-./]?\d{1,2}[-./]?\d{1,2})[\s\-]+/, '').trim();

  // Collapse repeated hyphens/spaces (keeping intra-word hyphens like Check-in) and trim outer punctuation
  text = text
    .replace(/\s+-\s+/g, ' - ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\-\s]+|[.\-\s]+$/g, '')
    .trim();

  if (!text) {
    return fallback;
  }

  if (text.length > 84) {
    const sliced = text.slice(0, 84);
    const lastSpace = sliced.lastIndexOf(' ');
    text = (lastSpace > 36 ? sliced.slice(0, lastSpace) : sliced).replace(/[.\-\s]+$/g, '').trim();
  }

  return text || fallback;
}

export function cleanDownloadFileName(
  rawTitle: string,
  extension: string,
  fallback = 'KineticSub Video',
): string {
  const cleanExt = extension.replace(/^\.+/, '').toLowerCase() || 'mp4';
  const stem = cleanOutputTitleStem(rawTitle, fallback);
  return `${stem}.${cleanExt}`;
}
