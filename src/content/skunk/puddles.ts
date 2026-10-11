import { TrapDef } from "../../engine/protected/definitions";
import { basicTrapEffect } from "../../engine/protected/mechanics";
import { iCharacter, iEffect, iTrap } from "../../engine/protected/types";
import { latexArms, latexHead, latexLegs, latexTorso } from "./latex";


const TRAP_SMALL = 10;
const TRAP_LARGE = 20;

export const trapPuddle: TrapDef = {
    id: "trapPuddle",
    outcomes: [
        { threshold: 0.1, bindings: [[latexLegs, TRAP_LARGE], [latexArms, TRAP_LARGE], [latexTorso, TRAP_LARGE], [latexHead, TRAP_LARGE]] },
        { threshold: 0.35, bindings: [[latexLegs, TRAP_LARGE], [latexArms, TRAP_LARGE]] },
        { threshold: 0.75, bindings: [[latexLegs, TRAP_LARGE]] },
        { threshold: 1, bindings: [[latexLegs, TRAP_SMALL]] },
    ],
    onTrigger(target: iCharacter, trap: iTrap, roll: number): iEffect[] {
        const effects: iEffect[] = [];
        const _trap = { ...trap }
        const ratio = roll / _trap.amount;

        for (const threshold of trap.definition.outcomes) {
            if (ratio <= threshold.threshold) {
                for (const [binding, amount] of threshold.bindings) {
                    effects.push(...basicTrapEffect(target, _trap, binding, amount))
                }
                break;
            }
        }

        effects.push({
            type: "trap",
            actor: target,
            trap: trap,
            amount: _trap.amount - trap.amount
        });

        return effects;
    }
};