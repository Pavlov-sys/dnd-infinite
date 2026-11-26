// Guide: what Infinity Codex can do and how to use it. Topics are grouped, searchable, and each
// has a direct link (#guide-<id>) plus a button that goes to the place it describes.
import { h } from './dom.js';
import { icon } from './icons.js';

const TOPICS = [
  // ------------------------------------------------------------ Getting started
  { id: 'start', group: 'Getting started', title: 'Quick start', summary: 'From nothing to a playable character in a few minutes.',
    steps: [
      'Go to **Characters** and click **Create Character**.',
      'Work through the builder steps along the top: **Class → Background → Species → Abilities → Equipment**. Red badges show choices you still need to make.',
      'Open **What’s Next** to check nothing is missing, then click the scroll icon (top right of the builder) to open the character sheet.',
      'Click any number on the sheet to roll it. That’s it, you’re playing.',
    ],
    tips: ['Already have a character on D&D Beyond? See **Import from D&D Beyond** below instead.', 'Back up your characters now and then. They only live in this browser (see **Backup & restore**).'],
    go: ['Create a character', '#home'] },
  { id: 'builder', group: 'Getting started', title: 'The character builder', summary: 'Step-by-step creation, with every choice explained.',
    steps: [
      '**Settings** (the cog step): level, XP or milestone levelling, fixed or rolled Hit Points, which content packs this character can use.',
      '**Class**: pick a class to preview it, then confirm. Below it you choose skills, subclass, feats, spells and other class options as your level allows.',
      '**Background** and **Species**: each preview shows exactly what you get before you confirm.',
      '**Abilities**: standard array, point buy or manual entry. The breakdown shows where every bonus comes from, and you can override a score if your table does something different.',
      '**Equipment**: take the starting gear or the gold, then add anything else from the catalogue.',
    ],
    tips: ['Click **❔ Explain** blocks anywhere in the builder for the rules behind a choice.', 'You can come back any time: **Edit** on a character card, or **✎ Edit** on the sheet.'] },
  { id: 'ddb', group: 'Getting started', title: 'Import from D&D Beyond', summary: 'Bring a character over using D&D Beyond’s PDF export.',
    steps: [
      'On D&D Beyond, open the character and use **Export to PDF** (not your browser’s Print to PDF). Download the file.',
      'Here, go to **Characters → Import from D&D Beyond** and choose the PDF (or drop it on the page).',
      'Read the preview: what matched, what was created as a placeholder, and any number that differs from the D&D Beyond sheet.',
      '**Wizards:** the PDF lists the whole spellbook but not which spells are prepared, so tick the prepared ones in the checklist.',
      'Click **Import character**, then compare the sheet with D&D Beyond and fix anything in the builder.',
    ],
    tips: ['Anything your content doesn’t have (a homebrew species, a feat…) becomes a placeholder in **Homebrew → My Homebrew**, built from the sheet, so the character still works. Edit the placeholders later if you like.', 'The PDF is read in your browser and never uploaded anywhere.'],
    go: ['Go to Characters', '#home'] },
  { id: 'cards', group: 'Getting started', title: 'My Characters', summary: 'Your roster: most recently used first.',
    steps: [
      'Each card shows the character’s class, level, current Hit Points and whether any builder choices are left.',
      '**View** opens the sheet, **Edit** opens the builder, **Copy** duplicates the character (handy for trying a different build), **Delete** removes it from this browser.',
      'Cards take visible damage below half HP: scuffs, claw marks and blood, getting worse below a quarter, and torn at 0 HP.',
      'Type the campaign a character is playing in straight into the **Add campaign…** box on its card. Names you’ve used before are suggested as you type.',
    ],
    tips: ['The outline colour follows the class. You can change the sheet’s frame colour in **Customize**.'] },
  // ------------------------------------------------------------ At the table
  { id: 'rolling', group: 'At the table', title: 'Rolling dice', summary: 'Click a number and it rolls with the right bonus.',
    steps: [
      'Click an ability modifier, save, skill, initiative, attack or damage value on the sheet to roll it.',
      'Results appear in the **dice tray** (the die button, bottom right), with a history of recent rolls.',
      'In the tray you can roll any dice yourself and switch the next roll to **Advantage** or **Disadvantage**.',
      'Advantage and disadvantage you set in **Adjust** apply automatically to the matching rolls (a small badge shows on those buttons).',
    ],
    tips: ['Turn **Animated dice** or **Dice sounds** off in the dice tray settings.', 'Exhaustion is applied for you: −2 per level to every d20 roll from the sheet.'] },
  { id: 'hp', group: 'At the table', title: 'Hit Points, damage and death saves', summary: 'Track health without doing arithmetic.',
    steps: [
      'Type an amount in the Hit Points box and click **HEAL** or **DAMAGE**. Damage takes Temporary HP first.',
      'Set Temporary HP in the **TEMP** field.',
      'At 0 HP the box switches to death saves: click to roll, or mark successes and failures yourself.',
    ],
    tips: ['Made a mistake? Click **Undo** in the pop-up (bottom left) or press Ctrl+Z.'] },
  { id: 'rests', group: 'At the table', title: 'Short and Long Rests', summary: 'Spend Hit Dice and recover features.',
    steps: [
      '**⛺ Short Rest**: roll Hit Dice one at a time (each heals 1 Hit Die + CON), then **Finish Short Rest** to recover short-rest features and Pact Magic slots.',
      '**☾ Long Rest**: restores all Hit Points, all spent Hit Dice, spell slots and features, and removes one level of Exhaustion.',
    ] },
  { id: 'spells', group: 'At the table', title: 'Spells', summary: 'Cast, track slots and manage what’s prepared.',
    steps: [
      'Open the **Spells** tab. Spells are grouped by level, with your slots shown as boxes next to each level.',
      '**CAST** spends a slot and rolls the spell for you: the attack, then the damage (doubled dice on a natural 20), and it tells you the save DC. Cantrips roll from **AT WILL**. Untick **Roll when casting** if you prefer to roll yourself.',
      'Spells that get stronger with a higher slot also appear under higher levels, already scaled, with a small badge showing their real level. Click a slot box to mark or clear a slot by hand.',
      'Click a spell’s row to read its full description and options.',
      'Wizards: the **Spellbook** section lists spells you know but haven’t prepared. Use **PREP** to prepare one, or open a prepared spell and click **Unprepare**.',
      'Spells from feats and features show where they come from; free once-per-Long-Rest casts have a **USE** button.',
    ],
    tips: ['To add a spell outside the normal rules (a scroll, a DM gift), use **⚙ Adjust → Spells**.', 'If you’re over your prepared limit the count turns red, with a warning at the top of the sheet.'] },
  { id: 'concentration', group: 'At the table', title: 'Concentration', summary: 'Never forget what you’re concentrating on.',
    steps: [
      'Casting a Concentration spell shows a blue **Concentrating on…** bar at the top of the sheet. Casting another one ends the first, as the rules say.',
      'When you take damage, a window asks for the Constitution save: DC 10 or half the damage, whichever is higher. **Roll CON save** rolls it and ends concentration if you fail, or mark **I made it** / **I failed** if you rolled at the table.',
      'Dropping to 0 HP or finishing a Long Rest ends concentration. **End** on the bar ends it any time.',
    ] },
  { id: 'conditions', group: 'At the table', title: 'Conditions and Exhaustion', summary: 'Mark what’s affecting you.',
    steps: [
      'Click the **Conditions** box on the sheet to tick conditions like Poisoned or Prone, each with its rules text.',
      'Set the **Exhaustion level** in the same window. Each level gives −2 to d20 rolls and −5 ft of Speed, both applied automatically.',
    ] },
  { id: 'adjust', group: 'At the table', title: 'Quick adjustments (Adjust)', summary: 'Change numbers and add things without opening the builder.',
    steps: [
      'Click **⚙ Adjust** on the sheet to open the side panel.',
      'Add a **BONUS** to any number, override it entirely, or change a proficiency (none, proficient, expertise).',
      'Set **Advantage & Disadvantage** for specific rolls (for example, Stealth from armour, or saves from a magic item).',
      'Add spells and items (weapons, armour, clothing, gear, magic items, or a custom item) from the same panel.',
    ],
    tips: ['Adjusted numbers keep their breakdown, so you can always see what was changed.'] },
  { id: 'inventory', group: 'At the table', title: 'Inventory and coins', summary: 'Equip, carry and spend.',
    steps: [
      'Open the **Inventory** tab. Tick items to equip them; armour and shields update your AC, weapons appear under Actions.',
      'Coins are tracked by type. Carrying capacity follows the 2024 rules (Strength × 15 lb, adjusted for size).',
      '**DRINK** a healing potion to roll it and heal (Potion of Healing 2d4+2, up to Supreme 10d4+20). **THROW** Acid, Alchemist’s Fire or Holy Water to roll the damage and see the save DC. **USE** other potions, scrolls, rations and the like. Each takes one from the stack.',
    ] },
  { id: 'ammo', group: 'At the table', title: 'Ammunition', summary: 'Arrows, bolts and bullets count themselves.',
    steps: [
      'Bows, crossbows, slings and other Ammunition weapons show how many pieces you have next to the attack (for example **Arrows: 17**).',
      'Each attack roll uses one. You get a warning when you’re running low or out.',
      'After the fight, click **↺ Recover** to get back half of what you fired, as the rules allow.',
    ],
    tips: ['Ammunition comes from your Inventory: add Arrows, Bolts, Sling Bullets or Needles there.'] },
  { id: 'undo', group: 'At the table', title: 'Undo', summary: 'Take back any change on the sheet.',
    steps: [
      'After any change (damage, healing, slots, rests, conditions, items, level-ups) a pop-up appears bottom left saying what changed.',
      'Click **Undo** to reverse it. Keep clicking to go back further; the small number shows how many steps are available.',
      'Or press **Ctrl+Z** (**Cmd+Z** on a Mac) while on the sheet.',
    ],
    tips: ['Text you type in notes boxes has its own undo, as usual.'] },
  { id: 'levelup', group: 'At the table', title: 'Levelling up', summary: 'A guided level-up with roll back.',
    steps: [
      'Click **⬆ Level Up** on the sheet.',
      '**What’s new** lists the features you gain and every improvement: proficiency bonus, spell slots, prepared spells, feature uses, feats.',
      '**Hit Points**: take the average or roll the die, and see your new maximum before confirming.',
      '**Choices**: anything new to pick (a feat, a subclass, spells) links straight to the right place in the builder.',
    ],
    tips: ['Changed your mind? Open **Level Up** again and choose **Roll back**. The character returns exactly to how they were before levelling.'] },
  { id: 'customize', group: 'At the table', title: 'Customize the sheet', summary: 'Colours, frames and backgrounds.',
    steps: [
      'Click **🎨 Customize** on the sheet.',
      'Pick a background theme or upload your own image, set the accent and frame colours, and adjust the layout.',
      'Save your choices as the default for new characters if you like them.',
    ] },
  { id: 'export', group: 'At the table', title: 'Export and share', summary: 'Take a character elsewhere.',
    steps: [
      'Click **⇩ Export** on the sheet, then **Download .json** or **Copy JSON**.',
      'Anyone with Infinity Codex can bring it in with **Characters → Import**.',
    ] },
  // ------------------------------------------------------------ Content
  { id: 'compendium', group: 'Content', title: 'Compendium and Library', summary: 'Every rule, spell, monster and item you have.',
    steps: [
      '**Compendium** opens on the **Library**: every book and homebrew pack you have, with covers. Click one to see its contents, or switch it on or off.',
      'The other tabs list spells, monsters, equipment, magic items, classes, subclasses, species, backgrounds, feats and rules, each with search and filters.',
      'Click an entry to read it in full. Monsters have clickable stat blocks.',
    ],
    tips: ['Switched-off packs disappear from the builder and the compendium, but characters already using them keep working.'],
    go: ['Open the Compendium', '#compendium'] },
  { id: 'homebrew', group: 'Content', title: 'Homebrew packs', summary: 'Make, share and import your own content.',
    steps: [
      'Go to **Homebrew**. **My Homebrew** holds your own entries; **My Packs** groups them into packs you can share.',
      '**New pack** creates a pack with a name, author, colour and optional cover image. Packs show up in the Library.',
      'To share a pack, export it as a file and send it. Friends import it with **Import homebrew** (file, paste, or drop it on the page).',
      'Import also accepts **5etools homebrew files**.',
    ],
    tips: ['Any compendium entry can be copied into your homebrew as a starting point (**Make an editable copy…**).'],
    go: ['Open Homebrew', '#homebrew'] },
  { id: 'hbbuilder', group: 'Content', title: 'Homebrew Builder', summary: 'Create anything step by step: classes, subclasses, species, spells, items, monsters…',
    steps: [
      'In **Homebrew**, open the **Homebrew Builder** and pick what you want to make.',
      'Fill in the steps like the character builder. A live preview shows how it will look.',
      'Start from scratch, or **Start from…** an existing entry and change what you need.',
      'Choose which pack it goes into and save. It’s immediately usable in the character builder.',
    ],
    tips: ['Drafts save automatically, so you can leave and come back.'] },
  // ------------------------------------------------------------ Your data
  { id: 'backup', group: 'Your data', title: 'Backup & restore', summary: 'Keep your characters safe and move them between devices.',
    steps: [
      'Everything is saved only in this browser. Clearing browsing data, private windows, or a new device or browser means starting empty.',
      'On **Characters**, click **Backup → Download** to save one file with all your characters, homebrew, portraits and settings.',
      'To restore, click **Backup → Choose file** (or drop the backup file on the Characters page). **Merge** keeps what’s here and adds or updates from the backup; **Replace** makes this browser match the backup exactly.',
    ],
    tips: ['A reminder appears on Characters when you haven’t backed up in a while.', 'This is also how you move everything to another computer or phone.'],
    go: ['Back up now', '#home'] },
  { id: 'offline', group: 'Your data', title: 'Offline single-file version', summary: 'The whole app in one file.',
    steps: [
      'Release downloads include **infinity-codex.html**: the complete app in a single file.',
      'Double-click it to use Infinity Codex offline, straight from your computer. Its characters are kept separately from the website’s; use **Backup** to move them between the two.',
    ] },
  { id: 'shortcuts', group: 'Your data', title: 'Keyboard shortcuts and locking', summary: 'Small things that save time.',
    steps: [
      '**Ctrl+Z / Cmd+Z** on a sheet: undo the last change.',
      '**Esc**: close the side panel or a dialog.',
      'The **lock** button (top right) locks Infinity Codex on this device until the passkey is entered again.',
    ] },
];

