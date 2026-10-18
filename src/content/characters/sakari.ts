import { CharacterDef, MoveDef, PassiveDef, StatusLevelDef } from "../../engine/protected/definitions";
import { isCharacter, isEnemy } from "../../engine/protected/helpers";
import { basicDamageEffect, basicPlayerAccuracy, tr } from "../../engine/protected/mechanics";
import { ContentCatalogFragment, iBuff, iEffect, iEntity, iGameState, iMove, iMoveResult, iTargetInfo } from "../../engine/protected/types";
import { FailureReason } from "../../engine/public/types";
import { removeEmpowerment } from "./ko";

const MALFUNCTION_DAMAGE = 30;
const MALFUNCTION_BUFF = "malfunction";
const MALFUNCTION_MODIFIER = -2;
const MALFUNCTION_DURATION = 1;
const FAIRY_MALFUNCTION_DURATION = 3;

const OVERLOAD_DAMAGE = 30;
const OVERLOAD_BUFF = "overload";
const OVERLOAD_MODIFIER = 2;
const OVERLOAD_DURATION = 1;
const FAIRY_OVERLOAD_DURATION = 3;

const OVERCONFIDENCE_BUFF = "overconfidence";
const OVERCONFIDENCE_MODIFIER = 3;
const OVERCONFIDENCE_DURATION = 3;

const DISCORD_SEAL_COOLDOWN = 3;

const POWER_OF_CHAOS_BUFF = "stability";

export const thrillseeker: PassiveDef = {
    id: "thrillseeker",
    getStatus: function (target: iEntity): StatusLevelDef {
        if (!isCharacter(target)) {
            return {};
        }
        const totalBindings = target.bindings.reduce((sum, binding) => sum + binding.value, 0);
        return {
            modifiers: { hit: Math.floor(totalBindings / 40) }
        }
    }
}

export const malfunction: MoveDef = {
    id: "malfunction",
    libraryEffects: [{ id: MALFUNCTION_BUFF, recipient: "selected", duration: MALFUNCTION_DURATION, modifiers: { potency: MALFUNCTION_MODIFIER } }],
    index: 1,
    targetSide: "enemy",
    targets: 1,
    baseDamage: MALFUNCTION_DAMAGE,
    type: "arms",
    accuracy: basicPlayerAccuracy,
    traits: ["damage", "debuff"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = basicDamageEffect(actor, move, targets);

        const buff: iBuff = {
            id: MALFUNCTION_BUFF,
            icon: "sword-off",
            duration: move.definition.id === "malfunction" ? MALFUNCTION_DURATION : FAIRY_MALFUNCTION_DURATION,
            active: true,
            modifiers: {
                potency: MALFUNCTION_MODIFIER,
            }
        }

        for (const target of targets) {
            if (isEnemy(target.target) && (target.band === "none" || target.effectiveness > 0)) {
                const effect: iEffect = {
                    type: "buff",
                    target: target.target,
                    buff: buff,
                    operation: "add"
                }
                const targetResult = result.targets.find(x => x.target === target.target);
                if (!targetResult) {
                    result.targets.push(tr(target, [effect]));
                } else {
                    targetResult.effects.push(effect);
                }
            }
        }
        return result;
    }
}


export const fairyMalfunction: MoveDef = {
    ...malfunction,
    id: "fairyMalfunction",
    libraryEffects: [{ id: MALFUNCTION_BUFF, recipient: "selected", duration: FAIRY_MALFUNCTION_DURATION, modifiers: { potency: MALFUNCTION_MODIFIER } }],
    index: 2,
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result = malfunction.resolve(state, actor, move, targets);
        result.effects.push(...removeEmpowerment(actor));
        return result;
    }

}

export const overload: MoveDef = {
    id: "overload",
    libraryEffects: [{ id: OVERLOAD_BUFF, recipient: "selected", duration: OVERLOAD_DURATION, modifiers: { vulnerability: OVERLOAD_MODIFIER } }],
    index: 3,
    targetSide: "enemy",
    targets: 1,
    baseDamage: OVERLOAD_DAMAGE,
    type: "arms",
    accuracy: basicPlayerAccuracy,
    traits: ["damage", "debuff"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = basicDamageEffect(actor, move, targets);

        const buff: iBuff = {
            id: OVERLOAD_BUFF,
            icon: "shield-off",
            duration: move.definition.id === "overload" ? OVERLOAD_DURATION : FAIRY_OVERLOAD_DURATION,
            active: true,
            modifiers: {
                vulnerability: OVERLOAD_MODIFIER,
            }
        }

        for (const target of targets) {
            if (isEnemy(target.target) && (target.band === "none" || target.effectiveness > 0)) {
                const effect: iEffect = {
                    type: "buff",
                    target: target.target,
                    buff: buff,
                    operation: "add"
                }
                const targetResult = result.targets.find(x => x.target === target.target);
                if (!targetResult) {
                    result.targets.push(tr(target, [effect]));
                } else {
                    targetResult.effects.push(effect);
                }
            }
        }
        return result;
    }
}

