import { ActionType, FailureReason, ModifierId, ModifierSet, MoveType } from "../public/types";
import { StatusDef, StatusLevelDef } from "./definitions";
import { getBindingLevel, isCharacter } from "./helpers";
import { iEntity, iStatus } from "./types";

export class GameStatus {
    private status: StatusLevelDef & { modifiers: ModifierSet };

    constructor(target: iEntity) {
        this.status = { modifiers: {} };
        if (isCharacter(target)) {
            this.status.hasActed = target.acted;
            this.status.hasBonusEscapes = target.bonusEscapes > 0;
            this.status.isStanding = target.standing;
        }
        for (const statusState of this.getStatusList(target)) {
            const level = statusState.definition.levels[statusState.value];
            this.mergeStatus(level);
        }

        for (const passive of target.definition.passives) {
            if (passive.status) {
                this.mergeStatus(passive.status);
            }
        }

        for (const buff of target.buffs) {
            if (!buff.modifiers || !buff.active) {
                continue;
            }
            this.mergeModifiers(buff.modifiers)
        }
    }

    canAct(type?: ActionType): FailureReason | undefined {
        if (this.isIncapacitated()) {
            return "actorIncapacitated";
        }

        if (this.isSkipped()) {
            return "actorSkipped";
        }

        if (this.status.hasActed && ((type && type !== "escape") || !this.status.hasBonusEscapes)) {
            return "actorAlreadyActed";
        }

        switch (type) {
            case "escape":
                if (!this.canEscape()) {
                    return "escapeUnavailable";
                }
                break;
            case "stance":
                if (this.status.isStanding && !this.canMove()) {
                    return "actorImmobilized";
                }
                break;
        }
        return undefined;
    }

    getModifier(id: ModifierId): number {
        return this.status.modifiers[id] ?? 0;
    }

    getModifiers(): ModifierSet {
        return { ...this.status.modifiers };
    }

    getBlockedMoveTypes(): MoveType[] {
        return this.status.blockedMoveTypes?.filter(type => !this.status.allowedMoveTypes?.includes(type)) ?? [];
    }

    canAttack(): boolean {
        return !this.status.blocksAttack;
    }

    canUseMoveType(type: MoveType): boolean {
        return !this.status.blockedMoveTypes?.includes(type) || (this.status.allowedMoveTypes?.includes(type) ?? false);
    }

    canEscape(): boolean {
        return !this.status.blocksEscape;
    }

    canAssist(): boolean {
        return !this.status.blocksAssist;
    }

    canMove(): boolean {
        return !this.status.blocksMoving;
    }

    canBonusEscape(): boolean {
        return !this.status.blocksBonusEscape;
    }

    isSkipped(): boolean {
        return this.status.skipsTurn ?? false;
    }

    ignoresTraps(): boolean {
        return this.status.skipsTraps ?? false;
    }

    isIncapacitated(): boolean {
        return this.status.incapacitated ?? false;
    }

    private getStatusList(target: iEntity): iStatus[] {
        const statuses: iStatus[] = [];
        if (isCharacter(target)) {
            for (const binding of target.bindings) {
                const bindingStatuses = binding.definition.status;
                const level = getBindingLevel(binding);
                if (!bindingStatuses) {
                    continue;
                }
                for (const bindingStatus of bindingStatuses[level] ?? []) {
                    this.mergeIStatus(statuses, bindingStatus);
                }
            }
            if (target.standing) {
                statuses.push({
                    definition: {
                        id: "standing",
                        levels: [
                            {},
                            { modifiers: { defense: -2 } }
                        ]
                    },
                    value: 1
                });
            }
        }
        for (const buff of target.buffs) {
            if (!buff.active || !buff.statuses) {
                continue;
            }
            for (const buffStatus of buff.statuses) {
                this.mergeIStatus(statuses, buffStatus);
            }

        }
        for (const passive of target.definition.passives) {
            for (const immunity of passive.immunities ?? []) {
                const index = statuses.findIndex(x => x.definition === immunity);
                if (index >= 0) {
                    statuses.splice(index, 1);
                }
            }
        }
        return statuses;
    }

    private mergeModifiers(source: ModifierSet): void {
        for (const [modifier, amount] of Object.entries(source) as [ModifierId, number][]) {
            this.status.modifiers[modifier] = (this.status.modifiers[modifier] ?? 0) + amount;
        }
    }

    private mergeIStatus(target: iStatus[], source: iStatus) {
        const statusState = target.find(x => x.definition === source.definition);
        if (statusState) {
            statusState.value = Math.max(statusState.value, source.value);
        } else {
            target.push({ definition: source.definition, value: source.value });
        }
    }

    private mergeStatus(source: StatusLevelDef): void {
        if (source.modifiers) {
            this.status.modifiers ??= {};
            this.mergeModifiers(source.modifiers);
        }

        if (source.allowedMoveTypes) {
            this.status.allowedMoveTypes ??= [];
            for (const type of source.allowedMoveTypes) {
                if (!this.status.allowedMoveTypes.includes(type)) {
                    this.status.allowedMoveTypes.push(type);
                }
            }
        }
        if (source.blockedMoveTypes) {
            this.status.blockedMoveTypes ??= [];
            for (const type of source.blockedMoveTypes) {
                if (!this.status.blockedMoveTypes.includes(type)) {
                    this.status.blockedMoveTypes.push(type);
                }
            }
        }

        this.status.blocksAssist ||= source.blocksAssist;
        this.status.blocksAttack ||= source.blocksAttack;
        this.status.blocksBonusEscape ||= source.blocksBonusEscape;
        this.status.blocksEscape ||= source.blocksEscape;
        this.status.blocksMoving ||= source.blocksMoving;
        this.status.incapacitated ||= source.incapacitated;
        this.status.skipsTraps ||= source.skipsTraps;
        this.status.skipsTurn ||= source.skipsTurn;
    }
}

export function mergeModifiers(target: ModifierSet, source: ModifierSet): void {
    for (const [modifier, amount] of Object.entries(source) as [ModifierId, number][]) {
        target[modifier] = (target[modifier] ?? 0) + amount;
    }
}

export function getStatus(statuses: Map<iEntity, GameStatus>, entity: iEntity): GameStatus {
    const status = statuses.get(entity);

    if (!status) {
        throw new Error(`Missing GameStatus for ${entity.id}`);
    }

    return status;
}

export function s(definition: StatusDef, value: number): iStatus {
    return { definition, value };
}
