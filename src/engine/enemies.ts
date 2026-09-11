import { calculateAccuracy, evaluateResult, isValidTarget } from "./combat";
import { thresholds } from "./constants";
import { GameEffects } from "./effects";
import { findBinding } from "./find";
import { isEnemy } from "./helpers";
import { BindingDef, EnemyDef, iCharacter, iEnemy, iGameState, iIntention, iIntentionTarget, iTargetInfo } from "./itypes";
import { Random } from "./random";
import { isIncapacitated } from "./status";

export function spawnEnemy(state: iGameState, enemy: EnemyDef): GameEffects {
    const result = new GameEffects();
    const name = enemy.id + state.nextEntityId++;
    state.enemies.push({
        definition: enemy,
        buffs: [],
        id: name,
        currHp: enemy.hp,
        currDef: enemy.defense,
        intention: null,
        cooldowns: {}
    });
    result.addEvent({ 
        type: "enemySpawned", 
        target: name 
    });
    return result;
}

export function updateIntention(state: iGameState, actor: iEnemy, rng: Random) {
    const action = actor.definition.ai(state, actor, rng);
    const targets = [...action.targets];
    const move = { ...action.move, roll: rng.accuracy() };
    if (move.definition.targets === "all") {
        if (move.definition.side === "enemy") {
            targets.push(...state.enemies);
        } else {
            targets.push(...validTargets(state.characters));
        }
    }
    const iTargets: iIntentionTarget[] = [];
    for (const target of targets) {
        iTargets.push({
            target: target,
            roll: rng.accuracy()
        });
    }
    actor.intention = {
        actor: action.actor,
        move: move,
        targets: iTargets
    };
}

export function evaluateIntention(intention: iIntention): iTargetInfo[] {
    const targets: iTargetInfo[] = [];
    for (const target of intention.targets) {
        const info = isValidTarget(intention.actor,target.target,intention.move.definition);
        if (info.valid && info.accuracy) {
            const targetInfo = evaluateResult(target.target, info.accuracy, target.roll);
            targets.push(targetInfo);
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

