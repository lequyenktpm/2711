import {
  CustomComponentDatabasePayload,
  CustomComponentDefinition,
  VectorCategory,
  VectorPrimitive,
} from './customComponentTypes';
import { IllustrationSceneIcon } from './types';

const STORAGE_KEY = 'kineticsub_custom_vector_components_v1';

let runtimeCustomComponents: CustomComponentDefinition[] = [];
let runtimeDeletedBuiltIns: Set<string> = new Set();
const listeners = new Set<() => void>();

const VALID_SHAPES = new Set<VectorPrimitive['shape']>([
  'rect',
  'pill',
  'circle',
  'ellipse',
  'line',
  'arc',
  'polygon',
  'text',
  'arrow',
  'icon',
]);

const VALID_CATEGORIES = new Set<VectorCategory>([
  'life',
  'grammar',
  'vocab',
  'pronunciation',
  'dialogue',
]);

export function sanitizeVariantSlug(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return slug || `custom-scene-${Date.now().toString(36)}`;
}

export function normalizeCustomComponent(raw: unknown): CustomComponentDefinition | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const variant = sanitizeVariantSlug(String(obj.variant ?? obj.id ?? obj.name ?? ''));
  const label = String(obj.label ?? variant).trim() || variant;
  const category = VALID_CATEGORIES.has(obj.category as VectorCategory)
    ? (obj.category as VectorCategory)
    : 'life';
  const description = String(obj.description ?? label).trim();
  const rawKeywords = Array.isArray(obj.keywords)
    ? obj.keywords
    : typeof obj.keywords === 'string'
      ? obj.keywords.split(/[,;\n]/)
      : [];
  const keywords = rawKeywords
    .map((k) => String(k).trim())
    .filter(Boolean)
    .slice(0, 30);

  const defaultIcon = (typeof obj.defaultIcon === 'string' && obj.defaultIcon.trim()
    ? obj.defaultIcon.trim()
    : 'sparkles') as IllustrationSceneIcon;

  const rawPrimitives = Array.isArray(obj.primitives) ? obj.primitives : [];
  const primitives: VectorPrimitive[] = [];
  for (const p of rawPrimitives) {
    if (!p || typeof p !== 'object') continue;
    const pr = p as Record<string, unknown>;
    const shape = String(pr.shape ?? '').trim() as VectorPrimitive['shape'];
    if (!VALID_SHAPES.has(shape)) continue;
    primitives.push({
      shape,
      x: typeof pr.x === 'number' && Number.isFinite(pr.x) ? pr.x : 0,
      y: typeof pr.y === 'number' && Number.isFinite(pr.y) ? pr.y : 0,
      w: typeof pr.w === 'number' && Number.isFinite(pr.w) ? pr.w : undefined,
      h: typeof pr.h === 'number' && Number.isFinite(pr.h) ? pr.h : undefined,
      r: typeof pr.r === 'number' && Number.isFinite(pr.r) ? pr.r : undefined,
      rx: typeof pr.rx === 'number' && Number.isFinite(pr.rx) ? pr.rx : undefined,
      ry: typeof pr.ry === 'number' && Number.isFinite(pr.ry) ? pr.ry : undefined,
      x2: typeof pr.x2 === 'number' && Number.isFinite(pr.x2) ? pr.x2 : undefined,
      y2: typeof pr.y2 === 'number' && Number.isFinite(pr.y2) ? pr.y2 : undefined,
      points: Array.isArray(pr.points)
        ? pr.points
            .filter((pt) => Array.isArray(pt) && pt.length >= 2)
            .map((pt) => [Number(pt[0]) || 0, Number(pt[1]) || 0] as [number, number])
        : undefined,
      fill: typeof pr.fill === 'string' ? pr.fill : undefined,
      stroke: typeof pr.stroke === 'string' ? pr.stroke : undefined,
      lineWidth: typeof pr.lineWidth === 'number' ? pr.lineWidth : undefined,
      radius: typeof pr.radius === 'number' ? pr.radius : undefined,
      startAngle: typeof pr.startAngle === 'number' ? pr.startAngle : undefined,
      endAngle: typeof pr.endAngle === 'number' ? pr.endAngle : undefined,
      text: typeof pr.text === 'string' ? pr.text : undefined,
      fontSize: typeof pr.fontSize === 'number' ? pr.fontSize : undefined,
      fontWeight:
        typeof pr.fontWeight === 'number' || typeof pr.fontWeight === 'string'
          ? pr.fontWeight
          : undefined,
      align:
        pr.align === 'left' || pr.align === 'center' || pr.align === 'right'
          ? pr.align
          : undefined,
      icon: typeof pr.icon === 'string' ? (pr.icon as IllustrationSceneIcon) : undefined,
      opacity: typeof pr.opacity === 'number' ? pr.opacity : undefined,
      shadow: Boolean(pr.shadow),
    });
  }

  return {
    variant,
    label,
    category,
    description,
    keywords,
    defaultIcon,
    primitives,
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : new Date().toISOString(),
    isBuiltInOverride: Boolean(obj.isBuiltInOverride),
  };
}

