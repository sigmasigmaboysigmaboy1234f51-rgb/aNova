// Blockfire: The Shattered Heartstone.
//
// Cubara is a floating island kept alive by the Heartstone. The Golden
// Overlord, who wants to be the buffest thing in the sky, smashed it, ate
// one shard and threw the other nine to his gym buddies. Every shard turns
// whoever holds it into a muscle-bound boss, and its glow is waking up the
// mobs. You are the last Blockfire: a builder who shapes blocks and fires
// Ember. Grandma Brick taught you everything. Pip, her lantern-bot, can
// sense shards.

export const CAST = {
  gran: { name: 'Grandma Brick', color: '#ff9a3c' },
  pip: { name: 'Pip', color: '#9fe8ff' },
  you: { name: 'You', color: '#ffd23f' },
  overlord: { name: 'Golden Overlord', color: '#ffd84a' },
  mossback: { name: 'Mossback Brute', color: '#8fc06a' },
  colossus: { name: 'Bone Colossus', color: '#e8e2cc' },
  kinggloop: { name: 'King Gloop', color: '#c8a4ff' },
  magma: { name: 'Magma Titan', color: '#ff7a2f' },
  glacier: { name: 'Glacier Hulk', color: '#9fe8ff' },
  storm: { name: 'Storm Champion', color: '#fff6a0' },
  shadow: { name: 'Shadow Bruiser', color: '#d27bff' },
  goliath: { name: 'Stone Goliath', color: '#bfbfbf' },
  tyrant: { name: 'Toxic Tyrant', color: '#c8f25a' },
};

