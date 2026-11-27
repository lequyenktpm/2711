import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjustCuesTiming,
  cuesToBlockTranscript,
  cuesToSrt,
  interpolateWordTimings,
  parseTranscriptAuto,
  shiftCuesAndWords,
  stripTimestampsFromScript,
  tokenizeTextForKaraoke,
} from './transcriptParser';
import { inferSpokenLanguageFromText } from '../server/mediaHelpers';
import { buildSceneGenerationPrompt } from './aiPromptBuilder';
import { choreographFromTranscript, resyncProjectTimingToCues } from './autoChoreographer';
import { computeElementFrameState, computeStaggerItemState } from './animationMath';
import {
  classifyCharToViseme,
  computeCartoonHostContextFromElements,
  computeSpeechLipSyncState,
  formatCartoonHostHeadline,
} from './cartoonHostAnimator';
import {
  cleanDownloadFileName,
  cleanOutputTitleStem,
  resolveTabOutputSubfolder,
  TAB_OUTPUT_SUBFOLDERS,
} from './outputNaming';
import { generatePythonProjectFiles } from './pythonGenerator';
import {
  PRESET_3D_SHAPES_KARAOKE,
  PRESET_ED_PRONUNCIATION,
  PRESET_JP_EN_POLITE,
  PRESET_WATER_POLITE,
  PRESET_XUN52000_DARK,
  SAMPLE_JP_EN_SCENE_JSON,
  SAMPLE_JP_EN_TRANSCRIPT,
  SAMPLE_SCENE_PLAN,
  SAMPLE_WORDS_JSON,
  SAMPLE_XUN52000_SCENE_JSON,
  SAMPLE_XUN52000_TRANSCRIPT,
} from './demoPresets';
import {
  clampStoryboardPlanToAudioDuration,
  parseScenePlanJson,
  parseWordLevelJson,
  projectToWordsAndScenePlan,
  scenePlanToProject,
  summarizeScenePlan,
} from './scenePlanAdapter';
import { buildZipArchive } from '../utils/zipBuilder';
import {
  ensureExpectedExtension,
  isHtmlPayload,
  resolveOutputMimeType,
} from '../utils/safeFileDownload';
import { buildFfmpegArgs } from './ffmpegArgs';
import { resolveMp4EncodingParams } from './mp4Config';
import {
  applyCompositionToProject,
  applyCustomComponentComposition,
  getEligibleCompositionsForContext,
  LAYOUT_COMPOSITIONS,
  matchIllustrationForCue,
  pickCompositionFromContext,
  pickRandomComposition,
  recomposeProjectWithStyle,
  shouldApplyCompositionOverride,
} from './illustrationLayouts';
import {
  findVisualOverlaps,
  resolveProjectOverlaps,
  STAGE_SAFE_BOTTOM,
  estimateElementBounds,
  estimateElementHalfExtents,
} from './layoutSolver';
import {
  CANVAS_THEMES,
  CanvasThemeId,
  isDarkCanvasTheme,
  SceneElement,
} from './types';
import {
  ALL_ILLUSTRATION_VARIANTS,
  ALL_SCENE_ICONS,
  getEffectiveVectorCatalog,
  isKnownIllustrationVariant,
  pickContextualSceneIcon,
  resolveContextualVisualForCue,
} from './vectorComponentDb';
import {
  computeBackgroundImageDrawRect,
  getEffectiveIntroSeconds,
  getEffectiveOutroSeconds,
  getStageDimensionsForAspect,
  hitTestElementLayout,
  karaokeTokenGapPx,
  layoutKaraokeTokens,
  resolveElementLayoutForAspect,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from './canvasRenderer';
import {
  buildVectorComponentAiPrompt,
  deleteComponentVariant,
  parseVectorComponentAiJson,
  restoreBuiltInComponent,
  setCustomComponentDatabaseState,
  upsertCustomComponent,
} from './customComponentStore';
import {
  buildAiCreatorWebAiPrompt,
  buildEnglishReelsWebAiPrompt,
  buildReelCardsRuleBased,
  buildStarterLessonForLanguage,
  buildTranslationCardsFromInput,
  buildTranslationChallengePrompt,
  detectReelMode,
  getLevelsForLearningLanguage,
  getQuizCardSpeechParts,
  getReelLocaleStrings,
  inferLearningLangFromCards,
  parseEnglishReelsAiJson,
  recommendCreatorItemCount,
  recommendTranslationItemCount,
  reelCardsToLessonProject,
  sanitizeTtsSpeech,
  splitMultipleExercisesFromText,
} from './englishReelsEngine';
import {
  getLocaleForTtsLang,
  isMultilingualVoiceId,
  normalizeTtsLangCode,
  pickExplanationDefaultVoice,
  pickVoiceForLangCode,
  sanitizeSpanTextForSpeech,
  splitMixedLanguageTtsSpans,
} from './bilingualTtsHelper';
import {
  compileVisualBuilderToPrimitives,
  createDefaultVisualBuilderConfig,
  VISUAL_LAYOUT_PRESETS,
} from './visualComponentBuilder';
import {
  alignKnownTextToPcmFloat,
  detectWavSpeechBounds,
  parseWavBufferToMonoFloat32,
  tokenizeTextForAlignment,
} from './forcedAligner';
import {
  buildReadingWebAiPrompt,
  cleanReadingWorksheetInput,
  computeReadingTargetLength,
  parseReadingWebAiResponse,
  READING_FORMAT_OPTIONS,
  READING_STARTER_BY_LANG,
} from './readingPromptBuilder';
import { BACKGROUND_PRESETS } from './backgroundPresets';
import {
  buildEstimatedReadingWords,
  computeReadingTimelineMetrics,
  getReadingUiStrings,
  isDefaultReadingOutroPair,
  paginateReadingWords,
  READING_BOOK_FRAMES,
  READING_BOOK_PALETTES,
  READING_POINTER_STYLES,
} from './eduStudioEffects';
import {
  detectLearningLanguageFromText,
  generateBatchPromptsForTopics,
  parseCreatorOrTranslationBatchInput,
  parseReadingBatchInput,
  parseTopicLinesInput,
  splitMultiJsonInputs,
} from './multiTabBatchHelper';
import {
  computeDuckingGainAtTime,
  DEFAULT_BGM_PRESET,
  DEFAULT_BGM_VOLUME,
  encodeStereoFloatChannelsToWavArrayBuffer,
  extractCountdownWindowsFromElements,
  shiftReadingWordsForIntro,
  STUDIO_BGM_PRESETS,
} from './audioMixHelper';
import {
  buildSourceSegmentsFromCues,
  normalizeSceneIconWithAlias,
  resolveSyncAnchorTiming,
} from './storyboardV19';
import { validateStoryboardDocument } from './storyboardValidator';
import { buildVideoDescription } from './videoDescriptionBuilder';
import { resolveReelsModeSettings } from '../utils/studioSettingsStore';

test('interpolateWordTimings distributes word timestamps across cue duration', () => {
  const words = interpolateWordTimings('Give me water please', 1.0, 3.0);
  assert.equal(words.length, 4);
  assert.equal(words[0].start, 1.0);
  assert.equal(words[words.length - 1].end, 3.0);
  for (let i = 1; i < words.length; i++) {
    assert.ok(words[i].start >= words[i - 1].start);
    assert.ok(words[i].end >= words[i].start);
  }
});

test('parseTranscriptAuto parses SRT, Whisper JSON, and timestamped lines', () => {
  const srt = `1
00:00:00,500 --> 00:00:02,500
"Give me coffee." sounds rude!

2
00:00:02,600 --> 00:00:05,000
Try "Could I have a coffee?" instead.`;

  const srtCues = parseTranscriptAuto(srt);
  assert.equal(srtCues.length, 2);
  assert.equal(srtCues[0].start, 0.5);
  assert.equal(srtCues[1].end, 5.0);
  assert.ok(srtCues[0].words.length >= 4);

  const jsonCues = parseTranscriptAuto(
    JSON.stringify({
      segments: [
        { start: 0.1, end: 1.5, text: 'Hello world' },
        { start: 1.6, end: 3.2, text: 'Speak politely' },
      ],
    }),
  );
  assert.equal(jsonCues.length, 2);
  assert.equal(jsonCues[1].text, 'Speak politely');

  const roundTripSrt = cuesToSrt(jsonCues);
  assert.ok(roundTripSrt.includes('-->'));
});

test('choreographFromTranscript generates arranged elements with show/hide lifespans', () => {
  const cues = parseTranscriptAuto(`[0:00 - 0:02.5] "Give me water" is rude.
[0:02.6 - 0:05.2] Try "Could I have some water?" instead.`);
  const project = choreographFromTranscript(cues, { title: 'Polite Water' });

  assert.equal(project.title, 'Polite Water');
  assert.ok(project.duration >= 5.2);
  assert.ok(project.elements.some((e) => e.type === 'comparison-strip'));
  assert.ok(project.elements.some((e) => e.type === 'sentence-card'));
  assert.ok(project.elements.some((e) => e.type === 'karaoke-card'));
  assert.ok(project.elements.some((e) => e.type === 'tone-meter'));
});

test('computeElementFrameState handles appear/visible/disappear states accurately', () => {
  const el = PRESET_WATER_POLITE.elements.find((e) => e.id === 'el-card-rude')!;
  const before = computeElementFrameState(el, el.startTime - 0.1);
  assert.equal(before.visible, false);

  const entering = computeElementFrameState(el, el.startTime + 0.05);
  assert.equal(entering.visible, true);
  assert.ok(entering.opacity > 0 && entering.opacity < 1);

  const steady = computeElementFrameState(el, (el.startTime + el.endTime) / 2);
  assert.equal(steady.visible, true);
  assert.equal(steady.opacity, 1);

  const after = computeElementFrameState(el, el.endTime + 0.1);
  assert.equal(after.visible, false);
});

test('scenePlanAdapter parses words.json + scene.json and converts 3D shapes accurately', () => {
  const words = parseWordLevelJson(JSON.stringify(SAMPLE_WORDS_JSON));
  const plan = parseScenePlanJson(JSON.stringify(SAMPLE_SCENE_PLAN));
  assert.equal(words.length, 13);
  assert.ok(plan !== null && plan.scenes.length === 2);

  const converted = scenePlanToProject(words, plan!, { title: '3D Test' });
  const shapes = converted.elements.filter((e) => e.type === 'shape-3d');
  const karaokes = converted.elements.filter((e) => e.type === 'karaoke-card');
  assert.equal(shapes.length, 4);
  assert.ok(karaokes.length >= 2);
  assert.equal(shapes[0].startTime, words[0].start);

  const exported = projectToWordsAndScenePlan(PRESET_3D_SHAPES_KARAOKE);
  assert.equal(exported.wordsJson.words.length, 13);
  assert.ok(exported.scenePlan.scenes[0].shapes!.length >= 3);
});

test('generatePythonProjectFiles outputs complete modular video_maker package and valid ZIP', () => {
  const files = generatePythonProjectFiles(PRESET_3D_SHAPES_KARAOKE);
  const expectedFiles = [
    'main.py',
    'loader.py',
    'renderer_shapes.py',
    'renderer_text.py',
    'renderer_subtitles.py',
    'timeline.py',
    'video_builder.py',
    'sample_words.json',
    'sample_scene.json',
    'requirements.txt',
    'README.md',
  ] as const;

  for (const name of expectedFiles) {
    assert.ok(files[name].length > 20, `Expected non-empty file ${name}`);
  }

  assert.ok(files['renderer_shapes.py'].includes('GaussianBlur'));
  assert.ok(files['renderer_shapes.py'].includes('staircase_3d'));
  assert.ok(files['renderer_subtitles.py'].includes('#FACC15'));
  assert.ok(files['video_builder.py'].includes('VideoClip'));
  assert.ok(files['requirements.txt'].includes('moviepy'));

  const parsedWords = JSON.parse(files['sample_words.json']);
  const parsedScene = JSON.parse(files['sample_scene.json']);
  assert.ok(Array.isArray(parsedWords.words) && parsedWords.words.length > 0);
  assert.ok(Array.isArray(parsedScene.scenes) && parsedScene.scenes.length > 0);

  const zipBytes = buildZipArchive(files);
  assert.equal(zipBytes[0], 0x50);
  assert.equal(zipBytes[1], 0x4b);
  assert.equal(zipBytes[2], 0x03);
  assert.equal(zipBytes[3], 0x04);
});

test('parseTranscriptAuto parses standalone 00:00:00.000 JP-EN blocks and chunks CJK for karaoke', () => {
  const cues = parseTranscriptAuto(SAMPLE_JP_EN_TRANSCRIPT);
  assert.equal(cues.length, 27);
  assert.equal(cues[0].start, 0);
  assert.equal(cues[1].start, 11.96);
  assert.equal(cues[2].start, 17.04);
  assert.equal(cues[cues.length - 1].start, 99.8);
  assert.equal(cues[cues.length - 1].text, 'Follow along.');
  assert.deepEqual(
    cues[cues.length - 1].words.map((w) => w.word),
    ['Follow', 'along.'],
  );

  // Japanese cue 1 must be split into readable chunks rather than one giant token
  assert.ok(cues[0].words.length >= 12);
  for (const w of cues[0].words) {
    assert.ok(w.word.length <= 5, `Chunk too long: ${w.word}`);
  }

  const blockRoundTrip = cuesToBlockTranscript(cues.slice(0, 2));
  assert.ok(blockRoundTrip.includes('00:00:00.000'));
  assert.ok(blockRoundTrip.includes('00:00:11.960'));
});

test('buildSceneGenerationPrompt embeds formatted cues and flexible element schema', () => {
  const cues = parseTranscriptAuto(SAMPLE_JP_EN_TRANSCRIPT);
  const prompt = buildSceneGenerationPrompt(cues, {
    title: 'Can / Could / May',
    style: 'tiktok-cards',
  });

  assert.ok(prompt.includes('[Cue 1 | 00:00:00.000 ->'));
  assert.ok(prompt.includes('[Cue 27 | 00:01:39.800 ->'));
  assert.ok(prompt.includes('comparison_strip'));
  assert.ok(prompt.includes('staircase_3d'));
  assert.ok(prompt.includes('sentence_card'));
  assert.ok(prompt.includes('Can you pass the salt?'));
});

test('scenePlanToProject supports AI flexible elements[] with cuesOverride and Python export', () => {
  const cues = parseTranscriptAuto(SAMPLE_JP_EN_TRANSCRIPT);
  const words = cues.flatMap((c) => c.words);
  const parsed = parseScenePlanJson(JSON.stringify(SAMPLE_JP_EN_SCENE_JSON));
  assert.ok(parsed !== null);

  const project = scenePlanToProject(words, parsed!, {
    title: 'JP-EN Polite Lesson',
    cuesOverride: cues,
  });

  assert.equal(project.cues.length, 27);
  assert.ok(project.elements.some((e) => e.type === 'comparison-strip'));
  assert.ok(project.elements.some((e) => e.type === 'topic-pill'));
  assert.ok(project.elements.some((e) => e.type === 'illustration-prop'));
  assert.ok(project.elements.some((e) => e.type === 'sentence-card'));
  assert.ok(project.elements.some((e) => e.type === 'tone-meter'));
  assert.ok(
    project.elements.some(
      (e) => e.type === 'shape-3d' && e.props.kind === 'shape-3d' && e.props.shapeType === 'staircase_3d',
    ),
  );
  assert.equal(project.elements.filter((e) => e.type === 'karaoke-card').length, 27);

  const pyFiles = generatePythonProjectFiles(PRESET_JP_EN_POLITE);
  assert.ok(pyFiles['loader.py'].includes('from typing import Any, Dict, List, Tuple'));
  assert.ok(pyFiles['loader.py'].includes('_tokenize_for_karaoke'));
  assert.ok(pyFiles['renderer_text.py'].includes('NotoSansCJK'));
  assert.ok(pyFiles['timeline.py'].includes('_resolve_time_value'));
});

test('parseScenePlanJson extracts JSON from ChatGPT/Gemini markdown fences and converts word_stack/subtext', () => {
  const aiResponse = `Dưới đây là JSON dựng video tự động của bạn:

\`\`\`json
{
  "title": "AI Office Tip",
  "theme": "mint-breeze",
  "scenes": [
    {
      "id": "sc1",
      "elements": [
        { "type": "illustration", "variant": "office-work", "start": "00:00:00.000", "end": "00:00:04.000", "y": 620 },
        {
          "type": "sentence_card",
          "start": "00:00:00.500",
          "end": "00:00:03.800",
          "y": 970,
          "text": "Could I take Friday off?",
          "subtext": "Lịch sự với sếp",
          "badge": "question",
        },
        {
          "type": "word_stack",
          "start": "00:00:04.000",
          "end": "00:00:07.500",
          "y": 720,
          "rows": [
            { "prefix": "Can ", "suffix": "I...", "suffixColor": "#2563EB", "appearAt": "00:00:04.200", "phonetic": "Casual" }
          ]
        }
      ]
    }
  ]
}
\`\`\`

Chúc bạn render thành công!`;

  const parsed = parseScenePlanJson(aiResponse);
  assert.ok(parsed !== null);
  const cues = parseTranscriptAuto('00:00:00.000\nCould I take Friday off?\n\n00:00:04.000\nAsk politely.');
  const summary = summarizeScenePlan(parsed!, cues);
  assert.equal(summary.elementCount, 3);
  assert.equal(summary.cueCount, 2);

  const project = scenePlanToProject(
    cues.flatMap((c) => c.words),
    parsed!,
    { cuesOverride: cues },
  );
  assert.equal(project.theme, 'mint-breeze');
  const card = project.elements.find((e) => e.type === 'sentence-card');
  assert.ok(card && card.props.kind === 'sentence-card');
  assert.equal(card.props.subtext, 'Lịch sự với sếp');
  assert.equal(card.props.badge, 'question');
  assert.ok(project.elements.some((e) => e.type === 'word-stack'));
});

test('buildFfmpegArgs configures MJPEG -> H.264/AAC MP4 with audio or silent fallback', () => {
  const withAudio = buildFfmpegArgs({
    fps: 30,
    framesPath: '/tmp/job/frames.mjpeg',
    outputPath: '/tmp/job/output.mp4',
    audioPath: '/tmp/job/audio.mp3',
  });
  assert.ok(withAudio.includes('-f'));
  assert.ok(withAudio.includes('mjpeg'));
  assert.ok(withAudio.includes('/tmp/job/audio.mp3'));
  assert.ok(!withAudio.includes('anullsrc=channel_layout=stereo:sample_rate=44100'));
  assert.ok(withAudio.includes('libx264'));
  assert.ok(withAudio.includes('yuv420p'));
  assert.ok(withAudio.includes('aac'));
  assert.ok(withAudio.includes('+faststart'));
  assert.equal(withAudio[withAudio.length - 1], '/tmp/job/output.mp4');

  const silentClamped = buildFfmpegArgs({
    fps: 120,
    framesPath: '/tmp/job/frames.mjpeg',
    outputPath: '/tmp/job/silent.mp4',
    audioPath: null,
    crf: 10,
  });
  const fpsIdx = silentClamped.indexOf('-framerate');
  assert.equal(silentClamped[fpsIdx + 1], '60');
  const crfIdx = silentClamped.indexOf('-crf');
  assert.equal(silentClamped[crfIdx + 1], '16');
  assert.ok(silentClamped.includes('anullsrc=channel_layout=stereo:sample_rate=44100'));

  const highCrf = buildFfmpegArgs({
    fps: 24,
    framesPath: '/tmp/job/frames.mjpeg',
    outputPath: '/tmp/job/light.mp4',
    audioPath: null,
    crf: 99,
  });
  assert.equal(highCrf[highCrf.indexOf('-crf') + 1], '32');
});

test('resolveMp4EncodingParams resolves dimensions, bitrate scaling, and CRF for presets', () => {
  const fhdHigh30 = resolveMp4EncodingParams({
    resolution: '1080p',
    quality: 'high',
    fps: 30,
  });
  assert.equal(fhdHigh30.width, 1080);
  assert.equal(fhdHigh30.height, 1920);
  assert.equal(fhdHigh30.fps, 30);
  assert.equal(fhdHigh30.videoBitrate, 6_000_000);
  assert.equal(fhdHigh30.audioBitrate, 192_000);
  assert.equal(fhdHigh30.crf, 22);

  const hdUltra24 = resolveMp4EncodingParams({
    resolution: '720p',
    quality: 'ultra',
    fps: 24,
  });
  assert.equal(hdUltra24.width, 720);
  assert.equal(hdUltra24.height, 1280);
  assert.equal(hdUltra24.fps, 24);
  assert.equal(hdUltra24.crf, 18);
  assert.ok(hdUltra24.videoBitrate > 3_500_000 && hdUltra24.videoBitrate < 5_000_000);

  const qhdUltra60 = resolveMp4EncodingParams({
    resolution: '1440p',
    quality: 'ultra',
    fps: 60,
  });
  assert.equal(qhdUltra60.width, 1440);
  assert.equal(qhdUltra60.height, 2560);
  assert.equal(qhdUltra60.fps, 60);
  assert.ok(qhdUltra60.videoBitrate > 25_000_000);

  const sdStandard24 = resolveMp4EncodingParams({
    resolution: '540p',
    quality: 'standard',
    fps: 24,
  });
  assert.equal(sdStandard24.width, 540);
  assert.equal(sdStandard24.height, 960);
  assert.equal(sdStandard24.crf, 27);
  assert.ok(sdStandard24.videoBitrate >= 650_000);
});

test('resolveProjectOverlaps eliminates vertical collisions and protects karaoke zone', () => {
  const crowded: SceneElement[] = [
    {
      id: 'strip',
      type: 'comparison-strip',
      label: 'Strip',
      startTime: 0,
      endTime: 5,
      enterAnimation: 'drop-in',
      exitAnimation: 'fade-out',
      layout: { x: 540, y: 185, width: 900, scale: 1, zIndex: 10 },
      props: {
        kind: 'comparison-strip',
        items: [
          { label: 'At', accentColor: '#2563EB' },
          { label: 'On', accentColor: '#16A34A' },
          { label: 'In', accentColor: '#7C3AED' },
        ],
      },
    },
    {
      id: 'pill',
      type: 'topic-pill',
      label: 'Pill',
      startTime: 0,
      endTime: 5,
      enterAnimation: 'pop-up',
      exitAnimation: 'fade-out',
      layout: { x: 540, y: 260, width: 340, scale: 1, zIndex: 12 }, // Deliberately overlaps strip!
      props: { kind: 'topic-pill', text: 'Prepositions', bgColor: '#DDD6FE', textColor: '#4338CA' },
    },
    {
      id: 'stack',
      type: 'word-stack',
      label: '4-row stack',
      startTime: 0,
      endTime: 5,
      enterAnimation: 'pop-up',
      exitAnimation: 'fade-out',
      layout: { x: 540, y: 520, width: 760, scale: 1, zIndex: 16 }, // Tall 4-row stack!
      props: {
        kind: 'word-stack',
        rows: [
          { prefix: 'At ', suffix: 'point', suffixColor: '#2563EB', appearAt: 0 },
          { prefix: 'On ', suffix: 'surface', suffixColor: '#16A34A', appearAt: 0.2 },
          { prefix: 'In ', suffix: 'space', suffixColor: '#7C3AED', appearAt: 0.4 },
          { prefix: 'By ', suffix: 'time', suffixColor: '#EA580C', appearAt: 0.6 },
        ],
      },
    },
    {
      id: 'card',
      type: 'sentence-card',
      label: 'Long card',
      startTime: 0,
      endTime: 5,
      enterAnimation: 'pop-up',
      exitAnimation: 'shrink',
      layout: { x: 540, y: 780, width: 830, scale: 1, zIndex: 20 }, // Collides with tall stack!
      props: {
        kind: 'sentence-card',
        text: 'Could I take Friday off, please? Let me double check.',
        badge: 'check',
      },
    },
    {
      id: 'meter',
      type: 'tone-meter',
      label: 'Meter',
      startTime: 0,
      endTime: 5,
      enterAnimation: 'slide-up',
      exitAnimation: 'fade-out',
      layout: { x: 540, y: 920, width: 700, scale: 1, zIndex: 18 }, // Collides with card!
      props: {
        kind: 'tone-meter',
        title: 'TONE',
        leftLabel: 'casual',
        rightLabel: 'polite',
        valueStart: 0.2,
        valueEnd: 0.9,
        animateStart: 0.5,
        animateEnd: 4,
      },
    },
  ];

  const resolved = resolveProjectOverlaps(crowded);
  const violations = findVisualOverlaps(resolved);
  assert.deepEqual(violations, []);

  for (const el of resolved) {
    const b = estimateElementBounds(el);
    assert.ok(b.bottom <= STAGE_SAFE_BOTTOM + 10, `${el.id} exceeded safe bottom: ${b.bottom}`);
  }
});

test('matchIllustrationForCue matches contextually accurate vector scenes', () => {
  assert.equal(matchIllustrationForCue('In a cafe, thirsty for water'), 'cafe-water');
  assert.equal(matchIllustrationForCue('Give me a coffee latte please'), 'coffee-cup');
  assert.equal(matchIllustrationForCue('Boss walks by on Friday at the office'), 'office-work');
  assert.equal(matchIllustrationForCue('Heard at a hotel reception desk'), 'hotel-desk');
  assert.equal(matchIllustrationForCue('8:20 means twenty past eight on the clock'), 'clock-face');
  assert.equal(matchIllustrationForCue('Tone and smile sound warm and polite'), 'gauge-arc');
  assert.equal(matchIllustrationForCue('Ear check listening quiz'), 'ear-listen');
  assert.equal(matchIllustrationForCue('Here is a quick tip to remember'), 'lightbulb-tip');
});

test('all @englishpracticing168 compositions and presets produce 0 overlap violations', () => {
  const presets = [
    PRESET_JP_EN_POLITE,
    PRESET_WATER_POLITE,
    PRESET_ED_PRONUNCIATION,
    PRESET_3D_SHAPES_KARAOKE,
  ];
  for (const preset of presets) {
    const resolved = resolveProjectOverlaps(preset.elements);
    assert.deepEqual(findVisualOverlaps(resolved), [], `Preset ${preset.id} had overlaps`);
  }

  for (const comp of LAYOUT_COMPOSITIONS) {
    const recomposed = recomposeProjectWithStyle(PRESET_JP_EN_POLITE, comp.id);
    assert.equal(recomposed.compositionId, comp.id);
    assert.equal(recomposed.cues.length, PRESET_JP_EN_POLITE.cues.length);
    assert.ok(
      recomposed.elements.some(
        (e) => e.props.kind === 'illustration-prop' && e.props.variant === comp.signatureVariant,
      ) ||
        comp.id === 'story-scenes' ||
        (comp.id === 'plain' &&
          recomposed.elements.length > 0 &&
          recomposed.elements.every((e) => e.type === 'karaoke-card')) ||
        (comp.id === 'word-reveal' && recomposed.elements.some((e) => e.type === 'sentence-card')) ||
        (comp.id === '3d-shapes' && recomposed.elements.some((e) => e.type === 'shape-3d')),
      `Expected signature variant for composition ${comp.id}`,
    );
    if (comp.id === 'dialogue-upgrade') {
      const firstDiag = recomposed.elements.find(
        (e) => e.props.kind === 'illustration-prop' && e.props.variant === 'dialogue-upgrade',
      );
      assert.ok(firstDiag && firstDiag.props.kind === 'illustration-prop');
      const prompts = (firstDiag.props.data?.upgrades || []).map((r) => r.prompt);
      assert.equal(new Set(prompts).size, prompts.length, 'Dialogue upgrade rows must not repeat prompts');
    }
    const violations = findVisualOverlaps(recomposed.elements);
    assert.deepEqual(violations, [], `Composition ${comp.id} produced overlaps`);
  }
});

test('pickRandomComposition rotates away from current composition and parses new AI diagram JSON', () => {
  for (const comp of LAYOUT_COMPOSITIONS) {
    const picked = pickRandomComposition(comp.id, comp.recommendedTheme, () => 0.42);
    assert.notEqual(picked.compositionId, comp.id);
  }

  const aiDiagramPlan = parseScenePlanJson(
    JSON.stringify({
      title: 'Time & Politeness',
      scenes: [
        {
          id: 'sc1',
          elements: [
            {
              type: 'clock_face',
              start: '00:00:00.000',
              end: '00:00:04.000',
              timeHour: 8,
              timeMinute: 20,
              formula: '8:20',
              subtitle: 'twenty past eight',
            },
            {
              type: 'gauge_arc',
              start: '00:00:00.000',
              end: '00:00:04.000',
              y: 635, // Deliberately placed at same Y as clock_face to verify collision solver!
              value: 0.85,
              subtitle: 'Polite',
            },
          ],
        },
      ],
    }),
  );
  assert.ok(aiDiagramPlan !== null);
  const cues = parseTranscriptAuto('00:00:00.000\nIt is twenty past eight.');
  const proj = scenePlanToProject(
    cues.flatMap((c) => c.words),
    aiDiagramPlan!,
    { cuesOverride: cues },
  );
  assert.equal(findVisualOverlaps(proj.elements).length, 0);
  assert.ok(
    proj.elements.some((e) => e.props.kind === 'illustration-prop' && e.props.variant === 'clock-face'),
  );
  assert.ok(
    proj.elements.some((e) => e.props.kind === 'illustration-prop' && e.props.variant === 'gauge-arc'),
  );
});

test('buildSceneGenerationPrompt supports @xun52000 Word Reveal Dark template and ai-decide composition', () => {
  const cues = parseTranscriptAuto(SAMPLE_XUN52000_TRANSCRIPT);

  // 1. Xun52000 Word Reveal style
  const xunPrompt = buildSceneGenerationPrompt(cues, {
    title: 'Stop Saying Very',
    style: 'word-reveal-dark',
  });
  assert.ok(xunPrompt.includes('WORD-REVEAL (@xun52000'));
  assert.ok(xunPrompt.includes('"theme": "studio-slate"'));
  assert.ok(xunPrompt.includes('sentence_card'));

  // 2. AI decides composition mode
  const aiDecidePrompt = buildSceneGenerationPrompt(cues, {
    title: 'Can / Could / May',
    style: 'tiktok-cards',
    compositionId: 'ai-decide',
  });
  assert.ok(aiDecidePrompt.includes('CHẾ ĐỘ AI TỰ CHỌN PHỐI TỐI ƯU'));
  assert.ok(aiDecidePrompt.includes('compositionId'));
  assert.ok(aiDecidePrompt.includes('compositionReason'));
  assert.ok(aiDecidePrompt.includes('phrase-icon-split'));
  assert.ok(aiDecidePrompt.includes('KHÔNG invent type'));

  // 3. Preset Xun52000 project validation
  assert.equal(PRESET_XUN52000_DARK.theme, 'studio-slate');
  assert.equal(findVisualOverlaps(PRESET_XUN52000_DARK.elements).length, 0);
  assert.ok(PRESET_XUN52000_DARK.elements.length > 0);
  assert.ok(PRESET_XUN52000_DARK.elements.some((e) => e.type === 'sentence-card'));
});

test('Look/See/Watch context picks phrase-icon-split and still applies after JSON exists', () => {
  const transcript = 'Look, see, and watch. I see TV every night is wrong. Watch the TV instead.';
  assert.equal(pickCompositionFromContext(transcript), 'phrase-icon-split');
  const recomposed = recomposeProjectWithStyle(PRESET_JP_EN_POLITE, 'phrase-icon-split');
  const illVariants = recomposed.elements
    .filter((e) => e.props.kind === 'illustration-prop')
    .map((e) => (e.props.kind === 'illustration-prop' ? e.props.variant : ''));
  assert.ok(illVariants.includes('phrase-icon-split'));
  assert.ok(illVariants.includes('contrast-pair-cards'));
  assert.ok(illVariants.includes('trio-icon-cards'));
  assert.ok(
    recomposed.elements.filter((e) => e.type !== 'karaoke-card').length >= 18,
    'phrase-icon-split must preserve full scene chrome and beats across the timeline',
  );
  const forced = applyCompositionToProject(PRESET_JP_EN_POLITE, 'phrase-icon-split');
  assert.equal(forced.compositionId, 'phrase-icon-split');
  assert.equal(findVisualOverlaps(recomposed.elements).length, 0);
});

test('vectorComponentDb resolves expanded @englishpracticing168 scenes, icons, and contrast/quiz cards', () => {
  assert.ok(ALL_SCENE_ICONS.length >= 42);
  assert.ok(ALL_SCENE_ICONS.includes('glasses'));
  assert.ok(ALL_ILLUSTRATION_VARIANTS.length >= 33);
  assert.ok(ALL_ILLUSTRATION_VARIANTS.includes('trio-icon-cards'));
  assert.ok(ALL_ILLUSTRATION_VARIANTS.includes('contrast-pair-cards'));
  assert.ok(ALL_ILLUSTRATION_VARIANTS.includes('quiz-fill-blank'));

  assert.equal(
    resolveContextualVisualForCue('Please show your boarding pass at airport gate B4').variant,
    'airport-travel',
  );
  assert.equal(
    resolveContextualVisualForCue('Waiter, could we see the dinner menu and the bill please?').variant,
    'restaurant-order',
  );
  assert.equal(
    resolveContextualVisualForCue('How much is the discount at this store?').variant,
    'shopping-price',
  );
  assert.equal(
    resolveContextualVisualForCue('I have a headache and need to see a doctor at the clinic').variant,
    'doctor-health',
  );
  assert.equal(
    resolveContextualVisualForCue('Today is sunny and warm according to the weather forecast').variant,
    'weather-forecast',
  );
  assert.equal(
    resolveContextualVisualForCue('Do not give up on phrasal verbs, figure out the meaning').variant,
    'phrasal-split',
  );
  assert.equal(
    resolveContextualVisualForCue('This English idiom is a piece of cake').variant,
    'idiom-split',
  );
  assert.equal(
    resolveContextualVisualForCue('Yesterday he went to Tokyo, tomorrow he will fly home').variant,
    'tense-timeline',
  );
  assert.equal(
    resolveContextualVisualForCue('Notice the syllable stress pattern on REcord vs reCORD').variant,
    'syllable-stress',
  );
  assert.equal(
    resolveContextualVisualForCue('Use rising intonation when asking yes/no questions').variant,
    'intonation-curve',
  );
  assert.equal(
    resolveContextualVisualForCue('Question: I cannot see without my glasses, fill in the blank')
      .variant,
    'quiz-fill-blank',
  );
  assert.equal(
    resolveContextualVisualForCue("You can't swap them! Look and Watch are not the same").variant,
    'contrast-pair-cards',
  );
  assert.equal(
    resolveContextualVisualForCue('Look, see, or watch? Learn the difference!').variant,
    'trio-icon-cards',
  );

  // Stop saying X -> Say Y generates dynamic-scene split-compare
  const stopSaying = resolveContextualVisualForCue('Stop saying very busy. Say swamped instead.');
  assert.equal(stopSaying.variant, 'dynamic-scene');
  assert.equal(stopSaying.data?.dynamicScene?.layout, 'split-compare');

  // Icon resolver
  assert.equal(pickContextualSceneIcon('Check in your luggage before the flight'), 'airplane');
  assert.equal(pickContextualSceneIcon('Bring an umbrella for heavy rain'), 'umbrella');
  assert.equal(pickContextualSceneIcon('I cannot see without my reading glasses'), 'glasses');
});

test('context-locked randomization forbids irrelevant clock-spotlight, unifies word-reveal & 3d-shapes, and supports clean themes', () => {
  const nonTimeTranscript = 'At the airport, show your boarding pass and luggage at the gate.';
  const eligible = getEligibleCompositionsForContext(nonTimeTranscript);
  assert.ok(!eligible.some((c) => c.id === 'clock-spotlight'));
  assert.ok(LAYOUT_COMPOSITIONS.some((c) => c.id === 'word-reveal'));
  assert.ok(LAYOUT_COMPOSITIONS.some((c) => c.id === '3d-shapes'));

  for (let i = 0; i < 25; i++) {
    const picked = pickRandomComposition(undefined, 'pastel-sunrise', () => (i * 0.13) % 1, {
      transcriptText: nonTimeTranscript,
      allowDarkThemes: true,
    });
    assert.notEqual(picked.compositionId, 'clock-spotlight');
    assert.ok(Object.values(CANVAS_THEMES).some((t) => t.id === picked.theme));
  }

  // Karaoke card adapts cleanly across all 5 clean themes (including studio-slate)
  for (const themeMeta of Object.values(CANVAS_THEMES)) {
    const recomposed = recomposeProjectWithStyle(PRESET_JP_EN_POLITE, 'story-scenes', {
      theme: themeMeta.id as CanvasThemeId,
    });
    assert.equal(recomposed.theme, themeMeta.id);
    const karaoke = recomposed.elements.find((e) => e.type === 'karaoke-card');
    assert.ok(karaoke && karaoke.props.kind === 'karaoke-card');
    assert.equal(
      karaoke.props.variant,
      isDarkCanvasTheme(themeMeta.id) ? 'dark-bar' : 'white-card',
    );
    assert.equal(findVisualOverlaps(recomposed.elements).length, 0);
  }

  // Unified word-reveal & 3d-shapes compositions render without overlaps
  for (const unifiedId of ['word-reveal', '3d-shapes'] as const) {
    const recomposed = recomposeProjectWithStyle(PRESET_WATER_POLITE, unifiedId);
    assert.equal(recomposed.compositionId, unifiedId);
    assert.equal(findVisualOverlaps(recomposed.elements).length, 0);
  }
});

test('autoChoreographer and scenePlanToProject support per-cue vector scenes and dynamic_scene with 0 overlaps', () => {
  const multiTopicCues = parseTranscriptAuto(`00:00:00.000
Show your passport at the airport gate.

00:00:03.500
Ask the waiter for the restaurant menu.

00:00:07.000
Stop saying very happy. Say thrilled instead.`);

  const project = choreographFromTranscript(multiTopicCues, {
    title: 'Multi Scene Test',
    theme: 'studio-slate',
  });
  const props = project.elements
    .filter((e) => e.props.kind === 'illustration-prop')
    .map((e) => (e.props.kind === 'illustration-prop' ? e.props.variant : ''));

  assert.ok(props.includes('airport-travel'));
  assert.ok(props.includes('restaurant-order'));
  assert.ok(props.includes('dynamic-scene') || props.includes('degree-scale'));
  assert.equal(findVisualOverlaps(project.elements).length, 0);

  const dynamicPlan = parseScenePlanJson(
    JSON.stringify({
      title: 'Airport Upgrade',
      theme: 'soft-lavender',
      scenes: [
        {
          id: 'sc1',
          elements: [
            {
              type: 'dynamic_scene',
              start: '00:00:00.000',
              end: '00:00:04.000',
              y: 635,
              dynamicScene: {
                layout: 'split-compare',
                badgeText: 'NATURAL ENGLISH',
                connector: 'arrow',
                motifs: [
                  { icon: 'airplane', label: 'I go airport', status: 'cross', accent: '#DC2626' },
                  { icon: 'luggage', label: 'Heading to Gate B4', status: 'check', accent: '#16A34A' },
                ],
              },
            },
          ],
        },
      ],
    }),
  );

  assert.ok(dynamicPlan !== null);
  const adapted = scenePlanToProject(
    multiTopicCues.flatMap((c) => c.words),
    dynamicPlan!,
    { cuesOverride: multiTopicCues },
  );
  assert.equal(adapted.theme, 'soft-lavender');
  assert.ok(
    adapted.elements.some(
      (e) =>
        e.props.kind === 'illustration-prop' &&
        e.props.variant === 'dynamic-scene' &&
        e.props.data?.dynamicScene?.layout === 'split-compare',
    ),
  );
  assert.equal(findVisualOverlaps(adapted.elements).length, 0);
});

test('computeBackgroundImageDrawRect centers and scales cover/contain cleanly for 1080x1920', () => {
  // Landscape 16:9 image (1920x1080) with cover fills full 1920 height and overflows width centered
  const landscapeCover = computeBackgroundImageDrawRect(1920, 1080, STAGE_WIDTH, STAGE_HEIGHT, 'cover');
  assert.equal(landscapeCover.dh, STAGE_HEIGHT);
  assert.ok(landscapeCover.dw > STAGE_WIDTH);
  assert.equal(landscapeCover.dy, 0);
  assert.ok(landscapeCover.dx < 0);

  // Landscape 16:9 image with contain fits full 1080 width centered vertically
  const landscapeContain = computeBackgroundImageDrawRect(1920, 1080, STAGE_WIDTH, STAGE_HEIGHT, 'contain');
  assert.equal(landscapeContain.dw, STAGE_WIDTH);
  assert.ok(landscapeContain.dh < STAGE_HEIGHT);
  assert.equal(landscapeContain.dx, 0);
  assert.ok(landscapeContain.dy > 0);
});

test('shouldApplyCompositionOverride preserves existing custom JSON unless forced', () => {
  assert.equal(shouldApplyCompositionOverride(true), false);
  assert.equal(shouldApplyCompositionOverride(true, false), false);
  assert.equal(shouldApplyCompositionOverride(true, true), true);
  assert.equal(shouldApplyCompositionOverride(false), true);
});

test('customComponentStore CRUD, AI Web prompt/JSON parser, and contextual vector matching', async () => {
  setCustomComponentDatabaseState({ components: [], deletedBuiltIns: [] }, { persistLocal: false });

  const prompt = buildVectorComponentAiPrompt('Bệnh viện thú y khám cho mèo', { category: 'life' });
  assert.ok(prompt.includes('Bệnh viện thú y khám cho mèo'));
  assert.ok(prompt.includes('"primitives"'));

  const aiResponse = `\`\`\`json
  {
    "variant": "custom-vet-clinic",
    "label": "Phòng khám thú y",
    "category": "life",
    "description": "Khám sức khỏe thú cưng",
    "keywords": ["vet", "pet clinic", "cat checkup", "puppy"],
    "defaultIcon": "stethoscope",
    "primitives": [
      { "shape": "rect", "x": -300, "y": -130, "w": 600, "h": 260, "radius": 28, "fill": "#FFFFFF", "shadow": true },
      { "shape": "icon", "icon": "stethoscope", "x": -120, "y": 10 },
      { "shape": "text", "x": 60, "y": 10, "text": "PET CHECKUP", "fill": "#2563EB", "fontSize": 24, "fontWeight": 800 }
    ]
  }
  \`\`\``;

  const parsed = parseVectorComponentAiJson(aiResponse);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].variant, 'custom-vet-clinic');

  await upsertCustomComponent(parsed[0]);
  assert.ok(isKnownIllustrationVariant('custom-vet-clinic'));
  assert.ok(getEffectiveVectorCatalog().some((c) => c.variant === 'custom-vet-clinic' && c.isCustom));

  // New video transcript automatically picks up the newly registered custom component!
  const matched = resolveContextualVisualForCue('Take your cat to the pet clinic for a vet checkup');
  assert.equal(matched.variant, 'custom-vet-clinic');

  // Hide and restore a built-in component
  await deleteComponentVariant('coffee-cup', true);
  assert.ok(!getEffectiveVectorCatalog().some((c) => c.variant === 'coffee-cup'));
  await restoreBuiltInComponent('coffee-cup');
  assert.ok(getEffectiveVectorCatalog().some((c) => c.variant === 'coffee-cup'));

  // Clean up test custom state
  setCustomComponentDatabaseState({ components: [], deletedBuiltIns: [] }, { persistLocal: false });
});