export function getCustomComponentsSnapshot(): CustomComponentDefinition[] {
  return [...runtimeCustomComponents];
}

export function getDeletedBuiltInsSnapshot(): string[] {
  return Array.from(runtimeDeletedBuiltIns);
}

export function getCustomComponentByVariant(
  variant: string,
): CustomComponentDefinition | undefined {
  return runtimeCustomComponents.find((c) => c.variant === variant);
}

export function isBuiltInVariantDeleted(variant: string): boolean {
  return runtimeDeletedBuiltIns.has(variant);
}

export function subscribeCustomComponents(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notifyListeners() {
  for (const cb of listeners) cb();
}

export function setCustomComponentDatabaseState(
  payload: CustomComponentDatabasePayload,
  options?: { persistLocal?: boolean },
): void {
  const normalized: CustomComponentDefinition[] = [];
  const seen = new Set<string>();
  for (const item of payload.components || []) {
    const clean = normalizeCustomComponent(item);
    if (clean && !seen.has(clean.variant)) {
      seen.add(clean.variant);
      normalized.push(clean);
    }
  }
  runtimeCustomComponents = normalized;
  runtimeDeletedBuiltIns = new Set((payload.deletedBuiltIns || []).map(String));

  if (options?.persistLocal !== false && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          components: runtimeCustomComponents,
          deletedBuiltIns: Array.from(runtimeDeletedBuiltIns),
        }),
      );
    } catch {
      // ignore quota errors
    }
  }
  notifyListeners();
}

export function loadCustomComponentsFromLocalStorage(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<CustomComponentDatabasePayload>;
    setCustomComponentDatabaseState(
      {
        components: Array.isArray(parsed.components) ? parsed.components : [],
        deletedBuiltIns: Array.isArray(parsed.deletedBuiltIns) ? parsed.deletedBuiltIns : [],
      },
      { persistLocal: false },
    );
  } catch {
    // ignore malformed local storage
  }
}

export async function syncCustomComponentsFromServer(): Promise<CustomComponentDatabasePayload> {
  loadCustomComponentsFromLocalStorage();
  try {
    const res = await fetch('/api/components');
    if (res.ok) {
      const data = (await res.json()) as Partial<CustomComponentDatabasePayload>;
      const serverPayload: CustomComponentDatabasePayload = {
        components: Array.isArray(data.components) ? data.components : [],
        deletedBuiltIns: Array.isArray(data.deletedBuiltIns) ? data.deletedBuiltIns : [],
      };
      // If server is empty but localStorage has data, push local to server
      if (
        serverPayload.components.length === 0 &&
        serverPayload.deletedBuiltIns.length === 0 &&
        (runtimeCustomComponents.length > 0 || runtimeDeletedBuiltIns.size > 0)
      ) {
        await persistDatabaseToServer({
          components: runtimeCustomComponents,
          deletedBuiltIns: Array.from(runtimeDeletedBuiltIns),
        });
      } else {
        setCustomComponentDatabaseState(serverPayload);
      }
      return serverPayload;
    }
  } catch {
    // Offline/test environment fallback
  }
  return {
    components: [...runtimeCustomComponents],
    deletedBuiltIns: Array.from(runtimeDeletedBuiltIns),
  };
}

