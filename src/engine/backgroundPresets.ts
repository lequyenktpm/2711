import type { BackgroundPresetId } from './types';

export interface BackgroundPresetMeta {
  id: BackgroundPresetId;
  name: string;
  shortDesc: string;
  previewGradient: string;
  isDark: boolean;
  assetUrl?: string;
}

export const BACKGROUND_PRESETS: BackgroundPresetMeta[] = [
  {
    id: 'ocean-shore-waves',
    name: 'Sóng Biển Xanh Êm Ả',
    shortDesc: 'Sóng biển ngọc bích vỗ bờ cát dịu nhẹ kèm bọt sóng chuyển động êm ái',
    previewGradient: 'linear-gradient(160deg, #94B0B7 0%, #2C7A7B 55%, #0F4C5C 100%)',
    isDark: false,
    assetUrl: '/src/assets/images/ocean_waves_shore_1795709883171.jpg',
  },
  {
    id: 'golden-sea-sunset',
    name: 'Hoàng Hôn Biển Lặng',
    shortDesc: 'Mặt biển êm ả phản chiếu ánh chiều vàng ấm & tím pastel thư giãn',
    previewGradient: 'linear-gradient(160deg, #C08497 0%, #F7AF9D 52%, #2B4162 100%)',
    isDark: true,
    assetUrl: '/src/assets/images/golden_sunset_sea_1795709884177.jpg',
  },
  {
    id: 'calm-mountain-lake',
    name: 'Hồ Núi Sương Mờ',
    shortDesc: 'Mặt hồ phẳng lặng phản chiếu rừng thông trong làn sương sớm yên bình',
    previewGradient: 'linear-gradient(160deg, #64748B 0%, #115E59 55%, #0F172A 100%)',
    isDark: true,
    assetUrl: '/src/assets/images/misty_mountain_lake_1795709884298.jpg',
  },
  {
    id: 'emerald-forest-stream',
    name: 'Suối Rừng Xanh Mát',
    shortDesc: 'Dòng suối trong vắt chảy qua đá rêu xanh dưới ánh nắng rừng nhẹ',
    previewGradient: 'linear-gradient(160deg, #14532D 0%, #15803D 52%, #052E16 100%)',
    isDark: true,
    assetUrl: '/src/assets/images/forest_waterfall_creek_1795709885336.jpg',
  },
  {
    id: 'cherry-blossom-breeze',
    name: 'Hoa Anh Đào Gió Nhẹ',
    shortDesc: 'Bầu trời hoàng hôn hồng dịu cùng cánh hoa anh đào bay chậm thư thái',
    previewGradient: 'linear-gradient(160deg, #3B1F3A 0%, #9D4EDD 48%, #F472B6 100%)',
    isDark: true,
  },
  {
    id: 'aurora-night-sky',
    name: 'Cực Quang Đêm Tĩnh',
    shortDesc: 'Bầu trời sao yên tĩnh cùng dải cực quang xanh ngọc uốn lượn mềm mại',
    previewGradient: 'linear-gradient(160deg, #020617 0%, #0F766E 50%, #312E81 100%)',
    isDark: true,
  },
  {
    id: 'cozy-rain-cafe',
    name: 'Quán Cà Phê Mưa Ấm',
    shortDesc: 'Cửa kính mưa rơi & ánh đèn vàng dịu (kiểu YouTube luyện nghe)',
    previewGradient: 'linear-gradient(160deg, #1E1B2E 0%, #3B2820 55%, #78350F 100%)',
    isDark: true,
  },
  {
    id: 'night-study-desk',
    name: 'Bàn Học Đèn Vàng Đêm',
    shortDesc: 'Không gian học tập ban đêm tĩnh lặng, hạt sáng nhẹ',
    previewGradient: 'linear-gradient(160deg, #0F172A 0%, #1E293B 55%, #312E81 100%)',
    isDark: true,
  },
  {
    id: 'midnight-city-lofi',
    name: 'Phố Đêm Lofi Mưa Nhẹ',
    shortDesc: 'Cửa sổ thành phố ban đêm với ánh đèn bokeh mờ ảo',
    previewGradient: 'linear-gradient(160deg, #090D16 0%, #172554 55%, #4C1D95 100%)',
    isDark: true,
  },
  {
    id: 'misty-forest-dusk',
    name: 'Rừng Sương Chiều Tĩnh',
    shortDesc: 'Đồi núi sương mờ xanh dịu giúp mắt thư giãn',
    previewGradient: 'linear-gradient(160deg, #0F292E 0%, #134E4A 52%, #1E3A3A 100%)',
    isDark: true,
  },
  {
    id: 'zen-botanical-room',
    name: 'Phòng Nắng & Bóng Lá',
    shortDesc: 'Ánh nắng chiều qua cửa sổ và bóng lá đung đưa nhẹ',
    previewGradient: 'linear-gradient(160deg, #27221E 0%, #44403C 50%, #3F6212 100%)',
    isDark: true,
  },
  {
    id: 'warm-sunset-paper',
    name: 'Hoàng Hôn Dịu Nhẹ',
    shortDesc: 'Ánh chiều tà ấm áp chuyển màu êm ái cho bài đọc dài',
    previewGradient: 'linear-gradient(160deg, #2E1065 0%, #7C2D12 55%, #B45309 100%)',
    isDark: true,
  },
];