test('englishReelsEngine detects reading/quiz/vocab, splits multi-exercise text, parses AI JSON, and converts to LessonProject', () => {
  assert.equal(detectReelMode('Q1. Is Tokyo the capital of Japan?\nA. True\nB. False\nAnswer: True'), 'quiz');
  assert.equal(detectReelMode('commute /kəˈmjuːt/ - đi làm hằng ngày\nexhausted /ɪɡˈzɔːstɪd/ - kiệt sức'), 'vocab');
  assert.equal(detectReelMode('Morning routines shape how focused you feel all day long.'), 'reading');

  const multiText = `Exercise 1: Vocabulary
commute /kəˈmjuːt/ - đi làm hằng ngày
deadline /ˈded.laɪn/ - hạn chót công việc

Exercise 2: Comprehension Quiz
Q1. What helps reduce stress at work?
A. Planning ahead
B. Skipping lunch
Answer: A`;
  const split = splitMultipleExercisesFromText(multiText);
  assert.equal(split.length, 2);
  assert.equal(split[0].mode, 'vocab');
  assert.equal(split[1].mode, 'quiz');

  const ruleBased = buildReelCardsRuleBased(
    'commute /kəˈmjuːt/ - đi làm\nexhausted - kiệt sức',
    { title: 'Daily Work Vocab', mode: 'vocab', targetLang: 'Tiếng Việt' },
  );
  assert.equal(ruleBased.mode, 'vocab');
  assert.ok(ruleBased.cards.some((c) => c.type === 'vocab' && c.title === 'commute'));

  const prompt = buildEnglishReelsWebAiPrompt({
    sourceText: multiText,
    sourceUrl: 'https://example.com/english-lesson',
    mode: 'auto',
    targetLang: 'Tiếng Việt',
  });
  assert.ok(prompt.includes('ĐỊNH DẠNG JSON CỐ ĐỊNH'));
  assert.ok(prompt.includes('"cards"'));

  const aiParsed = parseEnglishReelsAiJson(
    JSON.stringify({
      title: 'Coffee Shop Phrases',
      mode: 'reading',
      cards: [
        {
          type: 'intro',
          badge: 'HOOK',
          title: 'Order Coffee Naturally',
          content: 'Stop saying Give me coffee!',
          translation: 'Đừng nói cộc lốc Give me coffee!',
          ttsText: 'Stop saying Give me coffee!',
        },
        {
          type: 'vocab',
          badge: 'NATURAL',
          title: 'Could I get an iced latte?',
          content: 'Could I get an iced latte, please?',
          phonetic: '/kʊd aɪ ɡet/',
          translation: 'Cho mình một ly latte đá nhé?',
          ttsText: 'Could I get an iced latte, please?',
        },
      ],
    }),
  );
  assert.ok(aiParsed !== null);
  assert.equal(aiParsed!.cards.length, 2);

  const project = reelCardsToLessonProject(aiParsed!.cards, {
    title: aiParsed!.title,
    theme: 'pastel-sunrise',
    compositionId: 'story-scenes',
  });
  assert.equal(project.cues.length, 2);
  assert.ok(project.elements.some((e) => e.type === 'karaoke-card'));
  assert.equal(findVisualOverlaps(project.elements).length, 0);
});

test('Bootstrap & Modern CSS component variants and Visual No-Code Builder compile cleanly', () => {
  assert.ok(ALL_ILLUSTRATION_VARIANTS.includes('bs-alert-tip'));
  assert.ok(ALL_ILLUSTRATION_VARIANTS.includes('bs-card-header'));
  assert.ok(ALL_ILLUSTRATION_VARIANTS.includes('bs-progress-meter'));
  assert.ok(ALL_ILLUSTRATION_VARIANTS.includes('css-bento-stats'));
  assert.ok(ALL_ILLUSTRATION_VARIANTS.includes('css-browser-mockup'));
  assert.ok(ALL_ILLUSTRATION_VARIANTS.includes('css-flashcard-flip'));
  assert.ok(ALL_ILLUSTRATION_VARIANTS.length >= 46);

  assert.equal(
    resolveContextualVisualForCue('Apply the grammar rule formula for passive voice').variant,
    'css-grammar-equation',
  );
  assert.equal(
    resolveContextualVisualForCue('Track your fluency progress goal this month').variant,
    'bs-progress-meter',
  );
  assert.equal(
    resolveContextualVisualForCue('Reading an online article in your web browser').variant,
    'css-browser-mockup',
  );

  for (const preset of VISUAL_LAYOUT_PRESETS) {
    const cfg = createDefaultVisualBuilderConfig({
      preset: preset.id,
      badgeText: 'PRO TIP',
      headline: 'Could you pass the salt?',
      subtext: 'Polite everyday request',
    });
    const primitives = compileVisualBuilderToPrimitives(cfg);
    assert.ok(primitives.length >= 4, `Preset ${preset.id} produced too few primitives`);
    assert.ok(
      primitives.some((p) => p.shape === 'text'),
      `Preset ${preset.id} missing text primitive`,
    );
  }
});

test('sanitizeTtsSpeech strips headings, quiz metadata, IPA, emojis, and markdown while keeping clean English speech', () => {
  const dirty = 'True/False Quiz\n1. **Commute** & travel /kəˈmjuːt/ 🎯 means going to work.\nAnswer: A';
  const cleaned = sanitizeTtsSpeech(dirty);
  assert.ok(!cleaned.includes('True/False'));
  assert.ok(!cleaned.includes('/kəˈmjuːt/'));
  assert.ok(!cleaned.includes('Answer:'));
  assert.ok(!cleaned.includes('🎯'));
  assert.ok(!cleaned.includes('**'));
  assert.ok(!cleaned.includes('&'));
  assert.ok(cleaned.includes('Commute and travel'));
  assert.ok(cleaned.includes('going to work'));
});

test('English Reels Studio builds interactive 4-part lesson, preserves customized UI components & 5s quiz countdown without overlaps', () => {
  const mixedLesson = `## Hotel Check-in & Polite Requests
When checking in, polite requests sound warmer.
1. Could we have a quiet room on a higher floor?

True / False Quiz
Q1. Saying Give me the key sounds friendlier than Could I have.
(A) True
(B) False
Answer: B
Explanation: Modal verbs like Could I soften requests politely.`;

  const built = buildReelCardsRuleBased(mixedLesson, {
    title: 'Hotel Check-in & Polite Requests',
    mode: 'auto',
    targetLang: 'Tiếng Việt',
  });

  assert.ok(built.cards.some((c) => c.type === 'intro' && c.visual?.variant === 'bs-card-header'));
  assert.ok(built.cards.some((c) => c.type === 'vocab'));
  const quizCard = built.cards.find((c) => c.type === 'quiz');
  assert.ok(quizCard);
  assert.equal(quizCard!.thinkSec, 5);
  assert.ok(quizCard!.ttsAnswerText?.includes('False'));
  assert.ok(built.cards.some((c) => c.type === 'outro' && c.visual?.variant === 'css-bento-stats'));

  const prompt = buildEnglishReelsWebAiPrompt({
    sourceText: mixedLesson,
    mode: 'auto',
    targetLang: 'Tiếng Việt',
  });
  assert.ok(prompt.includes('bs-card-header'));
  assert.ok(prompt.includes('css-flashcard-flip'));
  assert.ok(prompt.includes('"thinkSec": 5'));

  const project = reelCardsToLessonProject(built.cards, {
    title: built.title,
    theme: 'pastel-sunrise',
    compositionId: 'story-scenes',
  });

  // Ensure quiz 5s countdown pills, progress meter, quiz option comparison-strip, and custom UI components are preserved!
  assert.ok(
    project.elements.some(
      (e) => e.type === 'topic-pill' && e.props.kind === 'topic-pill' && e.props.text.includes('5 GIÂY'),
    ),
  );
  assert.ok(
    project.elements.some(
      (e) =>
        e.type === 'illustration-prop' &&
        e.props.kind === 'illustration-prop' &&
        e.props.variant === 'bs-progress-meter',
    ),
  );
  assert.ok(
    project.elements.some(
      (e) =>
        e.type === 'comparison-strip' &&
        e.id.startsWith('reel-quiz-opts-') &&
        e.props.kind === 'comparison-strip' &&
        e.props.items.length >= 2,
    ),
  );
  assert.ok(
    project.elements.some(
      (e) =>
        e.type === 'illustration-prop' &&
        e.props.kind === 'illustration-prop' &&
        e.props.variant === 'bs-card-header',
    ),
  );
  assert.equal(findVisualOverlaps(project.elements).length, 0);
});

test('supports 50+ @englishpracticing168 Bootstrap/CSS variants, inline customPrimitives in scenePlanToProject, and anti-repetition prompts', () => {
  assert.ok(ALL_ILLUSTRATION_VARIANTS.includes('css-sticky-note'));
  assert.ok(ALL_ILLUSTRATION_VARIANTS.includes('bs-badge-cluster'));
  assert.ok(ALL_ILLUSTRATION_VARIANTS.includes('css-magnifying-word'));
  assert.ok(ALL_ILLUSTRATION_VARIANTS.includes('bs-modal-quiz'));
  assert.ok(ALL_ILLUSTRATION_VARIANTS.length >= 50);

  assert.equal(
    resolveContextualVisualForCue('Golden rule sticky note reminder').variant,
    'css-sticky-note',
  );
  assert.equal(
    resolveContextualVisualForCue('Learn these collocation alternatives').variant,
    'bs-badge-cluster',
  );
  assert.equal(
    resolveContextualVisualForCue('Zoom in for a closer look at the nuance').variant,
    'css-magnifying-word',
  );
  assert.equal(
    resolveContextualVisualForCue('Time for a quick check pop quiz').variant,
    'bs-modal-quiz',
  );

  // Verify inline customPrimitives in KineticSub AI JSON passes cleanly through scenePlanToProject
  const cues = parseTranscriptAuto('00:00:00.000\nCheck this custom Bootstrap badge card.');
  const customPlan = parseScenePlanJson(
    JSON.stringify({
      title: 'Custom Inline UI',
      theme: 'pastel-sunrise',
      scenes: [
        {
          id: 'sc1',
          elements: [
            {
              type: 'illustration',
              variant: 'custom-ui',
              start: '00:00:00.000',
              end: '00:00:04.000',
              y: 635,
              customPrimitives: [
                { shape: 'rect', x: -320, y: -120, w: 640, h: 240, radius: 24, fill: '#FFFFFF', shadow: true },
                { shape: 'pill', x: -110, y: -95, w: 220, h: 40, fill: '#DBEAFE' },
                { shape: 'text', x: 0, y: 15, text: 'CUSTOM BOOTSTRAP UI', fill: '#1E3A8A', fontSize: 28, fontWeight: 800 },
              ],
            },
          ],
        },
      ],
    }),
  );
  assert.ok(customPlan !== null);
  const adapted = scenePlanToProject(
    cues.flatMap((c) => c.words),
    customPlan!,
    { cuesOverride: cues },
  );
  const illus = adapted.elements.find((e) => e.props.kind === 'illustration-prop');
  assert.ok(illus && illus.props.kind === 'illustration-prop');
  assert.ok(Array.isArray(illus.props.data?.customPrimitives));
  assert.equal(illus.props.data!.customPrimitives!.length, 3);
  assert.equal(findVisualOverlaps(adapted.elements).length, 0);

  // Verify both Web AI prompts teach Bootstrap/CSS recipes, customPrimitives, and anti-repetition rules
  const studioPrompt = buildSceneGenerationPrompt(cues, {
    title: 'Custom Prompt Test',
    style: 'tiktok-cards',
    compositionId: 'ai-decide',
  });
  assert.ok(studioPrompt.includes('customPrimitives'));
  assert.ok(studioPrompt.includes('BOOTSTRAP 5 / MODERN CSS'));
  assert.ok(studioPrompt.includes('LUẬT CHỐNG ĐỤNG HÀNG'));
  assert.ok(studioPrompt.includes('css-sticky-note'));

  const reelsPrompt = buildEnglishReelsWebAiPrompt({
    sourceText: 'Practice airport phrases politely.',
    mode: 'auto',
    targetLang: 'Tiếng Việt',
  });
  assert.ok(reelsPrompt.includes('customPrimitives'));
  assert.ok(reelsPrompt.includes('BOOTSTRAP 5 / MODERN CSS'));
  assert.ok(reelsPrompt.includes('LUẬT KHÔNG ĐỤNG HÀNG'));
  assert.ok(reelsPrompt.includes('bs-badge-cluster'));
});

