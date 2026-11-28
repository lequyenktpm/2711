import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEnglishReelsWebAiPrompt,
  buildReelCardsRuleBased,
  DEFAULT_DIALOGUE_TTS_RATE,
  DEFAULT_STANDARD_TTS_RATE,
  detectReelMode,
  estimateCardSpeechDuration,
  getDefaultTtsRateForFormat,
  getQuizCardSpeechParts,
  reelCardsToLessonProject,
  type ReelCard,
} from '../englishReelsEngine';
import {
  getEffectiveIntroSeconds,
  resolveElementLayoutForAspect,
  resolveLessonTitleBox,
} from '../canvasRenderer';
import { detectActiveStageOverlaps } from '../layoutSolver';
import { choreographFromTranscript } from '../autoChoreographer';
import { recomposeProjectWithStyle } from '../illustrationLayouts';
import { scenePlanToProject } from '../scenePlanAdapter';
import { PRESET_JP_EN_POLITE, PRESET_WATER_POLITE, SAMPLE_JP_EN_SCENE_JSON, SAMPLE_WORDS_JSON } from '../demoPresets';
import { splitMixedLanguageTtsSpans } from '../bilingualTtsHelper';
import type { SceneElement, TranscriptCue } from '../types';

function createDialogueSampleCards(): ReelCard[] {
  return [
    {
      id: 'c-intro',
      type: 'intro',
      badge: 'INTRO',
      speaker: 'Narrator',
      title: 'Today at the Coffee Shop',
      content: 'Hôm nay chúng ta nghe hội thoại gọi đồ uống tự nhiên.',
      translation: 'Giới thiệu tình huống gọi đồ tại quán cà phê.',
      ttsText: 'Welcome! Today we listen to a quick coffee shop conversation.',
      learningLang: 'en',
      durationSec: 3.5,
    },
    {
      id: 'c-turn-1',
      type: 'vocab',
      badge: 'TURN 1',
      speaker: 'Maya',
      speakerRole: 'Customer',
      title: 'Ordering politely',
      content: 'Could I have an iced latte with oat milk, please?',
      translation: 'Cho tôi một ly latte đá với sữa yến mạch được không?',
      ttsText: 'Could I have an iced latte with oat milk, please?',
      learningLang: 'en',
      durationSec: 4.0,
    },
    {
      id: 'c-turn-2',
      type: 'vocab',
      badge: 'TURN 2',
      speaker: 'Liam',
      speakerRole: 'Barista',
      title: 'Confirming size',
      content: 'Sure! Would you like a medium or a large today?',
      translation: 'Chắc chắn rồi! Hôm nay bạn dùng cỡ vừa hay lớn?',
      ttsText: 'Sure! Would you like a medium or a large today?',
      learningLang: 'en',
      durationSec: 4.0,
    },
    {
      id: 'c-outro',
      type: 'outro',
      badge: 'SUMMARY',
      speaker: 'Narrator',
      title: 'Tóm tắt hội thoại',
      content: 'Dùng "Could I have..." để gọi món thật lịch sự và tự nhiên.',
      translation: 'Nhớ mẫu câu gọi món lịch sự vừa học nhé!',
      ttsText: 'Great job! Remember Could I have for polite ordering.',
      learningLang: 'en',
      durationSec: 3.5,
    },
  ];
}

function assertContiguousZeroFlicker(elements: SceneElement[], prefix: string, contextLabel: string): void {
  const matched = elements
    .filter((el) => el.id.startsWith(prefix))
    .sort((a, b) => a.startTime - b.startTime);
  assert.ok(matched.length >= 2, `${contextLabel}: expected >= 2 elements matching "${prefix}"`);
  for (let i = 0; i < matched.length - 1; i++) {
    const curr = matched[i];
    const next = matched[i + 1];
    const gap = Math.abs(next.startTime - curr.endTime);
    if (gap <= 0.12) {
      assert.equal(
        curr.exitAnimation,
        'none',
        `${contextLabel}: ${curr.id} touches ${next.id} (gap=${gap.toFixed(3)}) so exitAnimation must be 'none'`,
      );
      assert.equal(
        next.enterAnimation,
        'none',
        `${contextLabel}: ${next.id} touches ${curr.id} (gap=${gap.toFixed(3)}) so enterAnimation must be 'none'`,
      );
    }
  }
}

