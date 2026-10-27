import { EnemyDef, MoveDef } from "../../engine/protected/definitions";
import { getValidTargets, pickBinding, pickTarget } from "../../engine/protected/enemies";
import { findBuff, isCharacter } from "../../engine/protected/helpers";
import { basicBindingEffect, tr } from "../../engine/protected/mechanics";
import { Random } from "../../engine/protected/random";
import { iBuff, iEffect, iEnemy, iEntity, iGameState, iMove, iMoveEffect, iMoveResult, iTargetInfo } from "../../engine/protected/types";
import { EntityId } from "../../engine/public/types";
import { COLLAR_BUFF, DORMANT_BUFF, EMPRESS_BUFF, FAIRY_ID, GODDESS_BUFF, HEAL_FILTER, MIGHT_BUFF, QUEEN_ID, RAINMAKER_ID, SKUNK_ID, SKUNKETTE_ID, SPRAYER_BUFF } from "./constants";
import { latexArms, latexCollar, latexHead, latexLegs, latexTorso } from "./latex";

const QUEEN_HP = 750;
const QUEEN_DEF = 2;

const GUN_DAMAGE = 35;

const COLLAR_DAMAGE = 50;

const PERFUME_DURATION = 3;
const PERFUME_HEAL_MODIFIER = 1;
const PERFUME_DEFENSE_MODIFIER = -2;
const PERFUME_ESCAPE_MODIFIER = -2;
const DEFENSE_BUFF = "defensePerfume";
const ESCAPE_BUFF = "escapePerfume";
const REGEN_BUFF = "regenPerfume";

function makeMightBuff(name: string, severity: number): iBuff {
    return {
        id: name,
        icon: name === EMPRESS_BUFF ? "crown" : name === GODDESS_BUFF ? "sun" : name === SPRAYER_BUFF ? "sprayer" : "sword",
        modifiers: { hit: severity * 2 },
        active: true
    }
}

const WAVE_RATIOS = [0.8, 0.6, 0.4, 0.2];
const WAVE_SUMMONS: {
    enemy: EntityId;
    hpRatio?: number;
    might?: number;
}[][] = [
        [{ enemy: SKUNKETTE_ID, hpRatio: 0.5 }],
        [{ enemy: SKUNKETTE_ID }],
        [{ enemy: SKUNK_ID }],
        [{ enemy: SKUNKETTE_ID }, { enemy: SKUNK_ID }],
        [{ enemy: SKUNK_ID }, { enemy: FAIRY_ID }],
        [{ enemy: SKUNKETTE_ID }, { enemy: SKUNK_ID }, { enemy: FAIRY_ID }],
        [{ enemy: SKUNKETTE_ID, might: 1 }, { enemy: SKUNK_ID, might: 1 }, { enemy: FAIRY_ID, might: 1 }],
        [{ enemy: SKUNKETTE_ID, might: 2 }, { enemy: SKUNK_ID, might: 2 }, { enemy: FAIRY_ID, might: 2 }],
        [{ enemy: SKUNKETTE_ID, might: 3 }, { enemy: SKUNK_ID, might: 3 }, { enemy: FAIRY_ID, might: 3 }],
        [{ enemy: SKUNKETTE_ID, might: 4 }, { enemy: SKUNK_ID, might: 4 }, { enemy: FAIRY_ID, might: 4 }],
    ];


const RAINMAKER_RATIOS = [2 / 3, 1 / 3];
const RAINMAKER_SUMMONS: {
    enemy: EntityId;
    hpRatio?: number;
    might?: number;
}[][] = [
        [{ enemy: RAINMAKER_ID, hpRatio: 0.5 }],
        [{ enemy: RAINMAKER_ID }],
        [{ enemy: RAINMAKER_ID, might: 1 }],
        [{ enemy: RAINMAKER_ID, might: 2 }],
        [{ enemy: RAINMAKER_ID, might: 4 }],
    ];

export const skunkGun: MoveDef = {
    id: "skunkGun",
    targetSide: "player",
    targets: 1,
    baseDamage: GUN_DAMAGE,
    accuracy: {
        miss: 40,
        graze: 25,
        hit: 34,
        crit: 1
    },
    type: "none",
    traits: ["binding"],
    bindings: [latexHead, latexArms, latexTorso, latexLegs],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        return basicBindingEffect(actor, move, targets);
    },
};

export const skunkCollar: MoveDef = {
    id: "skunkCollar",
    targetSide: "player",
    targets: 1,
    baseDamage: COLLAR_DAMAGE,
    cooldown: { "skunkCollar": 3 },
    accuracy: {
        miss: 60,
        graze: 25,
        hit: 14,
        crit: 1
    },
    type: "none",
    traits: ["binding"],
    bindings: [latexCollar],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        return basicBindingEffect(actor, move, targets);
    },

};

