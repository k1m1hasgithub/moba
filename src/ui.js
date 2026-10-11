// Lanefall: DOM screens and HUD.
'use strict';
(function (LF) {
const D = LF.data, A = LF.art;
const $ = id => document.getElementById(id);
const TAU = Math.PI * 2;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------------------
// Generated icons
// ---------------------------------------------------------------------------
const iconCache = new Map();
function skillIcon(heroId, key) {
  const id = heroId + key;
  if (iconCache.has(id)) return iconCache.get(id);
  const def = D.HERO[heroId], sk = def.skill[key];
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const g = c.getContext('2d');
  const bg = g.createRadialGradient(40, 30, 4, 48, 48, 70);
  bg.addColorStop(0, A.shade(def.look.trim, 0.1)); bg.addColorStop(0.55, A.shade(def.look.main, -0.25)); bg.addColorStop(1, A.shade(def.look.main, -0.7));
  g.fillStyle = bg; g.fillRect(0, 0, 96, 96);
  g.strokeStyle = '#fffbe8'; g.fillStyle = '#fffbe8'; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
  g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 6;
  const t = sk.type;
  g.save(); g.translate(48, 48);
  if (t === 'line') {
    g.rotate(-0.6);
    g.beginPath(); g.moveTo(-30, 0); g.lineTo(26, 0); g.stroke();
    g.beginPath(); g.moveTo(34, 0); g.lineTo(18, -12); g.lineTo(18, 12); g.closePath(); g.fill();
    if (sk.pierce) { g.lineWidth = 3; g.beginPath(); g.moveTo(-36, -10); g.lineTo(-22, 0); g.lineTo(-36, 10); g.stroke(); }
  } else if (t === 'circle') {
    g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 30, 0, TAU); g.stroke();
    g.beginPath(); g.arc(0, 0, 16, 0, TAU); g.stroke();
    A.star(g, 0, 0, 10, 4, 5); g.fill();
  } else if (t === 'nova') {
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 12, Math.sin(a) * 12); g.lineTo(Math.cos(a) * 34, Math.sin(a) * 34); g.stroke(); }
    g.beginPath(); g.arc(0, 0, 8, 0, TAU); g.fill();
  } else if (t === 'cone') {
    g.beginPath(); g.moveTo(-28, 16); g.lineTo(30, -26); g.moveTo(-28, 16); g.lineTo(34, 4); g.moveTo(-28, 16); g.lineTo(20, 30); g.stroke();
  } else if (t === 'dash') {
    for (const o of [-16, 6]) { g.beginPath(); g.moveTo(o, -20); g.lineTo(o + 20, 0); g.lineTo(o, 20); g.stroke(); }
  } else if (t === 'leap') {
    g.beginPath(); g.moveTo(-30, 24); g.quadraticCurveTo(0, -46, 28, 18); g.stroke();
    g.beginPath(); g.moveTo(32, 26); g.lineTo(16, 18); g.lineTo(32, 6); g.closePath(); g.fill();
  } else if (t === 'blink') {
    A.star(g, -10, 6, 22, 7, 4); g.fill(); A.star(g, 22, -18, 11, 4, 4); g.fill();
  } else if (t === 'buff') {
    for (const o of [10, -8]) { g.beginPath(); g.moveTo(-20, o + 12); g.lineTo(0, o - 8); g.lineTo(20, o + 12); g.stroke(); }
  } else if (t === 'zone') {
    g.lineWidth = 6; g.beginPath();
    for (let i = 0; i < 60; i++) { const a = i / 60 * TAU * 2.2, r = 4 + i * 0.5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.stroke();
  } else if (t === 'execute') {
    g.beginPath(); g.moveTo(-26, -26); g.lineTo(26, 26); g.moveTo(26, -26); g.lineTo(-26, 26); g.stroke();
  }
  g.restore();
  g.shadowBlur = 0;
  g.lineWidth = key === 'ult' ? 8 : 5; g.strokeStyle = key === 'ult' ? '#f0c35a' : 'rgba(255,255,255,0.35)';
  g.strokeRect(0, 0, 96, 96);
  const url = c.toDataURL();
  iconCache.set(id, url);
  return url;
}
const ICON_TINT = {
  boots: '#6a8bb0', machete: '#7a9a4a', sword: '#b0b8c2', bow: '#9a7a4a', fang: '#b04a4a', axe: '#c27a3a', staff: '#7a6ad0', clock: '#4ab0c2',
  crown: '#a04ad0', armor: '#7a8a9a', helm: '#c2a24a', charm: '#4ac27a', dagger: '#a8b0b8', feather: '#5ac2c2', gem: '#8a6ae0', shard: '#4a8ae0',
  ruby: '#d04a5a', chain: '#8a96a2', leaf: '#5ab05a', glove: '#c28a4a', tome: '#6a5ac2', orb: '#5a7ae0', belt: '#b07a4a', greatsword: '#d0d8e0',
  stormbow: '#4ab0e0', hammer: '#b0905a', flower: '#d04a7a', thorns: '#6a8a5a', frost: '#7ac8f0',
};
const ITEM_TINT = { warboots: '#a0705a', magicboots: '#7a6ad0', swiftboots: '#3ab090' };
const TIER_EDGE = { 1: '#f0c35a', 2: '#c9d2dc', 3: '#b07a4a' };
function itemIcon(itemId) {
  const id = 'item:' + itemId;
  if (iconCache.has(id)) return iconCache.get(id);
  const it = D.ITEM[itemId];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const tint = ITEM_TINT[it.id] || ICON_TINT[it.icon] || '#8a8a8a';
  const bg = g.createLinearGradient(0, 0, 0, 64);
  bg.addColorStop(0, A.shade(tint, -0.35)); bg.addColorStop(1, A.shade(tint, -0.75));
  g.fillStyle = bg; g.fillRect(0, 0, 64, 64);
  if (it.tier === 1) A.glow(g, 32, 32, 34, A.shade(tint, 0.3), 0.35);
  const hi = A.shade(tint, 0.45), dark = A.shade(tint, -0.5);
  g.fillStyle = hi; g.strokeStyle = A.shade(tint, 0.6); g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round';
  g.save(); g.translate(32, 32);
  const blade = (w, len) => { g.beginPath(); g.moveTo(-w, 10); g.lineTo(-w, -len + 8); g.lineTo(0, -len); g.lineTo(w, -len + 8); g.lineTo(w, 10); g.closePath(); g.fill(); };
  switch (it.icon) {
    case 'boots': g.beginPath(); g.moveTo(-10, -20); g.lineTo(2, -20); g.lineTo(2, 6); g.lineTo(18, 10); g.lineTo(18, 20); g.lineTo(-12, 20); g.closePath(); g.fill();
      if (it.tier === 2) { g.fillStyle = dark; g.fillRect(-10, -12, 12, 4); g.fillStyle = '#fff'; g.globalAlpha = 0.6; g.beginPath(); g.moveTo(-20, -6); g.lineTo(-13, -6); g.moveTo(-22, 2); g.lineTo(-13, 2); g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke(); g.globalAlpha = 1; } break;
    case 'sword': case 'machete': g.rotate(-0.8); g.fillRect(-4, -26, 8, 36); g.fillRect(-12, 8, 24, 5); g.fillStyle = '#5a4030'; g.fillRect(-3, 13, 6, 12); break;
    case 'dagger': g.rotate(-0.8); blade(4, 18); g.fillRect(-9, 8, 18, 4); g.fillStyle = '#5a4030'; g.fillRect(-2.5, 12, 5, 9); break;
    case 'greatsword': g.rotate(-0.8); blade(6, 28); g.fillStyle = dark; g.fillRect(-1.5, -18, 3, 26); g.fillStyle = '#f0c35a'; g.fillRect(-14, 8, 28, 6); g.fillStyle = '#5a4030'; g.fillRect(-3, 14, 6, 12); break;
    case 'bow': g.beginPath(); g.arc(-6, 0, 22, -1.3, 1.3); g.stroke(); g.lineWidth = 2; g.beginPath(); g.moveTo(0, -21); g.lineTo(0, 21); g.stroke(); break;
    case 'stormbow': g.beginPath(); g.arc(-6, 0, 22, -1.3, 1.3); g.stroke(); g.lineWidth = 2; g.beginPath(); g.moveTo(0, -21); g.lineTo(0, 21); g.stroke();
      A.glow(g, 8, 0, 18, '#bfe8ff', 0.7); g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.beginPath(); g.moveTo(14, -18); g.lineTo(4, -2); g.lineTo(14, 2); g.lineTo(4, 18); g.stroke(); break;
    case 'fang': g.beginPath(); g.moveTo(-14, -20); g.quadraticCurveTo(10, -6, 4, 24); g.quadraticCurveTo(-2, 0, -14, -20); g.fill(); break;
    case 'axe': g.fillStyle = '#6a4a2c'; g.save(); g.rotate(-0.7); g.fillRect(-3, -24, 6, 48); g.restore(); g.fillStyle = hi; g.beginPath(); g.arc(4, -10, 16, -1.5, 1.2); g.closePath(); g.fill(); break;
    case 'hammer': g.fillStyle = '#6a4a2c'; g.save(); g.rotate(-0.6); g.fillRect(-3, -14, 6, 40); g.fillStyle = hi; g.fillRect(-16, -26, 32, 16); g.fillStyle = dark; g.fillRect(-16, -20, 32, 3); g.restore(); break;
    case 'staff': g.beginPath(); g.moveTo(-14, 24); g.lineTo(10, -14); g.stroke(); A.glow(g, 12, -16, 16, '#d0c8ff', 0.9); g.fillStyle = '#fff'; A.star(g, 12, -16, 9, 4, 5); g.fill(); break;
    case 'clock': g.beginPath(); g.moveTo(-14, -20); g.lineTo(14, -20); g.lineTo(-14, 20); g.lineTo(14, 20); g.closePath(); g.stroke(); g.fillStyle = '#f0e0a0'; g.beginPath(); g.moveTo(-8, 16); g.lineTo(8, 16); g.lineTo(0, 6); g.closePath(); g.fill(); break;
    case 'crown': g.beginPath(); g.moveTo(-20, 14); g.lineTo(-20, -10); g.lineTo(-10, 2); g.lineTo(0, -16); g.lineTo(10, 2); g.lineTo(20, -10); g.lineTo(20, 14); g.closePath(); g.fill(); A.glow(g, 0, 4, 10, '#e0b0ff', 0.9); break;
    case 'armor': g.beginPath(); g.moveTo(-20, -18); g.lineTo(20, -18); g.lineTo(16, 18); g.lineTo(0, 24); g.lineTo(-16, 18); g.closePath(); g.fill(); g.strokeStyle = dark; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -18); g.lineTo(0, 22); g.stroke(); break;
    case 'thorns': g.beginPath(); g.moveTo(-20, -18); g.lineTo(20, -18); g.lineTo(16, 18); g.lineTo(0, 24); g.lineTo(-16, 18); g.closePath(); g.fill();
      g.fillStyle = A.shade(tint, 0.7); for (const [x, y, r] of [[-22, -6, 3.6], [22, -6, 0.5], [-18, 14, 3.9], [18, 14, 0.2], [0, -20, 4.7]]) { g.save(); g.translate(x, y); g.rotate(r); g.beginPath(); g.moveTo(-4, 0); g.lineTo(0, -10); g.lineTo(4, 0); g.fill(); g.restore(); } break;
    case 'chain': g.lineWidth = 4; for (const [x, y] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) { A.circle(g, x, y, 8); g.stroke(); } break;
    case 'helm': g.beginPath(); g.arc(0, 4, 20, Math.PI, TAU); g.lineTo(20, 18); g.lineTo(-20, 18); g.closePath(); g.fill(); g.fillStyle = dark; g.fillRect(-12, 4, 24, 5); break;
    case 'belt': g.fillRect(-24, -8, 48, 16); g.fillStyle = '#f0c35a'; g.fillRect(-9, -11, 18, 22); g.fillStyle = dark; g.fillRect(-4, -6, 8, 12); break;
    case 'charm': A.glow(g, 0, 0, 26, '#b6ffc8', 0.8); g.beginPath(); g.moveTo(0, -20); g.lineTo(16, 0); g.lineTo(0, 20); g.lineTo(-16, 0); g.closePath(); g.fill(); break;
    case 'gem': A.glow(g, 0, 0, 24, '#d8c8ff', 0.6); g.beginPath(); g.moveTo(-16, -6); g.lineTo(-8, -16); g.lineTo(8, -16); g.lineTo(16, -6); g.lineTo(0, 18); g.closePath(); g.fill(); g.fillStyle = '#fff'; g.globalAlpha = 0.5; g.beginPath(); g.moveTo(-8, -16); g.lineTo(0, -6); g.lineTo(8, -16); g.fill(); g.globalAlpha = 1; break;
    case 'ruby': A.glow(g, 0, 0, 24, '#ffb0b8', 0.5); g.beginPath(); g.moveTo(0, -18); g.lineTo(15, -4); g.lineTo(9, 16); g.lineTo(-9, 16); g.lineTo(-15, -4); g.closePath(); g.fill(); g.fillStyle = '#fff'; g.globalAlpha = 0.45; g.beginPath(); g.moveTo(0, -18); g.lineTo(-6, -2); g.lineTo(-15, -4); g.fill(); g.globalAlpha = 1; break;
    case 'shard': A.glow(g, 0, 0, 24, '#b8d8ff', 0.6); g.beginPath(); g.moveTo(0, -22); g.lineTo(9, 0); g.lineTo(0, 22); g.lineTo(-9, 0); g.closePath(); g.fill(); break;
    case 'orb': A.glow(g, 0, 0, 28, '#c8d8ff', 0.8); g.fillStyle = '#fff'; A.circle(g, 0, 0, 13); g.fill(); g.fillStyle = hi; A.circle(g, 0, 0, 9); g.fill(); break;
    case 'leaf': g.beginPath(); g.moveTo(-14, 16); g.quadraticCurveTo(-16, -14, 16, -18); g.quadraticCurveTo(14, 12, -14, 16); g.fill(); g.strokeStyle = dark; g.lineWidth = 2; g.beginPath(); g.moveTo(-14, 16); g.lineTo(10, -10); g.stroke(); break;
    case 'feather': g.rotate(0.6); g.beginPath(); g.ellipse(0, -2, 8, 22, 0, 0, TAU); g.fill(); g.strokeStyle = dark; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -22); g.lineTo(0, 26); g.stroke(); break;
    case 'glove': g.beginPath(); g.moveTo(-12, 22); g.lineTo(-12, -4); g.lineTo(-16, -14); g.lineTo(-10, -16); g.lineTo(-6, -8); g.lineTo(-6, -20); g.lineTo(0, -20); g.lineTo(0, -10); g.lineTo(4, -20); g.lineTo(10, -18); g.lineTo(8, -6); g.lineTo(14, -12); g.lineTo(16, -6); g.lineTo(12, 22); g.closePath(); g.fill(); g.fillStyle = '#e8eef4'; for (const x of [-6, 2, 9]) { g.beginPath(); g.moveTo(x - 2, -18); g.lineTo(x + 1, -27); g.lineTo(x + 3, -18); g.fill(); } break;
    case 'tome': g.fillRect(-18, -20, 36, 40); g.fillStyle = dark; g.fillRect(-18, -20, 6, 40); A.glow(g, 4, 0, 14, '#e0d8ff', 0.8); g.fillStyle = '#fff'; A.star(g, 4, 0, 8, 3, 5); g.fill(); break;
    case 'flower': for (let i = 0; i < 5; i++) { g.save(); g.rotate(i / 5 * TAU); g.beginPath(); g.ellipse(0, -12, 8, 13, 0, 0, TAU); g.fill(); g.restore(); } g.fillStyle = '#ffe08a'; A.circle(g, 0, 0, 7); g.fill(); break;
    case 'frost': g.lineWidth = 4; for (let i = 0; i < 3; i++) { g.save(); g.rotate(i / 3 * Math.PI); g.beginPath(); g.moveTo(0, -22); g.lineTo(0, 22); g.moveTo(-6, -16); g.lineTo(0, -10); g.lineTo(6, -16); g.moveTo(-6, 16); g.lineTo(0, 10); g.lineTo(6, 16); g.stroke(); g.restore(); } break;
    default: g.beginPath(); g.arc(0, 0, 16, 0, TAU); g.fill();
  }
  g.restore();
  g.strokeStyle = TIER_EDGE[it.tier]; g.globalAlpha = it.tier === 1 ? 0.95 : 0.6; g.lineWidth = it.tier === 1 ? 4 : 3; g.strokeRect(1, 1, 62, 62); g.globalAlpha = 1;
  const url = c.toDataURL();
  iconCache.set(id, url);
  return url;
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------
const SCREENS = ['home', 'select', 'mp', 'lobby', 'how', 'end', 'pause'];
let backStack = [];
function show(id, push) {
  for (const s of SCREENS) $(s).hidden = s !== id;
  if (push !== false && id) backStack.push(id);
  if (LF.main) LF.main.onScreen(id);
}
function back() {
  backStack.pop();
  const prev = backStack.pop() || 'home';
  if (prev === 'mp' || prev === 'lobby') LF.main.openMP(); else show(prev);
}

