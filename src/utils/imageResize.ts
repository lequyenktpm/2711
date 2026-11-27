import { getStageDimensionsForAspect } from '../engine/canvasRenderer';
import { ExportAspectRatioId } from '../engine/mp4Config';
import { BackgroundFitMode, BackgroundImageConfig } from '../engine/types';

export interface ResizeImageToStageOptions {
  fit?: BackgroundFitMode;
  scrimOpacity?: number;
  aspectRatio?: ExportAspectRatioId;
  maxDimension?: number;
}

export async function resizeImageFileToStageDataUrl(
  file: File,
  options: ResizeImageToStageOptions = {},
): Promise<BackgroundImageConfig> {
  const fit = options.fit ?? 'cover';
  const scrimOpacity = typeof options.scrimOpacity === 'number' ? options.scrimOpacity : 0.22;
  const stageDims = getStageDimensionsForAspect(options.aspectRatio);
  const maxDim = options.maxDimension ?? Math.max(stageDims.width, stageDims.height, 1440);

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Không thể đọc file ảnh nền.'));
      image.src = objectUrl;
    });

    const srcW = img.naturalWidth || img.width || stageDims.width;
    const srcH = img.naturalHeight || img.height || stageDims.height;
    const scale = Math.min(1, maxDim / Math.max(srcW, srcH, 1));
    const targetW = Math.max(1, Math.round(srcW * scale));
    const targetH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Không khởi tạo được canvas để xử lý ảnh.');
    }
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const isPngLike =
      file.type === 'image/png' || /\.png$/i.test(file.name);
    const mime = isPngLike ? 'image/png' : 'image/jpeg';
    const dataUrl = canvas.toDataURL(mime, isPngLike ? undefined : 0.88);

    return {
      kind: 'image',
      dataUrl,
      fileName: file.name,
      fit,
      scrimOpacity,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
