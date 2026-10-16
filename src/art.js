// Lanefall: procedural art. Animated character rigs, monsters, structures, terrain and effects.
'use strict';
(function (LF) {
const D = LF.data;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------
const colCache = new Map();
function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) {
  const key = a + b + (t * 100 | 0);
  let v = colCache.get(key);
  if (v) return v;
  const A = hexToRgb(a), B = hexToRgb(b);
  const c = A.map((x, i) => Math.round(x + (B[i] - x) * t));
  v = '#' + c.map(x => x.toString(16).padStart(2, '0')).join('');
  colCache.set(key, v);
  return v;
}
const shade = (c, t) => (t < 0 ? mix(c, '#000000', -t) : mix(c, '#ffffff', t));
const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };

function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
function ellipse(ctx, x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}
function poly(ctx, x, y, r, n, rot) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) { const a = (rot || 0) + i / n * TAU; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  ctx.closePath();
}
function glow(ctx, x, y, r, color, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a)); g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g; circle(ctx, x, y, r); ctx.fill();
}
const OUTLINE = 'rgba(12,16,14,0.55)';

// ---------------------------------------------------------------------------
// Character rig. Feet at (0,0), facing +x. pose:
//   t, walk 0..1, phase, atk 0..1 or -1, melee, cast 0..1 or -1, aim (rad),
//   hurt 0..1, dead 0..1, air px, stun bool
// ---------------------------------------------------------------------------
function drawRig(ctx, look, pose) {
  const s = look.scale || 1;
  const hurt = pose.hurt || 0;
  const C = c => (hurt > 0.02 ? mix(c, '#ffffff', hurt * 0.7) : c);
  const walk = pose.walk || 0, ph = pose.phase || 0, t = pose.t || 0;
  const body = look.body || 'slim';
  const robe = body === 'robe';
  const tw = body === 'heavy' ? 32 : body === 'broad' ? 25 : body === 'robe' ? 21 : 19;
  const bob = Math.abs(Math.sin(ph)) * 2.2 * walk + Math.sin(t * 2.2) * 0.8;

  ctx.save();
  ctx.scale(s, s);
  if (pose.dead > 0) {
    ctx.globalAlpha *= Math.max(0, 1 - pose.dead * 0.85);
    ctx.rotate(-pose.dead * Math.PI / 2 * 0.95);
  }
  ctx.translate(0, -(pose.air || 0) / s);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  const shoulderY = -47 + bob, hipY = -24 + bob * 0.5, headY = -60 + bob;
  const capeCol = look.capeColor || shade(look.main, -0.28);

  // Arm angles
  let front = 1.2 + Math.sin(ph) * 0.45 * walk + Math.sin(t * 2) * 0.04;
  let back = 1.6 - Math.sin(ph) * 0.45 * walk;
  const w = look.weapon;
  const ranged = w === 'bow' || w === 'guns' || w === 'staff' || w === 'orb' || w === 'wand';
  if (pose.atk >= 0) {
    const k = pose.atk;
    if (pose.melee) {
      if (k < 0.35) front = 1.2 + (-2.1 - 1.2) * (k / 0.35);
      else front = -2.1 + (1.5 + 2.1) * Math.min(1, (k - 0.35) / 0.3);
      if (w === 'daggers' || w === 'claws') back = front + 0.6;
      if (w === 'spear') front = pose.aim + (k < 0.4 ? -0.3 : 0) ;
    } else {
      front = pose.aim;
      if (w === 'guns' || w === 'bow') back = pose.aim + 0.15;
    }
  } else if (pose.cast >= 0) {
    front = -1.3 + Math.sin(pose.cast * Math.PI) * 0.3;
    back = -1.0;
  } else if (w === 'bow') {
    front = 0.9; back = 1.5;
  } else if (w === 'staff' || w === 'spear') {
    front = 1.0;
  }
  if (w === 'mace') back = 0.6; // shield arm held forward

  // Cape (behind everything)
  if (look.cape) {
    const sway = Math.sin(t * 2.8) * 2.5 + walk * 7;
    ctx.fillStyle = C(capeCol);
    ctx.beginPath();
    ctx.moveTo(-tw * 0.35, shoulderY + 1);
    ctx.quadraticCurveTo(-tw * 0.9 - sway, shoulderY + 18, -tw * 0.7 - sway * 1.4, hipY + 12);
    ctx.lineTo(tw * 0.1 - sway * 0.3, hipY + 10);
    ctx.lineTo(tw * 0.3, shoulderY + 2);
    ctx.closePath(); ctx.fill();
  }

  // Back arm
  drawArm(ctx, look, shoulderY, back, C, true, pose);

  // Legs / robe
  if (robe) {
    const sw = Math.sin(ph) * 3 * walk;
    ctx.fillStyle = C(look.pants);
    for (const fx of [-4 - sw, 4 + sw]) { ellipse(ctx, fx, -2, 5, 3); ctx.fill(); }
    ctx.fillStyle = C(shade(look.main, -0.08));
    ctx.beginPath();
    ctx.moveTo(-tw * 0.5, hipY - 2);
    ctx.lineTo(tw * 0.5, hipY - 2);
    ctx.lineTo(tw * 0.68 + sw, -3);
    ctx.quadraticCurveTo(0, 1, -tw * 0.68 + sw, -3);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.strokeStyle = C(look.trim); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-tw * 0.62 + sw, -5); ctx.quadraticCurveTo(0, -2, tw * 0.62 + sw, -5); ctx.stroke();
  } else {
    const legW = body === 'heavy' ? 9 : body === 'broad' ? 8 : 7;
    for (const i of [0, 1]) {
      const sgn = i ? 1 : -1;
      const swing = Math.sin(ph) * 9 * walk * sgn;
      const lift = Math.max(0, Math.cos(ph) * sgn) * 5 * walk;
      const hx = sgn * (tw * 0.18);
      ctx.strokeStyle = C(i ? look.pants : shade(look.pants, -0.25));
      ctx.lineWidth = legW;
      ctx.beginPath(); ctx.moveTo(hx, hipY); ctx.lineTo(hx + swing * 0.6, (hipY - lift) / 2); ctx.lineTo(swing + 1, -3 - lift); ctx.stroke();
      ctx.fillStyle = C(shade(look.pants, -0.45));
      ellipse(ctx, swing + 3, -2 - lift, legW * 0.7, 3.2); ctx.fill();
    }
  }

  // Torso
  ctx.fillStyle = C(look.main);
  rrect(ctx, -tw / 2, shoulderY - 3, tw, hipY - shoulderY + 6, body === 'heavy' ? 10 : 6);
  ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = C(shade(look.main, 0.18));
  rrect(ctx, -tw / 2 + 3, shoulderY - 1, tw * 0.45, hipY - shoulderY, 4); ctx.fill();
  ctx.fillStyle = C(look.trim);
  ctx.fillRect(-tw / 2, hipY - 4, tw, 3.5);
  ctx.beginPath(); ctx.moveTo(tw * 0.05, shoulderY - 2); ctx.lineTo(tw * 0.32, shoulderY + 7); ctx.lineTo(tw * 0.05, shoulderY + 12); ctx.closePath(); ctx.fill();
  if (body === 'heavy' || body === 'broad') {
    ctx.fillStyle = C(shade(look.trim, -0.1));
    ellipse(ctx, tw * 0.28, shoulderY + 1, body === 'heavy' ? 11 : 8, 6); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.2; ctx.stroke();
  }

  // Head
  drawHead(ctx, look, headY, C, pose, t);

  // Front arm with weapon
  drawArm(ctx, look, shoulderY, front, C, false, pose);

  // Casting glow
  if (pose.cast >= 0) {
    const hx = Math.cos(front) * 18 + tw * 0.25, hy = shoulderY + Math.sin(front) * 18;
    glow(ctx, hx, hy, 22, look.trim, 0.7 * Math.sin(pose.cast * Math.PI));
  }
  ctx.restore();

  if (pose.stun) {
    for (let i = 0; i < 3; i++) {
      const a = t * 5 + i * TAU / 3;
      ctx.fillStyle = '#ffe680';
      star(ctx, Math.cos(a) * 14 * s, (headY - 18) * s - (pose.air || 0) + Math.sin(a) * 4, 4, 2, 5);
      ctx.fill();
    }
  }
}

function star(ctx, x, y, R, r, n) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r : R;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function drawArm(ctx, look, shoulderY, ang, C, isBack, pose) {
  const tw = look.body === 'heavy' ? 32 : look.body === 'broad' ? 25 : 19;
  const sx = isBack ? -tw * 0.22 : tw * 0.25, sy = shoulderY + 2;
  const len = look.body === 'heavy' ? 20 : 17;
  const hx = sx + Math.cos(ang) * len, hy = sy + Math.sin(ang) * len;
  const w = look.weapon;
  // Weapon behind the hand for the back arm
  if (isBack) {
    if (w === 'mace') drawShield(ctx, look, hx, hy, C);
    if (w === 'guns') drawGun(ctx, hx, hy, ang, C, look);
    if (w === 'daggers') drawBlade(ctx, hx, hy, ang, 14, C('#d8dde3'));
    if (w === 'claws') drawClaws(ctx, hx, hy, ang, C);
  }
  ctx.strokeStyle = C(isBack ? shade(look.main, -0.3) : shade(look.main, -0.08));
  ctx.lineWidth = look.body === 'heavy' ? 9 : 7;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.fillStyle = C(look.skin);
  circle(ctx, hx, hy, look.body === 'heavy' ? 5 : 4); ctx.fill();
  if (isBack) return;
  const k = pose.atk >= 0 ? pose.atk : 0;
  switch (w) {
    case 'bow': drawBow(ctx, hx, hy, ang, C, look, pose.atk >= 0 ? 1 - k : 0); break;
    case 'guns': drawGun(ctx, hx, hy, ang, C, look, pose.atk >= 0 && k < 0.3); break;
    case 'axe': drawAxe(ctx, hx, hy, ang, C, look); break;
    case 'spear': drawSpear(ctx, hx, hy, ang, C, look, pose.atk >= 0 ? Math.sin(k * Math.PI) * 14 : 0); break;
    case 'staff': drawStaff(ctx, hx, hy, C, look, pose); break;
    case 'orb': drawOrb(ctx, hx, hy, C, look, pose); break;
    case 'daggers': drawBlade(ctx, hx, hy, ang, 15, C('#e3e8ee')); break;
    case 'claws': drawClaws(ctx, hx, hy, ang, C); break;
    case 'mace': drawMace(ctx, hx, hy, ang, C, look); break;
    case 'wand': drawWand(ctx, hx, hy, ang, C, look, pose); break;
    case 'sword': drawBlade(ctx, hx, hy, ang, 16, C('#d6dbe0')); break;
    case 'club': drawClub(ctx, hx, hy, ang, C, look); break;
    default: break;
  }
}

