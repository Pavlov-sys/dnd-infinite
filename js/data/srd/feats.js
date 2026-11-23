// Feats (SRD 5.2, CC-BY-4.0). Categories: origin, general, fighting-style, epic-boon.
// `choices` drive the builder UI; `effects` are read by the rules engine.
export const FEATS = [
  { id: 'alert', name: 'Alert', category: 'origin', desc: 'Add your Proficiency Bonus to Initiative, and you can swap Initiative with a willing ally.', effects: { initiativeProf: true } },
  { id: 'magic-initiate', name: 'Magic Initiate', category: 'origin', repeatable: true,
    desc: 'Learn two cantrips and one level 1 spell from the Cleric, Druid or Wizard list. Cast the level 1 spell once per Long Rest for free. Choose INT, WIS or CHA as the spellcasting ability.',
    choices: [{ id: 'list', type: 'spell-list', options: ['cleric', 'druid', 'wizard'] }, { id: 'cantrips', type: 'cantrip', count: 2 }, { id: 'spell', type: 'spell', level: 1, count: 1 }, { id: 'ability', type: 'ability', options: ['int', 'wis', 'cha'] }] },
  { id: 'savage-attacker', name: 'Savage Attacker', category: 'origin', desc: 'Once per turn when you hit with a weapon, roll its damage dice twice and use either roll.' },
  { id: 'skilled', name: 'Skilled', category: 'origin', repeatable: true, desc: 'Gain proficiency in any combination of three skills or tools.',
    choices: [{ id: 'skills', type: 'skill', count: 3 }] },

  { id: 'ability-score-improvement', name: 'Ability Score Improvement', category: 'general', repeatable: true, level: 4,
    desc: 'Increase one ability score by 2, or two ability scores by 1 (max 20).', choices: [{ id: 'asi', type: 'asi' }] },
  { id: 'grappler', name: 'Grappler', category: 'general', level: 4, prereq: 'Strength or Dexterity 13+', requires: { anyOf: { str: 13, dex: 13 } },
    desc: '+1 STR or DEX. Damage and grapple with one Unarmed Strike, Advantage on attacks against creatures you grapple, and move them at no extra cost.',
    choices: [{ id: 'ability', type: 'ability-plus1', options: ['str', 'dex'] }] },

  { id: 'archery', name: 'Archery', category: 'fighting-style', desc: '+2 to attack rolls with Ranged weapons.', effects: { rangedAttack: 2 } },
  { id: 'defense', name: 'Defense', category: 'fighting-style', desc: '+1 AC while wearing Light, Medium or Heavy armor.', effects: { armoredAC: 1 } },
  { id: 'great-weapon-fighting', name: 'Great Weapon Fighting', category: 'fighting-style', desc: 'Treat 1s and 2s on damage dice as 3s with Two-Handed or Versatile melee weapons held in two hands.' },
  { id: 'two-weapon-fighting', name: 'Two-Weapon Fighting', category: 'fighting-style', desc: 'Add your ability modifier to the damage of the extra attack from a Light weapon.' },

  { id: 'boon-of-combat-prowess', name: 'Boon of Combat Prowess', category: 'epic-boon', level: 19, desc: '+1 to an ability (max 30). When you miss, you can hit instead, once per turn.', choices: [{ id: 'ability', type: 'ability-plus1', options: 'any', max: 30 }] },
  { id: 'boon-of-dimensional-travel', name: 'Boon of Dimensional Travel', category: 'epic-boon', level: 19, desc: '+1 to an ability (max 30). Teleport 30 ft after the Attack or Magic action.', choices: [{ id: 'ability', type: 'ability-plus1', options: 'any', max: 30 }] },
  { id: 'boon-of-fate', name: 'Boon of Fate', category: 'epic-boon', level: 19, desc: '+1 to an ability (max 30). Add or subtract 2d4 from a nearby D20 Test once per rest.', choices: [{ id: 'ability', type: 'ability-plus1', options: 'any', max: 30 }] },
  { id: 'boon-of-irresistible-offense', name: 'Boon of Irresistible Offense', category: 'epic-boon', level: 19, desc: '+1 STR or DEX (max 30). Your damage ignores resistance; natural 20s deal extra damage.', choices: [{ id: 'ability', type: 'ability-plus1', options: ['str', 'dex'], max: 30 }] },
  { id: 'boon-of-spell-recall', name: 'Boon of Spell Recall', category: 'epic-boon', level: 19, desc: '+1 INT, WIS or CHA (max 30). Cast a spell of level 1–4 without a slot once per Long Rest.', choices: [{ id: 'ability', type: 'ability-plus1', options: ['int', 'wis', 'cha'], max: 30 }] },
  { id: 'boon-of-the-night-spirit', name: 'Boon of the Night Spirit', category: 'epic-boon', level: 19, desc: '+1 to an ability (max 30). Become Invisible in dim light or darkness; resistance there.', choices: [{ id: 'ability', type: 'ability-plus1', options: 'any', max: 30 }] },
  { id: 'boon-of-truesight', name: 'Boon of Truesight', category: 'epic-boon', level: 19, desc: '+1 to an ability (max 30). Truesight 60 ft.', choices: [{ id: 'ability', type: 'ability-plus1', options: 'any', max: 30 }] },
];
