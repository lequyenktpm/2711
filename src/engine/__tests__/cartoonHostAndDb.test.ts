import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSceneGenerationPrompt } from '../aiPromptBuilder';
import {
  BUILTIN_CARTOON_ANIMATIONS,
  buildCartoonActionWebAiPrompt,
  deleteCartoonAnimation,
  getAllCartoonAnimations,
  getCartoonAnimationById,
  getCartoonAnimationsPromptBlock,
  getEffectiveCartoonAnimationCatalog,
  parseCartoonAnimationAiJson,
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
