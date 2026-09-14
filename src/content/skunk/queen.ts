import { EnemyDef, MoveDef } from "../../engine/protected/definitions";
import { getValidTargets, pickBinding, pickTarget } from "../../engine/protected/enemies";
import { isCharacter } from "../../engine/protected/helpers";
import { Random } from "../../engine/protected/random";
import { iEffect, iEnemy, iEntity, iGameState, iMove, iTargetInfo } from "../../engine/protected/types";
import { latexArms, latexCollar, latexHead, latexLegs, latexTorso } from "./latex";
import { rainmaker } from "./rainmaker";
import { skunk } from "./skunk";
import { skunkette } from "./skunkette";

const QUEEN_HP = 750;
const QUEEN_DEF = 0;

const GUN_DAMAGE = 35;

const COLLAR_DAMAGE = 50;

const PERFUME_DURATION = 4;
const PERFUME_HEAL_RATIO = 0.10;

const WAVE_1_HP_RATIO = 0.8;
const WAVE_2_HP_RATIO = 0.6;
const WAVE_3_HP_RATIO = 0.4;
const WAVE_4_HP_RATIO = 0.2;

const RAINMAKER_1_HP_RATIO = 0.66;
const RAINMAKER_2_HP_RATIO = 0.33;

export const queen: EnemyDef = {
    id: "queen",
    hp: QUEEN_HP,
    defense: QUEEN_DEF,
    passives: [],
    ai: function (state: iGameState, actor: iEnemy, rng: Random): iEffect[] {
        const effects: iEffect[] = [];
        const bindings = [latexHead, latexArms, latexTorso, latexLegs];

        //1) If no one has a collar and it is off CD, use skunk collar on the person who dealt the most damage to her
        {
            const targets = getValidTargets(state.characters);
            if (!targets.some(x => x.bindings.some(x => x.id === latexCollar.id))) {
                let damage = 0;
                let target = undefined;
                if ((actor.cooldowns['skunkCollar'] ?? 0) === 0) {
                    for (const character of targets) {
                        if ((actor.data[character.id] ?? 0) > damage) {
                            damage = actor.data[character.id];
                            target = character;
                        }
                    }
                    if (target === undefined) {
                        target = pickTarget(targets, rng);
                    }
                    if (target) {
                        effects.push({
                            type: "move",
                            actor: actor,
                            move: { definition: skunkCollar },
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
                const damagedEnemies = state.enemies.filter(x => ((x.definition.id === "skunkette" || x.definition.id === "skunk") && x.currHp < x.maxHp));
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
            const target = pickTarget(state.characters, rng);
            if (target) {
                const binding = pickBinding(target, bindings, rng);
                effects.push({
                    type: "move",
                    actor: actor,
                    move: { definition: skunkGun, binding: binding },
                    targets: [target]
                });
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
        if (currHpRatio <= WAVE_1_HP_RATIO && minHpRatio > WAVE_1_HP_RATIO) {
            effects.push({
                type: "move",
                actor: target,
                move: { definition: callReinforcements, data: { "wave": 1 } },
                targets: []
            });
        }
        if (currHpRatio <= WAVE_2_HP_RATIO && minHpRatio > WAVE_2_HP_RATIO) {
            effects.push({
                type: "move",
                actor: target,
                move: { definition: callReinforcements, data: { "wave": 2 } },
                targets: []
            });
        }
        if (currHpRatio <= WAVE_3_HP_RATIO && minHpRatio > WAVE_3_HP_RATIO) {
            effects.push({
                type: "move",
                actor: target,
                move: { definition: callReinforcements, data: { "wave": 3 } },
                targets: []
            });
        }
        if (currHpRatio <= WAVE_4_HP_RATIO && minHpRatio > WAVE_4_HP_RATIO) {
            effects.push({
                type: "move",
                actor: target,
                move: { definition: callReinforcements, data: { "wave": 4 } },
                targets: []
            });
        }
        if (currHpRatio <= RAINMAKER_1_HP_RATIO && minHpRatio > RAINMAKER_1_HP_RATIO) {
            effects.push({
                type: "move",
                actor: target,
                move: { definition: latexRainmaker, data: { "wave": 1 } },
                targets: []
            });
        }
        if (currHpRatio <= RAINMAKER_2_HP_RATIO && minHpRatio > RAINMAKER_2_HP_RATIO) {
            effects.push({
                type: "move",
                actor: target,
                move: { definition: latexRainmaker, data: { "wave": 2 } },
                targets: []
            });
        }
        target.data["minHp"] = Math.min((target.data["minHp"] ?? target.maxHp), target.currHp);
        return effects;
    }
}

const skunkGun: MoveDef = {
    id: "skunkGun",
    side: "player",
    targets: 1,
    baseDamage: GUN_DAMAGE,
    accuracy: {
        miss: 50,
        graze: 25,
        hit: 24,
        crit: 1
    },
    type: "none",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];
        if (targets.length === 0) {
            return effects;
        }

        const target = targets[0];
        if (!move.binding) {
            return effects;
        }

        if (isCharacter(target.target)) {
            effects.push({
                type: "binding",
                target: target.target,
                binding: move.binding,
                amount: (this.baseDamage ?? 1) * target.effectiveness
            });
        }
        return effects;
    },
};

const skunkCollar: MoveDef = {
    id: "skunkCollar",
    side: "player",
    targets: 1,
    baseDamage: COLLAR_DAMAGE,
    cooldown: 3,
    accuracy: {
        miss: 60,
        graze: 25,
        hit: 14,
        crit: 1
    },
    type: "none",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];
        if (targets.length === 0) {
            return effects;
        }

        const target = targets[0];

        if (isCharacter(target.target)) {
            effects.push({
                type: "binding",
                target: target.target,
                binding: latexCollar,
                amount: (this.baseDamage ?? 1) * target.effectiveness
            });
        }
        return effects;
    },

};

const callReinforcements: MoveDef = {
    id: "callReinforcements",
    side: "none",
    targets: 0,
    type: "none",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];

        const wave = move.data?.["wave"] ?? 1;

        if (wave === 1) {
            effects.push({
                type: "enemy",
                operation: "spawn",
                definition: skunkette,
                hpRatio: 0.5
            });
        }
        else if (wave === 2) {
            effects.push({
                type: "enemy",
                operation: "spawn",
                definition: skunkette,
            });
        }
        else if (wave === 3) {
            effects.push({
                type: "enemy",
                operation: "spawn",
                definition: skunk,
            });
        }
        else if (wave === 4) {
            effects.push({
                type: "enemy",
                operation: "spawn",
                definition: skunkette,
            });
            effects.push({
                type: "enemy",
                operation: "spawn",
                definition: skunk,
            });
        }
        return effects;
    },
}


const latexRainmaker: MoveDef = {
    id: "latexRainmaker",
    side: "none",
    targets: 0,
    type: "none",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];

        const wave = move.data?.["wave"] ?? 1;

        if (wave === 1) {
            effects.push({
                type: "enemy",
                operation: "spawn",
                definition: rainmaker,
                hpRatio: 0.5
            });
        }
        else if (wave === 2) {
            effects.push({
                type: "enemy",
                operation: "spawn",
                definition: rainmaker,
            });
        }

        return effects;
    },
}


