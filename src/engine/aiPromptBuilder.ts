import { TYPOGRAPHY_MOBILE_READABILITY_PROMPT_BLOCK } from './englishReelsEngine';
import { LAYOUT_COMPOSITIONS } from './illustrationLayouts';
import { formatAudienceLevelLabel } from './outputNaming';
import { buildSourceSegmentsFromCues, clampCuesToAudioDuration } from './storyboardV19';
import { formatTimeToken } from './transcriptParser';
import {
  CanvasThemeId,
  CustomComponentPresetConfig,
  LayoutCompositionId,
  TranscriptCue,
} from './types';
import { getCartoonAnimationsPromptBlock } from './cartoonAnimationDb';
import { getCatalogSummaryForPrompt } from './vectorComponentDb';

export type PromptVideoStyle = 'tiktok-cards' | '3d-shapes' | 'word-reveal-dark';

export function buildSceneGenerationPrompt(
  cues: TranscriptCue[],
  options?: {
    title?: string;
    style?: PromptVideoStyle;
    compositionId?: LayoutCompositionId | 'ai-decide';
    theme?: CanvasThemeId;
    customConfig?: CustomComponentPresetConfig;
    audioDurationSec?: number | null;
    targetDurationMinutes?: number;
    autonomousScript?: boolean;
    level?: string;
    learningLanguage?: string;
  },
): string {
  const style = options?.style ?? 'tiktok-cards';
  const is3D = style === '3d-shapes';
  const isWordReveal = style === 'word-reveal-dark';
  const aiDecideComposition = options?.compositionId === 'ai-decide';
  const isCartoonHost = !aiDecideComposition && options?.compositionId === 'cartoon-host';

  const audioDur =
    typeof options?.audioDurationSec === 'number' && options.audioDurationSec > 0
      ? options.audioDurationSec
      : null;
  const effectiveCues = audioDur !== null ? clampCuesToAudioDuration(cues, audioDur) : cues;

  const totalStart = effectiveCues.length > 0 ? formatTimeToken(effectiveCues[0].start) : '00:00:00.000';
  const rawCuesLastEnd = cues.length > 0 ? cues[cues.length - 1].end : 30.0;
  const cuesLastEnd = effectiveCues.length > 0 ? effectiveCues[effectiveCues.length - 1].end : 30.0;
  const wasClampedToAudio = audioDur !== null && rawCuesLastEnd > audioDur + 0.05;
  const totalEnd = formatTimeToken(
    audioDur !== null ? Math.min(audioDur, cuesLastEnd + 0.4) : cuesLastEnd + 0.4,
  );
  const tailGap =
    audioDur !== null && effectiveCues.length > 0 ? Number((audioDur - cuesLastEnd).toFixed(2)) : null;

  const compMeta =
    !aiDecideComposition && options?.compositionId
      ? LAYOUT_COMPOSITIONS.find((c) => c.id === options.compositionId)
      : undefined;

  const { variantsListText, sceneIconsListText } = getCatalogSummaryForPrompt();
  const sourceSegments = buildSourceSegmentsFromCues(effectiveCues);
  const sourceSegmentsJson = JSON.stringify(sourceSegments, null, 2);

  // ── Style guide block ──────────────────────────────────────────────────────
  let styleGuide: string;

  if (options?.compositionId === 'custom') {
    const cc = options?.customConfig;
    const hintParts: string[] = [];
    if (cc?.variant) hintParts.push(`component gợi ý từ người dùng: \`variant: "${cc.variant}"\``);
    if (cc?.sceneIcon) hintParts.push(`\`sceneIcon: "${cc.sceneIcon}"\``);
    if (cc?.title?.trim()) hintParts.push(`tiêu đề ưu tiên (\`title\`): "${cc.title.trim()}"`);
    if (cc?.subtitle?.trim()) hintParts.push(`phụ đề (\`subtitle\`): "${cc.subtitle.trim()}"`);
    if (cc?.labels && cc.labels.length > 0) hintParts.push(`nhãn gợi ý (\`labels\`): ${JSON.stringify(cc.labels)}`);
    if (cc?.highlightWord?.trim()) hintParts.push(`từ nhấn (\`highlightWord\`): "${cc.highlightWord.trim()}"`);
    if (cc?.accentColor?.trim()) hintParts.push(`màu nhấn (\`accentColor\`): "${cc.accentColor.trim()}"`);

    styleGuide = `CHẾ ĐỘ TỰ SÁNG TẠO COMPONENT TỪ KHO (AI LÀ NGƯỜI SÁNG TẠO CHÍNH — STRICT CONTEXT MATCH):
- **NGUYÊN TẮC CỐT LÕI**: AI tự do sáng tạo, phối hợp đa dạng toàn bộ Kho Component (54+ mẫu \`bs-*\`, \`css-*\`, life scenes, \`dynamic_scene\`), \`object\`, \`connector\` VÀ \`customPrimitives[]\` cho từng scene — KHÔNG rập khuôn 1 mẫu duy nhất cho cả bài.
- **BẮT BUỘC SÁT NGỮ CẢNH (STRICT CONTEXT)**: Mỗi \`variant\`, \`sceneIcon\`, \`title\`, \`labels\` (tự nghĩ 2–3 nhãn súc tích theo đúng segment) hoặc \`customPrimitives\` phải phản ánh CHÍNH XÁC ý nghĩa từ vựng / tình huống của \`sync_anchor\` tại mốc đó. Tuyệt đối KHÔNG dùng nhãn chung chung vô nghĩa hay icon lạc đề.${
      hintParts.length > 0
        ? `\n- **Gợi ý tùy chọn từ người dùng** (chỉ áp dụng ở scene liên quan, không nhồi vào mọi scene nếu lệch ngữ cảnh): ${hintParts.join(', ')}.`
        : ''
    }`;
  } else if (isWordReveal || options?.compositionId === 'word-reveal') {
    styleGuide = `PHONG CÁCH WORD-REVEAL (@xun52000 — Kinetic Typography tập trung chữ lớn):
- Đặt "theme": "${options?.theme ?? 'studio-slate'}" (hoặc "pastel-sunrise" / "soft-lavender" / "mint-breeze" / "warm-paper").
- Mỗi ý chính → 1 element \`kind: "text"\` / \`sentence_card\` to rõ (vùng giữa \`y: 0.30..0.52, height: 0.16\`), làm nổi từ khóa bằng \`style.emphasisWord\` + \`style.emphasisColor: "#FACC15"\` (nền tối) hoặc \`"#4F46E5"\` (nền sáng).
- "subtext": nghĩa / phonetic nhỏ hơn phía dưới. Dùng \`animation: { "in": "fade-scale", "out": "fade-out", "duration_s": 0.3 }\`.
- Có thể thêm \`word_stack\` hoặc \`shape_3d\` (\`shape_type: "staircase_3d"\`, \`fill: "#FACC15"\`) khi liệt kê 3 cấp độ.
- Vùng karaoke (\`y: 0.76..1.00\`) để app tự render — KHÔNG đặt phần tử tại đây.`;
  } else if (is3D || options?.compositionId === '3d-shapes') {
    styleGuide = `PHONG CÁCH 3D NỔI + KARAOKE ĐẬM:
- Đặt "theme": "${options?.theme ?? 'studio-slate'}" (hoặc các nền sáng/tối tùy chọn, chữ karaoke vàng #FACC15 khi nền tối).
- Ưu tiên dùng \`kind: "shape_3d"\` với \`shape_type: "card_3d" | "pill_3d" | "cube_3d" | "staircase_3d"\` làm điểm nhấn chính ở \`y: 0.24..0.68\`.`;
  } else if (options?.compositionId === 'cartoon-host') {
    const cartoonAnimBlock = getCartoonAnimationsPromptBlock();
    styleGuide = `PHONG CÁCH NHÂN VẬT HOẠT HÌNH LIP-SYNC (@Gimmys — Nền trời xanh & Thẻ tương tác):
- BẮT BUỘC đặt \`"compositionId": "cartoon-host"\` ở JSON gốc và \`"composition": "cartoon-host"\` trên từng scene.
- Đặt \`"theme": "${options?.theme ?? 'pastel-sunrise'}"\`.
- **TIÊU ĐỀ BÀI HỌC (\`"title"\`) NGẮN GỌN, RÕ LEVEL & CHỦ ĐỀ TÁCH BẰNG \`|\`**: Đặt theo mẫu \`"<Level> | <Chủ đề ngắn gọn súc tích>"\` (VD: \`"B1 | Cách gọi nước lịch sự"\` hoặc \`"N4 | CanとCouldの使い分け"\`). Tuyệt đối KHÔNG ghi chú thích kỹ thuật kiểu \`(Transcript ... 1:42)\`.
- **KHÔNG TẠO BONG BÓNG THOẠI LẶP LẠI CÂU NÓI**: App đã có phụ đề vàng nổi bật bên dưới và nhân vật Gimmy tự nhép miệng từng âm tiết.
- **ĐIỀU KHIỂN HÀNH ĐỘNG & BIỂU CẢM NHÂN VẬT @GIMMYS TRÊN TỪNG SCENE**:
  + Mỗi scene có thể gắn \`"cartoonAction": "<actionId>"\` và/hoặc \`"cartoonMood": "excited|happy|curious|warning|neutral|proud|thinking|surprised|celebrate|shy"\` hoặc sáng tạo thông số riêng qua \`"cartoonAnimationSpec"\`!
  + Nếu cần sáng tạo thêm hành động hoàn toàn mới để lưu vào Kho Database của app, có thể thêm mảng \`"cartoonAnimations": [ { id, name, description, mood, gesture, eyeStyle, mouthStyle, fxOverlay, accessory, speed, bounceAmp, headTiltDeg, blushIntensity, badgeEmoji, keywords } ]\` ở JSON gốc.
${cartoonAnimBlock}
- **TẠO COMPONENT TƯƠNG TÁC ĐỂ NHÂN VẬT CHỈ TAY & PHẢN ỨNG THEO NGỮ CẢNH**:
  + Trong mỗi scene, đặt nhãn ngắn (\`kind: "pill"\` ở \`y: 0.14..0.20\`) và thẻ ví dụ tương tác (\`kind: "text"\` / \`sentence_card\` ở \`y: 0.22..0.38\`) thể hiện rõ **ĐÚNG / SAI / TRÁNH DÙNG / MẸO**:
    * Câu sai / nên tránh: \`style: { "badge": "cross", "stampText": "AVOID", "emphasisColor": "#DC2626" }\` + \`"cartoonAction": "warn-avoid"\` → nhân vật tự đổi sang nét mặt cảnh báo & lắc tay!
    * Câu hay / lịch sự / tự nhiên: \`style: { "badge": "check", "stampText": "NATURAL", "emphasisColor": "#16A34A" }\` + \`"cartoonAction": "celebrate-jump"\` (hoặc \`"point-up"\`) → nhân vật cười tươi & chỉ tay lên thẻ!
    * Câu hỏi / trắc nghiệm: \`style: { "badge": "question" }\` + \`"cartoonAction": "think-chin"\` → nhân vật nghiêng đầu suy nghĩ tò mò!
  + Có thể thêm \`kind: "meter"\` (sắc thái) ở \`y: 0.39..0.47\` nhưng PHẢI chừa vùng \`y: 0.44..0.74\` cho nhân vật Gimmy và \`y >= 0.76\` cho phụ đề vàng.`;
  } else if (aiDecideComposition) {
    const compositionList = LAYOUT_COMPOSITIONS.filter((c) => c.id !== 'custom' && c.id !== 'plain')
      .map(
        (c) =>
          `  - "${c.id}" → ${c.name}: ${c.description} (theme: ${c.recommendedTheme}, signature: ${c.signatureVariant})`,
      )
      .join('\n');

    styleGuide = `PHONG CÁCH TIKTOK GIẢNG DẠY (@englishpracticing168) — CHẾ ĐỘ AI TỰ CHỌN PHỐI TỐI ƯU (KHÔNG RANDOM):

**NHIỆM VỤ BỔ SUNG**: Đọc toàn bộ \`source_segments\`, nhận diện mô típ bài, rồi chọn ĐÚNG 1 id làm \`compositionId\` chủ đạo (mỗi scene vẫn có thể ghi \`composition\` phù hợp ngữ cảnh):
${compositionList}

Quy tắc chọn (ưu tiên từ trên xuống):
- Bài đối chiếu 2–3 từ gần nghĩa (Look/See/Watch, Say/Tell/Talk, Hear/Listen...) → "phrase-icon-split"
- Quiz điền khuyết / chọn đáp án kèm công thức [A / B] → "p168-quiz-formula"
- Giải thích công thức ngữ pháp [S + used to + V] → "p168-grammar-formula"
- Quy tắc phát âm (/t/, /d/, /ɪd/, ending sounds, trọng âm) → "p168-pronunciation"
- Các tình huống giao tiếp (Bạn bè, Công sở, Từ chối khéo) → "p168-situations"
- So sánh hai thì hoặc thanh trượt đối chiếu → "p168-slider-compare"
- Có giờ / clock / o'clock → "clock-spotlight"
- Nâng cấp câu boring → natural / don't say → "dialogue-upgrade"
- Các bước 1-2-3 / ladder → "flow-steps"
- Sắc thái polite/rude → "gauge-tone"
- Checklist đúng/sai → "checklist-cards"
- Mốc thời gian / deadline / thì → "timeline-track"
- 3 khái niệm / giới từ / trọng âm → "spatial-contrast"
- Giảng giải đối chiếu đúng/sai qua nhân vật hoạt hình lip-sync (@Gimmys, không bong bóng thoại) → "cartoon-host"
- Từ khóa/câu ngắn mạnh phong cách @xun52000 → "word-reveal"
- Bài giảng 3 cấp độ dùng khối nổi 3D → "3d-shapes"
- Cảnh đời sống / hội thoại / câu chuyện (quán, công sở, bạn bè, sân bay, nhà hàng, mua sắm, bác sĩ, thời tiết...) → "story-scenes"

Quy tắc an toàn (KHÔNG invent type hay icon ngoài danh mục):
- KHÔNG invent type/kind, variant, hay \`sceneIcon\` ngoài danh sách cho phép (tuyệt đối KHÔNG bịa icon như "tree" hay "lightbulb").
- Được phép kết hợp linh hoạt 50+ vector & Bootstrap 5 / Modern CSS variants, 42 \`sceneIcon\`, \`dynamic-scene\`, \`object\`, \`connector\`, và \`customPrimitives\` để minh họa đúng từng cảnh sư phạm.`;
  } else {
    styleGuide = `PHONG CÁCH TIKTOK GIẢNG DẠY (@englishpracticing168)${compMeta ? ` — KIỂU PHỐI: ${compMeta.name}` : ''}:
- Đặt "theme": "${options?.theme ?? compMeta?.recommendedTheme ?? 'pastel-sunrise'}" (hoặc "soft-lavender" / "mint-breeze" / "warm-paper" / "studio-slate").
- Kết hợp thanh đối chiếu (\`kind: "strip"\` / \`comparison_strip\`), nhãn mục tiêu (\`kind: "pill"\`), minh họa ngữ nghĩa (\`kind: "illustration"\` — ${compMeta ? `ưu tiên "${compMeta.signatureVariant}"` : 'đa dạng kho 50+ Bootstrap/CSS & vector'} hoặc \`kind: "object"\` + \`"connector"\`), thẻ câu ví dụ (\`kind: "text"\` / \`sentence_card\`), \`staircase_3d\`, và \`tone_meter\`.`;
  }

  const transcriptLines = effectiveCues
    .map(
      (cue, idx) =>
        `[Cue ${idx + 1} | ${formatTimeToken(cue.start)} -> ${formatTimeToken(cue.end)}] ${cue.text}`,
    )
    .join('\n');

  const resolvedTemplateTheme =
    options?.theme ??
    (isWordReveal || is3D ? 'studio-slate' : compMeta?.recommendedTheme ?? 'pastel-sunrise');

  const targetMinutes =
    typeof options?.targetDurationMinutes === 'number' &&
    Number.isFinite(options.targetDurationMinutes) &&
    options.targetDurationMinutes > 0
      ? Math.max(0.5, Math.min(30, Number(options.targetDurationMinutes.toFixed(1))))
      : null;

  const isAutonomousScript = Boolean(options?.autonomousScript && audioDur === null);
  const learningLangNorm = (options?.learningLanguage || 'en').toLowerCase();
  const isCjkUnit = learningLangNorm === 'ja' || learningLangNorm === 'zh';
  const ratePerMin = isCjkUnit ? 185 : 130;
  const unitShort = isCjkUnit ? 'ký tự' : 'từ';
  const targetWordFloor = targetMinutes ? Math.round(targetMinutes * ratePerMin) : null;
  const chapterCount =
    targetMinutes && targetMinutes >= 5
      ? Math.max(3, Math.min(12, Math.round(targetMinutes / 3)))
      : targetMinutes
        ? 2
        : 2;

  const audioDiagLine =
    audioDur !== null
      ? `- Tổng thời lượng Audio đo được: **${audioDur.toFixed(2)}s** · Segment cuối kết thúc lúc: **${cuesLastEnd.toFixed(2)}s**${
          wasClampedToAudio
            ? ` (đã tự co khớp về đúng độ dài Audio để không vượt quá thời lượng file)`
            : tailGap !== null && tailGap > 0.8
              ? ` (dư khoảng lặng/outro **+${tailGap.toFixed(2)}s** ở cuối — giữ nguyên timestamp thật của segment, KHÔNG kéo dài sai hoặc trộn bộ timestamp khác)`
              : ''
        }.`
      : isAutonomousScript
        ? `- Chế độ **TỰ VIẾT KỊCH BẢN & PHÂN CẢNH ĐỘC LẬP** (chưa có audio cố định; thay thế toàn bộ placeholder trong \`source_segments[]\` bằng kịch bản đầy đủ khớp thời lượng mục tiêu).`
        : `- Tổng phạm vi Transcript: \`${totalStart}\` → \`${totalEnd}\` (${effectiveCues.length} segments).`;

  const durationBudgetLine = targetMinutes
    ? [
        `- **Thời lượng TỐI THIỂU (MỨC SÀN — CHỈ ĐƯỢC DÀI HƠN, KHÔNG ĐƯỢC THẤP HƠN)**: Mức **${targetMinutes} phút (~${Math.round(targetMinutes * 60)} giây${targetWordFloor ? `, tối thiểu ~${targetWordFloor}+ ${unitShort} lời đọc` : ''})** là ngưỡng sàn tối thiểu. Hãy để **số lượng mục kiến thức và chiều sâu phân tích** quyết định thời lượng thực tế (được phép dài hơn ${targetMinutes} phút để diễn giải trọn vẹn, TUYỆT ĐỐI KHÔNG cắt xén, KHÔNG dừng sớm ở 8–15 câu / ~3 phút!).`,
        ...(targetMinutes >= 5 && audioDur === null
          ? [
              `  + **KẾ HOẠCH CHIA ${chapterCount} CHƯƠNG / PHẦN CHUYÊN SÂU ĐỂ ĐẠT >= ${targetMinutes} PHÚT**: Chia nội dung thành **${chapterCount} phần/chương nối tiếp nhau** (mỗi phần ~${Math.round((targetWordFloor || 650) / chapterCount)}+ ${unitShort} lời đọc và nhiều \`scenes[]\` liên tiếp), đi từ tình huống thực tế → bản chất ngữ dụng/tâm lý giao tiếp → đối chiếu lỗi sai thường gặp → sắc thái nâng cao → hội thoại/thực hành.`,
            ]
          : []),
        ...(audioDur !== null && audioDur < targetMinutes * 60 - 15
          ? [
              `  + **LƯU Ý AUDIO ĐẦU VÀO NGẮN HƠN MỤC TIÊU**: Audio hiện tại chỉ dài **${(audioDur / 60).toFixed(1)} phút (${audioDur.toFixed(1)}s)**, thấp hơn sàn ${targetMinutes} phút — hãy giữ 100% timestamp khớp Audio thật và ghi rõ lý do trong \`"durationReport"\` (\`"metMinimum": false\`, \`"shortfallReason": "Audio/Transcript đầu vào chỉ dài ..."\`).`,
            ]
          : []),
        `- **KỶ LUẬT CHẤT LƯỢNG (DÀI NHƯNG CẤM LAN MAN, CẤM LẶP LẠI, BẮT BUỘC SÂU SẮC)**:`,
        `  + **CẤM LAN MAN**: Không viết câu mở đầu sáo rỗng hay dông dài ngoài lề; mọi lời thoại/giải thích phải đi thẳng vào giá trị thực chiến.`,
        `  + **CẤM LẶP LẠI**: Không lặp lại cùng từ vựng, cùng ví dụ hay cùng khuôn mẫu giải thích nhàm chán giữa các scene/segment.`,
        `  + **BẮT BUỘC SÂU SẮC**: Phân tích rõ TẠI SAO người bản xứ nói vậy, sắc thái lịch sự/thân mật, bẫy dịch sai dễ mắc và ví dụ đời thực sống động.`,
        `- **TỰ KIỂM ĐẾM & GIẢI TRÌNH NẾU CHƯA ĐẠT ${targetMinutes} PHÚT**: Trước khi xuất JSON, tự kiểm tra tổng số ${unitShort} lời đọc và tổng thời lượng \`source_segments[]\`. Nếu chưa đạt tối thiểu ${targetMinutes} phút mà có thể mở rộng sâu hơn một cách giá trị, hãy viết thêm chương/scene trước khi xuất; nếu vẫn không đạt được (do giới hạn độ dài output của AI trong 1 lượt, hoặc nguồn đầu vào/audio quá ngắn), BẮT BUỘC ghi trung thực vào \`"durationReport"\` (\`"metMinimum": false\`, \`"shortfallReason": "..."\`).`,
      ].join('\n')
    : `- **Chiều sâu kiến thức & chất lượng giải thích là tiêu chí bắt buộc**: Hãy để số lượng mục kiến thức và độ sâu phân tích quyết định độ dài từng scene — TUYỆT ĐỐI KHÔNG viết câu cụt, ví dụ nửa vời, lan man hay lặp lại.`;

  const pickCleanSampleQuote = (raw: string | undefined, fallback: string, maxChars = 64): string => {
    const clean = (raw || '').trim();
    if (!clean) return fallback;
    if (clean.length <= maxChars) return clean;
    const sliced = clean.slice(0, maxChars);
    const lastSpace = sliced.lastIndexOf(' ');
    return lastSpace > 18 ? sliced.slice(0, lastSpace).trim() : sliced.trim();
  };

  const exampleSegId = sourceSegments[0]?.segment_id ?? 'seg_001';
  const exampleQuote = pickCleanSampleQuote(sourceSegments[0]?.text, 'Lesson intro');
  const secondSeg = sourceSegments[1] ?? sourceSegments[0];
  const exampleSegId2 = secondSeg?.segment_id ?? exampleSegId;
  const exampleQuote2 = pickCleanSampleQuote(secondSeg?.text, exampleQuote);

  const stage1RuleLine = isAutonomousScript
    ? `- **LUẬT DỰNG KỊCH BẢN & TIMESTAMP CHUẨN**: Hãy THAY THẾ toàn bộ các dòng placeholder trong \`source_segments[]\` mẫu bằng **đầy đủ kịch bản lời đọc thực tế** (\`seg_001\`, \`seg_002\`, ... liên tục tăng dần \`start\` / \`end\`, mỗi segment ~6–12 giây ứng với ~15–28 từ hoặc 1 câu hoàn chỉnh) sao cho tổng thời lượng chạm hoặc vượt mốc **${targetMinutes ?? 2} phút (~${Math.round((targetMinutes ?? 2) * 60)} giây, >= ~${targetWordFloor ?? 260} ${unitShort})**. Tuyệt đối KHÔNG giữ lại chữ \`[Segment ... placeholder]\`!`
    : `- **LUẬT BẢO TOÀN TRANSCRIPT**: Sao chép CHÍNH XÁC từng ký tự trong \`source_segments[]\` bên dưới (giữ nguyên dấu phẩy, dấu ngoặc kép \`"..."\`, chấm hỏi, xuống dòng, \`segment_id\`, \`start\`, \`end\`). Tuyệt đối KHÔNG sửa chính tả, không bỏ dấu ngoặc kép (VD: \`"I'm looking," he says,\` phải giữ nguyên từng dấu câu). Không bao giờ trộn hai bộ timestamp khác nhau.`;

  return `# KIẾN TRÚC PIPELINE 5 GIAI ĐOẠN — STORYBOARD SCHEMA v1.9
Bạn đóng vai **Instructional Designer + Motion Graphics Director** cho video dọc 9:16 (1080×1920).
Trả về **DUY NHẤT 1 KHỐI JSON HỢP LỆ** chuẩn \`schema_version: "1.9"\` (không giải thích ngoài JSON).

## STAGE 1 — AUDIO + TRANSCRIPT (${isAutonomousScript ? 'TỰ SOẠN KỊCH BẢN ĐỦ THỜI LƯỢNG' : 'BẢO TOÀN NGUYÊN VĂN 100%'})
${audioDiagLine}${durationBudgetLine ? `\n${durationBudgetLine}` : ''}
${stage1RuleLine}

## STAGE 2 — INSTRUCTIONAL DESIGNER (CHIA ĐA SCENE SƯ PHẠM)
- **CẤM DỒN 1 SCENE & CẤM CÂU CỤT VÔ NGHĨA**: Tuyệt đối KHÔNG nhét toàn bộ bài vào 1 scene \`sc1\` duy nhất và KHÔNG cắt xén thành các câu cụt thiếu nghĩa! Hãy chia bài học thành **nhiều \`scenes[]\` liên tiếp** (\`sc_01\`, \`sc_02\`, \`sc_03\`... mỗi scene giải quyết trọn vẹn 1 mục kiến thức có chiều sâu: Intro Hook → Tình huống/Quy tắc 1 → Đối chiếu lỗi sai & giải thích bản chất → Takeaway/Practice).
- Mỗi scene phải gắn đúng \`segment_id\` tăng dần theo mạch bài học (không trỏ toàn bộ scene vào \`seg_001\`).
- Mỗi scene phải có \`scene_id\`, \`title\`, \`learning_objective\`, \`composition\`, \`transition\`, và dạy được ý nghĩa bài học **ngay cả khi tắt tiếng** nhờ sơ đồ/vật thể/chú thích trực quan có giá trị thực tiễn cao.

## STAGE 3 — MOTION GRAPHICS DIRECTOR (TỌA ĐỘ 0..1 & ĐỒNG BỘ \`sync_anchor\`)
### ${styleGuide}
Tiêu đề bài học (đặt thật hay, gợi tò mò ở trước và trình độ dành cho ai bằng đúng ngôn ngữ học ở sau dấu \`|\`, CẤM đặt tên phẳng khô khan): "${options?.title || `It started with one small favor… and changed everything | ${formatAudienceLevelLabel(options?.level || 'B1', options?.learningLanguage)}`}"

### Hệ tọa độ chuẩn hóa 0..1 (Top-Left Origin, CHỐNG CHỒNG HÌNH)
Mỗi element dùng \`position: { "x": 0..1, "y": 0..1, "width": 0..1, "height": 0..1 }\` tính từ góc **trên-trái**:
- \`y: 0.06 .. 0.13\` — Thanh đối chiếu (\`kind: "strip"\` / \`comparison_strip\`) hoặc Header bài.
- \`y: 0.145 .. 0.205\` — Nhãn mục tiêu / số thứ tự (\`kind: "pill"\`, VD \`01 / 06 · CORE RULE\`).
- \`y: 0.22 .. 0.45\` — Minh họa chính / Sơ đồ / Vật thể ngữ nghĩa (\`kind: "illustration"\`, \`"object"\`, \`"connector"\`, \`"shape_3d"\`, \`"word_stack"\`).
- \`y: 0.47 .. 0.64\` — Thẻ câu trọng tâm / giải thích (\`kind: "text"\` / \`sentence_card\`).
- \`y: 0.65 .. 0.74\` — Thanh sắc thái (\`kind: "meter"\`) nếu có.
- **VÙNG CẤM KARAOKE (\`y >= 0.76\`..1.00)**: Chừa trống hoàn toàn để app tự render phụ đề Karaoke highlight từng từ. Mọi element PHẢI thỏa \`position.y + position.height <= 0.75\` và \`position.x + position.width <= 0.98\`.
- **Chống chồng hình trong cùng Scene**: Hai element hiển thị trùng thời điểm trong cùng scene KHÔNG được có bounding-box \`position\` giao nhau (trừ \`connector\` nối giữa 2 khối).

### Bố cục signature @englishpracticing168 (luân phiên đa dạng qua từng scene)
- **Scene quiz điền khuyết + công thức**: \`variant: "p168-step-quiz-formula"\` (kèm \`formula\`, \`speechText\`, \`labels\`).
- **Scene công thức ngữ pháp nổi bật**: \`variant: "p168-grammar-formula"\` (kèm \`formula\`, \`speechText\`, \`subtitle\`).
- **Scene bảng quy tắc phát âm (/t/, /d/, /ɪd/)**: \`variant: "p168-pronunciation-matrix"\` (kèm \`nodes\`, \`labels\`).
- **Scene thẻ tình huống giao tiếp**: \`variant: "p168-situation-cards"\` (kèm \`title\`, \`nodes\` có \`sceneIcon\`).
- **Scene thanh trượt so sánh thì / cặp câu**: \`variant: "p168-slider-compare"\` (kèm \`labels: [A, B]\`, \`value\`).
- **Scene hội thoại truyện ngắn 2 nhân vật**: \`variant: "p168-story-dialogue"\` (kèm \`title\`, \`nodes\`).
- **Scene đối chiếu 2 từ/2 mẫu câu**: \`variant: "contrast-pair-cards"\` (kèm \`labels: ["Basic", "Natural"]\` hoặc \`formula: "arrow"\` / \`"cross"\`) hoặc \`kind: "object"\` + \`"connector"\`.
- **Scene 3 khái niệm song song**: \`variant: "trio-icon-cards"\` hoặc \`variant: "phrase-icon-split"\`.
- **Scene từ vựng trọng tâm**: \`variant: "css-magnifying-word"\` hoặc \`"css-flashcard-flip"\` + \`style.emphasisWord\` trên thẻ \`text\`.
- **Scene nâng cấp câu / lỗi thường gặp**: \`variant: "dialogue-upgrade"\` hoặc \`"bs-alert-tip"\` + \`badge: "cross"\` / \`"check"\`.
- **Scene 3 cấp độ / lộ trình**: \`kind: "shape_3d"\` (\`"staircase_3d"\`) hoặc \`variant: "degree-scale"\` / \`"css-roadmap-steps"\`.

### Hệ thống đồng bộ \`sync_anchor\` (BẮT BUỘC trên mọi element)
Thay vì tự đoán giây rời rạc, mọi element gắn với đoạn nói bằng:
\`"sync_anchor": { "segment_id": "seg_001", "anchor_type": "segment_start" | "phrase" | "segment_end" | "full_segment", "quote": "<trích nguyên văn 100% chuỗi con nằm trong segment.text>" }\`
- \`"phrase"\`: element xuất hiện đúng khoảnh khắc cụm từ \`quote\` được đọc trong segment đó!
- \`"quote"\` PHẢI là chuỗi con xuất hiện nguyên văn trong \`source_segments[segment_id].text\` (không được tự viết lại khác dấu câu, không cắt nửa từ).

### Các \`kind\` & Component được hỗ trợ trong \`elements[]\`
1. \`"kind": "strip"\` (\`comparison_strip\`): \`items: [{ label, sublabel?, accentColor?, sync_anchor? }]\`
2. \`"kind": "pill"\` (role \`"label"\` / \`"scene_title"\`): \`content\`, \`style: { bgColor, textColor }\`
3. \`"kind": "text"\` (\`sentence_card\`): \`role\`: \`"headline" | "example_sentence" | "definition" | "note"\`, \`content\`, \`subtext\`, \`style: { badge: "check"|"cross"|"question"|"none", emphasisWord, emphasisColor, stampText, bgColor, textColor }\`
4. \`"kind": "illustration"\`:
   - \`variant\` CHỈ được chọn từ Kho 54+ Bootstrap 5 / Modern CSS / Vector bên dưới (hoặc \`"dynamic-scene"\` hoặc \`"custom-ui"\` kèm \`customPrimitives\`):
${variantsListText}
   - **CHỈ DÙNG 42 \`sceneIcon\` HỢP LỆ SAU** (tuyệt đối KHÔNG tự bịa tên như \`"tree"\`, \`"lightbulb"\`, \`"arrow"\`...):
     ${sceneIconsListText}
   - Có thể tùy biến tham số (\`title\`, \`subtitle\`, \`labels\`, \`formula\`, \`value\`, \`highlightWord\`, \`sceneIcon\`), dùng \`dynamicScene\`, hoặc tự vẽ qua \`customPrimitives[]\` (tọa độ tương đối tâm \`(0,0)\`: \`rect\`, \`pill\`, \`circle\`, \`ellipse\`, \`line\`, \`arrow\`, \`polygon\`, \`icon\`, \`text\`).
5. \`"kind": "object"\`: Vật thể ngữ nghĩa tự dựng (\`object_spec: { label, sublabel, icon, primitives? }\` hoặc \`customPrimitives[]\`).
6. \`"kind": "connector"\`: Mũi tên / đường nối quan hệ nhân-quả hoặc chuyển đổi (\`connector_spec: { from, to, direction: "right"|"left"|"down"|"up", label, arrow: true }\`).
7. \`"kind": "word_stack"\`: \`rows: [{ prefix, suffix, suffixColor, phonetic, sync_anchor }]\`
8. \`"kind": "shape_3d"\`: \`shape_type: "staircase_3d" | "card_3d" | "pill_3d" | "cube_3d"\`, \`step_labels\`, \`content\`, \`style: { fill, textColor, depth }\`
9. \`"kind": "meter"\`: \`title\`, \`leftLabel\`, \`rightLabel\`, \`valueStart\`, \`valueEnd\`

${TYPOGRAPHY_MOBILE_READABILITY_PROMPT_BLOCK}

# QUY TẮC CÂU NGOẠI NGỮ & GIẢI THÍCH TỪ VỰNG / NGỮ PHÁP KHÓ (TRÌNH ĐỘ: ${options?.level || 'B1'})
1. **CẤM TẠO CÁCH ĐỌC CẢ CÂU**: Khi viết câu ngoại ngữ (đặc biệt tiếng Nhật), viết câu tự nhiên (漢字 + かな). **TUYỆT ĐỐI KHÔNG** viết lại cả câu bằng Hiragana, KHÔNG chèn Furigana \`漢字(かんじ)\` cho cả câu, KHÔNG nhồi Romaji/Pinyin/IPA vào \`content\` hoặc \`subtext\` theo kiểu phiên âm nguyên câu.
2. **TỪ VỰNG / NGỮ PHÁP KHÓ SO VỚI TRÌNH ĐỘ (${options?.level || 'B1'})**: Nếu một câu có **từ vựng khó** hoặc **ngữ pháp khó** so với trình độ **${options?.level || 'B1'}**, hãy ghi **giải thích ngắn gọn + cách dùng + chú ý nếu có** vào \`subtext\` hoặc element \`role: "note"\` / \`"definition"\`. **Riêng nếu từ vựng khó là chữ Kanji thì ghi kèm cách đọc Hiragana của CHÍNH TỪ KANJI ĐÓ** (VD: \`雰囲気（ふんいき）: bầu không khí — cách dùng & chú ý...\`), không viết Hiragana cho cả câu.

# LUẬT CHỐNG ĐỤNG HÀNG & ĐA DẠNG THỊ GIÁC
1. **KHÔNG lặp nguyên mẫu**: Không dùng trùng \`variant\` hoặc \`dynamicScene.layout\` ở 2 scene/nhịp liên tiếp.
2. **Phối hợp ít nhất 3–4 họ thị giác trong 1 video**: Họ đối chiếu @englishpracticing168 (\`contrast-pair-cards\`, \`trio-icon-cards\`, \`phrase-icon-split\`, \`dialogue-upgrade\`), Họ **BOOTSTRAP 5 / MODERN CSS** (\`css-sticky-note\`, \`bs-badge-cluster\`, \`css-magnifying-word\`, \`bs-modal-quiz\`, \`bs-card-header\`, \`css-bento-stats\`...), Họ sơ đồ/3D (\`staircase_3d\`, \`object\` + \`connector\`), và \`customPrimitives\`.
3. **Nhất quán nghệ thuật (\`style_profile\`)**: Khai báo \`style_profile\` cố định bảng màu chủ đạo xuyên suốt các scene.

## STAGE 4 — TỰ KIỂM TRA SEMANTIC VALIDATOR TRƯỚC KHI XUẤT JSON
Đảm bảo 100% các điều kiện sau trước khi trả JSON:
- \`source_segments\` khớp nguyên văn transcript, không sót hay sửa dấu câu.
- Có **nhiều scene** (\`scenes.length >= 2\` nếu transcript có ≥ 4 câu), mỗi scene gắn đúng \`segment_id\` tiếp nối mạch bài học.
- **Mỗi scene BẮT BUỘC có ít nhất 1 thành phần thị giác sinh động** (\`illustration\`, \`object\` + \`connector\`, \`shape_3d\`, hoặc \`word_stack\`) đi kèm \`pill\`/\`strip\`/\`text\` — **KHÔNG BAO GIỜ chỉ xuất mỗi \`text\` hay \`pill\` đơn điệu**. ${
    isCartoonHost
      ? '**Ngoại lệ @Gimmys (`cartoon-host`)**: Nhân vật hoạt hình lip-sync ở vùng giữa (`y: 0.42..0.74`) do app tự động render và tự chỉ tay lên thẻ — KHÔNG nhét `illustration` / `object` / `connector` đè lên nhân vật; mỗi scene chỉ cần `pill` + `text` (`sentence_card` kèm `style.badge: "cross" | "check" | "question"` & `stampText`) + tùy chọn `meter`!'
      : ''
  }
- Lưu ý: \`"animation": { "duration_s": 0.35 }\` CHỈ là tốc độ hiệu ứng bay vào/ra (transition), **KHÔNG phải thời lượng hiển thị** của component — app tự giữ component hiển thị trọn vẹn theo \`sync_anchor\` (\`full_segment\` / đến hết segment hoặc scene).
- Mọi \`sync_anchor.segment_id\` đều tồn tại trong \`source_segments\` và \`sync_anchor.quote\` có thật trong \`segment.text\`.
- Mọi \`sceneIcon\` đều nằm trong danh sách 42 icon chuẩn; mọi \`variant\` có trong Kho hoặc dùng \`customPrimitives\`.
- Mọi \`position\` thỏa \`x >= 0\`, \`y >= 0\`, \`x + width <= 1\`, \`y + height <= 0.75\`, và không chồng nhau trong cùng scene.

- Đặt \`"title"\` thật ngắn gọn (tối đa ~8–12 từ), súc tích, khơi gợi tò mò & cảm xúc đúng với nội dung bài (VD kiểu \`"【Bạn có hay nói nhầm?】Đừng dùng 'Want Water' nữa!"\` hoặc \`"【このペースで言える？】英会話のための瞬間英作文"\` phù hợp ngôn ngữ bài học).

# MẪU JSON OUTPUT CHUẨN v1.9
\`\`\`json
${
  isCartoonHost
    ? `{
  "schema_version": "1.9",
  "title": "${options?.title || '水が欲しい時、CanとCouldどっち？'}",
  "theme": "${resolvedTemplateTheme}",
  "compositionId": "cartoon-host",
  "compositionReason": "Nhân vật @Gimmys chỉ tay lên thẻ ví dụ Đúng/Sai và lip-sync theo lời giảng",
  "style_profile": {
    "palette": "${resolvedTemplateTheme}",
    "primaryAccent": "#2563EB",
    "secondaryAccent": "#16A34A",
    "cardStyle": "elevated-rounded",
    "typography": "Outfit + Plus Jakarta Sans"
  },
  ${targetMinutes ? `"durationReport": { "targetMinutes": ${targetMinutes}, "estimatedMinutes": ${targetMinutes}, "estimatedCount": ${targetWordFloor ?? 260}, "metMinimum": true, "shortfallReason": "" },\n  ` : ''}"source_segments": ${sourceSegmentsJson},
  "scenes": [
    {
      "scene_id": "sc_01",
      "title": "The Situation",
      "learning_objective": "Spot why casual phrasing feels too blunt",
      "composition": "cartoon-host",
      "cartoonAction": "warn-avoid",
      "cartoonMood": "worried",
      "transition": "fade",
      "elements": [
        {
          "element_id": "el_01",
          "kind": "pill",
          "role": "scene_title",
          "content": "01 · THE SITUATION",
          "sync_anchor": { "segment_id": "${exampleSegId}", "anchor_type": "segment_start", "quote": ${JSON.stringify(exampleQuote)} },
          "position": { "x": 0.20, "y": 0.135, "width": 0.60, "height": 0.05 },
          "style": { "bgColor": "#FEE2E2", "textColor": "#B91C1C" },
          "animation": { "in": "pop-up", "out": "fade-out", "duration_s": 0.35 }
        },
        {
          "element_id": "el_02",
          "kind": "text",
          "role": "example_sentence",
          "content": ${JSON.stringify(exampleQuote)},
          "subtext": "Too direct / casual in polite contexts",
          "sync_anchor": { "segment_id": "${exampleSegId}", "anchor_type": "full_segment", "quote": ${JSON.stringify(exampleQuote)} },
          "position": { "x": 0.08, "y": 0.20, "width": 0.84, "height": 0.17 },
          "style": { "badge": "cross", "stampText": "AVOID", "emphasisColor": "#DC2626" },
          "animation": { "in": "pop-up", "out": "shrink", "duration_s": 0.35 }
        }
      ]
    },
    {
      "scene_id": "sc_02",
      "title": "Natural Upgrade",
      "learning_objective": "Show the natural, polite expression with Gimmy approving",
      "composition": "cartoon-host",
      "cartoonAction": "point-up",
      "cartoonMood": "happy",
      "transition": "fade",
      "elements": [
        {
          "element_id": "el_03",
          "kind": "pill",
          "role": "scene_title",
          "content": "02 · NATURAL UPGRADE",
          "sync_anchor": { "segment_id": "${exampleSegId2}", "anchor_type": "segment_start", "quote": ${JSON.stringify(exampleQuote2)} },
          "position": { "x": 0.20, "y": 0.135, "width": 0.60, "height": 0.05 },
          "style": { "bgColor": "#DCFCE7", "textColor": "#15803D" },
          "animation": { "in": "pop-up", "out": "fade-out", "duration_s": 0.35 }
        },
        {
          "element_id": "el_04",
          "kind": "text",
          "role": "example_sentence",
          "content": ${JSON.stringify(exampleQuote2)},
          "subtext": "Polite, natural everyday phrasing",
          "sync_anchor": { "segment_id": "${exampleSegId2}", "anchor_type": "full_segment", "quote": ${JSON.stringify(exampleQuote2)} },
          "position": { "x": 0.08, "y": 0.20, "width": 0.84, "height": 0.17 },
          "style": { "badge": "check", "stampText": "NATURAL", "emphasisColor": "#16A34A" },
          "animation": { "in": "pop-up", "out": "fade-out", "duration_s": 0.35 }
        },
        {
          "element_id": "el_05",
          "kind": "meter",
          "role": "tone_gauge",
          "title": "POLITENESS",
          "leftLabel": "Direct",
          "rightLabel": "Polite!",
          "valueStart": 0.25,
          "valueEnd": 0.88,
          "sync_anchor": { "segment_id": "${exampleSegId2}", "anchor_type": "full_segment", "quote": ${JSON.stringify(exampleQuote2)} },
          "position": { "x": 0.12, "y": 0.385, "width": 0.76, "height": 0.075 },
          "animation": { "in": "slide-up", "out": "fade-out", "duration_s": 0.35 }
        }
      ]
    }
  ]
}`
    : `{
  "schema_version": "1.9",
  "title": "${options?.title || `It started with one small favor… and changed everything | ${formatAudienceLevelLabel(options?.level || 'B1', options?.learningLanguage)}`}",
  "theme": "${resolvedTemplateTheme}",
  "compositionId": "${aiDecideComposition ? 'story-scenes' : compMeta?.id || 'story-scenes'}",
  "compositionReason": "<1 câu ngắn nêu đúng mô típ bài học>",
  "style_profile": {
    "palette": "${resolvedTemplateTheme}",
    "primaryAccent": "#2563EB",
    "secondaryAccent": "#16A34A",
    "cardStyle": "elevated-rounded",
    "typography": "Outfit + Plus Jakarta Sans"
  },
  ${targetMinutes ? `"durationReport": { "targetMinutes": ${targetMinutes}, "estimatedMinutes": ${targetMinutes}, "estimatedCount": ${targetWordFloor ?? 260}, "metMinimum": true, "shortfallReason": "" },\n  ` : ''}"source_segments": ${sourceSegmentsJson},
  "scenes": [
    {
      "scene_id": "sc_01",
      "title": "Hook & Core Contrast",
      "learning_objective": "Introduce the core distinction visually",
      "composition": "${aiDecideComposition ? 'story-scenes' : compMeta?.id || 'story-scenes'}",
      "transition": "fade",
      "elements": [
        {
          "element_id": "el_01",
          "kind": "strip",
          "role": "comparison_header",
          "items": [
            { "label": "Literal", "sublabel": "Word for word", "accentColor": "#64748B" },
            { "label": "Natural", "sublabel": "Native flow", "accentColor": "#2563EB" }
          ],
          "sync_anchor": { "segment_id": "${exampleSegId}", "anchor_type": "segment_start", "quote": ${JSON.stringify(exampleQuote)} },
          "position": { "x": 0.08, "y": 0.06, "width": 0.84, "height": 0.07 },
          "animation": { "in": "drop-in", "out": "fade-out", "duration_s": 0.35 }
        },
        {
          "element_id": "el_02",
          "kind": "pill",
          "role": "scene_title",
          "content": "01 · CORE CONCEPT",
          "sync_anchor": { "segment_id": "${exampleSegId}", "anchor_type": "segment_start", "quote": ${JSON.stringify(exampleQuote)} },
          "position": { "x": 0.22, "y": 0.145, "width": 0.56, "height": 0.05 },
          "style": { "bgColor": "#EEF2FF", "textColor": "#3730A3" },
          "animation": { "in": "pop-up", "out": "fade-out", "duration_s": 0.35 }
        },
        {
          "element_id": "el_03",
          "kind": "illustration",
          "role": "visual",
          "variant": "${!aiDecideComposition && compMeta?.signatureVariant ? compMeta.signatureVariant : 'bs-card-header'}",
          "sceneIcon": "sparkles",
          "formula": "LESSON FOCUS",
          "title": "Key Contrast",
          "subtitle": "Visualize the real-life situation clearly",
          "highlightWord": "Native Tip",
          "sync_anchor": { "segment_id": "${exampleSegId}", "anchor_type": "full_segment", "quote": ${JSON.stringify(exampleQuote)} },
          "position": { "x": 0.08, "y": 0.22, "width": 0.84, "height": 0.22 },
          "animation": { "in": "fade-scale", "out": "fade-out", "duration_s": 0.35 }
        },
        {
          "element_id": "el_04",
          "kind": "text",
          "role": "example_sentence",
          "content": ${JSON.stringify(exampleQuote)},
          "subtext": "Natural native phrasing",
          "sync_anchor": { "segment_id": "${exampleSegId}", "anchor_type": "full_segment", "quote": ${JSON.stringify(exampleQuote)} },
          "position": { "x": 0.08, "y": 0.47, "width": 0.84, "height": 0.15 },
          "style": { "badge": "check", "emphasisColor": "#2563EB" },
          "animation": { "in": "slide-up", "out": "shrink", "duration_s": 0.35 }
        }
      ]
    },
    {
      "scene_id": "sc_02",
      "title": "Compare & Practice",
      "learning_objective": "Contrast patterns using semantic objects & connectors",
      "composition": "${aiDecideComposition ? 'story-scenes' : compMeta?.id || 'story-scenes'}",
      "transition": "fade",
      "elements": [
        {
          "element_id": "el_05",
          "kind": "object",
          "role": "subject",
          "object_spec": { "label": "Pattern A", "sublabel": "Basic", "icon": "book" },
          "sync_anchor": { "segment_id": "${exampleSegId2}", "anchor_type": "segment_start", "quote": ${JSON.stringify(exampleQuote2)} },
          "position": { "x": 0.06, "y": 0.23, "width": 0.36, "height": 0.18 },
          "animation": { "in": "pop-up", "out": "fade-out", "duration_s": 0.35 }
        },
        {
          "element_id": "el_06",
          "kind": "connector",
          "role": "relation",
          "connector_spec": { "from": "el_05", "to": "el_07", "direction": "right", "label": "Upgrade", "arrow": true },
          "sync_anchor": { "segment_id": "${exampleSegId2}", "anchor_type": "full_segment", "quote": ${JSON.stringify(exampleQuote2)} },
          "position": { "x": 0.43, "y": 0.27, "width": 0.14, "height": 0.10 },
          "animation": { "in": "fade-scale", "out": "fade-out", "duration_s": 0.35 }
        },
        {
          "element_id": "el_07",
          "kind": "object",
          "role": "target",
          "object_spec": { "label": "Pattern B", "sublabel": "Natural", "icon": "check" },
          "sync_anchor": { "segment_id": "${exampleSegId2}", "anchor_type": "full_segment", "quote": ${JSON.stringify(exampleQuote2)} },
          "position": { "x": 0.58, "y": 0.23, "width": 0.36, "height": 0.18 },
          "animation": { "in": "pop-up", "out": "fade-out", "duration_s": 0.35 }
        },
        {
          "element_id": "el_08",
          "kind": "meter",
          "role": "tone_gauge",
          "title": "NATURALNESS",
          "leftLabel": "Textbook",
          "rightLabel": "Native!",
          "valueStart": 0.25,
          "valueEnd": 0.88,
          "sync_anchor": { "segment_id": "${exampleSegId2}", "anchor_type": "full_segment", "quote": ${JSON.stringify(exampleQuote2)} },
          "position": { "x": 0.10, "y": 0.64, "width": 0.80, "height": 0.09 },
          "animation": { "in": "slide-up", "out": "fade-out", "duration_s": 0.35 }
        }
      ]
    }
  ]
}`
}
\`\`\`

# TRANSCRIPT THAM CHIẾU (${effectiveCues.length} CUES)
${transcriptLines}

# YÊU CẦU ĐẦU RA CUỐI CÙNG
- Hãy xuất kết quả dưới dạng **DUY NHẤT 1 file \`.json\` (hoặc khối mã \`\`\`json hợp lệ để lưu thành file .json)** hoàn chỉnh, đúng chuẩn schema v1.9 ở trên, KHÔNG kèm giải thích thừa.`;
}
