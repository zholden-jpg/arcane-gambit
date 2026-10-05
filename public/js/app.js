import { createGame, makeMove, outcome, matchMove, describeMove, PIECES } from '../shared/engine.js';
import { RULESETS, DUEL_ARENAS } from '../shared/rulesets.js';
import { CHAPTERS, PROLOGUE, STORY_TITLE } from '../shared/story.js';
import { chooseMove } from '../shared/ai.js';
import { BoardView, pieceHTML } from './board.js';
import { Net } from './net.js';
import {
  platform, initPlatform, storage, setPlaying, happytime, gameLoaded, breakAd,
  inviteLink, getInviteParam, updateRoom, leftRoom, isInstantMultiplayer, onJoinRoom,
} from './platform.js';

await initPlatform();
document.body.classList.toggle('on-crazygames', platform.isCrazyGames);
document.body.classList.toggle('no-online', !platform.onlineDuels);

const $ = (s) => document.querySelector(s);
const NAMES = { w: 'White', b: 'Black' };

// ------------------------------------------------------------ storage helpers
const store = storage; // CrazyGames cloud save when on CrazyGames, else localStorage
const session = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } },
};
let progress = store.get('ag-progress', { done: [], seenPrologue: false });
const saveProgress = () => store.set('ag-progress', progress);

// ------------------------------------------------------------ screens
let currentScreen = 'title';
function show(name) {
  currentScreen = name;
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
  if (name === 'story') renderStory();
  if (name === 'title') updatePlayButton();
  if (name === 'duel') net.wake();
  window.scrollTo(0, 0);
  syncPlaying();
}

/** Tell the platform whether the player is actively in a match (CrazyGames gameplay events). */
function syncPlaying() {
  setPlaying(currentScreen === 'game' && !!game && !game.over && !dlg && $('#modal').classList.contains('hidden'));
}

document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) show(go.dataset.go);
  if (e.target.closest('[data-open="bestiary"]')) openBestiary();
});

// ------------------------------------------------------------ dialogue
let dlg = null;
function playDialogue(lines, done) {
  if (!lines || !lines.length) return done && done();
  dlg = { lines, i: 0, done };
  $('#dialogue').classList.remove('hidden');
  stepDialogue();
  syncPlaying();
}
function stepDialogue() {
  if (!dlg) return;
  if (dlg.i >= dlg.lines.length) return endDialogue();
  const line = dlg.lines[dlg.i++];
  $('#dlg-who').textContent = line.who;
  $('#dlg-text').textContent = line.text;
  $('#dialogue').dataset.who = line.who === 'Narrator' ? 'narrator' : '';
  $('#dlg-next').textContent = dlg.i >= dlg.lines.length ? 'Begin ▸' : 'Continue ▸';
}
function endDialogue() {
  const d = dlg;
  dlg = null;
  $('#dialogue').classList.add('hidden');
  syncPlaying();
  d && d.done && d.done();
}
$('#dlg-next').addEventListener('click', stepDialogue);
$('#dlg-skip').addEventListener('click', endDialogue);
$('#dialogue').addEventListener('click', (e) => { if (e.target.id === 'dialogue') stepDialogue(); });
document.addEventListener('keydown', (e) => {
  if (dlg && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); stepDialogue(); }
  if (e.key === 'Escape' && !$('#modal').classList.contains('hidden') && $('#modal').dataset.dismissable) closeModal();
});

// ------------------------------------------------------------ modal
function showModal(title, body, actions, dismissable = false) {
  $('#modal-title').textContent = title;
  const b = $('#modal-body');
  if (typeof body === 'string') b.innerHTML = body; else { b.innerHTML = ''; b.append(body); }
  const a = $('#modal-actions');
  a.innerHTML = '';
  for (const act of actions) {
    const btn = document.createElement('button');
    btn.className = 'btn small ' + (act.primary ? 'primary' : '');
    btn.textContent = act.label;
    if (act.id) btn.id = act.id;
    btn.onclick = () => { if (!act.keepOpen) closeModal(); act.fn && act.fn(); };
    a.append(btn);
  }
  $('#modal').dataset.dismissable = dismissable ? '1' : '';
  $('#modal').classList.remove('hidden');
  syncPlaying();
}
function closeModal() { $('#modal').classList.add('hidden'); syncPlaying(); }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && $('#modal').dataset.dismissable) closeModal(); });

