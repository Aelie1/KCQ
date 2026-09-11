import { calculateAccuracy, evaluateResult } from "./combat";
import { isEnemy } from "./helpers";
import { EnemyDef, iCharacter, iEnemy, iEntity, iGameState, iIntention, iIntentionTarget, iTargetInfo } from "./itypes";
import { iEvents } from "./effects";
import { Random } from "./random";
import { isIncapacitated } from "./status";
import { DamageEvent, EnemyEvent } from "./types";

export function loadEnemy(state: iGameState, enemy: EnemyDef): iEvents {
    const result = new iEvents();
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
    result.events.push({ type: "enemySpawned", target: name });
    return result;
}

export function updateIntention(state: iGameState, actor: iEnemy, rng: Random) {
    const action = actor.definition.ai(state, actor, rng);
    const targets = [...action.targets];
    const move = { ...action.move, roll: rng.accuracy() };
    if (move.definition.targets === "all") {
        if (move.definition.target === "enemy") {
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
        if (isEnemy(target.target) || !isIncapacitated(target.target)) {
            const accuracy = calculateAccuracy(intention.actor, target.target, intention.move.definition);
            const info = evaluateResult(target.target, accuracy, target.roll);
            targets.push(info);
        }
    }
    return targets;
}

export function damageEnemy(state: iGameState, actor: iEntity, target: iEnemy, amount: number): iEvents {
    const result = new iEvents();
    target.currHp -= amount;
    const event: DamageEvent = {
        type: "damage",
        target: target.id,
        amount: amount
    };
    result.events.push(event);
    if (target.definition.onDamage) {
        result.effects.push(...target.definition.onDamage(state, actor, target, amount));
    }
    if (target.currHp <= 0) {
        result.merge(defeatEnemy(state, target));
    }
    return result;
}

export function defeatEnemy(state: iGameState, target: iEnemy): iEvents {
    const result = new iEvents();
    const event: EnemyEvent = {
        type: "enemyDefeated",
        target: target.id,
    };
    result.events.push(event);
    if (target.definition.onDefeat) {
        result.effects.push(...target.definition.onDefeat(state, target));
    }
    state.enemies.splice(state.enemies.indexOf(target), 1);
    return result;
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

export function tickCooldowns(enemies: iEnemy[]) {
    for (const enemy of enemies) {
        for (const move of Object.entries(enemy.cooldowns)) {
            if (move[1] > 0) {
                enemy.cooldowns[move[0]]--;
            }
        }
    }
}

