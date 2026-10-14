import { EncounterDef } from "../../engine/protected/definitions";
import { s } from "../../engine/protected/status";
import { helpless } from "../../engine/protected/statuses";
import { iEffect, iEntity, iGameState } from "../../engine/protected/types";
import { Effect, EnemySetup } from "../../engine/public/types";
import { EMPRESS_BUFF, FAIRY_ID, GODDESS_BUFF, QUEEN_ID, SKUNK_ID, SKUNKETTE_ID } from "./constants";
import { latexArms, latexCollar, latexHead, latexLegs, latexTorso } from "./latex";
import { trapPuddle } from "./puddles";

const skunketteSetup: EnemySetup = { defId: SKUNKETTE_ID };
const skunketteQueenSetup: EnemySetup = { defId: SKUNKETTE_ID, id: "skunketteQueen" };
const skunkSetup: EnemySetup = { defId: SKUNK_ID };
const skunkEmpressSetup: EnemySetup = { defId: SKUNK_ID, id: "skunkEmpress" };
const fairySetup: EnemySetup = { defId: FAIRY_ID };
const queenSetup: EnemySetup = { defId: QUEEN_ID };
const empressSetup: EnemySetup = { defId: QUEEN_ID, id: "empress" };
const goddessSetup: EnemySetup = { defId: QUEEN_ID, id: "goddess" };
const playerAmbushSetup: Effect = { type: "buff", buff: { id: "ambushed", duration: 1, statuses: [{ id: "helpless", value: 1 }] }, operation: "add", target: "allies" };
const enemyAmbushSetup: Effect = { type: "buff", buff: { id: "ambushed", duration: 1, statuses: [{ id: "helpless", value: 1 }] }, operation: "add", target: "enemies" };
const collarSetup: Effect = { type: "buff", buff: { id: "collar", modifiers: { willpower: -2 } }, operation: "add", target: "allies" };

function ambushBuff(character: iEntity): iEffect {
    return {
        type: "buff",
        operation: "add",
        target: character,
        buff: {
            id: "ambushed",
            icon: "ambush",
            active: true,
            duration: 1,
            statuses: [s(helpless, 1)]
        }
    }
}

function collarBuff(character: iEntity): iEffect {
    return {
        type: "buff",
        operation: "add",
        target: character,
        buff: {
            id: "collar",
            active: true,
            modifiers: { willpower: -2 }
        }
    }
}

interface TowerSetup {
    queenName: "empress" | "goddess";
    enemyMod: number;
    queenWave: number;
    collarAmount: number;
    playerMod: number;
    playerAmbushed: boolean;
    enemyAmbushed: boolean;
}

const setupTower_1: TowerSetup = {
    queenName: "empress",
    enemyMod: 8,
    queenWave: 4,
    collarAmount: 50,
    playerMod: 0,
    playerAmbushed: true,
    enemyAmbushed: false,
};

const setupTower_2: TowerSetup = {
    queenName: "empress",
    enemyMod: 4,
    queenWave: 4,
    collarAmount: 30,
    playerMod: 1,
    playerAmbushed: false,
    enemyAmbushed: false,
};

const setupTower_3: TowerSetup = {
    queenName: "empress",
    enemyMod: 2,
    queenWave: 4,
    collarAmount: 10,
    playerMod: 2,
    playerAmbushed: false,
    enemyAmbushed: true,
};

const setupOutside: TowerSetup = {
    queenName: "goddess",
    enemyMod: 8,
    queenWave: 6,
    collarAmount: 0,
    playerMod: 0,
    playerAmbushed: false,
    enemyAmbushed: false,
};


