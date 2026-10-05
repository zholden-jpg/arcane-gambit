// Arcane Gambit — variant chess engine.
// Shared by the browser (story mode, AI, rendering) and the Node server (move validation).
// Board: flat array, index = row * W + col, row 0 is the TOP of the board (black's side).
// Pieces are 2-char strings: color ('w' | 'b') + type letter, e.g. 'wK', 'bD'.

const KING8 = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTHO2 = [[-2, 0], [2, 0], [0, -2], [0, 2]];

export const PIECES = {
  K: { name: 'King', value: 0, leaps: KING8, desc: 'One step in any direction. Protect it at all costs.' },
  Q: { name: 'Queen', value: 9, slides: [...ORTHO, ...DIAG], desc: 'Slides any distance in any direction.' },
  R: { name: 'Rook', value: 5, slides: ORTHO, desc: 'Slides any distance in a straight line.' },
  B: { name: 'Bishop', value: 3.2, slides: DIAG, desc: 'Slides any distance diagonally.' },
  N: { name: 'Knight', value: 3, leaps: KNIGHT, desc: 'Leaps in an L-shape, over anything.' },
  P: { name: 'Pawn', value: 1, pawn: true, desc: 'Steps forward, captures diagonally, promotes on the last rank.' },
  M: { name: 'Mage', value: 5, leaps: [...KING8, ...KNIGHT], desc: 'Blinks: moves like a King or a Knight.' },
  D: { name: 'Dragon', value: 7, slides: DIAG, leaps: KNIGHT, desc: 'Flies like a Bishop or leaps like a Knight.' },
  G: { name: 'Golem', value: 3, leaps: [...ORTHO, ...ORTHO2], desc: 'Stomps 1 or 2 squares straight, jumping over anything (even chasms).' },
  W: { name: 'Wraith', value: 4.5, slides: ORTHO, range: 3, phase: true, desc: 'Glides up to 3 squares in a straight line, phasing through pieces and chasms.' },
};

export const FILES = 'abcdefghijkl';

export function sqName(i, W, H) {
  return FILES[i % W] + (H - Math.floor(i / W));
}

export function parseSquare(name, W, H) {
  const c = FILES.indexOf(name[0]);
  const r = H - parseInt(name.slice(1), 10);
  if (c < 0 || c >= W || r < 0 || r >= H) throw new Error('Bad square ' + name);
  return r * W + c;
}

export const opposite = (c) => (c === 'w' ? 'b' : 'w');

/** Turn a ruleset definition (see rulesets.js) into a plain, serialisable rules object. */
export function compileRules(def) {
  const H = def.setup.length;
  const W = def.setup[0].length;
  const blocked = new Array(W * H).fill(0);
  const board = new Array(W * H).fill(null);
  def.setup.forEach((row, r) => {
    if (row.length !== W) throw new Error(`Ruleset ${def.id}: row ${r} has wrong width`);
    [...row].forEach((ch, c) => {
      const i = r * W + c;
      if (ch === '#') blocked[i] = 1;
      else if (ch !== '.') {
        const type = ch.toUpperCase();
        if (!PIECES[type]) throw new Error(`Ruleset ${def.id}: unknown piece ${ch}`);
        board[i] = (ch === type ? 'w' : 'b') + type;
      }
    });
  });
  const portals = new Array(W * H).fill(-1);
  for (const [a, b] of def.portals || []) {
    const ia = parseSquare(a, W, H), ib = parseSquare(b, W, H);
    portals[ia] = ib;
    portals[ib] = ia;
  }
  const goals = { w: [], b: [] };
  for (const c of ['w', 'b']) {
    for (const g of (def.goals && def.goals[c]) || []) {
      const cg = { ...g };
      if (g.squares) cg.squares = g.squares.map((s) => parseSquare(s, W, H));
      goals[c].push(cg);
    }
  }
  return {
    id: def.id,
    W, H, blocked, portals, goals,
    explosive: !!def.explosive,
    fog: !!def.fog,
    kingCapture: !!(def.kingCapture || def.fog || def.explosive),
    castling: !!def.castling && W === 8 && H === 8,
    doubleStep: def.doubleStep !== false,
    promoteTo: def.promoteTo || 'Q',
    turnLimit: def.turnLimit || 0,
    startBoard: board,
  };
}

