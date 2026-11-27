import React, { useEffect, useState } from 'react';
import { Check, Eye, EyeOff, KeyRound, Trash2 } from 'lucide-react';
import { useClientApiKeys } from '../utils/apiKeysStore';

interface ApiKeyInlineControlProps {
  provider: 'elevenlabs' | 'gemini';
  hasServerKey?: boolean;
  onSaved?: () => void;
  compact?: boolean;
}

export const ApiKeyInlineControl: React.FC<ApiKeyInlineControlProps> = ({
  provider,
  hasServerKey = false,
  onSaved,
  compact = false,
}) => {
  const { keys, saveKeys } = useClientApiKeys();
  const storedKey = provider === 'elevenlabs' ? keys.elevenlabsApiKey : keys.geminiApiKey;
  const [draft, setDraft] = useState(storedKey);
  const [showKey, setShowKey] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setDraft(storedKey);
  }, [storedKey]);

  const label = provider === 'elevenlabs' ? 'ElevenLabs API Key' : 'Gemini API Key';
  const placeholder =
    provider === 'elevenlabs'
      ? 'Dán sk_... ElevenLabs API Key của bạn để dùng trực tiếp trên máy'
      : 'Dán AIza... Gemini API Key để dùng AI & Gemini TTS trực tiếp';

  const handleSave = () => {
    const trimmed = draft.trim();
    if (provider === 'elevenlabs') {
      saveKeys({ elevenlabsApiKey: trimmed });
    } else {
      saveKeys({ geminiApiKey: trimmed });
    }
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 1800);
    onSaved?.();
  };

  const handleClear = () => {
    setDraft('');
    if (provider === 'elevenlabs') {
      saveKeys({ elevenlabsApiKey: '' });
    } else {
      saveKeys({ geminiApiKey: '' });
    }
    onSaved?.();
  };

  const isConnected = Boolean(storedKey) || hasServerKey;

  return (
    <div
      className={`rounded-lg border ${
        isConnected
          ? 'bg-emerald-50/70 border-emerald-200'
          : 'bg-amber-50/80 border-amber-200'
      } ${compact ? 'px-2.5 py-2 space-y-1.5' : 'p-2.5 space-y-2'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
          <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
          <span>{label} (Tự động lưu trên máy, không cần nhập lại)</span>
        </span>
        <span
          className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
            storedKey
              ? 'bg-emerald-100 text-emerald-800'
              : hasServerKey
                ? 'bg-sky-100 text-sky-800'
                : 'bg-amber-100 text-amber-900'
          }`}
        >
          {storedKey
            ? 'Đã lưu vĩnh viễn'
            : hasServerKey
              ? 'Đã lưu từ Server / .env'
              : 'Chưa nhập Key'}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="relative flex-1 min-w-0">
          <input
            type={showKey ? 'text' : 'password'}
            aria-label={`Nhập ${label}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            className="w-full pl-2.5 pr-8 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={() => setShowKey((s) => !s)}
            aria-label={showKey ? 'Ẩn API key' : 'Hiện API key'}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
          >
            {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>

        <button
          type="button"
          onClick={handleSave}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 shrink-0"
        >
          {savedNotice ? <Check className="w-3 h-3" /> : null}
          <span>{savedNotice ? 'Đã lưu' : 'Lưu Key'}</span>
        </button>

        {storedKey && (
          <button
            type="button"
            onClick={handleClear}
            aria-label={`Xóa ${label}`}
            className="p-1.5 text-slate-500 hover:text-rose-600 bg-white border border-slate-200 rounded-md"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