function drawBlade(ctx, x, y, ang, len, col) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang - 0.25);
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(0, -2.2); ctx.lineTo(len, 0); ctx.lineTo(0, 2.2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5a4630'; ctx.fillRect(-4, -1.5, 5, 3);
  ctx.restore();
}
function drawClaws(ctx, x, y, ang, C) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.strokeStyle = C('#f2efe6'); ctx.lineWidth = 2;
  for (const o of [-4, 0, 4]) { ctx.beginPath(); ctx.moveTo(2, o * 0.6); ctx.quadraticCurveTo(10, o, 15, o * 1.4 + 2); ctx.stroke(); }
  ctx.restore();
}
function drawBow(ctx, x, y, ang, C, look, pull) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.strokeStyle = C(shade(look.trim, -0.35)); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(-4, 0, 17, -1.2, 1.2); ctx.stroke();
  const sx = -4 + Math.cos(1.2) * 17;
  ctx.strokeStyle = 'rgba(240,240,230,0.9)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(sx, -Math.sin(1.2) * 17); ctx.lineTo(sx - pull * 9, 0); ctx.lineTo(sx, Math.sin(1.2) * 17); ctx.stroke();
  if (pull > 0.1) { ctx.strokeStyle = C('#d8c79a'); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(sx - pull * 9, 0); ctx.lineTo(16, 0); ctx.stroke(); }
  ctx.restore();
}
function drawGun(ctx, x, y, ang, C, look, flash) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = C('#3a3633'); ctx.fillRect(0, -2.5, 14, 5);
  ctx.fillStyle = C(look.trim); ctx.fillRect(-2, -1, 4, 6);
  if (flash) { ctx.fillStyle = '#fff2b0'; star(ctx, 17, 0, 6, 2.5, 5); ctx.fill(); }
  ctx.restore();
}
function drawAxe(ctx, x, y, ang, C, look) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang - 1.3);
  ctx.strokeStyle = C('#6a4a2c'); ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(28, 0); ctx.stroke();
  ctx.fillStyle = C('#cfd5db');
  ctx.beginPath(); ctx.moveTo(22, -1); ctx.quadraticCurveTo(28, -16, 36, -12); ctx.quadraticCurveTo(32, 0, 36, 12); ctx.quadraticCurveTo(28, 16, 22, 1); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.restore();
}
function drawClub(ctx, x, y, ang, C) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang - 1.3);
  ctx.fillStyle = C('#7a5434');
  ctx.beginPath(); ctx.moveTo(-3, -3); ctx.lineTo(30, -7); ctx.lineTo(32, 7); ctx.lineTo(-3, 3); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function drawSpear(ctx, x, y, ang, C, look, thrust) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.translate(thrust, 0);
  ctx.strokeStyle = C('#8a6a44'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(30, 0); ctx.stroke();
  ctx.fillStyle = C('#e6ebef');
  ctx.beginPath(); ctx.moveTo(28, -4.5); ctx.lineTo(42, 0); ctx.lineTo(28, 4.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = C(look.trim); ctx.fillRect(24, -3, 4, 6);
  ctx.restore();
}
function drawStaff(ctx, x, y, C, look, pose) {
  ctx.strokeStyle = C('#9a7b4f'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x - 2, y + 18); ctx.lineTo(x + 3, y - 30); ctx.stroke();
  const gy = y - 34, g = 0.5 + 0.3 * Math.sin((pose.t || 0) * 4);
  glow(ctx, x + 3, gy, 16, look.trim, g);
  ctx.fillStyle = C('#fffbe8'); poly(ctx, x + 3, gy, 5, 4, (pose.t || 0) * 1.5); ctx.fill();
}
function drawOrb(ctx, x, y, C, look, pose) {
  const oy = y - 12 + Math.sin((pose.t || 0) * 3) * 3;
  glow(ctx, x + 6, oy, 18, look.trim, 0.65);
  ctx.fillStyle = C(shade(look.trim, -0.2)); circle(ctx, x + 6, oy, 6.5); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; circle(ctx, x + 4, oy - 2, 2); ctx.fill();
}
function drawWand(ctx, x, y, ang, C, look, pose) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang - 0.6);
  ctx.strokeStyle = C('#7a5a3a'); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(16, 0); ctx.stroke();
  glow(ctx, 18, 0, 12, look.trim, 0.6 + 0.2 * Math.sin((pose.t || 0) * 5));
  ctx.fillStyle = C('#fff0f6'); star(ctx, 18, 0, 5, 2.2, 5); ctx.fill();
  ctx.restore();
}
function drawMace(ctx, x, y, ang, C) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang - 1.2);
  ctx.strokeStyle = C('#5b4a3a'); ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(22, 0); ctx.stroke();
  ctx.fillStyle = C('#8d949b'); circle(ctx, 26, 0, 7.5); ctx.fill();
  ctx.fillStyle = C('#b9c0c6');
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; poly(ctx, 26 + Math.cos(a) * 8, Math.sin(a) * 8, 3, 3, a); ctx.fill(); }
  ctx.restore();
}
function drawShield(ctx, look, x, y, C) {
  ctx.fillStyle = C(shade(look.main, -0.15));
  ellipse(ctx, x + 6, y - 4, 14, 18); ctx.fill();
  ctx.strokeStyle = C(look.trim); ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = C(look.trim); circle(ctx, x + 6, y - 4, 4); ctx.fill();
}

