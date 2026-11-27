import {
  isQuoteExactSubstring,
  isStoryboardV19Document,
  isValidSceneIconName,
  normalizeQuoteForMatch,
  normalizeSceneIconWithAlias,
  quoteMatchesSegmentText,
  resolveSyncAnchorTiming,
  StoryboardSourceSegment,
  StoryboardV19Document,
  StoryboardV19Element,
} from './storyboardV19';
import { TranscriptCue } from './types';
import { isKnownIllustrationVariant } from './vectorComponentDb';

export type ValidationSeverity = 'error' | 'warning';

export interface StoryboardValidationIssue {
  code: string;
  severity: ValidationSeverity;
  message: string;
  sceneId?: string;
  elementId?: string;
  segmentId?: string;
}

export interface StoryboardValidationReport {
  valid: boolean;
  schemaVersion: '1.9' | 'legacy';
  errors: StoryboardValidationIssue[];
  warnings: StoryboardValidationIssue[];
  stats: {
    sourceSegmentCount: number;
    sceneCount: number;
    elementCount: number;
    syncAnchorCount: number;
    multiSceneOk: boolean;
    audioTailGapSec: number | null;
  };
}

interface LooseScenePlan {
  schema_version?: string;
  source_segments?: StoryboardSourceSegment[];
  scenes?: Array<{
    id?: string;
    scene_id?: string;
    title?: string;
    elements?: Array<Record<string, unknown>>;
    shapes?: Array<Record<string, unknown>>;
    texts?: Array<Record<string, unknown>>;
  }>;
}

function checkIconField(
  rawIcon: unknown,
  context: { sceneId?: string; elementId?: string },
  issues: StoryboardValidationIssue[],
) {
  if (typeof rawIcon !== 'string' || !rawIcon.trim()) return;
  const icon = rawIcon.trim();
  if (!isValidSceneIconName(icon)) {
    const alias = normalizeSceneIconWithAlias(icon);
    issues.push({
      code: 'INVALID_SCENE_ICON',
      severity: 'error',
      sceneId: context.sceneId,
      elementId: context.elementId,
      message: `sceneIcon "${icon}" không thuộc danh sách 42 icon hỗ trợ (gợi ý thay bằng "${alias.suggestedAlias ?? 'sparkles'}").`,
    });
  }
}