function towerBuffs(state: iGameState, setup: TowerSetup): iEffect[] {
    const effects: iEffect[] = [];
    const buffName = setup.queenName === "empress" ? EMPRESS_BUFF : GODDESS_BUFF;
    const iconName = setup.queenName === "empress" ? "crown" : "sun";

    const queen = state.enemies.find(x => x.defId === QUEEN_ID);
    if (queen) {
        effects.push({
            type: "data",
            target: queen,
            name: "wave",
            amount: setup.queenWave,
            visible: false
        });
        effects.push({
            type: "data",
            target: queen,
            name: "rainmaker",
            amount: setup.queenWave / 2,
            visible: false
        });
        for (const character of state.characters) {
            if (setup.collarAmount > 0) {
                effects.push({
                    type: "binding",
                    source: queen,
                    target: character,
                    binding: latexCollar,
                    amount: setup.collarAmount
                });
            }
            if (setup.playerMod > 0) {
                effects.push({
                    type: "buff",
                    operation: "add",
                    target: character,
                    buff: {
                        id: GODDESS_BUFF,
                        active: true,
                        modifiers: { hit: setup.playerMod, defense: setup.playerMod }
                    }
                });
            }
            if (setup.playerAmbushed) {
                effects.push(ambushBuff(character));
            }
        }
    }

    for (const enemy of state.enemies) {
        if (setup.enemyMod > 0) {
            effects.push({
                type: "buff",
                operation: "add",
                target: enemy,
                buff: {
                    id: buffName,
                    icon: iconName,
                    active: true,
                    modifiers: { hit: setup.enemyMod }
                }
            });
        }
        if (setup.enemyAmbushed) {
            effects.push(ambushBuff(enemy));
        }
    }

    return effects;
}

function libraryTowerBuffs(setup: TowerSetup): Effect[] {
    const effects: Effect[] = [];
    const buffName = setup.queenName === "empress" ? EMPRESS_BUFF : GODDESS_BUFF;

    if (setup.collarAmount > 0) {
        effects.push({
            type: "binding",
            target: "allies",
            binding: latexCollar.id,
            amount: setup.collarAmount
        });
    }

    if (setup.playerMod > 0) {
        effects.push({
            type: "buff",
            operation: "add",
            target: "allies",
            buff: {
                id: GODDESS_BUFF,
                modifiers: { hit: setup.playerMod, defense: setup.playerMod }
            }
        });
    }

    if (setup.playerAmbushed) {
        effects.push(playerAmbushSetup);
    }

    if (setup.enemyMod > 0) {
        effects.push({
            type: "buff",
            operation: "add",
            target: "enemies",
            buff: {
                id: buffName,
                modifiers: { hit: setup.enemyMod }
            }
        });
    }

    if (setup.enemyAmbushed) {
        effects.push(enemyAmbushSetup);
    }

    return effects;
}

export const prologue: EncounterDef = { id: "prologue", stars: 0, enemies: [], bindings: [], traps: [] }
export const interlude_1: EncounterDef = { id: "interlude_1", stars: 0, enemies: [], bindings: [], traps: [] }
export const interlude_2: EncounterDef = { id: "interlude_2", stars: 0, enemies: [], bindings: [], traps: [] }
export const interlude_3: EncounterDef = { id: "interlude_3", stars: 0, enemies: [], bindings: [], traps: [] }
export const epilogue: EncounterDef = { id: "epilogue", stars: 0, enemies: [], bindings: [], traps: [] }

export const plains_1: EncounterDef = {
    id: "plains_1",
    stars: 1,
    enemies: [skunketteSetup, skunketteSetup, skunketteSetup],
    bindings: [latexHead, latexArms, latexTorso, latexLegs],
    traps: []
}

export const plains_2: EncounterDef = {
    id: "plains_2",
    stars: 2,
    enemies: [skunketteSetup, skunketteSetup, skunkSetup, skunkSetup],
    bindings: [latexHead, latexArms, latexTorso, latexLegs],
    traps: [
        { definition: trapPuddle, amount: 50 }
    ],
    librarySetup: function (): Effect[] {
        return [
            { type: "trap", trap: "trapPuddle", amount: 50 }
        ];
    }
}

export const plains_3: EncounterDef = {
    id: "plains_3",
    stars: 3,
    enemies: [queenSetup],
    bindings: [latexHead, latexArms, latexTorso, latexLegs, latexCollar],
    traps: [
        { definition: trapPuddle, amount: 0 }
    ]
}

