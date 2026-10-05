import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, legalMoves, makeMove, outcome, parseSquare, inCheck } from '../shared/engine.js';
import { RULESETS } from '../shared/rulesets.js';
import { CHAPTERS } from '../shared/story.js';
import { chooseMove } from '../shared/ai.js';

function perft(st, d) {
  if (d === 0) return 1;
  let n = 0;
  for (const m of legalMoves(st)) n += perft(makeMove(st, m), d - 1);
  return n;
}
const sq = (st, s) => parseSquare(s, st.rules.W, st.rules.H);
const play = (st, ...moves) => moves.reduce((s, mv) => {
  const [a, b] = mv.split('-');
  const m = legalMoves(s).find((x) => x.from === sq(s, a) && x.to === sq(s, b));
  assert.ok(m, 'illegal move ' + mv);
  return makeMove(s, m);
}, st);

test('classic perft matches known values', () => {
  const st = createGame(RULESETS.classic);
  assert.equal(perft(st, 1), 20);
  assert.equal(perft(st, 2), 400);
  assert.equal(perft(st, 3), 8902);
  assert.equal(perft(st, 4), 197281);
});

test("fool's mate is checkmate", () => {
  const st = play(createGame(RULESETS.classic), 'f2-f3', 'e7-e5', 'g2-g4', 'd8-h4');
  assert.ok(inCheck(st));
  assert.deepEqual(outcome(st), { winner: 'b', reason: 'Checkmate' });
});

test('castling and en passant', () => {
  let st = play(createGame(RULESETS.classic), 'e2-e4', 'a7-a6', 'e4-e5', 'd7-d5');
  st = play(st, 'e5-d6'); // en passant
  assert.equal(st.board[sq(st, 'd5')], null);
  st = play(createGame(RULESETS.classic), 'e2-e4', 'e7-e5', 'g1-f3', 'b8-c6', 'f1-c4', 'g8-f6', 'e1-g1');
  assert.equal(st.board[sq(st, 'f1')], 'wR');
  assert.equal(st.board[sq(st, 'g1')], 'wK');
});

test('chasm blocks sliders but golems jump it', () => {
  const st = createGame(RULESETS.chasm);
  // a2 pawn: a3 ok, a4 is chasm
  const a2 = legalMoves(st).filter((m) => m.from === sq(st, 'a2'));
  assert.deepEqual(a2.map((m) => m.to), [sq(st, 'a3')]);
  const s2 = play(st, 'e2-e3', 'b7-b6');
  const golemMoves = legalMoves(makeMove(s2, legalMoves(s2)[0])).filter((m) => m.from === sq(s2, 'b8'));
  assert.ok(golemMoves.length >= 1);
});

test('portals teleport', () => {
  const st = play(createGame(RULESETS.vael), 'g1-h3');
  assert.equal(st.board[sq(st, 'a6')], 'wD');
  assert.equal(st.board[sq(st, 'h3')], null);
});

test('forge explosions destroy neighbours and can kill kings', () => {
  let st = play(createGame(RULESETS.forge), 'e2-e4', 'd7-d5', 'e4-d5');
  assert.equal(st.board[sq(st, 'd5')], null); // capturer exploded too
  st = play(createGame(RULESETS.forge), 'e2-e4', 'e7-e5', 'd1-h5', 'a7-a6', 'h5-f7');
  // f7 explodes, adjacent e8 king is destroyed
  assert.equal(outcome(st).winner, 'w');
});

test('pilgrimage promotion goal', () => {
  let st = createGame(RULESETS.pilgrimage);
  st = { ...st, board: st.board.slice() };
  st.board[sq(st, 'b7')] = 'wP';
  st.board[sq(st, 'b4')] = null;
  st = play(st, 'b7-b8');
  assert.equal(outcome(st).winner, 'w');
});

test('siege survive goal', () => {
  const st = { ...createGame(RULESETS.siege), ply: 40 };
  assert.equal(outcome(st).winner, 'w');
});

test('every ruleset builds and AI finds a move quickly', () => {
  for (const ch of CHAPTERS) {
    const st = createGame(RULESETS[ch.ruleset]);
    const t0 = Date.now();
    const m = chooseMove(st, ch.ai);
    const ms = Date.now() - t0;
    assert.ok(m, ch.id);
    console.log(`${ch.id}: depth ${ch.ai.depth} ${ms}ms`);
  }
});

test('AI plays full games without crashing', () => {
  for (const id of Object.keys(RULESETS)) {
    let st = createGame(RULESETS[id]);
    let o = null;
    for (let i = 0; i < 80 && !o; i++) {
      const m = chooseMove(st, { depth: 1, randomness: 0.5 });
      st = makeMove(st, m);
      o = outcome(st);
    }
    console.log(id, o ? `${o.winner} — ${o.reason}` : 'unfinished', st.ply);
  }
});
