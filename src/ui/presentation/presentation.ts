import { BattleState, BindingId, BindingLevel, BuffId, DifficultyId, EncounterId, EntityId, FailureReason, FlagId, GameEvent, HitBand, LeafEvent, ModifierId, MoveId, PassiveId, Phase, StanceId, StatusId, TrapId } from "../../engine/public/types";

interface StringKey {
    id: string;
    args?: Record<string, StringArg>;
}

type StringArg = number | string | boolean | StringKey;

export type StringTable = Record<string, string>;

export class Presentation {
    private strings;

    constructor(strings: StringTable) {
        this.strings = strings;
    }


    entity(entity: EntityId): string {
        return this.translate(this.entityKey(entity));
    }

    entityDesc(entity: EntityId): string {
        return this.translate(this.entityDescKey(entity));
    }

    binding(binding: BindingId): string {
        return this.translate(this.bindingKey(binding));
    }

    bindingDesc(binding: BindingId): string {
        return this.translate(this.bindingDescKey(binding));
    }

    move(move: MoveId): string {
        return this.translate(this.moveKey(move));
    }

    moveDesc(move: MoveId): string {
        return this.translate(this.moveDescKey(move));
    }

    status(status: StatusId): string {
        return this.translate(this.statusKey(status));
    }

    statusDesc(status: StatusId): string {
        return this.translate(this.statusDescKey(status));
    }

    trap(trap: TrapId): string {
        return this.translate(this.trapKey(trap));
    }

    trapDesc(trap: TrapId): string {
        return this.translate(this.trapDescKey(trap));
    }

    passive(passive: PassiveId): string {
        return this.translate(this.passiveKey(passive));
    }

    passiveDesc(passive: PassiveId): string {
        return this.translate(this.passiveDescKey(passive));
    }

    encounter(encounter: EncounterId): string {
        return this.translate(this.encounterKey(encounter));
    }

    encounterDesc(encounter: EncounterId): string {
        return this.translate(this.encounterDescKey(encounter));
    }

    buff(buff: BuffId): string {
        return this.translate(this.buffKey(buff));
    }

    buffDesc(buff: BuffId): string {
        return this.translate(this.buffDescKey(buff));
    }

    failure(reason: FailureReason): string {
        return this.translate(this.failureKey(reason));
    }

    phase(phase: Phase): string {
        return this.translate(this.phaseKey(phase));
    }

    stance(stance: StanceId): string {
        return this.translate(this.stanceKey(stance));
    }

    bindingLevel(level: BindingLevel): string {
        return this.translate(this.bindingLevelKey(level));
    }

    hitBand(band: HitBand): string {
        return this.translate(this.hitBandKey(band));
    }

    difficulty(difficulty: DifficultyId): string {
        return this.translate(this.difficultyKey(difficulty));
    }

    difficultyDesc(difficulty: DifficultyId): string {
        return this.translate(this.difficultyDescKey(difficulty));
    }

    battleState(state: BattleState): string {
        return this.translate(this.battleStateKey(state));
    }

    modifier(modifier: ModifierId): string {
        return this.translate(this.modifierKey(modifier));
    }

    flag(flag: FlagId): string {
        return this.translate(this.flagKey(flag));
    }

    event(event: GameEvent | LeafEvent): string {
        return this.translate(this.eventTextKey(event));
    }

    private isStringKey(value: unknown): value is StringKey {
        return typeof value === "object"
            && value !== null
            && "id" in value
            && typeof value.id === "string";
    }

