import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Database,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Square,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { renderCartoonHostPreviewFrame } from '../engine/canvasRenderer';
import {
  buildCartoonActionWebAiPrompt,
  deleteCartoonAnimation,
  getAllCartoonAnimations,
  parseCartoonAnimationAiJson,
  restoreBuiltInCartoonAnimation,
  subscribeCartoonAnimations,
  upsertCartoonAnimation,
} from '../engine/cartoonAnimationDb';
import {
  CartoonAccessory,
  CartoonAnimationDefinition,
  CartoonAnimationParams,
  CartoonExpressionMood,
  CartoonEyeStyle,
  CartoonFxOverlay,
  CartoonGestureMode,
  CartoonMouthStyle,
} from '../engine/types';
import { PasteButton } from './PasteButton';

interface CartoonAnimationStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialActionId?: string;
  initialSpec?: Partial<CartoonAnimationParams>;
  onApplyToStage?: (actionId: string | undefined, spec: Partial<CartoonAnimationParams>) => void;
}

const MOOD_OPTIONS: { id: CartoonExpressionMood; label: string }[] = [
  { id: 'happy', label: 'Vui vẻ (Happy)' },
  { id: 'excited', label: 'Hào hứng / Ăn mừng (Excited)' },
  { id: 'curious', label: 'Tò mò / Suy nghĩ (Curious)' },
  { id: 'worried', label: 'Cảnh báo / Lo lắng (Worried)' },
  { id: 'surprised', label: 'Ngạc nhiên (Surprised)' },
  { id: 'proud', label: 'Tự hào (Proud)' },
  { id: 'cool', label: 'Ngầu tự tin (Cool)' },
  { id: 'sad', label: 'Tiếc nuối (Sad)' },
  { id: 'shy', label: 'Ngại ngùng (Shy)' },
  { id: 'neutral', label: 'Tự nhiên (Neutral)' },
];

const GESTURE_OPTIONS: { id: CartoonGestureMode; label: string }[] = [
  { id: 'point-up', label: 'Chỉ tay lên thẻ (Point Up)' },
  { id: 'point-right', label: 'Chỉ sang phải (Point Right)' },
  { id: 'wave', label: 'Vẫy tay chào (Wave)' },
  { id: 'thumbs-up', label: 'Giơ ngón cái Like (Thumbs Up)' },
  { id: 'think-chin', label: 'Chống cằm suy nghĩ (Think Chin)' },
  { id: 'cheer', label: 'Giơ hai tay ăn mừng (Cheer)' },
  { id: 'fist-pump', label: 'Giơ nắm đấm quyết tâm (Fist Pump)' },
  { id: 'shrug', label: 'Nhún vai tò mò (Shrug)' },
  { id: 'warn-avoid', label: 'Xua tay cảnh báo (Warn Avoid)' },
  { id: 'approve-tip', label: 'Gợi ý mẹo hay (Approve Tip)' },
  { id: 'double-point', label: 'Chỉ hai tay nhấn mạnh (Double Point)' },
  { id: 'facepalm', label: 'Vỗ trán bất ngờ (Facepalm)' },
  { id: 'question', label: 'Nghiêng tay hỏi (Question)' },
  { id: 'hold-mic', label: 'Cầm micro thuyết trình (Hold Mic)' },
  { id: 'explain', label: 'Mở tay giải thích (Explain)' },
  { id: 'present', label: 'Đứng chào chỉnh tề (Present)' },
];

const EYE_OPTIONS: { id: CartoonEyeStyle; label: string }[] = [
  { id: 'normal', label: 'Mắt tròn tự nhiên' },
  { id: 'happy-arc', label: 'Mắt cười cong ^^' },
  { id: 'wide-surprised', label: 'Mở to ngạc nhiên' },
  { id: 'wink', label: 'Nháy mắt tinh nghịch' },
  { id: 'star', label: 'Mắt sao lấp lánh' },
  { id: 'focused', label: 'Tập trung nghiêm túc' },
  { id: 'sleepy', label: 'Thư giãn / lim dim' },
  { id: 'heart', label: 'Mắt trái tim' },
  { id: 'cool-shades', label: 'Đeo kính ngầu' },
];

const MOUTH_OPTIONS: { id: CartoonMouthStyle; label: string }[] = [
  { id: 'lip-sync', label: 'Nhép miệng nói (Lip-sync)' },
  { id: 'smile', label: 'Cười tươi' },
  { id: 'big-grin', label: 'Cười rạng rỡ (Grin)' },
  { id: 'o-shock', label: 'Chữ O bất ngờ' },
  { id: 'wavy-nervous', label: 'Môi lượn sóng lo lắng' },
  { id: 'flat-serious', label: 'Môi ngang suy tư' },
  { id: 'smirk', label: 'Cười nhếch tự tin' },
];

