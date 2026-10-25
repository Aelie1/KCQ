import { TrapDef } from "../../engine/protected/definitions";
import { latexArms, latexHead, latexLegs, latexTorso } from "./latex";


const PUDDLE_SMALL = 10;
const PUDDLE_LARGE = 20;

export const trapPuddle: TrapDef = {
    id: "trapPuddle",
    outcomes: [
        { severity: 4, threshold: 0.1, bindings: [[latexLegs, PUDDLE_LARGE], [latexArms, PUDDLE_LARGE], [latexTorso, PUDDLE_LARGE], [latexHead, PUDDLE_LARGE]] },
        { severity: 3, threshold: 0.35, bindings: [[latexLegs, PUDDLE_LARGE], [latexArms, PUDDLE_LARGE]] },
        { severity: 2, threshold: 0.75, bindings: [[latexLegs, PUDDLE_LARGE]] },
        { severity: 1, threshold: 1, bindings: [[latexLegs, PUDDLE_SMALL]] },
    ],
};