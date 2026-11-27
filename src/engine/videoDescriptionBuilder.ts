import { normalizeTtsLangCode } from './bilingualTtsHelper';
import { cleanOutputTitleStem } from './outputNaming';
import { LessonProject, SceneElement, TranscriptCue } from './types';

export type VideoDescriptionStyle = 'auto' | 'hook-bullets' | 'training-guide' | 'phrase-pack';
export type ResolvedVideoDescriptionStyle = Exclude<VideoDescriptionStyle, 'auto'>;

export interface VideoChapterEntry {
  timeSec: number;
  timeLabel: string;
  label: string;
}

export interface VideoDescriptionInput {
  title: string;
  nativeLang?: string;
  learningLang?: string;
  style?: VideoDescriptionStyle;
  project?: LessonProject | null;
  cues?: TranscriptCue[];
  durationSec?: number;
  itemCount?: number;
  thinkSec?: number;
  repeatCount?: number;
  hasCountdown?: boolean;
  topicHint?: string;
  sampleLines?: string[];
}

export interface VideoDescriptionOutput {
  title: string;
  description: string;
  hashtags: string[];
  hashtagsLine: string;
  chapters: VideoChapterEntry[];
  txtContent: string;
  styleUsed: ResolvedVideoDescriptionStyle;
  nativeLangCode: string;
  learningLangCode: string;
}

