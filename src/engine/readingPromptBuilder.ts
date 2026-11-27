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
    noPronunciationNote: 'Chỉ viết tiếng Anh tự nhiên, không chèn phiên âm IPA vào đoạn đọc.',
    exampleTitle: 'Why 5 AM Changes Everything!',
    exampleText: 'Sentence one goes here.\\nSentence two goes here.\\nSentence three continues the story.',
  },
  ja: {
    nameVi: 'tiếng Nhật (日本語)',
    nativeName: '日本語',
    unit: 'chars',
    ratePerMin: 185,
    badgeSystem: 'JLPT',
    noPronunciationNote:
      'Chỉ viết tiếng Nhật tự nhiên (Kanji + Hiragana/Katakana), TUYỆT ĐỐI KHÔNG chèn phiên âm Romaji hay Furigana trong ngoặc vào câu đọc để audio & bàn tay chỉ chữ khớp 100%.',
    exampleTitle: '【朝の習慣】10分で人生が変わる理由',
    exampleText: '朝早く起きると、一日の時間が長く感じられます。\\n静かな部屋で温かいお茶を飲みます。\\nそれから今日やることを三つだけ書きます。',
  },
  zh: {
    nameVi: 'tiếng Trung (中文)',
    nativeName: '中文',
    unit: 'chars',
    ratePerMin: 180,
    badgeSystem: 'HSK',
    noPronunciationNote:
      'Chỉ viết chữ Hán giản thể (简体中文) tự nhiên, TUYỆT ĐỐI KHÔNG chèn Pinyin vào trong dòng đọc để TTS đọc mượt và con trỏ chỉ đúng từng chữ.',
    exampleTitle: '【每天10分钟】为什么早起让人更专注？',
    exampleText: '每天早上我都会早起十分钟。\\n打开窗户呼吸新鲜空气，感觉非常舒服。\\n喝一杯温水以后，我开始计划今天的安排。',
  },
  ko: {
    nameVi: 'tiếng Hàn (한국어)',
    nativeName: '한국어',
    unit: 'words',
    ratePerMin: 95,
    badgeSystem: 'TOPIK',
    noPronunciationNote:
      'Chỉ viết Hangul (한국어) tự nhiên tách từ chuẩn bằng dấu cách, TUYỆT ĐỐI KHÔNG chèn phiên âm Romanization vào câu đọc.',
    exampleTitle: '【아침 루틴】하루를 바꾸는 10분의 기적',
    exampleText: '매일 아침 일찍 일어나면 하루가 훨씬 여유로워집니다.\\n창문을 열고 따뜻한 물 한 잔을 천천히 마십니다.\\n그리고 오늘 꼭 해야 할 일 세 가지를 적어 봅니다.',
  },
  fr: {
    nameVi: 'tiếng Pháp (Français)',
    nativeName: 'Français',
    unit: 'words',
    ratePerMin: 120,
    badgeSystem: 'CEFR',
    noPronunciationNote: 'Chỉ viết tiếng Pháp tự nhiên, không chèn phiên âm vào câu đọc.',
    exampleTitle: 'Pourquoi 10 minutes le matin changent tout',
    exampleText: 'Chaque matin, je me réveille dix minutes plus tôt.\\nJ’ouvre la fenêtre et je bois un grand verre d’eau.',
  },
  es: {
    nameVi: 'tiếng Tây Ban Nha (Español)',
    nativeName: 'Español',
    unit: 'words',
    ratePerMin: 125,
    badgeSystem: 'CEFR',
    noPronunciationNote: 'Chỉ viết tiếng Tây Ban Nha tự nhiên, không chèn phiên âm vào câu đọc.',
    exampleTitle: 'Por qué 10 minutos cada mañana cambian tu día',
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

  const sourceBlock =
    opts.mode === 'adapt-text'
      ? `NỘI DUNG GỐC NGƯỜI DÙNG NHẬP VÀO CẦN BIÊN TẬP LẠI THEO ĐỘ KHÓ "${level}":
${opts.sourceTitle ? `Tiêu đề gợi ý: ${opts.sourceTitle}\n` : ''}"""
${cleanSource || '(người dùng sẽ dán đoạn văn gốc vào đây)'}
"""
YÊU CẦU BIÊN TẬP CHUYÊN SÂU:
- Giữ trọn ý nghĩa cốt lõi và mạch hấp dẫn từ nội dung gốc (nếu nguồn đang là tiếng Việt hoặc ngôn ngữ khác, hãy chuyển ngữ / biên tập lại hoàn toàn sang **${meta.nameVi}**).
- Điều chỉnh từ vựng, độ dài câu và cấu trúc ngữ pháp chuẩn xác cho trình độ **${level}**, mở rộng chi tiết phân tích hoặc ví dụ nếu cần để đạt đúng mục tiêu thời lượng **${estimatedMinutesLabel}** (~${targetCount} ${meta.unit === 'chars' ? 'ký tự' : 'từ'}) mà KHÔNG làm mất chiều sâu.`
      : opts.mode === 'web-url'
        ? cleanSource
          ? `NGUỒN BÀI VIẾT TỪ WEB${cleanUrl ? ` (${cleanUrl})` : ''}:
Tiêu đề gốc: ${opts.sourceTitle || 'Web Article'}
Nội dung đã trích xuất:
"""
${cleanSource}
"""
Hãy loại bỏ toàn bộ tiêu đề khung bài tập/worksheet (như "Practice Reading...", "Exercise 1", "Part 1", menu web) và biên tập/chuyển thể thành bài đọc ${meta.nameVi} hay nhất từ nội dung chính trên.`
          : `HÃY TRUY CẬP / ĐỌC NỘI DUNG TỪ ĐƯỜNG LINK SAU VÀ BIÊN TẬP THÀNH BÀI ĐỌC ${meta.nameVi.toUpperCase()}:
URL: ${cleanUrl || '(người dùng sẽ dán URL)'}
(Nếu bạn không truy cập trực tiếp được link, hãy dựa theo chủ đề trong URL "${cleanUrl}" hoặc nội dung liên quan để viết bài đọc chuẩn xác).`
        : cleanTopic
          ? `CHỦ ĐỀ BÀI ĐỌC BẰNG ${meta.nameVi.toUpperCase()}: "${cleanTopic}"`
          : `CHẾ ĐỘ AI TỰ CHỌN Ý TƯỞNG: Hãy TỰ NGHĨ MỘT CHỦ ĐỀ BÀI ĐỌC THẬT CUỐN HÚT, THỰC TẾ VÀ PHÙ HỢP VỚI TRÌNH ĐỘ "${level}" (VD: câu chuyện thói quen buổi sáng, trải nghiệm quán cà phê, bài học tư duy nhẹ nhàng, văn hóa bản xứ...).`;

  return `# VAI TRÒ
Bạn là Chuyên gia thiết kế giáo trình luyện đọc ${meta.nameVi} (Reading Along Karaoke Video).

# NHIỆM VỤ
${sourceBlock}

# THỂ LOẠI & PHONG CÁCH BÀI ĐỌC
- Định dạng ưu tiên: **${formatMeta.label}** — ${formatMeta.promptHint}

# YÊU CẦU NGÔN NGỮ, TRÌNH ĐỘ & ĐỘ DÀI
- Ngôn ngữ bài đọc: **${meta.nameVi}** (${meta.nativeName}). **BẮT BUỘC 100% THUẦN 1 NGÔN NGỮ DUY NHẤT (${meta.nativeName})** trong cả \`title\` và \`text\` — TUYỆT ĐỐI KHÔNG chèn tiếng Việt, tiếng Anh giải thích, bản dịch trong ngoặc, hay từ ngoại ngữ khác ngôn ngữ bài đọc.
- Trình độ: ${describeReadingLevel(level, meta)}
- Thời lượng render mục tiêu: **${estimatedMinutesLabel}** → Độ dài mục tiêu khoảng **${targetCount} ${meta.unit === 'chars' ? `ký tự ${meta.nativeName}` : `từ ${meta.nativeName}`}**${durationMinutes && durationMinutes >= 2 ? ' (mở rộng câu chuyện/bài phân tích đủ sâu và phong phú kiến thức cho đúng số phút mong muốn)' : ''}.
- ${meta.noPronunciationNote}
- TUYỆT ĐỐI KHÔNG đưa các dòng nhãn bài tập ("Practice Reading...", "Exercise 1", "Part 1") hoặc tiêu đề markdown \`##\` vào trường \`text\`. Chỉ giữ các câu đọc hoàn chỉnh.
- Mỗi câu viết trên **1 dòng riêng** (ngăn cách bằng \\n), KHÔNG đánh số thứ tự, KHÔNG gắn timestamp, KHÔNG markdown (\`**\`, \`*\`), KHÔNG emoji, để app đọc TTS & chạy con trỏ chỉ chữ chính xác từng từ.

# ĐỊNH DẠNG ĐẦU RA BẮT BUỘC (XUẤT RA FILE .JSON)
\`\`\`json
{
  "title": "Tiêu đề ngắn gọn, khơi gợi tò mò & cảm xúc 100% bằng ${meta.nativeName} (VD: '${meta.exampleTitle}')",
  "topicBadge": "${meta.badgeSystem} ${level} · READING",
  "level": "${level}",
  "text": "${meta.exampleText}"
}
\`\`\`
Hãy xuất toàn bộ kết quả dưới dạng **1 file \`.json\` hợp lệ hoàn chỉnh** (chỉ trả về JSON, không kèm lời giải thích bên ngoài).`;
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