let nick = '';
function loadNick() {
  try { nick = localStorage.getItem('lf-nick') || ''; } catch (e) { nick = ''; }
  if (!nick) nick = 'Player' + Math.floor(100 + Math.random() * 900);
  $('nickInput').value = nick;
}
function saveNick() {
  nick = LF.net.cleanName($('nickInput').value);
  $('nickInput').value = nick;
  try { localStorage.setItem('lf-nick', nick); } catch (e) { /* ignore */ }
}

function init() {
  loadNick();
  $('nickInput').addEventListener('change', saveNick);
  $('nickInput').addEventListener('blur', saveNick);
  $('goAI').addEventListener('click', () => { click(); openSelect('ai'); });
  $('goMP').addEventListener('click', () => { click(); LF.main.openMP(); });
  $('goHeroes').addEventListener('click', () => { click(); openSelect('gallery'); });
  $('goHow').addEventListener('click', () => { click(); show('how'); });
  document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => { click(); back(); }));
  $('homeRoster').innerHTML = D.HEROES.map(h => `<img src="${A.portrait(h.id, 64)}" alt="">`).join('');
  $('howRoles').innerHTML = D.ROLES.map(r => `<dt>${r.name}</dt><dd>${r.desc} ${heroNames(r.id)}</dd>`).join('');
  $('scoreClose').addEventListener('click', () => showScore(false));
  initShop();
  // "Customize build" buttons on the hero select screen and in the lobby.
  document.addEventListener('click', e => { const b = e.target.closest('[data-edit-build]'); if (b) { click(); openBuild(b.dataset.editBuild); } });
  $('btnScore').addEventListener('click', () => showScore($('scoreboard').hidden));
  for (const id of ['btnSound', 'soundToggle', 'pauseSound']) $(id).addEventListener('click', toggleSound);
  window.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'm' && !e.repeat && !e.ctrlKey && !e.metaKey && !(e.target && e.target.tagName === 'INPUT')) toggleSound();
  });
  $('btnMenu').addEventListener('click', () => LF.main.pause(true));
  $('resumeBtn').addEventListener('click', () => LF.main.pause(false));
  $('quitBtn').addEventListener('click', () => LF.main.quit());
  syncSound();
  // Skill buttons show icons of the current hero (set in setupHud).
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !e.repeat && document.activeElement && document.activeElement.tagName !== 'INPUT') LF.main.escape();
  });
}
function heroNames(role) { return D.HEROES.filter(h => h.role === role).map(h => h.name).join(', ') + '.'; }
function click() { LF.audio.play('click', 0.6); }
function toggleSound() { LF.audio.setMuted(!LF.audio.muted); syncSound(); if (!LF.audio.muted) LF.audio.play('click', 0.6); }
function syncSound() {
  const m = LF.audio.muted;
  for (const id of ['btnSound', 'soundToggle']) {
    $(id).classList.toggle('muted', m);
    $(id).setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
  }
  $('soundToggle').querySelector('span').textContent = m ? 'Sound off' : 'Sound on';
  $('pauseSound').querySelector('strong').textContent = m ? 'Sound: off' : 'Sound: on';
}