async function persistDatabaseToServer(payload: CustomComponentDatabasePayload): Promise<void> {
  if (typeof fetch === 'undefined') return;
  try {
    await fetch('/api/components', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // non-fatal; localStorage still saved
  }
}

export async function upsertCustomComponent(
  component: CustomComponentDefinition,
): Promise<CustomComponentDefinition> {
  const clean = normalizeCustomComponent(component);
  if (!clean) {
    throw new Error('Dữ liệu component không hợp lệ.');
  }
  clean.updatedAt = new Date().toISOString();

  const next = runtimeCustomComponents.filter((c) => c.variant !== clean.variant);
  next.unshift(clean);

  // If resurrecting a deleted built-in variant via override
  const nextDeleted = new Set(runtimeDeletedBuiltIns);
  nextDeleted.delete(clean.variant);

  const payload: CustomComponentDatabasePayload = {
    components: next,
    deletedBuiltIns: Array.from(nextDeleted),
  };
  setCustomComponentDatabaseState(payload);
  await persistDatabaseToServer(payload);
  return clean;
}

export async function deleteComponentVariant(
  variant: string,
  isBuiltIn: boolean,
): Promise<void> {
  const nextComponents = runtimeCustomComponents.filter((c) => c.variant !== variant);
  const nextDeleted = new Set(runtimeDeletedBuiltIns);
  if (isBuiltIn) {
    nextDeleted.add(variant);
  }
  const payload: CustomComponentDatabasePayload = {
    components: nextComponents,
    deletedBuiltIns: Array.from(nextDeleted),
  };
  setCustomComponentDatabaseState(payload);
  await persistDatabaseToServer(payload);
}

export async function restoreBuiltInComponent(variant: string): Promise<void> {
  const nextComponents = runtimeCustomComponents.filter((c) => c.variant !== variant);
  const nextDeleted = new Set(runtimeDeletedBuiltIns);
  nextDeleted.delete(variant);
  const payload: CustomComponentDatabasePayload = {
    components: nextComponents,
    deletedBuiltIns: Array.from(nextDeleted),
  };
  setCustomComponentDatabaseState(payload);
  await persistDatabaseToServer(payload);
}

export function parseVectorComponentAiJson(rawText: string): CustomComponentDefinition[] {
  let text = rawText.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    text = fence[1].trim();
  }
  const firstObj = text.indexOf('{');
  const firstArr = text.indexOf('[');
  if (firstArr !== -1 && (firstObj === -1 || firstArr < firstObj)) {
    const lastArr = text.lastIndexOf(']');
    if (lastArr > firstArr) text = text.slice(firstArr, lastArr + 1);
  } else if (firstObj !== -1) {
    const lastObj = text.lastIndexOf('}');
    if (lastObj > firstObj) text = text.slice(firstObj, lastObj + 1);
  }
  text = text.replace(/,\s*([}\]])/g, '$1');

  const parsed = JSON.parse(text);
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.components)
      ? parsed.components
      : [parsed];

  const out: CustomComponentDefinition[] = [];
  for (const item of list) {
    const normalized = normalizeCustomComponent(item);
    if (normalized && normalized.primitives.length > 0) {
      out.push(normalized);
    }
  }
  return out;
}

