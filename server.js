#!/usr/bin/env node
// Lanefall server: serves the game and relays multiplayer presence over WebSockets.
// No dependencies. Usage: node server.js [port]   (default 8080)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const ROOT = __dirname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.md': 'text/plain; charset=utf-8' };
const MAX_PRESENCE = 8192;

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT) || p.includes('..')) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
});

// ---------------------------------------------------------------------------
// Minimal WebSocket (RFC 6455) for text frames
// ---------------------------------------------------------------------------
const rooms = new Map(); // name -> Map(id -> presence)
const clients = new Map(); // id -> client
let nextId = 1;

server.on('upgrade', (req, socket) => {
  if (!req.url.startsWith('/ws') || req.headers.upgrade?.toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const key = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`, '', ''].join('\r\n'));
  const id = 'c' + (nextId++).toString(36) + crypto.randomBytes(3).toString('hex');
  const client = { id, socket, rooms: new Set(), buf: Buffer.alloc(0) };
  clients.set(id, client);
  send(client, { t: 'welcome', id });
  socket.on('data', chunk => {
    client.buf = Buffer.concat([client.buf, chunk]);
    if (client.buf.length > 1 << 20) { socket.destroy(); return; }
    let frame;
    while ((frame = readFrame(client))) {
      if (frame.op === 8) { socket.end(); return; }
      if (frame.op === 9) { writeFrame(socket, frame.data, 10); continue; }
      if (frame.op !== 1) continue;
      let msg;
      try { msg = JSON.parse(frame.data.toString('utf8')); } catch (e) { continue; }
      handle(client, msg);
    }
  });
  const bye = () => { if (!clients.has(id)) return; clients.delete(id); for (const r of client.rooms) leave(client, r); };
  socket.on('close', bye);
  socket.on('error', bye);
});

function readFrame(c) {
  const b = c.buf;
  if (b.length < 2) return null;
  const op = b[0] & 0x0f, masked = b[1] & 0x80;
  let len = b[1] & 0x7f, off = 2;
  if (len === 126) { if (b.length < 4) return null; len = b.readUInt16BE(2); off = 4; }
  else if (len === 127) { if (b.length < 10) return null; len = Number(b.readBigUInt64BE(2)); off = 10; }
  const maskLen = masked ? 4 : 0;
  if (b.length < off + maskLen + len) return null;
  const mask = masked ? b.subarray(off, off + 4) : null;
  const data = Buffer.from(b.subarray(off + maskLen, off + maskLen + len));
  if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
  c.buf = b.subarray(off + maskLen + len);
  return { op, data };
}
function writeFrame(socket, data, op = 1) {
  const len = data.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | op, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  if (!socket.destroyed) socket.write(Buffer.concat([head, data]));
}
function send(c, obj) { writeFrame(c.socket, Buffer.from(JSON.stringify(obj))); }

// ---------------------------------------------------------------------------
// Rooms and presence
// ---------------------------------------------------------------------------
const ROOM_RE = /^[a-z0-9][a-z0-9_.-]{0,47}$/;
function handle(c, m) {
  if (!m || typeof m.room !== 'string' || !ROOM_RE.test(m.room)) return;
  if (m.t === 'join') {
    if (c.rooms.size >= 16) return;
    let r = rooms.get(m.room);
    if (!r) { r = new Map(); rooms.set(m.room, r); }
    r.set(c.id, {});
    c.rooms.add(m.room);
    send(c, { t: 'peers', room: m.room, peers: [...r].map(([peer, presence]) => ({ peer, presence })) });
    broadcast(m.room, { t: 'p', room: m.room, peer: c.id, presence: {} }, c.id);
  } else if (m.t === 'p') {
    const r = rooms.get(m.room);
    if (!r || !r.has(c.id) || typeof m.presence !== 'object' || m.presence === null) return;
    if (JSON.stringify(m.presence).length > MAX_PRESENCE) return;
    r.set(c.id, m.presence);
    broadcast(m.room, { t: 'p', room: m.room, peer: c.id, presence: m.presence }, c.id);
  } else if (m.t === 'leave') {
    leave(c, m.room);
  }
}
function leave(c, name) {
  const r = rooms.get(name);
  c.rooms.delete(name);
  if (!r) return;
  r.delete(c.id);
  if (!r.size) rooms.delete(name);
  else broadcast(name, { t: 'left', room: name, peer: c.id });
}
function broadcast(name, obj, except) {
  const r = rooms.get(name);
  if (!r) return;
  const data = Buffer.from(JSON.stringify(obj));
  for (const id of r.keys()) {
    if (id === except) continue;
    const c = clients.get(id);
    if (c) writeFrame(c.socket, data);
  }
}

server.listen(PORT, () => console.log(`Lanefall running at http://localhost:${PORT}`));
