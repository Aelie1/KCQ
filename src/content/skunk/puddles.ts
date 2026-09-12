import { BindingDef, iCharacter, iEffect, iTrap, TrapDef } from "../../engine/itypes";
import { latexArms, latexHead, latexLegs, latexTorso } from "./latex";

const TRAP_SMALL = 10;
const TRAP_LARGE = 20;

function makeTrap(target: iCharacter, trap: iTrap, binding: BindingDef, size: number) : iEffect[] {
    const effects: iEffect[] = [];
    const amount = trap.amount > size ? size : trap.amount;
    trap.amount -= amount;
    if (amount > 0) {
        effects.push({
            type: "binding",
            target: target,
            binding: binding,
            amount: amount
        });
    }
    return effects;
}

export const latexPuddle : TrapDef = {
    id: "latexPuddle",
    onTrigger(target: iCharacter, trap: iTrap, roll: number): iEffect[]{
        const effects: iEffect[] = [];
        const _trap = {...trap}
        const ratio = roll / _trap.amount;

        if (ratio < 0.1) {
            effects.push(...makeTrap(target,_trap,latexLegs,TRAP_LARGE));
            effects.push(...makeTrap(target,_trap,latexArms,TRAP_LARGE));
            effects.push(...makeTrap(target,_trap,latexTorso,TRAP_LARGE));
            effects.push(...makeTrap(target,_trap,latexHead,TRAP_LARGE));
        } else if (ratio < 0.35) {
            effects.push(...makeTrap(target,_trap,latexLegs,TRAP_LARGE));
            effects.push(...makeTrap(target,_trap,latexArms,TRAP_LARGE));
        } else if (ratio < 0.75) {
            effects.push(...makeTrap(target,_trap,latexLegs,TRAP_LARGE));
        } else {
            effects.push(...makeTrap(target,_trap,latexLegs,TRAP_SMALL));
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