import { EncounterDef } from "../../engine/protected/definitions";
import { iEffect, iGameState } from "../../engine/protected/types";
import { fairy } from "./fairy";
import { latexArms, latexCollar, latexHead, latexLegs, latexTorso } from "./latex";
import { trapPuddle } from "./puddles";
import { queen } from "./queen";
import { skunk } from "./skunk";
import { skunkette } from "./skunkette";

export const plains_1: EncounterDef = {
    id: "plains_1",
    enemies: [skunkette, skunkette, skunkette],
    bindings: [latexHead, latexArms, latexTorso, latexLegs],
    traps: []
}

export const plains_2: EncounterDef = {
    id: "plains_2",
    enemies: [skunkette, skunkette, skunk, skunk],
    bindings: [latexHead, latexArms, latexTorso, latexLegs],
    traps: [
        { definition: trapPuddle, amount: 50 }
    ]
}

export const plains_3: EncounterDef = {
    id: "plains_3",
    enemies: [queen],
    bindings: [latexHead, latexArms, latexTorso, latexLegs, latexCollar],
    traps: [
        { definition: trapPuddle, amount: 0 }
    ]
}

export const forest_1: EncounterDef = {
    id: "forest_1",
    enemies: [skunkette, skunkette, skunkette, fairy],
    bindings: [latexHead, latexArms, latexTorso, latexLegs],
    traps: [
        { definition: trapPuddle, amount: 0 }
    ]
}

export const forest_2: EncounterDef = {
    id: "forest_2",
    enemies: [skunkette, skunkette, skunk, skunk, fairy],
    bindings: [latexHead, latexArms, latexTorso, latexLegs],
    traps: [
        { definition: trapPuddle, amount: 50 }
    ]
}

export const forest_3: EncounterDef = {
    id: "forest_3",
    enemies: [skunkette, skunkette, queen, fairy],
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
