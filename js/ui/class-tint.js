// The colour that represents a character's class: character card outlines and, by default, the
// sheet's box frames. Core-rules classes each have their own; any other class (another book or
// homebrew) is coloured by whether it casts spells.
import { SRD_PACK } from '../data/index.js';

export const CLASS_TINT = { wizard: '#3d7bd9', warlock: '#e40712', sorcerer: '#9a4fd6', cleric: '#efe3bf', paladin: '#d8b64a', druid: '#4fa65a', ranger: '#8aa83a', barbarian: '#f08a24', fighter: '#8aa0b8', rogue: '#3aa5a0', monk: '#e8c547', bard: '#d65a9a' };
export const MAGIC_TINT = '#5fd3e6';
export const MARTIAL_TINT = '#a67c52';
export const NO_CLASS_TINT = '#8a8f98';
/** cls: a class entry (with packId and caster) or undefined. */
export const tintOf = (cls) => (!cls ? NO_CLASS_TINT : cls.packId === SRD_PACK.id && CLASS_TINT[cls.id] ? CLASS_TINT[cls.id] : cls.caster ? MAGIC_TINT : MARTIAL_TINT);
