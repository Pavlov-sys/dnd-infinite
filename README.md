# ∞ DND Infinite

**An open-source character builder and digital character sheet for 5th edition fantasy roleplaying (2024 rules / SRD 5.2).**

DND Infinite is a free, community-driven alternative to proprietary character tools. Build a character step by step, with every choice explained, and play from a sheet that does the math and rolls the dice for you. Add your own homebrew as content packs.


## Features (v0.1)

- **Character builder** (Settings → Class → Background → Species → Abilities → Equipment → What's Next), levels 1–20: searchable class/species lists with preview-then-confirm, collapsible feature sections with red badges for unfinished choices, portrait upload and name suggestions, score-calculation breakdown with overrides, equipment-or-gold, per-character sources and settings (milestone/XP, fixed/rolled HP)
  - All 12 classes with one subclass each, 9 species, 4 backgrounds, origin/general/fighting-style feats and epic boons (SRD 5.2)
  - Standard Array, Point Buy, 4d6-drop-lowest rolling, or manual scores; 2024 background ability increases
  - Skills, Expertise, Weapon Mastery, Divine/Primal Order, subclasses, ASIs and feats with their sub-choices (e.g. Magic Initiate spells)
  - Starting equipment options for class and background
- **Character sheet** in a dark, framed layout like D&D Beyond's: auto-calculated AC, HP, saves, skills, passives, attacks, spell DC and slots
  - Actions tab split into Attacks, Actions, Bonus Actions, Reactions, Other and Limited Use, each listing the weapons, spells, combat actions and class features that use it
  - **⚙ Adjust** on every sheet (and ⚙ on Saving Throws, Senses, Skills and AC): change any number, set proficiency or expertise by hand, add advantage or disadvantage that's applied when you roll, add or remove spells and prepared spells, and add catalogue or custom items (clothes, weapons, armor, gear, magic items) — all in a side panel that matches the sheet
  - **Customize** button on every sheet: dark or light mode, accent colour, 8 built-in backgrounds or your own uploaded image (recommended 2560 × 1440, 16:9; at least 1920 × 1080) with darken, blur and focus controls, whole-page background, panel opacity, frame style and text size; save a look as the default for new characters
  - Spells tab with casting time, range, hit/DC, effect and notes columns, per-level slot boxes, search and level filters; Background and Notes tabs
  - Click any modifier to roll: animated dice tumble across the screen (with optional sound) and land on the result; dice tray with advantage/disadvantage and custom rolls
  - HP tracking with temp HP, death saves, conditions and exhaustion, limited-use features, spell slots
  - Short and Long Rests, inventory with equip toggles, currency, encumbrance
- **Full SRD 5.2**: all 339 spells, 341 monsters with clickable stat blocks, 262 magic items, all equipment, and the complete rules text of every class feature, trait and feat
- **Optional content packs** (openly licensed, switchable): 4 new classes (Mechanist, Witch, Vanguard, Theurge), 100+ new subclasses, 34 species options, 26 backgrounds, 14 feats, 900+ extra spells, 1,000+ magic items and 1,900+ extra monsters from Tome of Heroes, Black Flag, Tal'Dorei, Level Up: Advanced 5E, Deep Magic, Vault of Magic, Tome of Beasts and more
- **Compendium**: searchable and filterable spells (level, class, school), monsters (CR, type), equipment, magic items (rarity), classes, species, backgrounds, feats and rules
- **Homebrew**: import by drag-and-drop, file, paste or URL with a preview (DND Infinite packs and **5etools homebrew files**), export any selection as a named pack, "Copy to My Homebrew" from any compendium entry, "Start from…" an existing entry, paste-text quick fill, and auto-saved drafts
- **Homebrew editor**: form-based creation of subclasses, species, backgrounds, feats, spells, items, magic items and monsters (classes via JSON), with live preview; saved to a personal pack, plus import/export of shareable content packs
- **Import from D&D Beyond**: choose the PDF from D&D Beyond's “Export to PDF” and the character is rebuilt here — class, subclass, species, background, ability scores, skills and Expertise, feats (with Magic Initiate spells), spells, inventory, coins, HP and personality. Anything your content doesn't have (a homebrew class, a species, a background, feats, spells) becomes a placeholder in My Homebrew built from the sheet itself — features text, proficiencies, hit die, spell slots, speed — so the character works as is and you can edit the placeholders later. A preview shows what matched, what was created, and any number that differs from the original sheet. The PDF is read in the browser and never uploaded.
- **Import/export** characters as JSON; everything is stored locally in your browser

## Running it

**Easiest:** double-click **`dnd-infinite.html`** (included in release zips). It's the whole app in one file and works offline straight from your disk. Characters and homebrew are saved in your browser.

To build that file yourself (needs [Bun](https://bun.sh)):

```bash
bun tools/build-standalone.mjs      # writes dnd-infinite.html
```

**For development** there's no build step: serve the folder with any static web server:

```bash
python3 -m http.server 8080      # then open http://localhost:8080
# or: npx serve .
```

(Opening `index.html` directly from disk won't work, because browsers block ES modules on `file://`; it shows a note pointing you to `dnd-infinite.html`.)

Regenerate the bundled data (only needed when updating it):

```bash
git clone --depth 1 https://github.com/5e-bits/5e-database /tmp/5e-database
python3 tools/import-srd.py /tmp/5e-database/src/2024/en
git clone --depth 1 https://github.com/open5e/open5e-api /tmp/open5e-api
python3 tools/import-open5e.py /tmp/open5e-api/data/v2
```

Run the tests with Node 18+:

```bash
node --test tests/*.test.js
```

## Project layout

```
index.html            App shell
css/app.css           All styles
js/main.js            Hash router
js/engine/            Pure logic: rules.js (derived stats), dice.js, store.js (persistence),
                      importers.js (homebrew formats), pdf-fields.js + ddb-import.js (D&D Beyond PDFs)
js/data/index.js      Content registry (SRD + homebrew packs merged)
js/data/srd/          SRD 5.2 data as plain JS objects
js/ui/                Views: home, builder, sheet, compendium, homebrew, dice tray
docs/data-format.md   Content schema for data and homebrew packs
tests/                node:test unit tests
```

The **rules engine has no DOM dependencies**, so it can be reused by a future server, VTT plugin or mobile app.

## Legal

- **Code**: MIT License (see `LICENSE`).
- **Game content**: from the System Reference Document 5.2 by Wizards of the Coast LLC (CC-BY-4.0), plus optional packs under CC-BY-4.0 or the OGL 1.0a. See `ATTRIBUTION.md` and `LICENSES/`.
- DND Infinite is an unofficial fan project, **not** affiliated with, endorsed by or sponsored by Wizards of the Coast or D&D Beyond. "Dungeons & Dragons" and "D&D" are trademarks of Wizards of the Coast. Do not add non-open published content to this repository. Homebrew packs you keep privately are your own business; packs contributed here must be original or openly licensed.

## Roadmap

See `ROADMAP.md`. Contributions welcome — see `CONTRIBUTING.md`.