    private translate(key: StringKey): string {
        const template = this.strings[key.id];

        if (template === undefined) {
            return `[${key.id}]`;
        }

        if (!key.args) {
            return template;
        }

        return template.replace(/\{([^}]+)\}/g, (match, name: string) => {
            const value = key.args?.[name];

            if (value === undefined) {
                return match;
            }

            return this.isStringKey(value)
                ? this.translate(value)
                : String(value);
        });
    }

    private entityKey(entity: EntityId): StringKey {
        const match = entity.match(/^(.*?)(\d+)$/);

        if (match) {
            return {
                id: `entity.${match[1]}.name`,
                args: {
                    index: Number(match[2])
                }
            };
        }

        return {
            id: `entity.${entity}.name`
        };
    }

    private entityDescKey(entity: EntityId): StringKey {
        const match = entity.match(/^(.*?)(\d+)$/);

        if (match) {
            return {
                id: `entity.${match[1]}.desc`,
            };
        }

        return {
            id: `entity.${entity}.desc`
        };
    }

    private bindingKey(binding: BindingId): StringKey {
        return {
            id: `binding.${binding}.name`
        }
    }

    private bindingDescKey(binding: BindingId): StringKey {
        return {
            id: `binding.${binding}.desc`
        }
    }

    private moveKey(move: MoveId): StringKey {
        return {
            id: `move.${move}.name`
        }
    }

    private moveDescKey(move: MoveId): StringKey {
        return {
            id: `move.${move}.desc`
        }
    }

    private statusKey(status: StatusId): StringKey {
        return {
            id: `status.${status}.name`
        }
    }

    private statusDescKey(status: StatusId): StringKey {
        return {
            id: `status.${status}.desc`
        }
    }

    private trapKey(trap: TrapId): StringKey {
        return {
            id: `trap.${trap}.name`
        }
    }

    private trapDescKey(trap: TrapId): StringKey {
        return {
            id: `trap.${trap}.desc`
        }
    }

    private passiveKey(passive: PassiveId): StringKey {
        return {
            id: `passive.${passive}.name`
        }
    }

    private passiveDescKey(passive: PassiveId): StringKey {
        return {
            id: `passive.${passive}.desc`
        }
    }

    private encounterKey(encounter: EncounterId): StringKey {
        return {
            id: `encounter.${encounter}.name`
        }
    }

    private encounterDescKey(encounter: EncounterId): StringKey {
        return {
            id: `encounter.${encounter}.desc`
        }
    }

    private buffKey(buff: BuffId): StringKey {
        return {
            id: `buff.${buff}.name`
        };
    }

    private buffDescKey(buff: BuffId): StringKey {
        return {
            id: `buff.${buff}.desc`
        };
    }

    private failureKey(reason: FailureReason): StringKey {
        return {
            id: `failure.${reason}.text`
        }
    }

    private phaseKey(phase: Phase): StringKey {
        return { id: `phase.${phase}.name` };
    }

    private stanceKey(stance: StanceId): StringKey {
        return { id: `stance.${stance}.name` };
    }

    private bindingLevelKey(level: BindingLevel): StringKey {
        return { id: `bindingLevel.${level}.name` };
    }

    private hitBandKey(band: HitBand): StringKey {
        return { id: `hitBand.${band}.name` };
    }


    private difficultyKey(difficulty: DifficultyId): StringKey {
        return { id: `difficulty.${difficulty}.name` };
    }

    private difficultyDescKey(difficulty: DifficultyId): StringKey {
        return { id: `difficulty.${difficulty}.desc` };
    }

    private battleStateKey(state: BattleState): StringKey {
        return { id: `battleState.${state}.name` };
    }

    private modifierKey(modifier: ModifierId): StringKey {
        return { id: `modifier.${modifier}.name` };
    }

    private flagKey(flag: FlagId): StringKey {
        return { id: `flag.${flag}.name` };
    }

    private eventTextKey(event: GameEvent | LeafEvent): StringKey {
        switch (event.type) {
            case "useMove":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        actor: this.entityKey(event.actor),
                        move: this.moveKey(event.move),
                    }
                };

            case "useEscape":
                return {
                    id: `event.${event.type}.${event.actor === event.target ? "escape" : "assist"}`,
                    args: {
                        actor: this.entityKey(event.actor),
                        target: this.entityKey(event.target),
                    }
                };

            case "changePhase":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        phase: this.phaseKey(event.phase)
                    }
                };

            case "changeStance":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        actor: this.entityKey(event.actor),
                    }
                };

            case "loadCharacter":
                return {
                    id: `event.${event.type}.${event.success ? "success" : "failure"}`,
                    args: {
                        id: event.success ? this.entityKey(event.id) : event.id
                    }
                };

            case "loadEncounter":
                return {
                    id: `event.${event.type}.${event.success ? "success" : "failure"}`,
                    args: {
                        id: event.success ? this.encounterKey(event.id) : event.id
                    }
                };

            case "enemyDamaged":
            case "enemyHealed":
            case "damageBlocked":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        target: this.entityKey(event.target),
                        amount: event.amount,
                    }
                };

            case "bondageChanged":
            case "bondageAdded":
            case "bondageRemoved":
            case "bondageBlocked":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        target: this.entityKey(event.target),
                        binding: this.bindingKey(event.binding),
                        amount: event.amount,
                    }
                };

            case "buffAdded":
            case "buffRemoved":
            case "buffUpdated":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        target: this.entityKey(event.target),
                        buff: this.buffKey(event.buff),
                    }
                };

            case "enemySpawned":
            case "enemyDefeated":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        target: this.entityKey(event.target),
                    }
                };

            case "stanceSet":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        actor: this.entityKey(event.actor),
                        stance: { id: `stance.${event.stance}.name` },
                    }
                };

            case "cooldownChanged":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        target: this.entityKey(event.target),
                        move: this.moveKey(event.move),
                        value: event.value,
                    }
                };

            case "trapAdded":
            case "trapRemoved":
            case "trapTriggered":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        actor: this.entityKey(event.actor),
                        trap: this.trapKey(event.trap),
                        amount: event.amount,
                    }
                };

            case "actionInterrupted":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        actor: this.entityKey(event.actor),
                        reason: this.failure(event.reason),
                    }
                };

            case "actionRefreshed":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        target: this.entityKey(event.target),
                    }
                };

            case "targetChanged":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        target: this.entityKey(event.target),
                        destination: this.entityKey(event.destination),
                    }
                };

            case "intentionCancelled":
            case "intentionWeakened":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        target: this.entityKey(event.target),
                    }
                };

            default: {
                const exhaustive: never = event;
                return exhaustive;
            }
        }
    }
}