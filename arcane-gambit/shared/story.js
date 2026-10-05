// Story mode: "The Shattered Board".
// Each chapter points at a battlefield in rulesets.js. The player is always White.

export const STORY_TITLE = 'The Shattered Board';

export const PROLOGUE = [
  { who: 'Narrator', text: 'For a thousand years the Ivory Board kept the realm of Velmora in balance. Every war was settled on its sixty-four squares, and no blood was spilled.' },
  { who: 'Narrator', text: 'Then the Hollow King shattered it. Its shards fell across the land, and each one twisted the rules of the place where it landed.' },
  { who: 'Narrator', text: 'Only one student of the Order of the Sixty-Four Stars remains: you, Wren — an apprentice who has never played a real game.' },
];

export const CHAPTERS = [
  {
    id: 'trial',
    ruleset: 'trial',
    title: 'I. The Apprentice’s Trial',
    opponent: 'Master Orrin',
    ai: { depth: 2, randomness: 1.0 },
    intro: [
      { who: 'Master Orrin', text: 'Before you chase the Hollow King, you must beat an old man on a small board.' },
      { who: 'Master Orrin', text: 'Six files, six ranks, no bishops. Pawns take one careful step at a time. Checkmate me, and I will let you go.' },
    ],
    outro: [
      { who: 'Master Orrin', text: 'Ha! You see the board better than you think. Take this compass — it points toward the nearest shard.' },
      { who: 'Narrator', text: 'The needle swings east, toward the Chasm of Tolm.' },
    ],
  },
  {
    id: 'chasm',
    ruleset: 'chasm',
    title: 'II. The Chasm of Tolm',
    opponent: 'Grunhild, the Bridge-Warden',
    ai: { depth: 2, randomness: 0.5 },
    intro: [
      { who: 'Grunhild', text: 'No one crosses my chasm. My Golems stomp across it. Your little soldiers will just fall in.' },
      { who: 'Narrator', text: 'The ground has split. Pieces cannot enter or slide over the dark squares — only Golems leap them.' },
    ],
    outro: [
      { who: 'Grunhild', text: 'Hmph. Fine. The shard you seek is in Mistwood. Nobody comes back from Mistwood.' },
      { who: 'Narrator', text: 'You take the first shard. It hums faintly, like a held breath.' },
    ],
  },
  {
    id: 'mistwood',
    ruleset: 'mistwood',
    title: 'III. Mistwood',
    opponent: 'Ysolde, the Wraith Queen',
    ai: { depth: 3, randomness: 0.4 },
    intro: [
      { who: 'Ysolde', text: 'Can you see me, little star? I can see you. My Wraiths drift through anything in their path.' },
      { who: 'Narrator', text: 'Fog hides every square your pieces cannot reach. There is no check in the mist — a king is simply taken.' },
    ],
    outro: [
      { who: 'Sable', text: 'You broke her hold! I am Sable, a Mage of the old Order. I was trapped in that fog for a decade.' },
      { who: 'Sable', text: 'I will fight beside you. I can blink like a king or leap like a knight.' },
      { who: 'Narrator', text: 'Sable the Mage joins your army.' },
    ],
  },
  {
    id: 'forge',
    ruleset: 'forge',
    title: 'IV. The Ember Forge',
    opponent: 'Pyrrhax, the Ember-Smith',
    ai: { depth: 3, randomness: 0.3 },
    intro: [
      { who: 'Pyrrhax', text: 'In my forge, every blow ends in fire. Strike a piece and everything around it burns — including you.' },
      { who: 'Narrator', text: 'Captures explode: the attacker, the target, and every non-pawn piece next to them are destroyed. Don’t blow up your own king.' },
    ],
    outro: [
      { who: 'Narrator', text: 'In the ashes of the forge, a dragon egg cracks open. The hatchling — Ember — follows you out.' },
      { who: 'Narrator', text: 'Ember the Dragon joins your army. Dragons fly like bishops or leap like knights.' },
    ],
  },
  {
    id: 'vael',
    ruleset: 'vael',
    title: 'V. The Mirror Gates of Vael',
    opponent: 'The Twin Seers',
    ai: { depth: 3, randomness: 0.2 },
    intro: [
      { who: 'The Twin Seers', text: 'Step through our gates and you step out somewhere else. We have already seen how this ends.' },
      { who: 'Narrator', text: 'Land on a glowing portal and your piece leaps to its twin across the board (if the twin is empty).' },
      { who: 'Sable', text: 'Ember and I take the place of your knights. Use us well.' },
    ],
    outro: [
      { who: 'The Twin Seers', text: 'We did not see that coming… The Hollow King marches on Ravenmoor tonight.' },
    ],
  },
  {
    id: 'siege',
    ruleset: 'siege',
    title: 'VI. The Siege of Ravenmoor',
    opponent: 'Captain Vex',
    ai: { depth: 3, randomness: 0.1 },
    intro: [
      { who: 'Captain Vex', text: 'Your walls are thin and your army is half of mine. By dawn, Ravenmoor is ours.' },
      { who: 'Sable', text: 'We do not need to win, Wren. We need to hold. Survive 20 moves until dawn.' },
    ],
    outro: [
      { who: 'Narrator', text: 'Dawn breaks over Ravenmoor. Vex’s army retreats, leaving behind three crown shards.' },
      { who: 'Master Orrin', text: 'Three pawns must carry the shards across the Salt Road. Only the far shore can make them whole.' },
    ],
  },
  {
    id: 'pilgrimage',
    ruleset: 'pilgrimage',
    title: 'VII. The Salt Road',
    opponent: 'The Hollow Knight',
    ai: { depth: 4, randomness: 0.1 },
    intro: [
      { who: 'The Hollow Knight', text: 'Three pawns, two lumps of stone and a horse. I will grind your shards into salt.' },
      { who: 'Narrator', text: 'Promote any pawn to win. If every pawn is destroyed — or your king is mated — you lose.' },
    ],
    outro: [
      { who: 'Narrator', text: 'A pawn reaches the far shore, and the shards fuse into the Ivory Crown.' },
      { who: 'Narrator', text: 'Far away, on a cracked throne, the Hollow King opens his eyes.' },
    ],
  },
  {
    id: 'throne',
    ruleset: 'throne',
    title: 'VIII. The Hollow Throne',
    opponent: 'The Hollow King',
    ai: { depth: 3, randomness: 0 },
    intro: [
      { who: 'The Hollow King', text: 'You rebuilt a crown. I will build a bigger board. Nine by nine, apprentice — every power I stole stands against you.' },
      { who: 'Narrator', text: 'Pillars block the center. Portals hum at the edges. Wraiths, Dragons, Golems and a Mage guard the throne. Checkmate the Hollow King.' },
    ],
    outro: [
      { who: 'The Hollow King', text: 'Impossible… beaten by a pawn-pusher…' },
      { who: 'Narrator', text: 'The throne crumbles. The Ivory Board knits itself whole, and the twisted lands fall quiet.' },
      { who: 'Master Orrin', text: 'Not an apprentice anymore, Wren. A Master of the Sixty-Four Stars.' },
      { who: 'Narrator', text: 'THE END. (Challenge a friend in Arcane Duel — every battlefield is open to you.)' },
    ],
  },
];
