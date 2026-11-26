#!/usr/bin/env python3
"""
Convert openly licensed third-party 5e content from the Open5e data repository into Infinity Codex content packs.

Usage:
  git clone --depth 1 https://github.com/open5e/open5e-api /tmp/open5e-api
  python3 tools/import-open5e.py /tmp/open5e-api/data/v2

Writes js/data/packs/<pack>.js plus js/data/packs/index.js (the pack catalog) and LICENSES/OGL-1.0a.txt.
Only documents published under the OGL 1.0a or CC-BY-4.0 are imported. Older (2014-rules) options are adapted
to the 2024 rules where the two disagree (subclass levels, species ability scores, backgrounds); each adapted
entry says so in its text.
"""
import json, os, re, sys

SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/open5e-api/data/v2'
ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT = os.path.join(ROOT, 'js', 'data', 'packs')
os.makedirs(OUT, exist_ok=True)
os.makedirs(os.path.join(ROOT, 'LICENSES'), exist_ok=True)

PUBLISHER = {'kobold-press': 'Open Design LLC d/b/a Kobold Press', 'green-ronin': 'Green Ronin Publishing, LLC', 'open5e': 'Open5e', 'somanyrobots': 'So Many Robots', 'en-publishing': 'EN Publishing'}
SKILLS = ['Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception', 'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine', 'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion', 'Sleight of Hand', 'Stealth', 'Survival']
ABIL = {'strength': 'str', 'dexterity': 'dex', 'constitution': 'con', 'intelligence': 'int', 'wisdom': 'wis', 'charisma': 'cha',
        'str': 'str', 'dex': 'dex', 'con': 'con', 'int': 'int', 'wis': 'wis', 'cha': 'cha'}
SUBCLASS_LEVEL_2014 = {'cleric': 1, 'sorcerer': 1, 'warlock': 1, 'druid': 2, 'wizard': 2}
ORD = {'1st': 1, '2nd': 2, '3rd': 3}

def find_doc(key):
    for pub in os.listdir(SRC):
        p = os.path.join(SRC, pub, key)
        if os.path.isdir(p):
            return pub, p
    raise SystemExit(f'document {key} not found')

def load(doc_path, name):
    p = os.path.join(doc_path, f'{name}.json')
    if not os.path.exists(p):
        return []
    with open(p, encoding='utf-8') as f:
        return [dict(x['fields'], pk=x['pk']) for x in json.load(f)]

def md(text):
    """Open5e markdown → the light markup our rich() renderer understands."""
    if not text:
        return ''
    t = text.replace('\r', '').replace('’', "'").replace('â€™', "'")
    t = re.sub(r'\*\*\*(.+?)\*\*\*', r'**\1**', t)            # ***Name.*** → **Name.**
    t = re.sub(r'^#{1,6}\s*(.+)$', r'**\1**', t, flags=re.M)    # headings → bold lines
    t = re.sub(r'(?<!\*)\*(?!\*)([^*\n]+?)\*(?!\*)', r'\1', t)  # *italic* → plain
    t = re.sub(r'^\s*[*+]\s+', '- ', t, flags=re.M)              # bullets
    t = re.sub(r'^\|?\s*:?-{3,}.*$', '', t, flags=re.M)          # markdown table separator rows
    t = re.sub(r'^\|(.+)\|\s*$', lambda m: ' | '.join(c.strip() for c in m.group(1).split('|')), t, flags=re.M)
    t = re.sub(r'\n{3,}', '\n\n', t)
    return t.strip()

def first_sentence(text, n=170):
    s = re.sub(r'\*\*|\n', ' ', text or '').strip()
    m = re.match(r'(.{20,%d}?[.!?])\s' % n, s + ' ')
    return (m.group(1) if m else s[:n]).strip()

def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower().replace("'", '')).strip('-')

def class_id(ref):
    return ref.split('_', 1)[1] if ref and '_' in ref else ref