// ---------------------------------------------------------------------------
// Hero select / gallery
// ---------------------------------------------------------------------------
const sel = { mode: 'ai', role: 'all', hero: 'lumen', diff: 'normal', anim: 0, raf: 0 };
function openSelect(mode) {
  sel.mode = mode;
  try { sel.diff = localStorage.getItem('lf-diff') || 'normal'; sel.hero = localStorage.getItem('lf-hero') || sel.hero; } catch (e) { /* ignore */ }
  if (!D.HERO[sel.hero]) sel.hero = 'lumen';
  $('selectTitle').textContent = mode === 'ai' ? 'Choose your hero' : 'Heroes';
  const tabs = [['all', 'All']].concat(D.ROLES.map(r => [r.id, r.name]));
  $('roleTabs').innerHTML = tabs.map(([id, name]) => `<button class="role-tab" role="tab" type="button" data-role="${id}" aria-selected="${id === sel.role}">${name}</button>`).join('');
  $('roleTabs').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { sel.role = b.dataset.role; click(); renderSelect(); }));
  const foot = $('selectFoot');
  if (mode === 'ai') {
    foot.innerHTML = `<span class="seg-label">Bots</span><div class="seg" id="diffSeg">${Object.entries(D.DIFFICULTY).map(([k, v]) => `<button type="button" data-d="${k}" aria-pressed="${k === sel.diff}">${v.name}</button>`).join('')}</div><button class="btn primary big" id="startAI" type="button">Battle</button>`;
    foot.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => {
      sel.diff = b.dataset.d; click();
      try { localStorage.setItem('lf-diff', sel.diff); } catch (e) { /* ignore */ }
      foot.querySelectorAll('[data-d]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.d === sel.diff)));
    }));
    $('startAI').addEventListener('click', () => {
      try { localStorage.setItem('lf-hero', sel.hero); } catch (e) { /* ignore */ }
      LF.main.startAI(sel.hero, sel.diff);
    });
  } else foot.innerHTML = '';
  renderSelect();
  show('select');
  startShowcase();
}
function renderSelect() {
  $('roleTabs').querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.role === sel.role)));
  const role = D.ROLES.find(r => r.id === sel.role);
  $('roleDesc').textContent = role ? role.desc : 'Ten heroes across five roles. Your role decides where you play.';
  const list = D.HEROES.filter(h => sel.role === 'all' || h.role === sel.role);
  $('heroCards').innerHTML = list.map(h => `<button class="hero-card" type="button" data-h="${h.id}" aria-pressed="${h.id === sel.hero}">
    <img src="${A.portrait(h.id, 120)}" alt=""><span class="role-chip">${D.ROLES[D.ROLE_INDEX[h.role]].short}</span>
    <div><strong>${h.name}</strong><small>${h.cls} · ${h.title}</small></div></button>`).join('');
  $('heroCards').querySelectorAll('.hero-card').forEach(b => b.addEventListener('click', () => { sel.hero = b.dataset.h; LF.audio.play('hover', 1); renderSelect(); }));
  renderDetail(sel.hero);
}
function renderDetail(id) {
  const h = D.HERO[id], s = h.stats;
  $('dRole').textContent = `${D.ROLES[D.ROLE_INDEX[h.role]].name} · ${h.cls}`;
  $('dName').textContent = h.name;
  $('dTitle').textContent = h.title;
  const meter = (label, v) => `<span>${label}</span><span class="meter"><i style="width:${Math.round(Math.max(0.08, Math.min(1, v)) * 100)}%"></i></span>`;
  $('dStats').innerHTML = meter('Durability', (s.hp + s.armor * 12 - 500) / 700) + meter('Damage', (s.ad - 40) / 30 + (h.cls === 'Mage' ? 0.45 : 0)) +
    meter('Range', s.range / 400) + meter('Mobility', (s.ms - 250) / 55 + (h.skills.some(k => ['dash', 'leap', 'blink'].includes(k.type)) ? 0.3 : 0));
  const sk = h.skills.map(k => `<li><img src="${skillIcon(id, k.key)}" alt=""><div><strong>${k.key === 'ult' ? 'Ultimate · ' : ''}${esc(k.name)}<em>${k.cd}s · ${k.mana} mana</em></strong><p>${esc(k.desc)}</p></div></li>`).join('');
  $('dSkills').innerHTML = `<li><img src="${A.portrait(id, 40)}" alt=""><div><strong>Passive · ${esc(h.passive.name)}</strong><p>${esc(h.passive.desc)}</p></div></li>` + sk;
  $('dBuild').innerHTML = buildBlockHtml(id);
}
function startShowcase() {
  cancelAnimationFrame(sel.raf);
  const c = $('showcase'), g = c.getContext('2d');
  let t = 0, last = performance.now();
  const loop = now => {
    if ($('select').hidden) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    const def = D.HERO[sel.hero];
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    const cyc = t % 6;
    const walk = cyc > 1.5 && cyc < 3.5 ? 1 : 0;
    const atk = cyc > 3.7 && cyc < 4.1 ? (cyc - 3.7) / 0.4 : cyc > 4.4 && cyc < 4.8 ? (cyc - 4.4) / 0.4 : -1;
    const cast = cyc > 5.1 && cyc < 5.6 ? (cyc - 5.1) / 0.5 : -1;
    g.fillStyle = 'rgba(0,0,0,0.35)'; A.ellipse(g, 160, 252, 70, 18); g.fill();
    g.save(); g.translate(160, 252); g.scale(2.6, 2.6);
    A.drawRig(g, def.look, { t, walk, phase: t * 9, atk, cast, aim: 0, melee: !!def.attack.melee, hurt: 0, dead: 0 });
    g.restore();
    sel.raf = requestAnimationFrame(loop);
  };
  sel.raf = requestAnimationFrame(loop);
}

