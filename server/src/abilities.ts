import { AbilityId, CHARACTERS, isCharacterId } from "./characters";

export interface AbilityDef {
  cooldown: number;        // seconds before this character can cast again
  projectileSpeed: number; // world units per second
  damage: number;          // hp removed on a single hit
}

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  bolt:      { cooldown: 0.4, projectileSpeed: 600, damage: 5 },
  daintyTip: { cooldown: 0.5, projectileSpeed: 750, damage: 8 },
};

export function primaryAbility(characterId: string): AbilityId | null {
  if (!isCharacterId(characterId)) return null;
  return CHARACTERS[characterId].abilities[0] ?? null;
}
