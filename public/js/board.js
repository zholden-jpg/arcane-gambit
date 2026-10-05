// Board rendering + click-to-move input.
import { legalMoves, visibleSquares, inCheck, findKing, FILES } from '../shared/engine.js';

const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };

// Simple silhouettes for the fantasy pieces (viewBox 0 0 100 100).
const SVG = {
  M: '<path d="M50 6 L73 70 L27 70 Z"/><ellipse cx="50" cy="74" rx="36" ry="10"/><path class="cut" d="M50 32 l4 9 10 1 -8 6 3 10 -9 -6 -9 6 3 -10 -8 -6 10 -1z"/>',
  D: '<path d="M14 86 Q22 58 34 50 Q30 34 44 24 L48 8 L56 22 Q74 22 86 36 L74 40 L82 50 Q68 54 58 48 Q50 58 56 74 Q60 82 70 86 Z"/><circle class="cut" cx="62" cy="32" r="4"/><path class="cut" d="M30 64 Q38 60 44 66" fill="none" stroke-width="3"/>',
  G: '<rect x="37" y="10" width="26" height="22" rx="3"/><rect x="24" y="34" width="52" height="34" rx="4"/><rect x="14" y="36" width="10" height="26" rx="3"/><rect x="76" y="36" width="10" height="26" rx="3"/><rect x="29" y="70" width="16" height="20" rx="2"/><rect x="55" y="70" width="16" height="20" rx="2"/><rect class="cut" x="42" y="18" width="5" height="5"/><rect class="cut" x="53" y="18" width="5" height="5"/>',
  W: '<path d="M26 90 L26 44 Q26 10 50 10 Q74 10 74 44 L74 90 L66 80 L58 90 L50 80 L42 90 L34 80 Z"/><ellipse class="cut" cx="41" cy="40" rx="5" ry="8"/><ellipse class="cut" cx="59" cy="40" rx="5" ry="8"/>',
};

export function pieceHTML(p) {
  const color = p[0] === 'w' ? 'white' : 'black';
  const t = p[1];
  if (SVG[t]) return `<span class="piece ${color} fantasy" data-t="${t}"><svg viewBox="0 0 100 100" aria-hidden="true">${SVG[t]}</svg></span>`;
  return `<span class="piece ${color}" data-t="${t}">${GLYPH[t]}</span>`;
}

export class BoardView {
  constructor(el) {
    this.el = el;
    this.selected = -1;
    this.onMove = null;
    this.opts = {};
    el.addEventListener('click', (e) => this.handleClick(e));
  }

  /**
   * opts: { state, orientation: 'w'|'b', fogFor: 'w'|'b'|null, interactive: 'w'|'b'|null,
   *         hideLast: bool, onMove(move) }
   */
  render(opts) {
    this.opts = opts;
    this.onMove = opts.onMove;
    const st = opts.state;
    const { W, H, blocked, portals } = st.rules;
    this.moves = opts.interactive && st.turn === opts.interactive ? legalMoves(st) : [];
    if (this.selected >= 0 && !this.moves.some((m) => m.from === this.selected)) this.selected = -1;

    const vis = opts.fogFor ? visibleSquares(st, opts.fogFor) : null;
    const targets = new Set(this.moves.filter((m) => m.from === this.selected).map((m) => m.to));
    const movable = new Set(this.moves.map((m) => m.from));
    const last = st.last && !opts.hideLast ? st.last : null;
    const checkSq = !st.rules.kingCapture && inCheck(st) ? findKing(st, st.turn) : -1;
    const portalPair = {};
    let pairIdx = 0;
    portals.forEach((d, i) => { if (d >= 0 && portalPair[i] === undefined) { portalPair[i] = portalPair[d] = pairIdx++; } });

    const flip = opts.orientation === 'b';
    this.el.style.setProperty('--w', W);
    this.el.style.setProperty('--h', H);
    let html = '';
    for (let vr = 0; vr < H; vr++) {
      for (let vc = 0; vc < W; vc++) {
        const r = flip ? H - 1 - vr : vr;
        const c = flip ? W - 1 - vc : vc;
        const i = r * W + c;
        const cls = ['sq', (r + c) % 2 ? 'dark' : 'light'];
        const hidden = vis && !vis.has(i);
        if (blocked[i]) cls.push('chasm');
        if (portals[i] >= 0) cls.push('portal', 'portal-' + portalPair[i]);
        if (hidden) cls.push('fog');
        if (last && !hidden && (i === last.from || i === last.to || i === last.landed)) cls.push('last');
        if (last && last.exploded && last.exploded.includes(i) && !hidden) cls.push('boom');
        if (i === this.selected) cls.push('selected');
        if (targets.has(i)) cls.push(st.board[i] ? 'target-capture' : 'target');
        if (movable.has(i)) cls.push('movable');
        if (i === checkSq) cls.push('check');
        let inner = '';
        const p = st.board[i];
        if (p && !hidden) inner += pieceHTML(p);
        if (vc === 0) inner += `<span class="coord rank">${H - r}</span>`;
        if (vr === H - 1) inner += `<span class="coord file">${FILES[c]}</span>`;
        html += `<div class="${cls.join(' ')}" data-i="${i}">${inner}</div>`;
      }
    }
    this.el.innerHTML = html;
  }

  handleClick(e) {
    const sqEl = e.target.closest('.sq');
    if (!sqEl || !this.opts.state) return;
    const i = +sqEl.dataset.i;
    const st = this.opts.state;
    const move = this.moves.find((m) => m.from === this.selected && m.to === i);
    if (move) {
      this.selected = -1;
      this.onMove && this.onMove(move);
      return;
    }
    if (this.moves.some((m) => m.from === i)) this.selected = i === this.selected ? -1 : i;
    else this.selected = -1;
    this.render(this.opts);
  }

  clearSelection() { this.selected = -1; }
}
