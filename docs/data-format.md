# Content data format

All game content, built-in or homebrew, uses the same shapes. Built-in data lives in `js/data/srd/*.js`. Homebrew packs are JSON:

```json
{
  "id": "my-pack", "name": "My Homebrew", "version": "1.0.0", "author": "You", "license": "CC-BY-4.0",
  "content": {
    "classes": [], "subclasses": [], "species": [], "backgrounds": [], "feats": [], "spells": [], "items": [], "monsters": []
  }
}
```

An entry with the same `id` as an existing one replaces it. Every entry needs `id` (kebab-case) and `name`.

## Class
| field | example | notes |
|---|---|---|
| `hitDie` | `10` | |
| `primary`, `saves` | `["str"]` | ability ids: str dex con int wis cha |
| `skillChoices` | `{ "count": 2, "from": ["athletics"] }` | `from` may be `"any"` |
| `armor` | `["light","medium","heavy","shield"]` | |
| `weapons` | `["simple","martial"]` | also `martial-light`, `martial-finesse-light` |
| `caster` | `{ "type": "full", "ability": "int", "list": "wizard", "cantrips": [20 numbers], "prepared": [20 numbers] }` | type: full, half, pact |
| `unarmoredDefense` | `"con"` | adds that mod to 10 + DEX without armor |
| `asiLevels` | `[4,8,12,16]` | level 19 Epic Boon is automatic |
| `subclassLevel` | `3` | |
| `resources` | `{ "id", "name", "reset": "short"/"long", "uses": number / [20 numbers] / "level" / "5*level" / ability id }` | |
| `choices` | see below | |
| `equipment` | `[{ "id": "A", "label": "Gear", "items": [["longsword", 1]], "gp": 10 }]` | |
| `features` | `[{ "level": 1, "name": "…", "desc": "…" }]` | |
| `subclasses` | `[{ "id", "name", "desc", "features": [...], "grants": { "hpPerLevel": 1, "unarmoredDefense": "cha" } }]` | |

Class `choices` types: `option` (pick one of `options`, each may `grant` `{armor, weapons, extraCantrips}`), `feat` (pick a feat of `category`), `weapon-mastery` (`count` by level), `expertise` (`count` by level).

## Subclass (in a pack)
Same as a class's `subclasses` entry plus `"classId": "fighter"`.

## Species
`size`, `speed`, `darkvision`, `hpPerLevel`, `resist`, `traits: [{name, desc, level}]`, `choices: [{ id, name, options: [{id, name, desc, speed?, darkvision?, resist?, cantrip?}] }]`. Choice `type` may be `skill` (options = skill ids or `"any"`) or `origin-feat`.

## Background
`abilities` (three ids), `feat: { id, list? }`, `skills` (two ids), `tool`, `desc`, `equipment` (as for classes).

## Feat
`category`: `origin`, `general`, `fighting-style`, `epic-boon`. Optional `choices`: `spell-list`, `cantrip {count}`, `spell {level,count}`, `ability {options}`, `ability-plus1 {options, max}`, `skill {count}`, `asi`. Optional `effects`: `initiativeProf`, `armoredAC`, `rangedAttack`.

## Spell
`level` (0 = cantrip), `school`, `time`, `range`, `components`, `duration`, `classes` (list ids), `desc`, `concentration`, `ritual`, optional `damage` ("2d6 fire"), `save` (ability id), `attack` (bool).

## Item
- weapon: `type: "weapon"`, `category` (simple/martial), `kind` (melee/ranged), `damage`, `dtype`, `props`, `mastery`, `range`, `versatile`
- armor: `type: "armor"`, `armorType` (light/medium/heavy/shield), `ac`, `strReq`, `stealthDis`
- gear: `type: "gear"`, `desc`
- all: `cost` (GP), `weight` (lb)
- magic item: `type: "magic-item"`, `category`, `rarity`, `attunement`, `desc`

Any entry may carry `text` (full rules text, rendered with paragraphs, `**bold**` run-ins, `- ` bullets and `a | b` table rows); `desc` stays the one-line summary.

## Monster
`size`, `kind`, `alignment`, `ac`, `hp`, `hitDice`, `speed` (text), `scores` (6 numbers), `saves` (`{ "dex": 5 }`), `skills` (`{ "Perception": 4 }`), `resist`, `immune`, `vulnerable`, `conditionImmune`, `senses`, `languages`, `cr`, `xp`, and lists `traits`, `actions`, `bonusActions`, `reactions`, `legendary` of `{ name, desc }`. Dice like "7 (1d8 + 3)" and "Attack Roll: +5" in descriptions become roll buttons.

## Shared pack files
A pack downloaded from Homebrew or the Library is one JSON file:
`{ "format": "dnd-infinite-pack", "formatVersion": 1, "id", "name", "author", "version", "description", "license", "color", "exported", "content": { "spells": [...], "items": [...], ... } }`.
`content` keys are `classes`, `subclasses`, `species`, `backgrounds`, `feats`, `spells`, `items` and `monsters`; every entry needs `id` and `name`. Importing a file whose `id` matches a pack already in the Library replaces it (an update). Packs you create in Homebrew are stored with `own: true` and can be edited; imported ones are read-only until you copy them into one of your packs.

## Sheet adjustments (saved with the character)
`custom: { prof, bonus, override, adv }`. Keys are `ac`, `initiative`, `speed`, `hp`, `skill:<id>`, `save:<ability>`, `passive:perception|insight|investigation`, `spell:attack`, `spell:dc`. `prof` takes `none`, `half`, `prof` or `expert` for skills and `prof` or `none` for saves; `bonus` is added to the calculated value; `override` replaces it. `adv` is a list of `{ id, kind: 'adv' | 'dis', target, note }`, where target is one of `save:all`, `save:<ability>`, `check:all`, `check:<ability>`, `skill:<id>`, `initiative`, `attack:all`, `attack:weapon`, `attack:spell`, `death`, `concentration`. Inventory entries may carry `label`, `weight` and `notes`; custom items use the Item fields above under `custom`.

## Imported placeholders
Entries created by the D&D Beyond importer carry `"imported": "ddb"` and `"sourceName": "D&D Beyond import"`. They are ordinary entries otherwise. Later imports reuse them by name, and Export leaves them unticked by default.

## Importing other formats

`js/engine/importers.js` also accepts:
- a single entry or an array of entries (the type is guessed from its fields, or set `"kind": "spells"` etc.);
- **5etools homebrew JSON** (`_meta` plus `spell`, `feat`, `background`, `race`, `subclass` + `subclassFeature`, `item`, `monster`). Inline tags like `{@damage 2d6}` are converted to plain text. Full classes aren't supported yet.

Plain text pasted into the editor ("Paste text…") is parsed by `parseText()` for spells, feats, subclasses and species.