function formatChapterTime(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function inferLangFromTextSample(text: string): string | null {
  const s = (text || '').trim();
  if (!s) return null;
  if (/[\u3040-\u30ff]/.test(s)) return 'ja';
  if (/[\uac00-\ud7af\u1100-\u11ff]/.test(s)) return 'ko';
  if (/[\u4e00-\u9fff]/.test(s)) return 'zh';
  if (/[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/i.test(s)) return 'vi';
  if (/[ñ¿¡]/i.test(s)) return 'es';
  if (/[çœæàâéèêëîïôùûü]/i.test(s)) return 'fr';
  if (/[a-z]{3,}/i.test(s)) return 'en';
  return null;
}

function normalizeSupportedLang(raw: string | undefined, fallback = 'vi'): string {
  const s = (raw || '').trim();
  if (!s || s.toLowerCase() === 'none' || s.toLowerCase() === 'auto') {
    return fallback;
  }
  const low = s.toLowerCase();
  if (['vi', 'ja', 'en', 'zh', 'ko', 'fr', 'es'].includes(low)) {
    return low;
  }
  const prefix = low.split(/[-_]/)[0];
  if (['vi', 'ja', 'en', 'zh', 'ko', 'fr', 'es'].includes(prefix) && /^([a-z]{2})([-_][a-z]{2,4})+$/i.test(low)) {
    return prefix;
  }
  if (low.includes('việt') || low.includes('viet')) return 'vi';
  if (low.includes('nhật') || low.includes('japan') || low.includes('nihon') || s.includes('日本語')) return 'ja';
  if (low.includes('anh') || low.includes('eng') || s.includes('英語')) return 'en';
  if (low.includes('trung') || low.includes('hoa') || low.includes('chin') || low.includes('mandarin') || s.includes('中文') || s.includes('中国語')) return 'zh';
  if (low.includes('hàn') || low.includes('kor') || s.includes('한국어') || s.includes('韓国語')) return 'ko';
  if (low.includes('pháp') || low.includes('fren') || low.includes('français') || s.includes('フランス語')) return 'fr';
  if (low.includes('tây ban nha') || low.includes('span') || low.includes('español') || s.includes('スペイン語')) return 'es';

  const code = normalizeTtsLangCode(s);
  if (code && ['vi', 'ja', 'en', 'zh', 'ko', 'fr', 'es'].includes(code)) {
    return code;
  }
  return fallback;
}

interface LangLabels {
  displayNameInNative: Record<string, string>;
  introLabel: string;
  practiceLabel: string;
  reviewLabel: string;
  listenLabel: string;
  quizLabel: string;
  outroLabel: string;
}

const NATIVE_UI_LABELS: Record<string, LangLabels> = {
  vi: {
    displayNameInNative: {
      en: 'tiếng Anh',
      ja: 'tiếng Nhật',
      zh: 'tiếng Trung',
      ko: 'tiếng Hàn',
      fr: 'tiếng Pháp',
      es: 'tiếng Tây Ban Nha',
      vi: 'tiếng Việt',
    },
    introLabel: 'Mở đầu',
    practiceLabel: 'Luyện phản xạ & mẫu câu',
    reviewLabel: 'Ôn tập nhanh',
    listenLabel: 'Nghe chìm đắm (Nghe thụ động)',
    quizLabel: 'Thử thách Quiz',
    outroLabel: 'Tổng kết',
  },
  ja: {
    displayNameInNative: {
      en: '英語',
      ja: '日本語',
      zh: '中国語',
      ko: '韓国語',
      fr: 'フランス語',
      es: 'スペイン語',
      vi: 'ベトナム語',
    },
    introLabel: 'はじめ',
    practiceLabel: '瞬間トレーニング',
    reviewLabel: '復習チャレンジ',
    listenLabel: '復習（聞き流し）',
    quizLabel: 'クイズチェック',
    outroLabel: 'まとめ',
  },
  en: {
    displayNameInNative: {
      en: 'English',
      ja: 'Japanese',
      zh: 'Chinese',
      ko: 'Korean',
      fr: 'French',
      es: 'Spanish',
      vi: 'Vietnamese',
    },
    introLabel: 'Intro',
    practiceLabel: 'Instant Speaking Drill',
    reviewLabel: 'Quick Review',
    listenLabel: 'Shadowing & Listening',
    quizLabel: 'Quick Quiz',
    outroLabel: 'Wrap Up',
  },
  zh: {
    displayNameInNative: {
      en: '英语',
      ja: '日语',
      zh: '中文',
      ko: '韩语',
      fr: '法语',
      es: '西班牙语',
      vi: '越南语',
    },
    introLabel: '开场介绍',
    practiceLabel: '句型反射训练',
    reviewLabel: '快速复习挑战',
    listenLabel: '听力跟读复习',
    quizLabel: '小测验',
    outroLabel: '总结',
  },
  ko: {
    displayNameInNative: {
      en: '영어',
      ja: '일본어',
      zh: '중국어',
      ko: '한국어',
      fr: '프랑스어',
      es: '스페인어',
      vi: '베트남어',
    },
    introLabel: '시작하기',
    practiceLabel: '순간 말하기 훈련',
    reviewLabel: '빠른 복습 챌린지',
    listenLabel: '듣기 쉐도잉 복습',
    quizLabel: '퀴즈 체크',
    outroLabel: '마무리',
  },
  fr: {
    displayNameInNative: {
      en: 'anglais',
      ja: 'japonais',
      zh: 'chinois',
      ko: 'coréen',
      fr: 'français',
      es: 'espagnol',
      vi: 'vietnamien',
    },
    introLabel: 'Introduction',
    practiceLabel: 'Entraînement oral',
    reviewLabel: 'Révision rapide',
    listenLabel: 'Écoute & Répétition',
    quizLabel: 'Mini Quiz',
    outroLabel: 'Conclusion',
  },
  es: {
    displayNameInNative: {
      en: 'inglés',
      ja: 'japonés',
      zh: 'chino',
      ko: 'coreano',
      fr: 'francés',
      es: 'español',
      vi: 'vietnamita',
    },
    introLabel: 'Inicio',
    practiceLabel: 'Práctica de reflejo',
    reviewLabel: 'Repaso rápido',
    listenLabel: 'Escucha y repetición',
    quizLabel: 'Mini Quiz',
    outroLabel: 'Resumen',
  },
};

const HASHTAG_POOLS: Record<string, Record<string, string[]>> = {
  vi: {
    en: ['#HocTiengAnh', '#TiengAnhGiaoTiep', '#PhanXaTiengAnh', '#TuVungTiengAnh', '#LuyenNgheNoi', '#TiengAnhHangNgay'],
    ja: ['#HocTiengNhat', '#TiengNhatGiaoTiep', '#PhanXaTiengNhat', '#LuyenNoiTiengNhat', '#JLPT', '#TiengNhatMoiNgay'],
    zh: ['#HocTiengTrung', '#TiengTrungGiaoTiep', '#PhanXaTiengTrung', '#HSK', '#LuyenNoiTiengTrung', '#TuVungTiengTrung'],
    ko: ['#HocTiengHan', '#TiengHanGiaoTiep', '#PhanXaTiengHan', '#TOPIK', '#LuyenNoiTiengHan', '#TiengHanMoiNgay'],
    fr: ['#HocTiengPhap', '#TiengPhapGiaoTiep', '#PhanXaTiengPhap', '#DELF', '#LuyenNoiTiengPhap'],
    es: ['#HocTiengTayBanNha', '#TiengTayBanNha', '#PhanXaNgoaiNgu', '#LuyenNoi'],
    vi: ['#HocTiengViet', '#LuyenNoi', '#GiaoTiep'],
  },
  ja: {
    en: ['#瞬間英作文', '#英語学習', '#英会話', '#英語フレーズ', '#英語リスニング', '#英語スピーキング'],
    ja: ['#日本語学習', '#日本語会話', '#日本語リスニング', '#JLPT'],
    zh: ['#中国語学習', '#中国語会話', '#瞬間作文', '#HSK'],
    ko: ['#韓国語学習', '#韓国語会話', '#TOPIK', '#韓国語フレーズ'],
    fr: ['#フランス語学習', '#フランス語会話', '#語学学習'],
    es: ['#スペイン語学習', '#スペイン語会話', '#語学学習'],
    vi: ['#ベトナム語学習', '#ベトナム語会話', '#語学学習'],
  },
  en: {
    en: ['#LearnEnglish', '#EnglishSpeaking', '#DailyEnglish', '#EnglishPhrases', '#FluentEnglish', '#SpeakEnglish'],
    ja: ['#LearnJapanese', '#JapanesePhrases', '#JLPT', '#SpeakJapanese', '#JapaneseListening'],
    zh: ['#LearnChinese', '#MandarinChinese', '#HSK', '#SpeakChinese', '#ChinesePhrases'],
    ko: ['#LearnKorean', '#KoreanPhrases', '#TOPIK', '#SpeakKorean', '#DailyKorean'],
    fr: ['#LearnFrench', '#FrenchPhrases', '#SpeakFrench', '#DailyFrench'],
    es: ['#LearnSpanish', '#SpanishPhrases', '#SpeakSpanish', '#DailySpanish'],
    vi: ['#LearnVietnamese', '#VietnamesePhrases', '#SpeakVietnamese'],
  },
  zh: {
    en: ['#英语学习', '#英语口语', '#每日英语', '#实用英语', '#英语听力'],
    ja: ['#日语学习', '#日语口语', '#JLPT', '#实用日语'],
    zh: ['#中文学习', '#汉语口语', '#日常中文'],
    ko: ['#韩语学习', '#韩语口语', '#TOPIK'],
    fr: ['#法语学习', '#法语口语'],
    es: ['#西语学习', '#西语口语'],
    vi: ['#越南语学习', '#越南语口语'],
  },
  ko: {
    en: ['#영어회화', '#영어공부', '#원어민영어', '#영어표현', '#스피킹훈련'],
    ja: ['#일본어공부', '#일본어회화', '#JLPT', '#일본어표현'],
    zh: ['#중국어공부', '#중국어회화', '#HSK'],
    ko: ['#한국어공부', '#한국어회화', '#TOPIK'],
    fr: ['#프랑스어공부', '#프랑스어회화'],
    es: ['#스페인어공부', '#스페인어회화'],
    vi: ['#베트남어공부', '#베트남어회화'],
  },
  fr: {
    en: ['#ApprendreLanglais', '#AnglaisQuotidien', '#ExpressionAnglaise', '#ParlerAnglais'],
    ja: ['#ApprendreLeJaponais', '#JaponaisQuotidien', '#JLPT'],
    zh: ['#ApprendreLeChinois', '#ChinoisMandarin', '#HSK'],
    ko: ['#ApprendreLeCoreen', '#CoreenQuotidien'],
    fr: ['#ApprendreLeFrancais', '#FrancaisFacile'],
    es: ['#ApprendreLespagnol', '#EspagnolFacile'],
    vi: ['#ApprendreLeVietnamien'],
  },
  es: {
    en: ['#AprenderIngles', '#InglesDiario', '#FrasesEnIngles', '#HablarIngles'],
    ja: ['#AprenderJapones', '#JaponesDiario', '#JLPT'],
    zh: ['#AprenderChino', '#ChinoMandarin', '#HSK'],
    ko: ['#AprenderCoreano', '#CoreanoDiario'],
    fr: ['#AprenderFrances', '#FrancesFacile'],
    es: ['#AprenderEspanol', '#EspanolFacile'],
    vi: ['#AprenderVietnamita'],
  },
};

function cleanHashToken(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/g, '');
}

function buildChapters(
  project: LessonProject | null | undefined,
  cues: TranscriptCue[] | undefined,
  durationSec: number,
  labels: LangLabels,
): VideoChapterEntry[] {
  const effectiveDur = Math.max(
    1,
    Number(durationSec || project?.duration || (cues && cues.length > 0 ? cues[cues.length - 1].end : 60)),
  );
  const elements: SceneElement[] = project?.elements ?? [];
  const chapters: VideoChapterEntry[] = [{ timeSec: 0, timeLabel: '00:00', label: labels.introLabel }];

  // Try extracting topic-pill milestones or quiz/translation markers
  const milestonePills = elements
    .filter((el) => el.type === 'topic-pill' && el.startTime >= 3)
    .sort((a, b) => a.startTime - b.startTime);

  if (milestonePills.length >= 2) {
    let lastBucketTime = 0;
    const minStep = Math.max(8, effectiveDur / 5.5);
    for (const pill of milestonePills) {
      if (pill.startTime - lastBucketTime < minStep) continue;
      if (chapters.length >= 6) break;
      const rawTxt = pill.props.kind === 'topic-pill' ? String(pill.props.text || '') : '';
      const cleanTxt = rawTxt
        .replace(/^[•·\-\s]+|[•·\-\s]+$/g, '')
        .replace(/^(?:\d+\s*\/\s*\d+\s*·?\s*)/, '')
        .trim()
        .slice(0, 38);
      if (cleanTxt) {
        chapters.push({
          timeSec: Math.round(pill.startTime),
          timeLabel: formatChapterTime(pill.startTime),
          label: cleanTxt,
        });
        lastBucketTime = pill.startTime;
      }
    }
  } else if (cues && cues.length >= 6) {
    const step = Math.max(1, Math.floor(cues.length / 4));
    for (let i = step; i < cues.length && chapters.length < 5; i += step) {
      const cue = cues[i];
      if (cue.start - chapters[chapters.length - 1].timeSec < 8) continue;
      const snippet = cue.text.replace(/\s+/g, ' ').trim().slice(0, 36);
      chapters.push({
        timeSec: Math.round(cue.start),
        timeLabel: formatChapterTime(cue.start),
        label: snippet.length >= 36 ? `${snippet}...` : snippet,
      });
    }
  }

  if (chapters.length === 1 && effectiveDur >= 20) {
    const p1 = Math.max(6, Math.round(effectiveDur * 0.14));
    const p2 = Math.max(p1 + 8, Math.round(effectiveDur * 0.56));
    const p3 = Math.max(p2 + 8, Math.round(effectiveDur * 0.82));
    chapters.push({ timeSec: p1, timeLabel: formatChapterTime(p1), label: labels.practiceLabel });
    chapters.push({ timeSec: p2, timeLabel: formatChapterTime(p2), label: labels.reviewLabel });
    if (p3 < effectiveDur - 4) {
      chapters.push({ timeSec: p3, timeLabel: formatChapterTime(p3), label: labels.listenLabel });
    }
  }

  return chapters;
}

function buildLocalizedDescription(params: {
  style: ResolvedVideoDescriptionStyle;
  title: string;
  nativeLang: string;
  learningLang: string;
  itemCount: number;
  thinkSec: number;
  repeatCount: number;
  chapters: VideoChapterEntry[];
  topicHint?: string;
}): string {
  const { style, title, nativeLang, learningLang, itemCount, thinkSec, repeatCount, chapters } = params;
  const labels = NATIVE_UI_LABELS[nativeLang] ?? NATIVE_UI_LABELS.vi;
  const learnName = labels.displayNameInNative[learningLang] ?? labels.displayNameInNative.en;
  const countNum = Math.max(3, itemCount || 10);
  const secs = Math.max(2, Math.round(thinkSec || 5));
  const fastSecs = Math.max(2, secs - 2);
  const tocBlock = chapters.map((c) => `${c.timeLabel} ${c.label}`).join('\n');

  if (nativeLang === 'ja') {
    if (style === 'hook-bullets') {
      return [
        title,
        `✔ ${learnName}脳を作る瞬間トレーニング`,
        `✔ 日常会話ですぐ使える${learnName}フレーズ`,
        `✔ ネイティブが友達との会話で使う自然な${learnName}表現`,
        'をまとめて、テンポよく学べるようにしています。',
        '',
        `${learnName}は「知っているだけ」では話せません。`,
        `音声のあとに、自分でも${repeatCount > 1 ? `${repeatCount}回` : ''}声に出して練習してみてください。`,
        `${learnName}がスムーズに口から出てくるようになります。`,
        '',
        '保存して何度も練習してください！コメントで質問もお待ちしています。',
      ].join('\n');
    }
    if (style === 'training-guide') {
      return [
        'ご視聴ありがとうございます！🏋️',
        '',
        `このチャンネルでは、短時間の瞬間トレーニングで「知っている${learnName}」を`,
        `「話せる${learnName}」に変える練習をしています。`,
        '',
        `日本語を見て、${secs}秒以内に${learnName}を作る。`,
        `学んだ表現を次は「${fastSecs}秒で答えられるか」チャレンジしてみましょう。`,
        'シンプルな練習を毎日積み重ねて、',
        `日常会話の「瞬発力」を鍛えていきましょう！`,
        '',
        '📝 おすすめの学習方法',
        '',
        '① 日本語を見る',
        `→まずは${learnName}を頭の中でイメージしましょう。`,
        `② ${secs}秒以内に考える`,
        `→できるだけ早く${learnName}を作ってみましょう。`,
        '　分からなくても、まずは自分で考えることが大切です！',
        '③ 声に出して答える',
        '→正解を確認したら、実際に声に出して練習しましょう。',
        '',
        `⚠️ ${learnName}の正解は1つではありません。`,
        'この動画では、日常会話で使いやすい自然な表現を紹介しています。',
        '「自分ならどう言う？」と考えながら、',
        '表現の引き出しを増やしていきましょう！',
        '',
        '◻︎目次',
        tocBlock,
        '',
        'あなたは何問できましたか？😊',
        'ぜひコメント欄で教えてください！',
        '',
        '「塵も積もれば山となる」',
        '1日数分でも、毎日続ければ大きな力になります。',
        `一緒にコツコツ${learnName}力を伸ばしていきましょう！📚✨`,
      ].join('\n');
    }
    return [
      `ネイティブが日常会話で本当に使う${learnName}フレーズを${countNum}個まとめました！`,
      '',
      '友達との会話や普段の生活でそのまま使える、実用的な表現を厳選しています。',
      '',
      '難しい単語ではなく、初心者でも覚えやすいフレーズを中心にしているので、基礎を身につけたい方にもおすすめです。',
      '',
      '通勤・通学中や家事の合間など、スキマ時間の学習にもぜひ活用してください！',
      '',
      '毎日少しずつ繰り返し聞いて、自然に口から出てくるように練習していきましょう！',
      '',
      '👍 動画が役に立ったら高評価・チャンネル登録をお願いします！',
    ].join('\n');
  }

  if (nativeLang === 'vi') {
    if (style === 'hook-bullets') {
      return [
        title,
        `✔ Luyện tư duy phản xạ ${learnName} tự nhiên không cần dịch thầm`,
        `✔ Tổng hợp mẫu câu ${learnName} dùng ngay trong giao tiếp hàng ngày`,
        `✔ Cách người bản xứ nói chuyện thân mật cùng bạn bè & đồng nghiệp`,
        'Tất cả được gói gọn theo nhịp nhanh gọn, dễ nhớ và dễ bật ra ngay.',
        '',
        `Ngoại ngữ chỉ "biết" thôi thì chưa đủ để nói trôi chảy.`,
        `Sau mỗi câu mẫu, hãy đọc to thành tiếng${repeatCount > 1 ? ` (${repeatCount} lần)` : ''} theo audio để rèn phản xạ miệng nhé!`,
        '',
        'Lưu lại video để luyện tập mỗi ngày! Nếu có thắc mắc đừng ngại bình luận bên dưới nhé.',
      ].join('\n');
    }
    if (style === 'training-guide') {
      return [
        'Cảm ơn bạn đã xem video! 🏋️',
        '',
        `Video này giúp bạn biến vốn ${learnName} "đã biết trong đầu"`,
        `thành khả năng "bật ra nói ngay" qua bài luyện phản xạ ngắn mỗi ngày.`,
        '',
        `Nhìn câu tiếng Việt và phản xạ sang ${learnName} trong vòng ${secs} giây.`,
        `Ở lượt ôn tập tiếp theo, hãy tự thử thách trả lời nhanh trong ${fastSecs} giây nhé!`,
        'Luyện đều mỗi ngày sẽ giúp tăng tốc độ phản xạ giao tiếp rõ rệt.',
        '',
        '📝 Phương pháp luyện tập hiệu quả',
        '',
        '① Đọc câu tiếng Việt',
        `→ Hình dung ngay cách diễn đạt bằng ${learnName} trong đầu.`,
        `② Suy nghĩ trong ${secs} giây`,
        '→ Cố gắng tự ghép câu nhanh nhất có thể. Dù chưa chắc đúng hết, bước tự nghĩ vẫn cực kỳ quan trọng!',
        '③ Nói thành tiếng khi hiện đáp án',
        '→ Khi đáp án và âm thanh vang lên, hãy đọc to theo giọng bản xứ.',
        '',
        `⚠️ Trong thực tế, một ý thường có nhiều cách nói khác nhau.`,
        `Video ưu tiên những câu tự nhiên, dễ dùng nhất trong đời sống hàng ngày.`,
        'Hãy luôn tự hỏi "Nếu là mình sẽ nói câu này thế nào?" để mở rộng vốn câu nhé!',
        '',
        '◻︎ Mục lục',
        tocBlock,
        '',
        'Bạn trả lời kịp bao nhiêu câu? 😊',
        'Hãy chia sẻ kết quả dưới phần bình luận nhé!',
        '',
        '"Tích tiểu thành đại" — chỉ cần vài phút mỗi ngày cũng tạo nên khác biệt lớn.',
        `Cùng kiên trì nâng trình ${learnName} mỗi ngày nhé! 📚✨`,
      ].join('\n');
    }
    return [
      `Tổng hợp ${countNum} mẫu câu & từ vựng ${learnName} thực tế người bản xứ hay dùng nhất!`,
      '',
      'Toàn bộ câu được chọn lọc để bạn áp dụng ngay khi nói chuyện với bạn bè, đi làm hoặc sinh hoạt hàng ngày.',
      '',
      'Câu ngắn gọn, dễ nhớ, phù hợp cả cho người mới bắt đầu muốn xây nền phản xạ vững chắc.',
      '',
      'Bạn có thể bật nghe khi di chuyển, làm việc nhà hoặc tranh thủ vài phút rảnh mỗi ngày!',
      '',
      'Nghe lặp lại và nhẩm theo đều đặn để câu nói bật ra thật tự nhiên nhé.',
      '',
      '👍 Nếu thấy video hữu ích, hãy nhấn Thích và Theo dõi kênh để đón xem bài mới!',
    ].join('\n');
  }

  if (nativeLang === 'zh') {
    if (style === 'hook-bullets') {
      return [
        title,
        `✔ 打造${learnName}母语思维的瞬间反应训练`,
        `✔ 日常对话立刻能用的高频${learnName}表达`,
        `✔ 母语者在生活与朋友聊天中最常说的地道句型`,
        '节奏紧凑清晰，帮你把知识真正变成开口能力。',
        '',
        `只靠“看懂”还不够，跟着音频大声说出来${repeatCount > 1 ? `（跟读${repeatCount}遍）` : ''}，`,
        `你会发现${learnName}越来越顺口！`,
        '',
        '记得收藏反复练习！有问题欢迎在评论区留言交流。',
      ].join('\n');
    }
    if (style === 'training-guide') {
      return [
        '感谢观看本视频！🏋️',
        '',
        `通过短时高效的反应训练，把“学过的${learnName}”变成“随时说得出口的${learnName}”。`,
        '',
        `看到提示后，在 ${secs} 秒内快速组织${learnName}句子。`,
        `第二轮挑战自己在 ${fastSecs} 秒内反应出来！每天坚持一点点，口语反应速度会明显提升。`,
        '',
        '📝 推荐练习方法',
        '① 看母语提示 → 先在脑海中快速构思句子',
        `② ${secs} 秒内作答 → 即使不确定，也一定要先自己思考`,
        '③ 大声跟读 → 核对答案后跟着音频开口复述',
        '',
        '⚠️ 地道表达往往不止一种，本视频精选最自然高频的日常说法。',
        '',
        '◻︎ 目录',
        tocBlock,
        '',
        '你答对了多少题？😊 欢迎在评论区打卡！📚✨',
      ].join('\n');
    }
    return [
      `精选 ${countNum} 个母语者日常真正会用到的高频${learnName}表达！`,
      '',
      '句型实用、好记不枯燥，通勤或碎片时间也能轻松跟听练习。',
      '每天重复听读几次，让地道表达自然脱口而出！',
      '',
      '👍 觉得有帮助的话，请点赞并订阅支持！',
    ].join('\n');
  }

  if (nativeLang === 'ko') {
    if (style === 'hook-bullets') {
      return [
        title,
        `✔ ${learnName} 뇌를 만드는 순간 스피킹 훈련`,
        `✔ 일상 회화에서 바로 써먹는 실전 ${learnName} 표현`,
        `✔ 원어민이 친구와 대화할 때 자주 쓰는 자연스러운 문장`,
        '빠르고 리듬감 있게 반복하며 입에 붙도록 구성했습니다.',
        '',
        `${learnName}는 눈으로만 아는 것으로는 말할 수 없습니다.`,
        `음성 뒤에 꼭 소리 내어 따라 말하며 연습해 보세요!`,
        '',
        '저장해 두고 여러 번 반복 연습하세요! 질문은 댓글로 남겨 주세요.',
      ].join('\n');
    }
    if (style === 'training-guide') {
      return [
        '시청해 주셔서 감사합니다! 🏋️',
        '',
        `짧은 순간 작문 트레이닝으로 '알고 있는 ${learnName}'를 '말할 수 있는 ${learnName}'로 바꿔 보세요.`,
        `문장을 보고 ${secs}초 안에 ${learnName}로 말하기! 복습 때는 ${fastSecs}초 챌린지에 도전해 보세요.`,
        '',
        '📝 추천 학습 방법',
        '① 문장 보기 → 먼저 머릿속으로 떠올리기',
        `② ${secs}초 안에 생각하기 → 틀려도 직접 생각해 보는 게 중요해요!`,
        '③ 소리 내어 말하기 → 정답 확인 후 원어민 음성을 따라 읽기',
        '',
        '◻︎ 목차',
        tocBlock,
        '',
        '몇 문제나 맞추셨나요? 😊 댓글로 알려 주세요! 📚✨',
      ].join('\n');
    }
    return [
      `원어민이 일상에서 진짜 자주 쓰는 핵심 ${learnName} 표현 ${countNum}가지를 모았습니다!`,
      '',
      '출퇴근 시간이나 자투리 시간에도 가볍게 듣고 따라 하기 좋은 실용 문장들입니다.',
      '매일 조금씩 반복해 자연스럽게 입에서 나오도록 연습해 보세요!',
      '',
      '👍 도움이 되셨다면 좋아요와 구독 부탁드립니다!',
    ].join('\n');
  }

  if (nativeLang === 'fr') {
    if (style === 'hook-bullets') {
      return [
        title,
        `✔ Développez vos réflexes en ${learnName} sans traduire mot à mot`,
        `✔ Expressions utiles de ${learnName} pour la vie quotidienne`,
        `✔ Tournures naturelles utilisées par les natifs au quotidien`,
        '',
        `Savoir lire ne suffit pas pour parler avec aisance : répétez à voix haute après chaque audio !`,
        'Enregistrez cette vidéo pour vous entraîner régulièrement et posez vos questions en commentaire.',
      ].join('\n');
    }
    if (style === 'training-guide') {
      return [
        'Merci de regarder ! 🏋️',
        '',
        `Transformez vos connaissances passives en ${learnName} parlé grâce au réflexe rapide (${secs}s pour répondre, puis défi ${fastSecs}s).`,
        '',
        '📝 Méthode conseillée',
        `① Lisez l'indice → imaginez la phrase en ${learnName}`,
        `② Réfléchissez en moins de ${secs} secondes`,
        '③ Répondez à voix haute dès la révélation',
        '',
        '◻︎ Chapitres',
        tocBlock,
        '',
        'Combien de phrases avez-vous réussies ? 😊 Dites-le en commentaire ! 📚✨',
      ].join('\n');
    }
    return [
      `Voici ${countNum} phrases essentielles en ${learnName} vraiment utilisées par les natifs au quotidien !`,
      '',
      'Idéal pour réviser dans les transports ou pendant vos pauses : écoutez et répétez chaque jour pour parler naturellement.',
      '👍 Pensez à liker et vous abonner si cette leçon vous aide !',
    ].join('\n');
  }

  if (nativeLang === 'es') {
    if (style === 'hook-bullets') {
      return [
        title,
        `✔ Entrena tu reflejo mental para pensar directamente en ${learnName}`,
        `✔ Frases útiles de ${learnName} para conversaciones reales`,
        `✔ Expresiones naturales que usan los nativos cada día`,
        '',
        'No basta con conocer el vocabulario: ¡practica en voz alta después del audio!',
        'Guarda este video para repasar varias veces y deja tus dudas en los comentarios.',
      ].join('\n');
    }
    if (style === 'training-guide') {
      return [
        '¡Gracias por ver! 🏋️',
        '',
        `Convierte el ${learnName} que ya conoces en fluidez real respondiendo en ${secs} segundos (y luego reto de ${fastSecs} segundos).`,
        '',
        '📝 Cómo practicar',
        `① Mira la frase → piensa la respuesta en ${learnName}`,
        `② Responde antes de ${secs} segundos`,
        '③ Repite en voz alta junto con el audio',
        '',
        '◻︎ Capítulos',
        tocBlock,
        '',
        '¿Cuántas lograste responder a tiempo? 😊 ¡Cuéntanos en los comentarios! 📚✨',
      ].join('\n');
    }
    return [
      `¡Reunimos ${countNum} frases prácticas en ${learnName} que los nativos usan todos los días!`,
      '',
      'Perfecto para escuchar y repetir durante tus trayectos o ratos libres hasta que salgan con naturalidad.',
      '👍 ¡Dale me gusta y suscríbete si te resultó útil!',
    ].join('\n');
  }

  // English native default
  if (style === 'hook-bullets') {
    return [
      title,
      `✔ Build instant ${learnName} speaking reflexes`,
      `✔ High-frequency ${learnName} phrases for daily conversations`,
      `✔ Natural expressions native speakers actually use`,
      '',
      `Knowing ${learnName} passively isn't enough to speak smoothly.`,
      `Repeat out loud${repeatCount > 1 ? ` (${repeatCount}x)` : ''} after each audio prompt so phrases come out automatically!`,
      '',
      'Save this video to practice again, and drop your questions in the comments!',
    ].join('\n');
  }
  if (style === 'training-guide') {
    return [
      'Thanks for watching! 🏋️',
      '',
      `Turn passive ${learnName} knowledge into active speaking fluency with timed instant-response drills (${secs}s think window, then ${fastSecs}s speed check).`,
      '',
      '📝 Recommended Practice Method',
      `① Read the prompt → picture the ${learnName} phrase in your head`,
      `② Think within ${secs} seconds — trying first builds real memory!`,
      '③ Speak out loud when the answer appears',
      '',
      `⚠️ There is often more than one natural way to say the same idea — focus on clear, everyday ${learnName}.`,
      '',
      '◻︎ Chapters',
      tocBlock,
      '',
      'How many did you get right? 😊 Let us know in the comments! 📚✨',
    ].join('\n');
  }
  return [
    `${countNum} essential everyday ${learnName} phrases that native speakers actually use!`,
    '',
    'Clear, practical, and easy to shadow during your commute or daily routine.',
    'Listen and repeat a few minutes every day until the patterns feel effortless!',
    '',
    '👍 Like & subscribe if this practice helped you!',
  ].join('\n');
}

function buildHashtags(params: {
  title: string;
  nativeLang: string;
  learningLang: string;
  topicHint?: string;
  hasCountdown?: boolean;
}): string[] {
  const { title, nativeLang, learningLang, topicHint, hasCountdown } = params;
  const pool =
    HASHTAG_POOLS[nativeLang]?.[learningLang] ??
    HASHTAG_POOLS[nativeLang]?.en ??
    HASHTAG_POOLS.vi.en;

  const tags: string[] = [...pool];

  // Add level tag if detected (e.g. N1..N5, HSK 2, B1, TOPIK)
  const levelMatch = `${title} ${topicHint || ''}`.match(/\b(N[1-5]|JLPT|HSK\s*[1-6]?|TOPIK\s*[1-6]?|[ABC][12])\b/i);
  if (levelMatch) {
    const cleanLv = `#${cleanHashToken(levelMatch[1]).toUpperCase()}`;
    if (cleanLv.length > 1 && !tags.includes(cleanLv)) {
      tags.push(cleanLv);
    }
  }

  // Add study/countdown tag
  if (hasCountdown) {
    const extra =
      nativeLang === 'ja'
        ? '#スピーキング練習'
        : nativeLang === 'vi'
          ? '#LuyenPhanXa'
          : nativeLang === 'zh'
            ? '#口语挑战'
            : nativeLang === 'ko'
              ? '#스피킹챌린지'
              : '#SpeakingChallenge';
    if (!tags.includes(extra)) tags.push(extra);
  }

  // Extract up to 2 short meaningful topic tags from topicHint/title
  const topicSrc = (topicHint || title).replace(/【[^】]*】|\[[^\]]*\]/g, ' ').trim();
  const topicWords = topicSrc
    .split(/[\s,|/·•!?"'“”]+/)
    .map((w) => cleanHashToken(w))
    .filter((w) => w.length >= 3 && w.length <= 16 && !/^\d+$/.test(w));

  for (const w of topicWords) {
    if (tags.length >= 10) break;
    const tag = `#${w}`;
    if (!tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      tags.push(tag);
    }
  }

  return tags.slice(0, 10);
}

export function buildVideoDescription(input: VideoDescriptionInput): VideoDescriptionOutput {
  const cleanTitle = cleanOutputTitleStem(input.title, input.title || 'Language Lesson');
  const displayTitle = (input.title || cleanTitle).trim();
  const nativeLangCode = normalizeSupportedLang(input.nativeLang, 'vi');

  const cueTextSample = [
    displayTitle,
    ...(input.sampleLines ?? []),
    ...(input.cues ?? []).slice(0, 8).map((c) => c.text),
    ...(input.project?.cues ?? []).slice(0, 8).map((c) => c.text),
  ].join(' ');

  const detectedLearning =
    input.learningLang && input.learningLang !== 'auto'
      ? normalizeSupportedLang(input.learningLang, 'en')
      : inferLangFromTextSample(cueTextSample) || 'en';

  const cues = input.cues ?? input.project?.cues ?? [];
  const hasCountdown =
    input.hasCountdown ??
    Boolean(
      input.project?.elements.some(
        (el) => el.id.includes('-q-countdown-meter-') || el.type === 'tone-meter',
      ),
    );

  const itemCount =
    input.itemCount ||
    Math.max(
      3,
      Math.round((cues.length || input.project?.elements.filter((e) => e.type === 'sentence-card').length || 8) / 2),
    );

  let styleUsed: ResolvedVideoDescriptionStyle;
  if (input.style && input.style !== 'auto') {
    styleUsed = input.style;
  } else if (hasCountdown) {
    styleUsed = 'training-guide';
  } else if (itemCount >= 10) {
    styleUsed = 'phrase-pack';
  } else {
    styleUsed = 'hook-bullets';
  }

  const labels = NATIVE_UI_LABELS[detectedLearning] ?? NATIVE_UI_LABELS.en;
  const chapters = buildChapters(
    input.project,
    cues,
    input.durationSec ?? input.project?.duration ?? 60,
    labels,
  );

  const description = buildLocalizedDescription({
    style: styleUsed,
    title: displayTitle,
    nativeLang: detectedLearning,
    learningLang: detectedLearning,
    itemCount,
    thinkSec: input.thinkSec ?? 5,
    repeatCount: input.repeatCount ?? 2,
    chapters,
    topicHint: input.topicHint,
  });

  const hashtags = buildHashtags({
    title: displayTitle,
    nativeLang: detectedLearning,
    learningLang: detectedLearning,
    topicHint: input.topicHint,
    hasCountdown,
  });
  const hashtagsLine = hashtags.join(' ');

  const txtContent = [
    displayTitle,
    '',
    description,
    '',
    hashtagsLine,
    '',
  ].join('\n');

  return {
    title: displayTitle,
    description,
    hashtags,
    hashtagsLine,
    chapters,
    txtContent,
    styleUsed,
    nativeLangCode,
    learningLangCode: detectedLearning,
  };
}