// Goal kinds:
//   waves:  survive n waves made from `pool`
//   shards: find n Heartstone sparks while mobs from `pool` hunt you
//   defend: keep mobs off Grandma's beacon for `time` seconds
//   boss:   beat the chapter's boss
// say: lines shown before the goal starts.
export const CHAPTERS = [
  {
    title: 'Wake Up, Builder',
    theme: 'meadow',
    boss: 0,
    reward: { gun: 'buzz', coins: 200 },
    par: 300,
    lore: 'The Heartstone is shattered and the Mossheads are awake. Time to get up.',
    intro: [
      ['gran', "Up you get, sleepyhead! The sky's gone all wrong and the Mossheads are out of bed."],
      ['pip', "BEEP! Heartstone signal... gone! Totally gone! Oh, and hi. I'm Pip."],
      ['gran', 'Somebody smashed the Heartstone. Without it, this island rots from the roots up.'],
      ['you', 'Who would do something like that?'],
      ['gran', "Don't know yet. But I know who's going to fix it. You. Grab your Ember Blaster."],
    ],
    goals: [
      {
        type: 'waves',
        n: 2,
        pool: ['moss'],
        size: 5,
        say: [['pip', 'Mossheads incoming! Left click shoots. Right click aims. Keys 4 to 7 pick blocks for building walls.']],
      },
      {
        type: 'shards',
        n: 3,
        pool: ['moss', 'moss:mini'],
        say: [['pip', 'I sense three Heartstone sparks nearby! Follow the purple light beams and walk into them.']],
      },
      {
        type: 'boss',
        say: [
          ['mossback', "WHO'S BEEN STOMPING ON MY LAWN? Oh. It's a tiny builder. How cute."],
          ['pip', "That's a shard holder! Its muscles are... concerning. Jump over its ground slam!"],
        ],
      },
    ],
    outro: [
      ['gran', 'You did it! And look at that: a real Heartstone shard.'],
      ['pip', 'Shard 1 of 10 recovered! Scanning... the next one is in the Old Ruins.'],
      ['overlord', 'Enjoy your little rock, builder. I have nine more. And I have NEVER skipped a workout.'],
      ['gran', "The Golden Overlord. Of course it's him. Take this Buzz SMG. You're going to need it."],
    ],
  },
  {
    title: 'Rattle in the Ruins',
    theme: 'ruins',
    boss: 1,
    reward: { gun: 'crossbolt', coins: 250 },
    par: 360,
    lore: 'Boneheads guard the Old Ruins, and something big is rattling in the middle.',
    intro: [
      ['pip', 'The Old Ruins. Five hundred years of history and not one working toilet.'],
      ['gran', 'Boneheads guard this place. They shoot from far away, so build cover and keep your head down.'],
    ],
    goals: [
      { type: 'waves', n: 2, pool: ['moss', 'bone', 'bone:mini'], size: 6, say: [['pip', 'Here they come! Rattle rattle.']] },
      {
        type: 'defend',
        time: 45,
        pool: ['moss', 'bone', 'gloop'],
        say: [['gran', "I'm setting up a beacon to track the shard. Keep the mobs off it until it's done!"]],
      },
      {
        type: 'boss',
        say: [
          ['colossus', 'I have ONE HUNDRED AND SIX bones, and every single one of them is RIPPED.'],
          ['pip', 'It shoots bone volleys! Get behind a wall!'],
        ],
      },
    ],
    outro: [
      ['pip', 'Shard 2! The trail leads into Gloop Bog. Squishy.'],
      ['gran', "Here's a Crossbolt. Quiet, and headshots hit extra hard."],
    ],
  },
  {
    title: 'The Jelly Kingdom',
    theme: 'bog',
    boss: 2,
    reward: { gun: 'scatter', coins: 300 },
    par: 380,
    lore: 'King Gloop rules the bog. The shard went straight to his head. And his arms.',
    intro: [
      ['pip', 'Gloop Bog. Watch your step. The ground here is about forty percent slime.'],
      ['gran', "King Gloop rules this swamp. He used to be a nice little jelly. The shard went straight to his head. And his arms."],
    ],
    goals: [
      { type: 'shards', n: 5, pool: ['gloop', 'gloop:mini', 'moss'], say: [['pip', 'Five sparks, all sunk in the bog. Go grab them!']] },
      { type: 'waves', n: 2, pool: ['gloop', 'skitter', 'gloop:giant'], size: 7, say: [['gran', "Skitters! They leap from a few blocks away. Keep them in front of you."]] },
      {
        type: 'boss',
        say: [
          ['kinggloop', "BOW before the KING! Or don't. I'll bounce on you either way."],
          ['pip', 'When he jumps, run! His landing makes a shockwave.'],
        ],
      },
    ],
    outro: [
      ['kinggloop', '...can I at least keep the crown?'],
      ['gran', "Even jelly kings fall. Take this Scatter Cannon. It's great up close."],
      ['pip', "Next shard: Mount Ember. I'd bring sunscreen."],
    ],
  },
  {
    title: 'Fire Mountain',
    theme: 'volcano',
    boss: 3,
    reward: { gun: 'flare', coins: 350 },
    par: 420,
    lore: 'Mount Ember is erupting, and the Magma Titan is throwing the mountain at people.',
    intro: [
      ['pip', 'Warning! The water here is lava. Do NOT go swimming.'],
      ['gran', 'Ember Imps throw fire over walls, so keep moving. Hitting the Blazing ones with fire does nothing.'],
    ],
    goals: [
      { type: 'waves', n: 3, pool: ['imp', 'skitter', 'moss:blaze', 'imp:blaze'], size: 7, say: [['pip', 'Hot hot hot! Imps incoming!']] },
      { type: 'defend', time: 50, pool: ['imp', 'moss:blaze', 'skitter:blaze', 'gloop:blaze'], say: [['gran', 'Beacon going up. Protect it!']] },
      {
        type: 'boss',
        say: [
          ['magma', "You want my shard? Come and take it. It's only about twelve hundred degrees."],
          ['pip', 'He throws lava boulders. Watch where they land!'],
        ],
      },
    ],
    outro: [
      ['pip', 'Shard 4! Cooling down... cooling... okay, it is fine now.'],
      ['gran', 'The Flare Revolver. Fight fire with fire.'],
    ],
  },
  {
    title: 'Frostpeak',
    theme: 'snow',
    boss: 4,
    reward: { gun: 'frost', coins: 400 },
    par: 420,
    lore: 'Up on Frostpeak everything is frozen, including the mobs. Especially the mobs.',
    intro: [
      ['pip', 'Brrr. My circuits are shivering.'],
      ['gran', "Frost mobs slow you right down. Don't let them touch you."],
    ],
    goals: [
      { type: 'shards', n: 5, pool: ['moss:frost', 'skitter:frost', 'bone:frost', 'gloop:frost'], say: [['pip', 'Five sparks frozen in the snow. Let us thaw them out!']] },
      { type: 'waves', n: 2, pool: ['moss:frost', 'bone:frost', 'imp', 'knight:frost', 'skitter'], size: 8, say: [['gran', 'Rust Knights! Their shields stop body shots. Aim for the head.']] },
      {
        type: 'boss',
        say: [
          ['glacier', "Cold? Nah. I'm just... chill. HAHAHA. Now hold still."],
          ['pip', "Don't stand in front of him when he breathes!"],
        ],
      },
    ],
    outro: [
      ['gran', 'Take the Frost Ray. It slows anything down.'],
      ['pip', 'Next up: the Storm Arena. I hear there is a crowd.'],
    ],
  },
  {
    title: 'Champion of the Storm',
    theme: 'arena',
    boss: 5,
    reward: { gun: 'tesla', coins: 450 },
    par: 480,
    lore: 'The Storm Champion has never lost a match. He has also never met you.',
    intro: [
      ['pip', 'Ladies and gentlemobs! In THIS corner... it is you!'],
      ['gran', "The Storm Champion won't fight until you beat his fans. So go beat his fans."],
    ],
    goals: [
      {
        type: 'waves',
        n: 4,
        pool: ['moss', 'knight', 'skitter', 'imp', 'moss:shock', 'knight:shock', 'bone'],
        size: 8,
        say: [['pip', 'The crowd is going WILD! Also they are coming into the ring.']],
      },
      {
        type: 'boss',
        say: [
          ['storm', "UNDEFEATED! UNTOUCHABLE! UN... un-something! LET'S GOOO!"],
          ['pip', 'Yellow circles on the ground mean lightning is coming. MOVE!'],
        ],
      },
    ],
    outro: [
      ['storm', '...Good match, kid. Good match.'],
      ['gran', "Take the Tesla Coil. The lightning's yours now."],
    ],
  },
  {
    title: 'Nightfall Hollow',
    theme: 'night',
    boss: 6,
    reward: { gun: 'longshot', coins: 500 },
    par: 480,
    lore: 'It never gets light in the Hollow. Something is always right behind you.',
    intro: [
      ['pip', "It's dark. Really dark. I'm a lantern and even I'm scared."],
      ['gran', "Follow the crystals. Specters float through walls, so building won't save you here."],
    ],
    goals: [
      { type: 'shards', n: 4, pool: ['ghost', 'bat', 'skitter:shadow', 'moss:shadow'], say: [['pip', 'Four sparks out there in the dark. Stay close to the light!']] },
      { type: 'defend', time: 45, pool: ['ghost', 'bat', 'moss:shadow', 'bone:shadow'], say: [['gran', 'Beacon up! Keep them off it!']] },
      {
        type: 'boss',
        say: [
          ['shadow', 'Behind you.'],
          ['pip', 'He teleports behind you! Keep turning around!'],
        ],
      },
    ],
    outro: [
      ['gran', 'The Longshot Rail. Line them up and punch right through.'],
      ['pip', 'I am never going in there again. Next: Rumble Quarry.'],
    ],
  },
  {
    title: 'Rumble Quarry',
    theme: 'quarry',
    boss: 7,
    reward: { gun: 'boom', coins: 550 },
    par: 480,
    lore: 'The Stone Goliath is digging up the whole island to build himself a bigger gym.',
    intro: [
      ['gran', "Cobble Golems smash through walls. Don't hide. Keep moving."],
      ['pip', 'Fun fact: golems are ninety percent rock and ten percent more rock.'],
    ],
    goals: [
      { type: 'waves', n: 3, pool: ['golem', 'knight', 'fuse', 'moss:armored', 'skitter'], size: 8, say: [['pip', 'Fuses! When they flash, back off fast!']] },
      {
        type: 'boss',
        say: [
          ['goliath', 'I throw rocks. I build with rocks. I AM rocks.'],
          ['pip', 'His boulders build walls around you. Shoot your way out!'],
        ],
      },
    ],
    outro: [
      ['pip', 'Shard 8! Only two to go!'],
      ['gran', 'The Boomstick. It blows up walls too, so careful where you point it.'],
    ],
  },
  {
    title: 'Stinkwater',
    theme: 'sewer',
    boss: 8,
    reward: { gun: 'mill', coins: 600 },
    par: 480,
    lore: 'The Toxic Tyrant lives in the sewers under Cubara. You will want to hold your nose.',
    intro: [
      ['pip', "Ew. Ew ew ew. I don't even have a nose and I can smell this."],
      ['gran', 'Toxic hits poison you, and poison stops you healing. Grab every heart you see.'],
    ],
    goals: [
      { type: 'shards', n: 4, pool: ['fuse', 'gloop:toxic', 'moss:toxic', 'skitter:toxic'], say: [['pip', 'Four sparks floating in the sludge. Gross, but go get them.']] },
      { type: 'waves', n: 2, pool: ['fuse', 'moss:toxic', 'bone:toxic', 'imp:toxic', 'bat'], size: 9, say: [['gran', 'Here they come. Stay out of the slime!']] },
      {
        type: 'boss',
        say: [
          ['tyrant', "Smell that? That's the smell of VICTORY. Also the sewer. Mostly the sewer."],
          ['pip', 'His bombs leave poison clouds. Do not stand in the green!'],
        ],
      },
    ],
    outro: [
      ['gran', "Nine shards. One left, and we know exactly who has it."],
      ['overlord', "Come to my palace, builder. I'll be waiting. Flexing."],
    ],
  },
  {
    title: 'The Golden Palace',
    theme: 'palace',
    boss: 9,
    reward: { coins: 1500, parts: ['paint.gold', 'barrel.twin', 'core.leech'] },
    par: 600,
    lore: 'The last shard. The Golden Overlord. The buffest fight of your life.',
    intro: [
      ['overlord', 'Welcome to my palace! Everything is gold. Even the toilets. ESPECIALLY the toilets.'],
      ['gran', 'This is it. Put the Heartstone back together and save Cubara.'],
      ['pip', 'I believe in you! Also, I am hiding behind you.'],
    ],
    goals: [
      {
        type: 'waves',
        n: 3,
        pool: ['moss:golden', 'knight:golden', 'golem', 'imp', 'fuse', 'bat', 'ghost', 'knight:armored', 'bone:shock'],
        size: 9,
        say: [['overlord', 'Guards! GUARDS! Somebody get the builder!']],
      },
      {
        type: 'defend',
        time: 60,
        pool: ['knight:golden', 'golem:armored', 'imp:blaze', 'bat:shadow', 'ghost', 'fuse:shock'],
        say: [['gran', 'The nine shards are rebuilding the Heartstone! Protect the beacon while they work!']],
      },
      {
        type: 'boss',
        say: [
          ['overlord', 'I ate a shard for BREAKFAST! I lift MOUNTAINS! I am the BUFFEST... wait, why are you still standing?'],
          ['pip', 'He charges straight through walls! Jump out of the way!'],
        ],
      },
    ],
    outro: [
      ['overlord', 'My muscles... they are... normal sized. Nooooo...'],
      ['gran', 'The Heartstone is whole again! Look at the island. It is glowing!'],
      ['pip', 'BEEP BOOP! Heartstone at one hundred percent! WE DID IT!'],
      ['gran', 'And the bosses? Turns out they really like lifting. They are opening a gym. Free membership for heroes.'],
      ['pip', 'THE END! ...or is it? Endless mode is waiting, and the bosses want a rematch.'],
    ],
  },
];

// The boss's cast id for each chapter.
export const BOSS_CAST = ['mossback', 'colossus', 'kinggloop', 'magma', 'glacier', 'storm', 'shadow', 'goliath', 'tyrant', 'overlord'];