test('stripTimestampsFromScript removes SRT, VTT, block-timestamps, inline ranges, and JSON timestamps for clean TTS speech', () => {
  const blockTranscript = `00:00:00.000
Stop saying very tired all the time.

00:00:03.200
Instead, try saying I am exhausted.`;
  assert.equal(
    stripTimestampsFromScript(blockTranscript),
    'Stop saying very tired all the time.\nInstead, try saying I am exhausted.',
  );

  const srtTranscript = `1
00:00:00,000 --> 00:00:02,500
At the airport, keep your boarding pass ready.

2
00:00:02,600 --> 00:00:05,100
Practice speaking one natural phrase every morning.`;
  assert.equal(
    stripTimestampsFromScript(srtTranscript),
    'At the airport, keep your boarding pass ready.\nPractice speaking one natural phrase every morning.',
  );

  const vttAndInline = `WEBVTT

[00:12 - 00:15] Could I have a quiet room?
[0:16] Yes, right this way.`;
  assert.equal(
    stripTimestampsFromScript(vttAndInline),
    'Could I have a quiet room?\nYes, right this way.',
  );

  const jsonTranscript = JSON.stringify({
    segments: [
      { start: 0, end: 2, text: 'First spoken line.' },
      { start: 2.2, end: 4, text: 'Second spoken line.' },
    ],
  });
  assert.equal(
    stripTimestampsFromScript(jsonTranscript),
    'First spoken line.\nSecond spoken line.',
  );

  // Plain sentences with numbers must NOT be mangled
  const plainScript = 'Line 1 has 500 dollars at 3 PM.\nSecond line stays intact.';
  assert.equal(stripTimestampsFromScript(plainScript), plainScript);
});

test('inferSpokenLanguageFromText detects Vietnamese, Japanese, Korean, Chinese, and English', () => {
  assert.equal(inferSpokenLanguageFromText('Xin chào các bạn học tiếng Anh mỗi ngày.'), 'Vietnamese');
  assert.equal(inferSpokenLanguageFromText('このシーンを想像してみて。'), 'Japanese');
  assert.equal(inferSpokenLanguageFromText('안녕하세요 오늘 영어 표현을 배워봅시다.'), 'Korean');
  assert.equal(inferSpokenLanguageFromText('每天练习口语非常有用'), 'Chinese');
  assert.equal(inferSpokenLanguageFromText('Practice speaking one natural phrase every morning.'), 'English');
});

test('watermark & outro config is preserved in Studio 9:16 recompose and extends English Reels duration', () => {
  const wm = {
    watermarkEnabled: true,
    watermarkText: '@MyEnglishStudio',
    watermarkCorner: 'top-right' as const,
    watermarkOpacity: 0.7,
    outroSeconds: 3,
    outroLine1: 'Thanks for watching!',
    outroLine2: 'Follow for daily practice',
  };

  const withWm = { ...PRESET_JP_EN_POLITE, watermark: wm };
  const recomposed = recomposeProjectWithStyle(withWm, 'story-scenes');
  assert.deepEqual(recomposed.watermark, wm);

  const sampleCards = buildReelCardsRuleBased('Hello world.\nPractice daily.', {
    title: 'WM Reel',
    mode: 'reading',
    targetLang: 'Tiếng Việt',
  }).cards;

  const baseReel = reelCardsToLessonProject(sampleCards, {
    title: 'WM Reel',
    theme: 'pastel-sunrise',
    compositionId: 'story-scenes',
  });

  const wmReel = reelCardsToLessonProject(sampleCards, {
    title: 'WM Reel',
    theme: 'pastel-sunrise',
    compositionId: 'story-scenes',
    watermark: wm,
  });

  assert.deepEqual(wmReel.watermark, wm);
  assert.ok(Math.abs(wmReel.duration - (baseReel.duration + 3)) < 0.01);
});

test('resolveMp4EncodingParams returns even dimensions across 9:16, 16:9, 1:1, and 4:5', () => {
  const portrait = resolveMp4EncodingParams({
    aspectRatio: '9:16',
    resolution: '720p',
    quality: 'high',
    fps: 30,
  });
  assert.equal(portrait.width, 720);
  assert.equal(portrait.height, 1280);

  const landscape = resolveMp4EncodingParams({
    aspectRatio: '16:9',
    resolution: '1080p',
    quality: 'ultra',
    fps: 60,
  });
  assert.equal(landscape.width, 1920);
  assert.equal(landscape.height, 1080);
  assert.equal(landscape.fps, 60);

  const square = resolveMp4EncodingParams({
    aspectRatio: '1:1',
    resolution: '720p',
    quality: 'standard',
    fps: 24,
  });
  assert.equal(square.width, square.height);
  assert.equal(square.width % 2, 0);

  const social45 = resolveMp4EncodingParams({
    aspectRatio: '4:5',
    resolution: '720p',
    quality: 'high',
    fps: 30,
  });
  assert.equal(social45.width, 720);
  assert.equal(social45.height, 900);
});

function buildSyntheticPcmWav(sampleRate: number, durationSec: number): Buffer {
  const numSamples = Math.round(sampleRate * durationSec);
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  // Two clear speech bursts separated by silence (0.2s..1.4s and 1.8s..3.0s)
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const active = (t >= 0.2 && t <= 1.4) || (t >= 1.8 && t <= 3.0);
    const val = active ? Math.round(Math.sin(2 * Math.PI * 220 * t) * 14000) : 0;
    buf.writeInt16LE(val, 44 + i * 2);
  }
  return buf;
}

test('forcedAligner parses synthetic PCM 16-bit WAV and produces monotonic word timings inside audio duration', () => {
  const wavBuf = buildSyntheticPcmWav(16000, 3.4);
  const parsed = parseWavBufferToMonoFloat32(wavBuf);
  assert.equal(parsed.sampleRate, 16000);
  assert.equal(parsed.samples.length, Math.round(16000 * 3.4));

  const reference = 'Morning routines build focus.\nOne small step daily.';
  const aligned = alignKnownTextToPcmFloat(reference, parsed.samples, parsed.sampleRate);

  assert.equal(aligned.words.length, 8);
  assert.equal(aligned.segments.length, 2);
  assert.ok(aligned.islands.length >= 2);
  assert.ok(Math.abs(aligned.durationSec - 3.4) < 0.05);

  for (let i = 0; i < aligned.words.length; i++) {
    const w = aligned.words[i];
    assert.ok(w.end > w.start);
    assert.ok(w.end <= aligned.durationSec + 0.001);
    if (i > 0) {
      assert.ok(w.start >= aligned.words[i - 1].start);
    }
  }
});

test('readingPromptBuilder generates web-url & topic prompts and parses fenced JSON, raw JSON, and plain text', () => {
  const urlPrompt = buildReadingWebAiPrompt({
    mode: 'web-url',
    url: 'https://example.com/english-habits',
    sourceTitle: 'Daily Habits',
    sourceText: 'Start each day with ten calm minutes of English reading.',
    level: 'A2',
    wordCount: 95,
  });
  assert.ok(urlPrompt.includes('https://example.com/english-habits'));
  assert.ok(urlPrompt.includes('CEFR A2'));
  assert.ok(urlPrompt.includes('95 từ'));

  const topicPrompt = buildReadingWebAiPrompt({
    mode: 'topic',
    formatPreference: 'story',
    topic: 'Ordering coffee naturally',
    level: 'B1',
    wordCount: 120,
  });
  assert.ok(topicPrompt.includes('Ordering coffee naturally'));
  assert.ok(topicPrompt.includes('CEFR B1'));
  assert.ok(topicPrompt.includes('Short Story'));
  assert.equal(READING_FORMAT_OPTIONS.length, 7);

  const fencedJson = parseReadingWebAiResponse(
    '```json\n{"title":"Morning Focus","topicBadge":"CEFR B1","level":"B1","text":"Line one.\\nLine two."}\n```',
    'B1',
  );
  assert.ok(fencedJson !== null);
  assert.equal(fencedJson!.title, 'Morning Focus');
  assert.equal(fencedJson!.text, 'Line one.\nLine two.');

  const rawJson = parseReadingWebAiResponse(
    'Here is your passage: {"title":"Calm Brew","text":"Drink water first. Enjoy your tea."}',
    'A2',
  );
  assert.ok(rawJson !== null);
  assert.equal(rawJson!.title, 'Calm Brew');

  const plain = parseReadingWebAiResponse(
    'Cafe Etiquette\nFirst, smile and greet the barista clearly.\nNext, ask politely for your drink size.',
    'A2',
  );
  assert.ok(plain !== null);
  assert.equal(plain!.title, 'Cafe Etiquette');
  assert.ok(plain!.text.includes('barista clearly'));
});

test('eduStudioEffects provides 18 palettes, 18 book/plain frames, 20 pointer styles (incl. highlight-only), nature backgrounds/audio, non-overlapping outro metrics, and multi-page pagination', () => {
  assert.equal(READING_BOOK_PALETTES.length, 18);
  assert.ok(READING_BOOK_PALETTES.some((p) => p.id === 'Sakura Blossom'));
  assert.ok(READING_BOOK_PALETTES.some((p) => p.id === 'Ocean Wave'));
  assert.ok(READING_BOOK_PALETTES.some((p) => p.id === 'Midnight Ink' && p.isDark));

  assert.equal(READING_BOOK_FRAMES.length, 18);
  assert.ok(READING_BOOK_FRAMES.some((f) => f.id === 'plain'));
  assert.ok(READING_BOOK_FRAMES.some((f) => f.id === 'plain-ocean-float'));
  assert.ok(READING_BOOK_FRAMES.some((f) => f.id === 'plain-glass'));
  assert.ok(READING_BOOK_FRAMES.some((f) => f.id === 'plain-kinetic'));
  assert.ok(READING_BOOK_FRAMES.some((f) => f.id === 'washi-scroll'));

  assert.equal(READING_POINTER_STYLES.length, 20);
  assert.ok(READING_POINTER_STYLES.some((p) => p.id === 'none'));
  assert.ok(READING_POINTER_STYLES.some((p) => p.id === 'calligraphy-brush'));
  assert.ok(READING_POINTER_STYLES.some((p) => p.id === 'water-drop'));

  assert.ok(BACKGROUND_PRESETS.length >= 12);
  assert.ok(BACKGROUND_PRESETS.some((b) => b.id === 'ocean-shore-waves' && Boolean(b.assetUrl)));
  assert.ok(STUDIO_BGM_PRESETS.length >= 10);
  assert.ok(STUDIO_BGM_PRESETS.some((a) => a.id === 'ocean-waves'));

  const words = [
    { word: 'Practice', start: 0.2, end: 1.1 },
    { word: 'every', start: 1.2, end: 2.3 },
    { word: 'day', start: 2.4, end: 8.6 },
  ];
  const metrics = computeReadingTimelineMetrics({
    words,
    contentDuration: 7.0,
    totalDuration: 10.0,
    outroSeconds: 3,
    outroText: 'Thanks for watching!\nFollow for more',
  });
  assert.equal(metrics.hasOutro, true);
  assert.equal(metrics.lastWordEnd, 8.6);
  assert.ok(metrics.outroStart >= metrics.lastWordEnd);
  assert.ok(metrics.effectiveTotalDuration >= metrics.outroStart + 3);

  const manyWords = Array.from({ length: 48 }, (_, i) => ({
    word: `word${i + 1}`,
    start: i * 0.4,
    end: (i + 1) * 0.4,
  }));
  const pages = paginateReadingWords(
    manyWords,
    (w) => w.length * 14,
    {
      startX: 40,
      maxW: 260,
      startY: 100,
      maxY: 220,
      lineHeight: 36,
      wordGap: 10,
    },
  );
  assert.ok(pages.length >= 2);
  assert.equal(pages.flat().length, manyWords.length);
});

test('illustrationLayouts produces distinct built-in presets and applies custom Kho Component compositions without overlaps', () => {
  const flowProj = recomposeProjectWithStyle(PRESET_JP_EN_POLITE, 'flow-steps');
  const gaugeProj = recomposeProjectWithStyle(PRESET_JP_EN_POLITE, 'gauge-tone');
  const checklistProj = recomposeProjectWithStyle(PRESET_JP_EN_POLITE, 'checklist-cards');

  const flowVariant = flowProj.elements.find((e) => e.props.kind === 'illustration-prop');
  const gaugeVariant = gaugeProj.elements.find((e) => e.props.kind === 'illustration-prop');
  const checklistVariant = checklistProj.elements.find((e) => e.props.kind === 'illustration-prop');

  assert.ok(flowVariant?.props.kind === 'illustration-prop');
  assert.ok(gaugeVariant?.props.kind === 'illustration-prop');
  assert.ok(checklistVariant?.props.kind === 'illustration-prop');
  assert.notEqual(flowVariant.props.variant, gaugeVariant.props.variant);
  assert.notEqual(gaugeVariant.props.variant, checklistVariant.props.variant);
  assert.notEqual(flowProj.theme, gaugeProj.theme);

  const customCfg = {
    variant: 'css-sticky-note' as const,
    sceneIcon: 'sparkles' as const,
    title: 'Pro Phrasing Tip',
    subtitle: 'Polite everyday English',
    speechText: 'Could I possibly grab an iced latte?',
    labels: ['Polite', 'Natural', 'Warm'],
    highlightWord: 'possibly',
    accentColor: '#4F46E5',
    showStrip: true,
    showSentenceCard: true,
    showToneMeter: false,
  };

  const allCustom = applyCustomComponentComposition(PRESET_JP_EN_POLITE, customCfg, {
    scope: 'all',
  });
  assert.equal(allCustom.compositionId, 'custom');
  const allIlls = allCustom.elements.filter((e) => e.props.kind === 'illustration-prop');
  assert.ok(allIlls.length >= 1);
  assert.ok(
    allIlls.every(
      (el) =>
        el.props.kind === 'illustration-prop' &&
        el.props.variant === 'css-sticky-note' &&
        el.props.data?.title === 'Pro Phrasing Tip',
    ),
  );
  assert.equal(findVisualOverlaps(allCustom.elements).length, 0);

  const activeCustom = applyCustomComponentComposition(
    flowProj,
    { ...customCfg, variant: 'bs-alert-tip', title: 'Single Cue Override' },
    { scope: 'active-cue', activeTimeSec: 1.5 },
  );
  assert.equal(activeCustom.compositionId, 'custom');
  assert.ok(
    activeCustom.elements.some(
      (e) => e.props.kind === 'illustration-prop' && e.props.variant === 'bs-alert-tip',
    ),
  );
  assert.equal(findVisualOverlaps(activeCustom.elements).length, 0);

  const customPrompt = buildSceneGenerationPrompt(PRESET_JP_EN_POLITE.cues, {
    title: 'Custom Composition Prompt',
    style: 'tiktok-cards',
    compositionId: 'custom',
    customConfig: customCfg,
  });
  assert.ok(customPrompt.includes('css-sticky-note'));
  assert.ok(customPrompt.includes('Pro Phrasing Tip'));
});

test('worksheet cleanup, English Reels Intro/Outro/Quiz context, and Reading Along Intro timeline have zero overlaps', () => {
  const sampleWorksheet = `## Practice Reading English Exercises for Beginner – Plans
English Reading Exercises for Beginner
## Exercise 1
Outside the COMFORT ZONE
In this exciting new TV programme, ten people go and live in the mountains for ten days.
Every day they do something difficult and sometimes dangerous.
They need to stay safe and comfortable (if possible!), but it’s not easy.
The two people who do the best win a prize of £25,000!
It’s Day 5 on Outside the comfort zone and everyone is thinking about the first thing they’re going to do after the programme finishes.
I’m going to eat a big meal of steak and chips.
I’m going to have a long hot bath.

True / False Quiz
1. Ten people live in the mountains for ten days.
(A) True
(B) False
Answer: (A) The passage says ten people go and live in the mountains for ten days.`;

  const cleaned = cleanReadingWorksheetInput(sampleWorksheet);
  assert.equal(cleaned.title, 'Outside the COMFORT ZONE');
  assert.ok(!cleaned.bodyText.includes('Practice Reading English Exercises'));
  assert.ok(!cleaned.bodyText.includes('Exercise 1'));
  assert.ok(cleaned.bodyText.includes('In this exciting new TV programme'));

  const reels = buildReelCardsRuleBased(sampleWorksheet);
  assert.equal(reels.title, 'Outside the COMFORT ZONE');
  assert.equal(reels.cards[0].type, 'intro');
  assert.ok(reels.cards[0].content.includes('Hôm nay học gì?'));
  assert.ok(reels.cards[reels.cards.length - 1].type === 'outro');

  for (const card of reels.cards) {
    assert.ok(!card.content.includes('Practice Reading English Exercises'));
    assert.ok(!card.content.includes('## Exercise 1'));
    assert.ok(!card.ttsText.includes('Practice Reading English Exercises'));
    assert.ok(!card.ttsText.includes('Exercise 1'));
    assert.equal(card.phonetic, undefined);
  }

  const vocabCards = reels.cards.filter((c) => c.type === 'vocab');
  assert.ok(vocabCards.length >= 3);
  assert.ok(vocabCards.some((c) => Boolean(c.translation || c.grammarNote)));

  const quizCards = reels.cards.filter((c) => c.type === 'quiz');
  assert.equal(quizCards.length, 1);
  assert.ok(quizCards[0].contextExcerpt && quizCards[0].contextExcerpt.includes('In this exciting new TV programme'));

  const quizSpeech = getQuizCardSpeechParts(quizCards[0], 1);
  assert.ok(quizSpeech.questionSpeech.toLowerCase().includes('question'));
  assert.ok(quizSpeech.thinkSec >= 5);
  assert.ok(quizSpeech.answerSpeech.toLowerCase().includes('correct answer'));

  const proj = reelCardsToLessonProject(reels.cards, { title: reels.title });
  assert.equal(findVisualOverlaps(proj.elements).length, 0);

  // Reading Along Intro shifting + Outro spacing
  const shifted = shiftReadingWordsForIntro(
    [
      { word: 'In', start: 0.1, end: 0.4 },
      { word: 'this', start: 0.5, end: 0.9 },
    ],
    3.4,
  );
  assert.equal(shifted[0].start, 3.5);
  assert.equal(shifted[1].end, 4.3);

  const metrics = computeReadingTimelineMetrics({
    words: shifted,
    contentDuration: 5.0,
    introEnabled: true,
    introSeconds: 3.4,
    outroSeconds: 3.5,
    outroText: 'Thanks for watching!\nSee you next time',
  });
  assert.equal(metrics.hasIntro, true);
  assert.equal(metrics.introEnd, 3.4);
  assert.ok(metrics.outroStart >= metrics.lastWordEnd);
  assert.ok(metrics.effectiveTotalDuration >= metrics.outroStart + 3.5);
});

test('audioMixHelper ducks BGM during speech, boosts during outro tail, and writes valid RIFF WAV headers', () => {
  const baseVol = 0.2;
  const duringSpeech = computeDuckingGainAtTime({
    timeSec: 2.0,
    speechWindows: [{ start: 1.0, end: 4.0 }],
    baseVolume: baseVol,
    outroStartSec: 8.0,
    totalDurationSec: 12.0,
  });
  const inOutroTail = computeDuckingGainAtTime({
    timeSec: 9.5,
    speechWindows: [{ start: 1.0, end: 4.0 }],
    baseVolume: baseVol,
    outroStartSec: 8.0,
    totalDurationSec: 12.0,
  });
  const fadeOutEdge = computeDuckingGainAtTime({
    timeSec: 11.9,
    speechWindows: [{ start: 1.0, end: 4.0 }],
    baseVolume: baseVol,
    outroStartSec: 8.0,
    totalDurationSec: 12.0,
  });

  assert.ok(duringSpeech < baseVol * 0.55);
  assert.ok(inOutroTail > duringSpeech * 2);
  assert.ok(fadeOutEdge < inOutroTail * 0.35);

  const left = new Float32Array([0, 0.25, -0.25, 0.5]);
  const right = new Float32Array([0, -0.25, 0.25, -0.5]);
  const wav = encodeStereoFloatChannelsToWavArrayBuffer(left, right, 48000);
  assert.equal(wav.byteLength, 44 + 4 * 4);
  const bytes = new Uint8Array(wav);
  assert.equal(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]), 'RIFF');
  assert.equal(String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]), 'WAVE');
});

test('English Reels supports targetLang localization, full untruncated quiz text, composition switching, backgroundImage, and mobile typography prompt rules', () => {
  const sampleLesson = `## New Year, New Me
Matt wants to make big changes in his life this year. He wrote down a list of resolutions to buy fewer clothes, save money, and travel worldwide.

True / False Quiz
Q1. Why did Matt write a list of plans?
(A) Because he forgot everything last year.
(B) He has a list of plans and intends to do them.
Answer: B
Explanation: Matt wrote resolutions and intends to follow through with every single plan.`;

  // 1. Japanese targetLang: zero Vietnamese stage chrome leaks & full option text preserved
  const jaReels = buildReelCardsRuleBased(sampleLesson, {
    title: 'New Year, New Me',
    mode: 'auto',
    targetLang: '日本語',
  });
  assert.ok(jaReels.cards[0].content.includes('今日のテーマ:'));
  const jaProject = reelCardsToLessonProject(jaReels.cards, {
    title: 'New Year, New Me',
    targetLang: '日本語',
    backgroundImage: {
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
      fit: 'cover',
      scrimOpacity: 0.25,
      fileName: 'bg.png',
    },
  });
  assert.equal(jaProject.backgroundImage?.fileName, 'bg.png');
  assert.equal(findVisualOverlaps(jaProject.elements).length, 0);

  const jaTextAll = jaProject.elements
    .map((el) => {
      if (el.props.kind === 'topic-pill') return el.props.text;
      if (el.props.kind === 'comparison-strip') return el.props.items.map((i) => `${i.label} ${i.sublabel || ''}`).join(' ');
      if (el.props.kind === 'sentence-card') return `${el.props.text} ${el.props.subtext || ''}`;
      if (el.props.kind === 'illustration-prop') return `${el.props.data?.title || ''} ${el.props.data?.formula || ''} ${el.props.data?.highlightWord || ''}`;
      return '';
    })
    .join(' ');
  assert.ok(!jaTextAll.includes('Mở bài'));
  assert.ok(!jaTextAll.includes('ĐÁP ÁN ĐÚNG'));
  assert.ok(!jaTextAll.includes('ĐANG ĐỌC'));
  assert.ok(jaTextAll.includes('He has a list of plans and intends to do them.'));

  // 2. English targetLang check + prompt typography check
  const enPrompt = buildEnglishReelsWebAiPrompt({
    sourceText: sampleLesson,
    title: 'New Year, New Me',
    mode: 'auto',
    targetLang: 'English',
  });
  assert.ok(enPrompt.includes('TYPOGRAPHY & MOBILE READABILITY'));
  assert.ok(!enPrompt.includes('1. Mở bài'));

  const enReels = buildReelCardsRuleBased(sampleLesson, {
    title: 'New Year, New Me',
    mode: 'auto',
    targetLang: 'English',
  });
  const enProject = reelCardsToLessonProject(enReels.cards, {
    title: 'New Year, New Me',
    targetLang: 'English',
    compositionId: '3d-shapes',
  });
  assert.equal(enProject.compositionId, '3d-shapes');
  assert.ok(enProject.elements.some((el) => el.type === 'shape-3d'));
  assert.equal(findVisualOverlaps(enProject.elements).length, 0);

  // 3. Switching to word-reveal transforms layout visibly
  const wordRevealProj = reelCardsToLessonProject(enReels.cards, {
    title: 'New Year, New Me',
    targetLang: 'English',
    compositionId: 'word-reveal',
  });
  assert.equal(wordRevealProj.compositionId, 'word-reveal');
  assert.ok(!wordRevealProj.elements.some((el) => el.id.startsWith('reel-prop-')));
  assert.ok(wordRevealProj.elements.some((el) => el.id.startsWith('reel-card-') && el.type === 'sentence-card'));
  assert.equal(findVisualOverlaps(wordRevealProj.elements).length, 0);

  // 4. Custom composition AI prompt without manual labels does NOT leak Step 1/2/3
  const aiCustomPrompt = buildSceneGenerationPrompt(PRESET_JP_EN_POLITE.cues, {
    title: 'AI Autonomous Custom',
    style: 'tiktok-cards',
    compositionId: 'custom',
    customConfig: {
      variant: 'css-sticky-note',
      sceneIcon: 'sparkles',
      title: '',
      subtitle: '',
      speechText: '',
      labels: [],
      highlightWord: '',
      accentColor: '#4F46E5',
      showStrip: true,
      showToneMeter: false,
      showSentenceCard: true,
    },
  });
  assert.ok(aiCustomPrompt.includes('TYPOGRAPHY & MOBILE READABILITY'));
  assert.ok(!aiCustomPrompt.includes('nhãn gợi ý (`labels`):'));
  assert.ok(aiCustomPrompt.includes('BẮT BUỘC SÁT NGỮ CẢNH'));
  assert.ok(aiCustomPrompt.includes('AI LÀ NGƯỜI SÁNG TẠO CHÍNH'));
});

test('outputNaming cleans underscores, dates, timestamps, and routes tabs into subfolders inside output/', () => {
  assert.equal(
    cleanOutputTitleStem('2026-11-24_Hotel_Check-in_720p_ab12.mp4'),
    'Hotel Check-in',
  );
  assert.equal(
    cleanOutputTitleStem('Quiz_5s_Daily_Routine_1732440000000_reels_mp4'),
    'Quiz 5s Daily Routine',
  );
  assert.equal(
    cleanDownloadFileName('20261124_Can_Could_May_1080p', 'mp4'),
    'Can Could May.mp4',
  );
  assert.equal(
    cleanDownloadFileName('', 'srt', 'Fallback Title'),
    'Fallback Title.srt',
  );

  assert.equal(resolveTabOutputSubfolder('Studio 9:16'), TAB_OUTPUT_SUBFOLDERS.studio);
  assert.equal(resolveTabOutputSubfolder('English Reels'), TAB_OUTPUT_SUBFOLDERS.reels);
  assert.equal(resolveTabOutputSubfolder('Edu Merge'), TAB_OUTPUT_SUBFOLDERS.merge);
  assert.equal(resolveTabOutputSubfolder('Edu Karaoke'), TAB_OUTPUT_SUBFOLDERS.karaoke);
  assert.equal(resolveTabOutputSubfolder('Reading Along'), TAB_OUTPUT_SUBFOLDERS.reading);
  assert.equal(resolveTabOutputSubfolder('Batch'), TAB_OUTPUT_SUBFOLDERS.batch);
  assert.equal(
    resolveTabOutputSubfolder('English Reels', 'output/output/Custom Folder'),
    'output/Custom Folder',
  );
});

