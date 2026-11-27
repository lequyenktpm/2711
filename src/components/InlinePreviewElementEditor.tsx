import React from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { getEffectiveCartoonAnimationCatalog } from '../engine/cartoonAnimationDb';
import {
  CartoonAnimationParams,
  CartoonExpressionMood,
  ElementLayout,
  IllustrationVariant,
  SceneElement,
  TitleOverlayLayout,
  WatermarkCorner,
  WatermarkOutroConfig,
} from '../engine/types';
import { getEffectiveVectorCatalog } from '../engine/vectorComponentDb';

export type StageOverlayZone = 'intro' | 'outro' | 'watermark' | 'title';

interface InlinePreviewElementEditorProps {
  selectedElement: SceneElement | null;
  resolvedLayout?: ElementLayout | null;
  selectedOverlayZone?: StageOverlayZone | null;
  watermarkConfig?: WatermarkOutroConfig;
  projectTitle?: string;
  titleLayout?: TitleOverlayLayout;
  resolvedTitleBox?: { x: number; y: number; width: number; height: number; scale: number } | null;
  onChangeTitle?: (title: string) => void;
  onChangeTitleLayout?: (next?: TitleOverlayLayout) => void;
  onChangeWatermark?: (wm: WatermarkOutroConfig) => void;
  onUpdateElement?: (id: string, patch: Partial<SceneElement>) => void;
  onResetElementPosition?: (id: string) => void;
  onDeleteElement?: (id: string) => void;
  onClearSelection?: () => void;
  onOpenAnimationStudio?: (
    initialActionId?: string,
    initialSpec?: Partial<CartoonAnimationParams>,
    elementId?: string,
  ) => void;
  stageWidth?: number;
  stageHeight?: number;
}

const MOOD_LIST: { id: CartoonExpressionMood; label: string }[] = [
  { id: 'happy', label: 'Vui' },
  { id: 'excited', label: 'Hào hứng' },
  { id: 'curious', label: 'Tò mò' },
  { id: 'worried', label: 'Cảnh báo / Lo' },
  { id: 'surprised', label: 'Ngạc nhiên' },
  { id: 'proud', label: 'Tự hào' },
  { id: 'cool', label: 'Ngầu' },
  { id: 'sad', label: 'Tiếc nuối' },
  { id: 'shy', label: 'Ngại' },
  { id: 'neutral', label: 'Tự nhiên' },
];