export function getBackgroundPresetMeta(presetId: string | undefined): BackgroundPresetMeta | undefined {
  if (!presetId) return undefined;
  return BACKGROUND_PRESETS.find((p) => p.id === presetId);
}

function seededNoise(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Deterministic animated canvas backdrop inspired by calm YouTube language-study & nature ambience videos.
 * Renders identically in real-time preview and offline frame-by-frame MP4 export.
 * When `options.overlayOnly` is true, draws subtle animated atmospheric motion over a pre-rendered scenic photo.
 */
export function drawPresetBackground(
  ctx: CanvasRenderingContext2D,
  presetId: BackgroundPresetId | string,
  width: number,
  height: number,
  timeSec = 0,
  options?: { overlayOnly?: boolean },
): void {
  const t = Number.isFinite(timeSec) ? timeSec : 0;
  const overlayOnly = Boolean(options?.overlayOnly);
  ctx.save();

  switch (presetId) {
    case 'ocean-shore-waves': {
      if (!overlayOnly) {
        const skyGrad = ctx.createLinearGradient(0, 0, 0, height * 0.48);
        skyGrad.addColorStop(0, '#9FB8BE');
        skyGrad.addColorStop(1, '#CBD9DC');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, width, height * 0.48);

        const seaGrad = ctx.createLinearGradient(0, height * 0.46, 0, height);
        seaGrad.addColorStop(0, '#16697A');
        seaGrad.addColorStop(0.5, '#2A9D8F');
        seaGrad.addColorStop(0.84, '#56B3A8');
        seaGrad.addColorStop(1, '#8D998F');
        ctx.fillStyle = seaGrad;
        ctx.fillRect(0, height * 0.46, width, height * 0.54);

        // Distant coastal headland silhouette
        ctx.fillStyle = 'rgba(42, 62, 68, 0.72)';
        ctx.beginPath();
        ctx.moveTo(width * 0.76, height * 0.465);
        ctx.lineTo(width * 0.85, height * 0.415);
        ctx.lineTo(width * 0.94, height * 0.39);
        ctx.lineTo(width, height * 0.38);
        ctx.lineTo(width, height * 0.465);
        ctx.closePath();
        ctx.fill();
      }

      // Rolling gentle seafoam wave crests & water shimmer
      const waveCount = 5;
      for (let w = 0; w < waveCount; w++) {
        const cycle = (t * 0.14 + w * 0.21) % 1;
        const wy = height * (0.49 + cycle * 0.46);
        const alpha = Math.sin(cycle * Math.PI) * (overlayOnly ? 0.2 : 0.48);
        ctx.strokeStyle = `rgba(240, 253, 250, ${alpha.toFixed(3)})`;
        ctx.lineWidth = Math.max(2, height * (0.004 + cycle * 0.005));
        ctx.beginPath();
        for (let x = 0; x <= width; x += Math.max(20, width / 26)) {
          const ripple = Math.sin(x * 0.011 + t * 1.1 + w * 2.1) * (4 + cycle * 6);
          if (x === 0) ctx.moveTo(x, wy + ripple);
          else ctx.lineTo(x, wy + ripple);
        }
        ctx.stroke();
      }

      // Soft sunlight glint particles on water surface
      for (let i = 0; i < 18; i++) {
        const sx = seededNoise(i + 601) * width;
        const sy = height * (0.5 + seededNoise(i + 651) * 0.36);
        const twinkle = 0.06 + 0.14 * Math.max(0, Math.sin(t * 1.4 + i * 1.7));
        ctx.fillStyle = `rgba(255, 255, 255, ${twinkle.toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(sx, sy, 8 + seededNoise(i + 701) * 14, 1.8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'golden-sea-sunset': {
      if (!overlayOnly) {
        const sky = ctx.createLinearGradient(0, 0, 0, height * 0.52);
        sky.addColorStop(0, '#3D3B56');
        sky.addColorStop(0.52, '#C98A8B');
        sky.addColorStop(1, '#F6BD92');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, width, height * 0.52);

        const sea = ctx.createLinearGradient(0, height * 0.5, 0, height);
        sea.addColorStop(0, '#8E6E78');
        sea.addColorStop(0.5, '#4A5568');
        sea.addColorStop(1, '#1E293B');
        ctx.fillStyle = sea;
        ctx.fillRect(0, height * 0.5, width, height * 0.5);
      }

      // Warm golden reflection shimmer on horizon & water
      const sunX = width * 0.62 + Math.sin(t * 0.15) * 18;
      const sunGlow = ctx.createRadialGradient(
        sunX,
        height * 0.48,
        12,
        sunX,
        height * 0.52,
        Math.max(width, height) * 0.45,
      );
      sunGlow.addColorStop(0, overlayOnly ? 'rgba(254, 215, 170, 0.16)' : 'rgba(254, 215, 170, 0.36)');
      sunGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sunGlow;
      ctx.fillRect(0, 0, width, height);

      for (let i = 0; i < 16; i++) {
        const rx = sunX + (seededNoise(i + 721) - 0.5) * width * 0.45;
        const ry = height * (0.53 + seededNoise(i + 741) * 0.4);
        const pulse = 0.08 + 0.16 * Math.max(0, Math.sin(t * 1.2 + i * 1.4));
        ctx.fillStyle = `rgba(253, 224, 171, ${pulse.toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(rx, ry, 14 + seededNoise(i + 761) * 24, 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'calm-mountain-lake': {
      if (!overlayOnly) {
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, '#94A3B8');
        grad.addColorStop(0.45, '#CBD5E1');
        grad.addColorStop(0.5, '#134E4A');
        grad.addColorStop(1, '#0F292E');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#0F2D27';
        ctx.beginPath();
        ctx.moveTo(0, height * 0.5);
        for (let x = 0; x <= width; x += Math.max(20, width / 20)) {
          const ridge = Math.sin(x * 0.008) * height * 0.06 + Math.cos(x * 0.02) * height * 0.02;
          ctx.lineTo(x, height * 0.38 + ridge);
        }
        ctx.lineTo(width, height * 0.5);
        ctx.closePath();
        ctx.fill();
      }

      // Slow drifting morning mist ribbons across mountain & water surface
      for (let m = 0; m < 4; m++) {
        const mx = ((width * (0.2 + m * 0.25) + t * (12 + m * 4)) % (width * 1.3)) - width * 0.15;
        const my = height * (0.36 + m * 0.11);
        const mist = ctx.createRadialGradient(mx, my, 10, mx, my, width * 0.34);
        mist.addColorStop(0, overlayOnly ? 'rgba(241, 245, 249, 0.12)' : 'rgba(241, 245, 249, 0.26)');
        mist.addColorStop(1, 'rgba(241, 245, 249, 0)');
        ctx.fillStyle = mist;
        ctx.fillRect(0, 0, width, height);
      }
      break;
    }

    case 'emerald-forest-stream': {
      if (!overlayOnly) {
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, '#14532D');
        grad.addColorStop(0.5, '#166534');
        grad.addColorStop(1, '#052E16');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      }

      // Gentle forest sunbeams & firefly sparkles
      const beam = ctx.createLinearGradient(width * 0.35, 0, width * 0.75, height * 0.75);
      beam.addColorStop(0, overlayOnly ? 'rgba(220, 252, 231, 0.10)' : 'rgba(220, 252, 231, 0.22)');
      beam.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = beam;
      ctx.fillRect(0, 0, width, height);

      for (let i = 0; i < 20; i++) {
        const px = (seededNoise(i + 801) * width + Math.sin(t * 0.5 + i) * 26 + width) % width;
        const py = ((seededNoise(i + 841) * height - t * (10 + seededNoise(i + 881) * 12)) % height + height) % height;
        const glow = 0.12 + 0.18 * Math.max(0, Math.sin(t * 1.5 + i));
        ctx.fillStyle = `rgba(217, 249, 157, ${glow.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, 2 + seededNoise(i + 901) * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'cherry-blossom-breeze': {
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, '#2B1633');
      grad.addColorStop(0.5, '#6B2D5C');
      grad.addColorStop(1, '#BE5A83');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      const glow = ctx.createRadialGradient(width * 0.72, height * 0.24, 10, width * 0.72, height * 0.24, Math.max(width, height) * 0.55);
      glow.addColorStop(0, 'rgba(251, 207, 232, 0.28)');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      // Gentle falling sakura petals
      for (let i = 0; i < 24; i++) {
        const px = ((seededNoise(i + 921) * width + t * (22 + seededNoise(i + 941) * 18) + Math.sin(t + i) * 24) % width + width) % width;
        const py = ((seededNoise(i + 961) * height + t * (34 + seededNoise(i + 981) * 26)) % (height + 40)) - 20;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(t * 0.8 + i);
        ctx.fillStyle = i % 2 === 0 ? 'rgba(251, 207, 232, 0.72)' : 'rgba(249, 168, 212, 0.62)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 6 + seededNoise(i + 991) * 4, 3.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      break;
    }

    case 'aurora-night-sky': {
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, '#020617');
      grad.addColorStop(0.55, '#0B1736');
      grad.addColorStop(1, '#071D26');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Flowing aurora curtains
      for (let a = 0; a < 3; a++) {
        ctx.fillStyle =
          a === 0
            ? 'rgba(45, 212, 191, 0.14)'
            : a === 1
              ? 'rgba(56, 189, 248, 0.12)'
              : 'rgba(167, 139, 250, 0.10)';
        ctx.beginPath();
        ctx.moveTo(0, height * 0.42);
        for (let x = 0; x <= width; x += Math.max(24, width / 22)) {
          const yOff =
            Math.sin(x * 0.005 + t * (0.28 + a * 0.08) + a * 1.7) * (height * 0.09) +
            Math.cos(x * 0.009 - t * 0.2) * (height * 0.04);
          ctx.lineTo(x, height * (0.26 + a * 0.07) + yOff);
        }
        ctx.lineTo(width, height * 0.62);
        ctx.lineTo(0, height * 0.62);
        ctx.closePath();
        ctx.fill();
      }

      // Soft twinkling stars
      for (let i = 0; i < 36; i++) {
        const sx = seededNoise(i + 1011) * width;
        const sy = seededNoise(i + 1051) * height * 0.65;
        const alpha = 0.25 + 0.55 * Math.max(0, Math.sin(t * 1.4 + i * 2.1));
        ctx.fillStyle = `rgba(248, 250, 252, ${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 1 + seededNoise(i + 1091) * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'cozy-rain-cafe': {
      const grad = ctx.createLinearGradient(0, 0, width * 0.35, height);
      grad.addColorStop(0, '#13111C');
      grad.addColorStop(0.55, '#271C19');
      grad.addColorStop(1, '#3D2618');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      const orbs = [
        { x: 0.22, y: 0.28, r: 0.24, c: 'rgba(245, 158, 11, 0.16)', sp: 0.35 },
        { x: 0.78, y: 0.38, r: 0.28, c: 'rgba(251, 146, 60, 0.14)', sp: -0.25 },
        { x: 0.5, y: 0.72, r: 0.32, c: 'rgba(217, 119, 6, 0.12)', sp: 0.2 },
      ];
      const minDim = Math.min(width, height);
      for (const orb of orbs) {
        const ox = width * orb.x + Math.sin(t * orb.sp) * 28;
        const oy = height * orb.y + Math.cos(t * orb.sp * 0.8) * 18;
        const g = ctx.createRadialGradient(ox, oy, 10, ox, oy, minDim * orb.r);
        g.addColorStop(0, orb.c);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
      }

      ctx.strokeStyle = 'rgba(226, 232, 240, 0.16)';
      ctx.lineWidth = Math.max(1.2, width * 0.0014);
      for (let i = 0; i < 42; i++) {
        const rx = seededNoise(i + 1) * width;
        const speed = 220 + seededNoise(i + 50) * 180;
        const ry = ((seededNoise(i + 100) * height + t * speed) % (height + 120)) - 60;
        const len = 18 + seededNoise(i + 150) * 28;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - len * 0.16, ry + len);
        ctx.stroke();
      }
      break;
    }

    case 'night-study-desk': {
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, '#0B1120');
      grad.addColorStop(0.55, '#172033');
      grad.addColorStop(1, '#1E1B4B');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      const lampX = width * 0.5 + Math.sin(t * 0.3) * 18;
      const lampY = height * 0.16;
      const cone = ctx.createRadialGradient(lampX, lampY, 20, width * 0.5, height * 0.52, Math.max(width, height) * 0.72);
      cone.addColorStop(0, 'rgba(253, 224, 71, 0.18)');
      cone.addColorStop(0.45, 'rgba(99, 102, 241, 0.10)');
      cone.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = cone;
      ctx.fillRect(0, 0, width, height);

      for (let i = 0; i < 28; i++) {
        const dx = (seededNoise(i + 201) * width + Math.sin(t * 0.4 + i) * 35 + width) % width;
        const dy = ((seededNoise(i + 301) * height - t * (12 + seededNoise(i + 401) * 14)) % height + height) % height;
        const r = 1.5 + seededNoise(i + 501) * 3.2;
        ctx.fillStyle = `rgba(253, 230, 138, ${(0.14 + 0.14 * Math.sin(t + i)).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(dx, dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'midnight-city-lofi': {
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, '#070B19');
      grad.addColorStop(0.55, '#141E46');
      grad.addColorStop(1, '#2B184B');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = 'rgba(10, 15, 32, 0.72)';
      const bCount = 14;
      const bw = width / bCount;
      for (let i = 0; i < bCount; i++) {
        const bh = height * (0.14 + seededNoise(i + 12) * 0.22);
        ctx.fillRect(i * bw - 2, height - bh, bw + 4, bh);
      }

      const minD = Math.min(width, height);
      for (let i = 0; i < 18; i++) {
        const bx = seededNoise(i + 71) * width;
        const by = height * (0.38 + seededNoise(i + 81) * 0.52);
        const br = minD * (0.04 + seededNoise(i + 91) * 0.08);
        const pulse = 0.65 + 0.35 * Math.sin(t * 0.8 + i * 1.3);
        const color = i % 3 === 0 ? `rgba(251, 191, 36, ${(0.14 * pulse).toFixed(3)})` : i % 3 === 1 ? `rgba(56, 189, 248, ${(0.13 * pulse).toFixed(3)})` : `rgba(192, 132, 252, ${(0.12 * pulse).toFixed(3)})`;
        const g = ctx.createRadialGradient(bx, by, 2, bx, by, br);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(bx - br, by - br, br * 2, br * 2);
      }
      break;
    }

    case 'misty-forest-dusk': {
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, '#0B2027');
      grad.addColorStop(0.5, '#133B3F');
      grad.addColorStop(1, '#1B4332');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      const beam = ctx.createRadialGradient(width * 0.25, height * 0.14, 15, width * 0.45, height * 0.45, Math.max(width, height) * 0.8);
      beam.addColorStop(0, 'rgba(167, 243, 208, 0.20)');
      beam.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = beam;
      ctx.fillRect(0, 0, width, height);

      const ridgeColors = ['rgba(15, 42, 46, 0.55)', 'rgba(17, 56, 52, 0.68)', 'rgba(11, 37, 34, 0.82)'];
      ridgeColors.forEach((rc, rIdx) => {
        ctx.fillStyle = rc;
        ctx.beginPath();
        const baseY = height * (0.58 + rIdx * 0.12);
        ctx.moveTo(0, height);
        for (let x = 0; x <= width; x += Math.max(24, width / 24)) {
          const wave = Math.sin(x * 0.004 + rIdx * 1.9 + t * 0.08 * (rIdx + 1)) * (height * 0.035);
          ctx.lineTo(x, baseY + wave);
        }
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fill();
      });
      break;
    }

    case 'zen-botanical-room': {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#1F2421');
      grad.addColorStop(0.55, '#2C3639');
      grad.addColorStop(1, '#3F4E4F');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.translate(width * 0.5, height * 0.4);
      ctx.rotate(-0.22);
      for (let s = -2; s <= 2; s++) {
        const sy = s * height * 0.16 + Math.sin(t * 0.35 + s) * 8;
        ctx.fillStyle = 'rgba(254, 243, 199, 0.065)';
        ctx.fillRect(-width, sy, width * 2, height * 0.085);
      }
      ctx.restore();

      ctx.fillStyle = 'rgba(15, 28, 22, 0.45)';
      for (let i = 0; i < 6; i++) {
        const sway = Math.sin(t * 0.6 + i * 0.9) * 14;
        ctx.beginPath();
        ctx.ellipse(width * (0.08 + i * 0.04) + sway, height * (0.18 + i * 0.06), width * 0.14, height * 0.035, 0.4 + i * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'warm-sunset-paper':
    default: {
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, '#1E1B4B');
      grad.addColorStop(0.42, '#6D28D9');
      grad.addColorStop(0.76, '#C2410C');
      grad.addColorStop(1, '#F59E0B');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      const sunX = width * 0.5;
      const sunY = height * 0.66 + Math.sin(t * 0.25) * 12;
      const halo = ctx.createRadialGradient(sunX, sunY, 20, sunX, sunY, Math.max(width, height) * 0.55);
      halo.addColorStop(0, 'rgba(254, 240, 138, 0.36)');
      halo.addColorStop(0.5, 'rgba(251, 146, 60, 0.18)');
      halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, width, height);
      break;
    }
  }

  ctx.restore();
}