# ---------------------------------------------------------------- converters
def convert_spells(doc_path, source):
    TIME = {'action': 'Action', 'bonus-action': 'Bonus Action', 'reaction': 'Reaction'}
    out = []
    for s in load(doc_path, 'Spell'):
        comps = [c for c, on in (('V', s.get('verbal')), ('S', s.get('somatic')), ('M', s.get('material'))) if on]
        comp = ', '.join(comps) or '—'
        if s.get('material_specified'):
            comp += f" ({s['material_specified']})"
        ct = s.get('casting_time') or ''
        time = TIME.get(ct) or re.sub(r'^(\d+)([a-z]+)$', r'\1 \2', ct).replace('-', ' ').capitalize()
        e = {'id': s['pk'], 'name': s['name'], 'level': s.get('level') or 0, 'school': (s.get('school') or '').title(),
             'time': time, 'range': s.get('range_text') or '', 'components': comp, 'duration': (s.get('duration') or '').capitalize(),
             'classes': sorted({class_id(c) for c in s.get('classes') or []}), 'desc': md(s.get('desc')),
             'concentration': bool(s.get('concentration')), 'ritual': bool(s.get('ritual')), 'sourceName': source}
        if s.get('higher_level'):
            e['higherLevel'] = md(s['higher_level'])
        if s.get('damage_roll'):
            e['damage'] = f"{s['damage_roll'].replace(' ', '')} {(s.get('damage_types') or [''])[0]}".strip()
        if s.get('saving_throw_ability'):
            e['save'] = ABIL.get(s['saving_throw_ability'].lower())
        if s.get('attack_roll'):
            e['attack'] = True
        out.append(e)
    return out

def feature_levels(doc_path):
    lv = {}
    for i in load(doc_path, 'ClassFeatureItem'):
        if i.get('level') is not None:
            lv.setdefault(i['parent'], []).append(i['level'])
    return lv

def convert_subclasses(doc_path, source, edition='2014', only=None, rename_class=None):
    classes = load(doc_path, 'CharacterClass')
    feats = load(doc_path, 'ClassFeature')
    lv = feature_levels(doc_path)
    out = []
    for c in classes:
        parent = c.get('subclass_of')
        if not parent or (only and c['pk'] not in only):
            continue
        cid = (rename_class or {}).get(parent, class_id(parent))
        orig_start = SUBCLASS_LEVEL_2014.get(cid, 3) if edition == '2014' else 3
        fs = []
        for f in feats:
            if f['parent'] != c['pk'] or f.get('feature_type') in ('CLASS_TABLE_DATA', 'SPELL_SLOTS', 'PROFICIENCY_BONUS'):
                continue
            levels = sorted(lv.get(f['pk'], []))
            text = md(f.get('desc'))
            if not levels:
                m = re.search(r'\b(?:at|starting at|beginning at|when you reach)\s+(\d+)(?:st|nd|rd|th) level', text, re.I)
                levels = [int(m.group(1))] if m else [orig_start]
            level = levels[0]
            if level < 3:
                text = f'(Originally a level {level} feature; under the 2024 rules you gain it at level 3.)\n' + text
                level = 3
            fs.append({'level': level, 'name': f['name'], 'desc': first_sentence(text.split('\n', 1)[-1] if text.startswith('(Originally') else text), 'text': text})
        fs.sort(key=lambda f: f['level'])
        note = ' Written for the 2014 rules: features from levels 1–2 are gained at level 3.' if edition == '2014' and orig_start < 3 else ''
        out.append({'classId': cid, 'id': c['pk'], 'name': c['name'], 'desc': first_sentence(md(c.get('desc'))) or c['name'],
                    'text': md(c.get('desc')) + (('\n' + note.strip()) if note else ''), 'edition': edition, 'sourceName': source, 'features': fs})
    return out

SKIP_TRAITS = {'Ability Score Increase', 'Age', 'Alignment', 'Size', 'Speed', 'Languages', 'Subrace', 'Subraces', 'Lineage', 'Darkvision', 'Ability Score Increases'}