export function validateStoryboardDocument(
  plan: unknown,
  cues: TranscriptCue[] = [],
  options?: { audioDurationSec?: number | null },
): StoryboardValidationReport {
  const errors: StoryboardValidationIssue[] = [];
  const warnings: StoryboardValidationIssue[] = [];

  const pushIssue = (issue: StoryboardValidationIssue) => {
    if (issue.severity === 'error') errors.push(issue);
    else warnings.push(issue);
  };

  if (!plan || typeof plan !== 'object') {
    pushIssue({
      code: 'INVALID_JSON_OBJECT',
      severity: 'error',
      message: 'Dữ liệu Storyboard JSON không hợp lệ.',
    });
    return {
      valid: false,
      schemaVersion: 'legacy',
      errors,
      warnings,
      stats: {
        sourceSegmentCount: 0,
        sceneCount: 0,
        elementCount: 0,
        syncAnchorCount: 0,
        multiSceneOk: false,
        audioTailGapSec: null,
      },
    };
  }

  const loose = plan as LooseScenePlan;
  const isV19 = isStoryboardV19Document(plan);
  const scenes = Array.isArray(loose.scenes) ? loose.scenes : [];
  const audioDurationSec =
    typeof options?.audioDurationSec === 'number' && options.audioDurationSec > 0
      ? options.audioDurationSec
      : null;

  let elementCount = 0;
  let syncAnchorCount = 0;
  let audioTailGapSec: number | null = null;

  if (scenes.length === 0) {
    pushIssue({
      code: 'MISSING_SCENES',
      severity: 'error',
      message: 'Storyboard thiếu mảng "scenes" hoặc mảng "scenes" rỗng.',
    });
  }

  const sourceSegmentsMap = new Map<string, StoryboardSourceSegment>();
  const sourceSegments = Array.isArray(loose.source_segments) ? loose.source_segments : [];

  if (isV19) {
    if (sourceSegments.length === 0) {
      pushIssue({
        code: 'MISSING_SOURCE_SEGMENTS',
        severity: 'error',
        message: 'Storyboard v1.9 bắt buộc có "source_segments[]" giữ nguyên văn transcript & timestamp.',
      });
    } else {
      let prevEnd = -1;
      sourceSegments.forEach((seg, idx) => {
        const segId = seg?.segment_id?.trim() || '';
        if (!segId) {
          pushIssue({
            code: 'MISSING_SEGMENT_ID',
            severity: 'error',
            message: `source_segments[${idx}] thiếu "segment_id".`,
          });
        } else if (sourceSegmentsMap.has(segId)) {
          pushIssue({
            code: 'DUPLICATE_SEGMENT_ID',
            severity: 'error',
            segmentId: segId,
            message: `Trùng segment_id "${segId}" trong source_segments.`,
          });
        } else {
          sourceSegmentsMap.set(segId, seg);
        }

        const st = Number(seg?.start);
        const en = Number(seg?.end);
        if (!Number.isFinite(st) || !Number.isFinite(en) || st < 0 || en <= st) {
          pushIssue({
            code: 'INVALID_SEGMENT_TIMESTAMPS',
            severity: 'error',
            segmentId: segId || undefined,
            message: `Segment "${segId || idx + 1}" có mốc thời gian không hợp lệ (${seg?.start} → ${seg?.end}).`,
          });
        } else {
          if (prevEnd > 0 && st < prevEnd - 0.08) {
            pushIssue({
              code: 'OVERLAPPING_SOURCE_SEGMENTS',
              severity: 'warning',
              segmentId: segId || undefined,
              message: `Segment "${segId || idx + 1}" bắt đầu (${st.toFixed(2)}s) sớm hơn segment trước kết thúc (${prevEnd.toFixed(2)}s).`,
            });
          }
          prevEnd = Math.max(prevEnd, en);
        }

        if (typeof seg?.text !== 'string' || !seg.text.trim()) {
          pushIssue({
            code: 'EMPTY_SEGMENT_TEXT',
            severity: 'error',
            segmentId: segId || undefined,
            message: `Segment "${segId || idx + 1}" có nội dung "text" rỗng.`,
          });
        } else if (cues[idx]) {
          const expectedNorm = normalizeQuoteForMatch(cues[idx].text);
          const actualNorm = normalizeQuoteForMatch(seg.text);
          if (expectedNorm && actualNorm && expectedNorm !== actualNorm) {
            pushIssue({
              code: 'TRANSCRIPT_NOT_VERBATIM',
              severity: 'warning',
              segmentId: segId || undefined,
              message: `Segment "${segId || idx + 1}" đã bị sửa chữ/dấu câu so với transcript gốc ("${cues[idx].text}" → "${seg.text}").`,
            });
          }
        }
      });

      const lastEnd = sourceSegments.reduce((mx, s) => Math.max(mx, Number(s?.end) || 0), 0);
      if (audioDurationSec !== null && lastEnd > 0) {
        audioTailGapSec = Number((audioDurationSec - lastEnd).toFixed(3));
        if (lastEnd > audioDurationSec + 0.5) {
          const overshoot = lastEnd - audioDurationSec;
          const isModestOverhang = overshoot <= Math.max(5.0, audioDurationSec * 0.08);
          pushIssue({
            code: 'SEGMENT_EXCEEDS_AUDIO',
            severity: isModestOverhang ? 'warning' : 'error',
            message: isModestOverhang
              ? `Segment cuối (${lastEnd.toFixed(2)}s) vượt nhẹ thời lượng Audio (${audioDurationSec.toFixed(2)}s, lệch +${overshoot.toFixed(2)}s) — hệ thống sẽ tự co khớp về ${audioDurationSec.toFixed(2)}s khi dựng.`
              : `Segment cuối (${lastEnd.toFixed(2)}s) vượt quá tổng thời lượng Audio (${audioDurationSec.toFixed(2)}s).`,
          });
        } else if (audioTailGapSec > 0.8) {
          pushIssue({
            code: 'AUDIO_TAIL_GAP',
            severity: 'warning',
            message: `Audio dài ${audioDurationSec.toFixed(2)}s nhưng segment cuối dừng ở ${lastEnd.toFixed(2)}s (dư ${audioTailGapSec.toFixed(2)}s ở cuối).`,
          });
        }
      }
    }
  } else {
    pushIssue({
      code: 'LEGACY_SCHEMA_DETECTED',
      severity: 'warning',
      message: 'Đang dùng JSON định dạng cũ (chưa có source_segments & sync_anchor chuẩn Storyboard v1.9).',
    });
    if (audioDurationSec !== null && cues.length > 0) {
      const lastCueEnd = Math.max(...cues.map((c) => c.end));
      audioTailGapSec = Number((audioDurationSec - lastCueEnd).toFixed(3));
      if (audioTailGapSec > 0.8) {
        pushIssue({
          code: 'AUDIO_TAIL_GAP',
          severity: 'warning',
          message: `Audio dài ${audioDurationSec.toFixed(2)}s nhưng transcript dừng ở ${lastCueEnd.toFixed(2)}s (dư ${audioTailGapSec.toFixed(2)}s).`,
        });
      }
    }
  }

  const seenSceneIds = new Set<string>();
  const seenElementIds = new Set<string>();

  scenes.forEach((sc, scIdx) => {
    const sceneId = (sc.scene_id || sc.id || '').trim() || `scene_${scIdx + 1}`;
    if (seenSceneIds.has(sceneId)) {
      pushIssue({
        code: 'DUPLICATE_SCENE_ID',
        severity: 'error',
        sceneId,
        message: `Trùng scene_id "${sceneId}".`,
      });
    }
    seenSceneIds.add(sceneId);

    const elements = Array.isArray(sc.elements) ? sc.elements : [];
    const shapes = Array.isArray(sc.shapes) ? sc.shapes : [];
    const texts = Array.isArray(sc.texts) ? sc.texts : [];
    elementCount += elements.length + shapes.length + texts.filter((t) => t.shape_index === undefined).length;

    interface BoxTiming {
      id: string;
      kind: string;
      startTime: number;
      endTime: number;
      x: number;
      y: number;
      w: number;
      h: number;
    }
    const sceneBoxes: BoxTiming[] = [];

    elements.forEach((rawEl, elIdx) => {
      const el = rawEl as unknown as StoryboardV19Element & Record<string, unknown>;
      const elId =
        (typeof el.element_id === 'string' && el.element_id.trim()) ||
        `sc${scIdx + 1}_el${elIdx + 1}`;

      if (typeof el.element_id === 'string' && el.element_id.trim()) {
        if (seenElementIds.has(el.element_id.trim())) {
          pushIssue({
            code: 'DUPLICATE_ELEMENT_ID',
            severity: 'error',
            sceneId,
            elementId: elId,
            message: `Trùng element_id "${elId}".`,
          });
        }
        seenElementIds.add(el.element_id.trim());
      }

      // 1. Validate sync_anchor
      let resolvedTiming = { startTime: 0, endTime: 3 };
      if (isV19) {
        if (!el.sync_anchor || !el.sync_anchor.segment_id) {
          if (el.start === undefined && el.start_s === undefined) {
            pushIssue({
              code: 'MISSING_SYNC_ANCHOR',
              severity: 'warning',
              sceneId,
              elementId: elId,
              message: `Element "${elId}" thiếu sync_anchor.segment_id.`,
            });
          }
        } else {
          syncAnchorCount += 1;
          const seg = sourceSegmentsMap.get(el.sync_anchor.segment_id);
          if (!seg) {
            pushIssue({
              code: 'MISSING_SYNC_SEGMENT',
              severity: 'error',
              sceneId,
              elementId: elId,
              segmentId: el.sync_anchor.segment_id,
              message: `Element "${elId}" tham chiếu segment_id "${el.sync_anchor.segment_id}" không tồn tại trong source_segments.`,
            });
          } else {
            if (el.sync_anchor.quote && el.sync_anchor.quote.trim()) {
              if (!quoteMatchesSegmentText(el.sync_anchor.quote, seg.text)) {
                pushIssue({
                  code: 'SYNC_ANCHOR_QUOTE_MISMATCH',
                  severity: 'error',
                  sceneId,
                  elementId: elId,
                  segmentId: seg.segment_id,
                  message: `Quote "${el.sync_anchor.quote}" ở element "${elId}" không khớp với text của "${seg.segment_id}" ("${seg.text}").`,
                });
              } else if (!isQuoteExactSubstring(el.sync_anchor.quote, seg.text)) {
                pushIssue({
                  code: 'SYNC_ANCHOR_PUNCTUATION_DRIFT',
                  severity: 'warning',
                  sceneId,
                  elementId: elId,
                  segmentId: seg.segment_id,
                  message: `Quote "${el.sync_anchor.quote}" ở element "${elId}" bị sai khác dấu câu so với "${seg.segment_id}".`,
                });
              }
            }
            resolvedTiming = resolveSyncAnchorTiming(
              el.sync_anchor,
              seg,
              cues,
              seg.start,
              seg.end,
              el.animation?.duration_s,
            );
          }
        }
      }

      // 2. Validate sceneIcon & nested icons
      const iconIssues: StoryboardValidationIssue[] = [];
      checkIconField(el.sceneIcon, { sceneId, elementId: elId }, iconIssues);
      checkIconField(el.data?.sceneIcon, { sceneId, elementId: elId }, iconIssues);
      checkIconField(el.object_spec?.icon, { sceneId, elementId: elId }, iconIssues);
      const dynMotifs = el.dynamicScene?.motifs ?? el.data?.dynamicScene?.motifs ?? [];
      if (Array.isArray(dynMotifs)) {
        dynMotifs.forEach((m) => checkIconField(m?.icon, { sceneId, elementId: elId }, iconIssues));
      }
      const prims = el.customPrimitives ?? el.data?.customPrimitives ?? el.object_spec?.primitives ?? [];
      if (Array.isArray(prims)) {
        prims.forEach((p) => {
          if (p && p.shape === 'icon') {
            checkIconField(p.icon, { sceneId, elementId: elId }, iconIssues);
          }
        });
      }
      iconIssues.forEach(pushIssue);

      // 3. Validate illustration variant
      const kind = String(el.kind ?? el.type ?? '').toLowerCase();
      if (kind === 'illustration' || kind === 'asset') {
        const variant = typeof el.variant === 'string' ? el.variant.trim() : '';
        const hasCustomPrims = Array.isArray(prims) && prims.length > 0;
        if (
          variant &&
          variant !== 'custom-ui' &&
          variant !== 'custom-vector' &&
          !hasCustomPrims &&
          !isKnownIllustrationVariant(variant)
        ) {
          pushIssue({
            code: 'INVALID_VARIANT',
            severity: 'error',
            sceneId,
            elementId: elId,
            message: `Variant "${variant}" ở element "${elId}" không có trong Kho Component.`,
          });
        }
      }

      // 4. Validate normalized 0..1 position & Karaoke safe zone
      const pos = el.position;
      if (pos && typeof pos === 'object') {
        const px = Number(pos.x);
        const py = Number(pos.y);
        const pw = Number(pos.width);
        const ph = Number(pos.height);
        if (
          !Number.isFinite(px) ||
          !Number.isFinite(py) ||
          !Number.isFinite(pw) ||
          !Number.isFinite(ph) ||
          px < -0.005 ||
          py < -0.005 ||
          pw <= 0 ||
          ph <= 0 ||
          px + pw > 1.005 ||
          py + ph > 1.005
        ) {
          pushIssue({
            code: 'OUT_OF_CANVAS_BOUNDS',
            severity: 'error',
            sceneId,
            elementId: elId,
            message: `Position của "${elId}" vượt ngoài khung normalized 0..1 (x=${pos.x}, y=${pos.y}, w=${pos.width}, h=${pos.height}).`,
          });
        } else if (py + ph > 0.76 && kind !== 'karaoke' && kind !== 'karaoke-card') {
          pushIssue({
            code: 'KARAOKE_ZONE_VIOLATION',
            severity: 'error',
            sceneId,
            elementId: elId,
            message: `Element "${elId}" có đáy y+h=${(py + ph).toFixed(2)} đè vào vùng Karaoke (y ≥ 0.76).`,
          });
        }

        if (Number.isFinite(px) && Number.isFinite(py) && pw > 0 && ph > 0) {
          sceneBoxes.push({
            id: elId,
            kind,
            startTime: resolvedTiming.startTime,
            endTime: resolvedTiming.endTime,
            x: px,
            y: py,
            w: pw,
            h: ph,
          });
        }
      }
    });

    // 5. Same-scene spatial collision check for normalized boxes active at the same time
    for (let i = 0; i < sceneBoxes.length; i++) {
      for (let j = i + 1; j < sceneBoxes.length; j++) {
        const a = sceneBoxes[i];
        const b = sceneBoxes[j];
        if (a.kind === 'connector' || b.kind === 'connector') continue;
        const timeOverlap = Math.min(a.endTime, b.endTime) - Math.max(a.startTime, b.startTime);
        if (isV19 && timeOverlap <= 0.08) continue;

        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (overlapX > 0.015 && overlapY > 0.015) {
          pushIssue({
            code: 'ELEMENT_SPATIAL_OVERLAP',
            severity: 'error',
            sceneId,
            elementId: `${a.id} ↔ ${b.id}`,
            message: `Trong "${sceneId}", "${a.id}" và "${b.id}" bị chồng hình nhau (${(overlapX * 100).toFixed(0)}%×${(overlapY * 100).toFixed(0)}%).`,
          });
        }
      }
    }
  });

  const multiSceneOk =
    scenes.length > 1 || (cues.length <= 6 && elementCount <= 10);
  if (!multiSceneOk && scenes.length === 1) {
    pushIssue({
      code: 'SINGLE_SCENE_MONOLITH',
      severity: 'warning',
      sceneId: scenes[0]?.scene_id || scenes[0]?.id || 'sc1',
      message: `Toàn bộ ${cues.length || elementCount} phần tử đang dồn vào 1 scene duy nhất. Nên chia thành nhiều scene theo ý nghĩa sư phạm (Stage 2).`,
    });
  }

  return {
    valid: errors.length === 0,
    schemaVersion: isV19 ? '1.9' : 'legacy',
    errors,
    warnings,
    stats: {
      sourceSegmentCount: sourceSegments.length,
      sceneCount: scenes.length,
      elementCount,
      syncAnchorCount,
      multiSceneOk,
      audioTailGapSec,
    },
  };
}

export function isV19Document(doc: unknown): doc is StoryboardV19Document {
  return isStoryboardV19Document(doc);
}
