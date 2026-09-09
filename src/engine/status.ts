import { getBindingLevel, isCharacter } from "./helpers";
import { iCharacter, iEntity, iStatus, StatusDef } from "./itypes";
import { ActionFailure, ActionType, ModifierId, MoveType } from "./types";

/*******************************************************
 * Functions
 *******************************************************/

export function getStatuses(target: iEntity): iStatus[] {
    const statuses: iStatus[] = [];
    if (isCharacter(target)) {
        for (const binding of target.bindings) {
            const bindingStatuses = binding.definition.status;
            const level = getBindingLevel(binding);
            if (bindingStatuses === undefined) {
                continue;
            }
            for (const bindingStatus of bindingStatuses[level] ?? []) {
                const characterStatus = statuses.find(x => x.definition === bindingStatus.definition);
                if (characterStatus !== undefined) {
                    if (characterStatus.value < bindingStatus.value) {
                        characterStatus.value = bindingStatus.value;
                    }
                } else {
                    statuses.push({ definition: bindingStatus.definition, value: bindingStatus.value });
                }
            }
        }
    }
    for (const buff of target.buffs) {
        if (!buff.active || buff.statuses === undefined) {
            continue;
        }
        for (const buffStatus of buff.statuses) {
            const characterStatus = statuses.find(x => x.definition === buffStatus.definition);
            if (characterStatus !== undefined) {
                if (characterStatus.value < buffStatus.value) {
                    characterStatus.value = buffStatus.value;
                }
            } else {
                statuses.push({ definition: buffStatus.definition, value: buffStatus.value });
            }
        }

    }
    return statuses;
}


export function getModifier(target: iEntity, id: ModifierId): number {
    let amount: number = 0;
    const statuses: iStatus[] = getStatuses(target);
    for (const status of statuses) {
        const level = status.definition.levels[status.value];
        amount += level.modifiers?.[id] ?? 0;
    }
    for (const buff of target.buffs) {
        if (buff.modifiers === undefined) {
            continue;
        }
        const level = buff.modifiers[id];
        amount += level ?? 0;
    }
    return amount;
}

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

export function canAttack(actor: iEntity): boolean {
    const statuses: iStatus[] = getStatuses(actor);
    for (const status of statuses) {
        const level = status.definition.levels[status.value];
        if (level.blocksAttack) {
            return false;
        }
    }
    return true;
}

export function canUseMoveType(actor: iCharacter, type: MoveType): boolean {
    const statuses: iStatus[] = getStatuses(actor);
    for (const status of statuses) {
        const level = status.definition.levels[status.value];
        if (level.blockedMoveTypes?.includes(type)) {
            return false;
        }
    }
    return true;
}

export function canEscape(actor: iCharacter): boolean {
    const statuses: iStatus[] = getStatuses(actor);
    for (const status of statuses) {
        const level = status.definition.levels[status.value];
        if (level.blocksEscape) {
            return false;
        }
    }
    return true;
}

export function canAssist(actor: iCharacter): boolean {
    const statuses: iStatus[] = getStatuses(actor);
    for (const status of statuses) {
        const level = status.definition.levels[status.value];
        if (level.blocksAssist) {
            return false;
        }
    }
    return true;
}

export function canMove(actor: iCharacter): boolean {
    const statuses: iStatus[] = getStatuses(actor);
    for (const status of statuses) {
        const level = status.definition.levels[status.value];
        if (level.blocksMoving) {
            return false;
        }
    }
    return true;
}


export function canBonusEscape(actor: iCharacter): boolean {
    const statuses: iStatus[] = getStatuses(actor);
    for (const status of statuses) {
        const level = status.definition.levels[status.value];
        if (level.blocksEscape) {
            return false;
        }
        if (level.blocksBonusEscape) {
            return false;
        }
    }
    return true;
}

export function isSkipped(actor: iEntity): boolean {
    const statuses: iStatus[] = getStatuses(actor);
    for (const status of statuses) {
        const level = status.definition.levels[status.value];
        if (level.skipsTurn) {
            return true;
        }
    }
    return false;
}


export function isIncapacitated(actor: iCharacter): boolean {
    const statuses: iStatus[] = getStatuses(actor);
    for (const status of statuses) {
        const level = status.definition.levels[status.value];
        if (level.incapacitated) {
            return true;
        }
    }
    return false;
}

/*******************************************************
 * Definitions
 *******************************************************/
export const bound: StatusDef = {
    id: "bound",
    levels: [
        {},
        { modifiers: { hitarms: -2 } },
        { modifiers: { hitarms: -4 } },
        { blockedMoveTypes: ["arms"], blocksAssist: true },
        { blockedMoveTypes: ["arms"], blocksAssist: true, modifiers: { escape: -1 } }
    ]
}

export const gagged: StatusDef = {
    id: "gagged",
    levels: [
        {},
        { modifiers: { hitmouth: -2 } },
        { modifiers: { hitmouth: -4 } },
        { blockedMoveTypes: ["mouth"] },
        { blockedMoveTypes: ["mouth"], modifiers: { escape: -1 } }
    ]
}

export const hobbled: StatusDef = {
    id: "hobbled",
    levels: [
        {},
        { modifiers: { defense: -1, traps: -1, hitlegs: -2 } },
        { modifiers: { defense: -2, traps: -2, hitlegs: -4 } },
        { modifiers: { defense: -3, traps: -3 }, blockedMoveTypes: ["legs"] },
        { modifiers: { defense: -4, traps: -4, escape: -1 }, blockedMoveTypes: ["legs"] }
    ]
}

export const vibrating: StatusDef = {
    id: "vibrating",
    levels: [
        {},
        { modifiers: { escape: -1 }, blocksBonusEscape: true },
        { modifiers: { escape: -2 }, blocksBonusEscape: true },
        { modifiers: { escape: -3 }, blocksBonusEscape: true },
        { modifiers: { escape: -4 }, blocksBonusEscape: true }
    ]
}

export const submissive: StatusDef = {
    id: "submissive",
    levels: [
        {},
        { modifiers: { willpower: -1, effect: 1 } },
        { modifiers: { willpower: -2, effect: 2 } },
        { modifiers: { willpower: -3, effect: 3 } },
        { modifiers: { willpower: -4, effect: 4 } }
    ]
}

export const breathless: StatusDef = {
    id: "breathless",
    levels: [
        {},
        { modifiers: { defense: -1 } },
        { modifiers: { defense: -2 } },
        { modifiers: { defense: -3 } },
        { modifiers: { defense: -4 } }
    ]
}

export const blinded: StatusDef = {
    id: "blinded",
    levels: [
        {},
        { modifiers: { hit: -1 } },
        { modifiers: { hit: -2 } },
        { modifiers: { hit: -3, defense: -1 } },
        { modifiers: { hit: -4, defense: -2 } }
    ]
}

export const immobilized: StatusDef = {
    id: "immobilized",
    levels: [
        {},
        { blocksMoving: true }
    ]
}

export const helpless: StatusDef = {
    id: "helpless",
    levels: [
        {},
        { skipsTurn: true }
    ]
}

export const incapacitated: StatusDef = {
    id: "incapacitated",
    levels: [
        {},
        { skipsTurn: true, incapacitated: true }
    ]
}

export const stunned: StatusDef = {
    id: "stunned",
    levels: [
        {},
        { blocksAttack: true, blocksEscape: true, blocksMoving: true }
    ]
}

