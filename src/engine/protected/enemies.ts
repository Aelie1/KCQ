import { evaluateProfile, evaluateResult, isValidTarget } from "../private/combat";
import { thresholds } from "./constants";
import { findBinding } from "./find";
import { BindingDef, iCharacter, iEnemy, iGameState, iIntention, iIntentionRoll, iTargetInfo } from "./itypes";
import { Random } from "./random";
import { isIncapacitated } from "./status";

export function updateIntention(state: iGameState, actor: iEnemy, rng: Random) {
    const action = actor.definition.ai(state, actor, rng);
    const targets = [];
    const move = { ...action.move, roll: rng.accuracy() };
    if (move.definition.targets === "all") {
        if (move.definition.side === "enemy") {
            targets.push(...state.enemies);
        } else {
            targets.push(...validTargets(state.characters));
        }
    } else {
        targets.push(...action.targets);
    }
    const iTargets: iIntentionRoll[] = [];
    for (const target of targets) {
        iTargets.push({
            target: target,
            roll: rng.accuracy()
        });
    }
    if (move.definition.targets === 0) {
        iTargets.push({
            target: null,
            roll: rng.accuracy()
        });
    }
    actor.intention = {
        actor: action.actor,
        move: move,
        rolls: iTargets
    };
}

export function evaluateIntention(state: iGameState, intention: iIntention): iTargetInfo[] {
    const targets: iTargetInfo[] = [];
    for (const roll of intention.rolls) {
        const info = isValidTarget(state, intention.actor, roll.target, intention.move.definition);
        if (info.valid) {
            if (info.target) {
                if (info.accuracy) {
                    const targetInfo = evaluateResult(intention.actor, info.target, info.accuracy, roll.roll);
                    targets.push(targetInfo);
                } else {
                    targets.push({
                        target: info.target,
                        effectiveness: 0,
                        band: "none"
                    });
                }
            } else {
                if (info.accuracy) {
                    const result = evaluateProfile(intention.actor, info.accuracy, roll.roll, 0);
                    intention.move.effectiveness = result.effectiveness;
                    intention.move.band = result.band;
                } else {
                    intention.move.effectiveness = 0;
                    intention.move.band = "none";
                }
            }
        }
    }
    return targets;
}

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

