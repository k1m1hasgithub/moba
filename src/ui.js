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
// Icons are drawn by src/icons.js.
const skillIcon = (heroId, key) => LF.icons.skill(heroId, key);
const passiveIcon = heroId => LF.icons.passive(heroId);
const spellIcon = id => LF.icons.spell(id);
const itemIcon = id => LF.icons.item(id);

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
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-edit-build]');
    if (b) { click(); openBuild(b.dataset.editBuild); }
    const sp = e.target.closest('[data-pick-spell]');
    if (sp) { click(); openSpell(sp.dataset.pickSpell); }
  });
  initSpellPick();
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
  $('dSkills').innerHTML = `<li><img src="${passiveIcon(id)}" alt=""><div><strong>Passive · ${esc(h.passive.name)}</strong><p>${esc(h.passive.desc)}</p></div></li>` + sk;
  $('dSpell').innerHTML = spellBlockHtml(id);
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
  if (h) {
    const sp = D.SPELL[h.spell];
    const el = $('sk-sp');
    el.querySelector('img').src = spellIcon(sp.id);
    el.title = `${sp.name} (battle spell, F): ${sp.desc}`;
    el.setAttribute('aria-label', 'Battle spell: ' + sp.name);
    $('btnRegen').title = `Regen (H): restore ${Math.round(D.REGEN.heal * D.REGEN.time * 100)}% of your health over ${D.REGEN.time} seconds. You can keep moving; attacking, casting or taking damage from heroes and towers stops it.`;
  }
  $('heroPanel').hidden = !h;
  $('actions').hidden = !h;
  resetStatus();
  shopSt.prio = null; bp.dismissed = '';
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
    const next = goal(h);
    const ni = $('nextItem');
    const np = next && LF.sim.nextPurchase(h, next);
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
    for (const key of ['sp', 'rg']) {
      const el = $(key === 'sp' ? 'sk-sp' : 'btnRegen');
      const cd = h.cds[key] || 0, total = key === 'sp' ? D.SPELL[h.spell].cd : D.REGEN.cd;
      el.classList.toggle('ready', cd <= 0 && !h.dead);
      setVar(el, '--p', cd > 0 ? Math.min(1, cd / total).toFixed(3) : '0');
      set(el.querySelector('.cdt'), cd > 0 ? String(Math.ceil(cd)) : '');
    }
    const rb = $('recallBar');
    const ch = h.recall ? 'recall' : h.regenCh ? 'regen' : '';
    rb.hidden = !ch;
    rb.classList.toggle('regen', ch === 'regen');
    set(rb.querySelector('span'), ch === 'regen' ? 'Regenerating' : 'Recalling');
    if (ch) setVar(rb, '--p', Math.min(100, ch === 'recall' ? h.recall.t / 3.5 * 100 : h.regenCh.t / D.REGEN.time * 100).toFixed(0) + '%');
  }
  updateStatus(view, h);
  updateBuyPrompt(h);
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
      if (e.type === 'buy' && e.item === shopSt.prio) { shopSt.prio = null; bp.dismissed = ''; }
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

