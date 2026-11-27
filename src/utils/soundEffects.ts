let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    if (!sharedAudioCtx) {
      sharedAudioCtx = new Ctor();
    }
    if (sharedAudioCtx.state === 'suspended') {
      void sharedAudioCtx.resume().catch(() => undefined);
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

export function playExportCompleteSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const notes = [587.33, 880]; // D5 -> A5 pleasant completion chime
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);
      gain.gain.setValueAtTime(0.0001, now + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.12, now + idx * 0.11 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.11 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.3);
    });
  } catch {
    // ignore Web Audio playback errors
  }
}

export function playCountdownTickSound(isFinal = false): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isFinal ? 1046.5 : 740, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(isFinal ? 0.14 : 0.08, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (isFinal ? 0.22 : 0.09));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + (isFinal ? 0.24 : 0.11));
  } catch {
    // ignore Web Audio playback errors
  }
}

export function playCountdownRevealChime(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const notes = [659.25, 987.77]; // E5 -> B5 reveal chime
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      gain.gain.setValueAtTime(0.0001, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.11, now + idx * 0.08 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.24);
    });
  } catch {
    // ignore Web Audio playback errors
  }
}

export function playTtsCompleteSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const totalDurationSec = 2.0;

    // Gentle ascending arpeggio notes leading into a warm 2.0s sustained harmonic chord
    const notes: Array<{ freq: number; delay: number; peak: number; dur: number }> = [
      { freq: 523.25, delay: 0.0, peak: 0.1, dur: 0.55 }, // C5
      { freq: 659.25, delay: 0.14, peak: 0.1, dur: 0.65 }, // E5
      { freq: 783.99, delay: 0.28, peak: 0.11, dur: 0.85 }, // G5
      { freq: 1046.5, delay: 0.44, peak: 0.12, dur: 1.56 }, // C6 sustains cleanly to t = 2.0s
    ];

    notes.forEach(({ freq, delay, peak, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startAt = now + delay;
      const stopAt = Math.min(now + totalDurationSec, startAt + dur);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(stopAt);
    });

    // Warm underlying harmonic pad stretching across the full 2.0 seconds
    const padOsc = ctx.createOscillator();
    const padGain = ctx.createGain();
    padOsc.type = 'triangle';
    padOsc.frequency.setValueAtTime(523.25, now); // C5 warmth
    padGain.gain.setValueAtTime(0.0001, now);
    padGain.gain.exponentialRampToValueAtTime(0.055, now + 0.18);
    padGain.gain.exponentialRampToValueAtTime(0.0001, now + totalDurationSec);
    padOsc.connect(padGain);
    padGain.connect(ctx.destination);
    padOsc.start(now);
    padOsc.stop(now + totalDurationSec);
  } catch {
    // ignore Web Audio playback errors
  }
}