// ---------------------------------------------------------------------------
// Multiplayer browser
// ---------------------------------------------------------------------------
function mpStatus(tr) {
  const el = $('netStatus');
  el.classList.remove('ok', 'bad');
  if (!tr) { el.textContent = 'Multiplayer unavailable'; el.classList.add('bad'); $('mpHint').textContent = 'This browser cannot reach other players from here. Play vs AI still works.'; return; }
  el.textContent = tr.label; el.classList.add('ok');
  $('mpHint').textContent = tr.kind === 'claude' ? 'Friends need access to this page to join. Share it from the Share menu, then send them the lobby code.'
    : tr.kind === 'local' && tr.limited ? 'Online lobbies are not available here, so only other tabs on this device can join. To play with friends, open the page signed in to claude.ai, and have the owner add them from the Share menu.'
    : tr.kind === 'local' ? 'Only other tabs on this device can see your lobby. To play across devices, open the game from its claude.ai link or run server.js.'
      : 'Anyone connected to this server can see your lobby.';
}
// "Online · 3 here" — how many people currently have the game's multiplayer screen reachable.
function netCount(tr) {
  if (!tr) return;
  const el = $('netStatus');
  const n = tr.lobby.peers().length;
  const live = tr.lobby.connected ? tr.lobby.connected() : true;
  el.textContent = `${tr.label} · ${live ? `${n} here` : 'connecting…'}${tr.lobby.error ? ` · error: ${tr.lobby.error}` : ''}`;
  el.title = 'Number of open game pages that can see each other\'s lobbies, including yours.';
}
function renderLobbyList(tr) {
  netCount(tr);
  const list = $('lobbyList');
  if (!tr) { list.innerHTML = '<p class="empty">No connection.</p>'; return; }
  const rows = tr.lobby.peers().filter(p => !p.isMe && p.presence && p.presence.lb && typeof p.presence.lb === 'object');
  if (!rows.length) { list.innerHTML = '<p class="empty">No open lobbies right now. Create one and share the code.</p>'; return; }
  list.innerHTML = '';
  for (const p of rows) {
    const lb = p.presence.lb;
    const code = String(lb.c || '');
    if (!LF.net.CODE_RE.test(code)) continue;
    const row = document.createElement('div');
    row.className = 'lobby-row';
    const info = document.createElement('div');
    const name = document.createElement('strong'); name.textContent = LF.net.cleanName(lb.n, 24);
    const host = document.createElement('small'); host.textContent = 'Host: ' + LF.net.cleanName(p.presence.nm);
    info.append(name, host);
    const pill = document.createElement('span');
    const playing = lb.s !== 'open';
    pill.className = 'pill' + (playing ? '' : ' open');
    pill.textContent = playing ? 'In match' : `${Math.max(1, Math.min(10, lb.p | 0))}/10`;
    const btn = document.createElement('button');
    btn.className = 'btn small'; btn.type = 'button'; btn.textContent = 'Join'; btn.disabled = playing;
    btn.addEventListener('click', () => LF.main.joinLobby(code));
    row.append(info, pill, btn);
    list.appendChild(row);
  }
}

// ---------------------------------------------------------------------------
// Lobby room
// ---------------------------------------------------------------------------
let party = null;
function openLobby(p) {
  party = p;
  $('lobbyCode').textContent = p.code;
  $('copyCode').onclick = () => {
    const done = () => { $('copyCode').textContent = 'Copied'; setTimeout(() => { $('copyCode').textContent = 'Copy'; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(p.code).then(done, () => selectText($('lobbyCode')));
    else selectText($('lobbyCode'));
  };
  $('leaveLobby').onclick = () => { click(); LF.main.leaveLobby(); };
  $('startMatch').onclick = () => { click(); LF.main.hostStart(); };
  $('chatForm').onsubmit = e => { e.preventDefault(); const v = $('chatInput').value; $('chatInput').value = ''; p.say(v); };
  show('lobby');
  renderLobby();
}
function selectText(el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
function renderLobby() {
  const p = party;
  if (!p || $('lobby').hidden) return;
  const L = p.L;
  $('lobbyTitle').textContent = L.name || 'Lobby';
  const mySeat = p.mySeat();
  for (const team of [0, 1]) {
    const box = $(team ? 'seatsRed' : 'seatsBlue');
    box.innerHTML = '';
    for (let r = 0; r < 5; r++) {
      const seat = team * 5 + r;
      const s = L.slots[seat];
      const role = D.ROLES[r];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'seat' + (s && s.p ? ' human' : ' open') + (seat === mySeat ? ' me' : '');
      if (s && s.p) {
        const h = D.HEROES[s.h] || D.HEROES[0];
        const img = document.createElement('img'); img.src = A.portrait(h.id, 46, team); img.alt = '';
        const txt = document.createElement('div');
        const nm = document.createElement('strong'); nm.textContent = LF.net.cleanName(s.n) + (seat === mySeat ? ' (you)' : '') + (s.p === (p.isHost ? p.me : p.hostPeer) ? ' · host' : '');
        const sm = document.createElement('small'); sm.innerHTML = `<span class="role">${role.short}</span> · ${esc(h.name)}`;
        txt.append(nm, sm);
        b.append(img, txt);
        b.disabled = true;
      } else {
        b.innerHTML = `<span class="ph">BOT</span><div><strong>Open seat</strong><small><span class="role">${role.short}</span> · ${L.ph === 'lobby' ? 'Click to take this seat' : 'Bot'}</small></div>`;
        b.addEventListener('click', () => { click(); if (p.isHost) p.hostMove(seat); else p.pickSlot(seat); });
      }
      box.appendChild(b);
    }
  }
  const myHero = mySeat >= 0 && L.slots[mySeat] ? L.slots[mySeat].h : -1;
  const mh = $('lobbyHeroes');
  if (!mh.childElementCount) {
    mh.innerHTML = D.HEROES.map((h, i) => `<button type="button" data-i="${i}" title="${h.name} · ${D.ROLES[D.ROLE_INDEX[h.role]].name}"><img src="${A.portrait(h.id, 56)}" alt="${h.name}"></button>`).join('');
    mh.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { LF.audio.play('hover', 1); p.pickHero(+b.dataset.i); }));
  }
  mh.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.i === myHero)));
  $('lobbyHeroName').textContent = myHero >= 0 ? `${D.HEROES[myHero].name}: ${D.HEROES[myHero].cls}, usually ${D.ROLES[D.ROLE_INDEX[D.HEROES[myHero].role]].name}. You play the role of your seat.` : 'Waiting for a seat…';
  const seg = $('lobbyDiff');
  seg.innerHTML = Object.entries(D.DIFFICULTY).map(([k, v]) => `<button type="button" data-d="${k}" aria-pressed="${k === L.diff}" ${p.isHost ? '' : 'disabled'}>${v.name} bots</button>`).join('');
  if (p.isHost) seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { click(); p.setDiff(b.dataset.d); }));
  $('startMatch').hidden = !p.isHost;
  $('lobbyHint').textContent = p.isHost ? 'Keep this page visible while friends join. Empty seats are filled with bots.' : 'Waiting for the host to start the match.';
  const log = $('chatLog');
  const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 4;
  log.innerHTML = '';
  for (const m of p.chat) {
    const line = document.createElement('div');
    if (m.me) line.className = 'me';
    const b = document.createElement('b'); b.textContent = m.who + ': ';
    line.append(b, document.createTextNode(m.text));
    log.appendChild(line);
  }
  if (atBottom) log.scrollTop = log.scrollHeight;
  renderLobbyBuild();
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
const hud = { lastEv: 0, feedRows: [], cache: new Map(), denyT: 0, toastT: 0, bannerQ: [], bannerT: 0, heroId: null };
function set(el, v) { if (hud.cache.get(el) !== v) { hud.cache.set(el, v); el.textContent = v; } }
function setVar(el, k, v) { const key = el.id + k; if (hud.cache.get(key) !== v) { hud.cache.set(key, v); el.style.setProperty(k, v); } }

function setupHud(view) {
  hud.lastEv = view.events && view.events.length ? view.events[view.events.length - 1].seq : 0;
  hud.cache.clear();
  $('feed').innerHTML = '';
  $('banner').hidden = true;
  hud.bannerQ = [];
  const h = view.player;
  if (h) {
    hud.heroId = h.def.id;
    $('hpPortrait').src = A.portrait(h.def.id, 70, h.team);
    $('hpName').textContent = h.name || h.def.name;
    for (const key of ['s1', 's2', 'ult']) {
      const el = $('sk-' + key), sk = h.def.skill[key];
      el.querySelector('img').src = skillIcon(h.def.id, key);
      el.querySelector('.cost').textContent = sk.mana;
      el.title = `${sk.name}: ${sk.desc} (${sk.cd}s, ${sk.mana} mana)`;
      el.setAttribute('aria-label', sk.name);
    }
  }
  $('heroPanel').hidden = !h;
  $('actions').hidden = !h;
}