function openBestiary() {
  let html = '<div class="bestiary">';
  for (const [t, p] of Object.entries(PIECES)) {
    html += `<div class="beast"><div class="beast-pieces">${pieceHTML('w' + t)}${pieceHTML('b' + t)}</div><div><b>${p.name}</b><p>${p.desc}</p></div></div>`;
  }
  html += `<div class="beast"><div class="beast-pieces"><span class="mini chasm"></span></div><div><b>Chasm / Pillar</b><p>No piece may stop on or slide across it.</p></div></div>
    <div class="beast"><div class="beast-pieces"><span class="mini portal portal-0"></span></div><div><b>Portal</b><p>Land on it and step out of its twin (same colour), if the twin is empty.</p></div></div>
    <div class="beast"><div class="beast-pieces"><span class="mini fog"></span></div><div><b>Mist</b><p>You only see squares your pieces could move to.</p></div></div></div>`;
  showModal('Bestiary', html, [{ label: 'Close', primary: true }], true);
}

// ------------------------------------------------------------ story map
$('#story-title').textContent = STORY_TITLE;
function renderStory() {
  const list = $('#chapter-list');
  list.innerHTML = '';
  CHAPTERS.forEach((ch, idx) => {
    const done = progress.done.includes(ch.id);
    const unlocked = idx === 0 || progress.done.includes(CHAPTERS[idx - 1].id);
    const li = document.createElement('li');
    li.className = 'chapter ' + (done ? 'done' : unlocked ? 'open' : 'locked');
    li.innerHTML = `<div class="ch-num">${done ? '★' : unlocked ? idx + 1 : '🔒︎'}</div>
      <div class="ch-body"><h3></h3><p class="ch-opp"></p><p class="ch-twist"></p></div>`;
    li.querySelector('h3').textContent = ch.title;
    li.querySelector('.ch-opp').textContent = unlocked ? 'vs. ' + ch.opponent : 'Locked';
    li.querySelector('.ch-twist').textContent = unlocked ? RULESETS[ch.ruleset].twist : 'Complete the previous chapter to continue.';
    if (unlocked) {
      li.tabIndex = 0;
      li.onclick = () => startChapter(idx);
      li.onkeydown = (e) => { if (e.key === 'Enter') startChapter(idx); };
    }
    list.append(li);
  });
}
function nextChapterIndex() {
  const i = CHAPTERS.findIndex((ch) => !progress.done.includes(ch.id));
  return i;
}
function updatePlayButton() {
  const i = nextChapterIndex();
  $('#btn-play-story').innerHTML = i < 0 ? 'Story Complete <small>replay any chapter</small>'
    : progress.done.length ? `Continue Story <small>${escapeHTML(CHAPTERS[i].title)}</small>` : 'Play Story';
}
$('#btn-play-story').onclick = () => {
  const i = nextChapterIndex();
  if (i < 0) show('story'); else startChapter(i);
};
async function startChapter(idx) {
  const ch = CHAPTERS[idx];
  await breakAd();
  const go = () => playDialogue(ch.intro, () => startGame({ mode: 'story', chapter: ch }));
  if (idx === 0 && !progress.seenPrologue) {
    progress.seenPrologue = true; saveProgress();
    playDialogue(PROLOGUE, go);
  } else go();
}
$('#btn-prologue').onclick = () => playDialogue(PROLOGUE);
$('#btn-reset-progress').onclick = () => showModal('Reset progress?', '<p>All chapters except the first will be locked again.</p>', [
  { label: 'Cancel' },
  { label: 'Reset', primary: true, fn: () => { progress = { done: [], seenPrologue: false }; saveProgress(); renderStory(); } },
], true);

