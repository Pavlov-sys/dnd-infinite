// Backgrounds (SRD 5.2, CC-BY-4.0). In the 2024 rules your background grants your
// ability score increases, an Origin feat, two skills, a tool and starting gear.
export const BACKGROUNDS = [
  {
    id: 'acolyte', name: 'Acolyte', abilities: ['int', 'wis', 'cha'],
    feat: { id: 'magic-initiate', list: 'cleric' }, skills: ['insight', 'religion'], tool: "Calligrapher's Supplies",
    desc: 'You devoted yourself to service in a temple, learning sacred rites and minor divine magic.',
    equipment: [
      { id: 'A', label: 'Gear', items: [['calligraphers-supplies', 1], ['book', 1], ['amulet', 1], ['parchment', 10], ['robe', 1]], gp: 8 },
      { id: 'B', label: 'Gold', items: [], gp: 50 },
    ],
  },
  {
    id: 'criminal', name: 'Criminal', abilities: ['dex', 'con', 'int'],
    feat: { id: 'alert' }, skills: ['sleight-of-hand', 'stealth'], tool: "Thieves' Tools",
    desc: 'You made a living in dark alleys: picking pockets, burgling and running with a crew.',
    equipment: [
      { id: 'A', label: 'Gear', items: [['dagger', 2], ['thieves-tools', 1], ['crowbar', 1], ['pouch', 2], ['clothes-travelers', 1]], gp: 16 },
      { id: 'B', label: 'Gold', items: [], gp: 50 },
    ],
  },
  {
    id: 'sage', name: 'Sage', abilities: ['con', 'int', 'wis'],
    feat: { id: 'magic-initiate', list: 'wizard' }, skills: ['arcana', 'history'], tool: "Calligrapher's Supplies",
    desc: 'You spent your formative years in libraries and with scholars, studying lore and a little arcane magic.',
    equipment: [
      { id: 'A', label: 'Gear', items: [['quarterstaff', 1], ['calligraphers-supplies', 1], ['book', 1], ['parchment', 8], ['robe', 1]], gp: 8 },
      { id: 'B', label: 'Gold', items: [], gp: 50 },
    ],
  },
  {
    id: 'soldier', name: 'Soldier', abilities: ['str', 'dex', 'con'],
    feat: { id: 'savage-attacker' }, skills: ['athletics', 'intimidation'], tool: 'Gaming Set',
    desc: 'You trained for war from a young age and know the discipline of the battle line.',
    equipment: [
      { id: 'A', label: 'Gear', items: [['spear', 1], ['shortbow', 1], ['arrows', 20], ['dice', 1], ['healers-kit', 1], ['quiver', 1], ['clothes-travelers', 1]], gp: 14 },
      { id: 'B', label: 'Gold', items: [], gp: 50 },
    ],
  },
];
