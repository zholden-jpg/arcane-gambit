// Arcane Gambit server: serves the game and hosts online duels over WebSockets.
//   npm install && npm start   →   http://localhost:3000
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createGame, matchMove, makeMove, outcome, opposite } from './shared/engine.js';
import { RULESETS, DUEL_ARENAS } from './shared/rulesets.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const SEAT_HOLD_MS = 2 * 60 * 1000; // keep a disconnected player's seat this long

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.json': 'application/json',
};

// ---------------------------------------------------------------- static files
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    return res.end('ok');
  }
  if (rel === '/') rel = '/index.html';
  let base = path.join(ROOT, 'public');
  if (rel.startsWith('/shared/')) { base = path.join(ROOT, 'shared'); rel = rel.slice('/shared'.length); }
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------------------------------------------------------------- rooms
/** code -> { code, arena, state, moves[], seats: {w,b}, rematch:Set, over } */
const rooms = new Map();

function newCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code;
  do code = Array.from({ length: 5 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
  while (rooms.has(code));
  return code;
}

const send = (ws, msg) => ws && ws.readyState === 1 && ws.send(JSON.stringify(msg));
function broadcast(room, msg) { for (const c of ['w', 'b']) send(room.seats[c]?.ws, msg); }

function seatInfo(room) {
  return { w: room.seats.w?.name || null, b: room.seats.b?.name || null };
}

function startPayload(room, color) {
  return { type: 'start', code: room.code, arena: room.arena, color, names: seatInfo(room), moves: room.moves, result: room.over };
}

function cleanName(n, fallback) {
  return (String(n || '').replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 20)) || fallback;
}

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  let room = null, color = null;

  const leave = () => {
    if (!room || !room.seats[color] || room.seats[color].ws !== ws) return;
    const seat = room.seats[color];
    seat.ws = null;
    broadcast(room, { type: 'opponent-status', connected: false });
    const r = room, c = color;
    seat.timer = setTimeout(() => {
      if (r.seats[c] && !r.seats[c].ws) {
        if (!r.over && r.moves.length > 0 && r.seats[opposite(c)]) {
          r.over = { winner: opposite(c), reason: 'Opponent abandoned the duel' };
          broadcast(r, { type: 'gameover', result: r.over });
        }
        delete r.seats[c];
        if (!r.seats.w && !r.seats.b) rooms.delete(r.code);
      }
    }, SEAT_HOLD_MS);
  };

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'ping') return; // client heartbeat (keeps free hosting awake mid-duel)

    if (msg.type === 'create') {
      if (!DUEL_ARENAS.includes(msg.arena)) return send(ws, { type: 'error', message: 'Unknown arena' });
      const code = newCode();
      room = { code, arena: msg.arena, state: createGame(RULESETS[msg.arena]), moves: [], seats: {}, rematch: new Set(), over: null };
      rooms.set(code, room);
      color = msg.color === 'b' ? 'b' : msg.color === 'w' ? 'w' : (Math.random() < 0.5 ? 'w' : 'b');
      const token = crypto.randomUUID();
      room.seats[color] = { ws, token, name: cleanName(msg.name, 'Host') };
      send(ws, { type: 'created', code, color, token, arena: room.arena });
      return;
    }

    if (msg.type === 'join') {
      const r = rooms.get(String(msg.code || '').toUpperCase());
      if (!r) return send(ws, { type: 'error', message: 'No duel found with that code.' });
      // Rejoin an existing seat?
      for (const c of ['w', 'b']) {
        const s = r.seats[c];
        if (s && msg.token && s.token === msg.token) {
          clearTimeout(s.timer);
          if (s.ws && s.ws !== ws) s.ws.close();
          s.ws = ws; room = r; color = c;
          send(ws, { type: 'joined', code: r.code, color: c, token: s.token });
          send(ws, startPayload(r, c));
          send(ws, { type: 'opponent-status', connected: !!r.seats[opposite(c)]?.ws });
          send(r.seats[opposite(c)]?.ws, { type: 'opponent-status', connected: true });
          return;
        }
      }
      const free = ['w', 'b'].find((c) => !r.seats[c]);
      if (!free) return send(ws, { type: 'error', message: 'That duel is already full.' });
      const token = crypto.randomUUID();
      r.seats[free] = { ws, token, name: cleanName(msg.name, 'Challenger') };
      room = r; color = free;
      send(ws, { type: 'joined', code: r.code, color: free, token });
      for (const c of ['w', 'b']) send(r.seats[c]?.ws, startPayload(r, c));
      return;
    }

    if (!room) return;

    if (msg.type === 'move') {
      if (room.over) return;
      if (!room.seats.w || !room.seats.b) return send(ws, { type: 'error', message: 'Waiting for an opponent to join.' });
      if (room.state.turn !== color) return send(ws, { type: 'error', message: 'Not your turn.' });
      const m = matchMove(room.state, { from: msg.from, to: msg.to });
      if (!m) return send(ws, { type: 'error', message: 'Illegal move.', resync: startPayload(room, color) });
      room.state = makeMove(room.state, m);
      room.moves.push({ from: m.from, to: m.to });
      broadcast(room, { type: 'move', from: m.from, to: m.to, by: color });
      const o = outcome(room.state);
      if (o) { room.over = o; broadcast(room, { type: 'gameover', result: o }); }
      return;
    }

    if (msg.type === 'resign') {
      if (room.over) return;
      room.over = { winner: opposite(color), reason: `${color === 'w' ? 'White' : 'Black'} resigned` };
      broadcast(room, { type: 'gameover', result: room.over });
      return;
    }

    if (msg.type === 'rematch') {
      if (!room.over) return;
      room.rematch.add(color);
      if (room.rematch.size < 2) {
        send(room.seats[opposite(color)]?.ws, { type: 'rematch-requested' });
        return;
      }
      // Swap colors and restart.
      const { w, b } = room.seats;
      room.seats = { w: b, b: w };
      room.state = createGame(RULESETS[room.arena]);
      room.moves = [];
      room.over = null;
      room.rematch.clear();
      for (const c of ['w', 'b']) {
        const s = room.seats[c];
        if (!s) continue;
        if (s.ws) s.ws.emit('recolor', c);
        send(s.ws, startPayload(room, c));
      }
      return;
    }

    if (msg.type === 'chat') {
      const text = String(msg.text || '').slice(0, 200).trim();
      if (text) broadcast(room, { type: 'chat', from: color, name: room.seats[color].name, text });
    }
  });

  ws.on('recolor', (c) => { color = c; });
  ws.on('close', leave);
});

// Drop dead connections.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

server.listen(PORT, () => {
  console.log(`\n  Arcane Gambit is running:  http://localhost:${PORT}\n`);
  console.log('  Share your duel link with a friend on the same network using your');
  console.log('  computer\'s local IP (e.g. http://192.168.1.20:' + PORT + '), or deploy it — see README.\n');
});