// ------------------------------------------------------------ arena selects
for (const sel of document.querySelectorAll('.arena-select')) {
  for (const id of DUEL_ARENAS) sel.add(new Option(RULESETS[id].name, id));
  const twist = sel.id === 'local-arena' ? $('#local-twist') : $('#duel-twist');
  const upd = () => { twist.textContent = RULESETS[sel.value].twist; };
  sel.onchange = upd; upd();
}
$('#btn-local-start').onclick = async () => { await breakAd(); startGame({ mode: 'local', arena: $('#local-arena').value }); };

// ------------------------------------------------------------ AI worker
let worker = null;
try {
  worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
  worker.onerror = () => { worker = null; };
} catch { worker = null; }
let aiRequest = 0;
function askAI(state, opts) {
  const id = ++aiRequest;
  return new Promise((resolve) => {
    const started = Date.now();
    const finish = (move) => setTimeout(() => resolve({ id, move }), Math.max(0, 450 - (Date.now() - started)));
    if (worker) {
      const handler = (e) => { if (e.data.id === id) { worker.removeEventListener('message', handler); finish(e.data.move); } };
      worker.addEventListener('message', handler);
      worker.postMessage({ id, state, opts });
    } else {
      setTimeout(() => finish(chooseMove(state, opts)), 30);
    }
  });
}

// ------------------------------------------------------------ the game
const board = new BoardView($('#board'));
let game = null;

function startGame(cfg) {
  closeModal();
  const arena = cfg.mode === 'story' ? cfg.chapter.ruleset : cfg.arena;
  const def = RULESETS[arena];
  game = {
    ...cfg,
    arena,
    def,
    state: createGame(def),
    history: [],
    log: [],
    over: null,
    thinking: false,
    pending: false,
    handoff: false,
    token: Math.random(),
  };
  board.clearSelection();
  $('#game-title').textContent = cfg.mode === 'story' ? cfg.chapter.title : def.name;
  $('#game-sub').textContent = cfg.mode === 'story' ? 'vs. ' + cfg.chapter.opponent
    : cfg.mode === 'local' ? 'Local duel — pass the device between moves' : 'Online duel';
  $('#game-twist').textContent = def.twist;
  $('#online-box').classList.toggle('hidden', cfg.mode !== 'online');
  $('#btn-undo').classList.toggle('hidden', cfg.mode === 'online');
  $('#btn-restart').classList.toggle('hidden', cfg.mode === 'online');
  $('#btn-resign').classList.toggle('hidden', cfg.mode !== 'online');
  if (cfg.mode === 'online') {
    $('#room-code').textContent = cfg.code;
    $('#chat-log').innerHTML = '';
  }
  show('game');
  renderGame();
}

function viewer() {
  if (!game) return 'w';
  if (game.mode === 'online') return game.myColor;
  if (game.mode === 'local') return game.state.rules.fog ? game.state.turn : 'w';
  return 'w';
}