function drawHead(ctx, look, y, C, pose, t) {
  const r = look.body === 'heavy' ? 12.5 : 11;
  const hc = look.head;
  // Hair / hood behind the head
  if (hc === 'hair' || hc === 'flower') {
    ctx.fillStyle = C(look.hair);
    ctx.beginPath(); ctx.moveTo(-r - 1, y - 2); ctx.quadraticCurveTo(-r - 6, y + 18 + Math.sin(t * 2) * 2, -r + 2, y + 22); ctx.lineTo(r * 0.3, y + 6); ctx.closePath(); ctx.fill();
  }
  if (hc === 'winged') {
    ctx.fillStyle = C(look.hair);
    ctx.beginPath(); ctx.moveTo(-r + 2, y - 4); ctx.quadraticCurveTo(-r - 14, y + 2 + Math.sin(t * 3) * 3, -r - 10, y + 16); ctx.quadraticCurveTo(-r - 2, y + 6, -r + 4, y + 2); ctx.closePath(); ctx.fill();
  }
  if (hc === 'hood' || hc === 'mask' || hc === 'cowl') {
    ctx.fillStyle = C(shade(look.main, hc === 'cowl' ? -0.2 : -0.15));
    ctx.beginPath(); ctx.arc(-1, y, r + 3.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-r - 2, y); ctx.quadraticCurveTo(-r - 8, y + 12, -r - 3, y + 16); ctx.lineTo(-2, y + 10); ctx.closePath(); ctx.fill();
  }
  // Face
  if (hc === 'stone') {
    ctx.fillStyle = C(look.skin);
    rrect(ctx, -r - 2, y - r, r * 2 + 6, r * 2 + 2, 7); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = C(shade(look.skin, -0.3)); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-r + 2, y - r + 4); ctx.lineTo(-2, y - 2); ctx.lineTo(-6, y + 6); ctx.stroke();
    ctx.fillStyle = C(shade(look.skin, -0.15)); rrect(ctx, -2, y + 3, r + 6, 7, 3); ctx.fill();
    glow(ctx, r * 0.55, y - 2, 7, '#7df3ff', 0.9);
    ctx.fillStyle = '#d9fbff'; circle(ctx, r * 0.55, y - 2, 2.2); ctx.fill();
    // Mossy crown
    ctx.fillStyle = C(look.main); rrect(ctx, -r - 3, y - r - 3, r * 2 + 8, 6, 3); ctx.fill();
    return;
  }
  ctx.fillStyle = C(look.skin);
  circle(ctx, 0, y, r); ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.4; ctx.stroke();
  // Eyes
  const eyeCol = hc === 'mask' ? look.trim : '#1f1a18';
  ctx.fillStyle = eyeCol;
  ellipse(ctx, r * 0.35, y - 1, 1.6, 2.3); ctx.fill();
  ellipse(ctx, r * 0.75, y - 1, 1.4, 2.1); ctx.fill();
  if (hc === 'mask') {
    glow(ctx, r * 0.55, y - 1, 7, look.trim, 0.6);
    ctx.fillStyle = C('#15181d'); rrect(ctx, -2, y + 2, r + 3, 7, 3); ctx.fill();
  }
  // Headgear on top
  switch (hc) {
    case 'hood': case 'mask': case 'cowl': {
      ctx.fillStyle = C(shade(look.main, hc === 'cowl' ? -0.2 : -0.15));
      ctx.beginPath(); ctx.arc(-1, y - 1, r + 3.5, Math.PI * 0.95, Math.PI * 1.95); ctx.lineTo(r * 0.9, y - 2); ctx.quadraticCurveTo(0, y - 7, -r, y + 4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.2; ctx.stroke();
      if (hc === 'cowl') { glow(ctx, r * 0.5, y, 6, look.trim, 0.8); }
      break;
    }
    case 'hat': {
      ctx.fillStyle = C(shade(look.main, -0.25));
      ellipse(ctx, 0, y - r + 2, r + 10, 4); ctx.fill();
      rrect(ctx, -r + 2, y - r - 10, r * 2 - 4, 12, 4); ctx.fill();
      ctx.fillStyle = C(look.trim); ctx.fillRect(-r + 2, y - r - 1, r * 2 - 4, 2.5);
      break;
    }
    case 'horns': {
      ctx.fillStyle = C('#aab2ba');
      ctx.beginPath(); ctx.arc(0, y - 1, r + 1.5, Math.PI, TAU); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = C('#efe6cf');
      for (const sg of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(sg * (r - 2), y - r * 0.6); ctx.quadraticCurveTo(sg * (r + 12), y - r - 2, sg * (r + 8), y - r - 14); ctx.quadraticCurveTo(sg * (r + 4), y - r - 2, sg * (r - 6), y - r * 0.7); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = C(look.hair);
      ctx.beginPath(); ctx.moveTo(r * 0.1, y + 4); ctx.quadraticCurveTo(r * 0.7, y + 18, r * 1.05, y + 4); ctx.closePath(); ctx.fill();
      break;
    }
    case 'winged': {
      ctx.fillStyle = C('#c9d2db');
      ctx.beginPath(); ctx.arc(0, y - 1, r + 1.5, Math.PI, TAU); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = C('#ffffff');
      ctx.beginPath(); ctx.moveTo(-r + 2, y - r * 0.5); ctx.quadraticCurveTo(-r - 10, y - r - 10, -r - 4, y - r - 14); ctx.quadraticCurveTo(-r, y - r - 4, -r + 6, y - r * 0.7); ctx.closePath(); ctx.fill();
      break;
    }
    case 'hair': case 'flower': {
      ctx.fillStyle = C(look.hair);
      ctx.beginPath(); ctx.arc(0, y - 1, r + 1.5, Math.PI * 0.9, Math.PI * 2.05); ctx.quadraticCurveTo(r * 0.3, y - 4, -r, y + 5); ctx.closePath(); ctx.fill();
      if (hc === 'flower') {
        for (let i = 0; i < 4; i++) {
          const fx = -r + 3 + i * 6, fy = y - r + 1 - Math.sin(i * 1.3) * 2;
          ctx.fillStyle = C(i % 2 ? look.trim : '#fff4a8');
          for (let p = 0; p < 5; p++) { const a = p / 5 * TAU; circle(ctx, fx + Math.cos(a) * 2.3, fy + Math.sin(a) * 2.3, 1.8); ctx.fill(); }
        }
      } else {
        ctx.fillStyle = C(look.trim); poly(ctx, 0, y - r - 3, 3, 4, Math.PI / 4); ctx.fill();
      }
      break;
    }
    case 'witch': {
      ctx.fillStyle = C(look.hair);
      ctx.beginPath(); ctx.arc(0, y - 1, r + 1, Math.PI * 0.9, Math.PI * 2.05); ctx.closePath(); ctx.fill();
      ctx.fillStyle = C(shade(look.main, -0.2));
      ellipse(ctx, 0, y - r + 1, r + 9, 3.6); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-r + 1, y - r); ctx.lineTo(r - 1, y - r); ctx.quadraticCurveTo(2, y - r - 18, -9 + Math.sin(t * 2) * 2, y - r - 24); ctx.closePath(); ctx.fill();
      ctx.fillStyle = C(look.trim); ctx.fillRect(-r + 1, y - r - 3, r * 2 - 2, 2.5);
      break;
    }
    case 'beast': {
      ctx.fillStyle = C(look.hair);
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) { const a = Math.PI + i / 6 * Math.PI, rr = i % 2 ? r + 7 : r + 1; ctx.lineTo(Math.cos(a) * rr, y - 1 + Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill();
      for (const sg of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(sg * 4 - 2, y - r + 1); ctx.lineTo(sg * 9 - 2, y - r - 11); ctx.lineTo(sg * 11 - 2, y - r + 2); ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'helm': {
      ctx.fillStyle = C(look.trim);
      ctx.beginPath(); ctx.arc(0, y, r + 1.5, Math.PI * 0.95, Math.PI * 2.05); ctx.closePath(); ctx.fill();
      ctx.fillStyle = C(shade(look.trim, -0.3)); ctx.fillRect(-1, y - r - 4, 3, 6);
      break;
    }
    default: break;
  }
}

// ---------------------------------------------------------------------------
// Minions and monsters
// ---------------------------------------------------------------------------
const minionLook = {};
function getMinionLook(team, type) {
  const key = team + type;
  if (minionLook[key]) return minionLook[key];
  const T = D.TEAMS[team];
  const l = type === 'melee'
    ? { skin: '#e9c7a6', main: T.deep, trim: T.color, pants: '#26292e', head: 'helm', weapon: 'sword', body: 'slim', scale: 0.62 }
    : { skin: '#e9c7a6', main: T.color, trim: T.light, pants: '#26292e', head: 'cowl', weapon: 'orb', body: 'robe', scale: 0.6 };
  minionLook[key] = l;
  return l;
}

function drawSiege(ctx, team, t, walk, atk) {
  const T = D.TEAMS[team];
  ctx.save();
  ctx.fillStyle = '#4b3a2a'; rrect(ctx, -24, -26, 48, 18, 4); ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = T.color; ctx.fillRect(-22, -24, 44, 4);
  const recoil = atk >= 0 ? Math.sin(atk * Math.PI) * 6 : 0;
  ctx.fillStyle = '#5d646b'; rrect(ctx, -6 - recoil, -38, 30, 12, 5); ctx.fill();
  ctx.fillStyle = '#2b2f33'; circle(ctx, 24 - recoil, -32, 4); ctx.fill();
  for (const wx of [-14, 14]) {
    ctx.save(); ctx.translate(wx, -8); ctx.rotate(t * walk * 6);
    ctx.fillStyle = '#6d5236'; circle(ctx, 0, 0, 9); ctx.fill();
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI; ctx.beginPath(); ctx.moveTo(Math.cos(a) * -8, Math.sin(a) * -8); ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 8); ctx.stroke(); }
    ctx.restore();
  }
  ctx.restore();
}

const BRUTE_LOOK = { skin: '#c4573a', main: '#6e2b1c', trim: '#f0a040', pants: '#3a1a12', head: 'horns', weapon: 'club', body: 'heavy', scale: 1.45, hair: '#3a1a12' };

// The Lord: a towering armored dragon-beast that guards the river pool by the top lane.
// Drawn standing upright, facing +x, feet at (0,0).
function drawLord(ctx, t, pose, C) {
  const ARMOR = '#2b1d3d', PLATE = '#4a2f6e', PLATE_HI = '#6d48a3', BONE = '#ece0c4', GOLD = '#d9b65c', CORE = '#c77dff', EYE = '#ffb347';
  const breathe = Math.sin(t * 1.6) * 3;
  const atk = pose.atk >= 0 ? Math.sin(pose.atk * Math.PI) : 0;
  const flap = Math.sin(t * 1.3) * 0.1;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // Wings behind the body (far wing darker)
  const wing = (rot, col, bone) => {
    ctx.save(); ctx.translate(-8, -158 + breathe); ctx.rotate(rot);
    const tips = [[-150, -150], [-168, -70], [-145, -15], [-95, 28]];
    ctx.fillStyle = C(col);
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-60, -125, tips[0][0], tips[0][1]);
    ctx.quadraticCurveTo(-125, -95, tips[1][0], tips[1][1]);
    ctx.quadraticCurveTo(-118, -48, tips[2][0], tips[2][1]);
    ctx.quadraticCurveTo(-92, -14, tips[3][0], tips[3][1]);
    ctx.quadraticCurveTo(-45, 6, 0, 22);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = C(bone); ctx.lineWidth = 4;
    for (const [x, y] of tips) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(x * 0.45, y * 0.65 - 10, x, y); ctx.stroke(); }
    ctx.fillStyle = C(GOLD);
    poly(ctx, 0, 0, 7, 5, t); ctx.fill();
    ctx.restore();
  };
  wing(0.05 + flap, '#211233', '#8a7a64');
  wing(-0.32 - flap, '#3a1f58', BONE);

  // Tail with spikes
  for (let i = 14; i >= 0; i--) {
    const k = i / 14;
    const x = -38 - k * 125, y = -46 + k * 34 + Math.sin(t * 2 + k * 4) * 7 * k;
    ctx.fillStyle = C(i % 2 ? ARMOR : PLATE);
    circle(ctx, x, y, 20 * (1 - k) + 5); ctx.fill();
    if (i % 3 === 1) { ctx.fillStyle = C(BONE); ctx.beginPath(); ctx.moveTo(x - 6, y - 14 * (1 - k) - 4); ctx.lineTo(x, y - 30 * (1 - k) - 10); ctx.lineTo(x + 6, y - 14 * (1 - k) - 4); ctx.closePath(); ctx.fill(); }
  }

  // Far arm (behind the body)
  const shoulderY = -160 + breathe;
  const arm = (sx, ang, dark) => {
    const ex = sx + Math.cos(ang) * 44, ey = shoulderY + 12 + Math.sin(ang) * 44;
    const hx = ex + Math.cos(ang - 0.5) * 40, hy = ey + Math.sin(ang - 0.5) * 40;
    ctx.strokeStyle = C(dark ? '#1f142c' : ARMOR); ctx.lineWidth = 24;
    ctx.beginPath(); ctx.moveTo(sx, shoulderY + 12); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.strokeStyle = C(dark ? PLATE : PLATE_HI); ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo((ex + hx) / 2, (ey + hy) / 2); ctx.stroke();
    ctx.strokeStyle = C(BONE); ctx.lineWidth = 4;
    for (const o of [-0.5, 0, 0.5]) {
      const a = ang - 0.5 + o;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(hx + Math.cos(a) * 14, hy + Math.sin(a) * 14 - 4, hx + Math.cos(a + 0.4) * 24, hy + Math.sin(a + 0.4) * 24); ctx.stroke();
    }
  };
  arm(-6, 1.25 - atk * 0.6, true);

  // Legs
  for (const [lx, dark] of [[-32, true], [20, false]]) {
    ctx.fillStyle = C(dark ? '#38235a' : PLATE);
    ellipse(ctx, lx, -62, 26, 36); ctx.fill();
    ctx.fillStyle = C(dark ? '#1f142c' : ARMOR);
    rrect(ctx, lx - 13, -46, 26, 42, 9); ctx.fill();
    ctx.fillStyle = C(BONE);
    for (const o of [0, 9, 18]) { ctx.beginPath(); ctx.moveTo(lx + o - 2, -6); ctx.lineTo(lx + o + 9, -1); ctx.lineTo(lx + o - 1, 1); ctx.closePath(); ctx.fill(); }
  }

  // Body
  ctx.fillStyle = C(ARMOR);
  ellipse(ctx, 4, -112 + breathe, 60, 66); ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.5; ctx.stroke();
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = C(i % 2 ? PLATE : PLATE_HI);
    ctx.beginPath(); ctx.ellipse(18, -150 + i * 22 + breathe, 40 - i * 3, 14, 0.15, 0, Math.PI); ctx.fill();
  }
  const pulse = 0.55 + 0.35 * Math.sin(t * 3);
  glow(ctx, 24, -112 + breathe, 52, CORE, 0.45 * pulse + atk * 0.3);
  ctx.fillStyle = C('#f0d6ff'); diamond(ctx, 24, -110 + breathe, 8, 14); ctx.fill();
  // Shoulder plate with spikes
  ctx.fillStyle = C(PLATE_HI); ellipse(ctx, 36, shoulderY + 4, 30, 20, -0.2); ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = C(GOLD);
  for (const o of [-16, 0, 16]) { ctx.beginPath(); ctx.moveTo(36 + o - 6, shoulderY - 10); ctx.lineTo(36 + o - 2, shoulderY - 32 + Math.abs(o) * 0.6); ctx.lineTo(36 + o + 6, shoulderY - 10); ctx.closePath(); ctx.fill(); }

  // Neck and head
  const hx = 84 + atk * 14, hy = -212 + breathe - atk * 6;
  ctx.strokeStyle = C(ARMOR); ctx.lineWidth = 34;
  ctx.beginPath(); ctx.moveTo(34, shoulderY - 4); ctx.quadraticCurveTo(50, hy + 30, hx - 14, hy + 6); ctx.stroke();
  ctx.strokeStyle = C(PLATE); ctx.lineWidth = 6;
  for (let i = 0; i < 3; i++) { const k = 0.3 + i * 0.22; ctx.beginPath(); ctx.arc(34 + (hx - 48) * k, shoulderY - 4 + (hy - shoulderY + 10) * k, 14, -2.6, -1.2); ctx.stroke(); }
  // Horns (behind the skull)
  ctx.fillStyle = C(GOLD);
  const horn = (bx, by, tx, ty, w) => { ctx.beginPath(); ctx.moveTo(bx - w, by); ctx.quadraticCurveTo((bx + tx) / 2 - 18, (by + ty) / 2 - 4, tx, ty); ctx.quadraticCurveTo((bx + tx) / 2 + 4, (by + ty) / 2 + 8, bx + w, by + 4); ctx.closePath(); ctx.fill(); };
  horn(hx - 18, hy - 14, hx - 70, hy - 66, 9);
  horn(hx - 4, hy - 20, hx - 30, hy - 82, 8);
  horn(hx + 10, hy - 18, hx + 4, hy - 62, 6);
  // Lower jaw opens when attacking
  ctx.save(); ctx.translate(hx - 6, hy + 6); ctx.rotate(0.12 + atk * 0.45);
  ctx.fillStyle = C(PLATE); ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(46, 0); ctx.lineTo(40, 12); ctx.lineTo(0, 10); ctx.closePath(); ctx.fill();
  ctx.fillStyle = C(BONE); for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(12 + i * 9, -2); ctx.lineTo(16 + i * 9, -9); ctx.lineTo(20 + i * 9, -2); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  // Skull and snout
  ctx.fillStyle = C(PLATE_HI);
  ctx.beginPath(); ctx.moveTo(hx - 30, hy - 4); ctx.quadraticCurveTo(hx - 24, hy - 30, hx + 6, hy - 24); ctx.lineTo(hx + 46, hy - 6); ctx.lineTo(hx + 44, hy + 6); ctx.lineTo(hx - 24, hy + 12); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = C(BONE); for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(hx + 8 + i * 9, hy + 4); ctx.lineTo(hx + 12 + i * 9, hy + 12); ctx.lineTo(hx + 16 + i * 9, hy + 4); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = C('#1b1028'); ctx.beginPath(); ctx.moveTo(hx - 4, hy - 16); ctx.lineTo(hx + 22, hy - 10); ctx.lineTo(hx + 2, hy - 8); ctx.closePath(); ctx.fill();
  glow(ctx, hx + 10, hy - 12, 16, EYE, 0.9);
  ctx.fillStyle = '#fff2c8'; circle(ctx, hx + 10, hy - 12, 2.8); ctx.fill();
  // Breath when attacking
  if (atk > 0.05) { glow(ctx, hx + 62, hy + 10, 60 * atk, CORE, 0.85); glow(ctx, hx + 62, hy + 10, 26 * atk, '#ffe0ff', 0.9); }

  // Near arm (in front)
  arm(30, 1.05 - atk * 1.3, false);
}