test('dialogue mode isolates Narrator intro/outro from speaker cast in standard & @Gimmys modes', () => {
  const dialogueCards = createDialogueSampleCards();

  // 1. Standard dialogue-stage: Intro & Outro show ONLY Narrator ('avatar-speech', no cast nodes), turns show speaker cast
  const standardProj = reelCardsToLessonProject(dialogueCards, {
    title: 'Coffee Shop Ordering',
    compositionId: 'dialogue-stage',
    learningLanguage: 'en',
    targetLang: 'Tiếng Việt',
  });

  const introProp = standardProj.elements.find((el) => el.id === 'reel-prop-0');
  const turn1Prop = standardProj.elements.find((el) => el.id === 'reel-prop-1');
  const turn2Prop = standardProj.elements.find((el) => el.id === 'reel-prop-2');
  const outroProp = standardProj.elements.find((el) => el.id === 'reel-prop-3');

  assert.equal(introProp?.props.kind, 'illustration-prop');
  if (introProp?.props.kind === 'illustration-prop') {
    assert.equal(introProp.props.variant, 'avatar-speech');
    assert.equal(introProp.props.data?.nodes, undefined);
    assert.match(String(introProp.props.data?.reactionText || ''), /Narrator|Người dẫn/i);
  }

  assert.equal(turn1Prop?.props.kind, 'illustration-prop');
  if (turn1Prop?.props.kind === 'illustration-prop') {
    assert.notEqual(turn1Prop.props.variant, 'avatar-speech');
    const serialized = JSON.stringify(turn1Prop.props.data);
    assert.match(serialized, /Maya/);
    assert.match(serialized, /Liam/);
  }
  assert.ok(turn2Prop, 'Expected second conversation turn prop');

  assert.equal(outroProp?.props.kind, 'illustration-prop');
  if (outroProp?.props.kind === 'illustration-prop') {
    assert.equal(outroProp.props.variant, 'avatar-speech');
    assert.equal(outroProp.props.data?.nodes, undefined);
  }

  // Verify Narrator prop ends cleanly before speaker 1 enters & speaker 2 exits cleanly before Narrator outro
  assert.ok(introProp && turn1Prop && turn2Prop && outroProp);
  assert.ok(Math.abs(introProp.endTime - turn1Prop.startTime) <= 0.002);
  assert.ok(Math.abs(turn2Prop.endTime - outroProp.startTime) <= 0.002);

  // 2. @Gimmys cartoon-host dialogue: Gimmy appears ONLY at Intro & Outro and vanishes during conversation turns
  const gimmyProj = reelCardsToLessonProject(dialogueCards, {
    title: 'Coffee Shop with Gimmy',
    compositionId: 'cartoon-host',
    learningLanguage: 'en',
    targetLang: 'Tiếng Việt',
  });

  const gimmyIntro = gimmyProj.elements.find((el) => el.id === 'reel-cartoon-host-intro');
  const gimmyOutro = gimmyProj.elements.find((el) => el.id === 'reel-cartoon-host-outro');
  const gimmyFullSpan = gimmyProj.elements.find((el) => el.id === 'reel-cartoon-host-main');
  assert.ok(gimmyIntro, 'Expected @Gimmys intro host element');
  assert.ok(gimmyOutro, 'Expected @Gimmys outro host element');
  assert.equal(gimmyFullSpan, undefined, 'Dialogue must NOT span @Gimmys across speaker turns');

  const midSpeakerTime = 5.5; // inside turn 1 (3.5 .. 7.5)
  const activeHostsAtSpeakerTurn = gimmyProj.elements.filter(
    (el) =>
      el.props.kind === 'illustration-prop' &&
      el.props.variant === 'cartoon-host' &&
      midSpeakerTime >= el.startTime &&
      midSpeakerTime < el.endTime,
  );
  assert.equal(activeHostsAtSpeakerTurn.length, 0, '@Gimmys must disappear during conversation turns');

  const activeSpeakerProp = gimmyProj.elements.find((el) => el.id === 'reel-prop-1');
  assert.ok(activeSpeakerProp, 'Conversation turns should render speaker cast illustration in Gimmy dialogue');

  // Verify canvasRenderer slice-aware Gimmy check: mid-dialogue speaker card uses normal card layout (not pushed up for absent Gimmy)
  const layoutDuringIntro = resolveElementLayoutForAspect(
    gimmyProj.elements,
    1.5,
    '9:16',
    gimmyProj.subtitleConfig,
    'cartoon-host',
  );
  const layoutDuringTurn1 = resolveElementLayoutForAspect(
    gimmyProj.elements,
    midSpeakerTime,
    '9:16',
    gimmyProj.subtitleConfig,
    'cartoon-host',
  );
  assert.ok(gimmyIntro && midSpeakerTime >= gimmyIntro.endTime, 'Mid-speaker timestamp must be past @Gimmys intro window');
  const introCardLayout = layoutDuringIntro.get('reel-card-0');
  const turn1CardLayout = layoutDuringTurn1.get('reel-card-1');
  assert.ok(introCardLayout && turn1CardLayout);
  assert.ok(
    turn1CardLayout.y > introCardLayout.y + 150,
    `Middle speaker card y (${turn1CardLayout.y}) should stay below speaker illustration rather than reserving space for absent @Gimmys (${introCardLayout.y})`,
  );

  // Also verify 16:9 widescreen speaker turn with @Gimmys hidden produces ZERO overlap with resolvedTitleBox
  const gimmy169 = reelCardsToLessonProject(dialogueCards, {
    title: 'Ordering Coffee | English A2',
    compositionId: 'cartoon-host',
    aspectRatio: '16:9',
    learningLanguage: 'en',
    targetLang: 'Tiếng Việt',
  });
  const videoTime169 = getEffectiveIntroSeconds(gimmy169) + midSpeakerTime;
  const lessonTime169 = Math.max(0, videoTime169 - getEffectiveIntroSeconds(gimmy169));
  const titleBox169 = resolveLessonTitleBox(gimmy169, '16:9', videoTime169);
  const resolved169 = resolveElementLayoutForAspect(
    gimmy169.elements,
    lessonTime169,
    '16:9',
    gimmy169.subtitleConfig,
    gimmy169.compositionId,
    titleBox169
      ? { x: titleBox169.x, y: titleBox169.y, width: titleBox169.width, height: titleBox169.height }
      : null,
  );
  const overlaps169 = detectActiveStageOverlaps(
    gimmy169.elements,
    resolved169,
    lessonTime169,
    titleBox169
      ? { x: titleBox169.x, y: titleBox169.y, width: titleBox169.width, height: titleBox169.height }
      : null,
  );
  assert.equal(
    overlaps169.length,
    0,
    `Expected zero stage overlaps in 16:9 cartoon-host speaker turn, got: ${JSON.stringify(overlaps169)}`,
  );
});

