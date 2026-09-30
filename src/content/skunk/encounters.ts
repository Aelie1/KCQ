import { EncounterDef } from "../../engine/protected/definitions";
import { s } from "../../engine/protected/status";
import { helpless } from "../../engine/protected/statuses";
import { iEffect, iGameState } from "../../engine/protected/types";
import { EMPRESS_BUFF, FAIRY_ID, GODDESS_BUFF, QUEEN_ID, SKUNK_ID, SKUNKETTE_ID } from "./constants";
import { latexArms, latexCollar, latexHead, latexLegs, latexTorso } from "./latex";
import { trapPuddle } from "./puddles";

export const plains_1: EncounterDef = {
    id: "plains_1",
    enemies: [SKUNKETTE_ID, SKUNKETTE_ID, SKUNKETTE_ID],
    bindings: [latexHead, latexArms, latexTorso, latexLegs],
    traps: []
}

export const plains_2: EncounterDef = {
    id: "plains_2",
    enemies: [SKUNKETTE_ID, SKUNKETTE_ID, SKUNK_ID, SKUNK_ID],
    bindings: [latexHead, latexArms, latexTorso, latexLegs],
    traps: [
        { definition: trapPuddle, amount: 50 }
    ]
}

export const plains_3: EncounterDef = {
    id: "plains_3",
    enemies: [QUEEN_ID],
    bindings: [latexHead, latexArms, latexTorso, latexLegs, latexCollar],
    traps: [
        { definition: trapPuddle, amount: 0 }
    ]
}

export const forest_1: EncounterDef = {
    id: "forest_1",
    enemies: [SKUNKETTE_ID, SKUNKETTE_ID, SKUNKETTE_ID, FAIRY_ID],
    bindings: [latexHead, latexArms, latexTorso, latexLegs],
    traps: [
        { definition: trapPuddle, amount: 0 }
    ]
}

export const forest_2: EncounterDef = {
    id: "forest_2",
    enemies: [SKUNKETTE_ID, SKUNKETTE_ID, SKUNK_ID, SKUNK_ID, FAIRY_ID],
    bindings: [latexHead, latexArms, latexTorso, latexLegs],
    traps: [
        { definition: trapPuddle, amount: 50 }
    ]
}

export const forest_3: EncounterDef = {
    id: "forest_3",
    enemies: [SKUNKETTE_ID, SKUNKETTE_ID, QUEEN_ID, FAIRY_ID],
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
                amount: 2
            });
            effects.push({
                type: "data",
                target: queen,
                name: "rainmaker",
                amount: 1
            });
        }
        return effects;
    }
}


export const tower_1: EncounterDef = {
    id: "tower_1",
    enemies: [QUEEN_ID, SKUNKETTE_ID],
    bindings: [latexHead, latexArms, latexTorso, latexLegs, latexCollar],
    traps: [
        { definition: trapPuddle, amount: 0 }
    ],
    setup: function (state: iGameState): iEffect[] {
        return towerBuffs(state, "empress", 4, 4, 50, 0, true);
    }
}

export const tower_2: EncounterDef = {
    id: "tower_2",
    enemies: [QUEEN_ID, SKUNKETTE_ID],
    bindings: [latexHead, latexArms, latexTorso, latexLegs, latexCollar],
    traps: [
        { definition: trapPuddle, amount: 0 }
    ],
    setup: function (state: iGameState): iEffect[] {
        return towerBuffs(state, "empress", 3, 4, 40, 1, false);
    }
}

export const tower_3: EncounterDef = {
    id: "tower_3",
    enemies: [QUEEN_ID, SKUNKETTE_ID],
    bindings: [latexHead, latexArms, latexTorso, latexLegs, latexCollar],
    traps: [
        { definition: trapPuddle, amount: 0 }
    ],
    setup: function (state: iGameState): iEffect[] {
        return towerBuffs(state, "empress", 2, 4, 30, 2, false);
    }
}

export const outside: EncounterDef = {
    id: "outside",
    enemies: [QUEEN_ID, SKUNK_ID, SKUNKETTE_ID],
    bindings: [latexHead, latexArms, latexTorso, latexLegs, latexCollar],
    traps: [
        { definition: trapPuddle, amount: 0 }
    ],
    setup: function (state: iGameState): iEffect[] {
        return towerBuffs(state, "goddess", 4, 6, 0, 0, false);
    }
}

function towerBuffs(state: iGameState, queenName: string, enemyMod: number, queenWave: number, collarAmount: number, playerMod: number, ambushed: boolean): iEffect[] {
    const effects: iEffect[] = [];
    const queen = state.enemies.find(x => x.defId === QUEEN_ID);
    const buffName = queenName === "empress" ? EMPRESS_BUFF : GODDESS_BUFF;
    if (queen) {
        queen.id = queenName;
        effects.push({
            type: "data",
            target: queen,
            name: "wave",
            amount: queenWave
        });
        effects.push({
            type: "data",
            target: queen,
            name: "rainmaker",
            amount: queenWave / 2
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
        skunkette.id = "skunketteQueen";
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
        skunk.id = "skunkEmpress";
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