// ---------------------------------------------------------------------------
// Small jungle camps: little monsters, facing +x, feet at (0,0)
// ---------------------------------------------------------------------------
function monsterEye(ctx, x, y, col, r) {
  glow(ctx, x, y, r * 3.2, col, 0.85);
  ctx.fillStyle = '#ffffff'; circle(ctx, x, y, r * 0.55); ctx.fill();
}
function fang(ctx, x, y, len, down) {
  ctx.beginPath(); ctx.moveTo(x - 2, y); ctx.lineTo(x, y + (down ? len : -len)); ctx.lineTo(x + 2, y); ctx.closePath(); ctx.fill();
}

// Moss Beetle: a horned, moss-backed rhino beetle with snapping mandibles.
function drawBeetle(ctx, t, pose, C) {
  const w = pose.walk || 0, atk = pose.atk >= 0 ? Math.sin(pose.atk * Math.PI) : 0;
  const bob = Math.sin(t * 3) * 1.2;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const near of [false, true]) {
    ctx.strokeStyle = C(near ? '#22301a' : '#141d10'); ctx.lineWidth = 4;
    for (let i = 0; i < 3; i++) {
      const bx = -14 + i * 13, sw = Math.sin(t * 11 + i * 2.1 + (near ? 0 : 1.5)) * 5 * w;
      const off = near ? 3 : -3;
      ctx.beginPath(); ctx.moveTo(bx, -14 + off); ctx.lineTo(bx + 7 + sw, -22 + off); ctx.lineTo(bx + 11 + sw, -1 + off); ctx.stroke();
    }
    if (!near) {
      // Abdomen shell
      ctx.fillStyle = C('#2c5226'); ellipse(ctx, -6, -24 + bob, 28, 18); ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = C('#1a3418'); ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-32, -26 + bob); ctx.quadraticCurveTo(-6, -32 + bob, 18, -26 + bob); ctx.stroke();
      ctx.fillStyle = C('#4f8a3c'); ellipse(ctx, -14, -33 + bob, 12, 5, -0.2); ctx.fill();
      ctx.fillStyle = C('#7cbf4f'); for (const [mx, my] of [[-22, -36], [-6, -38], [6, -34]]) { ellipse(ctx, mx, my + bob, 5, 2.5); ctx.fill(); }
      ctx.fillStyle = C('#d9cfae');
      for (const sx of [-24, -12, 0]) { ctx.beginPath(); ctx.moveTo(sx - 4, -38 + bob); ctx.lineTo(sx - 1, -48 + bob); ctx.lineTo(sx + 3, -38 + bob); ctx.closePath(); ctx.fill(); }
    }
  }
  // Head, horn and mandibles
  const hx = 22 + atk * 6, hy = -24 + bob;
  ctx.fillStyle = C('#1d3a1c'); ellipse(ctx, hx, hy, 12, 10); ctx.fill();
  ctx.fillStyle = C('#e2d6b4');
  ctx.beginPath(); ctx.moveTo(hx + 2, hy - 6); ctx.quadraticCurveTo(hx + 18, hy - 12, hx + 16, hy - 32 - atk * 4); ctx.quadraticCurveTo(hx + 10, hy - 14, hx - 4, hy - 8); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = C('#d0c49c'); ctx.lineWidth = 3;
  const open = 0.25 + atk * 0.6;
  for (const sg of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(hx + 8, hy + 2 + sg * 3); ctx.quadraticCurveTo(hx + 20, hy + 2 + sg * (5 + open * 10), hx + 24, hy + 2 + sg * (1 - open * 4)); ctx.stroke();
  }
  monsterEye(ctx, hx + 6, hy - 3, '#b8ff5a', 2.4);
}