const FX_OPTIONS: { id: CartoonFxOverlay; label: string }[] = [
  { id: 'none', label: 'Không hiệu ứng' },
  { id: 'sparkles', label: 'Lấp lánh ✨' },
  { id: 'lightbulb', label: 'Bóng đèn ý tưởng 💡' },
  { id: 'warning-bolt', label: 'Tia cảnh báo ⚡' },
  { id: 'question-marks', label: 'Dấu hỏi ❓' },
  { id: 'hearts', label: 'Trái tim 💖' },
  { id: 'music-notes', label: 'Nốt nhạc 🎵' },
  { id: 'sweat-drop', label: 'Giọt mồ hôi 💧' },
  { id: 'check-burst', label: 'Dấu tích ✅' },
  { id: 'fire-aura', label: 'Nhiệt huyết 🔥' },
];

const ACCESSORY_OPTIONS: { id: CartoonAccessory; label: string }[] = [
  { id: 'none', label: 'Không phụ kiện' },
  { id: 'mic', label: 'Micro cầm tay' },
  { id: 'pointer-stick', label: 'Que chỉ bảng' },
  { id: 'megaphone', label: 'Loa cầm tay' },
  { id: 'graduation-cap', label: 'Mũ tốt nghiệp' },
  { id: 'sunglasses', label: 'Kính râm ngầu' },
  { id: 'badge-card', label: 'Bảng tên giáo viên' },
];

const PreviewCanvas: React.FC<{
  spec: Partial<CartoonAnimationParams>;
  isSpeaking: boolean;
  width?: number;
  height?: number;
  className?: string;
}> = ({ spec, isSpeaking, width = 300, height = 360, className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let timerId = 0;
    let rafId = 0;
    const startMs = performance.now();
    const drawFrame = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const t = (performance.now() - startMs) / 1000;
          renderCartoonHostPreviewFrame(ctx, width, height, t, spec, isSpeaking);
        }
      }
    };
    drawFrame();
    const scheduleNext = () => {
      timerId = window.setTimeout(() => {
        rafId = requestAnimationFrame(() => {
          drawFrame();
          scheduleNext();
        });
      }, 42);
    };
    scheduleNext();
    return () => {
      window.clearTimeout(timerId);
      cancelAnimationFrame(rafId);
    };
  }, [spec, isSpeaking, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={`block rounded-xl border border-sky-200 bg-sky-100 ${className}`}
    />
  );
};

