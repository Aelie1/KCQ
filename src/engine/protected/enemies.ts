import { thresholds } from "./constants";
import { BindingDef } from "./definitions";
import { findBinding } from "./helpers";
import { Random } from "./random";
import { isIncapacitated } from "./status";
import { iCharacter } from "./types";

export function validTargets(characters: iCharacter[]): iCharacter[] {
    const validCharacters: iCharacter[] = [];
    for (const character of characters) {
        if (!isIncapacitated(character)) {
            validCharacters.push(character);
        }
    }
    return validCharacters;
}

export function pickTarget(characters: iCharacter[], rng: Random): iCharacter | undefined {
    const validCharacters = validTargets(characters);

    if (validCharacters.length === 0) {
        return undefined;
    }

    const index = rng.int(0, validCharacters.length - 1);
    return validCharacters[index];
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