// Thorn Lizard: a crouched, frilled reptile with a thorny back and a snapping jaw.
function drawLizard(ctx, t, pose, C) {
  const w = pose.walk || 0, atk = pose.atk >= 0 ? Math.sin(pose.atk * Math.PI) : 0;
  const sway = Math.sin(t * 5) * 4 * (0.4 + w);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // Tail
  for (let i = 10; i >= 0; i--) {
    const k = i / 10;
    const x = -16 - k * 40, y = -18 + k * 10 + Math.sin(t * 4 + k * 3) * 5 * k + sway * k;
    ctx.fillStyle = C(i % 2 ? '#56701f' : '#62802a'); circle(ctx, x, y, 9 * (1 - k) + 2.5); ctx.fill();
    if (i % 3 === 0 && i > 0) { ctx.fillStyle = C('#c94f2a'); ctx.beginPath(); ctx.moveTo(x - 3, y - 7 * (1 - k) - 1); ctx.lineTo(x, y - 14 * (1 - k) - 4); ctx.lineTo(x + 3, y - 7 * (1 - k) - 1); ctx.closePath(); ctx.fill(); }
  }
  // Legs
  for (const [lx, dark] of [[-10, true], [12, true], [-4, false], [18, false]]) {
    const sw = Math.sin(t * 10 + lx) * 4 * w;
    ctx.strokeStyle = C(dark ? '#3e5418' : '#5a7426'); ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(lx, -18); ctx.lineTo(lx - 4 + sw, -8); ctx.lineTo(lx + 4 + sw, -1); ctx.stroke();
    ctx.strokeStyle = C('#e8dcb8'); ctx.lineWidth = 1.6;
    for (const o of [-2, 1, 4]) { ctx.beginPath(); ctx.moveTo(lx + 4 + sw, -1); ctx.lineTo(lx + 8 + sw + o, 1); ctx.stroke(); }
  }
  // Body
  ctx.save(); ctx.translate(0, -26); ctx.rotate(-0.12);
  ctx.fillStyle = C('#62802a'); ellipse(ctx, 0, 0, 26, 13); ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = C('#cbb878'); ellipse(ctx, 4, 6, 18, 5); ctx.fill();
  ctx.fillStyle = C('#4a6420'); for (let i = 0; i < 6; i++) { circle(ctx, -14 + i * 6, -3 + (i % 2) * 3, 1.8); ctx.fill(); }
  ctx.fillStyle = C('#c94f2a');
  for (let i = 0; i < 6; i++) { const x = -18 + i * 7; ctx.beginPath(); ctx.moveTo(x - 3, -11); ctx.lineTo(x + 1, -22 - (i % 2) * 4); ctx.lineTo(x + 4, -11); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  // Neck, frill and head
  const hx = 32 + atk * 8, hy = -40;
  ctx.strokeStyle = C('#5a7426'); ctx.lineWidth = 11;
  ctx.beginPath(); ctx.moveTo(18, -30); ctx.lineTo(hx - 8, hy + 4); ctx.stroke();
  const fr = 0.7 + atk * 0.5;
  ctx.fillStyle = C('#d0582c');
  ctx.beginPath(); ctx.moveTo(hx - 6, hy);
  for (let i = 0; i <= 6; i++) { const a = -2.6 + i * 0.55; const r = (i % 2 ? 17 : 22) * fr; ctx.lineTo(hx - 8 + Math.cos(a) * r, hy + Math.sin(a) * r); }
  ctx.closePath(); ctx.fill();
  ctx.save(); ctx.translate(hx - 2, hy + 3); ctx.rotate(0.15 + atk * 0.5);
  ctx.fillStyle = C('#4e6820'); ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(20, 1); ctx.lineTo(18, 6); ctx.lineTo(0, 5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = C('#f1ead2'); for (let i = 0; i < 3; i++) fang(ctx, 7 + i * 5, 0, 4, false);
  ctx.restore();
  ctx.fillStyle = C('#6c8a2e');
  ctx.beginPath(); ctx.moveTo(hx - 10, hy + 2); ctx.quadraticCurveTo(hx - 6, hy - 10, hx + 6, hy - 8); ctx.lineTo(hx + 20, hy - 1); ctx.lineTo(hx + 19, hy + 4); ctx.lineTo(hx - 8, hy + 6); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = C('#f1ead2'); for (let i = 0; i < 3; i++) fang(ctx, hx + 6 + i * 5, hy + 4, 4, true);
  monsterEye(ctx, hx + 4, hy - 4, '#ffe36a', 2.2);
  ctx.fillStyle = '#1a1a10'; ctx.fillRect(hx + 3.5, hy - 6, 1, 4);
}

// Shell Crab: a rock-shelled crab with one huge pincer and glowing eye stalks.
function drawCrab(ctx, t, pose, C) {
  const w = pose.walk || 0, atk = pose.atk >= 0 ? Math.sin(pose.atk * Math.PI) : 0;
  const bob = Math.sin(t * 2.5) * 1.2;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // Spindly legs
  for (const near of [false, true]) {
    ctx.strokeStyle = C(near ? '#9a4424' : '#6e2e18'); ctx.lineWidth = 3.5;
    for (let i = 0; i < 4; i++) {
      const bx = -18 + i * 9, sw = Math.sin(t * 12 + i * 1.7 + (near ? 0 : 2)) * 4 * w;
      const off = near ? 4 : -4;
      ctx.beginPath(); ctx.moveTo(bx, -16 + off); ctx.lineTo(bx - 10 + sw, -22 + off); ctx.lineTo(bx - 14 + sw, 0 + off * 0.3); ctx.stroke();
    }
  }
  // Shell
  ctx.fillStyle = C('#b4532a'); ellipse(ctx, -6, -24 + bob, 26, 16); ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = C('#d26c3a'); ellipse(ctx, -12, -30 + bob, 12, 6, -0.2); ctx.fill();
  ctx.fillStyle = C('#5f5650');
  for (const [rx, ry, rr] of [[-20, -36, 6], [-6, -40, 7], [8, -34, 5]]) { poly(ctx, rx, ry + bob, rr, 5, rx); ctx.fill(); }
  ctx.fillStyle = C('#e8e0d0'); for (const [bx, by] of [[-24, -26], [2, -24], [-10, -20]]) { circle(ctx, bx, by + bob, 2.2); ctx.fill(); }
  // Eye stalks
  ctx.strokeStyle = C('#8a3a1e'); ctx.lineWidth = 2.5;
  for (const ex of [10, 16]) { ctx.beginPath(); ctx.moveTo(ex - 4, -30 + bob); ctx.lineTo(ex, -44 + bob + Math.sin(t * 3 + ex) * 2); ctx.stroke(); monsterEye(ctx, ex, -45 + bob + Math.sin(t * 3 + ex) * 2, '#7df3ff', 2.2); }
  // Small claw (far) and big claw (near)
  const claw = (cx, cy, size, open, col) => {
    ctx.save(); ctx.translate(cx, cy);
    ctx.fillStyle = C(col);
    ctx.save(); ctx.rotate(-open); ellipse(ctx, size, -size * 0.25, size, size * 0.42); ctx.fill(); ctx.restore();
    ctx.save(); ctx.rotate(open * 0.6); ellipse(ctx, size * 0.85, size * 0.25, size * 0.8, size * 0.3); ctx.fill(); ctx.restore();
    ctx.fillStyle = C('#f0e2c8'); ctx.save(); ctx.rotate(-open); for (let i = 0; i < 3; i++) fang(ctx, size * 0.8 + i * size * 0.28, size * 0.12, 3, true); ctx.restore();
    ctx.restore();
  };
  claw(14, -18 + bob, 9, 0.2 + atk * 0.4, '#8f3c1e');
  ctx.strokeStyle = C('#a84a24'); ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(10, -22 + bob); ctx.lineTo(20 + atk * 6, -30 + bob - atk * 6); ctx.stroke();
  claw(20 + atk * 6, -32 + bob - atk * 6, 15, 0.25 + atk * 0.7, '#c45c2c');
}

// Dusk Wolf: a hunched dire wolf with a spiked mane and burning red eyes.
function drawWolf(ctx, t, pose, C) {
  const w = pose.walk || 0, atk = pose.atk >= 0 ? Math.sin(pose.atk * Math.PI) : 0;
  const bob = Math.sin(t * 2.4) * 1.2 + Math.abs(Math.sin(t * 9)) * 2 * w;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  glow(ctx, 0, -26, 50, '#8a5cff', 0.14);
  ctx.translate(atk * 8, 0);
  // Tail
  ctx.fillStyle = C('#3a3248');
  ctx.beginPath(); ctx.moveTo(-22, -30 + bob); ctx.quadraticCurveTo(-42, -40 + Math.sin(t * 5) * 4, -46, -26); ctx.quadraticCurveTo(-34, -24, -22, -22 + bob); ctx.fill();
  // Legs
  for (const [lx, dark, ph] of [[-16, true, 0], [12, true, 2], [-10, false, 3], [18, false, 1]]) {
    const sw = Math.sin(t * 10 + ph) * 6 * w;
    ctx.strokeStyle = C(dark ? '#2b2536' : '#3d3550'); ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(lx, -22 + bob); ctx.lineTo(lx + sw * 0.5, -10); ctx.lineTo(lx + sw, -1); ctx.stroke();
    ctx.fillStyle = C('#e8e0d0'); for (const o of [2, 5]) { ctx.beginPath(); ctx.moveTo(lx + sw + o, -1); ctx.lineTo(lx + sw + o + 3, 1); ctx.lineTo(lx + sw + o, 1); ctx.closePath(); ctx.fill(); }
  }
  // Body
  ctx.fillStyle = C('#4a4160'); ellipse(ctx, 0, -28 + bob, 24, 12); ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = C('#5c5276'); ellipse(ctx, -4, -33 + bob, 14, 5); ctx.fill();
  // Spiked mane
  ctx.fillStyle = C('#241e30');
  for (let i = 0; i < 7; i++) {
    const x = -8 + i * 4.5, h = 10 + (i % 2) * 6 + Math.sin(t * 6 + i) * 1.5;
    ctx.beginPath(); ctx.moveTo(x - 4, -36 + bob); ctx.lineTo(x + 2, -36 - h + bob); ctx.lineTo(x + 5, -35 + bob); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = C('#a57cff'); for (const i of [2, 4]) { const x = -8 + i * 4.5; circle(ctx, x + 2, -48 + bob - (i % 2) * 6, 1.6); ctx.fill(); }
  // Head with opening jaw
  const hx = 26, hy = -36 + bob;
  ctx.fillStyle = C('#2b2536');
  ctx.beginPath(); ctx.moveTo(hx - 4, hy - 8); ctx.lineTo(hx - 1, hy - 22); ctx.lineTo(hx + 5, hy - 9); ctx.closePath(); ctx.fill();
  ctx.save(); ctx.translate(hx + 2, hy + 4); ctx.rotate(0.1 + atk * 0.5);
  ctx.fillStyle = C('#3d3550'); ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(18, 0); ctx.lineTo(16, 5); ctx.lineTo(0, 5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = C('#f4efe2'); fang(ctx, 12, 0, 5, false); fang(ctx, 6, 0, 3, false);
  ctx.restore();
  ctx.fillStyle = C('#4a4160');
  ctx.beginPath(); ctx.moveTo(hx - 10, hy + 2); ctx.quadraticCurveTo(hx - 6, hy - 12, hx + 6, hy - 9); ctx.lineTo(hx + 22, hy); ctx.lineTo(hx + 21, hy + 5); ctx.lineTo(hx - 6, hy + 7); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = C('#1a1520'); circle(ctx, hx + 22, hy + 1, 2.2); ctx.fill();
  ctx.fillStyle = C('#f4efe2'); fang(ctx, hx + 15, hy + 4, 6, true); fang(ctx, hx + 9, hy + 4, 4, true);
  monsterEye(ctx, hx + 6, hy - 4, '#ff3a4a', 2.3);
  if (atk > 0.1) glow(ctx, hx + 24, hy + 4, 18 * atk, '#ff6a7a', 0.5);
}

function drawMonster(ctx, m, t, pose) {
  const hurt = pose.hurt || 0;
  const C = c => (hurt > 0.02 ? mix(c, '#ffffff', hurt * 0.6) : c);
  const bob = Math.sin(t * 2.5 + m.id) * 2;
  ctx.save();
  if (pose.dead > 0) { ctx.globalAlpha *= 1 - pose.dead; ctx.scale(1, 1 - pose.dead * 0.6); }
  switch (m.mtype) {
    case 'wisp': {
      const y = -46 + Math.sin(t * 2) * 6;
      glow(ctx, 0, y, 60, '#6fd2ff', 0.45);
      ctx.fillStyle = C('#9fe3ff');
      ctx.beginPath(); ctx.moveTo(0, y - 30); ctx.quadraticCurveTo(26, y, 0, y + 30 + Math.sin(t * 4) * 4); ctx.quadraticCurveTo(-26, y, 0, y - 30); ctx.fill();
      ctx.fillStyle = C('#e8fbff'); circle(ctx, 0, y + 2, 12); ctx.fill();
      ctx.fillStyle = '#1b4a6e'; ellipse(ctx, -4, y, 2, 3.5); ctx.fill(); ellipse(ctx, 5, y, 2, 3.5); ctx.fill();
      for (let i = 0; i < 4; i++) { const a = t * 1.8 + i * TAU / 4; ctx.fillStyle = 'rgba(200,245,255,0.9)'; circle(ctx, Math.cos(a) * 34, y + Math.sin(a) * 12, 3); ctx.fill(); }
      break;
    }
    case 'brute':
      drawRig(ctx, BRUTE_LOOK, pose);
      break;
    case 'beetle': ctx.scale(1.25, 1.25); drawBeetle(ctx, t, pose, C); break;
    case 'lizard': ctx.scale(1.25, 1.25); drawLizard(ctx, t, pose, C); break;
    case 'crab': ctx.scale(1.25, 1.25); drawCrab(ctx, t, pose, C); break;
    case 'wolf': ctx.scale(1.25, 1.25); drawWolf(ctx, t, pose, C); break;
    case 'turtle': {
      const s = 1;
      ctx.fillStyle = C('#2f6e6a');
      for (const [fx, fy] of [[-46, -8], [46, -8], [-34, 10], [34, 10]]) { ellipse(ctx, fx * s, fy + Math.sin(t * 2 + fx) * 2, 16, 9, fx > 0 ? 0.4 : -0.4); ctx.fill(); }
      ctx.fillStyle = C('#4b9a8f'); ellipse(ctx, 58, -26 + bob, 18, 14); ctx.fill();
      ctx.fillStyle = '#1a2a2a'; circle(ctx, 66, -30 + bob, 3); ctx.fill();
      ctx.fillStyle = C('#295a6e'); ellipse(ctx, 0, -34 + bob * 0.5, 58, 40); ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = C('#7fd6d0'); ctx.lineWidth = 2.5;
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; poly(ctx, Math.cos(a) * 30, -36 + Math.sin(a) * 20 + bob * 0.5, 13, 6, 0); ctx.stroke(); }
      poly(ctx, 0, -36 + bob * 0.5, 14, 6, 0); ctx.stroke();
      glow(ctx, 0, -36, 70, '#5fe0d8', 0.18 + 0.08 * Math.sin(t * 2));
      break;
    }
    case 'wyrm':
      drawLord(ctx, t, pose, C);
      break;
    default: break;
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Structures (feet at 0,0)
// ---------------------------------------------------------------------------
function drawTower(ctx, s, t) {
  const T = D.TEAMS[s.team];
  if (s.dead) { drawRubble(ctx, s, 38); return; }
  ctx.fillStyle = '#3e434a'; poly(ctx, 0, 0, 40, 8, Math.PI / 8); ctx.fill();
  ctx.fillStyle = '#5a6068'; poly(ctx, 0, -6, 32, 8, Math.PI / 8); ctx.fill();
  const g = ctx.createLinearGradient(-16, 0, 16, 0);
  g.addColorStop(0, '#565d65'); g.addColorStop(0.5, '#a3abb3'); g.addColorStop(1, '#565d65');
  ctx.fillStyle = g; ctx.fillRect(-15, -76, 30, 72);
  ctx.fillStyle = T.deep; ctx.fillRect(-15, -66, 30, 18);
  ctx.fillStyle = T.color; ctx.fillRect(-15, -66, 30, 3);
  ctx.fillStyle = '#7d858d'; ctx.fillRect(-20, -82, 40, 9);
  for (const x of [-20, -8, 4, 16]) { ctx.fillStyle = '#6a7179'; ctx.fillRect(x, -88, 6, 7); }
  const pulse = 0.55 + 0.45 * Math.sin(t * 3 + s.id);
  glow(ctx, 0, -104, 42, T.color, 0.28 * pulse + (s.target ? 0.3 : 0));
  ctx.fillStyle = T.deep; diamond(ctx, 0, -104, 14, 24); ctx.fill();
  ctx.fillStyle = T.color; diamond(ctx, 0, -105, 10, 19); ctx.fill();
  ctx.fillStyle = T.light; diamond(ctx, -3, -110, 3, 7); ctx.fill();
}
function drawCore(ctx, s, t) {
  const T = D.TEAMS[s.team];
  if (s.dead) { drawRubble(ctx, s, 64); return; }
  ctx.fillStyle = '#353a40'; poly(ctx, 0, 6, 70, 6, Math.PI / 6); ctx.fill();
  ctx.fillStyle = '#525960'; poly(ctx, 0, 0, 58, 6, Math.PI / 6); ctx.fill();
  ctx.strokeStyle = rgba(T.color, 0.65); ctx.lineWidth = 3; poly(ctx, 0, 0, 46, 6, Math.PI / 6); ctx.stroke();
  const bob = Math.sin(t * 2 + s.team) * 5;
  glow(ctx, 0, -76 + bob, 95, T.color, 0.38 + 0.1 * Math.sin(t * 3));
  ctx.save(); ctx.translate(0, -76 + bob);
  ctx.strokeStyle = rgba(T.light, 0.7); ctx.lineWidth = 2;
  ellipse(ctx, 0, 0, 46, 12, t * 0.6); ctx.stroke();
  ellipse(ctx, 0, 0, 40, 10, -t * 0.8 + 1); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = T.deep; diamond(ctx, 0, -70 + bob, 28, 54); ctx.fill();
  ctx.fillStyle = T.color; diamond(ctx, 0, -72 + bob, 21, 44); ctx.fill();
  ctx.fillStyle = T.light; diamond(ctx, -6, -84 + bob, 6, 16); ctx.fill();
}
function diamond(ctx, x, y, w, h) {
  ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + w, y); ctx.lineTo(x, y + h * 0.7); ctx.lineTo(x - w, y); ctx.closePath();
}
function drawRubble(ctx, u, r) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ellipse(ctx, 0, 4, r * 1.2, r * 0.55); ctx.fill();
  const rnd = D.mulberry32(u.idx * 97 + 5);
  for (let i = 0; i < 10; i++) {
    const a = rnd() * TAU, d = rnd() * r;
    ctx.fillStyle = i % 2 ? '#4e5359' : '#3b3f44';
    poly(ctx, Math.cos(a) * d, Math.sin(a) * d * 0.5 - 4, 6 + rnd() * 10, 5, rnd() * TAU); ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// Obstacles (drawn y-sorted with units)
// ---------------------------------------------------------------------------
function drawObstacle(ctx, o, t) {
  const rnd = D.mulberry32(o.seed);
  if (o.kind === 'tree') {
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ellipse(ctx, 10, 6, o.r * 1.15, o.r * 0.5); ctx.fill();
    ctx.fillStyle = '#4a3322'; ctx.fillRect(-7, -o.r * 0.6, 14, o.r * 0.6);
    const n = 3 + (rnd() * 3 | 0);
    const blobs = [];
    const big = o.wall !== undefined ? 1.18 : 1;
    for (let i = 0; i < n; i++) blobs.push([(rnd() - 0.5) * o.r * 1.1 * big, -o.r * 0.9 - rnd() * o.r * 0.5, o.r * (0.5 + rnd() * 0.3) * big]);
    // Autumn canopies: crimson-orange or gold, picked by the tree's seed.
    const leaves = o.seed % 3 ? ['#2a1006', '#64230e', '#9c3c16', '#cc6420'] : ['#2c2006', '#6c5010', '#a8801e', '#d6ae38'];
    for (const [bx, by, br] of blobs) { ctx.fillStyle = leaves[0]; circle(ctx, bx, by + 2, br + 5.5); ctx.fill(); }
    const sway = Math.sin(t * 0.8 + o.seed) * 1.5;
    for (const [bx, by, br] of blobs) { ctx.fillStyle = leaves[1]; circle(ctx, bx + sway, by + 4, br + 3); ctx.fill(); }
    for (const [bx, by, br] of blobs) { ctx.fillStyle = leaves[2]; circle(ctx, bx + sway, by, br); ctx.fill(); }
    for (const [bx, by, br] of blobs) { ctx.fillStyle = leaves[3]; circle(ctx, bx + sway - br * 0.25, by - br * 0.3, br * 0.55); ctx.fill(); }
  } else {
    drawRock(ctx, o, rnd);
  }
}

// Walls drawn as one shape under the units: a stone ridge (outline, body, lit top) for rock walls and
// a shaded forest floor for tree lines. `up` is the screen-up direction in world space (the red
// team's view is flipped), so the lit top always faces up on screen.
function wallPath(ctx, pts, ox, oy) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x + ox, p.y + oy) : ctx.moveTo(p.x + ox, p.y + oy)));
  if (pts.length === 1) ctx.lineTo(pts[0].x + ox + 0.1, pts[0].y + oy);
}
function drawWallBase(ctx, run, up) {
  const pts = run.pts, r = pts.reduce((s, p) => s + p.r, 0) / pts.length;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (run.kind === 'tree') {
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = r * 2.9; wallPath(ctx, pts, 10, 12); ctx.stroke();
    ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = r * 2.6; wallPath(ctx, pts, 0, 0); ctx.stroke();
    ctx.strokeStyle = '#3c2610'; ctx.lineWidth = r * 1.9; wallPath(ctx, pts, 0, 0); ctx.stroke();
    ctx.restore();
    return;
  }
  const ux = up.x, uy = up.y;
  ctx.strokeStyle = 'rgba(0,0,0,0.32)'; ctx.lineWidth = r * 2.3; wallPath(ctx, pts, 12, 14); ctx.stroke();
  ctx.strokeStyle = '#3a2618'; ctx.lineWidth = r * 2.15 + 5; wallPath(ctx, pts, 0, 0); ctx.stroke();
  ctx.strokeStyle = '#7a5038'; ctx.lineWidth = r * 2.15; wallPath(ctx, pts, 0, 0); ctx.stroke();
  ctx.strokeStyle = '#996a4a'; ctx.lineWidth = r * 1.6; wallPath(ctx, pts, ux * r * 0.22, uy * r * 0.22); ctx.stroke();
  ctx.strokeStyle = '#b8875e'; ctx.lineWidth = r * 1.05; wallPath(ctx, pts, ux * r * 0.38, uy * r * 0.38); ctx.stroke();
  ctx.strokeStyle = 'rgba(240,206,160,0.5)'; ctx.lineWidth = r * 0.35; wallPath(ctx, pts, ux * r * 0.55, uy * r * 0.55); ctx.stroke();
  // Moss along the top and cracks down the sides.
  const rnd = D.mulberry32(pts[0].seed);
  for (const p of pts) {
    if (rnd() < 0.55) { ctx.fillStyle = rnd() < 0.5 ? '#a8862e' : '#c09a3a'; ellipse(ctx, p.x + ux * r * 0.45 + (rnd() - 0.5) * r, p.y + uy * r * 0.45 + (rnd() - 0.5) * r * 0.4, r * (0.25 + rnd() * 0.2), r * 0.12, rnd() * Math.PI); ctx.fill(); }
    ctx.strokeStyle = 'rgba(52,30,18,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.x - ux * r * 0.1, p.y - uy * r * 0.1); ctx.lineTo(p.x - ux * r * 0.55 + (rnd() - 0.5) * 12, p.y - uy * r * 0.55 + (rnd() - 0.5) * 12); ctx.stroke();
  }
  ctx.restore();
}

// Rocks: a cluster of faceted boulders, lit from the upper left, with moss on top and pebbles around.
function boulder(ctx, x, y, r, rnd, tint) {
  const n = 7 + (rnd() * 3 | 0), pts = [];
  for (let i = 0; i < n; i++) {
    const a = Math.PI + i / (n - 1) * Math.PI, rr = r * (0.82 + rnd() * 0.22);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.95]);
  }
  pts.push([x + r * 0.95, y + r * 0.12], [x + r * 0.5, y + r * 0.32], [x - r * 0.45, y + r * 0.3], [x - r * 0.95, y + r * 0.1]);
  const path = () => { ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); };
  // body
  const gr = ctx.createLinearGradient(x - r, y - r, x + r * 0.8, y + r * 0.4);
  gr.addColorStop(0, shade(tint, 0.18)); gr.addColorStop(0.55, tint); gr.addColorStop(1, shade(tint, -0.42));
  path(); ctx.fillStyle = gr; ctx.fill();
  // facets: a lit top plane and a shadowed right side
  ctx.save(); path(); ctx.clip();
  ctx.fillStyle = shade(tint, 0.32);
  ctx.beginPath(); ctx.moveTo(x - r * 0.7, y - r * 0.35); ctx.lineTo(x - r * 0.15, y - r * 0.92); ctx.lineTo(x + r * 0.45, y - r * 0.7); ctx.lineTo(x + r * 0.1, y - r * 0.2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(tint, -0.3);
  ctx.beginPath(); ctx.moveTo(x + r * 0.1, y - r * 0.2); ctx.lineTo(x + r * 0.45, y - r * 0.7); ctx.lineTo(x + r, y - r * 0.1); ctx.lineTo(x + r, y + r * 0.4); ctx.lineTo(x + r * 0.2, y + r * 0.4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(tint, -0.55);
  ctx.fillRect(x - r, y + r * 0.08, r * 2, r * 0.4);
  // cracks
  ctx.strokeStyle = shade(tint, -0.6); ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(x - r * 0.2, y - r * 0.55); ctx.lineTo(x - r * 0.05, y - r * 0.3); ctx.lineTo(x - r * 0.25, y - r * 0.05); ctx.stroke();
  // dry grass cap
  ctx.fillStyle = '#a8862e';
  ellipse(ctx, x - r * 0.25, y - r * 0.78, r * 0.42, r * 0.16, -0.25); ctx.fill();
  ctx.fillStyle = '#d0aa48';
  ellipse(ctx, x - r * 0.32, y - r * 0.84, r * 0.24, r * 0.08, -0.25); ctx.fill();
  ctx.restore();
  // outline
  path(); ctx.strokeStyle = '#3a2618'; ctx.lineWidth = 2.6; ctx.stroke();
}
function drawRock(ctx, o, rnd) {
  const r = o.r;
  if (o.wall !== undefined) {
    // A capstone on a rock ridge: the ridge itself is drawn by drawWallBase.
    const tint = ['#b08462', '#a87a58', '#bc9070'][o.seed % 3];
    boulder(ctx, (rnd() - 0.5) * r * 0.3, -r * 0.35, r * (0.62 + rnd() * 0.2), rnd, tint);
    if (rnd() < 0.45) boulder(ctx, r * (rnd() < 0.5 ? -0.45 : 0.45), -r * 0.05, r * 0.32, rnd, shade(tint, -0.08));
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.32)'; ellipse(ctx, 8, 6, r * 1.15, r * 0.48); ctx.fill();
  const tint = ['#b08462', '#a87a58', '#bc9070'][(rnd() * 3) | 0];
  // a smaller stone behind, the main boulder, and one in front
  boulder(ctx, r * 0.55, -r * 0.05, r * 0.5, rnd, shade(tint, -0.08));
  boulder(ctx, -r * 0.08, 0, r * 0.85, rnd, tint);
  boulder(ctx, -r * 0.62, r * 0.18, r * 0.36, rnd, shade(tint, 0.05));
  // pebbles and a tuft of grass at the foot
  for (let i = 0; i < 4; i++) {
    const px = (rnd() - 0.5) * r * 1.9, py = r * (0.25 + rnd() * 0.2);
    ctx.fillStyle = shade(tint, -0.2); ellipse(ctx, px, py, 4 + rnd() * 4, 3 + rnd() * 2); ctx.fill();
    ctx.strokeStyle = '#3a2618'; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.strokeStyle = '#a08430'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) { const gx = r * (0.35 + rnd() * 0.5) * (i % 2 ? 1 : -1), gy = r * 0.3; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + (rnd() - 0.5) * 6, gy - 8 - rnd() * 8); ctx.stroke(); }
}

