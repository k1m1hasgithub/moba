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
    case 'beetle': case 'crab': {
      const shell = m.mtype === 'beetle' ? '#3f7a3a' : '#c46a3a';
      ctx.strokeStyle = C(shade(shell, -0.4)); ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) for (const sg of [-1, 1]) {
        const lx = -10 + i * 10, sw = Math.sin(t * 8 + i + (sg > 0 ? 1 : 0)) * 3 * (pose.walk || 0);
        ctx.beginPath(); ctx.moveTo(lx, -12); ctx.lineTo(lx + sw + sg * 4, -2); ctx.stroke();
      }
      ctx.fillStyle = C(shell); ellipse(ctx, 0, -18 + bob * 0.3, 26, 16); ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = C(shade(shell, 0.25)); ellipse(ctx, -6, -23 + bob * 0.3, 12, 6); ctx.fill();
      if (m.mtype === 'crab') {
        ctx.fillStyle = C(shade(shell, -0.1));
        for (const sg of [-1, 1]) { const open = pose.atk >= 0 ? Math.sin(pose.atk * Math.PI) * 0.6 : 0.1; ctx.save(); ctx.translate(22, -16 + sg * 8); ctx.rotate(sg * open); ellipse(ctx, 8, 0, 9, 5); ctx.fill(); ctx.restore(); }
      } else {
        ctx.strokeStyle = C('#d9e6a0'); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(22, -20); ctx.quadraticCurveTo(34, -30, 32, -38); ctx.stroke();
      }
      ctx.fillStyle = '#111'; circle(ctx, 20, -21, 2.4); ctx.fill(); circle(ctx, 22, -14, 2.4); ctx.fill();
      break;
    }
    case 'lizard': {
      const sw = Math.sin(t * 6) * 4 * (0.3 + (pose.walk || 0));
      ctx.fillStyle = C('#7a8f3a');
      ctx.beginPath(); ctx.moveTo(-34, -10 + sw); ctx.quadraticCurveTo(-14, -26, 10, -22); ctx.quadraticCurveTo(30, -22, 34, -16); ctx.quadraticCurveTo(26, -6, 6, -8); ctx.quadraticCurveTo(-14, -6, -34, -10 + sw); ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = C('#c94f2a');
      for (let i = 0; i < 5; i++) { const x = -12 + i * 7; ctx.beginPath(); ctx.moveTo(x - 3, -22); ctx.lineTo(x, -31); ctx.lineTo(x + 3, -22); ctx.fill(); }
      ctx.fillStyle = '#ffe36a'; circle(ctx, 26, -18, 2.5); ctx.fill();
      break;
    }
    case 'wolf': {
      const w = pose.walk || 0;
      ctx.strokeStyle = C('#3b3446'); ctx.lineWidth = 5;
      for (let i = 0; i < 4; i++) { const lx = i < 2 ? -14 + i * 5 : 10 + (i - 2) * 5; const sw = Math.sin(t * 9 + i * 1.6) * 5 * w; ctx.beginPath(); ctx.moveTo(lx, -14); ctx.lineTo(lx + sw, -1); ctx.stroke(); }
      ctx.fillStyle = C('#4d4560'); ellipse(ctx, 0, -20 + bob * 0.4, 22, 11); ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = C('#5d5574');
      ctx.beginPath(); ctx.moveTo(-20, -24); ctx.quadraticCurveTo(-34, -30 + Math.sin(t * 5) * 3, -36, -20); ctx.quadraticCurveTo(-28, -20, -20, -18); ctx.fill();
      ellipse(ctx, 22, -28 + bob * 0.4, 11, 9); ctx.fill();
      ctx.beginPath(); ctx.moveTo(18, -34); ctx.lineTo(20, -46); ctx.lineTo(25, -35); ctx.fill();
      ctx.beginPath(); ctx.moveTo(28, -26); ctx.lineTo(38, -24); ctx.lineTo(28, -21); ctx.fill();
      ctx.fillStyle = '#ffcf5a'; circle(ctx, 26, -30, 2); ctx.fill();
      break;
    }
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
    case 'wyrm': {
      const segs = 9;
      for (let i = segs; i >= 0; i--) {
        const k = i / segs;
        const x = -70 + k * 120, y = -30 - Math.sin(t * 2 + k * 5) * 16 * (1 - k * 0.5) - k * 30;
        ctx.fillStyle = C(i % 2 ? '#5a2a7a' : '#6e3690');
        circle(ctx, x, y, 22 - k * 6 + (i === segs ? 6 : 0)); ctx.fill();
        if (i === 4) {
          ctx.fillStyle = C('#9a5ac8');
          for (const sg of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 30, y - 70 - Math.sin(t * 3) * 14, x + sg * 30 - 10, y - 90); ctx.quadraticCurveTo(x + 10, y - 40, x + 20, y); ctx.fill(); }
        }
      }
      const hx = 60, hy = -66 - Math.sin(t * 2 + 5) * 8;
      ctx.fillStyle = C('#7d40a6'); ellipse(ctx, hx, hy, 26, 18); ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = C('#f2e6cf');
      for (const sg of [-1, 1]) { ctx.beginPath(); ctx.moveTo(hx - 8, hy - 12); ctx.lineTo(hx - 22 + sg * 4, hy - 40); ctx.lineTo(hx + 2, hy - 14); ctx.fill(); }
      glow(ctx, hx + 10, hy - 4, 14, '#ff9a3a', 0.9);
      ctx.fillStyle = '#fff1b0'; circle(ctx, hx + 10, hy - 4, 3); ctx.fill();
      if (pose.atk >= 0) glow(ctx, hx + 36, hy + 6, 40 * Math.sin(pose.atk * Math.PI), '#ff7a2a', 0.8);
      break;
    }
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
    for (let i = 0; i < n; i++) blobs.push([(rnd() - 0.5) * o.r * 0.9, -o.r * 0.9 - rnd() * o.r * 0.5, o.r * (0.45 + rnd() * 0.3)]);
    const sway = Math.sin(t * 0.8 + o.seed) * 1.5;
    for (const [bx, by, br] of blobs) { ctx.fillStyle = '#183a20'; circle(ctx, bx + sway, by + 4, br + 3); ctx.fill(); }
    for (const [bx, by, br] of blobs) { ctx.fillStyle = '#245a2c'; circle(ctx, bx + sway, by, br); ctx.fill(); }
    for (const [bx, by, br] of blobs) { ctx.fillStyle = '#2f7236'; circle(ctx, bx + sway - br * 0.25, by - br * 0.3, br * 0.55); ctx.fill(); }
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ellipse(ctx, 6, 4, o.r * 1.05, o.r * 0.45); ctx.fill();
    const n = 7;
    ctx.fillStyle = '#5d6168';
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const a = Math.PI + i / (n - 1) * Math.PI, rr = o.r * (0.8 + rnd() * 0.25); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.9 - o.r * 0.1); }
    ctx.lineTo(o.r * 0.9, 0); ctx.lineTo(-o.r * 0.9, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7b8088';
    ctx.beginPath(); ctx.moveTo(-o.r * 0.6, -o.r * 0.4); ctx.lineTo(-o.r * 0.1, -o.r * 0.85); ctx.lineTo(o.r * 0.3, -o.r * 0.55); ctx.lineTo(-o.r * 0.2, -o.r * 0.25); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4f7a3a'; ellipse(ctx, o.r * 0.3, -o.r * 0.15, o.r * 0.3, o.r * 0.12); ctx.fill();
  }
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
  g.fillStyle = '#1f3a22'; g.fillRect(0, 0, D.W, D.H);
  // Mottled grass, lighter near lanes
  for (let i = 0; i < 3500; i++) {
    const x = rnd() * D.W, y = rnd() * D.H, r = 30 + rnd() * 110;
    g.fillStyle = rnd() < 0.5 ? `rgba(70,120,58,${0.05 + rnd() * 0.07})` : `rgba(10,26,14,${0.06 + rnd() * 0.08})`;
    circle(g, x, y, r); g.fill();
  }
  for (const id of D.LANE_IDS) {
    const L = D.LANES[id];
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(80,130,60,0.18)'; g.lineWidth = 520;
    g.beginPath(); L.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
  }
  g.lineWidth = 2; g.lineCap = 'round';
  for (let i = 0; i < 24000; i++) {
    const x = rnd() * D.W, y = rnd() * D.H, l = 6 + rnd() * 10;
    g.strokeStyle = rnd() < 0.55 ? 'rgba(130,175,90,0.18)' : 'rgba(10,30,14,0.25)';
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 6, y - l); g.stroke();
  }
  // River along y = x
  const river = (w, col) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'butt'; g.beginPath(); g.moveTo(-100, -100); g.lineTo(D.W + 100, D.H + 100); g.stroke(); };
  river(330, '#1f4a44'); river(280, '#22566a'); river(210, '#286b80'); river(90, 'rgba(120,200,220,0.12)');
  g.strokeStyle = 'rgba(200,240,255,0.16)'; g.lineWidth = 3;
  for (let i = 0; i < 220; i++) {
    const t = rnd() * D.W, off = (rnd() - 0.5) * 220;
    const x = t + off / Math.SQRT2, y = t - off / Math.SQRT2;
    g.beginPath(); g.moveTo(x - 16, y + 4); g.quadraticCurveTo(x, y - 6, x + 16, y + 4); g.stroke();
  }
  // Lanes: worn stone roads
  for (const id of D.LANE_IDS) {
    const L = D.LANES[id];
    const stroke = (w, col) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); L.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke(); };
    stroke(300, 'rgba(40,34,24,0.45)'); stroke(262, '#5f513a'); stroke(230, '#716148'); stroke(150, 'rgba(150,130,96,0.35)');
    for (let s = 0; s < L.len; s += 26) {
      const p = D.laneAt(L, s);
      for (let k = 0; k < 3; k++) {
        const off = (rnd() - 0.5) * 210;
        g.fillStyle = rnd() < 0.5 ? 'rgba(40,32,20,0.28)' : 'rgba(190,170,130,0.18)';
        g.fillRect(p.x - p.dy * off, p.y + p.dx * off, 3 + rnd() * 5, 3 + rnd() * 3);
      }
    }
  }
  // Camp clearings
  for (const cp of D.CAMPS) {
    const gr = g.createRadialGradient(cp.x, cp.y, 10, cp.x, cp.y, cp.type === 'wyrm' || cp.type === 'turtle' ? 260 : 170);
    gr.addColorStop(0, 'rgba(120,100,70,0.55)'); gr.addColorStop(1, 'rgba(120,100,70,0)');
    g.fillStyle = gr; circle(g, cp.x, cp.y, cp.type === 'wyrm' || cp.type === 'turtle' ? 260 : 170); g.fill();
  }
  // Bases
  for (const team of [0, 1]) {
    const T = D.TEAMS[team];
    const cx = team === 0 ? 330 : D.W - 330, cy = team === 0 ? D.H - 330 : 330;
    g.fillStyle = '#3a3f45'; circle(g, cx, cy, 560); g.fill();
    g.fillStyle = '#495057'; circle(g, cx, cy, 535); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 3;
    for (let r = 120; r < 535; r += 80) { circle(g, cx, cy, r); g.stroke(); }
    for (let a = 0; a < 32; a++) {
      const an = a / 32 * Math.PI * 2;
      g.beginPath(); g.moveTo(cx + Math.cos(an) * 120, cy + Math.sin(an) * 120); g.lineTo(cx + Math.cos(an) * 535, cy + Math.sin(an) * 535); g.stroke();
    }
    g.strokeStyle = rgba(T.color, 0.4); g.lineWidth = 10; circle(g, cx, cy, 548); g.stroke();
    const f = D.FOUNTAIN[team];
    const fg = g.createRadialGradient(f.x, f.y, 10, f.x, f.y, f.r);
    fg.addColorStop(0, rgba(T.color, 0.5)); fg.addColorStop(1, rgba(T.color, 0.05));
    g.fillStyle = fg; circle(g, f.x, f.y, f.r); g.fill();
    g.fillStyle = '#6a7178'; circle(g, f.x, f.y, 52); g.fill();
    g.fillStyle = T.color; circle(g, f.x, f.y, 36); g.fill();
    g.fillStyle = T.light; circle(g, f.x - 8, f.y - 8, 10); g.fill();
  }
  // Flowers and bushes for texture
  for (let i = 0; i < 900; i++) {
    const x = rnd() * D.W, y = rnd() * D.H;
    let onLane = false;
    for (const id of D.LANE_IDS) if (D.laneProject(D.LANES[id], x, y).d < 160) onLane = true;
    if (onLane || Math.abs(x - y) < 190) continue;
    if (rnd() < 0.7) {
      g.fillStyle = ['#e8d36a', '#f0a6c0', '#c9e8ff', '#ffffff'][(rnd() * 4) | 0];
      for (let k = 0; k < 4; k++) { circle(g, x + (rnd() - 0.5) * 30, y + (rnd() - 0.5) * 20, 3.5); g.fill(); }
    } else {
      g.fillStyle = 'rgba(20,50,24,0.8)'; circle(g, x, y, 22 + rnd() * 16); g.fill();
      g.fillStyle = 'rgba(46,96,48,0.9)'; circle(g, x - 4, y - 4, 16 + rnd() * 10); g.fill();
    }
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
// Bushes: a leafy base drawn under units and a fringe of grass drawn over them
// ---------------------------------------------------------------------------
const bushCache = new Map();
function bushSprites(b) {
  let s = bushCache.get(b);
  if (s) return s;
  const R = b.r, size = Math.ceil(R * 2 + 70), c0 = size / 2;
  const rnd = D.mulberry32(b.seed);
  const base = document.createElement('canvas'); base.width = base.height = size;
  const g = base.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.28)'; ellipse(g, c0 + 6, c0 + 8, R * 1.02, R * 0.92); g.fill();
  g.fillStyle = '#163a1d'; ellipse(g, c0, c0, R * 0.98, R * 0.9); g.fill();
  const greens = ['#1d4a24', '#22552a', '#296230', '#2f6d35', '#377a3b'];
  for (let i = 0; i < 90; i++) {
    const a = rnd() * TAU, d = Math.sqrt(rnd()) * R * 0.92;
    const x = c0 + Math.cos(a) * d, y = c0 + Math.sin(a) * d * 0.9;
    const shade = Math.min(4, Math.floor((1 - d / R) * 3 + rnd() * 2));
    g.fillStyle = greens[shade];
    for (let k = 0; k < 3; k++) { ellipse(g, x + (rnd() - 0.5) * 10, y + (rnd() - 0.5) * 8, 7 + rnd() * 6, 4 + rnd() * 3, rnd() * Math.PI); g.fill(); }
  }
  for (let i = 0; i < 30; i++) {
    const a = rnd() * TAU, d = Math.sqrt(rnd()) * R * 0.8;
    g.fillStyle = 'rgba(150,210,120,0.35)';
    ellipse(g, c0 + Math.cos(a) * d, c0 + Math.sin(a) * d * 0.9, 3, 1.6, rnd() * Math.PI); g.fill();
  }
  const top = document.createElement('canvas'); top.width = top.height = size;
  const t = top.getContext('2d');
  t.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const a = 0.08 * Math.PI + rnd() * 0.84 * Math.PI;
    const x = c0 + Math.cos(a) * R * (0.82 + rnd() * 0.18), y = c0 + Math.sin(a) * R * 0.9 * (0.85 + rnd() * 0.15);
    const h = 16 + rnd() * 22, lean = (rnd() - 0.5) * 12;
    t.strokeStyle = rnd() < 0.5 ? '#2c6a30' : '#3f8a3f';
    t.lineWidth = 3 + rnd() * 2;
    t.beginPath(); t.moveTo(x, y); t.quadraticCurveTo(x + lean * 0.3, y - h * 0.6, x + lean, y - h); t.stroke();
  }
  s = { base, top, size };
  bushCache.set(b, s);
  return s;
}
function drawBush(ctx, b, layer) {
  const s = bushSprites(b);
  ctx.drawImage(layer === 'top' ? s.top : s.base, -s.size / 2, -s.size / 2);
}

LF.art = {
  drawRig, drawMonster, drawTower, drawCore, drawObstacle, drawSiege, getMinionLook, buildTerrain, portrait, drawBush,
  glow, circle, ellipse, poly, star, rrect, diamond, mix, shade, rgba, TERRAIN_SCALE,
};
})(window.LF);
