import React, { useState } from 'react';
import { AlertCircle, Check, ClipboardPaste } from 'lucide-react';

interface PasteButtonProps {
  onPaste: (text: string) => void;
  transformText?: (raw: string) => string;
  targetRef?: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  label?: string;
  title?: string;
  size?: 'xs' | 'sm';
  variant?: 'subtle' | 'indigo' | 'emerald';
  className?: string;
  disabled?: boolean;
}

export const PasteButton: React.FC<PasteButtonProps> = ({
  onPaste,
  transformText,
  targetRef,
  label = 'Dán',
  title = 'Dán nội dung từ Clipboard (thay thế trực tiếp, không cần bôi đen)',
  size = 'xs',
  variant = 'subtle',
  className = '',
  disabled = false,
}) => {
  const [status, setStatus] = useState<'idle' | 'pasted' | 'empty' | 'blocked'>('idle');

  const handleClick = async () => {
    if (disabled) return;
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
        targetRef?.current?.focus();
        setStatus('blocked');
        setTimeout(() => setStatus('idle'), 2000);
        return;
      }
      const raw = await navigator.clipboard.readText();
      if (!raw || !raw.trim()) {
        setStatus('empty');
        setTimeout(() => setStatus('idle'), 1800);
        return;
      }
      const finalValue = transformText ? transformText(raw) : raw;
      onPaste(finalValue);
      setStatus('pasted');
      setTimeout(() => setStatus('idle'), 1600);
    } catch {
      targetRef?.current?.focus();
      setStatus('blocked');
      setTimeout(() => setStatus('idle'), 2200);
    }
  };

  const sizeCls =
    size === 'sm'
      ? 'px-3 py-1.5 text-xs gap-1.5 rounded-lg'
      : 'px-2.5 py-1 text-[11px] gap-1 rounded-md';

  const variantCls =
    status === 'pasted'
      ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
      : status === 'empty' || status === 'blocked'
        ? 'bg-amber-50 border-amber-300 text-amber-800'
        : variant === 'indigo'
          ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
          : variant === 'emerald'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900';

  const displayLabel =
    status === 'pasted'
      ? 'Đã dán'
      : status === 'empty'
        ? 'Clipboard trống'
        : status === 'blocked'
          ? 'Nhấn Ctrl+V'
          : label;

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={disabled}
      title={title}
      data-testid="paste-replace-button"
      className={`inline-flex items-center font-semibold border transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 ${sizeCls} ${variantCls} ${className}`}
    >
      {status === 'pasted' ? (
        <Check className="w-3.5 h-3.5 shrink-0" />
      ) : status === 'empty' || status === 'blocked' ? (
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
      ) : (
        <ClipboardPaste className="w-3.5 h-3.5 shrink-0" />
      )}
      <span>{displayLabel}</span>
    </button>
  );
};