def convert_species(doc_path, source):
    species = load(doc_path, 'Species')
    traits = load(doc_path, 'SpeciesTrait')
    by_parent = {}
    for t in traits:
        by_parent.setdefault(t['parent'], []).append(t)
    parents = {s['pk']: s for s in species}
    has_children = {s.get('subspecies_of') for s in species if s.get('subspecies_of')}
    out = []
    for s in species:
        if s['pk'] in has_children:
            continue  # parent species are folded into each of their subspecies
        chain = [parents[s['subspecies_of']], s] if s.get('subspecies_of') in parents else [s]
        name = s['name'] if len(chain) == 1 else f"{chain[0]['name']} ({s['name']})"
        size, speed, dark, ts, asi = 'Medium', 30, 0, [], []
        for node in chain:
            for t in by_parent.get(node['pk'], []):
                d = md(t.get('desc'))
                if t['name'] == 'Size':
                    m = re.search(r'\b(Tiny|Small|Medium|Large)\b', d)
                    size = m.group(1) if m else size
                elif t['name'] == 'Speed':
                    m = re.search(r'(\d+)\s*feet', d)
                    speed = int(m.group(1)) if m else speed
                elif t['name'] == 'Darkvision' or t['name'].startswith('Darkvision'):
                    m = re.search(r'(\d+)\s*feet', d)
                    dark = int(m.group(1)) if m else 60
                    ts.append({'name': 'Darkvision', 'desc': first_sentence(d), 'text': d, 'level': 1})
                elif t['name'].startswith('Ability Score Increase'):
                    asi.append(d)
                elif t['name'] not in SKIP_TRAITS:
                    ts.append({'name': t['name'], 'desc': first_sentence(d), 'text': d, 'level': 1})
        intro = '\n\n'.join(md(n.get('desc')) for n in chain if n.get('desc'))
        note = '\nUnder the 2024 rules your ability score increases come from your background, so this species\' original Ability Score Increase is not applied.' if asi else ''
        out.append({'id': s['pk'], 'name': name, 'size': size, 'speed': speed, 'darkvision': dark, 'desc': first_sentence(intro) or name,
                    'text': intro + note, 'traits': ts, 'choices': [], 'edition': '2014', 'sourceName': source})
    return out

def convert_backgrounds(doc_path, source):
    benefits = {}
    for b in load(doc_path, 'BackgroundBenefit'):
        benefits.setdefault(b['parent'], []).append(b)
    out = []
    for bg in load(doc_path, 'Background'):
        bs = benefits.get(bg['pk'], [])
        get = lambda t: [b for b in bs if b.get('type') == t]
        skill_text = ' '.join(md(b.get('desc')) for b in get('skill_proficiency'))
        found = [(m.start(), s) for s in SKILLS for m in [re.search(r'\b' + s + r'\b', skill_text)] if m]
        skills = [slug(s) for _, s in sorted(found)][:2]
        tool = '; '.join(md(b.get('desc')) for b in get('tool_proficiency')) or ''
        equip = '; '.join(md(b.get('desc')) for b in get('equipment'))
        m = re.search(r'(\d+)\s*gp', equip)
        gp = int(m.group(1)) if m else 10
        parts = [md(bg.get('desc'))]
        for b in bs:
            if b.get('type') in ('feature', 'language', 'suggested_characteristics'):
                parts.append(f"**{b.get('name') or b['type'].replace('_', ' ').title()}.** {md(b.get('desc'))}")
        parts.append('Adapted to the 2024 rules: choose any three ability scores to increase and any Origin feat.')
        out.append({'id': bg['pk'], 'name': bg['name'], 'abilities': ['str', 'dex', 'con', 'int', 'wis', 'cha'], 'anyAbilities': True,
                    'feat': {'choose': True}, 'skills': skills, 'tool': tool[:120], 'desc': first_sentence(md(bg.get('desc'))),
                    'text': '\n'.join(p for p in parts if p),
                    'equipment': [{'id': 'A', 'label': 'Listed gear', 'items': [], 'gp': gp, 'note': equip}, {'id': 'B', 'label': 'Gold', 'items': [], 'gp': 50}],
                    'edition': '2014', 'sourceName': source})
    return out

