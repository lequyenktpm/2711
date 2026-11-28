import { formatAudienceLevelLabel } from './outputNaming';
import { DurationReportMeta, parseDurationReportMeta } from './types';

export type ReadingCefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
export type ReadingLearningLang = 'en' | 'ja' | 'zh' | 'ko' | 'fr' | 'es';
export type ReadingFormatCategory =
  | 'auto'
  | 'story'
  | 'dialogue'
  | 'mindset'
  | 'culture'
  | 'knowledge'
  | 'podcast';

export const READING_FORMAT_OPTIONS: Array<{
  id: ReadingFormatCategory;
  label: string;
  promptHint: string;
}> = [
  {
    id: 'auto',
    label: 'Tự động luân phiên (Cuốn hút nhất)',
    promptHint: 'Tự chọn thể loại hấp dẫn nhất (kể chuyện đời sống, bài học tư duy nhẹ nhàng, văn hóa hoặc hội thoại tự nhiên).',
  },
  {
    id: 'story',
    label: 'A. Short Story (Truyện ngắn & Kể chuyện)',
    promptHint: 'Viết dưới dạng truyện ngắn có tình huống mở đầu tò mò, diễn biến mượt mà và cái kết đọng lại cảm xúc.',
  },
  {
    id: 'dialogue',
    label: 'B. Daily Life / Real Situations (Tình huống đời sống)',
    promptHint: 'Tình huống thực tế hàng ngày (quán cà phê, sân bay, đi làm, du lịch) với ngôn ngữ tự nhiên như người bản xứ.',
  },
  {
    id: 'mindset',
    label: 'C. Mindset & Habits (Tư duy & Thói quen sống)',
    promptHint: 'Bài chia sẻ truyền cảm hứng về thói quen buổi sáng, kỷ luật, tâm lý học hoặc phát triển bản thân.',
  },
  {
    id: 'culture',
    label: 'D. Culture & Travel (Văn hóa & Khám phá bản xứ)',
    promptHint: 'Giới thiệu nét đẹp văn hóa, ẩm thực, phong tục hoặc trải nghiệm du lịch đặc sắc của quốc gia bản xứ.',
  },
  {
    id: 'knowledge',
    label: 'E. Mini Essay / Science (Kiến thức ngắn dễ hiểu)',
    promptHint: 'Giải thích một hiện tượng thú vị trong cuộc sống, công nghệ hoặc khoa học thường thức bằng văn phong rõ ràng.',
  },
  {
    id: 'podcast',
    label: 'F. Calm Podcast / Monologue (Tự sự Podcast chậm rãi)',
    promptHint: 'Giọng điệu tâm sự podcast nhẹ nhàng, ấm áp, nhịp câu êm ái cực hợp nghe thư giãn & đọc theo chữ.',
  },
];

export interface ReadingWebPromptOptions {
  mode: 'web-url' | 'topic' | 'adapt-text';
  learningLanguage?: ReadingLearningLang;
  formatPreference?: ReadingFormatCategory;
  url?: string;
  sourceTitle?: string;
  sourceText?: string;
  topic?: string;
  level: string;
  wordCount?: number;
  durationMinutes?: number;
}

export interface ParsedReadingPassage {
  title: string;
  topicBadge: string;
  level?: string;
  text: string;
  durationReport?: DurationReportMeta;
}

interface ReadingLangMeta {
  nameVi: string;
  nativeName: string;
  unit: 'words' | 'chars';
  ratePerMin: number;
  badgeSystem: string;
  noPronunciationNote: string;
  exampleTitle: string;
  exampleText: string;
}

