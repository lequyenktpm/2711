import assert from 'node:assert/strict';
import test from 'node:test';

import { computeElementFrameState } from '../animationMath';
import { buildSceneGenerationPrompt } from '../aiPromptBuilder';
import { resolveElementLayoutForAspect } from '../canvasRenderer';
import {
  BUILTIN_CARTOON_ANIMATIONS,
  buildCartoonActionWebAiPrompt,
  deleteCartoonAnimation,
  getAllCartoonAnimations,
  getCartoonAnimationById,
  getCartoonAnimationsPromptBlock,
  getEffectiveCartoonAnimationCatalog,
  parseCartoonAnimationAiJson,
  resolveCartoonAnimationForSignal,
  restoreBuiltInCartoonAnimation,
  upsertCartoonAnimation,
} from '../cartoonAnimationDb';
import {
  computeCartoonHostContextFromElements,
  computeSpeechLipSyncState,
} from '../cartoonHostAnimator';
import { hitTestReadingAlongZone } from '../eduStudioEffects';
import {
  buildAiCreatorWebAiPrompt,
  buildEnglishReelsWebAiPrompt,
  buildStarterLessonForLanguage,
  buildTranslationChallengePrompt,
  parseEnglishReelsAiJson,
  reelCardsToLessonProject,
} from '../englishReelsEngine';
import { estimateElementHalfExtents } from '../layoutSolver';
import { validateStoryboardDocument } from '../storyboardValidator';
import type { SceneElement, TranscriptCue } from '../types';

test('cartoonAnimationDb: catalog includes built-ins, CRUD works, and Web AI prompt/JSON round-trips', () => {
  assert.ok(
    BUILTIN_CARTOON_ANIMATIONS.length >= 16,
    `Expected at least 16 built-ins, got ${BUILTIN_CARTOON_ANIMATIONS.length}`,
  );
  const initialCount = getAllCartoonAnimations().length;
  assert.ok(initialCount >= 16);

  // Parse Web AI JSON wrapped in markdown fences and save custom animation
  const rawAiJson = [
    'Here is your custom action:',
    '```json',
    '{',
    '  "cartoonAnimations": [',
    '    {',
    '      "id": "unit-test-highfive",',
    '      "name": "Đập tay ăn mừng",',
    '      "description": "Nhảy lên đập tay vui vẻ",',
    '      "mood": "celebrate",',
    '      "gesture": "celebrate",',
    '      "eyeStyle": "star",',
    '      "mouthStyle": "big-grin",',
    '      "fxOverlay": "confetti",',
    '      "accessory": "party-hat",',
    '      "speed": 1.4,',
    '      "bounceAmp": 1.6,',
    '      "headTiltDeg": 12,',
    '      "blushIntensity": 0.7,',
    '      "badgeEmoji": "🙌",',
    '      "keywords": ["high five", "bravo"]',
    '    }',
    '  ]',
    '}',
    '```',
  ].join('\n');

  const parsed = parseCartoonAnimationAiJson(rawAiJson);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, 'unit-test-highfive');
  assert.equal(parsed[0].params.mood, 'excited');
  assert.equal(parsed[0].params.gestureMode, 'cheer');
  assert.equal(parsed[0].params.fxOverlay, 'sparkles');
  assert.equal(parsed[0].params.accessory, 'none');

  upsertCartoonAnimation(parsed[0]);
  const stored = getCartoonAnimationById('unit-test-highfive');
  assert.ok(stored, 'Custom animation should exist in catalog after upsert');
  assert.equal(stored?.label, 'Đập tay ăn mừng');

  const promptBlock = getCartoonAnimationsPromptBlock();
  assert.match(promptBlock, /unit-test-highfive/);

  const conceptPrompt = buildCartoonActionWebAiPrompt('Vỗ tay chúc mừng học viên');
  assert.match(conceptPrompt, /cartoonAnimations/);
  assert.match(conceptPrompt, /gestureMode/);

  // Hide and restore built-in action
  deleteCartoonAnimation('wave-hello');
  assert.equal(
    getEffectiveCartoonAnimationCatalog().some((a) => a.id === 'wave-hello'),
    false,
  );
  restoreBuiltInCartoonAnimation('wave-hello');
  assert.equal(
    getEffectiveCartoonAnimationCatalog().some((a) => a.id === 'wave-hello'),
    true,
  );

  // Clean up test entry
  deleteCartoonAnimation('unit-test-highfive');
  assert.equal(getCartoonAnimationById('unit-test-highfive'), undefined);
});

