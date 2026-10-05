// Simple alpha-beta AI that understands every variant rule via the shared engine.
import { PIECES, legalMoves, pseudoMoves, makeMove, outcome, opposite } from './engine.js';

const WIN = 100000;

function evaluate(st) {
  const R = st.rules, W = R.W, H = R.H;
  const side = st.turn;
  const cr = (H - 1) / 2, cc = (W - 1) / 2;
  const promoteGoal = { w: R.goals.w.some((g) => g.type === 'promote'), b: R.goals.b.some((g) => g.type === 'promote') };
  let s = 0;
  const b = st.board;
  for (let i = 0; i < b.length; i++) {
    const p = b[i];
    if (!p) continue;
    const t = p[1], c = p[0];
    const r = (i / W) | 0, col = i % W;
    let v = PIECES[t].value;
    if (t === 'P') {
      const adv = c === 'w' ? H - 1 - r : r;
      v += adv * (promoteGoal[c] ? 0.45 : 0.05) * (promoteGoal[c] ? adv / 2 : 1);
    } else if (t !== 'K') {
      v += 0.12 * (2.5 - (Math.abs(r - cr) + Math.abs(col - cc)) / 2);
    }
    s += c === side ? v : -v;
  }
  for (const c of ['w', 'b']) {
    const sign = c === side ? 1 : -1;
    for (const g of R.goals[c]) {
      if (g.type === 'reach') {
        let best = 99;
        b.forEach((p, i) => {
          if (!p || p[0] !== c || (g.piece && p[1] !== g.piece)) return;
          for (const sq of g.squares) {
            const d = Math.max(Math.abs(((i / W) | 0) - ((sq / W) | 0)), Math.abs((i % W) - (sq % W)));
            if (d < best) best = d;
          }
        });
        s -= sign * 0.4 * best;
      }
      if (g.type === 'survive' && R.turnLimit) s += sign * 3 * (st.ply / (R.turnLimit * 2));
    }
  }
  return s;
}

function captureValue(st, m) {
  const t = st.board[m.to];
  return t ? PIECES[t[1]].value * 10 - PIECES[st.board[m.from][1]].value : (m.capture ? 5 : 0);
}

function order(st, moves) {
  return moves.map((m) => [captureValue(st, m), m]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
}

function terminalScore(st, o, ply) {
  if (o.winner === null) return 0;
  return o.winner === st.turn ? WIN - ply : -(WIN - ply);
}

function quiesce(st, alpha, beta, ply, qdepth) {
  const o = outcome(st, null, true);
  if (o) return terminalScore(st, o, ply);
  const stand = evaluate(st);
  if (qdepth === 0) return stand;
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  const caps = order(st, pseudoMoves(st).filter((m) => m.capture));
  for (const m of caps) {
    const score = -quiesce(makeMove(st, m), -beta, -alpha, ply + 1, qdepth - 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(st, depth, alpha, beta, ply, ctx) {
  ctx.nodes++;
  if (depth === 0) return quiesce(st, alpha, beta, ply, 3);
  const moves = legalMoves(st);
  const o = outcome(st, moves);
  if (o) return terminalScore(st, o, ply);
  for (const m of order(st, moves)) {
    const score = -negamax(makeMove(st, m), depth - 1, -beta, -alpha, ply + 1, ctx);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
    if (ctx.deadline && Date.now() > ctx.deadline) break;
  }
  return alpha;
}

/**
 * Pick a move for the side to move.
 * depth: plies to search. randomness: pawns-worth of slack — moves scoring within this of
 * the best are chosen at random (makes easy opponents beatable and play less repetitive).
 */
export function chooseMove(st, { depth = 2, randomness = 0, timeLimitMs = 4000 } = {}) {
  const moves = order(st, legalMoves(st));
  if (!moves.length) return null;
  const ctx = { nodes: 0, deadline: Date.now() + timeLimitMs };
  const scored = [];
  let alpha = -Infinity;
  for (const m of moves) {
    const n = makeMove(st, m);
    // Search with a widened window so near-best moves get real scores (for randomness).
    const lo = randomness > 0 ? alpha - randomness - 0.01 : alpha;
    const score = -negamax(n, depth - 1, -Infinity, -lo, 1, ctx);
    scored.push([score, m]);
    if (score > alpha) alpha = score;
    if (Date.now() > ctx.deadline && scored.length > 0) break;
  }
  scored.sort((a, b) => b[0] - a[0]);
  const best = scored[0][0];
  const pool = best >= WIN - 100 ? scored.filter((s) => s[0] === best) : scored.filter((s) => s[0] >= best - randomness);
  return pool[Math.floor(Math.random() * pool.length)][1];
}

export { evaluate, opposite };
