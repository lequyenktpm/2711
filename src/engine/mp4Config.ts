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
  baseBitrate1080p30: number;
  audioBitrate: number;
  crf: number;
}> = [
  {
    id: 'standard',
    label: 'Thấp / Tiêu chuẩn (Nhẹ nhất)',
    baseBitrate1080p30: 2_600_000,
    audioBitrate: 128_000,
    crf: 27,
  },
  {
    id: 'high',
    label: 'Cao (TikTok chuẩn)',
    baseBitrate1080p30: 6_000_000,
    audioBitrate: 192_000,
    crf: 22,
  },
  {
    id: 'ultra',
    label: 'Siêu nét (Tối đa)',
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