test('cartoonHostAnimator: resolves cartoonActionSegments, inline cartoonAnimationSpec, and lip-sync frames', () => {
  const cues: TranscriptCue[] = [
    { id: 'c1', start: 0, end: 2.5, text: 'Hello everyone! Welcome back!', words: [] },
    { id: 'c2', start: 2.5, end: 5, text: 'Watch out for this common mistake!', words: [] },
  ];

  const hostEl: SceneElement = {
    id: 'host-1',
    type: 'illustration-prop',
    label: '@Gimmys',
    startTime: 0,
    endTime: 6,
    enterAnimation: 'fade-scale',
    exitAnimation: 'fade-out',
    layout: { x: 540, y: 1080, width: 820, scale: 0.92, zIndex: 12 },
    props: {
      kind: 'illustration-prop',
      variant: 'cartoon-host',
      data: {
        cartoonActionSegments: [
          { startTime: 0, endTime: 2.4, actionId: 'wave-hello', mood: 'excited' },
          { startTime: 2.4, endTime: 5.5, actionId: 'warn-shake', mood: 'worried' },
        ],
      },
    },
  };

  const ctxAt1s = computeCartoonHostContextFromElements([hostEl], 1.0, cues, '9:16');
  assert.equal(ctxAt1s.actionId, 'wave-hello');
  assert.equal(ctxAt1s.explicitMood, 'excited');

  const lipSyncAt1s = computeSpeechLipSyncState(cues, 1.0, ctxAt1s);
  assert.equal(lipSyncAt1s.isSpeaking, true);
  assert.equal(lipSyncAt1s.gestureMode, 'wave');
  assert.equal(lipSyncAt1s.mood, 'excited');
  assert.ok(lipSyncAt1s.mouthOpen >= 0 && lipSyncAt1s.mouthOpen <= 1);

  const ctxAt3s = computeCartoonHostContextFromElements([hostEl], 3.2, cues, '9:16');
  assert.equal(ctxAt3s.actionId, 'warn-shake');
  const lipSyncAt3s = computeSpeechLipSyncState(cues, 3.2, ctxAt3s);
  assert.equal(lipSyncAt3s.gestureMode, 'warn-avoid');
  assert.equal(lipSyncAt3s.mood, 'worried');
});

test('aiPromptBuilder: cartoon-host composition generates matching prompt schema and injects custom DB actions', () => {
  const cues: TranscriptCue[] = [
    { id: 'c1', start: 0, end: 3, text: 'Can I have some water, please?', words: [] },
    { id: 'c2', start: 3, end: 6, text: 'Could I have some water feels much more polite.', words: [] },
  ];

  const prompt = buildSceneGenerationPrompt(cues, {
    title: 'Can vs Could',
    style: 'tiktok-cards',
    compositionId: 'cartoon-host',
    theme: 'pastel-sunrise',
  });

  assert.match(prompt, /"compositionId": "cartoon-host"/);
  assert.match(prompt, /@Gimmys/);
  assert.match(prompt, /cartoonAction/);
  assert.match(prompt, /cartoonAnimations/);
});