export function createGame(def) {
  const rules = compileRules(def);
  const board = rules.startBoard.slice();
  return {
    rules,
    board,
    turn: 'w',
    ep: -1,
    castling: rules.castling ? 'KQkq' : '',
    ply: 0,
    promoted: { w: false, b: false },
    hadKing: { w: board.includes('wK'), b: board.includes('bK') },
    last: null,
  };
}

// ---------------------------------------------------------------- move generation

function genPiece(st, i, out) {
  const { W, H, blocked } = st.rules;
  const b = st.board;
  const p = b[i];
  const col = p[0];
  const def = PIECES[p[1]];
  const r = (i / W) | 0, c = i % W;

  if (def.pawn) {
    const dir = col === 'w' ? -1 : 1;
    const r1 = r + dir;
    if (r1 < 0 || r1 >= H) return;
    const f = r1 * W + c;
    if (!blocked[f] && !b[f]) {
      out.push({ from: i, to: f });
      const startRow = col === 'w' ? H - 2 : 1;
      const r2 = r + 2 * dir;
      if (st.rules.doubleStep && r === startRow && r2 >= 0 && r2 < H) {
        const f2 = r2 * W + c;
        if (!blocked[f2] && !b[f2]) out.push({ from: i, to: f2, double: true });
      }
    }
    for (const dc of [-1, 1]) {
      const c1 = c + dc;
      if (c1 < 0 || c1 >= W) continue;
      const t = r1 * W + c1;
      if (blocked[t]) continue;
      if (b[t] && b[t][0] !== col) out.push({ from: i, to: t, capture: true });
      else if (!b[t] && t === st.ep) out.push({ from: i, to: t, capture: true, ep: true });
    }
    return;
  }

  if (def.leaps) {
    for (const [dr, dc] of def.leaps) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr >= H || cc < 0 || cc >= W) continue;
      const t = rr * W + cc;
      if (blocked[t]) continue;
      if (!b[t]) out.push({ from: i, to: t });
      else if (b[t][0] !== col) out.push({ from: i, to: t, capture: true });
    }
  }

  if (def.slides) {
    for (const [dr, dc] of def.slides) {
      let rr = r + dr, cc = c + dc, steps = 0;
      const range = def.range || 99;
      while (rr >= 0 && rr < H && cc >= 0 && cc < W && ++steps <= range) {
        const t = rr * W + cc;
        if (blocked[t]) {
          if (!def.phase) break;
        } else if (b[t]) {
          if (b[t][0] !== col) out.push({ from: i, to: t, capture: true });
          if (!def.phase) break;
        } else {
          out.push({ from: i, to: t });
        }
        rr += dr; cc += dc;
      }
    }
  }

  // Castling (classic rules only)
  if (p[1] === 'K' && st.rules.castling) {
    const row = col === 'w' ? H - 1 : 0;
    const e = row * W + 4;
    if (i === e) {
      const opp = opposite(col);
      const kFlag = col === 'w' ? 'K' : 'k';
      const qFlag = col === 'w' ? 'Q' : 'q';
      if (st.castling.includes(kFlag) && !b[e + 1] && !b[e + 2] && b[e + 3] === col + 'R' &&
        !isAttacked(st, e, opp) && !isAttacked(st, e + 1, opp) && !isAttacked(st, e + 2, opp)) {
        out.push({ from: e, to: e + 2, castle: 'K' });
      }
      if (st.castling.includes(qFlag) && !b[e - 1] && !b[e - 2] && !b[e - 3] && b[e - 4] === col + 'R' &&
        !isAttacked(st, e, opp) && !isAttacked(st, e - 1, opp) && !isAttacked(st, e - 2, opp)) {
        out.push({ from: e, to: e - 2, castle: 'Q' });
      }
    }
  }
}

export function pseudoMoves(st, color = st.turn) {
  const out = [];
  const b = st.board;
  for (let i = 0; i < b.length; i++) if (b[i] && b[i][0] === color) genPiece(st, i, out);
  return out;
}