export const callReinforcements: MoveDef = {
    id: "callReinforcements",
    targetSide: "none",
    targets: 0,
    type: "none",
    traits: ["spawn"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };
        const wave = move.data?.["wave"] ?? 1;
        const summons = WAVE_SUMMONS[wave - 1] ?? [];
        const buffName = actor.id === "empress" ? EMPRESS_BUFF : actor.id === "goddess" ? GODDESS_BUFF : MIGHT_BUFF;

        for (const summon of summons) {
            result.effects.push({
                type: "enemy",
                operation: "spawn",
                definition: summon.enemy,
                hpRatio: summon.hpRatio,
                buff: (summon.might !== undefined) ? makeMightBuff(buffName, summon.might) : undefined
            });
        }
        return result;
    },
}

export const latexRainmaker: MoveDef = {
    id: "latexRainmaker",
    targetSide: "none",
    targets: 0,
    type: "none",
    traits: ["spawn"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };
        const wave = move.data?.["wave"] ?? 1;
        const summons = RAINMAKER_SUMMONS[wave - 1] ?? [];

        for (const summon of summons) {
            result.effects.push({
                type: "enemy",
                operation: "spawn",
                definition: summon.enemy,
                hpRatio: summon.hpRatio,
                buff: (summon.might !== undefined) ? makeMightBuff(SPRAYER_BUFF, summon.might) : undefined
            });
        }

        return result;
    },
}

export const skunkPerfume: MoveDef = {
    id: "skunkPerfume",
    libraryEffects: [
        { id: DEFENSE_BUFF, recipient: "selected", duration: PERFUME_DURATION, modifiers: { defense: PERFUME_DEFENSE_MODIFIER } },
        { id: ESCAPE_BUFF, recipient: "selected", duration: PERFUME_DURATION, modifiers: { escape: PERFUME_ESCAPE_MODIFIER } }
    ],
    targetSide: "player",
    targets: "all",
    type: "none",
    accuracy: {
        miss: 40,
        hit: 60,
    },
    check: "willpower",
    cooldown: { "skunkPerfume": 5, "healingPerfume": 2 },
    traits: ["debuff"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };
        const type = move.data?.["type"] ?? 0;

        switch (type) {
            case 0:  //Defense perfume
                const defBuff: iBuff = {
                    id: DEFENSE_BUFF,
                    active: false,
                    modifiers: { defense: PERFUME_DEFENSE_MODIFIER },
                    duration: PERFUME_DURATION,
                }
                for (const target of targets) {
                    result.targets.push(tr(target, [
                        {
                            type: "buff",
                            operation: "add",
                            buff: defBuff,
                            target: target.target
                        }]
                    ));
                }
                break;
            case 1:  //Escape perfume
                const escBuff: iBuff = {
                    id: ESCAPE_BUFF,
                    active: false,
                    modifiers: { escape: PERFUME_ESCAPE_MODIFIER },
                    duration: PERFUME_DURATION,
                }
                for (const target of targets) {
                    result.targets.push(tr(target, [
                        {
                            type: "buff",
                            operation: "add",
                            buff: escBuff,
                            target: target.target
                        }]
                    ));
                }
                break;
        }

        return result;
    },
}

export const healingPerfume: MoveDef = {
    id: "healingPerfume",
    libraryEffects: [{ id: REGEN_BUFF, recipient: "selected", duration: PERFUME_DURATION, modifiers: { regeneration: PERFUME_HEAL_MODIFIER } }],
    targetSide: "enemy",
    targets: 1,
    type: "none",
    cooldown: { "skunkPerfume": 2, "healingPerfume": 5 },
    traits: ["heal"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };
        const regenBuff: iBuff = {
            id: REGEN_BUFF,
            icon: "regen",
            active: false,
            modifiers: { regeneration: PERFUME_HEAL_MODIFIER },
            duration: PERFUME_DURATION,
        }
        for (const target of targets) {
            result.targets.push(tr(target, [{
                type: "buff",
                operation: "add",
                buff: regenBuff,
                target: target.target
            }]));
        }
        return result;
    },
}

