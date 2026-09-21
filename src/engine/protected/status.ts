import { ActionType, FailureReason, ModifierId, ModifierSet, MoveType } from "../public/types";
import { FlagId, StatusDef, StatusLevelDef } from "./definitions";
import { getBindingLevel, isCharacter } from "./helpers";
import { iBuff, iEntity, iStatus } from "./types";

export class GameStatus {
    private statuses: StatusLevelDef[];
    private buffs: iBuff[];

    private modifiers: ModifierSet;
    private flags: Partial<Record<FlagId, boolean>>;
    private blockedMoveTypes: Partial<Record<MoveType, boolean>>;
    private hasActed: boolean | undefined;
    private hasBonusEscapes: boolean | undefined;
    private isStanding: boolean | undefined;

    constructor(target: iEntity) {
        this.modifiers = {};
        this.flags = {};
        this.blockedMoveTypes = {};
        this.statuses = [];
        for (const status of this.getStatusList(target)) {
            this.statuses.push(status.definition.levels[status.value]);
        }
        for (const passive of target.definition.passives) {
            if (passive.status) {
                this.statuses.push(passive.status);
            }
        }
        this.buffs = target.buffs.filter(buff => (buff.active && buff.modifiers));
        if (isCharacter(target)) {
            this.hasActed = target.acted;
            this.hasBonusEscapes = target.bonusEscapes > 0;
            this.isStanding = target.standing;
        }
    }

    canAct(type?: ActionType): FailureReason | undefined {
        if (this.isIncapacitated()) {
            return "actorIncapacitated";
        }

        if (this.isSkipped()) {
            return "actorSkipped";
        }

        if (this.hasActed && ((type && type !== "escape") || !this.hasBonusEscapes)) {
            return "actorAlreadyActed";
        }

        switch (type) {
            case "escape":
                if (!this.canEscape()) {
                    return "escapeUnavailable";
                }
                break;
            case "stance":
                if (this.isStanding && !this.canMove()) {
                    return "actorImmobilized";
                }
                break;
        }
        return undefined;
    }

    getModifiers(): ModifierSet {
        this.modifiers = {};
        if (this.isStanding) {
            this.modifiers["defense"] = -2;
        }

        for (const status of this.statuses) {
            if (!status.modifiers) {
                continue;
            }
            for (const modifier in status.modifiers) {
                const id = modifier as ModifierId;
                const amount = status.modifiers[id];
                if (amount) {
                    this.modifiers[id] = (this.modifiers[id] ?? 0) + amount;
                }
            }
        }

        for (const buff of this.buffs) {
            if (!buff.modifiers) {
                continue;
            }
            for (const modifier in buff.modifiers) {
                const id = modifier as ModifierId;
                const amount = buff.modifiers[id];
                if (amount) {
                    this.modifiers[id] = (this.modifiers[id] ?? 0) + amount;
                }
            }
        }

        const result: ModifierSet = {};

        for (const [modifier, amount] of Object.entries(this.modifiers) as [ModifierId, number][]) {
            if (amount !== 0) {
                result[modifier] = amount;
            }
        }

        return result;
    }

    getModifier(id: ModifierId): number {
        const cached = this.modifiers[id];
        if (cached !== undefined) {
            return cached;
        }

        let amount = this.isStanding && id === "defense" ? -2 : 0;
        for (const status of this.statuses) {
            if (status.modifiers?.[id]) {
                amount += status.modifiers?.[id];
            }
        }

        for (const buff of this.buffs) {
            if (buff.modifiers?.[id]) {
                amount += buff.modifiers?.[id];
            }
        }

        this.modifiers[id] = amount;
        return amount;
    }

    getBlockedMoveTypes(): MoveType[] {
        const types: MoveType[] = [];
        for (const type of ["arms", "mouth", "legs"] as MoveType[]) {
            if (!this.canUseMoveType(type)) {
                types.push(type);
            }
        }
        return types;
    }

    canUseMoveType(type: MoveType): boolean {
        const cached = this.blockedMoveTypes[type];
        if (cached !== undefined) {
            return !cached;
        }

        let blocked = false;
        for (const status of this.statuses) {
            if (status.blockedMoveTypes?.includes(type)) {
                blocked = true;
            }
            if (status.allowedMoveTypes?.includes(type)) {
                this.blockedMoveTypes[type] = false;
                return true;
            }
        }

        this.blockedMoveTypes[type] = blocked;
        return !blocked;
    }

    canAttack(): boolean {
        return !this.hasFlag("blocksAttack");
    }

    canEscape(): boolean {
        return !this.hasFlag("blocksEscape");
    }

    canAssist(): boolean {
        return !this.hasFlag("blocksAssist");
    }

    canMove(): boolean {
        return !this.hasFlag("blocksMoving");
    }

    canBonusEscape(): boolean {
        return !this.hasFlag("blocksBonusEscape");
    }

    isSkipped(): boolean {
        return this.hasFlag("skipsTurn");
    }

    ignoresTraps(): boolean {
        return this.hasFlag("skipsTraps");
    }

    isIncapacitated(): boolean {
        return this.hasFlag("incapacitated");
    }

    private hasFlag(flag: FlagId): boolean {
        const cached = this.flags[flag];
        if (cached !== undefined) {
            return cached;
        }

        for (const status of this.statuses) {
            if (status.flags?.includes(flag)) {
                this.flags[flag] = true;
                return true;
            }
        }

        this.flags[flag] = false;
        return false;
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

    private mergeIStatus(target: iStatus[], source: iStatus) {
        const index = target.findIndex(x => x.definition === source.definition);

        if (index === -1) {
            target.push(source);
        } else if (source.value > target[index].value) {
            target[index] = source;
        }
    }
}

export type StatusMap = Map<iEntity, GameStatus>;

export function getStatus(statuses: StatusMap, entity: iEntity): GameStatus {
    const status = statuses.get(entity);

    if (!status) {
        throw new Error(`Missing GameStatus for ${entity.id}`);
    }

    return status;
}

export function s(definition: StatusDef, value: number): iStatus {
    return { definition, value };
}
