import { MoveDef } from "../protected/definitions";
import { getMoves } from "../protected/helpers";
import { GameStatus, getStatus, StatusMap } from "../protected/status";
import { iCharacter, iGameState } from "../protected/types";
import { ActionInfo, ActionView, EscapeInfo, FailureReason, PreviewProfile, StanceInfo, type GameView } from "../public/types";
import { isValidTarget, resolveEscape, resolveMove } from "./combat";
import { DAMAGE_BANDS, EFFECTIVENESS_MODIFIER, effectivenessRange } from "./constants";
import { serializeEffects, serializeGameState, serializeMove, serializePreview } from "./serialize";
import { iPreviewInfo, iValidityInfo } from "./types";

export function getGameView(state: iGameState): GameView {
    //First we cache all statuses
    const statuses: StatusMap = new Map();
    for (const character of state.characters) {
        statuses.set(character, new GameStatus(character));
    }
    for (const enemy of state.enemies) {
        statuses.set(enemy, new GameStatus(enemy));
    }

    return {
        ...serializeGameState(state, statuses),
        actions: getActionView(state, statuses)
    };
}


export function getActionView(state: iGameState, statuses: StatusMap): ActionView[] {
    const result: ActionView[] = [];

    for (const character of state.characters) {
        const status = getStatus(statuses, character);
        const capability = status.canAct();
        const moves = getMovesList(state, character, statuses);
        const escapes = getEscapes(state, character, statuses);
        const stance = stanceAvailable(character, status);
        result.push({
            id: character.id,
            available: capability ? false : true,
            reason: capability,
            moves: moves,
            escapes: escapes,
            stance: stance
        });
    }
    return result;
}

function stanceAvailable(target: iCharacter, status: GameStatus): StanceInfo {
    const result = status.canAct("stance");
    if (result) {
        return {
            available: false,
            reason: result
        }
    }
    return {
        available: true
    }
}

function getMovesList(state: iGameState, actor: iCharacter, statuses: StatusMap): ActionInfo[] {
    const actions: ActionInfo[] = [];
    const status = getStatus(statuses, actor);
    const result = status.canAct("move");
    for (const move of getMoves(actor)) {
        let available = true;
        let reason: FailureReason = "moveUnavailable";
        if (result) {
            available = false;
            reason = result;
        }
        else if (!move.alwaysAvailable && !status.canAttack()) {
            available = false;
            reason = "attackUnavailable";
        }
        else if (!status.canUseMoveType(move.type)) {
            available = false;
            reason = "bindingRestriction";
        }
        if (available) {
            const targets = getTargets(state, actor, statuses, move);
            if (move.targets !== "all" && !targets.some(x => x.valid)) {
                if (targets.length && !targets[0].valid) {
                    reason = targets[0].reason;
                }
                actions.push({
                    move: serializeMove(move),
                    available: false,
                    targets: [],
                    reason: reason
                });
            }
            actions.push({
                move: serializeMove(move),
                available: true,
                targets: targets.map(serializePreview)
            });
        } else {
            actions.push({
                move: serializeMove(move),
                available: false,
                targets: [],
                reason: reason
            });
        }
    }
    return actions;
}

function getTargets(state: iGameState, actor: iCharacter, statuses: StatusMap, move: MoveDef): iPreviewInfo[] {
    const result: iValidityInfo[] = [];
    const actorStatus = getStatus(statuses, actor);
    if (move.targets === 0) {
        result.push(isValidTarget(state, actor, actorStatus, null, null, move));
    }
    else {
        switch (move.targetSide) {
            case "none":
                result.push(isValidTarget(state, actor, actorStatus, null, null, move));
                break;
            case "player":
                for (const target of state.characters) {
                    result.push(isValidTarget(state, actor, actorStatus, target, getStatus(statuses, target), move));
                }
                break;
            case "enemy":
                for (const target of state.enemies) {
                    result.push(isValidTarget(state, actor, actorStatus, target, getStatus(statuses, target), move));
                }
                break;
            case "either":
                for (const target of state.characters) {
                    result.push(isValidTarget(state, actor, actorStatus, target, getStatus(statuses, target), move));
                }
                for (const target of state.enemies) {
                    result.push(isValidTarget(state, actor, actorStatus, target, getStatus(statuses, target), move));
                }
                break;

        }
    }


    const validTargets = result.filter(x => x.valid).length;
    if (move.targets !== "all"
        && move.targets > 0
        && move.targets > validTargets) {
        return [{
            valid: false,
            target: null,
            reason: "invalidTargetCount"
        }];
    }
    const potency = getStatus(statuses, actor).getModifier("potency") + (move.modifiers?.potency ?? 0);

    return result.map(x => addDamagePreviews(state, actor, potency, move, x));
}


function addDamagePreviews(state: iGameState, actor: iCharacter, potency: number, move: MoveDef, info: iValidityInfo): iPreviewInfo {
    if (!info.valid) {
        return info;
    }

    const effects = resolveMove(state, { definition: move }, actor, info.target ? [{ band: "none", effectiveness: 0, target: info.target }] : []);

    //this is a damage move, load up a preview object
    if (info.accuracy && move.baseDamage && info.target) {

        const damage: PreviewProfile = {};
        if (info.accuracy.miss) {
            damage.miss = { chance: info.accuracy.miss, min: 0, max: 0 };
        }
        const vulnerability = info.status?.getModifier("vulnerability") ?? 0;
        const modifier = (1 + potency * EFFECTIVENESS_MODIFIER) * (1 + vulnerability * EFFECTIVENESS_MODIFIER);
        for (const band of DAMAGE_BANDS) {
            if (info.accuracy[band]) {
                const min = Math.ceil(effectivenessRange[band][0] * move.baseDamage * modifier);
                const max = Math.ceil(effectivenessRange[band][1] * move.baseDamage * modifier);
                damage[band] = { chance: info.accuracy[band], min: min, max: max };
            }
        }
        return {
            ...info,
            effects,
            damage
        };
    }

    //this isnt a damage move, resolve it to get it's effects
    return {
        ...info,
        effects
    }
}


function getEscapes(state: iGameState, actor: iCharacter, statuses: StatusMap): EscapeInfo[] {
    const result: EscapeInfo[] = [];
    const actorStatus = getStatus(statuses, actor);
    const capability = actorStatus.canAct("escape");
    for (const target of state.characters) {
        const targetStatus = getStatus(statuses, target);
        const available = capability ?? ((actor !== target && !actorStatus.canAssist()) ? "assistUnavailable" : undefined);
        for (const binding of target.bindings) {
            result.push({
                available: available ? false : true,
                reason: available,
                target: target.id,
                binding: binding.id,
                effects: serializeEffects(resolveEscape(actor, actorStatus, target, targetStatus, binding))
            });
        }
    }

    return result;
}