function updateHud(view) {
  const h = view.player;
  const ours = h ? h.team : 0;
  set($('killsOurs'), String(view.kills[ours]));
  set($('killsTheirs'), String(view.kills[1 - ours]));
  set($('clock'), fmtTime(view.t));
  if (h) {
    set($('kdaLine'), `${h.k} / ${h.d} / ${h.a} · ${h.cs} CS`);
    set($('hpLevel'), String(h.level));
    setVar($('hpXp'), '--xp', h.level >= D.MAX_LEVEL ? '100%' : Math.round(h.xp / D.xpToNext(h.level) * 100) + '%');
    set($('hpGold'), String(Math.floor(h.gold)));
    setVar($('hpFill'), '--w', (Math.max(0, h.hp) / h.maxHp * 100).toFixed(1) + '%');
    set($('hpText'), `${Math.ceil(Math.max(0, h.hp))} / ${Math.round(h.maxHp)}`);
    setVar($('mpFill'), '--w', (h.mana / h.maxMana * 100).toFixed(1) + '%');
    set($('mpText'), `${Math.floor(h.mana)} / ${Math.round(h.maxMana)}`);
    const itemsKey = h.items.join();
    if (hud.cache.get('items') !== itemsKey) {
      hud.cache.set('items', itemsKey);
      $('items').innerHTML = Array.from({ length: 6 }, (_, i) => h.items[i] ? `<div class="slot" title="${esc(D.ITEM[h.items[i]].name)}: ${esc(D.ITEM[h.items[i]].text)}"><img src="${itemIcon(h.items[i])}" alt=""></div>` : '<div class="slot"></div>').join('');
    }
    const next = LF.sim.nextRecommended(h);
    const ni = $('nextItem');
    const np = next && LF.sim.nextPurchase(h);
    if (np) {
      const it = D.ITEM[np.id], c = LF.sim.purchasePlan(h.items, np.id).cost;
      const key = 'buy' + np.id + c;
      if (hud.cache.get('next') !== key) {
        hud.cache.set('next', key);
        ni.classList.add('ready');
        ni.dataset.id = np.id;
        ni.innerHTML = `<span>${it.tier === 3 ? 'Buy' : 'Craft'} ${esc(it.name)}</span><i style="--p:100%"><b></b></i><span>${c}</span>`;
      }
    } else if (next && LF.sim.canBuy(h, next) === 'gold') {
      // Progress toward the cheapest piece still missing from the next item.
      const plan = LF.sim.purchasePlan(h.items, next);
      const step = plan.missing.reduce((m, c) => Math.min(m, LF.sim.purchasePlan(h.items, c).cost), plan.cost);
      const key = 'save' + next + Math.floor(h.gold / 20);
      if (hud.cache.get('next') !== key) {
        hud.cache.set('next', key);
        ni.classList.remove('ready');
        ni.dataset.id = '';
        ni.innerHTML = `<span>Next: ${esc(D.ITEM[next].name)}</span><i style="--p:${Math.min(100, h.gold / step * 100).toFixed(0)}%"><b></b></i><span>${plan.cost}</span>`;
      }
    } else if (hud.cache.get('next') !== 'done' + next) { hud.cache.set('next', 'done' + next); ni.classList.remove('ready'); ni.dataset.id = ''; ni.textContent = !next ? 'Build complete' : 'Inventory full'; }
    renderShop();
    for (const key of ['s1', 's2', 'ult']) {
      const el = $('sk-' + key), sk = h.def.skill[key];
      const cd = h.cds[key], total = sk.cd * (1 - (h.cdr || 0));
      const locked = key === 'ult' && h.level < D.ULT_LEVEL;
      el.classList.toggle('locked', locked);
      el.classList.toggle('nomana', !locked && h.mana < sk.mana);
      el.classList.toggle('ready', !locked && cd <= 0 && h.mana >= sk.mana && !h.dead);
      setVar(el, '--p', cd > 0 ? Math.min(1, cd / total).toFixed(3) : '0');
      set(el.querySelector('.cdt'), cd > 0 ? (cd < 1 ? cd.toFixed(1) : String(Math.ceil(cd))) : locked ? 'Lv4' : '');
    }
    const center = $('center');
    if (h.dead) {
      center.hidden = false;
      const txt = `Respawning in ${Math.max(1, Math.ceil(h.respawn))}`;
      if (hud.cache.get('center') !== txt) { hud.cache.set('center', txt); center.innerHTML = `${txt}<small>Your team fights on. The camera stays on your base.</small>`; }
    } else center.hidden = true;
    const rb = $('recallBar');
    rb.hidden = !h.recall;
    if (h.recall) setVar(rb, '--p', Math.min(100, h.recall.t / 3.5 * 100).toFixed(0) + '%');
  }
  consumeEvents(view);
  if (hud.bannerQ.length && performance.now() > hud.bannerT) playBanner(hud.bannerQ.shift());
  if (hud.toastT && performance.now() > hud.toastT) { $('toast').hidden = true; hud.toastT = 0; }
  if (!$('scoreboard').hidden && (hud.scoreT = (hud.scoreT || 0) + 1) % 30 === 0) renderScore(view, $('scoreBody'));
}

function consumeEvents(view) {
  const evs = view.events || [];
  const me = view.player;
  for (const e of evs) {
    if (e.seq <= hud.lastEv) continue;
    hud.lastEv = e.seq;
    if (e.type === 'kill') {
      const victim = view.heroes[e.victim], killer = e.killer >= 0 ? view.heroes[e.killer] : null;
      addFeed(killer, victim);
      const ally = me ? e.team === me.team : e.team === 0;
      let title = e.tag, cls = ally ? 'good' : 'bad';
      if (me && victim === me) { title = title || 'You have been slain'; cls = 'bad'; LF.audio.play('death', 0.7); }
      else if (me && killer === me) { title = title || 'Enemy slain'; cls = 'good'; LF.audio.play('kill', 0.7); }
      else if (title) LF.audio.play('kill', 0.4);
      if (title) hud.bannerQ.push({ title, cls, killer, victim, sub: killer ? `${killer.name} defeated ${victim.name}` : `${victim.name} fell` });
    } else if (e.type === 'tower') {
      const ally = me ? e.team !== me.team : true;
      hud.bannerQ.push({ title: e.kind === 'core' ? (ally ? 'The enemy core shatters' : 'Our core has fallen') : ally ? 'Enemy turret destroyed' : 'Our turret has fallen', cls: ally ? 'good' : 'bad' });
    } else if (e.type === 'monster' && e.boss) {
      const ally = me ? e.team === me.team : e.team === 0;
      const name = D.MONSTERS[e.mtype].name;
      hud.bannerQ.push({ title: ally ? `${name} slain` : `Enemies took the ${name}`, cls: ally ? 'good' : 'bad', sub: e.mtype === 'wyrm' ? (ally ? 'Your team deals 15% more damage for 90 seconds.' : 'The enemy team hits harder for 90 seconds.') : 'Gold and experience for the whole team.' });
    } else if (e.type === 'spawn') {
      hud.bannerQ.push({ title: `The ${D.MONSTERS[e.mtype].name} has appeared`, cls: 'neutral', sub: e.mtype === 'turtle' ? 'In the river near the bottom lane.' : 'In the river near the top lane.' });
    } else if (e.type === 'ace') {
      const ally = me ? e.team === me.team : e.team === 0;
      hud.bannerQ.push({ title: ally ? 'Ace!' : 'Team wiped', cls: ally ? 'good' : 'bad' });
    } else if ((e.type === 'buy' || e.type === 'sell') && me && e.seat === me.seat) {
      toast(e.item, e.type);
    }
  }
}

function addFeed(killer, victim) {
  const feed = $('feed');
  const row = document.createElement('div');
  row.className = 'feed-row';
  const img = (h) => { const i = document.createElement('img'); i.src = A.portrait(h.def.id, 26); i.alt = h.name; if (h.team === 1) i.className = 'red'; return i; };
  if (killer) row.appendChild(img(killer));
  const x = document.createElement('span'); x.className = 'x'; x.textContent = killer ? '⚔' : '✝';
  row.appendChild(x);
  row.appendChild(img(victim));
  feed.prepend(row);
  while (feed.childElementCount > 5) feed.lastElementChild.remove();
  setTimeout(() => row.classList.add('fade'), 7000);
  setTimeout(() => row.remove(), 7700);
}

