// Spells whose damage comes in two parts. The SRD data keeps one damage value per spell, so the
// second part (and its save, when the spell has both an attack and a save) is listed here.
// Upcasting scales the second part when the spell's "higher level" text names its die.
export const SECONDARY_DAMAGE = {
  'ice-knife': { damage: '2d6 cold', save: 'dex', short: 'burst, DEX save', label: 'Explosion: the target and each creature within 5 ft. make a DEX save' },
  'acid-arrow': { damage: '2d4 acid', short: 'next turn', label: 'At the end of the target’s next turn (on a hit)' },
};