test('englishReelsEngine: cartoon-host prompts, JSON parser, and reelCardsToLessonProject preserve @Gimmys', () => {
  const webAiPrompt = buildEnglishReelsWebAiPrompt({
    sourceText: 'Why say Could instead of Can?',
    mode: 'auto',
    targetLang: 'en',
    compositionId: 'cartoon-host',
  });
  assert.match(webAiPrompt, /"compositionId": "cartoon-host"/);
  assert.match(webAiPrompt, /cartoonAction/);

  const creatorPrompt = buildAiCreatorWebAiPrompt({
    targetLang: 'en',
    learningLanguage: 'en',
    level: 'B1',
    formatPreference: 'vocab',
    topicHint: 'Polite Requests',
    itemCount: 3,
    compositionId: 'cartoon-host',
  });
  assert.match(creatorPrompt, /"compositionId": "cartoon-host"/);

  const transPrompt = buildTranslationChallengePrompt({
    targetLang: 'en',
    learningLanguage: 'en',
    level: 'B1',
    topicHint: 'Travel',
    itemCount: 2,
    compositionId: 'cartoon-host',
  });
  assert.match(transPrompt, /"compositionId": "cartoon-host"/);

  const sampleJson = JSON.stringify({
    title: 'Polite English',
    subtitle: 'Can vs Could',
    targetLang: 'en',
    compositionId: 'cartoon-host',
    cartoonAnimations: [
      {
        id: 'polite-bow-test',
        name: 'Cúi chào lịch sự',
        mood: 'proud',
        gesture: 'present',
        eyeStyle: 'happy-arc',
        mouthStyle: 'smile',
      },
    ],
    cards: [
      {
        id: 'card-1',
        type: 'intro',
        badge: 'TIP',
        title: 'Polite Requests',
        content: 'Use Could I instead of Can I.',
        speechText: 'Use Could I instead of Can I.',
        cartoonAction: 'polite-bow-test',
        cartoonMood: 'proud',
      },
      {
        id: 'card-2',
        type: 'vocab',
        badge: 'COMPARE',
        title: 'Could I vs Can I',
        content: 'Could I have the menu, please?',
        speechText: 'Could I have the menu, please?',
        cartoonAction: 'approve-tip',
      },
    ],
  });

  const parsed = parseEnglishReelsAiJson(sampleJson);
  assert.ok(parsed, 'parseEnglishReelsAiJson should return parsed result');
  assert.equal(parsed.compositionId, 'cartoon-host');
  assert.equal(parsed.cartoonAnimations?.length, 1);
  assert.equal(parsed.cards[0].cartoonAction, 'polite-bow-test');

  const starter = buildStarterLessonForLanguage('en');
  const project = reelCardsToLessonProject(starter.cards, {
    title: 'Starter',
    compositionId: 'cartoon-host',
    aspectRatio: '9:16',
    theme: 'pastel-sunrise',
  });

  assert.equal(project.compositionId, 'cartoon-host');
  const cartoonEl = project.elements.find(
    (el) => el.props.kind === 'illustration-prop' && el.props.variant === 'cartoon-host',
  );
  assert.ok(cartoonEl, 'reelCardsToLessonProject must include visible cartoon-host element');
  assert.ok(
    cartoonEl &&
      cartoonEl.props.kind === 'illustration-prop' &&
      (cartoonEl.props.data?.cartoonActionSegments?.length ?? 0) >= 1,
    'cartoon-host element should include cartoonActionSegments timeline',
  );
});

test('eduStudioEffects: hitTestReadingAlongZone classifies watermark, outro, intro, badge, title, and body', () => {
  const baseOpts = {
    width: 540,
    height: 960,
    title: 'Why 5 AM Changes Everything',
    topicBadge: 'CEFR B1',
    text: 'Tom wakes up early every morning.',
    words: [
      { word: 'Tom', start: 3.5, end: 4.0 },
      { word: 'wakes', start: 4.0, end: 4.5 },
    ],
    currentTime: 4.1,
    totalDuration: 10,
    contentDuration: 7,
    introEnabled: true,
    introSeconds: 3,
    paletteId: 'Sunny Yellow' as const,
    illustrationStyle: '2.5D' as const,
    bookFrame: 'classic-page' as const,
    watermarkOutro: {
      watermarkEnabled: true,
      watermarkText: '@MyChannel',
      watermarkCorner: 'top-right' as const,
      watermarkOpacity: 0.75,
      outroLine1: 'Thanks for watching!',
      outroLine2: 'Subscribe!',
      outroSeconds: 3,
    },
  };

  assert.equal(hitTestReadingAlongZone(baseOpts, 490, 40), 'watermark');
  assert.equal(hitTestReadingAlongZone({ ...baseOpts, currentTime: 8.5 }, 270, 480), 'outro');
  assert.equal(hitTestReadingAlongZone({ ...baseOpts, currentTime: 1.0 }, 270, 480), 'intro');
  assert.equal(hitTestReadingAlongZone(baseOpts, 150, 130), 'badge');
  assert.equal(hitTestReadingAlongZone(baseOpts, 150, 175), 'title');
  assert.equal(hitTestReadingAlongZone(baseOpts, 250, 480), 'body');
});

