// Core rules reference data (SRD 5.2, CC-BY-4.0). See ATTRIBUTION.md.
export const ABILITIES = [
  { id: 'str', name: 'Strength', short: 'STR', desc: 'Physical might: lifting, pushing, melee attacks with most weapons.' },
  { id: 'dex', name: 'Dexterity', short: 'DEX', desc: 'Agility and reflexes: ranged and Finesse attacks, AC in light armor, Initiative.' },
  { id: 'con', name: 'Constitution', short: 'CON', desc: 'Health and stamina: adds to your Hit Points every level.' },
  { id: 'int', name: 'Intelligence', short: 'INT', desc: 'Reasoning and memory: Wizard spellcasting, lore skills.' },
  { id: 'wis', name: 'Wisdom', short: 'WIS', desc: 'Perception and insight: Cleric, Druid and Ranger spellcasting.' },
  { id: 'cha', name: 'Charisma', short: 'CHA', desc: 'Force of personality: Bard, Paladin, Sorcerer and Warlock spellcasting.' },
];

export const SKILLS = [
  { id: 'acrobatics', name: 'Acrobatics', ability: 'dex' },
  { id: 'animal-handling', name: 'Animal Handling', ability: 'wis' },
  { id: 'arcana', name: 'Arcana', ability: 'int' },
  { id: 'athletics', name: 'Athletics', ability: 'str' },
  { id: 'deception', name: 'Deception', ability: 'cha' },
  { id: 'history', name: 'History', ability: 'int' },
  { id: 'insight', name: 'Insight', ability: 'wis' },
  { id: 'intimidation', name: 'Intimidation', ability: 'cha' },
  { id: 'investigation', name: 'Investigation', ability: 'int' },
  { id: 'medicine', name: 'Medicine', ability: 'wis' },
  { id: 'nature', name: 'Nature', ability: 'int' },
  { id: 'perception', name: 'Perception', ability: 'wis' },
  { id: 'performance', name: 'Performance', ability: 'cha' },
  { id: 'persuasion', name: 'Persuasion', ability: 'cha' },
  { id: 'religion', name: 'Religion', ability: 'int' },
  { id: 'sleight-of-hand', name: 'Sleight of Hand', ability: 'dex' },
  { id: 'stealth', name: 'Stealth', ability: 'dex' },
  { id: 'survival', name: 'Survival', ability: 'wis' },
];

export const ALIGNMENTS = ['Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'Neutral', 'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil', 'Unaligned'];

export const LANGUAGES = {
  standard: ['Common Sign Language', 'Draconic', 'Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling', 'Orc'],
  rare: ['Abyssal', 'Celestial', 'Deep Speech', 'Druidic', 'Infernal', 'Primordial', 'Sylvan', "Thieves' Cant", 'Undercommon'],
};

export const CONDITIONS = [
  { id: 'blinded', name: 'Blinded', desc: "Can't see; attacks against you have Advantage, your attacks have Disadvantage." },
  { id: 'charmed', name: 'Charmed', desc: "Can't attack the charmer; the charmer has Advantage on social checks with you." },
  { id: 'deafened', name: 'Deafened', desc: "Can't hear." },
  { id: 'exhaustion', name: 'Exhaustion', desc: 'Each level: −2 to D20 Tests and −5 ft Speed. Level 6 is death.' },
  { id: 'frightened', name: 'Frightened', desc: "Disadvantage on checks and attacks while the source is in sight; can't move closer to it." },
  { id: 'grappled', name: 'Grappled', desc: 'Speed 0; Disadvantage on attacks against anyone but the grappler.' },
  { id: 'incapacitated', name: 'Incapacitated', desc: 'No actions, Bonus Actions or Reactions; concentration breaks.' },
  { id: 'invisible', name: 'Invisible', desc: 'Advantage on Initiative; attacks against you have Disadvantage, yours have Advantage.' },
  { id: 'paralyzed', name: 'Paralyzed', desc: 'Incapacitated, Speed 0, fail STR/DEX saves; hits from within 5 ft are crits.' },
  { id: 'petrified', name: 'Petrified', desc: 'Turned to stone: Incapacitated, resistant to all damage.' },
  { id: 'poisoned', name: 'Poisoned', desc: 'Disadvantage on attack rolls and ability checks.' },
  { id: 'prone', name: 'Prone', desc: 'Crawl or spend half your Speed to stand; melee attacks against you have Advantage.' },
  { id: 'restrained', name: 'Restrained', desc: 'Speed 0; Disadvantage on attacks and DEX saves; attacks against you have Advantage.' },
  { id: 'stunned', name: 'Stunned', desc: 'Incapacitated; fail STR/DEX saves; attacks against you have Advantage.' },
  { id: 'unconscious', name: 'Unconscious', desc: 'Incapacitated and Prone, drop what you hold; hits from within 5 ft are crits.' },
];

// Spell slots per level for a full caster (index 0 = character level 1).
export const FULL_CASTER_SLOTS = [
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

// Warlock Pact Magic: [slots, slot level]
export const PACT_SLOTS = [
  [1, 1], [2, 1], [2, 2], [2, 2], [2, 3], [2, 3], [2, 4], [2, 4], [2, 5], [2, 5],
  [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [4, 5], [4, 5], [4, 5], [4, 5],
];

export const POINT_BUY_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
