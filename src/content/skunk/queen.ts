import { EnemyDef, MoveDef } from "../../engine/protected/definitions";
import { getValidTargets, pickBinding, pickTarget } from "../../engine/protected/enemies";
import { basicBindingEffect, isCharacter } from "../../engine/protected/helpers";
import { Random } from "../../engine/protected/random";
import { iBuff, iEffect, iEnemy, iEntity, iGameState, iMove, iMoveEffect, iMoveResult, iTargetInfo } from "../../engine/protected/types";
import { fairy } from "./fairy";
import { latexArms, latexCollar, latexHead, latexLegs, latexTorso } from "./latex";
import { rainmaker } from "./rainmaker";
import { skunk } from "./skunk";
import { skunkette } from "./skunkette";

const QUEEN_HP = 750;
const QUEEN_DEF = 2;

const GUN_DAMAGE = 35;

const COLLAR_DAMAGE = 50;

const PERFUME_DURATION = 4;
const PERFUME_HEAL_RATIO = 0.10;

const WAVE_RATIOS = [0.8, 0.6, 0.4, 0.2];
const WAVE_SUMMONS: {
    enemy: EnemyDef;
    hpRatio?: number;
}[][] = [
        [{ enemy: skunkette, hpRatio: 0.5 }],
        [{ enemy: skunkette }],
        [{ enemy: skunk }],
        [{ enemy: skunkette }, { enemy: skunk }],
        [{ enemy: skunk }, { enemy: fairy }],
        [{ enemy: skunkette }, { enemy: skunk }, { enemy: fairy }],
    ];


const RAINMAKER_RATIOS = [2 / 3, 1 / 3];
const RAINMAKER_SUMMONS: {
    enemy: EnemyDef;
    hpRatio?: number;
    buff?: iBuff;
}[][] = [
        [{ enemy: rainmaker, hpRatio: 0.5 }],
        [{ enemy: rainmaker }],
        [{ enemy: rainmaker, buff: { id: "shielding", modifiers: { defense: 2 }, active: true } }],
    ];


export const queen: EnemyDef = {
    id: "queen",
    rank: "boss",
    hp: QUEEN_HP,
    defense: QUEEN_DEF,
    passives: [],
    ai: function (state: iGameState, actor: iEnemy, rng: Random): iMoveEffect[] {
        const effects: iMoveEffect[] = [];
        const bindings = [latexHead, latexArms, latexTorso, latexLegs];
        const validTargets = getValidTargets(state.characters);
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
                const filter = ["skunkette", "skunk", "fairy"];
                const damagedEnemies = state.enemies.filter(x => (filter.includes(x.definition.id) && x.currHp < x.maxHp));
                const type = damagedEnemies.length > 0 ? Math.floor(roll * 3) : Math.floor(roll * 2);

                effects.push({
                    type: "move",
                    actor: actor,
                    move: { definition: skunkPerfume, data: { "type": type } },
                    targets: []
                });
                return effects;
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
        const minHpRatio = (target.data["minHp"] ?? target.maxHp) / target.maxHp;
        const currHpRatio = target.currHp / target.maxHp;
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
        target.data["minHp"] = Math.min((target.data["minHp"] ?? target.maxHp), target.currHp);
        return effects;
    }
}

const skunkGun: MoveDef = {
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
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        return basicBindingEffect(actor, move, targets);
    },
};

const skunkCollar: MoveDef = {
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
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        return basicBindingEffect(actor, move, targets);
    },

};

const callReinforcements: MoveDef = {
    id: "callReinforcements",
    targetSide: "none",
    targets: 0,
    type: "none",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };
        const wave = move.data?.["wave"] ?? 1;
        const summons = WAVE_SUMMONS[wave - 1] ?? [];

        for (const summon of summons) {
            result.effects.push({
                type: "enemy",
                operation: "spawn",
                definition: summon.enemy,
                hpRatio: summon.hpRatio
            });
        }
        return result;
    },
}

const latexRainmaker: MoveDef = {
    id: "latexRainmaker",
    targetSide: "none",
    targets: 0,
    type: "none",
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
                buff: summon.buff
            });
        }

        return result;
    },
}

const skunkPerfume: MoveDef = {
    id: "skunkPerfume",
    targetSide: "player",
    targets: "all",
    type: "none",
    accuracy: {
        miss: 60,
        hit: 40,
    },
    check: "willpower",
    cooldown: { "skunkPerfume": 5 },
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };
        const type = move.data?.["type"] ?? 0;

        switch (type) {
            case 0:  //Defense perfume
                const defBuff = {
                    id: "defensePerfume",
                    active: false,
                    modifiers: { defense: -2 },
                    duration: PERFUME_DURATION,
                }
                for (const target of targets) {
                    result.targets.push({
                        target: target.target,
                        result: target.band,
                        effects: [{
                            type: "buff",
                            operation: "add",
                            buff: defBuff,
                            target: target.target
                        }]
                    });
                }
                break;
            case 1:  //Escape perfume
                const escBuff = {
                    id: "escapePerfume",
                    active: false,
                    modifiers: { escape: -2 },
                    duration: PERFUME_DURATION,
                }
                for (const target of targets) {
                    result.targets.push({
                        target: target.target,
                        result: target.band,
                        effects: [{
                            type: "buff",
                            operation: "add",
                            buff: escBuff,
                            target: target.target
                        }]
                    });
                }
                break;

            case 2:  //Heal perfume
                const filter = ["skunkette", "skunk", "fairy"];
                const damagedEnemies = state.enemies.filter(x => (filter.includes(x.definition.id) && x.currHp < x.maxHp));
                for (const enemy of damagedEnemies) {
                    result.effects.push({
                        type: "damage",
                        source: actor,
                        target: enemy,
                        amount: -PERFUME_HEAL_RATIO * enemy.maxHp
                    });
                }
                break;
        }

        return result;
    },
}