test('zero-flicker contiguous transitions across Reels, AutoChoreographer, IllustrationLayouts, ScenePlan & Presets', () => {
  // 1. Reels project (multi-card reading + quiz)
  const sample = buildReelCardsRuleBased(
    'Part 1: Reading\nGood coffee takes patience and care. Baristas check water temperature carefully.\n\nQ1. Why do baristas check temperature?\nA) Better flavor\nB) Faster Wi-Fi\nC) Loud music\nD) Cheaper cups',
    { mode: 'auto', targetLang: 'Tiếng Việt', learningLanguage: 'en' },
  );
  const reelsProj = reelCardsToLessonProject(sample.cards, {
    title: sample.title,
    compositionId: 'story-scenes',
    targetLang: 'Tiếng Việt',
    learningLanguage: 'en',
  });
  assertContiguousZeroFlicker(reelsProj.elements, 'reel-karaoke-', 'englishReelsEngine');
  assertContiguousZeroFlicker(reelsProj.elements, 'reel-stage-', 'englishReelsEngine');

  // 2. AutoChoreographer
  const cues: TranscriptCue[] = [
    {
      id: 'c1',
      start: 0,
      end: 3,
      text: 'Do not say give me water.',
      words: [
        { word: 'Do', start: 0, end: 0.5 },
        { word: 'not', start: 0.5, end: 1.0 },
        { word: 'say', start: 1.0, end: 1.5 },
        { word: 'give', start: 1.5, end: 2.0 },
        { word: 'me', start: 2.0, end: 2.5 },
        { word: 'water.', start: 2.5, end: 3.0 },
      ],
    },
    {
      id: 'c2',
      start: 3,
      end: 6,
      text: 'Instead say could I have some water please?',
      words: [
        { word: 'Instead', start: 3, end: 3.5 },
        { word: 'say', start: 3.5, end: 4.0 },
        { word: 'could', start: 4.0, end: 4.5 },
        { word: 'I', start: 4.5, end: 5.0 },
        { word: 'have', start: 5.0, end: 5.5 },
        { word: 'water?', start: 5.5, end: 6.0 },
      ],
    },
  ];
  const autoProj = choreographFromTranscript(cues, { title: 'Polite Requests' });
  assertContiguousZeroFlicker(autoProj.elements, 'auto-karaoke-', 'autoChoreographer');
  assertContiguousZeroFlicker(autoProj.elements, 'auto-card-', 'autoChoreographer');

  // 3. RecomposeProjectWithStyle
  const recomposed = recomposeProjectWithStyle(autoProj, 'flow-steps');
  const recomposedKaraokes = recomposed.elements
    .filter((el) => el.type === 'karaoke-card')
    .sort((a, b) => a.startTime - b.startTime);
  assert.ok(recomposedKaraokes.length >= 2);
  for (let i = 0; i < recomposedKaraokes.length - 1; i++) {
    if (Math.abs(recomposedKaraokes[i + 1].startTime - recomposedKaraokes[i].endTime) <= 0.12) {
      assert.equal(recomposedKaraokes[i].exitAnimation, 'none');
      assert.equal(recomposedKaraokes[i + 1].enterAnimation, 'none');
    }
  }

  // 4. ScenePlanToProject + Demo Presets
  const sceneWords =
    PRESET_JP_EN_POLITE.cues.length > 0
      ? PRESET_JP_EN_POLITE.cues.flatMap((c) => c.words)
      : SAMPLE_WORDS_JSON.words;
  const sceneProj = scenePlanToProject(sceneWords, SAMPLE_JP_EN_SCENE_JSON);
  const sceneKaraokes = sceneProj.elements
    .filter((el) => el.type === 'karaoke-card')
    .sort((a, b) => a.startTime - b.startTime);
  assert.ok(sceneKaraokes.length >= 2);
  for (let i = 0; i < sceneKaraokes.length - 1; i++) {
    if (Math.abs(sceneKaraokes[i + 1].startTime - sceneKaraokes[i].endTime) <= 0.12) {
      assert.equal(sceneKaraokes[i].exitAnimation, 'none');
      assert.equal(sceneKaraokes[i + 1].enterAnimation, 'none');
    }
  }

  const presetCards = PRESET_WATER_POLITE.elements
    .filter((el) => el.type === 'sentence-card')
    .sort((a, b) => a.startTime - b.startTime);
  for (let i = 0; i < presetCards.length - 1; i++) {
    if (Math.abs(presetCards[i + 1].startTime - presetCards[i].endTime) <= 0.12) {
      assert.equal(presetCards[i].exitAnimation, 'none');
      assert.equal(presetCards[i + 1].enterAnimation, 'none');
    }
  }
});

