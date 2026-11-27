import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  CopyPlus,
  Database,
  Eye,
  LayoutTemplate,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sliders,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  renderCartoonHostPreviewFrame,
  renderIllustrationVariantThumbnail,
} from '../engine/canvasRenderer';
import {
  deleteCartoonAnimation,
  getAllCartoonAnimations,
  restoreBuiltInCartoonAnimation,
  subscribeCartoonAnimations,
} from '../engine/cartoonAnimationDb';
import { PasteButton } from './PasteButton';
import {
  buildVectorComponentAiPrompt,
  deleteComponentVariant,
  getCustomComponentByVariant,
  getDeletedBuiltInsSnapshot,
  normalizeCustomComponent,
  parseVectorComponentAiJson,
  restoreBuiltInComponent,
  sanitizeVariantSlug,
  subscribeCustomComponents,
  upsertCustomComponent,
} from '../engine/customComponentStore';
import {
  CustomComponentDefinition,
  VectorCategory,
  VectorPrimitive,
} from '../engine/customComponentTypes';
import { IllustrationSceneIcon } from '../engine/types';
import {
  ALL_SCENE_ICONS,
  getEffectiveVectorCatalog,
  VECTOR_COMPONENT_CATALOG,
} from '../engine/vectorComponentDb';
import {
  compileVisualBuilderToPrimitives,
  createDefaultVisualBuilderConfig,
  inferPresetForVariant,
  VISUAL_COLOR_PALETTES,
  VISUAL_LAYOUT_PRESETS,
  VisualBuilderConfig,
  VisualColorPalette,
} from '../engine/visualComponentBuilder';

interface ComponentDatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAnimationStudio?: () => void;
}

const CATEGORY_LABELS: Record<VectorCategory, string> = {
  life: 'Đời sống',
  grammar: 'Ngữ pháp',
  vocab: 'Từ vựng',
  pronunciation: 'Phát âm',
  dialogue: 'Hội thoại',
};

const PALETTE_DOT_CLASS: Record<string, string> = {
  indigo: 'bg-indigo-600',
  primary: 'bg-blue-600',
  success: 'bg-emerald-500',
  danger: 'bg-rose-600',
  warning: 'bg-amber-600',
  violet: 'bg-violet-600',
  slate: 'bg-slate-900',
};

const ComponentMiniCanvas: React.FC<{
  variant: string;
  primitives?: VectorPrimitive[];
  width?: number;
  height?: number;
  className?: string;
}> = ({ variant, primitives, width = 240, height = 128, className = '' }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderIllustrationVariantThumbnail(ctx, variant, width, height, 0.75, primitives);
  }, [variant, primitives, width, height]);

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      className={`block bg-slate-50 rounded-lg border border-slate-200 ${className}`}
    />
  );
};

const CartoonAnimThumbCanvas: React.FC<{
  params: Parameters<typeof renderCartoonHostPreviewFrame>[4];
  width?: number;
  height?: number;
}> = ({ params, width = 160, height = 128 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderCartoonHostPreviewFrame(ctx, width, height, 0.85, params, true);
  }, [params, width, height]);
  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      className="block w-full h-28 rounded-lg border border-slate-200 bg-sky-100"
    />
  );
};