function playBanner(b) {
  const el = $('banner');
  el.className = 'banner ' + b.cls;
  el.innerHTML = '';
  if (b.killer && b.victim) {
    const faces = document.createElement('div'); faces.className = 'b-faces';
    const k = document.createElement('img'); k.src = A.portrait(b.killer.def.id, 54); if (b.killer.team) k.className = 'red';
    const v = document.createElement('img'); v.src = A.portrait(b.victim.def.id, 54); if (b.victim.team) v.className = 'red';
    const s = document.createElement('span'); s.textContent = '⚔';
    faces.append(k, s, v);
    el.appendChild(faces);
  }
  const t = document.createElement('div'); t.className = 'b-title'; t.textContent = b.title;
  el.appendChild(t);
  if (b.sub) { const s = document.createElement('div'); s.className = 'b-sub'; s.textContent = b.sub; el.appendChild(s); }
  el.hidden = false;
  void el.offsetWidth;
  el.classList.add('show');
  hud.bannerT = performance.now() + 1700;
  clearTimeout(hud.bannerHide);
  hud.bannerHide = setTimeout(() => { el.hidden = true; }, 2600);
}

function toast(itemId, type) {
  const it = D.ITEM[itemId];
  const el = $('toast');
  el.innerHTML = type === 'sell'
    ? `<img src="${itemIcon(itemId)}" alt=""><span>Sold <b>${esc(it.name)}</b> for ${Math.round(it.cost * LF.sim.SELL_RATE)}</span>`
    : `<img src="${itemIcon(itemId)}" alt=""><span>${it.tier === 3 ? 'Bought' : 'Crafted'} <b>${esc(it.name)}</b></span>`;
  el.hidden = false;
  hud.toastT = performance.now() + 2200;
  LF.audio.play('gold', 0.5);
}

const WHY = { cooldown: 'Not ready yet', mana: 'Not enough mana', locked: 'Unlocks at level 4', dead: '', notarget: 'No enemy hero in range', rooted: 'Rooted', busy: '' };
function denyReason(key, why) {
  const msg = WHY[why];
  if (!msg || performance.now() - hud.denyT < 600) return;
  hud.denyT = performance.now();
  const v = LF.main.view();
  if (v && v.player) LF.render.addText(v.player.x, v.player.y - 130, msg, '#cfd6dc', 20);
}