function renderGame() {
  if (!game) return;
  const st = game.state;
  const me = viewer();
  const fog = st.rules.fog && !game.over;
  const interactive = game.over || game.handoff ? null
    : game.mode === 'story' ? (st.turn === 'w' && !game.thinking ? 'w' : null)
    : game.mode === 'local' ? st.turn
    : (st.turn === game.myColor && !game.pending && game.ready ? game.myColor : null);
  board.render({
    state: st,
    orientation: me,
    fogFor: fog ? me : null,
    interactive,
    hideLast: fog && st.last && st.last.piece[0] !== me,
    onMove: onHumanMove,
  });
  $('#board').classList.toggle('veiled', !!game.handoff);

  // Player bars
  const names = playerNames();
  const top = me === 'w' ? 'b' : 'w';
  $('#bar-top').innerHTML = barHTML(top, names[top]);
  $('#bar-bottom').innerHTML = barHTML(me, names[me]);

  // Status
  let status;
  if (game.over) {
    status = game.over.winner ? `${names[game.over.winner]} wins — ${game.over.reason}.` : `Draw — ${game.over.reason}.`;
  } else if (game.mode === 'online' && !game.ready) {
    status = 'Waiting for your opponent to join…';
  } else if (game.thinking) {
    status = `${names[st.turn]} is thinking…`;
  } else {
    status = `${names[st.turn]} to move`;
    if (game.mode === 'online') status = st.turn === game.myColor ? 'Your move' : `Waiting for ${names[st.turn]}…`;
    const checkEl = document.querySelector('.sq.check');
    if (checkEl) status += ' — Check!';
    if (st.rules.turnLimit) status += ` · Move ${Math.floor(st.ply / 2) + 1} of ${st.rules.turnLimit}`;
  }
  $('#status').textContent = status;
  $('#status').className = 'status' + (game.over ? ' over' : '');

  // Move list
  const ml = $('#move-list');
  ml.innerHTML = '';
  for (let i = 0; i < game.log.length; i += 2) {
    const li = document.createElement('li');
    li.innerHTML = '<span></span><span></span>';
    li.children[0].textContent = game.log[i];
    li.children[1].textContent = game.log[i + 1] || '';
    ml.append(li);
  }
  ml.scrollTop = ml.scrollHeight;
  $('#btn-undo').disabled = !game.history.length || game.thinking;
  syncPlaying();
}

function playerNames() {
  if (game.mode === 'story') return { w: 'Wren', b: game.chapter.opponent.split(',')[0] };
  if (game.mode === 'online') return { w: game.names?.w || 'White', b: game.names?.b || 'Black' };
  return { w: 'White', b: 'Black' };
}

