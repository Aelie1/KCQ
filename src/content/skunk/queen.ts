import { EnemyDef, MoveDef } from "../../engine/protected/definitions";
import { pickBinding } from "../../engine/protected/enemies";
import { isCharacter } from "../../engine/protected/helpers";
import { Random } from "../../engine/protected/random";
import { iEffect, iEnemy, iEntity, iGameState, iMove, iTargetInfo } from "../../engine/protected/types";
import { latexArms, latexCollar, latexHead, latexLegs, latexTorso } from "./latex";
import { rainmaker } from "./rainmaker";
import { skunk } from "./skunk";
import { skunkette } from "./skunkette";

const QUEEN_HP = 300;
const QUEEN_DEF = 0;

const GUN_DAMAGE = 35;

const COLLAR_DAMAGE = 50;

const PERFUME_DURATION = 4;
const PERFUME_HEAL_RATIO = 0.10;

export const queen: EnemyDef = {
    id: "queen",
    hp: QUEEN_HP,
    defense: QUEEN_DEF,
    passives: [],
    ai: function (state: iGameState, actor: iEnemy, rng: Random): iEffect[] {
        const effects: iEffect[] = [];
        const bindings = [latexHead, latexArms, latexTorso, latexLegs];
        const roll = rng.int(1, 2)
        if (roll === 1) {
            const binding = pickBinding(state.characters[0], bindings, rng);
            effects.push({
                type: "move",
                actor: actor,
                move: { definition: skunkGun, binding: binding },
                targets: [state.characters[0]]
            });
            return effects;
        }
        else {
            effects.push({
                type: "move",
                actor: actor,
                move: { definition: skunkCollar },
                targets: [state.characters[0]]
            });
            return effects;
        }
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

        if (!move.data || !move.data["wave"] || move.data["wave"] === 1) {
            effects.push({
                type: "enemy",
                operation: "spawn",
                definition: skunkette,
                hpRatio: 0.5
            });
        }
        else if (move.data["wave"] === 2) {
            effects.push({
                type: "enemy",
                operation: "spawn",
                definition: skunkette,
            });
        }
        else if (move.data["wave"] === 3) {
            effects.push({
                type: "enemy",
                operation: "spawn",
                definition: skunk,
            });
        }
        else if (move.data["wave"] === 4) {
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

        if (!move.data || !move.data["rainmaker"] || move.data["rainmaker"] === 1) {
            effects.push({
                type: "enemy",
                operation: "spawn",
                definition: rainmaker,
                hpRatio: 0.5
            });
        }
        else if (move.data["rainMaker"] === 2) {
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
    side: "none",
    targets: "all",
    type: "none",
    accuracy: {
        miss: 60,
        hit: 40,
    },
    check: "willpower",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];
        if (!move.roll) {
            return effects;
        }
        const type = state.enemies.length > 0 ? Math.floor(move.roll * 3) : Math.floor(move.roll * 2);

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
                for (const enemy of state.enemies) {
                    if (enemy.definition.id === "skunkette" || enemy.definition.id === "skunk") {
                        effects.push({
                            type: "damage",
                            source: actor,
                            target: enemy,
                            amount: -PERFUME_HEAL_RATIO * enemy.maxHp
                        })
                    }
                }
                break;
        }

        return effects;
    },
}