export const queen: EnemyDef = {
    id: QUEEN_ID,
    rank: "boss",
    hp: QUEEN_HP,
    defense: QUEEN_DEF,
    passives: [],
    moves: [skunkGun, skunkPerfume, healingPerfume, callReinforcements, latexRainmaker, skunkCollar],
    ai: function (state: iGameState, actor: iEnemy, rng: Random): iMoveEffect[] {
        const effects: iMoveEffect[] = [];
        const bindings = [latexHead, latexArms, latexTorso, latexLegs];
        const validTargets = getValidTargets(state, state.characters);

        const currHpRatio = actor.currHp / actor.definition.hp;

        if (state.difficulty.id === "mythic" || (currHpRatio < 0.5 && state.difficulty.id === "extreme")) {
            const target = pickTarget(validTargets, rng);
            if (target && isCharacter(target)) {
                const binding = pickBinding(target, bindings, rng);
                if (binding) {
                    effects.push({
                        type: "move",
                        actor: actor,
                        move: { definition: skunkGun, binding: binding },
                        targets: [target]
                    });
                }
            }
        }

        //1) If no one has a collar and it is off CD, use skunk collar on the person who dealt the most damage to her
        {
            if (!validTargets.some(x => isCharacter(x) && x.bindings.some(x => x.id === latexCollar.id))) {
                let damage = 0;
                let target = undefined;
                if ((actor.cooldowns['skunkCollar'] ?? 0) === 0) {
                    for (const character of validTargets) {
                        if ((actor.data[character.id] ?? 0) > damage) {
                            damage = actor.data[character.id];
                            target = character;
                        }
                    }
                    if (target === undefined) {
                        target = pickTarget(validTargets, rng);
                    }
                    if (target) {
                        effects.push({
                            type: "move",
                            actor: actor,
                            move: { definition: skunkCollar, binding: latexCollar },
                            targets: [target]
                        });
                        return effects;
                    }
                }
            }
        }

        //2) Use Skunk Pefume if off CD
        {
            if ((actor.cooldowns['skunkPerfume'] ?? 0) === 0) {
                const roll = rng.random();
                const type = Math.floor(roll * 2);

                effects.push({
                    type: "move",
                    actor: actor,
                    move: { definition: skunkPerfume, data: { "type": type } },
                    targets: []
                });
                return effects;
            }
        }

        {
            const damagedEnemies = state.enemies.filter(x => (HEAL_FILTER.includes(x.definition.rank) && x.currHp < x.definition.hp));
            if ((actor.cooldowns['healingPerfume'] ?? 0) === 0 && damagedEnemies.length > 0) {
                const totalHP = damagedEnemies.reduce((sum, x) => sum + x.currHp, 0);
                const maxHP = damagedEnemies.reduce((sum, x) => sum + x.definition.hp, 0);
                const ratio = totalHP / maxHP;
                const roll = rng.random();
                if (roll > ratio) {
                    effects.push({
                        type: "move",
                        actor: actor,
                        move: { definition: healingPerfume },
                        targets: state.enemies.filter(x => HEAL_FILTER.includes(x.definition.rank))
                    });
                    return effects;
                }
            }
        }

        //3) Use Skunk Gun on a random target
        {
            const target = pickTarget(validTargets, rng);
            if (target && isCharacter(target)) {
                const binding = pickBinding(target, bindings, rng);
                if (binding) {
                    effects.push({
                        type: "move",
                        actor: actor,
                        move: { definition: skunkGun, binding: binding },
                        targets: [target]
                    });
                }
                return effects;
            }
        }

        //4) Use Skunk Perfume I guess?
        {
            effects.push({
                type: "move",
                actor: actor,
                move: { definition: skunkPerfume },
                targets: []
            });
            return effects;
        }
    },
    onDamage(state: iGameState, actor: iEntity, target: iEnemy, damage: number): iEffect[] {
        const effects: iEffect[] = [];
        if (isCharacter(actor)) {
            target.data[actor.id] = (target.data[actor.id] ?? 0) + damage;
        }
        const minHpRatio = (target.data["minHp"] ?? target.definition.hp) / target.definition.hp;
        const currHpRatio = target.currHp / target.definition.hp;
        for (const ratio of WAVE_RATIOS) {
            if (currHpRatio <= ratio && minHpRatio > ratio) {
                target.data["wave"] = (target.data["wave"] ?? 0) + 1;
                effects.push({
                    type: "move",
                    actor: target,
                    move: { definition: callReinforcements, data: { "wave": target.data["wave"] } },
                    targets: []
                });
            }
        }
        for (const ratio of RAINMAKER_RATIOS) {
            if (currHpRatio <= ratio && minHpRatio > ratio) {
                target.data["rainmaker"] = (target.data["rainmaker"] ?? 0) + 1;
                effects.push({
                    type: "move",
                    actor: target,
                    move: { definition: latexRainmaker, data: { "wave": target.data["rainmaker"] } },
                    targets: []
                });
            }
        }
        target.data["minHp"] = Math.min((target.data["minHp"] ?? target.definition.hp), target.currHp);
        return effects;
    },

    onDefeat(state: iGameState, target: iEnemy): iEffect[] {
        const effects: iEffect[] = [];
        for (const enemy of state.enemies) {
            const buff = findBuff(enemy, COLLAR_BUFF);
            if (buff) {
                effects.push({
                    type: "buff",
                    target: enemy,
                    buff: buff,
                    operation: "remove"
                });
            }
            if (findBuff(enemy, DORMANT_BUFF)) {
                effects.push({
                    type: "enemy",
                    target: enemy,
                    operation: "defeat"
                });
            }
        }
        return effects;
    }
}