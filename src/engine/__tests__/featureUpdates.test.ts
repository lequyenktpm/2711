import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {
  hitTestCanvasOverlayZone,
  resolveElementLayoutForAspect,
  resolveLessonTitleBox,
} from '../canvasRenderer';
import { computeSpeechLipSyncState } from '../cartoonHostAnimator';
import {
  buildAiCreatorWebAiPrompt,
  buildReelCardsRuleBased,
  buildTranslationChallengePrompt,
  recommendCreatorItemCount,
  recommendTranslationItemCount,
  reelCardsToLessonProject,
} from '../englishReelsEngine';
import {
  detectActiveStageOverlaps,
  reflowElementsAvoidingOverlap,
} from '../layoutSolver';
import {
  buildBatchPromptZipName,
  generateBatchPromptsForTopics,
  getBatchPromptSubfolder,
} from '../multiTabBatchHelper';
import {
  buildReadingWebAiPrompt,
  computeReadingTargetLength,
} from '../readingPromptBuilder';
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