def convert_feats(doc_path, source):
    benefits = {}
    for b in load(doc_path, 'FeatBenefit'):
        benefits.setdefault(b['parent'], []).append(md(b.get('desc')))
    out = []
    for f in load(doc_path, 'Feat'):
        bens = benefits.get(f['pk'], [])
        text = md(f.get('desc')) + ('\n' + '\n'.join(f'- {b}' for b in bens) if bens else '')
        choices = []
        for b in bens:
            m = re.search(r'Increase your (\w+)(?:,? or (\w+))?(?: or (\w+))? score by 1', b)
            if m:
                opts = [ABIL[x.lower()] for x in m.groups() if x and x.lower() in ABIL]
                if opts:
                    choices.append({'id': 'ability', 'type': 'ability-plus1', 'options': opts})
                break
        cat = (f.get('type') or 'general').lower()
        out.append({'id': f['pk'], 'name': f['name'], 'category': 'origin' if cat == 'origin' else 'general', 'prereq': md(f.get('prerequisite')) or None,
                    'desc': first_sentence(text), 'text': text, 'choices': choices, 'sourceName': source})
    return out

RARITY = {'common': 'Common', 'uncommon': 'Uncommon', 'rare': 'Rare', 'very-rare': 'Very Rare', 'legendary': 'Legendary', 'artifact': 'Artifact'}
def convert_magic_items(doc_path, source):
    out = []
    for m in load(doc_path, 'MagicItem'):
        cat = (m.get('category') or 'wondrous-item').replace('-', ' ').title()
        out.append({'id': m['pk'], 'name': m['name'], 'type': 'magic-item', 'category': cat + ('s' if not cat.endswith('s') else ''),
                    'rarity': RARITY.get(m.get('rarity'), (m.get('rarity') or 'Varies').title()), 'attunement': bool(m.get('requires_attunement')),
                    'subtitle': f"{cat}, {RARITY.get(m.get('rarity'), m.get('rarity') or '')}".strip(', '), 'desc': md(m.get('desc')),
                    'cost': float(m.get('cost') or 0), 'weight': float(m.get('weight') or 0), 'sourceName': source})
    return out

def convert_monsters(doc_path, source):
    actions, traits = {}, {}
    for a in load(doc_path, 'CreatureAction'):
        actions.setdefault(a['parent'], []).append(a)
    for t in load(doc_path, 'CreatureTrait'):
        traits.setdefault(t['parent'], []).append(t)
    ab = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']
    out = []
    for c in load(doc_path, 'Creature'):
        def usage(a):
            t, p = a.get('uses_type'), a.get('uses_param')
            if t == 'RECHARGE_ON_ROLL': return {'type': 'recharge on roll', 'min_value': p}
            if t == 'PER_DAY': return {'type': 'per day', 'times': p}
            if t: return {'type': t.replace('_', ' ').lower()}
            return None
        def acts(kind):
            lst = sorted([a for a in actions.get(c['pk'], []) if a.get('action_type') == kind], key=lambda a: a.get('order_in_statblock') or 0)
            return [dict({'name': a['name'], 'desc': md(a.get('desc'))}, **({'usage': usage(a)} if usage(a) else {})) for a in lst]
        speed = ', '.join([f"{c['walk']} ft." if c.get('walk') else ''] + [f"{k} {c[k]} ft." + (' (hover)' if k == 'fly' and c.get('hover') else '') for k in ('burrow', 'climb', 'fly', 'swim') if c.get(k)]).strip(', ')
        senses = ', '.join([f"{k} {c[k + '_range']} ft." for k in ('blindsight', 'darkvision', 'tremorsense', 'truesight') if c.get(k + '_range')] + [f"passive Perception {c.get('passive_perception')}"])
        cr = float(c.get('challenge_rating') or 0)
        out.append({
            'id': c['pk'], 'name': c['name'], 'size': (c.get('size') or '').title(), 'kind': c.get('type') or '', 'alignment': c.get('alignment') or '',
            'ac': c.get('armor_class'), 'hp': c.get('hit_points'), 'hitDice': c.get('hit_dice'), 'speed': speed,
            'scores': [c.get('ability_score_' + a) or 10 for a in ab],
            'saves': {ABIL[a]: c['saving_throw_' + a] for a in ab if c.get('saving_throw_' + a) is not None},
            'skills': {s: c['skill_bonus_' + slug(s).replace('-', '_')] for s in SKILLS if c.get('skill_bonus_' + slug(s).replace('-', '_')) is not None},
            'resist': [c['damage_resistances_display']] if c.get('damage_resistances_display') else [],
            'immune': [c['damage_immunities_display']] if c.get('damage_immunities_display') else [],
            'vulnerable': [c['damage_vulnerabilities_display']] if c.get('damage_vulnerabilities_display') else [],
            'conditionImmune': [c['condition_immunities_display']] if c.get('condition_immunities_display') else [],
            'senses': senses, 'languages': c.get('languages_desc') or '—', 'cr': int(cr) if cr >= 1 else cr, 'xp': c.get('experience_points_integer'),
            'traits': [{'name': t['name'], 'desc': md(t.get('desc'))} for t in traits.get(c['pk'], [])],
            'actions': acts('ACTION'), 'bonusActions': acts('BONUS_ACTION'), 'reactions': acts('REACTION'), 'legendary': acts('LEGENDARY_ACTION'),
            'sourceName': source,
        })
    return out