function barHTML(color, name) {
  const st = game.state;
  const active = !game.over && st.turn === color;
  const you = game.mode === 'online' && color === game.myColor ? ' <em>(you)</em>' : '';
  return `<span class="dot ${color}"></span><span class="pname${active ? ' active' : ''}">${escapeHTML(name)}${you}</span><span class="pcolor">${NAMES[color]}</span>`;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function applyMove(move) {
  const before = game.state;
  const after = makeMove(before, move);
  const color = before.turn;
  let text = describeMove(before, move, after);
  if (before.rules.fog) {
    const me = game.mode === 'local' ? null : viewer();
    if (color !== me) text = '· · ·';
  }
  game.history.push({ state: before, log: game.log.length });
  game.log.push(text);
  game.state = after;
  if (game.mode !== 'online') {
    const o = outcome(after);
    if (o) { game.over = o; renderGame(); return finish(); }
  }
  renderGame();
}

function onHumanMove(move) {
  if (!game || game.over) return;
  if (game.mode === 'online') {
    game.pending = true;
    net.send({ type: 'move', from: move.from, to: move.to });
    renderGame();
    return;
  }
  applyMove(move);
  if (game.over) return;
  if (game.mode === 'story') aiTurn();
  else if (game.mode === 'local' && game.state.rules.fog) {
    game.handoff = true;
    renderGame();
    showModal(`Pass to ${NAMES[game.state.turn]}`, '<p>The mist hides each army from the other. Hand over the device, then reveal.</p>', [
      { label: `I'm ${NAMES[game.state.turn]} — reveal`, primary: true, fn: () => { game.handoff = false; renderGame(); } },
    ]);
  }
}

async function aiTurn() {
  const token = game.token;
  const snapshotLen = game.history.length;
  game.thinking = true;
  renderGame();
  const { move } = await askAI(game.state, game.chapter.ai);
  if (!game || game.token !== token || game.history.length !== snapshotLen) return; // restarted / undone meanwhile
  game.thinking = false;
  if (move) applyMove(move);
  else renderGame();
}

function finish() {
  const o = game.over;
  const names = playerNames();
  setTimeout(() => {
    if (!game || game.over !== o) return;
    if (game.mode === 'story') {
      const ch = game.chapter;
      if (o.winner === 'w') {
        if (!progress.done.includes(ch.id)) { progress.done.push(ch.id); saveProgress(); }
        happytime();
        showModal('Victory!', `<p>${escapeHTML(o.reason)}.</p>`, [
          { label: 'Continue', primary: true, fn: () => playDialogue(ch.outro, () => show('story')) },
        ]);
      } else {
        showModal(o.winner ? 'Defeat' : 'A Draw', `<p>${escapeHTML(o.reason)}.</p><p class="hint">${escapeHTML(ch.opponent)} awaits a rematch.</p>`, [
          { label: 'Story map', fn: () => show('story') },
          { label: 'Undo last move', fn: () => undo() },
          { label: 'Try again', primary: true, fn: async () => { await breakAd(); startGame({ mode: 'story', chapter: ch }); } },
        ]);
      }
    } else if (game.mode === 'local') {
      showModal(o.winner ? `${NAMES[o.winner]} wins!` : 'Draw', `<p>${escapeHTML(o.reason)}.</p>`, [
        { label: 'Menu', fn: () => show('title') },
        { label: 'Play again', primary: true, fn: async () => { const arena = game.arena; await breakAd(); startGame({ mode: 'local', arena }); } },
      ]);
    } else {
      const title = !o.winner ? 'Draw' : o.winner === game.myColor ? 'Victory!' : 'Defeat';
      if (o.winner === game.myColor) happytime();
      showModal(title, `<p>${escapeHTML(o.winner ? names[o.winner] + ' wins' : 'Nobody wins')} — ${escapeHTML(o.reason)}.</p><p id="rematch-note" class="hint"></p>`, [
        { label: 'Leave', fn: leaveOnline },
        { label: 'Rematch', primary: true, keepOpen: true, id: 'btn-rematch', fn: async () => {
          await breakAd();
          net.send({ type: 'rematch' });
          const n = $('#rematch-note'); if (n) n.textContent = 'Rematch requested — waiting for your opponent…';
        } },
        { label: 'View board', fn: () => {} },
      ]);
    }
  }, 600);
}

function undo() {
  if (!game || game.thinking || !game.history.length || game.mode === 'online') return;
  let entry = game.history.pop();
  if (game.mode === 'story') {
    // Rewind to the last position where it was the player's turn.
    while (entry.state.turn !== 'w' && game.history.length) entry = game.history.pop();
  }
  game.state = entry.state;
  game.log.length = entry.log;
  game.over = null;
  game.handoff = false;
  game.token = Math.random();
  board.clearSelection();
  closeModal();
  renderGame();
}

$('#btn-undo').onclick = undo;
$('#btn-restart').onclick = async () => {
  if (!game) return;
  const cfg = { mode: game.mode, chapter: game.chapter, arena: game.arena };
  game.token = Math.random(); // cancel any pending AI move
  await breakAd();
  startGame(cfg);
};
$('#btn-resign').onclick = () => {
  if (!game || game.over) return;
  showModal('Resign?', '<p>Your opponent will be declared the winner.</p>', [
    { label: 'Keep playing' },
    { label: 'Resign', primary: true, fn: () => net.send({ type: 'resign' }) },
  ], true);
};
$('#btn-leave').onclick = () => {
  if (!game) return show('title');
  if (game.mode === 'online') return leaveOnline();
  const to = game.mode === 'story' ? 'story' : 'title';
  game.token = Math.random();
  game = null;
  show(to);
};

// ------------------------------------------------------------ online
const net = new Net();
let reconnecting = false;

const nameInput = $('#duel-name');
nameInput.value = store.get('ag-name', '');
nameInput.oninput = () => store.set('ag-name', nameInput.value);
async function duelLink(code) {
  return (await inviteLink({ duel: code })) || `${location.origin}${location.pathname}?duel=${code}`;
}
if (!platform.supportsInviteLinks) document.body.classList.add('no-invite-links');
const myName = () => (platform.isCrazyGames ? (platform.user && platform.user.username) || 'Guest' : nameInput.value);
if (platform.isCrazyGames) $('#cg-name').textContent = myName();

function duelNote(msg) {
  $('#duel-note').textContent = msg || '';
}

function duelError(msg) {
  $('#duel-error').textContent = msg || '';
}

$('#btn-create').onclick = () => {
  duelError('');
  duelNote('Connecting to the duel arena…');
  net.send({ type: 'create', arena: $('#duel-arena').value, color: $('#duel-color').value, name: myName() });
};
$('#btn-join').onclick = () => {
  const code = $('#duel-code').value.trim().toUpperCase();
  if (code.length < 4) return duelError('Enter the 5-letter duel code.');
  duelError('');
  duelNote('Connecting to the duel arena…');
  net.send({ type: 'join', code, name: myName(), token: session.get('ag-token-' + code) });
};
$('#duel-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-join').click(); });