export function buildVectorComponentAiPrompt(
  conceptIdea: string,
  options?: {
    category?: VectorCategory;
    availableIcons?: string[];
    baseVariant?: string;
    baseLabel?: string;
    baseDescription?: string;
  },
): string {
  const iconsList =
    options?.availableIcons?.join(', ') ||
    'tv, eye, watch, listen, walk, phone, airplane, luggage, menu, cup, shopping-bag, price-tag, stethoscope, sun, rain, umbrella, snowflake, book, pencil, graduation, laptop, calendar, briefcase, clock, car, bus, home, dumbbell, music, mic, camera, heart, sparkles, brain, lightning, scale, gift, wallet, map-pin, globe, handshake, chat';

  const baseSection = options?.baseVariant
    ? [
        '',
        '# COMPONENT NỀN TẢNG CẦN TÙY BIẾN / NÂNG CẤP TỪ KHO CÓ SẴN',
        `- Dựa trên mẫu có sẵn: \`${options.baseVariant}\`${options.baseLabel ? ` (${options.baseLabel})` : ''}${options.baseDescription ? ` — ${options.baseDescription}` : ''}`,
        `- Hãy giữ tinh thần bố cục đẹp (Bootstrap 5 / Modern CSS / Thẻ học @englishpracticing168) của mẫu "${options.baseVariant}" nhưng tùy biến màu sắc, bố cục, icon và chữ tiếng Anh bên trong cho khớp đúng ý tưởng mới (và đặt mã \`"variant"\` mới dạng \`custom-...\`, KHÔNG ghi đè trùng tên trừ khi muốn sửa trực tiếp mẫu gốc).`,
      ].join('\n')
    : '';

  return `# VAI TRÒ
Bạn là Chuyên gia thiết kế UI & Minh họa Vector 2D theo phong cách Bootstrap 5 / Modern CSS & thẻ học tiếng Anh hiện đại @englishpracticing168 (màu pastel/tươi sáng, khối bo tròn rõ nét, biểu tượng trực quan, dễ đọc trên video dọc 9:16).

# NHIỆM VỤ
Hãy vẽ component minh họa vector cho ý tưởng: **"${conceptIdea.trim()}"**
(Nhóm gợi ý: \`${options?.category || 'life'}\`)${baseSection}

Trả về **DUY NHẤT 1 KHỐI JSON HỢP LỆ** (không viết thêm giải thích ngoài JSON) đúng schema dưới đây để KineticSub Studio nạp trực tiếp vào Kho Component & tự động dùng cho mọi video mới.

# HỆ TOẠ ĐỘ CANVAS CỦA COMPONENT
- Tâm component là \`(0, 0)\`.
- Vùng vẽ an toàn: chiều ngang \`x\` từ \`-380\` đến \`380\` (rộng tối đa ~760px), chiều dọc \`y\` từ \`-155\` đến \`155\` (cao tối đa ~310px).
- Đối với \`rect\` / \`pill\`: \`x, y\` là **toạ độ góc trên-trái**, \`w, h\` là chiều rộng và cao.
- Đối với \`circle\` / \`ellipse\` / \`text\` / \`icon\`: \`x, y\` là **toạ độ tâm**.
- Đối với \`line\` / \`arrow\`: \`x, y\` là điểm đầu, \`x2, y2\` là điểm cuối.
- Đối với \`polygon\`: \`points\` là mảng \`[[x1, y1], [x2, y2], ...]\`.

# CÁC LOẠI HÌNH VẼ (\`shape\`) ĐƯỢC HỖ TRỢ
1. \`"rect"\`: \`{ "shape": "rect", "x": -340, "y": -130, "w": 680, "h": 260, "radius": 28, "fill": "#FFFFFF", "stroke": "#E2E8F0", "lineWidth": 3, "shadow": true }\`
2. \`"pill"\`: \`{ "shape": "pill", "x": -110, "y": -110, "w": 220, "h": 44, "fill": "#EEF2FF", "stroke": "#C7D2FE", "lineWidth": 2 }\`
3. \`"circle"\`: \`{ "shape": "circle", "x": 0, "y": 0, "r": 54, "fill": "#DBEAFE", "stroke": "#2563EB", "lineWidth": 4 }\`
4. \`"ellipse"\`: \`{ "shape": "ellipse", "x": 0, "y": 90, "rx": 180, "ry": 26, "fill": "#E2E8F0", "opacity": 0.6 }\`
5. \`"line"\` / \`"arrow"\`: \`{ "shape": "arrow", "x": -40, "y": 10, "x2": 40, "y2": 10, "stroke": "#2563EB", "lineWidth": 6 }\`
6. \`"polygon"\`: \`{ "shape": "polygon", "points": [[-30,20],[0,-40],[30,20]], "fill": "#F59E0B" }\`
7. \`"icon"\` (dùng 1 trong các icon có sẵn: ${iconsList}): \`{ "shape": "icon", "icon": "briefcase", "x": -150, "y": 10 }\`
8. \`"text"\`: \`{ "shape": "text", "x": 0, "y": -88, "text": "KEY PHRASE", "fill": "#4338CA", "fontSize": 36, "fontWeight": 800, "align": "center" }\` (fontSize >= 24; chữ chính 36–48; nhãn 30–38)

# YÊU CẦU THẨM MỸ & DỄ ĐỌC TRÊN ĐIỆN THOẠI (9:16)
- Luôn có ít nhất 8–16 primitives phân lớp rõ ràng: nền thẻ bo tròn có bóng (\`shadow: true\`), nhãn tiêu đề \`pill\` + \`text\` hoặc header bar giống Bootstrap Card, 1–2 khối minh họa trực quan (ghép hình vector + \`icon\`), chữ ngắn rõ nghĩa, mũi tên hoặc dấu nhấn màu hài hòa (#2563EB, #16A34A, #F59E0B, #7C3AED, #DC2626).
- **QUAN TRỌNG**: Mọi primitive \`text\` phải có \`fontSize\` >= 24 (khuyên dùng 32–44 cho nội dung nổi bật, 28–34 cho nhãn), không dùng chữ nhỏ 16–22 khó đọc trên màn hình điện thoại.
- Điền \`keywords\` (6–12 từ khóa tiếng Anh/Việt viết thường) để hệ thống tự khớp chính xác khi tạo video mới!

# MẪU JSON ĐẦU RA
\`\`\`json
{
  "variant": "custom-job-interview",
  "label": "Phỏng vấn xin việc",
  "category": "${options?.category || 'life'}",
  "description": "Bàn phỏng vấn HR, hồ sơ CV và câu trả lời chuyên nghiệp",
  "keywords": ["interview", "resume", "cv", "hire", "job", "hr", "candidate", "phỏng vấn"],
  "defaultIcon": "briefcase",
  "primitives": [
    { "shape": "rect", "x": -360, "y": -150, "w": 720, "h": 300, "radius": 32, "fill": "#FFFFFF", "stroke": "#E2E8F0", "lineWidth": 2, "shadow": true },
    { "shape": "pill", "x": -150, "y": -132, "w": 300, "h": 48, "fill": "#EEF2FF" },
    { "shape": "text", "x": 0, "y": -108, "text": "JOB INTERVIEW", "fill": "#4338CA", "fontSize": 30, "fontWeight": 800, "align": "center" },
    { "shape": "rect", "x": -315, "y": -60, "w": 270, "h": 185, "radius": 24, "fill": "#F8FAFC", "stroke": "#CBD5E1", "lineWidth": 2 },
    { "shape": "icon", "icon": "briefcase", "x": -180, "y": 5 },
    { "shape": "text", "x": -180, "y": 90, "text": "Strengths & CV", "fill": "#334155", "fontSize": 30, "fontWeight": 700, "align": "center" },
    { "shape": "arrow", "x": -30, "y": 28, "x2": 30, "y2": 28, "stroke": "#16A34A", "lineWidth": 6 },
    { "shape": "rect", "x": 45, "y": -60, "w": 270, "h": 185, "radius": 24, "fill": "#ECFDF5", "stroke": "#86EFAC", "lineWidth": 2 },
    { "shape": "icon", "icon": "handshake", "x": 180, "y": 5 },
    { "shape": "text", "x": 180, "y": 90, "text": "Confident Answer", "fill": "#15803D", "fontSize": 30, "fontWeight": 700, "align": "center" }
  ]
}
\`\`\``;
}