/** Does the piece standing on square j attack square `target`? */
function pieceAttacks(st, j, target) {
  const { W, blocked } = st.rules;
  const b = st.board;
  const p = b[j];
  const def = PIECES[p[1]];
  const r = (j / W) | 0, c = j % W;
  const dr = ((target / W) | 0) - r, dc = (target % W) - c;
  if (def.pawn) return dr === (p[0] === 'w' ? -1 : 1) && (dc === 1 || dc === -1);
  if (def.leaps) for (const [a, d] of def.leaps) if (a === dr && d === dc) return true;
  if (def.slides) {
    for (const [a, d] of def.slides) {
      let k;
      if (a !== 0) k = dr / a; else if (dr === 0) k = dc / d; else continue;
      if (!Number.isInteger(k) || k <= 0 || k > (def.range || 99) || dc !== d * k || dr !== a * k) continue;
      if (def.phase) return true;
      let clear = true;
      for (let s = 1; s < k; s++) {
        const t = (r + a * s) * W + (c + d * s);
        if (blocked[t] || b[t]) { clear = false; break; }
      }
      if (clear) return true;
    }
  }
  return false;
}

export function isAttacked(st, sq, by) {
  const b = st.board;
  for (let j = 0; j < b.length; j++) if (b[j] && b[j][0] === by && pieceAttacks(st, j, sq)) return true;
  return false;
}

export const findKing = (st, color) => st.board.indexOf(color + 'K');

export function inCheck(st, color = st.turn) {
  const k = findKing(st, color);
  return k >= 0 && isAttacked(st, k, opposite(color));
}

export function legalMoves(st) {
  const moves = pseudoMoves(st, st.turn);
  if (st.rules.kingCapture) return moves;
  const me = st.turn, opp = opposite(me);
  return moves.filter((m) => {
    const n = makeMove(st, m);
    const k = findKing(n, me);
    return k < 0 || !isAttacked(n, k, opp);
  });
}

// ---------------------------------------------------------------- making moves

export function makeMove(st, m) {
  const R = st.rules, W = R.W, H = R.H;
  const b = st.board.slice();
  const p = b[m.from];
  const col = p[0];
  let captured = b[m.to];
  let landed = m.to;
  let exploded = null;
  let teleported = false;
  let promoted = false;

  b[m.from] = null;
  if (m.ep) {
    const capSq = ((m.from / W) | 0) * W + (m.to % W);
    captured = b[capSq];
    b[capSq] = null;
  }
  if (m.castle === 'K') { b[m.from + 1] = b[m.from + 3]; b[m.from + 3] = null; }
  if (m.castle === 'Q') { b[m.from - 1] = b[m.from - 4]; b[m.from - 4] = null; }

  if (captured && R.explosive) {
    // Fireball: capturer, captured and every adjacent non-pawn piece are destroyed.
    b[m.to] = null;
    exploded = [m.to];
    const r = (m.to / W) | 0, c = m.to % W;
    for (const [dr, dc] of KING8) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr >= H || cc < 0 || cc >= W) continue;
      const t = rr * W + cc;
      if (b[t] && b[t][1] !== 'P') { b[t] = null; exploded.push(t); }
    }
    landed = -1;
  } else {
    b[m.to] = p;
    const dest = R.portals[m.to];
    if (dest >= 0 && !b[dest]) {
      b[dest] = p;
      b[m.to] = null;
      landed = dest;
      teleported = true;
    }
    if (p[1] === 'P') {
      const lr = (landed / W) | 0;
      if ((col === 'w' && lr === 0) || (col === 'b' && lr === H - 1)) {
        b[landed] = col + R.promoteTo;
        promoted = true;
      }
    }
  }

  let castling = st.castling;
  if (castling) {
    if (p[1] === 'K') castling = castling.replace(col === 'w' ? /[KQ]/g : /[kq]/g, '');
    const corners = { [(H - 1) * W + 7]: 'K', [(H - 1) * W]: 'Q', [7]: 'k', [0]: 'q' };
    for (const sq of [m.from, m.to]) if (corners[sq]) castling = castling.replace(corners[sq], '');
  }

  return {
    ...st,
    board: b,
    turn: opposite(col),
    ep: m.double && !teleported ? (m.from + m.to) / 2 : -1,
    castling,
    ply: st.ply + 1,
    promoted: promoted ? { ...st.promoted, [col]: true } : st.promoted,
    last: { from: m.from, to: m.to, landed, captured: captured || null, exploded, teleported, promoted, piece: p, castle: m.castle || null },
  };
}