async function copyText(text, btn) {
  try { await navigator.clipboard.writeText(text); } catch {
    const i = $('#share-link'); i.select(); document.execCommand && document.execCommand('copy');
  }
  if (btn) { const old = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = old; }, 1200); }
}
$('#btn-copy').onclick = (e) => copyText($('#share-link').value, e.target);
$('#btn-copy2').onclick = async (e) => { if (game) copyText(await duelLink(game.code), e.target); };

net.on('created', (msg) => {
  session.set('ag-token-' + msg.code, msg.token);
  if (platform.target === 'browser') history.replaceState(null, '', '?duel=' + msg.code);
  updateRoom(msg.code, true);
  duelNote('');
  $('#duel-waiting').classList.remove('hidden');
  duelLink(msg.code).then((link) => { $('#share-link').value = link; });
  $('#share-code').textContent = msg.code;
  // Enter the game screen right away so the host sees the board while waiting.
  startOnline({ code: msg.code, arena: msg.arena, color: msg.color, names: { [msg.color]: myName() || 'Host' }, moves: [], ready: false });
});

net.on('joined', (msg) => {
  session.set('ag-token-' + msg.code, msg.token);
  if (platform.target === 'browser') history.replaceState(null, '', '?duel=' + msg.code);
  duelNote('');
});

net.on('start', (msg) => {
  duelNote('');
  updateRoom(msg.code, !(msg.names.w && msg.names.b));
  startOnline({ code: msg.code, arena: msg.arena, color: msg.color, names: msg.names, moves: msg.moves, ready: !!(msg.names.w && msg.names.b), result: msg.result });
});

function startOnline({ code, arena, color, names, moves, ready, result }) {
  const keepChat = game && game.mode === 'online' && game.code === code ? $('#chat-log').innerHTML : '';
  startGame({ mode: 'online', arena, code, myColor: color, names, ready });
  if (keepChat) $('#chat-log').innerHTML = keepChat;
  for (const mv of moves) {
    const m = matchMove(game.state, mv);
    if (m) applyMove(m);
  }
  if (result) { game.over = result; }
  setOppStatus(ready ? true : null);
  renderGame();
}

net.on('move', (msg) => {
  if (!game || game.mode !== 'online') return;
  const m = matchMove(game.state, msg);
  game.pending = false;
  if (m) applyMove(m);
  else net.send({ type: 'join', code: game.code, token: session.get('ag-token-' + game.code) }); // resync
});

net.on('gameover', (msg) => {
  if (!game || game.mode !== 'online') return;
  game.over = msg.result;
  renderGame();
  finish();
});

net.on('rematch-requested', () => {
  const n = $('#rematch-note');
  if (n) n.textContent = 'Your opponent wants a rematch!';
  addChat('system', null, 'Your opponent wants a rematch.');
});

net.on('opponent-status', (msg) => setOppStatus(msg.connected));