const READING_LANG_META: Record<ReadingLearningLang, ReadingLangMeta> = {
  en: {
    nameVi: 'tiếng Anh',
    nativeName: 'English',
    unit: 'words',
    ratePerMin: 125,
    badgeSystem: 'CEFR',
    noPronunciationNote:
      'Chỉ viết tiếng Anh tự nhiên, TUYỆT ĐỐI KHÔNG viết phiên âm IPA hay cách đọc cho cả câu vào trong đoạn đọc.',
    exampleTitle: 'It started with one tiny favor… and ended with an unexpected reunion',
    exampleText: 'Sentence one goes here.\\nSentence two goes here.\\nSentence three continues the story.',
  },
  ja: {
    nameVi: 'tiếng Nhật (日本語)',
    nativeName: '日本語',
    unit: 'chars',
    ratePerMin: 185,
    badgeSystem: 'JLPT',
    noPronunciationNote:
      'Chỉ viết tiếng Nhật tự nhiên (Kanji + Hiragana/Katakana) trong `title` và `text`. TUYỆT ĐỐI KHÔNG viết lại cả câu bằng Hiragana, KHÔNG chèn phiên âm Romaji hay Furigana trong ngoặc `漢字(かんじ)` vào câu đọc để audio & bàn tay chỉ chữ khớp 100%.',
    exampleTitle: 'たった一言の優しさから始まった、思いがけない再会…',
    exampleText: '朝早く起きると、一日の時間が長く感じられます。\\n静かな部屋で温かいお茶を飲みます。\\nそれから今日やることを三つだけ書きます。',
  },
  zh: {
    nameVi: 'tiếng Trung (中文)',
    nativeName: '中文',
    unit: 'chars',
    ratePerMin: 180,
    badgeSystem: 'HSK',
    noPronunciationNote:
      'Chỉ viết chữ Hán giản thể (简体中文) tự nhiên, TUYỆT ĐỐI KHÔNG chèn Pinyin cho cả câu vào trong dòng đọc để TTS đọc mượt và con trỏ chỉ đúng từng chữ.',
    exampleTitle: '本来只是顺手帮了个小忙，结局却让人完全没想到…',
    exampleText: '每天早上我都会早起十分钟。\\n打开窗户呼吸新鲜空气，感觉非常舒服。\\n喝一杯温水以后，我开始计划今天的安排。',
  },
  ko: {
    nameVi: 'tiếng Hàn (한국어)',
    nativeName: '한국어',
    unit: 'words',
    ratePerMin: 95,
    badgeSystem: 'TOPIK',
    noPronunciationNote:
      'Chỉ viết Hangul (한국어) tự nhiên tách từ chuẩn bằng dấu cách, TUYỆT ĐỐI KHÔNG chèn phiên âm Romanization cho cả câu vào câu đọc.',
    exampleTitle: '사소한 부탁 하나로 시작된 뜻밖의 재회…',
    exampleText: '매일 아침 일찍 일어나면 하루가 훨씬 여유로워집니다.\\n창문을 열고 따뜻한 물 한 잔을 천천히 마십니다.\\n그리고 오늘 꼭 해야 할 일 세 가지를 적어 봅니다.',
  },
  fr: {
    nameVi: 'tiếng Pháp (Français)',
    nativeName: 'Français',
    unit: 'words',
    ratePerMin: 120,
    badgeSystem: 'CEFR',
    noPronunciationNote: 'Chỉ viết tiếng Pháp tự nhiên, TUYỆT ĐỐI KHÔNG chèn phiên âm cả câu vào câu đọc.',
    exampleTitle: 'Tout a commencé par un petit service… et s’est terminé par des retrouvailles inattendues',
    exampleText: 'Chaque matin, je me réveille dix minutes plus tôt.\\nJ’ouvre la fenêtre et je bois un grand verre d’eau.',
  },
  es: {
    nameVi: 'tiếng Tây Ban Nha (Español)',
    nativeName: 'Español',
    unit: 'words',
    ratePerMin: 125,
    badgeSystem: 'CEFR',
    noPronunciationNote: 'Chỉ viết tiếng Tây Ban Nha tự nhiên, TUYỆT ĐỐI KHÔNG chèn phiên âm cả câu vào câu đọc.',
    exampleTitle: 'Todo empezó con un pequeño favor… y terminó en un reencuentro inesperado',
    exampleText: 'Cada mañana me levanto diez minutos antes.\\nAbro la ventana y tomo un vaso de agua fresca.',
  },
};

export interface ReadingStarterPassage {
  title: string;
  topicBadge: string;
  level: string;
  text: string;
  introSubtitle: string;
  aiTopicPlaceholder: string;
}

