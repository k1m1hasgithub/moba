// Lanefall: synthesized sound effects (WebAudio, no files).
'use strict';
(function (LF) {
let ac = null, master = null, muted = false, noiseBuf = null;
const lastPlay = {};

function load() {
  try { muted = localStorage.getItem('lf-muted') === '1'; } catch (e) { /* storage blocked */ }
}
load();

function ensure() {
  if (ac) return ac;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ac = new AC();
  master = ac.createGain();
  master.gain.value = muted ? 0 : 0.5;
  const comp = ac.createDynamicsCompressor();
  master.connect(comp); comp.connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ac;
}
// Browsers only start audio after a user gesture.
function unlock() { const a = ensure(); if (a && a.state === 'suspended') a.resume(); }
['pointerdown', 'keydown', 'touchstart'].forEach(e => window.addEventListener(e, unlock, { passive: true }));

function tone(type, f0, f1, dur, vol, when) {
  const t = (when || 0) + ac.currentTime;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol, freq, q, when, sweep) {
  const t = (when || 0) + ac.currentTime;
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = q || 1;
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}

const SOUNDS = {
  click: v => tone('triangle', 880, 660, 0.06, 0.15 * v),
  hover: v => tone('sine', 1200, 1100, 0.03, 0.05 * v),
  swing: v => noise(0.12, 0.25 * v, 1800, 1.2, 0, 600),
  shoot: v => { noise(0.06, 0.3 * v, 2500, 2); tone('square', 220, 90, 0.08, 0.06 * v); },
  bow: v => { tone('triangle', 520, 260, 0.1, 0.12 * v); noise(0.08, 0.12 * v, 3000, 3); },
  magic: v => { tone('sine', 700, 1200, 0.12, 0.1 * v); tone('triangle', 1400, 900, 0.1, 0.05 * v); },
  hit: v => noise(0.07, 0.25 * v, 900, 1.5),
  hurt: v => { tone('sawtooth', 160, 90, 0.12, 0.08 * v); noise(0.08, 0.15 * v, 600, 1); },
  cast: v => { tone('sine', 400, 900, 0.18, 0.12 * v); noise(0.18, 0.08 * v, 1600, 2, 0, 3200); },
  ult: v => { tone('sawtooth', 110, 440, 0.4, 0.1 * v); tone('sine', 220, 880, 0.45, 0.12 * v); noise(0.4, 0.12 * v, 800, 1, 0, 4000); },
  whoosh: v => noise(0.25, 0.25 * v, 600, 1, 0, 2400),
  boom: v => { tone('sine', 120, 40, 0.5, 0.35 * v); noise(0.45, 0.35 * v, 400, 0.8, 0, 120); },
  tower: v => { tone('sine', 90, 30, 0.9, 0.45 * v); noise(0.9, 0.4 * v, 300, 0.7, 0, 80); noise(0.4, 0.2 * v, 2400, 1, 0.1, 600); },
  gold: v => { tone('square', 1320, 0, 0.05, 0.04 * v); tone('square', 1760, 0, 0.07, 0.04 * v, 0.05); },
  level: v => { [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, 0, 0.18, 0.12 * v, i * 0.07)); },
  kill: v => { tone('sawtooth', 220, 110, 0.25, 0.1 * v); [392, 523, 659].forEach((f, i) => tone('triangle', f, 0, 0.22, 0.12 * v, 0.05 + i * 0.06)); },
  death: v => { [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, 0, 0.25, 0.12 * v, i * 0.1)); },
  victory: v => { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone('triangle', f, 0, 0.35, 0.14 * v, i * 0.12)); },
  defeat: v => { [392, 370, 330, 262, 196].forEach((f, i) => tone('sine', f, 0, 0.45, 0.14 * v, i * 0.16)); },
  start: v => { tone('sawtooth', 110, 220, 0.6, 0.08 * v); [262, 392, 523].forEach((f, i) => tone('triangle', f, 0, 0.5, 0.1 * v, 0.2 + i * 0.12)); },
  deny: v => tone('square', 180, 140, 0.08, 0.06 * v),
};

function play(name, vol) {
  if (muted) return;
  const a = ensure();
  if (!a || a.state !== 'running') return;
  const t = performance.now();
  if (lastPlay[name] && t - lastPlay[name] < 40) return; // avoid stacking the same sound
  lastPlay[name] = t;
  const fn = SOUNDS[name];
  if (fn) fn(vol === undefined ? 1 : vol);
}

function setMuted(m) {
  muted = m;
  try { localStorage.setItem('lf-muted', m ? '1' : '0'); } catch (e) { /* ignore */ }
  if (master) master.gain.value = m ? 0 : 0.5;
}

LF.audio = { play, setMuted, get muted() { return muted; } };
})(window.LF);