// ---------------------------------------------------------------------------
// Status bar: icons for passives and buffs that are active right now, with a tooltip.
// ---------------------------------------------------------------------------
const BUFF_INFO = {
  azure: ['Azure Wisp', '20% shorter cooldowns and much faster mana regeneration.'],
  ember: ['Ember Brute', 'Your attacks slow the target and burn it for extra true damage.'],
  lord: ['Lord\'s Blessing', 'Your whole team deals 15% more damage.'],
};
const itemWithPassive = id => D.ITEMS.find(it => it.passive && it.passive.id === id);
function statusInfo(h, key, n) {
  const [kind, id] = key.split(':');
  if (kind === 'p') {
    const p = h.def.passive;
    const count = id === 'thirdshot' ? `${n}/3` : id === 'hotbarrels' ? `×${n}` : '';
    const state = { ambush: 'Ready', riposte: 'Ready', thirdshot: n === 2 ? 'Next attack empowered' : '' }[id] || 'Active';
    return { icon: passiveIcon(h.def.id), name: p.name, tag: 'Hero passive', state, text: p.desc, count, cls: 'passive' };
  }
  if (kind === 'i') {
    const it = itemWithPassive(id === 'fury' ? 'fury' : id);
    const state = id === 'fortify' ? 'Recharging' : id === 'echo' ? 'Ready' : id === 'gale' && n === 2 ? 'Next attack chains' : 'Active';
    const count = id === 'gale' ? `${n}/3` : id === 'fury' ? `×${n}` : '';
    return { icon: itemIcon(it.id), name: it.passive.name, tag: it.name, state, text: it.passive.text, count, cls: id === 'fortify' ? 'item cooling' : 'item' };
  }
  if (kind === 'k') {
    const sk = h.def.skill[id];
    return { icon: skillIcon(h.def.id, id), name: sk.name, tag: 'Skill effect', state: 'Active', text: sk.desc, count: '', cls: 'buff' };
  }
  if (id === 'sprint' || id === 'cleanse') {
    const sp = D.SPELL[id];
    return { icon: spellIcon(id), name: sp.name, tag: 'Battle spell', state: 'Active', text: sp.desc, count: '', cls: 'buff' };
  }
  if (id === 'blessing') {
    const it = itemWithPassive('blessing');
    return { icon: itemIcon(it.id), name: 'Blessing', tag: 'From an ally\'s ' + it.name, state: 'Active', text: '+20% move speed for 2 seconds.', count: '', cls: 'buff' };
  }
  const [name, text] = BUFF_INFO[id] || [id, ''];
  return { icon: spellIcon(id), name, tag: 'Buff', state: 'Active', text, count: '', cls: 'buff' };
}
const stEls = new Map();
function updateStatus(view, h) {
  const bar = $('statusBar');
  const list = h && !h.dead ? (view.mirror ? h.status || [] : LF.sim.statuses(h)) : [];
  const seen = new Set();
  for (const [key, n, left] of list) {
    if (seen.has(key)) continue;
    seen.add(key);
    let el = stEls.get(key);
    const info = statusInfo(h, key, n);
    if (!el) {
      el = document.createElement('div');
      el.className = 'st'; el.tabIndex = 0;
      el.innerHTML = '<img alt=""><b class="st-n"></b><i class="st-t"></i><div class="st-tip"><small></small><strong></strong><em></em><span></span></div>';
      el.querySelector('img').src = info.icon;
      el.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') { const open = !el.classList.contains('open'); bar.querySelectorAll('.st.open').forEach(x => x.classList.remove('open')); el.classList.toggle('open', open); } });
      stEls.set(key, el);
    }
    const slot = bar.children[seen.size - 1];
    if (slot !== el) bar.insertBefore(el, slot || null);
    el.className = 'st ' + info.cls + (el.classList.contains('open') ? ' open' : '');
    set(el.querySelector('.st-n'), info.count);
    set(el.querySelector('.st-t'), left > 0 ? String(Math.ceil(left)) : '');
    set(el.querySelector('.st-tip small'), info.tag);
    set(el.querySelector('.st-tip strong'), info.name);
    set(el.querySelector('.st-tip em'), info.state + (left > 0 ? ` · ${Math.ceil(left)}s` : ''));
    set(el.querySelector('.st-tip span'), info.text);
  }
  for (const [key, el] of stEls) if (!seen.has(key) && el.parentNode) el.remove();
}
function resetStatus() { for (const el of stEls.values()) el.remove(); stEls.clear(); }

