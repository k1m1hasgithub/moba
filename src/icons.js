// Lanefall: procedural icons for items, skills, hero passives, battle spells and buffs.
// Every icon is drawn once on a canvas and cached as a data URL. Glyphs are drawn in a 100x100 box
// centered on (0, 0); frames add a lit background, gloss and an ornate border.
'use strict';
(function (LF) {
const D = LF.data, A = LF.art;
const TAU = Math.PI * 2;
const cache = new Map();
const SZ = 128;

function make(key, draw) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = SZ;
  const g = c.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round';
  draw(g);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------
// o: { tint, edge, shape: 'square' | 'round' | 'circle', rays, corners, glowColor }
function shapePath(g, shape) {
  if (shape === 'circle') { g.beginPath(); g.arc(SZ / 2, SZ / 2, SZ / 2 - 3, 0, TAU); return; }
  A.rrect(g, 3, 3, SZ - 6, SZ - 6, shape === 'round' ? 26 : 14);
}
function framed(g, o, glyph) {
  const tint = o.tint;
  g.save();
  shapePath(g, o.shape); g.clip();
  // Lit background
  const bg = g.createRadialGradient(SZ * 0.42, SZ * 0.34, 4, SZ / 2, SZ / 2, SZ * 0.75);
  bg.addColorStop(0, A.shade(tint, 0.28)); bg.addColorStop(0.45, A.shade(tint, -0.25)); bg.addColorStop(1, A.shade(tint, -0.78));
  g.fillStyle = bg; g.fillRect(0, 0, SZ, SZ);
  // Soft light rays or a faint rune ring behind the glyph
  g.save(); g.translate(SZ / 2, SZ / 2);
  if (o.rays) {
    g.globalAlpha = 0.13; g.fillStyle = '#fff4d0';
    for (let i = 0; i < 12; i++) { g.rotate(TAU / 12); g.beginPath(); g.moveTo(0, 0); g.lineTo(-7, -SZ); g.lineTo(7, -SZ); g.closePath(); g.fill(); }
  } else {
    g.globalAlpha = 0.12; g.strokeStyle = '#ffffff'; g.lineWidth = 2;
    g.beginPath(); g.arc(0, 0, SZ * 0.36, 0, TAU); g.stroke();
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; g.beginPath(); g.moveTo(Math.cos(a) * SZ * 0.33, Math.sin(a) * SZ * 0.33); g.lineTo(Math.cos(a) * SZ * 0.39, Math.sin(a) * SZ * 0.39); g.stroke(); }
  }
  g.restore();
  if (o.glowColor) A.glow(g, SZ / 2, SZ / 2, SZ * 0.42, o.glowColor, 0.45);
  // Glyph
  g.save(); g.translate(SZ / 2, SZ / 2); g.scale(SZ / 100, SZ / 100);
  glyph(g);
  g.restore();
  // Gloss and vignette
  const gl = g.createLinearGradient(0, 0, 0, SZ * 0.55);
  gl.addColorStop(0, 'rgba(255,255,255,0.20)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gl; g.beginPath(); g.ellipse(SZ / 2, SZ * 0.05, SZ * 0.62, SZ * 0.42, 0, 0, TAU); g.fill();
  const vg = g.createRadialGradient(SZ / 2, SZ / 2, SZ * 0.36, SZ / 2, SZ / 2, SZ * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = vg; g.fillRect(0, 0, SZ, SZ);
  g.restore();
  // Border: dark outer line, metallic band, thin inner light
  const edge = o.edge;
  shapePath(g, o.shape); g.lineWidth = 7; g.strokeStyle = 'rgba(6,9,12,0.9)'; g.stroke();
  const eg = g.createLinearGradient(0, 0, SZ, SZ);
  eg.addColorStop(0, A.shade(edge, 0.45)); eg.addColorStop(0.5, edge); eg.addColorStop(1, A.shade(edge, -0.45));
  shapePath(g, o.shape); g.lineWidth = 4; g.strokeStyle = eg; g.stroke();
  g.save(); g.translate(SZ / 2, SZ / 2); g.scale(0.9, 0.9); g.translate(-SZ / 2, -SZ / 2);
  shapePath(g, o.shape); g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,0.18)'; g.stroke();
  g.restore();
  if (o.corners) {
    for (const [x, y] of [[9, 9], [SZ - 9, 9], [9, SZ - 9], [SZ - 9, SZ - 9]]) {
      g.save(); g.translate(x, y); g.rotate(Math.PI / 4);
      g.fillStyle = A.shade(edge, 0.3); g.fillRect(-5, -5, 10, 10);
      g.fillStyle = o.cornerGem || '#ff5a6a'; g.fillRect(-2.5, -2.5, 5, 5);
      g.restore();
    }
  }
}

// ---------------------------------------------------------------------------
// Painting helpers (glyph space, roughly -45..45)
// ---------------------------------------------------------------------------
function grad(g, base, x0 = -30, y0 = -30, x1 = 30, y1 = 30, hi = 0.55, lo = -0.5) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, A.shade(base, hi)); gr.addColorStop(0.5, base); gr.addColorStop(1, A.shade(base, lo));
  return gr;
}
// Fill a path with a shaded gradient, drop shadow and dark outline.
function solid(g, path, base, o = {}) {
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 7; g.shadowOffsetY = 3;
  path(); g.fillStyle = o.fill || grad(g, base, ...(o.box || [])); g.fill();
  g.restore();
  if (o.outline !== false) { path(); g.lineWidth = o.lw || 2.2; g.strokeStyle = o.stroke || A.shade(base, -0.72); g.stroke(); }
}
function line(g, pts, color, w, glowColor) {
  g.save();
  if (glowColor) { g.shadowColor = glowColor; g.shadowBlur = 10; }
  g.strokeStyle = color; g.lineWidth = w;
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  g.restore();
}
function shine(g, x, y, rx, ry, rot, a) {
  g.save(); g.globalAlpha = a || 0.55; g.fillStyle = '#ffffff';
  g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, TAU); g.fill(); g.restore();
}
function spark(g, x, y, r, color) {
  g.save();
  A.glow(g, x, y, r * 2.2, color || '#fff6c8', 0.7);
  g.fillStyle = '#ffffff';
  g.beginPath();
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU - Math.PI / 2, rr = i % 2 ? r * 0.28 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fill();
  g.restore();
}
function poly(g, pts) { return () => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); }; }
function circ(g, x, y, r) { return () => { g.beginPath(); g.arc(x, y, r, 0, TAU); }; }
function rect(g, x, y, w, h, r) { return () => A.rrect(g, x, y, w, h, r || 0); }
function rotated(g, ang, fn) { g.save(); g.rotate(ang); fn(); g.restore(); }
function bolt(g, x0, y0, x1, y1, color, w, seed) {
  const n = 6, pts = [[x0, y0]];
  for (let i = 1; i < n; i++) {
    const t = i / n, j = Math.sin((seed || 1) * 7.3 + i * 2.1) * 6;
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
    pts.push([x0 + dx * t - dy / L * j, y0 + dy * t + dx / L * j]);
  }
  pts.push([x1, y1]);
  line(g, pts, color, w + 3, color);
  line(g, pts, '#ffffff', w * 0.5);
}

const STEEL = '#b9c3cf', GOLD = '#f0c35a', WOOD = '#8a5a32', LEATHER = '#6a4428';

// A straight blade along -y with tip at (0, -len), hilt below the origin.
function blade(g, len, w, color, o = {}) {
  solid(g, poly(g, [[0, -len], [w, -len + w * 1.6], [w, 8], [-w, 8], [-w, -len + w * 1.6]]), color || STEEL, { box: [-w, -len, w, 8] });
  line(g, [[0, -len + w * 2], [0, 4]], A.shade(color || STEEL, -0.35), 1.6);
  shine(g, -w * 0.45, -len * 0.45, w * 0.22, len * 0.28, 0, 0.45);
  const gw = o.guard || w * 2.6;
  solid(g, rect(g, -gw, 8, gw * 2, 6, 2), o.guardColor || GOLD);
  solid(g, rect(g, -3, 14, 6, o.grip || 14, 2), LEATHER);
  solid(g, circ(g, 0, 16 + (o.grip || 14), 4.5), o.guardColor || GOLD);
}