export const ComponentDatabaseModal: React.FC<ComponentDatabaseModalProps> = ({
  isOpen,
  onClose,
  onOpenAnimationStudio,
}) => {
  const [version, setVersion] = useState(0);
  const [activeTab, setActiveTab] = useState<'browse' | 'ai-prompt' | 'cartoon'>('browse');
  const [searchQuery, setSearchQuery] = useState('');
  const [cartoonSearchQuery, setCartoonSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<VectorCategory | 'all' | 'ui-kit' | 'p168'>('all');
  const [showDeleted, setShowDeleted] = useState(false);

  // Selected / Editor state
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [visualModeEnabled, setVisualModeEnabled] = useState(false);
  const [visualCfg, setVisualCfg] = useState<VisualBuilderConfig>(() =>
    createDefaultVisualBuilderConfig(),
  );

  const [editVariant, setEditVariant] = useState('bs-card-header');
  const [editLabel, setEditLabel] = useState('');
  const [editCategory, setEditCategory] = useState<VectorCategory>('grammar');
  const [editDescription, setEditDescription] = useState('');
  const [editKeywords, setEditKeywords] = useState('');
  const [editIcon, setEditIcon] = useState<IllustrationSceneIcon>('book');
  const [editPrimitivesJson, setEditPrimitivesJson] = useState('[]');
  const [editorStatus, setEditorStatus] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);

  // AI Web Prompt Builder tab state
  const [aiConcept, setAiConcept] = useState('Thẻ thông báo Bootstrap nhắc lỗi ngữ pháp hay gặp');
  const [aiCategory, setAiCategory] = useState<VectorCategory>('grammar');
  const [aiBaseVariant, setAiBaseVariant] = useState<string>('bs-card-header');
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [pastedAiJson, setPastedAiJson] = useState('');
  const [aiParseError, setAiParseError] = useState<string | null>(null);
  const [aiImportSuccess, setAiImportSuccess] = useState<string | null>(null);

  useEffect(() => {
    const unsub1 = subscribeCustomComponents(() => setVersion((v) => v + 1));
    const unsub2 = subscribeCartoonAnimations(() => setVersion((v) => v + 1));
    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  const catalog = useMemo(() => {
    void version;
    return getEffectiveVectorCatalog();
  }, [version]);

  const cartoonAnims = useMemo(() => {
    void version;
    return getAllCartoonAnimations();
  }, [version]);

  const deletedBuiltIns = useMemo(() => {
    void version;
    return getDeletedBuiltInsSnapshot();
  }, [version]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return catalog.filter((item) => {
      if (categoryFilter === 'ui-kit') {
        if (!item.variant.startsWith('bs-') && !item.variant.startsWith('css-')) return false;
      } else if (categoryFilter === 'p168') {
        if (
          !item.variant.startsWith('p168-') &&
          item.variant !== 'phrase-icon-split' &&
          item.variant !== 'contrast-pair-cards' &&
          item.variant !== 'trio-icon-cards' &&
          item.variant !== 'dialogue-upgrade'
        ) {
          return false;
        }
      } else if (categoryFilter !== 'all' && item.category !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.variant.toLowerCase().includes(q) ||
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.keywordsText.toLowerCase().includes(q)
      );
    });
  }, [catalog, categoryFilter, searchQuery]);

  const hiddenBuiltInItems = useMemo(
    () => VECTOR_COMPONENT_CATALOG.filter((b) => deletedBuiltIns.includes(b.variant)),
    [deletedBuiltIns],
  );

  const uiKitCount = useMemo(
    () =>
      catalog.filter((c) => c.variant.startsWith('bs-') || c.variant.startsWith('css-')).length,
    [catalog],
  );

  const p168Count = useMemo(
    () =>
      catalog.filter(
        (c) =>
          c.variant.startsWith('p168-') ||
          c.variant === 'phrase-icon-split' ||
          c.variant === 'contrast-pair-cards' ||
          c.variant === 'trio-icon-cards' ||
          c.variant === 'dialogue-upgrade',
      ).length,
    [catalog],
  );

  const loadVariantIntoEditor = (variant: string) => {
    setIsCreatingNew(false);
    setEditorError(null);
    setEditorStatus(null);
    const custom = getCustomComponentByVariant(variant);
    const builtIn = VECTOR_COMPONENT_CATALOG.find((b) => b.variant === variant);
    const catalogEntry = catalog.find((c) => c.variant === variant);

    const resolvedLabel = custom?.label ?? catalogEntry?.label ?? builtIn?.label ?? variant;
    const resolvedDesc =
      custom?.description ?? catalogEntry?.description ?? builtIn?.description ?? '';
    const resolvedIcon = custom?.defaultIcon ?? builtIn?.defaultIcon ?? 'sparkles';
    const hasCustomPrimitives = Boolean(custom && custom.primitives.length > 0);

    setEditVariant(variant);
    setEditLabel(resolvedLabel);
    setEditCategory(custom?.category ?? catalogEntry?.category ?? builtIn?.category ?? 'life');
    setEditDescription(resolvedDesc);
    setEditKeywords(
      custom?.keywords.join(', ') ??
        (builtIn ? builtIn.keywords.source.replace(/\\b|\(|\)/g, '').replace(/\|/g, ', ') : ''),
    );
    setEditIcon(resolvedIcon);
    setEditPrimitivesJson(
      hasCustomPrimitives && custom ? JSON.stringify(custom.primitives, null, 2) : '[]',
    );
    setVisualModeEnabled(hasCustomPrimitives);

    const texts = (custom?.primitives ?? [])
      .filter((p) => p.shape === 'text' && p.text)
      .map((p) => p.text!.trim());

    setVisualCfg(
      createDefaultVisualBuilderConfig({
        preset: inferPresetForVariant(variant),
        badgeText: texts[0]?.slice(0, 18) || resolvedLabel.slice(0, 18).toUpperCase(),
        headline: texts[1] || resolvedLabel,
        subtext: texts[2] || resolvedDesc.slice(0, 48) || 'Everyday spoken English pattern',
        icon: resolvedIcon,
      }),
    );
  };

  useEffect(() => {
    if (isOpen && !isCreatingNew) {
      loadVariantIntoEditor(editVariant);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const updateVisualBuilder = (patch: Partial<VisualBuilderConfig>) => {
    setVisualModeEnabled(true);
    setVisualCfg((prev) => {
      const next = { ...prev, ...patch };
      if (patch.icon) setEditIcon(patch.icon);
      const compiled = compileVisualBuilderToPrimitives(next);
      setEditPrimitivesJson(JSON.stringify(compiled, null, 2));
      return next;
    });
  };

  const applyColorPalette = (pal: VisualColorPalette) => {
    updateVisualBuilder({
      bgColor: pal.bgColor,
      accentColor: pal.accentColor,
      softColor: pal.softColor,
      borderColor: pal.borderColor,
      textColor: pal.textColor,
    });
  };

  const parsedEditorPrimitives = useMemo((): {
    primitives: VectorPrimitive[];
    error: string | null;
  } => {
    try {
      const raw = JSON.parse(editPrimitivesJson);
      if (!Array.isArray(raw)) {
        return { primitives: [], error: 'Primitives phải là mảng JSON [] các shape.' };
      }
      const norm = normalizeCustomComponent({
        variant: editVariant || 'preview',
        label: editLabel || 'Preview',
        primitives: raw,
      });
      return { primitives: norm?.primitives ?? [], error: null };
    } catch {
      return { primitives: [], error: 'Cú pháp JSON của mảng primitives chưa hợp lệ.' };
    }
  }, [editPrimitivesJson, editVariant, editLabel]);

  const aiBaseMeta = useMemo(
    () => catalog.find((c) => c.variant === aiBaseVariant),
    [catalog, aiBaseVariant],
  );

  const aiGeneratedPrompt = useMemo(
    () =>
      buildVectorComponentAiPrompt(aiConcept || 'Thẻ minh họa giao tiếp tiếng Anh', {
        category: aiCategory,
        availableIcons: ALL_SCENE_ICONS,
        baseVariant: aiBaseMeta?.variant,
        baseLabel: aiBaseMeta?.label,
        baseDescription: aiBaseMeta?.description,
      }),
    [aiConcept, aiCategory, aiBaseMeta],
  );

  const parsedAiComponents = useMemo(() => {
    if (!pastedAiJson.trim()) return [];
    try {
      return parseVectorComponentAiJson(pastedAiJson);
    } catch {
      return [];
    }
  }, [pastedAiJson]);

  if (!isOpen) return null;

  const isSelectedBuiltIn = VECTOR_COMPONENT_CATALOG.some((b) => b.variant === editVariant);
  const hasCustomOverride = Boolean(getCustomComponentByVariant(editVariant));

  const handleStartNewComponent = (presetId?: VisualBuilderConfig['preset']) => {
    setIsCreatingNew(true);
    setVisualModeEnabled(true);
    setEditorError(null);
    setEditorStatus(null);
    const slugSuffix = Date.now().toString(36).slice(-4);
    const nextCfg = createDefaultVisualBuilderConfig({
      preset: presetId ?? 'bs-card',
      badgeText: 'KEY TIP',
      headline: 'Could you pass me the menu?',
      subtext: 'Lịch sự hơn hẳn "Give me menu"',
      icon: 'sparkles',
    });
    setVisualCfg(nextCfg);
    setEditVariant(`custom-ui-${slugSuffix}`);
    setEditLabel('Thẻ UI Tùy Chỉnh Mới');
    setEditCategory('dialogue');
    setEditDescription('Thẻ minh họa thiết kế trực quan theo mẫu Bootstrap / CSS');
    setEditKeywords('example, phrase, polite, speaking');
    setEditIcon(nextCfg.icon);
    setEditPrimitivesJson(JSON.stringify(compileVisualBuilderToPrimitives(nextCfg), null, 2));
  };

  const handleDuplicateAsNew = () => {
    setIsCreatingNew(true);
    setVisualModeEnabled(true);
    setEditorError(null);
    setEditorStatus(null);
    const slugSuffix = Date.now().toString(36).slice(-4);
    const baseSlug = sanitizeVariantSlug(editVariant).slice(0, 28);
    const nextCfg = {
      ...visualCfg,
      headline: visualCfg.headline || editLabel || 'New Phrase',
      subtext: visualCfg.subtext || editDescription || 'Custom remix card',
    };
    setVisualCfg(nextCfg);
    setEditVariant(`${baseSlug}-${slugSuffix}`);
    setEditLabel(`${editLabel || baseSlug} (Bản sao)`);
    if (!parsedEditorPrimitives.primitives.length) {
      setEditPrimitivesJson(JSON.stringify(compileVisualBuilderToPrimitives(nextCfg), null, 2));
    }
  };

  const handleSaveEditor = async () => {
    setEditorError(null);
    setEditorStatus(null);
    if (parsedEditorPrimitives.error) {
      setEditorError(parsedEditorPrimitives.error);
      return;
    }

    const slug = sanitizeVariantSlug(editVariant);
    if (!slug) {
      setEditorError('Mã variant không hợp lệ.');
      return;
    }

    const keywords = editKeywords
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const def: CustomComponentDefinition = {
      variant: isSelectedBuiltIn && !isCreatingNew ? editVariant : slug,
      label: editLabel.trim() || slug,
      category: editCategory,
      description: editDescription.trim() || editLabel.trim() || slug,
      keywords,
      defaultIcon: editIcon,
      primitives: parsedEditorPrimitives.primitives,
      isBuiltInOverride: isSelectedBuiltIn && !isCreatingNew,
    };

    try {
      const saved = await upsertCustomComponent(def);
      setIsCreatingNew(false);
      setEditVariant(saved.variant);
      setEditorStatus(
        `Đã lưu "${saved.variant}" vào Kho Component! Các video và prompt mới sẽ tự động sử dụng.`,
      );
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : 'Không thể lưu component.');
    }
  };

  const handleDeleteCurrent = async () => {
    if (isCreatingNew) return;
    await deleteComponentVariant(editVariant, isSelectedBuiltIn);
    setEditorStatus(
      isSelectedBuiltIn
        ? `Đã ẩn component mặc định "${editVariant}" (có thể khôi phục bất kỳ lúc nào).`
        : `Đã xóa vĩnh viễn component "${editVariant}".`,
    );
    const remaining = getEffectiveVectorCatalog();
    if (remaining.length > 0) {
      loadVariantIntoEditor(remaining[0].variant);
    }
  };

  const handleRestoreBuiltIn = async (variant: string) => {
    await restoreBuiltInComponent(variant);
    setEditorStatus(`Đã khôi phục nguyên bản "${variant}".`);
    loadVariantIntoEditor(variant);
  };

  const handleCopyAiPrompt = async () => {
    try {
      await navigator.clipboard.writeText(aiGeneratedPrompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch {
      setCopiedPrompt(false);
    }
  };

  const handleImportAiComponents = async () => {
    setAiParseError(null);
    setAiImportSuccess(null);
    try {
      const parsed = parseVectorComponentAiJson(pastedAiJson);
      if (parsed.length === 0) {
        setAiParseError(
          'Không tìm thấy component hợp lệ có mảng "primitives". Hãy copy nguyên JSON từ AI Web.',
        );
        return;
      }
      for (const comp of parsed) {
        await upsertCustomComponent(comp);
      }
      setAiImportSuccess(
        `Đã thêm ${parsed.length} component (${parsed.map((c) => c.variant).join(', ')}) vào Kho! Tạo video mới hoặc bấm Random theo ngữ cảnh sẽ tự dùng ngay.`,
      );
      setEditVariant(parsed[0].variant);
      loadVariantIntoEditor(parsed[0].variant);
      setPastedAiJson('');
    } catch {
      setAiParseError('JSON từ AI Web chưa đúng cấu trúc. Hãy kiểm tra lại dấu ngoặc và phẩy.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="component-db-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-[2px] p-4"
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-slate-50/70">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
              <Database className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 id="component-db-title" className="text-base font-bold text-slate-900 truncate">
                Kho Component Vector &amp; Bộ Tùy Chỉnh Giao Diện (Bootstrap / CSS UI)
              </h2>
              <p className="text-xs text-slate-500 truncate tabular-nums">
                Đang kích hoạt: {catalog.length} mẫu ({uiKitCount} Bootstrap &amp; CSS UI) · Tự động đồng bộ Video &amp; Prompt
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setActiveTab('browse')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  activeTab === 'browse'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Kho Mẫu UI ({catalog.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ai-prompt')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  activeTab === 'ai-prompt'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-indigo-700 hover:bg-indigo-50'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Tạo Mẫu AI</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('cartoon')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  activeTab === 'cartoon'
                    ? 'bg-violet-600 text-white shadow-xs'
                    : 'text-violet-700 hover:bg-violet-50'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Animation @Gimmys ({cartoonAnims.filter((a) => !a.isHidden).length})</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng Kho Component"
              className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        {activeTab === 'cartoon' ? (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-slate-50/40">
            <div className="p-3.5 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2.5">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={cartoonSearchQuery}
                  onChange={(e) => setCartoonSearchQuery(e.target.value)}
                  placeholder="Tìm hành động, biểu cảm @Gimmys (vỗ tay, loa, nhảy...)..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              {onOpenAnimationStudio && (
                <button
                  type="button"
                  onClick={onOpenAnimationStudio}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Mở Animation Studio + Câu lệnh Web AI</span>
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 content-start">
              {cartoonAnims
                .filter((a) => {
                  const q = cartoonSearchQuery.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    a.label.toLowerCase().includes(q) ||
                    a.id.toLowerCase().includes(q) ||
                    a.description.toLowerCase().includes(q) ||
                    a.keywords.some((k) => k.toLowerCase().includes(q))
                  );
                })
                .map((anim) => (
                  <div
                    key={anim.id}
                    className={`rounded-xl border p-3 bg-white flex flex-col gap-2 ${
                      anim.isHidden ? 'opacity-55 border-amber-200' : 'border-slate-200'
                    }`}
                  >
                    <CartoonAnimThumbCanvas params={anim.params} />
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">{anim.label}</div>
                        <div className="text-[10px] font-mono text-violet-700 truncate">{anim.id}</div>
                      </div>
                      <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-violet-50 text-violet-700 border border-violet-200 shrink-0">
                        {anim.source === 'custom' ? 'Tự tạo' : 'Mặc định'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 line-clamp-2">{anim.description}</p>
                    <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-slate-100 mt-auto">
                      {anim.isHidden ? (
                        <button
                          type="button"
                          onClick={() => void restoreBuiltInCartoonAnimation(anim.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Khôi phục</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void deleteCartoonAnimation(anim.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded hover:bg-rose-100"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>{anim.source === 'custom' ? 'Xóa' : 'Ẩn'}</span>
                        </button>
                      )}
                      {onOpenAnimationStudio && (
                        <button
                          type="button"
                          onClick={onOpenAnimationStudio}
                          className="px-2.5 py-1 text-[10px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded hover:bg-violet-100"
                        >
                          Sửa / Preview Studio
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ) : activeTab === 'browse' ? (
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
            {/* Left Catalog Grid */}
            <div className="lg:col-span-6 flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-slate-200">
              <div className="p-3 bg-slate-50/60 border-b border-slate-200 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[160px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Tìm tên, bootstrap, css, keyword..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleStartNewComponent('bs-card')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 whitespace-nowrap shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tạo UI Mới</span>
                  </button>
                </div>

                {/* Quick Filter Pills */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { id: 'all', label: `Tất cả (${catalog.length})` },
                    { id: 'p168', label: `@168 TikTok (${p168Count})` },
                    { id: 'ui-kit', label: `Bootstrap / CSS (${uiKitCount})` },
                    { id: 'life', label: 'Đời sống' },
                    { id: 'grammar', label: 'Ngữ pháp' },
                    { id: 'vocab', label: 'Từ vựng' },
                    { id: 'dialogue', label: 'Hội thoại' },
                    { id: 'pronunciation', label: 'Phát âm' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() =>
                        setCategoryFilter(tab.id as VectorCategory | 'all' | 'ui-kit' | 'p168')
                      }
                      className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                        categoryFilter === tab.id
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {hiddenBuiltInItems.length > 0 && (
                <div className="px-3.5 py-2 bg-amber-50/70 border-b border-amber-200 flex items-center justify-between gap-2 text-xs">
                  <label className="inline-flex items-center gap-2 text-amber-900 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showDeleted}
                      onChange={(e) => setShowDeleted(e.target.checked)}
                      className="rounded border-amber-300 text-amber-600"
                    />
                    <span>Hiện {hiddenBuiltInItems.length} mẫu mặc định đã ẩn</span>
                  </label>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 content-start">
                {filteredItems.map((item) => {
                  const customDef = getCustomComponentByVariant(item.variant);
                  const active = !isCreatingNew && editVariant === item.variant;
                  const isUiKit =
                    item.variant.startsWith('bs-') || item.variant.startsWith('css-');
                  const isP168 =
                    item.variant.startsWith('p168-') ||
                    item.variant === 'phrase-icon-split' ||
                    item.variant === 'contrast-pair-cards' ||
                    item.variant === 'trio-icon-cards';
                  return (
                    <button
                      key={item.variant}
                      type="button"
                      onClick={() => loadVariantIntoEditor(item.variant)}
                      className={`text-left p-2.5 rounded-xl border transition-all flex flex-col gap-2 ${
                        active
                          ? 'bg-indigo-50/70 border-indigo-400 ring-2 ring-indigo-100'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <ComponentMiniCanvas
                        variant={item.variant}
                        primitives={customDef?.primitives}
                        width={260}
                        height={120}
                        className="w-full h-auto"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {item.label}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-semibold rounded shrink-0 ${
                              item.isCustom
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : item.isOverride
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : isP168
                                    ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                    : isUiKit
                                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                      : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {item.isCustom
                              ? 'Tùy chỉnh'
                              : item.isOverride
                                ? 'Đã sửa'
                                : isP168
                                  ? '@168'
                                  : isUiKit
                                    ? 'CSS / BS5'
                                    : CATEGORY_LABELS[item.category]}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-indigo-600 truncate mt-0.5">
                          {item.variant}
                        </div>
                      </div>
                    </button>
                  );
                })}

                {showDeleted &&
                  hiddenBuiltInItems.map((b) => (
                    <div
                      key={`hidden-${b.variant}`}
                      className="p-2.5 rounded-xl border border-dashed border-amber-300 bg-amber-50/40 flex flex-col justify-between gap-2"
                    >
                      <div>
                        <div className="text-xs font-bold text-slate-700">{b.label}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {b.variant} (đã ẩn)
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleRestoreBuiltIn(b.variant)}
                        className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-amber-800 bg-white border border-amber-300 rounded-lg hover:bg-amber-100"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Khôi phục</span>
                      </button>
                    </div>
                  ))}
              </div>
            </div>

            {/* Right No-Code Visual Customizer Panel */}
            <div className="lg:col-span-6 flex flex-col min-h-0 overflow-y-auto p-4 bg-slate-50/40 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-slate-900">
                  {isCreatingNew
                    ? 'Thiết Kế Component Mới (Không cần viết code)'
                    : `Tùy Chỉnh Component: ${editVariant}`}
                </h3>
                <div className="flex items-center gap-1.5">
                  {!isCreatingNew && (
                    <button
                      type="button"
                      onClick={handleDuplicateAsNew}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100"
                    >
                      <CopyPlus className="w-3 h-3" />
                      <span>Nhân bản thành mới</span>
                    </button>
                  )}
                  {!isCreatingNew && isSelectedBuiltIn && hasCustomOverride && (
                    <button
                      type="button"
                      onClick={() => void handleRestoreBuiltIn(editVariant)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Khôi phục gốc</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Live Canvas Preview */}
              <ComponentMiniCanvas
                variant={editVariant}
                primitives={
                  parsedEditorPrimitives.primitives.length > 0
                    ? parsedEditorPrimitives.primitives
                    : undefined
                }
                width={500}
                height={196}
                className="w-full h-auto bg-white shadow-xs"
              />

              {/* Toggle to enable Visual UI Builder if editing an un-customized built-in */}
              {!visualModeEnabled && isSelectedBuiltIn && !isCreatingNew && (
                <div className="p-3 bg-indigo-50/80 border border-indigo-200 rounded-xl flex items-center justify-between gap-3">
                  <div className="text-[11px] text-indigo-950 leading-relaxed">
                    Đang hiển thị đồ họa gốc hệ thống. Muốn đổi màu, chữ, bo góc hoặc chuyển sang khung Bootstrap / CSS?
                  </div>
                  <button
                    type="button"
                    onClick={() => updateVisualBuilder({})}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shrink-0"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Mở UI Tùy Chỉnh</span>
                  </button>
                </div>
              )}

              {/* Visual No-Code UI Builder Controls */}
              {visualModeEnabled && (
                <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-3.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <LayoutTemplate className="w-3.5 h-3.5 text-indigo-600" />
                      <span>1. Chọn khung giao diện Bootstrap &amp; CSS</span>
                    </div>
                    {isSelectedBuiltIn && !isCreatingNew && (
                      <button
                        type="button"
                        onClick={() => {
                          setVisualModeEnabled(false);
                          setEditPrimitivesJson('[]');
                        }}
                        className="text-[11px] font-medium text-slate-500 hover:text-slate-800"
                      >
                        Dùng lại hình vẽ gốc
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                    {VISUAL_LAYOUT_PRESETS.map((p) => {
                      const active = visualCfg.preset === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          title={p.hint}
                          onClick={() => updateVisualBuilder({ preset: p.id })}
                          className={`p-2 rounded-lg border text-left transition-all ${
                            active
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                              : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <div className="text-[10px] font-bold truncate">{p.name}</div>
                          <div
                            className={`text-[9px] truncate ${
                              active ? 'text-indigo-100' : 'text-slate-500'
                            }`}
                          >
                            {p.sourceTag}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Content Fields */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-slate-800">
                      2. Sửa nội dung hiển thị trên thẻ
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                          Nhãn / Badge
                        </label>
                        <input
                          type="text"
                          value={visualCfg.badgeText}
                          onChange={(e) => updateVisualBuilder({ badgeText: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                          Tiêu đề chính (Headline)
                        </label>
                        <input
                          type="text"
                          value={visualCfg.headline}
                          onChange={(e) => updateVisualBuilder({ headline: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                        Dòng giải thích / Ghi chú phụ
                      </label>
                      <input
                        type="text"
                        value={visualCfg.subtext}
                        onChange={(e) => updateVisualBuilder({ subtext: e.target.value })}
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white"
                      />
                    </div>

                    {(visualCfg.preset === 'css-roadmap' ||
                      visualCfg.preset === 'css-equation' ||
                      visualCfg.preset === 'css-compare') && (
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                            {visualCfg.preset === 'css-compare' ? 'Cột Trái (Basic)' : 'Mục 1'}
                          </label>
                          <input
                            type="text"
                            value={visualCfg.stepLabels[0]}
                            onChange={(e) =>
                              updateVisualBuilder({
                                stepLabels: [
                                  e.target.value,
                                  visualCfg.stepLabels[1],
                                  visualCfg.stepLabels[2],
                                ],
                              })
                            }
                            className="w-full px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                            {visualCfg.preset === 'css-compare' ? 'Cột Phải (Pro)' : 'Mục 2'}
                          </label>
                          <input
                            type="text"
                            value={visualCfg.stepLabels[1]}
                            onChange={(e) =>
                              updateVisualBuilder({
                                stepLabels: [
                                  visualCfg.stepLabels[0],
                                  e.target.value,
                                  visualCfg.stepLabels[2],
                                ],
                              })
                            }
                            className="w-full px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md"
                          />
                        </div>
                        {visualCfg.preset !== 'css-compare' && (
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                              Mục 3
                            </label>
                            <input
                              type="text"
                              value={visualCfg.stepLabels[2]}
                              onChange={(e) =>
                                updateVisualBuilder({
                                  stepLabels: [
                                    visualCfg.stepLabels[0],
                                    visualCfg.stepLabels[1],
                                    e.target.value,
                                  ],
                                })
                              }
                              className="w-full px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {visualCfg.preset === 'bs-progress' && (
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5 tabular-nums">
                          Mức % thanh tiến độ ({visualCfg.progressPercent}%)
                        </label>
                        <input
                          type="range"
                          min={10}
                          max={100}
                          value={visualCfg.progressPercent}
                          onChange={(e) =>
                            updateVisualBuilder({ progressPercent: Number(e.target.value) })
                          }
                          className="w-full accent-indigo-600"
                        />
                      </div>
                    )}
                  </div>

                  {/* Theme Palettes & CSS Controls */}
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-800">
                      <Palette className="w-3.5 h-3.5 text-indigo-600" />
                      <span>3. Màu sắc, Bo góc &amp; Đổ bóng CSS</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {VISUAL_COLOR_PALETTES.map((pal) => (
                        <button
                          key={pal.id}
                          type="button"
                          onClick={() => applyColorPalette(pal)}
                          className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md"
                        >
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${PALETTE_DOT_CLASS[pal.id] || 'bg-indigo-600'}`}
                          />
                          <span>{pal.label}</span>
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <label className="flex items-center justify-between gap-2 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px]">
                        <span className="text-slate-600 font-medium">Màu nhấn</span>
                        <input
                          type="color"
                          value={visualCfg.accentColor}
                          onChange={(e) => updateVisualBuilder({ accentColor: e.target.value })}
                          className="w-6 h-5 cursor-pointer bg-transparent border-0 p-0"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-2 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px]">
                        <span className="text-slate-600 font-medium">Nền thẻ</span>
                        <input
                          type="color"
                          value={visualCfg.bgColor}
                          onChange={(e) => updateVisualBuilder({ bgColor: e.target.value })}
                          className="w-6 h-5 cursor-pointer bg-transparent border-0 p-0"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-2 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px]">
                        <span className="text-slate-600 font-medium">Màu chữ</span>
                        <input
                          type="color"
                          value={visualCfg.textColor}
                          onChange={(e) => updateVisualBuilder({ textColor: e.target.value })}
                          className="w-6 h-5 cursor-pointer bg-transparent border-0 p-0"
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1 items-center">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 tabular-nums">
                          Bo góc (border-radius: {visualCfg.radius}px)
                        </label>
                        <input
                          type="range"
                          min={8}
                          max={38}
                          value={visualCfg.radius}
                          onChange={(e) => updateVisualBuilder({ radius: Number(e.target.value) })}
                          className="w-full accent-indigo-600"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 tabular-nums">
                          Cỡ chữ tiêu đề ({visualCfg.headlineSize}px)
                        </label>
                        <input
                          type="range"
                          min={24}
                          max={42}
                          value={visualCfg.headlineSize}
                          onChange={(e) =>
                            updateVisualBuilder({ headlineSize: Number(e.target.value) })
                          }
                          className="w-full accent-indigo-600"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={visualCfg.showShadow}
                          onChange={(e) => updateVisualBuilder({ showShadow: e.target.checked })}
                          className="rounded border-slate-300 text-indigo-600"
                        />
                        <span>Đổ bóng (Box Shadow)</span>
                      </label>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={visualCfg.showBorder}
                          onChange={(e) => updateVisualBuilder({ showBorder: e.target.checked })}
                          className="rounded border-slate-300 text-indigo-600"
                        />
                        <span>Viền thẻ (Border)</span>
                      </label>
                    </div>

                    {/* Visual Icon Grid */}
                    <div>
                      <div className="text-[10px] font-semibold text-slate-600 mb-1">
                        Icon minh họa (click chọn nhanh):
                      </div>
                      <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto p-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                        {ALL_SCENE_ICONS.map((icon) => (
                          <button
                            key={icon}
                            type="button"
                            onClick={() => updateVisualBuilder({ icon })}
                            className={`px-2 py-0.5 text-[10px] font-medium rounded border transition-colors ${
                              visualCfg.icon === icon
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {icon}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Component Identity & Semantic Trigger Metadata */}
              <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2.5">
                <div className="text-[11px] font-bold text-slate-800">
                  Thông tin &amp; Tự động nhận diện theo lời thoại
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                      Mã variant (slug)
                    </label>
                    <input
                      type="text"
                      disabled={!isCreatingNew && isSelectedBuiltIn}
                      value={editVariant}
                      onChange={(e) => setEditVariant(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                      Nhóm ngữ cảnh
                    </label>
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value as VectorCategory)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    >
                      {(Object.keys(CATEGORY_LABELS) as VectorCategory[]).map((cat) => (
                        <option key={cat} value={cat}>
                          {CATEGORY_LABELS[cat]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                      Tên hiển thị trong Kho
                    </label>
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                      Icon mặc định
                    </label>
                    <select
                      value={editIcon}
                      onChange={(e) => setEditIcon(e.target.value as IllustrationSceneIcon)}
                      className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    >
                      {ALL_SCENE_ICONS.map((icon) => (
                        <option key={icon} value={icon}>
                          {icon}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                    Mô tả (giúp AI chọn đúng cảnh khi tạo kịch bản)
                  </label>
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                    Từ khóa tự động khớp câu nói (cách nhau dấu phẩy)
                  </label>
                  <input
                    type="text"
                    value={editKeywords}
                    onChange={(e) => setEditKeywords(e.target.value)}
                    placeholder="interview, resume, job, phỏng vấn"
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              {/* Optional Collapsible Advanced Raw JSON */}
              <details className="bg-white border border-slate-200 rounded-xl px-3 py-2">
                <summary className="text-[11px] font-semibold text-slate-600 cursor-pointer inline-flex items-center gap-1.5 select-none">
                  <Code2 className="w-3.5 h-3.5" />
                  <span>Nâng cao: Xem / Sửa JSON tọa độ Canvas (tự sinh từ UI Builder)</span>
                </summary>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10.5px] font-semibold text-slate-600">JSON Primitives Canvas</span>
                    <PasteButton
                      onPaste={(txt) => setEditPrimitivesJson(txt)}
                      title="Dán nhanh JSON primitives (thay thế)"
                    />
                  </div>
                  <textarea
                    rows={5}
                    value={editPrimitivesJson}
                    onChange={(e) => setEditPrimitivesJson(e.target.value)}
                    className="w-full p-2 text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-lg leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[10px] text-slate-500">
                    Để <code>[]</code> nếu muốn giữ nguyên hình vẽ gốc của hệ thống và chỉ sửa tên/từ khóa.
                  </p>
                </div>
              </details>

              {(editorError || parsedEditorPrimitives.error) && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                  {editorError || parsedEditorPrimitives.error}
                </p>
              )}

              {editorStatus && (
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                  {editorStatus}
                </p>
              )}

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200">
                {!isCreatingNew ? (
                  <button
                    type="button"
                    onClick={() => void handleDeleteCurrent()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isSelectedBuiltIn ? 'Ẩn khỏi Kho' : 'Xóa vĩnh viễn'}</span>
                  </button>
                ) : (
                  <span />
                )}

                <button
                  type="button"
                  onClick={() => void handleSaveEditor()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-xs"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Lưu vào Database</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* AI Web Prompt Builder Tab */
          <div className="flex-1 min-h-0 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 bg-slate-50/40">
            <div className="lg:col-span-6 space-y-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Bước 1: Tạo Prompt cho AI Web tự vẽ Component mới
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Nhập ý tưởng cảnh bạn muốn → sao chép Prompt gửi ChatGPT/Gemini/Claude Web → nhận lại JSON chuẩn tọa độ Canvas của KineticSub.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Ý tưởng / Cảnh cần AI vẽ
                  </label>
                  <input
                    type="text"
                    value={aiConcept}
                    onChange={(e) => setAiConcept(e.target.value)}
                    placeholder="VD: Thẻ Bootstrap so sánh 2 thì quá khứ..."
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Nhóm gợi ý
                  </label>
                  <select
                    value={aiCategory}
                    onChange={(e) => setAiCategory(e.target.value as VectorCategory)}
                    className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                  >
                    {(Object.keys(CATEGORY_LABELS) as VectorCategory[]).map((cat) => (
                      <option key={cat} value={cat}>
                        {CATEGORY_LABELS[cat]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Dựa theo mẫu UI có sẵn để AI tùy biến (tùy chọn)
                </label>
                <select
                  value={aiBaseVariant}
                  onChange={(e) => setAiBaseVariant(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                >
                  <option value="">Tự do thiết kế từ đầu</option>
                  {catalog.map((item) => (
                    <option key={item.variant} value={item.variant}>
                      {item.label} ({item.variant}) — {item.description}
                    </option>
                  ))}
                </select>
              </div>

              <textarea
                aria-label="Prompt AI Web vẽ Vector Component"
                readOnly
                rows={15}
                value={aiGeneratedPrompt}
                className="w-full p-3 text-[11px] font-mono bg-white border border-slate-200 rounded-xl leading-relaxed text-slate-800"
              />

              <button
                type="button"
                onClick={() => void handleCopyAiPrompt()}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
              >
                {copiedPrompt ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedPrompt ? 'Đã sao chép Prompt!' : 'Sao chép Prompt gửi AI Web'}</span>
              </button>
            </div>

            <div className="lg:col-span-6 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Bước 2: Dán JSON từ AI Web &amp; Xem trước Live
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Hỗ trợ cả 1 object hoặc mảng nhiều component cùng lúc. Sau khi thêm, bạn vẫn có thể chỉnh sửa lại bằng Visual UI Builder.
                  </p>
                </div>
                <PasteButton
                  size="sm"
                  onPaste={(txt) => {
                    setPastedAiJson(txt);
                    setAiParseError(null);
                    setAiImportSuccess(null);
                  }}
                  title="Dán nhanh JSON component từ AI Web"
                />
              </div>

              <textarea
                aria-label="Dán JSON component từ AI Web"
                rows={9}
                value={pastedAiJson}
                onChange={(e) => {
                  setPastedAiJson(e.target.value);
                  setAiParseError(null);
                  setAiImportSuccess(null);
                }}
                placeholder='Dán kết quả JSON từ ChatGPT / Gemini Web vào đây...'
                className="w-full p-3 text-[11px] font-mono bg-white border border-slate-200 rounded-xl leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />

              {parsedAiComponents.length > 0 && (
                <div className="p-3 bg-white border border-indigo-200 rounded-xl space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700">
                    <Eye className="w-3.5 h-3.5" />
                    <span>Xem trước ngay ({parsedAiComponents.length} component nhận diện được):</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {parsedAiComponents.map((comp) => (
                      <div key={comp.variant} className="space-y-1">
                        <ComponentMiniCanvas
                          variant={comp.variant}
                          primitives={comp.primitives}
                          width={320}
                          height={150}
                          className="w-full h-auto"
                        />
                        <div className="text-xs font-bold text-slate-800">{comp.label}</div>
                        <div className="text-[10px] font-mono text-slate-500">
                          {comp.variant} · {comp.primitives.length} hình · keywords: {comp.keywords.slice(0, 4).join(', ')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {aiParseError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">
                  {aiParseError}
                </p>
              )}

              {aiImportSuccess && (
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 font-medium">
                  {aiImportSuccess}
                </p>
              )}

              <button
                type="button"
                disabled={!pastedAiJson.trim()}
                onClick={() => void handleImportAiComponents()}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>Lưu vào Kho Component &amp; Áp dụng cho Video mới</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
