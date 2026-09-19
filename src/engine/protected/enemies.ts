import type { BindingDef } from "./definitions";
import { findBinding, thresholds } from "./helpers";
import { Random } from "./random";
import { GameStatus } from "./status";
import type { iCharacter, iEntity } from "./types";

export function getValidTargets(entities: iEntity[]): iEntity[] {
    const validTargets: iEntity[] = [];
    for (const character of entities) {
        const status = new GameStatus(character);
        if (!status.isIncapacitated()) {
            validTargets.push(character);
        }
    }
    return validTargets;
}

export function pickValidTarget(entities: iEntity[], rng: Random): iEntity | undefined {
    const validTargets = getValidTargets(entities);

    if (validTargets.length === 0) {
        return undefined;
    }

    return pickTarget(validTargets, rng);
}


export function pickTarget(entities: iEntity[], rng: Random): iEntity | undefined {
    const index = rng.int(0, entities.length - 1);
    return entities[index];
}

export function pickBinding(target: iCharacter, bindings: BindingDef[], rng: Random): BindingDef | undefined {
    const validMoves: BindingDef[] = [];
    for (const binding of bindings) {
        const tBinding = findBinding(target, binding.id);
        if (tBinding && tBinding.value >= thresholds.impossible) {
            continue;
        }
        validMoves.push(binding);
    }

    if (validMoves.length === 0) {
        return undefined;
    }

    const index = rng.int(0, validMoves.length - 1);
    return validMoves[index];
}
