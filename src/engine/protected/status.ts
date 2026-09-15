import { ActionFailure, ActionType, ModifierId, ModifierSet, MoveType } from "../public/types";
import { StatusDef } from "./definitions";
import { getBindingLevel, isCharacter } from "./helpers";
import { iCharacter, iEntity, iStatus } from "./types";

/*******************************************************
 * Functions
 *******************************************************/

export function s(definition: StatusDef, value: number): iStatus {
    return { definition, value };
}

function getStatuses(target: iEntity): iStatus[] {
    const statuses: iStatus[] = [];
    if (isCharacter(target)) {
        for (const binding of target.bindings) {
            const bindingStatuses = binding.definition.status;
            const level = getBindingLevel(binding);
            if (!bindingStatuses) {
                continue;
            }
            for (const bindingStatus of bindingStatuses[level] ?? []) {
                const characterStatus = statuses.find(x => x.definition === bindingStatus.definition);
                if (characterStatus) {
                    if (characterStatus.value < bindingStatus.value) {
                        characterStatus.value = bindingStatus.value;
                    }
                } else {
                    statuses.push({ definition: bindingStatus.definition, value: bindingStatus.value });
                }
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
            const characterStatus = statuses.find(x => x.definition === buffStatus.definition);
            if (characterStatus) {
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
        if (!buff.modifiers || !buff.active) {
            continue;
        }
        const level = buff.modifiers[id];
        amount += level ?? 0;
    }
    return amount;
}

export function getModifiers(target: iEntity): ModifierSet {
    const modifiers: ModifierSet = {};
    const statuses: iStatus[] = getStatuses(target);
    for (const status of statuses) {
        const level = status.definition.levels[status.value];
        if (level.modifiers) {
            for (const [modifier, amount] of Object.entries(level.modifiers) as [ModifierId, number][]) {
                modifiers[modifier] = (modifiers[modifier] ?? 0) + amount;
            }
        }
    }
    for (const buff of target.buffs) {
        if (!buff.modifiers || !buff.active) {
            continue;
        }
        for (const [modifier, amount] of Object.entries(buff.modifiers) as [ModifierId, number][]) {
            modifiers[modifier] = (modifiers[modifier] ?? 0) + amount;
        }
    }
    return modifiers;
}

export function getBlockedMoveTypes(actor: iCharacter): MoveType[] {
    const statuses: iStatus[] = getStatuses(actor);
    const types: Set<MoveType> = new Set();
    for (const status of statuses) {
        const level = status.definition.levels[status.value];
        for (const type of level.blockedMoveTypes ?? []) {
            types.add(type);
        }
    }
    return Array.from(types);
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

function canEscape(actor: iCharacter): boolean {
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


export function isIncapacitated(actor: iEntity): boolean {
    const statuses: iStatus[] = getStatuses(actor);
    for (const status of statuses) {
        const level = status.definition.levels[status.value];
        if (level.incapacitated) {
            return true;
        }
    }
    return false;
}

const standing: StatusDef = {
    id: "standing",
    levels: [
        {},
        { modifiers: { defense: -2 } }
    ]
};