def convert_bf_classes(doc_path, source, class_ids, spell_lists):
    """Black Flag (Tales of the Valiant) classes, modelled for the builder."""
    classes = {c['pk']: c for c in load(doc_path, 'CharacterClass')}
    feats = load(doc_path, 'ClassFeature')
    lv = feature_levels(doc_path)
    cols = {}
    for i in load(doc_path, 'ClassFeatureItem'):
        cols.setdefault(i['parent'], {})[i['level']] = i.get('column_value')
    out = []
    for pk in class_ids:
        c = classes[pk]
        mine = [f for f in feats if f['parent'] == pk]
        prof = md(next((f['desc'] for f in mine if f.get('feature_type') == 'PROFICIENCIES'), ''))
        core = {}
        for row in (next((f['desc'] for f in mine if f.get('feature_type') == 'CORE_TRAITS_TABLE'), '') or '').split('\n'):
            cells = [x.strip() for x in row.strip().strip('|').split('|')]
            if len(cells) == 2 and cells[0] and not cells[0].startswith('-'):
                core[cells[0]] = cells[1]
        CORE = {'Armor': 'Armor Training', 'Weapons': 'Weapon Proficiencies', 'Skills': 'Skill Proficiencies', 'Saving Throws': 'Saving Throw Proficiencies', 'Tools': 'Tool Proficiencies'}
        def grab(label):
            m = re.search(r'\*\*' + label + r':\*\*\s*([^\n*]+)', prof)
            return (m.group(1) if m else core.get(CORE.get(label, label), '')).strip()
        if core and not prof:
            prof = '\n'.join(f'**{k}.** {v}' for k, v in core.items() if k != 'Starting Equipment')
        armor_t, weap_t, skills_t = grab('Armor').lower(), grab('Weapons').lower(), grab('Skills')
        if 'all armor' in armor_t:
            armor_t = 'light medium heavy shields'
        armor = [a for a in ('light', 'medium', 'heavy') if a in armor_t] + (['shield'] if 'shield' in armor_t else [])
        weapons = [w for w in ('simple', 'martial') if w in weap_t]
        m = re.search(r'Choose (\w+)', skills_t)
        count = {'one': 1, 'two': 2, 'three': 3, 'four': 4}.get((m.group(1) if m else 'two').lower(), 2)
        skill_from = [slug(s) for s in SKILLS if s in skills_t] or 'any'
        save_t = grab('Saving Throws')
        saves = [ABIL[w.lower()] for w in re.findall(r'\b(STR|DEX|CON|INT|WIS|CHA|Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\b', save_t)] or json.loads(str(c.get('saving_throws') or '[]').replace("'", '"'))
        primary = [ABIL[core['Primary Ability'].lower()]] if core.get('Primary Ability', '').lower() in ABIL else {'bfrd_mechanist': ['int'], 'bfrd_vanguard': ['str']}.get(pk, saves[:1])
        table = {f['name']: cols.get(f['pk'], {}) for f in mine if f.get('feature_type') == 'CLASS_TABLE_DATA'}
        col = lambda name: [int(str(table.get(name, {}).get(l) or 0).replace('—', '0') or 0) for l in range(1, 21)] if name in table else None
        features, asi = [], []
        sub_level = 3
        for f in mine:
            if f.get('feature_type') in ('CLASS_TABLE_DATA', 'SPELL_SLOTS', 'PROFICIENCY_BONUS', 'PROFICIENCIES', 'CORE_TRAITS_TABLE'):
                continue
            levels = sorted(lv.get(f['pk'], [])) or [1]
            text = md(f.get('desc'))
            if f['name'] == 'Improvement':
                asi = levels
                continue
            if f['name'].endswith('Subclass'):
                sub_level = levels[0]
            if f.get('feature_type') == 'STARTING_EQUIPMENT':
                continue
            features.append({'level': levels[0], 'name': f['name'], 'desc': first_sentence(text), 'text': text})
        features.sort(key=lambda f: f['level'])
        caster = None
        if (c.get('caster_type') or 'NONE') != 'NONE':
            lists = spell_lists.get(pk, ['wizard'])
            caster = {'type': 'full', 'ability': primary[0] if primary else 'int', 'list': lists[0], 'lists': lists,
                      'cantrips': col('Cantrips Known') or [3] * 20, 'prepared': col('Spells Known') or [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 18, 19, 21, 22, 23, 24, 25]}
        equip = md(next((f['desc'] for f in mine if f.get('feature_type') == 'STARTING_EQUIPMENT'), '')) or core.get('Starting Equipment', '')
        hd = int(str(c.get('hit_dice') or 'D8').upper().replace('D', '') or 8)
        cid = class_id(pk)
        intro = md(c.get('desc')) if c.get('desc') else ''
        note = ('Black Flag uses its own spell lists; here the ' + c['name'] + ' prepares spells from the ' + ' and '.join(l.title() for l in caster['lists']) + ' lists as the closest match.') if caster else ''
        out.append({
            'id': cid, 'name': c['name'], 'hitDie': hd, 'primary': primary, 'saves': saves,
            'tagline': f"A new class from the Black Flag reference document (Tales of the Valiant).",
            'desc': first_sentence(intro) if intro else f"The {c['name']}, a class from Tales of the Valiant.",
            'text': '\n'.join(x for x in [intro, prof, note] if x),
            'skillChoices': {'count': count, 'from': skill_from}, 'armor': armor, 'weapons': weapons, 'tools': [grab('Tools')] if grab('Tools') and grab('Tools').lower() != 'none' else [],
            'caster': caster, 'asiLevels': [l for l in asi if l < 19] + ([19] if 19 in asi else []), 'noEpicBoonSlot': True, 'subclassLevel': sub_level,
            'resources': [], 'choices': [],
            'equipment': [{'id': 'A', 'label': 'Gear (see list)', 'items': [], 'gp': 10, 'note': equip}, {'id': 'B', 'label': 'Gold', 'items': [], 'gp': 100}],
            'features': features, 'subclasses': [], 'edition': 'tov', 'sourceName': source,
        })
    return out