export const READING_STARTER_BY_LANG: Record<ReadingLearningLang, ReadingStarterPassage> = {
  en: {
    title: 'Why 5 AM Changes Everything!',
    topicBadge: 'CEFR B1 · DAILY HABITS',
    level: 'B1',
    text: `Tom wakes up early every morning.\nHe opens the window and makes his bed.\nThen he drinks a glass of water and eats breakfast.\nHe checks the time, takes his bag, and leaves home.\nA good morning helps him start the day with energy.`,
    introSubtitle: "Today's reading lesson: Why 5 AM Changes Everything! Listen carefully and read along word by word.",
    aiTopicPlaceholder: 'VD: Morning habits, Ordering coffee, Travel stories... (bỏ trống AI tự chọn)',
  },
  ja: {
    title: '【朝の習慣】静かな10分が毎日を変える！',
    topicBadge: 'JLPT N5 · READING',
    level: 'N5',
    text: `私は毎朝六時に起きます。\nまず窓を開けて、新しい空気を吸います。\nそれから温かいお茶をゆっくり飲みます。\n今日やることをメモに三つ書きます。\n静かな朝の時間があると、一日がとても楽しくなります。`,
    introSubtitle: '今日のリーディング練習：静かな朝の習慣。音声を聞きながら一緒に読んでみましょう。',
    aiTopicPlaceholder: 'VD: 朝の習慣, カフェで注文, 日本旅行... (bỏ trống AI tự chọn)',
  },
  zh: {
    title: '【每天10分钟】早起为什么让人更专注？',
    topicBadge: 'HSK 1 · READING',
    level: 'HSK 1',
    text: `每天早上我六点半起床。\n我先打开窗户，呼吸一下新鲜的空气。\n然后我喝一杯温水，吃一点简单的早饭。\n接着我把今天要做的三件小事写下来。\n安静的早晨让我一整天都很有精神。`,
    introSubtitle: '今天的跟读练习：每天早起十分钟的改变。请跟着声音一起读。',
    aiTopicPlaceholder: 'VD: 早起习惯, 去咖啡店点单, 周末旅行... (bỏ trống AI tự chọn)',
  },
  ko: {
    title: '【아침 루틴】10분이 하루를 바꾼다!',
    topicBadge: 'TOPIK 1 · READING',
    level: 'TOPIK 1',
    text: `저는 매일 아침 여섯 시 반에 일어납니다.\n먼저 창문을 열고 시원한 공기를 마십니다.\n그리고 따뜻한 물 한 잔을 천천히 마십니다.\n오늘 해야 할 중요한 일 세 가지를 적습니다.\n조용한 아침 시간이 하루를 더 즐겁게 만듭니다.`,
    introSubtitle: '오늘의 읽기 연습: 아침 10분 루틴. 소리를 들으며 한 단어씩 따라 읽어 보세요.',
    aiTopicPlaceholder: 'VD: 아침 습관, 카페 주문하기, 서울 여행... (bỏ trống AI tự chọn)',
  },
  fr: {
    title: 'Dix minutes le matin changent tout !',
    topicBadge: 'CEFR A2 · LECTURE',
    level: 'A2',
    text: `Chaque matin, Camille se réveille un peu plus tôt.\nElle ouvre la fenêtre pour respirer l’air frais.\nEnsuite, elle boit un grand verre d’eau et prépare son café.\nElle note trois petits objectifs pour sa journée.\nCe moment calme lui donne beaucoup d’énergie.`,
    introSubtitle: 'Lecture du jour : Dix minutes le matin. Écoutez attentivement et suivez chaque mot.',
    aiTopicPlaceholder: 'VD: Routine du matin, Au café à Paris... (bỏ trống AI tự chọn)',
  },
  es: {
    title: '¡Diez minutos cada mañana cambian tu día!',
    topicBadge: 'CEFR A2 · LECTURA',
    level: 'A2',
    text: `Cada mañana Mateo se despierta diez minutos antes.\nAbre la ventana y respira aire fresco.\nDespués toma un vaso de agua y prepara un buen desayuno.\nEscribe tres tareas importantes para su día.\nEsa pausa tranquila le da energía y claridad.`,
    introSubtitle: 'Lectura de hoy: Diez minutos cada mañana. Escucha con atención y sigue cada palabra.',
    aiTopicPlaceholder: 'VD: Rutina de mañana, Pedir café en Madrid... (bỏ trống AI tự chọn)',
  },
};

export function computeReadingTargetLength(
  lang: ReadingLearningLang,
  durationMinutes: number,
): { count: number; unitLabel: string; unitShort: string } {
  const meta = READING_LANG_META[lang] || READING_LANG_META.en;
  const safeMin = Math.max(0.5, Math.min(30, Number(durationMinutes) || 1));
  const raw = Math.round(safeMin * meta.ratePerMin);
  const maxVal = meta.unit === 'chars' ? 6500 : 4500;
  const count = Math.max(50, Math.min(maxVal, raw));
  return {
    count,
    unitLabel: meta.unit === 'chars' ? `ký tự ${meta.nameVi}` : `từ ${meta.nameVi}`,
    unitShort: meta.unit === 'chars' ? 'ký tự' : 'từ',
  };
}

const LEVEL_GUIDANCE: Record<string, string> = {
  A1: 'CEFR A1 Beginner: câu ngắn rõ ràng (6-10 từ/câu), từ vựng thông dụng hằng ngày, thì hiện tại đơn / quá khứ đơn dễ đọc.',
  A2: 'CEFR A2 Elementary: câu đơn giản mạch lạc (8-13 từ/câu), từ vựng giao tiếp đời sống, liên từ tự nhiên.',
  B1: 'CEFR B1 Intermediate: câu tự nhiên mượt mà (10-16 từ/câu), phù hợp kể chuyện và luyện phát âm.',
  B2: 'CEFR B2 Upper-Intermediate: cấu trúc đa dạng, có cụm từ tự nhiên/collocations hay, nhịp đọc cuốn hút.',
  C1: 'CEFR C1 Advanced: văn phong sắc sảo, từ vựng học thuật/tinh tế nhưng vẫn dễ đọc thành tiếng.',
  C2: 'CEFR C2 Mastery: văn phong bản xứ giàu hình ảnh, nhịp điệu văn học tự nhiên.',
  N5: 'JLPT N5 (Nhập môn): câu ngắn lịch sự です/ます, Hiragana/Katakana + Kanji rất cơ bản.',
  N4: 'JLPT N4 (Sơ trung cấp): giao tiếp đời sống hằng ngày, liên kết câu tự nhiên, thể て/た/ない.',
  N3: 'JLPT N3 (Trung cấp): kể chuyện mượt mà theo tình huống thực tế, từ vựng phổ thông phong phú.',
  N2: 'JLPT N2 (Trung cao cấp): diễn đạt sâu sắc, logic rõ ràng, văn phong tin tức/đời sống hiện đại.',
  N1: 'JLPT N1 (Cao cấp): sắc thái tinh tế, cấu trúc nâng cao tự nhiên như người Nhật bản xứ.',
};