net.on('chat', (msg) => addChat(msg.from, msg.name, msg.text));

net.on('error', (msg) => {
  if (game && game.mode === 'online') {
    game.pending = false;
    addChat('system', null, msg.message);
    if (msg.resync) net.emit('start', msg.resync);
    renderGame();
  } else { duelNote(''); duelError(msg.message); }
});

net.on('waking', () => {
  const text = 'Waking up the duel arena… the free server naps when nobody is playing, so this can take up to a minute.';
  if (game && game.mode === 'online') setOppStatus(null, text);
  else duelNote(text);
});

net.on('neterror', () => {
  duelNote('');
  if (!game || game.mode !== 'online') duelError('Could not reach the duel arena. Please try again in a minute.');
  else setOppStatus(null, 'Could not reach the duel arena. Please try again in a minute.');
});

net.on('close', () => {
  if (!game || game.mode !== 'online') return;
  setOppStatus(null, 'Connection lost — reconnecting…');
  reconnecting = true;
  setTimeout(() => net.connect(), 1500);
});

net.on('open', () => {
  if (reconnecting && game && game.mode === 'online') {
    reconnecting = false;
    net.send({ type: 'join', code: game.code, token: session.get('ag-token-' + game.code) });
  }
});

function setOppStatus(connected, text) {
  const el = $('#opp-status');
  if (text) { el.textContent = text; el.className = 'opp-status warn'; return; }
  if (connected === null) { el.textContent = 'Waiting for a challenger — share the link above.'; el.className = 'opp-status'; return; }
  el.textContent = connected ? 'Opponent connected' : 'Opponent disconnected — their seat is held for 2 minutes.';
  el.className = 'opp-status ' + (connected ? 'ok' : 'warn');
  if (connected && game && !game.ready) { game.ready = true; renderGame(); }
}

function addChat(from, name, text) {
  const log = $('#chat-log');
  const p = document.createElement('p');
  p.className = 'chat ' + from;
  if (name) { const b = document.createElement('b'); b.textContent = name + ': '; p.append(b); }
  p.append(document.createTextNode(text));
  log.append(p);
  log.scrollTop = log.scrollHeight;
}

document.querySelectorAll('.quick-chat button').forEach((b) => {
  b.onclick = () => net.send({ type: 'chat', text: b.textContent });
});
$('#chat-form').onsubmit = (e) => {
  e.preventDefault();
  const i = $('#chat-input');
  if (i.value.trim()) net.send({ type: 'chat', text: i.value });
  i.value = '';
};

function leaveOnline() {
  if (game && game.code) leftRoom();
  net.close();
  reconnecting = false;
  game = null;
  if (platform.target === 'browser') history.replaceState(null, '', location.pathname);
  $('#duel-waiting').classList.add('hidden');
  closeModal();
  show('title');
}

// ------------------------------------------------------------ boot
function joinFromInvite(code) {
  code = String(code).toUpperCase();
  if (game && game.mode === 'online') { if (game.code === code) return; leaveOnline(); }
  show('duel');
  $('#duel-code').value = code;
  const token = session.get('ag-token-' + code);
  if (token || platform.target !== 'browser') {
    duelNote('Connecting to the duel arena…');
    net.send({ type: 'join', code, name: myName(), token });
  } else nameInput.focus();
}

// Someone clicked an invite link / "join" while the game is already open (CrazyGames).
onJoinRoom((params) => { if (params && params.duel) joinFromInvite(params.duel); });

const params = new URLSearchParams(location.search);
const duelCode = platform.onlineDuels ? getInviteParam('duel') || params.get('duel') : null;
if (duelCode) {
  joinFromInvite(duelCode);
} else if (platform.onlineDuels && isInstantMultiplayer()) {
  // Launched from CrazyGames' "play with friends" button: open a duel right away.
  show('duel');
  $('#btn-create').click();
} else {
  show('title');
}
gameLoaded();