const skunkPerfume: MoveDef = {
    id: "skunkPerfume",
    side: "player",
    targets: "all",
    type: "none",
    accuracy: {
        miss: 60,
        hit: 40,
    },
    check: "willpower",
    cooldown: 5,
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];
        if (move.roll === undefined) {
            return effects;
        }
        const type = move.data?.["type"] ?? 0;

        switch (type) {
            case 0:  //Defense perfume
                const defBuff = {
                    id: "skunkPerfume",
                    active: false,
                    modifiers: { defense: -2 },
                    duration: PERFUME_DURATION,
                }
                for (const target of targets) {
                    effects.push({
                        type: "buff",
                        operation: "add",
                        buff: defBuff,
                        target: target.target
                    })
                }
                break;
            case 1:  //Escape perfume
                const escBuff = {
                    id: "skunkPerfume",
                    active: false,
                    modifiers: { escape: -2 },
                    duration: PERFUME_DURATION,
                }
                for (const target of targets) {
                    effects.push({
                        type: "buff",
                        operation: "add",
                        buff: escBuff,
                        target: target.target
                    })
                }
                break;

            case 2:  //Heal perfume
                const damagedEnemies = state.enemies.filter(x => ((x.definition.id === "skunkette" || x.definition.id === "skunk") && x.currHp < x.maxHp));
                for (const enemy of damagedEnemies) {
                    effects.push({
                        type: "damage",
                        source: actor,
                        target: enemy,
                        amount: -PERFUME_HEAL_RATIO * enemy.maxHp
                    })
                }
                break;
        }

        return effects;
    },
}