export const forest_1: EncounterDef = {
    id: "forest_1",
    stars: 3,
    enemies: [skunketteSetup, skunketteSetup, skunketteSetup, skunketteSetup, fairySetup],
    bindings: [latexHead, latexArms, latexTorso, latexLegs],
    traps: [
        { definition: trapPuddle, amount: 0 }
    ],
    setup: function (state: iGameState): iEffect[] {
        const effects: iEffect[] = [];
        for (const character of state.characters) {
            effects.push(collarBuff(character));
            effects.push(ambushBuff(character));
        }
        return effects;
    },
    librarySetup: function (): Effect[] {
        return [
            collarSetup,
            playerAmbushSetup,
        ];
    }
}

export const forest_2: EncounterDef = {
    id: "forest_2",
    stars: 4,
    enemies: [skunketteSetup, skunketteSetup, skunkSetup, skunkSetup, fairySetup, fairySetup],
    bindings: [latexHead, latexArms, latexTorso, latexLegs],
    traps: [
        { definition: trapPuddle, amount: 100 }
    ],
    setup: function (state: iGameState): iEffect[] {
        const effects: iEffect[] = [];
        for (const character of state.characters) {
            effects.push(collarBuff(character));
        }
        return effects;
    },
    librarySetup: function (): Effect[] {
        return [
            collarSetup,
            { type: "trap", trap: "trapPuddle", amount: 100 }
        ];
    }
}

export const forest_3: EncounterDef = {
    id: "forest_3",
    stars: 5,
    enemies: [queenSetup, skunketteSetup, skunketteSetup, fairySetup],
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
        for (const character of state.characters) {
            effects.push(collarBuff(character));
        }
        return effects;
    },
    librarySetup: function (): Effect[] {
        return [
            collarSetup,
            { type: "trap", trap: "trapPuddle", amount: 100 }
        ];
    }
}


export const tower_1: EncounterDef = {
    id: "tower_1",
    stars: 6,
    enemies: [empressSetup, skunketteQueenSetup],
    bindings: [latexHead, latexArms, latexTorso, latexLegs, latexCollar],
    traps: [
        { definition: trapPuddle, amount: 0 }
    ],
    setup: function (state: iGameState): iEffect[] {
        return towerBuffs(state, setupTower_1);
    },
    librarySetup: function (): Effect[] {
        return libraryTowerBuffs(setupTower_1);
    }
}

export const tower_2: EncounterDef = {
    id: "tower_2",
    stars: 5,
    enemies: [empressSetup, skunketteQueenSetup],
    bindings: [latexHead, latexArms, latexTorso, latexLegs, latexCollar],
    traps: [
        { definition: trapPuddle, amount: 0 }
    ],
    setup: function (state: iGameState): iEffect[] {
        return towerBuffs(state, setupTower_2);
    },
    librarySetup: function (): Effect[] {
        return libraryTowerBuffs(setupTower_2);
    }
}

export const tower_3: EncounterDef = {
    id: "tower_3",
    stars: 4,
    enemies: [empressSetup, skunketteQueenSetup],
    bindings: [latexHead, latexArms, latexTorso, latexLegs, latexCollar],
    traps: [
        { definition: trapPuddle, amount: 0 }
    ],
    setup: function (state: iGameState): iEffect[] {
        return towerBuffs(state, setupTower_3);
    },
    librarySetup: function (): Effect[] {
        return libraryTowerBuffs(setupTower_3);
    }
}

export const outside: EncounterDef = {
    id: "outside",
    stars: 6,
    enemies: [goddessSetup, skunkEmpressSetup, skunketteQueenSetup],
    bindings: [latexHead, latexArms, latexTorso, latexLegs, latexCollar],
    traps: [
        { definition: trapPuddle, amount: 0 }
    ],
    setup: function (state: iGameState): iEffect[] {
        return towerBuffs(state, setupOutside);
    },
    librarySetup: function (): Effect[] {
        return libraryTowerBuffs(setupOutside);
    }
}
