import { ActionFailure, ActionType, ModifierId, ModifierSet, MoveType } from "../public/types";
import { StatusDef, StatusLevelDef } from "./definitions";
import { getBindingLevel, isCharacter } from "./helpers";
import { iCharacter, iEntity, iStatus } from "./types";

export function canAct(actor: iCharacter, type: ActionType): ActionFailure | undefined {
    if (isIncapacitated(actor)) {
        return {
            success: false,
            reason: "actorIncapacitated"
        };
    }

    if (isSkipped(actor)) {
        return {
            success: false,
            reason: "actorSkipped"
        };
    }

    if (actor.acted && (type !== "escape" || !actor.bonusEscapes)) {
        return {
            success: false,
            reason: "actorAlreadyActed"
        };
    }

    switch (type) {
        case "escape":
            if (!canEscape(actor)) {
                return {
                    success: false,
                    reason: "escapeUnavailable"
                }
            }
            break;
        case "stance":
            if (actor.standing && !canMove(actor)) {
                return {
                    success: false,
                    reason: "actorImmobilized"
                };
            }
            break;
    }
    return undefined;
}

export function getModifier(target: iEntity, id: ModifierId): number {
    const status: StatusLevelDef = getStatuses(target);
    return status.modifiers?.[id] ?? 0;
}

export function getModifiers(target: iEntity): ModifierSet {
    const status: StatusLevelDef = getStatuses(target);
    return status.modifiers ?? {};
}

export function getBlockedMoveTypes(target: iCharacter): MoveType[] {
    const status: StatusLevelDef = getStatuses(target);
    return status.blockedMoveTypes?.filter(type => !status.allowedMoveTypes?.includes(type)) ?? [];
}

export function canAttack(target: iEntity): boolean {
    const status: StatusLevelDef = getStatuses(target);
    return !status.blocksAttack;
}

export function canUseMoveType(target: iCharacter, type: MoveType): boolean {
    const status: StatusLevelDef = getStatuses(target);
    return !status.blockedMoveTypes?.includes(type) || (status.allowedMoveTypes?.includes(type) ?? false);
}

function canEscape(target: iCharacter): boolean {
    const status: StatusLevelDef = getStatuses(target);
    return !status.blocksEscape;
}

export function canAssist(target: iCharacter): boolean {
    const status: StatusLevelDef = getStatuses(target);
    return !status.blocksAssist;
}

export function canMove(target: iCharacter): boolean {
    const status: StatusLevelDef = getStatuses(target);
    return !status.blocksMoving;
}


export function canBonusEscape(target: iCharacter): boolean {
    const status: StatusLevelDef = getStatuses(target);
    return !status.blocksBonusEscape;
}

export function isSkipped(target: iEntity): boolean {
    const status: StatusLevelDef = getStatuses(target);
    return status.skipsTurn ?? false;

}

export function isIncapacitated(target: iEntity): boolean {
    const status: StatusLevelDef = getStatuses(target);
    return status.incapacitated ?? false;

}

function getStatuses(target: iEntity): StatusLevelDef {
    const result: StatusLevelDef = {};
    for (const status of getStatusList(target)) {
        const level = status.definition.levels[status.value];
        mergeStatus(result, level);
    }

    for (const passive of target.definition.passives) {
        if (passive.status) {
            mergeStatus(result, passive.status);
        }
    }

    for (const buff of target.buffs) {
        if (!buff.modifiers || !buff.active) {
            continue;
        }
        result.modifiers ??= {};
        mergeModifiers(result.modifiers, buff.modifiers)
    }

    return result;
}

function getStatusList(target: iEntity): iStatus[] {
    const statuses: iStatus[] = [];
    if (isCharacter(target)) {
        for (const binding of target.bindings) {
            const bindingStatuses = binding.definition.status;
            const level = getBindingLevel(binding);
            if (!bindingStatuses) {
                continue;
            }
            for (const bindingStatus of bindingStatuses[level] ?? []) {
                mergeIStatus(statuses, bindingStatus);
            }
        }
        if (target.standing) {
            statuses.push({ definition: standing, value: 1 });
        }
    }
    for (const buff of target.buffs) {
        if (!buff.active || !buff.statuses) {
            continue;
        }
        for (const buffStatus of buff.statuses) {
            mergeIStatus(statuses, buffStatus);
        }

    }
    return statuses;
}

function mergeIStatus(target: iStatus[], source: iStatus) {
    const status = target.find(x => x.definition === source.definition);
    if (status) {
        status.value = Math.max(status.value, source.value);
    } else {
        target.push({ definition: source.definition, value: source.value });
    }
}

export function mergeModifiers(target: ModifierSet, source: ModifierSet): void {
    for (const [modifier, amount] of Object.entries(source) as [ModifierId, number][]) {
        target[modifier] = (target[modifier] ?? 0) + amount;
    }
}

function mergeStatus(target: StatusLevelDef, source: StatusLevelDef): void {
    if (source.modifiers) {
        target.modifiers ??= {};
        mergeModifiers(target.modifiers, source.modifiers);
    }

    if (source.allowedMoveTypes) {
        target.allowedMoveTypes ??= [];
        for (const type of source.allowedMoveTypes) {
            if (!target.allowedMoveTypes.includes(type)) {
                target.allowedMoveTypes.push(type);
            }
        }
    }
    if (source.blockedMoveTypes) {
        target.blockedMoveTypes ??= [];
        for (const type of source.blockedMoveTypes) {
            if (!target.blockedMoveTypes.includes(type)) {
                target.blockedMoveTypes.push(type);
            }
        }
    }

    target.blocksAssist ||= source.blocksAssist;
    target.blocksAttack ||= source.blocksAttack;
    target.blocksBonusEscape ||= source.blocksBonusEscape;
    target.blocksEscape ||= source.blocksEscape;
    target.blocksMoving ||= source.blocksMoving;
    target.incapacitated ||= source.incapacitated;
    target.skipsTurn ||= source.skipsTurn;

}

const standing: StatusDef = {
    id: "standing",
    levels: [
        {},
        { modifiers: { defense: -2 } }
    ]
};

export function s(definition: StatusDef, value: number): iStatus {
    return { definition, value };
}
