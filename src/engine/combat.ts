import { addBinding } from "./bindings";
import { addBuff } from "./buffs";
import { effectivenessRange } from "./constants";
import { getIEntitySide, isCharacter, isEnemy, isValidEntity } from "./helpers";
import { EnemyDef, iCharacter, iEffect, iEnemy, iEntity, iGameState, iIntention, iTargetInfo, MoveDef } from "./itypes";
import { canMove, getModifier } from "./status";
import { AccuracyProfile, AccuracyResult, DamageEvent, EnemyEvent, GameEvent, StanceId } from "./types";


export function loadEnemy(state: iGameState, enemy: EnemyDef): GameEvent[] {
    const events: GameEvent[] = [];
    const name = enemy.id + state.nextEntityId++;
    state.enemies.push({
        definition: enemy,
        buffs: [],
        id: name,
        currHp: enemy.hp,
        currDef: enemy.defense,
        intention: null,
    });
    events.push({ type: "enemySpawned", target: name });
    return events;
}

export function updateIntention(state: iGameState, actor: iEnemy, roll: number) {
    actor.intention = { action: actor.definition.ai(state, actor), roll: roll };
}

export function isValidMove(state: iGameState, actor: iEntity, targets: iEntity[], move: MoveDef): boolean {
    if (targets.length !== move.targets) {
        return false;
    }
    for (const target of targets) {
        if (getIEntitySide(target) !== move.target) {
            return false;
        }
    }
    if (move.isValid)
        return move.isValid(state, actor, targets)
    return true;
}

export function damageEnemy(state: iGameState, target: iEnemy, amount: number): GameEvent[] {
    const events: GameEvent[] = [];
    target.currHp -= amount;
    const event: DamageEvent = {
        type: "damage",
        target: target.id,
        amount: amount
    };
    events.push(event);
    if (target.currHp <= 0) {
        events.push(...defeatEnemy(state, target));
    }
    return events;
}

export function defeatEnemy(state: iGameState, target: iEnemy): GameEvent[] {
    const events: GameEvent[] = [];
    const event: EnemyEvent = {
        type: "enemyDefeated",
        target: target.id,
    };
    events.push(event);
    state.enemies.splice(state.enemies.indexOf(target), 1);
    return events;
}

export function setStance(target: iCharacter, stance: StanceId): GameEvent[] {
    const events: GameEvent[] = [];
    switch (stance) {
        case "standing":
            if (!target.standing) {
                events.push({ type: "stanceChanged", actor: target.id, stance: stance });
                target.standing = true;
            }
            break;
        case "moving":
            if (target.standing && canMove(target)) {
                events.push({ type: "stanceChanged", actor: target.id, stance: stance });
                target.standing = false;
            }
            break;
    }
    return events;
}

export function resolveMove (state:iGameState, move: MoveDef, actor: iEntity, targets: iTargetInfo[]) : iEffect[] {
    const effects:iEffect[] = move.resolve(state, actor, targets);
    return effects.map(normalizeEffect);
}

export function normalizeEffect(effect: iEffect): iEffect {
    switch(effect.type) {
        case "binding":
        case "damage":
            return {
                ...effect,
                amount: Math.ceil(effect.amount)
            }
        default:
            return effect;
    }
}

export function processEffects(state: iGameState, effects: iEffect[]) : GameEvent[] {
    const events: GameEvent[] = [];

    for (const effect of effects) {
        if (!isValidEntity(state, effect.target)) {
            continue;
        }
        switch (effect.type) {
            case "binding":
                events.push(...addBinding(effect.target,effect.binding,effect.amount))
                break;
            case "buff":
                events.push(...addBuff(effect.source,effect.target,effect.buff))
                break;
            case "damage":
                events.push(...damageEnemy(state,effect.target,effect.amount))
                break;
        }
    }

    return events;
}

export function evaluateIntention(intention: iIntention): iTargetInfo[] {
    const targets: iTargetInfo[] = [];
    for (const target of intention.action.targets) {
        const accuracy = calculateAccuracy(intention.action.actor, target, intention.action.move);
        const info = evaluateResult(target, accuracy, intention.roll);
        targets.push({
            target: info.target,
            result: info.result,
            effectiveness: info.effectiveness
        });
    }
    return targets;
}