export const InlinePreviewElementEditor: React.FC<InlinePreviewElementEditorProps> = ({
  selectedElement,
  resolvedLayout,
  selectedOverlayZone,
  watermarkConfig,
  projectTitle,
  titleLayout,
  resolvedTitleBox,
  onChangeTitle,
  onChangeTitleLayout,
  onChangeWatermark,
  onUpdateElement,
  onResetElementPosition,
  onDeleteElement,
  onClearSelection,
  onOpenAnimationStudio,
  stageWidth = 1080,
  stageHeight = 1920,
}) => {
  if (!selectedElement && !selectedOverlayZone) return null;

  if (selectedOverlayZone === 'title' && (onChangeTitle || onChangeTitleLayout)) {
    const titleX = Math.round(titleLayout?.x ?? resolvedTitleBox?.x ?? stageWidth / 2);
    const titleY = Math.round(titleLayout?.y ?? resolvedTitleBox?.y ?? 145);
    const titleScale = Number((titleLayout?.scale ?? resolvedTitleBox?.scale ?? 1).toFixed(2));
    const isHidden = Boolean(titleLayout?.hidden);

    const updateTitlePos = (patch: Partial<TitleOverlayLayout>) => {
      onChangeTitleLayout?.({
        ...titleLayout,
        x: titleX,
        y: titleY,
        scale: titleScale,
        ...patch,
      });
    };

    const clampTitleX = (x: number) => Math.round(Math.max(40, Math.min(stageWidth - 40, x)));
    const clampTitleY = (y: number) => Math.round(Math.max(36, Math.min(stageHeight - 40, y)));
    const clampTitleScale = (s: number) => Number(Math.max(0.5, Math.min(1.8, s)).toFixed(2));

    return (
      <div
        data-testid="inline-preview-title-editor"
        className="w-full rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 space-y-2.5 text-xs"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-indigo-950">
            Đang chỉnh ngay dưới Preview: Tên bài giảng (Title)
          </span>
          <div className="flex items-center gap-1.5">
            {onChangeTitleLayout && (
              <button
                type="button"
                onClick={() => onChangeTitleLayout(undefined)}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-white border border-slate-200 text-slate-700 rounded hover:bg-slate-100"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Đặt lại vị trí</span>
              </button>
            )}
            {onClearSelection && (
              <button
                type="button"
                onClick={onClearSelection}
                aria-label="Đóng khung sửa tên bài giảng"
                className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-white/70"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onChangeTitle && (
            <input
              type="text"
              aria-label="Sửa tên bài giảng"
              value={projectTitle ?? ''}
              onChange={(e) => onChangeTitle(e.target.value)}
              placeholder="Nhập tên bài giảng hiển thị trên video..."
              className="flex-1 min-w-[200px] px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-semibold"
            />
          )}
          {onChangeTitleLayout && (
            <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700 cursor-pointer bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
              <input
                type="checkbox"
                checked={isHidden}
                onChange={(e) => updateTitlePos({ hidden: e.target.checked })}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Ẩn tiêu đề</span>
            </label>
          )}
        </div>

        {onChangeTitleLayout && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-indigo-200/70">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10.5px] font-semibold text-slate-600">Vị trí:</span>
              <label className="inline-flex items-center gap-1 text-[10.5px] text-slate-600">
                <span>X</span>
                <input
                  type="number"
                  aria-label="Tọa độ X tên bài giảng"
                  value={titleX}
                  onChange={(e) => updateTitlePos({ x: clampTitleX(Number(e.target.value) || 0) })}
                  className="w-14 px-1.5 py-0.5 text-[11px] font-mono bg-white border border-slate-200 rounded"
                />
              </label>
              <label className="inline-flex items-center gap-1 text-[10.5px] text-slate-600">
                <span>Y</span>
                <input
                  type="number"
                  aria-label="Tọa độ Y tên bài giảng"
                  value={titleY}
                  onChange={(e) => updateTitlePos({ y: clampTitleY(Number(e.target.value) || 0) })}
                  className="w-14 px-1.5 py-0.5 text-[11px] font-mono bg-white border border-slate-200 rounded"
                />
              </label>
              <div className="inline-flex items-center gap-0.5">
                <button
                  type="button"
                  aria-label="Dịch tên bài giảng sang trái"
                  onClick={() => updateTitlePos({ x: clampTitleX(titleX - 12) })}
                  className="p-1 bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-700"
                >
                  <ArrowLeft className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  aria-label="Dịch tên bài giảng lên trên"
                  onClick={() => updateTitlePos({ y: clampTitleY(titleY - 12) })}
                  className="p-1 bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-700"
                >
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  aria-label="Dịch tên bài giảng xuống dưới"
                  onClick={() => updateTitlePos({ y: clampTitleY(titleY + 12) })}
                  className="p-1 bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-700"
                >
                  <ArrowDown className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  aria-label="Dịch tên bài giảng sang phải"
                  onClick={() => updateTitlePos({ x: clampTitleX(titleX + 12) })}
                  className="p-1 bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-700"
                >
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Thu nhỏ tên bài giảng"
                onClick={() => updateTitlePos({ scale: clampTitleScale(titleScale - 0.1) })}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10.5px] font-semibold bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-700"
              >
                <ZoomOut className="w-3 h-3" />
                <span>Thu nhỏ</span>
              </button>
              <input
                type="range"
                aria-label="Tỉ lệ chữ tên bài giảng"
                min={0.5}
                max={1.8}
                step={0.05}
                value={titleScale}
                onChange={(e) => updateTitlePos({ scale: clampTitleScale(Number(e.target.value)) })}
                className="w-20 accent-indigo-600 h-1"
              />
              <button
                type="button"
                aria-label="Phóng to tên bài giảng"
                onClick={() => updateTitlePos({ scale: clampTitleScale(titleScale + 0.1) })}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10.5px] font-semibold bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-700"
              >
                <ZoomIn className="w-3 h-3" />
                <span>Phóng to</span>
              </button>
              <span className="font-mono text-[10.5px] font-semibold text-indigo-700 tabular-nums">
                {Math.round(titleScale * 100)}%
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (selectedOverlayZone && watermarkConfig && onChangeWatermark) {
    return (
      <div
        data-testid="inline-preview-overlay-editor"
        className="w-full rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 space-y-2.5 text-xs"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-indigo-900">
            Đang chỉnh ngay dưới Preview:{' '}
            {selectedOverlayZone === 'intro'
              ? 'Màn hình Intro đầu video'
              : selectedOverlayZone === 'outro'
                ? 'Màn hình Outro cuối video'
                : 'Watermark góc video'}
          </span>
          {onClearSelection && (
            <button
              type="button"
              onClick={onClearSelection}
              aria-label="Đóng khung sửa nhanh"
              className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-white/70"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {selectedOverlayZone === 'intro' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              aria-label="Sửa Nhãn Intro"
              value={watermarkConfig.introBadge ?? ''}
              onChange={(e) =>
                onChangeWatermark({ ...watermarkConfig, introBadge: e.target.value })
              }
              placeholder="Nhãn nhỏ Intro"
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
            />
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-slate-600 shrink-0">Giây Intro:</label>
              <input
                type="number"
                min={0}
                max={10}
                step={0.5}
                value={watermarkConfig.introSeconds ?? 0}
                onChange={(e) =>
                  onChangeWatermark({
                    ...watermarkConfig,
                    introSeconds: Math.max(0, Math.min(10, Number(e.target.value) || 0)),
                  })
                }
                className="w-20 px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg font-mono"
              />
            </div>
            <input
              type="text"
              aria-label="Sửa Tiêu đề chính Intro"
              value={watermarkConfig.introTitle ?? ''}
              onChange={(e) =>
                onChangeWatermark({ ...watermarkConfig, introTitle: e.target.value })
              }
              placeholder={`Tiêu đề Intro (${(projectTitle || '').slice(0, 28)})`}
              className="sm:col-span-2 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-semibold"
            />
            <input
              type="text"
              aria-label="Sửa Phụ đề Intro"
              value={watermarkConfig.introSubtitle ?? ''}
              onChange={(e) =>
                onChangeWatermark({ ...watermarkConfig, introSubtitle: e.target.value })
              }
              placeholder="Phụ đề Intro"
              className="sm:col-span-2 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
            />
          </div>
        )}

        {selectedOverlayZone === 'outro' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              aria-label="Sửa Outro dòng 1"
              value={watermarkConfig.outroLine1}
              onChange={(e) =>
                onChangeWatermark({ ...watermarkConfig, outroLine1: e.target.value })
              }
              placeholder="Outro dòng 1"
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-semibold"
            />
            <input
              type="text"
              aria-label="Sửa Outro dòng 2"
              value={watermarkConfig.outroLine2}
              onChange={(e) =>
                onChangeWatermark({ ...watermarkConfig, outroLine2: e.target.value })
              }
              placeholder="Outro dòng 2"
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
            />
          </div>
        )}

        {selectedOverlayZone === 'watermark' && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              aria-label="Sửa nội dung Watermark"
              value={watermarkConfig.watermarkText}
              onChange={(e) =>
                onChangeWatermark({
                  ...watermarkConfig,
                  watermarkEnabled: true,
                  watermarkText: e.target.value,
                })
              }
              className="flex-1 min-w-[140px] px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-semibold"
            />
            <select
              aria-label="Góc Watermark nhanh"
              value={watermarkConfig.watermarkCorner}
              onChange={(e) =>
                onChangeWatermark({
                  ...watermarkConfig,
                  watermarkCorner: e.target.value as WatermarkCorner,
                })
              }
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
            >
              <option value="top-left">Trên Trái</option>
              <option value="top-right">Trên Phải</option>
              <option value="bottom-left">Dưới Trái</option>
              <option value="bottom-right">Dưới Phải</option>
            </select>
          </div>
        )}
      </div>
    );
  }

  if (!selectedElement || !onUpdateElement) return null;

  const baseLayout = resolvedLayout ?? selectedElement.layout;
  const currentScale = Number((baseLayout.scale || 1).toFixed(2));
  const currentX = Math.round(baseLayout.x);
  const currentY = Math.round(baseLayout.y);
  const isCartoonHost =
    selectedElement.props.kind === 'illustration-prop' &&
    selectedElement.props.variant === 'cartoon-host';

  const commitLayout = (patch: Partial<ElementLayout>) => {
    onUpdateElement(selectedElement.id, {
      layout: {
        ...baseLayout,
        ...patch,
        manualPosition: true,
      },
    });
  };

  const clampScale = (s: number) => Number(Math.max(0.25, Math.min(2.4, s)).toFixed(2));
  const clampX = (x: number) => Math.round(Math.max(40, Math.min(stageWidth - 40, x)));
  const clampY = (y: number) => Math.round(Math.max(40, Math.min(stageHeight - 40, y)));

  const cartoonCatalog = isCartoonHost ? getEffectiveCartoonAnimationCatalog() : [];
  const vectorCatalog =
    selectedElement.props.kind === 'illustration-prop' && !isCartoonHost
      ? getEffectiveVectorCatalog()
      : [];

  return (
    <div
      data-testid="inline-preview-element-editor"
      className={`w-full rounded-xl border p-3 space-y-2.5 text-xs ${
        isCartoonHost
          ? 'border-sky-300 bg-sky-50/75'
          : 'border-indigo-200 bg-slate-50/90'
      }`}
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`px-2 py-0.5 text-[10px] font-bold rounded-md uppercase shrink-0 ${
              isCartoonHost
                ? 'bg-sky-600 text-white'
                : 'bg-indigo-600 text-white'
            }`}
          >
            {isCartoonHost ? '@Gimmys' : selectedElement.type}
          </span>
          <span className="font-bold text-slate-900 truncate">{selectedElement.label}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {selectedElement.layout.manualPosition && onResetElementPosition && (
            <button
              type="button"
              data-testid="inline-reset-pos-btn"
              onClick={() => onResetElementPosition(selectedElement.id)}
              className="inline-flex items-center gap-1 px-2 py-1 text-[10.5px] font-semibold text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-100 whitespace-nowrap"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Đặt lại vị trí</span>
            </button>
          )}
          {onDeleteElement && (
            <button
              type="button"
              onClick={() => onDeleteElement(selectedElement.id)}
              className="inline-flex items-center gap-1 px-2 py-1 text-[10.5px] font-semibold text-rose-600 bg-white border border-rose-200 rounded-md hover:bg-rose-50 whitespace-nowrap"
            >
              <Trash2 className="w-3 h-3" />
              <span>Xóa</span>
            </button>
          )}
          {onClearSelection && (
            <button
              type="button"
              onClick={onClearSelection}
              aria-label="Bỏ chọn phần tử"
              className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Transform Controls: Position X/Y + Shrink/Enlarge Scale */}
      <div className="rounded-lg bg-white border border-slate-200/90 p-2.5 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[10.5px] font-bold text-slate-700">Kích thước:</span>
            <button
              type="button"
              data-testid="inline-shrink-btn"
              onClick={() => commitLayout({ scale: clampScale(currentScale - 0.15) })}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md border border-slate-200 whitespace-nowrap"
            >
              <ZoomOut className="w-3 h-3" />
              <span>Thu nhỏ</span>
            </button>
            <span
              data-testid="inline-scale-value"
              className="px-1.5 font-mono text-[11px] font-bold text-indigo-700 tabular-nums"
            >
              {currentScale.toFixed(2)}x
            </span>
            <button
              type="button"
              data-testid="inline-enlarge-btn"
              onClick={() => commitLayout({ scale: clampScale(currentScale + 0.15) })}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md border border-slate-200 whitespace-nowrap"
            >
              <ZoomIn className="w-3 h-3" />
              <span>Phóng to</span>
            </button>
          </div>

          <input
            type="range"
            aria-label="Tỉ lệ thu phóng component"
            data-testid="inline-scale-slider"
            min={0.25}
            max={2.4}
            step={0.05}
            value={currentScale}
            onChange={(e) => commitLayout({ scale: clampScale(Number(e.target.value)) })}
            className="w-28 sm:w-36 accent-indigo-600 h-1.5 cursor-pointer"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-1.5">
            <span className="text-[10.5px] font-bold text-slate-700">Vị trí (kéo trên canvas hoặc chỉnh):</span>
            <label className="inline-flex items-center gap-1 text-[10.5px] text-slate-600">
              <span>X:</span>
              <input
                type="number"
                aria-label="Tọa độ X"
                data-testid="inline-pos-x"
                value={currentX}
                onChange={(e) => commitLayout({ x: clampX(Number(e.target.value) || 0) })}
                className="w-16 px-1.5 py-0.5 text-[11px] font-mono bg-slate-50 border border-slate-200 rounded tabular-nums"
              />
            </label>
            <label className="inline-flex items-center gap-1 text-[10.5px] text-slate-600">
              <span>Y:</span>
              <input
                type="number"
                aria-label="Tọa độ Y"
                data-testid="inline-pos-y"
                value={currentY}
                onChange={(e) => commitLayout({ y: clampY(Number(e.target.value) || 0) })}
                className="w-16 px-1.5 py-0.5 text-[11px] font-mono bg-slate-50 border border-slate-200 rounded tabular-nums"
              />
            </label>
          </div>

          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              aria-label="Dịch trái"
              onClick={() => commitLayout({ x: clampX(currentX - 24) })}
              className="p-1 bg-slate-50 hover:bg-slate-200 border border-slate-200 rounded text-slate-700"
            >
              <ArrowLeft className="w-3 h-3" />
            </button>
            <button
              type="button"
              aria-label="Dịch lên"
              onClick={() => commitLayout({ y: clampY(currentY - 24) })}
              className="p-1 bg-slate-50 hover:bg-slate-200 border border-slate-200 rounded text-slate-700"
            >
              <ArrowUp className="w-3 h-3" />
            </button>
            <button
              type="button"
              aria-label="Dịch xuống"
              onClick={() => commitLayout({ y: clampY(currentY + 24) })}
              className="p-1 bg-slate-50 hover:bg-slate-200 border border-slate-200 rounded text-slate-700"
            >
              <ArrowDown className="w-3 h-3" />
            </button>
            <button
              type="button"
              aria-label="Dịch phải"
              onClick={() => commitLayout({ x: clampX(currentX + 24) })}
              className="p-1 bg-slate-50 hover:bg-slate-200 border border-slate-200 rounded text-slate-700"
            >
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Cartoon Host (@Gimmys) Action & Animation Controls */}
      {isCartoonHost && selectedElement.props.kind === 'illustration-prop' && (
        <div className="rounded-lg bg-white border border-sky-200 p-2.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-sky-900">
              Hành động &amp; Biểu cảm nhân vật @Gimmys
            </span>
            {onOpenAnimationStudio && (
              <button
                type="button"
                data-testid="inline-open-cartoon-studio"
                onClick={() =>
                  onOpenAnimationStudio(
                    selectedElement.props.kind === 'illustration-prop'
                      ? selectedElement.props.data?.cartoonAction
                      : undefined,
                    selectedElement.props.kind === 'illustration-prop'
                      ? selectedElement.props.data?.cartoonAnimationSpec
                      : undefined,
                    selectedElement.id,
                  )
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-md shadow-xs whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Animation Studio &amp; Câu lệnh AI</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                Hành động mặc định từ Kho DB
              </label>
              <select
                aria-label="Chọn hành động @Gimmys"
                data-testid="inline-cartoon-action-select"
                value={selectedElement.props.data?.cartoonAction || ''}
                onChange={(e) => {
                  const actionId = e.target.value || undefined;
                  const found = cartoonCatalog.find((a) => a.id === actionId);
                  const prevProps = selectedElement.props;
                  if (prevProps.kind !== 'illustration-prop') return;
                  onUpdateElement(selectedElement.id, {
                    props: {
                      ...prevProps,
                      data: {
                        ...(prevProps.data ?? {}),
                        cartoonAction: actionId,
                        cartoonMood: found?.params.mood ?? prevProps.data?.cartoonMood,
                        cartoonAnimationSpec: found ? { ...found.params } : undefined,
                      },
                    },
                  });
                }}
                className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              >
                <option value="">Tự động khớp theo câu thoại &amp; thẻ</option>
                {cartoonCatalog.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.params.badgeEmoji ? `${a.params.badgeEmoji} ` : ''}
                    {a.label} ({a.id})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                Biểu cảm nhanh (Mood)
              </label>
              <select
                aria-label="Chọn biểu cảm @Gimmys"
                value={selectedElement.props.data?.cartoonMood || ''}
                onChange={(e) => {
                  const mood = (e.target.value || undefined) as CartoonExpressionMood | undefined;
                  const prevProps = selectedElement.props;
                  if (prevProps.kind !== 'illustration-prop') return;
                  onUpdateElement(selectedElement.id, {
                    props: {
                      ...prevProps,
                      data: {
                        ...(prevProps.data ?? {}),
                        cartoonMood: mood,
                        cartoonAnimationSpec: mood
                          ? { ...(prevProps.data?.cartoonAnimationSpec ?? {}), mood }
                          : prevProps.data?.cartoonAnimationSpec,
                      },
                    },
                  });
                }}
                className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              >
                <option value="">Tự động theo ngữ cảnh</option>
                {MOOD_LIST.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              aria-label="Tiêu đề bảng @Gimmys"
              value={selectedElement.props.data?.title || ''}
              onChange={(e) => {
                const prevProps = selectedElement.props;
                if (prevProps.kind !== 'illustration-prop') return;
                onUpdateElement(selectedElement.id, {
                  props: {
                    ...prevProps,
                    data: { ...(prevProps.data ?? {}), title: e.target.value },
                  },
                });
              }}
              placeholder="Tiêu đề ngắn hiện trên góc"
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
            <input
              type="text"
              aria-label="Câu nói gợi ý @Gimmys"
              value={selectedElement.props.data?.speechText || ''}
              onChange={(e) => {
                const prevProps = selectedElement.props;
                if (prevProps.kind !== 'illustration-prop') return;
                onUpdateElement(selectedElement.id, {
                  props: {
                    ...prevProps,
                    data: { ...(prevProps.data ?? {}), speechText: e.target.value },
                  },
                });
              }}
              placeholder="Nội dung ngữ cảnh"
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>
        </div>
      )}

      {/* Sentence Card Inline Content Editor */}
      {selectedElement.props.kind === 'sentence-card' && (
        <div className="rounded-lg bg-white border border-slate-200 p-2.5 space-y-2">
          <div>
            <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
              Nội dung thẻ câu
            </label>
            <textarea
              rows={2}
              aria-label="Sửa nội dung thẻ câu"
              data-testid="inline-card-text-input"
              value={selectedElement.props.text}
              onChange={(e) => {
                const prev = selectedElement.props;
                if (prev.kind !== 'sentence-card') return;
                onUpdateElement(selectedElement.id, {
                  label: `Thẻ: ${e.target.value.slice(0, 22)}`,
                  props: { ...prev, text: e.target.value },
                });
              }}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg font-medium"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              aria-label="Sửa phụ đề thẻ"
              value={selectedElement.props.subtext ?? ''}
              onChange={(e) => {
                const prev = selectedElement.props;
                if (prev.kind !== 'sentence-card') return;
                onUpdateElement(selectedElement.id, { props: { ...prev, subtext: e.target.value } });
              }}
              placeholder="Giải thích / nghĩa ngắn"
              className="sm:col-span-2 px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
            <select
              aria-label="Biểu tượng thẻ"
              value={selectedElement.props.badge ?? 'none'}
              onChange={(e) => {
                const prev = selectedElement.props;
                if (prev.kind !== 'sentence-card') return;
                onUpdateElement(selectedElement.id, {
                  props: {
                    ...prev,
                    badge: e.target.value as 'check' | 'cross' | 'question' | 'none',
                  },
                });
              }}
              className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            >
              <option value="none">Không huy hiệu</option>
              <option value="check">Đúng ✓</option>
              <option value="cross">Tránh ✗</option>
              <option value="question">Hỏi ?</option>
            </select>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <input
              type="text"
              aria-label="Từ tô màu nổi bật"
              value={selectedElement.props.emphasisWord ?? ''}
              onChange={(e) => {
                const prev = selectedElement.props;
                if (prev.kind !== 'sentence-card') return;
                onUpdateElement(selectedElement.id, {
                  props: { ...prev, emphasisWord: e.target.value },
                });
              }}
              placeholder="Từ nhấn mạnh"
              className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
            <input
              type="text"
              aria-label="Nhãn dấu mộc thẻ"
              value={selectedElement.props.stampText ?? ''}
              onChange={(e) => {
                const prev = selectedElement.props;
                if (prev.kind !== 'sentence-card') return;
                onUpdateElement(selectedElement.id, {
                  props: { ...prev, stampText: e.target.value },
                });
              }}
              placeholder="Nhãn tem (VD: NATURAL)"
              className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
            <label className="flex items-center justify-between px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[10.5px]">
              <span>Nền</span>
              <input
                type="color"
                value={selectedElement.props.bgColor || '#FFFFFF'}
                onChange={(e) => {
                  const prev = selectedElement.props;
                  if (prev.kind !== 'sentence-card') return;
                  onUpdateElement(selectedElement.id, { props: { ...prev, bgColor: e.target.value } });
                }}
                className="w-5 h-4 border-0 bg-transparent p-0"
              />
            </label>
            <label className="flex items-center justify-between px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[10.5px]">
              <span>Chữ</span>
              <input
                type="color"
                value={selectedElement.props.textColor || '#0F172A'}
                onChange={(e) => {
                  const prev = selectedElement.props;
                  if (prev.kind !== 'sentence-card') return;
                  onUpdateElement(selectedElement.id, {
                    props: { ...prev, textColor: e.target.value },
                  });
                }}
                className="w-5 h-4 border-0 bg-transparent p-0"
              />
            </label>
          </div>
        </div>
      )}

      {/* Topic Pill Editor */}
      {selectedElement.props.kind === 'topic-pill' && (
        <div className="rounded-lg bg-white border border-slate-200 p-2.5 grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
          <input
            type="text"
            aria-label="Sửa nội dung Topic Pill"
            data-testid="inline-pill-text-input"
            value={selectedElement.props.text}
            onChange={(e) => {
              const prev = selectedElement.props;
              if (prev.kind !== 'topic-pill') return;
              onUpdateElement(selectedElement.id, {
                label: `Nhãn: ${e.target.value}`,
                props: { ...prev, text: e.target.value },
              });
            }}
            className="sm:col-span-2 px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg font-semibold"
          />
          <label className="flex items-center justify-between px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[10.5px]">
            <span>Nền</span>
            <input
              type="color"
              value={selectedElement.props.bgColor}
              onChange={(e) => {
                const prev = selectedElement.props;
                if (prev.kind !== 'topic-pill') return;
                onUpdateElement(selectedElement.id, { props: { ...prev, bgColor: e.target.value } });
              }}
              className="w-5 h-4 border-0 bg-transparent p-0"
            />
          </label>
          <label className="flex items-center justify-between px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[10.5px]">
            <span>Chữ</span>
            <input
              type="color"
              value={selectedElement.props.textColor}
              onChange={(e) => {
                const prev = selectedElement.props;
                if (prev.kind !== 'topic-pill') return;
                onUpdateElement(selectedElement.id, { props: { ...prev, textColor: e.target.value } });
              }}
              className="w-5 h-4 border-0 bg-transparent p-0"
            />
          </label>
        </div>
      )}

      {/* Comparison Strip Editor */}
      {selectedElement.props.kind === 'comparison-strip' && (
        <div className="rounded-lg bg-white border border-slate-200 p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10.5px] font-bold text-slate-700">Các mục trên thanh đối chiếu</div>
            <label className="inline-flex items-center gap-1.5 text-[10.5px] font-medium text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(selectedElement.props.singleRow)}
                onChange={(e) => {
                  const prev = selectedElement.props;
                  if (prev.kind !== 'comparison-strip') return;
                  onUpdateElement(selectedElement.id, {
                    props: { ...prev, singleRow: e.target.checked },
                  });
                }}
                className="rounded border-slate-300 text-indigo-600"
              />
              <span>1 hàng ngang gọn</span>
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {selectedElement.props.items.map((it, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <input
                  type="text"
                  aria-label={`Nhãn mục ${idx + 1}`}
                  value={it.label}
                  onChange={(e) => {
                    const prev = selectedElement.props;
                    if (prev.kind !== 'comparison-strip') return;
                    const nextItems = prev.items.map((item, i) =>
                      i === idx ? { ...item, label: e.target.value } : item,
                    );
                    onUpdateElement(selectedElement.id, {
                      props: { ...prev, items: nextItems },
                    });
                  }}
                  className="flex-1 px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded"
                />
                <input
                  type="text"
                  aria-label={`Nhãn phụ mục ${idx + 1}`}
                  value={it.sublabel ?? ''}
                  placeholder="Phụ"
                  onChange={(e) => {
                    const prev = selectedElement.props;
                    if (prev.kind !== 'comparison-strip') return;
                    const nextItems = prev.items.map((item, i) =>
                      i === idx ? { ...item, sublabel: e.target.value } : item,
                    );
                    onUpdateElement(selectedElement.id, {
                      props: { ...prev, items: nextItems },
                    });
                  }}
                  className="w-20 px-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Illustration Prop Editor (non-cartoon-host) */}
      {selectedElement.props.kind === 'illustration-prop' && !isCartoonHost && (() => {
        const illProps = selectedElement.props;
        if (illProps.kind !== 'illustration-prop') return null;
        const d = illProps.data ?? {};
        return (
          <div className="rounded-lg bg-white border border-slate-200 p-2.5 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                  Mẫu minh họa
                </label>
                <select
                  aria-label="Mẫu minh họa"
                  value={illProps.variant}
                  onChange={(e) => {
                    onUpdateElement(selectedElement.id, {
                      label: `Minh họa: ${e.target.value}`,
                      props: { ...illProps, variant: e.target.value as IllustrationVariant },
                    });
                  }}
                  className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                >
                  {vectorCatalog.map((v) => (
                    <option key={v.variant} value={v.variant}>
                      {v.label} ({v.variant})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                  Tiêu đề Component
                </label>
                <input
                  type="text"
                  aria-label="Tiêu đề Component"
                  value={d.title ?? ''}
                  onChange={(e) => {
                    onUpdateElement(selectedElement.id, {
                      props: { ...illProps, data: { ...d, title: e.target.value } },
                    });
                  }}
                  className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                aria-label="Phụ đề minh họa"
                value={d.subtitle ?? ''}
                onChange={(e) => {
                  onUpdateElement(selectedElement.id, {
                    props: { ...illProps, data: { ...d, subtitle: e.target.value } },
                  });
                }}
                placeholder="Phụ đề / mô tả"
                className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
              <input
                type="text"
                aria-label="Nội dung minh họa"
                value={d.speechText ?? ''}
                onChange={(e) => {
                  onUpdateElement(selectedElement.id, {
                    props: { ...illProps, data: { ...d, speechText: e.target.value } },
                  });
                }}
                placeholder="Nội dung / câu ví dụ minh họa"
                className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                aria-label="Từ nhấn mạnh minh họa"
                value={d.highlightWord ?? ''}
                onChange={(e) => {
                  onUpdateElement(selectedElement.id, {
                    props: { ...illProps, data: { ...d, highlightWord: e.target.value } },
                  });
                }}
                placeholder="Từ nhấn mạnh / badge"
                className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
              <input
                type="text"
                aria-label="Công thức hoặc nhãn phụ"
                value={d.formula ?? ''}
                onChange={(e) => {
                  onUpdateElement(selectedElement.id, {
                    props: { ...illProps, data: { ...d, formula: e.target.value } },
                  });
                }}
                placeholder="Công thức / Formula"
                className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
              <input
                type="text"
                aria-label="Danh sách nhãn phân cách dấu phẩy"
                value={(d.labels ?? []).join(', ')}
                onChange={(e) => {
                  const nextLabels = e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  onUpdateElement(selectedElement.id, {
                    props: { ...illProps, data: { ...d, labels: nextLabels } },
                  });
                }}
                placeholder="Nhãn A, Nhãn B, ..."
                className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>

            {Array.isArray(d.checklist) && d.checklist.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-slate-100">
                <div className="text-[10px] font-semibold text-slate-600">Danh sách mục (Checklist)</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {d.checklist.map((item, idx) => (
                    <input
                      key={idx}
                      type="text"
                      aria-label={`Mục checklist ${idx + 1}`}
                      value={item.text}
                      onChange={(e) => {
                        const nextList = d.checklist!.map((it, i) =>
                          i === idx ? { ...it, text: e.target.value } : it,
                        );
                        onUpdateElement(selectedElement.id, {
                          props: { ...illProps, data: { ...d, checklist: nextList } },
                        });
                      }}
                      className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded"
                    />
                  ))}
                </div>
              </div>
            )}

            {Array.isArray(d.upgrades) && d.upgrades.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-slate-100">
                <div className="text-[10px] font-semibold text-slate-600">Cặp nâng cấp (Basic → Natural)</div>
                {d.upgrades.map((up, idx) => (
                  <div key={idx} className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      aria-label={`Mẫu cơ bản ${idx + 1}`}
                      value={up.prompt}
                      onChange={(e) => {
                        const nextUp = d.upgrades!.map((it, i) =>
                          i === idx ? { ...it, prompt: e.target.value } : it,
                        );
                        onUpdateElement(selectedElement.id, {
                          props: { ...illProps, data: { ...d, upgrades: nextUp } },
                        });
                      }}
                      className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded"
                    />
                    <input
                      type="text"
                      aria-label={`Mẫu tự nhiên ${idx + 1}`}
                      value={up.upgrade}
                      onChange={(e) => {
                        const nextUp = d.upgrades!.map((it, i) =>
                          i === idx ? { ...it, upgrade: e.target.value } : it,
                        );
                        onUpdateElement(selectedElement.id, {
                          props: { ...illProps, data: { ...d, upgrades: nextUp } },
                        });
                      }}
                      className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded"
                    />
                  </div>
                ))}
              </div>
            )}

            {Array.isArray(d.boxes) && d.boxes.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-slate-100">
                <div className="text-[10px] font-semibold text-slate-600">Các ô đối chiếu (Boxes)</div>
                {d.boxes.map((bx, idx) => (
                  <div key={idx} className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      aria-label={`Tiêu đề ô ${idx + 1}`}
                      value={bx.title}
                      onChange={(e) => {
                        const nextBoxes = d.boxes!.map((it, i) =>
                          i === idx ? { ...it, title: e.target.value } : it,
                        );
                        onUpdateElement(selectedElement.id, {
                          props: { ...illProps, data: { ...d, boxes: nextBoxes } },
                        });
                      }}
                      className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded"
                    />
                    <input
                      type="text"
                      aria-label={`Phụ đề ô ${idx + 1}`}
                      value={bx.subtitle ?? ''}
                      onChange={(e) => {
                        const nextBoxes = d.boxes!.map((it, i) =>
                          i === idx ? { ...it, subtitle: e.target.value } : it,
                        );
                        onUpdateElement(selectedElement.id, {
                          props: { ...illProps, data: { ...d, boxes: nextBoxes } },
                        });
                      }}
                      className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded"
                    />
                  </div>
                ))}
              </div>
            )}

            {Array.isArray(d.nodes) && d.nodes.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-slate-100">
                <div className="text-[10px] font-semibold text-slate-600">Các nút nội dung (Nodes)</div>
                {d.nodes.map((nd, idx) => (
                  <div key={idx} className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      aria-label={`Nhãn node ${idx + 1}`}
                      value={nd.label}
                      onChange={(e) => {
                        const nextNodes = d.nodes!.map((it, i) =>
                          i === idx ? { ...it, label: e.target.value } : it,
                        );
                        onUpdateElement(selectedElement.id, {
                          props: { ...illProps, data: { ...d, nodes: nextNodes } },
                        });
                      }}
                      className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded"
                    />
                    <input
                      type="text"
                      aria-label={`Phụ đề node ${idx + 1}`}
                      value={nd.sublabel ?? ''}
                      placeholder="Phụ đề"
                      onChange={(e) => {
                        const nextNodes = d.nodes!.map((it, i) =>
                          i === idx ? { ...it, sublabel: e.target.value } : it,
                        );
                        onUpdateElement(selectedElement.id, {
                          props: { ...illProps, data: { ...d, nodes: nextNodes } },
                        });
                      }}
                      className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* 3D Shape Editor */}
      {selectedElement.props.kind === 'shape-3d' && (
        <div className="rounded-lg bg-white border border-slate-200 p-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
          <input
            type="text"
            aria-label="Sửa chữ khối 3D"
            value={selectedElement.props.textContent ?? ''}
            onChange={(e) => {
              const prev = selectedElement.props;
              if (prev.kind !== 'shape-3d') return;
              onUpdateElement(selectedElement.id, {
                props: { ...prev, textContent: e.target.value },
              });
            }}
            placeholder="Nội dung khối 3D"
            className="sm:col-span-2 px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg font-semibold"
          />
          <label className="flex items-center justify-between px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10.5px]">
            <span>Màu khối</span>
            <input
              type="color"
              value={selectedElement.props.fill}
              onChange={(e) => {
                const prev = selectedElement.props;
                if (prev.kind !== 'shape-3d') return;
                onUpdateElement(selectedElement.id, { props: { ...prev, fill: e.target.value } });
              }}
              className="w-5 h-4 border-0 bg-transparent p-0"
            />
          </label>
        </div>
      )}

      {/* Tone Meter Editor */}
      {selectedElement.props.kind === 'tone-meter' && (
        <div className="rounded-lg bg-white border border-slate-200 p-2.5 grid grid-cols-3 gap-2">
          <input
            type="text"
            value={selectedElement.props.title}
            onChange={(e) => {
              const prev = selectedElement.props;
              if (prev.kind !== 'tone-meter') return;
              onUpdateElement(selectedElement.id, { props: { ...prev, title: e.target.value } });
            }}
            placeholder="Tiêu đề"
            className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg"
          />
          <input
            type="text"
            value={selectedElement.props.leftLabel}
            onChange={(e) => {
              const prev = selectedElement.props;
              if (prev.kind !== 'tone-meter') return;
              onUpdateElement(selectedElement.id, {
                props: { ...prev, leftLabel: e.target.value },
              });
            }}
            placeholder="Nhãn trái"
            className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg"
          />
          <input
            type="text"
            value={selectedElement.props.rightLabel}
            onChange={(e) => {
              const prev = selectedElement.props;
              if (prev.kind !== 'tone-meter') return;
              onUpdateElement(selectedElement.id, {
                props: { ...prev, rightLabel: e.target.value },
              });
            }}
            placeholder="Nhãn phải"
            className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg"
          />
        </div>
      )}

      {/* Karaoke Subtitle Editor */}
      {selectedElement.props.kind === 'karaoke-card' && (
        <div className="rounded-lg bg-white border border-slate-200 p-2.5 space-y-2">
          <input
            type="text"
            aria-label="Sửa câu phụ đề Karaoke"
            value={selectedElement.props.words.map((w) => w.word).join(' ')}
            onChange={(e) => {
              const prev = selectedElement.props;
              if (prev.kind !== 'karaoke-card') return;
              const tokens = e.target.value.split(/\s+/).filter(Boolean);
              const sT = prev.words[0]?.start ?? selectedElement.startTime;
              const eT =
                prev.words[prev.words.length - 1]?.end ?? selectedElement.endTime;
              const span = Math.max(0.4, eT - sT);
              const nextWords = tokens.map((w, i) => ({
                word: w,
                start: Number((sT + (span * i) / Math.max(1, tokens.length)).toFixed(3)),
                end: Number((sT + (span * (i + 1)) / Math.max(1, tokens.length)).toFixed(3)),
              }));
              onUpdateElement(selectedElement.id, {
                props: { ...prev, words: nextWords },
              });
            }}
            className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg font-semibold"
          />
          <input
            type="text"
            aria-label="Sửa dòng giải thích dưới phụ đề"
            value={selectedElement.props.helperText ?? ''}
            onChange={(e) => {
              const prev = selectedElement.props;
              if (prev.kind !== 'karaoke-card') return;
              onUpdateElement(selectedElement.id, {
                props: { ...prev, helperText: e.target.value },
              });
            }}
            placeholder="Dòng nghĩa / gợi ý nhỏ bên dưới (tùy chọn)"
            className="w-full px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg"
          />
        </div>
      )}
    </div>
  );
};
