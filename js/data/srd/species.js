// Species (SRD 5.2, CC-BY-4.0). Summaries; see ATTRIBUTION.md.
const t = (name, desc, level = 1) => ({ name, desc, level });
const DRAGON = [
  ['black', 'Black', 'acid'], ['blue', 'Blue', 'lightning'], ['brass', 'Brass', 'fire'], ['bronze', 'Bronze', 'lightning'], ['copper', 'Copper', 'acid'],
  ['gold', 'Gold', 'fire'], ['green', 'Green', 'poison'], ['red', 'Red', 'fire'], ['silver', 'Silver', 'cold'], ['white', 'White', 'cold'],
];

export const SPECIES = [
  {
    id: 'dragonborn', name: 'Dragonborn', size: 'Medium', speed: 30, darkvision: 60,
    desc: 'Descended from dragons, with scales and a breath weapon tied to your draconic ancestry.',
    traits: [
      t('Draconic Ancestry', 'Your ancestry sets the damage type of your Breath Weapon and resistance.'),
      t('Breath Weapon', 'Replace an attack with a 15-ft Cone or 30-ft Line: DEX save, 1d10 damage (grows with level). Uses = Proficiency Bonus per Long Rest.'),
      t('Damage Resistance', 'Resistance to your ancestry\'s damage type.'),
      t('Darkvision', 'See in dim light within 60 ft as if bright.'),
      t('Draconic Flight', 'Bonus Action: sprout spectral wings for 10 minutes, once per Long Rest.', 5),
    ],
    choices: [{ id: 'ancestry', name: 'Draconic Ancestry', options: DRAGON.map(([id, name, dmg]) => ({ id, name: `${name} Dragon`, desc: `${dmg[0].toUpperCase() + dmg.slice(1)} damage`, resist: dmg })) }],
  },
  {
    id: 'dwarf', name: 'Dwarf', size: 'Medium', speed: 30, darkvision: 120, hpPerLevel: 1, resist: ['poison'],
    desc: 'Tough folk of stone and forge with long memories and superb darkvision.',
    traits: [
      t('Darkvision', 'Darkvision with a range of 120 ft.'),
      t('Dwarven Resilience', 'Resistance to Poison damage and Advantage on saves against Poisoned.'),
      t('Dwarven Toughness', 'Your HP maximum increases by 1 per level.'),
      t('Stonecunning', 'Bonus Action: gain Tremorsense 60 ft on stone for 10 minutes. Uses = Proficiency Bonus per Long Rest.'),
    ],
    choices: [],
  },
  {
    id: 'elf', name: 'Elf', size: 'Medium', speed: 30, darkvision: 60,
    desc: 'Graceful, long-lived people touched by the Feywild, who meditate instead of sleeping.',
    traits: [
      t('Darkvision', 'Darkvision with a range of 60 ft (Drow: 120 ft).'),
      t('Elven Lineage', 'Choose Drow, High Elf or Wood Elf, each with its own magic.'),
      t('Fey Ancestry', 'Advantage on saves to avoid or end the Charmed condition.'),
      t('Keen Senses', 'Proficiency in Insight, Perception or Survival.'),
      t('Trance', 'You don\'t need sleep; a Long Rest takes 4 hours of meditation.'),
    ],
    choices: [
      { id: 'lineage', name: 'Elven Lineage', options: [
        { id: 'drow', name: 'Drow', desc: 'Darkvision 120 ft; Dancing Lights cantrip (Faerie Fire at 3, Darkness at 5).', darkvision: 120, cantrip: 'dancing-lights' },
        { id: 'high', name: 'High Elf', desc: 'Prestidigitation cantrip, swappable after a Long Rest (Detect Magic at 3, Misty Step at 5).', cantrip: 'prestidigitation' },
        { id: 'wood', name: 'Wood Elf', desc: 'Speed 35 ft; Druidcraft cantrip (Longstrider at 3, Pass without Trace at 5).', speed: 35, cantrip: 'druidcraft' },
      ] },
      { id: 'keen-senses', name: 'Keen Senses', type: 'skill', options: ['insight', 'perception', 'survival'] },
    ],
  },
  {
    id: 'gnome', name: 'Gnome', size: 'Small', speed: 30, darkvision: 60,
    desc: 'Small, inventive and endlessly curious folk with a knack for magic.',
    traits: [
      t('Darkvision', 'Darkvision with a range of 60 ft.'),
      t('Gnomish Cunning', 'Advantage on Intelligence, Wisdom and Charisma saving throws.'),
      t('Gnomish Lineage', 'Forest Gnome or Rock Gnome.'),
    ],
    choices: [{ id: 'lineage', name: 'Gnomish Lineage', options: [
      { id: 'forest', name: 'Forest Gnome', desc: 'Minor Illusion cantrip; cast Speak with Animals a few times per day.', cantrip: 'minor-illusion' },
      { id: 'rock', name: 'Rock Gnome', desc: 'Mending and Prestidigitation cantrips; build tiny clockwork devices.', cantrip: 'mending' },
    ] }],
  },
  {
    id: 'goliath', name: 'Goliath', size: 'Medium', speed: 35,
    desc: 'Towering folk with the blood of giants and supernatural boons from their ancestry.',
    traits: [
      t('Giant Ancestry', 'Choose a supernatural boon from your giant ancestors. Uses = Proficiency Bonus per Long Rest.'),
      t('Large Form', 'Bonus Action: become Large for 10 minutes, once per Long Rest.', 5),
      t('Powerful Build', 'Advantage on checks to end the Grappled condition; count as one size larger for carrying.'),
    ],
    choices: [{ id: 'ancestry', name: 'Giant Ancestry', options: [
      { id: 'cloud', name: "Cloud's Jaunt", desc: 'Bonus Action: teleport up to 30 ft.' },
      { id: 'fire', name: "Fire's Burn", desc: 'Deal +1d10 Fire damage when you hit.' },
      { id: 'frost', name: "Frost's Chill", desc: 'Deal +1d6 Cold damage and reduce Speed by 10 ft.' },
      { id: 'hill', name: "Hill's Tumble", desc: 'Knock a Large or smaller target Prone when you hit.' },
      { id: 'stone', name: "Stone's Endurance", desc: 'Reaction: reduce damage by 1d12 + CON mod.' },
      { id: 'storm', name: "Storm's Thunder", desc: 'Reaction: deal 1d8 Thunder damage to an attacker.' },
    ] }],
  },
  {
    id: 'halfling', name: 'Halfling', size: 'Small', speed: 30,
    desc: 'Small, cheerful and remarkably lucky folk who slip through danger.',
    traits: [
      t('Brave', 'Advantage on saves to avoid or end the Frightened condition.'),
      t('Halfling Nimbleness', 'Move through the space of any creature larger than you.'),
      t('Luck', 'Reroll a 1 on a D20 Test.'),
      t('Naturally Stealthy', 'Take the Hide action behind a creature at least one size larger.'),
    ],
    choices: [],
  },
  {
    id: 'human', name: 'Human', size: 'Medium', speed: 30,
    desc: 'Ambitious and adaptable, humans get extra skills, an extra feat and Heroic Inspiration.',
    traits: [
      t('Resourceful', 'Gain Heroic Inspiration whenever you finish a Long Rest.'),
      t('Skillful', 'Gain proficiency in one skill of your choice.'),
      t('Versatile', 'Gain an Origin feat of your choice.'),
    ],
    choices: [
      { id: 'skillful', name: 'Skillful', type: 'skill', options: 'any' },
      { id: 'versatile', name: 'Versatile (Origin feat)', type: 'origin-feat' },
    ],
  },
  {
    id: 'orc', name: 'Orc', size: 'Medium', speed: 30, darkvision: 120,
    desc: 'Powerful, tireless people gifted by their god with endurance and drive.',
    traits: [
      t('Adrenaline Rush', 'Bonus Action: Dash and gain Temporary HP equal to your Proficiency Bonus. Uses = Proficiency Bonus per Short or Long Rest.'),
      t('Darkvision', 'Darkvision with a range of 120 ft.'),
      t('Relentless Endurance', 'When reduced to 0 HP but not killed, drop to 1 HP instead, once per Long Rest.'),
    ],
    choices: [],
  },
  {
    id: 'tiefling', name: 'Tiefling', size: 'Medium', speed: 30, darkvision: 60,
    desc: 'Touched by the Lower Planes, with a fiendish legacy that grants magic and resistance.',
    traits: [
      t('Darkvision', 'Darkvision with a range of 60 ft.'),
      t('Fiendish Legacy', 'Abyssal, Chthonic or Infernal legacy: a resistance and innate spells.'),
      t('Otherworldly Presence', 'You know the Thaumaturgy cantrip.'),
    ],
    choices: [{ id: 'legacy', name: 'Fiendish Legacy', options: [
      { id: 'abyssal', name: 'Abyssal', desc: 'Poison resistance; Poison Spray cantrip (Ray of Sickness at 3, Hold Person at 5).', resist: 'poison', cantrip: 'poison-spray' },
      { id: 'chthonic', name: 'Chthonic', desc: 'Necrotic resistance; Chill Touch cantrip (False Life at 3, Ray of Enfeeblement at 5).', resist: 'necrotic', cantrip: 'chill-touch' },
      { id: 'infernal', name: 'Infernal', desc: 'Fire resistance; Fire Bolt cantrip (Hellish Rebuke at 3, Darkness at 5).', resist: 'fire', cantrip: 'fire-bolt' },
    ] }],
  },
];
