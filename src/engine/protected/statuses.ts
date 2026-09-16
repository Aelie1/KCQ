import { StatusDef } from "./definitions";

export const bound: StatusDef = {
    id: "bound",
    levels: [
        {},
        { modifiers: { hitarms: -2 } },
        { modifiers: { hitarms: -4 } },
        { modifiers: { hitarms: -6 }, blockedMoveTypes: ["arms"], blocksAssist: true },
        { modifiers: { hitarms: -8, escape: -1 }, blockedMoveTypes: ["arms"], blocksAssist: true }
    ]
};

export const gagged: StatusDef = {
    id: "gagged",
    levels: [
        {},
        { modifiers: { hitmouth: -2 } },
        { modifiers: { hitmouth: -4 } },
        { modifiers: { hitmouth: -4 }, blockedMoveTypes: ["mouth"] },
        { modifiers: { hitmouth: -4, escape: -1 }, blockedMoveTypes: ["mouth"] }
    ]
};

export const hobbled: StatusDef = {
    id: "hobbled",
    levels: [
        {},
        { modifiers: { defense: -1, traps: -1, hitlegs: -2 } },
        { modifiers: { defense: -2, traps: -2, hitlegs: -4 } },
        { modifiers: { defense: -3, traps: -3, hitlegs: -6 }, blockedMoveTypes: ["legs"] },
        { modifiers: { defense: -4, traps: -4, hitlegs: -8, escape: -1 }, blockedMoveTypes: ["legs"] }
    ]
};

export const vibrating: StatusDef = {
    id: "vibrating",
    levels: [
        {},
        { modifiers: { escape: -1 }, blocksBonusEscape: true },
        { modifiers: { escape: -2 }, blocksBonusEscape: true },
        { modifiers: { escape: -3 }, blocksBonusEscape: true },
        { modifiers: { escape: -4 }, blocksBonusEscape: true }
    ]
};

export const submissive: StatusDef = {
    id: "submissive",
    levels: [
        {},
        { modifiers: { willpower: -1, vulnerability: 1 } },
        { modifiers: { willpower: -2, vulnerability: 2 } },
        { modifiers: { willpower: -3, vulnerability: 3 } },
        { modifiers: { willpower: -4, vulnerability: 4 } }
    ]
};

export const breathless: StatusDef = {
    id: "breathless",
    levels: [
        {},
        { modifiers: { defense: -1 } },
        { modifiers: { defense: -2 } },
        { modifiers: { defense: -3 } },
        { modifiers: { defense: -4 } }
    ]
};

export const blinded: StatusDef = {
    id: "blinded",
    levels: [
        {},
        { modifiers: { hit: -1 } },
        { modifiers: { hit: -2 } },
        { modifiers: { hit: -3, defense: -1 } },
        { modifiers: { hit: -4, defense: -2 } }
    ]
};

export const immobilized: StatusDef = {
    id: "immobilized",
    levels: [
        {},
        { blocksMoving: true }
    ]
};

export const helpless: StatusDef = {
    id: "helpless",
    levels: [
        {},
        { skipsTurn: true }
    ]
};

export const incapacitated: StatusDef = {
    id: "incapacitated",
    levels: [
        {},
        { skipsTurn: true, incapacitated: true }
    ]
};

export const stunned: StatusDef = {
    id: "stunned",
    levels: [
        {},
        { blocksAttack: true, blocksEscape: true, blocksMoving: true }
    ]
};