// ---------------------------------------------------------------------------
// Item glyphs
// ---------------------------------------------------------------------------
const ITEM_DRAW = {
  dagger: g => rotated(g, -Math.PI / 4, () => blade(g, 30, 5, STEEL, { grip: 10 })),
  sword: g => rotated(g, -Math.PI / 4, () => blade(g, 40, 6, '#c8d2de', { grip: 12 })),
  greatsword: (g, it) => {
    A.glow(g, 0, 0, 42, '#ff4a5a', 0.35);
    rotated(g, -Math.PI / 4, () => {
      solid(g, poly(g, [[0, -46], [10, -34], [8, -26], [11, -20], [9, -10], [11, -2], [10, 8], [-10, 8], [-11, -2], [-9, -10], [-11, -20], [-8, -26], [-10, -34]]), '#d4dbe4', { box: [-10, -46, 10, 8] });
      line(g, [[0, -36], [0, 2]], '#ff5a6a', 3, '#ff3a4a');
      solid(g, poly(g, [[-22, 6], [0, 10], [22, 6], [18, 14], [0, 16], [-18, 14]]), GOLD);
      solid(g, rect(g, -3.5, 16, 7, 14, 2), '#4a2a2a');
      solid(g, circ(g, 0, 33, 5), '#ff4a5a');
    });
  },
  machete: (g, it) => {
    rotated(g, -Math.PI / 4, () => {
      solid(g, () => { g.beginPath(); g.moveTo(-6, 8); g.lineTo(-6, -24); g.quadraticCurveTo(-4, -42, 10, -40); g.quadraticCurveTo(12, -12, 6, 8); g.closePath(); }, it.tier === 1 ? '#c9b8b8' : '#b8c8a8', { box: [-6, -40, 10, 8] });
      shine(g, -1, -22, 2, 12, 0.1, 0.45);
      solid(g, rect(g, -11, 8, 22, 5, 2), it.tier === 1 ? '#8a2a2a' : '#5a7a3a');
      solid(g, rect(g, -3.5, 13, 7, 16, 2), LEATHER);
    });
    if (it.tier === 1) { for (const [x, y, r] of [[14, 6, 4], [20, 16, 3], [10, 20, 2.5]]) solid(g, () => { g.beginPath(); g.moveTo(x, y - r * 2); g.quadraticCurveTo(x + r, y, x, y + r); g.quadraticCurveTo(x - r, y, x, y - r * 2); }, '#d02a3a'); }
  },
  bow: g => {
    rotated(g, -Math.PI / 4, () => {
      solid(g, () => { g.beginPath(); g.moveTo(0, -38); g.quadraticCurveTo(26, -20, 22, 0); g.quadraticCurveTo(26, 20, 0, 38); g.lineTo(3, 34); g.quadraticCurveTo(20, 18, 17, 0); g.quadraticCurveTo(20, -18, 3, -34); g.closePath(); }, WOOD, { box: [0, -38, 26, 38] });
      line(g, [[1, -36], [1, 36]], '#efe6cf', 1.6);
      line(g, [[1, 0], [-34, 0]], '#d8c8a8', 2.4);
      solid(g, poly(g, [[-40, 0], [-31, -5], [-31, 5]]), STEEL);
      solid(g, poly(g, [[4, 0], [10, -4], [10, 4]]), '#c84a3a');
    });
  },
  stormbow: g => {
    A.glow(g, 0, 0, 44, '#7ad0ff', 0.4);
    rotated(g, -Math.PI / 4, () => {
      solid(g, () => { g.beginPath(); g.moveTo(0, -40); g.quadraticCurveTo(28, -22, 24, 0); g.quadraticCurveTo(28, 22, 0, 40); g.lineTo(3, 35); g.quadraticCurveTo(21, 18, 18, 0); g.quadraticCurveTo(21, -18, 3, -35); g.closePath(); }, '#5a8ac8', { box: [0, -40, 28, 40] });
      line(g, [[1, -38], [1, 38]], '#dff4ff', 1.6, '#9fdcff');
    });
    bolt(g, 22, -22, -24, 24, '#9fdcff', 3.5, 3);
    spark(g, -24, 24, 6, '#bfe8ff');
  },
  fang: g => {
    solid(g, () => { g.beginPath(); g.moveTo(-16, -30); g.quadraticCurveTo(18, -26, 14, -6); g.quadraticCurveTo(8, 16, -2, 34); g.quadraticCurveTo(-4, 6, -18, -14); g.closePath(); }, '#efe4cc', { box: [-18, -30, 18, 34] });
    shine(g, -4, -16, 3, 10, -0.4, 0.5);
    solid(g, () => { g.beginPath(); g.moveTo(-2, 34); g.quadraticCurveTo(2, 22, 4, 16); g.quadraticCurveTo(6, 24, -2, 34); }, '#d02a3a', { outline: false });
    solid(g, () => { g.beginPath(); g.moveTo(8, 26); g.quadraticCurveTo(12, 32, 8, 36); g.quadraticCurveTo(4, 32, 8, 26); }, '#d02a3a');
  },
  axe: (g, it) => {
    if (it.tier === 1) A.glow(g, 6, -8, 40, '#ff6a4a', 0.3);
    rotated(g, -Math.PI / 5, () => {
      solid(g, rect(g, -3.5, -36, 7, 76, 3), WOOD, { box: [-4, -36, 4, 40] });
      solid(g, () => { g.beginPath(); g.moveTo(2, -30); g.quadraticCurveTo(34, -36, 36, -8); g.quadraticCurveTo(30, 8, 2, 4); g.closePath(); }, '#c8d0da', { box: [2, -36, 36, 8] });
      line(g, [[30, -30], [34, -8], [28, 2]], it.tier === 1 ? '#ff5a5a' : '#ffffff', 2.5, it.tier === 1 ? '#ff3a3a' : null);
      solid(g, () => { g.beginPath(); g.moveTo(-2, -26); g.quadraticCurveTo(-18, -22, -18, -12); g.quadraticCurveTo(-12, -6, -2, -4); g.closePath(); }, '#9aa4b0');
      solid(g, rect(g, -5, -32, 10, 6, 2), GOLD);
    });
  },
  hammer: g => {
    rotated(g, -Math.PI / 4, () => {
      solid(g, rect(g, -3.5, -14, 7, 54, 3), WOOD, { box: [-4, -14, 4, 40] });
      solid(g, rect(g, -24, -38, 48, 24, 4), '#8a96a4', { box: [-24, -38, 24, -14] });
      solid(g, rect(g, -26, -32, 6, 12, 2), GOLD); solid(g, rect(g, 20, -32, 6, 12, 2), GOLD);
      solid(g, circ(g, 0, -26, 6), '#ff9a3a');
      shine(g, -10, -33, 10, 2.5, 0, 0.5);
      solid(g, rect(g, -5, 30, 10, 8, 2), GOLD);
    });
  },
  staff: (g, it) => {
    rotated(g, Math.PI / 5, () => {
      solid(g, rect(g, -3, -20, 6, 62, 3), WOOD, { box: [-3, -20, 3, 42] });
      solid(g, () => { g.beginPath(); g.moveTo(-10, -18); g.quadraticCurveTo(-14, -34, 0, -40); g.quadraticCurveTo(14, -34, 10, -18); g.lineTo(6, -22); g.quadraticCurveTo(8, -32, 0, -34); g.quadraticCurveTo(-8, -32, -6, -22); g.closePath(); }, GOLD);
    });
    A.glow(g, -16, -22, 26, '#c8b8ff', 0.85);
    spark(g, -16, -22, 12, '#e0d4ff');
    for (const [x, y, r] of [[8, -36, 3], [-34, -6, 2.5], [-2, -6, 2]]) spark(g, x, y, r, '#e0d4ff');
  },
  clock: g => {
    solid(g, rect(g, -24, -36, 48, 8, 3), GOLD); solid(g, rect(g, -24, 28, 48, 8, 3), GOLD);
    solid(g, rect(g, -22, -28, 5, 56, 2), WOOD); solid(g, rect(g, 17, -28, 5, 56, 2), WOOD);
    g.save(); g.globalAlpha = 0.85;
    solid(g, () => { g.beginPath(); g.moveTo(-14, -28); g.lineTo(14, -28); g.quadraticCurveTo(14, -8, 2, 0); g.quadraticCurveTo(14, 8, 14, 28); g.lineTo(-14, 28); g.quadraticCurveTo(-14, 8, -2, 0); g.quadraticCurveTo(-14, -8, -14, -28); g.closePath(); }, '#bfe8ff', { lw: 1.5 });
    g.restore();
    solid(g, poly(g, [[-10, 26], [10, 26], [0, 12]]), '#f0c86a', { outline: false });
    solid(g, poly(g, [[-8, -20], [8, -20], [0, -8]]), '#f0c86a', { outline: false });
    line(g, [[0, -6], [0, 12]], '#f0c86a', 1.5);
    shine(g, -8, -18, 2, 6, 0.3, 0.6);
  },
  crown: g => {
    A.glow(g, 0, 0, 44, '#c06aff', 0.45);
    solid(g, poly(g, [[-30, 18], [-32, -14], [-16, 0], [0, -26], [16, 0], [32, -14], [30, 18]]), GOLD, { box: [-30, -26, 30, 18] });
    solid(g, rect(g, -32, 16, 64, 10, 3), '#d8a840');
    for (const [x, y, c] of [[0, 2, '#b04aff'], [-18, 10, '#4ac8ff'], [18, 10, '#4ac8ff']]) { solid(g, circ(g, x, y, 5), c); shine(g, x - 1.5, y - 1.5, 1.5, 1.5, 0, 0.8); }
    for (const [x, y] of [[-32, -14], [0, -26], [32, -14]]) solid(g, circ(g, x, y, 3.5), '#fff1b0');
  },
  armor: (g, it, color) => {
    solid(g, poly(g, [[-28, -30], [-12, -34], [0, -28], [12, -34], [28, -30], [26, 4], [14, 28], [0, 34], [-14, 28], [-26, 4]]), color || '#9aa8b8', { box: [-28, -34, 28, 34] });
    line(g, [[0, -26], [0, 30]], '#5a6878', 2.5);
    line(g, [[-20, -6], [20, -6]], '#5a6878', 2);
    for (const [x, y] of [[-18, -22], [18, -22], [-14, 12], [14, 12]]) solid(g, circ(g, x, y, 2.5), GOLD);
    shine(g, -12, -16, 4, 10, 0.2, 0.4);
  },
  thorns: g => {
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU, x = Math.cos(a) * 30, y = Math.sin(a) * 32;
      solid(g, poly(g, [[x * 0.8 - Math.sin(a) * 4, y * 0.8 + Math.cos(a) * 4], [x * 1.25, y * 1.25], [x * 0.8 + Math.sin(a) * 4, y * 0.8 - Math.cos(a) * 4]]), '#c8d8a8');
    }
    ITEM_DRAW.armor(g, null, '#8aa878');
  },
  chain: g => {
    solid(g, poly(g, [[-24, -28], [24, -28], [26, 22], [0, 30], [-26, 22]]), '#7a8694', { box: [-26, -28, 26, 30] });
    g.save(); g.strokeStyle = '#c8d2dc'; g.lineWidth = 1.6;
    for (let y = -22; y < 26; y += 7) for (let x = -20 + ((y / 7) & 1) * 3.5; x < 22; x += 7) { g.beginPath(); g.arc(x, y, 3, 0, TAU); g.stroke(); }
    g.restore();
  },
  helm: g => {
    solid(g, () => { g.beginPath(); g.moveTo(-28, 30); g.lineTo(-28, -4); g.quadraticCurveTo(-28, -34, 0, -36); g.quadraticCurveTo(28, -34, 28, -4); g.lineTo(28, 30); g.lineTo(14, 34); g.lineTo(-14, 34); g.closePath(); }, '#c8a858', { box: [-28, -36, 28, 34] });
    solid(g, rect(g, -20, -6, 40, 7, 2), '#1a1610');
    line(g, [[0, 2], [0, 30]], '#1a1610', 3);
    line(g, [[0, -36], [0, -8]], '#8a6a2a', 3);
    solid(g, () => { g.beginPath(); g.moveTo(0, -36); g.quadraticCurveTo(26, -46, 34, -30); g.quadraticCurveTo(20, -36, 4, -30); g.closePath(); }, '#c83a3a');
    shine(g, -16, -20, 4, 9, 0.4, 0.45);
  },
  belt: g => {
    solid(g, () => { g.beginPath(); g.moveTo(-40, -4); g.quadraticCurveTo(0, 6, 40, -4); g.lineTo(40, 12); g.quadraticCurveTo(0, 22, -40, 12); g.closePath(); }, '#8a5a32', { box: [-40, -4, 40, 22] });
    for (const x of [-30, -20, 20, 30]) solid(g, circ(g, x, 6, 2.2), GOLD, { outline: false });
    solid(g, rect(g, -14, -12, 28, 32, 5), GOLD);
    solid(g, rect(g, -8, -6, 16, 20, 3), '#5a3a1a');
    solid(g, circ(g, 0, 4, 4.5), '#d0303a');
  },
  charm: g => {
    line(g, [[-20, -38], [0, -14], [20, -38]], GOLD, 2.4);
    A.glow(g, 0, 8, 34, '#b6ffc8', 0.7);
    solid(g, poly(g, [[0, -18], [20, 4], [0, 32], [-20, 4]]), '#4ac27a', { box: [-20, -18, 20, 32] });
    solid(g, poly(g, [[0, -10], [12, 4], [0, 22], [-12, 4]]), '#9cf0b0', { outline: false });
    spark(g, -4, -2, 5, '#ffffff');
    solid(g, circ(g, 0, -18, 4), GOLD);
  },
  gem: (g, it, color) => {
    color = color || '#9a6aff';
    A.glow(g, 0, 0, 38, A.shade(color, 0.3), 0.6);
    solid(g, poly(g, [[-26, -8], [-14, -24], [14, -24], [26, -8], [0, 28]]), color, { box: [-26, -24, 26, 28] });
    g.save(); g.globalAlpha = 0.5; g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(-14, -24); g.lineTo(-6, -8); g.lineTo(-26, -8); g.closePath(); g.fill();
    g.globalAlpha = 0.25; g.beginPath(); g.moveTo(-6, -8); g.lineTo(6, -8); g.lineTo(0, 28); g.closePath(); g.fill();
    g.restore();
    line(g, [[-26, -8], [26, -8]], A.shade(color, -0.6), 1.5);
    spark(g, 10, -16, 5);
  },
  ruby: (g, it) => {
    A.glow(g, 0, 0, 38, '#ff8a9a', 0.55);
    solid(g, poly(g, [[0, -28], [24, -10], [16, 24], [-16, 24], [-24, -10]]), '#d02a44', { box: [-24, -28, 24, 24] });
    solid(g, poly(g, [[0, -14], [12, -4], [8, 12], [-8, 12], [-12, -4]]), '#ff6a7a', { outline: false });
    spark(g, -8, -10, 5);
  },
  shard: g => {
    A.glow(g, 0, 4, 40, '#9fd0ff', 0.6);
    for (const [x, y, h, w, r, c] of [[-14, 8, 26, 7, -0.35, '#3a7ad0'], [14, 8, 24, 7, 0.35, '#3a7ad0'], [0, 2, 36, 9, 0, '#5aa0ff']]) {
      rotated(g, r, () => solid(g, poly(g, [[x, y - h], [x + w, y - h * 0.3], [x + w * 0.6, y + 22], [x - w * 0.6, y + 22], [x - w, y - h * 0.3]]), c));
    }
    spark(g, 2, -26, 5, '#e0f0ff');
  },
  orb: g => {
    solid(g, () => { g.beginPath(); g.moveTo(-16, 34); g.quadraticCurveTo(-22, 18, -10, 10); g.lineTo(10, 10); g.quadraticCurveTo(22, 18, 16, 34); g.closePath(); }, GOLD);
    A.glow(g, 0, -6, 34, '#9fb8ff', 0.8);
    const og = g.createRadialGradient(-6, -14, 2, 0, -6, 22);
    og.addColorStop(0, '#ffffff'); og.addColorStop(0.35, '#a8c0ff'); og.addColorStop(1, '#3a4ab0');
    solid(g, circ(g, 0, -6, 20), '#5a7ae0', { fill: og });
    line(g, [[-12, -2], [-4, -10], [4, -2], [12, -10]], 'rgba(255,255,255,0.7)', 1.5);
  },
  leaf: g => {
    solid(g, () => { g.beginPath(); g.moveTo(-26, 28); g.quadraticCurveTo(-30, -20, 28, -30); g.quadraticCurveTo(26, 22, -26, 28); g.closePath(); }, '#4ab04a', { box: [-28, -30, 28, 28] });
    line(g, [[-26, 28], [18, -20]], '#2a6a2a', 2.5);
    for (const t of [0.3, 0.5, 0.7]) { const x = -26 + 44 * t, y = 28 - 48 * t; line(g, [[x, y], [x + 10, y + 4]], '#2a6a2a', 1.5); line(g, [[x, y], [x - 4, y - 10]], '#2a6a2a', 1.5); }
    solid(g, circ(g, 14, 12, 4), '#bfefff', { lw: 1 }); shine(g, 13, 11, 1.2, 1.2, 0, 0.9);
  },
  feather: g => {
    rotated(g, Math.PI / 4, () => {
      solid(g, () => { g.beginPath(); g.moveTo(0, -40); g.quadraticCurveTo(16, -18, 10, 16); g.lineTo(0, 30); g.lineTo(-10, 16); g.quadraticCurveTo(-16, -18, 0, -40); g.closePath(); }, '#5ac8c8', { box: [-16, -40, 16, 30] });
      line(g, [[0, -38], [0, 40]], '#e8fff8', 2);
      for (let y = -28; y < 14; y += 7) { line(g, [[0, y], [10, y - 6]], 'rgba(20,80,80,0.6)', 1.2); line(g, [[0, y], [-10, y - 6]], 'rgba(20,80,80,0.6)', 1.2); }
    });
    for (const [x, y] of [[-26, 20], [-20, 30], [-32, 10]]) line(g, [[x, y], [x - 6, y + 4]], 'rgba(255,255,255,0.6)', 2);
  },
  glove: g => {
    solid(g, () => { g.beginPath(); g.moveTo(-16, 34); g.lineTo(-18, 2); g.lineTo(-26, -10); g.lineTo(-18, -14); g.lineTo(-10, -4); g.lineTo(-10, -26); g.lineTo(-2, -28); g.lineTo(0, -10); g.lineTo(4, -28); g.lineTo(12, -26); g.lineTo(10, -6); g.lineTo(18, -18); g.lineTo(24, -12); g.lineTo(16, 8); g.lineTo(16, 34); g.closePath(); }, '#c28a4a', { box: [-26, -28, 24, 34] });
    solid(g, rect(g, -18, 22, 36, 10, 3), '#8a5a2a');
    for (const [x, y, a] of [[-6, -28, 0], [8, -28, 0.2], [21, -16, 0.7]]) rotated(g, 0, () => solid(g, poly(g, [[x - 3, y + 1], [x + Math.sin(a) * 8, y - 10], [x + 3, y + 1]]), '#f0f4f8'));
    spark(g, 20, 20, 5, '#ffe08a');
  },
  tome: g => {
    solid(g, rect(g, -24, -30, 48, 60, 5), '#5a4ab0', { box: [-24, -30, 24, 30] });
    solid(g, rect(g, -24, -30, 9, 60, 3), '#3a2a7a');
    solid(g, rect(g, 18, -6, 9, 12, 2), GOLD);
    A.glow(g, 4, 0, 22, '#e0d8ff', 0.8);
    g.save(); g.strokeStyle = '#fff4c8'; g.lineWidth = 2; g.beginPath(); g.arc(4, 0, 11, 0, TAU); g.stroke(); g.restore();
    A.star(g, 4, 0, 8, 3, 5); g.fillStyle = '#fff4c8'; g.fill();
    for (const [x, y] of [[-8, -24], [16, -24], [-8, 24], [16, 24]]) solid(g, circ(g, x, y, 2), GOLD, { outline: false });
  },
  flower: g => {
    line(g, [[0, 10], [-6, 40]], '#3a7a3a', 4);
    solid(g, poly(g, [[-4, 28], [-14, 24], [-6, 22]]), '#5aa04a');
    for (let i = 0; i < 6; i++) rotated(g, i / 6 * TAU, () => solid(g, () => { g.beginPath(); g.ellipse(0, -16, 9, 15, 0, 0, TAU); }, '#d0304a', { box: [-9, -31, 9, -1] }));
    solid(g, circ(g, 0, 0, 8), '#ffd060');
    for (const [x, y] of [[-3, -2], [3, 1], [0, 3]]) solid(g, circ(g, x, y, 1.4), '#8a4a10', { outline: false });
  },
  frost: g => {
    A.glow(g, 0, 0, 44, '#bfe8ff', 0.6);
    g.save(); g.shadowColor = '#9fdcff'; g.shadowBlur = 8;
    for (let i = 0; i < 6; i++) rotated(g, i / 6 * TAU, () => {
      line(g, [[0, 0], [0, -36]], '#eaf8ff', 4.5);
      line(g, [[0, -16], [-9, -24]], '#eaf8ff', 3); line(g, [[0, -16], [9, -24]], '#eaf8ff', 3);
      line(g, [[0, -27], [-6, -32]], '#eaf8ff', 2.5); line(g, [[0, -27], [6, -32]], '#eaf8ff', 2.5);
    });
    g.restore();
    solid(g, () => A.poly(g, 0, 0, 9, 6, 0), '#7ac8f0');
  },
  boots: (g, it) => {
    const col = { warboots: '#9a6a4a', magicboots: '#7a6ad0', swiftboots: '#3ab090' }[it.id] || '#8a5a32';
    if (it.id === 'swiftboots') for (const s of [-1]) solid(g, () => { g.beginPath(); g.moveTo(-14, -12); g.quadraticCurveTo(-40, -30, -38, -2); g.quadraticCurveTo(-28, -10, -14, 0); g.closePath(); }, '#e8fff8');
    solid(g, () => { g.beginPath(); g.moveTo(-14, -32); g.lineTo(8, -32); g.lineTo(8, 4); g.quadraticCurveTo(30, 6, 32, 22); g.lineTo(32, 30); g.lineTo(-16, 30); g.closePath(); }, col, { box: [-16, -32, 32, 30] });
    solid(g, rect(g, -18, 26, 52, 7, 3), '#3a2a1a');
    solid(g, rect(g, -16, -36, 26, 8, 3), A.shade(col, 0.25));
    if (it.id === 'warboots') { solid(g, rect(g, -14, -18, 22, 8, 2), '#b8c2cc'); solid(g, rect(g, 8, 8, 18, 8, 2), '#b8c2cc'); }
    if (it.id === 'magicboots') { spark(g, -2, -12, 6, '#d8c8ff'); spark(g, 20, 14, 4, '#d8c8ff'); }
    if (it.id === 'swiftboots') for (const y of [-16, -6, 4]) line(g, [[-38, y + 16], [-26, y + 16]], 'rgba(255,255,255,0.7)', 2.5);
    shine(g, -6, -16, 2.5, 9, 0, 0.4);
  },
};
const TIER_EDGE = { 1: '#f0c35a', 2: '#c9d2dc', 3: '#b07a4a' };
const ITEM_BG = { Attack: '#a0503a', Magic: '#6a4ac0', Defense: '#3a7a6a', Movement: '#3a6aa0', Jungle: '#5a7a3a' };
function item(id) {
  return make('item:' + id, g => {
    const it = D.ITEM[id];
    framed(g, { tint: ITEM_BG[it.cat] || '#556', edge: TIER_EDGE[it.tier], shape: 'square', rays: it.tier === 1, corners: it.tier === 1, glowColor: it.tier === 1 ? '#fff0c0' : null },
      gg => (ITEM_DRAW[it.icon] || ITEM_DRAW.gem)(gg, it));
  });
}