// ---------------------------------------------------------------------------
// Item catalog (shared by the shop and the build editor)
// ---------------------------------------------------------------------------
const SHOP_TABS = ['All', 'Attack', 'Magic', 'Defense', 'Movement', 'Jungle'];
const TIERS = [['all', 'All tiers'], ['1', 'Tier 1'], ['2', 'Tier 2'], ['3', 'Tier 3']];
const TIER_NOTE = { 1: 'Tier 1 · finished items with a unique passive', 2: 'Tier 2 · crafted from Tier 3', 3: 'Tier 3 · basic pieces' };
const tierBadge = t => `<i class="tb t${t}" title="Tier ${t}">T${t}</i>`;
// Filters for a catalog: tier pills and category tabs. `st` holds { cat, tier }.
function initFilters(tiersEl, tabsEl, st, redraw) {
  tabsEl.innerHTML = SHOP_TABS.map(t => `<button class="role-tab" role="tab" type="button" data-cat="${t}">${t}</button>`).join('');
  tiersEl.innerHTML = TIERS.map(([k, t]) => `<button class="tier-tab" type="button" data-tier="${k}">${k === 'all' ? '' : `<i class="dot t${k}"></i>`}${t}</button>`).join('');
  tabsEl.addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) { st.cat = b.dataset.cat; click(); redraw(); } });
  tiersEl.addEventListener('click', e => { const b = e.target.closest('[data-tier]'); if (b) { st.tier = b.dataset.tier; click(); redraw(); } });
}
function syncFilters(tiersEl, tabsEl, st) {
  tabsEl.querySelectorAll('[data-cat]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.cat === st.cat)));
  tiersEl.querySelectorAll('[data-tier]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tier === st.tier)));
}
// Item cards grouped by tier. With a hero, prices account for the parts it owns.
function catalogHtml(st, h, count) {
  const card = it => {
    const c = h ? LF.sim.purchasePlan(h.items, it.id).cost : it.cost;
    const n = count ? count(it.id) : 0;
    return `<button class="shop-card${h && h.gold < c ? ' poor' : ''}" type="button" data-id="${it.id}" aria-pressed="${it.id === st.sel}"><img src="${itemIcon(it.id)}" alt="">${tierBadge(it.tier)}<span><strong>${esc(it.name)}</strong><small>${c}${c < it.cost ? `<s>${it.cost}</s>` : ''}</small></span>${n ? `<span class="count">×${n}</span>` : ''}</button>`;
  };
  let html = '';
  for (const t of [1, 2, 3]) {
    if (st.tier !== 'all' && +st.tier !== t) continue;
    const list = D.ITEMS.filter(it => it.tier === t && (st.cat === 'All' || it.cat === st.cat));
    if (list.length) html += `<p class="tier-head">${TIER_NOTE[t]}</p>` + list.map(card).join('');
  }
  return html || '<p class="tier-head">Nothing here.</p>';
}
// Recipe tree: the item on top, its components below. Parts the hero already owns are marked with the
// amount they take off and not expanded, matching how the shop spends them.
function recipeTree(items, id, sel) {
  const pool = items.slice();
  const node = (iid, top) => {
    const it = D.ITEM[iid];
    const k = top ? -1 : pool.indexOf(iid);
    if (k >= 0) pool.splice(k, 1);
    const own = k >= 0;
    const kids = !own && it.from ? `<div class="t-kids">${it.from.map(c => node(c, false)).join('')}</div>` : '';
    return `<div class="t-branch"><button class="t-node${own ? ' own' : ''}${iid === sel ? ' sel' : ''}" type="button" data-id="${iid}" title="${esc(it.name)}"><img src="${itemIcon(iid)}" alt="${esc(it.name)}"><small>${own ? '−' + LF.sim.partCredit(iid) : it.cost}</small></button>${kids}</div>`;
  };
  return node(id, true);
}
// Everything about an item except the action buttons.
function itemInfoHtml(it, items, sel) {
  const list = (cls, lines) => lines.length ? `<ul class="${cls}">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : '';
  return `<div class="sd-top"><img src="${itemIcon(it.id)}" alt=""><div><small>${tierBadge(it.tier)} Tier ${it.tier} · ${it.cat} · ${it.cost} gold</small><h3>${esc(it.name)}</h3></div></div>
    <p class="sd-desc">${esc(it.desc)}</p>
    <div class="sd-attrs-row"><div class="sd-attrs"><span class="sd-label">Attributes</span>${list('sd-stats', it.lines)}</div>
    ${it.uniqueLines.length ? `<div class="sd-attrs"><span class="sd-label uniq">Unique attributes</span>${list('sd-uniq', it.uniqueLines)}</div>` : ''}</div>
    ${it.passive ? `<div class="sd-passive"><span class="sd-label">Unique passive · ${esc(it.passive.name)}</span><p>${esc(it.passive.text)}</p></div>` : ''}
    ${it.from ? `<div class="sd-recipe"><span class="sd-label">Recipe <em>parts you own count for ${Math.round(LF.sim.PART_CREDIT * 100)}% of their price</em></span><div class="tree">${recipeTree(items, it.id, sel)}</div></div>` : ''}
    ${it.into.length ? `<div class="sd-into"><span class="sd-label">Builds into</span><div class="into">${it.into.map(i => `<button class="t-node" type="button" data-id="${i}" title="${esc(D.ITEM[i].name)}"><img src="${itemIcon(i)}" alt="${esc(D.ITEM[i].name)}"></button>`).join('')}</div></div>` : ''}`;
}
// Six item buttons for a build; `mark(id, i)` adds classes.
function buildRowHtml(build, sel, mark) {
  return build.map((id, i) => {
    const it = D.ITEM[id];
    return `<button class="rec-item${mark ? mark(id, i) : ''}" type="button" data-id="${id}" data-slot="${i}" aria-pressed="${id === sel}" title="${esc(it.name)} · ${it.cost}"><img src="${itemIcon(id)}" alt="${esc(it.name)}"></button>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Saved builds: one per hero, kept in this browser. null means "use the recommended build".
// ---------------------------------------------------------------------------
const builds = {
  all() { try { return JSON.parse(localStorage.getItem('lf-builds') || '{}') || {}; } catch (e) { return {}; } },
  get(heroId) { return LF.sim.cleanBuild(this.all()[heroId]); },
  set(heroId, ids) {
    const all = this.all();
    const clean = LF.sim.cleanBuild(ids);
    if (clean) all[heroId] = clean; else delete all[heroId];
    try { localStorage.setItem('lf-builds', JSON.stringify(all)); } catch (e) { /* ignore */ }
    return clean;
  },
  of(heroId) { return this.get(heroId) || D.HERO[heroId].build; },
};

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------
const shopSt = { cat: 'All', tier: 'all', sel: null, sig: '', busy: 0 };
const WHY_BUY = { full: 'Your six item slots are full. Sell something first.', boots: 'You can only carry one pair of boots.', gold: '' };
function shopHero() { const v = LF.main.view(); return v && v.player; }
function initShop() {
  initFilters($('shopTiers'), $('shopTabs'), shopSt, () => renderShop(true));
  const pick = e => { const b = e.target.closest('[data-id]'); if (b && b.dataset.id) { shopSt.sel = b.dataset.id; LF.audio.play('hover', 1); renderShop(true); } };
  $('shopItems').addEventListener('click', pick);
  $('recItems').addEventListener('click', pick);
  $('shopBag').addEventListener('click', pick);
  $('shopDetail').addEventListener('click', e => {
    const b = e.target.closest('[data-op]');
    if (b && !b.disabled) { order(b.dataset.op, b.dataset.item); return; }
    pick(e);
  });
  $('buyNext').addEventListener('click', () => { const h = shopHero(); const n = h && LF.sim.nextPurchase(h); if (n) order('buy', n.id); });
  $('autoBuy').addEventListener('change', e => { LF.input.setAutoBuy(e.target.checked); renderShop(true); });
  $('editBuild').addEventListener('click', () => { const h = shopHero(); if (h) { click(); openBuild(h.def.id); } });
  $('shopClose').addEventListener('click', () => toggleShop(false));
  $('btnShop').addEventListener('click', () => toggleShop());
  $('shop').addEventListener('pointerdown', e => { if (e.target.id === 'shop') toggleShop(false); });
  $('nextItem').addEventListener('click', () => {
    const h = shopHero(), id = $('nextItem').dataset.id;
    if (h && id && !LF.sim.canBuy(h, id)) order('buy', id); else toggleShop(true);
  });
  initBuild();
}
function order(op, id) {
  if (performance.now() < shopSt.busy) return;
  shopSt.busy = performance.now() + 350;
  LF.input.shop(op, id);
  LF.audio.play(op === 'buy' ? 'gold' : 'click', 0.7);
  setTimeout(() => renderShop(true), 380);
}
function toggleShop(force) {
  const el = $('shop');
  const open = force === undefined ? el.hidden : force;
  if (open && !(LF.main.inGame() && shopHero())) return;
  el.hidden = !open;
  if (open) { shopSt.sel = null; renderShop(true); }
}
function renderShop(force) {
  if ($('shop').hidden) return;
  const h = shopHero();
  if (!h) return;
  const next = LF.sim.nextRecommended(h);
  const build = h.build || h.def.build;
  const custom = !!LF.input.state.build;
  if (!shopSt.sel || !D.ITEM[shopSt.sel]) shopSt.sel = next || D.ITEMS[0].id;
  const sig = [Math.floor(h.gold), h.items.join(), build.join(), shopSt.cat, shopSt.tier, shopSt.sel, LF.input.state.autoBuy].join('|');
  if (!force && sig === shopSt.sig) return;
  shopSt.sig = sig;
  $('shopGold').textContent = Math.floor(h.gold);
  $('autoBuy').checked = !!LF.input.state.autoBuy;
  $('recLabel').textContent = custom ? 'Your build for ' : 'Recommended for ';
  $('recHero').textContent = h.def.name;
  $('recNote').textContent = custom ? 'Your own build. Auto-buy and "Buy next" follow it, piece by piece.' : h.def.buildNote;
  const left = h.items.slice();
  $('recItems').innerHTML = buildRowHtml(build, shopSt.sel, id => {
    const k = left.indexOf(id), owned = k >= 0;
    if (owned) left.splice(k, 1);
    return (owned ? ' owned' : '') + (id === next ? ' next' : '');
  });
  const bn = $('buyNext');
  const np = LF.sim.nextPurchase(h);
  if (np) {
    const it = D.ITEM[np.id], c = LF.sim.purchasePlan(h.items, np.id).cost;
    bn.disabled = false;
    bn.textContent = np.id === np.target ? `Buy ${it.name} · ${c}` : `Buy ${it.name} · ${c} (for ${D.ITEM[np.target].name})`;
  } else if (next) {
    bn.disabled = true;
    const why = LF.sim.canBuy(h, next);
    bn.textContent = why === 'gold' ? `Saving for ${D.ITEM[next].name}` : why === 'full' ? 'Slots full' : `Next: ${D.ITEM[next].name}`;
  } else { bn.disabled = true; bn.textContent = h.items.length >= 6 ? 'Slots full' : 'Build complete'; }
  syncFilters($('shopTiers'), $('shopTabs'), shopSt);
  $('shopItems').innerHTML = catalogHtml(shopSt, h, id => h.items.filter(i => i === id).length);
  const it = D.ITEM[shopSt.sel];
  const fresh = shopSt.shown !== it.id;
  shopSt.shown = it.id;
  const why = LF.sim.canBuy(h, it.id);
  const plan = LF.sim.purchasePlan(h.items, it.id);
  const owned = h.items.includes(it.id);
  const short = why === 'gold' ? `Need ${plan.cost - Math.floor(h.gold)} more gold.` : WHY_BUY[why] || '';
  $('shopDetail').innerHTML = itemInfoHtml(it, h.items, shopSt.sel) + `
    ${build.includes(it.id) ? `<p class="sd-rec">Part of ${custom ? 'your' : esc(h.def.name) + '\'s recommended'} build.</p>` : ''}
    <div class="sd-actions"><button class="btn primary" type="button" data-op="buy" data-item="${it.id}" ${why ? 'disabled' : ''}>${it.tier === 3 ? 'Buy' : 'Craft'} · ${plan.cost}</button>
    ${plan.used.length ? `<span class="sd-save">Your ${plan.used.map(u => esc(D.ITEM[u].name)).join(', ')} take ${plan.credit} off (full price ${it.cost})</span>` : ''}
    ${owned ? `<button class="btn" type="button" data-op="sell" data-item="${it.id}">Sell · ${Math.round(it.cost * LF.sim.SELL_RATE)}</button>` : ''}
    ${short ? `<span class="sd-why">${esc(short)}</span>` : ''}</div>`;
  if (fresh) $('shopDetail').scrollTop = 0;
  $('shopBag').innerHTML = Array.from({ length: 6 }, (_, i) => {
    const id = h.items[i];
    return id ? `<button class="bag-slot" type="button" data-id="${id}" aria-pressed="${id === shopSt.sel}" title="${esc(D.ITEM[id].name)}"><img src="${itemIcon(id)}" alt="${esc(D.ITEM[id].name)}"></button>` : '<span class="bag-slot empty"></span>';
  }).join('');
}

// ---------------------------------------------------------------------------
// Build editor: browse every item and plan up to six for a hero. Saved per hero; auto-buy and the
// quick-buy button follow it in matches.
// ---------------------------------------------------------------------------
const be = { hero: null, build: [], custom: false, cat: 'All', tier: 'all', sel: null, slot: -1 };
function initBuild() {
  initFilters($('beTiers'), $('beTabs'), be, renderBuild);
  const pick = e => {
    const b = e.target.closest('[data-id]');
    if (!b || !b.dataset.id) return;
    be.sel = b.dataset.id; be.slot = b.dataset.slot !== undefined ? +b.dataset.slot : -1;
    LF.audio.play('hover', 1); renderBuild();
  };
  $('beItems').addEventListener('click', pick);
  $('beSlots').addEventListener('click', pick);
  $('beDetail').addEventListener('click', e => {
    const b = e.target.closest('[data-be]');
    if (!b) { pick(e); return; }
    if (b.disabled) return;
    const list = be.build.slice(), i = be.slot;
    if (b.dataset.be === 'add') { list.push(be.sel); be.slot = list.length - 1; }
    else if (b.dataset.be === 'remove') { list.splice(i, 1); be.slot = -1; }
    else if (b.dataset.be === 'left' && i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; be.slot = i - 1; }
    else if (b.dataset.be === 'right' && i < list.length - 1) { [list[i + 1], list[i]] = [list[i], list[i + 1]]; be.slot = i + 1; }
    click();
    saveBuild(list);
  });
  $('beReset').addEventListener('click', () => { click(); be.slot = -1; saveBuild(null); });
  $('beClear').addEventListener('click', () => { click(); be.slot = -1; saveBuild([]); });
  $('beAuto').addEventListener('change', e => { LF.input.setAutoBuy(e.target.checked); renderShop(true); });
  $('beClose').addEventListener('click', () => { click(); closeBuild(); });
  $('buildEd').addEventListener('pointerdown', e => { if (e.target.id === 'buildEd') closeBuild(); });
}
// An empty build is kept while editing but saved as "recommended".
function saveBuild(list) {
  const saved = builds.set(be.hero, list);
  be.custom = !!list;
  be.build = list ? list.slice() : D.HERO[be.hero].build.slice();
  // Playing this hero right now? Switch the match over to the new build.
  const h = LF.main.inGame() && shopHero();
  if (h && h.def.id === be.hero) LF.input.setBuild(saved, h);
  renderBuild();
  renderShop(true);
  if (!$('select').hidden) renderDetail(sel.hero);
  renderLobbyBuild();
}
function openBuild(heroId) {
  be.hero = heroId;
  const own = builds.get(heroId);
  be.custom = !!own;
  be.build = (own || D.HERO[heroId].build).slice();
  be.sel = be.build[0] || D.ITEMS[0].id; be.slot = be.build.length ? 0 : -1;
  $('buildEd').hidden = false;
  renderBuild();
}
function closeBuild() { $('buildEd').hidden = true; }
function canAdd(id) {
  if (be.build.length >= 6) return 'Your build already has six items. Remove one first.';
  if (D.ITEM[id].boots && be.build.some(i => D.ITEM[i].boots)) return 'A build can only have one pair of boots.';
  return '';
}
function renderBuild() {
  if ($('buildEd').hidden) return;
  const hd = D.HERO[be.hero];
  $('beFace').src = A.portrait(hd.id, 48);
  $('beTitle').textContent = `${hd.name}'s build`;
  $('beAuto').checked = !!LF.input.state.autoBuy;
  const total = be.build.reduce((s, id) => s + D.ITEM[id].cost, 0);
  $('beHead').textContent = be.custom ? (be.build.length ? `Your build · ${total} gold` : 'Your build is empty') : `Recommended build · ${total} gold`;
  $('beNote').textContent = be.custom
    ? (be.build.length ? 'Auto-buy and "Buy next" buy these in order, piece by piece. Saved in this browser.' : 'Add items from the list. An empty build falls back to the recommended one.')
    : `${hd.buildNote} Add, remove or reorder items to make it your own.`;
  if (be.slot >= be.build.length) be.slot = -1;
  $('beSlots').innerHTML = buildRowHtml(be.build, null, (id, i) => (i === be.slot ? ' picked' : '')) +
    Array.from({ length: 6 - be.build.length }, (_, i) => `<span class="rec-item empty">${be.build.length + i + 1}</span>`).join('');
  $('beReset').disabled = !be.custom;
  syncFilters($('beTiers'), $('beTabs'), be);
  $('beItems').innerHTML = catalogHtml(be, null, id => be.build.filter(i => i === id).length);
  const it = D.ITEM[be.sel] || D.ITEMS[0];
  const fresh = be.shown !== it.id;
  be.shown = it.id;
  const i = be.slot;
  const why = canAdd(it.id);
  const actions = i >= 0
    ? `<button class="btn" type="button" data-be="left" ${i === 0 ? 'disabled' : ''} aria-label="Move earlier">◀ Earlier</button>
       <button class="btn" type="button" data-be="right" ${i === be.build.length - 1 ? 'disabled' : ''} aria-label="Move later">Later ▶</button>
       <button class="btn" type="button" data-be="remove">Remove</button><span class="sd-save">Slot ${i + 1} of your build</span>`
    : `<button class="btn primary" type="button" data-be="add" ${why ? 'disabled' : ''}>Add to build</button>${why ? `<span class="sd-why">${esc(why)}</span>` : ''}`;
  $('beDetail').innerHTML = itemInfoHtml(it, [], be.sel) + `<div class="sd-actions">${actions}</div>`;
  if (fresh) $('beDetail').scrollTop = 0;
}
// The build row on the hero select screen and in the lobby.
function buildBlockHtml(heroId) {
  const own = builds.get(heroId), list = own || D.HERO[heroId].build;
  return `<p class="eyebrow">${own ? 'Your build' : 'Recommended build'}</p><div class="itemrow">${list.map(i => `<img src="${itemIcon(i)}" alt="${esc(D.ITEM[i].name)}" title="${esc(D.ITEM[i].name)}: ${esc(D.ITEM[i].text)}">`).join('')}</div>
    <p>${own ? 'Auto-buy follows your build in matches.' : esc(D.HERO[heroId].buildNote)}</p>
    <button class="btn small" type="button" data-edit-build="${heroId}">${own ? 'Edit build' : 'Customize build'} · all items</button>`;
}
function renderLobbyBuild() {
  const p = party, el = $('lobbyBuild');
  if (!p || $('lobby').hidden) return;
  const seat = p.mySeat(), s = seat >= 0 ? p.L.slots[seat] : null;
  const heroId = s && D.HEROES[s.h] ? D.HEROES[s.h].id : null;
  const key = heroId + '|' + JSON.stringify(heroId && builds.get(heroId));
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.innerHTML = heroId ? buildBlockHtml(heroId) : '';
}

// ---------------------------------------------------------------------------
// Scoreboard and end screen
// ---------------------------------------------------------------------------
function score(h) { return h.k * 3 + h.a * 1.5 - h.d * 1.2 + h.cs * 0.05 + (h.goldTotal || 0) / 800; }
function renderScore(view, box, withMvp) {
  const me = view.player;
  let mvp = null;
  if (withMvp) for (const h of view.heroes) if (!mvp || score(h) > score(mvp)) mvp = h;
  box.innerHTML = '';
  for (const team of [0, 1]) {
    const tbl = document.createElement('table');
    tbl.className = 'score-team-table ' + (team ? 'red' : 'blue');
    const cap = document.createElement('caption');
    cap.textContent = `${D.TEAMS[team].name} · ${view.kills[team]} kills` + (me ? (me.team === team ? ' · your team' : '') : '');
    tbl.appendChild(cap);
    tbl.insertAdjacentHTML('beforeend', '<thead><tr><th>Hero</th><th>Lv</th><th>K / D / A</th><th>CS</th><th>Gold</th><th>Items</th></tr></thead>');
    const tb = document.createElement('tbody');
    for (const h of view.heroes.filter(x => x.team === team)) {
      const tr = document.createElement('tr');
      if (h === me) tr.className = 'me';
      const td1 = document.createElement('td');
      const who = document.createElement('div'); who.className = 'who';
      const img = document.createElement('img'); img.src = A.portrait(h.def.id, 32, h.team); img.alt = '';
      const txt = document.createElement('div');
      const nm = document.createElement('strong'); nm.textContent = (h.name || h.def.name) + (h === me ? ' (you)' : '');
      if (h === mvp) { const m = document.createElement('span'); m.className = 'mvp'; m.textContent = 'MVP'; nm.appendChild(m); }
      const sm = document.createElement('small'); sm.textContent = `${D.ROLES[h.role].short} · ${h.def.name}${h.human ? '' : ' · bot'}`;
      txt.append(nm, sm); who.append(img, txt); td1.appendChild(who);
      tr.appendChild(td1);
      tr.insertAdjacentHTML('beforeend', `<td>${h.level}</td><td>${h.k} / ${h.d} / ${h.a}</td><td>${h.cs}</td><td>${Math.round(h.goldTotal || h.gold)}</td><td><div class="itemrow">${h.items.map(i => `<img src="${itemIcon(i)}" alt="${esc(D.ITEM[i].name)}" title="${esc(D.ITEM[i].name)}">`).join('')}</div></td>`);
      tb.appendChild(tr);
    }
    tbl.appendChild(tb);
    box.appendChild(tbl);
  }
}
function showScore(on) {
  const v = LF.main.view();
  if (!v || !LF.main.inGame()) { $('scoreboard').hidden = true; return; }
  $('scoreboard').hidden = !on;
  if (on) renderScore(v, $('scoreBody'));
}
function showEnd(view, actions) {
  closeBuild();
  const me = view.player;
  const won = me ? view.winner === me.team : view.winner === 0;
  $('endEyebrow').textContent = `Match over · ${fmtTime(view.t)}`;
  const t = $('endTitle');
  t.textContent = won ? 'Victory' : 'Defeat';
  t.className = 'end-title ' + (won ? 'win' : 'loss');
  $('endSub').textContent = won ? 'The enemy core lies in pieces.' : 'Our core has fallen. Regroup and try again.';
  renderScore(view, $('endTable'), true);
  const box = $('endActions');
  box.innerHTML = '';
  for (const a of actions) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = a.primary ? 'btn primary big' : 'btn big ghost'; b.textContent = a.label;
    b.addEventListener('click', () => { click(); a.fn(); });
    box.appendChild(b);
  }
  $('hud').hidden = true;
  show('end', false);
  LF.audio.play(won ? 'victory' : 'defeat', 0.8);
}

LF.ui = {
  init, show, back, openSelect, mpStatus, renderLobbyList, openLobby, renderLobby, setupHud, updateHud, showScore, showEnd,
  denyReason, skillIcon, itemIcon, toggleShop, openBuild, closeBuild, builds, get nick() { saveNick(); return nick; },
};
})(window.LF);