/** Find the legal move matching a {from, to} request (used for network + UI input). */
export function matchMove(st, req) {
  return legalMoves(st).find((m) => m.from === req.from && m.to === req.to) || null;
}

// ---------------------------------------------------------------- game end

function goalMet(st, c, g) {
  const b = st.board;
  if (g.type === 'reach') return g.squares.some((s) => b[s] && b[s][0] === c && (!g.piece || b[s][1] === g.piece));
  if (g.type === 'promote') return st.promoted[c];
  if (g.type === 'eliminate') {
    const opp = opposite(c);
    return !b.some((p) => p && p[0] === opp && (!g.pieces || g.pieces.includes(p[1])));
  }
  return false;
}

const NAMES = { w: 'White', b: 'Black' };

/**
 * Returns null while the game is running, otherwise { winner: 'w' | 'b' | null, reason }.
 * Pass `moves` if you already computed legalMoves(st). Pass cheap=true to skip
 * the (expensive) no-legal-moves check — used at AI leaf nodes.
 */
export function outcome(st, moves = null, cheap = false) {
  const R = st.rules;
  const side = st.turn, mover = opposite(side);
  const kingGone = (c) => st.hadKing[c] && findKing(st, c) < 0;
  const gm = kingGone(mover), gs = kingGone(side);
  if (gm && gs) return { winner: side, reason: 'Both kings fell — the one who struck the blow loses' };
  if (gs) return { winner: mover, reason: R.explosive ? `${NAMES[side]}'s king was destroyed` : `${NAMES[side]}'s king was captured` };
  if (gm) return { winner: side, reason: `${NAMES[mover]}'s king was lost` };

  for (const c of [mover, side]) {
    for (const g of R.goals[c]) {
      if (g.type !== 'survive' && goalMet(st, c, g)) return { winner: c, reason: g.label || `${NAMES[c]} completed their quest` };
    }
  }
  if (!st.board.some((p) => p && p[0] === side)) return { winner: mover, reason: `${NAMES[side]}'s army was destroyed` };

  if (R.turnLimit && st.ply >= R.turnLimit * 2) {
    const s = ['w', 'b'].find((c) => R.goals[c].some((g) => g.type === 'survive'));
    if (s) return { winner: s, reason: R.goals[s].find((g) => g.type === 'survive').label || `${NAMES[s]} survived` };
    return { winner: null, reason: 'The turn limit was reached' };
  }
  if (st.ply >= 400) return { winner: null, reason: 'The battle dragged on too long — a draw' };
  if (cheap) return null;

  const ms = moves || legalMoves(st);
  if (ms.length === 0) {
    if (!R.kingCapture && inCheck(st, side)) return { winner: mover, reason: 'Checkmate' };
    return { winner: null, reason: 'Stalemate' };
  }
  return null;
}

/** Squares a color can currently "see" (fog of war). */
export function visibleSquares(st, color) {
  const vis = new Set();
  const { W, H } = st.rules;
  const fake = { ...st, ep: -1 };
  st.board.forEach((p, i) => {
    if (!p || p[0] !== color) return;
    vis.add(i);
    const r = (i / W) | 0, c = i % W;
    for (const [dr, dc] of KING8) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < H && cc >= 0 && cc < W) vis.add(rr * W + cc);
    }
    const out = [];
    genPiece(fake, i, out);
    out.forEach((m) => vis.add(m.to));
  });
  return vis;
}

export function describeMove(st, m, after) {
  const { W, H } = st.rules;
  const p = st.board[m.from];
  if (m.castle) return m.castle === 'K' ? 'O-O' : 'O-O-O';
  const t = p[1] === 'P' ? '' : p[1];
  let s = t + sqName(m.from, W, H) + (after.last.captured ? '×' : '–') + sqName(m.to, W, H);
  if (after.last.teleported) s += '⇒' + sqName(after.last.landed, W, H);
  if (after.last.exploded) s += '✸';
  if (after.last.promoted) s += '=' + st.rules.promoteTo;
  return s;
}
