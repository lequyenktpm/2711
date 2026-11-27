import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  abortRenderTaskSlot,
  checkRenderConcurrencyConflict,
  clearRenderTaskFeedback,
  finishRenderTaskSlot,
  getActiveBlockingTaskFromMap,
  getAppTabForSlot,
  getRenderSlotLabel,
  getRenderTask,
  getRenderTasksSnapshot,
  isTaskActiveStatus,
  shouldBlockPageUnload,
  startRenderTaskSlot,
  updateRenderTaskSlot,
} from '../renderTaskManager';
import {
  BatchCheckpointState,
  normalizeInterruptedAiItems,
  normalizeInterruptedStudioItems,
  summarizeBatchRecovery,
} from '../renderCheckpointStore';
import {
  selectMp4ExportStrategy,
  shouldUseFastStartInMemory,
} from '../mp4Exporter';

test('renderTaskManager isolates sub-tabs (reels:creator vs reels:translation)', () => {
  startRenderTaskSlot('reels:creator', {
    kind: 'render',
    title: '30 Min Phrasal Verbs',
    stageLabel: 'Đang render MP4...',
    progress: 0.42,
  });

  const creatorState = getRenderTask('reels:creator');
  const translationState = getRenderTask('reels:translation');
  const sourceState = getRenderTask('reels:source');

  assert.equal(creatorState.status, 'rendering');
  assert.equal(creatorState.progress, 0.42);
  assert.equal(creatorState.title, '30 Min Phrasal Verbs');

  // Other sub-tabs remain completely idle — no progress bleed!
  assert.equal(translationState.status, 'idle');
  assert.equal(translationState.progress, 0);
  assert.equal(sourceState.status, 'idle');

  const snap = getRenderTasksSnapshot();
  assert.equal(shouldBlockPageUnload(snap), true);

  // Conflict check for another sub-tab warns clearly about reels:creator
  const conflict = checkRenderConcurrencyConflict(snap, 'reels:translation');
  assert.ok(conflict);
  assert.equal(conflict.blockingTask.slotId, 'reels:creator');
  assert.match(conflict.message, /AI Tạo Từ & Câu/);
  assert.match(conflict.message, /42%/);

  // Same slot is NOT blocked by itself
  assert.equal(checkRenderConcurrencyConflict(snap, 'reels:creator'), null);

  // Cleanup slot and confirm idle + unload unblocked
  finishRenderTaskSlot('reels:creator', {
    status: 'done',
    notice: 'Đã xuất xong MP4',
  });
  assert.equal(shouldBlockPageUnload(getRenderTasksSnapshot()), false);
  assert.equal(checkRenderConcurrencyConflict(getRenderTasksSnapshot(), 'reels:translation'), null);
  clearRenderTaskFeedback('reels:creator');
  assert.equal(getRenderTask('reels:creator').status, 'idle');
});

test('renderTaskManager abort handler & update progress work per slot without affecting others', () => {
  let aborted = false;
  startRenderTaskSlot('studio', {
    kind: 'render',
    title: 'Main Lesson',
    stageLabel: 'Khởi tạo...',
    progress: 0.1,
    onAbort: () => {
      aborted = true;
    },
  });
  updateRenderTaskSlot('studio', { progress: 0.65, stageLabel: 'Đang ghép FFmpeg...' });
  assert.equal(getRenderTask('studio').progress, 0.65);
  assert.equal(getRenderTask('batch').status, 'idle');

  const didAbort = abortRenderTaskSlot('studio');
  assert.equal(didAbort, true);
  assert.equal(aborted, true);

  finishRenderTaskSlot('studio', { status: 'aborted' });
  assert.equal(getRenderTask('studio').status, 'aborted');
  assert.equal(isTaskActiveStatus('aborted'), false);
  assert.equal(isTaskActiveStatus('synthesizing'), true);
  assert.equal(getActiveBlockingTaskFromMap(getRenderTasksSnapshot()), null);
});

test('getAppTabForSlot and getRenderSlotLabel cover all 8 task slots', () => {
  assert.deepEqual(getAppTabForSlot('studio'), { activeTab: 'studio' });
  assert.deepEqual(getAppTabForSlot('reels:source'), { activeTab: 'reels', reelsMode: 'source' });
  assert.deepEqual(getAppTabForSlot('reels:creator'), { activeTab: 'reels', reelsMode: 'creator' });
  assert.deepEqual(getAppTabForSlot('reels:translation'), {
    activeTab: 'reels',
    reelsMode: 'translation',
  });
  assert.deepEqual(getAppTabForSlot('batch'), { activeTab: 'studio', openBatch: true });
  assert.deepEqual(getAppTabForSlot('edu:reading'), { activeTab: 'edu-studio' });
  assert.deepEqual(getAppTabForSlot('edu:merge'), { activeTab: 'edu-studio' });
  assert.deepEqual(getAppTabForSlot('edu:karaoke'), { activeTab: 'edu-studio' });
  assert.ok(getRenderSlotLabel('batch').includes('Batch'));
});