test('shiftCuesAndWords, adjustCuesTiming, and resyncProjectTimingToCues adjust timing while preserving backgroundImage', () => {
  const baseCues = PRESET_JP_EN_POLITE.cues.slice(0, 2).map((cue) => ({
    ...cue,
    words: (cue.words || []).map((w) => ({ ...w })),
  }));

  const shifted = shiftCuesAndWords(baseCues, 200);
  assert.ok(Math.abs(shifted[0].start - (baseCues[0].start + 0.2)) < 0.001);
  assert.ok(Math.abs(shifted[0].end - (baseCues[0].end + 0.2)) < 0.001);
  if (shifted[0].words && baseCues[0].words) {
    assert.ok(Math.abs(shifted[0].words[0].start - (baseCues[0].words[0].start + 0.2)) < 0.001);
  }

  const clampedNegative = shiftCuesAndWords(baseCues, -10000);
  assert.equal(clampedNegative[0].start, 0);
  assert.ok(clampedNegative[0].end > clampedNegative[0].start);

  const fitted = adjustCuesTiming(baseCues, { targetDurationSec: 10 });
  assert.ok(Math.abs(fitted[fitted.length - 1].end - 10) < 0.02);
  for (const cue of fitted) {
    assert.ok(cue.end > cue.start);
    if (cue.words) {
      for (let i = 0; i < cue.words.length; i += 1) {
        assert.ok(cue.words[i].end >= cue.words[i].start);
        if (i > 0) {
          assert.ok(cue.words[i].start >= cue.words[i - 1].start);
        }
      }
    }
  }

  const projectWithBg = {
    ...PRESET_JP_EN_POLITE,
    backgroundImage: {
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
      fit: 'cover' as const,
      scrimOpacity: 0.25,
      fileName: 'preserved.png',
    },
  };
  const updatedCues = adjustCuesTiming(PRESET_JP_EN_POLITE.cues, { speedFactor: 1.25 });
  const resynced = resyncProjectTimingToCues(projectWithBg, updatedCues, { resyncVisuals: true });
  assert.equal(resynced.backgroundImage?.fileName, 'preserved.png');
  const lastCueEnd = updatedCues[updatedCues.length - 1].end;
  assert.ok(resynced.duration >= lastCueEnd);
  assert.ok(Math.abs(resynced.duration - (lastCueEnd + 0.35)) < 0.8);
  const karaokeEl = resynced.elements.find((el) => el.type === 'karaoke-card');
  assert.ok(karaokeEl && karaokeEl.props.kind === 'karaoke-card');
  if (karaokeEl && karaokeEl.props.kind === 'karaoke-card') {
    assert.ok(Math.abs(karaokeEl.startTime - updatedCues[0].start) < 0.01);
    assert.ok(Math.abs(karaokeEl.endTime - updatedCues[0].end) < 0.01);
    assert.equal(karaokeEl.props.words?.length ?? 0, updatedCues[0].words?.length ?? 0);
  }
});

test('computeStaggerItemState reveals staggered children smoothly without negative progress', () => {
  const before = computeStaggerItemState(0.05, 2, 0.08, 0.36);
  assert.equal(before.opacity, 0);
  assert.ok(before.translateY > 0);
  assert.ok(before.scale < 1);

  const mid = computeStaggerItemState(0.30, 1, 0.08, 0.36);
  assert.ok(mid.opacity > 0 && mid.opacity < 1);
  assert.ok(mid.progress > 0 && mid.progress < 1);

  const done = computeStaggerItemState(1.2, 2, 0.08, 0.36);
  assert.equal(done.opacity, 1);
  assert.equal(done.translateY, 0);
  assert.equal(done.scale, 1);
});

test('Storyboard v1.9 prompt preserves verbatim source_segments, audioDurationSec gap, and 5-stage schema rules', () => {
  const cues = [
    { id: 'c1', start: 0.0, end: 3.4, text: '"I\'m looking," he says,', words: [] },
    { id: 'c2', start: 3.5, end: 7.2, text: 'because the bright light was glowing.', words: [] },
    { id: 'c3', start: 134.0, end: 138.264, text: 'And that is why careful observation matters.', words: [] },
  ];

  const prompt = buildSceneGenerationPrompt(cues, {
    title: 'Observation Story',
    style: 'tiktok-cards',
    compositionId: 'ai-decide',
    audioDurationSec: 140.9,
  });

  assert.ok(prompt.includes('"schema_version": "1.9"'));
  assert.ok(prompt.includes('"source_segments"'));
  assert.ok(prompt.includes('\\"I\'m looking,\\" he says,'));
  assert.ok(prompt.includes('140.90s'));
  assert.ok(prompt.includes('138.26s'));
  assert.ok(prompt.includes('sync_anchor'));
  assert.ok(prompt.includes('tuyệt đối KHÔNG tự bịa tên'));

  const segments = buildSourceSegmentsFromCues(cues);
  assert.equal(segments.length, 3);
  assert.equal(segments[0].segment_id, 'seg_001');
  assert.equal(segments[0].text, '"I\'m looking," he says,');
});

test('validateStoryboardDocument catches semantic errors and approves clean multi-scene v1.9 JSON', () => {
  const cues = [
    { id: 'c1', start: 0.0, end: 4.0, text: '"I\'m looking," he says, under the bright lamp.', words: [] },
    { id: 'c2', start: 4.2, end: 8.5, text: 'First compare option A with option B carefully.', words: [] },
    { id: 'c3', start: 8.7, end: 12.8, text: 'Finally, confirm the step on the right.', words: [] },
  ];

  const validDoc = {
    schema_version: '1.9',
    title: 'Multi-Scene Lesson',
    theme: 'studio-slate',
    compositionId: 'story-scenes',
    compositionReason: 'Narrative story with comparison',
    style_profile: {
      palette: 'studio-slate',
      primaryAccent: '#4F46E5',
    },
    source_segments: buildSourceSegmentsFromCues(cues),
    scenes: [
      {
        scene_id: 'sc_01',
        title: 'Scene 1',
        learning_objective: 'Introduce dialogue context',
        elements: [
          {
            element_id: 'el_01',
            kind: 'text',
            role: 'quote_card',
            content: '"I\'m looking," he says, under the bright lamp.',
            sync_anchor: {
              segment_id: 'seg_001',
              anchor_type: 'full_segment',
              quote: '"I\'m looking," he says,',
            },
            position: { x: 0.08, y: 0.14, width: 0.84, height: 0.14 },
          },
          {
            element_id: 'el_02',
            kind: 'illustration',
            role: 'visual',
            variant: 'css-sticky-note',
            sceneIcon: 'lightning',
            sync_anchor: {
              segment_id: 'seg_001',
              anchor_type: 'phrase',
              quote: 'under the bright lamp',
            },
            position: { x: 0.12, y: 0.34, width: 0.76, height: 0.24 },
          },
        ],
      },
      {
        scene_id: 'sc_02',
        title: 'Scene 2',
        learning_objective: 'Compare options visually',
        elements: [
          {
            element_id: 'el_03',
            kind: 'object',
            role: 'subject',
            object_spec: { label: 'Option A', icon: 'book' },
            sync_anchor: {
              segment_id: 'seg_002',
              anchor_type: 'segment_start',
              quote: 'First compare option A',
            },
            position: { x: 0.08, y: 0.22, width: 0.36, height: 0.22 },
          },
          {
            element_id: 'el_04',
            kind: 'connector',
            role: 'relation',
            connector_spec: { from: 'el_03', to: 'el_05', direction: 'right', label: 'vs', arrow: true },
            sync_anchor: {
              segment_id: 'seg_002',
              anchor_type: 'phrase',
              quote: 'with option B',
            },
            position: { x: 0.45, y: 0.28, width: 0.1, height: 0.1 },
          },
          {
            element_id: 'el_05',
            kind: 'object',
            role: 'target',
            object_spec: { label: 'Option B', icon: 'scale' },
            sync_anchor: {
              segment_id: 'seg_003',
              anchor_type: 'full_segment',
              quote: 'confirm the step',
            },
            position: { x: 0.56, y: 0.22, width: 0.36, height: 0.22 },
          },
        ],
      },
    ],
  };

  const cleanReport = validateStoryboardDocument(validDoc, cues, { audioDurationSec: 13.0 });
  assert.deepEqual(cleanReport.errors, []);
  assert.deepEqual(cleanReport.warnings, []);
  assert.equal(cleanReport.valid, true);
  assert.equal(cleanReport.schemaVersion, '1.9');

  // Now construct a broken doc with every semantic bug
  const brokenDoc = {
    schema_version: '1.9',
    source_segments: [
      { segment_id: 'seg_001', start: 0, end: 4, text: 'I\'m looking he says' }, // drifted punctuation
      { segment_id: 'seg_001', start: 4.2, end: 8.5, text: 'Duplicate segment ID' }, // duplicate ID
    ],
    scenes: [
      {
        scene_id: 'sc_01',
        elements: [
          {
            element_id: 'el_dup',
            kind: 'text',
            content: 'Bad quote and karaoke zone breach',
            sync_anchor: {
              segment_id: 'seg_001',
              anchor_type: 'phrase',
              quote: 'completely fabricated quote',
            },
            position: { x: 0.08, y: 0.72, width: 0.84, height: 0.16 }, // 0.88 > 0.76 karaoke zone
          },
          {
            element_id: 'el_dup', // duplicate element ID
            kind: 'illustration',
            sceneIcon: 'tree', // unsupported icon
            sync_anchor: {
              segment_id: 'seg_999', // missing segment
              anchor_type: 'segment_start',
            },
            position: { x: 0.10, y: 0.72, width: 0.70, height: 0.14 }, // overlaps el_dup
          },
        ],
      },
    ],
  };

  const brokenReport = validateStoryboardDocument(brokenDoc, cues, { audioDurationSec: 15.0 });
  assert.equal(brokenReport.valid, false);
  const errorCodes = new Set(brokenReport.errors.map((e) => e.code));
  const warningCodes = new Set(brokenReport.warnings.map((w) => w.code));
  assert.ok(errorCodes.has('DUPLICATE_SEGMENT_ID'));
  assert.ok(errorCodes.has('DUPLICATE_ELEMENT_ID'));
  assert.ok(errorCodes.has('MISSING_SYNC_SEGMENT'));
  assert.ok(errorCodes.has('SYNC_ANCHOR_QUOTE_MISMATCH'));
  assert.ok(errorCodes.has('INVALID_SCENE_ICON'));
  assert.ok(errorCodes.has('KARAOKE_ZONE_VIOLATION'));
  assert.ok(errorCodes.has('ELEMENT_SPATIAL_OVERLAP'));
  assert.ok(warningCodes.has('TRANSCRIPT_NOT_VERBATIM'));
  assert.ok(warningCodes.has('AUDIO_TAIL_GAP'));
});

test('scenePlanToProject converts multi-scene v1.9 JSON with sync_anchor phrase timing, normalized top-left geometry, object/connector, and Python support', () => {
  const cues = [
    {
      id: 'c1',
      start: 0.0,
      end: 4.0,
      text: '"I\'m looking," he says, under the lamp.',
      words: [
        { word: '"I\'m', start: 0.0, end: 0.5 },
        { word: 'looking,"', start: 0.55, end: 1.1 },
        { word: 'he', start: 1.15, end: 1.4 },
        { word: 'says,', start: 1.45, end: 1.9 },
        { word: 'under', start: 2.0, end: 2.4 },
        { word: 'the', start: 2.45, end: 2.7 },
        { word: 'lamp.', start: 2.75, end: 3.9 },
      ],
    },
    { id: 'c2', start: 4.2, end: 8.4, text: 'Compare option A with option B.', words: [] },
  ];

  // Test phrase-level word snapping
  const phraseResolved = resolveSyncAnchorTiming(
    { segment_id: 'seg_001', anchor_type: 'phrase', quote: 'under the lamp' },
    { segment_id: 'seg_001', start: 0.0, end: 4.0, text: cues[0].text },
    cues,
    0.0,
    4.0,
    1.5,
  );
  assert.ok(Math.abs(phraseResolved.startTime - 2.0) < 0.05);
  assert.ok(Math.abs(phraseResolved.endTime - 3.9) < 0.05);

  // Test invalid icon alias fallback
  const alias = normalizeSceneIconWithAlias('lightbulb');
  assert.equal(alias.icon, 'lightning');

  const v19Plan = {
    schema_version: '1.9',
    title: 'v1.9 Lesson',
    theme: 'studio-slate',
    compositionId: 'story-scenes',
    source_segments: buildSourceSegmentsFromCues(cues),
    scenes: [
      {
        scene_id: 'sc_01',
        title: 'Intro',
        elements: [
          {
            element_id: 'el_title',
            kind: 'pill',
            content: 'DIALOGUE',
            sync_anchor: { segment_id: 'seg_001', anchor_type: 'segment_start', quote: '"I\'m looking,"' },
            position: { x: 0.30, y: 0.06, width: 0.40, height: 0.05 },
          },
          {
            element_id: 'el_lamp',
            kind: 'illustration',
            sceneIcon: 'lightbulb',
            variant: 'css-sticky-note',
            title: 'Under the lamp',
            sync_anchor: { segment_id: 'seg_001', anchor_type: 'phrase', quote: 'under the lamp' },
            position: { x: 0.10, y: 0.20, width: 0.80, height: 0.28 },
          },
        ],
      },
      {
        scene_id: 'sc_02',
        title: 'Compare',
        elements: [
          {
            element_id: 'el_obj_a',
            kind: 'object',
            object_spec: { label: 'Option A', icon: 'book' },
            sync_anchor: { segment_id: 'seg_002', anchor_type: 'segment_start', quote: 'Option A' },
            position: { x: 0.08, y: 0.22, width: 0.36, height: 0.20 },
          },
          {
            element_id: 'el_conn',
            kind: 'connector',
            connector_spec: { from: 'el_obj_a', to: 'el_obj_b', direction: 'right', label: 'vs', arrow: true },
            sync_anchor: { segment_id: 'seg_002', anchor_type: 'full_segment' },
            position: { x: 0.45, y: 0.27, width: 0.10, height: 0.10 },
          },
          {
            element_id: 'el_obj_b',
            kind: 'object',
            object_spec: { label: 'Option B', icon: 'check' },
            sync_anchor: { segment_id: 'seg_002', anchor_type: 'phrase', quote: 'option B' },
            position: { x: 0.56, y: 0.22, width: 0.36, height: 0.20 },
          },
        ],
      },
    ],
  };

  const parsed = parseScenePlanJson(JSON.stringify(v19Plan));
  assert.ok(parsed);
  const summary = summarizeScenePlan(parsed!, cues);
  assert.equal(summary.schemaVersion, '1.9');
  assert.equal(summary.sceneCount, 2);
  assert.equal(summary.sourceSegmentCount, 2);
  assert.equal(summary.elementCount, 5);

  const project = scenePlanToProject([], parsed!, { title: 'v1.9 Test', cuesOverride: cues });
  assert.equal(findVisualOverlaps(project.elements).length, 0);

  const lampEl = project.elements.find((e) => e.id.includes('el_lamp'));
  assert.ok(lampEl && lampEl.props.kind === 'illustration-prop');
  assert.ok(Math.abs(lampEl!.startTime - 2.0) < 0.05);
  assert.equal(lampEl!.props.kind === 'illustration-prop' ? lampEl!.props.data?.sceneIcon : '', 'lightning');

  const connEl = project.elements.find((e) => e.id.includes('el_conn'));
  assert.ok(connEl && connEl.props.kind === 'illustration-prop');
  assert.ok((connEl!.props.kind === 'illustration-prop' ? connEl!.props.data?.customPrimitives?.length ?? 0 : 0) >= 2);

  // Center check for el_obj_a: x=0.08, width=0.36 => centerX = (0.08 + 0.18)*1080 = 280.8
  const objA = project.elements.find((e) => e.id.includes('el_obj_a'));
  assert.ok(objA && Math.abs(objA.layout.x - 280.8) < 40);

  // Python generator supports v1.9 scene_id / source_segments / sync_anchor
  const pyFiles = generatePythonProjectFiles(project);
  const timelinePy = pyFiles['timeline.py'] || '';
  const loaderPy = pyFiles['loader.py'] || '';
  assert.ok(timelinePy.includes('source_segments'));
  assert.ok(timelinePy.includes('sync_anchor'));
  assert.ok(loaderPy.includes("scene.get('scene_id'"));
});

test('Storyboard v1.9 preserves animation.duration_s transition without truncating component visibility, enriches bare-text scenes, and clamps canvas bounds', () => {
  const cues = [
    { id: 'c1', start: 0.0, end: 4.5, text: 'First compare polite requests at the airport gate.', words: [] },
    { id: 'c2', start: 4.7, end: 9.0, text: 'Always double check your boarding pass before boarding.', words: [] },
  ];

  // 1. animation.duration_s: 0.35 must NOT truncate pill/strip/illustration/object to 0.6s-1.2s
  const docWithAnimDur = {
    schema_version: '1.9',
    title: 'Transition Duration Regression',
    theme: 'pastel-sunrise',
    compositionId: 'story-scenes',
    source_segments: buildSourceSegmentsFromCues(cues),
    scenes: [
      {
        scene_id: 'sc_01',
        title: 'Scene 1',
        elements: [
          {
            element_id: 'el_strip',
            kind: 'strip',
            role: 'comparison_header',
            items: [{ label: 'Basic' }, { label: 'Natural' }],
            sync_anchor: { segment_id: 'seg_001', anchor_type: 'segment_start', quote: 'First compare' },
            position: { x: 0.08, y: 0.06, width: 0.84, height: 0.07 },
            animation: { in: 'drop-in', out: 'fade-out', duration_s: 0.35 },
          },
          {
            element_id: 'el_pill',
            kind: 'pill',
            role: 'scene_title',
            content: 'AIRPORT POLITE REQUESTS',
            sync_anchor: { segment_id: 'seg_001', anchor_type: 'segment_start', quote: 'First compare' },
            position: { x: 0.20, y: 0.145, width: 0.60, height: 0.05 },
            animation: { in: 'pop-up', out: 'fade-out', duration_s: 0.35 },
          },
          {
            element_id: 'el_ill',
            kind: 'illustration',
            variant: 'bs-card-header',
            title: 'Boarding Gate Check',
            sync_anchor: { segment_id: 'seg_001', anchor_type: 'phrase', quote: 'airport gate' },
            position: { x: 0.01, y: 0.22, width: 0.42, height: 0.20 },
            animation: { in: 'fade-scale', out: 'fade-out', duration_s: 0.35 },
          },
        ],
      },
      {
        // Text-only scene should be enriched with a contextual illustration-prop automatically
        scene_id: 'sc_02',
        title: 'Bare Text Scene',
        elements: [
          {
            element_id: 'el_txt_only',
            kind: 'text',
            role: 'example_sentence',
            content: 'Always double check your boarding pass before boarding.',
            sync_anchor: { segment_id: 'seg_002', anchor_type: 'full_segment', quote: 'boarding pass' },
            position: { x: 0.72, y: 0.48, width: 0.40, height: 0.16 },
          },
        ],
      },
    ],
  };

  const parsed = parseScenePlanJson(JSON.stringify(docWithAnimDur));
  assert.ok(parsed);
  const project = scenePlanToProject([], parsed!, { cuesOverride: cues });

  const stripEl = project.elements.find((e) => e.id === 'el_strip');
  const pillEl = project.elements.find((e) => e.id === 'el_pill');
  const illEl = project.elements.find((e) => e.id === 'el_ill');
  const txtEl = project.elements.find((e) => e.id === 'el_txt_only');
  const enrichedEl = project.elements.find((e) => e.id.startsWith('auto-enrich-prop-'));

  assert.ok(stripEl && stripEl.endTime - stripEl.startTime >= 4.0, 'strip should hold across scene');
  assert.ok(pillEl && pillEl.endTime - pillEl.startTime >= 2.2, 'pill should not flash for 0.6s');
  assert.ok(
    illEl && illEl.endTime >= 4.45 && illEl.endTime - illEl.startTime >= 1.0,
    'illustration should hold through end of segment without flashing',
  );
  assert.ok(enrichedEl && enrichedEl.props.kind === 'illustration-prop', 'bare-text cue should receive contextual illustration');

  // Horizontal bounds clamping check for edge-placed narrow boxes
  for (const el of [illEl!, txtEl!]) {
    const b = estimateElementBounds(el);
    assert.ok(b.left >= 20, `left bound ${b.left} should be >= 20`);
    assert.ok(b.right <= 1060, `right bound ${b.right} should be <= 1060`);
  }

  // word-reveal must stay minimal without injecting auto-enrich-prop-
  const wordRevealOnly = parseScenePlanJson(
    JSON.stringify({
      schema_version: '1.9',
      compositionId: 'word-reveal',
      source_segments: buildSourceSegmentsFromCues(cues.slice(0, 1)),
      scenes: [docWithAnimDur.scenes[1]],
    }),
  );
  const wordRevealProj = scenePlanToProject([], wordRevealOnly!, {
    cuesOverride: cues.slice(0, 1),
    compositionId: 'word-reveal',
  });
  assert.ok(!wordRevealProj.elements.some((e) => e.id.startsWith('auto-enrich-prop-')));

  // Wide Step-1 cuesOverride (e.g., 0..9.2s) must NOT suppress enrichment for bare-text seg_002 (4.7..9.0s)
  const wideCueProject = scenePlanToProject([], parsed!, {
    cuesOverride: [
      {
        id: 'wide-c1',
        start: 0.0,
        end: 9.2,
        text: 'First compare polite requests at the airport gate. Always double check your boarding pass before boarding.',
        words: [],
      },
    ],
  });
  const wideEnriched = wideCueProject.elements.find(
    (e) => e.id.startsWith('auto-enrich-prop-') && e.startTime <= 5.0 && e.endTime >= 8.5,
  );
  assert.ok(wideEnriched, 'wide Step-1 cuesOverride should not mask bare-text v1.9 segment 2');

  // Rich v1.9 prompt sample includes multi-scene components and transition clarification
  const richPrompt = buildSceneGenerationPrompt(cues, {
    title: 'Airport Check',
    compositionId: 'ai-decide',
  });
  assert.ok(richPrompt.includes('"kind": "strip"'));
  assert.ok(richPrompt.includes('"kind": "illustration"'));
  assert.ok(richPrompt.includes('"kind": "object"'));
  assert.ok(richPrompt.includes('"kind": "connector"'));
  assert.ok(richPrompt.includes('"kind": "meter"'));
  assert.ok(richPrompt.includes('CHỈ là tốc độ hiệu ứng bay vào/ra'));
});

test('buildAiCreatorWebAiPrompt supports autonomous blank discovery and custom topic hints without source-preservation rules', () => {
  const blankPrompt = buildAiCreatorWebAiPrompt({
    topicHint: '',
    targetLang: 'vi',
    itemCount: 8,
    formatPreference: 'auto',
  });

  assert.ok(blankPrompt.includes('AUTONOMOUS ENGLISH EDUCATIONAL CONTENT DIRECTOR'));
  assert.ok(blankPrompt.includes('5 practical video ideas'));
  assert.ok(blankPrompt.includes('A. Vocabulary Lists'));
  assert.ok(blankPrompt.includes('G. Real-life Conversations'));
  assert.ok(blankPrompt.includes('STRICT ANTI-REPETITION RULE'));
  assert.ok(blankPrompt.includes('"indexLabel"'));
  assert.ok(blankPrompt.includes('"word"'));
  assert.ok(blankPrompt.includes('"meaning"'));
  assert.ok(blankPrompt.includes('"example"'));
  assert.ok(blankPrompt.includes('"speech"'));
  assert.ok(blankPrompt.includes('01 / 08'));
  assert.ok(!blankPrompt.includes('Do NOT summarize'));
  assert.ok(!blankPrompt.includes('Preserve every learning content'));

  const customTopicPrompt = buildAiCreatorWebAiPrompt({
    topicHint: '8 words to sound smarter in daily conversations',
    audience: 'Vietnamese learners (B1-B2)',
    targetDuration: '45s',
    itemCount: 8,
    targetLang: 'vi',
    formatPreference: 'vocab',
  });
  assert.ok(customTopicPrompt.includes('8 words to sound smarter in daily conversations'));
  assert.ok(customTopicPrompt.includes('45s'));
});

test('parseEnglishReelsAiJson parses AI Creator Mode JSON cleanly with zero consecutive duplicate variants and zero visual overlaps', () => {
  const creatorJson = JSON.stringify({
    mode: 'vocab',
    title: '8 Words to Sound Smarter in Every Sentence',
    cards: [
      {
        type: 'title',
        kicker: 'LEVEL UP YOUR ENGLISH',
        title: '8 Words to Sound Smarter in Every Sentence',
        speech: 'Eight simple words to sound much smarter in English today.',
        translation: '8 từ vựng giúp bạn nói tiếng Anh tự nhiên và chuyên nghiệp hơn.',
        visual: {
          variant: 'css-kinetic-hook',
          title: '8 Smart Words',
          subtitle: 'Upgrade everyday sentences',
          sceneIcon: 'sparkles',
        },
      },
      {
        type: 'vocab',
        indexLabel: '01 / 08',
        word: 'Articulate',
        meaning: 'Expressing thoughts clearly and effectively',
        example: 'She is remarkably articulate during client meetings.',
        speech: 'Number one: articulate. Expressing ideas clearly. Example: She is very articulate.',
        translation: 'Diễn đạt rõ ràng, lưu loát',
        visual: { variant: 'css-magnifying-word', highlightWord: 'Articulate', sceneIcon: 'sparkles' },
      },
      {
        type: 'vocab',
        indexLabel: '02 / 08',
        word: 'Stop saying "Very good" -> Say "Exceptional"',
        meaning: 'Unusually good; standing far above average',
        example: 'Your presentation today was truly exceptional.',
        speech: 'Number two: stop saying very good, say exceptional instead.',
        translation: 'Xuất sắc, vượt trội',
        visual: { variant: 'css-magnifying-word', sceneIcon: 'sparkles' },
      },
      {
        type: 'vocab',
        indexLabel: '03 / 08',
        word: 'Look vs See vs Watch',
        meaning: 'Focus eyes vs notice passively vs observe movement',
        example: 'Watch the screen closely while you look at the pattern.',
        speech: 'Number three: know when to use look, see, and watch.',
        translation: 'Phân biệt look, see và watch',
        visual: { variant: 'trio-icon-cards', labels: ['Look', 'See', 'Watch'], sceneIcon: 'book' },
      },
      {
        type: 'vocab',
        indexLabel: '04 / 08',
        word: 'Pragmatic',
        meaning: 'Practical and focused on real results',
        example: 'Let us take a pragmatic approach to this deadline.',
        speech: 'Number four: pragmatic. Practical and results focused.',
        translation: 'Thực tế, thực dụng theo hướng tích cực',
        visual: { variant: 'phrase-icon-split', sceneIcon: 'briefcase' },
      },
      {
        type: 'vocab',
        indexLabel: '05 / 08',
        word: 'Resilient',
        meaning: 'Able to recover quickly from setbacks',
        example: 'Great learners stay resilient after small mistakes.',
        speech: 'Number five: resilient. Bouncing back fast from difficulties.',
        translation: 'Kiên cường, nhanh chóng phục hồi',
        visual: { variant: 'degree-scale', value: 88, labels: ['Fragile', 'Steady', 'Resilient'] },
      },
      {
        type: 'vocab',
        indexLabel: '06 / 08',
        word: 'Inevitable',
        meaning: 'Certain to happen and impossible to avoid',
        example: 'With daily practice, steady progress is inevitable.',
        speech: 'Number six: inevitable. Certain to happen over time.',
        translation: 'Chắc chắn xảy ra, không thể tránh khỏi',
        visual: { variant: 'css-flashcard-flip', sceneIcon: 'clock' },
      },
      {
        type: 'vocab',
        indexLabel: '07 / 08',
        word: 'Concise',
        meaning: 'Giving clear information in very few words',
        example: 'Keep your email concise so busy teammates read it.',
        speech: 'Number seven: concise. Clear and brief without filler.',
        translation: 'Ngắn gọn, súc tích',
        visual: { variant: 'dialogue-upgrade', labels: ['Long & messy', 'Concise & crisp'] },
      },
      {
        type: 'vocab',
        indexLabel: '08 / 08',
        word: 'Ubiquitous',
        meaning: 'Found everywhere around you',
        example: 'Short videos have become ubiquitous in modern learning.',
        speech: 'Number eight: ubiquitous. Seen and found everywhere.',
        translation: 'Phổ biến khắp mọi nơi',
        visual: { variant: 'bs-alert-tip', sceneIcon: 'globe' },
      },
      {
        type: 'question',
        content: 'Which word means practical and focused on real results?',
        options: ['Articulate', 'Pragmatic', 'Ubiquitous', 'Inevitable'],
        speech: 'Quick check: which word means practical and focused on real results?',
        thinkSec: 4,
      },
      {
        type: 'answer',
        answerIndex: 1,
        explanation: 'Pragmatic describes solving problems practically.',
        speech: 'The answer is B: pragmatic.',
      },
      {
        type: 'outro',
        title: 'Save & Practice Today',
        content: 'Pick 2 words from this list and use them in one sentence today.',
        speech: 'Save this video and try two new words in a sentence today.',
        translation: 'Lưu lại video và đặt câu ngay hôm nay nhé!',
      },
    ],
  });

  const parsed = parseEnglishReelsAiJson(creatorJson, { targetLang: 'vi' });
  assert.ok(parsed, 'Creator JSON should parse cleanly');
  assert.equal(parsed!.title, '8 Words to Sound Smarter in Every Sentence');
  assert.equal(parsed!.mode, 'vocab');
  // 1 title + 8 vocab + 1 merged quiz + 1 outro = 11 cards
  assert.equal(parsed!.cards.length, 11);

  const phrasesParsed = parseEnglishReelsAiJson(
    JSON.stringify({
      mode: 'phrases',
      title: 'Natural English Alternatives',
      cards: [{ type: 'vocab', indexLabel: '01 / 01', word: 'On it', meaning: 'Handling it right now', speech: 'Say on it.' }],
    }),
    { targetLang: 'vi' },
  );
  assert.equal(phrasesParsed?.mode, 'vocab');
  assert.equal(phrasesParsed?.creatorSubMode, 'phrases');

  const firstVocab = parsed!.cards[1];
  assert.equal(firstVocab.indexLabel, '01 / 08');
  assert.ok(firstVocab.ttsText.includes('Number one: articulate'));

  // Zero consecutive duplicate visual.variants (notice item 01 and 02 both asked for css-magnifying-word)
  for (let i = 1; i < parsed!.cards.length; i++) {
    const prevVariant = parsed!.cards[i - 1].visual?.variant;
    const currVariant = parsed!.cards[i].visual?.variant;
    assert.notEqual(
      currVariant,
      prevVariant,
      `Card ${i} repeated visual variant "${currVariant}" consecutively`,
    );
  }

  // Converted project must have zero overlapping elements on stage
  const project = reelCardsToLessonProject(parsed!.cards, {
    title: parsed!.title,
    theme: 'warm-paper',
    targetLang: 'vi',
  });
  const overlaps = findVisualOverlaps(project.elements);
  assert.equal(overlaps.length, 0, `Expected 0 visual overlaps, got ${JSON.stringify(overlaps)}`);
});