// ---------------------------------------------------------------------------
// Terrain, prerendered at half resolution
// ---------------------------------------------------------------------------
const TERRAIN_SCALE = 0.5;
function buildTerrain() {
  const c = document.createElement('canvas');
  c.width = D.W * TERRAIN_SCALE; c.height = D.H * TERRAIN_SCALE;
  const g = c.getContext('2d');
  g.scale(TERRAIN_SCALE, TERRAIN_SCALE);
  const rnd = D.mulberry32(77);
  const area = (D.W * D.H) / (3600 * 3600);
  const lanePath = L => { g.beginPath(); L.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); };
  const strokeLane = (L, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; lanePath(L); g.stroke(); };
  const nearLane = (x, y, d) => D.LANE_IDS.some(id => D.laneProject(D.LANES[id], x, y).d < d);

  // Deep jungle floor everywhere, brighter meadow along the lanes and river.
  g.fillStyle = '#2b2614'; g.fillRect(0, 0, D.W, D.H);
  for (const id of D.LANE_IDS) { strokeLane(D.LANES[id], 900, 'rgba(104,84,36,0.55)'); strokeLane(D.LANES[id], 620, 'rgba(138,110,48,0.55)'); }
  // The river as a shape grown by `extra` around the water's edge: two pools and the channel.
  const riverShape = (extra, col) => {
    g.fillStyle = g.strokeStyle = col;
    for (const p of D.RIVER.pools) { circle(g, p.x, p.y, Math.max(4, p.r + extra)); g.fill(); }
    const [a, b] = D.RIVER.channel;
    g.lineWidth = Math.max(4, (D.RIVER.half + extra) * 2); g.lineCap = 'round';
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  };
  // A random point in the water (gap < lo) or on the bank (lo < gap < hi).
  const riverPoint = (lo, hi) => {
    for (let k = 0; k < 60; k++) {
      const x = D.RIVER.pools[0].x - 500 + rnd() * (D.RIVER.pools[1].x - D.RIVER.pools[0].x + 1000), y = x + (rnd() - 0.5) * 1400;
      const gp = D.riverGap(x, y);
      if (gp < hi && gp > lo) return { x, y };
    }
    return null;
  };
  riverShape(260, 'rgba(116,98,44,0.5)');
  for (let i = 0; i < 4200 * area; i++) {
    const x = rnd() * D.W, y = rnd() * D.H, r = 30 + rnd() * 120;
    g.fillStyle = rnd() < 0.5 ? `rgba(196,150,66,${0.04 + rnd() * 0.06})` : `rgba(24,14,6,${0.06 + rnd() * 0.09})`;
    circle(g, x, y, r); g.fill();
  }
  g.lineWidth = 2; g.lineCap = 'round';
  for (let i = 0; i < 26000 * area; i++) {
    const x = rnd() * D.W, y = rnd() * D.H, l = 6 + rnd() * 11;
    g.strokeStyle = rnd() < 0.55 ? 'rgba(226,182,92,0.17)' : 'rgba(30,18,8,0.28)';
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 6, y - l); g.stroke();
  }
  // Jungle undergrowth: ferns and leaf litter away from the lanes
  for (let i = 0; i < 1600 * area; i++) {
    const x = rnd() * D.W, y = rnd() * D.H;
    if (nearLane(x, y, 330) || D.riverGap(x, y) < 90) continue;
    g.save(); g.translate(x, y); g.rotate(rnd() * TAU);
    g.fillStyle = rnd() < 0.5 ? 'rgba(112,64,24,0.85)' : 'rgba(140,86,30,0.8)';
    for (let k = 0; k < 5; k++) { g.rotate(TAU / 5); ellipse(g, 12, 0, 13, 4.5); g.fill(); }
    g.restore();
  }

  // River: sandy banks, turquoise water, rocks and lily pads
  riverShape(45, 'rgba(176,160,112,0.55)'); riverShape(21, '#9b8d63');
  for (let i = 0; i < 140 * area; i++) {
    const p = riverPoint(2, 40);
    if (!p) continue;
    g.fillStyle = rnd() < 0.5 ? '#8a7d56' : '#b3a37a'; circle(g, p.x, p.y, 14 + rnd() * 26); g.fill();
  }
  riverShape(0, '#1b5566'); riverShape(-25, '#226f82'); riverShape(-65, '#2c8a9a'); riverShape(-120, 'rgba(120,220,220,0.22)');
  g.strokeStyle = 'rgba(220,250,255,0.2)'; g.lineWidth = 3;
  for (let i = 0; i < 300 * area; i++) {
    const p = riverPoint(-1e9, -30);
    if (!p) continue;
    g.beginPath(); g.moveTo(p.x - 16, p.y + 4); g.quadraticCurveTo(p.x, p.y - 6, p.x + 16, p.y + 4); g.stroke();
  }
  for (let i = 0; i < 60 * area; i++) {
    const p = riverPoint(-1e9, -40);
    if (!p) continue;
    const { x, y } = p;
    if (rnd() < 0.55) {
      const r = 10 + rnd() * 10, a0 = rnd() * TAU;
      g.fillStyle = '#3f8a3a'; g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, a0 + 0.5, a0 + TAU - 0.1); g.closePath(); g.fill();
      if (rnd() < 0.4) { g.fillStyle = '#f2b6cf'; circle(g, x + 3, y - 3, 4); g.fill(); }
    } else {
      const r = 12 + rnd() * 18;
      g.fillStyle = '#4c5258'; poly(g, x, y, r, 6, rnd()); g.fill();
      g.fillStyle = '#6b7279'; poly(g, x - r * 0.25, y - r * 0.25, r * 0.55, 5, rnd()); g.fill();
    }
  }

  // Lanes: paved stone roads with curbs and staggered tiles
  for (const id of D.LANE_IDS) {
    const L = D.LANES[id];
    strokeLane(L, 318, 'rgba(10,14,10,0.35)');
    strokeLane(L, 300, '#47443c');
    strokeLane(L, 270, '#8c836e');
    strokeLane(L, 236, '#999079');
    const step = 36;
    let row = 0;
    for (let s = 0; s < L.len; s += step, row++) {
      const p = D.laneAt(L, s), nx = -p.dy, ny = p.dx;
      // Transverse joint
      g.strokeStyle = 'rgba(52,48,40,0.35)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(p.x + nx * 128, p.y + ny * 128); g.lineTo(p.x - nx * 128, p.y - ny * 128); g.stroke();
      // Staggered tiles: tints and longitudinal joints
      for (let k = -2; k <= 2; k++) {
        const o = (k + (row % 2 ? 0.5 : 0)) * 52;
        if (Math.abs(o) > 118) continue;
        const cx = p.x + nx * o + p.dx * step / 2, cy = p.y + ny * o + p.dy * step / 2;
        if (rnd() < 0.35) {
          g.fillStyle = rnd() < 0.5 ? 'rgba(255,248,226,0.1)' : 'rgba(40,34,24,0.12)';
          g.save(); g.translate(cx, cy); g.rotate(Math.atan2(p.dy, p.dx)); g.fillRect(-step / 2 + 1, -25, step - 2, 50); g.restore();
        }
        g.strokeStyle = 'rgba(52,48,40,0.28)'; g.lineWidth = 1.6;
        const jx = p.x + nx * (o + 26), jy = p.y + ny * (o + 26);
        if (Math.abs(o + 26) < 124) { g.beginPath(); g.moveTo(jx, jy); g.lineTo(jx + p.dx * step, jy + p.dy * step); g.stroke(); }
      }
      // Curb stones and moss on the edges
      for (const side of [-1, 1]) {
        const ex = p.x + nx * side * 143, ey = p.y + ny * side * 143;
        g.fillStyle = row % 2 ? '#5a564c' : '#524e45';
        g.save(); g.translate(ex, ey); g.rotate(Math.atan2(p.dy, p.dx)); g.fillRect(-step / 2, -7, step - 3, 14); g.restore();
        if (rnd() < 0.3) { g.fillStyle = 'rgba(80,140,60,0.6)'; circle(g, ex + nx * side * 6, ey + ny * side * 6, 4 + rnd() * 6); g.fill(); }
      }
    }
  }

  // Stone wall around the edge of the map, with posts along it.
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 170; g.strokeRect(0, 0, D.W, D.H);
  g.strokeStyle = '#3a2a1c'; g.lineWidth = 140; g.strokeRect(0, 0, D.W, D.H);
  g.strokeStyle = '#7a5a40'; g.lineWidth = 100; g.strokeRect(0, 0, D.W, D.H);
  g.strokeStyle = '#a07a56'; g.lineWidth = 30; g.strokeRect(36, 36, D.W - 72, D.H - 72);
  for (let k = 160; k < D.W - 100; k += 320) {
    for (const [x, y] of [[k, 30], [k, D.H - 30], [30, k], [D.W - 30, k]]) {
      g.fillStyle = '#3a2a1c'; circle(g, x, y, 30); g.fill();
      g.fillStyle = '#b8906a'; circle(g, x - 4, y - 4, 22); g.fill();
    }
  }

  // Boss pits: sunken stone arenas in the river
  for (const cp of D.CAMPS) {
    const boss = cp.type === 'wyrm' || cp.type === 'turtle';
    // Bosses that share a pit draw it once.
    if (cp.type === 'turtle' && D.CAMPS.some(o => o.type === 'wyrm' && Math.hypot(o.x - cp.x, o.y - cp.y) < 50)) continue;
    if (!boss) {
      const gr = g.createRadialGradient(cp.x, cp.y, 10, cp.x, cp.y, 190);
      gr.addColorStop(0, 'rgba(120,96,64,0.6)'); gr.addColorStop(1, 'rgba(120,96,64,0)');
      g.fillStyle = gr; circle(g, cp.x, cp.y, 190); g.fill();
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * TAU + rnd() * 0.3;
        g.fillStyle = '#5c5a52'; poly(g, cp.x + Math.cos(a) * 150, cp.y + Math.sin(a) * 150, 9 + rnd() * 6, 5, rnd() * TAU); g.fill();
      }
      continue;
    }
    const R = 300, rune = cp.type === 'wyrm' ? '#b77dff' : '#5fe0d8';
    g.fillStyle = 'rgba(0,0,0,0.35)'; circle(g, cp.x + 10, cp.y + 14, R + 34); g.fill();
    g.fillStyle = '#3c3a35'; circle(g, cp.x, cp.y, R + 30); g.fill();
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * TAU;
      g.fillStyle = i % 2 ? '#56534b' : '#4b4841';
      g.save(); g.translate(cp.x + Math.cos(a) * (R + 15), cp.y + Math.sin(a) * (R + 15)); g.rotate(a);
      g.fillRect(-14, -36, 28, 72); g.restore();
    }
    const fl = g.createRadialGradient(cp.x, cp.y, 20, cp.x, cp.y, R);
    fl.addColorStop(0, '#3b3f3a'); fl.addColorStop(1, '#23262a');
    g.fillStyle = fl; circle(g, cp.x, cp.y, R); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 3;
    for (let r = 90; r < R; r += 80) { circle(g, cp.x, cp.y, r); g.stroke(); }
    g.strokeStyle = rgba(rune, 0.55); g.lineWidth = 6; g.setLineDash([26, 18]);
    circle(g, cp.x, cp.y, R - 40); g.stroke(); g.setLineDash([]);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU + 0.2;
      g.fillStyle = rgba(rune, 0.7); diamond(g, cp.x + Math.cos(a) * (R - 40), cp.y + Math.sin(a) * (R - 40), 8, 13); g.fill();
    }
  }

  // Bases: tiled plazas with team inlays
  for (const team of [0, 1]) {
    const T = D.TEAMS[team];
    const off = 330 * D.MAP, R = 560 * D.MAP;
    const cx = team === 0 ? off : D.W - off, cy = team === 0 ? D.H - off : off;
    g.fillStyle = 'rgba(0,0,0,0.35)'; circle(g, cx + 12, cy + 16, R + 30); g.fill();
    g.fillStyle = '#3a3e42'; circle(g, cx, cy, R + 20); g.fill();
    g.fillStyle = '#5a5f63'; circle(g, cx, cy, R); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 3;
    for (let r = 140; r < R; r += 90) { circle(g, cx, cy, r); g.stroke(); }
    for (let a = 0; a < 40; a++) {
      const an = a / 40 * TAU;
      g.beginPath(); g.moveTo(cx + Math.cos(an) * 140, cy + Math.sin(an) * 140); g.lineTo(cx + Math.cos(an) * R, cy + Math.sin(an) * R); g.stroke();
    }
    g.strokeStyle = rgba(T.color, 0.45); g.lineWidth = 14; circle(g, cx, cy, R - 30); g.stroke();
    g.strokeStyle = rgba(T.light, 0.25); g.lineWidth = 4; circle(g, cx, cy, R - 60); g.stroke();
    for (let i = 0; i < 12; i++) {
      const an = i / 12 * TAU;
      g.fillStyle = rgba(T.color, 0.6); diamond(g, cx + Math.cos(an) * (R - 30), cy + Math.sin(an) * (R - 30), 10, 16); g.fill();
    }
    const f = D.FOUNTAIN[team];
    const fg = g.createRadialGradient(f.x, f.y, 10, f.x, f.y, f.r);
    fg.addColorStop(0, rgba(T.color, 0.55)); fg.addColorStop(1, rgba(T.color, 0.05));
    g.fillStyle = fg; circle(g, f.x, f.y, f.r); g.fill();
    g.fillStyle = '#6a7178'; circle(g, f.x, f.y, 60); g.fill();
    g.fillStyle = T.color; circle(g, f.x, f.y, 42); g.fill();
    g.fillStyle = T.light; circle(g, f.x - 10, f.y - 10, 12); g.fill();
  }

  // Wildflowers in the meadows (not on stone)
  const baseOff = 330 * D.MAP, baseR = 560 * D.MAP + 40;
  const onStone = (x, y) => Math.hypot(x - baseOff, y - (D.H - baseOff)) < baseR || Math.hypot(x - (D.W - baseOff), y - baseOff) < baseR
    || D.CAMPS.some(cp => cp.side === D.NEUTRAL && Math.hypot(cp.x - x, cp.y - y) < 400);
  for (let i = 0; i < 1100 * area; i++) {
    const x = rnd() * D.W, y = rnd() * D.H;
    if (nearLane(x, y, 175) || Math.abs(x - y) < 230 || onStone(x, y)) continue;
    g.fillStyle = ['#e8d36a', '#f0a6c0', '#c9e8ff', '#ffffff'][(rnd() * 4) | 0];
    for (let k = 0; k < 4; k++) { circle(g, x + (rnd() - 0.5) * 30, y + (rnd() - 0.5) * 20, 3.5); g.fill(); }
  }
  return c;
}