export const CartoonAnimationStudioModal: React.FC<CartoonAnimationStudioModalProps> = ({
  isOpen,
  onClose,
  initialActionId,
  initialSpec,
  onApplyToStage,
}) => {
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState<'studio' | 'ai-prompt'>('studio');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSpeakingPreview, setIsSpeakingPreview] = useState(true);

  const [selectedId, setSelectedId] = useState<string>(initialActionId || 'point-up');
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  const [editId, setEditId] = useState('');
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editKeywords, setEditKeywords] = useState('');
  const [editSpec, setEditSpec] = useState<CartoonAnimationParams>({
    mood: 'happy',
    gestureMode: 'point-up',
    eyeStyle: 'normal',
    mouthStyle: 'smile',
    fxOverlay: 'none',
    accessory: 'none',
    badgeGlyph: null,
    badgeEmoji: '',
    speed: 1,
    bounceIntensity: 1,
    headTiltDeg: 0,
    blushIntensity: 0.45,
    bodySquashStretch: 0.04,
  });
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // AI Web Prompt tab
  const [aiIdea, setAiIdea] = useState('');
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [pastedAiJson, setPastedAiJson] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuccess, setAiSuccess] = useState<string | null>(null);

  useEffect(() => {
    return subscribeCartoonAnimations(() => setVersion((v) => v + 1));
  }, []);

  const allAnimations = useMemo(() => {
    void version;
    return getAllCartoonAnimations();
  }, [version]);

  const loadPresetIntoEditor = (def: CartoonAnimationDefinition) => {
    setIsCreatingNew(false);
    setSelectedId(def.id);
    setEditId(def.id);
    setEditName(def.label);
    setEditDesc(def.description);
    setEditKeywords(def.keywords.join(', '));
    setEditSpec({
      ...def.params,
      badgeEmoji: def.params.badgeEmoji ?? '',
    });
    setStatusMsg(null);
    setErrorMsg(null);
  };

  useEffect(() => {
    if (!isOpen) return;
    const target =
      (initialActionId && allAnimations.find((a) => a.id === initialActionId)) ||
      allAnimations[0];
    if (target) {
      loadPresetIntoEditor(target);
      if (initialSpec && Object.keys(initialSpec).length > 0) {
        setEditSpec((prev) => ({
          ...prev,
          ...initialSpec,
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialActionId]);

  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allAnimations.filter((item) => {
      if (!q) return true;
      return (
        item.label.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.keywords.some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [allAnimations, searchQuery]);

  const activeDef = allAnimations.find((a) => a.id === selectedId);
  const aiPromptText = useMemo(() => buildCartoonActionWebAiPrompt(aiIdea), [aiIdea]);
  const parsedAiItems = useMemo(() => {
    if (!pastedAiJson.trim()) return [];
    return parseCartoonAnimationAiJson(pastedAiJson);
  }, [pastedAiJson]);

  if (!isOpen) return null;

  const handleStartNew = () => {
    setIsCreatingNew(true);
    setSelectedId('');
    const slug = `custom-action-${Date.now().toString(36).slice(-4)}`;
    setEditId(slug);
    setEditName('Hành động Mới');
    setEditDesc('Biểu cảm và cử chỉ tùy chỉnh cho nhân vật @Gimmys');
    setEditKeywords('custom, cheer, fun');
    setEditSpec({
      mood: 'excited',
      gestureMode: 'cheer',
      eyeStyle: 'star',
      mouthStyle: 'big-grin',
      fxOverlay: 'sparkles',
      accessory: 'none',
      badgeGlyph: null,
      badgeEmoji: '✨',
      speed: 1.25,
      bounceIntensity: 1.35,
      headTiltDeg: 8,
      blushIntensity: 0.75,
      bodySquashStretch: 0.08,
    });
    setStatusMsg(null);
    setErrorMsg(null);
  };

  const handleSaveToDb = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    const cleanName = editName.trim();
    if (!cleanName) {
      setErrorMsg('Vui lòng nhập tên hành động.');
      return;
    }
    const keywords = editKeywords
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const saved = upsertCartoonAnimation({
      id: editId.trim() || cleanName,
      label: cleanName,
      category: activeDef?.category ?? 'custom',
      description: editDesc.trim() || cleanName,
      keywords: keywords.length > 0 ? keywords : [cleanName.toLowerCase()],
      source: activeDef?.source === 'built-in' && !isCreatingNew ? 'built-in' : 'custom',
      updatedAt: Date.now(),
      params: editSpec,
    });
    setIsCreatingNew(false);
    setSelectedId(saved.id);
    setEditId(saved.id);
    setStatusMsg(`Đã lưu "${saved.label}" (${saved.id}) vào Database — Web AI sẽ tự nhận diện ở mọi prompt mới!`);
  };

  const handleDeleteOrHide = async () => {
    if (!activeDef) return;
    deleteCartoonAnimation(activeDef.id);
    setStatusMsg(
      activeDef.source === 'built-in'
        ? `Đã ẩn mẫu mặc định "${activeDef.label}". Có thể khôi phục bất cứ lúc nào.`
        : `Đã xóa hành động "${activeDef.label}".`,
    );
    const next = getAllCartoonAnimations().find((a) => !a.isHidden && a.id !== activeDef.id);
    if (next) loadPresetIntoEditor(next);
  };

  const handleRestore = async (id: string) => {
    restoreBuiltInCartoonAnimation(id);
    const restored = getAllCartoonAnimations().find((a) => a.id === id);
    if (restored) loadPresetIntoEditor(restored);
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(aiPromptText);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleImportAiAnimations = async () => {
    setAiError(null);
    setAiSuccess(null);
    const items = parseCartoonAnimationAiJson(pastedAiJson);
    if (items.length === 0) {
      setAiError('Không nhận diện được JSON hành động hợp lệ. Cần có "name"/"label" và "gesture"/"mood".');
      return;
    }
    const savedIds: string[] = [];
    for (const item of items) {
      const saved = upsertCartoonAnimation(item);
      savedIds.push(saved.id);
    }
    const first = items[0];
    if (onApplyToStage) {
      onApplyToStage(savedIds[0], { ...first.params });
    }
    setAiSuccess(
      `Đã lưu ${items.length} animation vào Database (${savedIds.join(', ')}) và sẵn sàng cho Web AI sử dụng!`,
    );
    setPastedAiJson('');
    const target = getAllCartoonAnimations().find((a) => a.id === savedIds[0]);
    if (target) loadPresetIntoEditor(target);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Animation Studio Nhân vật @Gimmys"
      data-testid="cartoon-animation-studio-modal"
    >
      <div className="bg-white w-full max-w-6xl max-h-[92vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-sky-50 via-white to-indigo-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-600 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                Studio Animation &amp; Biểu cảm @Gimmys
              </h2>
              <p className="text-[11px] text-slate-500">
                Xem trước Live · Sáng tạo hành động mới · Lưu Database cho Web AI tự sử dụng
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
              <button
                type="button"
                onClick={() => setTab('studio')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  tab === 'studio'
                    ? 'bg-white text-sky-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span>Kho &amp; Tùy chỉnh ({allAnimations.filter((a) => !a.isHidden).length})</span>
              </button>
              <button
                type="button"
                data-testid="cartoon-studio-ai-tab"
                onClick={() => setTab('ai-prompt')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  tab === 'ai-prompt'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Câu lệnh Web AI</span>
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng Animation Studio"
              className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {tab === 'studio' ? (
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
            {/* Left Gallery */}
            <div className="lg:col-span-5 flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/50">
              <div className="p-3 border-b border-slate-200 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm hành động, biểu cảm, keyword..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <button
                  type="button"
                  data-testid="cartoon-new-action-btn"
                  onClick={handleStartNew}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg whitespace-nowrap shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tạo mới</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 content-start">
                {filteredList.map((item) => {
                  const active = !isCreatingNew && selectedId === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`p-2.5 rounded-xl border transition-all ${
                        item.isHidden
                          ? 'bg-slate-100/80 border-slate-200 opacity-65'
                          : active
                            ? 'bg-sky-50 border-sky-400 ring-2 ring-sky-100'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => loadPresetIntoEditor(item)}
                        className="w-full text-left space-y-1"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {item.params.badgeEmoji ? `${item.params.badgeEmoji} ` : ''}
                            {item.label}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 text-[9.5px] font-semibold rounded shrink-0 ${
                              item.source === 'custom'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-sky-50 text-sky-700 border border-sky-200'
                            }`}
                          >
                            {item.source === 'custom' ? 'Tùy chỉnh' : 'Mặc định'}
                          </span>
                        </div>
                        <p className="text-[10.5px] text-slate-500 line-clamp-2">{item.description}</p>
                        <div className="text-[10px] font-mono text-slate-400 truncate">
                          {item.id} · {item.params.gestureMode}
                        </div>
                      </button>
                      {item.isHidden && (
                        <button
                          type="button"
                          onClick={() => void handleRestore(item.id)}
                          className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Khôi phục</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Live Preview & Customizer */}
            <div className="lg:col-span-7 overflow-y-auto p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                {/* Live Animated Preview */}
                <div className="md:col-span-5 flex flex-col items-center gap-2">
                  <PreviewCanvas
                    spec={editSpec}
                    isSpeaking={isSpeakingPreview}
                    width={280}
                    height={340}
                    className="w-full max-w-[260px] h-auto shadow-sm"
                  />
                  <div className="flex items-center gap-2 w-full max-w-[260px]">
                    <button
                      type="button"
                      onClick={() => setIsSpeakingPreview((s) => !s)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 whitespace-nowrap"
                    >
                      {isSpeakingPreview ? (
                        <>
                          <Square className="w-3 h-3 fill-current" />
                          <span>Tạm im lặng</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3 fill-current" />
                          <span>Thử Lip-Sync</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Metadata & Expression Controls */}
                <div className="md:col-span-7 space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">
                        Tên Animation
                      </label>
                      <input
                        type="text"
                        aria-label="Tên Animation"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">
                        Mã ID (dùng cho AI)
                      </label>
                      <input
                        type="text"
                        aria-label="Mã ID Animation"
                        disabled={!isCreatingNew && activeDef?.source === 'built-in'}
                        value={editId}
                        onChange={(e) => setEditId(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg disabled:opacity-60"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">
                      Mô tả ngữ cảnh (AI đọc để chọn đúng tình huống)
                    </label>
                    <input
                      type="text"
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">
                        Tâm trạng (Mood)
                      </label>
                      <select
                        value={editSpec.mood}
                        onChange={(e) =>
                          setEditSpec((p) => ({ ...p, mood: e.target.value as CartoonExpressionMood }))
                        }
                        className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      >
                        {MOOD_OPTIONS.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">
                        Cử chỉ tay (Gesture)
                      </label>
                      <select
                        value={editSpec.gestureMode}
                        onChange={(e) =>
                          setEditSpec((p) => ({ ...p, gestureMode: e.target.value as CartoonGestureMode }))
                        }
                        className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      >
                        {GESTURE_OPTIONS.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">
                        Kiểu mắt (Eyes)
                      </label>
                      <select
                        value={editSpec.eyeStyle}
                        onChange={(e) =>
                          setEditSpec((p) => ({ ...p, eyeStyle: e.target.value as CartoonEyeStyle }))
                        }
                        className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      >
                        {EYE_OPTIONS.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">
                        Kiểu miệng (Mouth)
                      </label>
                      <select
                        value={editSpec.mouthStyle}
                        onChange={(e) =>
                          setEditSpec((p) => ({ ...p, mouthStyle: e.target.value as CartoonMouthStyle }))
                        }
                        className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      >
                        {MOUTH_OPTIONS.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">
                        Hiệu ứng FX (Overlay)
                      </label>
                      <select
                        value={editSpec.fxOverlay}
                        onChange={(e) =>
                          setEditSpec((p) => ({ ...p, fxOverlay: e.target.value as CartoonFxOverlay }))
                        }
                        className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      >
                        {FX_OPTIONS.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">
                        Phụ kiện (Accessory)
                      </label>
                      <select
                        value={editSpec.accessory}
                        onChange={(e) =>
                          setEditSpec((p) => ({ ...p, accessory: e.target.value as CartoonAccessory }))
                        }
                        className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                      >
                        {ACCESSORY_OPTIONS.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Physics Sliders & Keywords */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[10.5px] font-semibold text-slate-600 tabular-nums">
                      Tốc độ ({(editSpec.speed ?? 1).toFixed(2)}x)
                    </label>
                    <input
                      type="range"
                      min={0.4}
                      max={2.0}
                      step={0.05}
                      value={editSpec.speed ?? 1}
                      onChange={(e) => setEditSpec((p) => ({ ...p, speed: Number(e.target.value) }))}
                      className="w-full accent-sky-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[10.5px] font-semibold text-slate-600 tabular-nums">
                      Độ nhún ({(editSpec.bounceIntensity ?? 1).toFixed(2)})
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={2.0}
                      step={0.1}
                      value={editSpec.bounceIntensity ?? 1}
                      onChange={(e) => setEditSpec((p) => ({ ...p, bounceIntensity: Number(e.target.value) }))}
                      className="w-full accent-sky-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[10.5px] font-semibold text-slate-600 tabular-nums">
                      Nghiêng đầu ({editSpec.headTiltDeg ?? 0}°)
                    </label>
                    <input
                      type="range"
                      min={-25}
                      max={25}
                      step={1}
                      value={editSpec.headTiltDeg ?? 0}
                      onChange={(e) =>
                        setEditSpec((p) => ({ ...p, headTiltDeg: Number(e.target.value) }))
                      }
                      className="w-full accent-sky-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[10.5px] font-semibold text-slate-600 tabular-nums">
                      Má hồng ({Math.round((editSpec.blushIntensity ?? 0.45) * 100)}%)
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={editSpec.blushIntensity ?? 0.45}
                      onChange={(e) =>
                        setEditSpec((p) => ({ ...p, blushIntensity: Number(e.target.value) }))
                      }
                      className="w-full accent-sky-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                  <div className="sm:col-span-3">
                    <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">
                      Từ khóa kích hoạt tự động theo câu thoại (cách nhau dấu phẩy)
                    </label>
                    <input
                      type="text"
                      value={editKeywords}
                      onChange={(e) => setEditKeywords(e.target.value)}
                      placeholder="celebrate, congrats, awesome, chúc mừng"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">
                      Emoji huy hiệu
                    </label>
                    <input
                      type="text"
                      value={editSpec.badgeEmoji ?? ''}
                      onChange={(e) => setEditSpec((p) => ({ ...p, badgeEmoji: e.target.value }))}
                      placeholder="✨ / 💡 / 🎉"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {errorMsg && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {errorMsg}
                </p>
              )}
              {statusMsg && (
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 font-medium">
                  {statusMsg}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
                {!isCreatingNew && activeDef ? (
                  <button
                    type="button"
                    onClick={() => void handleDeleteOrHide()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-600 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{activeDef.source === 'built-in' ? 'Ẩn mẫu mặc định' : 'Xóa khỏi DB'}</span>
                  </button>
                ) : (
                  <span />
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {onApplyToStage && (
                    <button
                      type="button"
                      data-testid="cartoon-apply-stage-btn"
                      onClick={() => {
                        onApplyToStage(isCreatingNew ? undefined : editId.trim() || undefined, editSpec);
                        onClose();
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 whitespace-nowrap"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Áp dụng ngay lên Preview</span>
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid="cartoon-save-db-btn"
                    onClick={() => void handleSaveToDb()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-xs whitespace-nowrap"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Lưu vào Database</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Web AI Prompt Builder Tab */
          <div className="flex-1 min-h-0 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 bg-slate-50/40">
            <div className="lg:col-span-6 space-y-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Bước 1: Sao chép Câu lệnh để Web AI sáng tạo hành động &amp; biểu cảm @Gimmys
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Mô tả hành động/cảm xúc bạn muốn (hoặc để trống cho AI tự nghĩ loạt biểu cảm mới) → gửi ChatGPT / Gemini / Claude Web để nhận JSON chuẩn cho nhân vật @Gimmys.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Ý tưởng hành động / biểu cảm (tùy chọn)
                </label>
                <input
                  type="text"
                  value={aiIdea}
                  onChange={(e) => setAiIdea(e.target.value)}
                  placeholder="VD: Cầm loa hào hứng chúc mừng học viên đạt điểm tối đa"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <textarea
                aria-label="Prompt AI Web sáng tạo Cartoon Animation"
                readOnly
                rows={15}
                value={aiPromptText}
                className="w-full p-3 text-[11px] font-mono bg-white border border-slate-200 rounded-xl leading-relaxed text-slate-800"
              />

              <button
                type="button"
                data-testid="cartoon-copy-ai-prompt-btn"
                onClick={() => void handleCopyPrompt()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 whitespace-nowrap"
              >
                {copiedPrompt ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedPrompt ? 'Đã sao chép Câu lệnh Web AI!' : 'Sao chép Câu lệnh gửi Web AI'}</span>
              </button>
            </div>

            <div className="lg:col-span-6 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Bước 2: Dán JSON từ Web AI · Xem Preview · Lưu vào Database
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Sau khi lưu, các hành động mới sẽ xuất hiện trong Database và tự động đưa vào Prompt bài học để Web AI dùng ở những lần sau.
                  </p>
                </div>
                <PasteButton
                  size="sm"
                  onPaste={(txt) => {
                    setPastedAiJson(txt);
                    setAiError(null);
                    setAiSuccess(null);
                  }}
                  title="Dán JSON Animation từ Web AI"
                />
              </div>

              <textarea
                aria-label="Dán JSON Animation từ Web AI"
                data-testid="cartoon-paste-ai-json"
                rows={8}
                value={pastedAiJson}
                onChange={(e) => {
                  setPastedAiJson(e.target.value);
                  setAiError(null);
                  setAiSuccess(null);
                }}
                placeholder='Dán JSON { "id": "...", "name": "...", "mood": "...", "gesture": "..." } hoặc mảng [...] vào đây...'
                className="w-full p-3 text-[11px] font-mono bg-white border border-slate-200 rounded-xl leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />

              {parsedAiItems.length > 0 && (
                <div className="p-3 bg-white border border-sky-200 rounded-xl space-y-2.5">
                  <div className="text-xs font-bold text-sky-800">
                    Xem trước Live ({parsedAiItems.length} hành động nhận diện được):
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {parsedAiItems.map((item) => (
                      <div
                        key={item.id}
                        className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 flex flex-col items-center gap-1.5"
                      >
                        <PreviewCanvas spec={item.params} isSpeaking width={180} height={210} />
                        <div className="text-xs font-bold text-slate-900 text-center">
                          {item.params.badgeEmoji ? `${item.params.badgeEmoji} ` : ''}
                          {item.label}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 text-center">
                          {item.id} · {item.params.mood} · {item.params.gestureMode}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {aiError && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                  {aiError}
                </p>
              )}
              {aiSuccess && (
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 font-medium">
                  {aiSuccess}
                </p>
              )}

              <button
                type="button"
                data-testid="cartoon-import-save-btn"
                disabled={!pastedAiJson.trim()}
                onClick={() => void handleImportAiAnimations()}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
              >
                <Save className="w-4 h-4" />
                <span>Lưu vào Database &amp; Áp dụng cho @Gimmys</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