test('dialogue format defaults to 0.85x reading speed and ttsRate scales card durations cleanly with synced karaoke cues', () => {
  assert.equal(DEFAULT_STANDARD_TTS_RATE, 1.0);
  assert.equal(DEFAULT_DIALOGUE_TTS_RATE, 0.85);

  assert.equal(getDefaultTtsRateForFormat('podcast_duo'), 0.85);
  assert.equal(getDefaultTtsRateForFormat('shadowing_dialogue'), 0.85);
  assert.equal(getDefaultTtsRateForFormat('real_life'), 0.85);
  assert.equal(getDefaultTtsRateForFormat('vocab'), 1.0);

  const dialogueCards = createDialogueSampleCards();
  assert.equal(getDefaultTtsRateForFormat(undefined, dialogueCards), 0.85);

  const sampleText = 'Could you please confirm when the package will arrive tomorrow morning?';
  const durSlow = estimateCardSpeechDuration(sampleText, 0.85);
  const durNorm = estimateCardSpeechDuration(sampleText, 1.0);
  const durFast = estimateCardSpeechDuration(sampleText, 1.25);
  assert.ok(durSlow > durNorm, `Expected 0.85x duration (${durSlow}) > 1.0x (${durNorm})`);
  assert.ok(durNorm > durFast, `Expected 1.0x duration (${durNorm}) > 1.25x (${durFast})`);

  // Remove explicit durationSec so reelCardsToLessonProject scales preview durations by ttsRate
  const unfixedDialogueCards = dialogueCards.map(({ durationSec: _drop, ...rest }) => rest);
  const projSlow = reelCardsToLessonProject(unfixedDialogueCards, { ttsRate: 0.85 });
  const projNorm = reelCardsToLessonProject(unfixedDialogueCards, { ttsRate: 1.0 });
  assert.ok(projSlow.duration > projNorm.duration, 'Expected slower ttsRate (0.85) to produce longer preview duration');

  for (const cue of projSlow.cues) {
    assert.ok(cue.words.length > 0, `Cue ${cue.id} must have karaoke word timings`);
    assert.ok(cue.words[0].start >= cue.start - 0.002);
    assert.ok(cue.words[cue.words.length - 1].end <= cue.end + 0.01);
  }
});