test('buildSceneGenerationPrompt uses progressive seg_001/seg_002 samples and resolveSyncAnchorTiming tolerates punctuation variance', () => {
  const cues = [
    { id: 'c1', start: 0.0, end: 3.8, text: 'First compare polite requests at the airport gate.', words: [] },
    { id: 'c2', start: 3.9, end: 7.6, text: 'Then check your boarding pass before entering.', words: [] },
  ];

  const prompt = buildSceneGenerationPrompt(cues, {
    title: 'Airport Polite Requests',
    compositionId: 'ai-decide',
  });
  assert.ok(prompt.includes('seg_001'));
  assert.ok(prompt.includes('seg_002'));

  const segments = buildSourceSegmentsFromCues(cues);
  const timing = resolveSyncAnchorTiming(
    {
      segment_id: 'seg_001',
      anchor_type: 'phrase',
      quote: 'polite requests, at the airport gate',
    },
    segments[0],
    cues,
    0,
    3.8,
  );
  assert.ok(timing.startTime > 0.3 && timing.startTime < 2.2, `expected mid-segment start, got ${timing.startTime}`);
  assert.ok(timing.endTime > timing.startTime && timing.endTime <= 3.8);
});

test('splitMixedLanguageTtsSpans separates mixed EN+VI and JA+VI cleanly and pickVoiceForLangCode rejects mismatched regional voices', () => {
  const enViSpans = splitMixedLanguageTtsSpans('Articulate. Có nghĩa là diễn đạt rõ ràng.', {
    primaryLang: 'en',
    secondaryLang: 'vi',
    primaryVoice: 'en-US-JennyNeural',
    secondaryVoice: 'vi-VN-HoaiMyNeural',
  });
  assert.equal(enViSpans.length, 2);
  assert.equal(enViSpans[0].lang, 'en');
  assert.equal(enViSpans[0].voice, 'en-US-JennyNeural');
  assert.ok(enViSpans[0].text.includes('Articulate.'));
  assert.equal(enViSpans[1].lang, 'vi');
  assert.equal(enViSpans[1].voice, 'vi-VN-HoaiMyNeural');
  assert.ok(enViSpans[1].text.includes('diễn đạt rõ ràng'));

  const jaViSpans = splitMixedLanguageTtsSpans('おはようございます。 Nghĩa là chào buổi sáng 100%.', {
    primaryLang: 'ja',
    secondaryLang: 'vi',
    primaryVoice: 'ja-JP-NanamiNeural',
    secondaryVoice: 'vi-VN-HoaiMyNeural',
  });
  assert.equal(jaViSpans.length, 2);
  assert.equal(jaViSpans[0].lang, 'ja');
  assert.equal(jaViSpans[0].voice, 'ja-JP-NanamiNeural');
  assert.ok(jaViSpans[0].text.includes('おはようございます'));
  assert.equal(jaViSpans[1].lang, 'vi');
  assert.equal(jaViSpans[1].voice, 'vi-VN-HoaiMyNeural');
  assert.ok(jaViSpans[1].text.includes('100%'));

  // Reject mismatched regional voices
  assert.equal(pickVoiceForLangCode('en', 'vi-VN-HoaiMyNeural'), 'en-US-JennyNeural');
  assert.equal(pickVoiceForLangCode('ja', 'vi-VN-NamMinhNeural'), 'ja-JP-NanamiNeural');
  assert.equal(pickVoiceForLangCode('vi', 'en-US-GuyNeural'), 'vi-VN-HoaiMyNeural');
});

test('getLevelsForLearningLanguage returns N5-N1 / A1-C2 / HSK / TOPIK and recommendCreatorItemCount scales with minutes', () => {
  const jaLevels = getLevelsForLearningLanguage('ja').map((l) => l.id);
  assert.deepEqual(jaLevels, ['N5', 'N4', 'N3', 'N2', 'N1', 'N5→N1']);

  const enLevels = getLevelsForLearningLanguage('en').map((l) => l.id);
  assert.deepEqual(enLevels, ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'A1→C2']);

  const zhLevels = getLevelsForLearningLanguage('zh').map((l) => l.id);
  assert.equal(zhLevels[0], 'HSK 1');
  assert.equal(zhLevels[zhLevels.length - 1], 'HSK 1→6');

  const koLevels = getLevelsForLearningLanguage('ko').map((l) => l.id);
  assert.equal(koLevels[0], 'TOPIK 1');
  assert.equal(koLevels[koLevels.length - 1], 'TOPIK 1→6');

  const shortCount = recommendCreatorItemCount(0.5, false);
  const longCount = recommendCreatorItemCount(5, true);
  assert.ok(shortCount >= 4 && shortCount < longCount);
  assert.ok(longCount <= 60 && longCount >= 14);
});

test('buildAiCreatorWebAiPrompt incorporates learningLanguage, dynamic level, minute budget, 16:9 aspect, and dual-TTS explanationSpeech', () => {
  const prompt = buildAiCreatorWebAiPrompt({
    learningLanguage: 'ja',
    level: 'N4',
    durationMinutes: 4,
    targetLang: 'Tiếng Việt',
    aspectRatio: '16:9',
    includeExplanationSpeech: true,
    formatPreference: 'vocab',
  });

  assert.ok(prompt.includes('N4'));
  assert.ok(prompt.includes('4 phút') || prompt.includes('4.0 phút') || prompt.includes('4'));
  assert.ok(prompt.includes('explanationSpeech'));
  assert.ok(prompt.includes('16:9'));
  assert.ok(prompt.includes('日本語') || prompt.includes('Japanese'));
});

test('16:9 landscape dimensions and resolveElementLayoutForAspect arrange visual left and card right without overlap', () => {
  const dims = getStageDimensionsForAspect('16:9');
  assert.deepEqual(dims, { width: 1920, height: 1080 });

  const built = buildReelCardsRuleBased(
    'Articulate: Clear and fluent\nPragmatic: Practical and focused on results',
    { mode: 'vocab', targetLang: 'vi' },
  );
  const project = reelCardsToLessonProject(built.cards, {
    title: 'Landscape 16:9 Lesson',
    theme: 'warm-paper',
    targetLang: 'vi',
    aspectRatio: '16:9',
  });
  assert.equal(project.aspectRatio, '16:9');

  // Inspect a vocab card moment where both illustration-prop and sentence-card are visible
  const vocabCardEl = project.elements.find((el) => el.type === 'sentence-card');
  assert.ok(vocabCardEl, 'Expected at least one sentence-card in converted project');
  const sampleTime = (vocabCardEl!.startTime + vocabCardEl!.endTime) / 2;

  const layoutMap = resolveElementLayoutForAspect(project.elements, sampleTime, '16:9');
  const visibleAtSample = project.elements.filter(
    (el) => sampleTime >= el.startTime && sampleTime <= el.endTime,
  );

  const leftVisual = visibleAtSample.find((el) => el.type === 'illustration-prop' || el.type === 'word-stack');
  const rightCard = visibleAtSample.find((el) => el.type === 'sentence-card' || el.type === 'tone-meter');
  assert.ok(leftVisual, 'Expected visible left visual element');
  assert.ok(rightCard, 'Expected visible right sentence card element');

  const leftBox = layoutMap.get(leftVisual!.id)!;
  const rightBox = layoutMap.get(rightCard!.id)!;
  assert.ok(leftBox.x < 960, `Expected visual on left half (< 960), got x=${leftBox.x}`);
  assert.ok(rightBox.x > 960, `Expected card on right half (> 960), got x=${rightBox.x}`);
  assert.ok(leftBox.x + leftBox.width / 2 <= rightBox.x - rightBox.width / 2 + 20, 'Left visual and right card should not overlap horizontally');

  for (const el of visibleAtSample) {
    const l = layoutMap.get(el.id)!;
    assert.ok(l.x >= 0 && l.x <= 1920, `Element ${el.id} x=${l.x} out of 1920 bounds`);
    assert.ok(l.y >= 0 && l.y <= 1080, `Element ${el.id} y=${l.y} out of 1080 bounds`);
  }
});

test('splitMixedLanguageTtsSpans handles Chinese Hanzi + Pinyin + Vietnamese cleanly without misclassifying English words like day', () => {
  const zhViSpans = splitMixedLanguageTtsSpans('你好。Nghĩa là xin chào.', {
    primaryLang: 'zh',
    secondaryLang: 'vi',
    primaryVoice: 'zh-CN-XiaoxiaoNeural',
    secondaryVoice: 'vi-VN-HoaiMyNeural',
  });
  assert.equal(zhViSpans.length, 2);
  assert.equal(zhViSpans[0].lang, 'zh');
  assert.equal(zhViSpans[0].voice, 'zh-CN-XiaoxiaoNeural');
  assert.ok(zhViSpans[0].text.includes('你好'));
  assert.equal(zhViSpans[1].lang, 'vi');
  assert.equal(zhViSpans[1].voice, 'vi-VN-HoaiMyNeural');
  assert.ok(zhViSpans[1].text.includes('Nghĩa là xin chào'));

  // Parenthesized Pinyin should be stripped before Mandarin TTS so Chinese TTS doesn't spell romanization
  const zhPinyinSpans = splitMixedLanguageTtsSpans('不好意思 (bù hǎo yì si)。Xin lỗi.', {
    primaryLang: 'zh',
    secondaryLang: 'vi',
    primaryVoice: 'zh-CN-XiaoxiaoNeural',
    secondaryVoice: 'vi-VN-HoaiMyNeural',
  });
  assert.equal(zhPinyinSpans[0].lang, 'zh');
  assert.ok(zhPinyinSpans[0].text.includes('不好意思'));
  assert.ok(!zhPinyinSpans[0].text.includes('hǎo'));
  assert.equal(zhPinyinSpans[1].lang, 'vi');

  // Common English word "day" in an English sentence must remain 'en', not 'vi'
  const enDaySpans = splitMixedLanguageTtsSpans('Every day. Nghĩa là mỗi ngày.', {
    primaryLang: 'en',
    secondaryLang: 'vi',
    primaryVoice: 'en-US-JennyNeural',
    secondaryVoice: 'vi-VN-HoaiMyNeural',
  });
  assert.equal(enDaySpans[0].lang, 'en');
  assert.ok(enDaySpans[0].text.includes('Every day'));
  assert.equal(enDaySpans[1].lang, 'vi');
});

test('buildStarterLessonForLanguage(zh) and buildAiCreatorWebAiPrompt(splitAudioByRole) generate pure Chinese Hanzi and role-separated rules', () => {
  const zhStarter = buildStarterLessonForLanguage('zh', 'Tiếng Việt', 'HSK 2');
  assert.ok(zhStarter.title.includes('HSK 2'));
  assert.ok(zhStarter.cards.some((c) => c.type === 'vocab' && /[\u4E00-\u9FFF]/.test(c.ttsText)));
  assert.ok(zhStarter.cards.every((c) => Boolean(c.explanationSpeech)));

  const rolePrompt = buildAiCreatorWebAiPrompt({
    learningLanguage: 'zh',
    level: 'HSK 1',
    durationMinutes: 2,
    targetLang: 'Tiếng Việt',
    includeExplanationSpeech: true,
    splitAudioByRole: true,
  });
  assert.ok(rolePrompt.includes('CRITICAL ROLE-SEPARATED DUAL-TTS RULE'));
  assert.ok(rolePrompt.includes('100% pure Simplified Chinese Hanzi'));
  assert.ok(rolePrompt.includes('"speech": ""'));
  assert.ok(rolePrompt.includes('不好意思'));
});

test('resolveElementLayoutForAspect preserves manualPosition across 16:9 and hitTestElementLayout resolves display coords', () => {
  const built = buildReelCardsRuleBased(
    'Articulate: Clear and fluent\nPragmatic: Practical and focused on results',
    { mode: 'vocab', targetLang: 'vi' },
  );
  const project = reelCardsToLessonProject(built.cards, {
    title: 'Manual Drag Test',
    theme: 'warm-paper',
    targetLang: 'vi',
    aspectRatio: '16:9',
  });
  const cardEl = project.elements.find((el) => el.type === 'sentence-card')!;
  const sampleTime = (cardEl.startTime + cardEl.endTime) / 2;

  const initialHit = hitTestElementLayout(
    project.elements,
    1380,
    540,
    sampleTime,
    '16:9',
  );
  assert.ok(initialHit, 'Expected hitTestElementLayout to hit right-side card in 16:9');
  assert.ok(initialHit!.layout.x > 960);

  const draggedElements = project.elements.map((el) =>
    el.id === initialHit!.element.id
      ? {
          ...el,
          layout: {
            ...el.layout,
            x: 620,
            y: 380,
            width: initialHit!.layout.width,
            scale: initialHit!.layout.scale,
            manualPosition: true,
          },
        }
      : el,
  );
  const afterMap = resolveElementLayoutForAspect(draggedElements, sampleTime, '16:9');
  const movedBox = afterMap.get(initialHit!.element.id)!;
  assert.equal(movedBox.x, 620);
  assert.equal(movedBox.y, 380);
  assert.equal(movedBox.manualPosition, true);
});

test('splitMixedLanguageTtsSpans keeps unaccented VI words & Pinyin in VI clauses in 1 consistent VI voice and respects autoSplit=false', () => {
  const viClause = splitMixedLanguageTtsSpans(
    'Trong cong ty nay chung ta phai doc to cau nay moi ngay nhe.',
    {
      primaryLang: 'vi',
      secondaryLang: 'vi',
      primaryVoice: 'vi-VN-NamMinhNeural',
      secondaryVoice: 'vi-VN-HoaiMyNeural',
    },
  );
  assert.equal(viClause.length, 1);
  assert.equal(viClause[0].lang, 'vi');
  assert.equal(viClause[0].voice, 'vi-VN-NamMinhNeural');

  const pinyinInViClause = splitMixedLanguageTtsSpans(
    'Dùng Bù hǎo yì si khi cần xin lỗi nhẹ nhàng ở công ty.',
    {
      primaryLang: 'zh',
      secondaryLang: 'vi',
      primaryVoice: 'zh-CN-XiaoxiaoNeural',
      secondaryVoice: 'vi-VN-HoaiMyNeural',
    },
  );
  assert.equal(pinyinInViClause.length, 1);
  assert.equal(pinyinInViClause[0].lang, 'vi');
  assert.equal(pinyinInViClause[0].voice, 'vi-VN-HoaiMyNeural');

  const noAutoSplit = splitMixedLanguageTtsSpans('Every day. Nghĩa là mỗi ngày.', {
    primaryLang: 'vi',
    primaryVoice: 'vi-VN-HoaiMyNeural',
    secondaryVoice: 'en-US-JennyNeural',
    autoSplit: false,
  });
  assert.equal(noAutoSplit.length, 1);
  assert.equal(noAutoSplit[0].lang, 'vi');
  assert.equal(noAutoSplit[0].voice, 'vi-VN-HoaiMyNeural');
});

test('buildReelCardsRuleBased emits spoken transitions, pairs quizzes per section (not dumped at end), respects includeQuiz=false, and handles Chinese sentences', () => {
  const multiPartInput = `Part 1: Morning Routine
Tom wakes up early every morning. He drinks water and stretches before breakfast.
Q1. What does Tom do before breakfast?
A) Sleeps again
B) Drinks water and stretches
Answer: B

Part 2: Evening Review
At night he reviews new words for ten minutes. Consistent practice builds fluency.
Q2. How long does he review new words?
A) Ten minutes
B) Two hours
Answer: A`;

  const withQuiz = buildReelCardsRuleBased(multiPartInput, {
    mode: 'reading',
    targetLang: 'vi',
    title: 'Daily Habits',
    includeQuiz: true,
  });
  const types = withQuiz.cards.map((c) => c.type);
  assert.ok(types.includes('transition'), `Expected transition card in multi-part flow, got ${types.join(',')}`);
  const firstQuizIdx = types.indexOf('quiz');
  const transitionIdx = types.indexOf('transition');
  assert.ok(firstQuizIdx > 0 && transitionIdx > firstQuizIdx, `Expected Section 1 quiz (${firstQuizIdx}) before Section 2 transition (${transitionIdx}), types=${types.join(',')}`);
  assert.ok(withQuiz.cards[0].type === 'intro' && Boolean(withQuiz.cards[0].explanationSpeech));
  assert.ok(withQuiz.cards[withQuiz.cards.length - 1].type === 'outro' && Boolean(withQuiz.cards[withQuiz.cards.length - 1].explanationSpeech));

  const withoutQuiz = buildReelCardsRuleBased(multiPartInput, {
    mode: 'reading',
    targetLang: 'vi',
    title: 'Daily Habits No Quiz',
    includeQuiz: false,
  });
  assert.equal(withoutQuiz.cards.some((c) => c.type === 'quiz'), false, 'Expected no quiz cards when includeQuiz=false');

  const zhBuilt = buildReelCardsRuleBased('今天天气很好。我们去公园散步吧！你喜欢喝茶吗？', {
    mode: 'reading',
    targetLang: 'vi',
    title: 'Tiếng Trung giao tiếp',
    includeQuiz: false,
  });
  assert.equal(inferLearningLangFromCards(zhBuilt.cards), 'zh');
  assert.ok(zhBuilt.cards.some((c) => c.type === 'vocab' && c.ttsText.includes('今天天气很好')));
});

test('buildEnglishReelsWebAiPrompt and buildAiCreatorWebAiPrompt avoid hardcoded Comfort Zone title, require title sync + transitions, and support includeQuiz=none', () => {
  const webPrompt = buildEnglishReelsWebAiPrompt({
    sourceText: 'Airport Check-in\nMay I see your passport?',
    mode: 'auto',
    targetLang: 'Tiếng Việt',
    title: 'Thủ tục sân bay',
    includeQuiz: 'none',
  });
  assert.ok(!webPrompt.includes('Outside the Comfort Zone'), 'Prompt must not hardcode Outside the Comfort Zone');
  assert.ok(webPrompt.includes('Thủ tục sân bay'));
  assert.ok(webPrompt.includes('KHÔNG tự tạo Quiz'));
  assert.ok(webPrompt.includes('CHUYỂN TIẾP'));

  const creatorPrompt = buildAiCreatorWebAiPrompt({
    learningLanguage: 'zh',
    level: 'HSK 1',
    durationMinutes: 3,
    targetLang: 'Tiếng Việt',
    topicHint: 'Gọi món ở nhà hàng',
    includeQuiz: false,
  });
  assert.ok(creatorPrompt.includes('Gọi món ở nhà hàng'));
  assert.ok(creatorPrompt.includes('NO Surprise Quiz Cards'));
  assert.ok(creatorPrompt.includes('transition'));
});

test('hitTestElementLayout accurately detects clicks on tall quiz comparison-strip options and clamped 9:16 cards', () => {
  const built = buildReelCardsRuleBased(
    `Tom checks his passport at the counter.
Q1. Where does Tom check his passport?
A) At the counter
B) At the hotel pool
C) On the train
Answer: A`,
    { mode: 'reading', targetLang: 'vi', includeQuiz: true },
  );
  const project = reelCardsToLessonProject(built.cards, {
    title: 'Quiz Hit Test',
    theme: 'warm-paper',
    targetLang: 'vi',
    aspectRatio: '9:16',
  });
  const quizStrip = project.elements.find((el) => el.id.startsWith('reel-quiz-opts-'));
  assert.ok(quizStrip, 'Expected a reel-quiz-opts-* comparison-strip quiz element');
  const quizTime = (quizStrip!.startTime + quizStrip!.endTime) / 2;
  const layoutMap = resolveElementLayoutForAspect(project.elements, quizTime, '9:16');
  const quizBox = layoutMap.get(quizStrip!.id)!;

  // Click near lower option of 3-row stacked quiz card (+110px below center y)
  const hitLowerQuiz = hitTestElementLayout(
    project.elements,
    quizBox.x,
    quizBox.y + 110,
    quizTime,
    '9:16',
  );
  assert.ok(hitLowerQuiz, 'Expected hitTestElementLayout to catch lower quiz option area');
  assert.equal(hitLowerQuiz!.element.id, quizStrip!.id);
});

test('Phản Xạ Dịch Câu: prompt, curated/custom card builder, AI JSON parser, and 3-phase choreography (9:16 & 16:9)', () => {
  // 1. Recommended item count scales cleanly with duration & think/repeat settings
  const shortCount = recommendTranslationItemCount(2, 4, 2);
  const longCount = recommendTranslationItemCount(6, 3, 1);
  assert.ok(shortCount >= 4 && shortCount <= 12);
  assert.ok(longCount > shortCount && longCount <= 60);

  // 2. Prompt builder includes ueEyNdbRQ8Y catchy title rules, thinkSec, repeatCount, and custom input vs blank creative
  const blankPrompt = buildTranslationChallengePrompt({
    learningLanguage: 'ja',
    level: 'N4',
    durationMinutes: 3,
    itemCount: 8,
    targetLang: 'Tiếng Việt',
    thinkSec: 5,
    repeatCount: 3,
    includeNuanceTip: true,
    aspectRatio: '16:9',
  });
  assert.ok(blankPrompt.includes('AI CREATIVE MODE'));
  assert.ok(blankPrompt.includes('CATCHY YOUTUBE-STYLE HOOK TITLE RULE'));
  assert.ok(blankPrompt.includes('"thinkSec": 5'));
  assert.ok(blankPrompt.includes('"repeatCount": 3'));
  assert.ok(blankPrompt.includes('N4'));
  assert.ok(blankPrompt.includes('16:9 Landscape Widescreen'));

  const customPrompt = buildTranslationChallengePrompt({
    topicHint: 'Giao tiếp văn phòng',
    customInputLines: 'Coi chừng cô ấy đấy! | Watch out for her!',
    learningLanguage: 'en',
    level: 'B1',
    durationMinutes: 2,
    itemCount: 5,
    targetLang: 'Tiếng Việt',
    thinkSec: 3,
    repeatCount: 2,
    includeNuanceTip: false,
  });
  assert.ok(customPrompt.includes('USER PROVIDED WORDS / SENTENCES'));
  assert.ok(customPrompt.includes('Watch out for her!'));
  assert.ok(customPrompt.includes('Giao tiếp văn phòng'));

  // 3. Curated & custom deck builder produces catchy YouTube hook title and configured thinkSec/repeatCount
  const starterZh = buildTranslationCardsFromInput({
    learningLanguage: 'zh',
    level: 'HSK 2',
    itemCount: 4,
    thinkSec: 3,
    repeatCount: 3,
    includeNuanceTip: true,
  });
  assert.ok(starterZh.title.includes('【Phản xạ HSK 2】'));
  assert.equal(starterZh.cards[0].type, 'intro');
  const zhTrCards = starterZh.cards.filter((c) => c.type === 'translation');
  assert.equal(zhTrCards.length, 4);
  assert.equal(zhTrCards[0].thinkSec, 3);
  assert.equal(zhTrCards[0].repeatCount, 3);

  const customPairs = buildTranslationCardsFromInput({
    learningLanguage: 'en',
    level: 'B1',
    customInputLines: 'Coi chừng cô ấy đấy! | Watch out for her!\nĐể tôi suy nghĩ thêm. | Let me sleep on it.',
    thinkSec: 4,
    repeatCount: 2,
  });
  const customTrCards = customPairs.cards.filter((c) => c.type === 'translation');
  assert.equal(customTrCards.length, 2);
  assert.equal(customTrCards[0].sourcePrompt, 'Coi chừng cô ấy đấy!');
  assert.equal(customTrCards[0].ttsText, 'Watch out for her!');

  // 4. AI JSON parser preserves mode: "translation" fields
  const parsed = parseEnglishReelsAiJson(
    JSON.stringify({
      mode: 'translation',
      learningLang: 'en',
      level: 'B1',
      thinkSec: 3,
      repeatCount: 3,
      title: '【Phản xạ B1】"Coi chừng cô ấy đấy!" nói tiếng Anh sao cho chuẩn?',
      cards: [
        {
          type: 'title',
          kicker: 'PHẢN XẠ · B1',
          title: '【Phản xạ B1】"Coi chừng cô ấy đấy!"',
          speech: '',
          explanationSpeech: 'Thử thách phản xạ tiếng Anh thực tế!',
        },
        {
          type: 'translation',
          indexLabel: '01 / 01',
          sourcePrompt: 'Coi chừng cô ấy đấy!',
          answer: 'Watch out for her!',
          phonetic: '/wɑːtʃ aʊt fɔːr hɜːr/',
          speech: 'Watch out for her!',
          grammarNote: 'watch out for + O = coi chừng ai',
          explanationSpeech: 'Rất tự nhiên khi cảnh báo bạn bè.',
          thinkSec: 3,
          repeatCount: 3,
        },
      ],
    }),
  );
  assert.ok(parsed !== null);
  assert.equal(parsed!.isTranslationMode, true);
  assert.equal(parsed!.thinkSec, 3);
  assert.equal(parsed!.repeatCount, 3);
  const trParsedCard = parsed!.cards.find((c) => c.type === 'translation')!;
  assert.equal(trParsedCard.sourcePrompt, 'Coi chừng cô ấy đấy!');
  assert.equal(trParsedCard.repeatCount, 3);

  // 5. Choreography builds 3 phases (prompt -> 3 countdown ticks + meter -> 3 repeats) with 0 overlaps in 9:16 and clean 16:9 layout
  const proj916 = reelCardsToLessonProject(parsed!.cards, {
    title: parsed!.title,
    theme: 'pastel-sunrise',
    targetLang: 'vi',
    aspectRatio: '9:16',
  });
  assert.equal(findVisualOverlaps(proj916.elements).length, 0);

  const countdownMeters = proj916.elements.filter((el) => el.id.includes('reel-tr-q-countdown-meter-'));
  assert.equal(countdownMeters.length, 3);
  const repeatPills = proj916.elements.filter((el) => el.id.includes('reel-tr-pill-rep-'));
  assert.equal(repeatPills.length, 3);

  const repeatCues = proj916.cues.filter((c) => /-r\d+$/.test(c.id));
  assert.equal(repeatCues.length, 3);
  const promptCue = proj916.cues.find((c) => c.id.endsWith('-q'))!;
  assert.ok(repeatCues[0].start - promptCue.end >= 2.9, 'Think countdown gap must precede first repeat');

  const proj169 = reelCardsToLessonProject(parsed!.cards, {
    title: parsed!.title,
    theme: 'studio-slate',
    targetLang: 'vi',
    aspectRatio: '16:9',
  });
  const firstMeter = proj169.elements.find((el) => el.id.includes('reel-tr-q-countdown-meter-'))!;
  const promptCard = proj169.elements.find((el) => el.id.includes('reel-tr-prompt-card-'))!;
  const meterMidTime = (firstMeter.startTime + firstMeter.endTime) / 2;
  const layoutPhase2 = resolveElementLayoutForAspect(proj169.elements, meterMidTime, '16:9');
  const meterBox = layoutPhase2.get(firstMeter.id)!;
  const promptBox = layoutPhase2.get(promptCard.id)!;
  assert.ok(
    meterBox.y - promptBox.y >= 260,
    `16:9 Phase 2 prompt card (y=${promptBox.y}) and meter (y=${meterBox.y}) must have >=260px vertical separation`,
  );

  const ansCard = proj169.elements.find((el) => el.id.includes('reel-tr-ans-card-'))!;
  const ansProp = proj169.elements.find((el) => el.id.includes('reel-tr-ans-prop-'));
  assert.equal(ansProp, undefined, 'Duplicate Phase 3 Prompt prop must be omitted');
  const revealMidTime = (ansCard.startTime + ansCard.endTime) / 2;
  const layoutPhase3 = resolveElementLayoutForAspect(proj169.elements, revealMidTime, '16:9');
  assert.ok(layoutPhase3.get(ansCard.id)!.x >= 500, '16:9 Phase 3 prominent answer card must stay framed in canvas');
  assert.equal(findVisualOverlaps(proj169.elements).length, 0);
});

