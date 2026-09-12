import { EncounterDef } from "../../engine/itypes";
import { latexArms, latexHead, latexLegs, latexTorso } from "./latex";
import { trapPuddle } from "./puddles";
import { skunk } from "./skunk";
import { skunkette } from "./skunkette";

export const plains_1: EncounterDef = {
    id: "plains_1",
    enemies: [skunkette, skunkette, skunkette],
    bindings: [latexHead, latexArms, latexTorso, latexLegs],
    traps: []
}

export const plains_2: EncounterDef = {
    id: "plains_1",
    enemies: [skunkette, skunkette, skunk, skunk],
    bindings: [latexHead, latexArms, latexTorso, latexLegs],
    traps: [
        { definition: trapPuddle, amount: 0 }
    ]
}
