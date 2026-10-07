import { EncounterDef } from "../../engine/protected/definitions";
import { s } from "../../engine/protected/status";
import { helpless } from "../../engine/protected/statuses";
import { iEffect, iGameState } from "../../engine/protected/types";
import { Effect } from "../../engine/public/types";
import { EMPRESS_BUFF, FAIRY_ID, GODDESS_BUFF, QUEEN_ID, SKUNK_ID, SKUNKETTE_ID } from "./constants";
import { latexArms, latexCollar, latexHead, latexLegs, latexTorso } from "./latex";
import { trapPuddle } from "./puddles";

const skunketteSetup = { defId: SKUNKETTE_ID };
const skunketteQueenSetup = { defId: SKUNKETTE_ID, id: "skunketteQueen" };
const skunkSetup = { defId: SKUNK_ID };
const skunkEmpressSetup = { defId: SKUNK_ID, id: "skunkEmpress" };
const fairySetup = { defId: FAIRY_ID };
const queenSetup = { defId: QUEEN_ID };
const empressSetup = { defId: QUEEN_ID, id: "empress" };
const goddessSetup = { defId: QUEEN_ID, id: "goddess" };



export const plains_1: EncounterDef = {
    id: "plains_1",
    enemies: [skunketteSetup, skunketteSetup, skunketteSetup],
    bindings: [latexHead, latexArms, latexTorso, latexLegs],
    traps: []
}

export const plains_2: EncounterDef = {
    id: "plains_2",
    enemies: [skunketteSetup, skunketteSetup, skunkSetup, skunkSetup],
    bindings: [latexHead, latexArms, latexTorso, latexLegs],
    traps: [
        { definition: trapPuddle, amount: 50 }
    ],
    librarySetup: function (): Effect[] {
        return [{
            type: "trap",
            trap: "trapPuddle",
            amount: 50
        }];
    }
}

export const plains_3: EncounterDef = {
    id: "plains_3",
    enemies: [queenSetup],
    bindings: [latexHead, latexArms, latexTorso, latexLegs, latexCollar],
    traps: [
        { definition: trapPuddle, amount: 0 }
    ]
}

export const forest_1: EncounterDef = {
    id: "forest_1",
    enemies: [skunketteSetup, skunketteSetup, skunketteSetup, fairySetup],
    bindings: [latexHead, latexArms, latexTorso, latexLegs],
    traps: [
        { definition: trapPuddle, amount: 0 }
    ],
    setup: function (state: iGameState): iEffect[] {
        const effects: iEffect[] = [];
        for (const character of state.characters) {
            effects.push({
                type: "buff",
                operation: "add",
                target: character,
                buff: {
                    id: "ambushed",
                    active: true,
                    duration: 1,
                    statuses: [s(helpless, 1)]
                }
            });
        }
        return effects;
    },
    librarySetup: function (): Effect[] {
        return [{
            type: "buff",
            buff: {
                id: "ambushed",
                duration: 1,
                statuses: [{ id: "helpless", value: 1 }]
            },
            operation: "add",
            target: "allies"
        }];
    }
}

export const forest_2: EncounterDef = {
    id: "forest_2",
    enemies: [skunketteSetup, skunketteSetup, skunkSetup, skunkSetup, fairySetup],
    bindings: [latexHead, latexArms, latexTorso, latexLegs],
    traps: [
        { definition: trapPuddle, amount: 100 }
    ],
    librarySetup: function (): Effect[] {
        return [{
            type: "trap",
            trap: "trapPuddle",
            amount: 100
        }];
    }
}

export const forest_3: EncounterDef = {
    id: "forest_3",
    enemies: [skunketteSetup, skunketteSetup, queenSetup, fairySetup],
    bindings: [latexHead, latexArms, latexTorso, latexLegs, latexCollar],
    traps: [
        { definition: trapPuddle, amount: 100 }
    ],
    setup: function (state: iGameState): iEffect[] {
        const effects: iEffect[] = [];
        const queen = state.enemies.find(x => x.defId === QUEEN_ID);
        if (queen) {
            effects.push({
                type: "data",
                target: queen,
                name: "wave",
                amount: 2,
                visible: false
            });
            effects.push({
                type: "data",
                target: queen,
                name: "rainmaker",
                amount: 1,
                visible: false
            });
        }
        return effects;
    },
    librarySetup: function (): Effect[] {
        return [{
            type: "trap",
            trap: "trapPuddle",
            amount: 100
        }];
    }
}


export const tower_1: EncounterDef = {
    id: "tower_1",
    enemies: [empressSetup, skunketteQueenSetup],
    bindings: [latexHead, latexArms, latexTorso, latexLegs, latexCollar],
    traps: [
        { definition: trapPuddle, amount: 0 }
    ],
    setup: function (state: iGameState): iEffect[] {
        return towerBuffs(state, "empress", 4, 4, 50, 0, true);
    },
    librarySetup: function (): Effect[] {
        return libraryTowerBuffs("empress", 4, 8, 0, 50, 0, true);
    }
}

export const tower_2: EncounterDef = {
    id: "tower_2",
    enemies: [empressSetup, skunketteQueenSetup],
    bindings: [latexHead, latexArms, latexTorso, latexLegs, latexCollar],
    traps: [
        { definition: trapPuddle, amount: 0 }
    ],
    setup: function (state: iGameState): iEffect[] {
        return towerBuffs(state, "empress", 3, 4, 40, 1, false);
    },
    librarySetup: function (): Effect[] {
        return libraryTowerBuffs("empress", 3, 6, 0, 40, 1, false);
    }
}