test('Từ Bài / Link supports multilingual learning languages, word-ordering/MCQ quizzes with 5s pause, non-strict pasted prompt, and dual-TTS spans', () => {
  // 1. Multilingual Quiz localization across all 6 languages
  const langs = ['en', 'ja', 'zh', 'ko', 'fr', 'es'] as const;
  for (const lang of langs) {
    const sampleQuestion: ReelCard = {
      id: `q-${lang}`,
      type: 'quiz',
      badge: 'QUIZ',
      title: 'Check',
      content: lang === 'ja' ? '「お元気ですか」の意味は？' : 'Sample question',
      ttsText: lang === 'ja' ? '「お元気ですか」の意味は？' : 'Sample question',
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      answerIndex: 1,
      learningLang: lang,
    };
    const parts = getQuizCardSpeechParts(sampleQuestion, 1);
    assert.equal(parts.thinkSec, 5);
    assert.ok(parts.questionSpeech.length > 10);
    assert.ok(parts.answerSpeech.length > 10);
  }

  // 2. Multilingual rule builder + Word Ordering detection + 5s countdown
  const wordOrderInput = [
    '# Bài tập sắp xếp từ & trắc nghiệm',
    '',
    'Q1. Arrange the words to make a polite request: coffee / like / would / a / I / cup / of',
    'A) I would like a cup of coffee.',
    'B) Coffee I like a would cup of.',
    'C) Like coffee a cup I would of.',
    'D) Would I like coffee of a cup.',
  ].join('\n');

  const parsedOrder = buildReelCardsRuleBased(wordOrderInput, {
    mode: 'auto',
    targetLang: 'Tiếng Việt',
    learningLanguage: 'en',
  });
  const quizCard = parsedOrder.cards.find((c) => c.type === 'quiz');
  assert.ok(quizCard, 'Expected rule-based builder to detect quiz card');
  assert.equal(quizCard.thinkSec, 5, 'Quiz card must default to 5s thinking pause');
  assert.equal(quizCard.learningLang, 'en');

  // Even when learning audio is OFF & only explanation audio is ON, Quiz keeps 5s thinking pause + question/answer speech slots
  const explOnlyQuizProj = reelCardsToLessonProject([quizCard], {
    targetLang: 'Tiếng Việt',
    learningLanguage: 'en',
    enableLearningAudio: false,
    enableExplanationAudio: true,
    ttsRate: 0.9,
  });
  assert.ok(explOnlyQuizProj.duration >= 6.5, `Expected quiz Q + 5s pause + A >= 6.5s, got ${explOnlyQuizProj.duration}`);
  const countdownPills = explOnlyQuizProj.elements.filter((el) => el.id.startsWith('reel-q-countdown-pill-'));
  assert.equal(countdownPills.length, 5, 'Expected 5-second countdown slices on quiz card');

  // 3. Japanese & Korean learningLanguage + Japanese word-ordering quiz auto-detection preserved in rule builder
  const jaCards = buildReelCardsRuleBased('毎朝コーヒーを飲みます。仕事の前に少し休みます。', {
    mode: 'vocab',
    targetLang: 'Tiếng Việt',
    learningLanguage: 'ja',
  });
  assert.equal(jaCards.cards[0].learningLang, 'ja');

  const jaOrderInput = [
    'Q1. 次の言葉を並べ替えて正しい文を作りなさい: コーヒー / 飲みます / 毎朝 / を',
    'A) 毎朝コーヒーを飲みます。',
    'B) コーヒー毎朝を飲みます。',
    'C) 飲みます毎朝コーヒーを。',
    'D) をコーヒー毎朝飲みます。',
    'Answer: A',
  ].join('\n');
  assert.equal(detectReelMode(jaOrderInput), 'quiz');
  const jaOrderBuilt = buildReelCardsRuleBased(jaOrderInput, {
    mode: 'auto',
    targetLang: 'Tiếng Việt',
    learningLanguage: 'ja',
  });
  assert.equal(jaOrderBuilt.mode, 'quiz');
  assert.equal(jaOrderBuilt.cards.find((c) => c.type === 'quiz')?.thinkSec, 5);

  // 4. Web AI prompt for "Từ Bài / Link" with pasted text mentions non-strict duration, deep explanations, MCQ/ordering/comprehension & 5s pause
  const pastedPrompt = buildEnglishReelsWebAiPrompt({
    sourceText: wordOrderInput,
    mode: 'auto',
    targetLang: 'Tiếng Việt',
    learningLanguage: 'ja',
    durationMinutes: 5,
  });
  assert.match(pastedPrompt, /KHÔNG STRICT|KHÔNG ÉP CỨNG/i);
  assert.match(pastedPrompt, /Trắc nghiệm 4 đáp án/i);
  assert.match(pastedPrompt, /Sắp xếp từ/i);
  assert.match(pastedPrompt, /Đọc nội dung chọn đáp án/i);
  assert.match(pastedPrompt, /5 GIÂY|"thinkSec": 5/i);
  assert.match(pastedPrompt, /Ngôn ngữ giải thích/i);

  // 5. Dual-TTS mixed-language splitting inside explanation speech keeps target-language words in learning voice
  const viEnSpans = splitMixedLanguageTtsSpans(
    'Trong câu này, cụm iced oat latte nghĩa là cà phê sữa yến mạch đá.',
    {
      primaryLang: 'vi',
      secondaryLang: 'en',
      primaryVoice: 'vi-VN-HoaiMyNeural',
      secondaryVoice: 'en-US-JennyNeural',
      autoSplit: true,
    },
  );
  assert.ok(viEnSpans.some((s) => s.lang === 'vi'));
  assert.ok(viEnSpans.some((s) => s.lang === 'en' && /iced oat latte/i.test(s.text)));

  const viJaSpans = splitMixedLanguageTtsSpans(
    'Ở đây, từ 雰囲気 và mẫu 〜ておけば giúp câu tự nhiên hơn.',
    {
      primaryLang: 'vi',
      secondaryLang: 'ja',
      primaryVoice: 'vi-VN-HoaiMyNeural',
      secondaryVoice: 'ja-JP-NanamiNeural',
      autoSplit: true,
    },
  );
  assert.ok(viJaSpans.some((s) => s.lang === 'vi'));
  assert.ok(viJaSpans.some((s) => s.lang === 'ja'));
});