const WHY = { cooldown: 'Not ready yet', mana: 'Not enough mana', locked: 'Unlocks at level 4', dead: '', notarget: 'No enemy hero in range', rooted: 'Rooted', busy: '', full: 'Health is already full' };
function denyReason(key, why) {
  const v0 = LF.main.view(), me = v0 && v0.player;
  const msg = why === 'notarget' && key === 'sp' && me && me.spell === 'smite' ? 'No monster or minion in range' : WHY[why];
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
const shopSt = { cat: 'All', tier: 'all', sel: null, sig: '', busy: 0, prio: null };
// What the player is working toward: the prioritized item, else the next item of their build.
function goal(h) { return shopSt.prio || LF.sim.nextRecommended(h); }
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
  $('buyNext').addEventListener('click', () => { const h = shopHero(); const n = h && goal(h) && LF.sim.nextPurchase(h, goal(h)); if (n) order('buy', n.id); });
  $('editBuild').addEventListener('click', () => { const h = shopHero(); if (h) { click(); openBuild(h.def.id); } });
  $('shopClose').addEventListener('click', () => toggleShop(false));
  $('btnShop').addEventListener('click', () => toggleShop());
  $('shop').addEventListener('pointerdown', e => { if (e.target.id === 'shop') toggleShop(false); });
  $('nextItem').addEventListener('click', () => {
    const h = shopHero(), id = $('nextItem').dataset.id;
    if (h && id && !LF.sim.canBuy(h, id)) order('buy', id); else toggleShop(true);
  });
  initBuild();
  initBuyPrompt();
}
function order(op, id) {
  if (op === 'prio') { click(); shopSt.prio = shopSt.prio === id ? null : id; bp.dismissed = ''; renderShop(true); return; }
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
  const sig = [Math.floor(h.gold), h.items.join(), build.join(), shopSt.cat, shopSt.tier, shopSt.sel, shopSt.prio].join('|');
  if (!force && sig === shopSt.sig) return;
  shopSt.sig = sig;
  $('shopGold').textContent = Math.floor(h.gold);
  $('recLabel').textContent = custom ? 'Your build for ' : 'Recommended for ';
  $('recHero').textContent = h.def.name;
  $('recNote').textContent = custom ? 'Your own build. "Buy next" and the buy prompt follow it, piece by piece.' : h.def.buildNote;
  const left = h.items.slice();
  $('recItems').innerHTML = buildRowHtml(build, shopSt.sel, id => {
    const k = left.indexOf(id), owned = k >= 0;
    if (owned) left.splice(k, 1);
    return (owned ? ' owned' : '') + (id === next ? ' next' : '');
  });
  const bn = $('buyNext');
  const target = goal(h);
  const np = target && LF.sim.nextPurchase(h, target);
  if (np) {
    const it = D.ITEM[np.id], c = LF.sim.purchasePlan(h.items, np.id).cost;
    bn.disabled = false;
    bn.textContent = np.id === np.target ? `Buy ${it.name} · ${c}` : `Buy ${it.name} · ${c} (for ${D.ITEM[np.target].name})`;
  } else if (target) {
    bn.disabled = true;
    const why = LF.sim.canBuy(h, target);
    bn.textContent = why === 'gold' ? `Saving for ${D.ITEM[target].name}` : why === 'full' ? 'Slots full' : `Next: ${D.ITEM[target].name}`;
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
  const prio = shopSt.prio;
  $('shopDetail').innerHTML = itemInfoHtml(it, h.items, shopSt.sel) + `
    ${build.includes(it.id) ? `<p class="sd-rec">Part of ${custom ? 'your' : esc(h.def.name) + '\'s recommended'} build.</p>` : ''}
    <div class="sd-actions"><button class="btn primary" type="button" data-op="buy" data-item="${it.id}" ${why ? 'disabled' : ''}>${it.tier === 3 ? 'Buy' : 'Craft'} · ${plan.cost}</button>
    ${plan.used.length ? `<span class="sd-save">Your ${plan.used.map(u => esc(D.ITEM[u].name)).join(', ')} take ${plan.credit} off (full price ${it.cost})</span>` : ''}
    ${owned ? `<button class="btn" type="button" data-op="sell" data-item="${it.id}">Sell · ${Math.round(it.cost * LF.sim.SELL_RATE)}</button>` : ''}
    <button class="btn${prio === it.id ? ' prio' : ''}" type="button" data-op="prio" data-item="${it.id}" title="The buy prompt in the top-right corner leads you to this item, part by part, until you own it. One item at a time.">${prio === it.id ? '★ Prioritized · cancel' : '☆ Prioritize'}</button>
    ${short ? `<span class="sd-why">${esc(short)}</span>` : ''}</div>`;
  if (fresh) $('shopDetail').scrollTop = 0;
  $('shopBag').innerHTML = Array.from({ length: 6 }, (_, i) => {
    const id = h.items[i];
    return id ? `<button class="bag-slot" type="button" data-id="${id}" aria-pressed="${id === shopSt.sel}" title="${esc(D.ITEM[id].name)}"><img src="${itemIcon(id)}" alt="${esc(D.ITEM[id].name)}"></button>` : '<span class="bag-slot empty"></span>';
  }).join('');
}

// ---------------------------------------------------------------------------
// Buy prompt (top right): the next affordable piece toward your goal waits for a click to confirm.
// The goal is your build's next item, or the one item you prioritized (shown in a row below).
// ---------------------------------------------------------------------------
const bp = { card: '', prio: '', dismissed: '' };
function initBuyPrompt() {
  $('buyPrompt').addEventListener('click', e => {
    const b = e.target.closest('[data-bp]');
    if (!b) return;
    if (b.dataset.bp === 'buy') order('buy', b.dataset.item);
    else if (b.dataset.bp === 'later') { click(); bp.dismissed = b.dataset.item; }
    else if (b.dataset.bp === 'unprio') { click(); shopSt.prio = null; bp.dismissed = ''; renderShop(true); }
  });
}
function updateBuyPrompt(h) {
  let card = '', prioRow = '';
  if (h && !h.dead) {
    const target = goal(h);
    const np = target && LF.sim.nextPurchase(h, target);
    if (np && np.id !== bp.dismissed) {
      const it = D.ITEM[np.id], c = LF.sim.purchasePlan(h.items, np.id).cost;
      card = `<div class="bp-card${shopSt.prio ? ' prio' : ''}"><img src="${itemIcon(np.id)}" alt=""><div><small>${np.id === np.target ? 'Ready to buy' : 'For ' + esc(D.ITEM[np.target].name)}</small><strong>${esc(it.name)}</strong></div>
        <button class="btn primary small" type="button" data-bp="buy" data-item="${np.id}">Buy · ${c}</button><button class="bp-x" type="button" data-bp="later" data-item="${np.id}" aria-label="Not now">×</button></div>`;
    }
    if (!np) bp.dismissed = '';
    const prio = shopSt.prio;
    if (prio) {
      const it = D.ITEM[prio], why = LF.sim.canBuy(h, prio), c = LF.sim.purchasePlan(h.items, prio).cost;
      const note = why === 'full' ? 'slots full' : why === 'boots' ? 'you already have boots' : `${c} gold to finish`;
      prioRow = `<div class="bp-prio"><img src="${itemIcon(prio)}" alt=""><span>★ Priority: <b>${esc(it.name)}</b> · ${note}</span><button class="bp-x" type="button" data-bp="unprio" aria-label="Stop prioritizing">×</button></div>`;
    }
  }
  const el = $('buyPrompt');
  if (!el.firstChild) el.innerHTML = '<div id="bpCard"></div><div id="bpPrio"></div>';
  if (card !== bp.card) { bp.card = card; $('bpCard').innerHTML = card; }
  if (prioRow !== bp.prio) { bp.prio = prioRow; $('bpPrio').innerHTML = prioRow; }
}

// ---------------------------------------------------------------------------
// Build editor: browse every item and plan up to six for a hero. Saved per hero; the buy prompt and the
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
  const total = be.build.reduce((s, id) => s + D.ITEM[id].cost, 0);
  $('beHead').textContent = be.custom ? (be.build.length ? `Your build · ${total} gold` : 'Your build is empty') : `Recommended build · ${total} gold`;
  $('beNote').textContent = be.custom
    ? (be.build.length ? 'In matches, the buy prompt and "Buy next" suggest these in order, piece by piece. Saved in this browser.' : 'Add items from the list. An empty build falls back to the recommended one.')
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
    <p>${own ? 'The buy prompt follows your build in matches.' : esc(D.HERO[heroId].buildNote)}</p>
    <button class="btn small" type="button" data-edit-build="${heroId}">${own ? 'Edit build' : 'Customize build'} · all items</button>`;
}
function renderLobbyBuild() {
  const p = party, el = $('lobbyBuild');
  if (!p || $('lobby').hidden) return;
  const seat = p.mySeat(), s = seat >= 0 ? p.L.slots[seat] : null;
  const heroId = s && D.HEROES[s.h] ? D.HEROES[s.h].id : null;
  if (heroId) {
    const want = D.SPELL_INDEX[spells.get(heroId)];
    if (s.sp !== want && (p.sentSpell !== want || performance.now() - (p.sentSpellT || 0) > 3000)) { p.sentSpell = want; p.sentSpellT = performance.now(); p.pickSpell(want); }
  }
  const key = heroId + '|' + JSON.stringify(heroId && builds.get(heroId)) + '|' + (heroId && spells.get(heroId));
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.innerHTML = heroId ? spellBlockHtml(heroId) + buildBlockHtml(heroId) : '';
}

// ---------------------------------------------------------------------------
// Battle spells: picked per hero before the match, remembered in this browser.
// ---------------------------------------------------------------------------
const spells = {
  all() { try { return JSON.parse(localStorage.getItem('lf-spells') || '{}') || {}; } catch (e) { return {}; } },
  get(heroId) { const s = this.all()[heroId]; return D.SPELL[s] ? s : D.ROLE_SPELL[D.HERO[heroId].role]; },
  set(heroId, id) {
    const all = this.all(); all[heroId] = id;
    try { localStorage.setItem('lf-spells', JSON.stringify(all)); } catch (e) { /* ignore */ }
  },
};
let spellHero = null;
function initSpellPick() {
  $('spellList').addEventListener('click', e => {
    const b = e.target.closest('[data-spell]');
    if (!b) return;
    click();
    spells.set(spellHero, b.dataset.spell);
    renderSpellPick();
    if (!$('select').hidden) renderDetail(sel.hero);
    renderLobbyBuild();
    setTimeout(() => { $('spellPick').hidden = true; }, 160);
  });
  $('spellClose').addEventListener('click', () => { click(); $('spellPick').hidden = true; });
  $('spellPick').addEventListener('pointerdown', e => { if (e.target.id === 'spellPick') $('spellPick').hidden = true; });
}
function openSpell(heroId) {
  spellHero = heroId;
  $('spellPick').hidden = false;
  renderSpellPick();
}
function renderSpellPick() {
  const hd = D.HERO[spellHero], cur = spells.get(spellHero), rec = D.ROLE_SPELL[hd.role];
  $('spellTitle').textContent = `Battle spell for ${hd.name}`;
  $('spellList').innerHTML = D.SPELLS.map(s => `<button class="spell-card" type="button" data-spell="${s.id}" aria-pressed="${s.id === cur}">
    <img src="${spellIcon(s.id)}" alt=""><div><strong>${esc(s.name)}<em>${s.cd}s cooldown</em>${s.id === rec ? '<span class="rec-tag">Suggested</span>' : ''}</strong><p>${esc(s.desc)}</p></div></button>`).join('');
}
function spellBlockHtml(heroId) {
  const sp = D.SPELL[spells.get(heroId)];
  return `<div class="spell-block"><img src="${spellIcon(sp.id)}" alt=""><div><p class="eyebrow">Battle spell · <kbd>F</kbd></p><strong>${esc(sp.name)}</strong><small>${sp.cd}s cooldown</small></div>
    <button class="btn small" type="button" data-pick-spell="${heroId}">Change</button></div>`;
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
      const sm = document.createElement('small'); sm.textContent = `${D.ROLES[h.role].short} · ${h.def.name} · ${D.SPELL[h.spell] ? D.SPELL[h.spell].name : ''}${h.human ? '' : ' · bot'}`;
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
  denyReason, skillIcon, itemIcon, spellIcon, toggleShop, openBuild, closeBuild, builds, spells, get nick() { saveNick(); return nick; },
};
})(window.LF);