export const tower_3: EncounterDef = {
    id: "tower_3",
    enemies: [empressSetup, skunketteQueenSetup],
    bindings: [latexHead, latexArms, latexTorso, latexLegs, latexCollar],
    traps: [
        { definition: trapPuddle, amount: 0 }
    ],
    setup: function (state: iGameState): iEffect[] {
        return towerBuffs(state, "empress", 2, 4, 30, 2, false);
    },
    librarySetup: function (): Effect[] {
        return libraryTowerBuffs("empress", 2, 4, 0, 30, 2, false);
    }
}

export const outside: EncounterDef = {
    id: "outside",
    enemies: [goddessSetup, skunkEmpressSetup, skunketteQueenSetup],
    bindings: [latexHead, latexArms, latexTorso, latexLegs, latexCollar],
    traps: [
        { definition: trapPuddle, amount: 0 }
    ],
    setup: function (state: iGameState): iEffect[] {
        return towerBuffs(state, "goddess", 4, 6, 0, 0, false);
    },
    librarySetup: function (): Effect[] {
        return libraryTowerBuffs("goddess", 4, 8, 8, 0, 0, false);
    }
}

function towerBuffs(state: iGameState, queenName: string, enemyMod: number, queenWave: number, collarAmount: number, playerMod: number, ambushed: boolean): iEffect[] {
    const effects: iEffect[] = [];
    const queen = state.enemies.find(x => x.defId === QUEEN_ID);
    const buffName = queenName === "empress" ? EMPRESS_BUFF : GODDESS_BUFF;
    if (queen) {
        effects.push({
            type: "data",
            target: queen,
            name: "wave",
            amount: queenWave,
            visible: false
        });
        effects.push({
            type: "data",
            target: queen,
            name: "rainmaker",
            amount: queenWave / 2,
            visible: false
        });
        if (enemyMod > 0) {
            effects.push({
                type: "buff",
                operation: "add",
                target: queen,
                buff: {
                    id: buffName,
                    active: true,
                    modifiers: { hit: enemyMod, defense: enemyMod }
                }
            });
        }
        for (const character of state.characters) {
            if (collarAmount > 0) {
                effects.push({
                    type: "binding",
                    source: queen,
                    target: character,
                    binding: latexCollar,
                    amount: collarAmount
                });
            }
            if (playerMod > 0) {
                effects.push({
                    type: "buff",
                    operation: "add",
                    target: character,
                    buff: {
                        id: GODDESS_BUFF,
                        active: true,
                        modifiers: { hit: playerMod, defense: playerMod }
                    }
                });
            }
            if (ambushed) {
                effects.push({
                    type: "buff",
                    operation: "add",
                    target: character,
                    buff: {
                        id: "ambushed",
                        active: true,
                        duration: 1,
                        statuses: [s(helpless, 1)]
                    }
                });
            }
        }
    }
    const skunkette = state.enemies.find(x => x.defId === SKUNKETTE_ID);
    if (skunkette) {
        if (enemyMod > 0) {
            effects.push({
                type: "buff",
                operation: "add",
                target: skunkette,
                buff: {
                    id: buffName,
                    active: true,
                    modifiers: { hit: enemyMod * 2 }
                }
            });
        }
    }
    const skunk = state.enemies.find(x => x.defId === SKUNK_ID);
    if (skunk) {
        if (enemyMod > 0) {
            effects.push({
                type: "buff",
                operation: "add",
                target: skunk,
                buff: {
                    id: buffName,
                    active: true,
                    modifiers: { hit: enemyMod * 2 }
                }
            });
        }
    }
    return effects;
}

function libraryTowerBuffs(queenName: string, queenMod: number, skunketteMod: number, skunkMod: number, collarAmount: number, playerMod: number, ambushed: boolean): Effect[] {
    const effects: Effect[] = [];
    const buffName = queenName === "empress" ? EMPRESS_BUFF : GODDESS_BUFF;
    if (queenMod > 0) {
        effects.push({
            type: "buff",
            operation: "add",
            target: queenName,
            buff: {
                id: buffName,
                modifiers: { hit: queenMod, defense: queenMod }
            }
        });
    }
    if (skunketteMod > 0) {
        effects.push({
            type: "buff",
            operation: "add",
            target: "skunketteQueen",
            buff: {
                id: buffName,
                modifiers: { hit: skunketteMod * 2 }
            }
        });
    }
    if (skunkMod > 0) {
        effects.push({
            type: "buff",
            operation: "add",
            target: "skunkEmpress",
            buff: {
                id: buffName,
                modifiers: { hit: skunkMod * 2 }
            }
        });
    }
    if (collarAmount > 0) {
        effects.push({
            type: "binding",
            target: "allies",
            binding: latexCollar.id,
            amount: collarAmount
        });
    }
    if (playerMod > 0) {
        effects.push({
            type: "buff",
            operation: "add",
            target: "allies",
            buff: {
                id: GODDESS_BUFF,
                modifiers: { hit: playerMod, defense: playerMod }
            }
        });
    }
    if (ambushed) {
        effects.push({
            type: "buff",
            operation: "add",
            target: "allies",
            buff: {
                id: "ambushed",
                duration: 1,
                statuses: [{ id: "helpless", value: 1 }]
            }
        });
    }
    return effects;
}