test('plain KineticSub composition & subtitle position/size controls work across 9:16 and 16:9', () => {
  const plainProj = recomposeProjectWithStyle(PRESET_JP_EN_POLITE, 'plain');
  assert.equal(plainProj.compositionId, 'plain');
  assert.ok(plainProj.elements.length > 0);
  assert.ok(
    plainProj.elements.every((e) => e.type === 'karaoke-card'),
    'Plain layout must contain only karaoke subtitle elements',
  );

  const firstKaraoke = plainProj.elements[0];
  const tMid = (firstKaraoke.startTime + firstKaraoke.endTime) / 2;

  const center916 = resolveElementLayoutForAspect(
    plainProj.elements,
    tMid,
    '9:16',
    { position: 'center', size: 'lg', boxStyle: 'clean' },
    'plain',
  );
  const top916 = resolveElementLayoutForAspect(
    plainProj.elements,
    tMid,
    '9:16',
    { position: 'top', size: 'md', boxStyle: 'card' },
    'plain',
  );
  const bottom169 = resolveElementLayoutForAspect(
    plainProj.elements,
    tMid,
    '16:9',
    { position: 'bottom', size: 'xl', boxStyle: 'clean' },
    'plain',
  );
  const center169 = resolveElementLayoutForAspect(
    plainProj.elements,
    tMid,
    '16:9',
    { position: 'center', size: 'lg', boxStyle: 'clean' },
    'plain',
  );

  assert.equal(center916.get(firstKaraoke.id)!.y, 960);
  assert.ok(top916.get(firstKaraoke.id)!.y < 400);
  assert.equal(center169.get(firstKaraoke.id)!.y, 540);
  assert.ok(bottom169.get(firstKaraoke.id)!.y > 850);

  // Reels choreography in plain mode with custom subtitleConfig
  const { cards } = buildTranslationCardsFromInput({
    learningLanguage: 'ja',
    level: 'N5',
    itemCount: 3,
    targetLang: 'vi',
  });
  const plainReels = reelCardsToLessonProject(cards, {
    title: 'Plain JA Drill',
    theme: 'studio-slate',
    compositionId: 'plain',
    subtitleConfig: { position: 'center', size: 'xl', boxStyle: 'clean' },
  });
  assert.equal(plainReels.compositionId, 'plain');
  assert.ok(plainReels.elements.every((el) => el.type === 'karaoke-card'));
});

test('translation challenge uses target-language instructions and vocabNotes instead of full-sentence Hiragana/phonetic', () => {
  const jaPrompt = buildTranslationChallengePrompt({
    learningLanguage: 'ja',
    level: 'N4',
    durationMinutes: 5,
    targetLang: 'vi',
    thinkSec: 4,
    repeatCount: 2,
  });
  assert.ok(jaPrompt.includes('5 phút'), 'Prompt should include target duration');
  assert.ok(jaPrompt.includes('vocabNotes'), 'Prompt should instruct AI to include vocabNotes');
  assert.ok(
    jaPrompt.includes('NEVER** put full-sentence Hiragana'),
    'Japanese translation prompt should forbid full-sentence Hiragana/Romaji',
  );

  const builtJa = buildTranslationCardsFromInput({
    learningLanguage: 'ja',
    level: 'N5',
    itemCount: 3,
    targetLang: 'vi',
    thinkSec: 3,
    repeatCount: 2,
  });
  const firstJaTr = builtJa.cards.find((c) => c.type === 'translation')!;
  assert.ok(!firstJaTr.phonetic, 'Translation challenge cards must omit full-sentence phonetic/Hiragana');

  const jaProj = reelCardsToLessonProject(builtJa.cards, {
    title: builtJa.title,
    theme: 'studio-slate',
    targetLang: 'vi',
    aspectRatio: '9:16',
  });
  const askCard = jaProj.elements.find((el) => el.id.includes('reel-tr-prompt-card-'))!;
  assert.ok(askCard.props.kind === 'sentence-card');
  // Must show Japanese instruction pill/subtitle instead of Vietnamese instruction chrome
  assert.ok(
    /日本語|訳|声に出|あと/.test(`${askCard.props.subtext}`),
    `Expected Japanese instruction text in subtext, got: ${askCard.props.subtext}`,
  );
  const ansCard = jaProj.elements.find((el) => el.id.includes('reel-tr-ans-card-'))!;
  assert.ok(ansCard.props.kind === 'sentence-card');
  assert.ok(
    ansCard.props.subtext && !/かな|ひらがな/.test(ansCard.props.subtext),
    'Answer sentence-card subtext should carry vocabNotes/grammar instead of full Hiragana reading',
  );
});

test('splitMixedLanguageTtsSpans cleanly isolates foreign words embedded in native sentences', () => {
  const spansViEn = splitMixedLanguageTtsSpans(
    'Trong tiếng Anh, cụm từ watch out for nghĩa là coi chừng ai đó.',
    { primaryLang: 'vi', secondaryLang: 'en' },
  );
  const enPiece = spansViEn.find((s) => s.lang === 'en');
  const viPiece = spansViEn.find((s) => s.lang === 'vi');
  assert.ok(enPiece && /watch out for/i.test(enPiece.text), 'Embedded English phrase must stay English');
  assert.ok(viPiece && /Trong tiếng Anh/.test(viPiece.text), 'Vietnamese frame must stay Vietnamese');

  const spansEnVi = splitMixedLanguageTtsSpans(
    'Please say xin chào clearly to your friend.',
    { primaryLang: 'en', secondaryLang: 'vi' },
  );
  assert.ok(
    spansEnVi.some((s) => s.lang === 'vi' && /xin chào/i.test(s.text)),
    'Embedded Vietnamese phrase inside English sentence must use Vietnamese voice',
  );
  assert.ok(
    spansEnVi.some((s) => s.lang === 'en' && /Please say/.test(s.text)),
    'Surrounding English sentence must stay English',
  );

  const spansJaEn = splitMixedLanguageTtsSpans(
    '日本語で checkout という表現はとても便利です。',
    { primaryLang: 'ja', secondaryLang: 'en' },
  );
  assert.ok(
    spansJaEn.some((s) => s.lang === 'en' && /checkout/i.test(s.text)),
    'Embedded English term in Japanese must split cleanly into English span',
  );
});

test('all prompt builders accept target duration minutes and scale guidance', () => {
  const studioPrompt = buildSceneGenerationPrompt(PRESET_JP_EN_POLITE.cues, {
    title: 'Test Studio',
    targetDurationMinutes: 5,
  });
  assert.ok(studioPrompt.includes('5 phút'), 'Studio prompt must include targetDurationMinutes');

  const readingPrompt = buildReadingWebAiPrompt({
    mode: 'topic',
    topic: 'Deep work habits',
    level: 'B2',
    durationMinutes: 5,
  });
  assert.ok(readingPrompt.includes('5 phút'), 'Reading prompt must include durationMinutes');

  const reelsSourcePrompt = buildEnglishReelsWebAiPrompt({
    sourceText: 'Take a rain check means politely decline an offer for now.',
    title: 'Idioms',
    mode: 'vocab',
    targetLang: 'vi',
    durationMinutes: 3,
  });
  assert.ok(/3\s*phút/i.test(reelsSourcePrompt), 'Reels source prompt must include durationMinutes');
});

test('splitMixedLanguageTtsSpans keeps N1-N5 and CEFR/JLPT/HSK tags in Vietnamese voice instead of splitting to English', () => {
  const spansN1 = splitMixedLanguageTtsSpans(
    '[Phản xạ N1] Hôm nay cùng luyện phản xạ N5 đến N1 nhé!',
    { primaryLang: 'vi', secondaryLang: 'ja' },
  );
  assert.equal(spansN1.length, 1, 'Vietnamese sentence with [Phản xạ N1] and N5/N1 must stay 1 unbroken VI span');
  assert.equal(spansN1[0].lang, 'vi');

  const spansTags = splitMixedLanguageTtsSpans(
    'Luyện thi JLPT N2 và trình độ B1 hoặc HSK4 cực dễ.',
    { primaryLang: 'vi', secondaryLang: 'ja' },
  );
  assert.equal(spansTags.length, 1);
  assert.equal(spansTags[0].lang, 'vi');
});

test('cleanOutputTitleStem preserves Japanese brackets cleanly without stray spaces and respects concise stem length', () => {
  assert.equal(
    cleanOutputTitleStem('【このペースで言える？】英会話のための瞬間英作文'),
    '【このペースで言える】英会話のための瞬間英作文',
  );
  const viTitle = cleanOutputTitleStem('【Phản xạ N1】"Coi chừng cô ấy!"');
  assert.equal(viTitle, '【Phản xạ N1】 Coi chừng cô ấy!');
  assert.ok(viTitle.length <= 84);
});

test('16:9 responsive layout centers plain Reels karaoke-card, stacks quiz split column cleanly, and hit-tests subtitle position', () => {
  const builtTr = buildTranslationCardsFromInput({
    learningLanguage: 'ja',
    level: 'N5',
    itemCount: 3,
    targetLang: 'vi',
  });
  const plainReels = reelCardsToLessonProject(builtTr.cards, {
    title: builtTr.title,
    theme: 'studio-slate',
    targetLang: 'vi',
    aspectRatio: '16:9',
    compositionId: 'plain',
    subtitleConfig: { position: 'top', size: 'lg', boxStyle: 'card' },
  });
  const plainKaraoke = plainReels.elements.find((el) => el.type === 'karaoke-card')!;
  assert.ok(!plainKaraoke.layout.manualPosition, 'Plain karaoke-card should not lock manualPosition by default');
  const plainMid = (plainKaraoke.startTime + plainKaraoke.endTime) / 2;
  const plainMap = resolveElementLayoutForAspect(
    plainReels.elements,
    plainMid,
    '16:9',
    plainReels.subtitleConfig,
    'plain',
  );
  const resolvedPlain = plainMap.get(plainKaraoke.id)!;
  assert.equal(resolvedPlain.x, 960);
  assert.ok((resolvedPlain.width ?? 0) > 1200, `Expected wide 16:9 plain subtitle width >1200, got ${resolvedPlain.width}`);

  const topHit = hitTestElementLayout(
    plainReels.elements,
    960,
    resolvedPlain.y,
    plainMid,
    '16:9',
    plainReels.subtitleConfig,
    'plain',
  );
  assert.ok(topHit && topHit.element.id === plainKaraoke.id, 'Expected hitTestElementLayout to hit top-positioned subtitle in 16:9');

  // Quiz split-column non-overlap in 16:9
  const builtQuiz = buildReelCardsRuleBased(
    `Tom checks his passport at the counter.
Q1. Where does Tom check his passport?
A) At the counter
B) At the hotel pool
C) On the train
Answer: A`,
    { mode: 'reading', targetLang: 'vi', includeQuiz: true },
  );
  const quizProj = reelCardsToLessonProject(builtQuiz.cards, {
    title: 'Quiz 16:9',
    theme: 'studio-slate',
    targetLang: 'vi',
    aspectRatio: '16:9',
  });
  const meter = quizProj.elements.find((el) => el.id.includes('countdown-meter-'))!;
  assert.ok(meter, 'Expected reel-q-countdown-meter-* element');
  const quizMid = (meter.startTime + meter.endTime) / 2;
  const quizMap = resolveElementLayoutForAspect(quizProj.elements, quizMid, '16:9');
  const sentEl = quizProj.elements.find(
    (el) => el.type === 'sentence-card' && quizMid >= el.startTime && quizMid <= el.endTime,
  )!;
  const optsEl = quizProj.elements.find(
    (el) => el.id.includes('-quiz-opts-') && quizMid >= el.startTime && quizMid <= el.endTime,
  )!;
  const sentBox = quizMap.get(sentEl.id)!;
  const optsBox = quizMap.get(optsEl.id)!;
  const meterBox = quizMap.get(meter.id)!;
  assert.ok(
    sentBox.y + 100 < optsBox.y && optsBox.y < meterBox.y,
    `Expected clean vertical stack in 16:9 split column: sent=${sentBox.y}, opts=${optsBox.y}, meter=${meterBox.y}`,
  );
});

test('resolveReelsModeSettings isolates aspectRatio and styling across the 3 Reels sub-tabs', () => {
  const saved = {
    reelCreationMode: 'source' as const,
    reelsAspectRatio: '16:9' as const,
    selectedTheme: 'warm-paper' as const,
    byMode: {
      source: {
        reelsAspectRatio: '16:9' as const,
        selectedTheme: 'warm-paper' as const,
        subtitlePosition: 'top' as const,
      },
      creator: {
        reelsAspectRatio: '9:16' as const,
        selectedTheme: 'studio-slate' as const,
      },
    },
  };

  assert.equal(resolveReelsModeSettings(saved, 'source').reelsAspectRatio, '16:9');
  assert.equal(resolveReelsModeSettings(saved, 'source').subtitlePosition, 'top');
  assert.equal(resolveReelsModeSettings(saved, 'creator').reelsAspectRatio, '9:16');
  assert.equal(resolveReelsModeSettings(saved, 'creator').selectedTheme, 'studio-slate');
  assert.equal(
    resolveReelsModeSettings(saved, 'translation').reelsAspectRatio,
    undefined,
    'Unconfigured third sub-tab must not inherit source 16:9 setting',
  );

  // Legacy migration (no byMode yet) seeds only the legacy active mode
  const legacyOnly = {
    reelCreationMode: 'source' as const,
    reelsAspectRatio: '16:9' as const,
  };
  assert.equal(resolveReelsModeSettings(legacyOnly, 'source').reelsAspectRatio, '16:9');
  assert.equal(resolveReelsModeSettings(legacyOnly, 'creator').reelsAspectRatio, undefined);
});

test('DEFAULT_BGM_PRESET is soft-rain at 3% volume and extractCountdownWindowsFromElements captures countdown ticks and reveal chimes', () => {
  assert.equal(DEFAULT_BGM_PRESET, 'soft-rain');
  assert.equal(DEFAULT_BGM_VOLUME, 0.03);

  const built = buildTranslationCardsFromInput({
    learningLanguage: 'en',
    level: 'B1',
    targetLang: 'Tiếng Việt',
    itemCount: 3,
    thinkSec: 4,
    repeatCount: 2,
  });
  const proj = reelCardsToLessonProject(built.cards, {
    title: built.title,
    theme: 'pastel-sunrise',
    aspectRatio: '9:16',
    targetLang: 'Tiếng Việt',
  });

  const windows = extractCountdownWindowsFromElements(proj.elements);
  assert.ok(windows.length >= 2, `Expected multiple countdown windows, got ${windows.length}`);
  for (const w of windows) {
    assert.ok(w.endSec > w.startSec);
    assert.ok(w.tickTimesSec.length >= 3, `Expected at least 3 ticks, got ${w.tickTimesSec.length}`);
    assert.equal(w.revealChimeSec, w.endSec);
  }
});

test('buildVideoDescription produces localized descriptions, chapters, and hashtags matching learning language', () => {
  // 1. Studying English — training-guide style outputs English description, chapters, and hashtags
  const jaGuide = buildVideoDescription({
    title: '【このペースで言える？】英会話のための瞬間英作文',
    nativeLang: '日本語',
    learningLang: 'en',
    style: 'training-guide',
    durationSec: 120,
    itemCount: 12,
    thinkSec: 5,
    hasCountdown: true,
    topicHint: 'English Speaking Practice',
  });
  assert.equal(jaGuide.nativeLangCode, 'ja');
  assert.equal(jaGuide.learningLangCode, 'en');
  assert.equal(jaGuide.styleUsed, 'training-guide');
  assert.ok(jaGuide.description.includes('Thanks for watching!'));
  assert.ok(jaGuide.description.includes('📝 Recommended Practice Method'));
  assert.ok(jaGuide.description.includes('00:00 Intro'));
  assert.ok(jaGuide.hashtags.includes('#LearnEnglish'));
  assert.ok(jaGuide.txtContent.includes(jaGuide.title));
  assert.ok(jaGuide.txtContent.includes(jaGuide.hashtagsLine));

  // 2. Studying Japanese — hook-bullets style outputs Japanese description + #N1 + #日本語学習
  const viHook = buildVideoDescription({
    title: '【N1 nói vậy sao?】Phản xạ tiếng Nhật công sở',
    nativeLang: 'Tiếng Việt',
    learningLang: 'ja',
    style: 'hook-bullets',
    durationSec: 65,
    itemCount: 6,
    repeatCount: 2,
    topicHint: 'N1 Keigo',
  });
  assert.equal(viHook.nativeLangCode, 'vi');
  assert.equal(viHook.learningLangCode, 'ja');
  assert.ok(viHook.description.includes('✔ 日本語脳'));
  assert.ok(viHook.hashtags.includes('#日本語学習'));
  assert.ok(viHook.hashtags.includes('#N1'));

  // 3. Studying Chinese — phrase-pack style outputs Chinese description + #中文学习
  const enPack = buildVideoDescription({
    title: 'Essential Mandarin Phrases for Daily Life',
    nativeLang: 'English',
    learningLang: 'zh',
    style: 'phrase-pack',
    itemCount: 25,
    topicHint: 'HSK 2 Travel',
  });
  assert.equal(enPack.nativeLangCode, 'en');
  assert.equal(enPack.learningLangCode, 'zh');
  assert.ok(enPack.description.includes('精选 25 个'));
  assert.ok(enPack.hashtags.includes('#中文学习'));
  assert.ok(enPack.hashtags.length <= 10);
});

test('Tab 3 multilingual reading prompt, CJK/Korean alignment tokenization, and compact CJK pagination work across zh, ko, and ja', () => {
  // 1. Starter passages exist for all 6 languages
  for (const lang of ['en', 'ja', 'zh', 'ko', 'fr', 'es'] as const) {
    const starter = READING_STARTER_BY_LANG[lang];
    assert.ok(starter.title.length > 0);
    assert.ok(starter.text.length > 20);
  }

  // 2. Multilingual Web AI prompt supports blank topic (autonomous mode) & dynamic duration budget
  const jaTarget = computeReadingTargetLength('ja', 3);
  assert.ok(jaTarget.count >= 450 && jaTarget.unitShort === 'ký tự');
  const jaPrompt = buildReadingWebAiPrompt({
    mode: 'topic',
    learningLanguage: 'ja',
    topic: '',
    level: 'N4',
    durationMinutes: 3,
    wordCount: jaTarget.count,
  });
  assert.ok(jaPrompt.includes('CHẾ ĐỘ AI TỰ CHỌN Ý TƯỞNG'));
  assert.ok(jaPrompt.includes('JLPT N4'));
  assert.ok(jaPrompt.includes('3 phút'));

  const zhPrompt = buildReadingWebAiPrompt({
    mode: 'topic',
    learningLanguage: 'zh',
    topic: '周末去公园',
    level: 'HSK 2',
    durationMinutes: 2,
  });
  assert.ok(zhPrompt.includes('HSK 2'));
  assert.ok(zhPrompt.includes('周末去公园'));

  // 3. CJK & Korean tokenization and forced alignment on synthesized 16kHz PCM audio
  const zhText = '今天天气很好。我们去公园散步吧！';
  const zhTokens = tokenizeTextForAlignment(zhText, 'zh');
  assert.ok(zhTokens.length >= 6, `Expected >= 6 segmented Chinese tokens, got ${zhTokens.length}`);

  const sr = 16000;
  const totalSamples = sr * 4;
  const pcm = new Float32Array(totalSamples);
  for (let i = Math.floor(sr * 0.2); i < Math.floor(sr * 3.8); i++) {
    pcm[i] = Math.sin((2 * Math.PI * 220 * i) / sr) * 0.35;
  }
  const zhAligned = alignKnownTextToPcmFloat(zhText, pcm, sr, { lang: 'zh' });
  assert.equal(zhAligned.words.length, zhTokens.length);
  for (let i = 0; i < zhAligned.words.length; i++) {
    assert.ok(zhAligned.words[i].end > zhAligned.words[i].start);
    assert.ok(zhAligned.words[i].end <= 4.05);
    if (i > 0) assert.ok(zhAligned.words[i].start >= zhAligned.words[i - 1].start);
  }

  const koText = '저는 매일 아침 여섯 시 반에 일어납니다.';
  const koTokens = tokenizeTextForAlignment(koText, 'ko');
  assert.equal(koTokens.length, 7);
  const koAligned = alignKnownTextToPcmFloat(koText, pcm, sr, { lang: 'ko' });
  assert.equal(koAligned.words.length, 7);

  // 4. Dense CJK JSON/plain response splits cleanly on fullwidth punctuation
  const parsedZh = parseReadingWebAiResponse('今天天气很好。我们去公园散步吧！你觉得怎么样？', 'HSK 2');
  assert.ok(parsedZh !== null);
  assert.ok(parsedZh!.text.split('\n').length >= 3);

  // 5. buildEstimatedReadingWords + paginateReadingWords keep CJK tokens cleanly inside bounds
  const estWords = buildEstimatedReadingWords(zhText, 4, 'zh');
  assert.ok(estWords.length >= 6);
  const zhPages = paginateReadingWords(
    estWords,
    (w) => w.length * 22,
    {
      startX: 20,
      maxW: 160,
      startY: 50,
      maxY: 300,
      lineHeight: 36,
      wordGap: 10,
      getWordGap: (w) => (/[\u3040-\u30ff\u4e00-\u9fff]/.test(w) ? 3 : 10),
    },
  );
  assert.ok(zhPages.flat().length === estWords.length);
  for (const item of zhPages.flat()) {
    assert.ok(item.x + item.w <= 20 + 160 + 1);
  }
});

test('getReadingUiStrings and isDefaultReadingOutroPair localize intro badge, page labels, and outro across 6 languages', () => {
  const ja = getReadingUiStrings('ja');
  assert.equal(ja.introBadge, '今日のリーディング目標');
  assert.equal(ja.introPreparingLabel, 'まもなく読み始めます...');
  assert.equal(ja.pageIndicator(1, 3), 'ページ 1/3');
  assert.equal(ja.outroLine1, 'ご視聴ありがとうございました！');
  assert.equal(ja.outroLine2, 'また次回お会いしましょう');
  assert.ok(!ja.introBadge.includes('HÔM NAY'));

  const zh = getReadingUiStrings('zh-CN');
  assert.equal(zh.introBadge, '今日跟读目标');
  assert.equal(zh.pageIndicator(2, 4), '第 2/4 页');
  assert.equal(zh.outroLine1, '感谢观看！');

  const ko = getReadingUiStrings('ko');
  assert.equal(ko.introBadge, '오늘의 읽기 목표');
  assert.equal(ko.pageIndicator(1, 2), '1/2 페이지');

  const fr = getReadingUiStrings('fr');
  assert.equal(fr.introBadge, 'OBJECTIF DE LECTURE');
  assert.equal(fr.pageIndicator(1, 3), 'Page 1/3');

  const es = getReadingUiStrings('es');
  assert.equal(es.introBadge, 'META DE LECTURA');
  assert.equal(es.pageIndicator(2, 3), 'Página 2/3');

  const en = getReadingUiStrings('en');
  assert.equal(en.introBadge, 'TODAY’S READING GOAL');
  assert.equal(en.pageIndicator(1, 3), 'Page 1/3');

  assert.equal(isDefaultReadingOutroPair(ja.outroLine1, ja.outroLine2), true);
  assert.equal(isDefaultReadingOutroPair(en.outroLine1, en.outroLine2), true);
  assert.equal(isDefaultReadingOutroPair('', ''), true);
  assert.equal(isDefaultReadingOutroPair('Custom Channel', 'Subscribe'), false);
});

