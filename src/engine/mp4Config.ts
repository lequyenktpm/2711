export type ExportResolutionId = '540p' | '720p' | '1080p' | '1440p';
export type ExportQualityId = 'standard' | 'high' | 'ultra';
export type ExportFpsOption = 24 | 30 | 60;
export type ExportAspectRatioId = '9:16' | '16:9' | '1:1' | '4:5';

export interface Mp4ExportSettings {
  resolution: ExportResolutionId;
  quality: ExportQualityId;
  fps: ExportFpsOption;
  aspectRatio?: ExportAspectRatioId;
}

export interface ResolvedMp4Encoding {
  width: number;
  height: number;
  aspectRatio: ExportAspectRatioId;
  fps: ExportFpsOption;
  videoBitrate: number;
  audioBitrate: number;
  crf: number;
  resolutionLabel: string;
  qualityLabel: string;
}

export const DEFAULT_MP4_EXPORT_SETTINGS: Mp4ExportSettings = {
  resolution: '540p',
  quality: 'standard',
  fps: 24,
  aspectRatio: '9:16',
};

export const ASPECT_RATIO_OPTIONS: Array<{
  id: ExportAspectRatioId;
  label: string;
}> = [
  { id: '9:16', label: '9:16 · Dọc (TikTok / Reels / Shorts)' },
  { id: '16:9', label: '16:9 · Ngang (YouTube / Web)' },
  { id: '1:1', label: '1:1 · Vuông (Instagram / Facebook)' },
  { id: '4:5', label: '4:5 · Dọc Feed (Instagram / FB)' },
];

export const RESOLUTION_OPTIONS: Array<{
  id: ExportResolutionId;
  width: number;
  height: number;
  label: string;
}> = [
  { id: '540p', width: 540, height: 960, label: '540p (Nhanh & Nhẹ)' },
  { id: '720p', width: 720, height: 1280, label: '720p · HD' },
  { id: '1080p', width: 1080, height: 1920, label: '1080p · Full HD' },
  { id: '1440p', width: 1440, height: 2560, label: '1440p · 2K Nét' },
];

export const QUALITY_OPTIONS: Array<{
  id: ExportQualityId;
  label: string;
  shortDescription: string;
  baseBitrate1080p30: number;
  audioBitrate: number;
  crf: number;
}> = [
  {
    id: 'standard',
    label: 'Thấp / Tiêu chuẩn (Nhẹ nhất)',
    shortDescription: 'CRF 27 · 2.6 Mbps chuẩn 1080p30 · Audio 128 kbps — file nhẹ, render nhanh nhất',
    baseBitrate1080p30: 2_600_000,
    audioBitrate: 128_000,
    crf: 27,
  },
  {
    id: 'high',
    label: 'Cao (TikTok chuẩn)',
    shortDescription: 'CRF 22 · 6.0 Mbps chuẩn 1080p30 · Audio 192 kbps — sắc nét, cân bằng upload',
    baseBitrate1080p30: 6_000_000,
    audioBitrate: 192_000,
    crf: 22,
  },
  {
    id: 'ultra',
    label: 'Siêu nét (Tối đa)',
    shortDescription: 'CRF 18 · 11.0 Mbps chuẩn 1080p30 · Audio 256 kbps — độ chi tiết tối đa',
    baseBitrate1080p30: 11_000_000,
    audioBitrate: 256_000,
    crf: 18,
  },
];

export const FPS_OPTIONS: ExportFpsOption[] = [24, 30, 60];

function makeEven(n: number): number {
  const rounded = Math.max(2, Math.round(n));
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

export function resolveDimensionsForAspect(
  baseWidth: number,
  baseHeight: number,
  aspectRatio: ExportAspectRatioId = '9:16',
): { width: number; height: number } {
  const shortSide = Math.min(baseWidth, baseHeight);
  switch (aspectRatio) {
    case '16:9':
      return { width: makeEven(baseHeight), height: makeEven(baseWidth) };
    case '1:1':
      return { width: makeEven(shortSide), height: makeEven(shortSide) };
    case '4:5':
      return { width: makeEven(shortSide), height: makeEven((shortSide * 5) / 4) };
    case '9:16':
    default:
      return { width: makeEven(baseWidth), height: makeEven(baseHeight) };
  }
}

export function resolveMp4EncodingParams(settings: Mp4ExportSettings): ResolvedMp4Encoding {
  const res =
    RESOLUTION_OPTIONS.find((r) => r.id === settings.resolution) ?? RESOLUTION_OPTIONS[0];
  const qual =
    QUALITY_OPTIONS.find((q) => q.id === settings.quality) ?? QUALITY_OPTIONS[0];
  const fps: ExportFpsOption = FPS_OPTIONS.includes(settings.fps) ? settings.fps : 24;
  const aspectRatio: ExportAspectRatioId = settings.aspectRatio ?? '9:16';
  const { width, height } = resolveDimensionsForAspect(res.width, res.height, aspectRatio);

  const pixelRatio = (width * height) / (1080 * 1920);
  const fpsRatio = fps === 60 ? 1.45 : fps === 24 ? 0.85 : 1;
  const videoBitrate = Math.max(
    650_000,
    Math.round((qual.baseBitrate1080p30 * pixelRatio * fpsRatio) / 50_000) * 50_000,
  );

  return {
    width,
    height,
    aspectRatio,
    fps,
    videoBitrate,
    audioBitrate: qual.audioBitrate,
    crf: qual.crf,
    resolutionLabel: `${res.id} (${width}×${height})`,
    qualityLabel: qual.label,
  };
}

export interface EstimatedMp4FileSize {
  durationSec: number;
  bytes: number;
  minBytes: number;
  maxBytes: number;
  mbLabel: string;
  rangeLabel: string;
  encoding: ResolvedMp4Encoding;
  qualityDescription: string;
}

export function formatMegabytesLabel(bytes: number): string {
  const mb = Math.max(0, bytes) / (1024 * 1024);
  if (mb < 1) return `${(Math.max(0, bytes) / 1024).toFixed(0)} KB`;
  if (mb < 10) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb * 10) / 10} MB`;
}

export function estimateMp4FileSize(
  durationSec: number,
  settings: Mp4ExportSettings,
): EstimatedMp4FileSize {
  const safeDuration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  const encoding = resolveMp4EncodingParams(settings);
  const qual =
    QUALITY_OPTIONS.find((q) => q.id === settings.quality) ?? QUALITY_OPTIONS[0];
  const totalBps = encoding.videoBitrate + encoding.audioBitrate;
  const bytes =
    safeDuration > 0 ? Math.round((totalBps / 8) * safeDuration * 1.02) : 0;
  // Educational slides / static frames with CRF compression typically land ~0.72x–1.12x nominal bitrate
  const minBytes = Math.round(bytes * 0.72);
  const maxBytes = Math.round(bytes * 1.12);

  return {
    durationSec: safeDuration,
    bytes,
    minBytes,
    maxBytes,
    mbLabel: safeDuration > 0 ? `~${formatMegabytesLabel(bytes)}` : '—',
    rangeLabel:
      safeDuration > 0
        ? `${formatMegabytesLabel(minBytes)} – ${formatMegabytesLabel(maxBytes)}`
        : 'Chờ audio để ước lượng',
    encoding,
    qualityDescription: qual.shortDescription,
  };
}
