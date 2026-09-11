import { EncounterDef } from "../../engine/itypes";
import { latexArms, latexHead, latexLegs, latexTorso } from "./latex";
import { skunkette } from "./skunkette";

export const plains_1: EncounterDef = {
    id: "plains_1",
    enemies: [skunkette, skunkette],
    bindings: [latexHead,latexArms,latexTorso,latexLegs]
}