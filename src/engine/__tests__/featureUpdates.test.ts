import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {
  hitTestCanvasOverlayZone,
  resolveElementLayoutForAspect,
  resolveLessonTitleBox,
} from '../canvasRenderer';
import { computeSpeechLipSyncState } from '../cartoonHostAnimator';
import { splitMixedLanguageTtsSpans } from '../bilingualTtsHelper';
import {
  buildAiCreatorWebAiPrompt,
  buildEnglishReelsWebAiPrompt,
  buildReelCardsRuleBased,
  buildSpeakerVoiceMap,
  buildStarterLessonForLanguage,
  buildTranslationChallengePrompt,
  CREATOR_FORMAT_OPTIONS,
  parseEnglishReelsAiJson,
  recommendCreatorItemCount,
  recommendTranslationItemCount,
  reelCardsToLessonProject,
} from '../englishReelsEngine';
import { buildSceneGenerationPrompt } from '../aiPromptBuilder';
import {
  detectActiveStageOverlaps,
  reflowElementsAvoidingOverlap,
} from '../layoutSolver';
import { estimateMp4FileSize, formatMegabytesLabel } from '../mp4Config';
import { LAYOUT_COMPOSITIONS } from '../illustrationLayouts';
import {
  buildBatchPromptZipName,
  buildBatchTtsSegmentsForReelCards,
  generateBatchPromptsForTopics,
  getBatchPromptSubfolder,
} from '../multiTabBatchHelper';
import {
  buildReadingWebAiPrompt,
  computeReadingTargetLength,
} from '../readingPromptBuilder';
import {
  buildLeveledOutputStem,
  cleanOutputTitleStem,
  formatAudienceLevelLabel,
  toPlatformSafeDiskFileName,
} from '../outputNaming';
import { LessonProject, SceneElement, TranscriptCue } from '../types';
import { buildZipArchive, extractFilesFromZipArchive } from '../../utils/zipBuilder';

test('zipBuilder roundtrips STORE and DEFLATE entries cleanly', async () => {
  const helloBytes = new TextEncoder().encode('{"title":"Pharsal Verbs Deep Dive","cards":[]}');
  const readmeBytes = new TextEncoder().encode('Batch prompt readme content');
  const storeZip = buildZipArchive({
    'lesson_01.json': helloBytes,
    'notes/info.txt': readmeBytes,
  });

  const unpackedStore = await extractFilesFromZipArchive(storeZip);
  assert.equal(
    new TextDecoder().decode(unpackedStore['lesson_01.json']),
    '{"title":"Pharsal Verbs Deep Dive","cards":[]}',
  );
  assert.equal(new TextDecoder().decode(unpackedStore['notes/info.txt']), 'Batch prompt readme content');

  // Craft a valid minimal DEFLATE zip buffer manually via Node zlib to test DEFLATE extraction path
  const rawContent = Buffer.from('{"hello":"compressed"}', 'utf-8');
  const deflated = zlib.deflateRawSync(rawContent);
  const nameBuf = Buffer.from('compressed.json', 'utf-8');
  const localHdr = Buffer.alloc(30 + nameBuf.length);
  localHdr.writeUInt32LE(0x04034b50, 0);
  localHdr.writeUInt16LE(20, 4);
  localHdr.writeUInt16LE(8, 8); // method 8 = DEFLATE
  localHdr.writeUInt32LE(deflated.length, 18);
  localHdr.writeUInt32LE(rawContent.length, 22);
  localHdr.writeUInt16LE(nameBuf.length, 26);
  nameBuf.copy(localHdr, 30);

  const centralHdr = Buffer.alloc(46 + nameBuf.length);
  centralHdr.writeUInt32LE(0x02014b50, 0);
  centralHdr.writeUInt16LE(20, 4);
  centralHdr.writeUInt16LE(20, 6);
  centralHdr.writeUInt16LE(8, 10);
  centralHdr.writeUInt32LE(deflated.length, 20);
  centralHdr.writeUInt32LE(rawContent.length, 24);
  centralHdr.writeUInt16LE(nameBuf.length, 28);
  centralHdr.writeUInt32LE(0, 42);
  nameBuf.copy(centralHdr, 46);

  const cdOffset = localHdr.length + deflated.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralHdr.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);

  const deflatedZip = new Uint8Array(Buffer.concat([localHdr, deflated, centralHdr, eocd]));
  const unpackedDeflate = await extractFilesFromZipArchive(deflatedZip);
  assert.equal(new TextDecoder().decode(unpackedDeflate['compressed.json']), '{"hello":"compressed"}');
});

test('resolveLessonTitleBox lowers default title Y and supports custom titleLayout + hitTest', () => {
  const project: LessonProject = {
    id: 'p1',
    title: 'Sound More Natural with Phrasal Verbs',
    subtitle: '',
    theme: 'pastel-sunrise',
    compositionId: 'cartoon-host',
    aspectRatio: '9:16',
    duration: 20,
    fps: 30,
    cues: [],
    elements: [],
  };

  const default916 = resolveLessonTitleBox(project, '9:16', 1);
  assert.ok(default916 && default916.y >= 110, `Expected lowered default 9:16 title Y >= 110, got ${default916?.y}`);

  const default169 = resolveLessonTitleBox({ ...project, aspectRatio: '16:9' }, '16:9', 1);
  assert.ok(default169 && default169.y >= 100, `Expected lowered default 16:9 title Y >= 100, got ${default169?.y}`);

  const customProj: LessonProject = {
    ...project,
    titleLayout: { x: 420, y: 210, scale: 1.15 },
  };
  const customBox = resolveLessonTitleBox(customProj, '9:16', 1);
  assert.ok(customBox);
  assert.equal(customBox!.x, 420);
  assert.equal(customBox!.y, 210);
  assert.equal(customBox!.scale, 1.15);

  const hit = hitTestCanvasOverlayZone(customProj, 420, 210, 1);
  assert.equal(hit, 'title');

  const hiddenProj: LessonProject = { ...project, titleLayout: { hidden: true } };
  assert.equal(resolveLessonTitleBox(hiddenProj, '9:16', 1), null);
});

test('detectActiveStageOverlaps detects collisions and reflowElementsAvoidingOverlap resolves them', () => {
  const elA: SceneElement = {
    id: 'card-1',
    type: 'sentence-card',
    label: 'Thẻ 1',
    startTime: 0,
    endTime: 10,
    enterAnimation: 'pop-up',
    exitAnimation: 'fade-out',
    layout: { x: 540, y: 400, width: 820, height: 180, scale: 1, zIndex: 10 },
    props: { kind: 'sentence-card', text: 'First card' },
  };
  const elB: SceneElement = {
    id: 'card-2',
    type: 'sentence-card',
    label: 'Thẻ 2',
    startTime: 0,
    endTime: 10,
    enterAnimation: 'pop-up',
    exitAnimation: 'fade-out',
    layout: { x: 540, y: 450, width: 820, height: 180, scale: 1, zIndex: 11 },
    props: { kind: 'sentence-card', text: 'Second card' },
  };

  const resolvedMap = new Map([
    ['card-1', { ...elA.layout }],
    ['card-2', { ...elB.layout }],
  ]);

  const warnings = detectActiveStageOverlaps([elA, elB], resolvedMap, 2);
  assert.ok(warnings.length >= 1, 'Expected overlap warning between card-1 and card-2');

  const reflowed = reflowElementsAvoidingOverlap([elA, elB], 'card-1', resolvedMap);
  const newA = reflowed.get('card-1')!;
  const newB = reflowed.get('card-2')!;
  assert.equal(newA.y, 400); // pinned
  assert.ok(newB.y > elB.layout.y, `Expected card-2 to move down (was ${elB.layout.y}, now ${newB.y})`);
  const afterWarnings = detectActiveStageOverlaps(
    [
      { ...elA, layout: newA },
      { ...elB, layout: newB },
    ],
    reflowed,
    2,
  );
  assert.equal(afterWarnings.length, 0, 'Expected zero overlap warnings after reflow');
});