test('cartoonHostAnimator: 5-frame clap-jump interpolates grounded knee-bend, center clap touch, cheering, and lip-sync without jumping or body squash', () => {
  const clapDef = getCartoonAnimationById('clap-jump');
  assert.ok(clapDef, 'Built-in clap-jump preset must exist');
  assert.equal(clapDef?.params.gestureMode, 'clap-jump');
  assert.ok((clapDef?.params.keyframes?.length ?? 0) >= 5, 'clap-jump must define 5 keyframes');

  const cues: TranscriptCue[] = [
    { id: 'c1', start: 0, end: 2.0, text: 'Bravo! Great job speaking fluently!', words: [] },
  ];
  const spec = { ...clapDef!.params };

  // Frame 1 (t ~ 0s): grounded kneeBend > 0.35, NO vertical jump or body squash
  const f1 = computeSpeechLipSyncState(cues, 0.02, {
    actionId: 'clap-jump',
    customSpec: spec,
  });
  assert.ok(f1.kneeBend > 0.35, `Expected grounded kneeBend > 0.35, got ${f1.kneeBend}`);
  assert.equal(f1.jumpOffsetY, 0);
  assert.equal(f1.bodySquashX, 1);
  assert.equal(f1.bodySquashY, 1);

  // Frame 2 (t ~ 0.3s): remains grounded (jumpOffsetY === 0, bodySquash === 1) with articulated arm motion
  const f2 = computeSpeechLipSyncState(cues, 0.3, {
    actionId: 'clap-jump',
    customSpec: spec,
  });
  assert.equal(f2.jumpOffsetY, 0);
  assert.equal(f2.bodySquashX, 1);
  assert.equal(f2.bodySquashY, 1);

  // Frame 3 (t = 0.66s = 0.44 * 1.5s): palms touch together near x=0 with clapImpact > 0.7 & speech lip-sync active
  const f3 = computeSpeechLipSyncState(cues, 0.66, {
    actionId: 'clap-jump',
    customSpec: spec,
  });
  assert.equal(f3.isSpeaking, true);
  assert.ok(
    typeof f3.leftWristX === 'number' &&
      typeof f3.rightWristX === 'number' &&
      f3.leftWristX < 0 &&
      f3.rightWristX > 0 &&
      Math.abs(f3.leftWristX - f3.rightWristX) <= 30,
    `Expected clapping palms close in center, got L=${f3.leftWristX}, R=${f3.rightWristX}`,
  );
  assert.ok(f3.clapImpact >= 0.7, `Expected strong clapImpact >= 0.7, got ${f3.clapImpact}`);
  assert.notEqual(f3.headTiltRad, 0);

  // Frame 5 (t ~ 1.2s): grounded finish without hop or squash
  const f5 = computeSpeechLipSyncState(cues, 1.2, {
    actionId: 'clap-jump',
    customSpec: spec,
  });
  assert.equal(f5.jumpOffsetY, 0);
  assert.equal(f5.bodySquashX, 1);
  assert.equal(f5.bodySquashY, 1);
  assert.ok(f5.kneeBend >= 0.15, `Expected landing kneeBend >= 0.15, got ${f5.kneeBend}`);
});