export const fairyOverload: MoveDef = {
    ...overload,
    id: "fairyOverload",
    libraryEffects: [{ id: OVERLOAD_BUFF, recipient: "selected", duration: FAIRY_OVERLOAD_DURATION, modifiers: { vulnerability: OVERLOAD_MODIFIER } }],
    index: 4,
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result = overload.resolve(state, actor, move, targets);
        result.effects.push(...removeEmpowerment(actor));
        return result;
    }

}

export const overconfidence: MoveDef = {
    id: "overconfidence",
    libraryEffects: [{ id: OVERCONFIDENCE_BUFF, recipient: "selected", duration: OVERCONFIDENCE_DURATION, modifiers: { defense: -1 * OVERCONFIDENCE_MODIFIER, hit: OVERCONFIDENCE_MODIFIER } }],
    index: 5,
    targetSide: "either",
    targets: 1,
    type: "mouth",
    traits: ["buff", "debuff"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };

        const buff: iBuff = {
            id: OVERCONFIDENCE_BUFF,
            icon: "shield-off",
            duration: OVERCONFIDENCE_DURATION,
            active: true,
            modifiers: {
                defense: -1 * OVERCONFIDENCE_MODIFIER,
                hit: OVERCONFIDENCE_MODIFIER,
            }
        }

        for (const target of targets) {
            result.targets.push(tr(target, [
                {
                    type: "buff",
                    target: target.target,
                    buff: buff,
                    operation: "add"
                }]
            ));
        }
        return result;
    }
}

export const discordSeal: MoveDef = {
    id: "discordSeal",
    index: 6,
    targetSide: "enemy",
    targets: 1,
    type: "arms",
    cooldown: { "discordSeal": DISCORD_SEAL_COOLDOWN },
    traits: ["retarget"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result: iMoveResult = { effects: [], targets: [] };

        for (const target of targets) {
            if (isEnemy(target.target)) {
                if (target.target.intentions.filter(x => x.move.definition.traits?.length === 1 && x.move.definition.traits?.includes("binding") && !x.resolved).length > 0) {
                    result.targets.push(tr(target, [
                        {
                            type: "intention",
                            operation: "discord",
                            target: target.target,
                        }]
                    ));
                }
            }
        }
        return result;
    },
    isValid: function (state: iGameState, move: MoveDef, actor: iEntity): FailureReason | undefined {
        if (state.enemies.length < 2) {
            return "insufficientTargets"
        }
    },
    isValidTarget: function (move: MoveDef, target: iEntity | null): FailureReason | undefined {
        if (!target || !isEnemy(target)) {
            return "invalidTarget";
        }
        if (target.intentions.filter(x => x.move.definition.traits?.length === 1 && x.move.definition.traits?.includes("binding") && !x.resolved).length === 0) {
            return "insufficientBindingIntentions";
        }
    }
}

export const powerOfChaos: MoveDef = {
    ...discordSeal,
    id: "powerOfChaos",
    index: 7,
    type: "mouth",
    targets: "all",
    cooldown: undefined,
    traits: ["onetime", "retarget"],
    resolve: function (state: iGameState, actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
        const result = discordSeal.resolve(state, actor, move, targets);

        const chaosBuff: iBuff = {
            id: POWER_OF_CHAOS_BUFF,
            active: true,
            moveList: { blockedMoves: [powerOfChaos] }
        }

        result.effects.push({
            type: "buff",
            target: actor,
            buff: chaosBuff,
            operation: "add"
        });
        return result;
    }
}

export const sakari: CharacterDef = {
    id: "sakari",
    moves: [malfunction, overload, overconfidence, discordSeal, powerOfChaos],
    empoweredMoves: [fairyMalfunction, fairyOverload],
    passives: [thrillseeker]
};

export const sakariCatalog: ContentCatalogFragment = {
    characters: [sakari],
    moves: [malfunction, fairyMalfunction, overload, fairyOverload, overconfidence, discordSeal, powerOfChaos],
    passives: [thrillseeker]
};