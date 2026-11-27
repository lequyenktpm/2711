import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Download,
  FileAudio,
  FileText,
  Languages,
  Loader2,
  Mic,
  Play,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { ApiKeyInlineControl } from './ApiKeyInlineControl';
import { PasteButton } from './PasteButton';
import {
  cuesToBlockTranscript,
  cuesToSrt,
  parseTranscriptAuto,
  refineCuesWithWhisperWords,
  stripTimestampsFromScript,
} from '../engine/transcriptParser';
import {
  alignAudioWithProgressJob,
  synthesizeAudioWithProgressJob,
} from '../engine/ttsSyncHelper';
import { TranscriptCue } from '../engine/types';
import {
  detectVoiceLangCode,
  isMultilingualVoiceId,
  pickVoiceForLangCode,
} from '../engine/bilingualTtsHelper';
import { buildApiKeyHeaders, useClientApiKeys } from '../utils/apiKeysStore';
import { notifyEdgeFallbackToGoogle } from '../utils/ttsFallbackNotice';
import {
  loadPersistedSettings,
  PersistedStudioSettings,
  updatePersistedSettings,
  USER_SETTINGS_HYDRATED_EVENT,
  USER_SETTINGS_RESET_EVENT,
} from '../utils/studioSettingsStore';

export interface TtsVoiceOption {
  id: string;
  label: string;
  lang: string;
}

export interface TtsProviderInfo {
  id: string;
  name: string;
  voices: TtsVoiceOption[];
}

interface AudioSubtitleStudioModalProps {
  isOpen: boolean;
  initialTranscriptText?: string;
  onClose: () => void;
  onApplyAudioAndCues: (audioFile: File | null, cues: TranscriptCue[], title?: string) => void;
}

function base64ToFile(base64: string, fileName: string, mimeType = 'audio/mpeg'): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], fileName, { type: mimeType });
}

