import { ContentLibrary } from "../../engine/public/library";
import { BattleState, BindingId, BindingLevel, BuffId, DifficultyId, EncounterId, Enemy, EntityId, FailureReason, GameEvent, HitBand, LeafEvent, MoveId, PassiveId, Phase, StanceId, StatusId, TrapId } from "../../engine/public/types";
import { StringKey } from "./types";

export class Presentation {
    private library: ContentLibrary;

    constructor(library: ContentLibrary) {
        this.library = library;
    }

    getEntityName(entity: EntityId): StringKey {
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

    getEntityDesc(entity: EntityId): StringKey {
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

    getEnemyBaseName(enemy: Enemy): StringKey {
        return {
            id: `enemy.${enemy.defId}.name`,
        }
    }

    getBindingName(binding: BindingId): StringKey {
        return {
            id: `binding.${binding}.name`
        }
    }

    getBindingDesc(binding: BindingId): StringKey {
        return {
            id: `binding.${binding}.desc`
        }
    }

    getMoveName(move: MoveId): StringKey {
        return {
            id: `move.${move}.name`
        }
    }

    getMoveDesc(move: MoveId): StringKey {
        return {
            id: `move.${move}.desc`
        }
    }

    getStatusName(status: StatusId): StringKey {
        return {
            id: `status.${status}.name`
        }
    }

    getStatusDesc(status: StatusId): StringKey {
        return {
            id: `status.${status}.desc`
        }
    }

    getTrapName(trap: TrapId): StringKey {
        return {
            id: `trap.${trap}.name`
        }
    }

    getTrapDesc(trap: TrapId): StringKey {
        return {
            id: `trap.${trap}.desc`
        }
    }

    getPassiveName(passive: PassiveId): StringKey {
        return {
            id: `passive.${passive}.name`
        }
    }

    getPassiveDesc(passive: PassiveId): StringKey {
        return {
            id: `passive.${passive}.desc`
        }
    }

    getEncounterName(encounter: EncounterId): StringKey {
        return {
            id: `encounter.${encounter}.name`
        }
    }

    getEncounterDesc(encounter: EncounterId): StringKey {
        return {
            id: `encounter.${encounter}.desc`
        }
    }

    getBuffName(buff: BuffId): StringKey {
        return {
            id: `buff.${buff}.name`
        };
    }

    getBuffDesc(buff: BuffId): StringKey {
        return {
            id: `buff.${buff}.desc`
        };
    }

    getFailureReason(reason: FailureReason): StringKey {
        return {
            id: `failure.${reason}.text`
        }
    }

    getPhaseName(phase: Phase): StringKey {
        return { id: `phase.${phase}.name` };
    }

    getStanceName(stance: StanceId): StringKey {
        return { id: `stance.${stance}.name` };
    }

    getBindingLevelName(level: BindingLevel): StringKey {
        return { id: `bindingLevel.${level}.name` };
    }

    getHitBandName(band: HitBand): StringKey {
        return { id: `hitBand.${band}.name` };
    }


    getDifficultyName(difficulty: DifficultyId): StringKey {
        return { id: `difficulty.${difficulty}.name` };
    }

    getDifficultyDesc(difficulty: DifficultyId): StringKey {
        return { id: `difficulty.${difficulty}.desc` };
    }

    getBattleStateName(state: BattleState): StringKey {
        return { id: `battleState.${state}.name` };
    }

    getEventText(event: GameEvent | LeafEvent): StringKey {
        switch (event.type) {
            case "useMove":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        actor: this.getEntityName(event.actor),
                        move: this.getMoveName(event.move),
                    }
                };

            case "useEscape":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        actor: this.getEntityName(event.actor),
                        target: this.getEntityName(event.target),
                    }
                };

            case "changePhase":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        phase: this.getPhaseName(event.phase)
                    }
                };

            case "changeStance":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        actor: this.getEntityName(event.actor),
                    }
                };

            case "loadCharacter":
                return {
                    id: `event.${event.type}.${event.success ? "success" : "failure"}`,
                    args: {
                        id: this.getEntityName(event.id)
                    }
                };

            case "loadEncounter":
                return {
                    id: `event.${event.type}.${event.success ? "success" : "failure"}`,
                    args: {
                        id: this.getEncounterName(event.id)
                    }
                };

            case "enemyDamaged":
            case "enemyHealed":
            case "damageBlocked":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        target: this.getEntityName(event.target),
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
                        target: this.getEntityName(event.target),
                        binding: this.getBindingName(event.binding),
                        amount: event.amount,
                    }
                };

            case "buffAdded":
            case "buffRemoved":
            case "buffUpdated":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        target: this.getEntityName(event.target),
                        buff: this.getBuffName(event.buff),
                    }
                };

            case "enemySpawned":
            case "enemyDefeated":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        target: this.getEntityName(event.target),
                    }
                };

            case "stanceSet":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        actor: this.getEntityName(event.actor),
                        stance: { id: `stance.${event.stance}.name` },
                    }
                };

            case "cooldownChanged":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        target: this.getEntityName(event.target),
                        move: this.getMoveName(event.move),
                        value: event.value,
                    }
                };

            case "trapAdded":
            case "trapRemoved":
            case "trapTriggered":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        actor: this.getEntityName(event.actor),
                        trap: this.getTrapName(event.trap),
                        amount: event.amount,
                    }
                };

            case "actionInterrupted":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        actor: this.getEntityName(event.actor),
                        reason: this.getFailureReason(event.reason),
                    }
                };

            case "actionRefreshed":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        target: this.getEntityName(event.target),
                    }
                };

            case "targetChanged":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        target: this.getEntityName(event.target),
                        destination: this.getEntityName(event.destination),
                    }
                };

            case "intentionCancelled":
            case "intentionWeakened":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        target: this.getEntityName(event.target),
                    }
                };

            default: {
                const exhaustive: never = event;
                return exhaustive;
            }
        }
    }
}