/** **bold** only (the shared rich() would also turn a short first sentence into a heading). */
const md = (text) => text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? h('b', {}, part) : part));

const GROUPS = [...new Set(TOPICS.map((t) => t.group))];
const textOf = (t) => [t.title, t.summary, ...(t.steps || []), ...(t.tips || [])].join(' ').toLowerCase();

export function renderGuide(root, topicId) {
  let query = '';
  const content = h('div.guide-content');
  const side = h('nav.guide-side');
  const draw = () => {
    const q = query.trim().toLowerCase();
    const list = TOPICS.filter((t) => !q || textOf(t).includes(q));
    side.replaceChildren(...GROUPS.map((g) => {
      const items = list.filter((t) => t.group === g); if (!items.length) return null;
      return h('div.gs-group', {}, h('h4', {}, g), ...items.map((t) => h('a', { href: `#guide-${t.id}`, onclick: (e) => { e.preventDefault(); jump(t.id); } }, t.title)));
    }).filter(Boolean));
    content.replaceChildren(...(list.length ? GROUPS.flatMap((g) => {
      const items = list.filter((t) => t.group === g); if (!items.length) return [];
      return [h('h2.guide-group', {}, g), ...items.map(card)];
    }) : [h('p.muted', {}, `Nothing in the guide mentions “${query}”.`)]));
  };
  const card = (t) => h('section.guide-card', { id: `g-${t.id}` },
    h('div.gc-head', {}, h('h3', {}, t.title), h('p', {}, t.summary)),
    h('ol.gc-steps', {}, t.steps.map((s) => h('li', {}, ...md(s)))),
    t.tips?.length ? h('div.gc-tips', {}, h('b', {}, 'Tips'), h('ul', {}, t.tips.map((s) => h('li', {}, ...md(s))))) : null,
    t.go ? h('a.btn.small.ghost.gc-go', { href: t.go[1] }, `${t.go[0]} ›`) : null);
  const jump = (id) => {
    const el = document.getElementById(`g-${id}`); if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    history.replaceState(null, '', `#guide-${id}`);
  };
  root.replaceChildren(h('div.guide', {},
    h('header.guide-head', {},
      h('div', {}, h('h1', {}, 'Guide'), h('p.muted', {}, 'Everything Infinity Codex can do, and how to do it.')),
      h('label.guide-search', {}, icon('search'), h('input', { type: 'search', placeholder: 'Search the guide…', 'aria-label': 'Search the guide', oninput: (e) => { query = e.target.value; draw(); } }))),
    h('div.guide-body', {}, side, content)));
  draw();
  if (topicId) setTimeout(() => jump(topicId), 60);
}