// Hero portrait: head and shoulders on a team-coloured disc.
const portraitCache = new Map();
function portrait(heroId, size, team) {
  const key = heroId + size + (team ?? '');
  if (portraitCache.has(key)) return portraitCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size * 2;
  const g = c.getContext('2d');
  const def = D.HERO[heroId];
  g.scale(2, 2);
  const bg = g.createLinearGradient(0, 0, 0, size);
  const base = team === undefined ? def.look.main : D.TEAMS[team].color;
  bg.addColorStop(0, shade(base, -0.35)); bg.addColorStop(1, shade(base, -0.7));
  g.fillStyle = bg; g.fillRect(0, 0, size, size);
  g.translate(size / 2 - size * 0.04, size * 1.41);
  g.scale(size / 58, size / 58);
  drawRig(g, def.look, { t: 0.4, walk: 0, phase: 0, atk: -1, cast: -1, aim: 0, hurt: 0, dead: 0 });
  const url = c.toDataURL();
  portraitCache.set(key, url);
  return url;
}

// ---------------------------------------------------------------------------
// Bushes: a long, lobed patch of leaves drawn under units, and a fringe of tall grass and broad
// leaves along its near (screen-bottom) edge drawn over them. Sprites are built in screen
// orientation, once for the normal view and once for the flipped (red) view.
// ---------------------------------------------------------------------------
const bushCache = new Map();
function bushOutline(b, a, rnd) {
  // Points around an ellipse turned by `a`, with soft lobes so the edge looks leafy, not geometric.
  const n = 30, pts = [], ph = rnd() * TAU, lobes = 5 + (rnd() * 3 | 0);
  for (let i = 0; i < n; i++) {
    const t = i / n * TAU;
    const k = 1 + 0.09 * Math.sin(t * lobes + ph) + 0.05 * Math.sin(t * 13 + ph * 2) + (rnd() - 0.5) * 0.05;
    const ex = Math.cos(t) * b.rx * k, ey = Math.sin(t) * b.ry * k;
    pts.push([ex * Math.cos(a) - ey * Math.sin(a), ex * Math.sin(a) + ey * Math.cos(a)]);
  }
  return pts;
}
function smoothPath(g, pts, ox, oy) {
  g.beginPath();
  const m = (p, q) => [(p[0] + q[0]) / 2 + ox, (p[1] + q[1]) / 2 + oy];
  let s0 = m(pts[pts.length - 1], pts[0]);
  g.moveTo(s0[0], s0[1]);
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length], mm = m(p, q); g.quadraticCurveTo(p[0] + ox, p[1] + oy, mm[0], mm[1]); }
  g.closePath();
}
function leaf(g, x, y, len, wid, rot, fill, vein) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = fill;
  g.beginPath(); g.moveTo(-len * 0.5, 0); g.quadraticCurveTo(0, -wid, len * 0.5, 0); g.quadraticCurveTo(0, wid, -len * 0.5, 0); g.fill();
  if (vein) { g.strokeStyle = vein; g.lineWidth = 1; g.beginPath(); g.moveTo(-len * 0.4, 0); g.lineTo(len * 0.4, 0); g.stroke(); }
  g.restore();
}
function bushSprites(b, flip) {
  const key = b.seed + (flip ? ':f' : ':n');
  let s = bushCache.get(key);
  if (s) return s;
  const a = flip ? Math.PI / 2 - b.ang : b.ang;
  const R = b.rx, size = Math.ceil(R * 2 + 90), c0 = size / 2;
  const rnd = D.mulberry32(b.seed);
  const pts = bushOutline(b, a, rnd);
  // ---- base ----
  const base = document.createElement('canvas'); base.width = base.height = size;
  const g = base.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.32)'; smoothPath(g, pts, c0 + 7, c0 + 10); g.fill();
  g.save();
  smoothPath(g, pts, c0, c0); g.clip();
  const body = g.createRadialGradient(c0 - R * 0.2, c0 - b.ry * 0.4, 6, c0, c0, R);
  body.addColorStop(0, '#c87a2a'); body.addColorStop(0.6, '#a25420'); body.addColorStop(1, '#6e3014');
  g.fillStyle = body; g.fillRect(0, 0, size, size);
  // Layered leaves: darker underneath, lighter on top, lit from the upper left.
  const greens = ['#5c2410', '#7e3414', '#a04a1a', '#c0621e', '#d88428', '#eca63a'];
  const area = Math.PI * b.rx * b.ry;
  for (let layer = 0; layer < 3; layer++) {
    const count = area / (layer === 2 ? 900 : 620);
    for (let i = 0; i < count; i++) {
      const t = rnd() * TAU, d = Math.sqrt(rnd());
      const ex = Math.cos(t) * b.rx * d, ey = Math.sin(t) * b.ry * d;
      const x = c0 + ex * Math.cos(a) - ey * Math.sin(a), y = c0 + ex * Math.sin(a) + ey * Math.cos(a);
      const lit = Math.max(0, Math.min(1, 0.5 - (x - c0) / R * 0.25 - (y - c0) / R * 0.45));
      const shade = Math.min(5, Math.floor(layer * 1.4 + lit * 2.4 + rnd() * 1.2));
      leaf(g, x, y, 18 + rnd() * 14, 5 + rnd() * 4, rnd() * Math.PI, greens[shade], layer === 2 && rnd() < 0.5 ? 'rgba(60,20,6,0.35)' : null);
    }
  }
  // A few flowers, like the meadow bushes of a MOBA map.
  for (let i = 0; i < area / 9000; i++) {
    const t = rnd() * TAU, d = Math.sqrt(rnd()) * 0.75;
    const ex = Math.cos(t) * b.rx * d, ey = Math.sin(t) * b.ry * d;
    const x = c0 + ex * Math.cos(a) - ey * Math.sin(a), y = c0 + ex * Math.sin(a) + ey * Math.cos(a);
    const col = ['#ffd75a', '#ff9ac0', '#ffffff', '#b8a0ff'][(rnd() * 4) | 0];
    for (let k = 0; k < 5; k++) { g.fillStyle = col; circle(g, x + Math.cos(k / 5 * TAU) * 3, y + Math.sin(k / 5 * TAU) * 3, 2.4); g.fill(); }
    g.fillStyle = '#e8a020'; circle(g, x, y, 1.6); g.fill();
  }
  // Inner shade along the rim gives the patch depth.
  const rim = g.createRadialGradient(c0, c0, R * 0.55, c0, c0, R * 1.05);
  rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(1, 'rgba(40,12,2,0.35)');
  g.fillStyle = rim; g.fillRect(0, 0, size, size);
  g.restore();
  // Crisp outline with a light upper edge.
  smoothPath(g, pts, c0, c0); g.strokeStyle = '#3a1404'; g.lineWidth = 4; g.stroke();
  g.save(); smoothPath(g, pts, c0, c0 + 2.5); g.clip();
  smoothPath(g, pts, c0, c0); g.strokeStyle = 'rgba(255,206,120,0.45)'; g.lineWidth = 2.5; g.stroke();
  g.restore();
  // ---- top fringe: tall grass and broad leaves along the near edge ----
  const top = document.createElement('canvas'); top.width = top.height = size;
  const t = top.getContext('2d');
  t.lineCap = 'round';
  const near = pts.filter(p => p[1] > b.ry * 0.15 * Math.abs(Math.cos(a)) - 2);
  const edge = near.length >= 6 ? near : pts.slice().sort((p, q) => q[1] - p[1]).slice(0, Math.ceil(pts.length / 2));
  for (const [px, py] of edge) {
    for (let k = 0; k < 4; k++) {
      const x = c0 + px * (0.88 + rnd() * 0.1) + (rnd() - 0.5) * 16, y = c0 + py * (0.88 + rnd() * 0.1);
      const h = 18 + rnd() * 24, lean = (rnd() - 0.5) * 14;
      const gr = t.createLinearGradient(x, y, x, y - h);
      gr.addColorStop(0, '#6a2c0e'); gr.addColorStop(1, rnd() < 0.5 ? '#d08830' : '#e6aa44');
      t.strokeStyle = gr; t.lineWidth = 3 + rnd() * 2.5;
      t.beginPath(); t.moveTo(x, y); t.quadraticCurveTo(x + lean * 0.3, y - h * 0.6, x + lean, y - h); t.stroke();
    }
    if (rnd() < 0.55) leaf(t, c0 + px * 0.9, c0 + py * 0.9 - 8, 26 + rnd() * 10, 7, -Math.PI / 2 + (rnd() - 0.5) * 1.2, rnd() < 0.5 ? '#c0621e' : '#d88428', 'rgba(60,20,6,0.4)');
  }
  s = { base, top, size };
  bushCache.set(key, s);
  return s;
}
function drawBush(ctx, b, layer, flip) {
  const s = bushSprites(b, !!flip);
  ctx.drawImage(layer === 'top' ? s.top : s.base, -s.size / 2, -s.size / 2);
}

LF.art = {
  drawRig, drawMonster, drawTower, drawCore, drawObstacle, drawWallBase, drawSiege, getMinionLook, buildTerrain, portrait, drawBush,
  glow, circle, ellipse, poly, star, rrect, diamond, mix, shade, rgba, TERRAIN_SCALE,
};
})(window.LF);