function describeReadingLevel(level: string, meta: ReadingLangMeta): string {
  const clean = String(level || '').trim();
  if (LEVEL_GUIDANCE[clean]) return LEVEL_GUIDANCE[clean];
  if (/HSK/i.test(clean)) {
    return `${clean} (Tiếng Trung chuẩn): từ vựng và cấu trúc đúng cấp độ ${clean}, câu tự nhiên dễ đọc thành tiếng.`;
  }
  if (/TOPIK/i.test(clean)) {
    return `${clean} (Tiếng Hàn chuẩn): câu văn Hangul tự nhiên đúng cấp độ ${clean}, phù hợp luyện nghe & đọc theo chữ.`;
  }
  if (/→/.test(clean)) {
    return `${clean}: khởi đầu nhẹ nhàng dễ tiếp cận rồi tăng dần độ phong phú từ vựng & cấu trúc theo tiến độ bài đọc.`;
  }
  return `${meta.badgeSystem} ${clean}: văn phong ${meta.nameVi} tự nhiên, rõ ràng, phù hợp luyện đọc thành tiếng.`;
}

export interface CleanedReadingWorksheet {
  title: string;
  bodyText: string;
  lines: string[];
}

const WORKSHEET_SCAFFOLDING_PATTERNS: RegExp[] = [
  /^(?:practice\s+)?reading\s+(?:english\s+)?exercises?(?:\s+for\s+(?:beginner|elementary|intermediate|advanced|kids|students))?(?:\s*[-–—:|].*)?$/i,
  /^english\s+reading\s+(?:exercises?|practice|comprehension|passages?)(?:\s+for\s+(?:beginner|elementary|intermediate|advanced))?(?:\s*[-–—:|].*)?$/i,
  /^(?:exercise|part|task|activity|unit|module|section|worksheet)\s*(?:#?\d+|[ivxlcdm]+)?(?:\s*[-–—:.].{0,40})?$/i,
  /^(?:reading\s+(?:comprehension|passage|exercise|task)|true\s*\/\s*false(?:\s+quiz)?|multiple\s+choice|comprehension(?:\s+quiz)?|vocabulary(?:\s+list)?|answer\s*key|warm[\s-]*up|before\s+reading|after\s+reading)\s*:?$/i,
  /^(?:level|cefr|jlpt|hsk|topik)\s*[:\-]?\s*(?:a1|a2|b1|b2|c1|c2|n[1-5]|hsk\s*\d|topik\s*\d|beginner|elementary|intermediate)\b.*$/i,
  /^(?:read\s+the\s+(?:text|passage|article|story)\s+(?:below|carefully)?(?:\s+and\s+answer.*)?)[.:]?$/i,
];

export function isWorksheetScaffoldingLine(line: string): boolean {
  const cleaned = line
    .replace(/^#+\s*/, '')
    .replace(/^[-*•>\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return true;
  if (/^[-_=*~]{3,}$/.test(cleaned)) return true;
  return WORKSHEET_SCAFFOLDING_PATTERNS.some((re) => re.test(cleaned));
}

export function cleanReadingWorksheetInput(
  rawText: string,
  suggestedTitle?: string,
): CleanedReadingWorksheet {
  const normalized = String(rawText || '')
    .replace(/\r\n/g, '\n')
    .replace(/\\n/g, '\n')
    .trim();

  if (!normalized) {
    return {
      title: (suggestedTitle || 'Reading Practice').trim() || 'Reading Practice',
      bodyText: '',
      lines: [],
    };
  }

  const rawLines = normalized
    .split(/\n+/)
    .map((l) => l.replace(/^#+\s*/, '').replace(/^[-*•]\s+/, '').trim())
    .filter(Boolean);

  const filteredLines = rawLines.filter((line) => !isWorksheetScaffoldingLine(line));

  let detectedTitle = '';
  let bodyLines = [...filteredLines];

  if (bodyLines.length >= 2) {
    const first = bodyLines[0];
    const wordCount = first.split(/\s+/).filter(Boolean).length;
    const isVocabEntryLine = /\/[^/\n]{2,}\/\s*[-–—:=→]?|^\S+(?:\s+\S+){0,3}\s+(?:[-–—→:=])\s+\S+/i.test(first);
    const looksLikeTitle =
      first.length <= 72 &&
      wordCount <= 10 &&
      !isVocabEntryLine &&
      !/[.!?…。！？]$/.test(first) &&
      !/^(?:Q?\d+[.)]|\([A-Da-d]\)|[A-Da-d][.)])\s+/.test(first);
    if (looksLikeTitle) {
      detectedTitle = first;
      bodyLines = bodyLines.slice(1);
    }
  }

  const cleanSuggested = (suggestedTitle || '').replace(/^#+\s*/, '').trim();
  const useSuggested =
    cleanSuggested && !isWorksheetScaffoldingLine(cleanSuggested) ? cleanSuggested : '';

  const title = detectedTitle || useSuggested || 'Reading Practice';

  if (
    bodyLines.length > 1 &&
    bodyLines[0].toLowerCase() === title.toLowerCase()
  ) {
    bodyLines = bodyLines.slice(1);
  }

  return {
    title,
    bodyText: bodyLines.join('\n'),
    lines: bodyLines,
  };
}

export function buildReadingWebAiPrompt(opts: ReadingWebPromptOptions): string {
  const learningLang: ReadingLearningLang = opts.learningLanguage || 'en';
  const meta = READING_LANG_META[learningLang] || READING_LANG_META.en;
  const level = (opts.level || 'B1').trim();
  const durationMinutes =
    typeof opts.durationMinutes === 'number' &&
    Number.isFinite(opts.durationMinutes) &&
    opts.durationMinutes > 0
      ? Math.max(0.5, Math.min(30, Number(opts.durationMinutes.toFixed(1))))
      : undefined;
  const computedTarget = computeReadingTargetLength(learningLang, durationMinutes || 1);
  const maxAllowed = meta.unit === 'chars' ? 6500 : 4500;
  const targetCount =
    typeof opts.wordCount === 'number' && Number.isFinite(opts.wordCount) && opts.wordCount > 0
      ? Math.max(40, Math.min(maxAllowed, Math.round(opts.wordCount)))
      : computedTarget.count;
  const estimatedMinutesLabel = durationMinutes
    ? `${durationMinutes} phút (~${Math.round(durationMinutes * 60)} giây)`
    : `~${Math.max(0.5, Number((targetCount / meta.ratePerMin).toFixed(1)))} phút`;
  const cleanUrl = (opts.url || '').trim();
  const cleanSource = (opts.sourceText || '').trim().slice(0, 12000);
  const cleanTopic = (opts.topic || '').trim();

  const formatMeta =
    READING_FORMAT_OPTIONS.find((f) => f.id === (opts.formatPreference || 'auto')) ||
    READING_FORMAT_OPTIONS[0];

  const effectiveMinutes = durationMinutes ?? Math.max(0.5, Number((targetCount / meta.ratePerMin).toFixed(1)));
  const unitName = meta.unit === 'chars' ? `ký tự ${meta.nativeName}` : `từ ${meta.nativeName}`;
  const unitShort = meta.unit === 'chars' ? 'ký tự' : 'từ';
  const chapterCount =
    effectiveMinutes >= 5 ? Math.max(3, Math.min(12, Math.round(effectiveMinutes / 3))) : 1;
  const perChapterTarget = Math.max(120, Math.round(targetCount / chapterCount));

  const volumeArchitectureBlock =
    effectiveMinutes >= 5
      ? [
          `- **KẾ HOẠCH CHIA CHƯƠNG ĐỂ ĐẠT ĐỦ ${effectiveMinutes} PHÚT (CẤM DỪNG SỚM Ở 300–500 ${unitShort.toUpperCase()} / ~3 PHÚT)**:`,
          `  + Khi đặt mục tiêu **${effectiveMinutes} phút**, bài viết PHẢI đạt tối thiểu **${targetCount}+ ${unitShort}** (tương đương tốc độ đọc ~${meta.ratePerMin} ${unitShort}/phút × ${effectiveMinutes} phút).`,
          `  + Để không bị hụt dung lượng hay tụt xuống còn ~3 phút, hãy **lập dàn ý ${chapterCount} hồi / phần nối tiếp nhau**, mỗi phần triển khai **~${perChapterTarget}+ ${unitShort}** với diễn biến, bối cảnh, đối thoại, góc nhìn hoặc bài học mới hoàn toàn.`,
        ].join('\n')
      : '';

  const sourceBlock =
    opts.mode === 'adapt-text'
      ? `NỘI DUNG GỐC NGƯỜI DÙNG NHẬP VÀO CẦN BIÊN TẬP LẠI THEO ĐỘ KHÓ "${level}":
${opts.sourceTitle ? `Tiêu đề gợi ý: ${opts.sourceTitle}\n` : ''}"""
${cleanSource || '(người dùng sẽ dán đoạn văn gốc vào đây)'}
"""
YÊU CẦU BIÊN TẬP CHUYÊN SÂU:
- Giữ trọn ý nghĩa cốt lõi và mạch hấp dẫn từ nội dung gốc (nếu nguồn đang là tiếng Việt hoặc ngôn ngữ khác, hãy chuyển ngữ / biên tập lại hoàn toàn sang **${meta.nameVi}**).
- Điều chỉnh từ vựng, độ dài câu và cấu trúc ngữ pháp chuẩn xác cho trình độ **${level}**, triển khai đầy đủ các khía cạnh/bối cảnh thực tế của chủ đề với chiều sâu rõ ràng để cố gắng đạt **tối thiểu ${estimatedMinutesLabel}** (tối thiểu ~${targetCount} ${unitShort}; được phép dài hơn để câu văn trọn vẹn ý nghĩa, TUYỆT ĐỐI KHÔNG cắt xén xuống thấp hơn hay tạo câu cụt vô nghĩa).
- Nếu nguồn gốc quá ngắn hoặc chỉ có 1 ý hẹp mà việc kéo dài tới ${effectiveMinutes} phút sẽ buộc phải bịa lan man hoặc lặp ý, **KHÔNG ĐƯỢC NHỒI CHỮ RỖNG** — hãy viết sâu sắc hết mức hợp lý rồi ghi rõ lý do trong \`durationReport.shortfallReason\`.`
      : opts.mode === 'web-url'
        ? cleanSource
          ? `NGUỒN BÀI VIẾT TỪ WEB${cleanUrl ? ` (${cleanUrl})` : ''}:
Tiêu đề gốc: ${opts.sourceTitle || 'Web Article'}
Nội dung đã trích xuất:
"""
${cleanSource}
"""
Hãy loại bỏ toàn bộ tiêu đề khung bài tập/worksheet (như "Practice Reading...", "Exercise 1", "Part 1", menu web) và biên tập/chuyển thể thành bài đọc ${meta.nameVi} sâu sắc, cuốn hút nhất từ nội dung chính trên.`
          : `HÃY TRUY CẬP / ĐỌC NỘI DUNG TỪ ĐƯỜNG LINK SAU VÀ BIÊN TẬP THÀNH BÀI ĐỌC ${meta.nameVi.toUpperCase()}:
URL: ${cleanUrl || '(người dùng sẽ dán URL)'}
(Nếu bạn không truy cập trực tiếp được link, hãy dựa theo chủ đề trong URL "${cleanUrl}" hoặc nội dung liên quan để viết bài đọc chuẩn xác).`
        : cleanTopic
          ? `CHỦ ĐỀ BÀI ĐỌC BẰNG ${meta.nameVi.toUpperCase()}: "${cleanTopic}"`
          : `CHẾ ĐỘ AI TỰ CHỌN Ý TƯỞNG: Hãy TỰ NGHĨ MỘT CHỦ ĐỀ BÀI ĐỌC THẬT CUỐN HÚT, THỰC TẾ VÀ PHÙ HỢP VỚI TRÌNH ĐỘ "${level}" (VD: câu chuyện thói quen buổi sáng, trải nghiệm quán cà phê, bài học tư duy sâu sắc, văn hóa bản xứ...).`;

  return `# VAI TRÒ
Bạn là Chuyên gia thiết kế giáo trình luyện đọc ${meta.nameVi} (Reading Along Karaoke Video).

# NHIỆM VỤ
${sourceBlock}

# THỂ LOẠI & PHONG CÁCH BÀI ĐỌC
- Định dạng ưu tiên: **${formatMeta.label}** — ${formatMeta.promptHint}

# YÊU CẦU NGÔN NGỮ, TRÌNH ĐỘ & ĐỘ DÀI
- Ngôn ngữ bài đọc: **${meta.nameVi}** (${meta.nativeName}). **BẮT BUỘC 100% THUẦN 1 NGÔN NGỮ DUY NHẤT (${meta.nativeName})** trong cả \`title\` và \`text\` — TUYỆT ĐỐI KHÔNG chèn tiếng Việt, tiếng Anh giải thích, bản dịch trong ngoặc, hay từ ngoại ngữ khác ngôn ngữ bài đọc.
- Trình độ: ${describeReadingLevel(level, meta)}
- **Thời lượng TỐI THIỂU (MỨC SÀN — CHỈ ĐƯỢC DÀI HƠN, KHÔNG ĐƯỢC THẤP HƠN)**: Ngưỡng **${estimatedMinutesLabel}** (tối thiểu **${targetCount} ${unitName}**) là mức sàn tối thiểu. Hãy để **số lượng hồi/mục nội dung và chiều sâu diễn giải** quyết định độ dài bài đọc (cố gắng viết đạt hoặc vượt mốc **${targetCount}+ ${unitShort}**, TUYỆT ĐỐI KHÔNG dừng sớm ở mức 300–500 ${unitShort} / ~3 phút!).
${volumeArchitectureBlock ? `${volumeArchitectureBlock}\n` : ''}- **KỶ LUẬT CHẤT LƯỢNG TUYỆT ĐỐI (DÀI NHƯNG CẤM LAN MAN, CẤM LẶP LẠI, BẮT BUỘC SÂU SẮC)**:
  + **CẤM LAN MAN (NO RAMBLING)**: Mọi câu văn đều phải thúc đẩy mạch truyện, lập luận hoặc tình huống thực tế; tuyệt đối không viết câu dạo đầu vô thưởng vô phạt, không kể lể lan man lạc khỏi trọng tâm bài học.
  + **CẤM LẶP LẠI (ZERO REPETITION)**: Tuyệt đối không lặp lại cùng 1 ý tưởng, cùng 1 ví dụ, hay lặp đi lặp lại 1 khuôn mẫu câu nhàm chán giữa các đoạn. Mỗi hồi/đoạn mới PHẢI mang tình tiết, bước ngoặt, góc nhìn tâm lý/văn hóa hoặc chi tiết thực tiễn mới.
  + **BẮT BUỘC SÂU SẮC (INSIGHTFUL DEPTH)**: Có chi tiết cụ thể, đối thoại tự nhiên, phân tích nguyên nhân – hệ quả hoặc bài học sắc bén đáng suy ngẫm, giúp người học vừa luyện đọc vừa thu nạp giá trị thật.
- **TỰ KIỂM ĐẾM & GIẢI TRÌNH NẾU KHÔNG ĐẠT TỐI THIỂU (${effectiveMinutes} PHÚT)**:
  + Trước khi trả JSON, hãy tự đếm tổng số ${unitShort} trong \`"text"\` và tính \`estimatedMinutes = round(estimatedCount / ${meta.ratePerMin}, 1)\`.
  + Nếu \`estimatedMinutes < ${effectiveMinutes}\`, hãy viết thêm các hồi/tình tiết mới giàu giá trị trước khi xuất.
  + Nếu do giới hạn độ dài output của AI trong 1 lượt trả lời hoặc nguồn đầu vào quá ít không thể mở rộng mà không bị lan man/lặp lại khiến kết quả vẫn **chưa đạt tối thiểu ${effectiveMinutes} phút**, BẮT BUỘC đặt \`"metMinimum": false\` trong \`"durationReport"\` và giải thích rõ lý do cụ thể vào \`"shortfallReason"\` (tuyệt đối không âm thầm xuất bài 3 phút mà không báo lý do!).
- ${meta.noPronunciationNote}
- **KHÔNG TẠO CÁCH ĐỌC CẢ CÂU & CHÚ THÍCH TỪ/NGỮ PHÁP KHÓ SO VỚI TRÌNH ĐỘ "${level}"**:
  + TUYỆT ĐỐI KHÔNG viết lại cả câu bằng Hiragana, KHÔNG chèn Furigana \`漢字(かんじ)\`, Romaji, Pinyin hay IPA vào trong \`"text"\` hoặc \`"title"\`.
  + Nếu trong đoạn đọc có **từ vựng khó** hoặc **ngữ pháp khó** vượt hoặc tiệm cận trình độ **${level}**, hãy ghi riêng vào mảng \`"studyNotes"\` bên dưới (không nhồi vào \`"text"\`) gồm: giải thích nghĩa, cách dùng, và chú ý nếu có; **riêng từ vựng khó là chữ Kanji thì ghi kèm Hiragana của CHÍNH TỪ KANJI ĐÓ** (VD: \`"雰囲気（ふんいき）: bầu không khí — cách dùng & chú ý..."\`), tuyệt đối không phiên âm Hiragana cho cả câu! Nếu câu nào hoàn toàn vừa tầm \`${level}\` thì bỏ qua, không cần nhồi chú thích dư thừa.
- **TỔNG KẾT NỘI DUNG & KIẾN THỨC ĐÃ HỌC Ở CUỐI BÀI**:
  + Ở các câu kết của \`"text"\` (bằng **100% ${meta.nativeName}**), hãy kết bài tự nhiên bằng 1–2 câu đúc kết thông điệp / tình huống vừa đọc.
  + Đồng thời điền trường \`"lessonSummary"\` trong JSON để tổng kết rõ **hôm nay người học đã học được những gì** (nội dung cốt lõi vừa đọc, các cách diễn đạt / từ vựng / ngữ pháp đắt giá và góc nhìn thực tế áp dụng).
- TUYỆT ĐỐI KHÔNG đưa các dòng nhãn bài tập ("Practice Reading...", "Exercise 1", "Part 1") hoặc tiêu đề markdown \`##\` vào trường \`text\`. Chỉ giữ các câu đọc hoàn chỉnh.
- Mỗi câu viết trên **1 dòng riêng** (ngăn cách bằng \\n), KHÔNG đánh số thứ tự, KHÔNG gắn timestamp, KHÔNG markdown (\`**\`, \`*\`), KHÔNG emoji, để app đọc TTS & chạy con trỏ chỉ chữ chính xác từng từ.

# QUY TẮC ĐẶT TIÊU ĐỀ CUỐN HÚT & ĐÚNG NGÔN NGỮ (CỰC KỲ QUAN TRỌNG)
- **KHÔNG ĐẶT TÊN TRUYỆN PHẲNG / KHÔ KHAN** kiểu \`"La bicicleta roja que esperaba a Mateo"\`, \`"El café de Mateo"\`, \`"Morning Routine"\` hay \`"Lesson 1"\`.
- Trường \`"title"\` PHẢI là **1 câu hook khơi gợi tò mò, cảm xúc, nút thắt câu chuyện hoặc câu hỏi đánh trúng tâm lý người đọc**, viết **100% bằng ${meta.nativeName}** (phong cách cuốn hút như: \`"${meta.exampleTitle}"\`).
- Nhãn trình độ dành cho ai khi xuất file sẽ được hệ thống tự gắn bằng **đúng ${meta.nativeName}** (\`${formatAudienceLevelLabel(level, learningLang)}\`), TUYỆT ĐỐI KHÔNG chèn tiếng Việt vào \`"title"\`.

# ĐỊNH DẠNG ĐẦU RA BẮT BUỘC (XUẤT RA FILE .JSON)
\`\`\`json
{
  "title": "<Tiêu đề hook thật hay, khơi gợi tò mò 100% bằng ${meta.nativeName} — VD: '${meta.exampleTitle}'>",
  "topicBadge": "${meta.badgeSystem} ${level} · READING",
  "level": "${level}",
  "text": "${meta.exampleText}",
  "lessonSummary": {
    "coreMessage": "<Tóm tắt nội dung chính vừa đọc/nghe trong 1–2 câu>",
    "keyTakeaways": [
      "<Kiến thức / kỹ năng tình huống / mẫu câu quan trọng 1 rút ra từ bài>",
      "<Kiến thức / điểm ngữ pháp hoặc sắc thái tự nhiên 2 rút ra từ bài>"
    ]
  },
  "studyNotes": [
    {
      "item": "<Chỉ liệt kê nếu có từ/ngữ pháp khó với trình độ ${level}; nếu là từ Kanji khó thì ghi 'Kanji（hiragana）'>",
      "hiragana": "<Cách đọc Hiragana CHỈ của riêng từ Kanji khó đó (nếu không phải Kanji thì để '')>",
      "explanation": "<Giải thích nghĩa ngắn gọn>",
      "usage": "<Cách dùng tự nhiên trong câu/ngữ cảnh>",
      "caution": "<Chú ý tránh nhầm lẫn nếu có, hoặc ''>"
    }
  ],
  "durationReport": {
    "targetMinutes": ${effectiveMinutes},
    "estimatedMinutes": ${effectiveMinutes},
    "estimatedCount": ${targetCount},
    "metMinimum": true,
    "shortfallReason": ""
  }
}
\`\`\`
Hãy xuất toàn bộ kết quả dưới dạng **1 file \`.json\` hợp lệ hoàn chỉnh** (chỉ trả về JSON, không kèm lời giải thích bên ngoài; mọi giải trình nếu không đạt tối thiểu ${effectiveMinutes} phút hãy ghi rõ trong \`durationReport.shortfallReason\`).`;
}

export function parseReadingWebAiResponse(
  rawInput: string,
  fallbackLevel = 'B1',
): ParsedReadingPassage | null {
  const raw = rawInput.trim();
  if (!raw) return null;

  // 1. Try stripping markdown fences and parsing JSON
  const cleanedJson = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  const jsonMatch = cleanedJson.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]) as {
        title?: string;
        topicBadge?: string;
        level?: string;
        text?: string;
        content?: string;
        passage?: string;
        durationReport?: unknown;
      };
      const rawPassage = String(obj.text || obj.content || obj.passage || '').trim();
      if (rawPassage) {
        const cleanedWorksheet = cleanReadingWorksheetInput(rawPassage, obj.title);
        let cleanLines = cleanedWorksheet.lines
          .map((l) => l.replace(/^\s*[-*•\d.)]+\s*/, '').trim())
          .filter(Boolean);
        if (
          cleanLines.length === 1 &&
          (cleanLines[0].length > 48 || /[。！？]/.test(cleanLines[0]))
        ) {
          const splitSentences = cleanLines[0]
            .split(/(?<=[.!?。！？])\s*/)
            .map((s) => s.trim())
            .filter(Boolean);
          if (splitSentences.length > 1) cleanLines = splitSentences;
        }
        return {
          title: (obj.title ? String(obj.title).replace(/^#+\s*/, '').trim() : cleanedWorksheet.title)
            .slice(0, 90) || 'Reading Practice',
          topicBadge: String(obj.topicBadge || `${obj.level || fallbackLevel} · READING`)
            .trim()
            .slice(0, 48),
          level: obj.level ? String(obj.level) : fallbackLevel,
          text: cleanLines.join('\n'),
          durationReport: parseDurationReportMeta(obj.durationReport),
        };
      }
    } catch {
      // Fall through to plain-text mode
    }
  }

  // 2. Plain text fallback: strip worksheet scaffolding & split sentences cleanly
  const cleanedPlain = cleanReadingWorksheetInput(
    raw.replace(/^```[a-z]*\s*/gim, '').replace(/```$/gm, ''),
  );
  if (cleanedPlain.lines.length === 0) return null;

  let bodyLines = cleanedPlain.lines;
  // If a single dense paragraph was pasted, split cleanly by sentence boundaries (including CJK 。！？)
  if (
    bodyLines.length === 1 &&
    (bodyLines[0].length > 48 || /[。！？]/.test(bodyLines[0]))
  ) {
    const splitSentences = bodyLines[0]
      .split(/(?<=[.!?。！？])\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (splitSentences.length > 1) bodyLines = splitSentences;
  }

  return {
    title: cleanedPlain.title || 'Custom Web Reading',
    topicBadge: `${fallbackLevel} · WEB READING`,
    level: fallbackLevel,
    text: bodyLines.join('\n'),
  };
}
