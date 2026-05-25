export type AbilityId = "bolt" | "daintyTip";

export interface Character {
    id: string;
    name: string;
    color: string;
    abilities: AbilityId[];
}

export const CHARACTERS = {
    will: { id: "will", name: "Will", color: "#4a90e2", abilities: ["bolt"] },
    zack: { id: "zack", name: "Zack", color: "#e8902a", abilities: ["daintyTip"] },
    justin: { id: "justin", name: "Justin", color: "#3fb950", abilities: ["bolt"] },
    nateG: { id: "nateG", name: "Nate G", color: "#d0556a", abilities: ["bolt"] },
    nateW: { id: "nateW", name: "Nate W", color: "#e87fb5", abilities: ["bolt"] },
    nikko: { id: "nikko", name: "Nikko", color: "#f5a623", abilities: ["bolt"] },
    mike: { id: "mike", name: "Mike", color: "#7ed321", abilities: ["bolt"] },
    scoot: { id: "scoot", name: "Scoot", color: "#9013fe", abilities: ["bolt"] },
} as const satisfies Record<string, Character>;

export type CharacterId = keyof typeof CHARACTERS;

export const CHARACTER_ORDER: CharacterId[] = ["will", "zack", "justin", "nateG", "nateW", "nikko", "mike", "scoot"];

export function isCharacterId(id: string): id is CharacterId {
    return id in CHARACTERS;
}