# ---------------------------------------------------------------- pack assembly
def doc_meta(key):
    pub, path = find_doc(key)
    d = load(path, 'Document')[0]
    year = (d.get('publication_date') or '')[:4]
    lic = d.get('licenses') or []
    notice = f"{d['name']}. Copyright {year} {PUBLISHER.get(pub, pub)}" + (f"; Authors: {d['author']}." if d.get('author') and d['author'] != 'None' else '.')
    if pub == 'en-publishing':
        notice += ' This work includes material taken from the A5E System Reference Document (A5ESRD) by EN Publishing (A5ESRD.com), based on Level Up: Advanced 5th Edition (www.levelup5e.com), licensed under CC-BY-4.0.'
    display = f"Level Up: {d['name']}" if pub == 'en-publishing' else d['name']
    return pub, path, display, lic, notice

def pack(pid, name, desc, docs, build, default_on, size_hint=''):
    content, notices, licenses, sources = {}, [], set(), []
    for key in docs:
        pub, path, dname, lic, notice = doc_meta(key)
        notices.append(notice); licenses.update(lic); sources.append(dname)
        for kind, items in build(key, path, dname).items():
            content.setdefault(kind, []).extend(items)
    per_doc = [doc_meta(k)[3] for k in docs]
    license = 'CC-BY-4.0' if all('cc-by-40' in l for l in per_doc) else 'OGL-1.0a'
    data = {'id': pid, 'name': name, 'description': desc, 'license': license, 'sources': sources, 'notices': notices, 'content': content}
    path = os.path.join(OUT, f'{pid}.js')
    with open(path, 'w', encoding='utf-8') as f:
        f.write('// GENERATED by tools/import-open5e.py from the Open5e data repository. Do not edit by hand.\n')
        f.write(f'// {license}. ' + ' '.join(notices) + '\n')
        f.write('export const PACK = ')
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    counts = {k: len(v) for k, v in content.items()}
    print(f'{pid}: {counts} {os.path.getsize(path) // 1024} KB')
    return {'id': pid, 'name': name, 'description': desc, 'license': license, 'sources': sources, 'counts': counts,
            'defaultEnabled': default_on, 'file': f'./{pid}.js', 'kb': os.path.getsize(path) // 1024}

catalog = []
catalog.append(pack('tome-of-heroes', 'Tome of Heroes (Kobold Press)', '76 subclasses for every class, 33 species options, 19 backgrounds, 13 feats and 91 spells.',
    ['toh'], lambda k, p, n: {'subclasses': convert_subclasses(p, n), 'species': convert_species(p, n), 'backgrounds': convert_backgrounds(p, n), 'feats': convert_feats(p, n), 'spells': convert_spells(p, n)}, True))
catalog.append(pack('taldorei', "Tal'Dorei Campaign Setting (Green Ronin)", 'Four subclasses (Blood Domain, Path of the Juggernaut, Runechild, Way of the Cerulean Spirit), five backgrounds and a feat.',
    ['tdcs'], lambda k, p, n: {'subclasses': convert_subclasses(p, n), 'backgrounds': convert_backgrounds(p, n), 'feats': convert_feats(p, n)}, True))
catalog.append(pack('open5e-originals', 'Open5e Originals', '17 community subclasses, two backgrounds, a species and two spells from the Open5e project.',
    ['open5e', 'open5e-2024'], lambda k, p, n: {'subclasses': convert_subclasses(p, n, edition='2024' if k == 'open5e-2024' else '2014', rename_class={'srd-2024_wizard': 'wizard'}),
                                                 'backgrounds': convert_backgrounds(p, n), 'species': convert_species(p, n), 'spells': convert_spells(p, n)}, True))
BF_NEW = ['bfrd_mechanist', 'bfrd_witch', 'bfrd_vanguard', 'bfrd_theurge']
BF_SUBS_NEW = ['bfrd_metallurgist', 'bfrd_witch-twilight-soul', 'bfrd_vanguard-marshal', 'bfrd_conduit']
BF_SUBS_SRD = ['bfrd_war-domain', 'bfrd_shifter', 'bfrd_weapon-master', 'bfrd_battle-mage']
catalog.append(pack('black-flag', 'Black Flag Reference Document (Kobold Press)', 'Four new classes from Tales of the Valiant (Mechanist, Witch, Vanguard, Theurge) with their subclasses, plus four new subclasses for core classes.',
    ['bfrd'], lambda k, p, n: {'classes': convert_bf_classes(p, n, BF_NEW, {'bfrd_witch': ['warlock', 'sorcerer'], 'bfrd_theurge': ['wizard', 'cleric']}),
                               'subclasses': convert_subclasses(p, n, edition='tov', only=BF_SUBS_NEW + BF_SUBS_SRD)}, True))
catalog.append(pack('kobold-spells', 'Deep Magic & Kobold Press Spells', 'Over 650 spells from Deep Magic, Deep Magic Extended, Warlock zine and other Kobold Press releases.',
    ['deepm', 'deepmx', 'kp', 'wz'], lambda k, p, n: {'spells': convert_spells(p, n)}, True))
catalog.append(pack('vault-of-magic', 'Vault of Magic (Kobold Press)', 'Over 1,000 magic items.', ['vom'], lambda k, p, n: {'items': convert_magic_items(p, n)}, True))
# Level Up: Advanced 5th Edition (EN Publishing, CC-BY-4.0). The v2 data lacks class lists, so use v1's.
A5E_NOTICE = ('This work includes material taken from the A5E System Reference Document (A5ESRD) by EN Publishing and available at A5ESRD.com, '
              'based on Level Up: Advanced 5th Edition, available at www.levelup5e.com. The A5ESRD is licensed under the Creative Commons '
              'Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.')
V1 = os.path.join(os.path.dirname(SRC.rstrip('/')), 'v1', 'a5e', 'Spell.json')
A5E_CLASSES = {}
if os.path.exists(V1):
    with open(V1, encoding='utf-8') as f:
        for x in json.load(f):
            A5E_CLASSES[x['fields']['name']] = sorted({c.strip().lower() for c in (x['fields'].get('dnd_class') or '').split(',') if c.strip()})
_, srd_path = find_doc('srd-2024')
SRD_NAMES = {s['name'] for s in load(srd_path, 'Spell')}
def a5e_spells(path, name, alternates):
    out = []
    for e in convert_spells(path, name):
        if (e['name'] in SRD_NAMES) != alternates:
            continue
        e['classes'] = A5E_CLASSES.get(e['name'], e['classes'])
        if alternates:
            e['name'] += ' (A5E)'
        out.append(e)
    return out
catalog.append(pack('level-up-a5e', 'Level Up: Advanced 5E — Spells & Backgrounds', '60 new spells and 27 backgrounds from the Level Up Adventurer\'s Guide, Dungeon Delver\'s Guide and Gate Pass Gazette.',
    ['a5e-ag', 'a5e-ddg', 'a5e-gpg'], lambda k, p, n: {'spells': a5e_spells(p, n, False) if k == 'a5e-ag' else [], 'backgrounds': convert_backgrounds(p, n)}, True))
catalog.append(pack('level-up-a5e-alternates', 'Level Up: Advanced 5E — Alternate Core Spells', 'Level Up\'s rewritten versions of 311 core spells, labelled "(A5E)". Off by default so you don\'t see two of every spell.',
    ['a5e-ag'], lambda k, p, n: {'spells': a5e_spells(p, n, True)}, False))
for c in catalog[-2:]:
    pass
catalog.append(pack('spells-that-dont-suck', "Spells That Don't Suck", '180 reworked versions of classic spells, designed to be more fun at the table. Off by default because many share names with SRD spells.',
    ['spells-that-dont-suck'], lambda k, p, n: {'spells': convert_spells(p, n)}, False))
catalog.append(pack('kobold-bestiary', 'Tome of Beasts & Creature Codex (Kobold Press)', 'Over 1,500 monsters from Tome of Beasts (2023), Tome of Beasts 2 and 3, and Creature Codex. Off by default to keep loading fast.',
    ['tob-2023', 'tob2', 'tob3', 'ccdx'], lambda k, p, n: {'monsters': convert_monsters(p, n)}, False))
catalog.append(pack('black-flag-monsters', 'Black Flag Monsters (Kobold Press)', '360 monsters from the Black Flag reference document.', ['bfrd'], lambda k, p, n: {'monsters': convert_monsters(p, n)}, False))

with open(os.path.join(OUT, 'index.js'), 'w', encoding='utf-8') as f:
    f.write('// GENERATED by tools/import-open5e.py. Catalog of the optional built-in content packs.\n')
    f.write('export const BUILTIN_PACKS = ')
    json.dump(catalog, f, ensure_ascii=False, indent=1)
    f.write(';\n')

with open(os.path.join(SRC, 'License.json'), encoding='utf-8') as f:
    ogl = next(l['fields']['desc'] for l in json.load(f) if l['pk'] == 'ogl-10a')
ogl = ogl.replace('END OF LICENSE', '').rstrip()
notices = [n for p in catalog if p['license'] == 'OGL-1.0a' for n in []]
with open(os.path.join(ROOT, 'LICENSES', 'OGL-1.0a.txt'), 'w', encoding='utf-8') as f:
    f.write('The optional content packs in js/data/packs/ marked OGL-1.0a are Open Game Content, used under the terms of the Open Game License below.\n')
    f.write('All of their game mechanics and rules text is designated Open Game Content; Infinity Codex claims no Product Identity in them.\n\n')
    f.write(ogl + '\n')
    for p in catalog:
        if p['license'] == 'OGL-1.0a':
            with open(os.path.join(OUT, p['file'][2:]), encoding='utf-8') as pf:
                data = json.loads(pf.read().split('export const PACK = ', 1)[1].rstrip().rstrip(';'))
            for n in data['notices']:
                f.write(n + '\n')
    f.write('Open5e data (https://open5e.com), compiled by the Open5e project.\nEND OF LICENSE\n')
print('catalog + OGL written')