test('cartoonHost scene continuity, mood guard, @Gimmys prompts, translation card cleanup, and multi-aspect non-overlap', () => {
  // 1. Cartoon host stays steady across scenes (no enter/exit blink)
  const hostEl: SceneElement = {
    id: 'reel-cartoon-host-main',
    type: 'illustration-prop',
    label: '@Gimmys',
    startTime: 0,
    endTime: 10,
    enterAnimation: 'fade-scale',
    exitAnimation: 'fade-out',
    layout: { x: 540, y: 1220, width: 780, scale: 0.9, zIndex: 12 },
    props: { kind: 'illustration-prop', variant: 'cartoon-host', data: {} },
  };
  const fsStart = computeElementFrameState(hostEl, 0.01);
  const fsEnd = computeElementFrameState(hostEl, 9.99);
  assert.equal(fsStart.visible, true);
  assert.equal(fsStart.opacity, 1);
  assert.equal(fsEnd.visible, true);
  assert.equal(fsEnd.opacity, 1);

  // 2. Contextual mood guard rejects mismatched happy mood on AVOID cues
  const guarded = resolveCartoonAnimationForSignal({
    spokenText: 'Avoid this common mistake! Wrong expression.',
    explicitMood: 'happy',
  });
  assert.notEqual(guarded.params.mood, 'happy');

  const valIssues = validateStoryboardDocument(
    {
      compositionId: 'cartoon-host',
      scenes: [
        {
          scene_id: 'sc1',
          elements: [
            {
              element_id: 'bad-mood-host',
              kind: 'illustration-prop',
              variant: 'cartoon-host',
              data: {
                cartoonActionSegments: [
                  {
                    startTime: 0,
                    endTime: 3,
                    actionId: 'warn-shake',
                    mood: 'happy',
                    signal: 'AVOID NG Wrong phrase',
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    [{ id: 'c1', start: 0, end: 3, text: 'Avoid saying this wrong phrase', words: [] }],
  );
  assert.ok(
    valIssues.errors.some((e) => e.code === 'CARTOON_EMOTION_MISMATCH'),
    'Validator should flag happy mood on AVOID segment',
  );

  // 3. @Gimmys prompts suppress Bootstrap/CSS card schemas & end with .json file instructions
  const reelsGimmysPrompt = buildEnglishReelsWebAiPrompt({
    sourceText: 'I was just about to text you.',
    mode: 'vocab',
    targetLang: '日本語',
    compositionId: 'cartoon-host',
  });
  assert.match(reelsGimmysPrompt, /"compositionId": "cartoon-host"/);
  assert.ok(!reelsGimmysPrompt.includes('"variant": "css-sticky-note"'));
  assert.match(reelsGimmysPrompt, /\.json/i);

  const creatorGimmysPrompt = buildAiCreatorWebAiPrompt({
    learningLanguage: 'en',
    targetLang: '日本語',
    compositionId: 'cartoon-host',
    customInputLines: 'I was just about to text you.',
  });
  assert.match(creatorGimmysPrompt, /USER SUBTITLE \/ SCRIPT/);
  assert.match(creatorGimmysPrompt, /\.json/i);

  // 4. Translation mode cleanup: singleRow roadmap strip, no duplicate Prompt box, single vocab/grammar note
  const trProject = reelCardsToLessonProject(
    [
      {
        id: 'tr-1',
        type: 'translation',
        badge: 'ANSWER · REPEAT',
        title: 'be about to',
        sourcePrompt: 'さっき連絡しようと思ってたところ。',
        content: 'I was just about to text you.',
        vocabNotes: 'be about to (まさに〜するところ) / text (メッセージを送る)',
        grammarNote: 'be about to + 動詞の原形で「まさに〜するところ」。',
        ttsText: 'I was just about to text you.',
        thinkSec: 3,
        repeatCount: 2,
      },
    ],
    { title: 'Translation Test', compositionId: 'cartoon-host', aspectRatio: '9:16' },
  );

  const stageStrip = trProject.elements.find((e) => e.id.startsWith('reel-stage-'));
  assert.ok(stageStrip && stageStrip.props.kind === 'comparison-strip');
  if (stageStrip && stageStrip.props.kind === 'comparison-strip') {
    assert.equal(stageStrip.props.singleRow, true, 'Translation roadmap strip must stay singleRow');
  }
  const dupPromptBox = trProject.elements.find((e) => e.id.startsWith('reel-tr-ans-prop-'));
  assert.equal(dupPromptBox, undefined, 'Duplicate Prompt box in answer phase must be removed');

  const ansCard = trProject.elements.find((e) => e.id.startsWith('reel-tr-ans-card-'));
  assert.ok(ansCard && ansCard.props.kind === 'sentence-card');
  if (ansCard && ansCard.props.kind === 'sentence-card') {
    assert.ok(
      ansCard.props.subtext && !ansCard.props.subtext.includes('さっき連絡しようと思ってたところ'),
      'Answer card subtext must not repeat sourcePrompt',
    );
    assert.ok(
      !ansCard.props.subtext?.includes('be about to + 動詞の原形'),
      'Answer card subtext must include only 1 concise vocab/grammar note, not both repeated',
    );
  }

  // 5. Multi-aspect resolveElementLayoutForAspect keeps overlapping elements separated
  const overlapPair: SceneElement[] = [
    {
      id: 'el-a',
      type: 'sentence-card',
      label: 'A',
      startTime: 0,
      endTime: 4,
      enterAnimation: 'none',
      exitAnimation: 'none',
      layout: { x: 540, y: 500, width: 820, scale: 1, zIndex: 10 },
      props: { kind: 'sentence-card', text: 'First overlapping card with extra explanation text', subtext: 'Subtitle line one' },
    },
    {
      id: 'el-b',
      type: 'sentence-card',
      label: 'B',
      startTime: 0,
      endTime: 4,
      enterAnimation: 'none',
      exitAnimation: 'none',
      layout: { x: 540, y: 540, width: 820, scale: 1, zIndex: 11 },
      props: { kind: 'sentence-card', text: 'Second overlapping card right below', subtext: 'Subtitle line two' },
    },
  ];
  for (const ar of ['9:16', '16:9', '1:1', '4:5'] as const) {
    const resolved = resolveElementLayoutForAspect(overlapPair, 1.0, ar);
    const la = resolved.get('el-a')!;
    const lb = resolved.get('el-b')!;
    const extA = estimateElementHalfExtents({ ...overlapPair[0], layout: la });
    const extB = estimateElementHalfExtents({ ...overlapPair[1], layout: lb });
    assert.ok(
      la.y + extA.halfH <= lb.y - extB.halfH + 4,
      `Expected no vertical overlap on ${ar}: A bottom=${la.y + extA.halfH}, B top=${lb.y - extB.halfH}`,
    );
  }
});