// ---------------------------------------------------------------------------
// Skill glyphs, one per skill
// ---------------------------------------------------------------------------
const WHITE = '#fffbe8';
function arrow(g, x0, y0, x1, y1, color, w) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  line(g, [[x0, y0], [x1 - Math.cos(a) * 8, y1 - Math.sin(a) * 8]], color || WHITE, w || 4.5);
  solid(g, poly(g, [[x1, y1], [x1 - Math.cos(a - 0.45) * 13, y1 - Math.sin(a - 0.45) * 13], [x1 - Math.cos(a + 0.45) * 13, y1 - Math.sin(a + 0.45) * 13]]), color || WHITE);
  line(g, [[x0, y0], [x0 - Math.cos(a - 0.5) * 9, y0 - Math.sin(a - 0.5) * 9]], color || WHITE, 2.5);
  line(g, [[x0, y0], [x0 - Math.cos(a + 0.5) * 9, y0 - Math.sin(a + 0.5) * 9]], color || WHITE, 2.5);
}
function swoosh(g, r, a0, a1, color, w) {
  g.save(); g.shadowColor = color; g.shadowBlur = 10;
  g.strokeStyle = color; g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, a0, a1); g.stroke();
  g.lineWidth = w * 0.4; g.strokeStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, r, a0 + 0.2, a1); g.stroke();
  g.restore();
}
function shieldPath(g, s, x, y) {
  return () => { g.beginPath(); g.moveTo(x, y - 30 * s); g.lineTo(x + 26 * s, y - 20 * s); g.quadraticCurveTo(x + 26 * s, y + 14 * s, x, y + 32 * s); g.quadraticCurveTo(x - 26 * s, y + 14 * s, x - 26 * s, y - 20 * s); g.closePath(); };
}
const SKILL_DRAW = {
  'kestra:s1': g => { for (const r of [12, 24]) { g.save(); g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 3; g.beginPath(); g.ellipse(-r + 10, r - 10, 8, 14, Math.PI / 4, 0, TAU); g.stroke(); g.restore(); } arrow(g, -34, 34, 34, -34, WHITE, 5); spark(g, 30, -30, 5); },
  'kestra:s2': g => { g.save(); g.shadowColor = '#ffffff'; g.shadowBlur = 8; g.strokeStyle = WHITE; g.lineWidth = 6; g.beginPath(); g.arc(-4, 6, 22, Math.PI * 0.9, Math.PI * 2.3); g.stroke(); g.restore(); solid(g, poly(g, [[12, 28], [26, 14], [6, 12]]), WHITE); for (const y of [-6, 4, 14]) line(g, [[-40, y], [-30, y]], 'rgba(255,255,255,0.6)', 3); },
  'kestra:ult': g => { for (const [x, y] of [[-24, -30], [-6, -36], [12, -30], [-16, -10], [4, -14], [22, -12]]) arrow(g, x - 10, y - 14, x + 8, y + 18, WHITE, 3); g.save(); g.globalAlpha = 0.5; g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(0, 30, 32, 8, 0, 0, TAU); g.fill(); g.restore(); },
  'dax:s1': g => { solid(g, rect(g, -38, 4, 30, 10, 3), '#6a4a2a'); solid(g, rect(g, -14, 0, 22, 8, 2), STEEL); A.glow(g, 14, 4, 22, '#ffc04a', 0.9); for (let i = -2; i <= 2; i++) { const a = i * 0.22 - 0.1; for (const d of [22, 32]) solid(g, circ(g, 12 + Math.cos(a) * d, 4 + Math.sin(a) * d * 1.4, 2.6), '#ffe8a0', { lw: 1 }); } },
  'dax:s2': g => { rotated(g, -Math.PI / 4, () => { solid(g, () => { g.beginPath(); g.moveTo(-8, 22); g.lineTo(-8, -10); g.quadraticCurveTo(0, -30, 8, -10); g.lineTo(8, 22); g.closePath(); }, '#e0a040'); solid(g, rect(g, -9, 16, 18, 8, 2), '#b07a2a'); }); for (const [x, y, l] of [[-30, 26, 18], [-22, 34, 12], [-36, 16, 10]]) line(g, [[x, y], [x - l * 0.7, y + l * 0.7]], 'rgba(255,240,200,0.8)', 3); A.glow(g, 16, -16, 18, '#ff8a3a', 0.8); },
  'dax:ult': g => { g.save(); g.strokeStyle = '#ff5a5a'; g.shadowColor = '#ff3a3a'; g.shadowBlur = 8; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 26, 0, TAU); g.stroke(); g.lineWidth = 2.5; g.beginPath(); g.arc(0, 0, 14, 0, TAU); g.stroke(); for (const a of [0, 1, 2, 3]) rotated(g, a * Math.PI / 2, () => { g.beginPath(); g.moveTo(0, -36); g.lineTo(0, -18); g.stroke(); }); g.restore(); solid(g, circ(g, 0, 0, 4), '#ff5a5a'); },
  'brann:s1': g => { swoosh(g, 30, Math.PI * 0.95, Math.PI * 2.15, '#ffb27a', 8); rotated(g, -0.5, () => { solid(g, rect(g, -3, -6, 6, 40, 2), WOOD); solid(g, () => { g.beginPath(); g.moveTo(2, -4); g.quadraticCurveTo(28, -10, 26, 12); g.quadraticCurveTo(18, 14, 2, 8); g.closePath(); }, STEEL); }); },
  'brann:s2': g => { for (const y of [-16, -4, 8, 20]) line(g, [[-40, y], [-18, y]], 'rgba(255,255,255,0.55)', 3); solid(g, () => { g.beginPath(); g.ellipse(6, 4, 20, 18, 0, 0, TAU); }, '#c8c8c8'); solid(g, () => { g.beginPath(); g.moveTo(-4, -10); g.quadraticCurveTo(-18, -34, -2, -38); g.quadraticCurveTo(-8, -26, 6, -14); g.closePath(); }, '#efe4cc'); solid(g, () => { g.beginPath(); g.moveTo(16, -10); g.quadraticCurveTo(34, -30, 22, -38); g.quadraticCurveTo(24, -24, 8, -14); g.closePath(); }, '#efe4cc'); spark(g, 30, 14, 7, '#ffe08a'); },
  'brann:ult': g => { g.save(); g.setLineDash([5, 6]); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3; g.beginPath(); g.moveTo(-34, 20); g.quadraticCurveTo(-10, -44, 22, 6); g.stroke(); g.restore(); solid(g, () => { g.beginPath(); g.ellipse(18, 26, 22, 7, 0, 0, TAU); }, '#ffcf7a'); for (const a of [-2.6, -2.0, -1.2, -0.5]) line(g, [[18, 24], [18 + Math.cos(a) * 26, 24 + Math.sin(a) * 18]], '#ffcf7a', 3); solid(g, circ(g, 22, 4, 7), WHITE); },
  'sela:s1': g => { rotated(g, -Math.PI / 4, () => { solid(g, rect(g, -2.5, -10, 5, 52, 2), WOOD); solid(g, poly(g, [[0, -42], [8, -22], [0, -10], [-8, -22]]), STEEL); solid(g, rect(g, -6, -12, 12, 4, 2), GOLD); }); for (const [x, y] of [[20, -8], [8, -22], [26, 4]]) line(g, [[x, y], [x + 12, y - 12]], 'rgba(200,230,255,0.75)', 3); },
  'sela:s2': g => { A.glow(g, 0, 0, 40, '#bfe0ff', 0.5); solid(g, shieldPath(g, 1, 0, 0), '#3d5fa8'); solid(g, shieldPath(g, 0.7, 0, 0), '#e8e3d0', { outline: false }); line(g, [[-14, 2], [-6, -4], [2, 2], [10, -4], [16, 2]], '#3d5fa8', 3.5); line(g, [[-12, 12], [-4, 6], [4, 12], [12, 6]], '#3d5fa8', 3); },
  'sela:ult': g => { for (let i = 0; i < 3; i++) swoosh(g, 12 + i * 10, i * 2.1, i * 2.1 + 4.2, ['#9fd0ff', '#bfe0ff', '#ffffff'][i], 6 - i); rotated(g, 0.6, () => { solid(g, rect(g, -2, -36, 4, 72, 2), WOOD); solid(g, poly(g, [[0, -44], [6, -32], [-6, -32]]), STEEL); }); },
  'lumen:s1': g => { for (let i = 0; i < 4; i++) { const t = i / 4; A.glow(g, -28 + t * 30, 28 - t * 30, 10 + i * 3, '#ffe7a0', 0.25 + t * 0.4); } A.glow(g, 14, -14, 28, '#fff4c8', 0.9); solid(g, circ(g, 14, -14, 10), '#fff6d0'); spark(g, 14, -14, 9, '#ffffff'); },
  'lumen:s2': g => { g.save(); g.shadowColor = '#ffe080'; g.shadowBlur = 8; g.strokeStyle = '#ffe7a0'; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 30, 0, TAU); g.stroke(); g.lineWidth = 2.5; g.beginPath(); g.arc(0, 0, 20, 0, TAU); g.stroke(); g.restore(); for (let i = 0; i < 8; i++) rotated(g, i / 8 * TAU, () => solid(g, poly(g, [[0, -34], [3, -27], [-3, -27]]), '#ffe7a0', { outline: false })); A.star(g, 0, 0, 12, 5, 6); g.fillStyle = '#ffffff'; g.fill(); },
  'lumen:ult': g => { for (let i = 0; i < 5; i++) line(g, [[-30 + i * 3, -30 + i * 2], [8 - i * 2, 6 - i * 3]], `rgba(255,${230 - i * 20},${160 - i * 25},${0.6 - i * 0.1})`, 9 - i * 1.4); A.glow(g, 14, 12, 26, '#fff0b0', 1); A.star(g, 14, 12, 16, 7, 5); g.fillStyle = '#fff8d8'; g.fill(); g.strokeStyle = '#d8a040'; g.lineWidth = 2; g.stroke(); },
  'nyx:s1': g => { A.glow(g, 0, 0, 40, '#b98cff', 0.7); const og = g.createRadialGradient(-6, -8, 2, 0, 0, 26); og.addColorStop(0, '#e8d8ff'); og.addColorStop(0.5, '#8a5ad0'); og.addColorStop(1, '#2a1250'); solid(g, circ(g, 0, 0, 24), '#6a3aa0', { fill: og }); solid(g, () => { g.beginPath(); g.ellipse(0, 0, 14, 7, 0, 0, TAU); }, '#ffffff', { lw: 1.5 }); solid(g, circ(g, 0, 0, 5), '#2a0a40', { outline: false }); },
  'nyx:s2': g => { g.save(); g.globalAlpha = 0.35; solid(g, () => { g.beginPath(); g.ellipse(-14, 8, 10, 20, -0.3, 0, TAU); }, '#4a2a6e'); g.globalAlpha = 0.6; solid(g, () => { g.beginPath(); g.ellipse(0, 2, 10, 20, -0.3, 0, TAU); }, '#6a3a9e'); g.restore(); solid(g, () => { g.beginPath(); g.ellipse(16, -4, 10, 20, -0.3, 0, TAU); }, '#b98cff'); for (const [x, y] of [[-30, 26], [24, -28], [30, 14]]) spark(g, x, y, 4, '#d8c0ff'); },
  'nyx:ult': g => { for (let i = 0; i < 4; i++) swoosh(g, 34 - i * 7, i * 1.3, i * 1.3 + 4, ['#4a2a6e', '#6a3aa0', '#9a6ad0', '#c8a8ff'][i], 5); solid(g, circ(g, 0, 0, 10), '#0a0414', { outline: false }); A.glow(g, 0, 0, 14, '#b98cff', 0.6); },
  'rook:s1': g => { for (let i = 2; i >= 0; i--) { g.save(); g.globalAlpha = 1 - i * 0.32; g.translate(-i * 12, i * 12); rotated(g, Math.PI / 4, () => blade(g, 26, 4.5, i ? '#7ad1c9' : '#d8f0ee', { grip: 8, guard: 9, guardColor: '#2a2f3a' })); g.restore(); } },
  'rook:s2': g => { for (let i = 0; i < 8; i++) rotated(g, i / 8 * TAU, () => { solid(g, poly(g, [[0, -38], [4, -26], [0, -18], [-4, -26]]), '#cfeeee'); }); solid(g, circ(g, 0, 0, 8), '#7ad1c9'); },
  'rook:ult': g => { A.glow(g, 0, 0, 40, '#ff4a5a', 0.4); line(g, [[-30, -30], [30, 30]], '#e8fffb', 6, '#7ad1c9'); line(g, [[30, -30], [-30, 30]], '#e8fffb', 6, '#7ad1c9'); solid(g, () => { g.beginPath(); g.arc(0, -2, 13, 0, TAU); }, '#efe4cc'); solid(g, circ(g, -5, -3, 3.5), '#1a1a1a', { outline: false }); solid(g, circ(g, 5, -3, 3.5), '#1a1a1a', { outline: false }); solid(g, rect(g, -6, 8, 12, 6, 1), '#efe4cc'); },
  'vex:s1': g => { g.save(); g.setLineDash([4, 5]); g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 3; g.beginPath(); g.moveTo(-32, 28); g.quadraticCurveTo(-12, -30, 18, -4); g.stroke(); g.restore(); solid(g, () => { g.beginPath(); g.ellipse(14, 14, 13, 11, 0, 0, TAU); }, '#ff8a6a'); for (const [x, y] of [[0, -2], [10, -8], [22, -6], [30, 4]]) solid(g, () => { g.beginPath(); g.ellipse(x, y, 4.5, 6, 0, 0, TAU); }, '#ff8a6a'); },
  'vex:s2': g => { for (const o of [-14, 0, 14]) { g.save(); g.shadowColor = '#ff5a4a'; g.shadowBlur = 8; solid(g, () => { g.beginPath(); g.moveTo(o - 16, -32); g.quadraticCurveTo(o + 8, -6, o + 14, 32); g.quadraticCurveTo(o - 2, 0, o - 16, -32); }, '#ffe0d8'); g.restore(); } },
  'vex:ult': g => { A.glow(g, 0, 4, 42, '#ff3a3a', 0.6); solid(g, () => { g.beginPath(); g.moveTo(0, -34); g.quadraticCurveTo(26, 0, 22, 14); g.quadraticCurveTo(16, 34, 0, 34); g.quadraticCurveTo(-16, 34, -22, 14); g.quadraticCurveTo(-26, 0, 0, -34); g.closePath(); }, '#d02a3a', { box: [-26, -34, 26, 34] }); solid(g, () => { g.beginPath(); g.ellipse(0, 12, 11, 6, 0, 0, TAU); }, '#ffb04a', { lw: 1.5 }); solid(g, () => { g.beginPath(); g.ellipse(0, 12, 2.5, 6, 0, 0, TAU); }, '#1a0a0a', { outline: false }); shine(g, -8, -6, 3, 8, 0.4, 0.5); },
  'gorr:s1': g => { for (const r of [30, 38]) { g.save(); g.strokeStyle = 'rgba(255,240,200,0.5)'; g.lineWidth = 3; g.beginPath(); g.arc(14, 0, r, -0.8, 0.8); g.stroke(); g.restore(); } solid(g, shieldPath(g, 1, -6, 0), '#c7b27a'); solid(g, circ(g, -6, 0, 8), '#8a7a4a'); spark(g, 26, -18, 6, '#ffe08a'); },
  'gorr:s2': g => { for (const r of [14, 24, 34]) { g.save(); g.strokeStyle = `rgba(240,224,160,${1 - r / 44})`; g.lineWidth = 4; g.beginPath(); g.arc(-8, 0, r, -0.9, 0.9); g.stroke(); g.restore(); } solid(g, () => { g.beginPath(); g.moveTo(-36, -16); g.quadraticCurveTo(-10, -18, -12, 0); g.quadraticCurveTo(-10, 18, -36, 16); g.closePath(); }, '#8f9aa3'); solid(g, poly(g, [[-30, -8], [-16, -4], [-30, 0]]), '#ffffff'); },
  'gorr:ult': g => { solid(g, rect(g, -40, 18, 80, 22, 0), '#7a5a3a'); for (const [a, l] of [[-2.6, 30], [-1.9, 34], [-1.2, 30], [-0.5, 32]]) line(g, [[0, 20], [Math.cos(a) * l, 20 + Math.sin(a) * l * 0.4 + 6]], '#2a1a0a', 3); solid(g, () => { g.beginPath(); g.ellipse(0, -6, 18, 16, 0, 0, TAU); }, '#8f9aa3'); for (const x of [-12, -4, 4, 12]) solid(g, rect(g, x - 3.5, -24, 7, 10, 3), '#8f9aa3'); for (const [x, y] of [[-26, 6], [26, 4], [-20, -26], [24, -24]]) solid(g, poly(g, [[x, y - 5], [x + 5, y], [x, y + 5], [x - 5, y]]), '#a88a5a'); },
  'mira:s1': g => { g.save(); g.shadowColor = '#6bbf4a'; g.shadowBlur = 6; g.strokeStyle = '#6bbf4a'; g.lineWidth = 6; g.beginPath(); for (let i = 0; i < 70; i++) { const t = i / 70 * TAU * 2.2, r = 8 + i * 0.36; g.lineTo(Math.cos(t) * r, Math.sin(t) * r); } g.stroke(); g.restore(); for (const a of [0.5, 2.2, 3.9, 5.3]) solid(g, poly(g, [[Math.cos(a) * 22, Math.sin(a) * 22], [Math.cos(a + 0.2) * 32, Math.sin(a + 0.2) * 32], [Math.cos(a + 0.35) * 22, Math.sin(a + 0.35) * 22]]), '#e0f0c0'); },
  'mira:s2': g => { A.glow(g, 0, 0, 40, '#b6ffc8', 0.6); for (let i = 0; i < 5; i++) rotated(g, i / 5 * TAU, () => solid(g, () => { g.beginPath(); g.ellipse(0, -18, 10, 16, 0, 0, TAU); }, '#f7a6c1')); solid(g, rect(g, -4, -12, 8, 24, 2), WHITE, { outline: false }); solid(g, rect(g, -12, -4, 24, 8, 2), WHITE, { outline: false }); },
  'mira:ult': g => { g.save(); g.strokeStyle = 'rgba(182,255,200,0.7)'; g.lineWidth = 3; g.setLineDash([6, 5]); g.beginPath(); g.ellipse(0, 22, 36, 12, 0, 0, TAU); g.stroke(); g.restore(); solid(g, rect(g, -4, -2, 8, 26, 2), WOOD); for (const [x, y, r] of [[0, -16, 18], [-14, -6, 13], [14, -6, 13]]) solid(g, circ(g, x, y, r), '#4aa86a'); for (const [x, y] of [[-6, -20], [8, -12], [-14, -4]]) spark(g, x, y, 3.5, '#f7a6c1'); },
};
// Fallback by skill type for any skill without its own glyph.
function typeGlyph(g, sk) {
  const t = sk.type;
  if (t === 'line') arrow(g, -30, 30, 30, -30);
  else if (t === 'circle' || t === 'zone') { g.save(); g.strokeStyle = WHITE; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 26, 0, TAU); g.stroke(); g.restore(); spark(g, 0, 0, 10); }
  else if (t === 'dash' || t === 'blink') for (const o of [-14, 6]) line(g, [[o, -18], [o + 18, 0], [o, 18]], WHITE, 6);
  else spark(g, 0, 0, 22);
}
// Very light hero colors (Lumen's white robe) would wash out white glyphs: darken them.
function deep(c) {
  const n = parseInt(c.slice(1), 16), lum = (0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255;
  return lum > 0.6 ? A.mix(A.shade(c, -0.45), '#8a6a2a', 0.35) : c;
}
function skill(heroId, key) {
  return make('skill:' + heroId + key, g => {
    const def = D.HERO[heroId], sk = def.skill[key];
    framed(g, { tint: deep(def.look.main), edge: key === 'ult' ? '#f0c35a' : '#9aa8b8', shape: 'round', rays: key === 'ult', corners: key === 'ult', cornerGem: def.look.trim, glowColor: A.shade(def.look.trim, 0.2) },
      gg => (SKILL_DRAW[heroId + ':' + key] || (x => typeGlyph(x, sk)))(gg));
  });
}

// ---------------------------------------------------------------------------
// Hero passives
// ---------------------------------------------------------------------------
const PASSIVE_DRAW = {
  thirdshot: g => { for (const [a, c] of [[-0.45, '#9ad0b0'], [0, '#c8f0d8'], [0.45, '#ffffff']]) rotated(g, a, () => { line(g, [[0, 30], [0, -18]], c, 3.5); solid(g, poly(g, [[0, -32], [6, -18], [-6, -18]]), c); solid(g, () => { g.beginPath(); g.moveTo(0, 30); g.lineTo(-6, 38); g.lineTo(-6, 26); g.closePath(); }, '#e9d58a'); }); spark(g, 0, -34, 6, '#e9d58a'); },
  hotbarrels: g => { A.glow(g, 0, 0, 40, '#ff8a3a', 0.6); solid(g, circ(g, 0, 0, 26), '#8a5a32'); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; solid(g, circ(g, Math.cos(a) * 15, Math.sin(a) * 15, 6), i < 3 ? '#ffb04a' : '#3a2a1a', { lw: 1.5 }); } solid(g, circ(g, 0, 0, 5), GOLD); for (const x of [-10, 0, 10]) line(g, [[x, -36], [x + 3, -44]], 'rgba(255,200,120,0.7)', 2.5); },
  bloodlust: g => { A.glow(g, 0, 6, 40, '#ff3a3a', 0.5); solid(g, () => { g.beginPath(); g.moveTo(0, -34); g.quadraticCurveTo(26, 0, 24, 14); g.quadraticCurveTo(20, 34, 0, 34); g.quadraticCurveTo(-20, 34, -24, 14); g.quadraticCurveTo(-26, 0, 0, -34); g.closePath(); }, '#c0202e', { box: [-26, -34, 26, 34] }); for (const x of [-8, 8]) solid(g, poly(g, [[x - 4, 8], [x + 4, 8], [x, 22]]), '#f4ecd8'); shine(g, -9, -4, 3, 9, 0.3, 0.5); },
  riposte: g => { rotated(g, -Math.PI / 4, () => { solid(g, rect(g, -2.5, -38, 5, 76, 2), WOOD); solid(g, poly(g, [[0, -46], [7, -32], [-7, -32]]), STEEL); }); rotated(g, Math.PI / 4, () => { solid(g, rect(g, -2.5, -38, 5, 76, 2), WOOD); solid(g, poly(g, [[0, -46], [7, -32], [-7, -32]]), STEEL); }); spark(g, 0, 0, 12, '#e8e3d0'); },
  radiance: g => { A.glow(g, 0, 0, 44, '#fff0a0', 0.9); for (let i = 0; i < 12; i++) rotated(g, i / 12 * TAU, () => solid(g, poly(g, [[0, -40], [5, -22], [-5, -22]]), i % 2 ? '#f0c24e' : '#fff4c0', { outline: false })); const sg = g.createRadialGradient(-5, -5, 2, 0, 0, 20); sg.addColorStop(0, '#ffffff'); sg.addColorStop(1, '#f0c24e'); solid(g, circ(g, 0, 0, 18), '#f0c24e', { fill: sg }); },
  hex: g => { A.glow(g, 0, 0, 40, '#b98cff', 0.6); solid(g, () => { g.beginPath(); g.moveTo(-36, 0); g.quadraticCurveTo(0, -30, 36, 0); g.quadraticCurveTo(0, 30, -36, 0); g.closePath(); }, '#e8dcff', { box: [-36, -20, 36, 20] }); const ig = g.createRadialGradient(-3, -3, 1, 0, 0, 14); ig.addColorStop(0, '#d8b8ff'); ig.addColorStop(1, '#4a2a6e'); solid(g, circ(g, 0, 0, 13), '#6a3aa0', { fill: ig }); solid(g, () => { g.beginPath(); g.ellipse(0, 0, 3, 10, 0, 0, TAU); }, '#0a0414', { outline: false }); for (const [x, y] of [[-20, -26], [22, 24], [26, -22]]) spark(g, x, y, 3.5, '#d8c0ff'); },
  ambush: g => { solid(g, () => { g.beginPath(); g.arc(-4, -4, 30, 0.9, 5.4); g.arc(8, -10, 24, 5.0, 1.2, true); g.closePath(); }, '#d8e8f0'); rotated(g, Math.PI / 4, () => blade(g, 30, 5, '#7ad1c9', { grip: 10, guard: 10, guardColor: '#2a2f3a' })); },
  feral: g => { A.glow(g, 0, 0, 40, '#ff7a4a', 0.4); for (const o of [-14, 0, 14]) solid(g, () => { g.beginPath(); g.moveTo(o - 12, -32); g.quadraticCurveTo(o + 6, -4, o + 10, 32); g.quadraticCurveTo(o - 2, 2, o - 12, -32); }, '#ffb04a'); solid(g, () => { g.beginPath(); g.moveTo(24, 20); g.quadraticCurveTo(30, 28, 24, 34); g.quadraticCurveTo(18, 28, 24, 20); }, '#e04a3a'); },
  granite: g => { solid(g, () => A.poly(g, 0, 0, 32, 6, Math.PI / 6), '#8f9aa3', { box: [-32, -32, 32, 32] }); for (const [a, b] of [[[-14, -18], [2, -2]], [[2, -2], [-6, 16]], [[2, -2], [20, 4]]]) line(g, [a, b], '#4a525a', 2.5); solid(g, () => A.poly(g, 0, 0, 14, 6, Math.PI / 6), '#b8c2cc', { outline: false }); shine(g, -12, -16, 4, 8, 0.6, 0.35); },
  verdant: g => { A.glow(g, 0, 0, 42, '#b6ffc8', 0.6); line(g, [[0, 34], [0, -2]], '#3e6a4e', 5); solid(g, () => { g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-30, -6, -26, -30); g.quadraticCurveTo(-4, -26, 0, 0); g.closePath(); }, '#6bbf8a'); solid(g, () => { g.beginPath(); g.moveTo(0, 6); g.quadraticCurveTo(30, 0, 28, -24); g.quadraticCurveTo(6, -22, 0, 6); g.closePath(); }, '#6bbf8a'); for (const [x, y] of [[-26, 18], [22, 22], [-30, -6], [30, -6]]) { solid(g, rect(g, x - 1.5, y - 5, 3, 10, 1), '#ffffff', { outline: false }); solid(g, rect(g, x - 5, y - 1.5, 10, 3, 1), '#ffffff', { outline: false }); } },
};
function passive(heroId) {
  return make('passive:' + heroId, g => {
    const def = D.HERO[heroId];
    framed(g, { tint: A.mix(deep(def.look.main), '#1a1030', 0.35), edge: '#d8b8ff', shape: 'circle', glowColor: A.shade(def.look.trim, 0.2) },
      gg => (PASSIVE_DRAW[def.passive.id] || (x => spark(x, 0, 0, 22)))(gg));
  });
}

