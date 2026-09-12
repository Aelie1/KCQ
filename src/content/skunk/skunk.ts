import { GameEffects } from "../../engine/effects";
import { pickBinding, pickTarget, validTargets } from "../../engine/enemies";
import { findBinding, findTrap } from "../../engine/find";
import { isCharacter, isEnemy } from "../../engine/helpers";
import { EnemyDef, iGameState, iEnemy, EnemyAction, iEffect, iEntity, iMove, iTargetInfo, MoveDef } from "../../engine/itypes";
import { Random } from "../../engine/random";
import { isIncapacitated } from "../../engine/status";
import { latexArms, latexBindings, latexHead, latexLegs, latexTorso } from "./latex";
import { trapPuddle } from "./puddles";

const SKUNK_HP = 300;
const SKUNK_DEF = 0;

const SPRAY_DAMAGE = 25;

const PUDDLE_BASE = 10;

const REGENERATION_DAMAGE = 30;

const EXPLOSION_HP_RATIO = 0.25;
const EXPLOSION_HEAL = SKUNK_HP * 0.2;
const EXPLOSION_DAMAGE = 25;

export const skunk: EnemyDef = {
    id: "skunkette",
    hp: SKUNK_HP,
    defense: SKUNK_DEF,
    passives: [],
    ai: function (state: iGameState, actor: iEnemy, rng: Random): EnemyAction {
        const bindings = [latexHead, latexArms, latexTorso, latexLegs];

        //1) Explode if low HP
        {
            if (actor.currHp / actor.maxHp < EXPLOSION_HP_RATIO) {
                let total = 0;
                let target = undefined;
                for (const character of validTargets(state.characters)) {
                    let amount = 0
                    for (const binding of character.bindings) {
                        amount += binding.value;
                    }
                    if (amount > total) {
                        total = amount;
                        target = character;
                    }
                }
                if (!target) {
                    target = pickTarget(state.characters, rng);
                }
                if (target) {
                    return {
                        actor: actor,
                        targets: [target],
                        move: { definition: latexExplosion }
                    }
                }
            }
        }

        //2) Make puddles if there are few traps
        {
            const amount = findTrap(state, trapPuddle.id)?.amount ?? 0;
            const roll = rng.accuracy();
            if (roll > amount + 25) {
                return {
                    actor: actor,
                    targets: [],
                    move: { definition: latexPuddle }
                }
            }
        }

        //3) Regenerate if there is a target with potential
        {
            let total = 0;
            let target = undefined;
            let binding = undefined;
            for (const character of validTargets(state.characters)) {
                let amount = 0
                for (const binding of character.bindings) {
                    amount += Math.max(0, binding.data["peak"] - binding.value);
                }
                if (amount > total) {
                    total = amount;
                    target = character;
                    binding = binding;
                }
            }
            const roll = rng.accuracy();
            if (target && roll < total) {
                const bindings = target.bindings.filter(x => x.value < x.data["peak"]);
                if (bindings.length > 0) {
                    const index = Math.floor(rng.random() * bindings.length);
                    return {
                        actor: actor,
                        targets: [target],
                        move: { definition: latexRegeneration, binding: bindings[index].definition }
                    }
                }
            }
        }

        //4) Randomly latex spray
        {
            const target = pickTarget(state.characters, rng);
            if (target) {
                const binding = pickBinding(target, bindings, rng);
                if (binding) {
                    return {
                        actor: actor,
                        targets: [target],
                        move: { definition: latexSpray, binding: binding }
                    };
                }
            }

        }

        //5) Just spray I guess?
        return {
            actor: actor,
            targets: [],
            move: { definition: latexPuddle }
        }

    }
}

const latexSpray: MoveDef = {
    id: "latexSpray",
    side: "player",
    targets: 1,
    baseDamage: SPRAY_DAMAGE,
    accuracy: {
        miss: 10,
        graze: 25,
        hit: 65
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

const latexPuddle: MoveDef = {
    id: "latexPuddle",
    side: "none",
    targets: 0,
    type: "none",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];
        const roll = move.roll ?? 0.5;

        const trap = findTrap(state, trapPuddle.id);
        if (!trap) {
            return effects;
        }

        let amount = 0;
        if (roll < 0.3) {
            amount = PUDDLE_BASE;
        }
        else if (roll < 0.8) {
            amount = PUDDLE_BASE * 2;
        }
        else {
            amount = PUDDLE_BASE * 3;
        }

        if (amount) {
            effects.push({
                type: "trap",
                actor: actor,
                trap: trap,
                amount: amount
            });
        }

        return effects;
    }
}

