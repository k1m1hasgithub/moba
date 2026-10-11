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
function itemIcon(itemId) {
  const id = 'item:' + itemId;
  if (iconCache.has(id)) return iconCache.get(id);
  const it = D.ITEM[itemId];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const tint = { boots: '#6a8bb0', machete: '#7a9a4a', sword: '#b0b8c2', bow: '#9a7a4a', fang: '#b04a4a', axe: '#c27a3a', staff: '#7a6ad0', clock: '#4ab0c2', crown: '#a04ad0', armor: '#7a8a9a', helm: '#c2a24a', charm: '#4ac27a' }[it.icon] || '#8a8a8a';
  const bg = g.createLinearGradient(0, 0, 0, 64);
  bg.addColorStop(0, A.shade(tint, -0.35)); bg.addColorStop(1, A.shade(tint, -0.75));
  g.fillStyle = bg; g.fillRect(0, 0, 64, 64);
  g.fillStyle = A.shade(tint, 0.45); g.strokeStyle = A.shade(tint, 0.6); g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round';
  g.save(); g.translate(32, 32);
  switch (it.icon) {
    case 'boots': g.beginPath(); g.moveTo(-10, -20); g.lineTo(2, -20); g.lineTo(2, 6); g.lineTo(18, 10); g.lineTo(18, 20); g.lineTo(-12, 20); g.closePath(); g.fill(); break;
    case 'sword': case 'machete': g.rotate(-0.8); g.fillRect(-4, -26, 8, 36); g.fillRect(-12, 8, 24, 5); g.fillStyle = '#5a4030'; g.fillRect(-3, 13, 6, 12); break;
    case 'bow': g.beginPath(); g.arc(-6, 0, 22, -1.3, 1.3); g.stroke(); g.lineWidth = 2; g.beginPath(); g.moveTo(0, -21); g.lineTo(0, 21); g.stroke(); break;
    case 'fang': g.beginPath(); g.moveTo(-14, -20); g.quadraticCurveTo(10, -6, 4, 24); g.quadraticCurveTo(-2, 0, -14, -20); g.fill(); break;
    case 'axe': g.fillStyle = '#6a4a2c'; g.save(); g.rotate(-0.7); g.fillRect(-3, -24, 6, 48); g.restore(); g.fillStyle = A.shade(tint, 0.45); g.beginPath(); g.arc(4, -10, 16, -1.5, 1.2); g.closePath(); g.fill(); break;
    case 'staff': g.beginPath(); g.moveTo(-14, 24); g.lineTo(10, -14); g.stroke(); A.glow(g, 12, -16, 16, '#d0c8ff', 0.9); g.fillStyle = '#fff'; A.circle(g, 12, -16, 6); g.fill(); break;
    case 'clock': g.beginPath(); g.arc(0, 0, 20, 0, TAU); g.stroke(); g.lineWidth = 4; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -12); g.moveTo(0, 0); g.lineTo(9, 5); g.stroke(); break;
    case 'crown': g.beginPath(); g.moveTo(-20, 14); g.lineTo(-20, -10); g.lineTo(-10, 2); g.lineTo(0, -16); g.lineTo(10, 2); g.lineTo(20, -10); g.lineTo(20, 14); g.closePath(); g.fill(); break;
    case 'armor': g.beginPath(); g.moveTo(-20, -18); g.lineTo(20, -18); g.lineTo(16, 18); g.lineTo(0, 24); g.lineTo(-16, 18); g.closePath(); g.fill(); g.strokeStyle = A.shade(tint, -0.4); g.lineWidth = 3; g.beginPath(); g.moveTo(0, -18); g.lineTo(0, 22); g.stroke(); break;
    case 'helm': g.beginPath(); g.arc(0, 4, 20, Math.PI, TAU); g.lineTo(20, 18); g.lineTo(-20, 18); g.closePath(); g.fill(); g.fillStyle = A.shade(tint, -0.5); g.fillRect(-12, 4, 24, 5); break;
    case 'charm': A.glow(g, 0, 0, 26, '#b6ffc8', 0.8); g.beginPath(); g.moveTo(0, -20); g.lineTo(16, 0); g.lineTo(0, 20); g.lineTo(-16, 0); g.closePath(); g.fill(); break;
    default: g.beginPath(); g.arc(0, 0, 16, 0, TAU); g.fill();
  }
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 3; g.strokeRect(0, 0, 64, 64);
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
    : tr.kind === 'local' ? 'Only other tabs on this device can see your lobby. To play across devices, open the game from its claude.ai link or run server.js.'
      : 'Anyone connected to this server can see your lobby.';
}
function renderLobbyList(tr) {
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
    const name = document.createElement('strong'); name.textContent = LF.net.cleanName(lb.n).slice(0, 24) || 'Lobby';
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
  $('lobbyHint').textContent = p.isHost ? 'Empty seats are filled with bots when the match starts.' : 'Waiting for the host to start the match.';
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
    const next = h.def.build.find(id => !h.items.includes(id));
    const ni = $('nextItem');
    if (next && h.items.length < 6) {
      const it = D.ITEM[next];
      const key = next + Math.floor(h.gold / 20);
      if (hud.cache.get('next') !== key) {
        hud.cache.set('next', key);
        ni.innerHTML = `<span>Next: ${esc(it.name)}</span><i style="--p:${Math.min(100, h.gold / it.cost * 100).toFixed(0)}%"><b></b></i><span>${it.cost}</span>`;
      }
    } else if (hud.cache.get('next') !== 'done') { hud.cache.set('next', 'done'); ni.textContent = 'Build complete'; }
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
    } else if (e.type === 'buy' && me && e.seat === me.seat) {
      toast(e.item);
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

function toast(itemId) {
  const it = D.ITEM[itemId];
  const el = $('toast');
  el.innerHTML = `<img src="${itemIcon(itemId)}" alt=""><span>Bought <b>${esc(it.name)}</b></span>`;
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
  denyReason, skillIcon, itemIcon, get nick() { saveNick(); return nick; },
};
})(window.LF);