test('multiTabBatchHelper splits multi-JSON drops, parses creator/translation/reading payloads, and generates topic prompts without API keys', () => {
  assert.equal(detectLearningLanguageFromText('雨の日に見つけた小さな親切', 'en'), 'ja');
  assert.equal(detectLearningLanguageFromText('今天天气很好，我们去散步吧。', 'en'), 'zh');
  assert.equal(detectLearningLanguageFromText('오늘 날씨가 정말 좋네요.', 'en'), 'ko');
  assert.equal(detectLearningLanguageFromText('Bonjour, comment allez-vous?', 'en'), 'fr');

  const fencedMulti = [
    '```json',
    '{"title":"Rainy Kindness","text":"雨が降る午後、駅の前で傘を貸してくれた人がいました。"}',
    '```',
    '',
    '```json',
    '{"title":"Morning Coffee","text":"毎朝コーヒーを飲みながらニュースを読みます。"}',
    '```',
  ].join('\n');
  const splitFenced = splitMultiJsonInputs(fencedMulti);
  assert.equal(splitFenced.length, 2);

  const concatJson = '{"title":"Lesson A","cards":[{"type":"vocab","word":"Calm","meaning":"Bình tĩnh","example":"Stay calm.","speech":"Stay calm."}]} {"title":"Lesson B","cards":[{"type":"vocab","word":"Focus","meaning":"Tập trung","example":"Keep focus.","speech":"Keep focus."}]}';
  const splitConcat = splitMultiJsonInputs(concatJson);
  assert.equal(splitConcat.length, 2);

  const creatorParsed = parseCreatorOrTranslationBatchInput(splitConcat[0], {
    mode: 'creator',
    fileName: '01_Calm.json',
  });
  assert.ok(creatorParsed !== null);
  assert.equal(creatorParsed!.title, 'Lesson A');
  assert.ok(creatorParsed!.cards.length >= 1);

  const translationJson = JSON.stringify({
    mode: 'translation-challenge',
    learningLanguage: 'ja',
    title: 'Japanese Travel Phrases',
    items: [
      {
        prompt: 'Cho tôi hỏi nhà ga ở đâu ạ?',
        answer: 'すみません、駅はどこですか。',
        meaning: 'Excuse me, where is the station?',
        thinkSec: 4,
        repeatCount: 2,
      },
    ],
  });
  const translationParsed = parseCreatorOrTranslationBatchInput(translationJson, {
    mode: 'translation',
  });
  assert.ok(translationParsed !== null);
  assert.equal(translationParsed!.learningLanguage, 'ja');
  assert.ok(translationParsed!.cards.some((c) => c.type === 'translation'));

  const readingParsed = parseReadingBatchInput(splitFenced[0], {
    fileName: '01_Rainy.json',
  });
  assert.ok(readingParsed !== null);
  assert.equal(readingParsed!.learningLanguage, 'ja');
  assert.equal(readingParsed!.uiStrings.introBadge, '今日のリーディング目標');
  assert.equal(readingParsed!.uiStrings.outroLine1, 'ご視聴ありがとうございました！');

  const topics = parseTopicLinesInput('1. Ordering ramen\n- Train etiquette\nConvenience store');
  assert.deepEqual(topics, ['Ordering ramen', 'Train etiquette', 'Convenience store']);

  const readingPrompts = generateBatchPromptsForTopics({
    subTab: 'reading',
    topics,
    learningLanguage: 'ja',
    level: 'N4',
    durationMinutes: 2,
  });
  assert.equal(readingPrompts.length, 3);
  assert.ok(readingPrompts[0].promptText.includes('Ordering ramen'));
  assert.ok(readingPrompts[0].promptText.includes('JLPT N4'));

  const creatorPrompts = generateBatchPromptsForTopics({
    subTab: 'creator',
    topics: ['Airport English'],
    learningLanguage: 'en',
    level: 'B1',
    durationMinutes: 1.5,
    targetLang: 'vi',
  });
  assert.equal(creatorPrompts.length, 1);
  assert.ok(creatorPrompts[0].promptText.includes('Airport English'));
});

test('safeFileDownload detects HTML fallback payloads and preserves UTF-8 plain text MIME and .txt extension', () => {
  assert.equal(isHtmlPayload('<!doctype html><html><head></head></html>', 'text/plain'), true);
  assert.equal(isHtmlPayload('<html><body>Sign in</body></html>', ''), true);
  assert.equal(isHtmlPayload('plain text content', 'text/html; charset=utf-8'), true);

  const sampleTxt = [
    '【心温まる話】雨の日に見つけた小さな親切',
    '',
    'Tổng hợp 4 mẫu câu & từ vựng tiếng Nhật thực tế người bản xứ hay dùng nhất!',
    '✔ Phản xạ nhanh (<0.2s)',
    '#HocTiengNhat #TiengNhatGiaoTiep',
  ].join('\n');
  assert.equal(isHtmlPayload(sampleTxt, 'text/plain; charset=utf-8'), false);
  assert.equal(resolveOutputMimeType('【心温まる話】雨の日に見つけた小さな親切.txt'), 'text/plain; charset=utf-8');
  assert.equal(resolveOutputMimeType('lesson.srt'), 'text/plain; charset=utf-8');
  assert.equal(resolveOutputMimeType('lesson.mp4'), 'video/mp4');
  assert.equal(ensureExpectedExtension('My Lesson', '.txt'), 'My Lesson.txt');
  assert.equal(ensureExpectedExtension('My Lesson.txt', '.txt'), 'My Lesson.txt');
  assert.equal(ensureExpectedExtension('My Lesson.html', '.txt'), 'My Lesson.txt');
});

test('cartoonHostAnimator produces smooth speech-synced visemes, blinks, and arm gestures without sudden frame jumps', () => {
  assert.equal(classifyCharToViseme('m'), 'closed');
  assert.equal(classifyCharToViseme('a'), 'ah');
  assert.equal(classifyCharToViseme('あ'), 'ah');
  assert.equal(classifyCharToViseme('o'), 'oh');
  assert.equal(classifyCharToViseme('u'), 'oo');
  assert.equal(classifyCharToViseme('e'), 'ee');

  const cues = [
    {
      id: 'c1',
      start: 0.2,
      end: 1.8,
      text: 'Is it okay?',
      words: [
        { word: 'Is', start: 0.2, end: 0.45 },
        { word: 'it', start: 0.5, end: 0.72 },
        { word: 'okay?', start: 0.8, end: 1.6 },
      ],
    },
  ];

  // Silent gap before cue: mouth closed/smile, not speaking
  const silentBefore = computeSpeechLipSyncState(cues, 0.05);
  assert.equal(silentBefore.isSpeaking, false);
  assert.ok(silentBefore.mouthOpen <= 0.1);

  // Mid active word "okay?": speaking with open mouth & question eyebrow lift
  const midWord = computeSpeechLipSyncState(cues, 1.15);
  assert.equal(midWord.isSpeaking, true);
  assert.equal(midWord.activeWord, 'okay?');
  assert.ok(midWord.mouthOpen > 0.2);
  assert.ok(midWord.browLift > 0.3);

  // Verify 60fps smoothness across the entire cue duration (no choppy jumps)
  let prev = computeSpeechLipSyncState(cues, 0);
  for (let t = 1 / 60; t <= 2.2; t += 1 / 60) {
    const curr = computeSpeechLipSyncState(cues, t);
    assert.ok(
      Math.abs(curr.mouthOpen - prev.mouthOpen) < 0.28,
      `Abrupt mouth jump at t=${t.toFixed(3)}: ${prev.mouthOpen} -> ${curr.mouthOpen}`,
    );
    assert.ok(
      Math.abs(curr.headBobY - prev.headBobY) < 0.5,
      `Abrupt bob jump at t=${t.toFixed(3)}`,
    );
    assert.ok(
      Math.abs(curr.leftShoulderAngle - prev.leftShoulderAngle) < 0.12,
      `Abrupt arm jump at t=${t.toFixed(3)}`,
    );
    prev = curr;
  }

  // Verify blink cadence fires cleanly around 2.93s
  const blinking = computeSpeechLipSyncState(cues, 2.93);
  assert.ok(blinking.blinkFactor > 0.7);
  const awake = computeSpeechLipSyncState(cues, 1.0);
  assert.equal(awake.blinkFactor, 0);
});

test('cartoon-host @Gimmys composition produces interactive cards, yellow-pill karaoke, and 0 visual overlaps', () => {
  const proj = recomposeProjectWithStyle(PRESET_JP_EN_POLITE, 'cartoon-host');
  assert.equal(proj.compositionId, 'cartoon-host');
  assert.equal(formatCartoonHostHeadline('Can / Could / May (Transcript Nhật-Anh 1:42)'), 'Can / Could / May');
  assert.equal(formatCartoonHostHeadline(PRESET_JP_EN_POLITE.title), '水が欲しい時、CanとCouldどっち？');

  const hostEl = proj.elements.find(
    (e) => e.props.kind === 'illustration-prop' && e.props.variant === 'cartoon-host',
  );
  assert.ok(hostEl, 'cartoon-host illustration element should exist');
  const meterEl = proj.elements.find((e) => e.type === 'tone-meter');
  if (meterEl && hostEl) {
    assert.ok(hostEl.layout.y > meterEl.layout.y, 'Gimmy must sit cleanly below tone-meter in 9:16');
  }
  const introCheckState = computeSpeechLipSyncState(
    [{ id: 'intro', start: 0, end: 5, text: 'Học từ vựng English mỗi ngày!', words: [] }],
    1.0,
    { activeBadge: 'none', activeText: 'Từ vựng tiếng Anh' },
  );
  assert.notEqual(introCheckState.mood, 'worried', 'Substring -ng in English/Từ vựng must never falsely trigger worried');
  const interactiveCards = proj.elements.filter((e) => e.type === 'sentence-card');
  assert.ok(interactiveCards.length >= 2, 'cartoon-host should preserve interactive teaching cards for Gimmy to point at');
  const interactivePills = proj.elements.filter((e) => e.type === 'topic-pill');
  assert.ok(interactivePills.length >= 1, 'cartoon-host should include context topic pills');
  const yellowSub = proj.elements.find(
    (e) => e.props.kind === 'karaoke-card' && e.props.variant === 'yellow-pill',
  );
  assert.ok(yellowSub, 'cartoon-host should apply yellow-pill karaoke card styling');
  assert.deepEqual(findVisualOverlaps(proj.elements), []);
});

test('cartoon-host @Gimmys context-aware reactions, multi-aspect 16:9/1:1/4:5 layouts, Reels cards, and AI prompts', () => {
  const proj = recomposeProjectWithStyle(PRESET_JP_EN_POLITE, 'cartoon-host');

  // 1. Worried / warning context reaction on cross/AVOID card (~3.5s)
  const worriedCtx916 = computeCartoonHostContextFromElements(proj.elements, 3.5, proj.cues, '9:16');
  const worriedState = computeSpeechLipSyncState(proj.cues, 3.5, worriedCtx916);
  assert.equal(worriedState.mood, 'worried');
  assert.equal(worriedState.gestureMode, 'warn-avoid');
  assert.equal(worriedState.pointerGlyph, 'cross');
  assert.ok(worriedState.browSlope < -0.3);
  assert.ok(worriedState.smileBias < 0);

  // 2. Happy pointing reaction on check/NATURAL card (~34.5s: "Could I have some water, please?") in 9:16 vs 16:9
  const happyCtx916 = computeCartoonHostContextFromElements(proj.elements, 34.5, proj.cues, '9:16');
  const happyState916 = computeSpeechLipSyncState(proj.cues, 34.5, happyCtx916);
  assert.equal(happyState916.mood, 'happy');
  assert.equal(happyState916.pointerGlyph, 'check');
  assert.ok(happyState916.eyeTargetY < -0.2);

  const happyCtx169 = computeCartoonHostContextFromElements(proj.elements, 34.5, proj.cues, '16:9');
  const happyState169 = computeSpeechLipSyncState(proj.cues, 34.5, happyCtx169);
  assert.equal(happyState169.mood, 'happy');
  assert.equal(happyState169.gestureMode, 'point-right');
  assert.ok(happyState169.eyeTargetX > 0.3);

  // 3. Curious brow & question glyph on quiz context
  const curiousState = computeSpeechLipSyncState(proj.cues, 1.0, {
    activeBadge: 'question',
    activeText: 'Which one is natural?',
    targetDirection: 'up',
  });
  assert.equal(curiousState.mood, 'curious');
  assert.equal(curiousState.pointerGlyph, 'question');
  assert.ok(curiousState.browSlope > 0.4);

  // 4. Responsive multi-aspect layouts (16:9, 1:1, 4:5)
  const reelsBuilt = buildReelCardsRuleBased('Avoid: Give me water.\nNatural: Could I have some water?', {
    mode: 'vocab',
    targetLang: 'Tiếng Nhật',
  });
  const reelsProj = reelCardsToLessonProject(reelsBuilt.cards, {
    title: '水が欲しい時、CanとCouldどっち？',
    compositionId: 'cartoon-host',
    aspectRatio: '9:16',
  });
  assert.deepEqual(findVisualOverlaps(reelsProj.elements), [], 'Reels 9:16 cartoon-host should have 0 overlaps');

  const map169 = resolveElementLayoutForAspect(reelsProj.elements, 1.0, '16:9', reelsProj.subtitleConfig, 'cartoon-host');
  const host169 = reelsProj.elements.find((e) => e.id === 'reel-cartoon-host-main');
  const card169 = reelsProj.elements.find((e) => e.type === 'sentence-card' && e.startTime <= 1.0 && e.endTime >= 1.0);
  const strip169 = reelsProj.elements.find((e) => e.type === 'comparison-strip' && e.startTime <= 1.0 && e.endTime >= 1.0);
  const kara169 = reelsProj.elements.find((e) => e.type === 'karaoke-card' && e.startTime <= 1.0 && e.endTime >= 1.0);
  assert.ok(host169 && card169 && strip169 && kara169);
  assert.ok((map169.get(host169.id)?.x ?? 0) < 600, '16:9 should place Gimmy on left column');
  assert.ok((map169.get(card169.id)?.x ?? 0) > 1100, '16:9 should place teaching card on right column');
  assert.ok((map169.get(strip169.id)?.x ?? 0) > 1100, '16:9 should place strip on right column (no header overlap)');
  assert.ok((map169.get(kara169.id)?.y ?? 0) >= 900, '16:9 karaoke sits cleanly at bottom');

  const map11 = resolveElementLayoutForAspect(reelsProj.elements, 1.0, '1:1', reelsProj.subtitleConfig, 'cartoon-host');
  assert.ok((map11.get(host169.id)?.x ?? 0) < 450, '1:1 places Gimmy on left');
  assert.ok((map11.get(card169.id)?.x ?? 0) > 600, '1:1 places teaching card on right');

  const map45 = resolveElementLayoutForAspect(reelsProj.elements, 1.0, '4:5', reelsProj.subtitleConfig, 'cartoon-host');
  assert.ok((map45.get(card169.id)?.y ?? 0) < (map45.get(host169.id)?.y ?? 0), '4:5 places card above Gimmy');

  // 5. Updated @Gimmys AI prompts across Tab 1 & Tab 2
  const studioPrompt = buildSceneGenerationPrompt(proj.cues, {
    title: '水が欲しい時、CanとCouldどっち？',
    compositionId: 'cartoon-host',
  });
  assert.ok(studioPrompt.includes('@Gimmys'));
  assert.ok(studioPrompt.includes('KHÔNG TẠO BONG BÓNG THOẠI'));
  const reelsPrompt = buildEnglishReelsWebAiPrompt({
    sourceText: 'Could I have some water?',
    mode: 'auto',
    targetLang: 'Tiếng Nhật',
    compositionId: 'cartoon-host',
  });
  assert.ok(reelsPrompt.includes('KHÔNG viết lời thừa làm bong bóng thoại'));
  const creatorPrompt = buildAiCreatorWebAiPrompt({
    topicHint: 'Polite water requests',
    targetLang: 'Tiếng Nhật',
    compositionId: 'cartoon-host',
  });
  assert.ok(creatorPrompt.includes('@Gimmys'));
});

test('splitMixedLanguageTtsSpans preserves pure Spanish & French stories in 1 TTS voice without switching to Vietnamese or Pinyin', () => {
  const spanishStory =
    'Cada mañana Mateo va al mercado. Después toma un café caliente. No hay más pan aquí, pero tú puedes volver mañana.';
  const esSpans = splitMixedLanguageTtsSpans(spanishStory, {
    primaryVoice: 'es-ES-ElviraNeural',
    primaryLang: 'es-ES',
  });
  assert.equal(esSpans.length, 1, `Expected 1 single es span, got: ${JSON.stringify(esSpans)}`);
  assert.equal(esSpans[0].voice, 'es-ES-ElviraNeural');

  const frenchStory =
    "Bonjour, c'est moi ! Après le café, tu veux aller à la plage aujourd'hui ?";
  const frSpans = splitMixedLanguageTtsSpans(frenchStory, {
    primaryVoice: 'fr-FR-DeniseNeural',
    primaryLang: 'fr-FR',
  });
  assert.equal(frSpans.length, 1, `Expected 1 single fr span, got: ${JSON.stringify(frSpans)}`);
  assert.equal(frSpans[0].voice, 'fr-FR-DeniseNeural');

  const mixedViEs = splitMixedLanguageTtsSpans(
    'Từ "después" có nghĩa là sau đó trong tiếng Tây Ban Nha.',
    {
      primaryVoice: 'es-ES-ElviraNeural',
      primaryLang: 'es-ES',
      secondaryVoice: 'vi-VN-HoaiMyNeural',
      secondaryLang: 'vi-VN',
    },
  );
  assert.ok(
    mixedViEs.some((s) => s.lang === 'vi' && s.voice === 'vi-VN-HoaiMyNeural'),
    'Mixed Vietnamese explanation should still route Vietnamese tokens to explainer voice',
  );
  assert.ok(
    mixedViEs.some((s) => s.lang === 'es' && s.text.includes('después')),
    'Spanish quoted word inside mixed VI sentence should stay Spanish',
  );
});

test('inferLearningLangFromCards and AI prompts detect Spanish/French and enforce single-language TTS purity', () => {
  const inferredEs = inferLearningLangFromCards([
    {
      id: 'c1',
      type: 'vocab',
      badge: 'SPANISH',
      title: 'Cada mañana',
      content: 'Después Mateo va al café cuando todos están aquí.',
      ttsText: 'Después Mateo va al café cuando todos están aquí.',
    },
  ]);
  assert.equal(inferredEs, 'es');

  const inferredFr = inferLearningLangFromCards([
    {
      id: 'c2',
      type: 'vocab',
      badge: 'FRENCH',
      title: "Aujourd'hui",
      content: "Bonjour, c'est très bon avec du café, merci !",
      ttsText: "Bonjour, c'est très bon avec du café, merci !",
    },
  ]);
  assert.equal(inferredFr, 'fr');

  const reelsPrompt = buildEnglishReelsWebAiPrompt({
    sourceText: 'Cada mañana Mateo va al mercado.',
    mode: 'auto',
    targetLang: 'Tiếng Việt',
  });
  assert.ok(reelsPrompt.includes('"learningLang"'));
  assert.ok(reelsPrompt.includes('100% THUẦN NGÔN NGỮ'));

  const readingPrompt = buildReadingWebAiPrompt({
    mode: 'topic',
    topic: 'Un día en Madrid',
    learningLanguage: 'es',
    level: 'A2',
    durationMinutes: 1.5,
  });
  assert.ok(readingPrompt.includes('100% THUẦN 1 NGÔN NGỮ DUY NHẤT'));
  assert.ok(readingPrompt.includes('Español'));
});

test('@englishpracticing168 layouts and variants integrate cleanly with 0 overlaps', () => {
  const p168Variants = [
    'p168-step-quiz-formula',
    'p168-grammar-formula',
    'p168-pronunciation-matrix',
    'p168-situation-cards',
    'p168-slider-compare',
    'p168-story-dialogue',
  ] as const;

  for (const v of p168Variants) {
    assert.ok(isKnownIllustrationVariant(v), `Missing variant ${v}`);
    assert.ok(
      getEffectiveVectorCatalog().some((entry) => entry.variant === v),
      `Missing catalog entry for ${v}`,
    );
  }

  const p168Comps = [
    'p168-quiz-formula',
    'p168-grammar-formula',
    'p168-pronunciation',
    'p168-situations',
    'p168-slider-compare',
  ] as const;

  for (const compId of p168Comps) {
    assert.ok(
      LAYOUT_COMPOSITIONS.some((c) => c.id === compId),
      `Missing composition ${compId}`,
    );
    const recomposed = recomposeProjectWithStyle(PRESET_ED_PRONUNCIATION, compId);
    assert.equal(recomposed.compositionId, compId);
    assert.deepEqual(
      findVisualOverlaps(recomposed.elements),
      [],
      `Unexpected overlaps in ${compId}`,
    );
  }

  assert.equal(pickCompositionFromContext('Used to + Verb grammar rule formula'), 'p168-grammar-formula');
  assert.equal(pickCompositionFromContext('Voiced vs voiceless -ed ending sound /t/ /d/'), 'p168-pronunciation');
  assert.equal(pickCompositionFromContext('3 everyday situations with friends and at work'), 'p168-situations');
});

test('mixed JP/EN karaoke & alignment tokenization never splits English words or strands single-char kana tails', () => {
  const mixedText = '「Could I take Friday off, please?」とか言うか。';
  const karaokeTokens = tokenizeTextForKaraoke(mixedText);
  assert.ok(
    karaokeTokens.includes('please?」'),
    `Expected "please?」" to remain intact, got: ${JSON.stringify(karaokeTokens)}`,
  );
  assert.ok(
    !karaokeTokens.includes('plea') && !karaokeTokens.includes('se?'),
    `English word must not be split across tokens: ${JSON.stringify(karaokeTokens)}`,
  );
  assert.ok(
    !karaokeTokens.includes('か。') && !karaokeTokens.includes('か'),
    `Trailing 1-2 char kana tail must not be split alone: ${JSON.stringify(karaokeTokens)}`,
  );

  const alignTokens = tokenizeTextForAlignment(mixedText, 'ja');
  assert.ok(
    !alignTokens.includes('pl') && !alignTokens.includes('ea') && !alignTokens.includes('plea'),
    `Alignment tokenizer must keep English words intact, got: ${JSON.stringify(alignTokens)}`,
  );
});

test('karaokeTokenGapPx and layoutKaraokeTokens preserve zero/tight CJK gaps and auto-shrink to avoid orphan 1-2 char widow lines', () => {
  assert.equal(karaokeTokenGapPx('please?」', 'とか言うか。', 14), 2);
  assert.equal(karaokeTokenGapPx('Could', 'I', 14), 14);
  assert.equal(karaokeTokenGapPx('とか言', 'うか。', 14), 0);
  assert.equal(karaokeTokenGapPx('とか言うか', '。', 14), 0);
  assert.equal(karaokeTokenGapPx('「', 'Could', 14), 0);

  const tokens = tokenizeTextForKaraoke('「Could I take Friday off, please?」とか言うか。').map((word) => ({
    word,
  }));
  // Deterministic monospace-like width estimator: ~0.58 * fontSize for ASCII, ~1.0 * fontSize for CJK
  const estimateWidth = (text: string, fSize: number) => {
    let w = 0;
    for (const ch of text) {
      w += /[\u3000-\u9fff]/.test(ch) ? fSize * 1.0 : fSize * 0.56;
    }
    return w;
  };
  const baseFontSize = 36;
  // Width slightly narrower than full line at 36px (at 36px only the final short Japanese chunk would spill onto line 2)
  const fullWidthAt36 = tokens.reduce((acc, tok, idx) => {
    const sep = idx > 0 ? karaokeTokenGapPx(tokens[idx - 1].word, tok.word, 36 * 0.28 * 1.42) : 0;
    return acc + sep + estimateWidth(tok.word, 36);
  }, 0);
  const tightMaxLineW = fullWidthAt36 - 40;

  const layout = layoutKaraokeTokens(tokens, {
    baseFontSize,
    maxLineW: tightMaxLineW,
    linesPerPage: 2,
    measureWidth: estimateWidth,
    measureSpace: (fSize) => fSize * 0.28,
  });

  assert.ok(layout.fontSize < baseFontSize, `Expected font size to auto-shrink from ${baseFontSize}, got ${layout.fontSize}`);
  assert.equal(layout.allLines.length, 1, 'Expected auto-shrink to keep the line intact on 1 line instead of stranding a short CJK tail');
});

test('cartoonHostAnimator smoothly retracts right arm and fades reaction badge without frame snaps', () => {
  const recomposed = recomposeProjectWithStyle(PRESET_JP_EN_POLITE, 'cartoon-host');
  const warnEl = recomposed.elements.find(
    (el) => el.props.kind === 'sentence-card' && el.props.badge === 'cross',
  );
  assert.ok(warnEl, 'Expected a cross/warning sentence card in PRESET_JP_EN_POLITE');
  const endT = warnEl!.endTime;

  // Sample continuously across [endT - 0.05, endT + 0.65] at 30ms steps
  const frames = [];
  for (let dt = -0.05; dt <= 0.65; dt += 0.03) {
    const t = Number((endT + dt).toFixed(3));
    const ctx = computeCartoonHostContextFromElements(recomposed.elements, t);
    const frame = computeSpeechLipSyncState(recomposed.cues, t, ctx);
    frames.push({ t, ctx, frame });
  }

  const activeFrame = frames[0].frame;
  assert.equal(activeFrame.badgeGlyph, 'cross');
  assert.equal(activeFrame.badgeOpacity, 1);

  // 1) Continuous wrist motion across PRESET_JP_EN_POLITE card boundary (no >22px 30ms frame jumps)
  for (let i = 1; i < frames.length; i++) {
    const dx = Math.abs(frames[i].frame.rightWristX - frames[i - 1].frame.rightWristX);
    const dy = Math.abs(frames[i].frame.rightWristY - frames[i - 1].frame.rightWristY);
    const dist = Math.hypot(dx, dy);
    assert.ok(
      dist < 22,
      `Right wrist jumped ${dist.toFixed(1)}px between t=${frames[i - 1].t} and t=${frames[i].t}`,
    );
  }

  // 2) Retraction from an isolated cross card into neutral pause/idle must gradually fade badge (1 -> <1 -> 0)
  const isolatedElements = [warnEl!];
  const isolatedCues = recomposed.cues.map((c) =>
    c.end <= endT ? c : { ...c, start: c.start + 2.0, end: c.end + 2.0 },
  );
  const retractFrames = [];
  for (let dt = -0.05; dt <= 0.65; dt += 0.03) {
    const t = Number((endT + dt).toFixed(3));
    const ctx = computeCartoonHostContextFromElements(isolatedElements, t);
    retractFrames.push({ t, frame: computeSpeechLipSyncState(isolatedCues, t, ctx) });
  }
  assert.equal(retractFrames[0].frame.badgeOpacity, 1);
  const midRetract = retractFrames.find((f) => Math.abs(f.t - (endT + 0.22)) < 0.02)!;
  assert.ok(
    midRetract.frame.badgeOpacity > 0 && midRetract.frame.badgeOpacity < 1,
    `Expected gradual badge fade during neutral retraction, got ${midRetract.frame.badgeOpacity}`,
  );
  assert.equal(retractFrames[retractFrames.length - 1].frame.badgeOpacity, 0);
});

test('detectWavSpeechBounds trims leading/trailing silence and sanitizeSpanTextForSpeech strips dangling brackets', () => {
  const sr = 24000;
  const totalSamples = sr * 3; // 3.0s
  const samples = new Float32Array(totalSamples);
  // 0.8s silence, 1.0s 440Hz tone, 1.2s silence
  for (let i = Math.floor(sr * 0.8); i < Math.floor(sr * 1.8); i++) {
    samples[i] = 0.25 * Math.sin((2 * Math.PI * 440 * i) / sr);
  }
  const bounds = detectWavSpeechBounds(samples, sr, { leadPadSec: 0.03, tailPadSec: 0.04 });
  assert.ok(bounds.speechStartSec >= 0.75 && bounds.speechStartSec <= 0.81, `Unexpected speechStartSec=${bounds.speechStartSec}`);
  assert.ok(bounds.speechEndSec >= 1.79 && bounds.speechEndSec <= 1.86, `Unexpected speechEndSec=${bounds.speechEndSec}`);

  assert.equal(sanitizeSpanTextForSpeech('上司が通りかかって「'), '上司が通りかかって');
  assert.equal(sanitizeSpanTextForSpeech('Could I take Friday off, please?」'), 'Could I take Friday off, please?');
});

test('cartoonHostAnimator keeps right wrist & elbow outside torso and head silhouettes across all gestures and transitions', () => {
  const cues = [
    { id: 'c1', start: 0, end: 1.5, text: 'Which is natural?', words: [] },
    { id: 'c2', start: 1.6, end: 3.2, text: 'Avoid saying Give me water.', words: [] },
    { id: 'c3', start: 3.3, end: 5.0, text: 'Could I have some water?', words: [] },
  ];
  const badges: Array<'question' | 'cross' | 'check' | 'none'> = ['question', 'cross', 'check', 'none'];
  for (const badge of badges) {
    for (let t = 0.2; t <= 4.8; t += 0.25) {
      const state = computeSpeechLipSyncState(cues, t, {
        activeBadge: badge,
        activeText: badge === 'cross' ? 'Avoid' : badge === 'check' ? 'Could I' : 'Which one?',
        targetDirection: 'up',
      });
      assert.ok(
        state.rightWristX >= 118,
        `Right wrist X=${state.rightWristX} should stay outside torso (>=118) for badge=${badge} at t=${t}`,
      );
      if (state.rightWristY < -60) {
        const headDist = Math.hypot(state.rightWristX, state.rightWristY + 135);
        assert.ok(
          headDist >= 118,
          `Raised right wrist (${state.rightWristX.toFixed(1)}, ${state.rightWristY.toFixed(1)}) too close to head center (dist=${headDist.toFixed(1)})`,
        );
      }
    }
  }
});