const latexRegeneration: MoveDef = {
    id: "latexRegeneration",
    side: "player",
    targets: 1,
    accuracy: {
        miss: 50,
        graze: 30,
        hit: 15,
        crit: 5
    },
    baseDamage: REGENERATION_DAMAGE,
    type: "none",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];
        if (targets.length === 0) {
            return effects;
        }
        const target = targets[0];

        switch (target.band) {
            case "graze":
                if (isCharacter(target.target) && move.binding) {
                    effects.push({
                        type: "binding",
                        target: target.target,
                        binding: move.binding,
                        amount: (this.baseDamage ?? 1) * target.effectiveness,
                        onResolve: regenerateCallback
                    });
                }
                break;
            case "hit":
                if (isCharacter(target.target) && move.binding) {
                    effects.push({
                        type: "binding",
                        target: target.target,
                        binding: move.binding,
                        onResolve: regenerateCallback
                    });
                }
                break;
            case "crit":
                if (isCharacter(target.target) && move.roll) {
                    effects.push({
                        type: "binding",
                        target: target.target,
                        binding: latexBindings,
                        onResolve: regenerateCallback
                    });
                }
                break;
        }

        return effects;
    }
}

const latexExplosion: MoveDef = {
    id: "latexExplosion",
    side: "player",
    targets: 1,
    baseDamage: EXPLOSION_DAMAGE,
    accuracy: {
        miss: 50,
        graze: 30,
        hit: 17,
        crit: 3
    },
    type: "none",
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iEffect[] {
        const effects: iEffect[] = [];
        if (targets.length === 0) {
            const trap = findTrap(state, trapPuddle.id);
            if (!trap) {
                return effects;
            }
            effects.push({
                type: "trap",
                actor: actor,
                trap: trap,
                amount: PUDDLE_BASE * 3
            });
            if (isEnemy(actor)) {
                effects.push({
                    type: "damage",
                    source: actor,
                    target: actor,
                    amount: 999
                });
            }
        }

        const target = targets[0];

        if (isCharacter(target.target)) {
            const bindings = [latexHead, latexArms, latexTorso, latexLegs];
            for (const binding of bindings) {
                effects.push({
                    type: "binding",
                    target: target.target,
                    binding: binding,
                    amount: (this.baseDamage ?? 1) * target.effectiveness
                });
            }
            if (target.band === "crit") {
                if (isEnemy(actor)) {
                    effects.push({
                        type: "damage",
                        source: actor,
                        target: actor,
                        amount: -EXPLOSION_HEAL
                    });
                }
            } else {
                if (isEnemy(actor)) {
                    effects.push({
                        type: "damage",
                        source: actor,
                        target: actor,
                        amount: 999
                    });
                }
            }
        }
        return effects;
    },
};

function regenerateCallback(effect: iEffect): iEffect[] {
    const effects: iEffect[] = [];
    if (effect.type != "binding") {
        return effects;
    }

    if (effect.binding === latexBindings) {
        for (const binding of effect.target.bindings) {
            if (binding.value < binding.data["peak"]) {
                effects.push({
                    type: "binding",
                    target: effect.target,
                    binding: binding,
                    amount: binding.data["peak"] - binding.value
                })
            }
        }
        return effects;
    }

    if (effect.amount) {
        const binding = findBinding(effect.target, effect.binding.id)
        if (binding && binding.value < binding.data["peak"]) {
            effects.push({
                type: "binding",
                target: effect.target,
                binding: binding,
                amount: Math.min(effect.amount, binding.data["peak"] - binding.value)
            })
        }
        return effects;
    }

    const binding = findBinding(effect.target, effect.binding.id)
    if (binding && binding.value < binding.data["peak"]) {
        effects.push({
            type: "binding",
            target: effect.target,
            binding: binding,
            amount: binding.data["peak"] - binding.value
        })
    }
    return effects;
}