test('computeSpeechLipSyncState eliminates whole-body squash/stretch and hopping across moods', () => {
  const cues: TranscriptCue[] = [
    { id: 'c1', start: 0, end: 4, text: 'Let us practice phrasal verbs naturally!', words: [] },
  ];
  const moods = ['happy', 'excited', 'curious', 'worried', 'proud', 'surprised', 'cool'] as const;
  for (const mood of moods) {
    for (let t = 0; t <= 3.5; t += 0.35) {
      const state = computeSpeechLipSyncState(cues, t, {
        explicitMood: mood,
        customSpec: { bounceIntensity: 2, bodySquashStretch: 1 },
      });
      assert.equal(state.bodySquashX, 1, `Expected bodySquashX === 1 for ${mood}`);
      assert.equal(state.bodySquashY, 1, `Expected bodySquashY === 1 for ${mood}`);
      assert.equal(state.jumpOffsetY, 0, `Expected jumpOffsetY === 0 for ${mood}`);
    }
  }
});

test('30-minute capacity, pedagogical depth, adapt-text mode, and multi-tab batch prompt generation', () => {
  assert.equal(recommendCreatorItemCount(30, false), 60);
  assert.equal(recommendTranslationItemCount(30, 3, 2), 60);

  const creatorPrompt = buildAiCreatorWebAiPrompt({
    topicHint: 'Sound More Natural with These 8 Phrasal Verbs',
    learningLanguage: 'en',
    level: 'B1',
    durationMinutes: 30,
    itemCount: 40,
    targetLang: 'vi',
  });
  assert.match(creatorPrompt, /40 core teaching items/i);
  assert.match(creatorPrompt, /WHY.*native speakers|Don't say X/i);

  const trPrompt = buildTranslationChallengePrompt({
    topicHint: 'Office small talk',
    learningLanguage: 'en',
    level: 'B2',
    durationMinutes: 25,
    itemCount: 45,
    targetLang: 'vi',
  });
  assert.match(trPrompt, /45 challenge sentences/i);

  const readLen = computeReadingTargetLength('en', 30);
  assert.equal(readLen.count, 3750);
  const adaptedPrompt = buildReadingWebAiPrompt({
    mode: 'adapt-text',
    learningLanguage: 'en',
    level: 'A2',
    durationMinutes: 10,
    sourceText: 'Quantum entanglement happens when pairs of particles interact in correlated ways.',
  });
  assert.match(adaptedPrompt, /BIÊN TẬP LẠI THEO ĐỘ KHÓ "A2"/);
  assert.match(adaptedPrompt, /Quantum entanglement/);

  assert.equal(buildBatchPromptZipName('studio'), 'Prompts_Tab_1_Studio.zip');
  assert.equal(buildBatchPromptZipName('creator'), 'Prompts_Tab_2_AI_Creator.zip');
  assert.equal(buildBatchPromptZipName('translation'), 'Prompts_Tab_3_Phan_Xa_Dich.zip');
  assert.equal(buildBatchPromptZipName('reading'), 'Prompts_Tab_4_Doc_Theo_Chu.zip');
  assert.equal(getBatchPromptSubfolder('creator'), 'Prompts/Tab-2-AI-Creator');

  const fixedBatch = generateBatchPromptsForTopics({
    subTab: 'studio',
    topics: [],
    promptCount: 4,
    learningLanguage: 'en',
    level: 'B1',
    durationMode: 'fixed',
    durationMinutes: 5,
    targetLang: 'vi',
  });
  assert.equal(fixedBatch.length, 4);
  for (const item of fixedBatch) {
    assert.equal(item.durationMinutes, 5);
    assert.match(item.promptText, /5 phút/);
    assert.match(item.promptText, /STORYBOARD SCHEMA v1\.9/);
  }

  const randomBatch = generateBatchPromptsForTopics({
    subTab: 'creator',
    topics: ['Morning Habits', 'Ordering Coffee'],
    promptCount: 5,
    learningLanguage: 'ja',
    level: 'N3',
    durationMode: 'random',
    minDurationMinutes: 3,
    maxDurationMinutes: 15,
    rng: () => 0.5,
  });
  assert.equal(randomBatch.length, 5);
  assert.equal(randomBatch[0].durationMinutes, 9);
  assert.ok(randomBatch.every((p) => p.durationMinutes >= 3 && p.durationMinutes <= 15));
});

test('default 16:9 Reels cartoon-host has zero active overlaps and reflow clears karaoke collisions', () => {
  const built = buildReelCardsRuleBased(
    'Hotel Check-in & Polite Requests. Could we have a quiet room? Direct commands sound blunt.',
    { mode: 'vocab', targetLang: 'Tiếng Việt' },
  );
  const proj = reelCardsToLessonProject(built.cards, {
    title: built.title,
    aspectRatio: '16:9',
    compositionId: 'cartoon-host',
    subtitleConfig: { position: 'bottom', size: 'md', boxStyle: 'card' },
  });
  const map = resolveElementLayoutForAspect(
    proj.elements,
    0.5,
    '16:9',
    proj.subtitleConfig,
    'cartoon-host',
  );
  const tb = resolveLessonTitleBox(proj, '16:9', 0.5);
  const initialOverlaps = detectActiveStageOverlaps(
    proj.elements,
    map,
    0.5,
    tb ? { x: tb.x, y: tb.y, width: tb.width, height: tb.height } : null,
  );
  assert.equal(initialOverlaps.length, 0, `Expected 0 default overlaps on 16:9, got: ${JSON.stringify(initialOverlaps)}`);

  // Simulate user enlarging/lowering @Gimmys so it overlaps the bottom karaoke-card
  const host = proj.elements.find((e) => e.id.includes('cartoon-host'))!;
  const collidedMap = new Map(map);
  collidedMap.set(host.id, {
    ...(map.get(host.id) || host.layout),
    y: 620,
    scale: 0.93,
    manualPosition: true,
  });
  const beforeReflow = detectActiveStageOverlaps(proj.elements, collidedMap, 0.5);
  assert.ok(beforeReflow.some((w) => w.firstId === host.id && w.secondId.includes('karaoke')));

  const fixedMap = reflowElementsAvoidingOverlap(proj.elements, host.id, collidedMap, {
    stageWidth: 1920,
    stageHeight: 1080,
  });
  const afterReflow = detectActiveStageOverlaps(proj.elements, fixedMap, 0.5);
  assert.equal(afterReflow.length, 0, `Expected karaoke overlap to clear after reflow, got: ${JSON.stringify(afterReflow)}`);
});

test('bilingual prompts enforce native-only intro/outro, learning-language embedded terms, and anti-1-word/single-letter rules', () => {
  // 1. buildEnglishReelsWebAiPrompt in bilingual mode vs monolingual mode
  const reelsBilingual = buildEnglishReelsWebAiPrompt({
    sourceText: 'Could we have a quiet room? Please tell me when we arrive.',
    mode: 'vocab',
    targetLang: 'Tiếng Việt',
    learningLanguage: 'en',
  });
  assert.match(reelsBilingual, /"ttsText": ""/);
  assert.match(reelsBilingual, /CHẾ ĐỘ SONG NGỮ CHỈ ĐỌC NGÔN NGỮ GỐC/i);
  assert.match(reelsBilingual, /viết trực tiếp bằng.*learningLang/i);
  assert.match(reelsBilingual, /HẠN CHẾ TỐI ĐA chuỗi ngôn ngữ gốc chỉ có 1 từ/i);

  const reelsMonolingual = buildEnglishReelsWebAiPrompt({
    sourceText: 'Could we have a quiet room? Please tell me when we arrive.',
    mode: 'vocab',
    targetLang: 'learning',
    learningLanguage: 'en',
  });
  assert.doesNotMatch(reelsMonolingual, /intro\/outro CHỈ CẦN NGÔN NGỮ GỐC/i);

  // 2. buildAiCreatorWebAiPrompt in bilingual mode (even with splitAudioByRole: false)
  const creatorBilingual = buildAiCreatorWebAiPrompt({
    topicHint: 'Giao tiếp khách sạn',
    learningLanguage: 'ja',
    level: 'N4',
    durationMinutes: 5,
    targetLang: 'Tiếng Việt',
    splitAudioByRole: false,
  });
  assert.match(creatorBilingual, /"speech": ""/);
  assert.match(creatorBilingual, /NATURAL LEARNING LANGUAGE FOR TARGET TERMS, TOPIC & GRAMMAR/);
  assert.match(creatorBilingual, /MINIMIZE 1-WORD NATIVE STRINGS & BAN SINGLE-LETTER SYMBOLS IN TTS/);

  // 3. buildTranslationChallengePrompt in bilingual mode
  const trPrompt = buildTranslationChallengePrompt({
    topicHint: 'Đặt món tại nhà hàng',
    learningLanguage: 'zh',
    level: 'HSK2',
    durationMinutes: 5,
    targetLang: 'vi',
  });
  assert.match(trPrompt, /"speech": ""/);
  assert.match(trPrompt, /CHẾ ĐỘ NGÔN NGỮ GỐC/);
  assert.match(trPrompt, /HẠN CHẾ TỐI ĐA CHUỖI NGÔN NGỮ GỐC CHỈ 1 TỪ/);

  // 4. generateBatchPromptsForTopics studio tab in bilingual mode
  const studioBatch = generateBatchPromptsForTopics({
    subTab: 'studio',
    topics: ['Giao tiếp quán cà phê'],
    promptCount: 1,
    learningLanguage: 'ko',
    level: 'TOPIK1',
    durationMode: 'fixed',
    durationMinutes: 4,
    targetLang: 'vi',
  });
  assert.match(studioBatch[0].promptText, /Phần mở đầu \(Intro\) và kết thúc \(Outro\).*ngôn ngữ gốc/);
  assert.match(studioBatch[0].promptText, /từ vựng mục tiêu, từ khóa chủ đề và cấu trúc ngữ pháp/);
  assert.match(studioBatch[0].promptText, /Hạn chế tối đa chuỗi vi chỉ có 1 từ & cấm ký tự đơn lẻ/);

  // 5. parseEnglishReelsAiJson preserves empty ttsText on bilingual intro/outro with explanationSpeech
  const parsed = parseEnglishReelsAiJson(
    JSON.stringify({
      title: 'Hotel Check-in',
      mode: 'vocab',
      cards: [
        {
          type: 'intro',
          title: 'Hotel Check-in',
          ttsText: '',
          explanationSpeech: 'Hôm nay chúng ta học chủ đề Hotel Check-in cùng mẫu câu Could we have để nói lịch sự hơn nhé.',
          translation: 'Học giao tiếp khách sạn lịch sự.',
        },
        {
          type: 'vocab',
          title: 'Could we have...',
          ttsText: 'Could we have a quiet room?',
          explanationSpeech: 'Khi nhờ nhân viên, bạn dùng cấu trúc Could we have thay vì mệnh lệnh trực tiếp nhé.',
          translation: 'Chúng tôi có thể xin một phòng yên tĩnh được không?',
        },
        {
          type: 'outro',
          title: 'Tổng kết',
          ttsText: '',
          explanationSpeech: 'Hãy lưu lại mẫu Could we have để luyện tập hằng ngày nhé.',
          translation: 'Lưu mẫu câu để ôn tập hằng ngày.',
        },
      ],
    }),
    { targetLang: 'Tiếng Việt' },
  );
  assert.ok(parsed);
  const introCard = parsed.cards[0];
  const outroCard = parsed.cards[2];
  assert.ok(introCard && outroCard);
  assert.equal(introCard.ttsText, '');
  assert.ok((introCard.durationSec ?? 0) > 1.5, 'Expected intro duration estimated from explanationSpeech');
  assert.equal(outroCard.ttsText, '');
  assert.ok((outroCard.durationSec ?? 0) > 1.5, 'Expected outro duration estimated from explanationSpeech');

  // 6. splitMixedLanguageTtsSpans splits embedded learning words/topics/grammar inside native intro/outro speech
  const enSpans = splitMixedLanguageTtsSpans(
    'Hôm nay chúng ta học chủ đề Hotel Check-in với mẫu câu Could we have nhé.',
    {
      primaryLang: 'vi',
      secondaryLang: 'en',
      primaryVoice: 'vi-VN-HoaiMyNeural',
      secondaryVoice: 'en-US-JennyNeural',
      autoSplit: true,
    },
  );
  assert.ok(enSpans.some((s) => s.lang === 'vi'));
  assert.ok(enSpans.some((s) => s.lang === 'en' && /Could we have/i.test(s.text)));

  const jaSpans = splitMixedLanguageTtsSpans(
    'Hôm nay mình học mẫu ngữ pháp お願いします rất hay dùng khi gọi món.',
    {
      primaryLang: 'vi',
      secondaryLang: 'ja',
      primaryVoice: 'vi-VN-HoaiMyNeural',
      secondaryVoice: 'ja-JP-NanamiNeural',
      autoSplit: true,
    },
  );
  assert.ok(jaSpans.some((s) => s.lang === 'vi'));
  assert.ok(jaSpans.some((s) => s.lang === 'ja' && s.text.includes('お願いします')));

  const zhSpans = splitMixedLanguageTtsSpans(
    'Trong chủ đề 点菜, bạn nhớ câu 不好意思 để mở lời lịch sự nhé.',
    {
      primaryLang: 'vi',
      secondaryLang: 'zh',
      primaryVoice: 'vi-VN-HoaiMyNeural',
      secondaryVoice: 'zh-CN-XiaoxiaoNeural',
      autoSplit: true,
    },
  );
  assert.ok(zhSpans.some((s) => s.lang === 'vi'));
  assert.ok(zhSpans.some((s) => s.lang === 'zh' && s.text.includes('不好意思')));

  const koSpans = splitMixedLanguageTtsSpans(
    'Hôm nay mình luyện cụm 잠시만요 và cấu trúc 주세요 khi giao tiếp nhé.',
    {
      primaryLang: 'vi',
      secondaryLang: 'ko',
      primaryVoice: 'vi-VN-HoaiMyNeural',
      secondaryVoice: 'ko-KR-SunHiNeural',
      autoSplit: true,
    },
  );
  assert.ok(koSpans.some((s) => s.lang === 'vi'));
  assert.ok(koSpans.some((s) => s.lang === 'ko' && s.text.includes('잠시만요')));
});

test('leveled | topic filename puts catchy title first and target-language audience level after with Windows-safe mapping', () => {
  // formatAudienceLevelLabel matches the target learning language across all 6 languages
  assert.equal(formatAudienceLevelLabel('A1', 'en'), 'For Beginners (ENGLISH A1)');
  assert.equal(formatAudienceLevelLabel('B1', 'en'), 'For Intermediate Learners (ENGLISH B1)');
  assert.equal(formatAudienceLevelLabel('A2', 'es'), 'Para nivel básico (ESPAÑOL A2)');
  assert.equal(formatAudienceLevelLabel('A2', 'fr'), 'Pour niveau élémentaire (FRANÇAIS A2)');
  assert.equal(formatAudienceLevelLabel('N4', 'ja'), '初中級者向け (日本語 N4)');
  assert.equal(formatAudienceLevelLabel('HSK 2', 'zh'), '适合初级学习者 (中文 HSK 2)');
  assert.equal(formatAudienceLevelLabel('TOPIK 3', 'ko'), '중급 학습자용 (한국어 TOPIK 3)');
  // Auto-infers script-based languages even when learningLanguage is omitted
  assert.equal(formatAudienceLevelLabel('N4'), '初中級者向け (日本語 N4)');
  assert.equal(formatAudienceLevelLabel('HSK 2'), '适合初级学习者 (中文 HSK 2)');
  assert.equal(formatAudienceLevelLabel('TOPIK 3'), '중급 학습자용 (한국어 TOPIK 3)');

  // cleanOutputTitleStem preserves Japanese '？', ellipsis '…', Spanish accents, and single normalized pipe separator
  assert.equal(
    cleanOutputTitleStem('Todo empezó con un pequeño favor… y terminó en un reencuentro inesperado  |  Para nivel básico (ESPAÑOL A2)_720p.mp4'),
    'Todo empezó con un pequeño favor… y terminó en un reencuentro inesperado | Para nivel básico (ESPAÑOL A2)',
  );

  // buildLeveledOutputStem keeps long Spanish cliffhanger hook uncut and appends Spanish audience level
  assert.equal(
    buildLeveledOutputStem({
      title: 'Todo empezó con un pequeño favor… y terminó en un reencuentro inesperado',
      level: 'A2',
      learningLanguage: 'es',
      fallback: 'Reading Along',
    }),
    'Todo empezó con un pequeño favor… y terminó en un reencuentro inesperado | Para nivel básico (ESPAÑOL A2)',
  );

  // Strips mismatched Vietnamese audience tail and replaces with target learning language label
  assert.equal(
    buildLeveledOutputStem({
      title: 'La bicicleta roja que esperaba a Mateo | Cho người cơ bản (A2)',
      level: 'A2',
      learningLanguage: 'es',
      fallback: 'Reading Along',
    }),
    'La bicicleta roja que esperaba a Mateo | Para nivel básico (ESPAÑOL A2)',
  );

  assert.equal(
    buildLeveledOutputStem({
      title: 'B1 | Hotel Check-in Requests',
      level: 'B1',
      learningLanguage: 'en',
      fallback: 'English Reels',
    }),
    'Hotel Check-in Requests | For Intermediate Learners (ENGLISH B1)',
  );
  assert.equal(
    buildLeveledOutputStem({
      title: 'その誘い方、英語で自然に言える？',
      level: 'B1',
      learningLanguage: 'en',
      fallback: 'English Reels',
    }),
    'その誘い方、英語で自然に言える？ | For Intermediate Learners (ENGLISH B1)',
  );
  assert.equal(
    buildLeveledOutputStem({
      title: 'Why 5 AM Changes Everything!',
      level: 'N3',
      topic: 'JLPT N3 · DAILY HABITS',
      learningLanguage: 'ja',
      fallback: 'Reading Along',
    }),
    'Why 5 AM Changes Everything! | 中級者向け (日本語 N3)',
  );
  assert.equal(
    buildLeveledOutputStem({
      title: 'Todo empezó con un pequeño favor… y terminó en un reencuentro inesperado | Para viajeros curiosos (A2)',
      level: 'A2',
      learningLanguage: 'es',
      fallback: 'English Reels',
    }),
    'Todo empezó con un pequeño favor… y terminó en un reencuentro inesperado | Para viajeros curiosos (A2)',
  );
  assert.equal(
    buildLeveledOutputStem({
      prefix: '01',
      level: 'B1',
      topic: 'Ordering Coffee',
      learningLanguage: 'en',
      fallback: 'Prompt',
    }),
    '01 | Ordering Coffee | For Intermediate Learners (ENGLISH B1)',
  );

  // Windows disk/browser filename mapping prevents NTFS EINVAL on ASCII '|'
  assert.equal(
    toPlatformSafeDiskFileName('Todo empezó con un pequeño favor… y terminó en un reencuentro inesperado | Para nivel básico (ESPAÑOL A2).mp4', true),
    'Todo empezó con un pequeño favor… y terminó en un reencuentro inesperado ｜ Para nivel básico (ESPAÑOL A2).mp4',
  );
  assert.equal(
    toPlatformSafeDiskFileName('Todo empezó con un pequeño favor… y terminó en un reencuentro inesperado | Para nivel básico (ESPAÑOL A2).mp4', false),
    'Todo empezó con un pequeño favor… y terminó en un reencuentro inesperado | Para nivel básico (ESPAÑOL A2).mp4',
  );

  // Batch prompt filenames include index | topic | target-language audience level
  const batchPromptsEn = generateBatchPromptsForTopics({
    subTab: 'creator',
    topics: ['Ordering Coffee'],
    promptCount: 1,
    learningLanguage: 'en',
    level: 'B1',
    durationMode: 'fixed',
    durationMinutes: 3,
  });
  assert.equal(
    batchPromptsEn[0]?.fileName,
    '01 | Ordering Coffee | For Intermediate Learners (ENGLISH B1).prompt.txt',
  );

  const batchPromptsEs = generateBatchPromptsForTopics({
    subTab: 'reading',
    topics: ['Un reencuentro inesperado'],
    promptCount: 1,
    learningLanguage: 'es',
    level: 'A2',
    durationMode: 'fixed',
    durationMinutes: 3,
  });
  assert.equal(
    batchPromptsEs[0]?.fileName,
    '01 | Un reencuentro inesperado | Para nivel básico (ESPAÑOL A2).prompt.txt',
  );

  // Prompt builders and JSON parser support root level & matching-language audience label + anti-flat-title guidance
  const parsedWithLevel = parseEnglishReelsAiJson(
    JSON.stringify({
      title: 'Todo empezó con un pequeño favor… y terminó en un reencuentro inesperado | Para nivel básico (ESPAÑOL A2)',
      level: 'A2',
      mode: 'vocab',
      cards: [{ type: 'vocab', title: '¿Me haces un favor?', ttsText: 'Todo empezó con un pequeño favor.' }],
    }),
    { targetLang: 'Tiếng Việt' },
  );
  assert.ok(parsedWithLevel);
  assert.equal(parsedWithLevel.level, 'A2');

  const reelsPrompt = buildEnglishReelsWebAiPrompt({
    sourceText: 'Pedir un favor en español de forma natural.',
    mode: 'vocab',
    targetLang: 'Tiếng Việt',
    learningLanguage: 'es',
  });
  assert.match(reelsPrompt, /TÊN HOOK CUỐN HÚT TRƯỚC \| LEVEL DÀNH CHO AI BẰNG ĐÚNG NGÔN NGỮ HỌC SAU/);
  assert.match(reelsPrompt, /PHẦN LEVEL SAU DẤU `\|` BẮT BUỘC TRÙNG VỚI NGÔN NGỮ HỌC/);
  assert.match(reelsPrompt, /Todo empezó con un pequeño favor/);

  const creatorPrompt = buildAiCreatorWebAiPrompt({
    topicHint: 'Un favor inesperado',
    learningLanguage: 'es',
    level: 'A2',
    durationMinutes: 3,
    targetLang: 'Tiếng Việt',
  });
  assert.match(creatorPrompt, /\| Para nivel básico \(ESPAÑOL A2\)/);
  assert.match(creatorPrompt, /Todo empezó con un pequeño favor/);

  const translationPrompt = buildTranslationChallengePrompt({
    topicHint: 'Nhờ giúp đỡ bằng tiếng Tây Ban Nha',
    learningLanguage: 'es',
    level: 'A2',
    durationMinutes: 3,
    targetLang: 'Tiếng Việt',
  });
  assert.match(translationPrompt, /\| Para nivel básico \(ESPAÑOL A2\)/);
  assert.match(translationPrompt, /Todo empezó con un pequeño favor/);

  const readingPromptEs = buildReadingWebAiPrompt({
    mode: 'topic',
    topic: 'Un reencuentro inesperado',
    learningLanguage: 'es',
    level: 'A2',
    durationMinutes: 2,
  });
  assert.match(readingPromptEs, /Para nivel básico \(ESPAÑOL A2\)/);
  assert.match(readingPromptEs, /Todo empezó con un pequeño favor… y terminó en un reencuentro inesperado/);
  assert.match(readingPromptEs, /KHÔNG ĐẶT TÊN TRUYỆN PHẲNG/);
});

test('expanded A-N creator formats and level-calibrated Kanji-only Hiragana / no-full-sentence reading rules across prompts', () => {
  const formatIds = CREATOR_FORMAT_OPTIONS.map((o) => o.id);
  for (const requiredId of [
    'shadowing_solo',
    'shadowing_dialogue',
    'podcast_solo',
    'podcast_duo',
    'trending_social',
    'workplace_tech',
    'news_storytelling',
  ] as const) {
    assert.ok(formatIds.includes(requiredId), `Missing CREATOR_FORMAT_OPTIONS id: ${requiredId}`);
  }

  const parsedPodcastDuo = parseEnglishReelsAiJson(
    JSON.stringify({
      title: 'なぜ会議でみんな黙る？ | 中級者向け (日本語 N3)',
      level: 'N3',
      mode: 'podcast_duo',
      cards: [
        {
          type: 'vocab',
          title: '雰囲気を読む',
          content: '会議の雰囲気を読んで発言する。',
          phonetic: '',
          vocabNotes: '雰囲気（ふんいき）: bầu không khí — dùng để chỉ không khí chung; chú ý dễ đọc nhầm chữ 雰.',
          grammarNote: '〜て発言する: nhìn nhận tình huống rồi mới phát biểu.',
          ttsText: '会議の雰囲気を読んで発言する。',
        },
      ],
    }),
    { targetLang: 'Tiếng Việt' },
  );
  assert.ok(parsedPodcastDuo);
  assert.equal(parsedPodcastDuo.mode, 'vocab');
  assert.equal(parsedPodcastDuo.creatorSubMode, 'podcast_duo');
  assert.equal(parsedPodcastDuo.cards[0]?.phonetic, undefined);
  assert.match(parsedPodcastDuo.cards[0]?.vocabNotes || '', /雰囲気（ふんいき）/);

  const reelsPromptJa = buildEnglishReelsWebAiPrompt({
    sourceText: '会議の雰囲気を読んで発言する。',
    mode: 'vocab',
    learningLanguage: 'ja',
    targetLang: 'Tiếng Việt',
  });
  assert.match(reelsPromptJa, /CẤM VIẾT CÁCH ĐỌC CẢ CÂU/);
  assert.match(reelsPromptJa, /Hiragana của riêng từ Kanji khó đó/i);

  const creatorPromptPodcast = buildAiCreatorWebAiPrompt({
    topicHint: 'Podcast hai người bàn về AI tại công sở Nhật',
    formatPreference: 'podcast_duo',
    learningLanguage: 'ja',
    level: 'N3',
    durationMinutes: 3,
    targetLang: 'Tiếng Việt',
  });
  assert.match(creatorPromptPodcast, /K\. Podcast 2 người/);
  assert.match(creatorPromptPodcast, /Tuyệt đối KHÔNG viết lại cả câu bằng Hiragana/);
  assert.match(creatorPromptPodcast, /Hiragana của riêng từ Kanji khó đó/i);

  const translationPromptJa = buildTranslationChallengePrompt({
    topicHint: 'Đi ăn quán',
    learningLanguage: 'ja',
    level: 'N4',
    durationMinutes: 2,
    targetLang: 'Tiếng Việt',
  });
  assert.match(translationPromptJa, /KHÔNG viết Hiragana cho cả câu/);
  assert.match(translationPromptJa, /giải thích, cách dùng và chú ý/);

  const readingPromptJa = buildReadingWebAiPrompt({
    mode: 'topic',
    topic: '朝の習慣',
    learningLanguage: 'ja',
    level: 'N4',
    durationMinutes: 2,
  });
  assert.match(readingPromptJa, /TUYỆT ĐỐI KHÔNG viết lại cả câu bằng Hiragana/);
  assert.match(readingPromptJa, /studyNotes/);
  assert.match(readingPromptJa, /Hiragana của CHÍNH TỪ KANJI ĐÓ/);

  const scenePromptJa = buildSceneGenerationPrompt(
    [
      {
        id: 'cue_1',
        start: 0,
        end: 3.5,
        text: '会議の雰囲気を読んで発言する。',
        words: [],
      },
    ],
    {
      learningLanguage: 'ja',
      level: 'N3',
    },
  );
  assert.match(scenePromptJa, /CẤM TẠO CÁCH ĐỌC CẢ CÂU/);
  assert.match(scenePromptJa, /Hiragana của CHÍNH TỪ KANJI ĐÓ/);
});

test('strict A-F vs G-N prompt separation, mandatory end-of-lesson summary, and 2-3 speaker TTS/visuals', () => {
  // 1. Creator prompts strictly separate A-F vocab teaching from G-N dialogue/podcast/workplace scripts
  const vocabCreatorPrompt = buildAiCreatorWebAiPrompt({
    topicHint: 'Từ vựng công sở',
    formatPreference: 'vocab',
    learningLanguage: 'en',
    level: 'B1',
    durationMinutes: 2,
    targetLang: 'Tiếng Việt',
  });
  const vocabSection6 = vocabCreatorPrompt.split('## 6. STRICT JSON OUTPUT FORMAT')[1] || '';
  assert.match(vocabSection6, /"type": "vocab"/);
  assert.doesNotMatch(vocabSection6, /"type": "dialogue"/);

  const shadowingDialoguePrompt = buildAiCreatorWebAiPrompt({
    topicHint: 'Shadowing họp dự án AI',
    formatPreference: 'shadowing_dialogue',
    learningLanguage: 'ja',
    level: 'N3',
    durationMinutes: 3,
    targetLang: 'Tiếng Việt',
  });
  assert.match(shadowingDialoguePrompt, /"type": "dialogue"/);
  assert.match(shadowingDialoguePrompt, /"speaker":/);
  assert.match(shadowingDialoguePrompt, /"speakerGender":/);
  assert.match(shadowingDialoguePrompt, /TỔNG KẾT BÀI HỌC/);
  assert.doesNotMatch(shadowingDialoguePrompt, /"word": "break down"/);

  const workplacePrompt = buildAiCreatorWebAiPrompt({
    topicHint: 'Ứng xử khi sếp yêu cầu dùng AI trong công việc',
    formatPreference: 'workplace_tech',
    learningLanguage: 'en',
    level: 'B2',
    durationMinutes: 3,
    targetLang: 'Tiếng Việt',
  });
  assert.match(workplacePrompt, /SITUATIONAL KNOWLEDGE STRICT RULE.*Công sở.*AI\/Tech/i);
  assert.match(workplacePrompt, /tình huống thực tế cụ thể/i);
  assert.match(workplacePrompt, /TỔNG KẾT BÀI HỌC/);

  // Reading and Reels prompts require end-of-lesson summary of what was learned
  const readingSummaryPrompt = buildReadingWebAiPrompt({
    mode: 'topic',
    topic: 'AI at Work',
    learningLanguage: 'en',
    level: 'B1',
    durationMinutes: 2,
  });
  assert.match(readingSummaryPrompt, /"lessonSummary"/);
  assert.match(readingSummaryPrompt, /keyTakeaways/);

  const reelsSummaryPrompt = buildEnglishReelsWebAiPrompt({
    sourceText: 'A short dialogue about using AI tools safely at work.',
    mode: 'reading',
    learningLanguage: 'en',
    targetLang: 'Tiếng Việt',
  });
  assert.match(reelsSummaryPrompt, /tổng kết.*đã học được những gì/i);

  // 2. Parse multi-speaker dialogue JSON (3 speakers: Yuki, Ken, Maya)
  const dialogueJson = JSON.stringify({
    title: '会議でAIをどう使う？ | 中級者向け (日本語 N3)',
    level: 'N3',
    mode: 'podcast_duo',
    cards: [
      {
        type: 'intro',
        badge: 'PODCAST · N3',
        title: 'Hội thoại AI tại công sở Nhật',
        content: 'Nghe & shadowing tình huống thảo luận dùng AI trong cuộc họp.',
        explanationSpeech: 'Hôm nay chúng ta nghe hội thoại công sở về cách dùng AI hợp lý trong cuộc họp.',
      },
      {
        type: 'dialogue',
        speaker: 'Yuki',
        speakerGender: 'female',
        speakerRole: 'PM',
        title: '会議の議事録、AIに任せてもいいですか？',
        content: '会議の議事録、AIに任せてもいいですか？',
        translation: 'Tôi giao biên bản cuộc họp cho AI làm có được không?',
        ttsText: '会議の議事録、AIに任せてもいいですか？',
        explanationSpeech: 'Yuki hỏi xem có thể nhờ AI ghi biên bản cuộc họp không.',
        vocabNotes: '議事録（ぎじろく）: biên bản cuộc họp — danh từ hành chính hay gặp.',
      },
      {
        type: 'dialogue',
        speaker: 'Ken',
        speakerGender: 'male',
        speakerRole: 'Tech Lead',
        title: '機密情報が入っていなければ大丈夫ですよ。',
        content: '機密情報が入っていなければ大丈夫ですよ。',
        translation: 'Miễn là không có thông tin mật thì ổn thôi.',
        ttsText: '機密情報が入っていなければ大丈夫ですよ。',
        explanationSpeech: 'Ken lưu ý nguyên tắc bảo mật trước khi đưa dữ liệu vào AI.',
      },
      {
        type: 'dialogue',
        speaker: 'Maya',
        speakerGender: 'female',
        speakerRole: 'QA',
        title: '最後に人間が内容を確認しましょう。',
        content: '最後に人間が内容を確認しましょう。',
        translation: 'Cuối cùng con người vẫn nên kiểm tra lại nội dung nhé.',
        ttsText: '最後に人間が内容を確認しましょう。',
        explanationSpeech: 'Maya nhắc bước kiểm chứng lại kết quả của AI.',
      },
      {
        type: 'outro',
        badge: 'TỔNG KẾT BÀI HỌC',
        title: 'Tổng kết: Dùng AI an toàn ở công sở',
        content: '1) Lọc thông tin mật; 2) Con người kiểm tra cuối; 3) Từ khóa: 議事録・機密情報.',
        explanationSpeech: 'Tổng kết hôm nay: không đưa thông tin mật vào AI và luôn kiểm tra lại biên bản.',
      },
    ],
  });

  const parsedDialogue = parseEnglishReelsAiJson(dialogueJson, { targetLang: 'Tiếng Việt' });
  assert.ok(parsedDialogue);
  assert.equal(parsedDialogue.cards.length, 5);
  assert.equal(parsedDialogue.cards[1]?.speaker, 'Yuki');
  assert.equal(parsedDialogue.cards[1]?.speakerGender, 'female');
  assert.equal(parsedDialogue.cards[1]?.speakerRole, 'PM');
  assert.equal(parsedDialogue.cards[2]?.speaker, 'Ken');
  assert.equal(parsedDialogue.cards[2]?.speakerGender, 'male');
  assert.equal(parsedDialogue.cards[3]?.speaker, 'Maya');

  // 3. Multi-speaker TTS voice assignment across 3 speakers in JA & EN
  const jaVoices = buildSpeakerVoiceMap(parsedDialogue.cards, {
    defaultVoice: 'ja-JP-NanamiNeural',
    defaultLang: 'ja-JP',
    provider: 'edge',
  });
  assert.equal(jaVoices.get(parsedDialogue.cards[1].id), 'ja-JP-NanamiNeural');
  assert.equal(jaVoices.get(parsedDialogue.cards[2].id), 'ja-JP-KeitaNeural');
  const mayaVoice = jaVoices.get(parsedDialogue.cards[3].id);
  assert.ok(mayaVoice && mayaVoice !== 'ja-JP-NanamiNeural' && mayaVoice !== 'ja-JP-KeitaNeural',
    `Expected 3rd distinct JA voice for Maya, got ${mayaVoice}`);

  // Batch TTS helper propagates distinct speaker voices into segments
  const batchTts = buildBatchTtsSegmentsForReelCards(parsedDialogue.cards, {
    learningLanguage: 'ja',
    enableDualTts: true,
  });
  const segYuki = batchTts.segments.find((s) => s.id === parsedDialogue.cards[1].id);
  const segKen = batchTts.segments.find((s) => s.id === parsedDialogue.cards[2].id);
  assert.equal(segYuki?.voice, 'ja-JP-NanamiNeural');
  assert.equal(segKen?.voice, 'ja-JP-KeitaNeural');

  // 4. Preview project uses color-coded speaker pills and dialogue/audio components
  const dialogueProject = reelCardsToLessonProject(parsedDialogue.cards, {
    title: parsedDialogue.title,
    compositionId: 'avatar-dialogue',
    targetLang: 'Tiếng Việt',
  });
  const pill1 = dialogueProject.elements.find((e) => e.id === 'reel-pill-1');
  const pill2 = dialogueProject.elements.find((e) => e.id === 'reel-pill-2');
  assert.equal(pill1?.props.kind, 'topic-pill');
  assert.match(String(pill1?.props.kind === 'topic-pill' ? pill1.props.text : ''), /🎙️ Yuki/);
  assert.match(String(pill2?.props.kind === 'topic-pill' ? pill2.props.text : ''), /🎙️ Ken/);
  assert.notEqual(
    pill1?.props.kind === 'topic-pill' ? pill1.props.bgColor : '',
    pill2?.props.kind === 'topic-pill' ? pill2.props.bgColor : '',
  );

  const prop1 = dialogueProject.elements.find((e) => e.id === 'reel-prop-1');
  assert.equal(prop1?.props.kind, 'illustration-prop');
  if (prop1?.props.kind === 'illustration-prop') {
    assert.ok(
      ['p168-story-dialogue', 'css-chat-thread', 'ear-listen', 'speech-bubble', 'avatar-speech'].includes(
        prop1.props.variant,
      ),
      `Expected dialogue/audio variant, got ${prop1.props.variant}`,
    );
  }
});

test('estimateMp4FileSize scales accurately across quality/resolution/duration presets', () => {
  const std1080 = estimateMp4FileSize(60, {
    aspectRatio: '9:16',
    resolution: '1080p',
    quality: 'standard',
    fps: 30,
  });
  const high1080 = estimateMp4FileSize(60, {
    aspectRatio: '9:16',
    resolution: '1080p',
    quality: 'high',
    fps: 30,
  });
  const ultra1080 = estimateMp4FileSize(60, {
    aspectRatio: '9:16',
    resolution: '1080p',
    quality: 'ultra',
    fps: 30,
  });
  const std540 = estimateMp4FileSize(60, {
    aspectRatio: '9:16',
    resolution: '540p',
    quality: 'standard',
    fps: 30,
  });

  assert.match(std1080.qualityDescription, /CRF 27/);
  assert.ok(std540.bytes < std1080.bytes, '540p should be lighter than 1080p');
  assert.ok(std1080.bytes < high1080.bytes, 'standard should be lighter than high');
  assert.ok(high1080.bytes < ultra1080.bytes, 'high should be lighter than ultra');
  assert.ok(std1080.minBytes > 0 && std1080.minBytes < std1080.bytes && std1080.maxBytes > std1080.bytes);
  assert.match(formatMegabytesLabel(std1080.bytes), /MB$/);

  const zeroDur = estimateMp4FileSize(0, {
    aspectRatio: '9:16',
    resolution: '1080p',
    quality: 'standard',
    fps: 30,
  });
  assert.equal(zeroDur.bytes, 0);
});

test('podcast-duo, dialogue-stage & full-study-cards layouts render cleanly without overlaps + strict 2-language prompts', () => {
  const compIds = LAYOUT_COMPOSITIONS.map((c) => c.id);
  for (const id of ['podcast-duo', 'dialogue-stage', 'full-study-cards'] as const) {
    assert.ok(compIds.includes(id), `Missing layout composition ${id}`);
  }

  const parsed = parseEnglishReelsAiJson(
    JSON.stringify({
      title: '会議でAIの記録を残す？ | 中級者向け (日本語 N3)',
      level: 'N3',
      mode: 'podcast_duo',
      cards: [
        {
          type: 'intro',
          badge: 'PODCAST · N3',
          title: 'Tranh luận dùng AI trong họp nhóm',
          content: 'Nghe hội thoại giữa hai kỹ sư Nhật về cách lưu dấu vết kiểm chứng AI.',
        },
        {
          type: 'dialogue',
          speaker: 'Yuki',
          speakerGender: 'female',
          speakerRole: 'PM',
          title: 'Trưởng nhóm đề xuất lưu lịch sử',
          content: '賛成です。加えて、入力した指示、参照資料、生成結果、修正履歴を保存します。',
          translation: 'Tôi đồng ý. Ngoài ra, chúng ta lưu cả câu lệnh, tài liệu tham chiếu và lịch sử chỉnh sửa.',
          vocabNotes: '修正履歴（しゅうせいりれき）: lịch sử chỉnh sửa — dùng khi cần kiểm tra ai sửa gì.',
          grammarNote: '〜ておけば: chuẩn bị sẵn từ trước để sau này có thể truy vết.',
          ttsText: '賛成です。加えて、入力した指示、参照資料、生成結果、修正履歴を保存します。',
        },
        {
          type: 'dialogue',
          speaker: 'Ken',
          speakerGender: 'male',
          speakerRole: 'Lead',
          title: 'Xác nhận quy trình kiểm tra',
          content: '根拠を後から追跡できれば、問題が起きても検証できますね。',
          translation: 'Nếu truy vết được căn cứ sau này thì khi gặp sự cố vẫn kiểm chứng được nhé.',
          ttsText: '根拠を後から追跡できれば、問題が起きても検証できますね。',
        },
        {
          type: 'outro',
          badge: 'TỔNG KẾT BÀI HỌC',
          title: 'Tổng kết: Kiểm chứng AI nơi công sở',
          content: 'Đã học: 修正履歴 (lịch sử sửa) và mẫu 〜ておけば (làm sẵn trước).',
        },
      ],
    }),
    { targetLang: 'Tiếng Việt' },
  );
  assert.ok(parsed);

  // podcast-duo builds podcast-studio scene with speaker roster & zero visual overlap
  const podcastProj = reelCardsToLessonProject(parsed.cards, {
    title: parsed.title,
    compositionId: 'podcast-duo',
    targetLang: 'Tiếng Việt',
  });
  const studioProp = podcastProj.elements.find(
    (e) => e.props.kind === 'illustration-prop' && e.props.variant === 'podcast-studio',
  );
  assert.ok(studioProp, 'Expected podcast-studio visual element in podcast-duo');
  if (studioProp?.props.kind === 'illustration-prop') {
    assert.ok((studioProp.props.data?.nodes?.length || 0) >= 2);
  }
  const activeMidPodcast = resolveElementLayoutForAspect(
    podcastProj.elements,
    podcastProj.cues[1] ? (podcastProj.cues[1].start + podcastProj.cues[1].end) / 2 : 3.5,
    '9:16',
    podcastProj.subtitleConfig,
    podcastProj.compositionId,
  );
  assert.equal(
    detectActiveStageOverlaps(
      podcastProj.elements,
      activeMidPodcast,
      podcastProj.cues[1] ? (podcastProj.cues[1].start + podcastProj.cues[1].end) / 2 : 3.5,
    ).length,
    0,
  );

  // full-study-cards builds multi-section sentence-cards preserving 100% vocab/grammar notes in 9:16 and 16:9
  for (const aspect of ['9:16', '16:9'] as const) {
    const studyProj = reelCardsToLessonProject(parsed.cards, {
      title: parsed.title,
      compositionId: 'full-study-cards',
      aspectRatio: aspect,
      targetLang: 'Tiếng Việt',
    });
    const fullCardEl = studyProj.elements.find(
      (e) => e.type === 'sentence-card' && e.props.kind === 'sentence-card' && (e.props.sections?.length || 0) >= 2,
    );
    assert.ok(fullCardEl, `Expected structured sections in full-study-cards (${aspect})`);
    if (fullCardEl?.props.kind === 'sentence-card') {
      const combined = fullCardEl.props.sections?.map((s) => s.text).join(' ') || '';
      assert.match(combined, /修正履歴（しゅうせいりれき）/);
      assert.match(combined, /〜ておけば/);
    }
    const midTime = studyProj.cues[1] ? (studyProj.cues[1].start + studyProj.cues[1].end) / 2 : 3.5;
    const resolvedStudy = resolveElementLayoutForAspect(
      studyProj.elements,
      midTime,
      aspect,
      studyProj.subtitleConfig,
      studyProj.compositionId,
    );
    assert.equal(detectActiveStageOverlaps(studyProj.elements, resolvedStudy, midTime).length, 0);
  }

  // Strict 2-language purity in Japanese + Vietnamese prompts
  const jaCreatorPrompt = buildAiCreatorWebAiPrompt({
    topicHint: 'Trình bày phương án kỹ thuật',
    formatPreference: 'workplace_tech',
    learningLanguage: 'ja',
    level: 'N3',
    durationMinutes: 3,
    targetLang: 'Tiếng Việt',
  });
  for (const leakedEn of [
    'Real Situation Episode',
    '2–3 Speakers Conversation',
    'Ready to Use',
    'Key Situational Insight',
    'Save & Practice Today',
  ]) {
    assert.ok(!jaCreatorPrompt.includes(leakedEn), `Creator JA+VI prompt leaked English "${leakedEn}"`);
  }

  const jaReelsPrompt = buildEnglishReelsWebAiPrompt({
    sourceText: '賛成です。修正履歴を保存しましょう。',
    mode: 'vocab',
    learningLanguage: 'ja',
    targetLang: 'Tiếng Việt',
  });
  for (const leakedEn of [
    'TODAY LESSON GOAL',
    'KEY VOCAB & GRAMMAR',
    'Key Takeaways',
    'Lesson Complete!',
  ]) {
    assert.ok(!jaReelsPrompt.includes(leakedEn), `Reels JA+VI prompt leaked English "${leakedEn}"`);
  }
});

test('strict 2-language purity across stage components, zero dialogue/study-card truncation, and responsive 4-aspect bounds', () => {
  const longJaLine1 =
    '賛成です。加えて、入力した指示、参照資料、生成結果、修正履歴を必ずチーム全体で共有フォルダに保存しましょう。';
  const longJaLine2 =
    '根拠を後から追跡できれば、顧客への説明や社内監査で問題が起きてもすぐ検証できますね。';
  const longVocab =
    '修正履歴（しゅうせいりれき）: lịch sử chỉnh sửa để kiểm chứng thay đổi; 共有フォルダ: thư mục dùng chung nội bộ.';
  const longGrammar =
    '〜ておけば: làm sẵn từ trước để sau này có thể đối chiếu và xử lý nhanh khi phát sinh sự cố.';

  const jaViParsed = parseEnglishReelsAiJson(
    JSON.stringify({
      title: '会議でAIの記録を残す？ | 中級者向け (日本語 N3)',
      level: 'N3',
      mode: 'podcast_duo',
      cards: [
        {
          type: 'intro',
          badge: 'PODCAST · N3',
          title: 'Tranh luận dùng AI trong họp nhóm',
          content: 'Nghe hội thoại giữa hai kỹ sư Nhật về cách lưu dấu vết kiểm chứng AI.',
        },
        {
          type: 'dialogue',
          speaker: 'Yuki',
          speakerGender: 'female',
          speakerRole: 'PM',
          title: '提案：履歴保存',
          content: longJaLine1,
          translation: 'Tôi đồng ý. Ngoài ra hãy lưu cả chỉ dẫn, tài liệu tham chiếu và lịch sử sửa vào thư mục chung.',
          vocabNotes: longVocab,
          grammarNote: longGrammar,
          explanation: 'Dùng trong cuộc họp dự án để thống nhất quy trình lưu trữ dấu vết AI minh bạch.',
          ttsText: longJaLine1,
        },
        {
          type: 'dialogue',
          speaker: 'Ken',
          speakerGender: 'male',
          speakerRole: 'Lead',
          title: '確認：後から追跡',
          content: longJaLine2,
          translation: 'Nếu truy vết được căn cứ sau này thì khi giải thích khách hàng hay kiểm toán đều xác minh ngay.',
          ttsText: longJaLine2,
        },
        {
          type: 'vocab',
          title: '❌ AIに全部任せる vs ✅ 根拠を残す',
          content: longJaLine1,
          translation: 'Đừng giao phó hoàn toàn; hãy giữ lại căn cứ kiểm chứng.',
          vocabNotes: longVocab,
          grammarNote: longGrammar,
          ttsText: longJaLine1,
        },
      ],
    }),
    { targetLang: 'Tiếng Việt' },
  );
  assert.ok(jaViParsed);

  // 1. Strict 2-language purity (JA + VI must contain ZERO leaked English labels like PODCAST STUDIO / AVOID / NATURAL / ON MIC / Host)
  for (const comp of ['full-study-cards', 'podcast-duo', 'dialogue-stage', 'spatial-contrast', 'dialogue-upgrade'] as const) {
    const proj = reelCardsToLessonProject(jaViParsed.cards, {
      title: jaViParsed.title,
      compositionId: comp,
      learningLanguage: 'ja',
      targetLang: 'Tiếng Việt',
    });
    const textDump = JSON.stringify(proj.elements);
    for (const leakedEn of ['PODCAST STUDIO', '● ON MIC', 'AVOID', 'NATURAL', 'Host A', 'Co-Host']) {
      assert.ok(
        !textDump.includes(leakedEn),
        `JA+VI project (${comp}) leaked English label "${leakedEn}"`,
      );
    }
  }

  // 2. JA + Japanese self-explanation (targetLang = 'learning') must contain ZERO leaked Vietnamese labels ('Từ vựng', 'Ngữ pháp', 'Giải thích', 'Chi tiết')
  const jaSelfStudy = reelCardsToLessonProject(jaViParsed.cards, {
    title: jaViParsed.title,
    compositionId: 'full-study-cards',
    learningLanguage: 'ja',
    targetLang: 'learning',
  });
  const selfDump = JSON.stringify(jaSelfStudy.elements);
  for (const leakedVi of ['Từ vựng', 'Ngữ pháp', 'Giải thích', 'Chi tiết', 'NÊN TRÁNH', 'TỰ NHIÊN']) {
    assert.ok(
      !selfDump.includes(leakedVi),
      `JA-only project leaked Vietnamese label "${leakedVi}"`,
    );
  }
  assert.match(selfDump, /語彙|文法|解説/);

  // 3. Zero mid-sentence ellipsis truncation in dialogue-stage (css-chat-thread) and full-study-cards
  const dialogueProj = reelCardsToLessonProject(jaViParsed.cards, {
    title: jaViParsed.title,
    compositionId: 'dialogue-stage',
    learningLanguage: 'ja',
    targetLang: 'Tiếng Việt',
  });
  const threadProps = dialogueProj.elements
    .map((e) => e.props)
    .filter((p) => p.kind === 'illustration-prop' && p.variant === 'css-chat-thread');
  assert.ok(threadProps.length > 0, 'Expected css-chat-thread prop in dialogue-stage');
  const threadJson = JSON.stringify(threadProps);
  assert.ok(threadJson.includes(longJaLine1), 'Expected full uncut line 1 in dialogue-stage');
  assert.ok(threadJson.includes(longJaLine2), 'Expected full uncut line 2 in dialogue-stage');

  // 4. Responsive full-study-cards across all 4 aspect ratios (9:16, 16:9, 1:1, 4:5) fits cleanly with zero overlaps
  for (const aspect of ['9:16', '16:9', '1:1', '4:5'] as const) {
    const studyProj = reelCardsToLessonProject(jaViParsed.cards, {
      title: jaViParsed.title,
      compositionId: 'full-study-cards',
      aspectRatio: aspect,
      learningLanguage: 'ja',
      targetLang: 'Tiếng Việt',
    });
    const fullCardEl = studyProj.elements.find(
      (e) => e.type === 'sentence-card' && e.props.kind === 'sentence-card' && (e.props.sections?.length || 0) >= 3,
    );
    assert.ok(fullCardEl, `Expected >=3 study sections on full-study-cards (${aspect})`);
    if (fullCardEl?.props.kind === 'sentence-card') {
      const joined = fullCardEl.props.sections?.map((s) => `${s.label}: ${s.text}`).join('\n') || '';
      assert.ok(joined.includes(longVocab), `Expected full vocab note in ${aspect}`);
      assert.ok(joined.includes(longGrammar), `Expected full grammar note in ${aspect}`);
    }
    const midTime = studyProj.cues[1] ? (studyProj.cues[1].start + studyProj.cues[1].end) / 2 : 3.5;
    const resolved = resolveElementLayoutForAspect(
      studyProj.elements,
      midTime,
      aspect,
      studyProj.subtitleConfig,
      studyProj.compositionId,
    );
    assert.equal(
      detectActiveStageOverlaps(studyProj.elements, resolved, midTime).length,
      0,
      `Expected 0 stage overlaps on full-study-cards (${aspect})`,
    );
  }
});

test('starter lessons and outro bento/composition cards stay pure in target language when targetLang=learning', () => {
  for (const lang of ['ja', 'zh', 'ko', 'fr', 'es'] as const) {
    const starter = buildStarterLessonForLanguage(lang, 'learning');
    const starterDump = JSON.stringify({ title: starter.title, cards: starter.cards });
    for (const leakedViOrEn of [
      'Hoàn thành bài học',
      'Luyện đọc to',
      'Từ vựng',
      'Ngữ pháp',
      'Tiếng Việt',
      'Thử ngay',
      'exciting / prize',
      'be going to + V',
      'Quiz Ready',
      'PODCAST STUDIO',
      'KEY TAKEAWAY',
    ]) {
      assert.ok(
        !starterDump.includes(leakedViOrEn),
        `Starter (${lang} self-mode) leaked "${leakedViOrEn}"`,
      );
    }

    for (const comp of ['full-study-cards', 'podcast-duo', 'flow-steps', 'dialogue-upgrade'] as const) {
      const proj = reelCardsToLessonProject(starter.cards, {
        title: starter.title,
        compositionId: comp,
        learningLanguage: lang,
        targetLang: 'learning',
      });
      const projDump = JSON.stringify(proj.elements);
      for (const leaked of [
        'Hoàn thành bài học',
        'exciting / prize',
        'be going to + V',
        'Quiz Ready',
        'Smart Upgrade',
        'Key Point',
        'Natural Use',
        'PODCAST STUDIO',
        '● ON MIC',
        'Từ vựng',
        'Ngữ pháp',
      ]) {
        assert.ok(
          !projDump.includes(leaked),
          `Starter project (${lang}, comp=${comp}, targetLang=learning) leaked "${leaked}"`,
        );
      }
    }
  }
});