test('cartoon-host 9:16 and 4:5 stack prevents tall 6-line Japanese sentence-card from overlapping tone-meter or character', () => {
  const tallJapaneseText =
    'このシーンを想像してみて。カフェにいて、すごく喉が渇いて「水、くれる？」って言うんだ。言葉は正しいけど、ちょっとぶっきらぼうに聞こえる。なぜかって？英語には丁寧に聞くための特別な表現があって、相手によって使い分けるんだ。';
  const elements: SceneElement[] = [
    {
      id: 'pill-1',
      type: 'topic-pill',
      label: 'Watch closely',
      startTime: 0,
      endTime: 10,
      enterAnimation: 'pop-up',
      exitAnimation: 'fade-out',
      layout: { x: 540, y: 315, width: 320, scale: 1, zIndex: 12 },
      props: { kind: 'topic-pill', text: 'Watch closely', bgColor: '#FFE4E6', textColor: '#991B1B' },
    },
    {
      id: 'card-tall',
      type: 'sentence-card',
      label: 'Tall JP Card',
      startTime: 0,
      endTime: 10,
      enterAnimation: 'pop-up',
      exitAnimation: 'shrink',
      layout: { x: 540, y: 590, width: 820, scale: 1, zIndex: 22 },
      props: {
        kind: 'sentence-card',
        text: tallJapaneseText,
        badge: 'cross',
        stampText: 'AVOID',
      },
    },
    {
      id: 'meter-1',
      type: 'tone-meter',
      label: 'Tone Meter',
      startTime: 0,
      endTime: 10,
      enterAnimation: 'slide-up',
      exitAnimation: 'fade-out',
      layout: { x: 540, y: 760, width: 760, scale: 1, zIndex: 18 },
      props: {
        kind: 'tone-meter',
        title: 'TONE',
        leftLabel: 'basic',
        rightLabel: 'natural',
        valueStart: 0.25,
        valueEnd: 0.25,
        animateStart: 0,
        animateEnd: 2,
      },
    },
    {
      id: 'host-1',
      type: 'illustration-prop',
      label: 'Gimmy',
      startTime: 0,
      endTime: 10,
      enterAnimation: 'fade-scale',
      exitAnimation: 'fade-out',
      layout: { x: 540, y: 1245, width: 540, scale: 1, zIndex: 14 },
      props: { kind: 'illustration-prop', variant: 'cartoon-host' },
    },
    {
      id: 'kara-1',
      type: 'karaoke-card',
      label: 'Karaoke',
      startTime: 0,
      endTime: 10,
      enterAnimation: 'slide-up',
      exitAnimation: 'fade-out',
      layout: { x: 540, y: 1620, width: 920, scale: 1, zIndex: 40 },
      props: {
        kind: 'karaoke-card',
        cueId: 'c1',
        words: [{ word: tallJapaneseText, start: 0, end: 10 }],
        activeColor: '#DC2626',
        inactiveColor: '#78350F',
        spokenColor: '#991B1B',
        variant: 'yellow-pill',
      },
    },
  ];

  for (const aspect of ['9:16', '4:5'] as const) {
    const resolved = resolveElementLayoutForAspect(elements, 2.0, aspect, undefined, 'cartoon-host');
    const cardLay = resolved.get('card-tall')!;
    const meterLay = resolved.get('meter-1')!;
    const hostLay = resolved.get('host-1')!;
    const karaLay = resolved.get('kara-1')!;

    const cardExt = estimateElementHalfExtents({ ...elements[1], layout: cardLay });
    const meterExt = estimateElementHalfExtents({ ...elements[2], layout: meterLay });
    const hostExt = estimateElementHalfExtents({ ...elements[3], layout: hostLay });
    const karaExt = estimateElementHalfExtents({ ...elements[4], layout: karaLay });

    const cardBottom = cardLay.y + cardExt.halfH;
    const meterTop = meterLay.y - meterExt.halfH;
    const meterBottom = meterLay.y + meterExt.halfH;
    const hostTop = hostLay.y - hostExt.halfH;
    const hostBottom = hostLay.y + hostExt.halfH;
    const karaTop = karaLay.y - karaExt.halfH;

    assert.ok(
      meterTop - cardBottom >= 18,
      `${aspect}: sentence-card bottom (${cardBottom.toFixed(1)}) overlaps tone-meter top (${meterTop.toFixed(1)})`,
    );
    assert.ok(
      hostTop - meterBottom >= 14,
      `${aspect}: tone-meter bottom (${meterBottom.toFixed(1)}) overlaps cartoon-host top (${hostTop.toFixed(1)})`,
    );
    assert.ok(
      karaTop - hostBottom >= 8,
      `${aspect}: cartoon-host bottom (${hostBottom.toFixed(1)}) overlaps karaoke top (${karaTop.toFixed(1)})`,
    );
  }
});

test('getEffectiveIntroSeconds and getEffectiveOutroSeconds clamp bounds cleanly and support optional fields', () => {
  assert.equal(getEffectiveIntroSeconds(PRESET_JP_EN_POLITE), 0);
  assert.equal(getEffectiveOutroSeconds(PRESET_JP_EN_POLITE), 0);

  const projWithBranding = {
    ...PRESET_JP_EN_POLITE,
    watermark: {
      introSeconds: 2.5,
      introBadge: 'BÀI HỌC HÔM NAY',
      introTitle: 'Can vs Could',
      watermarkEnabled: true,
      watermarkText: '@KineticSub',
      watermarkCorner: 'bottom-right' as const,
      watermarkOpacity: 0.7,
      outroSeconds: 3.5,
      outroLine1: 'Thanks!',
      outroLine2: '',
    },
  };
  assert.equal(getEffectiveIntroSeconds(projWithBranding), 2.5);
  assert.equal(getEffectiveOutroSeconds(projWithBranding), 3.5);

  // Blank outro lines should result in 0 effective outro even if outroSeconds > 0
  const blankOutro = {
    ...projWithBranding,
    watermark: {
      ...projWithBranding.watermark,
      introSeconds: 12,
      outroSeconds: 4,
      outroLine1: '   ',
      outroLine2: '',
    },
  };
  assert.equal(getEffectiveIntroSeconds(blankOutro), 6);
  assert.equal(getEffectiveOutroSeconds(blankOutro), 0);
});

test('SEGMENT_EXCEEDS_AUDIO gracefully warns and auto-clamps modest overhang while rejecting severe mismatches', () => {
  const docWithMinorOverhang = {
    schema_version: '1.9',
    title: 'Test Overhang',
    theme: 'pastel-sunrise' as const,
    source_segments: [
      { segment_id: 'seg_001', start: 0, end: 45.0, text: 'First half of lesson.' },
      { segment_id: 'seg_002', start: 45.2, end: 93.39, text: 'Second half ending slightly past audio.' },
    ],
    scenes: [
      {
        scene_id: 'sc_01',
        title: 'Scene 1',
        elements: [
          {
            element_id: 'el_1',
            kind: 'text',
            content: 'First half of lesson.',
            sync_anchor: { segment_id: 'seg_001', anchor_type: 'full_segment' as const },
            position: { x: 0.08, y: 0.25, width: 0.84, height: 0.16 },
          },
        ],
      },
      {
        scene_id: 'sc_02',
        title: 'Scene 2',
        elements: [
          {
            element_id: 'el_2',
            kind: 'illustration',
            variant: 'bs-card-header' as const,
            title: 'Key Tip',
            sync_anchor: { segment_id: 'seg_002', anchor_type: 'full_segment' as const },
            position: { x: 0.08, y: 0.25, width: 0.84, height: 0.2 },
          },
        ],
      },
    ],
  };

  // 1) Minor overhang (93.39s vs 92.07s audio -> +1.32s) is a non-blocking warning, not error
  const minorReport = validateStoryboardDocument(docWithMinorOverhang, [], { audioDurationSec: 92.07 });
  assert.equal(minorReport.errors.length, 0, `Expected 0 errors, got: ${JSON.stringify(minorReport.errors)}`);
  assert.ok(
    minorReport.warnings.some((w) => w.code === 'SEGMENT_EXCEEDS_AUDIO'),
    'Expected SEGMENT_EXCEEDS_AUDIO warning for minor overhang',
  );

  // 2) Severe overhang (140s vs 92.07s) remains a hard error
  const severeDoc = {
    ...docWithMinorOverhang,
    source_segments: [
      docWithMinorOverhang.source_segments[0],
      { segment_id: 'seg_002', start: 45.2, end: 140.0, text: 'Way too long segment.' },
    ],
  };
  const severeReport = validateStoryboardDocument(severeDoc, [], { audioDurationSec: 92.07 });
  assert.ok(
    severeReport.errors.some((e) => e.code === 'SEGMENT_EXCEEDS_AUDIO'),
    'Expected SEGMENT_EXCEEDS_AUDIO error for severe duration mismatch',
  );

  // 3) AI Prompt clamps source_segments to audioDurationSec so AI never generates 93.39s
  const oversizedCues = [
    {
      id: 'seg_001',
      start: 0,
      end: 45.0,
      text: 'First half of lesson.',
      words: interpolateWordTimings('First half of lesson.', 0, 45.0),
    },
    {
      id: 'seg_002',
      start: 45.2,
      end: 93.39,
      text: 'Second half ending slightly past audio.',
      words: interpolateWordTimings('Second half ending slightly past audio.', 45.2, 93.39),
    },
  ];
  const prompt = buildSceneGenerationPrompt(oversizedCues, { audioDurationSec: 92.07 });
  assert.ok(!prompt.includes('93.39'), 'Prompt source_segments must be clamped below 92.07s');
  assert.ok(prompt.includes('92.07'), 'Prompt should display clamped audio duration 92.07s');

  // 4) clampStoryboardPlanToAudioDuration + scenePlanToProject clamp segments, cues & project duration cleanly
  const clampedDoc = clampStoryboardPlanToAudioDuration(docWithMinorOverhang, 92.07);
  assert.ok(clampedDoc.source_segments![1].end <= 92.07);
  const afterClampReport = validateStoryboardDocument(clampedDoc, [], { audioDurationSec: 92.07 });
  assert.equal(afterClampReport.errors.length, 0);
  assert.ok(!afterClampReport.warnings.some((w) => w.code === 'SEGMENT_EXCEEDS_AUDIO'));

  const proj = scenePlanToProject([], docWithMinorOverhang, { audioDurationSec: 92.07 });
  assert.ok(proj.duration <= 92.07, `Project duration ${proj.duration} should match audio 92.07`);
  assert.ok(proj.cues[proj.cues.length - 1].end <= 92.07);
});

test('single-voice MultilingualNeural TTS preserves one voice across spans while keeping per-token lang & locale hints', () => {
  assert.equal(isMultilingualVoiceId('en-US-AvaMultilingualNeural'), true);
  assert.equal(isMultilingualVoiceId('vi-VN-HoaiMyNeural'), false);
  assert.equal(getLocaleForTtsLang('ja'), 'ja-JP');
  assert.equal(getLocaleForTtsLang('vi'), 'vi-VN');

  const pickedJa = pickVoiceForLangCode('ja', 'en-US-AvaMultilingualNeural');
  assert.equal(pickedJa, 'en-US-AvaMultilingualNeural');

  const spans = splitMixedLanguageTtsSpans('Dùng từ 水 khi nói tiếng Nhật hoặc checkout bằng tiếng Anh.', {
    primaryLang: 'vi',
    secondaryLang: 'ja',
    primaryVoice: 'en-US-AvaMultilingualNeural',
    singleVoiceMultilingual: true,
  });

  assert.ok(spans.length >= 3, `Expected multiple language-tagged spans, got ${spans.length}`);
  assert.ok(spans.some((s) => s.lang === 'ja' && s.text.includes('水')), 'Should tag single Japanese kanji 水 as lang=ja');
  assert.ok(spans.some((s) => s.lang === 'en' && /checkout/i.test(s.text)), 'Should tag embedded English word as lang=en');
  assert.ok(spans.some((s) => s.lang === 'vi'), 'Should keep Vietnamese segments as lang=vi');
  assert.ok(
    spans.every((s) => s.voice === 'en-US-AvaMultilingualNeural'),
    'All spans in single-voice multilingual mode must share the exact same MultilingualNeural voice ID',
  );
});

test('formatCartoonHostHeadline preserves full long lesson titles without ellipsis truncation', () => {
  const longTitle = 'Phân biệt cách dùng Can, Could, May trong giao tiếp công sở lịch sự';
  assert.equal(formatCartoonHostHeadline(longTitle), longTitle);
  assert.ok(!formatCartoonHostHeadline(longTitle).includes('…'));
  assert.equal(
    formatCartoonHostHeadline(`${longTitle} (Transcript Anh-Việt 2:15)`),
    longTitle,
  );
});

test('AI prompt builders enforce knowledge depth and target duration as minimum floor (never shorter)', () => {
  const studioPrompt = buildSceneGenerationPrompt(PRESET_JP_EN_POLITE.cues, {
    title: 'Polite Requests',
    targetDurationMinutes: 5,
  });
  assert.ok(studioPrompt.includes('CHỈ ĐƯỢC DÀI HƠN, KHÔNG ĐƯỢC THẤP HƠN'));
  assert.ok(studioPrompt.includes('5 phút'));

  const readingPrompt = buildReadingWebAiPrompt({
    mode: 'topic',
    topic: 'Deep Focus Rituals',
    level: 'B2',
    durationMinutes: 4,
  });
  assert.ok(readingPrompt.includes('CHỈ ĐƯỢC DÀI HƠN, KHÔNG ĐƯỢC THẤP HƠN'));
  assert.ok(readingPrompt.includes('4 phút'));

  const reelsSourcePrompt = buildEnglishReelsWebAiPrompt({
    sourceText: 'Could you possibly give me a hand?',
    mode: 'vocab',
    targetLang: 'vi',
    durationMinutes: 3,
  });
  assert.ok(reelsSourcePrompt.includes('CHỈ ĐƯỢC DÀI HƠN, KHÔNG ĐƯỢC THẤP HƠN'));

  const creatorPrompt = buildAiCreatorWebAiPrompt({
    learningLanguage: 'en',
    level: 'B1',
    durationMinutes: 4,
    targetLang: 'Tiếng Việt',
  });
  assert.ok(creatorPrompt.includes('CHỈ ĐƯỢC DÀI HƠN, KHÔNG ĐƯỢC THẤP HƠN'));
  assert.ok(creatorPrompt.includes('EXPLANATION QUALITY & KNOWLEDGE DEPTH ARE MANDATORY'));

  const translationPrompt = buildTranslationChallengePrompt({
    learningLanguage: 'ja',
    level: 'N4',
    durationMinutes: 3,
    targetLang: 'vi',
  });
  assert.ok(translationPrompt.includes('CHỈ ĐƯỢC DÀI HƠN, KHÔNG THẤP HƠN'));
  assert.ok(translationPrompt.includes('MANDATORY QUALITY & DEPTH'));
});

test('AI auto itemCount removes fixed 8 requirement and learning explanation resolves target voice & monolingual rules', () => {
  const autoCreatorJa = buildAiCreatorWebAiPrompt({
    learningLanguage: 'ja',
    level: 'N4',
    durationMinutes: 3,
    itemCount: 'auto',
    targetLang: 'learning',
  });
  assert.ok(autoCreatorJa.includes('AI TỰ QUYẾT ĐỊNH SỐ LƯỢNG MỤC KIẾN THỨC TỐI ƯU'));
  assert.ok(autoCreatorJa.includes('"01 / N"'));
  assert.ok(!autoCreatorJa.includes('8 core teaching items'));
  assert.ok(!autoCreatorJa.includes('01 / 08'));
  assert.ok(autoCreatorJa.includes('Monolingual immersion'));

  const autoTransKo = buildTranslationChallengePrompt({
    learningLanguage: 'ko',
    level: 'TOPIK 2',
    durationMinutes: 3,
    itemCount: 'auto',
    targetLang: 'learning',
  });
  assert.ok(autoTransKo.includes('AI TỰ QUYẾT ĐỊNH SỐ LƯỢNG CÂU PHẢN XẠ TỐI ƯU'));
  assert.ok(autoTransKo.includes('"indexLabel": "01 / N"'));
  assert.ok(!autoTransKo.includes('01 / 08'));
  assert.ok(autoTransKo.includes('monolingual immersion'));

  const sourceLearningAuto = buildEnglishReelsWebAiPrompt({
    sourceText: 'Could you pass me the salt?',
    mode: 'vocab',
    targetLang: 'learning',
  });
  assert.ok(/monolingual/i.test(sourceLearningAuto));

  const sourceLearningEn = buildEnglishReelsWebAiPrompt({
    sourceText: 'Could you pass me the salt?',
    mode: 'vocab',
    targetLang: 'learning',
    learningLanguage: 'en',
  });
  assert.ok(sourceLearningEn.includes('English (clear concise English vocabulary'));

  const studioBatchLearning = generateBatchPromptsForTopics({
    subTab: 'studio',
    topics: ['Polite Requests'],
    promptCount: 1,
    learningLanguage: 'ja',
    level: 'N4',
    durationMode: 'fixed',
    durationMinutes: 2,
    targetLang: 'learning',
  })[0]?.promptText || '';
  assert.ok(studioBatchLearning.includes('giải thích bằng ngôn ngữ muốn học'));

  const zhLocale = getReelLocaleStrings('learning', 'zh');
  assert.equal(zhLocale.code, 'zh');
  assert.equal(normalizeTtsLangCode('learning', 'ja'), 'ja');
  assert.equal(pickExplanationDefaultVoice('learning', 'ja'), 'ja-JP-NanamiNeural');
  assert.equal(pickExplanationDefaultVoice('learning', 'ko'), 'ko-KR-SunHiNeural');
  assert.equal(pickExplanationDefaultVoice('learning', 'zh'), 'zh-CN-XiaoxiaoNeural');
  assert.equal(pickExplanationDefaultVoice('learning', 'en'), 'en-US-JennyNeural');
});

test('reelCardsToLessonProject honors enableLearningAudio/enableExplanationAudio and keeps cartoon-host steady across transitions', () => {
  const starter = buildStarterLessonForLanguage('en', 'Tiếng Việt', 'B1');
  const explOnlyProj = reelCardsToLessonProject(starter.cards, {
    title: starter.title,
    compositionId: 'cartoon-host',
    aspectRatio: '9:16',
    enableLearningAudio: false,
    enableExplanationAudio: true,
  });

  // Top roadmap strip stays continuous without re-entering on subsequent cards, and cards use smooth fade-scale instead of pop-up bounce
  const stageStrips = explOnlyProj.elements.filter((e) => e.id.startsWith('reel-stage-'));
  assert.ok(stageStrips.length >= 2);
  assert.equal(stageStrips[0].enterAnimation, 'fade-scale');
  assert.equal(stageStrips[1].enterAnimation, 'none');

  const cardEls = explOnlyProj.elements.filter((e) => e.id.startsWith('reel-card-'));
  assert.ok(cardEls.length >= 2);
  assert.ok(cardEls.every((el) => el.enterAnimation !== 'pop-up'));

  // Cartoon host remains anchored at invariant layout coordinates before, inside, and after a 0.08s card gap
  const hostEl = explOnlyProj.elements.find((e) => e.id.includes('cartoon-host'))!;
  assert.ok(hostEl);
  const firstCardEnd = cardEls[0].endTime;
  const gapMidTime = firstCardEnd + 0.04;
  const secondCardStart = cardEls[1].startTime + 0.05;
  const layoutBeforeGap = resolveElementLayoutForAspect(
    explOnlyProj.elements,
    Math.max(0.1, firstCardEnd - 0.05),
    '9:16',
    explOnlyProj.subtitleConfig,
    'cartoon-host',
  ).get(hostEl.id)!;
  const layoutInGap = resolveElementLayoutForAspect(
    explOnlyProj.elements,
    gapMidTime,
    '9:16',
    explOnlyProj.subtitleConfig,
    'cartoon-host',
  ).get(hostEl.id)!;
  const layoutAfterGap = resolveElementLayoutForAspect(
    explOnlyProj.elements,
    secondCardStart,
    '9:16',
    explOnlyProj.subtitleConfig,
    'cartoon-host',
  ).get(hostEl.id)!;
  assert.equal(layoutBeforeGap.y, layoutInGap.y);
  assert.equal(layoutInGap.y, layoutAfterGap.y);
  assert.equal(layoutBeforeGap.x, layoutInGap.x);
  assert.equal(layoutInGap.x, layoutAfterGap.x);

  // Translation cues respect enableLearningAudio=false (0 repeat cues) and enableExplanationAudio=false (0 nuance cues)
  const trDeck = buildTranslationCardsFromInput({
    learningLanguage: 'en',
    level: 'B1',
    itemCount: 3,
    targetLang: 'Tiếng Việt',
    thinkSec: 3,
    repeatCount: 2,
    includeNuanceTip: true,
  });
  const trExplOnly = reelCardsToLessonProject(trDeck.cards, {
    title: trDeck.title,
    enableLearningAudio: false,
    enableExplanationAudio: true,
  });
  assert.equal(
    trExplOnly.cues.some((c) => /-r\d+$/.test(c.id)),
    false,
    'Should emit zero repeat cues when learning audio is OFF',
  );
  assert.equal(
    trExplOnly.cues.some((c) => /-n$/.test(c.id)),
    true,
    'Should keep nuance cue when explanation audio is ON',
  );

  const trLearningOnly = reelCardsToLessonProject(trDeck.cards, {
    title: trDeck.title,
    enableLearningAudio: true,
    enableExplanationAudio: false,
  });
  assert.equal(
    trLearningOnly.cues.some((c) => /-r\d+$/.test(c.id)),
    true,
    'Should keep repeat cues when learning audio is ON',
  );
  assert.equal(
    trLearningOnly.cues.some((c) => /-n$/.test(c.id)),
    false,
    'Should omit nuance cue when explanation audio is OFF',
  );
});

test('30-minute prompts enforce multi-chapter volume, anti-rambling/anti-repetition/depth rules, remove studio batch cap, and request durationReport.shortfallReason', () => {
  const reading30 = buildReadingWebAiPrompt({
    mode: 'topic',
    topic: 'Deep Habits',
    level: 'B2',
    durationMinutes: 30,
  });
  assert.ok(reading30.includes('3750'), '30m English reading prompt should specify 3750+ words');
  assert.ok(/chương|chapter/i.test(reading30), '30m reading prompt should break volume into chapters');
  assert.ok(reading30.includes('durationReport') && reading30.includes('shortfallReason'));
  assert.ok(/CẤM LAN MAN|NO RAMBLING/i.test(reading30));

  const creator30 = buildAiCreatorWebAiPrompt({
    learningLanguage: 'en',
    level: 'B2',
    durationMinutes: 30,
    itemCount: 'auto',
    targetLang: 'Tiếng Việt',
  });
  assert.ok(creator30.includes('durationReport') && creator30.includes('shortfallReason'));
  assert.ok(creator30.includes('ANTI-RAMBLING') && creator30.includes('ZERO REPETITION'));
  assert.ok(creator30.includes('chương') || creator30.includes('tình huống'));

  const trans30 = buildTranslationChallengePrompt({
    learningLanguage: 'en',
    level: 'B1',
    durationMinutes: 30,
    itemCount: 'auto',
    targetLang: 'Tiếng Việt',
  });
  assert.ok(trans30.includes('durationReport') && trans30.includes('shortfallReason'));
  assert.ok(trans30.includes('ANTI-RAMBLING') && trans30.includes('DEEP INSIGHT'));

  const source30 = buildEnglishReelsWebAiPrompt({
    sourceText: 'Sample source text for 30 minute expansion.',
    mode: 'vocab',
    targetLang: 'vi',
    durationMinutes: 30,
  });
  assert.ok(source30.includes('durationReport') && source30.includes('shortfallReason'));
  assert.ok(source30.includes('CẤM LAN MAN') && source30.includes('CẤM LẶP LẠI'));

  const studioBatch30 =
    generateBatchPromptsForTopics({
      subTab: 'studio',
      topics: ['Productivity Systems'],
      promptCount: 1,
      learningLanguage: 'en',
      level: 'B2',
      durationMode: 'fixed',
      durationMinutes: 30,
      targetLang: 'vi',
    })[0]?.promptText || '';
  assert.ok(studioBatch30.includes('30 phút'));
  assert.ok(!studioBatch30.includes('source_segments là 24 câu'), 'Should not cap studio 30m cues at 24');
  assert.ok(studioBatch30.includes('durationReport') && studioBatch30.includes('shortfallReason'));

  const studioAuto = buildSceneGenerationPrompt(PRESET_JP_EN_POLITE.cues, {
    title: 'Polite Requests',
    targetDurationMinutes: 30,
    autonomousScript: true,
  });
  assert.ok(studioAuto.includes('30 phút'));
  assert.ok(studioAuto.includes('durationReport') && studioAuto.includes('shortfallReason'));
  assert.ok(studioAuto.includes('CẤM LAN MAN'));
});

test('JSON parsers preserve durationReport shortfallReason when AI reports unmet minimum duration', () => {
  const readingParsed = parseReadingWebAiResponse(
    JSON.stringify({
      title: 'Short Demo',
      topicBadge: 'B1 · READING',
      level: 'B1',
      durationReport: {
        targetMinutes: 30,
        estimatedMinutes: 3.2,
        estimatedCount: 400,
        metMinimum: false,
        shortfallReason: 'Model output limit stopped after ~400 words.',
      },
      text: 'Sentence one.\nSentence two.',
    }),
    'B1',
  );
  assert.ok(readingParsed?.durationReport);
  assert.equal(readingParsed?.durationReport?.metMinimum, false);
  assert.equal(readingParsed?.durationReport?.targetMinutes, 30);
  assert.equal(readingParsed?.durationReport?.estimatedMinutes, 3.2);
  assert.match(readingParsed?.durationReport?.shortfallReason || '', /output limit/i);

  const reelsParsed = parseEnglishReelsAiJson(
    JSON.stringify({
      title: 'Quick Hook | B1',
      mode: 'vocab',
      learningLang: 'en',
      durationReport: {
        targetMinutes: 30,
        estimatedMinutes: 4,
        estimatedCount: 520,
        metMinimum: false,
        shortfallReason: 'Source snippet had only 3 expressions; cannot reach 30m without fluff.',
      },
      cards: [
        { type: 'vocab', word: 'articulate', content: 'She is articulate.', ttsText: 'She is articulate.' },
      ],
    }),
    { targetLang: 'vi' },
  );
  assert.equal(reelsParsed?.durationReport?.metMinimum, false);
  assert.match(reelsParsed?.durationReport?.shortfallReason || '', /Source snippet/i);

  const sceneParsed = parseScenePlanJson(
    JSON.stringify({
      version: '1.9',
      title: 'Scene Demo',
      durationReport: {
        targetMinutes: 30,
        estimatedMinutes: 2.5,
        metMinimum: false,
        shortfallReason: 'Uploaded audio is only 150 seconds.',
      },
      scenes: [
        {
          id: 's1',
          startTime: 0,
          endTime: 3,
          elements: [{ id: 'e1', kind: 'title-card', text: 'Hello', startTime: 0, endTime: 3 }],
        },
      ],
    }),
  );
  assert.equal(sceneParsed?.durationReport?.metMinimum, false);
  assert.match(sceneParsed?.durationReport?.shortfallReason || '', /150 seconds/i);
});







