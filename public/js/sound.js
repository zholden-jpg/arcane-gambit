// Tiny synthesized sound effects (Web Audio, no audio files).
// Muted when: the player turns sound off, the portal says so (e.g. CrazyGames muteAudio),
// or an ad is playing.

let ctx = null;
const state = { user: false, platform: false, ad: false };

export const isMuted = () => state.user || state.platform || state.ad;
export function setMuted(kind, value) {
  state[kind] = !!value;
  if (ctx && isMuted() && ctx.state === 'running') ctx.suspend().catch(() => {});
}

function audio() {
  if (isMuted()) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  return ctx;
}

// iOS suspends audio after interruptions: resume on the next touch/click.
for (const ev of ['pointerdown', 'touchend', 'keydown']) {
  document.addEventListener(ev, () => { if (ctx && !isMuted() && ctx.state !== 'running') ctx.resume().catch(() => {}); }, { passive: true });
}

function tone({ freq = 440, to = null, dur = 0.12, type = 'sine', gain = 0.12, delay = 0 }) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.4, gain = 0.25, delay = 0, cutoff = 900 }) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export const sfx = {
  select: () => tone({ freq: 660, dur: 0.05, type: 'triangle', gain: 0.05 }),
  move: () => tone({ freq: 220, to: 180, dur: 0.09, type: 'triangle', gain: 0.14 }),
  capture: () => { tone({ freq: 160, to: 90, dur: 0.14, type: 'square', gain: 0.07 }); noise({ dur: 0.12, gain: 0.12, cutoff: 2500 }); },
  boom: () => { noise({ dur: 0.7, gain: 0.35, cutoff: 700 }); tone({ freq: 90, to: 40, dur: 0.5, type: 'sawtooth', gain: 0.1 }); },
  portal: () => { tone({ freq: 400, to: 1200, dur: 0.25, type: 'sine', gain: 0.08 }); tone({ freq: 1200, to: 600, dur: 0.2, type: 'sine', gain: 0.05, delay: 0.2 }); },
  check: () => { tone({ freq: 880, dur: 0.08, type: 'square', gain: 0.05 }); tone({ freq: 880, dur: 0.08, type: 'square', gain: 0.05, delay: 0.12 }); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.25, type: 'triangle', gain: 0.1, delay: i * 0.12 })),
  lose: () => [392, 330, 262].forEach((f, i) => tone({ freq: f, dur: 0.3, type: 'triangle', gain: 0.1, delay: i * 0.18 })),
};
