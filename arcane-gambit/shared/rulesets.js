// Battlefield definitions. Used by story chapters AND by online duels.
//
// setup: rows from TOP (black's back rank) to BOTTOM (white's back rank).
//   Uppercase = White, lowercase = Black, '.' = empty, '#' = chasm / wall (impassable).
//   K King, Q Queen, R Rook, B Bishop, N Knight, P Pawn,
//   M Mage, D Dragon, G Golem, W Wraith
// Optional flags:
//   castling, doubleStep (default true), promoteTo (default 'Q'),
//   portals: [['a3','h6'], ...]  — a piece that lands on one end appears on the other (if empty)
//   fog: true        — fog of war (also switches to king-capture rules)
//   explosive: true  — every capture is a fireball (also king-capture rules)
//   kingCapture: true — no check/checkmate; you win by capturing the king
//   goals: { w: [...], b: [...] } — extra ways to win:
//      { type: 'reach', squares: ['e8'], piece: 'K' }
//      { type: 'promote' }
//      { type: 'eliminate', pieces: ['P'] }   (opponent has none of these left)
//      { type: 'survive' }                    (win when turnLimit is reached)
//   turnLimit: full moves before the game ends

export const RULESETS = {
  classic: {
    id: 'classic',
    name: 'Classic Chess',
    twist: 'Standard chess. Checkmate the enemy king.',
    castling: true,
    setup: [
      'rnbqkbnr',
      'pppppppp',
      '........',
      '........',
      '........',
      '........',
      'PPPPPPPP',
      'RNBQKBNR',
    ],
  },

  trial: {
    id: 'trial',
    name: 'The Training Hall',
    twist: 'A small 6×6 board. No bishops, and pawns only ever step one square.',
    doubleStep: false,
    setup: [
      'rnqknr',
      'pppppp',
      '......',
      '......',
      'PPPPPP',
      'RNQKNR',
    ],
  },

  chasm: {
    id: 'chasm',
    name: 'The Chasm of Tolm',
    twist: 'A bottomless chasm splits the field (dark squares). Nothing may cross it — except Golems, which stomp right over.',
    setup: [
      'rgnqkngr',
      'pppppppp',
      '........',
      '##.#..##',
      '##..#.##',
      '........',
      'PPPPPPPP',
      'RNBQKBNR',
    ],
  },

  mistwood: {
    id: 'mistwood',
    name: 'Mistwood',
    twist: 'Fog of war: you only see squares your pieces can reach. There is no check — capture the enemy king to win.',
    fog: true,
    setup: [
      'wnbqkbnw',
      'pppppppp',
      '........',
      '........',
      '........',
      '........',
      'PPPPPPPP',
      'RNBQKBNR',
    ],
  },

  forge: {
    id: 'forge',
    name: 'The Ember Forge',
    twist: 'Every capture is a fireball: the attacker, its target, and every non-pawn piece next to them are destroyed. No check — destroy the enemy king (and never blow up your own).',
    explosive: true,
    setup: [
      'rnbqkbnr',
      'pppppppp',
      '........',
      '........',
      '........',
      '........',
      'PPPPPPPP',
      'RNBQKBNR',
    ],
  },

  vael: {
    id: 'vael',
    name: 'The Mirror Gates of Vael',
    twist: 'Two pairs of portals (glowing squares). A piece that lands on one steps out of its twin — if the twin is empty.',
    portals: [['a3', 'h6'], ['h3', 'a6']],
    setup: [
      'rnbqkbnr',
      'pppppppp',
      '........',
      '........',
      '........',
      '........',
      'PPPPPPPP',
      'RMBQKBDR',
    ],
  },

  siege: {
    id: 'siege',
    name: 'Siege of Ravenmoor',
    twist: 'White holds the walls. White wins by surviving 20 moves (or by checkmate); Black must checkmate before dawn.',
    turnLimit: 20,
    goals: { w: [{ type: 'survive', label: 'Dawn broke over Ravenmoor — the defenders survived!' }] },
    setup: [
      'rdbqkbdr',
      'pppppppp',
      '........',
      '........',
      '........',
      '#.#..#.#',
      'PP.PP.PP',
      'R..MKN.R',
    ],
  },

  pilgrimage: {
    id: 'pilgrimage',
    name: 'The Salt Road',
    twist: 'White wins by promoting any pawn (or by checkmate). Black wins by checkmate or by destroying every white pawn.',
    goals: {
      w: [{ type: 'promote', label: 'A pawn reached the far shore and was crowned!' }],
      b: [{ type: 'eliminate', pieces: ['P'], label: 'Every pawn bearing a crown shard was destroyed' }],
    },
    setup: [
      '..b.k.n.',
      '...p.p..',
      '........',
      '...##...',
      '.P....P.',
      '....P...',
      '..G..G..',
      '...NK...',
    ],
  },

  throne: {
    id: 'throne',
    name: 'The Hollow Throne',
    twist: 'A 9×9 board with ruined pillars and two portal pairs. Every magical piece takes the field.',
    portals: [['a4', 'i6'], ['i4', 'a6']],
    setup: [
      'wndmkgdnw',
      'ppppppppp',
      '.........',
      '....#....',
      '..#...#..',
      '....#....',
      '.........',
      'PPPPPPPPP',
      'RNMQKDBNR',
    ],
  },
};

export const DUEL_ARENAS = ['classic', 'trial', 'chasm', 'mistwood', 'forge', 'vael', 'siege', 'pilgrimage', 'throne'];
