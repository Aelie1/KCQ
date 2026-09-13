import { EncounterDef } from "../../engine/itypes";
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
        { definition: trapPuddle, amount: 0 }
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