export function calculateAccuracy(actor: iEntity, target: iEntity, move: MoveDef): AccuracyProfile {
    const base = move.accuracy;

    // Every accuracy-bearing move should have a Hit band.
    if (base.hit === undefined) {
        throw new Error(`Move ${move.id} has an accuracy profile with no Hit band`);
    }

    const clamp = (value: number, min: number, max: number): number =>
        Math.max(min, Math.min(max, value));

    /*
     * The authored accuracy bar represents performance against neutral Defense.
     *
     * Characters currently have no base Hit stat, so their status modifiers
     * are relative to neutral accuracy.
     *
     */
    let hitModifier = getModifier(actor, "hit");

    if (isCharacter(actor)) {
        switch (move.type) {
            case "arms":
                hitModifier += getModifier(actor, "hitarms");
                break;

            case "mouth":
                hitModifier += getModifier(actor, "hitmouth");
                break;

            case "legs":
                hitModifier += getModifier(actor, "hitlegs");
                break;
        }
    }

    let defenseModifier = (isEnemy(target) ? target.currDef : 0);

    defenseModifier += getModifier(target, "defense");

    const delta = hitModifier - defenseModifier;

    /*
     * Work with cumulative boundaries:
     *
     * crit     = Crit width
     * fullHit  = Hit + Crit
     * contact  = Graze + Hit + Crit
     *
     * This makes it much easier to reshape the bar without changing
     * the total away from 100.
     */
    const hasMiss = base.miss !== undefined;
    const hasGraze = base.graze !== undefined;
    const hasCrit = base.crit !== undefined;

    const baseCrit = base.crit ?? 0;
    const baseFullHit = base.hit + baseCrit;
    const baseContact = (base.graze ?? 0) + baseFullHit;

    /*
     * Accuracy mostly changes ordinary reliability.
     *
     * Crit is deliberately harder to gain and easier to lose:
     *
     *   positive accuracy: +Crit at 1/4 rate
     *   negative accuracy: -Crit at 2x rate
     *
     * An absent Crit band can never be created by generic accuracy.
     */
    let crit = 0;

    if (hasCrit) {
        const critDelta = delta >= 0
            ? delta * 0.25
            : delta * 2;

        crit = clamp(baseCrit + critDelta, 0, 100);
    }

    /*
     * Full hits react directly to accuracy.
     * Mere contact reacts only half as strongly.
     */
    let fullHit = clamp(baseFullHit + delta, 0, 100);
    let contact = clamp(baseContact + delta * 0.5, 0, 100);

    // Crit must live inside the full-hit region.
    crit = Math.min(crit, fullHit);

    /*
     * Preserve structural zero-width bands.
     *
     * No Graze band:
     *     Hit transitions directly into Miss.
     *
     * No Miss band:
     *     Accuracy can degrade Hit into Graze, but cannot create Miss.
     *
     * No Miss AND no Graze:
     *     The move always fully connects; only Hit/Crit distribution changes.
     */
    if (!hasMiss && !hasGraze) {
        fullHit = 100;
        contact = 100;
        crit = Math.min(crit, fullHit);
    } else if (!hasGraze) {
        contact = fullHit;
    } else {
        contact = clamp(contact, fullHit, 100);

        if (!hasMiss) {
            contact = 100;
        }
    }

    /*
     * Convert the cumulative boundaries back into individual widths.
     */
    const result: AccuracyProfile = {};

    if (hasMiss) {
        result.miss = 100 - contact;
    }

    if (hasGraze) {
        result.graze = contact - fullHit;
    }

    result.hit = fullHit - crit;

    if (hasCrit) {
        result.crit = crit;
    }

    return result;
}


export function evaluateResult(target: iEntity, accuracy: AccuracyProfile, roll: number): iTargetInfo {
    const result: iTargetInfo = { target: target, result: "miss", effectiveness: 0 };

    const order: AccuracyResult[] = ["miss", "graze", "hit", "crit"];

    let cumulative = 0;
    for (const band of order) {
        const value = accuracy[band];
        if (value !== undefined && value > 0) {
            result.result = band;
            if (roll < cumulative + value) {
                if (band !== "miss") {
                    const [min, max] = effectivenessRange[band];
                    const effect = (roll - cumulative) / value;
                    result.effectiveness = min + (max - min) * effect;
                }
                return result;
            }
            cumulative += value;
        }
    }
    //rolled above the highest band, return the top of the highest band
    result.effectiveness = effectivenessRange[result.result][1];

    return result;
}