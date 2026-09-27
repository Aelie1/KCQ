import { EncounterDef } from "../../engine/protected/definitions";
import { iEffect, iGameState } from "../../engine/protected/types";
import { FAIRY_ID, QUEEN_ID, SKUNK_ID, SKUNKETTE_ID } from "./constants";
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
        const queen = state.enemies.find(x => x.definition.id === "queen");
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