// ---------------------------------------------------------------------------
// Battle spells, Regen and buffs
// ---------------------------------------------------------------------------
const SPELL_TINT = { blink: '#6a5ad0', smite: '#d08a2a', reap: '#a0303e', cleanse: '#2aa0b0', sprint: '#3aa05a', aegis: '#b8902a', stonegaze: '#6a707a', regen: '#2a9050', azure: '#2a6ad0', ember: '#c8401a', lord: '#7a3ac0' };
const SPELL_DRAW = {
  blink: g => { for (const [x, y, s] of [[-18, 14, 1], [18, -14, 0.8]]) { g.save(); g.strokeStyle = '#d8c8ff'; g.shadowColor = '#b8a0ff'; g.shadowBlur = 10; g.lineWidth = 4; g.beginPath(); g.ellipse(x, y, 14 * s, 6 * s, -0.5, 0, TAU); g.stroke(); g.restore(); } g.save(); g.setLineDash([4, 5]); line(g, [[-14, 8], [12, -10]], '#ffffff', 2.5); g.restore(); spark(g, 18, -14, 9, '#e0d4ff'); spark(g, -18, 14, 5, '#e0d4ff'); },
  smite: g => { bolt(g, 6, -44, -4, 20, '#ffcf6a', 5, 2); A.glow(g, -4, 22, 22, '#ffcf6a', 0.9); for (const a of [-2.6, -1.9, -1.2, -0.5]) line(g, [[-4, 22], [-4 + Math.cos(a) * 20, 22 + Math.sin(a) * 12]], '#fff0c0', 2.5); },
  reap: g => { A.glow(g, 6, -10, 36, '#ff5a6a', 0.45); solid(g, rect(g, -3, -30, 6, 70, 2), '#3a2a2a'); rotated(g, 0, () => solid(g, () => { g.beginPath(); g.moveTo(0, -30); g.quadraticCurveTo(40, -40, 34, 4); g.quadraticCurveTo(28, -22, 0, -20); g.closePath(); }, '#d8dde4', { box: [0, -36, 36, 4] })); line(g, [[4, -26], [30, -22], [32, -4]], '#ff6a7a', 2, '#ff3a4a'); },
  cleanse: g => { A.glow(g, 0, 0, 40, '#bff4ff', 0.6); g.save(); g.strokeStyle = 'rgba(220,250,255,0.85)'; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 30, 0, TAU); g.stroke(); g.restore(); shine(g, -12, -14, 6, 10, 0.6, 0.45); line(g, [[-14, 0], [-4, 12], [16, -12]], '#ffffff', 7, '#9ff0ff'); for (const [x, y] of [[-24, -24], [26, 18]]) { line(g, [[x - 5, y - 5], [x + 5, y + 5]], 'rgba(255,255,255,0.6)', 2); } },
  sprint: g => { solid(g, () => { g.beginPath(); g.moveTo(-10, -26); g.lineTo(8, -26); g.lineTo(8, 4); g.quadraticCurveTo(28, 6, 30, 20); g.lineTo(30, 26); g.lineTo(-12, 26); g.closePath(); }, '#e8f8f0'); solid(g, () => { g.beginPath(); g.moveTo(-10, -14); g.quadraticCurveTo(-40, -34, -36, -4); g.quadraticCurveTo(-26, -12, -10, -2); g.closePath(); }, '#ffffff'); for (const y of [6, 14, 22]) line(g, [[-40, y], [-24, y]], 'rgba(255,255,255,0.7)', 3); },
  aegis: g => { A.glow(g, 0, 0, 40, '#fff0b0', 0.6); solid(g, shieldPath(g, 1.1, 0, 0), '#e0c060'); solid(g, shieldPath(g, 0.75, 0, 0), '#fff4d0', { outline: false }); A.star(g, 0, -2, 13, 5.5, 5); g.fillStyle = '#d8a030'; g.fill(); },
  stonegaze: g => { solid(g, () => { g.beginPath(); g.moveTo(-38, 0); g.quadraticCurveTo(0, -30, 38, 0); g.quadraticCurveTo(0, 30, -38, 0); g.closePath(); }, '#b0b4bc', { box: [-38, -20, 38, 20] }); solid(g, circ(g, 0, 0, 14), '#6a707a'); solid(g, circ(g, 0, 0, 6), '#e8ecf0', { outline: false }); for (const [a, b] of [[[-30, -20], [-18, -10]], [[24, 18], [32, 26]], [[12, -24], [18, -34]]]) line(g, [a, b], '#3a3e44', 2.5); },
  regen: g => { A.glow(g, 0, 0, 42, '#9cf0b0', 0.7); solid(g, () => { g.beginPath(); g.moveTo(0, 30); g.bezierCurveTo(-40, 6, -26, -30, 0, -14); g.bezierCurveTo(26, -30, 40, 6, 0, 30); g.closePath(); }, '#e04a5a', { box: [-34, -30, 34, 30] }); solid(g, rect(g, -4, -10, 8, 22, 2), '#ffffff', { outline: false }); solid(g, rect(g, -11, -3, 22, 8, 2), '#ffffff', { outline: false }); shine(g, -14, -12, 4, 6, 0.6, 0.4); },
  azure: g => { A.glow(g, 0, 4, 44, '#bfe0ff', 0.8); solid(g, () => { g.beginPath(); g.moveTo(0, -36); g.quadraticCurveTo(22, -8, 18, 12); g.quadraticCurveTo(12, 30, 0, 30); g.quadraticCurveTo(-12, 30, -18, 12); g.quadraticCurveTo(-22, -8, 0, -36); g.closePath(); }, '#7ab8ff'); solid(g, circ(g, 0, 10, 10), '#e8f6ff', { outline: false }); for (const [x, y] of [[-26, -18], [24, -22], [28, 20]]) spark(g, x, y, 4, '#dff0ff'); },
  ember: g => { A.glow(g, 0, 6, 44, '#ff8a3a', 0.8); solid(g, () => { g.beginPath(); g.moveTo(0, -36); g.quadraticCurveTo(26, -6, 20, 16); g.quadraticCurveTo(12, 34, 0, 34); g.quadraticCurveTo(-18, 32, -20, 12); g.quadraticCurveTo(-20, -4, -6, -14); g.quadraticCurveTo(-4, 0, 4, 2); g.quadraticCurveTo(10, -14, 0, -36); g.closePath(); }, '#ff6a2a', { box: [-20, -36, 26, 34] }); solid(g, () => { g.beginPath(); g.moveTo(0, -4); g.quadraticCurveTo(12, 10, 8, 20); g.quadraticCurveTo(0, 30, -8, 20); g.quadraticCurveTo(-10, 10, 0, -4); g.closePath(); }, '#ffd060', { outline: false }); },
  lord: g => { A.glow(g, 0, 0, 44, '#c88aff', 0.6); solid(g, () => { g.beginPath(); g.moveTo(-26, -6); g.quadraticCurveTo(-40, -30, -30, -38); g.quadraticCurveTo(-26, -24, -14, -18); g.lineTo(14, -18); g.quadraticCurveTo(26, -24, 30, -38); g.quadraticCurveTo(40, -30, 26, -6); g.quadraticCurveTo(24, 26, 0, 32); g.quadraticCurveTo(-24, 26, -26, -6); g.closePath(); }, '#6a3a9a', { box: [-40, -38, 40, 32] }); for (const x of [-10, 10]) solid(g, () => { g.beginPath(); g.ellipse(x, 0, 6, 4, x < 0 ? 0.3 : -0.3, 0, TAU); }, '#ffd040', { lw: 1.5 }); solid(g, poly(g, [[-8, 16], [8, 16], [0, 24]]), '#f4ecd8'); },
};
function spell(id) {
  return make('spell:' + id, g => {
    const buff = ['azure', 'ember', 'lord'].includes(id);
    framed(g, { tint: SPELL_TINT[id] || '#556', edge: buff ? '#e8d8ff' : '#c9d2dc', shape: buff ? 'circle' : 'round', glowColor: A.shade(SPELL_TINT[id] || '#888', 0.4) },
      gg => (SPELL_DRAW[id] || (x => spark(x, 0, 0, 22)))(gg));
  });
}

LF.icons = { item, skill, passive, spell };
})(window.LF);
