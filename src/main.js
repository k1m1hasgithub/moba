// Lanefall: boot, main loop and mode switching (menu demo, vs AI, multiplayer host / client).
'use strict';
(function (LF) {
const D = LF.data;
const $ = id => document.getElementById(id);

let mode = 'menu';   // menu | ai | host | client | lobby
let G = null;        // live simulation (menu demo, vs AI, host)
let V = null;        // mirrored view (client)
let party = null, transport = null, lobbyUnsub = null;
let paused = false, acc = 0, pubAcc = 0, inpAcc = 0, endShown = false, endTimer = 0;
let last = performance.now(), frameN = 0;
let tour = { target: null, t: 0 };
let lastAI = null;

const view = () => (mode === 'client' ? V : G);
const inGame = () => mode === 'ai' || mode === 'host' || mode === 'client';

function boot() {
  if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
  LF.render.init($('view'), $('minimap'));
  LF.input.init($('view'));
  LF.ui.init();
  window.addEventListener('resize', () => { LF.render.resize(); rotateHint(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'ai' && !paused) pause(true); });
  startDemo();
  LF.ui.show('home');
  requestAnimationFrame(frame);
  window.lanefall = { get game() { return G; }, get view() { return view(); }, get mode() { return mode; }, get party() { return party; }, fast };
}

function rotateHint() {
  const touch = document.body.classList.contains('touch');
  $('rotate').hidden = !(touch && inGame() && innerHeight > innerWidth);
}

// ---------------------------------------------------------------------------
// Seats
// ---------------------------------------------------------------------------
function botSeats(fixed, diff) {
  const seats = [];
  for (let seat = 0; seat < 10; seat++) {
    if (fixed[seat]) { seats.push(Object.assign({ diff }, fixed[seat])); continue; }
    const team = seat < 5 ? 0 : 1;
    const used = seats.filter((s, i) => (i < 5 ? 0 : 1) === team).map(s => s.hero).concat(Object.entries(fixed).filter(([i]) => (+i < 5 ? 0 : 1) === team).map(([, s]) => s.hero));
    const opts = D.HEROES.filter(h => h.role === D.ROLES[seat % 5].id && !used.includes(h.id));
    const pool = opts.length ? opts : D.HEROES.filter(h => h.role === D.ROLES[seat % 5].id);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    seats.push({ hero: pick.id, diff, name: pick.name });
  }
  return seats;
}

function startDemo() {
  mode = 'menu';
  G = LF.sim.createGame({ seats: botSeats({}, 'normal') });
  for (let i = 0; i < 70 * 15; i++) LF.sim.update(1 / 15);
  G.events.length = 0;
  LF.render.reset();
  LF.render.cam.flip = false;
  tour = { target: null, t: 0 };
  LF.input.enable(false);
  $('hud').hidden = true;
}

function startAI(heroId, diff) {
  const def = D.HERO[heroId];
  const seat = D.ROLE_INDEX[def.role];
  lastAI = { heroId, diff };
  const seats = botSeats({ [seat]: { hero: heroId, human: true, local: true, name: LF.ui.nick } }, diff);
  G = LF.sim.createGame({ seats });
  mode = 'ai';
  enterGame(G);
}

function enterGame(v) {
  LF.render.reset();
  LF.render.cam.flip = !!(v.player && v.player.team === 1);
  LF.render.snap(v.player || { x: 1800, y: 1800 });
  LF.input.reset();
  LF.input.setView(v);
  LF.input.enable(true);
  LF.ui.show(null, false);
  $('hud').hidden = false;
  $('scoreboard').hidden = true;
  LF.render.resize();
  LF.ui.setupHud(v);
  endShown = false; endTimer = 0; paused = false; acc = 0;
  rotateHint();
  LF.audio.play('start', 0.7);
}

function toMenu() {
  if (party) { party.leave(); party = null; }
  startDemo();
  LF.ui.show('home');
  rotateHint();
}

// ---------------------------------------------------------------------------
// Multiplayer
// ---------------------------------------------------------------------------
async function openMP() {
  LF.ui.show('mp');
  LF.ui.mpStatus(transport || null);
  if (!transport) {
    $('netStatus').textContent = 'Connecting…';
    $('netStatus').classList.remove('ok', 'bad');
    transport = await LF.net.connect();
    LF.ui.mpStatus(transport);
    if (transport) {
      transport.lobby.presence({ v: 1, nm: LF.ui.nick });
      lobbyUnsub = transport.lobby.onPeers(() => { if (!$('mp').hidden) LF.ui.renderLobbyList(transport); });
    }
  }
  $('createLobby').disabled = !transport;
  $('createLobby').onclick = createLobby;
  $('joinForm').onsubmit = e => { e.preventDefault(); joinLobby($('joinCode').value); };
  LF.ui.renderLobbyList(transport);
}

function wireParty(p) {
  p.onChange = () => {
    if (mode === 'client' && p.L.ph === 'lobby') { mode = 'lobby'; LF.input.enable(false); $('hud').hidden = true; LF.ui.openLobby(p); return; }
    if (mode === 'lobby') LF.ui.renderLobby();
  };
  p.onStart = () => { if (!p.isHost) startClient(); };
  p.onGone = () => {
    const wasGame = mode === 'client';
    p.leave(); party = null;
    if (wasGame) { startDemo(); }
    mode = 'menu';
    openMP().then(() => { $('mpHint').textContent = 'The lobby closed: the host left or could not be reached.'; });
  };
}

async function createLobby() {
  if (!transport) return;
  $('createLobby').disabled = true;
  try {
    party = await LF.net.hostParty(transport, LF.ui.nick, $('lobbyName').value || LF.ui.nick + "'s lobby");
    wireParty(party);
    mode = 'lobby';
    LF.ui.openLobby(party);
  } catch (e) {
    $('mpHint').textContent = 'Could not create the lobby. Try again in a moment.';
  } finally { $('createLobby').disabled = false; }
}

async function joinLobby(code) {
  if (!transport) return;
  code = String(code || '').toLowerCase().trim();
  if (!LF.net.CODE_RE.test(code)) { $('mpHint').textContent = 'Lobby codes are 4 to 8 letters and numbers.'; return; }
  $('mpHint').textContent = 'Joining ' + code + '…';
  try {
    const p = await LF.net.joinParty(transport, code, LF.ui.nick);
    party = p;
    wireParty(p);
    const t0 = Date.now();
    while (!p.hostPresence() && Date.now() - t0 < 6000) await new Promise(r => setTimeout(r, 150));
    if (!p.hostPresence()) { p.leave(); party = null; $('mpHint').textContent = `No lobby with code ${code} answered. Check the code and try again.`; return; }
    p.hostSeenAt = Date.now();
    p.onPeers();
    mode = 'lobby';
    if (p.L.ph === 'game') startClient(); else LF.ui.openLobby(p);
  } catch (e) {
    $('mpHint').textContent = 'Could not join that lobby.';
  }
}

function leaveLobby() {
  if (party) { party.leave(); party = null; }
  mode = 'menu';
  openMP();
}

function hostStart() {
  if (!party || !party.isHost) return;
  const seats = party.start();
  G = LF.sim.createGame({ seats });
  party.onLeft = () => {};
  mode = 'host';
  pubAcc = 0;
  enterGame(G);
}

function startClient() {
  V = party.startMirror();
  mode = 'client';
  inpAcc = 0;
  enterGame(V);
}

// ---------------------------------------------------------------------------
// Pause, quit, end
// ---------------------------------------------------------------------------
function pause(on) {
  if (!inGame()) return;
  if (mode === 'ai') paused = on;
  $('quitLabel').textContent = mode === 'ai' ? 'Surrender' : 'Leave match';
  if (on) LF.ui.show('pause', false); else LF.ui.show(null, false);
  LF.input.enable(!on && !endShown);
}
function quit() {
  LF.input.enable(false);
  $('hud').hidden = true;
  toMenu();
}
function escape() {
  if (!$('scoreboard').hidden) { $('scoreboard').hidden = true; return; }
  if (inGame() && !endShown) { pause($('pause').hidden); return; }
  if (!$('home').hidden || inGame()) return;
  if (!$('lobby').hidden) return;
  LF.ui.back();
}

function checkEnd(v, dt) {
  if (!v.over || endShown) return;
  if (mode === 'host' && party && party.L.ph === 'game') { party.publish(G); party.endMatch(v.winner); }
  endTimer += dt;
  if (endTimer < 2.6) return;
  endShown = true;
  LF.input.enable(false);
  let actions;
  if (mode === 'ai') {
    actions = [
      { label: 'Play again', primary: true, fn: () => startAI(lastAI.heroId, lastAI.diff) },
      { label: 'Change hero', fn: () => { startDemo(); LF.ui.openSelect('ai'); } },
      { label: 'Main menu', fn: quit },
    ];
  } else if (mode === 'host') {
    actions = [
      { label: 'Back to lobby', primary: true, fn: () => { party.backToLobby(); mode = 'lobby'; $('hud').hidden = true; startDemoKeepParty(); LF.ui.openLobby(party); } },
      { label: 'Close lobby', fn: quit },
    ];
  } else {
    actions = [{ label: 'Leave', fn: quit }];
  }
  LF.ui.showEnd(v, actions);
  if (mode === 'client') $('endSub').textContent += ' The host can start another match from the lobby.';
}
function startDemoKeepParty() {
  const p = party;
  party = null;
  startDemo();
  party = p;
  mode = 'lobby';
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
function stepSim(dt) {
  acc += dt;
  const step = 1 / 30;
  let n = 0;
  while (acc >= step && n < 6) { LF.sim.update(step); acc -= step; n++; }
  if (n >= 6) acc = 0;
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frameN++;
  try {
    if (mode === 'menu' || mode === 'lobby') {
      if (!document.hidden && G) stepSim(dt);
    } else if (mode === 'ai') {
      if (!paused) { LF.input.applyLocal(G.player); stepSim(dt); }
    } else if (mode === 'host') {
      if (G.player) LF.input.applyLocal(G.player);
      party.applyInputs(G);
      stepSim(dt);
      pubAcc += dt;
      if (pubAcc >= 1 / 12) { pubAcc = 0; party.publish(G); }
    } else if (mode === 'client') {
      inpAcc += dt;
      if (inpAcc >= 1 / 20) { inpAcc = 0; party.sendInput(LF.input.toNet()); }
      LF.net.smooth(V, dt);
    }
    const v = view();
    if (v) {
      if (inGame()) {
        const p = v.player;
        const target = p ? (p.dead ? D.FOUNTAIN[p.team] : p) : v.heroes[0];
        LF.render.follow(target, dt);
      } else {
        tour.t -= dt;
        if (!tour.target || tour.target.dead || tour.t <= 0) {
          const alive = v.heroes.filter(h => !h.dead);
          tour.target = alive[Math.floor(Math.random() * alive.length)] || null;
          tour.t = 9;
        }
        if (tour.target) LF.render.follow(tour.target, dt * 0.35);
        if (v.over) startDemo();
      }
      LF.render.draw(v, dt, inGame() ? { aim: LF.input.aimState(), click: LF.input.click } : null);
      if (inGame()) {
        if (frameN % 2 === 0) LF.render.drawMinimap(v);
        LF.ui.updateHud(v);
        checkEnd(v, dt);
      }
    }
  } catch (err) {
    console.error(err);
  }
  requestAnimationFrame(frame);
}

// Debug: fast-forward the simulation.
function fast(sec) { for (let i = 0; i < sec * 30; i++) { if (G.over) break; LF.sim.update(1 / 30); } }

function onScreen(id) {
  if (id === 'mp' && transport) LF.ui.renderLobbyList(transport);
}

LF.main = {
  view, inGame, startAI, openMP, joinLobby, leaveLobby, hostStart, pause, quit, escape, onScreen,
};
window.addEventListener('DOMContentLoaded', boot);
})(window.LF);