function downloadTextFile(content: string, fileName: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function parseApiJson<T = Record<string, any>>(
  res: Response,
  fallbackError: string,
): Promise<T> {
  const rawText = await res.text();
  const trimmed = rawText.trim();
  if (!trimmed) {
    if (!res.ok) throw new Error(`${fallbackError} (HTTP ${res.status})`);
    return {} as T;
  }
  if (trimmed.startsWith('<')) {
    if (res.status === 413) {
      throw new Error('File tải lên vượt giới hạn dung lượng (tối đa 250MB).');
    }
    if (res.status === 504 || res.status === 502) {
      throw new Error(
        `Server phản hồi quá hạn (HTTP ${res.status}) khi tải/chạy model Whisper. Hãy thử bấm "Tải trước Model Whisper" hoặc chọn model whisper-small.`,
      );
    }
    throw new Error(
      `Server trả về HTML (HTTP ${res.status}) thay vì JSON — hãy kiểm tra server Node.js hoặc dung lượng file tải lên.`,
    );
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(
      res.ok ? `${fallbackError}: Dữ liệu JSON không hợp lệ.` : `${fallbackError} (HTTP ${res.status})`,
    );
  }
}

const SAMPLE_TTS_SCRIPT = `Stop saying very tired all the time.
Instead, try saying I am exhausted.
At the airport, keep your boarding pass ready at the gate.
Practice speaking one natural phrase every morning.`;

const RE_LINE_HAS_HANZI = /[\u4e00-\u9faf\u3400-\u4dbf]/;
const RE_LINE_HAS_KANA = /[\u3040-\u30ff\u31f0-\u31ff]/;
const RE_LINE_HAS_HANGUL = /[\uac00-\ud7af\u1100-\u11ff]/;
const RE_LINE_HAS_VI_DIACRITIC =
  /[ăđơưảãạằắẳẵặầấẩẫậẻẽẹềếểễệỉĩịỏõọồốổỗộờớởỡợủũụừứửữựỷỹỵĂĐƠƯẢÃẠẰẮẲẴẶẦẤẨẪẬẺẼẸỀẾỂỄỆỈĨỊỎÕỌỒỐỔỖỘỜỚỞỠỢỦŨỤỪỨỬỮỰỶỸỴ]/;
const RE_EXPLANATION_PREFIX =
  /^(?:giải thích|nghĩa|dịch|lưu ý|mẹo|mở bài|tổng kết|kết bài|note|meaning|explanation)\s*[:：\-]/i;

export const AudioSubtitleStudioModal: React.FC<AudioSubtitleStudioModalProps> = ({
  isOpen,
  initialTranscriptText,
  onClose,
  onApplyAudioAndCues,
}) => {
  const [initialSavedModal] = useState(() => loadPersistedSettings().audioModal);
  const [tab, setTab] = useState<'tts' | 'transcribe'>(() => initialSavedModal?.tab || 'tts');

  // TTS state
  const [providers, setProviders] = useState<TtsProviderInfo[]>([]);
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [hasElevenLabsKey, setHasElevenLabsKey] = useState(false);
  const [fasterWhisperAvailable, setFasterWhisperAvailable] = useState(false);
  const [provider, setProvider] = useState<string>(() => initialSavedModal?.provider || 'edge');
  const [voice, setVoice] = useState<string>(() => initialSavedModal?.voice || 'en-US-JennyNeural');
  const [secondaryVoice, setSecondaryVoice] = useState<string>(
    () => initialSavedModal?.secondaryVoice ?? 'vi-VN-HoaiMyNeural',
  );
  const [rate, setRate] = useState<number>(() =>
    typeof initialSavedModal?.rate === 'number' ? initialSavedModal.rate : 1.0,
  );
  const [ttsTitle, setTtsTitle] = useState<string>(
    () => initialSavedModal?.ttsTitle || 'Luyện nói tiếng Anh tự nhiên',
  );
  const [autoSplitLanguages, setAutoSplitLanguages] = useState<boolean>(() =>
    typeof initialSavedModal?.autoSplitLanguages === 'boolean'
      ? initialSavedModal.autoSplitLanguages
      : true,
  );
  const [onlyTargetContentSpeech, setOnlyTargetContentSpeech] = useState<boolean>(() =>
    typeof initialSavedModal?.onlyTargetContentSpeech === 'boolean'
      ? initialSavedModal.onlyTargetContentSpeech
      : false,
  );
  const [ttsText, setTtsText] = useState<string>(() => {
    const cleaned = initialTranscriptText?.trim()
      ? stripTimestampsFromScript(initialTranscriptText)
      : '';
    return cleaned || SAMPLE_TTS_SCRIPT;
  });
  const [autoAlignWhisper, setAutoAlignWhisper] = useState<boolean>(() =>
    typeof initialSavedModal?.autoAlignWhisper === 'boolean'
      ? initialSavedModal.autoAlignWhisper
      : true,
  );
  const [ttsAlignMode, setTtsAlignMode] = useState<'fast-forced' | 'whisper'>(
    () => initialSavedModal?.ttsAlignMode || 'fast-forced',
  );
  const [ttsWhisperModel, setTtsWhisperModel] = useState<string>(
    () => initialSavedModal?.ttsWhisperModel || 'Xenova/whisper-small',
  );
  const [ttsAlignNote, setTtsAlignNote] = useState<string | null>(null);
  const [ttsCleanedNotice, setTtsCleanedNotice] = useState<string | null>(null);
  const { keys: clientKeys } = useClientApiKeys();
  const [ttsPreviewMode, setTtsPreviewMode] = useState<'block' | 'srt'>('block');
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isAligningTts, setIsAligningTts] = useState(false);
  const [ttsProgress, setTtsProgress] = useState(0);
  const [ttsStageLabel, setTtsStageLabel] = useState('');
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [ttsResult, setTtsResult] = useState<{
    audioFile: File;
    audioUrl: string;
    audioBase64: string;
    cues: TranscriptCue[];
    srt: string;
    blockTranscript: string;
    providerUsed: string;
    detectedLanguage?: string;
    durationSec: number;
  } | null>(null);

  // Transcribe state (defaults: faster-whisper Built-in, Xenova/whisper-small for fast CPU/ONNX, .srt)
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [sttService, setSttService] = useState<'faster-whisper' | 'whisper' | 'gemini'>(
    () => initialSavedModal?.sttService || 'faster-whisper',
  );
  const [whisperModel, setWhisperModel] = useState<string>(
    () => initialSavedModal?.whisperModel || 'Xenova/whisper-small',
  );
  const [outputFormat, setOutputFormat] = useState<'srt' | 'vtt'>(
    () => initialSavedModal?.outputFormat || 'srt',
  );
  const [sourceLang, setSourceLang] = useState<string>(() => initialSavedModal?.sourceLang || 'auto');
  const [translateLang, setTranslateLang] = useState<string>(
    () => initialSavedModal?.translateLang || 'none',
  );
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeProgress, setTranscribeProgress] = useState(0);
  const [transcribeStageLabel, setTranscribeStageLabel] = useState<string | null>(null);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [subFormatTab, setSubFormatTab] = useState<'srt' | 'vtt'>(
    () => initialSavedModal?.outputFormat || 'srt',
  );
  const [transcribeResult, setTranscribeResult] = useState<{
    language: string;
    durationSec: number;
    cues: TranscriptCue[];
    srt: string;
    vtt: string;
    audioFile: File | null;
    engineUsed?: string;
    translationEngineUsed?: string;
    modelUsed?: string;
  } | null>(null);
  const [editableSrt, setEditableSrt] = useState<string>('');

  // Whisper cache status & standalone translation state
  const [cachedOnnxModels, setCachedOnnxModels] = useState<string[]>([]);
  const [isPreloadingWhisper, setIsPreloadingWhisper] = useState(false);
  const [whisperPreloadProgress, setWhisperPreloadProgress] = useState(0);
  const [whisperPreloadMsg, setWhisperPreloadMsg] = useState<string | null>(null);

  const [standaloneTargetLang, setStandaloneTargetLang] = useState<string>(
    () => initialSavedModal?.standaloneTargetLang || 'Vietnamese',
  );
  const [standaloneBilingual, setStandaloneBilingual] = useState<boolean>(() =>
    typeof initialSavedModal?.standaloneBilingual === 'boolean'
      ? initialSavedModal.standaloneBilingual
      : true,
  );
  const [standaloneSourceText, setStandaloneSourceText] = useState<string>('');
  const [standaloneSourceName, setStandaloneSourceName] = useState<string>('');
  const [isTranslatingSubs, setIsTranslatingSubs] = useState(false);
  const [translateSubError, setTranslateSubError] = useState<string | null>(null);
  const [translateSubStatus, setTranslateSubStatus] = useState<string | null>(null);

  const mediaInputRef = useRef<HTMLInputElement>(null);
  const srtFileInputRef = useRef<HTMLInputElement>(null);
  const isMountedRef = useRef<boolean>(true);
  const hasMountedPersistRef = useRef<boolean>(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const onHydrated = (ev: Event) => {
      const m = (ev as CustomEvent<PersistedStudioSettings>).detail?.audioModal;
      if (!m) return;
      if (m.tab) setTab(m.tab);
      if (m.provider) setProvider(m.provider);
      if (m.voice) setVoice(m.voice);
      if (m.secondaryVoice !== undefined) setSecondaryVoice(m.secondaryVoice);
      if (typeof m.rate === 'number') setRate(m.rate);
      if (m.ttsTitle) setTtsTitle(m.ttsTitle);
      if (typeof m.autoSplitLanguages === 'boolean') setAutoSplitLanguages(m.autoSplitLanguages);
      if (typeof m.onlyTargetContentSpeech === 'boolean') {
        setOnlyTargetContentSpeech(m.onlyTargetContentSpeech);
      }
      if (typeof m.autoAlignWhisper === 'boolean') setAutoAlignWhisper(m.autoAlignWhisper);
      if (m.ttsAlignMode) setTtsAlignMode(m.ttsAlignMode);
      if (m.ttsWhisperModel) setTtsWhisperModel(m.ttsWhisperModel);
      if (m.sttService) setSttService(m.sttService);
      if (m.whisperModel) setWhisperModel(m.whisperModel);
      if (m.outputFormat) {
        setOutputFormat(m.outputFormat);
        setSubFormatTab(m.outputFormat);
      }
      if (m.sourceLang) setSourceLang(m.sourceLang);
      if (m.translateLang) setTranslateLang(m.translateLang);
      if (m.standaloneTargetLang) setStandaloneTargetLang(m.standaloneTargetLang);
      if (typeof m.standaloneBilingual === 'boolean') setStandaloneBilingual(m.standaloneBilingual);
    };
    const onReset = () => {
      setTab('tts');
      setProvider('edge');
      setVoice('en-US-JennyNeural');
      setSecondaryVoice('vi-VN-HoaiMyNeural');
      setRate(1.0);
      setTtsTitle('Luyện nói tiếng Anh tự nhiên');
      setAutoSplitLanguages(true);
      setOnlyTargetContentSpeech(false);
      setAutoAlignWhisper(true);
      setTtsAlignMode('fast-forced');
      setTtsWhisperModel('Xenova/whisper-small');
      setSttService('faster-whisper');
      setWhisperModel('Xenova/whisper-small');
      setOutputFormat('srt');
      setSubFormatTab('srt');
      setSourceLang('auto');
      setTranslateLang('none');
      setStandaloneTargetLang('Vietnamese');
      setStandaloneBilingual(true);
    };
    window.addEventListener(USER_SETTINGS_HYDRATED_EVENT, onHydrated);
    window.addEventListener(USER_SETTINGS_RESET_EVENT, onReset);
    return () => {
      window.removeEventListener(USER_SETTINGS_HYDRATED_EVENT, onHydrated);
      window.removeEventListener(USER_SETTINGS_RESET_EVENT, onReset);
    };
  }, []);

  useEffect(() => {
    if (!hasMountedPersistRef.current) {
      hasMountedPersistRef.current = true;
      return;
    }
    updatePersistedSettings({
      audioModal: {
        tab,
        provider,
        voice,
        secondaryVoice,
        rate,
        ttsTitle,
        autoSplitLanguages,
        onlyTargetContentSpeech,
        autoAlignWhisper,
        ttsAlignMode,
        ttsWhisperModel,
        sttService,
        whisperModel,
        outputFormat,
        sourceLang,
        translateLang,
        standaloneTargetLang,
        standaloneBilingual,
      },
    });
  }, [
    tab,
    provider,
    voice,
    secondaryVoice,
    rate,
    ttsTitle,
    autoSplitLanguages,
    onlyTargetContentSpeech,
    autoAlignWhisper,
    ttsAlignMode,
    ttsWhisperModel,
    sttService,
    whisperModel,
    outputFormat,
    sourceLang,
    translateLang,
    standaloneTargetLang,
    standaloneBilingual,
  ]);

  const refreshWhisperStatus = () => {
    fetch('/api/whisper/status')
      .then((r) => parseApiJson<{ fasterWhisperAvailable?: boolean; cachedOnnxModels?: string[] }>(r, 'Lỗi kiểm tra Whisper'))
      .then((data) => {
        setFasterWhisperAvailable(Boolean(data?.fasterWhisperAvailable));
        if (Array.isArray(data?.cachedOnnxModels)) {
          setCachedOnnxModels(data.cachedOnnxModels);
        }
      })
      .catch(() => undefined);
  };

  const refreshVoices = () => {
    fetch('/api/tts/voices', { headers: buildApiKeyHeaders() })
      .then((r) => parseApiJson<{
        providers?: TtsProviderInfo[];
        hasGeminiKey?: boolean;
        hasElevenLabsKey?: boolean;
        fasterWhisperAvailable?: boolean;
        whisperStatus?: { cachedOnnxModels?: string[] };
      }>(r, 'Lỗi tải danh sách giọng TTS'))
      .then((data) => {
        if (Array.isArray(data?.providers)) {
          setProviders(data.providers);
          setHasGeminiKey(Boolean(data?.hasGeminiKey));
          setHasElevenLabsKey(Boolean(data?.hasElevenLabsKey));
          setFasterWhisperAvailable(Boolean(data?.fasterWhisperAvailable));
          if (Array.isArray(data?.whisperStatus?.cachedOnnxModels)) {
            setCachedOnnxModels(data.whisperStatus.cachedOnnxModels);
          }
        }
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    if (!isOpen) return;
    if (initialTranscriptText?.trim()) {
      const cleaned = stripTimestampsFromScript(initialTranscriptText);
      if (cleaned) setTtsText(cleaned);
    }
    refreshVoices();
    refreshWhisperStatus();
  }, [isOpen, initialTranscriptText]);

  useEffect(() => {
    return () => {
      if (ttsResult?.audioUrl) URL.revokeObjectURL(ttsResult.audioUrl);
    };
  }, [ttsResult]);

  const effectiveHasGeminiKey = hasGeminiKey || Boolean(clientKeys.geminiApiKey);
  const effectiveHasElevenLabsKey = hasElevenLabsKey || Boolean(clientKeys.elevenlabsApiKey);

  const availableVoices = useMemo(() => {
    if (provider === 'auto') {
      return providers.flatMap((p) => {
        if (p.id === 'gemini' && !effectiveHasGeminiKey) return [];
        if (p.id === 'elevenlabs' && !effectiveHasElevenLabsKey) return [];
        return p.voices;
      });
    }
    return providers.find((p) => p.id === provider)?.voices ?? [];
  }, [providers, provider, effectiveHasGeminiKey, effectiveHasElevenLabsKey]);

  useEffect(() => {
    if (availableVoices.length > 0 && !availableVoices.some((v) => v.id === voice)) {
      setVoice(availableVoices[0].id);
    }
  }, [availableVoices, voice]);

  if (!isOpen) return null;

  const selectedVoiceObj = availableVoices.find((v) => v.id === voice);

  const alignAudioWithWhisperAuto = async (
    audioBase64: string,
    modelId: string,
    referenceText?: string,
  ) => {
    return alignAudioWithProgressJob(
      {
        audioBase64,
        ext: '.mp3',
        lang: 'auto',
        model: modelId,
        referenceText,
        alignMode: ttsAlignMode,
      },
      (pct, lbl) => {
        setTtsProgress(Math.min(99, Math.round(74 + pct * 0.25)));
        setTtsStageLabel(lbl);
      },
    );
  };

  const resolveVoiceForScript = (sampleText: string, preferredVoice: string, preferredLang: string) => {
    if (isMultilingualVoiceId(preferredVoice)) {
      return { voice: preferredVoice, lang: preferredLang };
    }
    const voiceLang = detectVoiceLangCode(preferredVoice) || detectVoiceLangCode(preferredLang);
    if (RE_LINE_HAS_HANZI.test(sampleText) && !RE_LINE_HAS_KANA.test(sampleText) && voiceLang !== 'zh') {
      const zhVoice =
        availableVoices.find((v) => v.lang.toLowerCase().startsWith('zh'))?.id ||
        pickVoiceForLangCode('zh');
      return { voice: zhVoice, lang: 'zh-CN' };
    }
    if (RE_LINE_HAS_KANA.test(sampleText) && voiceLang !== 'ja') {
      const jaVoice =
        availableVoices.find((v) => v.lang.toLowerCase().startsWith('ja'))?.id ||
        pickVoiceForLangCode('ja');
      return { voice: jaVoice, lang: 'ja-JP' };
    }
    if (RE_LINE_HAS_HANGUL.test(sampleText) && voiceLang !== 'ko') {
      const koVoice =
        availableVoices.find((v) => v.lang.toLowerCase().startsWith('ko'))?.id ||
        pickVoiceForLangCode('ko');
      return { voice: koVoice, lang: 'ko-KR' };
    }
    return { voice: preferredVoice, lang: preferredLang };
  };

  const handleSynthesize = async () => {
    const clean = stripTimestampsFromScript(ttsText).trim();
    if (!clean) {
      setTtsError('Hãy nhập nội dung văn bản (mỗi dòng 1 câu) để tạo giọng đọc.');
      return;
    }
    if (clean !== ttsText.trim()) {
      setTtsText(clean);
      setTtsCleanedNotice('Đã tự động loại bỏ timestamp/chỉ số dòng khỏi văn bản để TTS không đọc nhầm.');
    } else {
      setTtsCleanedNotice(null);
    }
    setTtsError(null);
    setTtsAlignNote(null);
    setIsSynthesizing(true);
    setTtsProgress(4);
    setTtsStageLabel('Đang khởi tạo tác vụ đọc TTS...');
    try {
      const secondaryVoiceObj = availableVoices.find((v) => v.id === secondaryVoice);
      const explVoice = secondaryVoice || 'vi-VN-HoaiMyNeural';
      const explLang = secondaryVoiceObj?.lang || 'vi-VN';
      const resolvedPrimary = resolveVoiceForScript(clean, voice, selectedVoiceObj?.lang || 'en-US');
      const useUnifiedMultilingual = isMultilingualVoiceId(resolvedPrimary.voice);

      const requestPayload: Record<string, unknown> = {
        provider,
        voice: resolvedPrimary.voice,
        lang: resolvedPrimary.lang,
        secondaryVoice: useUnifiedMultilingual ? resolvedPrimary.voice : secondaryVoice || undefined,
        secondaryLang: explLang,
        autoSplitLanguages: onlyTargetContentSpeech ? false : autoSplitLanguages,
        singleVoiceMultilingual: useUnifiedMultilingual,
        rate,
      };

      if (onlyTargetContentSpeech) {
        const lines = clean
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        const roleSegments: Array<{
          id: string;
          text: string;
          voice: string;
          lang: string;
          autoSplit: boolean;
        }> = [];
        lines.forEach((line, idx) => {
          const delimMatch = line.match(/^(.*?)\s*(?:::|\|)\s*(.+)$/);
          if (delimMatch) {
            const targetPart = delimMatch[1].trim();
            const explPart = delimMatch[2].trim();
            if (targetPart) {
              const targetMeta = resolveVoiceForScript(
                targetPart,
                resolvedPrimary.voice,
                resolvedPrimary.lang,
              );
              roleSegments.push({
                id: `line-${idx}-target`,
                text: targetPart,
                voice: targetMeta.voice,
                lang: targetMeta.lang,
                autoSplit: false,
              });
            }
            if (explPart) {
              roleSegments.push({
                id: `line-${idx}-expl`,
                text: explPart,
                voice: explVoice,
                lang: explLang,
                autoSplit: false,
              });
            }
            return;
          }
          const hasCjkOrKorean =
            RE_LINE_HAS_HANZI.test(line) || RE_LINE_HAS_KANA.test(line) || RE_LINE_HAS_HANGUL.test(line);
          const isExplanationLine =
            !hasCjkOrKorean && (RE_EXPLANATION_PREFIX.test(line) || RE_LINE_HAS_VI_DIACRITIC.test(line));
          if (isExplanationLine) {
            roleSegments.push({
              id: `line-${idx}-expl`,
              text: line,
              voice: explVoice,
              lang: explLang,
              autoSplit: false,
            });
          } else {
            const targetMeta = resolveVoiceForScript(line, resolvedPrimary.voice, resolvedPrimary.lang);
            roleSegments.push({
              id: `line-${idx}-target`,
              text: line,
              voice: targetMeta.voice,
              lang: targetMeta.lang,
              autoSplit: false,
            });
          }
        });
        requestPayload.segments = roleSegments;
      } else {
        requestPayload.text = clean;
      }

      const executeModalTtsAndApply = async (payloadToRun: Record<string, unknown>) => {
        const data = await synthesizeAudioWithProgressJob(
          payloadToRun,
          (pct, lbl) => {
            const scaled = autoAlignWhisper ? Math.round(pct * 0.72) : pct;
            setTtsProgress(Math.max(4, scaled));
            setTtsStageLabel(lbl);
          },
        );
        if (!data?.audioBase64) {
          throw new Error(data?.error || 'Không thể sinh Audio TTS.');
        }

        // Start from exact per-line timestamps measured from actual TTS MP3 segments
        let finalCues: TranscriptCue[] = data.cues || [];
        let providerUsed = data.providerUsed || String(payloadToRun.provider || provider);
        let detectedLanguage: string | undefined;

        if (autoAlignWhisper && finalCues.length > 0) {
          setIsAligningTts(true);
          setTtsProgress(74);
          setTtsStageLabel(
            ttsAlignMode === 'fast-forced'
              ? 'Đang căn nhịp từng từ theo kịch bản (Fast Forced Align)...'
              : `Đang đồng bộ từng từ qua Whisper (${ttsWhisperModel})...`,
          );
          try {
            const aligned = await alignAudioWithWhisperAuto(data.audioBase64, ttsWhisperModel, clean);
            const whisperWords = Array.isArray(aligned?.words) ? aligned.words : [];
            if (whisperWords.length > 0) {
              finalCues = refineCuesWithWhisperWords(finalCues, whisperWords);
            }
            detectedLanguage = aligned?.language;
            providerUsed = `${providerUsed} + ${aligned?.backendUsed || 'whisper'} (${aligned?.modelUsed || ttsWhisperModel})`;
            setTtsAlignNote(
              `Đã khớp 100% thời lượng Audio cho ${finalCues.length} dòng & tinh chỉnh word-level qua Whisper (${aligned?.modelUsed || ttsWhisperModel})${aligned?.language ? ` · Nhận diện ngôn ngữ: ${aligned.language}` : ''}.`,
            );
          } catch (alignErr) {
            setTtsAlignNote(
              `Đã khớp 100% thời lượng Audio theo từng câu đo từ FFmpeg (${alignErr instanceof Error ? `Whisper bỏ qua: ${alignErr.message}` : 'dùng timing đo trực tiếp'}).`,
            );
          } finally {
            setIsAligningTts(false);
          }
        } else {
          setTtsAlignNote(
            `Đã tự động tính lại toàn bộ mốc thời gian cho ${finalCues.length} dòng khớp 100% thời lượng Audio (${Number(data.durationSec || 0).toFixed(1)}s).`,
          );
        }

        const finalSrt = finalCues.length > 0 ? cuesToSrt(finalCues) : (data.srt || '');
        const blockTranscript = finalCues.length > 0 ? cuesToBlockTranscript(finalCues) : '';

        const safeName = `${ttsTitle.trim().replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 32) || 'tts_audio'}.mp3`;
        const audioFile = base64ToFile(data.audioBase64, safeName, data.mimeType || 'audio/mpeg');
        const audioUrl = URL.createObjectURL(audioFile);

        setTtsProgress(100);
        setTtsStageLabel('Hoàn tất sinh Audio & Phụ đề!');
        setTtsResult((prev) => {
          if (prev?.audioUrl) URL.revokeObjectURL(prev.audioUrl);
          return {
            audioFile,
            audioUrl,
            audioBase64: data.audioBase64!,
            cues: finalCues,
            srt: finalSrt,
            blockTranscript,
            providerUsed,
            detectedLanguage,
            durationSec: Number(data.durationSec || 0),
          };
        });
        return data;
      };

      const data = await executeModalTtsAndApply(requestPayload);
      if (data.edgeFallbackToGoogle) {
        notifyEdgeFallbackToGoogle({
          id: 'audio-studio-edge-fallback',
          sourceLabel: 'Studio Audio & Phụ Đề',
          edgeErrors: data.edgeErrors,
          onRetryEdge: async () => {
            await executeModalTtsAndApply({
              ...requestPayload,
              provider: 'edge',
              strictProvider: true,
            });
          },
        });
      }
    } catch (err) {
      setTtsError(err instanceof Error ? err.message : 'Lỗi khi tạo Audio TTS.');
    } finally {
      setIsSynthesizing(false);
      setTtsProgress(0);
      setTtsStageLabel('');
    }
  };

  const handlePreloadWhisperModel = async () => {
    if (isPreloadingWhisper) return;
    setIsPreloadingWhisper(true);
    setTranscribeError(null);
    setWhisperPreloadProgress(3);
    setWhisperPreloadMsg(`Đang khởi tạo tải model ${whisperModel} trên server...`);
    try {
      const res = await fetch('/api/whisper/preload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: whisperModel }),
      });
      const startData = await parseApiJson<{
        preloadState?: {
          status?: 'idle' | 'downloading' | 'ready' | 'error';
          modelUsed?: string | null;
          backendUsed?: string | null;
          progress?: number;
          progressLabel?: string | null;
          error?: string | null;
        };
        status?: { cachedOnnxModels?: string[] };
        error?: string;
      }>(res, 'Không tải trước được model Whisper');
      if (!res.ok) {
        throw new Error(startData?.error || 'Không tải trước được model Whisper.');
      }
      if (startData?.status?.cachedOnnxModels) {
        setCachedOnnxModels(startData.status.cachedOnnxModels);
      }

      // Poll /api/whisper/status so long downloads never hit HTTP proxy timeouts
      const deadline = Date.now() + 10 * 60 * 1000;
      let done = startData?.preloadState?.status === 'ready';
      if (done) {
        setWhisperPreloadProgress(100);
        setWhisperPreloadMsg(
          `Model sẵn sàng trong cache: ${startData.preloadState?.modelUsed || whisperModel} (${startData.preloadState?.backendUsed || 'built-in'}).`,
        );
      }
      while (!done && isMountedRef.current && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 900));
        const stRes = await fetch('/api/whisper/status');
        const st = await parseApiJson<{
          cachedOnnxModels?: string[];
          preloadState?: {
            status?: 'idle' | 'downloading' | 'ready' | 'error';
            modelUsed?: string | null;
            backendUsed?: string | null;
            progress?: number;
            progressLabel?: string | null;
            error?: string | null;
          };
        }>(stRes, 'Lỗi kiểm tra tiến trình tải Whisper');

        if (Array.isArray(st?.cachedOnnxModels)) {
          setCachedOnnxModels(st.cachedOnnxModels);
        }
        const ps = st?.preloadState;
        if (ps?.status === 'ready') {
          setWhisperPreloadProgress(100);
          setWhisperPreloadMsg(
            `Model sẵn sàng trong cache: ${ps.modelUsed || whisperModel} (${ps.backendUsed || 'built-in'}).`,
          );
          done = true;
          break;
        }
        if (ps?.status === 'error') {
          throw new Error(ps.error || 'Tải model Whisper thất bại.');
        }
        const dlPct = Math.max(4, Math.min(99, Number(ps?.progress ?? 10)));
        setWhisperPreloadProgress(dlPct);
        setWhisperPreloadMsg(
          ps?.progressLabel || `Đang tải & cache model ${whisperModel} (${dlPct}%)...`,
        );
      }
    } catch (err) {
      setWhisperPreloadMsg(null);
      setWhisperPreloadProgress(0);
      setTranscribeError(err instanceof Error ? err.message : 'Lỗi tải trước model Whisper.');
    } finally {
      setIsPreloadingWhisper(false);
    }
  };

  const handleTranscribeMedia = async () => {
    if (!mediaFile) {
      setTranscribeError('Vui lòng chọn file Video (.mp4, .mov) hoặc Audio (.mp3, .wav, .m4a).');
      return;
    }
    setTranscribeError(null);
    setTranslateSubError(null);
    setTranslateSubStatus(null);
    setTranscribeProgress(4);
    setTranscribeStageLabel('Đang gửi file lên server...');
    setIsTranscribing(true);
    try {
      const extMatch = mediaFile.name.match(/(\.[a-z0-9]+)$/i);
      const ext = extMatch ? extMatch[1].toLowerCase() : '.mp4';
      const buf = await mediaFile.arrayBuffer();
      const startRes = await fetch('/api/subtitles/transcribe/start', {
        method: 'POST',
        headers: buildApiKeyHeaders({
          'Content-Type': 'application/octet-stream',
          'x-file-ext': ext,
          'x-engine': sttService,
          'x-whisper-model': whisperModel,
          'x-output-format': outputFormat,
          'x-source-lang': sourceLang,
          'x-translate-lang': translateLang,
        }),
        body: buf,
      });
      const startData = await parseApiJson<{ jobId?: string; error?: string }>(
        startRes,
        'Không thể khởi tạo tác vụ bóc phụ đề',
      );
      if (!startRes.ok || !startData.jobId) {
        throw new Error(startData?.error || 'Không thể khởi tạo tác vụ bóc phụ đề.');
      }

      type TranscribeJobPayload = {
        language?: string;
        durationSec?: number;
        cues?: TranscriptCue[];
        srt?: string;
        vtt?: string;
        audioBase64?: string;
        audioMimeType?: string;
        engineUsed?: string;
        translationEngineUsed?: string;
        modelUsed?: string;
      };

      const deadline = Date.now() + 15 * 60 * 1000;
      let finalPayload: TranscribeJobPayload | null = null;

      while (isMountedRef.current && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 900));
        const pollRes = await fetch(`/api/subtitles/transcribe/${startData.jobId}`);
        const pollData = await parseApiJson<{
          status?: 'running' | 'done' | 'error';
          progress?: number;
          stageLabel?: string;
          error?: string;
          result?: TranscribeJobPayload;
        }>(pollRes, 'Lỗi theo dõi tiến trình bóc phụ đề');

        if (!pollRes.ok) {
          throw new Error(pollData?.error || 'Lỗi theo dõi tiến trình bóc phụ đề.');
        }
        if (typeof pollData.progress === 'number') {
          setTranscribeProgress(Math.max(5, Math.min(99, pollData.progress)));
        }
        if (pollData.stageLabel) {
          setTranscribeStageLabel(pollData.stageLabel);
        }
        if (pollData.status === 'error') {
          throw new Error(pollData.error || 'Bóc tách phụ đề thất bại.');
        }
        if (pollData.status === 'done' && pollData.result) {
          setTranscribeProgress(100);
          finalPayload = pollData.result;
          break;
        }
      }

      if (!finalPayload) {
        throw new Error('Quá thời gian chờ bóc tách phụ đề.');
      }

      let extractedAudio: File | null = mediaFile.type.startsWith('audio/') ? mediaFile : null;
      if (finalPayload.audioBase64) {
        const base = mediaFile.name.replace(/\.[^.]+$/, '') || 'extracted';
        extractedAudio = base64ToFile(
          finalPayload.audioBase64,
          `${base}.mp3`,
          finalPayload.audioMimeType || 'audio/mpeg',
        );
      }

      setTranscribeResult({
        language: finalPayload.language || sourceLang,
        durationSec: Number(finalPayload.durationSec || 0),
        cues: finalPayload.cues || [],
        srt: finalPayload.srt || '',
        vtt: finalPayload.vtt || '',
        audioFile: extractedAudio,
        engineUsed: finalPayload.engineUsed,
        translationEngineUsed: finalPayload.translationEngineUsed,
        modelUsed: finalPayload.modelUsed,
      });
      setSubFormatTab(outputFormat);
      setEditableSrt(finalPayload.srt || '');
      refreshWhisperStatus();
    } catch (err) {
      setTranscribeError(err instanceof Error ? err.message : 'Lỗi bóc phụ đề.');
    } finally {
      setIsTranscribing(false);
      setTranscribeProgress(0);
      setTranscribeStageLabel(null);
    }
  };

  const handleTranslateSubtitleSource = async () => {
    const sourceSrt = standaloneSourceText.trim() || editableSrt.trim() || transcribeResult?.srt || '';
    if (!sourceSrt) {
      setTranslateSubError('Hãy bóc phụ đề hoặc tải lên file .srt / .vtt / .txt trước khi dịch.');
      return;
    }
    setTranslateSubError(null);
    setTranslateSubStatus(null);
    setIsTranslatingSubs(true);
    try {
      const res = await fetch('/api/subtitles/translate', {
        method: 'POST',
        headers: buildApiKeyHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          srt: sourceSrt,
          targetLang: standaloneTargetLang,
          bilingual: standaloneBilingual,
        }),
      });
      const data = await parseApiJson<{
        cues?: TranscriptCue[];
        srt?: string;
        vtt?: string;
        engineUsed?: string;
        error?: string;
      }>(res, 'Không thể dịch phụ đề');
      if (!res.ok || !data?.srt) {
        throw new Error(data?.error || 'Không thể dịch phụ đề.');
      }

      setEditableSrt(data.srt);
      setSubFormatTab('srt');
      setTranscribeResult((prev) => ({
        language: prev?.language ? `${prev.language} → ${standaloneTargetLang}` : standaloneTargetLang,
        durationSec:
          prev?.durationSec ||
          (Array.isArray(data.cues) && data.cues.length > 0
            ? data.cues[data.cues.length - 1].end
            : 0),
        cues: data.cues || [],
        srt: data.srt!,
        vtt: data.vtt || '',
        audioFile: prev?.audioFile || null,
        engineUsed: prev?.engineUsed,
        translationEngineUsed: data.engineUsed,
        modelUsed: prev?.modelUsed,
      }));
      setTranslateSubStatus(
        `Đã dịch ${data.cues?.length ?? 0} câu sang ${standaloneTargetLang} (${standaloneBilingual ? 'Song ngữ' : 'Chỉ ngôn ngữ đích'}) bằng ${data.engineUsed || 'Translator'}.`,
      );
    } catch (err) {
      setTranslateSubError(err instanceof Error ? err.message : 'Lỗi dịch file phụ đề.');
    } finally {
      setIsTranslatingSubs(false);
    }
  };

  const handleApplyTranscribeToStudio = () => {
    if (!transcribeResult) return;
    const editedCues = parseTranscriptAuto(editableSrt);
    const finalCues = editedCues.length > 0 ? editedCues : transcribeResult.cues;
    const title =
      standaloneSourceName?.replace(/\.[^.]+$/, '') ||
      (mediaFile ? mediaFile.name.replace(/\.[^.]+$/, '') : 'Video Subtitles');
    onApplyAudioAndCues(transcribeResult.audioFile, finalCues, title);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="audio-sub-studio-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-[2px] p-4"
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <Mic className="w-4 h-4" />
            </div>
            <div>
              <h2 id="audio-sub-studio-title" className="text-base font-bold text-slate-900">
                Studio Sinh Audio TTS &amp; Whisper STT Đa Ngôn Ngữ
              </h2>
              <p className="text-xs text-slate-500">
                Sinh giọng nói từ kịch bản &amp; tự đồng bộ Whisper word-level, hoặc bóc/dịch phụ đề .srt/.vtt từ Video/Audio ({fasterWhisperAvailable ? 'Python faster-whisper sẵn sàng' : 'Built-in ONNX'})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng Studio Audio & Sub"
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subtabs */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('tts')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              tab === 'tts'
                ? 'bg-white border-indigo-300 text-indigo-700 shadow-xs'
                : 'bg-transparent border-transparent text-slate-600 hover:bg-white/60'
            }`}
          >
            <FileAudio className="w-3.5 h-3.5" />
            <span>1. Tạo Giọng Đọc &amp; Sub</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('transcribe')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              tab === 'transcribe'
                ? 'bg-white border-indigo-300 text-indigo-700 shadow-xs'
                : 'bg-transparent border-transparent text-slate-600 hover:bg-white/60'
            }`}
          >
            <Languages className="w-3.5 h-3.5" />
            <span>2. Bóc &amp; Dịch Phụ Đề</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {tab === 'tts' ? (
            <>
              <div className="px-3.5 py-2.5 rounded-xl bg-indigo-50/70 border border-indigo-200/80 text-[11px] text-indigo-900 space-y-1">
                <div>
                  <strong>Tab 1 (Từ lời thoại → Audio MP3 + Sub khớp 100%):</strong> Tự loại bỏ mốc thời gian cũ khi dán để TTS không đọc timestamp. Sau khi tạo MP3, hệ thống đo thời lượng từng câu và tự đồng bộ từng từ bằng Whisper Local (<code className="font-mono">auto</code> nhận diện ngôn ngữ), đồng thời cập nhật lại toàn bộ mốc thời gian khớp 100% audio.
                </div>
                <div className="text-indigo-700">
                  Các giọng <strong>Edge Neural, Google &amp; Polly</strong> hoạt động miễn phí 100% không cần API key.
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nhà cung cấp Giọng đọc (TTS)
                  </label>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="auto">Tự động miễn phí (Edge Neural → Google → Polly)</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Giọng 1 (Ngoại ngữ chính)
                  </label>
                  <select
                    value={voice}
                    onChange={(e) => setVoice(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {availableVoices.map((v) => (
                      <option key={`${v.lang}-${v.id}`} value={v.id}>
                        {v.label} ({v.lang})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Giọng 2 (Giải thích / Song ngữ)
                  </label>
                  <select
                    aria-label="Giọng 2 giải thích song ngữ"
                    value={secondaryVoice}
                    onChange={(e) => setSecondaryVoice(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Tự chọn theo ngôn ngữ</option>
                    <option value="vi-VN-HoaiMyNeural">Tiếng Việt — Hoài My (vi-VN)</option>
                    <option value="vi-VN-NamMinhNeural">Tiếng Việt — Nam Minh (vi-VN)</option>
                    <option value="en-US-JennyNeural">English US — Jenny (en-US)</option>
                    <option value="ja-JP-NanamiNeural">日本語 — Nanami (ja-JP)</option>
                    <option value="zh-CN-XiaoxiaoNeural">中文 — Xiaoxiao (zh-CN)</option>
                    <option value="ko-KR-SunHiNeural">한국어 — SunHi (ko-KR)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tốc độ đọc: <span className="font-mono text-indigo-600">{rate.toFixed(2)}x</span>
                  </label>
                  <input
                    type="range"
                    min={0.75}
                    max={1.35}
                    step={0.05}
                    value={rate}
                    onChange={(e) => setRate(Number(e.target.value))}
                    className="w-full accent-indigo-600 mt-2"
                  />
                </div>
              </div>

              {provider === 'elevenlabs' && (
                <ApiKeyInlineControl
                  provider="elevenlabs"
                  hasServerKey={hasElevenLabsKey}
                  onSaved={refreshVoices}
                />
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tên bài giảng
                  </label>
                  <input
                    type="text"
                    value={ttsTitle}
                    onChange={(e) => setTtsTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setTtsText(SAMPLE_TTS_SCRIPT)}
                  className="px-3 py-2 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100"
                >
                  Nạp kịch bản mẫu 4 câu
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Lời thoại đọc (tự bỏ dòng timestamp khi dán từ .SRT / Transcript)
                  </label>
                  <div className="flex items-center gap-2">
                    <PasteButton
                      onPaste={(txt) => {
                        const hasTs = /\d{1,2}:\d{2}|-->|^WEBVTT/im.test(txt);
                        const cleaned = hasTs ? stripTimestampsFromScript(txt) : txt;
                        setTtsText(cleaned);
                        if (hasTs) {
                          setTtsCleanedNotice(
                            'Đã dán & tự động bỏ các mốc thời gian — sau khi sinh Audio sẽ tính lại mốc thời gian khớp 100% Audio mới.',
                          );
                        }
                      }}
                      title="Dán nhanh kịch bản đọc (tự bỏ timestamp & thay thế trực tiếp)"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const stripped = stripTimestampsFromScript(ttsText);
                        if (stripped) {
                          setTtsText(stripped);
                          setTtsCleanedNotice('Đã làm sạch toàn bộ timestamp khỏi nội dung đọc.');
                        }
                      }}
                      className="text-[11px] font-medium text-indigo-600 hover:underline whitespace-nowrap"
                    >
                      Làm sạch timestamp
                    </button>
                    <span className="text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
                      {ttsText.split(/\r?\n/).filter((l) => l.trim()).length} câu
                    </span>
                  </div>
                </div>
                <textarea
                  rows={5}
                  value={ttsText}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData('text');
                    if (pasted && /\d{1,2}:\d{2}|-->|^WEBVTT/im.test(pasted)) {
                      e.preventDefault();
                      const cleaned = stripTimestampsFromScript(pasted);
                      const el = e.currentTarget;
                      const start = el.selectionStart ?? ttsText.length;
                      const end = el.selectionEnd ?? ttsText.length;
                      const nextVal = `${ttsText.slice(0, start)}${cleaned}${ttsText.slice(end)}`;
                      setTtsText(nextVal);
                      setTtsCleanedNotice(
                        'Đã tự động bỏ các mốc thời gian khi dán — sau khi sinh Audio sẽ tính lại mốc thời gian khớp 100% Audio mới.',
                      );
                    }
                  }}
                  onChange={(e) => setTtsText(e.target.value)}
                  placeholder="Nhập mỗi câu 1 dòng để sinh Audio + đồng bộ từng từ tự động..."
                  className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {ttsCleanedNotice && (
                  <p className="mt-1 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
                    {ttsCleanedNotice}
                  </p>
                )}
              </div>

              {/* Dual-voice / Role separation options */}
              <div className="px-3.5 py-2.5 rounded-xl bg-violet-50/60 border border-violet-200/80 space-y-2">
                <label className="flex items-start gap-2 text-xs text-slate-800 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyTargetContentSpeech}
                    onChange={(e) => setOnlyTargetContentSpeech(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-violet-600"
                  />
                  <span>
                    Chỉ dùng <strong>Giọng 1 (Ngoại ngữ)</strong> để đọc dòng Từ vựng / Ngữ pháp / Ví dụ ·{' '}
                    <strong>Giọng 2</strong> chỉ đọc dòng giải thích (hoặc phần sau dấu <code className="font-mono">::</code>) — không nhảy giọng giữa câu
                  </span>
                </label>
                {!onlyTargetContentSpeech && (
                  <label className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer pl-5">
                    <input
                      type="checkbox"
                      checked={autoSplitLanguages}
                      onChange={(e) => setAutoSplitLanguages(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600"
                    />
                    <span>Tự nhận diện chuyển giọng ngoại ngữ ↔ tiếng Việt theo mệnh đề trong cùng 1 dòng</span>
                  </label>
                )}
              </div>

              {/* Integrated alignment mode toggle right inside Tab 1 */}
              <div className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2 text-xs text-slate-800 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoAlignWhisper}
                    onChange={(e) => setAutoAlignWhisper(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600"
                  />
                  <span>
                    Tự đồng bộ từng từ ngay khi tạo Audio ({ttsAlignMode === 'fast-forced' ? 'Fast Forced Align <0.2s, không 429' : 'Whisper Local'})
                  </span>
                </label>
                <div className="flex items-center gap-1.5">
                  <select
                    aria-label="Chế độ căn chỉnh từ TTS"
                    value={ttsAlignMode}
                    disabled={!autoAlignWhisper}
                    onChange={(e) => setTtsAlignMode(e.target.value as 'fast-forced' | 'whisper')}
                    className="px-2 py-1 text-[11px] bg-white border border-slate-200 rounded-lg disabled:opacity-50"
                  >
                    <option value="fast-forced">⚡ Fast Forced Align (Siêu nhanh)</option>
                    <option value="whisper">Whisper ONNX (Chậm hơn)</option>
                  </select>
                  {ttsAlignMode === 'whisper' && (
                    <select
                      aria-label="Model Whisper đồng bộ TTS"
                      value={ttsWhisperModel}
                      disabled={!autoAlignWhisper}
                      onChange={(e) => setTtsWhisperModel(e.target.value)}
                      className="px-2.5 py-1 text-[11px] font-mono bg-white border border-slate-200 rounded-lg disabled:opacity-50"
                    >
                      <option value="Xenova/whisper-small">whisper-small (Word-level nhanh)</option>
                      <option value="Xenova/whisper-base">whisper-base</option>
                      <option value="Xenova/whisper-tiny">whisper-tiny (Siêu nhẹ)</option>
                      <option value="large-v3-turbo">large-v3-turbo (Python faster-whisper)</option>
                    </select>
                  )}
                </div>
              </div>

              {ttsError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">
                  {ttsError}
                </p>
              )}
              {ttsAlignNote && (
                <p className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg p-2.5">
                  {ttsAlignNote}
                </p>
              )}

              {isSynthesizing && (
                <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium text-indigo-900">
                    <span className="truncate">{ttsStageLabel || 'Đang tổng hợp Audio TTS...'}</span>
                    <span className="font-mono tabular-nums shrink-0 ml-2">{ttsProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-indigo-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 transition-all duration-200"
                      style={{ width: `${Math.max(4, ttsProgress)}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={isSynthesizing}
                  onClick={() => void handleSynthesize()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60"
                >
                  {isSynthesizing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span>
                    {isAligningTts
                      ? `Đang đồng bộ Whisper (${ttsProgress}%)...`
                      : isSynthesizing
                        ? `Đang tạo Audio TTS (${ttsProgress}%)...`
                        : autoAlignWhisper
                          ? `Sinh Audio MP3 + Đồng bộ Whisper (${ttsWhisperModel})`
                          : 'Sinh Audio MP3 + Sub khớp 100% Audio'}
                  </span>
                </button>
              </div>

              {ttsResult && (
                <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-emerald-900 inline-flex items-center gap-1.5">
                      <Check className="w-4 h-4 text-emerald-600" />
                      Đã tạo Audio ({ttsResult.durationSec.toFixed(1)}s · {ttsResult.cues.length} câu
                      {ttsResult.detectedLanguage ? ` · ${ttsResult.detectedLanguage}` : ''} · {ttsResult.providerUsed})
                    </span>
                    <div className="flex items-center gap-2">
                      <a
                        href={ttsResult.audioUrl}
                        download={ttsResult.audioFile.name}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Tải .mp3</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => downloadTextFile(ttsResult.srt, `${ttsTitle || 'subtitles'}.srt`)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Tải .srt</span>
                      </button>
                    </div>
                  </div>

                  <audio controls src={ttsResult.audioUrl} className="w-full h-9" />

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-emerald-900">
                        Timestamp đã tự động điều chỉnh khớp 100% Audio ({ttsResult.durationSec.toFixed(2)}s):
                      </span>
                      <div className="inline-flex rounded-md border border-emerald-300 bg-white overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setTtsPreviewMode('block')}
                          className={`px-2 py-0.5 text-[10px] font-semibold ${
                            ttsPreviewMode === 'block' ? 'bg-emerald-600 text-white' : 'text-slate-600'
                          }`}
                        >
                          Mốc câu
                        </button>
                        <button
                          type="button"
                          onClick={() => setTtsPreviewMode('srt')}
                          className={`px-2 py-0.5 text-[10px] font-semibold ${
                            ttsPreviewMode === 'srt' ? 'bg-emerald-600 text-white' : 'text-slate-600'
                          }`}
                        >
                          .SRT
                        </button>
                      </div>
                    </div>
                    <textarea
                      readOnly
                      rows={4}
                      value={ttsPreviewMode === 'block' ? ttsResult.blockTranscript : ttsResult.srt}
                      className="w-full p-2.5 text-[11px] font-mono bg-white border border-emerald-200 rounded-lg leading-relaxed text-slate-700"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onApplyAudioAndCues(ttsResult.audioFile, ttsResult.cues, ttsTitle);
                        onClose();
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Nạp Audio + Phụ đề vào KineticSub Studio</span>
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Tab 2: Video / Audio Transcription + Whisper Cache + Standalone Subtitle Translation */
            <>
              <div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
                <strong>Tab 2 (Audio/Video → .SRT/.VTT &amp; Dịch):</strong> Dùng khi bạn đã có file Video/Audio sẵn và muốn bóc lời thoại ra phụ đề <code className="font-mono">.srt</code>/<code className="font-mono">.vtt</code> hoặc dịch file gốc sang ngôn ngữ khác.
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    {mediaFile ? `Đã chọn: ${mediaFile.name}` : 'Tải lên Video hoặc Audio để bóc phụ đề (tối đa 250MB)'}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Hỗ trợ MP4, MOV, MKV, MP3, WAV, M4A · Xuất .srt / .vtt và tách MP3 nạp thẳng vào Studio
                  </div>
                </div>
                <div>
                  <input
                    ref={mediaInputRef}
                    type="file"
                    accept="video/*,audio/*,.mp4,.mov,.mkv,.mp3,.wav,.m4a,.ogg,.webm"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setMediaFile(f);
                      setTranscribeError(null);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => mediaInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{mediaFile ? 'Đổi file Video/Audio' : 'Chọn Video / Audio'}</span>
                  </button>
                </div>
              </div>

              {/* STT Service, Model & Output Config */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-indigo-50/50 border border-indigo-200/80">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    STT Service
                  </label>
                  <select
                    value={sttService}
                    onChange={(e) => setSttService(e.target.value as 'faster-whisper' | 'whisper' | 'gemini')}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg font-medium"
                  >
                    <option value="faster-whisper">faster-whisper (Built-in)</option>
                    <option value="whisper">Local Whisper (ONNX Built-in)</option>
                    <option value="gemini">
                      {effectiveHasGeminiKey
                        ? 'Gemini AI (Đã cấu hình sẵn)'
                        : 'Gemini AI (Cần cấu hình trên server)'}
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Model
                  </label>
                  <select
                    value={whisperModel}
                    disabled={sttService === 'gemini'}
                    onChange={(e) => setWhisperModel(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg font-mono disabled:opacity-50"
                  >
                    <option value="Xenova/whisper-small">whisper-small (Mặc định · Word-level)</option>
                    <option value="Xenova/whisper-base">whisper-base</option>
                    <option value="Xenova/whisper-tiny">whisper-tiny (Siêu nhẹ)</option>
                    <option value="large-v3-turbo">large-v3-turbo (Tự tải / Python faster-whisper)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Output
                  </label>
                  <select
                    value={outputFormat}
                    onChange={(e) => {
                      const fmt = e.target.value as 'srt' | 'vtt';
                      setOutputFormat(fmt);
                      setSubFormatTab(fmt);
                    }}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg font-mono"
                  >
                    <option value="srt">srt (.srt)</option>
                    <option value="vtt">vtt (.vtt)</option>
                  </select>
                </div>

                <div className="sm:col-span-3 flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-indigo-200/60">
                  <div className="text-[11px] text-slate-600 leading-relaxed">
                    <strong>Cache Model trên Server:</strong>{' '}
                    {cachedOnnxModels.length > 0
                      ? `Đã có sẵn ${cachedOnnxModels.join(', ')}`
                      : fasterWhisperAvailable
                        ? 'Python faster-whisper sẵn sàng (tự tải model lần đầu)'
                        : 'Chưa cache model nào — bấm tải trước hoặc bóc sub lần đầu sẽ tự động tải về.'}
                  </div>
                  <button
                    type="button"
                    disabled={isPreloadingWhisper || sttService === 'gemini'}
                    onClick={() => void handlePreloadWhisperModel()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-indigo-700 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 disabled:opacity-50"
                  >
                    {isPreloadingWhisper ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Download className="w-3 h-3" />
                    )}
                    <span>
                      {isPreloadingWhisper
                        ? `Đang tải ${whisperPreloadProgress}%...`
                        : `Tải trước ${whisperModel}`}
                    </span>
                  </button>
                </div>
                {whisperPreloadMsg && (
                  <div className="sm:col-span-3 text-[11px] text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-2 space-y-1.5 font-medium">
                    <div className="flex items-center justify-between">
                      <span className="truncate">{whisperPreloadMsg}</span>
                      {isPreloadingWhisper && (
                        <span className="font-mono tabular-nums ml-2">{whisperPreloadProgress}%</span>
                      )}
                    </div>
                    {isPreloadingWhisper && (
                      <div className="w-full h-1.5 bg-emerald-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 transition-all duration-200"
                          style={{ width: `${Math.max(4, whisperPreloadProgress)}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Ngôn ngữ gốc trong Video / Audio
                  </label>
                  <select
                    value={sourceLang}
                    onChange={(e) => setSourceLang(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                  >
                    <option value="auto">Tự động nhận diện mọi ngôn ngữ</option>
                    <option value="English">English</option>
                    <option value="Vietnamese">Tiếng Việt</option>
                    <option value="Japanese">日本語 (Tiếng Nhật)</option>
                    <option value="Chinese">中文 (Tiếng Trung)</option>
                    <option value="Korean">한국어 (Tiếng Hàn)</option>
                    <option value="French">Français (Tiếng Pháp)</option>
                    <option value="Spanish">Español (Tiếng Tây Ban Nha)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Dịch song ngữ thêm vào phụ đề ({effectiveHasGeminiKey ? 'Dùng Gemini LLM' : 'Dùng Google Translate miễn phí'})
                  </label>
                  <select
                    value={translateLang}
                    onChange={(e) => setTranslateLang(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                  >
                    <option value="none">Chỉ giữ nguyên ngôn ngữ gốc</option>
                    <option value="Vietnamese">Thêm dịch Tiếng Việt</option>
                    <option value="English">Thêm dịch English</option>
                    <option value="Japanese">Thêm dịch Tiếng Nhật</option>
                    <option value="Chinese">Thêm dịch Tiếng Trung</option>
                    <option value="Korean">Thêm dịch Tiếng Hàn</option>
                  </select>
                </div>
              </div>

              {isTranscribing && (
                <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium text-indigo-900">
                    <span className="truncate">{transcribeStageLabel || `Đang xử lý (${whisperModel})...`}</span>
                    <span className="font-mono tabular-nums ml-2">{transcribeProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-indigo-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 transition-all duration-200"
                      style={{ width: `${Math.max(4, transcribeProgress)}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={isTranscribing || !mediaFile}
                onClick={() => void handleTranscribeMedia()}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {isTranscribing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Languages className="w-4 h-4" />
                )}
                <span>
                  {isTranscribing
                    ? `${transcribeStageLabel || `Đang chạy ${sttService}`} (${transcribeProgress}%)`
                    : `Bóc phụ đề (${sttService} · ${whisperModel} → .${outputFormat})`}
                </span>
              </button>

              {transcribeError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">
                  {transcribeError}
                </p>
              )}

              {/* Standalone Subtitle File / Source Translator */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-slate-900 inline-flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Dịch file gốc (.SRT / .VTT / Script) sang ngôn ngữ đích</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Cơ chế dịch: Dùng Google Translate miễn phí tự động. Nạp file <code className="font-mono">.srt</code>/<code className="font-mono">.vtt</code>/<code className="font-mono">.txt</code> hoặc dán nội dung để dịch ngay.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <PasteButton
                      size="sm"
                      onPaste={(txt) => {
                        setStandaloneSourceText(txt);
                        setEditableSrt(txt);
                        setTranslateSubError(null);
                      }}
                      title="Dán nhanh nội dung SRT / VTT / câu gốc (thay thế)"
                    />
                    <input
                      ref={srtFileInputRef}
                      type="file"
                      accept=".srt,.vtt,.txt,.json"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const txt = await f.text();
                        setStandaloneSourceText(txt);
                        setStandaloneSourceName(f.name);
                        setEditableSrt(txt);
                        setTranslateSubError(null);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => srtFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 whitespace-nowrap"
                    >
                      <Upload className="w-3 h-3" />
                      <span>{standaloneSourceName ? `Đã nạp: ${standaloneSourceName}` : 'Chọn file .SRT / .VTT gốc'}</span>
                    </button>
                  </div>
                </div>

                {!transcribeResult && (
                  <textarea
                    rows={3}
                    value={standaloneSourceText}
                    onChange={(e) => setStandaloneSourceText(e.target.value)}
                    placeholder="Hoặc dán trực tiếp nội dung .SRT / .VTT / từng dòng câu gốc tại đây để dịch..."
                    className="w-full p-2.5 text-[11px] font-mono bg-white border border-slate-200 rounded-lg leading-relaxed"
                  />
                )}

                <div className="flex flex-wrap items-center gap-2.5">
                  <select
                    aria-label="Ngôn ngữ đích để dịch phụ đề"
                    value={standaloneTargetLang}
                    onChange={(e) => setStandaloneTargetLang(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                  >
                    <option value="Vietnamese">Dịch sang Tiếng Việt</option>
                    <option value="English">Dịch sang English</option>
                    <option value="Japanese">Dịch sang 日本語 (Tiếng Nhật)</option>
                    <option value="Chinese">Dịch sang 中文 (Tiếng Trung)</option>
                    <option value="Korean">Dịch sang 한국어 (Tiếng Hàn)</option>
                    <option value="French">Dịch sang Français (Tiếng Pháp)</option>
                    <option value="Spanish">Dịch sang Español (Tiếng Tây Ban Nha)</option>
                  </select>

                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={standaloneBilingual}
                      onChange={(e) => setStandaloneBilingual(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600"
                    />
                    <span>Giữ song ngữ (Dòng gốc + Bản dịch)</span>
                  </label>

                  <button
                    type="button"
                    disabled={isTranslatingSubs || (!standaloneSourceText.trim() && !editableSrt.trim() && !transcribeResult?.srt)}
                    onClick={() => void handleTranslateSubtitleSource()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {isTranslatingSubs ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Languages className="w-3.5 h-3.5" />
                    )}
                    <span>{isTranslatingSubs ? 'Đang dịch phụ đề...' : 'Dịch file gốc sang ngôn ngữ đích'}</span>
                  </button>
                </div>

                {translateSubError && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                    {translateSubError}
                  </p>
                )}
                {translateSubStatus && (
                  <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2 font-medium">
                    {translateSubStatus}
                  </p>
                )}
              </div>

              {transcribeResult && (
                <div className="p-4 rounded-xl bg-white border border-emerald-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-emerald-800">
                      {transcribeResult.engineUsed ? `[${transcribeResult.engineUsed}${transcribeResult.modelUsed ? ` · ${transcribeResult.modelUsed}` : ''}] ` : ''}
                      Ngôn ngữ: {transcribeResult.language} · {transcribeResult.cues.length} dòng · {transcribeResult.durationSec.toFixed(1)}s
                      {transcribeResult.translationEngineUsed ? ` · Dịch: ${transcribeResult.translationEngineUsed}` : ''}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {subFormatTab === 'srt' && (
                        <PasteButton
                          onPaste={(txt) => setEditableSrt(txt)}
                          title="Dán nhanh nội dung .SRT mới (thay thế)"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => setSubFormatTab('srt')}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded border ${
                          subFormatTab === 'srt' ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}
                      >
                        .SRT (Sửa trực tiếp)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubFormatTab('vtt')}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded border ${
                          subFormatTab === 'vtt' ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}
                      >
                        .VTT
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadTextFile(editableSrt || transcribeResult.srt, 'subtitles.srt')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100"
                      >
                        <Download className="w-3 h-3" />
                        <span>Tải .srt</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadTextFile(transcribeResult.vtt, 'subtitles.vtt')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100"
                      >
                        <Download className="w-3 h-3" />
                        <span>Tải .vtt</span>
                      </button>
                    </div>
                  </div>

                  {subFormatTab === 'srt' ? (
                    <textarea
                      rows={8}
                      value={editableSrt}
                      onChange={(e) => setEditableSrt(e.target.value)}
                      className="w-full p-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg leading-relaxed"
                    />
                  ) : (
                    <textarea
                      readOnly
                      rows={8}
                      value={transcribeResult.vtt}
                      className="w-full p-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg leading-relaxed"
                    />
                  )}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleApplyTranscribeToStudio}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Nạp {transcribeResult.audioFile ? 'Audio + ' : ''}Phụ đề vào KineticSub Studio</span>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