test('renderCheckpointStore normalizes interrupted items and summarizes 19/20 batch recovery', () => {
  const studioItems = Array.from({ length: 20 }, (_, i) => ({
    id: `st_${i + 1}`,
    baseName: `lesson_${i + 1}`,
    status: (i < 19 ? 'done' : 'rendering') as
      | 'done'
      | 'rendering'
      | 'pending'
      | 'generating-json'
      | 'prompt-ready'
      | 'error',
    progress: i < 19 ? 1 : 0.45,
    detail: i < 19 ? 'Xong' : 'Đang render...',
    hasAudioFile: true,
    hasSrtFile: true,
    hasJsonFile: true,
  }));

  const normalizedStudio = normalizeInterruptedStudioItems(studioItems);
  assert.equal(normalizedStudio[18].status, 'done');
  assert.equal(normalizedStudio[19].status, 'pending');
  assert.equal(normalizedStudio[19].progress, 0);

  const aiItems = [
    {
      id: 'ai_1',
      subTab: 'creator' as const,
      sourceFileName: '1.json',
      title: 'Bài 1',
      learningLanguage: 'English',
      payload: {
        kind: 'creator' as const,
        subTab: 'creator' as const,
        title: 'Bài 1',
        learningLanguage: 'English',
        cards: [],
        reelMode: 'long-vocab' as const,
      },
      status: 'done' as const,
      progress: 1,
      detail: 'Xong',
    },
    {
      id: 'ai_2',
      subTab: 'creator' as const,
      sourceFileName: '2.json',
      title: 'Bài 2',
      learningLanguage: 'English',
      payload: {
        kind: 'creator' as const,
        subTab: 'creator' as const,
        title: 'Bài 2',
        learningLanguage: 'English',
        cards: [],
        reelMode: 'long-vocab' as const,
      },
      status: 'synthesizing' as const,
      progress: 0.3,
      detail: 'TTS...',
    },
  ];

  const normalizedAi = normalizeInterruptedAiItems(aiItems);
  assert.equal(normalizedAi[0].status, 'done');
  assert.equal(normalizedAi[1].status, 'pending');

  const checkpoint: BatchCheckpointState = {
    version: 1,
    updatedAt: Date.now(),
    wasRunning: true,
    batchSubTab: 'studio',
    batchMode: 'render',
    saveMode: 'disk',
    customSavePath: 'Batch/Vocab',
    outputDirName: 'MyOutput',
    studioItems: normalizedStudio,
    aiItems: [],
  };

  const summary = summarizeBatchRecovery(checkpoint);
  assert.equal(summary.hasCheckpoint, true);
  assert.equal(summary.wasInterrupted, true);
  assert.equal(summary.totalCount, 20);
  assert.equal(summary.doneCount, 19);
  assert.equal(summary.pendingCount, 1);
  assert.equal(summary.outputDirName, 'MyOutput');
});

test('mp4Exporter routes 30-min videos to server-ffmpeg-first and disables in-memory fastStart > 90s', () => {
  assert.equal(selectMp4ExportStrategy(30, 30), 'webcodecs-first');
  assert.equal(selectMp4ExportStrategy(120, 30), 'webcodecs-first');
  assert.equal(selectMp4ExportStrategy(180, 30), 'server-ffmpeg-first');
  assert.equal(selectMp4ExportStrategy(1800, 30), 'server-ffmpeg-first'); // 30 minutes
  assert.equal(selectMp4ExportStrategy(100, 60), 'server-ffmpeg-first'); // 6000 frames >= 5400

  assert.equal(shouldUseFastStartInMemory(30), true);
  assert.equal(shouldUseFastStartInMemory(90), true);
  assert.equal(shouldUseFastStartInMemory(91), false);
  assert.equal(shouldUseFastStartInMemory(1800), false);
});

test('vite.config.ts ignores runtime output and studio temp directories to stop spurious HMR reloads', () => {
  const viteConfigText = fs.readFileSync(path.resolve(process.cwd(), 'vite.config.ts'), 'utf-8');
  assert.match(viteConfigText, /\*\*\/output\/\*\*/);
  assert.match(viteConfigText, /\*\*\/\.studio-tmp\/\*\*/);
  assert.match(viteConfigText, /\*\*\/\.render-tmp\/\*\*/);
  assert.match(viteConfigText, /\*\*\/data\/\*\*/);
});
